import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Legend from "@/components/panels/Legend";
import { paletteFor } from "@/lib/colors";
import { formatInt, formatPercent } from "@/lib/format";
import type { IndicatorDef } from "@/lib/indicators/types";

function baseDef(overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id: "students_total",
    group: "scale",
    label: "학생수",
    unit: "명",
    polarity: "neutral",
    kind: "count",
    format: formatInt,
    source: { name: "KESS 테스트 출처", url: "https://example.com/kess", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    description: "테스트용 설명입니다.",
    ...overrides,
  };
}

const TICKS = [0, 20, 40, 60, 80, 100];

describe("Legend", () => {
  it("shows the indicator's label", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByTestId("legend-indicator-label")).toHaveTextContent("학생수");
  });

  it("shows the indicator's description (Task 5, Section C)", () => {
    render(
      <Legend
        def={baseDef({ description: "테스트 설명 문구입니다." })}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(screen.getByTestId("legend-description")).toHaveTextContent("테스트 설명 문구입니다.");
  });

  it("renders 5 color swatches", () => {
    const { container } = render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(container.querySelectorAll("[data-testid='legend-swatch']")).toHaveLength(5);
  });

  it("renders each tick boundary formatted via def.format", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    for (const t of TICKS) {
      expect(screen.getByText(formatInt(t))).toBeInTheDocument();
    }
  });

  it("shows a missing-data swatch labeled 자료 없음 when hasNull is true", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull referenceDate="2026-04-01" />,
    );
    expect(screen.getByText("자료 없음")).toBeInTheDocument();
  });

  it("omits the missing-data swatch when hasNull is false", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText("자료 없음")).not.toBeInTheDocument();
  });

  it("describes the statistical color intervals", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByText(/색 구간: 등간격/)).toBeInTheDocument();
  });

  it("does not describe the removed height scale", () => {
    const { rerender } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText(/제곱근 스케일/)).not.toBeInTheDocument();

    rerender(
      <Legend
        def={baseDef({ scale: "sqrt" })}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(screen.queryByText(/제곱근 스케일/)).not.toBeInTheDocument();
  });

  it("adds a non-zero-baseline note only when the first tick isn't 0", () => {
    const { rerender } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText(/기준선/)).not.toBeInTheDocument();

    rerender(
      <Legend
        def={baseDef({ kind: "ratio", format: (v) => formatPercent(v, 1) })}
        ticks={[10, 20, 30, 40, 50, 60]}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
      />,
    );
    expect(screen.getByText(/기준선/)).toBeInTheDocument();
  });

  it("links to def.source.name at def.source.url", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    const link = screen.getByRole("link", { name: "KESS 테스트 출처" });
    expect(link).toHaveAttribute("href", "https://example.com/kess");
  });

  it("shows the given referenceDate", () => {
    render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.getByText(/2026-04-01/)).toBeInTheDocument();
  });

  it("omits the 4 학교급 swatches when schoolLevelsVisible is false/unset (no 시군 selected)", () => {
    const { container } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(container.querySelectorAll("[data-testid='legend-school-swatch']")).toHaveLength(0);
  });

  it("shows exactly 4 학교급 color swatches (초/중/고/특수) when schoolLevelsVisible", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
      />,
    );
    expect(screen.getAllByTestId("legend-school-swatch")).toHaveLength(4);
    expect(screen.getByText("초")).toBeInTheDocument();
    expect(screen.getByText("중")).toBeInTheDocument();
    expect(screen.getByText("고")).toBeInTheDocument();
    expect(screen.getByText("특수")).toBeInTheDocument();
  });

  // Task D — 학교 레이어가 점(ScatterplotLayer)에서 기둥(ColumnLayer)으로 바뀌면서,
  // 범례 스와치도 원(rounded-full)이 아니라 작은 사각형으로 바뀐다(기둥을 위에서
  // 내려다본 모양의 상징).
  it("renders 학교급 swatches as circles matching the map dots", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
      />,
    );
    for (const swatch of screen.getAllByTestId("legend-school-swatch")) {
      expect(swatch.className).toContain("rounded-full");
    }
  });

  // fix round, review finding #4: the "(특수학교는 위치 자료 없음)" caveat used
  // to render for EVERY selected region whenever schoolLevelsVisible was
  // true, even one where every school actually has a coordinate — false
  // information about that specific region. It must only show when the
  // selected region itself has at least one school with no coordinate.
  it("shows the 특수학교 위치 자료 없음 caveat when hasSchoolsWithoutLocation is true (review finding #4)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
        hasSchoolsWithoutLocation
      />,
    );
    expect(screen.getByText("(좌표 미확보 학교는 지도 점에서 제외)")).toBeInTheDocument();
  });

  // Task 6, Section C-추가 #5 — count 지표는 색 구간이 quantile(5분위)로 바뀌므로
  // 범례에 이를 명시해야 사용자가 "왜 색이 값과 등간격으로 대응하지 않는지" 오해하지
  // 않는다.
  it("adds a '색 구간: 고유값 5분위' note only when colorBuckets is 'quantile'", () => {
    const { rerender } = render(
      <Legend def={baseDef()} ticks={TICKS} palette={paletteFor("neutral")} hasNull={false} referenceDate="2026-04-01" />,
    );
    expect(screen.queryByText(/색 구간: 고유값 5분위/)).not.toBeInTheDocument();

    rerender(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        colorBuckets="quantile"
      />,
    );
    expect(screen.getByText(/색 구간: 고유값 5분위/)).toBeInTheDocument();
  });

  // Fix round 1/5, finding 4: "높이·색 모두 값에 비례" next to "색 구간: 고유값 5분위" was a
  // direct self-contradiction (claims color IS proportional to value right
  // next to a note saying it's rank-based instead).
  it("shows '높이는 값에 비례' instead of '높이·색 모두 값에 비례' when colorBuckets is 'quantile' (finding 4)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        colorBuckets="quantile"
      />,
    );
    expect(screen.getByText(/시군별 통계 색 구간/)).toBeInTheDocument();
    expect(screen.queryByText(/높이·색 모두 값에 비례/)).not.toBeInTheDocument();
  });

  it("omits the '색 구간: 고유값 5분위' note when colorBuckets is 'linear' (explicit or default)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        colorBuckets="linear"
      />,
    );
    expect(screen.queryByText(/색 구간: 고유값 5분위/)).not.toBeInTheDocument();
  });

  it("omits the 특수학교 위치 자료 없음 caveat when the selected region's schools all have coordinates (review finding #4)", () => {
    render(
      <Legend
        def={baseDef()}
        ticks={TICKS}
        palette={paletteFor("neutral")}
        hasNull={false}
        referenceDate="2026-04-01"
        schoolLevelsVisible
        hasSchoolsWithoutLocation={false}
      />,
    );
    expect(screen.queryByText("(좌표 미확보 학교는 지도 점에서 제외)")).not.toBeInTheDocument();
  });
});
