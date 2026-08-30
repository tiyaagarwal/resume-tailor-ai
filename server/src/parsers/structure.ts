import type {
  AchievementEntry,
  CertificationEntry,
  DefaultSkillCategory,
  EducationEntry,
  ExperienceEntry,
  ExtraCurricularEntry,
  HackathonEntry,
  MasterResume,
  PersonalInfo,
  ProfileLink,
  ProjectEntry,
  Skills,
  WorkshopEntry,
} from '../types/resume.ts';
import { allSkills } from '../types/resume.ts';
import { newId, nowIso } from '../utils/id.ts';
import { associateCertificateLinks, classifyLinks, findProjectLinks } from './links.ts';
import { detectDsaPracticeSignal } from './signals.ts';

/**
 * Deterministic structuring of resume text into the MasterResume schema.
 *
 * This runs unconditionally. When an Anthropic API key is present the AI
 * structurer refines the result, but the deterministic pass is what guarantees
 * the app still works offline and gives the AI a grounded starting point rather
 * than a blank page.
 */

type SectionName =
  | 'summary'
  | 'education'
  | 'experience'
  | 'internship'
  | 'projects'
  | 'skills'
  | 'certifications'
  | 'achievements'
  | 'workshops'
  | 'hackathons'
  | 'extracurricular'
  | 'unknown';

const HEADINGS: Array<{ re: RegExp; name: SectionName }> = [
  { re: /^(professional\s+)?summary$|^objective$|^about( me)?$|^profile$/i, name: 'summary' },
  { re: /^education$|^academic(s| background| qualifications)?$/i, name: 'education' },
  { re: /^(work\s+|professional\s+|relevant\s+)?experience$|^employment( history)?$/i, name: 'experience' },
  { re: /^internships?$|^internship experience$/i, name: 'internship' },
  { re: /^(personal\s+|academic\s+|key\s+)?projects$/i, name: 'projects' },
  { re: /^(technical\s+)?skills( (&|and) (interests|abilities))?$|^technologies$|^tech stack$/i, name: 'skills' },
  { re: /^certifications?$|^licenses?( (&|and) certifications?)?$|^courses$/i, name: 'certifications' },
  { re: /^achievements?$|^awards?( (&|and) achievements?)?$|^honou?rs$|^accomplishments$/i, name: 'achievements' },
  { re: /^workshops?$|^trainings?$|^bootcamps?$/i, name: 'workshops' },
  { re: /^hackathons?$/i, name: 'hackathons' },
  {
    re: /^extra[\s-]?curricular( activities)?$|^leadership( (&|and) activities)?$|^volunteer(ing)?$|^clubs?( (&|and) societies)?$/i,
    name: 'extracurricular',
  },
];

const BULLET_RE = /^\s*(?:[•·●▪◦‣▸*\u2022]|-{1,2}|\u2013|\u2014)\s+/;

/**
 * Maps a free-text skill sub-heading onto one of the app's default
 * categories. Anything that doesn't match keeps a fallback bucket named
 * after the source resume's own label (see `categoryFor`) so no skill is
 * ever silently dropped. "Core CS" is deliberately never a target here — it
 * is exclusively evidence-derived, see `detectDsaPracticeSignal`.
 */
const SKILL_CATEGORY_RULES: Array<{ re: RegExp; category: DefaultSkillCategory }> = [
  { re: /^(programming\s+)?languages?$/i, category: 'Programming' },
  { re: /^frameworks?( (&|and) libraries)?$|^librar(y|ies)$/i, category: 'Frameworks & Libraries' },
  { re: /^databases?$|^dbms$/i, category: 'Databases' },
  { re: /^(developer\s+)?tools?$|^software$|^platforms?$/i, category: 'Developer Tools & Platforms' },
  { re: /^cloud( (&|and) deployment)?$|^deployment$|^devops$/i, category: 'Cloud & Deployment' },
  {
    re: /^(ai|artificial intelligence)( (&|and) (ml|machine learning))?$|^machine learning$|^ml$|^deep learning$|^nlp$/i,
    category: 'AI Automation & Machine Learning',
  },
  { re: /^data science( (&|and) analytics)?$|^analytics$|^data analysis$/i, category: 'Data Science & Analytics' },
  { re: /^soft skills?$|^interpersonal( skills)?$/i, category: 'Soft Skills' },
];

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function categoryFor(label: string): string {
  const rule = SKILL_CATEGORY_RULES.find((r) => r.re.test(label));
  return rule ? rule.category : titleCase(label);
}

const isHeading = (line: string): SectionName | null => {
  const clean = line.replace(/[:•\-–—_|]+$/g, '').replace(/^[|\s]+/, '').trim();
  if (!clean || clean.length > 42) return null;
  // Headings are short and typically fully uppercase or title-case standalone.
  const upperish = clean === clean.toUpperCase() || /^[A-Z][a-z]+( [A-Z][a-z]+)*$/.test(clean);
  if (!upperish) return null;
  for (const h of HEADINGS) if (h.re.test(clean)) return h.name;
  return null;
};

const stripBullet = (l: string): string => l.replace(BULLET_RE, '').trim();

/** Splits a date range like "May 2025 – Jul 2025" or "2022 - 2026". */
function splitDates(s: string): { startDate?: string; endDate?: string } {
  const m = /([A-Z][a-z]{2,8}\.?\s*\d{4}|\d{4}|Present|Current)\s*[–—\-]{1,2}\s*([A-Z][a-z]{2,8}\.?\s*\d{4}|\d{4}|Present|Current)/i.exec(s);
  if (m) return { startDate: m[1].trim(), endDate: m[2].trim() };
  const single = /([A-Z][a-z]{2,8}\.?\s*\d{4}|\b(19|20)\d{2}\b)/.exec(s);
  return single ? { endDate: single[1].trim() } : {};
}

const DATE_RE = /((?:[A-Z][a-z]{2,8}\.?\s*)?\d{4}\s*[–—\-]{1,2}\s*(?:(?:[A-Z][a-z]{2,8}\.?\s*)?\d{4}|Present|Current))/i;

function splitSections(lines: string[]): Map<SectionName, string[]> {
  const out = new Map<SectionName, string[]>();
  let current: SectionName = 'unknown';
  out.set('unknown', []);
  for (const line of lines) {
    const heading = isHeading(line);
    if (heading) {
      current = heading;
      if (!out.has(current)) out.set(current, []);
      continue;
    }
    if (!out.has(current)) out.set(current, []);
    out.get(current)!.push(line);
  }
  return out;
}

function parsePersonalInfo(headerLines: string[], text: string): PersonalInfo {
  const email = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/.exec(text)?.[0] ?? '';
  // Phone numbers vary far too much for one rigid pattern (+91-98765-43210,
  // (555) 123-4567, 555.123.4567). Scan for digit-ish runs and accept the first
  // whose digit count is plausible and which isn't a year range or a GPA.
  let phone = '';
  for (const part of headerLines.join(' | ').split('|')) {
    const candidate = /[+(]?\d[\d\s().\-]{5,20}\d/.exec(part)?.[0]?.trim();
    if (!candidate) continue;
    const digits = candidate.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    if (/^(19|20)\d{2}$/.test(digits)) continue;
    phone = candidate.replace(/\s{2,}/g, ' ');
    break;
  }

  // The name is the first substantive line that isn't the contact row.
  let fullName = '';
  for (const line of headerLines) {
    const c = line.trim();
    if (!c || c.includes('@') || /https?:/i.test(c) || /\d{3}/.test(c)) continue;
    if (c.split(/\s+/).length <= 5) {
      fullName = c.replace(/\s*\|\s*/g, ' ').trim();
      break;
    }
  }

  // Location: a "City, Region" fragment on the contact row.
  let location = '';
  for (const line of headerLines) {
    for (const part of line.split('|')) {
      const p = part.trim();
      if (/@|https?:|\d{4}/.test(p)) continue;
      if (/^[A-Z][\w.'-]+(?:\s[\w.'-]+)*,\s*[A-Z][\w.'-]+/.test(p) && p.length < 60) {
        location = p;
        break;
      }
    }
    if (location) break;
  }

  return {
    fullName: fullName || 'Unknown Candidate',
    email,
    phone,
    location,
  };
}

function parseSkills(lines: string[]): Skills {
  const byName = new Map<string, string[]>();
  const addTo = (name: string, values: string[]) => {
    const arr = byName.get(name) ?? [];
    arr.push(...values);
    byName.set(name, arr);
  };

  for (const line of lines) {
    const clean = stripBullet(line);
    const m = /^([A-Za-z /&+]{3,40}?)\s*[:\-–]\s*(.+)$/.exec(clean);
    if (m) {
      const label = m[1].trim();
      const values = m[2]
        .split(/[,;|]/)
        .map((v) => v.trim().replace(/\.$/, ''))
        .filter((v) => v.length > 0 && v.length < 40);
      addTo(categoryFor(label), values);
    } else if (clean.includes(',')) {
      addTo(
        'Other',
        clean
          .split(/[,;|]/)
          .map((v) => v.trim())
          .filter((v) => v.length > 0 && v.length < 40),
      );
    }
  }
  return [...byName.entries()].map(([name, items]) => ({ name, items }));
}

const INSTITUTION_RE = /university|college|institute|school|academy/i;
const DEGREE_RE = /b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|bachelor|master|diploma|ph\.?d|doctorate|associate degree|high school/i;

function extractGpa(line: string): string | undefined {
  return /\b(?:CGPA|GPA|Percentage)\s*[:\-]?\s*([\d.]+\s*(?:\/\s*\d+)?%?)/i.exec(line)?.[1]?.trim();
}

/**
 * Education entries commonly span two source lines in Jake's-Resume-style
 * layouts — "Institution, Location" then "Degree, Dates" underneath — which a
 * naive per-line scan would misread as two separate schools. A line starting
 * a NEW entry must name an institution; a line that only names a degree (no
 * institution keyword) is treated as filling in the entry still being built,
 * never as a school of its own.
 */
function parseEducation(lines: string[]): EducationEntry[] {
  const entries: EducationEntry[] = [];

  const applyDegreeLine = (entry: EducationEntry, line: string): void => {
    const gpa = extractGpa(line);
    const { startDate, endDate } = splitDates(line);
    const parts = line.split(/\s*[—–|]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const degree =
      parts.find((p) => DEGREE_RE.test(p)) ??
      (parts[0] && !isDateOnly(parts[0]) && !/^(?:CGPA|GPA)/i.test(parts[0]) ? parts[0] : '');
    if (degree) entry.degree = degree.replace(/,\s*(CGPA|GPA).*$/i, '').replace(/,\s*\d{4}.*$/, '').trim();
    if (gpa) entry.gpa = gpa;
    entry.startDate ??= startDate;
    if (endDate) entry.endDate = endDate;
  };

  for (const raw of lines) {
    const line = stripBullet(raw);
    if (!line) continue;

    if (/^relevant coursework|^coursework/i.test(line)) {
      const list = line.split(/[:\-–]/).slice(1).join(':');
      if (entries.length > 0) {
        entries[entries.length - 1].coursework = list
          .split(/[,;]/)
          .map((c) => c.trim())
          .filter(Boolean);
      }
      continue;
    }

    const hasInstitution = INSTITUTION_RE.test(line);
    const hasDegree = DEGREE_RE.test(line);
    const last = entries[entries.length - 1];

    if (hasInstitution) {
      // A fresh institution line always starts a new entry, even if the same
      // line also happens to name the degree (the common single-line format).
      const parts = line.split(/\s*[—–|]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
      const institution = parts[0] ?? line;
      const entry: EducationEntry = {
        id: newId('edu'),
        institution: institution.replace(/,\s*[A-Z][a-z]+$/, '').trim(),
        degree: '',
        location: /,\s*([A-Z][a-z]+)$/.exec(institution)?.[1],
      };
      if (hasDegree || /\d{4}/.test(line) || /CGPA|GPA/i.test(line)) applyDegreeLine(entry, line);
      entries.push(entry);
      continue;
    }

    if (hasDegree || (last && !last.degree && (/\d{4}/.test(line) || isDateOnly(line)))) {
      // No institution keyword: this line completes whichever entry is still open.
      if (last) applyDegreeLine(last, line);
      continue;
    }
    // Neither an institution nor a degree/date line — not education content we recognise.
  }
  return entries;
}

/** Shared machinery for EXPERIENCE and INTERNSHIP blocks. */
function parseExperience(lines: string[], kind: 'experience' | 'internship'): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (BULLET_RE.test(raw)) {
      if (entries.length > 0) entries[entries.length - 1].bullets.push(stripBullet(raw));
      continue;
    }

    // A layout where the date range renders on its own line (common when a
    // right-aligned date column gets extracted as a separate paragraph) is
    // a continuation of the previous role, never a new one.
    if (isDateOnly(line)) {
      const prev = entries[entries.length - 1];
      if (prev && !prev.endDate) {
        const { startDate, endDate } = splitDates(line);
        prev.startDate ??= startDate;
        prev.endDate = endDate;
      }
      continue;
    }

    // A header line introduces a new role. It carries a date range or commas.
    const { startDate, endDate } = splitDates(line);
    const withoutDates = line.replace(DATE_RE, '').replace(/\s*[—–|]\s*$/, '').trim();
    const parts = withoutDates.split(/\s*[|—–]\s*|,\s+/).map((p) => p.trim()).filter(Boolean);

    entries.push({
      id: newId(kind === 'internship' ? 'intern' : 'exp'),
      kind,
      role: parts[0] ?? withoutDates,
      organization: parts[1] ?? '',
      location: parts[2],
      startDate,
      endDate,
      bullets: [],
      technologies: [],
    });
  }
  return entries.filter((e) => e.role && (e.bullets.length > 0 || e.organization));
}

/** True when a line/segment is nothing but a date range, e.g. "Jan 2025 -- Mar 2025". */
function isDateOnly(s: string): boolean {
  const stripped = s.replace(DATE_RE, '').trim();
  return stripped.length === 0 && DATE_RE.test(s);
}

function parseProjects(lines: string[], discovered: ProfileLink[]): ProjectEntry[] {
  const entries: ProjectEntry[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (BULLET_RE.test(raw)) {
      if (entries.length > 0) entries[entries.length - 1].bullets.push(stripBullet(raw));
      continue;
    }

    // A layout where the date range renders on its own line (common when a
    // right-aligned date column gets extracted as a separate paragraph) is
    // a continuation of the previous project, never a new one.
    if (isDateOnly(line)) {
      const prev = entries[entries.length - 1];
      if (prev && !prev.endDate) {
        const { startDate, endDate } = splitDates(line);
        prev.startDate ??= startDate;
        prev.endDate = endDate;
      }
      continue;
    }

    // "Name | Tech, Tech | Repo | Live"
    const segments = line.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
    const name = segments[0].replace(/[:,]$/, '').trim();
    if (!name || isDateOnly(name)) continue;

    const technologies: string[] = [];
    for (const seg of segments.slice(1)) {
      if (/^(repo|repository|github|code|source|live|demo|website|link)$/i.test(seg)) continue;
      if (/https?:/i.test(seg)) continue;
      if (isDateOnly(seg)) continue; // a trailing "Jan 2025 -- Mar 2025" pipe segment is the date, not a tech
      // A bare domain typed without a scheme (e.g. "github.com/user/repo" or
      // "myproject.dev") is still a URL, not a technology — resumes routinely
      // drop "https://" in the visible text since the PDF makes it a hyperlink.
      if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(seg)) continue;
      technologies.push(...seg.split(/[,/]/).map((t) => t.trim()).filter(Boolean));
    }

    const { startDate, endDate } = splitDates(line);
    entries.push({
      id: newId('proj'),
      name,
      bullets: [],
      technologies,
      startDate,
      endDate,
      ...findProjectLinks(name, discovered),
    });
  }
  return entries.filter((p) => p.bullets.length > 0 || p.technologies.length > 0);
}

function parseCertifications(lines: string[]): CertificationEntry[] {
  return lines
    .map((l) => stripBullet(l))
    .filter((l) => l.length > 3)
    .map((l) => {
      const parts = l.split(/\s*[—–|]\s*|\s+-\s+/).map((p) => p.trim());
      const date = /\b(19|20)\d{2}\b/.exec(l)?.[0];
      return {
        id: newId('cert'),
        name: parts[0].replace(/,?\s*\b(19|20)\d{2}\b\.?$/, '').trim(),
        issuer: parts[1]?.replace(/,?\s*\b(19|20)\d{2}\b\.?$/, '').trim() || undefined,
        date,
      };
    });
}

function parseAchievements(lines: string[]): AchievementEntry[] {
  return lines
    .map((l) => stripBullet(l))
    .filter((l) => l.length > 3)
    .map((l) => ({ id: newId('ach'), text: l, date: /\b(19|20)\d{2}\b/.exec(l)?.[0] }));
}

function parseWorkshops(lines: string[]): WorkshopEntry[] {
  return lines
    .map((l) => stripBullet(l))
    .filter((l) => l.length > 3)
    .map((l) => {
      const parts = l.split(/\s*[—–|]\s*|\s+-\s+/).map((p) => p.trim());
      const date = /\b(19|20)\d{2}\b/.exec(l)?.[0];
      return {
        id: newId('workshop'),
        title: parts[0].replace(/,?\s*\b(19|20)\d{2}\b\.?$/, '').trim(),
        organizer: parts[1]?.replace(/,?\s*\b(19|20)\d{2}\b\.?$/, '').trim() || undefined,
        date,
      };
    });
}

function parseHackathons(lines: string[]): HackathonEntry[] {
  const RESULT_RE = /\b(winner|1st place|first place|runner[- ]?up|finalist|participant|2nd place|3rd place)\b/i;
  return lines
    .map((l) => stripBullet(l))
    .filter((l) => l.length > 3)
    .map((l) => {
      const parts = l.split(/\s*[—–|]\s*|\s+-\s+/).map((p) => p.trim());
      const date = /\b(19|20)\d{2}\b/.exec(l)?.[0];
      return {
        id: newId('hack'),
        name: parts[0].replace(/,?\s*\b(19|20)\d{2}\b\.?$/, '').trim(),
        result: RESULT_RE.exec(l)?.[0],
        date,
      };
    });
}

function parseExtraCurricular(lines: string[]): ExtraCurricularEntry[] {
  return lines
    .map((l) => stripBullet(l))
    .filter((l) => l.length > 3)
    .map((l) => {
      const parts = l
        .split(/\s*[—–|]\s*|\s+-\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        return {
          id: newId('extra'),
          role: parts[0],
          organization: parts[1],
          impact: parts.slice(2).join(' — ') || parts[1],
        };
      }
      return { id: newId('extra'), role: '', impact: l };
    });
}

export interface StructureInput {
  text: string;
  links: ProfileLink[];
  sourceFileName: string;
}

export function structureResume(input: StructureInput): MasterResume {
  const lines = input.text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const sections = splitSections(lines);

  const header = sections.get('unknown') ?? [];
  const personalInfo = parsePersonalInfo(header.slice(0, 6), input.text);

  const summaryLines = sections.get('summary') ?? [];
  const summary = summaryLines.join(' ').trim();

  const experience = parseExperience(sections.get('experience') ?? [], 'experience');
  const internships = parseExperience(sections.get('internship') ?? [], 'internship');
  const projects = parseProjects(sections.get('projects') ?? [], input.links);
  const skills = parseSkills(sections.get('skills') ?? []);

  // An existing DSA-practice claim anywhere in the resume's own text feeds a
  // synthesized "Core CS" skill category — never fabricated with a made-up
  // count. The same signal is stashed on the returned resume so compose.ts
  // can build the (also evidence-only) Extra Curricular DSA line from the
  // identical source instead of re-deriving it separately.
  const dsaSignal = detectDsaPracticeSignal(input.text) ?? undefined;
  if (dsaSignal) {
    const topicSuffix = dsaSignal.topics ? `: ${dsaSignal.topics}` : '';
    skills.push({
      name: 'Core CS',
      items: [`Data Structures & Algorithms (${dsaSignal.count}+ problems solved${topicSuffix})`],
    });
  }

  // Technologies named inside a role's bullets are legitimate signal for
  // matching, so long as they already appear in the declared skill list.
  const declared = new Set(allSkills(skills).map((s) => s.toLowerCase()));
  const allExperience = [...experience, ...internships];
  for (const entry of allExperience) {
    const blob = entry.bullets.join(' ').toLowerCase();
    entry.technologies = [...declared].filter((d) => blob.includes(d));
  }
  associateCertificateLinks(allExperience, input.links);

  const now = nowIso();
  return {
    id: newId('master'),
    createdAt: now,
    updatedAt: now,
    sourceFileName: input.sourceFileName,
    personalInfo,
    links: classifyLinks(input.links, personalInfo.email),
    summary,
    education: parseEducation(sections.get('education') ?? []),
    skills,
    experience,
    internships,
    projects,
    certifications: parseCertifications(sections.get('certifications') ?? []),
    achievements: parseAchievements(sections.get('achievements') ?? []),
    workshops: parseWorkshops(sections.get('workshops') ?? []),
    hackathons: parseHackathons(sections.get('hackathons') ?? []),
    extraCurricular: parseExtraCurricular(sections.get('extracurricular') ?? []),
    dsaSignal,
    rawText: input.text,
    discoveredLinks: input.links,
  };
}
