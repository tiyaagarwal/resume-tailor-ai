import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.ts';
import type { GenerationResult } from '../types/index.ts';
import ScoreRing from '../components/ScoreRing.tsx';
import StatusPill from '../components/StatusPill.tsx';
import Spinner from '../components/Spinner.tsx';
import ErrorBanner from '../components/ErrorBanner.tsx';

export default function AnalysisPage() {
  const { generationId } = useParams<{ generationId: string }>();
  const navigate = useNavigate();
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generationId) return;
    api
      .getGeneration(generationId)
      .then((r) => setGeneration(r.generation))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this generation.'));
  }, [generationId]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!generation) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 flex justify-center">
        <Spinner label="Loading analysis…" />
      </div>
    );
  }

  const g = generation;
  const includedReasons = g.reasons.filter((r) => r.included);
  const excludedReasons = g.reasons.filter((r) => !r.included);

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-seal mb-1.5">Analysis Dashboard</p>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {g.jobTitle} <span className="text-ink-faint font-normal">at</span> {g.company}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <StatusPill status={g.linkValidation.status}>links {g.linkValidation.status.toLowerCase()}</StatusPill>
            <StatusPill status={g.truthfulness.status}>truthfulness {g.truthfulness.status.toLowerCase()}</StatusPill>
            <span className="tag-neutral">{g.pageCount === 1 ? 'Page 1 of 1' : `${g.pageCount} pages`}</span>
            <span className="tag-neutral">engine: {g.engine}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary" onClick={() => navigate(`/editor/${g.id}`)}>
            Open Editor
          </button>
          <a className="btn-primary" href={api.downloadPdfUrl(g.id)} download>
            Download PDF
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
        <div className="sheet p-6 flex flex-col items-center gap-4 h-fit">
          <ScoreRing score={g.ats.overall} size={128} />
          <div className="w-full space-y-2 text-xs font-mono">
            <ScoreBar label="Skills" value={g.ats.skillCoverage} />
            <ScoreBar label="Keywords" value={g.ats.keywordCoverage} />
            <ScoreBar label="Responsibilities" value={g.ats.responsibilityAlignment} />
            <ScoreBar label="Title match" value={g.ats.titleAlignment} />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="sheet p-6">
            <h2 className="font-display text-lg font-semibold mb-3">Matching skills &amp; keywords</h2>
            <div className="flex flex-wrap gap-1.5">
              {g.ats.matchedSkills.length === 0 && <span className="text-sm text-ink-faint">None detected.</span>}
              {g.ats.matchedSkills.map((s) => (
                <span key={s} className="tag-matched">
                  {s}
                </span>
              ))}
            </div>
          </section>

          <section className="sheet p-6">
            <h2 className="font-display text-lg font-semibold mb-1">Missing from your master resume</h2>
            <p className="text-sm text-ink-faint mb-3">
              The job description wants these, and your master resume genuinely doesn't show them. We never fabricate these.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {g.ats.missingFromMasterResume.length === 0 ? (
                <span className="text-sm text-approve">Nothing — strong coverage.</span>
              ) : (
                g.ats.missingFromMasterResume.map((s) => (
                  <span key={s} className="tag-missing">
                    {s}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="sheet p-6">
            <h2 className="font-display text-lg font-semibold mb-1">Missing from the generated resume</h2>
            <p className="text-sm text-ink-faint mb-3">
              You have these — they were cut to keep the resume to one page, not because they're irrelevant.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {g.ats.missingFromGeneratedResume.length === 0 ? (
                <span className="text-sm text-ink-faint">Nothing was cut.</span>
              ) : (
                g.ats.missingFromGeneratedResume.map((s) => (
                  <span key={s} className="tag-neutral">
                    {s}
                  </span>
                ))
              )}
            </div>
          </section>

          <section className="sheet p-6">
            <h2 className="font-display text-lg font-semibold mb-4">Why this content was selected</h2>
            <div className="flex flex-col gap-3">
              {includedReasons.map((r) => (
                <ReasonRow key={r.itemId} reason={r} />
              ))}
            </div>
            {excludedReasons.length > 0 && (
              <details className="mt-4">
                <summary className="text-sm font-mono text-ink-faint cursor-pointer select-none">
                  {excludedReasons.length} item(s) cut to fit one page
                </summary>
                <div className="flex flex-col gap-3 mt-3">
                  {excludedReasons.map((r) => (
                    <ReasonRow key={r.itemId} reason={r} />
                  ))}
                </div>
              </details>
            )}
          </section>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link to="/" className="text-sm font-mono text-press hover:underline">
          ← Start a new tailored resume
        </Link>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-0.5">
        <span className="text-ink-faint">{label}</span>
        <span className="text-ink-soft">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-line overflow-hidden">
        <div className="h-full bg-press rounded-full" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReasonRow({ reason }: { reason: GenerationResult['reasons'][number] }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink truncate">{reason.itemLabel}</span>
          <span className="tag-neutral shrink-0">{reason.kind}</span>
        </div>
        <p className="text-xs text-ink-faint mt-0.5">{reason.reason}</p>
      </div>
      <span className="font-mono text-xs text-ink-soft shrink-0 pt-0.5">{reason.relevance}%</span>
    </div>
  );
}
