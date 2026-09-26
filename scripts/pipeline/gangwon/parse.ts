import { parseCsv } from "../lib/csv";
import { validDate } from "./source-register";

export const PARSER_VERSION = "gangwon-intake-v1";
// Names only: administrative and SGIS codes require their own official mapping.
export const REGION_NAMES = ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"];
export const SCHOOL_FIELDS = ["시도", "학교급", "설립구분", "학교명", "자치구", "고교유형", "학급수", "학생수", "학생수_여", "입학자", "입학자_여", "졸업자", "졸업자여", "교원수", "교원수_여", "직원수", "직원수_여"];
export const UNUSED_FIELDS = ["연번", "지역", "폐교명", "폐교년월일", "소재지", "부지면적", "필지", "건물면적", "동수", "향후계획"];
export type MissingReason = "missing" | "suppressed" | "not-applicable" | "not-recorded";
export type SourceNumber = { value: number; reason: null } | { value: null; reason: MissingReason; raw: string };

export function parseNumber(raw: string, integer = true): SourceNumber {
  const text = raw.trim();
  if (!text) return { value: null, reason: "missing", raw };
  if (["비공개", "*", "***"].includes(text)) return { value: null, reason: "suppressed", raw };
  if (text === "해당없음") return { value: null, reason: "not-applicable", raw };
  // A dash has no proven numeric meaning in these sources.
  if (["-", "N/A", "미수록"].includes(text)) return { value: null, reason: "not-recorded", raw };
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw new Error(`알 수 없는 숫자: ${raw}`);
  const value = Number(text.replaceAll(",", ""));
  if (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER || (integer && !Number.isInteger(value))) throw new Error(`숫자 범위 오류: ${raw}`);
  return { value, reason: null };
}

function csvObjects(bytes: Uint8Array, fields: string[]) {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("euc-kr", { fatal: true }).decode(bytes); }
  if (text.includes("\uFFFD")) throw new Error("CSV 문자 인코딩 오류");
  const [rawHeaders, ...rows] = parseCsv(text, { strict: true });
  const headers = rawHeaders?.map((field) => field.trim());
  if (!headers || new Set(headers).size !== headers.length || headers.length !== fields.length || fields.some((field) => !headers.includes(field))) {
    throw new Error("CSV 열 구성이 변경되었거나 필수 열이 없습니다.");
  }
  if (!rows.length) throw new Error("CSV에 데이터 행이 없습니다.");
  return rows.map((values, index) => {
    if (values.length !== headers.length) throw new Error(`CSV ${index + 2}행의 열 수 오류`);
    return { sourceRow: index + 2, cells: Object.fromEntries(headers.map((header, i) => [header, values[i].trim()])) };
  });
}

const LEVELS: Record<string, string> = { 초등학교: "elem", 중학교: "mid", 고등학교: "high", 특수학교: "special" };
export function parseSchoolOverview(bytes: Uint8Array) {
  return csvObjects(bytes, SCHOOL_FIELDS).map(({ sourceRow, cells }) => {
    if (!["강원", "강원도", "강원특별자치도"].includes(cells.시도)) throw new Error(`${sourceRow}행: 강원 이외 시도 ${cells.시도}`);
    if (!REGION_NAMES.includes(cells.자치구)) throw new Error(`${sourceRow}행: 알 수 없는 시군 ${cells.자치구}`);
    if (!cells.학교명 || !cells.학교급 || !cells.설립구분) throw new Error(`${sourceRow}행: 학교 식별 정보 누락`);
    if (!LEVELS[cells.학교급] && !["유치원", "각종학교"].includes(cells.학교급)) {
      throw new Error(`${sourceRow}행: 알 수 없는 학교급 ${cells.학교급}`);
    }
    const counts = Object.fromEntries(SCHOOL_FIELDS.slice(6).map((field) => [field, parseNumber(cells[field])]));
    for (const [total, female] of [["학생수", "학생수_여"], ["입학자", "입학자_여"], ["졸업자", "졸업자여"], ["교원수", "교원수_여"], ["직원수", "직원수_여"]]) {
      if (counts[total].value !== null && counts[female].value !== null && counts[female].value > counts[total].value) throw new Error(`${sourceRow}행: ${female} > ${total}`);
    }
    return {
      sourceRow, name: cells.학교명, regionName: cells.자치구,
      rawLevel: cells.학교급, level: LEVELS[cells.학교급] ?? null,
      establishment: cells.설립구분, highSchoolType: cells.고교유형,
      // Source-row numbers are lineage, never invented school identifiers.
      sourceSchoolIds: {}, branch: null, status: null, address: null, lat: null, lng: null,
      counts,
      exclusionReason: LEVELS[cells.학교급] ? null : `대상 학교급 아님: ${cells.학교급}`,
    };
  });
}

export function parseUnusedClosed(bytes: Uint8Array) {
  const serials = new Set<number>();
  return csvObjects(bytes, UNUSED_FIELDS).map(({ sourceRow, cells }) => {
    const serial = parseNumber(cells.연번).value;
    if (serial === null || serial < 1 || serials.has(serial)) throw new Error(`${sourceRow}행: 연번 중복 또는 누락`);
    serials.add(serial);
    const candidates = cells.지역 === "속초양양"
      ? ["속초시", "양양군"]
      : REGION_NAMES.filter((name) => name.slice(0, -1) === cells.지역);
    const addressRegion = /^(?:(?:강원특별자치도|강원도)\s+)?([^\s]+[시군])(?:\s|$)/.exec(cells.소재지)?.[1];
    const regionName = candidates.length === 1 ? candidates[0] : candidates.find((name) => name === addressRegion);
    if (!regionName) throw new Error(`${sourceRow}행: 알 수 없는 시군 ${cells.지역}`);
    if (!cells.폐교명 || !cells.소재지 || !validDate(cells.폐교년월일)) throw new Error(`${sourceRow}행: 폐교명·소재지·폐교일 오류`);
    if (addressRegion !== regionName) throw new Error(`${sourceRow}행: 지역과 소재지 불일치`);
    return {
      sourceRow, serial, regionName, sourceRegion: cells.지역,
      regionResolution: candidates.length > 1 ? "official-row-address" : "source-region-and-address",
      name: cells.폐교명, closedAt: cells.폐교년월일,
      address: cells.소재지, siteArea: parseNumber(cells.부지면적, false),
      parcelCount: parseNumber(cells.필지), buildingArea: parseNumber(cells.건물면적, false),
      buildingCount: parseNumber(cells.동수), futurePlan: cells.향후계획,
      // '대부' under 향후계획 is NOT proof of current leasing.
      datasetScope: "unused-only" as const,
    };
  });
}

export function completeSum(cells: SourceNumber[]): number | null {
  if (!cells.length || cells.some((cell) => cell.value === null)) return null;
  return cells.reduce((sum, cell) => sum + cell.value!, 0);
}
