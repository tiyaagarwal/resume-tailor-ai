import type { JobDescription } from '../types/jd.ts';
import type { ExtraCurricularEntry, MasterResume } from '../types/resume.ts';
import type { RankedContent, RankedItem } from '../matching/ranking.ts';
import type { TailoredExperience, TailoredProject, TailoredResume } from '../types/tailored.ts';

/**
 * Assembles a renderable TailoredResume from ranked master-resume content.
 *
 * Every field is copied from the master resume. This step performs selection
 * and ordering only — no text is invented here, and AI rewriting happens later
 * against this grounded baseline.
 */

function toTailoredExperience(
  item: RankedItem,
  source: MasterResume['experience'][number],
): TailoredExperience {
  return {
    id: source.id,
    kind: source.kind,
    role: source.role,
    organization: source.organization,
    location: source.location,
    startDate: source.startDate,
    endDate: source.endDate,
    relevance: item.relevance,
    certificateUrl: source.certificateUrl,
    bullets: item.bullets.map((b) => ({
      text: b.text,
      sourceId: b.sourceId,
      sourceIndex: b.sourceIndex,
      original: source.bullets[b.sourceIndex] ?? b.text,
      relevance: b.relevance,
    })),
  };
}

function toTailoredProject(
  item: RankedItem,
  source: MasterResume['projects'][number],
): TailoredProject {
  return {
    id: source.id,
    name: source.name,
    tagline: source.tagline,
    technologies: source.technologies,
    repoUrl: source.repoUrl,
    liveUrl: source.liveUrl,
    startDate: source.startDate,
    endDate: source.endDate,
    relevance: item.relevance,
    bullets: item.bullets.map((b) => ({
      text: b.text,
      sourceId: b.sourceId,
      sourceIndex: b.sourceIndex,
      original: source.bullets[b.sourceIndex] ?? b.text,
      relevance: b.relevance,
    })),
  };
}

/** Builds the evidence-derived DSA-practice Extra Curricular line, using the
 *  exact same signal already synthesized into Skills -> Core CS at parse
 *  time (see parsers/signals.ts) — never re-derived, never fabricated. */
function buildDsaExtraCurricularLine(master: MasterResume): ExtraCurricularEntry | null {
  if (!master.dsaSignal) return null;
  const topicSuffix = master.dsaSignal.topics ? ` across ${master.dsaSignal.topics}` : '';
  return {
    id: `${master.id}-dsa-extracurricular`,
    role: '',
    impact: `Solved ${master.dsaSignal.count}+ DSA problems${topicSuffix}.`,
    pinned: true,
  };
}

export function composeTailoredResume(
  master: MasterResume,
  jd: JobDescription,
  ranked: RankedContent,
): TailoredResume {
  const expById = new Map(master.experience.map((e) => [e.id, e]));
  const internById = new Map(master.internships.map((e) => [e.id, e]));
  const projById = new Map(master.projects.map((p) => [p.id, p]));
  const certById = new Map(master.certifications.map((c) => [c.id, c]));
  const workshopById = new Map(master.workshops.map((w) => [w.id, w]));
  const hackathonById = new Map(master.hackathons.map((h) => [h.id, h]));
  const extraById = new Map<string, ExtraCurricularEntry>([
    ...master.extraCurricular.map((e) => [e.id, e] as const),
    ...master.achievements.map((a) => [a.id, { id: a.id, role: '', impact: a.text, date: a.date }] as const),
  ]);

  const experience = ranked.experience
    .map((i) => {
      const src = i.kind === 'internship' ? internById.get(i.id) : expById.get(i.id);
      return src ? toTailoredExperience(i, src) : null;
    })
    .filter((x): x is TailoredExperience => x !== null);

  const projects = ranked.projects
    .map((i) => {
      const src = projById.get(i.id);
      return src ? toTailoredProject(i, src) : null;
    })
    .filter((x): x is TailoredProject => x !== null);

  const extraCurricular = ranked.extraCurricular
    .map((e) => extraById.get(e.id))
    .filter((e): e is ExtraCurricularEntry => Boolean(e));
  const dsaLine = buildDsaExtraCurricularLine(master);
  if (dsaLine) extraCurricular.push(dsaLine);

  return {
    masterResumeId: master.id,
    jobDescriptionId: jd.id,
    personalInfo: master.personalInfo,
    links: master.links,
    // The deterministic baseline leaves the summary empty — only the Claude
    // tailoring step (ai/tailor.ts) writes real summary prose, since a
    // summary is text generation, not selection/ordering.
    summary: '',
    sectionOrder: ranked.sectionOrder,
    hiddenSections: [],
    education: master.education,
    skills: ranked.skills,
    experience,
    projects,
    workshops: ranked.workshops
      .map((w) => workshopById.get(w.id))
      .filter((w): w is NonNullable<typeof w> => Boolean(w)),
    hackathons: ranked.hackathons
      .map((h) => hackathonById.get(h.id))
      .filter((h): h is NonNullable<typeof h> => Boolean(h)),
    certifications: ranked.certifications
      .map((c) => certById.get(c.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    extraCurricular,
  };
}
