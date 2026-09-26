"use client";
import type { ReleaseManifest } from "@/lib/data/release";
import { INDICATORS } from "@/lib/indicators/registry";
import { EDUCATION_ISSUES } from "@/lib/issues/registry";

export function IssueAvailability({ manifest, selected, onSelect }: { manifest: ReleaseManifest; selected?: string | null; onSelect?: (id: string) => void }) {
  return <section aria-label="교육문제 제공 상태" className="space-y-3">
    <h2 className="font-semibold">교육문제 10개 주제</h2>
    <ul className="space-y-2">{EDUCATION_ISSUES.map(issue => {
      const state = manifest.issues[issue.id];
      return <li key={issue.id} className="rounded-lg border border-line p-3 text-sm">
        {onSelect ? <button type="button" className="min-h-11 text-left font-semibold" aria-pressed={selected === issue.id} onClick={() => onSelect(issue.id)}>{issue.title}</button> : <h3 className="font-semibold">{issue.title}</h3>}
        <p className="text-xs text-ink-muted">{state.status === "available" ? `${state.referenceDate} · ${state.scope}` : `미제공 · ${state.reason}`}</p>
      </li>;
    })}</ul>
  </section>;
}

export function DataAvailability({ manifest }: { manifest: ReleaseManifest }) {
  return <main className="relative z-10 min-h-0 flex-1 overflow-y-auto bg-paper p-4 pt-48 text-ink lg:pt-36">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2"><h1 className="text-xl font-semibold">강원 교육지도 자료 준비 중</h1>
        <p className="text-sm text-ink-muted">개인이 만든 업무 참고용 도구입니다. 공식 원자료의 범위와 출처를 확인한 뒤 공개합니다.</p>
        <p className="text-sm">{manifest.features.schools.status === "unavailable" && manifest.features.schools.reason} {manifest.features.regions.status === "unavailable" && manifest.features.regions.reason}</p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-label="지표 제공 상태" className="space-y-3"><h2 className="font-semibold">교육지표 18개</h2>
          <ul className="space-y-2">{INDICATORS.map(indicator => {
            const state = manifest.indicators[indicator.id];
            return <li key={indicator.id} className="rounded-lg border border-line p-3 text-sm"><h3 className="font-semibold">{indicator.label}</h3><p className="text-xs text-ink-muted">{state.status === "available" ? state.scope : `미제공 · ${state.reason}`}</p></li>;
          })}</ul>
        </section>
        <IssueAvailability manifest={manifest} />
      </div>
    </div>
  </main>;
}
