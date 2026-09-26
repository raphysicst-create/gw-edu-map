import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import TimeSeriesChart from "@/components/ui/TimeSeriesChart";

describe("TimeSeriesChart", () => {
  it("shows each annual value and updates the focused year's change", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart
      place="춘천시" label="학생수" unit="명" format={(value) => value.toLocaleString("ko-KR")}
      data={[{ year: 2022, value: 100 }, { year: 2023, value: 90 }, { year: 2024, value: 85 }]}
    />);
    const chart = screen.getByRole("region", { name: "춘천시 학생수 시계열 추이" });
    expect(chart).toHaveTextContent("2024년 85명");
    expect(chart).toHaveTextContent("전년 대비 −5명");
    await user.click(within(chart).getByRole("button", { name: /2023/ }));
    expect(chart).toHaveTextContent("2023년 90명");
    expect(chart).toHaveTextContent("전년 대비 −10명");
  });

  it("keeps missing years blank and expresses share changes in percentage points", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart
      place="강원 전체" label="소규모학교 비율" unit="%" format={(value) => `${value.toFixed(1)}%`}
      data={[{ year: 2022, value: 30 }, { year: 2023, value: null }, { year: 2024, value: 32 }, { year: 2025, value: 33 }]}
    />);
    const chart = screen.getByRole("region", { name: "강원 전체 소규모학교 비율 시계열 추이" });
    expect(within(chart).getByRole("button", { name: /2023/ })).toHaveTextContent("—");
    expect(chart).toHaveTextContent("전년 대비 +1.0%p");
    await user.click(within(chart).getByRole("button", { name: /2023/ }));
    expect(chart).toHaveTextContent("2023년 자료 없음");
    expect(chart).not.toHaveTextContent("2022년 대비");
  });

  it("names the actual comparison year for sparse observations and omits a delta on the first year", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart
      place="강원 전체" label="학생수" unit="명" format={(value) => value.toLocaleString("ko-KR")}
      data={[{ year: 2022, value: 100 }, { year: 2026, value: 90 }]}
    />);
    const chart = screen.getByRole("region", { name: "강원 전체 학생수 시계열 추이" });
    expect(chart).toHaveTextContent("2026년 90명");
    expect(chart).toHaveTextContent("2022년 대비 −10명");
    expect(chart).not.toHaveTextContent("전년 대비");
    await user.click(within(chart).getByRole("button", { name: /2022/ }));
    expect(chart).toHaveTextContent("2022년 100명");
    expect(chart).not.toHaveTextContent("대비");
  });

  it("shows no change when the immediately prior observation is null", () => {
    render(<TimeSeriesChart
      place="강원 전체" label="학생수" unit="명" format={(value) => value.toLocaleString("ko-KR")}
      data={[{ year: 2022, value: 100 }, { year: 2024, value: null }, { year: 2026, value: 90 }]}
    />);
    const chart = screen.getByRole("region", { name: "강원 전체 학생수 시계열 추이" });
    expect(chart).toHaveTextContent("2026년 90명");
    expect(chart).not.toHaveTextContent("2022년 대비");
    expect(chart).not.toHaveTextContent("2024년 대비");
    expect(chart).not.toHaveTextContent("전년 대비");
  });
});
