import type { JobDescription } from '../types/jd.ts';
import { jdSkillSurface } from '../types/jd.ts';
import type { MasterResume, Skills } from '../types/resume.ts';
import { allSkills } from '../types/resume.ts';
import type { SectionKey, SelectionReason, TailoredSkillCategory } from '../types/tailored.ts';
import { skillKey } from '../utils/text.ts';
import { canonicalize, CANONICAL_SKILL_CATEGORY } from './taxonomy.ts';
import type { JdIndex } from './scoring.ts';
import { scoreExperience, scoreBullet, scoreProject, scoreSkill, scoreText } from './scoring.ts';

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

export interface RankedSimpleItem {
  id: string;
  relevance: number;
}

export interface RankedContent {
  experience: RankedItem[];
  projects: RankedItem[];
  skills: TailoredSkillCategory[];
  /** Skills present in the master resume but deliberately not shown. Always
   *  empty for the current template — the full skill superset is always
   *  kept — retained only so callers/tests don't need special-casing. */
  droppedSkills: string[];
  certifications: RankedSimpleItem[];
  workshops: RankedSimpleItem[];
  hackathons: RankedSimpleItem[];
  extraCurricular: RankedSimpleItem[];
  sectionOrder: SectionKey[];
  reasons: SelectionReason[];
}

/** Budgets that keep the first render close to one page. */
const BUDGET = {
  maxWorkExperience: 4,
  maxProjectsMax: 3,
  maxProjectsMin: 2,
  maxBulletsPerRole: 4,
  maxBulletsPerProject: 3,
  maxCertifications: 3,
  maxWorkshops: 2,
  maxHackathons: 2,
  maxExtraCurricular: 3,
};

/** Fixed section order per the app's current LaTeX/Overleaf template spec —
 *  no longer a JD-domain-dependent choice. */
const FIXED_SECTION_ORDER: SectionKey[] = [
  'education',
  'skills',
  'experience',
  'projects',
  'workshops',
  'hackathons',
  'certifications',
  'extracurricular',
];

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

/** The fixed order, filtered down to sections that actually have content. */
export function decideSectionOrder(hasContent: Record<SectionKey, boolean>): SectionKey[] {
  return FIXED_SECTION_ORDER.filter((k) => hasContent[k]);
}

/**
 * Keeps the FULL skill superset (never trims for space — the optimizer must
 * not touch skills either), preserving each category's item order verbatim
 * (only categories are reordered by relevance, never the items within one).
 * JD-only keywords with zero master-resume evidence are added separately, to
 * `fabricated`, by `injectJdKeywords` below.
 */
function pickSkills(master: MasterResume): TailoredSkillCategory[] {
  return master.skills.filter((c) => c.items.length > 0).map((c) => ({ name: c.name, items: [...c.items] }));
}

/** Sorts categories (never items within one) by aggregate JD relevance. */
function reorderSkillCategoriesByRelevance(
  categories: TailoredSkillCategory[],
  master: MasterResume,
  index: JdIndex,
): TailoredSkillCategory[] {
  const resumeText = [
    ...master.experience.flatMap((e) => e.bullets),
    ...master.internships.flatMap((e) => e.bullets),
    ...master.projects.flatMap((p) => [...p.bullets, ...p.technologies]),
  ].join(' ');

  const scored = categories.map((c) => {
    const relevance =
      c.name === 'Core CS'
        ? 1 // the evidence-derived DSA line is always worth keeping near the top
        : c.items.reduce((sum, item) => sum + scoreSkill(item, index, resumeText), 0) /
          Math.max(1, c.items.length);
    return { category: c, relevance };
  });
  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.map((s) => s.category);
}

/**
 * Adds JD-derived keywords with zero master-resume evidence into the
 * matching category's `fabricated` list. This is the one place this app
 * allows an unbacked claim, per an explicit user override of its default
 * truthfulness guarantee — scoped narrowly to Skills, and never applied to
 * 'Core CS' (exclusively evidence-derived).
 */
function injectJdKeywords(categories: TailoredSkillCategory[], jd: JobDescription): TailoredSkillCategory[] {
  const byName = new Map(categories.map((c) => [c.name, c]));
  const jdTerms = jdSkillSurface(jd);

  for (const term of jdTerms) {
    const canonical = canonicalize(term) ?? term;
    const category = CANONICAL_SKILL_CATEGORY[canonical];
    if (!category || category === 'Core CS') continue;

    let target = byName.get(category);
    if (!target) {
      // Only ever create one of the 9 default categories — never an
      // arbitrary/new one — when the resume has nothing in it at all yet.
      target = { name: category, items: [] };
      byName.set(category, target);
      categories.push(target);
    }

    const alreadyPresent = [...target.items, ...(target.fabricated ?? [])].some(
      (s) => skillKey(s) === skillKey(canonical),
    );
    if (alreadyPresent) continue;

    target.fabricated = target.fabricated ?? [];
    target.fabricated.push(canonical);
  }

  return categories;
}

function rankSimple<T extends { id: string }>(
  entries: T[],
  textOf: (t: T) => string,
  index: JdIndex,
  limit: number,
): RankedSimpleItem[] {
  return entries
    .map((e) => ({ id: e.id, relevance: scoreText(textOf(e), index).score }))
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

export function rankContent(master: MasterResume, jd: JobDescription, index: JdIndex): RankedContent {
  const reasons: SelectionReason[] = [];

  const buildItems = (
    entries: MasterResume['experience'],
    kind: 'experience' | 'internship',
  ): RankedItem[] =>
    entries.map((e) => {
      const s = scoreExperience(e, index);
      return {
        id: e.id,
        label: `${e.role} — ${e.organization}`,
        kind,
        relevance: s.score,
        matchedTerms: s.matchedTerms,
        bullets: rankBullets(e.bullets, e.id, index, e.endDate).slice(0, BUDGET.maxBulletsPerRole),
      } satisfies RankedItem;
    });

  const allExperience = [
    ...buildItems(master.experience, 'experience'),
    ...buildItems(master.internships, 'internship'),
  ].sort((a, b) => b.relevance - a.relevance);

  allExperience.forEach((item, i) => {
    const included = i < BUDGET.maxWorkExperience;
    reasons.push({
      itemId: item.id,
      itemLabel: item.label,
      kind: item.kind,
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
  const experience = allExperience.slice(0, BUDGET.maxWorkExperience);

  const projectsScored = master.projects
    .map((p) => {
      const s = scoreProject(p, index);
      return {
        id: p.id,
        label: p.name,
        kind: 'project' as const,
        relevance: s.score,
        matchedTerms: s.matchedTerms,
        bullets: rankBullets(p.bullets, p.id, index, p.endDate).slice(0, BUDGET.maxBulletsPerProject),
      } satisfies RankedItem;
    })
    .sort((a, b) => b.relevance - a.relevance);

  // Cap at 3; naturally never below 2 when at least 2 genuinely exist.
  const projects = projectsScored.slice(0, Math.min(BUDGET.maxProjectsMax, projectsScored.length));

  projectsScored.forEach((item, i) => {
    const included = i < projects.length;
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

  let skills = pickSkills(master);
  skills = reorderSkillCategoriesByRelevance(skills, master, index);
  skills = injectJdKeywords(skills, jd);

  const certScored = master.certifications
    .map((c) => ({ id: c.id, label: c.name, relevance: scoreSkill(c.name, index, `${c.name} ${c.issuer ?? ''}`) }))
    .sort((a, b) => b.relevance - a.relevance);
  certScored.forEach((c, i) => {
    reasons.push({
      itemId: c.id,
      itemLabel: c.label,
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
  const certifications = certScored.slice(0, BUDGET.maxCertifications).map((c) => ({ id: c.id, relevance: c.relevance }));

  const workshops = rankSimple(
    master.workshops,
    (w) => [w.title, w.organizer ?? '', w.description ?? ''].join(' '),
    index,
    BUDGET.maxWorkshops,
  );
  const hackathons = rankSimple(
    master.hackathons,
    (h) => [h.name, h.result ?? '', h.description ?? '', ...(h.technologies ?? [])].join(' '),
    index,
    BUDGET.maxHackathons,
  );

  // Achievements fold into Extra Curricular at this stage (no standalone
  // "Achievements" section in this template's fixed order).
  const extraCurricularSource = [
    ...master.extraCurricular,
    ...master.achievements.map((a) => ({ id: a.id, role: '', impact: a.text })),
  ];
  const extraCurricular = rankSimple(
    extraCurricularSource,
    (e) => [('role' in e ? e.role : ''), 'organization' in e ? e.organization ?? '' : '', e.impact].join(' '),
    index,
    BUDGET.maxExtraCurricular,
  );

  const hasContent: Record<SectionKey, boolean> = {
    education: master.education.length > 0,
    skills: skills.length > 0,
    experience: experience.length > 0,
    projects: projects.length > 0,
    workshops: workshops.length > 0,
    hackathons: hackathons.length > 0,
    certifications: certifications.length > 0,
    extracurricular: extraCurricular.length > 0,
  };
  const sectionOrder = decideSectionOrder(hasContent);

  return {
    experience,
    projects,
    skills,
    droppedSkills: [],
    certifications,
    workshops,
    hackathons,
    extraCurricular,
    sectionOrder,
    reasons,
  };
}

/**
 * Skills that exist in the master resume, are wanted by the JD, but did not
 * make the cut. Surfacing these is the difference between "you lack this" and
 * "we left this out", which the analysis dashboard must not conflate.
 * (In this template nothing is trimmed for space, so this is always empty
 * unless a future template reintroduces per-category budgets.)
 */
export function skillsOmittedButOwned(master: MasterResume, selected: Skills, index: JdIndex): string[] {
  const shown = new Set(allSkills(selected).map(skillKey));
  return allSkills(master.skills).filter((s) => {
    const key = skillKey(s);
    return !shown.has(key) && index.allSkillKeys.has(key);
  });
}

export { BUDGET };
