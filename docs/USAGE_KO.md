# RUVORA ThreadFold 한국어 사용법

현재 제공물은 **독립 실행 가능한 로컬 코어와 fixture 시뮬레이션**입니다. 실제 Hub 스레드 정리 연동은 사용할 수 없습니다. 기본 실행은 운영 기능의 부재를 표시하며 archive/restore를 차단합니다. 원본 설계 문서는 수정하지 않았고, 과거 실패 Run을 성공으로 바꾸지 않았습니다.

## 준비와 실행

Node.js 22 이상만 필요합니다. npm 설치, 네트워크, 브라우저, socket listener가 필요하지 않습니다. 이 환경의 실행 파일은 다음과 같습니다.

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node bin/threadfold.js help
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/validate-package.js
```

아래 예제의 `node`를 위 절대 경로로 바꾸거나 PATH에 Node를 추가합니다. 플러그인 launcher는 `CODEX_MCP_NODE_PATH`에 지정된 실행 파일을 사용할 수 있습니다. 설치나 registry 등록은 이번 작업에 포함되지 않습니다.

## 미리보기

```sh
node bin/threadfold.js fold_capabilities
node bin/threadfold.js fold_inspect_scope --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"projectId":"fixture-project","runId":"fixture-run"}'
```

두 번째 명령은 예제 Run의 상태를 관찰하고 로컬 snapshot을 저장합니다. 실제 스레드는 읽거나 변경하지 않습니다. 출력에서 `snapshot.snapshotId`를 복사해 준비 명령에 넣습니다.

```sh
node bin/threadfold.js fold_prepare_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"snapshotId":"snapshot_실제반환값"}'
```

반환된 `plan.planId`로 내용을 읽고 수정합니다. 예시 자리표시자는 실제 반환된 ID로 바꿔야 합니다.

```sh
node bin/threadfold.js fold_read_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"planId":"plan_실제반환값","revision":1}'
node bin/threadfold.js fold_revise_plan --data .threadfold/preview --fixture fixtures/completed-run.json --args '{"planId":"plan_실제반환값","expectedRevision":1,"edits":{"coverageReviewed":true}}'
```

검토할 항목은 원본 text·Turn·결과물 참조, 목표·결정·제약·변경·검증·실패·미해결·다음 행동, 브랜치와 버전, 충돌, 보호/제외 사유, 예상 영향 집합입니다. `coverageReviewed`는 정확한 구조화 claim의 검토 상태일 뿐 사용자 적용 승인이나 임의 원문의 의미적 완전성 보장이 아닙니다. 변경하면 새 revision이 생기고 이전 승인은 무효화됩니다.

활성 Turn, lease, 승인/통합/복구 대기, 보존 지정, 공유된 활성 Run, 미통합 결과물, 상태 불일치, 불명확한 참조·효과는 보호합니다. 일부 페이지만 관찰했거나 원본 접근이 빠지면 적용 가능한 계획이 되지 않습니다. 자손 효과가 있거나 자기 자신만의 효과라고 확인할 수 없는 항목은 제외합니다.

## 적용·복원 시뮬레이션

```sh
node bin/threadfold.js demo --data .threadfold/demo --fixture fixtures/completed-run.json
```

이 명령만 fixture 검토자와 승인을 자동으로 흉내 내어 보조 항목 2개 적용→상태 확인→별도 복원 승인→복원을 실행합니다. `mode: fixture`, `liveIntegration: false`를 확인하세요. 실제 사용자 승인이나 실제 host 원자성을 증명하지 않습니다.

승인 키는 fixture 프로세스의 비공개 메모리에서 생성됩니다. 모델이 키를 공급할 수 없고 CLI/MCP에 승인 발급 도구가 없습니다. 다른 프로세스에서 기존 receipt로 새 효과를 승인할 수 없습니다. 이미 시작된 작업은 operation ID로 복구할 수 있습니다. 재시도 키가 같고 계획/동작이 다르면 거절하며, 같은 작업은 재실행하지 않고 기존 결과를 반환하거나 재조정합니다.

## 상태와 복구

```sh
node bin/threadfold.js fold_get_operation --data .threadfold/demo --args '{"operationId":"operation_실제반환값"}'
node bin/threadfold.js fold_recover_operation --data .threadfold/demo --fixture fixtures/completed-run.json --args '{"operationId":"operation_실제반환값"}'
```

`applied`는 해당 fixture 작업의 모든 항목이 확인됐다는 뜻입니다. `partial`은 일부만 확인됐으며, `attention`은 결과 불명/충돌로 조치가 필요하다는 뜻입니다. 둘을 전체 성공으로 해석하지 않습니다. 불명확한 효과를 자동 재실행하거나 성공 항목을 자동 복원하지 않습니다. 미해결 작업과 겹치는 새 적용은 차단합니다.

아직 시작하지 않은 계획은 최신 revision을 지정하여 취소할 수 있습니다. 원본 계획은 보존하고 현재 상태만 `cancelled`로 표시합니다. 취소된 archive 계획의 기록은 맥락 소비에서 철회되며, 기존 승인으로 적용하거나 계획을 다시 수정할 수 없습니다. 시작하지 않은 restore 계획 취소는 기존 archive 기록을 철회하지 않습니다.

```sh
node bin/threadfold.js fold_cancel_plan --data .threadfold/preview --args '{"planId":"plan_실제반환값","revision":2}'
node bin/threadfold.js fold_cancel_operation --data .threadfold/demo --fixture fixtures/completed-run.json --args '{"operationId":"operation_실제반환값"}'
```

두 번째 명령은 시작된 fixture 작업의 진행 중단 요청입니다. fixture Hub가 apply와 같은 잠금 안에서 기존 커밋 결과를 반환하거나, 변경 없음 기록을 영속화하고 이전 예약·지연 요청을 차단합니다. 이 확정이 있어야 `cancelled`로 전환하고 겹치는 새 계획을 허용합니다. 이미 커밋된 효과는 취소로 덮어쓰거나 되돌리지 않으며 별도 복원을 사용합니다. 작업 결과가 없다는 사실만으로 취소 완료를 추정하지 않습니다. 취소 응답을 잃었으면 `fold_recover_operation`으로 확인하세요. 다시 적용하려면 새 관찰·계획·승인과 새 멱등성 키가 필요합니다. 실제 Hub 취소 기능은 제공하지 않습니다.

미리보기의 `observedCount`는 아카이브 항목을 포함한 관찰 수, `observedVisibleCount`는 현재 보이는 항목 수입니다. `predictedRemaining`은 이미 아카이브된 항목을 제외합니다. 상태가 불명확하면 목록 수는 `null`, 부분 관찰이면 `countCompleteness: partial`입니다. 통합 기록을 읽을 때는 원본 snapshot의 host·canonical 경로·Run 및 스레드의 프로젝트·관리 여부·Run 연결도 검사합니다.

복원은 이번 적용에서 실제 변경했고 현재 revision과 소유권이 일치하는 항목만 포함합니다. 이후 보존 지정, 활성화, 사용자 수정이 있으면 제외합니다. 별도 계획과 승인이 필요하며, 복원을 시작하면 해당 통합 기록은 보수적으로 withdrawn 처리되어 후속 맥락 선택에서 제외됩니다. 불변 기록 자체는 유지합니다.

데이터는 명시한 `--data` 또는 `THREADFOLD_DATA_DIR` 아래 `fold/`, `fixture-hub/`에 누적됩니다. fixture 파일은 빈 저장소를 처음 만들 때만 읽어 초기화하고 이후에는 저장된 상태를 사용합니다. 플러그인 설치 캐시에 데이터를 보관하지 마세요. 이 프로젝트의 예제와 테스트는 `.threadfold/`만 사용합니다.

숫자 이름 JSON 세대는 체크섬 체인으로 검증하며 덮어쓰지 않습니다. 프로세스가 저장 중 종료되어 `writer.lock`이 남으면 신규 쓰기를 차단합니다. 모든 writer를 중단하고 데이터 전체를 백업한 다음 기록된 PID가 종료됐는지 확인한 운영자만 오래된 lock을 제거해야 합니다. 모델에 자동 lock 제거 기능은 제공하지 않습니다. 미커밋 `.pending_*` 파일은 읽기에서 무시됩니다. 저장소 전체를 악의적으로 재작성하는 로컬 사용자나 전체 디렉터리 롤백까지 방지하는 보안 저장소는 아닙니다.

## MCP

```sh
node bin/threadfold.js mcp
node bin/threadfold.js mcp --data .threadfold/mcp --fixture fixtures/completed-run.json
```

표준 입력/출력으로 한 줄당 JSON-RPC 메시지를 처리합니다. 초기화 후 tools/list, tools/call을 사용하며 출력과 진단을 분리합니다. HTTP 서버를 시작하지 않습니다. 기본 운영 모드에는 읽을 실제 Hub inventory가 없어 `HUB_UNAVAILABLE`을 반환합니다.

## 남은 출시 조건

실제 Hub cleanup batch/예약/fencing/결과 조회, 모든 Turn 시작과 배타적인 host 변경 경계, 신뢰할 사용자 승인·철회 경로, 네이티브 자손 효과와 복원 검증, 실제 후속 작업의 맥락 재사용, 사람이 검토한 통합 품질이 필요합니다. 현재 Graph는 published fixture의 신선도와 범위만 확인하며 원격 Graph를 갱신하지 않습니다.

전체 계정 간 이전, Native G0/G3, destructive integration은 이번 검증에 포함하지 않았습니다. PRIVATE GitHub 생성·공개 범위 확인·설치·게시 역시 부모가 판단할 별도 후속 작업입니다. 실행 결과와 검증 제한은 [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)에 기록합니다.

[운영 Hub 계약 조사](HUB_INTEGRATION.md)에 실제 코드 근거와 필요한 최소 계약을 정리했습니다. `fold_capabilities`의 `productionBlockers`를 확인하세요. 기본 운영 모드는 실제 inventory 미연결 상태이며 fixture 구성으로 운영 기능이 열리지 않습니다. 공식 구조 검증은 기존 PyYAML venv에서 통과했지만, 과거 기본 Python의 의존성 실패와 실패 Run 판정은 보존합니다. [이번 검증 기록](VERIFICATION_2026-09-06_CONTINUATION.md)은 원출력 파일과 실제 명령 종료 결과를 구분합니다.
