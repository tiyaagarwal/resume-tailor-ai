import type { JobDescription, RoleDomain, SeniorityLevel } from '../types/jd.ts';
import { canonicalize, detectSkills } from '../matching/taxonomy.ts';
import { badRequest } from '../utils/errors.ts';
import { newId, nowIso } from '../utils/id.ts';
import { collapseWhitespace, ngrams, normalize, tokenize } from '../utils/text.ts';

/**
 * Deterministic Job Description analysis.
 *
 * Runs before (and independently of) Claude so the pipeline degrades cleanly
 * without an API key, and so the AI has a grounded skeleton to refine.
 */

const REQUIRED_CUES =
  /\b(required|requirements?|must[-\s]have|minimum qualifications?|basic qualifications?|you (will )?(need|have)|we require)\b/i;
const PREFERRED_CUES =
  /\b(preferred|nice[-\s]to[-\s]have|bonus|plus|desired|preferred qualifications?|good to have|advantage)\b/i;
const RESPONSIBILITY_CUES =
  /\b(responsibilities|what you.{0,4}ll do|the role|about the role|your impact|day[-\s]to[-\s]day|duties|you will)\b/i;
const QUALIFICATION_CUES =
  /\b(qualifications?|about you|who you are|skills? (&|and) experience|education)\b/i;

const BULLET_RE = /^\s*(?:[•·●▪◦‣▸*\u2022]|-{1,2}|\d+[.)])\s+/;

const DOMAIN_SIGNALS: Array<{ domain: RoleDomain; re: RegExp; weight: number }> = [
  { domain: 'ai-ml', re: /\b(machine learning|ml engineer|ai\/ml|deep learning|nlp|computer vision|llm|generative ai|data scien|pytorch|tensorflow|model training|mlops)\b/gi, weight: 3 },
  { domain: 'backend', re: /\b(backend|back[-\s]end|server[-\s]side|api|microservice|distributed system|database|scalab|spring boot|django|node\.js)\b/gi, weight: 2 },
  { domain: 'frontend', re: /\b(frontend|front[-\s]end|ui engineer|react|angular|vue|css|responsive|user interface|web accessibility)\b/gi, weight: 2 },
  { domain: 'fullstack', re: /\b(full[-\s]?stack|end[-\s]to[-\s]end (development|features))\b/gi, weight: 3 },
  { domain: 'data', re: /\b(data engineer|etl|data pipeline|data warehouse|spark|airflow|analytics engineer|snowflake)\b/gi, weight: 3 },
  { domain: 'devops', re: /\b(devops|sre|site reliability|infrastructure|kubernetes|terraform|ci\/cd|platform engineer)\b/gi, weight: 3 },
  { domain: 'mobile', re: /\b(android|ios|mobile (app|developer|engineer)|react native|flutter|swift|kotlin)\b/gi, weight: 3 },
];

function detectDomain(text: string): RoleDomain {
  const scores = new Map<RoleDomain, number>();
  // The first few lines carry the job title. A backend JD legitimately mentions
  // Kubernetes and CI/CD, so body keywords alone would misread it as DevOps —
  // the title region gets a heavy multiplier to settle exactly that case.
  const header = text.split('\n').slice(0, 4).join('\n');

  for (const s of DOMAIN_SIGNALS) {
    const hits = text.match(s.re)?.length ?? 0;
    if (hits > 0) scores.set(s.domain, (scores.get(s.domain) ?? 0) + hits * s.weight);
    const headerHits = header.match(s.re)?.length ?? 0;
    if (headerHits > 0) scores.set(s.domain, (scores.get(s.domain) ?? 0) + headerHits * 10);
  }
  if (scores.size === 0) return 'general-swe';

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  // Strong backend AND frontend signal means full-stack, regardless of which
  // one edged ahead on raw counts.
  const be = scores.get('backend') ?? 0;
  const fe = scores.get('frontend') ?? 0;
  if (be > 0 && fe > 0 && Math.min(be, fe) >= Math.max(be, fe) * 0.5) {
    if ((scores.get('ai-ml') ?? 0) < Math.max(be, fe)) return 'fullstack';
  }
  return ranked[0][0];
}

function detectSeniority(text: string): SeniorityLevel {
  const t = text.toLowerCase();
  if (/\bintern(ship)?\b/.test(t) && !/\binterns? report\b/.test(t)) return 'internship';
  if (/\b(staff|principal|distinguished)\s+(software\s+)?engineer\b/.test(t)) return 'staff';
  if (/\b(senior|sr\.?|lead)\s+(software\s+|ml\s+|data\s+)?engineer\b|\bsenior\b/.test(t)) return 'senior';
  if (/\b(entry[-\s]level|new grad|graduate|junior|jr\.?|0-2 years|university grad)\b/.test(t)) return 'entry';
  // Years-of-experience is the most reliable remaining signal.
  const years = /\b(\d{1,2})\s*(?:\+|-\s*\d{1,2})?\s*(?:\+)?\s*years?\b/.exec(t)?.[1];
  if (years) {
    const n = Number(years);
    if (n <= 2) return 'entry';
    if (n <= 5) return 'mid';
    return 'senior';
  }
  return 'unknown';
}

function extractJobTitle(lines: string[], text: string): string {
  // Real titles routinely stack more than one qualifier ("Backend Software
  // Engineer", "Senior Full Stack JavaScript Developer"), so the qualifier
  // group repeats rather than matching only a single word.
  const TITLE_RE =
    /\b((?:senior|staff|principal|lead|junior|entry[-\s]level)?\s*(?:(?:software|ml|machine learning|ai|data|backend|back[-\s]end|frontend|front[-\s]end|full[-\s]?stack|devops|platform|mobile|android|ios|research|javascript|python|cloud|security|infrastructure|product|qa)\s+){0,2}(?:engineer|developer|scientist|architect|intern|analyst)(?:\s*[-,]?\s*(?:i{1,3}|[123]))?)\b/i;

  const labelled = /(?:job title|position|role)\s*[:\-]\s*(.{3,70})/i.exec(text)?.[1];
  if (labelled) return cleanTitle(labelled);

  // Otherwise the earliest line that looks like a title wins.
  for (const line of lines.slice(0, 12)) {
    if (line.length > 90) continue;
    const m = TITLE_RE.exec(line);
    if (m) return cleanTitle(m[0].trim().length < 6 ? line : m[0]);
  }
  const anywhere = TITLE_RE.exec(text);
  return anywhere ? cleanTitle(anywhere[0]) : 'Software Engineer';
}

function cleanTitle(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[-–—:\s]+|[-–—:,.\s]+$/g, '')
    .split(/\s*[|(]\s*/)[0]
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function extractCompany(lines: string[], text: string): string {
  // Case-insensitive, and the label must be a whole word: an unanchored "at"
  // matches inside ordinary words and hijacks the result.
  const labelled = /\b(?:company|organi[sz]ation|employer)\b\s*[:\-]\s*([A-Z][\w.&' -]{1,40})/i.exec(text)?.[1];
  if (labelled) return cleanCompany(labelled);

  const about = /\babout\s+([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\b/.exec(text)?.[1];
  if (about && !/^(the|us|this|our|the role|the team)$/i.test(about)) return cleanCompany(about);

  const at = /\b(?:at|join)\s+([A-Z][\w.&'-]+(?:\s(?:[A-Z][\w.&'-]+|Inc\.?|Corp\.?|Labs?|Technologies))?)\b/.exec(text)?.[1];
  if (at) return cleanCompany(at);

  // A leading "X — Y" line is usually "Company — Role", but it is just as often
  // "Role — Team". Only accept it when the leading fragment is not itself a
  // job title, otherwise we would label the company "Backend Engineer".
  for (const line of lines.slice(0, 6)) {
    const m = /^([A-Z][\w.&'-]+(?:\s[A-Z][\w.&'-]+){0,2})\s*(?:[-–—|]|is hiring)/.exec(line.trim());
    if (m && !TITLE_WORDS.test(m[1])) return cleanCompany(m[1]);
  }
  return 'Unknown Company';
}

const TITLE_WORDS =
  /\b(engineer|developer|scientist|architect|intern|analyst|manager|designer|backend|frontend|full[-\s]?stack|senior|junior|lead|staff|principal)\b/i;

function cleanCompany(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[,.;:\-\s]+$/g, '')
    .replace(/\b(is hiring|careers|jobs)\b.*$/i, '')
    .trim();
}

/** Splits the JD into labelled blocks using its own headings. */
function collectByCue(lines: string[], cue: RegExp, stopCues: RegExp[]): string[] {
  const out: string[] = [];
  let capturing = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isHeadingLine = line.length < 80;
    if (isHeadingLine && cue.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && isHeadingLine && stopCues.some((s) => s.test(line)) && !cue.test(line)) {
      capturing = false;
      continue;
    }
    if (capturing) out.push(line.replace(BULLET_RE, '').trim());
  }
  return out.filter((l) => l.length > 8);
}

/** Ranks ATS keywords by frequency, favouring recognised technologies. */
function rankAtsKeywords(text: string, skills: string[], title: string): string[] {
  const freq = new Map<string, number>();
  const bump = (term: string, by: number) => {
    const key = term.trim();
    if (key.length < 2) return;
    freq.set(key, (freq.get(key) ?? 0) + by);
  };

  for (const s of skills) bump(s, 12);
  for (const w of tokenize(title)) {
    const c = canonicalize(w);
    bump(c ?? w, 8);
  }
  for (const t of tokenize(text)) {
    const c = canonicalize(t);
    if (c) bump(c, 2);
    else if (t.length > 4) bump(t, 1);
  }
  for (const g of ngrams(text, 2)) {
    const c = canonicalize(g);
    if (c) bump(c, 3);
  }

  return [...freq.entries()]
    .filter(([term, count]) => count >= 2 || skills.includes(term))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40)
    .map(([term]) => term);
}

/** Domain jargon: capitalised or hyphenated terms that aren't known tech. */
function extractDomainTerminology(text: string, skills: string[]): string[] {
  const known = new Set(skills.map((s) => s.toLowerCase()));
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Z][a-zA-Z]{2,}(?:[ -][A-Z][a-zA-Z]{2,}){0,2})\b/g)) {
    const term = m[1];
    if (known.has(term.toLowerCase())) continue;
    if (/^(The|This|We|You|Our|And|For|With|About|Job|Role|Team|What|Who|Why|How|Your|Their|Must|Should)\b/.test(term)) continue;
    counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t]) => t);
}

export function analyzeJobDescription(rawText: string, sourceFileName?: string): JobDescription {
  const text = collapseWhitespace(rawText);
  if (normalize(text).length < 60) {
    throw badRequest(
      'This job description is too short to analyse. Please paste the full posting (responsibilities and requirements included).',
    );
  }

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const allSkills = detectSkills(text);

  const stopCues = [REQUIRED_CUES, PREFERRED_CUES, RESPONSIBILITY_CUES, QUALIFICATION_CUES];
  const requiredBlock = collectByCue(lines, REQUIRED_CUES, stopCues).join('\n');
  const preferredBlock = collectByCue(lines, PREFERRED_CUES, stopCues).join('\n');

  const preferredSkills = detectSkills(preferredBlock);
  const preferredSet = new Set(preferredSkills);
  // Anything detected in the required block, or anywhere if the JD has no
  // explicit required section, counts as required unless marked preferred.
  const requiredDetected = requiredBlock ? detectSkills(requiredBlock) : allSkills;
  const requiredSkills = requiredDetected.filter((s) => !preferredSet.has(s));
  for (const s of allSkills) {
    if (!preferredSet.has(s) && !requiredSkills.includes(s)) requiredSkills.push(s);
  }

  const title = extractJobTitle(lines, text);
  const bucket = (names: string[]) => allSkills.filter((s) => names.includes(s));

  const LANGS = ['Python','Java','JavaScript','TypeScript','C++','C#','Go','Rust','Ruby','PHP','Swift','Kotlin','Scala','R','SQL','MATLAB','Bash','C'];
  const FRAMEWORKS = ['React','Next.js','Angular','Vue','Node.js','Express','Spring Boot','Django','Flask','FastAPI','Rails','.NET','Svelte','Tailwind CSS','Redux','PyTorch','TensorFlow','Keras'];
  const TOOLS = ['Docker','Kubernetes','Terraform','Jenkins','Git','GitHub Actions','Linux','Jira','Postman','MLflow','Weights & Biases','Selenium','Figma','CI/CD'];

  return {
    id: newId('jd'),
    createdAt: nowIso(),
    jobTitle: title,
    company: extractCompany(lines, text),
    location: /\b(remote|hybrid|on[-\s]?site)\b/i.exec(text)?.[0],
    seniority: detectSeniority(text),
    domain: detectDomain(text),
    requiredSkills,
    preferredSkills,
    technologies: allSkills,
    languages: bucket(LANGS),
    frameworks: bucket(FRAMEWORKS),
    tools: bucket(TOOLS),
    responsibilities: collectByCue(lines, RESPONSIBILITY_CUES, stopCues).slice(0, 20),
    qualifications: collectByCue(lines, QUALIFICATION_CUES, stopCues).slice(0, 20),
    atsKeywords: rankAtsKeywords(text, allSkills, title),
    domainTerminology: extractDomainTerminology(text, allSkills),
    rawText: text,
    sourceFileName,
  };
}
