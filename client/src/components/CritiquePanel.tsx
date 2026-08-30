import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api.ts';
import type { GapSuggestion, GenerationResult, MasterResumeSummary } from '../types/index.ts';
import FileDrop from './FileDrop.tsx';
import Spinner from './Spinner.tsx';
import ErrorBanner from './ErrorBanner.tsx';

/**
 * The critique -> gap-fill -> additive-regenerate refinement loop:
 * 1. Ask Claude to critique the already-generated resume against its JD.
 * 2. Point at a second (or the same, re-uploaded) master resume and search
 *    it for real content addressing the critique's improvement areas.
 * 3. Accept some suggestions and regenerate — this pass never removes
 *    anything, only tightens spacing/font to fit the additions.
 */
export default function CritiquePanel({
  generation,
  onUpdated,
}: {
  generation: GenerationResult;
  onUpdated: (generation: GenerationResult) => void;
}) {
  const [critiquing, setCritiquing] = useState(false);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);

  const [savedResumes, setSavedResumes] = useState<MasterResumeSummary[]>([]);
  const [sourceResumeId, setSourceResumeId] = useState<string>('');
  const [newResumeFile, setNewResumeFile] = useState<File | null>(null);
  const [uploadingNewResume, setUploadingNewResume] = useState(false);

  const [suggestions, setSuggestions] = useState<GapSuggestion[] | null>(null);
  const [findingGaps, setFindingGaps] = useState(false);
  const [gapsError, setGapsError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listResumes()
      .then((r) => setSavedResumes(r.resumes))
      .catch(() => {
        /* not fatal — the picker is a convenience */
      });
  }, []);

  const critique = generation.critique;

  async function runCritique() {
    setCritiquing(true);
    setCritiqueError(null);
    try {
      const { generation: updated } = await api.critique(generation.id);
      onUpdated(updated);
    } catch (err) {
      setCritiqueError(err instanceof ApiError ? err.message : 'Could not critique this resume.');
    } finally {
      setCritiquing(false);
    }
  }

  async function handleNewResumeFile(file: File) {
    setNewResumeFile(file);
    setUploadingNewResume(true);
    setGapsError(null);
    try {
      const { resume } = await api.uploadResume(file);
      setSourceResumeId(resume.id);
      setSavedResumes((prev) => [{ id: resume.id, fullName: resume.personalInfo.fullName, sourceFileName: resume.sourceFileName, createdAt: resume.createdAt }, ...prev]);
    } catch (err) {
      setGapsError(err instanceof ApiError ? err.message : 'Could not parse this resume. Please try another file.');
    } finally {
      setUploadingNewResume(false);
    }
  }

  async function findSuggestions() {
    if (!sourceResumeId) return;
    setFindingGaps(true);
    setGapsError(null);
    setSuggestions(null);
    setCheckedIds(new Set());
    try {
      const { suggestions: found } = await api.getGapSuggestions(generation.id, sourceResumeId);
      setSuggestions(found);
      setCheckedIds(new Set(found.filter((s) => !s.alreadyIncluded).map((s) => s.id)));
    } catch (err) {
      setGapsError(err instanceof ApiError ? err.message : 'Could not find suggestions from this resume.');
    } finally {
      setFindingGaps(false);
    }
  }

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function applySuggestions() {
    if (!suggestions || checkedIds.size === 0) return;
    setApplying(true);
    setApplyError(null);
    try {
      const accepted = suggestions.filter((s) => checkedIds.has(s.id));
      const { generation: updated } = await api.regenerateAdditive(generation.id, sourceResumeId, accepted);
      onUpdated(updated);
      setSuggestions(null);
      setCheckedIds(new Set());
    } catch (err) {
      setApplyError(err instanceof ApiError ? err.message : 'Could not apply these additions.');
    } finally {
      setApplying(false);
    }
  }

  const groupedByArea = suggestions
    ? (critique?.improvementAreas ?? []).map((area) => ({
        area,
        items: suggestions.filter((s) => s.areaId === area.id),
      }))
    : [];

  return (
    <section className="sheet p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-semibold">Critique &amp; Improve</h2>
        {!critique && (
          <button className="btn-secondary" onClick={runCritique} disabled={critiquing}>
            {critiquing ? <Spinner label="Critiquing…" /> : 'Critique This Resume'}
          </button>
        )}
      </div>

      {critiqueError && (
        <div className="mb-3">
          <ErrorBanner message={critiqueError} onDismiss={() => setCritiqueError(null)} />
        </div>
      )}

      {!critique && !critiquing && (
        <p className="text-sm text-ink-faint">
          Ask Claude to critique this resume against the job description — an ATS-style score, real strengths, and
          concrete gaps you can fill from another resume.
        </p>
      )}

      {critique && (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-2xl font-semibold text-ink">{critique.atsScore}</span>
            <span className="text-xs font-mono text-ink-faint uppercase tracking-wider">/ 100 — Claude's assessment</span>
            <button className="btn-ghost ml-auto text-xs" onClick={runCritique} disabled={critiquing}>
              {critiquing ? <Spinner label="Re-critiquing…" /> : 'Re-run'}
            </button>
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">{critique.summary}</p>

          {critique.strengths.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">Strengths</p>
              <ul className="flex flex-col gap-1">
                {critique.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-ink-soft flex gap-2">
                    <span className="text-approve">+</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {critique.improvementAreas.length > 0 && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1.5">Scope for improvement</p>
              <ul className="flex flex-col gap-2">
                {critique.improvementAreas.map((a) => (
                  <li key={a.id} className="rounded-md border border-line px-3 py-2">
                    <p className="text-sm font-semibold text-ink">{a.title}</p>
                    <p className="text-xs text-ink-faint mt-0.5">{a.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-3 border-t border-line flex flex-col gap-3">
            <p className="text-sm font-semibold text-ink">Find content to add</p>
            <p className="text-xs text-ink-faint -mt-2">
              Point at a bigger resume — real content only, nothing invented — and we'll find what addresses the gaps above.
            </p>

            {savedResumes.length > 0 && (
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                value={sourceResumeId}
                onChange={(e) => {
                  setSourceResumeId(e.target.value);
                  setNewResumeFile(null);
                }}
              >
                <option value="">Select a saved master resume…</option>
                {savedResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} — {r.sourceFileName}
                  </option>
                ))}
              </select>
            )}

            <FileDrop
              label="Or upload a new resume"
              hint="PDF or DOCX, up to 10 MB"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              file={newResumeFile}
              onFile={handleNewResumeFile}
              disabled={uploadingNewResume}
            />
            {uploadingNewResume && <Spinner label="Parsing…" />}

            <button className="btn-secondary" onClick={findSuggestions} disabled={!sourceResumeId || findingGaps}>
              {findingGaps ? <Spinner label="Searching…" /> : 'Find Content to Add'}
            </button>

            {gapsError && <ErrorBanner message={gapsError} onDismiss={() => setGapsError(null)} />}

            {suggestions && suggestions.length === 0 && (
              <p className="text-sm text-ink-faint">Nothing in that resume clearly addresses the gaps above.</p>
            )}

            {groupedByArea.map(({ area, items }) =>
              items.length === 0 ? null : (
                <div key={area.id}>
                  <p className="text-xs font-semibold text-ink-soft mb-1.5">{area.title}</p>
                  <div className="flex flex-col gap-1.5">
                    {items.map((s) => (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2 text-sm rounded-md border px-2.5 py-1.5 ${
                          s.alreadyIncluded ? 'border-line bg-ink/5 text-ink-faint' : 'border-line'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checkedIds.has(s.id)}
                          disabled={s.alreadyIncluded}
                          onChange={() => toggleChecked(s.id)}
                        />
                        <span className="flex-1">
                          {s.text}
                          {s.alreadyIncluded && <span className="ml-2 tag tag-neutral text-[10px]">already included</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ),
            )}

            {suggestions && suggestions.length > 0 && (
              <button className="btn-primary" onClick={applySuggestions} disabled={applying || checkedIds.size === 0}>
                {applying ? <Spinner label="Adding & regenerating…" /> : `Add Selected & Regenerate (${checkedIds.size})`}
              </button>
            )}

            {applyError && <ErrorBanner message={applyError} onDismiss={() => setApplyError(null)} />}
          </div>
        </div>
      )}
    </section>
  );
}
