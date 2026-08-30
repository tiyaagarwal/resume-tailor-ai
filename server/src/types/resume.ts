/**
 * Structured representation of the user's Master Resume.
 * This is the single source of truth. Nothing may appear in a generated
 * resume that cannot be traced back to a field in this object — with one
 * explicit, narrow exception: Skills-section keywords sourced from the job
 * description (see `TailoredSkillCategory.fabricated` in tailored.ts).
 */

export interface ProfileLink {
  /** Visible text in the resume, e.g. "GitHub" or "github.com/jdoe" */
  label: string;
  /** The real underlying URL, e.g. "https://github.com/jdoe" */
  url: string;
  /** The line/paragraph the link was found next to, when recoverable — lets
   *  a link be associated with the specific role/entry it belongs to (e.g. a
   *  per-role completion certificate) instead of only matching by name. */
  context?: string;
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
}

/**
 * Well-known links get first-class keys because the renderer and the link
 * validator both need to reason about them specifically. Anything else lands
 * in `other` (kept as raw data; the current template renders none of it).
 */
export interface ResumeLinks {
  linkedin?: ProfileLink;
  github?: ProfileLink;
  portfolio?: ProfileLink;
  leetcode?: ProfileLink;
  other: ProfileLink[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  /** Kept verbatim as written in the master resume, e.g. "8.72/10" */
  gpa?: string;
  coursework?: string[];
}

/** Default category labels the renderer's Skills section prefers, in this
 *  order, when the master resume has content for them. Any sub-heading in
 *  the source resume that doesn't map onto one of these keeps its own
 *  verbatim label instead of being dropped. */
export const DEFAULT_SKILL_CATEGORIES = [
  'Programming',
  'Core CS',
  'Frameworks & Libraries',
  'Databases',
  'Developer Tools & Platforms',
  'Cloud & Deployment',
  'AI Automation & Machine Learning',
  'Data Science & Analytics',
  'Soft Skills',
] as const;
export type DefaultSkillCategory = (typeof DEFAULT_SKILL_CATEGORIES)[number];

export interface SkillCategory {
  /** One of DEFAULT_SKILL_CATEGORIES, or a fallback label taken verbatim
   *  from the source resume's own sub-heading when nothing matches. */
  name: string;
  items: string[];
}
export type Skills = SkillCategory[];

/** Experience and internships share a shape; `kind` discriminates them. */
export interface ExperienceEntry {
  id: string;
  kind: 'experience' | 'internship';
  role: string;
  organization: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
  /** Technologies explicitly named in the master resume for this role. */
  technologies: string[];
  /** This role's own completion-certificate URL, never a generic profile
   *  link. Omitted when no role-specific certificate exists. */
  certificateUrl?: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  /** Optional one-line descriptor rendered beside the name. */
  tagline?: string;
  bullets: string[];
  technologies: string[];
  repoUrl?: string;
  liveUrl?: string;
  startDate?: string;
  endDate?: string;
}

export interface CertificationEntry {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
  url?: string;
}

export interface AchievementEntry {
  id: string;
  text: string;
  date?: string;
  url?: string;
}

export interface WorkshopEntry {
  id: string;
  title: string;
  organizer?: string;
  date?: string;
  url?: string;
  description?: string;
}

export interface HackathonEntry {
  id: string;
  name: string;
  /** e.g. "Winner", "Finalist", "Participant" */
  result?: string;
  date?: string;
  url?: string;
  description?: string;
  technologies?: string[];
}

export interface ExtraCurricularEntry {
  id: string;
  /** Empty when this entry was folded in from an AchievementEntry. */
  role: string;
  organization?: string;
  impact: string;
  date?: string;
  /** True for the synthesized, evidence-derived DSA-practice line — the
   *  optimizer must never drop a pinned entry. */
  pinned?: boolean;
}

export interface MasterResume {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceFileName: string;
  personalInfo: PersonalInfo;
  links: ResumeLinks;
  summary: string;
  education: EducationEntry[];
  skills: Skills;
  experience: ExperienceEntry[];
  internships: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
  workshops: WorkshopEntry[];
  hackathons: HackathonEntry[];
  extraCurricular: ExtraCurricularEntry[];
  /** An existing, evidence-based DSA-practice claim found verbatim in the
   *  resume text (e.g. "300+ problems solved: arrays, trees, ..."). Never
   *  fabricated — absent when the resume makes no such claim. */
  dsaSignal?: { count: number; topics?: string };
  /** Raw extracted text, retained for auditing and re-parsing. */
  rawText: string;
  /** Every hyperlink discovered in the source document, before classification. */
  discoveredLinks: ProfileLink[];
}

/** Flattens every skill string in the resume into one deduplicated list. */
export function allSkills(skills: Skills): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const category of skills) {
    for (const s of category.items) {
      const key = s.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(s.trim());
    }
  }
  return out;
}

export function emptySkills(): Skills {
  return [];
}
