# ThreadFold 수정 후 최종 로컬 수용 검토 — 2026-09-06

**이전 세 기준을 현재 로컬 범위에서 수용한다. COV-01은 해결됐으며, 이번 대조에서 추가 수정이 필요한 새 결함은 확인되지 않았다.** 실제 Hub/native 연동과 출시 성공은 이 판단에 포함하지 않는다. 이전 검토의 미해결 판단은 당시 기록으로 보존하고, 현재 판단만 이 문서에 새로 남긴다.

이번에는 기존 구현과 저장된 검사 증거를 읽고 파일 지문을 비교했다. 제품 코드·테스트를 수정하거나 성공한 테스트를 반복하지 않았다. 새 산출물은 이 문서와 `post-repair-file-comparison.log` 두 파일이다.

## 1. 보존하는 이전 기록과 수리 보고의 범위

이번 검토의 이전 작업은 `task_14bb0dce-661a-49b8-86b6-373c67809b93` / `run_9a695abb-41d6-4dac-9edf-18fe70eabe81`이다. 그 **rejected 판정과 원출력을 그대로 보존**한다. [ACCEPTANCE_CONTINUATION_2026-09-06.md](ACCEPTANCE_CONTINUATION_2026-09-06.md), 더 이전 task/Run의 실패 기록, `acceptance-coverage-observation.log`를 재작성하지 않았다. 이번 수용은 과거 실행에 대한 소급 성공 판정이 아니다.

처음 읽은 형제 자료는 다음과 같다.

- [MULTI_ACTION_REPAIR_2026-09-06.md](../../codex-control-plane/docs/MULTI_ACTION_REPAIR_2026-09-06.md)
- [MULTI_ACTION_RECONCILIATION_2026-09-06.json](../../codex-control-plane/docs/MULTI_ACTION_RECONCILIATION_2026-09-06.json)

보고서는 여러 shell 동작이 포함된 invocation의 표시 문자열 escaping을 실제 argv 차이로 오인했던 문제와 보정을 설명한다. JSON의 Fold 항목은 Turn `01a07530-04ee-73c3-abc0-3d45d47d9a06`, 명령 항목 `exec-1400695e-5663-465a-9409-092ba0811ffc`에 대해 before 충돌 1건, after `status: read` / `conflicts: []`를 기록한다. Fold와 Workspace 각각 31개 실행 항목, Fold 8개/Workspace 12개 worker receipt에 관한 **기존 재조정 결과**다.

현재 읽은 JSON에 두 after 충돌 목록이 비어 있다는 점은 확인했다. native 원본 전체를 이번에 다시 조회하거나 재조정 로직을 실행한 것은 아니다. `0.14.0+5eae32ab7324` 설치·healthy·parity는 수리 보고서의 과거 기록을 인용하며, 이번에 설치본이나 UI를 검사했다고 주장하지 않는다. 표시 문자열 충돌 0건은 COV-01 수정이나 제품 수용의 대체 증거가 아니다.

이 문서의 대상 제품은 **ThreadFold**다. Workspace의 pin-update/이전 lock/전체 테스트/demo/source-pins는 형제 수리 보고서에 기술된 다른 제품의 보완으로만 읽기 전용 참조했다. 보고서상 pin drift를 갱신하고 전체 회귀 자료를 확보했지만, 이번 Fold 검토에서 Workspace lock·코드 또는 각 원출력을 직접 검증하거나 그 제품을 수용 판정하지 않았다. 해당 검사를 Fold 테스트 수에 합산하지 않는다.

## 2. 이전 acceptance criteria별 현재 판단

| 이전 기준 | 현재 판단 | 실제 파일과 저장된 근거 | 한계 / 미충족 |
| --- | --- | --- | --- |
| 원본 설계와 기존 구현을 보존·재사용하고 중복 구현을 하지 않는다. | **수용 — 로컬 범위** | 이번 파일 비교에서 두 `docs/source` 파일이 `SOURCE_HASHES.json` 및 이전 audit과 일치했다. 이전 audit 대상 중 달라진 파일은 수리 보고가 지정한 `src/model.js`, `test/core.test.js`뿐이다. Store/engine/adapters/tools, CLI/metadata, 기존 README·구현 문서·네 과거 검증 로그는 이전 지문과 동일하다. 기존 consolidation 안의 작은 후처리를 재사용했으며 새로운 구현 체계를 만들지 않았다. | Git untracked 목록은 기존부터 존재한 파일을 포함하므로 이번 생성 목록이나 과거 변경 이력으로 해석하지 않는다. 이전 audit에 없는 파일의 과거 바이트 동일성까지 주장하지 않는다. |
| 남은 로컬 결함을 검토하고 발견한 결함을 수정하며 필요한 검증 원출력을 기록한다. | **수용 — COV-01 해결 확인** | `model.js`는 발견한 conflict claim ID 집합으로 coverage를 `conflict`에 대응한 다음 새 결과를 seal한다. core test는 해당 상태, 비충돌 preserved, sourceManifest claims와 evidenceRefs 보존을 검사한다. `COV01_REPAIR_2026-09-06.md`의 수정 설명과 `coverage-fix-tests.log`의 수정 후 76/76 통과가 대응한다. 기존 보완과 원출력도 유지된다. | 이번 테스트 실행은 아니다. 원출력의 당시 소스 hash manifest 부재 등 아래 증거 한계를 유지한다. 임의 원문의 의미적 완전성이나 모든 잠재 결함 부재를 보증하지 않는다. 이번 대조에서 새로 확인된 미해결 로컬 결함은 없다. |
| 운영 Hub 통합의 실제 지원 범위와 미검증 게이트를 구분하고 문서와 사용자 흐름에 반영한다. | **수용 — 경계 설명·차단 유지** | `UnavailableHub`의 inspect/mutation 거절, engine의 fixture 인스턴스 gate와 `liveIntegration: false`/productionBlockers를 현재 코드에서 확인했다. README·한국어 사용법·`HUB_INTEGRATION.md`는 실제 inventory 미연결, 명시적 fixture 사용, review와 승인 구분, 취소·복원 제한을 설명한다. 이 파일들은 이전 audit과 동일하다. | 실제 Hub 정리·승인·복원·맥락 소비는 미검증이다. 원본 설계의 운영 Hub 필수 요구는 제품 출시 관점에서 미충족이며, 이 로컬 수용으로 승격하지 않는다. |

## 3. COV-01의 이전 상태와 현재 해결 근거

이전 관찰에서는 conflicts에 들어간 두 claim이 coverage에는 모두 `preserved`로 남았다. `ACCEPTANCE_CONTINUATION_2026-09-06.md` §5와 [acceptance-coverage-observation.log](verification/2026-09-06-continuation/acceptance-coverage-observation.log)는 그 당시 동작의 유효한 기록이며 삭제하거나 성공 로그로 바꾸지 않는다.

현재 [src/model.js](../src/model.js)의 `consolidate()` 끝부분은 다음 순서다.

```js
const conflictingClaims = new Set(result.conflicts.flatMap(conflict => conflict.claimIds));
for (const coverage of result.coverage) if (conflictingClaims.has(coverage.claimId)) coverage.status = 'conflict';
return seal(result);
```

충돌 검색은 기존 로직을 재사용하고 claim ID로만 대응한다. topic 제목을 새 객체 식별자로 삼거나 sourceManifest/sections/evidenceRefs를 변경하지 않는다. 새로 생성하는 `result`를 seal하기 전 수정하므로 기존 발행 기록을 읽어 digest를 재작성하는 경로도 추가하지 않았다. 비충돌 claim의 기존 preserved/unresolved 분기는 그대로다.

[test/core.test.js](../test/core.test.js)의 `provenance, fixed sections, conflict and branch applicability survive consolidation` 사례는 현재 conflict claim의 coverage가 `conflict`, 나머지가 `preserved`인지 검사한다. 기존 원문/evidenceRefs/branch 검사와 함께 sourceManifest의 claims가 원래 fixture claims와 깊은 비교로 같은지도 검사한다. 이 사례 이름의 통과가 수정 후 로그에 실제로 있다. **전용 비충돌 unresolved assertion을 이 수정 사례가 추가했다고 과장하지 않는다.** unresolved 유지 판단은 수정되지 않은 기존 분기와 후처리 대상이 decisions conflict에 한정되는 코드 대조에 근거한다.

결론: 앞선 로컬 수용의 유일한 명시적 COV-01 미해결 항목은 현재 구현에서 해소됐고 관련 검사 증거가 저장돼 있다. 이미 완료된 이 수리를 중복 구현하거나 재실행할 필요를 발견하지 못했다. 이번 요청은 ThreadFold 제품 내부 수정이 허용되고 금지 대상은 실행 플러그인/형제 프로젝트임을 명확히 했지만, 새 결함이 없으므로 이번 제품 변경은 하지 않았다.

## 4. 기존 실행 증거와 이번 관찰

### 수정 후 이미 완료된 테스트

[COV01_REPAIR_2026-09-06.md](COV01_REPAIR_2026-09-06.md)와 형제 수리 보고는 절대 Node 실행 파일을 사용한 전체 `node --test`가 수정 후 exit 0이었다고 기록한다. 이번에는 [coverage-fix-tests.log](verification/2026-09-06-continuation/coverage-fix-tests.log)를 읽었으며 실제 저장된 runner 요약은 다음과 같다.

```text
ℹ tests 76
ℹ suites 0
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 10798.561458
```

수치의 근거는 로그 본문이다. exit 0은 수리 보고의 실행 결과 기록으로 구분하며, 이 원출력 본문에 없는 별도 종료 메타데이터를 이번에 관찰했다고 주장하지 않는다. 이 실행은 더 이전 `node-test-final.log`의 11378.812416 ms / 76개 통과와 다른 실행이다. 이번에 테스트를 76개 실행했다는 뜻도 아니다.

과거 `node-test.log`의 75 pass/1 fail, 이후 `node-test-final.log`의 76 pass/0 fail, 로컬 패키지·공식 validator 성공 로그는 그대로 남아 있다. 이번 파일 비교로 이 네 로그가 이전 audit 해시와 일치함을 확인했다. 원래 실패를 지우거나 수정 후 결과로 덮어쓰지 않았다. 공식 validator·demo·native 검증을 이번에 추가 실행하지 않았다.

### 이번 파일 비교 — 새 실행, 제품 테스트 아님

실행 cwd: `/Users/sin-yebin/Desktop/project/threadfold`.

```sh
/Users/sin-yebin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --input-type=module > docs/verification/2026-09-06-continuation/post-repair-file-comparison.log 2>&1
```

이 명령에 표준입력 JavaScript를 전달해 `fs`, SHA-256, assert만 사용했다. 제품 모듈을 import하거나 fixture/Store/Hub를 실행하지 않았다. 목적은 **수리 뒤 현재 파일 차이가 보고된 범위와 일치하는지** 확인하는 것이며 과거 성공 영수증을 재생성하는 검사가 아니다. 실제 명령 종료는 **exit 0**. 리다이렉트 때문에 도구의 직접 출력은 명시적 빈 문자열이었고, 이후 [저장 원출력](verification/2026-09-06-continuation/post-repair-file-comparison.log)을 읽어 결과를 확인했다.

| 파일 | 이전 audit SHA-256 | 현재 SHA-256 |
| --- | --- | --- |
| `src/model.js` | `cb1042867ee6eceb2a5f37974c74e0ba1a5abd932d4af9cf64c9873991590e96` | `df401bb8bf49108162ffcad212acd3331444ad670fa6e4f84891fcacdedfed0a` |
| `test/core.test.js` | `f0161e66c4e94a18201b058ec23c0e170cc3db0d8858cdc792c82af769d70398` | `c513951b0708bbedf455b2488de806d184695fb6812f9777ca20916cac7607a4` |

위 두 차이만 존재한다는 assertion이 통과했다. 나머지 이전 audit 대상 파일은 모두 동일하며, 새 수리 문서/로그와 이전 수용 문서/관찰 로그의 현재 지문도 별도로 저장했다. 원본 설계 해시는 다음과 같이 baseline과 일치한다.

```text
THREADFOLD_DESIGN.md    fb7cf2d16f99fc144d7d1866d8737ba0a958517e02eb24c59fc368010d0b5743
THREADFOLD_CONTRACTS.md 37cd9ffbe165d4c030fc450ba4a1a322aeeb367abaac6c48ccf7a5dfd46dcb20
```

증거 한계: 수정 후 테스트 원출력 자체에는 전체 소스 hash manifest가 없다. 이번 지문은 현재 파일의 값이며 테스트 시점으로 소급하지 않는다. 수리 문서, 현재 코드의 실제 변경, 대응 회귀 사례, 별도로 저장된 runner 결과를 함께 근거로 로컬 수용한다. 이 형식적 한계만을 이유로 성공 테스트를 반복하지 않았다.

## 5. 남는 한계와 다음 외부 계약

로컬 수용의 **확인된 미해결 결함은 없음**, 실제 출시 범위의 **미검증/미충족은 남음**으로 구분한다. [HUB_INTEGRATION.md](HUB_INTEGRATION.md)의 기존 최소 계약은 계속 필요하다.

- 권위 있는 inventory/eligibility: host/project/path/Run 식별, 모든 교차 Run 참조, 원본 접근, 페이지 완결성, 상태 revision, 보존·자손 effects.
- 원자적 정리: 정확한 planDigest/effects/expected revision, 예약 만료·fencing 및 모든 native Turn 시작과 배타적인 조건부 변경.
- 신뢰할 승인: 사용자 actor·operationKind·digest/effects·만료·철회를 변경 경계에서 검증하는 영수증. fixture issuer와 review 플래그는 대체물이 아니다.
- 영속 결과·취소·복원: stable operationId/idempotency, 항목별 이전/이후 상태·revision·소유권, 응답 유실 후 조회, 지연 요청을 차단하는 변경 없음 확정, 후속 사용자 변경을 보호하는 별도 승인 복원.
- 후속 맥락 소비: recordId/revision/digest와 선택 claim/evidence pin, stale/withdrawn/범위 차이 검사 및 실제 Context Snapshot 소비 증거.

**실제 native Hub 정리·승인·복원, Port G0/G3와 native 이전, 호스트 설치/UI·계정 간 재개는 미검증**이다. 실제 Graph 표시/semantic edge 연동, 사람의 의미적 coverage 검토, 설치/업데이트 데이터 보존도 미검증이다. POSIX 전원 장애 보장, 대용량 compaction 및 stale lock 수동 유지보수는 기존 저장소 한계로 유지한다. 이 항목들은 이번 로컬 수용에서 출시 성공으로 바뀌지 않는다.

과거 표시 문자열 충돌, 검색 종료 코드, glob/권한 진단은 각 당시 기록과 후속 재조정 자료의 범위로 해석한다. 출력 미제공을 빈 출력 관찰로 바꾸거나 실제 진단 실패를 성공으로 바꾸지 않는다. 이번에는 관련 검색·권한 진단을 재실행하지 않았다.

## 6. 이번 변경 파일과 완료 범위

- `docs/POST_REPAIR_ACCEPTANCE_2026-09-06.md` — 수정 후 기준별 수용 판단.
- `docs/verification/2026-09-06-continuation/post-repair-file-comparison.log` — 이번 파일 대조 원출력.

기존 README/설계/구현/테스트/검토/로그/발행 기록, 형제 프로젝트, 실제 사용자 스레드, registry는 수정하지 않았다. 새 스레드/fork/위임/작업 그래프, 중복 구현, 설치·게시·커밋·push도 수행하지 않았다. 수정 후 최종 로컬 수용 검토는 완료됐으며 과거 rejected 판정과 제품 출시 미검증 경계는 유지된다.
