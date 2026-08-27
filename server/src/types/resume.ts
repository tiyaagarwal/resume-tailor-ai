/**
 * Structured representation of the user's Master Resume.
 * This is the single source of truth. Nothing may appear in a generated
 * resume that cannot be traced back to a field in this object.
 */

export interface ProfileLink {
  /** Visible text in the resume, e.g. "GitHub" or "github.com/jdoe" */
  label: string;
  /** The real underlying URL, e.g. "https://github.com/jdoe" */
  url: string;
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
 * in `other`.
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

export interface SkillCategories {
  languages: string[];
  frameworks: string[];
  libraries: string[];
  tools: string[];
  technologies: string[];
  /** Non-technical / domain skills that don't fit the buckets above. */
  other: string[];
}

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

export interface MasterResume {
  id: string;
  createdAt: string;
  updatedAt: string;
  sourceFileName: string;
  personalInfo: PersonalInfo;
  links: ResumeLinks;
  summary: string;
  education: EducationEntry[];
  skills: SkillCategories;
  experience: ExperienceEntry[];
  internships: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
  /** Raw extracted text, retained for auditing and re-parsing. */
  rawText: string;
  /** Every hyperlink discovered in the source document, before classification. */
  discoveredLinks: ProfileLink[];
}

/** Flattens every skill string in the resume into one deduplicated list. */
export function allSkills(skills: SkillCategories): string[] {
  const merged = [
    ...skills.languages,
    ...skills.frameworks,
    ...skills.libraries,
    ...skills.tools,
    ...skills.technologies,
    ...skills.other,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of merged) {
    const key = s.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(s.trim());
  }
  return out;
}

export function emptySkills(): SkillCategories {
  return {
    languages: [],
    frameworks: [],
    libraries: [],
    tools: [],
    technologies: [],
    other: [],
  };
}
