# 운영 Hub 연동: 확인된 기반과 필요한 계약

2026-09-06, `../codex-control-plane/src` 읽기 전용 조사 기준. 실제 데몬/API 호출, Registry 수정, 사용자 스레드 조회·변경은 수행하지 않았다. 아래는 코드 근거이며 네이티브 실행 검증이 아니다.

| 항목 | 현재 확인한 기반 | Fold에 아직 필요한 최소 계약 |
| --- | --- | --- |
| 관찰 | `control-plane.js:65` 주변의 페이지·cursor 기반 thread 목록; Registry의 Run/Task/lease 정보 | host/project ID와 canonical path, 동일 Run과 모든 교차 Run 참조, 원본 접근 여부, 상태 revision, 페이지 완결성, 보존 지정, 자손 영향 집합을 함께 반환하는 권위 있는 inventory/eligibility API |
| 변경 | `control-plane.js:92–99`의 `thread/archive`, `thread/unarchive`; `registry.js:1329–1385`의 lease/Task/상태 검사 | 정확한 planDigest·예상 revision·승인된 effects를 바인딩한 예약, 만료·fencing, 모든 Turn 시작과 배타적인 조건부 변경 경계 |
| 원자성 | `mcp-server.js:2959–2964`: Registry validateOnly → await native call → Registry 갱신 | 조회와 네이티브 변경 사이 재개를 막는 호스트 보장. 현재 호출 순서만으로 이 보장을 추론할 수 없음. Hub 내부 잠금만 있어도 직접 시작된 네이티브 Turn까지 배제하는지는 별도 검증 필요 |
| 승인 | `registry.js:3188–3246`의 요청 저장·accept/decline 처리 | 신뢰할 사용자 확인 경로가 actor·operationKind·planDigest·정확한 effects·만료를 묶고, 변경 경계에서 검증·철회 조회할 수 있는 승인 영수증. 일반 Run 실행 승인이나 모델의 review 플래그는 이 계약의 대체물이 아님 |
| 결과·복구 | 개별 네이티브 응답, Registry 이벤트 | stable operationId와 전역 멱등 바인딩, 변경 전후 상태·revision·소유권의 항목별 영속 결과, 응답 유실 후 조회. 결과 없음은 변경 없음이 아님 |
| 취소 | Fold의 로컬 fixture에만 취소 확정 구현 | apply와 같은 잠금에서 기존 결과를 반환하거나 변경 없음 tombstone을 영속화하고 이전 예약 및 지연 요청을 차단하는 계약. 효과가 이미 커밋됐으면 취소로 덮어쓰지 않음 |
| 복원 | 개별 `unarchiveAgent` | 해당 작업이 실제 바꾼 항목과 변경 후 revision·소유권을 바인딩한 별도 계획·승인·조건부 복원. 후속 사용자 변경 보호 및 실제 링크 접근 검증 |
| 맥락 소비 | `context-resolver.js:160–218`의 claim 선택, Context Snapshot fingerprint 및 assert/format | Fold recordId/revision/digest와 선택 claim·원본 참조 고정, host/project/path/branch/Run 출처 확인, 철회·대체·stale 제외, 후속 실제 Run에서 소비한 증거 |

위 파일 범위의 문자열 검색에서 `inspect_cleanup_eligibility`, `prepare_cleanup_batch`, `apply_cleanup_batch`, `read_cleanup_operation`, `prepare_restore`, `apply_restore`, `approvalReceipt`, `threadfold`, `foldRecord`는 매치되지 않았다(독립 `rg -n` 명령 exit 1, 명시적 빈 출력 문자열). 이는 해당 검색 범위·이름에 대한 결과일 뿐 다른 이름의 기능이나 모든 호스트에서의 부재 증명이 아니다. 위 실제 구현 경로를 함께 읽어도 Fold 계약 충족을 확인할 수 없어 운영 어댑터를 열지 않았다.

## 사용자 흐름

1. `fold_capabilities`에서 mode, liveIntegration, productionBlockers를 확인한다. 기본 production 모드는 inventory도 연결되어 있지 않아 실제 미리보기를 제공하지 않는다.
2. 명시적으로 구성한 fixture에서만 관찰 → 계획 → 원본/coverage 검토 → 새 revision을 사용한다. `coverageReviewed`는 적용 권한이 아니다.
3. 아직 시작하지 않은 계획은 `fold_cancel_plan`으로 철회한다. 새 시도를 원하면 새 관찰과 계획을 만든다.
4. 시작한 작업은 `fold_get_operation`으로 읽고 `fold_recover_operation`으로 확인한다. 결과가 없으면 `attention` 유지. fixture에서 진행을 중단하려면 `fold_cancel_operation`을 명시적으로 호출한다. 잠금 안에서 변경 없음이 확정되어야 `cancelled`가 된다. 이미 바뀐 항목은 그대로 보고하며 별도 복원 계획을 사용한다.
5. 운영 연결은 위 계약과 승인 경로, 실제 host 원자성·자손 효과·복원·맥락 소비가 검증된 후 별도 구현/검증이 필요하다. capability 값을 바꾸거나 fixture 성공을 제시해 운영 기능을 활성화할 수 없다.

Graph는 선택적인 published fixture 읽기만 제공한다. 실제 ThreadGraph overlay/semantic edge 연동과 사람의 의미적 coverage 검토도 완료되지 않았다. 데이터 위치·POSIX 저장소·수동 stale lock 복구 제한은 [사용법](USAGE_KO.md)에 따른다.
