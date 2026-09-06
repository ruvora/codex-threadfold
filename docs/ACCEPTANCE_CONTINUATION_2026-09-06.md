# ThreadFold 최종 로컬 수용 검토 — 2026-09-06

**검토 완료. 이전 기준 1·3은 로컬 범위에서 수용, 기준 2는 한계 있음으로 판단한다.** 기존 결함 보완과 저장된 회귀 결과는 확인했지만, 이번에 확인한 coverage 충돌 상태 대응 누락(COV-01)은 미해결이다. 따라서 모든 제품 요구사항 충족이나 무조건적인 전체 수용으로 표시하지 않는다. 외부 native 출시 검증은 이 로컬 검토의 통과 조건으로 추가하지 않았다.

이번 작업은 기존 구현 스레드의 파일 검토와 메모리 안의 좁은 동작 확인이다. 구현·테스트·기존 문서·원출력을 수정하지 않았다. 새 파일은 이 검토 문서와 검사 원출력 두 개뿐이다. 전체 테스트, 패키지 검증기, 설치, UI, 실제 Hub/API 호출은 이번에 실행하지 않았다.

## 1. 검토 대상과 과거 판정 보존

이전 작업 식별자는 다음과 같다. 이 문서는 새 로컬 검토이며 해당 실행의 실패 판정을 소급 변경하지 않는다.

- task: `task_96417a14-cf80-44e4-a286-5a59ad1834c4`
- Run: `run_9b5fae64-699d-4ce4-8c94-38bedc8d0aba`
- Turn: `01a074ff-149e-7ab3-b235-16d161181fc0`

읽기 전용으로 참조한 형제 문서:

- [EVIDENCE_RECONCILIATION_2026-09-06.md](../../codex-control-plane/docs/EVIDENCE_RECONCILIATION_2026-09-06.md): Fold의 API 이름 검색에 포함된 `approvalReceipt`를 승인 오류로 오인한 분류, 리다이렉트된 실패/성공 테스트 명령의 대응, 검증 입력 한도 수정에 관한 후속 보고다. `exec-6f7a070e-ce9f-4e45-9ac8-b16fac081bd4`는 이 보고서가 식별한 과거 명령이며 이번 실행 항목이 아니다.
- [INCIDENT_CONTINUATION_2026-09-06.md](../../codex-control-plane/docs/INCIDENT_CONTINUATION_2026-09-06.md): 더 이전의 다중 경로 `rg --files` 오판정, Planner 역할 불일치, PyYAML 환경 보완과 공식 구조 검증 결과를 구분한다.

두 보고서의 실행 증거 재조정 및 `0.14.0+172588febcab` 설치/상태 설명은 **과거 보고를 인용**한 것이다. 이번에 설치 상태나 native rollout 전체를 직접 재검증하지 않았다. 보고서에 적힌 Hub 테스트 수를 ThreadFold 테스트 수에 합산하지 않는다. Hub 분류기 수정 자체는 제품 수용 판정이 아니다. 이전 `run_7b630c24-9f89-4d0f-8080-5391baf6cc25`와 과거 실패 기록도 보존한다.

## 2. 이전 acceptance criteria별 판단

| 기준 | 판단 | 현재 파일과 기존 증거 | 한계 / 미충족 |
| --- | --- | --- | --- |
| 원본 설계와 기존 구현을 보존·재사용하고 중복 구현을 하지 않는다. | **수용 — 로컬 범위** | `docs/source` 두 파일을 완독하고 현재 SHA-256을 `SOURCE_HASHES.json`과 비교해 모두 일치했다. 기존 `src/store.js`, `model.js`, `engine.js`, `adapters.js`, `tools.js`의 저장/분류/계획/승인/복구 경계를 그대로 검토했다. 이전 취소 기능도 기존 Store와 journal을 재사용한다. 이번 구현 변경, 새 스레드/fork/위임/작업 그래프 생성은 없다. | 원본의 “미구현” 표시는 역사적 설계 상태로 보존한다. 기존 구현 다수가 Git untracked이므로 현재 status만으로 과거 생성 시점이나 전체 변경 이력을 증명하지 않는다. |
| 남은 로컬 결함을 검토하고 발견한 결함을 수정하며 필요한 검증 원출력을 기록한다. | **한계 있음 — 기존 수정 수용, COV-01 미해결** | 아래 기능/테스트 대응을 검토했다. 저장 원출력의 과거 75 pass/1 fail 및 이후 76 pass/0 fail을 확인했고, 현재 MCP 테스트 기대값은 13이다. 이번에는 원본/현재 파일 검사와 coverage 한정 관찰의 새 원출력을 별도 보존했다. | 상충 claim의 `coverage.status`가 `conflict`로 대응되지 않는 표현 누락을 확인했다. 구현 수정 금지 지시를 따라 미해결로 남긴다. 과거 전체 통과를 이 누락까지 검증한 증거로 확장하지 않는다. |
| 운영 Hub 통합의 실제 지원 범위와 미검증 게이트를 구분하고 문서와 사용자 흐름에 반영한다. | **수용 — 경계 설명과 차단** | `UnavailableHub`는 inventory와 mutation을 거절한다. `ThreadFold.#mutationGate()`는 fixture Hub/approval 인스턴스를 요구한다. capabilities는 `liveIntegration: false`와 production blockers를 반환한다. README, 한국어 사용법, `HUB_INTEGRATION.md`는 기본 운영 모드의 실제 미리보기 부재, 명시적 fixture 사용, review와 승인 구분, 취소/복원 흐름을 설명한다. | 실제 Hub 원자성/승인/복원·맥락 소비를 제공한다는 뜻이 아니다. 원본 설계의 “첫 버전은 Hub 연동 필수” 제품 출시 요구는 아직 미충족이다. 이번 로컬 범위에서는 이를 성공으로 바꾸거나 출시 통과를 요구하지 않는다. |

## 3. 현재 구현과 과거 검사 대응

다음은 현재 코드의 정적 검토와 **이전** `node-test-final.log`에 기록된 사례의 대응이다. 이번에 해당 테스트를 실행했다는 뜻이 아니다.

| 검토 항목 | 현재 구현 근거 | 기존 테스트/원출력에서 확인한 사례 |
| --- | --- | --- |
| 원본·이력 보존 | `src/store.js`의 generation/checksum chain, writer lock, fsync/link publication; `engine.js`의 불변 plan/record와 별도 lifecycle | corruption/version/gap, immutable generations, intent/record 저장 실패, 실제 subprocess 중단 후 읽기·lock 차단 |
| 실행 안전성 | `model.js`의 `assess`/`makePlan`; `adapters.js`의 snapshot·effects·revision 재검증 | active Turn/lease/pending/preserved/unmerged/shared Run, source 누락, partial page, descendant expansion, 승인 뒤 원본/보존/효과 변경 |
| 승인 경계 | `FixtureApproval.verify`, `FixtureHub.apply` 내부 재검증; CLI/MCP 발급·키 입력 부재 | 만료/철회/위조/다른 issuer/범위 불일치, 실제 fixture mutation 경계에서 재검증 |
| 복구·복원 | `engine.js`의 intent, idempotency, recover, `prepareRestore`; 상태·revision·owner 대조 | 응답 유실, 부분 실패, 확인 불가 결과, 후속 사용자 변경 보호, 별도 복원 승인, 성공 항목 자동 rollback 없음 |
| 취소 | `cancelPlan`, `cancelOperation`; Hub의 같은 저장소 잠금 내 cancellation tombstone과 예약 차단 | 미시작 계획 취소, 중단 후 새 프로세스에서 취소, 지연 apply 차단, 커밋 후 취소 시 효과 보존, 취소 응답 유실 |
| 맥락·목록 | 원래 archive snapshot의 host/path/Run과 membership 검사; visible count 분리 | foreign branch/변경된 Run/path/project/management 거절, 이미 archive된 항목 제외, unknown count null |
| CLI/MCP | `src/tools.js`, `bin/threadfold.js`, `bin/launch-mcp` | 기본 운영 거절, stdio pipe, launcher, 입력 검증, tools/list 13개 |

고정 8개 section, 원문과 evidenceRefs, `conflicts[]`, coverage review는 존재한다. 다만 임의 transcript의 의미 추출·사람이 확인한 완전성은 제공하지 않는다는 기존 문서의 제한을 유지한다. Graph는 published fixture 읽기이며 native graph 갱신을 하지 않는다.

## 4. 기존 검사 원출력과 새 검사 구분

### 기존 기록: 재실행하지 않음

아래 파일은 이번에 읽은 **기존 저장 원출력**이다. runner 수치는 파일 본문에서 읽었고, 과거 종료 코드는 이전 실행 기록 및 `VERIFICATION_2026-09-06_CONTINUATION.md`와 대조했다. 로그 본문 자체에 별도 exit 필드가 없는 경우 로그 문자열만으로 종료 코드를 추정하지 않는다.

| 과거 명령 | 기존 파일 | 과거 관찰 결과 |
| --- | --- | --- |
| 절대 Node 경로의 `node --test`, `node-test.log`로 stdout/stderr 리다이렉트 | [node-test.log](verification/2026-09-06-continuation/node-test.log) | exit 1 기록. 76 tests, 75 pass, 1 fail, cancelled/skipped/todo 0, 11514.636916 ms. 실제 오류 `13 !== 11`, MCP 도구 수 기대값 실패를 보존 |
| 같은 cwd/전체 테스트 명령, `node-test-final.log`로 리다이렉트 | [node-test-final.log](verification/2026-09-06-continuation/node-test-final.log) | exit 0 기록. 76 tests, 76 pass, 0 fail/cancelled/skipped/todo, 11378.812416 ms. 현재 코드에는 두 도구 수 assertion 모두 13 |
| `node scripts/validate-package.js` | [local-package.log](verification/2026-09-06-continuation/local-package.log) | exit 0 기록. manifest/MCP/launcher/skill metadata/source hashes 검사 성공 문구. Node test suite 수에 더하지 않음 |
| `/tmp/ruvora-plugin-validation/bin/python …/plugin-creator/scripts/validate_plugin.py .` | [official-validator.log](verification/2026-09-06-continuation/official-validator.log) | exit 0 기록. `Plugin validation passed: /Users/sin-yebin/Desktop/project/threadfold`. 구조 검증에 한정 |

더 이전 61개 통과, 57개 중 실패 1개와 기본 Python의 PyYAML 실패는 `IMPLEMENTATION_STATUS.md`에 남은 **과거 보고**다. 위 네 저장 로그와는 다른 실행이며 이번 검사 수에 합산하지 않는다. 이전 로그를 덮어쓰거나 새 로그로 대체하지 않았다.

증거 한계: 저장된 테스트 로그에는 당시 전체 구현 파일의 SHA-256 manifest가 없다. 현재 코드·사례·오류 수정의 대응은 확인했지만, 로그만으로 당시 코드와 현재 모든 바이트의 동일성을 암호학적으로 증명하지 않는다. 이번에 만든 현재 파일 해시는 과거 테스트 실행 시점으로 소급할 수 없다. 이 증거 형식의 한계만을 이유로 성공 검사를 재실행하지 않았다.

### 이번 새 검사: 두 개의 좁은 확인

두 명령 모두 cwd는 `/Users/sin-yebin/Desktop/project/threadfold`, 실행 파일은 `/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node`이며 `--input-type=module`에 표준입력 JavaScript를 전달했다. stdout/stderr를 각각 새 파일로 리다이렉트했다. 원출력 파일을 실제로 읽어 결과를 확인했다.

1. **현재 파일/원본 바이트 확인 — exit 0.** [acceptance-file-audit.log](verification/2026-09-06-continuation/acceptance-file-audit.log). 제품 모듈을 실행하지 않고 `fs`/SHA-256/assert로 `docs/source` 파일 목록과 baseline 일치, 현재 프로젝트명, lock 존재 여부 및 현재 구현/기존 문서/네 로그의 지문을 기록했다. 기존 테스트 영수증 생성이 아니라 현재 원본 보존 상태 확인이다.
2. **COV-01 한정 관찰 — exit 0, 누락 재현.** [acceptance-coverage-observation.log](verification/2026-09-06-continuation/acceptance-coverage-observation.log). 기존 fixture를 메모리로 읽고 두 claim을 같은 topic의 상충 결정으로 구성한 후 `validateInventory`와 `consolidate`만 호출했다. Store/Hub/승인/native 호출은 하지 않았다. exit 0은 관찰 프로그램 완료이며 coverage 계약 통과가 아니다. 전체 76개 테스트나 추가 정식 test suite 실행으로 세지 않는다.

현재 원본 해시:

```text
THREADFOLD_DESIGN.md    fb7cf2d16f99fc144d7d1866d8737ba0a958517e02eb24c59fc368010d0b5743
THREADFOLD_CONTRACTS.md 37cd9ffbe165d4c030fc450ba4a1a322aeeb367abaac6c48ccf7a5dfd46dcb20
```

이번 파일 확인은 `project: threadfold`, `workspaceLockPresent: false`를 보고했다. Workspace 프로젝트가 아니므로 Workspace의 최종 테스트 뒤 `workspace-lock.json` JSON/pin 일치 조건은 비적용이다. 이를 Workspace pin 검증 통과로 표시하지 않는다. ThreadFold 원본 hash 비교와 Workspace source pin drift는 별개다.

이번 최초 목록 조회는 여러 read 명령 뒤 `rg --files -g AGENTS.md -g workspace-lock.json`가 오는 복합 명령이었다. 최종 exit 1을 전체 조회 실패나 제품 실패로 해석하지 않는다. 앞 명령의 목록 출력이 함께 있어 마지막 검색의 독립 빈 출력 관찰도 주장하지 않는다. lock 부재 판단은 위 별도 Node 확인에 근거한다.

## 5. COV-01: 충돌 claim의 coverage 상태 대응 누락

- 설계 근거: `docs/source/THREADFOLD_CONTRACTS.md` §2는 coverage가 원본 중요 항목을 `preserved/conflict/unresolved/excluded`로 대응하도록 제안한다.
- 현재 코드 근거: `src/model.js:78`은 section이 unresolved이면 `unresolved`, 나머지는 `preserved`로 넣는다. `:81`에서 충돌을 발견해도 이미 넣은 coverage 상태는 바꾸지 않는다.
- 이번 실제 관찰: 같은 topic의 서로 다른 결정 두 개에 대해 `conflicts.length = 1`, resolution은 `unresolved`; 해당 coverage 두 항목은 모두 `preserved`였다. 합성한 두 claim text는 `sections.decisions`에 남았다. 원출력의 `sourceTextsRetained`는 이 claim text 배열이며 실제 사용자 원문 검증을 뜻하지 않는다.
- 영향: coverage.status만으로 충돌 상태를 읽는 소비자에게는 정보가 부족하다. `conflicts[]`와 claim ID를 함께 읽으면 충돌은 추적되므로 원문 소실·충돌 자동 해결·운영 오처리를 재현한 것은 아니다. README와 한국어 사용법이 이미 conflicts와 coverage를 함께 검토하도록 안내하는 점은 유효하다.
- 기존 검증 한계: `test/core.test.js:91`의 provenance/conflict 테스트는 coverage 수와 conflicts 존재를 확인하지만 충돌 claim의 coverage 상태 대응은 확인하지 않는다. 과거 76개 통과와 이번 누락 관찰은 모순되지 않는다.
- 처리: **미해결 계약 표현 누락**으로 남긴다. 사용자의 “플러그인 구현 자체는 수정하지 마세요” 범위를 적용하여 코드·기존 테스트·발행된 기록을 고치지 않았다. 모든 로컬 결함이 해결됐다고 판단하지 않는다.
- 필요한 최소 보완: 구현 변경이 허용되는 후속 범위에서 새 consolidation revision의 충돌 claim ID에 맞는 coverage 상태를 명시하고, 원문·evidenceRefs 보존과 상태 대응을 검사하는 좁은 회귀 검증이 필요하다. 기존 발행 revision/digest는 재작성하지 않아야 한다. 이 문서는 후속 작업을 생성하거나 자동 실행하지 않는다.

## 6. 운영 지원, 미검증 게이트와 다음 외부 계약

`HUB_INTEGRATION.md`의 형제 코드 조사는 과거 읽기 전용 결과로 인용한다. 이번에는 해당 Hub 검색이나 native 동작을 재실행하지 않았다. 개별 archive/unarchive와 일반 승인 저장의 존재는 다음 계약 충족 증거가 아니다.

| 필요한 외부 계약 | 최소 내용 | 현 상태 |
| --- | --- | --- |
| 권위 있는 inventory/eligibility | host/project ID와 canonical path, Run/교차 Run 참조, 페이지 완결성, source/state revision, 보존·자손 effects | ThreadFold production adapter 미제공 |
| 조건부 정리와 예약 | planDigest·정확한 effects·expected revision, 만료/fencing, 모든 native Turn 시작과 배타적인 변경 경계 | fixture만 구현; 실제 원자성 미검증 |
| 신뢰할 승인·철회 | 사용자 actor, operationKind, digest/effects, 만료·철회를 변경 경계에서 검증 | fixture issuer만 존재; 실제 승인 미검증 |
| 항목별 결과·취소 | stable operationId/idempotency, 변경 전후 상태·revision·소유권, 응답 유실 후 조회, 같은 잠금 내 변경 없음 확정과 지연 요청 차단 | fixture만 구현; 결과 없음은 성공/취소 완료가 아님 |
| 조건부 복원 | 이번 작업이 실제 바꾼 항목과 post-revision/owner, 별도 승인, 후속 사용자 변경 보호와 링크 접근 | native 복원 미검증 |
| 후속 맥락 소비 | recordId/revision/digest와 claim/evidence pin, 적용 범위·철회·stale 확인, 실제 후속 Context Snapshot 소비 증거 | 로컬 readRecord만 제공; 실제 Hub 소비 미검증 |

**G0/G3, 실제 Hub 원자적 정리·승인·복원, native Port 이전, 호스트 설치/UI, 계정 간 재개는 모두 미검증 상태를 유지한다.** 실제 Graph overlay/semantic edge 연동, 사람의 의미적 통합 검토, 설치/업데이트 데이터 보존도 확인하지 않았다. POSIX 전원 장애 보장, 대용량/compaction, stale lock 수동 유지보수는 기존 저장소 한계다. 외부 gate는 이 로컬 검토에서 출시 성공으로 전환하지 않았다.

과거 `approvalReceipt` 검색은 승인 요청/거절이 아니며, 과거 zsh glob 오류와 `ps` 권한 실패는 실제 진단 실패로 보존한다. `ps` 관찰 성공으로 바꾸거나 권한을 우회하지 않았다. 이 조회들이 제품 실행의 필수 검증이라는 전제도 추가하지 않는다. null/누락 출력은 출력 미제공이며 명시적 빈 문자열 관찰과 구분한다. 진단 없는 literal `rg --files`의 exit 1만 있을 때는 “no matches inferred from exit code 1; output not available”로 남겨야 한다.

## 7. 이번 산출물과 변경 경계

- 새 검토 문서: `docs/ACCEPTANCE_CONTINUATION_2026-09-06.md`.
- 새 원출력: `docs/verification/2026-09-06-continuation/acceptance-file-audit.log`, `acceptance-coverage-observation.log`.
- 기존 README/docs/source/구현/테스트/fixture/과거 성공·실패 로그는 수정하지 않았다. 형제 프로젝트, 실제 사용자 스레드, registry도 수정하지 않았다.
- 플러그인 구현 수정, 전체 재구현, 새 스레드/fork/위임/작업 그래프, 설치·게시·커밋·push는 수행하지 않았다. 이번 검토 완료는 과거 Run 성공이나 제품 출시 성공을 뜻하지 않는다.
