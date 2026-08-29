import type { JobDescription } from '../types/jd.ts';
import type { MasterResume } from '../types/resume.ts';
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

export function composeTailoredResume(
  master: MasterResume,
  jd: JobDescription,
  ranked: RankedContent,
): TailoredResume {
  const expById = new Map(master.experience.map((e) => [e.id, e]));
  const internById = new Map(master.internships.map((e) => [e.id, e]));
  const projById = new Map(master.projects.map((p) => [p.id, p]));
  const certById = new Map(master.certifications.map((c) => [c.id, c]));
  const achById = new Map(master.achievements.map((a) => [a.id, a]));

  const experience = ranked.experience
    .map((i) => {
      const src = expById.get(i.id);
      return src ? toTailoredExperience(i, src) : null;
    })
    .filter((x): x is TailoredExperience => x !== null);

  const internships = ranked.internships
    .map((i) => {
      const src = internById.get(i.id);
      return src ? toTailoredExperience(i, src) : null;
    })
    .filter((x): x is TailoredExperience => x !== null);

  const projects = ranked.projects
    .map((i) => {
      const src = projById.get(i.id);
      return src ? toTailoredProject(i, src) : null;
    })
    .filter((x): x is TailoredProject => x !== null);

  return {
    masterResumeId: master.id,
    jobDescriptionId: jd.id,
    personalInfo: master.personalInfo,
    links: master.links,
    // The summary is off by default: on a one-page resume the space is almost
    // always worth more as an extra project or experience bullet.
    summary: '',
    sectionOrder: ranked.sectionOrder,
    hiddenSections: [],
    education: master.education,
    skills: ranked.skills,
    experience,
    internships,
    projects,
    certifications: ranked.certifications
      .map((c) => certById.get(c.id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    achievements: ranked.achievements
      .map((a) => achById.get(a.id))
      .filter((a): a is NonNullable<typeof a> => Boolean(a)),
  };
}
