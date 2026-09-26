import type { Manifest } from "@/lib/indicators/types";
import type { ReleaseManifest } from "@/lib/data/release";

export interface FooterProps {
  manifest: Manifest & Partial<Pick<ReleaseManifest, "files">>;
}

/**
 * Task 5, Section C — the dashboard's full data-source footer: every named
 * source's name/link/기준일(+게시일 when it differs from 기준일), read
 * entirely from `manifest.sources` (build-indicators.ts is the single place
 * that assembles that array — see its "manifest.sources" block) — this
 * component never types a date string itself ("날짜기준 규칙": a hardcoded
 * date here would silently drift from the actual data the very first time
 * any source file is refreshed). Also states two fixed definitional
 * caveats (학교수 정의, 소규모학교 기준) that apply across every KPI on this
 * dashboard, not just one indicator — plain UI copy, not date-derived, so
 * hardcoding their wording here is fine.
 */
export default function Footer({ manifest }: FooterProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-1.5 text-[10px] text-ink-muted">
      {manifest.sources.map((source) => (
        // Fix round 2, finding 10 — `source.name` isn't guaranteed unique
        // (two different sources could coincidentally share a display
        // name); `source.url` is each pipeline source's actual identity.
        <span key={source.url} className="flex items-center gap-1" data-testid="footer-source">
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {source.providerName ? `${source.providerName} · ` : ""}{source.name}
          </a>
          <span>
            기준일 {source.referenceDate}
            {/* The leading space inside this fragment is load-bearing: JSX
                collapses the whitespace-only line break between the two
                expression containers above, so without it this used to
                render "2026-07-16(게시 2026-07-20)" with no space at all. */}
            {source.publishedAt && <> (게시 {source.publishedAt})</>}
          </span>
        </span>
      ))}
      <span data-testid="footer-school-count-definition">
        학교수 정의: 초·중·고·특수 본교, 폐교 제외(분교장 제외)
      </span>
      <span data-testid="footer-small-school-definition">소규모학교 기준: 학생수 60명 이하</span>
      {manifest.files?.["provenance.json"] && <a className="underline" href={`/data/${manifest.files["provenance.json"].path}`} target="_blank" rel="noreferrer">원자료·집계 범위·결측 보고서</a>}
    </div>
  );
}
