import * as XLSX from "xlsx";
import { describe, expect, it, vi } from "vitest";
import { readSchoolSheet } from "../../scripts/pipeline/lib/kess-xlsx";
import { KESS_SHEET_NAME } from "../../scripts/pipeline/sources";

vi.mock("../../src/lib/profiles", () => ({ ACTIVE_PROFILE: legacyJeonbukProfile() }));
function legacyJeonbukProfile() {
  return {
    id: "jeonbuk-test",
    province: { name: "전북특별자치도", shortName: "전북", aggregateCode: "52000" },
    regions: [
      { code: "52110", name: "전주시" }, { code: "52130", name: "군산시" },
      { code: "52140", name: "익산시" }, { code: "52180", name: "정읍시" },
      { code: "52190", name: "남원시" }, { code: "52210", name: "김제시" },
      { code: "52710", name: "완주군" }, { code: "52720", name: "진안군" },
      { code: "52730", name: "무주군" }, { code: "52740", name: "장수군" },
      { code: "52750", name: "임실군" }, { code: "52770", name: "순창군" },
      { code: "52790", name: "고창군" }, { code: "52800", name: "부안군" },
    ],
    boundary: { sidoCode: "52", neighborSidoCodes: ["44", "12", "47", "48"], sggCodeOverrides: { "52111": "52110", "52113": "52110" } },
    schoolData: { kessSidoNames: ["전북", "전라북도", "전북특별자치도"], educationOfficeCodes: [], addressPrefixes: ["전북특별자치도", "전라북도"] },
    files: { manualDir: "data/manual", closedSchoolsCsvPrefix: "전북특별자치도교육청_폐교재산 현황_" },
  };
}

/**
 * Builds a minimal synthetic workbook that mimics the real KESS
 * "학교별 주요통계" sheet shape closely enough to exercise readSchoolSheet:
 * a few note rows (only column A populated, like the real file's rows 0-13),
 * then a single leaf header row at column 1='시도' / column 4='학교급' (the
 * signature readSchoolSheet uses to locate the header row — see the comment
 * in sources.ts on why we match the leaf row directly instead of doing a
 * generic multi-row '>' flatten), then data rows. Column order is
 * deliberately different from the real file to prove columns are resolved
 * by header name, not position.
 */
const HEADER = [
  "조사기준일", // 0 (unused)
  "시도", // 1
  "행정구", // 2
  "교육청", // 3 (unused filler, not in HEADER_MAP)
  "학교급", // 4
  "학교명", // 5
  "학교코드\r\n(KEDI)", // 6 (real 2026 label, with embedded \r\n)
  "본분교", // 7
  "상태", // 8
  "지역규모", // 9
  "주소", // 10
  "학생수_총계_계", // 11
  "편성학급수_계", // 12
  "교원수_총계_계", // 13
  "전체직원_계", // 14
  "입학자_계", // 15
  "졸업자_계", // 16
  "특수학급_학급수", // 17
  "특수학급_학생수_계", // 18
  "일반교실", // 19
  "교과교실", // 20
  "특별교실", // 21
  "수준별교실", // 22
  "기타교실", // 23
  "교지면적", // 24
  "교원수_정규_사서_계", // 25
  "교원수_정규_상담_계", // 26
];

type RawRow = (string | number | null)[];

function makeRow(fields: Partial<Record<string, string | number | null>>): RawRow {
  const row: RawRow = new Array(HEADER.length).fill(null);
  for (const [key, value] of Object.entries(fields)) {
    const idx = HEADER.indexOf(key);
    if (idx === -1) throw new Error(`test fixture bug: unknown header ${key}`);
    row[idx] = value ?? null;
  }
  return row;
}

const DATA_ROW_DEFAULTS = {
  학생수_총계_계: 100,
  편성학급수_계: 6,
  교원수_총계_계: 10,
  전체직원_계: 3,
  입학자_계: 15,
  졸업자_계: 15,
  특수학급_학급수: 0,
  특수학급_학생수_계: 0,
  일반교실: 6,
  교과교실: 2,
  특별교실: 1,
  수준별교실: 0,
  기타교실: 1,
  교지면적: 10000,
  교원수_정규_사서_계: 0,
  교원수_정규_상담_계: 0,
};

function makeWorkbookBuffer(): Buffer {
  const aoa: RawRow[] = [
    ["■ 2026년 유·초·중등 교육통계 학교별 주요 현황"],
    [null],
    ["1) 조사 기준일 : 2026. 4. 1. / 자료 추출일: 2026. 09. 03."],
    ["2) 학교수 세는 방법 : 본분교칼럼에서 분교장 제외, 상태칼럼에서 폐교제외"],
    HEADER,
    // 1. 전주시 본교 초등학교 기존
    makeRow({
      ...DATA_ROW_DEFAULTS,
      시도: "전북",
      행정구: "전주시",
      학교급: "초등학교",
      학교명: "전주초등학교",
      "학교코드\r\n(KEDI)": "4511001",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "시",
      주소: "전북특별자치도 전주시 ...",
    }),
    // 2. 전주시 본교 중학교 기존
    makeRow({
      ...DATA_ROW_DEFAULTS,
      시도: "전북",
      행정구: "전주시",
      학교급: "중학교",
      학교명: "전주중학교",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "시",
      주소: "전북특별자치도 전주시 ...",
    }),
    // 3. 전주시 분교장 초등학교 기존 (isMain must be 0, but row must still be kept)
    makeRow({
      ...DATA_ROW_DEFAULTS,
      학생수_총계_계: 8,
      시도: "전북",
      행정구: "전주시",
      학교급: "초등학교",
      학교명: "전주초등학교 분교장",
      본분교: "분교장",
      상태: "기존(원)교",
      지역규모: "면지역",
      주소: "전북특별자치도 전주시 ...",
    }),
    // 4. 군산시 본교 고등학교 휴(원)교 — must be KEPT (only 폐교 is excluded, and that
    // exclusion happens in aggregate.ts, not here) with status normalized to '휴교'
    makeRow({
      ...DATA_ROW_DEFAULTS,
      학생수_총계_계: 0,
      입학자_계: 0,
      시도: "전북",
      행정구: "군산시",
      학교급: "고등학교",
      학교명: "군산휴교고등학교",
      본분교: "본교",
      상태: "휴(원)교",
      지역규모: "특수지역",
      주소: "전북특별자치도 군산시 ...",
    }),
    // 5. 군산시 본교 초등학교 폐(원)교 — must also be KEPT at this stage
    makeRow({
      ...DATA_ROW_DEFAULTS,
      학생수_총계_계: 0,
      시도: "전북",
      행정구: "군산시",
      학교급: "초등학교",
      학교명: "군산폐교초등학교",
      본분교: "본교",
      상태: "폐(원)교",
      지역규모: "면지역",
      주소: "전북특별자치도 군산시 ...",
    }),
    // 6. 유치원 (dropped: level not in LEVEL_MAP)
    makeRow({
      ...DATA_ROW_DEFAULTS,
      시도: "전북",
      행정구: "전주시",
      학교급: "유치원",
      학교명: "전주유치원",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "시",
      주소: "전북특별자치도 전주시 ...",
    }),
    // 7. 각종학교 (dropped: level not in LEVEL_MAP)
    makeRow({
      ...DATA_ROW_DEFAULTS,
      시도: "전북",
      행정구: "전주시",
      학교급: "각종학교",
      학교명: "전북온라인학교",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "시",
      주소: "전북특별자치도 전주시 ...",
    }),
    // 8. 타 시도 (dropped: region not 전북)
    makeRow({
      ...DATA_ROW_DEFAULTS,
      시도: "서울",
      행정구: "강남구",
      학교급: "초등학교",
      학교명: "서울초등학교",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "시",
      주소: "서울특별시 강남구 ...",
    }),
    // 9. 완주군 본교 특수학교 신설
    makeRow({
      ...DATA_ROW_DEFAULTS,
      학생수_총계_계: 16,
      시도: "전북",
      행정구: "완주군",
      학교급: "특수학교",
      학교명: "완주특수학교",
      "학교코드\r\n(KEDI)": "4599001",
      본분교: "본교",
      상태: "신설(원)교",
      지역규모: "면지역",
      주소: "전북특별자치도 완주군 ...",
    }),
    // 10. 남원시 본교 중학교 기존, 면지역, entrants=0
    makeRow({
      ...DATA_ROW_DEFAULTS,
      입학자_계: 0,
      시도: "전북",
      행정구: "남원시",
      학교급: "중학교",
      학교명: "남원중학교",
      본분교: "본교",
      상태: "기존(원)교",
      지역규모: "면지역",
      주소: "전북특별자치도 남원시 ...",
    }),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, KESS_SHEET_NAME);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("readSchoolSheet", () => {
  const buffer = makeWorkbookBuffer();
  const result = readSchoolSheet(buffer, 2026);

  it("parses the top-of-file 조사 기준일 note into an ISO referenceDate", () => {
    expect(result.referenceDate).toBe("2026-04-01");
  });

  it("keeps only 전북 rows in the 4 core 학교급, dropping the rest", () => {
    // 10 rows in - 유치원, 각종학교, 타시도(서울) = 7 kept
    expect(result.rows).toHaveLength(7);
  });

  it("reports drop reasons for excluded rows", () => {
    expect(result.dropped["region:non-jb"]).toBe(1);
    expect(result.dropped["level:유치원"]).toBe(1);
    expect(result.dropped["level:각종학교"]).toBe(1);
  });

  it("assigns regionCode from 행정구 via exact-name lookup", () => {
    const jeonju = result.rows.find((r) => r.name === "전주초등학교");
    const gunsan = result.rows.find((r) => r.name === "군산휴교고등학교");
    const wanju = result.rows.find((r) => r.name === "완주특수학교");
    expect(jeonju?.regionCode).toBe("52110");
    expect(gunsan?.regionCode).toBe("52130");
    expect(wanju?.regionCode).toBe("52710");
  });

  it("maps 학교급 to the SchoolLevel union", () => {
    expect(result.rows.find((r) => r.name === "전주초등학교")?.level).toBe("elem");
    expect(result.rows.find((r) => r.name === "전주중학교")?.level).toBe("mid");
    expect(result.rows.find((r) => r.name === "군산휴교고등학교")?.level).toBe("high");
    expect(result.rows.find((r) => r.name === "완주특수학교")?.level).toBe("special");
  });

  it("computes isMain=1/branch=false for 본교 and isMain=0/branch=true for 분교장", () => {
    const main = result.rows.find((r) => r.name === "전주초등학교");
    const branch = result.rows.find((r) => r.name === "전주초등학교 분교장");
    expect(main?.isMain).toBe(1);
    expect(main?.branch).toBe(false);
    expect(branch?.isMain).toBe(0);
    expect(branch?.branch).toBe(true);
  });

  it("normalizes 상태 to short codes, and keeps 휴교/폐교 rows (status filtering is aggregate.ts's job)", () => {
    const resting = result.rows.find((r) => r.name === "군산휴교고등학교");
    const closed = result.rows.find((r) => r.name === "군산폐교초등학교");
    const founded = result.rows.find((r) => r.name === "완주특수학교");
    expect(resting?.status).toBe("휴교");
    expect(closed?.status).toBe("폐교");
    expect(founded?.status).toBe("신설");
  });

  it("normalizes 지역규모 by stripping the 지역 suffix", () => {
    const rural = result.rows.find((r) => r.name === "남원중학교");
    const special = result.rows.find((r) => r.name === "군산휴교고등학교");
    const city = result.rows.find((r) => r.name === "전주초등학교");
    expect(rural?.areaType).toBe("면");
    expect(special?.areaType).toBe("특수");
    expect(city?.areaType).toBe("시");
  });

  it("reads kediCode when the column is present", () => {
    expect(result.rows.find((r) => r.name === "전주초등학교")?.kediCode).toBe("4511001");
    expect(result.rows.find((r) => r.name === "완주특수학교")?.kediCode).toBe("4599001");
  });

  it("leaves kediCode undefined when the school has none in the sheet", () => {
    expect(result.rows.find((r) => r.name === "전주중학교")?.kediCode).toBeUndefined();
  });

  it("sums the 5 교실 columns into a single classrooms field", () => {
    const row = result.rows.find((r) => r.name === "전주초등학교");
    // 일반 6 + 교과 2 + 특별 1 + 수준별 0 + 기타 1 = 10
    expect(row?.classrooms).toBe(10);
  });

  it("reads 편성학급수_계 directly as classes", () => {
    const row = result.rows.find((r) => r.name === "전주초등학교");
    expect(row?.classes).toBe(6);
  });

  it("carries entrants through, including legitimate zeros", () => {
    const resting = result.rows.find((r) => r.name === "군산휴교고등학교");
    const namwon = result.rows.find((r) => r.name === "남원중학교");
    expect(resting?.entrants).toBe(0);
    expect(namwon?.entrants).toBe(0);
  });

  it("throws immediately on an unmapped 행정구 value", () => {
    const aoa: RawRow[] = [
      ["1) 조사 기준일 : 2026. 4. 1."],
      HEADER,
      makeRow({
        ...DATA_ROW_DEFAULTS,
        시도: "전북",
        행정구: "알수없는구",
        학교급: "초등학교",
        학교명: "미상초등학교",
        본분교: "본교",
        상태: "기존(원)교",
        지역규모: "시",
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, KESS_SHEET_NAME);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => readSchoolSheet(buf, 2026)).toThrow(/행정구/);
  });

  it("throws immediately on an unmapped 상태 value", () => {
    const aoa: RawRow[] = [
      ["1) 조사 기준일 : 2026. 4. 1."],
      HEADER,
      makeRow({
        ...DATA_ROW_DEFAULTS,
        시도: "전북",
        행정구: "전주시",
        학교급: "초등학교",
        학교명: "미상초등학교",
        본분교: "본교",
        상태: "알수없음",
        지역규모: "시",
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, KESS_SHEET_NAME);
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => readSchoolSheet(buf, 2026)).toThrow(/상태/);
  });
});
