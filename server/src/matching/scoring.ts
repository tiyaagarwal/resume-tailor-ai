import type { JobDescription } from '../types/jd.ts';
import { jdSkillSurface } from '../types/jd.ts';
import type { ExperienceEntry, MasterResume, ProjectEntry } from '../types/resume.ts';
import { allSkills } from '../types/resume.ts';
import { cosine, ngrams, skillKey, tokenSet, tokenize } from '../utils/text.ts';
import { canonicalize } from './taxonomy.ts';

/**
 * Relevance scoring.
 *
 * Every score is a 0..1 blend of independent signals. Nothing here writes
 * content — scoring only decides what is worth space on the page, which keeps
 * the truthfulness guarantee separable from the ranking logic.
 */

export interface ScoreBreakdown {
  score: number;
  matchedTerms: string[];
  signals: {
    skillOverlap: number;
    keywordOverlap: number;
    semantic: number;
    titleRelevance: number;
    recency: number;
  };
}

/** Pre-computed JD view, built once per generation rather than per bullet. */
export interface JdIndex {
  requiredKeys: Set<string>;
  preferredKeys: Set<string>;
  allSkillKeys: Map<string, string>;
  atsKeywordTokens: Set<string>;
  responsibilitiesText: string;
  titleTokens: Set<string>;
  domainTerms: Set<string>;
}

export function buildJdIndex(jd: JobDescription): JdIndex {
  const allSkillKeys = new Map<string, string>();
  for (const s of jdSkillSurface(jd)) allSkillKeys.set(skillKey(s), s);

  return {
    requiredKeys: new Set(jd.requiredSkills.map(skillKey)),
    preferredKeys: new Set(jd.preferredSkills.map(skillKey)),
    allSkillKeys,
    atsKeywordTokens: new Set(jd.atsKeywords.flatMap((k) => tokenize(k))),
    responsibilitiesText: [...jd.responsibilities, ...jd.qualifications].join(' '),
    titleTokens: tokenSet(jd.jobTitle),
    domainTerms: new Set(jd.domainTerminology.map((t) => t.toLowerCase())),
  };
}

/**
 * Finds which JD skills a piece of text actually demonstrates.
 * Matching is on canonical keys so "Node.js" in the resume matches "nodejs"
 * in the JD.
 */
export function matchedSkillsIn(text: string, index: JdIndex): string[] {
  const found = new Set<string>();
  const candidates = [...tokenize(text), ...ngrams(text, 2), ...ngrams(text, 3)];

  for (const c of candidates) {
    const canonical = canonicalize(c);
    const key = skillKey(canonical ?? c);
    const hit = index.allSkillKeys.get(key);
    if (hit) found.add(hit);
  }
  return [...found];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Parses a resume end-date into a recency weight in 0..1. */
export function recencyWeight(endDate?: string): number {
  if (!endDate) return 0.5;
  if (/present|current|ongoing/i.test(endDate)) return 1;
  const year = /\b(19|20)\d{2}\b/.exec(endDate)?.[0];
  if (!year) return 0.5;
  const age = new Date().getFullYear() - Number(year);
  if (age <= 0) return 1;
  if (age >= 6) return 0.3;
  return clamp01(1 - age * 0.12);
}

/**
 * Core text scorer. `technologies` are skills the master resume explicitly
 * attributes to this item, which is stronger evidence than a word appearing
 * incidentally in prose.
 */
export function scoreText(
  text: string,
  index: JdIndex,
  opts: { technologies?: string[]; endDate?: string; titleText?: string } = {},
): ScoreBreakdown {
  const combined = [text, ...(opts.technologies ?? [])].join(' ');
  const matched = matchedSkillsIn(combined, index);

  let required = 0;
  let preferred = 0;
  for (const m of matched) {
    const key = skillKey(m);
    if (index.requiredKeys.has(key)) required++;
    else if (index.preferredKeys.has(key)) preferred++;
    else required += 0.5;
  }

  // Saturating: three strong required matches is already a decisive signal.
  const skillOverlap = clamp01((required * 1.0 + preferred * 0.6) / 3);

  const textTokens = tokenSet(combined);
  let keywordHits = 0;
  for (const t of textTokens) if (index.atsKeywordTokens.has(t)) keywordHits++;
  const keywordOverlap = clamp01(keywordHits / 8);

  const semantic = clamp01(cosine(combined, index.responsibilitiesText) * 1.6);

  let titleRelevance = 0;
  if (opts.titleText) {
    const tt = tokenSet(opts.titleText);
    let hits = 0;
    for (const t of tt) if (index.titleTokens.has(t)) hits++;
    titleRelevance = clamp01(hits / Math.max(1, Math.min(3, index.titleTokens.size)));
  }

  const recency = recencyWeight(opts.endDate);

  const score = clamp01(
    skillOverlap * 0.42 +
      keywordOverlap * 0.18 +
      semantic * 0.2 +
      titleRelevance * 0.1 +
      recency * 0.1,
  );

  return {
    score,
    matchedTerms: matched,
    signals: { skillOverlap, keywordOverlap, semantic, titleRelevance, recency },
  };
}

export function scoreBullet(bullet: string, index: JdIndex, endDate?: string): ScoreBreakdown {
  return scoreText(bullet, index, { endDate });
}

export function scoreExperience(entry: ExperienceEntry, index: JdIndex): ScoreBreakdown {
  const body = [...entry.bullets, entry.role, entry.organization].join(' ');
  const base = scoreText(body, index, {
    technologies: entry.technologies,
    endDate: entry.endDate,
    titleText: entry.role,
  });
  // The strongest single bullet lifts the entry: one highly relevant
  // achievement is enough reason to keep a role on the page.
  const best = Math.max(0, ...entry.bullets.map((b) => scoreBullet(b, index, entry.endDate).score));
  return { ...base, score: clamp01(base.score * 0.7 + best * 0.3) };
}

export function scoreProject(project: ProjectEntry, index: JdIndex): ScoreBreakdown {
  const body = [project.name, project.tagline ?? '', ...project.bullets].join(' ');
  const base = scoreText(body, index, {
    technologies: project.technologies,
    endDate: project.endDate,
  });
  const best = Math.max(0, ...project.bullets.map((b) => scoreBullet(b, index, project.endDate).score));
  return { ...base, score: clamp01(base.score * 0.65 + best * 0.35) };
}

/** Skills are scored by how the JD itself weights them. */
export function scoreSkill(skill: string, index: JdIndex, resumeText: string): number {
  const key = skillKey(skill);
  let score = 0;
  if (index.requiredKeys.has(key)) score = 1;
  else if (index.preferredKeys.has(key)) score = 0.75;
  else if (index.allSkillKeys.has(key)) score = 0.6;
  else score = 0.15;

  // A skill the candidate actually used somewhere outranks a bare list entry.
  if (score > 0.15 && new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(resumeText)) {
    score = clamp01(score + 0.1);
  }
  return score;
}

/**
 * The honest ATS match score.
 *
 * Deliberately measures only real overlap between the JD and the *master
 * resume*. There is no floor, no curve and no cosmetic boost — an inflated
 * number would mislead the user about their actual fit.
 */
export function computeAtsScore(
  master: MasterResume,
  jd: JobDescription,
  index: JdIndex,
): {
  overall: number;
  skillCoverage: number;
  keywordCoverage: number;
  responsibilityAlignment: number;
  titleAlignment: number;
  matchedSkills: string[];
  missingFromMasterResume: string[];
} {
  const resumeText = [
    master.summary,
    ...allSkills(master.skills),
    // Coursework is genuine evidence: a JD asking for "data structures and
    // algorithms" is satisfied by a degree that lists them, and omitting this
    // would wrongly report those skills as absent from the candidate.
    ...master.education.flatMap((e) => [e.degree, e.institution, ...(e.coursework ?? [])]),
    ...master.experience.flatMap((e) => [e.role, e.organization, ...e.bullets]),
    ...master.internships.flatMap((e) => [e.role, e.organization, ...e.bullets]),
    ...master.projects.flatMap((p) => [p.name, ...p.technologies, ...p.bullets]),
    ...master.certifications.map((c) => `${c.name} ${c.issuer ?? ''}`),
    ...master.achievements.map((a) => a.text),
  ].join(' ');

  const resumeSkillKeys = new Set(allSkills(master.skills).map(skillKey));
  // A technology proven in a bullet counts even if it isn't in the skills list.
  for (const s of matchedSkillsIn(resumeText, index)) resumeSkillKeys.add(skillKey(s));

  const required = [...index.requiredKeys];
  const preferred = [...index.preferredKeys];

  const matchedRequired = required.filter((k) => resumeSkillKeys.has(k));
  const matchedPreferred = preferred.filter((k) => resumeSkillKeys.has(k));

  // Required skills dominate; preferred contribute at a discount.
  const reqCoverage = required.length ? matchedRequired.length / required.length : 1;
  const prefCoverage = preferred.length ? matchedPreferred.length / preferred.length : 1;
  const skillCoverage = clamp01(required.length ? reqCoverage * 0.8 + prefCoverage * 0.2 : prefCoverage);

  const resumeTokens = tokenSet(resumeText);
  const kwHits = [...index.atsKeywordTokens].filter((t) => resumeTokens.has(t));
  const keywordCoverage = index.atsKeywordTokens.size
    ? clamp01(kwHits.length / index.atsKeywordTokens.size)
    : 0;

  const responsibilityAlignment = clamp01(cosine(resumeText, index.responsibilitiesText) * 1.5);

  const roleTexts = [
    ...master.experience.map((e) => e.role),
    ...master.internships.map((e) => e.role),
  ].join(' ');
  const roleTokens = tokenSet(roleTexts);
  const titleHits = [...index.titleTokens].filter((t) => roleTokens.has(t));
  const titleAlignment = index.titleTokens.size
    ? clamp01(titleHits.length / index.titleTokens.size)
    : 0;

  const overall = Math.round(
    (skillCoverage * 0.5 +
      keywordCoverage * 0.2 +
      responsibilityAlignment * 0.2 +
      titleAlignment * 0.1) *
      100,
  );

  const matchedSkills = [...matchedRequired, ...matchedPreferred]
    .map((k) => index.allSkillKeys.get(k))
    .filter((s): s is string => Boolean(s));

  const missingFromMasterResume = [...index.allSkillKeys.entries()]
    .filter(([k]) => !resumeSkillKeys.has(k))
    .map(([, label]) => label);

  return {
    overall,
    skillCoverage: Math.round(skillCoverage * 100),
    keywordCoverage: Math.round(keywordCoverage * 100),
    responsibilityAlignment: Math.round(responsibilityAlignment * 100),
    titleAlignment: Math.round(titleAlignment * 100),
    matchedSkills,
    missingFromMasterResume,
  };
}
