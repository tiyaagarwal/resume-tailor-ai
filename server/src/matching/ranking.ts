import type { JobDescription, RoleDomain } from '../types/jd.ts';
import type { MasterResume, SkillCategories } from '../types/resume.ts';
import { allSkills, emptySkills } from '../types/resume.ts';
import type { SectionKey, SelectionReason } from '../types/tailored.ts';
import { skillKey } from '../utils/text.ts';
import type { JdIndex } from './scoring.ts';
import { scoreBullet, scoreExperience, scoreProject, scoreSkill } from './scoring.ts';

/**
 * Content ranking: decides what earns space on a single page, and in what
 * order the sections appear.
 */

export interface RankedBullet {
  text: string;
  sourceId: string;
  sourceIndex: number;
  relevance: number;
  matchedTerms: string[];
}

export interface RankedItem {
  id: string;
  label: string;
  kind: 'experience' | 'internship' | 'project';
  relevance: number;
  matchedTerms: string[];
  bullets: RankedBullet[];
}

export interface RankedContent {
  experience: RankedItem[];
  internships: RankedItem[];
  projects: RankedItem[];
  skills: SkillCategories;
  /** Skills present in the master resume but deliberately not shown. */
  droppedSkills: string[];
  certifications: Array<{ id: string; relevance: number }>;
  achievements: Array<{ id: string; relevance: number }>;
  sectionOrder: SectionKey[];
  reasons: SelectionReason[];
}

/** Budgets that keep the first render close to one page. */
const BUDGET = {
  maxExperience: 3,
  maxInternships: 2,
  maxProjects: 3,
  maxBulletsPerRole: 4,
  maxBulletsPerProject: 3,
  maxSkillsPerCategory: 12,
  maxCertifications: 3,
  maxAchievements: 3,
};

function rankBullets(
  bullets: string[],
  sourceId: string,
  index: JdIndex,
  endDate: string | undefined,
): RankedBullet[] {
  return bullets
    .map((text, i) => {
      const s = scoreBullet(text, index, endDate);
      return { text, sourceId, sourceIndex: i, relevance: s.score, matchedTerms: s.matchedTerms };
    })
    .sort((a, b) => b.relevance - a.relevance);
}

/**
 * Section order is a deliberate function of the JD's domain and the
 * candidate's own strengths — never random, and never reordered per render.
 */
export function decideSectionOrder(
  master: MasterResume,
  jd: JobDescription,
  ranked: { experience: RankedItem[]; internships: RankedItem[]; projects: RankedItem[] },
): SectionKey[] {
  const hasExperience = ranked.experience.length > 0;
  const hasInternship = ranked.internships.length > 0;
  const hasProjects = ranked.projects.length > 0;
  const hasCerts = master.certifications.length > 0;
  const hasAchievements = master.achievements.length > 0;

  // "Strong experience" means roles that are both real and *relevant to this
  // JD*. Counting roles alone would pin every resume to the same layout, since
  // a candidate's role count doesn't change between applications.
  const topExperience = ranked.experience[0]?.relevance ?? 0;
  const strongExperience =
    (ranked.experience.length >= 2 && topExperience >= 0.45) || topExperience >= 0.6;

  const skillsFirstDomains: RoleDomain[] = ['ai-ml', 'data', 'devops'];
  const skillsFirst = skillsFirstDomains.includes(jd.domain) || strongExperience;

  const order: SectionKey[] = [];
  const push = (k: SectionKey, when: boolean) => {
    if (when && !order.includes(k)) order.push(k);
  };

  if (skillsFirst) {
    // Technical-screen-heavy roles: lead with the stack, then proof of use.
    push('skills', true);
    push('experience', hasExperience);
    push('internship', hasInternship);
    push('projects', hasProjects);
    push('education', master.education.length > 0);
  } else {
    // Early-career software roles: education still carries weight up top.
    push('education', master.education.length > 0);
    push('experience', hasExperience);
    push('internship', hasInternship);
    push('projects', hasProjects);
    push('skills', true);
  }

  push('certifications', hasCerts);
  push('achievements', hasAchievements);
  return order;
}

function pickSkills(
  master: MasterResume,
  index: JdIndex,
): { skills: SkillCategories; dropped: string[] } {
  const resumeText = [
    ...master.experience.flatMap((e) => e.bullets),
    ...master.internships.flatMap((e) => e.bullets),
    ...master.projects.flatMap((p) => [...p.bullets, ...p.technologies]),
  ].join(' ');

  const out = emptySkills();
  const dropped: string[] = [];
  const categories = Object.keys(master.skills) as Array<keyof SkillCategories>;

  for (const cat of categories) {
    const scored = master.skills[cat]
      .map((s) => ({ s, score: scoreSkill(s, index, resumeText) }))
      .sort((a, b) => b.score - a.score);

    const kept = scored.slice(0, BUDGET.maxSkillsPerCategory);
    out[cat] = kept.map((k) => k.s);
    dropped.push(...scored.slice(BUDGET.maxSkillsPerCategory).map((k) => k.s));
  }
  return { skills: out, dropped };
}

export function rankContent(master: MasterResume, jd: JobDescription, index: JdIndex): RankedContent {
  const reasons: SelectionReason[] = [];

  const buildItems = (
    entries: MasterResume['experience'],
    kind: 'experience' | 'internship',
    limit: number,
  ): RankedItem[] => {
    const scored = entries
      .map((e) => {
        const s = scoreExperience(e, index);
        return {
          id: e.id,
          label: `${e.role} — ${e.organization}`,
          kind,
          relevance: s.score,
          matchedTerms: s.matchedTerms,
          bullets: rankBullets(e.bullets, e.id, index, e.endDate).slice(
            0,
            BUDGET.maxBulletsPerRole,
          ),
        } satisfies RankedItem;
      })
      .sort((a, b) => b.relevance - a.relevance);

    scored.forEach((item, i) => {
      const included = i < limit;
      reasons.push({
        itemId: item.id,
        itemLabel: item.label,
        kind,
        relevance: Math.round(item.relevance * 100),
        matchedTerms: item.matchedTerms,
        included,
        reason: included
          ? item.matchedTerms.length > 0
            ? `Matches ${item.matchedTerms.slice(0, 4).join(', ')} from the job description.`
            : 'Included as recent, relevant professional experience.'
          : 'Ranked below higher-matching entries and cut to fit one page.',
      });
    });
    return scored.slice(0, limit);
  };

  const experience = buildItems(master.experience, 'experience', BUDGET.maxExperience);
  const internships = buildItems(master.internships, 'internship', BUDGET.maxInternships);

  const projectsScored = master.projects
    .map((p) => {
      const s = scoreProject(p, index);
      return {
        id: p.id,
        label: p.name,
        kind: 'project' as const,
        relevance: s.score,
        matchedTerms: s.matchedTerms,
        bullets: rankBullets(p.bullets, p.id, index, p.endDate).slice(
          0,
          BUDGET.maxBulletsPerProject,
        ),
      } satisfies RankedItem;
    })
    .sort((a, b) => b.relevance - a.relevance);

  projectsScored.forEach((item, i) => {
    const included = i < BUDGET.maxProjects;
    reasons.push({
      itemId: item.id,
      itemLabel: item.label,
      kind: 'project',
      relevance: Math.round(item.relevance * 100),
      matchedTerms: item.matchedTerms,
      included,
      reason: included
        ? item.matchedTerms.length > 0
          ? `Demonstrates ${item.matchedTerms.slice(0, 4).join(', ')} required by this role.`
          : 'Included as supporting project work.'
        : 'Less relevant to this job description than the selected projects.',
    });
  });
  const projects = projectsScored.slice(0, BUDGET.maxProjects);

  const { skills, dropped } = pickSkills(master, index);

  const certifications = master.certifications
    .map((c) => {
      const s = scoreSkill(c.name, index, `${c.name} ${c.issuer ?? ''}`);
      return { id: c.id, relevance: s, name: c.name };
    })
    .sort((a, b) => b.relevance - a.relevance);

  certifications.forEach((c, i) => {
    reasons.push({
      itemId: c.id,
      itemLabel: c.name,
      kind: 'certification',
      relevance: Math.round(c.relevance * 100),
      matchedTerms: [],
      included: i < BUDGET.maxCertifications,
      reason:
        i < BUDGET.maxCertifications
          ? 'Relevant credential for this role.'
          : 'Lower priority than other content on a one-page resume.',
    });
  });

  const achievements = master.achievements.map((a) => ({ id: a.id, relevance: 0.5 }));

  const sectionOrder = decideSectionOrder(master, jd, { experience, internships, projects });

  return {
    experience,
    internships,
    projects,
    skills,
    droppedSkills: dropped,
    certifications: certifications.slice(0, BUDGET.maxCertifications).map((c) => ({
      id: c.id,
      relevance: c.relevance,
    })),
    achievements: achievements.slice(0, BUDGET.maxAchievements),
    sectionOrder,
    reasons,
  };
}

/**
 * Skills that exist in the master resume, are wanted by the JD, but did not
 * make the cut. Surfacing these is the difference between "you lack this" and
 * "we left this out", which the analysis dashboard must not conflate.
 */
export function skillsOmittedButOwned(
  master: MasterResume,
  selected: SkillCategories,
  index: JdIndex,
): string[] {
  const shown = new Set(allSkills(selected).map(skillKey));
  return allSkills(master.skills).filter((s) => {
    const key = skillKey(s);
    return !shown.has(key) && index.allSkillKeys.has(key);
  });
}

export { BUDGET };
