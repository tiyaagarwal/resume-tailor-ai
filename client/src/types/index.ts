export interface ProfileLink {
  label: string;
  url: string;
}

export interface ResumeLinks {
  linkedin?: ProfileLink;
  github?: ProfileLink;
  portfolio?: ProfileLink;
  leetcode?: ProfileLink;
  other: ProfileLink[];
}

export interface PersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
  coursework?: string[];
}

export interface SkillCategory {
  name: string;
  items: string[];
}
export type Skills = SkillCategory[];

export interface ExperienceEntry {
  id: string;
  kind: 'experience' | 'internship';
  role: string;
  organization: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  bullets: string[];
  technologies: string[];
  certificateUrl?: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
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
  result?: string;
  date?: string;
  url?: string;
  description?: string;
  technologies?: string[];
}

export interface ExtraCurricularEntry {
  id: string;
  /** Empty when this entry was folded in from a master-resume Achievement. */
  role: string;
  organization?: string;
  impact: string;
  date?: string;
  /** True for the synthesized, evidence-derived DSA-practice line — never
   *  removable in the editor. */
  pinned?: boolean;
}

export interface MasterResumeSummary {
  id: string;
  fullName: string;
  sourceFileName: string;
  createdAt: string;
}

export interface MasterResume {
  id: string;
  createdAt: string;
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
  /** An existing, evidence-based DSA-practice claim found in the resume's
   *  own text. Never fabricated — absent when the resume makes no such claim. */
  dsaSignal?: { count: number; topics?: string };
}

export interface UploadPreview {
  fullName: string;
  email: string;
  sectionsFound: {
    education: number;
    experience: number;
    internships: number;
    projects: number;
    certifications: number;
    achievements: number;
    workshops: number;
    hackathons: number;
    extraCurricular: number;
    skills: number;
    links: number;
  };
}

export type SeniorityLevel = 'internship' | 'entry' | 'mid' | 'senior' | 'staff' | 'unknown';
export type RoleDomain = 'ai-ml' | 'backend' | 'frontend' | 'fullstack' | 'data' | 'devops' | 'mobile' | 'general-swe';

export interface JobDescription {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  location?: string;
  seniority: SeniorityLevel;
  domain: RoleDomain;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  qualifications: string[];
  atsKeywords: string[];
  domainTerminology: string[];
}

/** The custom LaTeX/Overleaf template's fixed section set. 'summary' is
 *  intentionally not a member — it renders unconditionally below the header,
 *  not through the section-toggle list. Internships render together with
 *  Experience (distinguished by each entry's `kind`); Achievements fold into
 *  Extra Curricular. */
export type SectionKey =
  | 'education'
  | 'skills'
  | 'experience'
  | 'projects'
  | 'workshops'
  | 'hackathons'
  | 'certifications'
  | 'extracurricular';

export interface TailoredBullet {
  text: string;
  sourceId: string;
  sourceIndex: number;
  original: string;
  relevance: number;
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
  tagline?: string;
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
   *  this app allows an unbacked claim, per an explicit truthfulness-guard
   *  override scoped to Skills only. Never populated for 'Core CS'. */
  fabricated?: string[];
}

export interface TailoredResume {
  masterResumeId: string;
  jobDescriptionId: string;
  personalInfo: PersonalInfo;
  links: ResumeLinks;
  summary: string;
  sectionOrder: SectionKey[];
  hiddenSections: SectionKey[];
  education: EducationEntry[];
  skills: TailoredSkillCategory[];
  /** Experience and internships merged into one relevance/recency-sorted
   *  array; entries stay `kind`-tagged. */
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
  overall: number;
  skillCoverage: number;
  keywordCoverage: number;
  responsibilityAlignment: number;
  titleAlignment: number;
  matchedSkills: string[];
  matchedKeywords: string[];
  missingFromMasterResume: string[];
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
}

export interface TruthfulnessResult {
  status: 'PASSED' | 'FAILED';
  violations: string[];
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
  truthfulness: TruthfulnessResult;
  pdfPath: string;
  docxPath?: string;
  engine: 'claude' | 'heuristic';
}

export interface HistoryEntry {
  id: string;
  jobTitle: string;
  company: string;
  createdAt: string;
  atsMatchScore: number;
  pageCount: number;
  engine: 'claude' | 'heuristic';
  linkValidationStatus: 'PASSED' | 'FAILED';
}
