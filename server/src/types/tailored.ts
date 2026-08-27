import type {
  AchievementEntry,
  CertificationEntry,
  EducationEntry,
  PersonalInfo,
  ResumeLinks,
  SkillCategories,
} from './resume.ts';

/** Sections the renderer knows how to lay out, in Jake's Resume style. */
export type SectionKey =
  | 'summary'
  | 'education'
  | 'experience'
  | 'internship'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'achievements';

/**
 * A bullet that has survived selection. `sourceId` + `sourceIndex` point at the
 * exact bullet in the master resume it was derived from, which is what makes
 * truthfulness auditable.
 */
export interface TailoredBullet {
  text: string;
  sourceId: string;
  sourceIndex: number;
  /** Original master-resume wording, retained for the truthfulness diff. */
  original: string;
  relevance: number;
  /** User-locked bullets are never touched by regeneration. */
  locked?: boolean;
}

export interface TailoredExperience {
  id: string;
  kind: 'experience' | 'internship';
  role: string;
  organization: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: TailoredBullet[];
  relevance: number;
}

export interface TailoredProject {
  id: string;
  name: string;
  /** Rendered as "Name | Tech, Tech" in the Jake's template. */
  technologies: string[];
  bullets: TailoredBullet[];
  repoUrl?: string;
  liveUrl?: string;
  startDate?: string;
  endDate?: string;
  relevance: number;
}

export interface TailoredResume {
  masterResumeId: string;
  jobDescriptionId: string;
  personalInfo: PersonalInfo;
  links: ResumeLinks;
  summary: string;
  sectionOrder: SectionKey[];
  /** Sections the user has switched off in the editor. */
  hiddenSections: SectionKey[];
  education: EducationEntry[];
  skills: SkillCategories;
  experience: TailoredExperience[];
  internships: TailoredExperience[];
  projects: TailoredProject[];
  certifications: CertificationEntry[];
  achievements: AchievementEntry[];
}

export interface AtsScore {
  /** 0-100. Honest overlap measure; never inflated. */
  overall: number;
  skillCoverage: number;
  keywordCoverage: number;
  responsibilityAlignment: number;
  titleAlignment: number;
  matchedSkills: string[];
  matchedKeywords: string[];
  /** In the JD, genuinely absent from the master resume. Never fabricate these. */
  missingFromMasterResume: string[];
  /** In the master resume and relevant, but cut for space. */
  missingFromGeneratedResume: string[];
}

export interface SelectionReason {
  itemId: string;
  itemLabel: string;
  kind: 'experience' | 'internship' | 'project' | 'skill' | 'certification' | 'achievement';
  relevance: number;
  matchedTerms: string[];
  included: boolean;
  reason: string;
}

export interface OptimizationStep {
  pass: number;
  action: string;
  detail: string;
  pageCountBefore: number;
  pageCountAfter: number;
}

export interface LinkValidationResult {
  expectedLinks: number;
  foundLinks: number;
  validLinks: number;
  invalidLinks: Array<{ label: string; expected: string; found?: string; issue: string }>;
  status: 'PASSED' | 'FAILED';
  extracted: string[];
}

export interface GenerationResult {
  id: string;
  createdAt: string;
  masterResumeId: string;
  jobDescriptionId: string;
  jobTitle: string;
  company: string;
  tailored: TailoredResume;
  ats: AtsScore;
  reasons: SelectionReason[];
  optimization: OptimizationStep[];
  pageCount: number;
  linkValidation: LinkValidationResult;
  truthfulness: { status: 'PASSED' | 'FAILED'; violations: string[] };
  pdfPath: string;
  docxPath?: string;
  latexSource: string;
  /** Whether the Claude API or the offline heuristic engine produced this. */
  engine: 'claude' | 'heuristic';
}
