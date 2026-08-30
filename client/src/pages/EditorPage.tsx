import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api.ts';
import type { GenerationResult, SectionKey, TailoredBullet, TailoredResume } from '../types/index.ts';
import PdfPreview from '../components/PdfPreview.tsx';
import Spinner from '../components/Spinner.tsx';
import ErrorBanner from '../components/ErrorBanner.tsx';
import CritiquePanel from '../components/CritiquePanel.tsx';

const SECTION_LABELS: Record<SectionKey, string> = {
  education: 'Education',
  skills: 'Skills',
  experience: 'Experience',
  projects: 'Projects',
  workshops: 'Workshops',
  hackathons: 'Hackathons',
  certifications: 'Certifications',
  extracurricular: 'Extra Curricular',
};

type BulletOwner = 'experience' | 'projects';
type ListSection = 'workshops' | 'hackathons' | 'certifications' | 'extraCurricular';

export default function EditorPage() {
  const { generationId } = useParams<{ generationId: string }>();
  const [generation, setGeneration] = useState<GenerationResult | null>(null);
  const [resume, setResume] = useState<TailoredResume | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'saving' | 'optimizing' | 'regenerating' | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  // The additive-regenerate flow (via CritiquePanel) promises to never remove
  // content, so if the result still overflows one page, the normal overflow
  // banner's "Optimize to One Page" button — which cuts content — must not
  // be offered for it.
  const [lastUpdateWasAdditive, setLastUpdateWasAdditive] = useState(false);

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
      const groups = r[owner].map((g) =>
        g.id === groupId
          ? { ...g, bullets: g.bullets.map((b, i) => (i === bulletIndex ? { ...b, ...patch } : b)) }
          : g,
      );
      return { ...r, [owner]: groups };
    });
  };

  const removeBullet = (owner: BulletOwner, groupId: string, bulletIndex: number) => {
    setResume((r) => {
      if (!r) return r;
      const groups = r[owner].map((g) =>
        g.id === groupId ? { ...g, bullets: g.bullets.filter((_, i) => i !== bulletIndex) } : g,
      );
      return { ...r, [owner]: groups };
    });
  };

  const updateEntry = <K extends ListSection>(section: K, id: string, patch: Partial<TailoredResume[K][number]>) => {
    setResume((r) => {
      if (!r) return r;
      const list = r[section].map((e) => (e.id === id ? { ...e, ...patch } : e));
      return { ...r, [section]: list };
    });
  };

  const removeEntry = (section: ListSection, id: string) => {
    setResume((r) => {
      if (!r) return r;
      const list = r[section].filter((e) => e.id !== id);
      return { ...r, [section]: list };
    });
  };

  const updateSkillItems = (name: string, itemsText: string) => {
    setResume((r) => {
      if (!r) return r;
      const skills = r.skills.map((c) =>
        c.name === name ? { ...c, items: itemsText.split(',').map((s) => s.trim()).filter(Boolean) } : c,
      );
      return { ...r, skills };
    });
  };

  const acceptFabricatedSkill = (name: string, skill: string) => {
    setResume((r) => {
      if (!r) return r;
      const skills = r.skills.map((c) =>
        c.name === name
          ? { ...c, items: [...c.items, skill], fabricated: (c.fabricated ?? []).filter((f) => f !== skill) }
          : c,
      );
      return { ...r, skills };
    });
  };

  const rejectFabricatedSkill = (name: string, skill: string) => {
    setResume((r) => {
      if (!r) return r;
      const skills = r.skills.map((c) =>
        c.name === name ? { ...c, fabricated: (c.fabricated ?? []).filter((f) => f !== skill) } : c,
      );
      return { ...r, skills };
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
      setLastUpdateWasAdditive(false);
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
      setLastUpdateWasAdditive(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate this resume.');
    } finally {
      setBusy(null);
    }
  }

  function handleCritiquePanelUpdate(updated: GenerationResult) {
    setGeneration(updated);
    setResume(updated.tailored);
    setPreviewKey((k) => k + 1);
    setLastUpdateWasAdditive(true);
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

      {overflow && !lastUpdateWasAdditive && (
        <div className="mb-6 rounded-md border border-deny/30 bg-deny/5 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-deny font-medium">Resume exceeds one page ({generation.pageCount} pages).</span>
          <button className="btn-danger" onClick={saveAndOptimize} disabled={busy !== null}>
            Optimize to One Page
          </button>
        </div>
      )}

      {overflow && lastUpdateWasAdditive && (
        <div className="mb-6 rounded-md border border-line bg-ink/5 px-4 py-3">
          <span className="text-sm text-ink-soft">
            Everything was added — nothing was removed — but this now spans {generation.pageCount} pages. Trim
            manually below if you need it back to one page.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-8">
        {/* Left: editable content */}
        <div className="flex flex-col gap-5 scrollbar-thin">
          <CritiquePanel generation={generation} onUpdated={handleCritiquePanelUpdate} />

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
              placeholder="A two-to-three sentence professional summary…"
              className="w-full min-h-[70px] resize-y rounded-md border border-line bg-white px-3 py-2 text-sm"
            />
          </section>

          {resume.experience.length > 0 && (
            <ExperienceGroup
              title="Experience"
              owner="experience"
              items={resume.experience}
              updateBullet={updateBullet}
              removeBullet={removeBullet}
            />
          )}
          {resume.projects.length > 0 && (
            <ExperienceGroup
              title="Projects"
              owner="projects"
              items={resume.projects}
              updateBullet={updateBullet}
              removeBullet={removeBullet}
            />
          )}

          <section className="sheet p-5">
            <h2 className="font-display text-base font-semibold mb-3">Skills</h2>
            <div className="flex flex-col gap-4 text-sm">
              {resume.skills.map((cat) => (
                <div key={cat.name}>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint mb-1">{cat.name}</p>
                  <textarea
                    value={cat.items.join(', ')}
                    onChange={(e) => updateSkillItems(cat.name, e.target.value)}
                    placeholder="Comma-separated skills…"
                    rows={2}
                    className="w-full resize-y rounded-md border border-line bg-white px-2.5 py-1.5 text-sm"
                  />
                  {cat.fabricated && cat.fabricated.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cat.fabricated.map((skill) => (
                        <span
                          key={skill}
                          title="Suggested from the job description — not verified against your resume"
                          className="tag tag-neutral inline-flex items-center gap-1.5"
                        >
                          {skill}
                          <button
                            title="Add to your skills"
                            onClick={() => acceptFabricatedSkill(cat.name, skill)}
                            className="text-seal hover:underline"
                          >
                            +
                          </button>
                          <button
                            title="Dismiss suggestion"
                            onClick={() => rejectFabricatedSkill(cat.name, skill)}
                            className="text-ink-faint hover:text-deny"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {resume.workshops.length > 0 && (
            <section className="sheet p-5">
              <h2 className="font-display text-base font-semibold mb-4">Workshops</h2>
              <div className="flex flex-col gap-3">
                {resume.workshops.map((w) => (
                  <SimpleEntryRow
                    key={w.id}
                    primaryValue={w.title}
                    subtitle={[w.organizer, w.date].filter(Boolean).join(' — ')}
                    onChangePrimary={(text) => updateEntry('workshops', w.id, { title: text })}
                    onRemove={() => removeEntry('workshops', w.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {resume.hackathons.length > 0 && (
            <section className="sheet p-5">
              <h2 className="font-display text-base font-semibold mb-4">Hackathons</h2>
              <div className="flex flex-col gap-3">
                {resume.hackathons.map((h) => (
                  <SimpleEntryRow
                    key={h.id}
                    primaryValue={h.name}
                    subtitle={[h.result, h.date].filter(Boolean).join(' — ')}
                    onChangePrimary={(text) => updateEntry('hackathons', h.id, { name: text })}
                    onRemove={() => removeEntry('hackathons', h.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {resume.certifications.length > 0 && (
            <section className="sheet p-5">
              <h2 className="font-display text-base font-semibold mb-4">Certifications</h2>
              <div className="flex flex-col gap-3">
                {resume.certifications.map((c) => (
                  <SimpleEntryRow
                    key={c.id}
                    primaryValue={c.name}
                    subtitle={[c.issuer, c.date].filter(Boolean).join(' — ')}
                    onChangePrimary={(text) => updateEntry('certifications', c.id, { name: text })}
                    onRemove={() => removeEntry('certifications', c.id)}
                  />
                ))}
              </div>
            </section>
          )}

          {resume.extraCurricular.length > 0 && (
            <section className="sheet p-5">
              <h2 className="font-display text-base font-semibold mb-4">Extra Curricular</h2>
              <div className="flex flex-col gap-3">
                {resume.extraCurricular.map((e) => (
                  <SimpleEntryRow
                    key={e.id}
                    primaryValue={e.impact}
                    subtitle={[e.role, e.organization].filter(Boolean).join(' — ')}
                    pinned={e.pinned}
                    onChangePrimary={(text) => updateEntry('extraCurricular', e.id, { impact: text })}
                    onRemove={() => removeEntry('extraCurricular', e.id)}
                  />
                ))}
              </div>
            </section>
          )}
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

/** Shared row for the light-weight entry types (Workshops/Hackathons/
 *  Certifications/Extra Curricular) — an editable primary text field, a
 *  read-only subtitle, and a remove button (hidden for a pinned entry, e.g.
 *  the evidence-derived DSA-practice line, which the editor never removes). */
function SimpleEntryRow({
  primaryValue,
  subtitle,
  pinned,
  onChangePrimary,
  onRemove,
}: {
  primaryValue: string;
  subtitle: string;
  pinned?: boolean;
  onChangePrimary: (text: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <input
          value={primaryValue}
          onChange={(e) => onChangePrimary(e.target.value)}
          className="w-full rounded-md border border-line bg-white px-2 py-1 text-sm font-semibold text-ink"
        />
        {subtitle && <p className="mt-1 text-xs text-ink-faint">{subtitle}</p>}
      </div>
      {pinned ? (
        <span className="text-xs font-mono px-1.5 py-0.5 rounded border border-seal text-seal bg-seal/10" title="Always kept — evidence-derived">
          pinned
        </span>
      ) : (
        <button
          title="Remove"
          onClick={onRemove}
          className="text-xs font-mono px-1.5 py-0.5 rounded border border-line text-ink-faint hover:border-deny hover:text-deny"
        >
          remove
        </button>
      )}
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
  items: Array<{
    id: string;
    role?: string;
    name?: string;
    organization?: string;
    kind?: 'experience' | 'internship';
    certificateUrl?: string;
    bullets: TailoredBullet[];
  }>;
  updateBullet: (owner: BulletOwner, groupId: string, bulletIndex: number, patch: Partial<TailoredBullet>) => void;
  removeBullet: (owner: BulletOwner, groupId: string, bulletIndex: number) => void;
}) {
  return (
    <section className="sheet p-5">
      <h2 className="font-display text-base font-semibold mb-4">{title}</h2>
      <div className="flex flex-col gap-5">
        {items.map((item) => (
          <div key={item.id}>
            <p className="text-sm font-semibold text-ink flex items-center gap-2">
              {item.role ?? item.name}
              {item.kind === 'internship' && <span className="tag tag-neutral text-[10px] py-0">Internship</span>}
            </p>
            {(item.organization || item.certificateUrl) && (
              <p className="text-xs text-ink-faint flex items-center gap-2">
                {item.organization}
                {item.certificateUrl && (
                  <a href={item.certificateUrl} target="_blank" rel="noreferrer" className="text-seal hover:underline">
                    Certificate ↗
                  </a>
                )}
              </p>
            )}
            <div className="mt-2 flex flex-col gap-2">
              {item.bullets.map((b, i) => (
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
