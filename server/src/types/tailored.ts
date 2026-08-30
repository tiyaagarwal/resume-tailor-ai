import type {
  CertificationEntry,
  EducationEntry,
  ExtraCurricularEntry,
  HackathonEntry,
  PersonalInfo,
  ResumeLinks,
  WorkshopEntry,
} from './resume.ts';
import type { CritiqueResult } from './critique.ts';

/** Sections the renderer knows how to lay out, in this app's custom
 *  Overleaf-style format. 'summary' is intentionally not a member — it
 *  renders unconditionally below the header, not through the section
 *  loop. Experience and internships render together under one 'experience'
 *  key; achievements fold into 'extracurricular'. */
export type SectionKey =
  | 'education'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'workshops'
  | 'hackathons'
  | 'certifications'
  | 'extracurricular';

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
  certificateUrl?: string;
}

export interface TailoredProject {
  id: string;
  name: string;
  /** Rendered as the entry's "Overview" line when present. */
  tagline?: string;
  /** Rendered as "Name | Tech, Tech" in the Jake's template. */
  technologies: string[];
  bullets: TailoredBullet[];
  repoUrl?: string;
  liveUrl?: string;
  startDate?: string;
  endDate?: string;
  relevance: number;
}

export interface TailoredSkillCategory {
  name: string;
  items: string[];
  /** JD-derived keywords with zero master-resume evidence — the one place
   *  this app allows unbacked claims, per an explicit user override of the
   *  default truthfulness guarantee. Rendered identically to `items` (no
   *  visual distinction), tracked separately only for the ATS-gap audit
   *  trail. Never populated for the 'Core CS' category, which is
   *  exclusively evidence-derived (see MasterResume.dsaSignal). */
  fabricated?: string[];
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
  skills: TailoredSkillCategory[];
  /** Experience and internships merged into one relevance/recency-sorted
   *  array; entries stay `kind`-tagged internally for scoring/truthfulness. */
  experience: TailoredExperience[];
  projects: TailoredProject[];
  workshops: WorkshopEntry[];
  hackathons: HackathonEntry[];
  certifications: CertificationEntry[];
  /** Ranked achievements are folded in here (role: '') alongside genuine
   *  extra-curricular entries and the pinned DSA-practice line. */
  extraCurricular: ExtraCurricularEntry[];
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
  kind:
    | 'experience'
    | 'internship'
    | 'project'
    | 'skill'
    | 'certification'
    | 'workshop'
    | 'hackathon'
    | 'extracurricular';
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
  /** Set once the user runs the critique step (see ai/critique.ts). */
  critique?: CritiqueResult;
}
