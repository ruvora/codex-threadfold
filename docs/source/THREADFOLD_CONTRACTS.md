# ThreadFold 구현 설계 v0.2

작성일: 2026-09-06. 상태: 제안 계약, 미구현. [제품 요구사항](THREADFOLD_DESIGN.md)과 함께 읽는다.

## 1. 결정 사항

- 동일 완료 Run의 Hub 관리 스레드만 MVP 대상으로 한다.
- 대표 스레드는 기존 Run 결과 스레드를 우선한다. 읽을 수 있는 결과 스레드가 없거나 여러 후보가 충돌하면 사용자 선택 전 적용을 차단한다.
- 통합 문서는 Fold 소유의 불변 revision으로 보존한다. 기본 동작은 기존 대화에 메시지를 쓰지 않는다.
- Fold Registry는 정리 작업만 소유한다. Run 완료·실행권·네이티브 archive 상태의 원본은 Hub와 호스트다.
- Graph는 선택 사항이다. 기존 published revision만 조회하고, Fold 요청을 Graph refresh 권한으로 해석하지 않는다.

## 2. 데이터 모델

아래는 구현할 논리 스키마이며 현재 API에 존재한다는 뜻이 아니다. 모든 레코드는 schemaVersion, createdAt을 갖는다.

| 엔터티 | 핵심 필드 | 불변 조건 |
| --- | --- | --- |
| InventorySnapshot | snapshotId, hostId, canonicalProjectId, canonicalProjectPath, runId, hubRevision, observedAt, completeness, threads[] | ID와 경로를 혼용하지 않음; 부분 관찰은 complete가 아님 |
| ThreadAssessment | threadRef, runRefs[], stateRevision, sourceDigest, safety, value, reasonCodes[], evidenceRefs[] | 상태 불명은 보호; 모든 연결 Run을 검사 |
| ConsolidationRevision | recordId, revision, sourceManifest[], sections[], conflicts[], coverage[], digest | sourceManifest와 내용은 발행 후 수정 불가 |
| FoldPlan | planId, revision, snapshotId, recordRevision, representativeRef, effects[], exclusions[], digest, expiresAt | effect 목록은 네이티브 자손 영향까지 포함 |
| ApprovalReceipt | receiptId, operationKind, planDigest, actorRef, approvedEffects, expiresAt, revokedAt | 신뢰 가능한 사용자 확인 경로에서만 발급 |
| FoldOperation | operationId, planDigest, idempotencyKey, status, itemResults[], hubOperationRefs[] | 같은 키·다른 내용은 거절 |
| RestorePlan | restorePlanId, operationId, changedItems[], currentRevisions[], digest | 이번 작업에서 실제 바뀐 대상만 포함 |

threadRef는 `{hostId, threadId}`이다. sourceDigest는 공유 가능한 사실이 아니라 로컬 변경 감지 수단이다. 주제 일치나 제목은 객체 식별자가 아니다.

통합 sections는 goal, decisions, constraints, changes, validation, failures, unresolved, nextActions로 고정한다. 각 항목은 claimId, text, evidenceRefs, observation/inference 구분, applicability를 갖는다. coverage는 원본에서 추출한 중요한 항목 각각을 preserved/conflict/unresolved/excluded로 대응시키며 excluded에는 이유와 검토 상태가 필요하다.

## 3. 분류 알고리즘

1. 범위와 페이지 완결성을 검사한다. 접근 실패가 있는 Run은 적용 후보에서 제외한다.
2. 활성 Turn, 유효 lease, 비종료 Task, 통합·복구 대기, 다른 활성 Run 참조, 보존 지정 중 하나라도 있으면 safety=protected.
3. 네이티브 상태와 Hub 상태가 다르면 safety=unknown, reason=STATE_DIVERGENCE로 둔다.
4. 명시적인 Run 결과 스레드를 representative로 선정한다. 사용자의 대체 선택은 새 plan revision이다.
5. 보조 스레드의 고유 결정·증거·미해결 내용을 통합 초안에 매핑한다.
6. 중복 판정은 같은 내용뿐 아니라 적용 범위와 증거가 보존됐는지 확인한다. 제목·유사도만으로 아카이브하지 않는다.
7. coverage 검토가 끝나고 모든 출처에 접근 가능할 때만 ready_for_review.

확정적 상태 검사는 코드로, 의미 추출은 모델로 수행한다. 모델은 허용 목록 밖의 스레드 ID·권한·완료 상태를 생성할 수 없다. 모델 판단은 근거를 검토하는 입력이며 실행 허가가 아니다.

## 4. 도구 표면 제안

| 도구 | 입력 요약 | 출력 / 부수 효과 |
| --- | --- | --- |
| fold_inspect_scope | projectRef, runIds, cursor | 페이지 있는 관찰 결과; 스레드 변경 없음 |
| fold_prepare_plan | runId, snapshotId, optional representativeRef | 저장된 계획·통합 초안·제외 사유; 로컬 쓰기 |
| fold_read_plan | planId, revision | 원문 출처 포함 미리보기 |
| fold_revise_plan | planId, expectedRevision, edits | 새 revision; 이전 승인 무효화 |
| fold_apply_plan | planId, revision, approvalReceipt, idempotencyKey | operationId; 승인된 아카이브 요청 |
| fold_get_operation | operationId | 항목별 실제 상태 |
| fold_prepare_restore | operationId | 현재 상태 기준 복원 미리보기; 로컬 쓰기 |
| fold_apply_restore | restorePlanId, approvalReceipt, idempotencyKey | 별도 복원 operation |

`approved:true` 같은 모델이 채울 수 있는 플래그만으로 실행하지 않는다. 승인 UI가 없는 호스트는 명시적 사용자 답변과 정확한 planDigest를 결합하는 신뢰 가능한 확인 어댑터가 필요하며, 그 어댑터가 없으면 preview-only다.

## 5. Hub에 필요한 새 계약

현재 확인한 archiveAgent/unarchiveAgent는 네이티브 호출의 기반일 뿐 아래 배치 계약을 충족한다는 증거가 아니다. 구현 시 확장이 필요하다.

- inspect_cleanup_eligibility(threadRefs): 상태 revision, 모든 Run 참조, lease, 영향 집합 반환
- prepare_cleanup_batch(planDigest, expectedStates, approvedEffects): 예약 토큰·만료·fencing token 반환
- apply_cleanup_batch(reservation, idempotencyKey): 검증과 변경을 같은 Hub 동기화 경계에서 수행
- read_cleanup_operation(operationId): 실제 항목 결과 및 호스트 관찰 확인
- prepare_restore/apply_restore: 이전 상태와 이후 사용자 변경을 고려한 별도 복원 계약

동기화 키는 정렬된 host/thread ID 순으로 획득해 교착을 방지한다. Hub 작업뿐 아니라 다른 호스트에서 직접 실행된 Turn도 확인해야 한다. 호스트의 원자적 조건부 아카이브 또는 동등한 배제 수단을 검증하지 못하면 자동 적용을 열지 않는다. 조회 후 아카이브만으로 경합 해결을 주장하지 않는다.

## 6. 상태와 복구

계획: draft → ready_for_review → approved → applying → applied / partial / attention.
적용 전 원본 변경: stale. 승인 만료: expired. 사용자가 중단: cancelled(이미 적용한 항목은 별도 보고).

항목: pending → reserved → archive_requested → verified_archived.
그 외 skipped_protected / skipped_changed / failed / reconciliation_required.

1. Fold가 검증된 통합 revision을 저장하고 Hub가 읽을 수 있는 참조를 확정한다.
2. Hub 예약을 얻고 journal intent를 기록한다.
3. 네이티브 archive 실행 후 실제 상태를 읽어 확인한다.
4. 응답 유실 시 동일 작업을 무조건 반복하지 않고 호스트·Hub operation을 대조한다.
5. 일부 성공은 partial이다. 실패 항목 때문에 성공 항목을 자동 unarchive하지 않는다.
6. 복원은 새 승인과 상태 재검증 후 수행한다. 이후 사용자 변경을 덮어쓰지 않는다.

아카이브 취소는 모델 입력이나 이미 실행한 후속 작업을 되돌리지 않는다. 통합 revision의 철회 여부와 복원은 별도 명시적 상태로 남긴다.

## 7. Hub 및 Graph 소비

Hub는 다음 작업의 Context Snapshot에 recordId/revision/digest와 선택한 claim·원본 참조를 고정한다. 적용 범위가 다르거나 record가 stale/withdrawn이면 최신 원본 확인 또는 선택 보류. 통합 문서는 권한·성공 판정의 대체물이 아니다.

Graph는 원본 graph revision을 묵시적으로 재작성하지 않는다. Fold 상태는 timestamp가 있는 별도 표시 계층으로 보여주고, semantic edge 갱신은 기존 initial-open/explicit-refresh 계약을 따른다. 모델 summary가 바뀌어도 실제 원본 lineage로 표현하지 않는다.

## 8. 저장·운영·수용 기준

제안 저장은 `fold.db`(계획·승인·journal)와 immutable records 디렉터리다. 실제 위치는 호스트의 쓰기 가능한 플러그인 데이터 위치에서 결정하고 설치 캐시 안에는 저장하지 않는다. 제거·업데이트는 원본·통합 기록을 삭제하지 않는다.

에러 코드 초안: HUB_UNAVAILABLE, INCOMPLETE_SCOPE, ACTIVE_REFERENCE, STATE_DIVERGENCE, SOURCE_CHANGED, COVERAGE_INCOMPLETE, APPROVAL_EXPIRED, EFFECT_SCOPE_MISMATCH, HOST_ATOMICITY_UNVERIFIED, RECONCILIATION_REQUIRED.

출시 전 필수 fixture: 활성 Run 공유, 자손 영향 확대, 승인 후 새 Turn, 중복 apply, archive 후 응답 유실, 통합 저장 실패, 원본 접근 실패, 복원 전 사용자 변경, Graph 부재, 다른 branch의 충돌 결정. 자동 판정 0건 오처리와 사람 검토를 통한 통합 품질을 별도로 측정한다. 실제 Run을 이용한 dry-run 평가를 거쳐 승인 기반 적용을 연다.
