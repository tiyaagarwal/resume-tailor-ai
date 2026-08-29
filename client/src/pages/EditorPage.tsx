import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.ts';
import type { GenerationResult, SectionKey, TailoredBullet, TailoredResume } from '../types/index.ts';
import PdfPreview from '../components/PdfPreview.tsx';
import Spinner from '../components/Spinner.tsx';
import ErrorBanner from '../components/ErrorBanner.tsx';

const SECTION_LABELS: Record<SectionKey, string> = {
  summary: 'Summary',
  education: 'Education',
  experience: 'Experience',
  internship: 'Internships',
  projects: 'Projects',
  skills: 'Technical Skills',
  certifications: 'Certifications',
  achievements: 'Achievements',
};

type BulletOwner = 'experience' | 'internships' | 'projects';

export default function EditorPage() {
  const { generationId } = useParams<{ generationId: string }>();
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'optimizing' | 'regenerating' | null>(null);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    if (!generationId) return;
    api
      .getGeneration(generationId)
      .then((r) => {
        setGeneration(r.generation);
        setResume(r.generation.tailored);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load this resume.'));
  }, [generationId]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-12">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!generation || !resume) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16 flex justify-center">
        <Spinner label="Loading editor…" />
      </div>
    );
  }

  const toggleSection = (key: SectionKey) => {
    setResume((r) => {
      if (!r) return r;
      const hidden = new Set(r.hiddenSections);
      hidden.has(key) ? hidden.delete(key) : hidden.add(key);
      return { ...r, hiddenSections: [...hidden] };
    });
  };

  const updateBullet = (owner: BulletOwner, groupId: string, bulletIndex: number, patch: Partial<TailoredBullet>) => {
    setResume((r) => {
      if (!r) return r;
      const groups = r[owner].map((g: any) =>
        g.id === groupId
          ? { ...g, bullets: g.bullets.map((b: TailoredBullet, i: number) => (i === bulletIndex ? { ...b, ...patch } : b)) }
          : g,
      );
      return { ...r, [owner]: groups };
    });
  };

  const removeBullet = (owner: BulletOwner, groupId: string, bulletIndex: number) => {
    setResume((r) => {
      if (!r) return r;
      const groups = r[owner].map((g: any) =>
        g.id === groupId ? { ...g, bullets: g.bullets.filter((_: TailoredBullet, i: number) => i !== bulletIndex) } : g,
      );
      return { ...r, [owner]: groups };
    });
  };

  async function saveAndOptimize() {
    if (!resume || !generation) return;
    setBusy('optimizing');
    setError(null);
    try {
      const { generation: updated } = await api.optimize(generation.id, resume);
      setGeneration(updated);
      setResume(updated.tailored);
      setPreviewKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your changes.');
    } finally {
      setBusy(null);
    }
  }

  async function regenerateWithAi() {
    if (!resume || !generation) return;
    setBusy('regenerating');
    setError(null);
    try {
      const { generation: updated } = await api.regenerate(generation.id, resume);
      setGeneration(updated);
      setResume(updated.tailored);
      setPreviewKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate this resume.');
    } finally {
      setBusy(null);
    }
  }

  const overflow = generation.pageCount > 1;

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-seal mb-1">Resume Editor</p>
          <h1 className="font-display text-2xl font-semibold">
            {generation.jobTitle} <span className="text-ink-faint font-normal">at</span> {generation.company}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/analysis/${generation.id}`} className="btn-ghost">
            View Analysis
          </Link>
          <button className="btn-secondary" onClick={regenerateWithAi} disabled={busy !== null}>
            {busy === 'regenerating' ? <Spinner label="Regenerating…" /> : 'Regenerate with AI'}
          </button>
          <button className="btn-primary" onClick={saveAndOptimize} disabled={busy !== null}>
            {busy === 'optimizing' ? <Spinner label="Saving…" /> : 'Save & Optimize'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {overflow && (
        <div className="mb-6 rounded-md border border-deny/30 bg-deny/5 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-deny font-medium">Resume exceeds one page ({generation.pageCount} pages).</span>
          <button className="btn-danger" onClick={saveAndOptimize} disabled={busy !== null}>
            Optimize to One Page
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8">
        {/* Left: editable content */}
        <div className="flex flex-col gap-5 scrollbar-thin">
          <section className="sheet p-5">
            <h2 className="font-display text-base font-semibold mb-3">Sections</h2>
            <div className="flex flex-wrap gap-2">
              {resume.sectionOrder.map((key) => {
                const hidden = resume.hiddenSections.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleSection(key)}
                    className={`tag ${hidden ? 'tag-neutral line-through opacity-60' : 'tag-matched'}`}
                  >
                    {SECTION_LABELS[key]}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="sheet p-5">
            <h2 className="font-display text-base font-semibold mb-2">Summary</h2>
            <textarea
              value={resume.summary}
              onChange={(e) => setResume((r) => (r ? { ...r, summary: e.target.value } : r))}
              placeholder="A one-to-two sentence professional summary…"
              className="w-full min-h-[70px] resize-y rounded-md border border-line bg-white px-3 py-2 text-sm"
            />
          </section>

          {resume.experience.length > 0 && (
            <ExperienceGroup title="Experience" owner="experience" items={resume.experience} updateBullet={updateBullet} removeBullet={removeBullet} />
          )}
          {resume.internships.length > 0 && (
            <ExperienceGroup title="Internships" owner="internships" items={resume.internships} updateBullet={updateBullet} removeBullet={removeBullet} />
          )}
          {resume.projects.length > 0 && (
            <ExperienceGroup title="Projects" owner="projects" items={resume.projects} updateBullet={updateBullet} removeBullet={removeBullet} />
          )}

          <section className="sheet p-5">
            <h2 className="font-display text-base font-semibold mb-3">Technical Skills</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {(Object.keys(resume.skills) as (keyof typeof resume.skills)[]).map((cat) => (
                <div key={cat}>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">{cat}</p>
                  <p className="text-ink-soft">{resume.skills[cat].join(', ') || '—'}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-24 h-fit flex flex-col gap-3">
          <PdfPreview src={api.downloadPdfUrl(generation.id)} pageCount={generation.pageCount} refreshKey={previewKey} />
          <a className="btn-secondary justify-center" href={api.downloadDocxUrl(generation.id)} download>
            Download DOCX
          </a>
          <p className="text-xs text-ink-faint text-center leading-relaxed">
            The preview reflects the last saved version. Edit on the left, then{' '}
            <strong className="text-ink-soft">Save &amp; Optimize</strong> to update it.
          </p>
        </div>
      </div>
    </div>
  );
}

function ExperienceGroup({
  title,
  owner,
  items,
  updateBullet,
  removeBullet,
}: {
  title: string;
  owner: BulletOwner;
  items: Array<{ id: string; bullets: TailoredBullet[]; [key: string]: any }>;
  updateBullet: (owner: BulletOwner, groupId: string, bulletIndex: number, patch: Partial<TailoredBullet>) => void;
  removeBullet: (owner: BulletOwner, groupId: string, bulletIndex: number) => void;
}) {
  return (
    <section className="sheet p-5">
      <h2 className="font-display text-base font-semibold mb-4">{title}</h2>
      <div className="flex flex-col gap-5">
        {items.map((item) => (
          <div key={item.id}>
            <p className="text-sm font-semibold text-ink">{item.role ?? item.name}</p>
            {item.organization && <p className="text-xs text-ink-faint">{item.organization}</p>}
            <div className="mt-2 flex flex-col gap-2">
              {item.bullets.map((b: TailoredBullet, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  <textarea
                    value={b.text}
                    onChange={(e) => updateBullet(owner, item.id, i, { text: e.target.value })}
                    disabled={b.locked}
                    className={`flex-1 resize-y rounded-md border border-line px-2.5 py-1.5 text-sm leading-snug ${
                      b.locked ? 'bg-ink/5 text-ink-faint' : 'bg-white'
                    }`}
                    rows={2}
                  />
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button
                      title={b.locked ? 'Unlock (allow AI to rewrite)' : 'Lock (AI will never rewrite this)'}
                      onClick={() => updateBullet(owner, item.id, i, { locked: !b.locked })}
                      className={`text-xs font-mono px-1.5 py-0.5 rounded border ${
                        b.locked ? 'border-seal text-seal bg-seal/10' : 'border-line text-ink-faint hover:border-press hover:text-press'
                      }`}
                    >
                      {b.locked ? 'locked' : 'lock'}
                    </button>
                    <button
                      title="Remove bullet"
                      onClick={() => removeBullet(owner, item.id, i)}
                      className="text-xs font-mono px-1.5 py-0.5 rounded border border-line text-ink-faint hover:border-deny hover:text-deny"
                    >
                      remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
