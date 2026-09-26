/**
 * The shape of public/data/schools.json (Task 4B), and the `School` row
 * type used throughout src/**. Pure data types, no React import — mirrors
 * src/lib/indicators/types.ts (IndicatorFile/SeriesFile/Manifest), and is
 * imported by both client components and scripts/pipeline/lib/schools.ts
 * (which produces the JSON this type describes), same direction every other
 * pipeline/frontend type sharing in this repo already goes.
 */
import type { SchoolLevel } from "../indicators/types";

export interface School {
  id: string;
  name: string;
  level: SchoolLevel;
  /** 운영상태 — the location source's own value (e.g. "운영") when the school has a location match, otherwise the raw KESS 상태 (e.g. "기존"/"신설") for a `locationMissingReason` row (see below) that has no location row to read this from. */
  status: string;
  /** true for 분교장. */
  branch: boolean;
  /** null when neither the standard source nor verified school maps provide a location. */
  lat: number | null;
  lng: number | null;
  regionCode: string;
  students: number | null;
  classes: number | null;
  teachers: number | null;
  studentsPerClass: number | null;
  small: boolean;
  kediCode?: string;
  /** Official identifiers are never synthesized from school names. */
  sourceSchoolIds?: Record<string, string>;
  /** Internal locator of the original record; not an official school code. */
  sourceRecord?: { sourceId: string; sheet: string; row: number };
  statisticsSource?: SchoolSourceInfo;
  address?: string;
  /**
   * Set (and lat/lng both null) only when this school's 학교급 isn't covered
   * by LOCATION_SOURCE_LEVELS at all (currently: 특수학교 — the location
   * source has zero rows for that level nationwide, not a per-school
   * matching failure), and no verified supplement exists. Absent for every
   * school with real coordinates.
   */
  locationMissingReason?: string;
  /** Individually verified supplemental location, independent of statistics date. */
  locationSource?: {
    address: string;
    url: string;
    verifiedAt: string;
    method: string;
    mapUrl: string;
  };
}

export interface SchoolSourceInfo {
  name: string;
  url: string;
  referenceDate: string;
}

/** public/data/schools.json's top-level shape. */
export interface SchoolsFile {
  referenceDate: {
    location: string | null;
    stats: string;
  };
  source: {
    location: SchoolSourceInfo | null;
    stats: SchoolSourceInfo;
  };
  schools: School[];
}
