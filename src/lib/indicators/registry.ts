/**
 * The indicator registry: the single place that defines every KPI shown on
 * the map / dashboard, and — via `aggregate` — the exact rule the data
 * pipeline uses to turn normalized KESS school rows into 14 시군 + 전북
 * (52000) values. Adding a new "조건별 맵" indicator means adding one entry
 * here plus (if needed) one predicate in scripts/pipeline/lib/predicates.ts.
 *
 * Pure TS, no React import: this file is imported both by client components
 * and by scripts/pipeline/build-indicators.ts under tsx.
 */
import { formatArea, formatDecimal, formatInt, formatPercent } from "../format";
import type { IndicatorDef, IndicatorSource } from "./types";

const GWE_SOURCE: IndicatorSource = {
  name: "강원특별자치도교육청 교육통계 (공개 파일별 기준일 확인)",
  url: "https://open.gwe.go.kr/open/index.do",
  year: 2026,
};

/**
 * Task 5 — 폐교 지표. Duplicated (not imported) from
 * scripts/pipeline/sources.ts's own CLOSED_SCHOOLS_SOURCE, matching this
 * file's existing precedent (GWE_SOURCE above is likewise a local copy, not
 * an import of scripts/pipeline/sources.ts's KESS_STATS_SOURCE) — this keeps
 * src/lib/indicators/** free of any scripts/pipeline import, which must stay
 * a one-way dependency (pipeline -> src/lib, never the reverse).
 */
const CLOSED_SCHOOLS_SOURCE: IndicatorSource = {
  name: "강원특별자치도교육청 폐교 자료 (공개 조건 확인 중)",
  url: "https://www.gwe.go.kr/main/index.do",
  year: 2025,
};

/**
 * The `Aggregate.external` `file` marker every closed_schools* indicator
 * below shares — not a real public/data path (unlike students_change_5y's
 * `series/students_total.json`, which IS one), just a stable id
 * build-indicators.ts's external-aggregate dispatcher matches on to know
 * "this indicator's data comes from the 폐교 CSV pipeline, use `field` to
 * pick which of its 3 metrics (count/unused/recent)". Exported so
 * build-indicators.ts imports the same literal rather than re-typing it.
 */
export const CLOSED_SCHOOLS_AGGREGATE_FILE = "interim/closed-schools";

export const INDICATORS: IndicatorDef[] = [
  {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    byLevel: true,
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "sum", field: "students" },
    description: "초·중·고·특수 재학생 총원입니다. 학생수가 많을수록 학령인구 기반이 두터운 지역입니다.",
  },
  {
    id: "schools_total",
    group: "scale",
    label: "학교수",
    unit: "교",
    polarity: "neutral",
    kind: "count",
    byLevel: true,
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "count", predicate: "isMain" },
    description: "운영 중인 본교 수입니다(분교장·폐교 제외). 학생수·소규모학교 비율과 함께 보면 통폐합 압력을 가늠할 수 있습니다.",
  },
  {
    id: "classes_total",
    group: "scale",
    label: "학급수",
    unit: "학급",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "sum", field: "classes" },
    description: "전체 학급수입니다. 학급당 학생수와 함께 보면 교육 여건의 밀도를 가늠할 수 있습니다.",
  },
  {
    id: "students_per_class",
    group: "scale",
    label: "학급당 학생수",
    unit: "명/학급",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "ratio", numerator: "students", denominator: "classes" },
    description: "학급당 학생수가 낮을수록 소규모·분산 배치 경향입니다. 강원 평균과 비교하세요.",
  },
  {
    id: "teachers_total",
    group: "teacherInfra",
    label: "교원수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    // byLevel is required (not just an optional nicety): validate.ts's own
    // check (3) compares 52000/<level> teacher values against the official
    // per-level figures (8,116/4,935/5,377/482), which only exist if this
    // indicator produces level-tagged rows.
    byLevel: true,
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "sum", field: "teachers" },
    description: "재직 교원 총수입니다. 교원 1인당 학생수와 함께 보면 지역별 교육 인프라 배치를 비교할 수 있습니다.",
  },
  {
    id: "students_per_teacher",
    group: "teacherInfra",
    label: "교원 1인당 학생수",
    unit: "명",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "ratio", numerator: "students", denominator: "teachers" },
    description: "교원 1인당 학생수가 낮을수록 교육 여건이 여유롭다고 해석할 수 있습니다.",
  },
  {
    id: "site_area_per_student",
    group: "teacherInfra",
    label: "학생 1인당 교지면적",
    unit: "㎡",
    polarity: "higherBetter",
    kind: "ratio",
    format: formatArea,
    source: GWE_SOURCE,
    aggregate: { kind: "ratio", numerator: "siteArea", denominator: "students" },
    description: "학생 1인당 학교 부지 면적입니다. 넓을수록 교육 환경의 물리적 여유가 큽니다.",
  },
  {
    id: "classrooms_per_school",
    group: "teacherInfra",
    label: "학교당 교실수",
    unit: "실",
    polarity: "neutral",
    kind: "ratio",
    format: (v) => formatDecimal(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "ratio", numerator: "classrooms", denominator: "isMain" },
    description: "본교 1개교당 평균 교실수로, 시설 규모를 나타냅니다.",
  },
  {
    id: "small_schools",
    group: "smallSchool",
    label: "소규모학교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "count", predicate: "small" },
    description: "학생수 60명 이하 본교 수입니다. 학교 규모를 살펴보기 위한 자체 탐색 기준이며 통폐합 대상 지정을 뜻하지 않습니다.",
    caveat: "소규모학교 기준: 학생수 60명 이하(자체 기준). 교육부 지역규모별 기준과 다를 수 있습니다.",
  },
  {
    id: "small_school_share",
    group: "smallSchool",
    label: "소규모학교 비율",
    unit: "%",
    polarity: "higherWorse",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "share", predicate: "small" },
    description: "전체 본교 중 소규모학교(학생수 60명 이하)가 차지하는 비율입니다.",
    caveat: "소규모학교 기준: 학생수 60명 이하(자체 기준). 교육부 지역규모별 기준과 다를 수 있습니다.",
  },
  {
    id: "zero_entrant_schools",
    group: "smallSchool",
    label: "신입생 0명 학교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "count", predicate: "zeroEntrants" },
    description: "해당 연도 입학생수가 명시적으로 0인 본교 수입니다. 휴교를 포함하며 향후 통폐합 여부를 예측하지 않습니다.",
  },
  {
    id: "rural_school_share",
    group: "smallSchool",
    label: "면지역 학교 비율",
    unit: "%",
    polarity: "neutral",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "share", predicate: "ruralArea" },
    description: "면지역에 위치한 학교의 비율입니다. 높을수록 농산어촌 분산 배치 경향이 강합니다.",
  },
  {
    id: "special_classes",
    group: "vulnerable",
    label: "특수학급 수",
    unit: "학급",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "sum", field: "specialClasses" },
    description: "일반학교 특수학급과 특수학교 학급을 포함한 수입니다. 특수교육 서비스의 충분성이나 효과를 뜻하지 않습니다.",
    caveat: "특수학교 포함. 일반학급 배치 대상자 등을 포함한 특수교육 대상자 총원과 다릅니다.",
  },
  {
    id: "special_students",
    group: "vulnerable",
    label: "특수학급 학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: GWE_SOURCE,
    aggregate: { kind: "sum", field: "specialStudents" },
    description: "일반학교 특수학급 학생과 특수학교 학생을 포함한 수입니다. 두 학교 유형의 모집단이 다른 점에 유의해야 합니다.",
    caveat: "특수학교 포함. 일반학급 배치 대상자 등을 포함한 특수교육 대상자 총원과 다릅니다.",
  },
  {
    id: "students_change_5y",
    group: "scale",
    label: "학생수 증감률",
    unit: "%",
    polarity: "higherBetter",
    kind: "ratio",
    format: (v) => formatPercent(v, 1),
    source: GWE_SOURCE,
    aggregate: { kind: "external", file: "series/students_total.json", field: "change5y" },
    description: "학생수 증감률입니다. 마이너스(-)가 클수록 학령인구 감소가 가파른 지역입니다.",
    // Fix round 1/5, finding 5: the previous wording only described the
    // fallback branch ("최초 연도부터 최신 연도까지"), which is misleading in
    // the common case where a full 5개년 시계열 is available (build-indicators.ts's
    // computeChange5y compares against latestYear-5 whenever that year exists,
    // and only falls back to the oldest available year otherwise). Reworded to
    // cover both branches; still no literal years baked in here — the exact
    // compared years render dynamically via stats.ts's displayLabel()
    // ("5년" -> "{min}→{max}" in the label/legend).
    caveat: "최신 연도와 5년 전 값을 비교합니다. 5년 전 자료가 없으면 확보된 가장 오래된 연도와 비교합니다(정확한 연도는 라벨·범례 표기 참조).",
  },
  // Task 5 — 폐교 지표(외부 CSV). 세 지표 모두 aggregate.kind: 'external'로,
  // build-indicators.ts가 data/raw의 폐교재산 현황 CSV(또는 그 committed
  // interim)를 읽어 REGION_TABLE 기준으로 집계한다 — KESS interim과는 완전히
  // 별개의 원천이다. source.year(2026)는 CSV 데이터기준일자의 연도이며,
  // 실제 화면 표기 기준일은 IndicatorFile.referenceDate(2026-07-16, 파일명
  // 기준)이다 — "날짜기준 규칙" 참고.
  {
    id: "closed_schools",
    group: "smallSchool",
    // Fix round 1/5, finding 1: "폐교 수(누적)" + a description hardcoding
    // "1991년 이후" overstated what this source actually is — a roster
    // snapshot of 폐교재산 the office still tracks as of its 기준일, not a
    // guaranteed-complete cumulative history back to a fixed year (a 폐교 that
    // was later sold off can drop out of the roster entirely). Relabeled to
    // "등재"(registered/on the roster) and shortLabel added for any UI that
    // wants a shorter form.
    label: "폐교 수(등재)",
    shortLabel: "폐교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: CLOSED_SCHOOLS_SOURCE,
    aggregate: { kind: "external", file: CLOSED_SCHOOLS_AGGREGATE_FILE, field: "count" },
    description: "교육청 폐교재산 현황에 등재된 폐교 수입니다(기준일 시점). 매각 등으로 처분된 폐교는 등재에서 빠질 수 있습니다.",
    caveat: "강원특별자치도교육청 폐교재산 현황 기준(하단 출처의 기준일 참조). 분교장을 포함하며, 본교 기준인 학교수 지표와 집계 범위가 다릅니다.",
  },
  {
    id: "closed_schools_unused",
    group: "smallSchool",
    label: "미활용 폐교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: CLOSED_SCHOOLS_SOURCE,
    aggregate: { kind: "external", file: CLOSED_SCHOOLS_AGGREGATE_FILE, field: "unused" },
    // Fix round 1/5, finding 6: the previous wording ("활용 계획이 없는" +
    // "정책의 우선 검토 대상") claimed intent/plans the source data doesn't
    // actually state — 활용현황구분명='미활용' is just a status classification
    // on the 기준일, not a statement that no plan exists. Reworded to
    // describe the classification itself.
    description: "활용현황이 '미활용'으로 분류된 폐교 수입니다.",
    caveat: "강원특별자치도교육청 폐교재산 현황 기준(하단 출처의 기준일 참조). 활용현황구분명이 '미활용'인 행만 집계합니다.",
  },
  {
    id: "closed_schools_recent",
    group: "smallSchool",
    label: "최근 10년 폐교 수",
    unit: "교",
    polarity: "higherWorse",
    kind: "count",
    format: formatInt,
    source: CLOSED_SCHOOLS_SOURCE,
    aggregate: { kind: "external", file: CLOSED_SCHOOLS_AGGREGATE_FILE, field: "recent" },
    description: "최근 10년간(폐교연도 기준) 발생한 폐교 수입니다. 최근의 통폐합 추세를 보여줍니다.",
    // Fix round 1/5, finding 3: the window is anchored on the source's 기준일
    // (referenceDate), not on the data rows' own max 폐교연도 (see
    // scripts/pipeline/lib/closed-schools.ts's aggregateClosedSchools) — worded
    // generically here, no literal year, since this file has no access to the
    // actual built data at authoring time; the real 기준일 always renders via
    // the source line below.
    caveat: "기준: 하단 출처의 기준일이 속한 연도를 포함해 최근 10개년(폐교연도 기준)을 집계합니다. 강원특별자치도교육청 폐교재산 현황 기준(하단 출처의 기준일 참조).",
  },
];

export const INDICATOR_IDS: string[] = INDICATORS.map((d) => d.id);

export const DEFAULT_INDICATOR_ID = "students_total";

export function indicatorById(id: string): IndicatorDef | undefined {
  return INDICATORS.find((d) => d.id === id);
}

