import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import TopBar from "@/components/panels/TopBar";
import type { DataBundle } from "@/lib/data/types";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import type { IndicatorFile } from "@/lib/indicators/types";
import { publishedManifest } from "../fixtures/gangwon-release";

const KESS_REFERENCE_DATE = "2026-04-01";
const CLOSED_SCHOOLS_REFERENCE_DATE = "2026-07-16";

function indicatorFile(id: string, referenceDate: string): IndicatorFile {
  return {
    id,
    year: 2026,
    referenceDate,
    source: { name: `${id} 출처`, url: `https://example.com/${id}`, year: 2026 },
    rows: [{ regionCode: PROVINCE_CODE, value: 1 }],
  };
}

function manifestFixture() {
  return publishedManifest(["schools_total", "students_total", "teachers_total", "small_schools", "closed_schools"]);
}

/**
 * A minimal-but-type-complete DataBundle: TopBar's own render path only
 * ever touches `indicators`/`series`/`manifest` (via KpiTiles and the
 * "기준 …" caption itself), so `regions`/`neighbors`/`schools`/
 * `closedSchools` are filled with the smallest values that satisfy their
 * types, not realistic content.
 */
function bundleFixture(overrides: Partial<Record<string, IndicatorFile>> = {}): DataBundle {
  const indicators: Record<string, IndicatorFile> = {
    schools_total: indicatorFile("schools_total", KESS_REFERENCE_DATE),
    students_total: indicatorFile("students_total", KESS_REFERENCE_DATE),
    teachers_total: indicatorFile("teachers_total", KESS_REFERENCE_DATE),
    small_schools: indicatorFile("small_schools", KESS_REFERENCE_DATE),
    // Task 5 — the one indicator whose referenceDate genuinely differs from
    // the other 4's: this is exactly the case that exposed the fix-round-1 bug.
    closed_schools: indicatorFile("closed_schools", CLOSED_SCHOOLS_REFERENCE_DATE),
    ...overrides,
  };
  return {
    regions: { type: "FeatureCollection", features: [] },
    neighbors: { type: "FeatureCollection", features: [] },
    charset: "가나다",
    manifest: manifestFixture(),
    schools: {
      referenceDate: { location: "2026-03-20", stats: KESS_REFERENCE_DATE },
      source: {
        location: { name: "위치 출처", url: "https://example.com/location", referenceDate: "2026-03-20" },
        stats: { name: "KESS", url: "https://example.com/kess", referenceDate: KESS_REFERENCE_DATE },
      },
      schools: [],
    },
    closedSchools: {
      referenceDate: CLOSED_SCHOOLS_REFERENCE_DATE,
      publishedAt: "2026-07-20",
      source: { name: "폐교재산 출처", url: "https://example.com/closed-schools", year: 2026 },
      rows: [],
    },
    indicators,
    series: {},
  } satisfies DataBundle;
}

describe("TopBar — 기준일 caption (Task 5 fix round 1)", () => {
  it("shows the KPI tiles' own (KESS) reference date, not the currently-selected map indicator's, when a differently-dated indicator (폐교 지표) is selected", () => {
    render(<TopBar indicatorId="closed_schools" bundle={bundleFixture()} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?indicator=closed_schools" }),
    });

    const caption = screen.getByTestId("topbar-reference-date");
    expect(caption).toHaveTextContent(`기준 ${KESS_REFERENCE_DATE}`);
    // The regression this guards against: the caption must NOT show the
    // selected (closed_schools) indicator's own, different date.
    expect(caption).not.toHaveTextContent(CLOSED_SCHOOLS_REFERENCE_DATE);
  });

  it("still shows the KESS date when a normal (same-dated) indicator is selected — no behavior change for the common case", () => {
    render(<TopBar indicatorId="students_total" bundle={bundleFixture()} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "?indicator=students_total" }),
    });

    expect(screen.getByTestId("topbar-reference-date")).toHaveTextContent(`기준 ${KESS_REFERENCE_DATE}`);
  });

  it("is unaffected by which indicatorId prop is passed (fully decoupled from the map selection)", () => {
    const bundle = bundleFixture();
    const { rerender } = render(<TopBar indicatorId="schools_total" bundle={bundle} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "" }),
    });
    const before = screen.getByTestId("topbar-reference-date").textContent;
    expect(before).toBe(`기준 ${KESS_REFERENCE_DATE}`);

    rerender(<TopBar indicatorId="closed_schools" bundle={bundle} />);
    const after = screen.getByTestId("topbar-reference-date").textContent;

    expect(after).toBe(before);
  });

  it("renders as the raw ISO date (matching Legend's own format), not the no-zero-pad 년.월.일 format RegionPanel's footer still uses", () => {
    render(<TopBar indicatorId="students_total" bundle={bundleFixture()} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "" }),
    });
    expect(screen.getByTestId("topbar-reference-date")).toHaveTextContent("기준 2026-04-01");
    expect(screen.queryByText(/기준 2026\.4\.1/)).not.toBeInTheDocument();
  });

  it("shows a skeleton, not a caption, while bundle is null (no crash)", () => {
    render(<TopBar indicatorId="students_total" bundle={null} />, {
      wrapper: withNuqsTestingAdapter({ searchParams: "" }),
    });
    const caption = screen.getByTestId("topbar-reference-date");
    expect(caption).not.toHaveTextContent(/기준/);
    expect(caption.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});
