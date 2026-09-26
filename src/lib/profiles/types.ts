import type { EducationIssue } from "../issues/types";

export type RegionEntry = { code: string; name: string };

/**
 * Everything that changes when this map is reused for a different province.
 * The application and pipeline consume this object rather than province names
 * or administrative codes embedded in their own modules.
 */
export interface RegionProfile {
  id: string;
  province: { name: string; shortName: string; aggregateCode: string };
  regions: readonly RegionEntry[];
  boundary: {
    /** Code system of the original boundary geometry, not the app's region keys. */
    sourceCodeSystem?: "admdongkor" | "sgis";
    /** Source polygon's two-digit province code. */
    sidoCode: string;
    /** Source polygon's neighboring province codes. */
    neighborSidoCodes: readonly string[];
    /** Required when source geometry codes differ from public/internal codes. */
    internalCodeSystem?: "legal-dong";
    internalSidoCode?: string;
    internalNeighborSidoCodes?: readonly string[];
    /** Source sgg codes that should be presented as one map region. */
    sggCodeOverrides?: Readonly<Record<string, string>>;
    sggPrefixOverrides?: Readonly<Record<string, string>>;
  };
  schoolData: {
    kessSidoNames: readonly string[];
    educationOfficeCodes: readonly string[];
    addressPrefixes: readonly string[];
  };
  files: {
    manualDir: string;
    closedSchoolsCsvPrefix?: string;
  };
  policy: { source: { name: string; url: string; referenceDate: string }; issues: EducationIssue[] };
}
