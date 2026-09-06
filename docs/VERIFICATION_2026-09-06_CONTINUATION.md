# ThreadFold 구현 인계 검증 — 2026-09-06

이 세션은 기존 src/test와 로컬 core/fixture를 수정했다. 새 위임·작업 그래프·다른 프로젝트 쓰기·실제 사용자 스레드 변경은 수행하지 않았다. 원본 `docs/source/THREADFOLD_DESIGN.md`, `THREADFOLD_CONTRACTS.md`를 완독했고 수정하지 않았다. 기존 61개 테스트 통과는 이전 세션의 기록이며 이번 실행 결과와 구분한다.

## 수정 및 자체 검토

- 기존 Store와 journal 위에 미시작 계획 취소와 fixture 작업 취소를 추가했다. 계획 본문은 불변으로 남는다. intent만 남은 작업은 기존 recover로 계속 attention이며, 명시적 취소 요청 때 Hub 잠금 안에서 변경 없음 tombstone을 기록해야 cancelled로 전환한다. 취소된 operation에 대한 신규 예약·지연 apply는 효과를 만들지 않는다. 이미 커밋된 archive는 그대로 보고한다.
- 취소 응답 유실, 프로세스 종료 후 취소 요청, 취소/적용 순서 경합, 이후 새 계획 허용, 기존 승인 거절, 복원 preview 취소를 검증했다. 원래 61개 회귀 사례도 유지했다. subprocess 종료 73/74/75는 테스트가 의도한 중단 지점이며 네이티브 호스트 검증이 아니다.
- 결과의 changed 불리언, 원래 archive 상태, 증가한 revision, operation 소유권을 검사한다. 취소라고 하면서 changed=true인 모순된 응답은 거절한다.
- 통합 기록 재사용 시 기존 snapshot의 host·프로젝트 canonical path·Run 및 스레드 관리/프로젝트/Run 연결을 검사한다. 기존 기록의 digest를 재작성하지 않는다.
- 이미 archive된 항목을 예상 표시 목록에서 제외하고 unknown/partial 집계를 구분한다.
- 운영 capability 안내, 영문 README, 한국어 흐름, 아키텍처·계약·상태 문서와 실제 Hub 최소 계약을 갱신했다. 독립 평가가 아닌 자체 검토다.

## 실제 실행 명령과 원출력

모든 실행 cwd는 `/Users/sin-yebin/Desktop/project/threadfold`. 아래 stdout/stderr 파일은 해당 명령 실행 시 직접 리다이렉트한 원출력이다. 리다이렉션 때문에 명령 도구의 빈 출력만으로 결과 내용을 판단하지 않았고 저장 파일을 별도로 읽었다.

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test > docs/verification/2026-09-06-continuation/node-test.log 2>&1
```

첫 실행 exit **1**. [원출력](verification/2026-09-06-continuation/node-test.log): tests 76, pass 75, fail 1, cancelled/skipped/todo 0, duration_ms 11514.636916. 기존 MCP tools/list 테스트의 기대값 11과 실제 13이 달라 실패했다. 추가된 취소 도구 두 개를 반영해 기대값을 수정했고 실패 로그를 보존했다.

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test > docs/verification/2026-09-06-continuation/node-test-final.log 2>&1
```

최종 실행 exit **0**. [최종 원출력](verification/2026-09-06-continuation/node-test-final.log)을 읽어 다음 runner 집계를 확인했다. 이전 61개 사례와 추가 15개 사례를 포함하며 테스트 수를 코드나 exit 0만으로 추정하지 않았다.

```text
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 11378.812416
```

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/validate-package.js > docs/verification/2026-09-06-continuation/local-package.log 2>&1
/tmp/ruvora-plugin-validation/bin/python /Users/sin-yebin/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py . > docs/verification/2026-09-06-continuation/official-validator.log 2>&1
```

두 명령은 각각 exit **0**. [로컬 패키지 원출력](verification/2026-09-06-continuation/local-package.log)은 manifest, MCP, launcher, skill metadata, 원본 해시 검사를 통과했다. [공식 검증 원출력](verification/2026-09-06-continuation/official-validator.log)은 `Plugin validation passed: /Users/sin-yebin/Desktop/project/threadfold`. 이 세션에서 의존성을 설치하거나 검증기를 대체하지 않았다. 패키지 구조 검증이며 실제 설치/호스트 로딩을 뜻하지 않는다.

`shasum -a 256 docs/source/THREADFOLD_DESIGN.md docs/source/THREADFOLD_CONTRACTS.md`를 실행했고 exit **0**, 실제 출력은 다음과 같았다. 두 값은 기존 `SOURCE_HASHES.json`과 일치하며 로컬 패키지 검사도 비교했다.

```text
fb7cf2d16f99fc144d7d1866d8737ba0a958517e02eb24c59fc368010d0b5743  docs/source/THREADFOLD_DESIGN.md
37cd9ffbe165d4c030fc450ba4a1a322aeeb367abaac6c48ccf7a5dfd46dcb20  docs/source/THREADFOLD_CONTRACTS.md
```

## 과거 판정과 진단 오류 보존

`../codex-control-plane/docs/INCIDENT_CONTINUATION_2026-09-06.md`를 읽기 전용으로 참조했다. 문서에 따르면 과거 Fold의 문자 그대로인 다중 경로 `rg --files -g AGENTS.md`는 좁은 파서가 경로 인자를 거부해 exit 1을 산출물 실패로 오판정했다. 그 과거 실행의 원출력을 이번에 직접 관찰했다고 주장하지 않는다. 과거 실패 Run/판정은 그대로이고 문서의 후속 공식 패키지 성공과도 별개다. Planner 실행 환경 불일치는 이번 구현 환경의 작업 권한과 구분했다.

이번 조사 중 `/src/approval*`를 포함한 명령은 zsh의 `no matches found` 진단으로 해당 rg 실행 전에 실패했다. 이어진 cat 때문에 복합 명령 최종 exit는 0이었으므로 전체 검색 성공으로 취급하지 않았다. 실제 파일명을 확인한 후 context/registry 파일을 명시하여 읽었다. 또한 테스트 진행 확인 중 `ps -axo pid,ppid,etime,command`는 `operation not permitted: ps`로 실패했다(복합 명령 exit 127). 권한 제한을 우회하거나 재시도하지 않았으며 프로세스 목록을 확인했다고 주장하지 않는다. 실행 도구의 기존 session 완료 결과와 저장된 테스트 원출력으로 종료 결과를 확인했다.

Hub 계약 이름 검색은 별도 명령으로 실행했다:

```sh
rg -n 'inspect_cleanup_eligibility|prepare_cleanup_batch|apply_cleanup_batch|read_cleanup_operation|prepare_restore|apply_restore|approvalReceipt|threadfold|foldRecord' /Users/sin-yebin/Desktop/project/codex-control-plane/src
```

exit **1**, 명시적 빈 출력 문자열이 제공되었다. 따라서 이 범위의 이름 매치 없음이며, Hub 전체 기능 부재의 증명은 아니다. 코드 경로와 필요한 최소 계약은 [HUB_INTEGRATION.md](HUB_INTEGRATION.md)에 기록했다. 향후 출력이 null/생략된 실행은 출력 미제공으로 남겨야 한다. 특히 진단 없는 literal `rg --files`의 exit 1은 의미상 no matches로 추론할 수 있어도 빈 출력을 관찰했다는 뜻은 아니다.

## 미검증 출시 게이트

실제 Hub inventory/eligibility, 모든 Turn 시작과 배타적인 조건부 변경, 네이티브 자손 효과, scoped 사용자 승인·철회, 영속 항목 결과·취소·복원 소유권, 실제 후속 Context Snapshot 소비, 실제 Graph 연동, 사람의 의미적 통합 검토, 설치/업데이트 시 데이터 보존은 미검증이다. 실제 Run dry-run과 운영 archive/restore를 수행하지 않았다. 공식 구조 검증/fixture 통과로 대체하지 않는다. POSIX 전원 장애 보장·대용량 compaction·stale lock 수동 유지보수는 남은 저장소 한계다. 기존 결과와 현재 상태가 달라지는 사후 사용자 변경은 attention 유지 및 조사 대상이며 자동 복구하지 않는다.

## 이번 변경 파일

- 구현: `src/engine.js`, `src/adapters.js`, `src/model.js`, `src/tools.js`, `src/contracts.d.ts`.
- 회귀 검증: `test/core.test.js` (기존 사례 유지, MCP 도구 수 갱신, 15개 추가).
- 기존 문서 갱신: `README.md`, `docs/USAGE_KO.md`, `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_CONTRACTS.md`, `docs/IMPLEMENTATION_STATUS.md`.
- 새 문서 및 원출력: `docs/HUB_INTEGRATION.md`, 이 문서, `docs/verification/2026-09-06-continuation/`의 로그 4개.

`src/store.js`, CLI/launcher, 플러그인 메타데이터, fixture 원본, 두 설계 원본과 baseline hash 파일은 기존 것을 재사용했다. 기존 구현 파일 다수가 처음부터 Git untracked 상태였으므로 `git status`의 전체 untracked 목록을 이번 생성 파일 목록으로 해석하지 않는다. 커밋·설치·게시를 수행하지 않았다.
