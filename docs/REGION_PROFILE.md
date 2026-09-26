# 강원 지역 profile과 공개 데이터

이 저장소의 활성 profile은 `gangwon` 하나다. `NEXT_PUBLIC_EDU_MAP_PROFILE`과 `EDU_MAP_PROFILE`은 `gangwon`으로 설정한다. 다른 profile 값은 오류로 처리한다. 설정은 [`src/lib/profiles/gangwon.ts`](../src/lib/profiles/gangwon.ts)에 있다.

## 경계 코드와 공식 출처

앱의 강원 시군 키는 국토교통부의 2026-06-30 법정동 코드 앞 5자리인 `51110`(춘천)부터 `51830`(양양)까지 18개다. 정부 SGIS 경계 원본은 별도 통계경계 체계로 강원 시도 `32`, 시군 `32010`부터 `32610`, 행정동 8자리를 사용한다. profile의 `boundary.sidoCode`와 `neighborSidoCodes`는 **원본 SGIS 코드** `32`와 `31/33/37`이며, `internalSidoCode`와 `internalNeighborSidoCodes`는 **앱 내부 코드** `51`과 `41/43/47`이다. 두 체계를 숫자 모양만으로 같다고 취급하지 않는다. 명시적 18개 대응은 [`region-crosswalk.json`](../data/manual/gangwon/region-crosswalk.json)에 있다.

경계 원본은 국가데이터처 제공 2025-06-30 SGIS 시도·시군구·행정동 SHP이며 EPSG:5179에서 WGS84로 변환한다. 현재 코드표는 국토교통부의 2026-06-30 법정동 CSV다. 원문 URL, 해시, 저장·재배포 조건 및 VWorld와의 구분은 [`GANGWON_SPATIAL_SOURCES.md`](GANGWON_SPATIAL_SOURCES.md)와 [`spatial-sources.json`](../data/sources/gangwon/spatial-sources.json)에 기록했다. 원본은 `data/raw/gangwon/`에 두고 Git에는 넣지 않는다.

## 현재 공개 상태

현재 `npm run data:build`는 독립 심사를 통과한 교육부 2022 학교별 원본과 정부 경계를 사용해 `releaseStatus: limited` 산출물을 생성한다. 통계 기준일은 2022-04-01, 경계는 2025-06-30, 코드표는 2026-06-30으로 구별한다. 공식 KEDI·나이스 코드와 본분교·상태를 유지하고, 원시 행 수를 공식 본교 수로 표시하지 않는다. 학교 좌표는 미확보로 null이며 좌표 추정은 하지 않는다. 최신 학교개황과 폐교 자료를 포함한 현재 상태는 [`GANGWON_IMPLEMENTATION_STATUS.md`](GANGWON_IMPLEMENTATION_STATUS.md)에 기록한다.

`npm run data:regions`와 `npm run data:emd`는 전체 강원 빌드의 호환 별칭이다. 기존 민간 GitHub 다운로더 스크립트를 직접 실행하면 강원 profile에서 차단한다. 공개 builder는 등록된 정부 ZIP의 SHA-256을 확인하는 공간 어댑터와 교육부 2022 학교별 어댑터를 연결한다. 세 필수 원천이 모두 `publishable`인 경우만 실제 자료를 생성하며, 심사 전에는 준비 상태를 유지한다. 검증을 통과한 한 버전의 강원 `manifest.json`과 자료만 공개한다.

공개 builder는 `data/interim/gangwon/staging/<토큰>/`에 전체 산출물을 쓰고 출처 허용·원본 해시·manifest·공개 파일 해시·profile 및 dataVersion을 검증한다. 이후 `public/data`를 `data/interim/gangwon/previous-releases/<토큰>/`에 백업하고 stage를 `public/data`로 교체한다. 교체 실패 시 이전 디렉터리를 되돌린다. 운영자가 롤백할 경우에도 백업본의 manifest와 모든 공개 파일을 다시 검증하고 `profileId: gangwon`인 버전만 복구한다. 전북 산출물을 강원 복구본으로 쓰지 않는다.

## 이전 강원 공개본 복구

복구는 현재 코드의 데이터 계약과 현재 출처 등록부를 통과하는 `limited` 또는 `complete` 백업만 허용한다. 원본을 다시 파싱하지 않고 검증된 공개 파일의 바이트를 복사하므로 원본 파일이 없어도 실행할 수 있다. 현재 등록부에서 이용조건이 철회되었거나 설명·기준일이 바뀐 출처는 다시 심사하기 전까지 복구할 수 없다.

```sh
npm run data:gangwon:rollback -- --list
npm run data:gangwon:rollback -- --preview <백업ID>
npm run data:gangwon:rollback -- --apply <백업ID> --current <미리보기의현재dataVersion>
npm run data:validate
```

`<백업ID>`는 목록에 나온 UUID 폴더명이다. 목록에 있다는 사실만으로 복구 가능한 백업은 아니다. `--preview`는 공개 폴더를 바꾸지 않고 출처·지역·버전·체크섬·전체 데이터 계약을 검사하여 현재 버전, 대상 버전과 파일 수를 출력한다. 확인한 현재 버전을 `--current`에 그대로 지정하며, 그 사이 다른 빌드가 공개본을 바꿨으면 복구를 중단한다.

복구는 빌드와 같은 잠금을 사용한다. 선택한 백업은 유지하고, 별도 staging에서 다시 검증한 뒤 현재 공개본을 새 UUID 백업으로 옮겨 교체한다. 교체에 실패하면 바로 직전 공개본을 복구한다. 성공 출력의 `displacedBackupId`로 복구 직전 버전을 다시 찾을 수 있다. 경로 이탈·심볼릭 링크·Windows junction·준비 상태·다른 지역은 거부한다.

이 명령은 로컬 정적 데이터만 복구한다. 현재 코드와의 계약 검증을 통과한 뒤 필요한 코드 버전과 함께 배포하고 운영 URL을 별도로 확인해야 한다. 호스팅 서비스의 배포 롤백이나 API 환경설정까지 바꾸는 명령은 아니다. 로컬 백업은 Git 제외 경로이므로 다른 장비나 깨끗한 체크아웃에는 자동으로 생기지 않는다.

VWorld 배경지도와 건물은 저장·캐시 이용조건 검토 중이므로 profile review 상수에서 비활성화한다. 인증키를 환경변수에 넣는 것만으로 외부 요청이 켜지지 않는다. 사이트 주소는 실제 공개 주소가 확정된 뒤 `NEXT_PUBLIC_SITE_URL`에 지정한다. 빈 값은 가상의 배포 주소를 뜻하지 않는다. 예시는 [`.env.example`](../.env.example)에 둔다.

## 원자료 갱신 절차

1. 새 원본을 기존 파일과 구별되는 경로에 취득하고 출처 등록부에 실제 제공기관·문서명·기준일·취득일·SHA-256·이용조건을 기록한다. 기존 원본과 해시를 새 자료로 덮어쓰지 않는다.
2. 원본 열과 기준일, 공식 학교코드, 본분교·폐휴교 상태, 강원 18시군 및 학교급별 모집단을 어댑터에 연결한다. 다른 해 자료로 누락값을 채우지 않는다.
3. 구현과 별도 검사자가 원문·라이선스·공식 합계를 대조한다. 심사가 끝난 출처만 `publishable`과 심사 근거를 기록하고 `compile.ts`의 공개 원천에 연결한다. 환경변수만으로 최신연도를 올리지 않는다.
4. Node.js 22에서 `npm run data:build`, `npm run data:validate`, `npm run data:gangwon:preflight`를 순서대로 실행한다. 빌드는 잠금 파일로 중복 실행을 막고 전체 자료를 staging에서 검증한 뒤 교체한다. 부분 갱신 별칭도 동일한 전체 빌드를 실행한다.
5. 별도 검사자가 신규·제외 학교, 지표 값·결측·제공 상태 변화, 실제 연도 범위, 브라우저와 URL·오류 복구를 확인한다. 검사 결과와 미해결 범위를 `GANGWON_VERIFICATION.md` 및 실행 기록에 남긴다.
6. 검증된 코드와 `public/data`를 같은 배포에 포함한다. `data/raw/gangwon`과 중간·백업 폴더는 배포 산출물이 아니다. 운영 주소와 환경 설정이 정해진 뒤 운영 환경을 별도로 확인한다.

`dataVersion`은 생성시각을 제외한 출력 데이터·출처·제공 상태의 내용 해시다. 동일 원본과 동일 구현을 반복 빌드하면 같은 버전이며, 변환이나 설명·가용성이 바뀌면 새 버전이 된다. 열어 둔 화면이 이전 버전 파일을 요청하다 404를 받으면 새로고침 안내를 표시한다. 이를 자료값 0이나 학교 없음으로 대체하지 않는다.
