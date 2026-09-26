import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import RegionList from "@/components/panels/RegionList";
import { REGIONS } from "@/lib/geo/regions";
import type { IndicatorFile, SeriesFile } from "@/lib/indicators/types";

/** students_total values chosen so the rank order is deliberately NOT REGIONS' declaration order — exercises real sorting, not incidental list order. */
const VALUES: Record<string, number> = {
  "51110": 70851, // 춘천시 — rank 1
  "51130": 50000, // 원주시 — rank 2
  "51150": 40000, // 강릉시 — rank 3
  "51170": 20000,
  "51190": 19000,
  "51210": 18000,
  "51230": 17000,
  "51720": 6000,
  "51730": 5000,
  "51750": 4000,
  "51760": 3000,
  "51770": 2000,
  "51780": 1500,
  "51790": 1400,
  "51800": 1300,
  "51810": 1200,
  "51820": 1100,
  "51830": 1000, // rank 18 (smallest)
};

function studentsTotalFile(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "합성 검사 자료", url: "https://example.com", year: 2026 },
    rows: [
      ...Object.entries(VALUES).map(([regionCode, value]) => ({ regionCode, value })),
      { regionCode: "51000", value: Object.values(VALUES).reduce((a, b) => a + b, 0) },
    ],
  };
}

function bundleFixture() {
  return {
    indicators: { students_total: studentsTotalFile() },
    series: {} as Record<string, SeriesFile>,
  };
}

describe("RegionList", () => {
  it("renders exactly 18 region buttons", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    expect(screen.getAllByRole("button")).toHaveLength(REGIONS.length);
  });

  it("orders the buttons by rank (춘천시 first, 양양군 last, for these fixture values)", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    const buttons = screen.getAllByRole("button");
    expect(within(buttons[0]).getByText("춘천시")).toBeInTheDocument();
    expect(within(buttons[buttons.length - 1]).getByText("양양군")).toBeInTheDocument();
  });

  it("shows each region's name, formatted value, and rank badge", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    const first = screen.getAllByRole("button")[0];
    expect(within(first).getByText("춘천시")).toBeInTheDocument();
    expect(within(first).getByText("70,851")).toBeInTheDocument();
    expect(within(first).getByText("1위")).toBeInTheDocument();
  });

  it("shows a leading prompt to click a region or pick from the list", () => {
    render(<RegionList bundle={bundleFixture()} />, { wrapper: withNuqsTestingAdapter() });
    expect(screen.getByText("시군을 클릭하거나 목록에서 선택하세요")).toBeInTheDocument();
  });

  it("clicking a region button pushes its code onto the region URL param", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<RegionList bundle={bundleFixture()} />, {
      wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }),
    });

    await user.click(screen.getByRole("button", { name: /춘천시/ }));

    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall?.searchParams.get("region")).toBe("51110");
    // setRegion pushes a new history entry (back/forward toggles selection).
    expect(lastCall?.options.history).toBe("push");
  });
});
