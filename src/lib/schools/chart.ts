import type { School } from "./types";
import { GANGWON_VIEW } from "../profiles/gangwon";
import type { EducationIssuesFile } from "../issues/types";

export interface SchoolChartMetric {
  label: string;
  unit: string;
  /** Membership counts represent one school, not a magnitude to maximize. */
  heightMode?: "school-count";
  value: (school: School) => number | null;
}
const ratio = (a: number | null, b: number | null) => a !== null && b !== null && b > 0 ? a / b : null;

/** Only genuine per-school values can be extruded; regional rates are never assigned to schools. */
export function schoolChartMetric(indicator: string, issueMetric?: string, facts?: EducationIssuesFile | null): SchoolChartMetric | null {
  if (issueMetric) {
    if (issueMetric === "school-size") return { label: "학생수", unit: "명", value: s => s.students };
    if (issueMetric === "decline-small") return { label: "작은학교 학생수", unit: "명", value: s => s.students };
    if (issueMetric === "special-schools") return { label: "특수학교 수", unit: "교", heightMode: "school-count", value: s => s.level === "special" && !s.branch ? 1 : 0 };
    if (issueMetric === "librarian-schools") return facts ? { label: "사서교사 배치 학교", unit: "교", heightMode: "school-count", value: s => s.branch ? 0 : facts.schools[s.id]?.librarianTeachers == null ? null : facts.schools[s.id].librarianTeachers! > 0 ? 1 : 0 } : null;
    if (issueMetric === "counselor-schools") return facts ? { label: "전문상담교사 배치 학교", unit: "교", heightMode: "school-count", value: s => s.branch ? 0 : facts.schools[s.id]?.counselorTeachers == null ? null : facts.schools[s.id].counselorTeachers! > 0 ? 1 : 0 } : null;
    if (issueMetric === "special-classes") indicator = "special_classes";
    else if (issueMetric === "special-students") indicator = "special_students";
    else if (issueMetric === "zero-entrants") indicator = "zero_entrant_schools";
    else return null;
  }
  switch (indicator) {
    case "students_total": return { label: "학생수", unit: "명", value: s => s.students };
    case "classes_total": return { label: "학급수", unit: "학급", value: s => s.classes };
    case "teachers_total": return { label: "교원수", unit: "명", value: s => s.teachers };
    case "students_per_class": return { label: "학급당 학생수", unit: "명/학급", value: s => ratio(s.students, s.classes) };
    case "students_per_teacher": return { label: "교원 1인당 학생수", unit: "명/교원", value: s => ratio(s.students, s.teachers) };
    case "schools_total": return { label: "학교수", unit: "교", heightMode: "school-count", value: s => s.branch ? 0 : 1 };
    case "small_schools": return { label: "소규모학교 수", unit: "교", heightMode: "school-count", value: s => s.branch ? 0 : s.students === null ? null : s.small ? 1 : 0 };
    case "zero_entrant_schools": return facts ? { label: "신입생 0명 학교수", unit: "교", heightMode: "school-count", value: s => s.branch ? 0 : facts.schools[s.id]?.entrants == null ? null : facts.schools[s.id].entrants === 0 ? 1 : 0 } : null;
    case "special_classes": return facts ? { label: issueMetric ? "일반학교 특수학급수" : "특수학급수 · 특수학교 포함", unit: "학급", value: s => issueMetric && s.level === "special" ? null : facts.schools[s.id]?.specialClasses ?? null } : null;
    case "special_students": return facts ? { label: issueMetric ? "일반학교 특수학급 학생수" : "특수학급 학생수 · 특수학교 포함", unit: "명", value: s => issueMetric && s.level === "special" ? null : facts.schools[s.id]?.specialStudents ?? null } : null;
    default: return null;
  }
}

export function chartMaximum(schools: readonly School[], metric: SchoolChartMetric): number {
  return schools.reduce((max, s) => {
    const value = metric.value(s);
    return value !== null && Number.isFinite(value) && value > max ? value : max;
  }, 0);
}

/** Zero-based linear encoding. Zoom changes visual scale, never the data domain or height ratios. */
export function chartHeight(value: number | null, maximum: number, zoom: number, mode?: SchoolChartMetric["heightMode"]): number {
  if (value === null || !Number.isFinite(value) || value <= 0 || maximum <= 0) return 0;
  const metersPerPixel = 40075016.686 * Math.cos(GANGWON_VIEW.latitude * Math.PI / 180) / (512 * 2 ** zoom);
  if (mode === "school-count") return 12 * metersPerPixel;
  return value / maximum * 150 * metersPerPixel;
}
export function chartValueText(value: number | null, unit: string): string {
  return value === null || !Number.isFinite(value) ? "자료 없음" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit}`;
}
