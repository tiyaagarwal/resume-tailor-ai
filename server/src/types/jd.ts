/** Structured representation of a Job Description. */

export type SeniorityLevel =
  | 'internship'
  | 'entry'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'unknown';

/**
 * A domain label used to pick section ordering. Derived from the JD, never
 * from the candidate's wishes.
 */
export type RoleDomain =
  | 'ai-ml'
  | 'backend'
  | 'frontend'
  | 'fullstack'
  | 'data'
  | 'devops'
  | 'mobile'
  | 'general-swe';

export interface JobDescription {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  location?: string;
  seniority: SeniorityLevel;
  domain: RoleDomain;
  /** Skills the JD marks as required / must-have. */
  requiredSkills: string[];
  /** Skills the JD marks as preferred / nice-to-have. */
  preferredSkills: string[];
  technologies: string[];
  languages: string[];
  frameworks: string[];
  tools: string[];
  responsibilities: string[];
  qualifications: string[];
  /** Terms an ATS is most likely to key on, ranked most important first. */
  atsKeywords: string[];
  /** Jargon specific to the company's problem space, e.g. "RAG", "LLMOps". */
  domainTerminology: string[];
  rawText: string;
  sourceFileName?: string;
}

/** Every skill-like token the JD mentions, deduplicated, lowercase-keyed. */
export function jdSkillSurface(jd: JobDescription): string[] {
  const merged = [
    ...jd.requiredSkills,
    ...jd.preferredSkills,
    ...jd.technologies,
    ...jd.languages,
    ...jd.frameworks,
    ...jd.tools,
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
