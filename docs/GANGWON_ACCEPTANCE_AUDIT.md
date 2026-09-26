# 강원 개정 계획 인수 감사

기준일: 2026-09-26. [개정 계획](GANGWON_REVISION_PLAN.md) 11~16절을 현재 작업 트리와 [독립 검증 기록](GANGWON_VERIFICATION.md)에 대조했다. 기존 전체 검사를 반복한 기록이 아니라, 확인된 산출물과 실행 결과의 **인수 범위**를 판정한 문서다. 재현성 갭은 최종 코드·원본의 2회 빌드로 추가 검사했고, 수동 롤백은 별도 검사자의 임시 작업공간 검증 결과를 반영했다.

**판정:** 2022년 학교 통계의 강원 **제한 공개판**은 로컬 데이터·화면 검증을 통과했다. 계획서가 요구한 전체 개정과 운영 인수는 아직 완료되지 않았다. `완료`는 명시한 범위와 근거에만 적용한다. `부분`은 구현 또는 검증 일부가 남은 경우, `미완`은 요구한 결과가 아직 없는 경우, `외부 의존`은 추가 공식 자료·이용조건·키·운영 환경이 선행되어야 하는 경우다. 외부 의존을 현재 기능 완료로 세지 않는다.

감사 대상 공개본은 [manifest](../public/data/manifest.json)의 `gangwon-2022-563a6bb6162048a7`이다. `limited`·2022년·schema 2이며 manifest가 50개 파일을 선언한다. [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)의 13/18 제공 지표, 0/10 제공 정책 주제, 657개 학교 전부 좌표 미확보가 이 판정의 범위다. 교육부 학교 원문·SGIS 경계·국토교통부 코드 세 출처만 공개에 연결했다. 작업 트리의 `public/data/releases/`와 `data/sources/gangwon/source-register.json`은 아직 추적되지 않으므로, 로컬 통과가 깨끗한 체크아웃의 통과를 증명하지 않는다.

## 11. 합격 기준

### 11.1 출처·데이터

| 요구사항 | 판정 | 확인 근거와 남은 조건 |
|---|---|---|
| 허용 기관 | 완료(현 공개본) | [manifest](../public/data/manifest.json)의 세 원천과 [출처 등록부](../data/sources/gangwon/source-register.json), [독립 출처 심사](GANGWON_VERIFICATION.md). 보류 자료는 공개에 연결하지 않았다. 새 원천마다 재심사 필요. |
| 원문 추적 | 완료(현 공개본) | [provenance](../public/data/releases/gangwon-2022-563a6bb6162048a7/provenance.json)에 원문 해시·기준일·모집단·변환/제외 사유, manifest에 제공기관·URL·날짜가 있다. |
| 이용 조건 | 완료(현 공개본) | 교육부 원문은 공공누리 1유형, SGIS·법정동 코드는 이용허락범위 제한 없음으로 [검증 기록](GANGWON_VERIFICATION.md)에 심사했다. VWorld·정책·미활용 폐교 등은 조건 미확인으로 공개에서 제외. |
| 지역 범위 | 완료(현 공개본) | [공식 코드 대응표](../data/manual/gangwon/region-crosswalk.json), [집계 테스트](../tests/pipeline/gangwon-aggregate.test.ts), [실제 경계 검사](../tests/pipeline/gangwon-spatial-integration.test.ts): 18시군+도 전체. 공개 지표의 결측은 사유와 함께 null. |
| 지역 혼합 | 완료(현 공개본) | [검증 기록](GANGWON_VERIFICATION.md)의 공개 폴더 잔존 문자열/코드 검사와 [릴리스 계약](../src/lib/data/release.ts)의 다른 profile·버전 거부. 저장소의 레거시 코드/합성 테스트에 전북 문자가 남는 것과 구별한다. |
| 학교 ID | 완료(2022 교육부 모집단) | [MOE 원본 검사](../tests/pipeline/gangwon-moe.test.ts): 대상 662행의 KEDI·NEIS 각각 유일, 폐교 5행 제외 후 657개 공개. [provenance](../public/data/releases/gangwon-2022-563a6bb6162048a7/provenance.json)에 포함/제외 기록. 2026 상세원본과 이름 자동 결합은 하지 않았다. |
| 공식 합계 | 완료(2022 네 학교급) | [검증 기록](GANGWON_VERIFICATION.md)의 강원교육청 통계연보 독립 대조: 운영 본교 634, 학생 147,101, 학급 7,849, 원문 `교원수_총계_계` 15,461. **모든 지표의 외부 공식 대조**를 뜻하지 않는다. |
| 통계 불일치 | 완료(대조한 범위) | 위 네 학교급 동일 범위의 차이 0. 원시 전체 1,005교는 다른 모집단으로 분리했다. 범위 차이가 생길 새 연도·지표에는 별도 조정표가 필요하다. |
| 좌표 | 외부 의존 | [학교 원천 조사](GANGWON_SCHOOL_SOURCES.md)와 [provenance](../public/data/releases/gangwon-2022-563a6bb6162048a7/provenance.json)에 657/657 미확보를 명시. 유효 좌표·주소 매칭은 검사할 공개 원천이 없어 미완이다. 저장·재배포 가능한 공식 학교 위치 확보와 독립 매칭 검사가 필요하다. |
| 폐교 | 외부 의존 | [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md): 전체/최근/미활용 세 지표를 구분해 미제공. 2025 미활용 53행을 전체 폐교로 환산하지 않는다. 전체 명단과 미활용 자료의 이용조건이 필요하다. |
| 시계열 | 부분 | 2022 단일 관측만 공개하고 5년 증감률은 보류; 임의 보간 없음. [시계열 검사](../tests/pipeline/gangwon-moe.test.ts)와 [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md). 실제 다년 비교는 과거 원본·동일 모집단 대조가 필요하다. |
| 결측 | 완료(현 공개 경로) | [집계 검사](../tests/pipeline/gangwon-aggregate.test.ts)와 [MOE 검사](../tests/pipeline/gangwon-moe.test.ts): 값 누락·분모 0·교실 일부 누락을 0으로 대체하지 않는다. 미제공 상태와 사유는 [manifest](../public/data/manifest.json) 및 화면에서 확인했다. |
| 재현성 | 완료(현 로컬 원본·코드) | [검증 기록](GANGWON_VERIFICATION.md)의 최종판 순차 2회 `data:build`: 같은 `563a6bb6162048a7`, 50개 파일 SHA-256 전부 동일, `builtAt` 제외 manifest 동일. 둘째 빌드 뒤 validate/preflight 통과. 깨끗한 체크아웃·Linux CI는 별도 검증 대상. |

### 11.2 자동 검사와 11.3 브라우저·운영 검사

| 요구 범위 | 판정 | 근거와 남은 조건 |
|---|---|---|
| 전북 입력 차단, 허용기관·출처·기준일·파일 불일치 차단 | 완료(현 경로) | [강원 intake](../tests/pipeline/gangwon-intake.test.ts), [원자적 공개](../tests/pipeline/gangwon-publish.test.ts), [릴리스 계약](../tests/unit/gangwon-release.test.ts), [검증 기록](GANGWON_VERIFICATION.md). |
| 정부 경계 좌표계·코드·18개 도형 | 완료 | SGIS 원본 ZIP 해시/변조 거부와 EPSG:5179→WGS84 변환의 [원본 통합 검사](../tests/pipeline/gangwon-spatial-integration.test.ts), [공간 심사](GANGWON_SPATIAL_SOURCES.md). |
| 누락·0분모·본분교·휴교·특수학교 집계 | 완료(2022 범위) | [집계](../tests/pipeline/gangwon-aggregate.test.ts) 및 [MOE](../tests/pipeline/gangwon-moe.test.ts) 합성·실원본 검사. |
| 학교 코드 변경·동명이교 오연결 | 부분 | [학교 위치 단위 검사](../tests/pipeline/school-locations.test.ts)에 합성 동명이교/중복 거부가 있다. 서로 다른 연도 공식 학교코드와 실제 좌표 원천을 연결하는 종단 검증은 없다. |
| 미활용 부분집합으로 전체 폐교 지표 생성 금지 | 완료(차단) | [지표 상태](../public/data/manifest.json)에서 폐교 3개 미제공; [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)은 미활용 원본을 별도로 보류한다. 실제 전체 폐교 지표 생성 검증은 원천 확보 후 필요. |
| manifest/profile/version 불일치, 부분 교체 실패 복구 | 완료(로컬 공개·복구 경로) | [릴리스 검사](../tests/unit/gangwon-release.test.ts), [원자적 공개 테스트](../tests/pipeline/gangwon-publish.test.ts) 5건과 [수동 롤백 테스트](../tests/pipeline/gangwon-rollback.test.ts) 9건을 임시 작업공간에서 결합 실행해 14/14 통과. 운영 호스팅 복구는 아래 14·16절에서 분리한다. |
| 미제공 지표·주제 URL/범례/로더 | 완료(현 상태) | [실제 제한판 E2E](../e2e/gangwon-limited.spec.ts), [준비판 E2E](../e2e/gangwon-preparing.spec.ts), [검증 기록](GANGWON_VERIFICATION.md). |
| 전체 자동 검사 명령 | 부분 | Node 22 로컬 타입·lint·빌드·데이터 검증 통과. 수동 롤백 추가 **전** 전체 Vitest **881/888 통과·원본 opt-in 7 skip**, 원본 opt-in 별도 통과; 롤백 추가 뒤 신규 9+기존 공개 5건은 별도 14/14 통과했다. Playwright **89건 범위를 최종 UI 코드에서 묶음별 82통과·조건 7 skip**으로 확인했다. 단일 명령 재실행은 필수 갭으로 세지 않는다. 실제 남은 환경 검사는 Linux CI와 조건부 실API/배포 테스트다. [검증 기록](GANGWON_VERIFICATION.md), [CI 정의](../.github/workflows/ci.yml). |
| 계획한 4개 뷰포트, 실제 2022/합성 학교 경로, URL·오류·WebGL 대체 | 부분 | 1440×900, 1024×768, 390×844, 360×640의 로컬 Chromium 결과와 실제 자료 준비/제한 화면 15/15가 [검증 기록](GANGWON_VERIFICATION.md)에 있다. 학교점·HUD·키보드·URL history는 **합성 좌표**에서 검사했다. 실제 학교점은 원천 미확보다. 모바일 크기 에뮬레이션은 실기기 확인이 아니다. |
| 실제 VWorld 키, API 실패/회복, 강원 광역 로드·타일 캐시·메모리 비교 | 외부 의존 | [공간 심사](GANGWON_SPATIAL_SOURCES.md), [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md): 저장·캐시 조건 미확인으로 배경지도·건물 gate 비활성. 로컬 검사는 안내와 외부 요청 0건을 확인했다. 실키/실API·실기기·반복 이동 성능 비교는 실행되지 않았다. |

## 12. 단계별 인수

| 단계 | 판정 | 증거와 다음 조건 |
|---|---|---|
| 0 기준선 | 완료 | 기준 커밋 `c7d03f5`, 초기 테스트/파일 상태가 [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)과 [검증 기록](GANGWON_VERIFICATION.md)에 있다. |
| 1 출처 | 부분 | 세 필수 원천과 해시·조건 심사 완료. [등록부](../data/sources/gangwon/source-register.json). 좌표·다년·폐교·정책·최신 학교 통계는 미확보/조건 미확인. |
| 2 지역 구조 | 완료 | [profile](../src/lib/profiles/gangwon.ts), [대응표](../data/manual/gangwon/region-crosswalk.json), 실제 18시군 경계 검사. |
| 3 입력·가공 | 부분 | 경계·2022 학교 어댑터 및 정규화 결과 완료. 공식 좌표·전체 폐교 어댑터와 원본은 없다. [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md). |
| 4 지표·주제 | 부분 | 18개와 10개 모두 상태·사유를 갖지만 실제 제공은 13개 지표·0개 주제, 시계열은 2022 한 시점. [manifest](../public/data/manifest.json), [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md). |
| 5 화면·지도 | 부분 | 지역 지도·탐색·통계·대체 화면은 로컬 검사 통과. 공식 학교점과 실제 VWorld 타일은 미제공/미검증. [검증 기록](GANGWON_VERIFICATION.md). |
| 6 통합 검증 | 부분 | 현 제한판의 출처·공식합계·로컬 자동/브라우저 검사 통과. 실API, 실기기/성능, Linux CI는 남았다. E2E 89건 범위는 묶음별 결과로 이미 확인했다. |
| 7 배포 준비 | 부분 | [환경 예시](../.env.example), [운영 절차](REGION_PROFILE.md), [수동 롤백 명령](../scripts/pipeline/gangwon/rollback.ts)이 있고 로컬 임시 작업공간의 14/14 복구·공개 검사를 통과했다. 운영 URL·키·도메인 설정과 호스팅 복구 검증은 남았다. |
| 8 배포 확인 | 미완 | 운영 배포와 배포 주소 검사가 없다. [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)의 운영 배포 미실시 표기. |

## 13. 미확정 사항의 현재 처리

| 계획서 쟁점 | 판정 | 확인된 처리 / 남은 조건 |
|---|---|---|
| 상세 필드, 다년 학교 통계 | 외부 의존 | 교육부 2022 학교별 자료로 일부 상세 지표는 제공. 교실 중복 정의와 비교연도는 보류. [학교 조사](GANGWON_SCHOOL_SOURCES.md), [과거 자료 조사](GANGWON_HISTORY_SOURCES.md). |
| KESS·안전원 출처 | 완료(격리) | 현 공개본에 연결하지 않고 교육부 직접 원문으로 대체. [manifest](../public/data/manifest.json). 장래 사용 시 새 심사 필요. |
| 공식 학교 좌표 | 외부 의존 | 657개 전부 null 및 사유 표시. 저장·재배포 가능 공식 원천 필요. |
| 정부 경계 조건 | 완료(현 원천) | 국가데이터처 원문·이용조건 및 국토교통부 코드 독립 확인. [공간 심사](GANGWON_SPATIAL_SOURCES.md). |
| 전체 폐교재산 | 외부 의존 | 미활용 53행은 공개 수치·전체 비율로 쓰지 않음. 전체 원본과 미활용 이용조건 필요. |
| 정책·기관 날짜 차이 | 부분 | 2026 정책 PDF는 2022 통계와 혼합하지 않고 10주제 보류. 원문별 공개조건·기관 명단과 시점 확인 필요. [정책 조사](GANGWON_POLICY_SOURCES.md). |
| 전북 상수·null 합산·캐시 혼합 | 완료(현 공개본) | profile·schema·버전 검사, stage 원자 교체, 결측 회귀 검사와 전북 공개 잔존 검사. [릴리스 코드](../src/lib/data/release.ts), [검증 기록](GANGWON_VERIFICATION.md). |

## 14. 운영·갱신·배포 방침

| 요구사항 | 판정 | 확인 근거와 남은 조건 |
|---|---|---|
| Node.js 22 기준 | 완료(로컬) | [package](../package.json)의 `22.x`, [CI 정의](../.github/workflows/ci.yml)의 Node 22, 로컬 검사 기록. Linux CI는 별도 미실행. |
| 빌드/화면 강원 profile 일치 | 완료(현 공개본) | [환경 예시](../.env.example), [profile 선택](../src/lib/profiles/index.ts), [manifest](../public/data/manifest.json)의 `gangwon`; 다른 profile 거부 검사. |
| 최신연도는 원본 기준 | 완료(현 공개본) | 2022-04-01 교육부 기준을 `latestYear=2022`로 표시; 환경변수로 2026으로 올리지 않음. |
| 공개 주소·키 분리·비밀 보관 | 부분 | [환경 예시](../.env.example)에 사이트 URL/공개 지도 키/서버 건물 키를 분리. 실제 주소·키 없음; 키 사용 및 배포 환경 확인 전. |
| 통합 버전 배포와 실시간 건물 설명 | 부분 | [manifest](../public/data/manifest.json)의 단일 버전 파일 해시·출처 검사 완료. 운영 배포는 없고 건물 API는 이용조건 심사 전 차단. |
| 원본 갱신 전 범위·ID·조건 심사 | 완료(절차) | [운영 절차](REGION_PROFILE.md) 1~5단계와 [출처 등록부](../data/sources/gangwon/source-register.json). 차기 자료 갱신을 실제 실행한 것은 아니다. |
| 갱신 보고 | 부분 | 현 최초 공개본에 신규·제외 학교, 결측, 검증 결과가 [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)과 [검증 기록](GANGWON_VERIFICATION.md)에 있다. **차기 원본과의 변경 보고**는 아직 해당 갱신이 없다. |
| 이전 강원 코드·데이터 복구 | 부분 | [수동 명령](../scripts/pipeline/gangwon/rollback.ts)과 [절차](REGION_PROFILE.md), [독립 로컬 검사](GANGWON_VERIFICATION.md)의 수동 9건+기존 공개 5건이 통과했다. 선택 백업 보존·잠금·실패 복원·전북 거부를 확인했다. 운영 호스팅과 해당 코드 버전의 실제 복구는 미검증. |
| 공표 주기 기반 운영 일정 | 미완 | 예약/자동 수집은 만들지 않았다. 자료별 공표 주기와 운영 일정 확정 후 설정할 사항이다. |

## 15. 납품 산출물

| 번호·요구 | 판정 | 근거와 빠진 부분 |
|---|---|---|
| 1 profile·정책·기관 정의 | 완료(현 범위) | [profile](../src/lib/profiles/gangwon.ts), [주제 정의](../src/lib/profiles/gangwon/issues.ts), [출처 등록부](../data/sources/gangwon/source-register.json). 정책 10건의 공개 근거는 미확보 상태로 표시. |
| 2 허용 출처·체크섬·필드 매핑 | 부분 | 세 공개 원천 해시·조건은 [등록부](../data/sources/gangwon/source-register.json), [MOE 어댑터](../scripts/pipeline/gangwon/moe.ts), [공간 어댑터](../scripts/pipeline/gangwon/spatial.ts)에 연결. 모든 보류 원천의 공개 가능 필드 매핑까지 확정된 것은 아니다. |
| 3 공식 지역·학교코드 대응 및 보정 근거 | 부분 | [18시군 대응표](../data/manual/gangwon/region-crosswalk.json), 2022 교육부 KEDI/NEIS 원문 ID가 있다. 다년 학교코드 변경·공식 위치 결합에 대한 대응/수동 보정 근거는 아직 없다. |
| 4 입력 어댑터·재현 빌드 | 완료(제한판) | [build](../scripts/pipeline/gangwon/build.ts), [MOE](../scripts/pipeline/gangwon/moe.ts), [spatial](../scripts/pipeline/gangwon/spatial.ts), [절차](REGION_PROFILE.md). 원자료가 필요한 재빌드와 Git의 정적 공개 파일 배포를 구분한다. |
| 5 검증된 정적 파일 전체 | 부분 | [manifest](../public/data/manifest.json)의 선언 파일 50개는 **제공 지표 13개, 그 시계열 13개, 행정동 경계 18개, 학교·지역·인접지역·문자셋·교육문제·provenance 6개**다. 미제공 지표 5개와 10개 주제의 상태·사유는 manifest에 있으며, 폐교 3개를 포함한 보류 지표의 개별 파일은 없다. `education-issues.json`은 공개 가능한 학교별 기초 사실을 담지만 정책 10개가 제공됐다는 뜻은 아니다. |
| 6 화면·공유 이미지·출처·대체 화면 | 완료(현 제한판) | [대시보드](../src/components/Dashboard.tsx), [공유 이미지](../public/social-preview.png), [Footer](../src/components/panels/Footer.tsx), [브라우저 기록](GANGWON_VERIFICATION.md). 실제 학교점/외부 지도 표시까지 완료한 것은 아니다. |
| 7 공식 합계·좌표·자동/실브라우저 기록 | 부분 | [독립 검증](GANGWON_VERIFICATION.md)에 공식 네 범주 대조와 좌표 100% 결측 보고, 로컬 브라우저 기록. 공식 좌표 매칭·실API·실기기·운영 브라우저 결과 없음. |
| 8 공개/보류 목록·과제 | 완료 | [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md)과 [원천 요청 초안](GANGWON_DATA_REQUEST_DRAFT.md). 요청 초안은 발송하지 않았다. |
| 9 갱신·배포·롤백 매뉴얼 | 부분 | [운영 절차](REGION_PROFILE.md)에 명령과 주의점이 있고 수동 롤백 로컬 독립 검사 9건이 통과했다. 운영 환경·호스팅 배포/복구 절차의 실제 실행은 남았다. |

## 16. 최종 체크리스트 판정

| # | 요구 | 판정 | 충족 범위 또는 해소 조건 |
|---:|---|---|---|
| 1 | 모든 공개 원천 허용 기관 | 완료(현 공개본) | manifest 세 기관의 원문·조건 심사. |
| 2 | 개인 GitHub·비허용 자료 제거 | 완료(현 공개본) | 공개 폴더와 신규 빌드 경로에서 제거/차단; [검증 기록](GANGWON_VERIFICATION.md). |
| 3 | 18시군 경계·코드·검색·집계 | 완료(현 공개본) | 실제 SGIS·코드/집계와 로컬 검색 검증. |
| 4 | 학교·학생·교원 공식 대조 | 완료(2022 네 학교급) | 학교 634·학생 147,101·교원 15,461; 학급 7,849도 대조. |
| 5 | 학교 위치 출처·저장/재배포 | 외부 의존 | 공식 원천 미확보; 657개 좌표 null. |
| 6 | 18지표·10주제 결과/범위/검증 | 부분 | 각각 상태·사유는 기록; 13지표만 제공, 주제 10건 보류. 제공 완료로 인수하려면 자료·조건 필요. |
| 7 | 미확보·비공개·결측과 0 구별 | 완료(현 경로) | manifest 상태/사유, null 보존, 분모 0 검사. |
| 8 | 과거/최신 연도·ID·비교 범위 | 외부 의존 | 2022 단일 모집단만 검증, 다년 비교 원본 미확보. 2026 자료를 최신 동급 통계로 합치지 않음. |
| 9 | 전체 폐교와 미활용 구별 | 완료(차단) | 3개 지표 보류, 미활용 53행으로 전체 수를 만들지 않음. 실제 전체 폐교 제공은 외부 자료 필요. |
| 10 | 공개 파일/화면 전북 잔존 없음 | 완료(현 공개본) | 공개 파일 검사 및 브라우저의 전북 URL 제거. |
| 11 | 모바일·URL·학교·WebGL·실지도 API | 부분 | 로컬 Chromium 뷰포트와 합성 학교점/WebGL 대체 통과. 실제 API·공식 학교점·실기기 미검증. |
| 12 | 출처·날짜·기관·집계 설명 | 완료(현 공개 항목) | manifest, provenance, Footer와 [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md). 보류 항목의 근거 완결을 뜻하지 않는다. |
| 13 | 제한 공개와 전체 완료 구분 | 완료 | manifest `limited`, 화면 상태와 [실행 기록](GANGWON_IMPLEMENTATION_STATUS.md). |
| 14 | 운영 배포·이전 강원본 복구 검증 | 미완 | 로컬 임시 작업공간의 수동 롤백 9건과 자동 공개 5건은 통과했다. 이전 **강원** 백업으로의 운영 호스팅 복구와 운영 URL smoke는 아직 없다. |

전체 인수로 올리기 위한 우선 조건은 저장·재배포 가능한 공식 학교 위치와 과거/최신 학교별 통계, 전체 폐교 및 정책별 공개 근거 확보, VWorld 이용조건과 실제 API 검증, 운영 환경·CI·배포 URL 및 호스팅 복구 검증이다. 현재 [CI 정의](../.github/workflows/ci.yml)가 `npm run e2e` 전체를 실행하도록 되어 있으므로, 추적되지 않은 공개 릴리스 파일과 출처 등록부를 최종 변경에 포함한 깨끗한 체크아웃에서 CI 결과를 확인해야 한다.
