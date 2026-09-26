import type { RegionCode } from "../geo/regions";
import type { School } from "../schools/types";

export type Designation = "decline" | "attention" | "none";
export interface IssueSource {
  name: string;
  url: string;
  referenceDate?: string;
  checkedAt?: string;
  scope?: string;
  coveredRegions?: string[];
}
export interface SchoolIssueFacts {
  kediCode?: string;
  sourceRecord?: { sourceId: string; sheet: string; row: number };
  isMain: boolean;
  status: string;
  entrants: number | null;
  specialClasses: number | null;
  specialStudents: number | null;
  librarianTeachers?: number | null;
  counselorTeachers?: number | null;
}
export type IssueLevel = "elem" | "mid" | "high";
export interface SpecialTrend {
  regionCode: string;
  year: number;
  regularStudents: number | null;
  regularClasses: number | null;
  specialStudents: number | null;
  specialClasses: number | null;
}
export interface EducationIssuesFile {
  version: 1;
  specialTrends?: SpecialTrend[];
  statsReferenceDate: string;
  sources: IssueSource[];
  designations: Record<RegionCode, Designation | null>;
  schools: Record<string, SchoolIssueFacts>;
  resourceSources?: Record<string, IssueSource & { scope: string }>;
  resources?: IssueResource[];
}
export interface IssueResource {
  issue: string;
  metric?: string;
  name: string;
  /** Null when the official list does not identify a unique district. */
  regionCode: RegionCode | null;
  address: string | null;
  phone: string | null;
  schoolId: string | null;
  detail: string | null;
  capacity?: number | null;
  enrolled?: number | null;
  lat?: number | null;
  lng?: number | null;
  referenceDate?: string | null;
}
export interface EducationIssue {
  id: string;
  title: string;
  question: string;
  description: string;
  policy: string;
  policyPage: number | null;
  policyTask: string;
  status: "published" | "planned";
  metrics: string[];
  dataNeeded?: string;
  nextQuestion?: string;
}
export type IssueColor = [number, number, number, number];
export interface IssueRegionValue {
  code: RegionCode;
  value: number | Designation | null;
  text: string;
  color: IssueColor;
}
export interface IssueMapModel {
  issue: EducationIssue;
  metric: string;
  title: string;
  date: string;
  note: string;
  regions: IssueRegionValue[];
  schools: School[];
  legend: { label: string; color: IssueColor }[];
  provinceText: string;
  level?: IssueLevel;
  readingGuide?: string;
  regionOverlay?: boolean;
  sources: IssueSource[];
}
