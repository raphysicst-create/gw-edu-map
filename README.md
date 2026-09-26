# 강원 교육지도

전북 교육지도 업스트림을 포크한 **강원 전용 개인 업무 참고용 도구**입니다. 교육청 공식 서비스가 아닙니다.

현재는 **2022년 통계 제한 공개판**입니다. 교육부 직접 제공 학교별 원본과 정부 경계·코드 자료로 학교 검색·시군 통계를 구성했습니다. 통계 기준일은 2022-04-01이며 2026년 현황을 뜻하지 않습니다. 학교 좌표·비교 가능한 다년자료·폐교·정책 및 기관 목록의 미확보 항목은 상태와 사유를 표시합니다. 전체 개정이나 운영 배포가 완료된 상태는 아닙니다.

- [전체 개정 계획](docs/GANGWON_REVISION_PLAN.md)
- [구현 현황](docs/GANGWON_IMPLEMENTATION_STATUS.md)
- [독립 검증 기록](docs/GANGWON_VERIFICATION.md)
- [계획 요구사항별 인수 감사](docs/GANGWON_ACCEPTANCE_AUDIT.md)
- [학교 원자료 조사](docs/GANGWON_SCHOOL_SOURCES.md)
- [정부 경계·좌표 조사](docs/GANGWON_SPATIAL_SOURCES.md)
- [정책 원문·이용조건 조사](docs/GANGWON_POLICY_SOURCES.md)
- [과거 통계 조사](docs/GANGWON_HISTORY_SOURCES.md)
- [지역 코드·갱신·복구 안내](docs/REGION_PROFILE.md)

## 실행

Node.js 22, npm 10 이상을 사용합니다.

```sh
npm ci
npm run dev
```

지역 기본값은 `gangwon`입니다. 다른 profile을 지정하면 실패합니다. 공개 주소와 키 설정은 `.env.example`을 참고하세요. 배경지도·건물은 서비스별 저장 및 캐시 조건 검토가 끝나기 전까지 비활성 상태이며, 키만 설정해도 활성화되지 않습니다.

## 데이터 작업

| 명령 | 용도 |
|---|---|
| `npm run data:gangwon:fetch` | 통합 등록부의 취득 원본을 체크섬과 등록된 GET/POST 방식으로 복원 |
| `npm run data:gangwon:audit` | 초기 두 CSV의 스키마·행·결측을 조사하고 내부 보고서 생성 |
| `npm run data:build` | 강원 공개 상태를 임시 폴더에서 구성하고 검증 후 교체 |
| `npm run data:validate` | 공개 manifest·출처·파일 목록·지역 및 데이터 버전·체크섬 검사 |
| `npm run data:gangwon:preflight` | 공개 자료 계약 검사. 준비 상태는 실패, 제한 공개 여부와 운영 조건은 별도로 확인 |
| `npm run data:gangwon:rollback -- --list` | 로컬 백업 ID 목록. `--preview`로 검증하고 `--apply`와 현재 버전을 지정해 이전 강원 공개본 복구 |
| `npm run social:build` | 개인 도구의 아이콘과 공유 이미지 생성 |

`data:regions`, `data:emd`, `data:kess`, `data:schools`, `data:indicators`, `data:issues`, `data:charset`는 전체 강원 빌드 진입점의 호환 별칭입니다. 부분 파일을 따로 공개하지 않습니다. 빌더는 교육부 2022 학교별 원본과 정부 경계·코드 자료가 모두 공개 심사를 통과하면 실제 자료를 생성합니다. 심사 전에는 준비 상태를 유지하며, 기존 제한 공개본을 준비 상태로 덮어쓰지 않습니다.

추가로 취득한 교육통계연보와 정부 경계의 경로·요청 방식·해시는 `data/sources/gangwon/*-sources.json`과 각 조사 문서에 있습니다. 원본과 중간 산출물은 Git에서 제외합니다. 가공 자료에는 `publishable`로 검토된 출처만 사용할 수 있습니다.

## 검사

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run e2e
```

구현과 검사를 별도 담당으로 진행합니다. 현재 통과 범위와 미실시 범위는 독립 검증 기록을 따릅니다. 로컬 검사는 운영 배포·실제 기기·실제 VWorld API 검증을 대신하지 않습니다.

일반 `npm test`는 Git에 포함되지 않는 원본 파일 없이 실행합니다. 실제 원본 대조는 등록부의 원본을 확보한 환경에서 `GANGWON_MOE_INTEGRATION=1`(교육부 XLSX), `GANGWON_SPATIAL_INTEGRATION=1`(정부 경계 ZIP), `GANGWON_RELEASE_INTEGRATION=1`(전체 공개 파이프라인)을 각각 설정해 실행합니다. 환경변수가 없는 기본 실행에서는 이 원본 검사만 건너뜁니다.

## 유지할 기능

지도·학교 탐색·상세 HUD·18개 지표·10개 교육문제·시군 비교·실제 제공 연도별 추이·모바일 패널·URL 복원·WebGL 대체 화면을 강원 자료로 연결하는 개정 작업입니다. 자료 부족 항목은 상태와 사유를 노출합니다. 기존 전북 공개 파일은 강원 서비스에서 제공하지 않으며, 기존 파서는 참고용으로 남아 있습니다.

Next.js·React·deck.gl 구조는 유지합니다. 프레임워크 전환이나 자동 갱신 예약은 이번 작업에 포함하지 않습니다.

