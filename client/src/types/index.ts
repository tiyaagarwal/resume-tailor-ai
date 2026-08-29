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

export interface SkillCategories {
  languages: string[];
  frameworks: string[];
  libraries: string[];
  tools: string[];
  technologies: string[];
  other: string[];
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
  skills: SkillCategories;
  experience: unknown[];
  internships: unknown[];
  projects: unknown[];
  certifications: unknown[];
  achievements: unknown[];
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

export type SectionKey =
  | 'summary'
  | 'education'
  | 'experience'
  | 'internship'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'achievements';

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
}

export interface TailoredProject {
  id: string;
  name: string;
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
  hiddenSections: SectionKey[];
  education: EducationEntry[];
  skills: SkillCategories;
  experience: TailoredExperience[];
  internships: TailoredExperience[];
  projects: TailoredProject[];
  certifications: { id: string; name: string; issuer?: string; date?: string; url?: string }[];
  achievements: { id: string; text: string; date?: string; url?: string }[];
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
