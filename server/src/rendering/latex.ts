import type { ProfileLink } from '../types/resume.ts';
import type { SectionKey, TailoredResume } from '../types/tailored.ts';

/**
 * Jake's Resume renderer.
 *
 * The template is fixed and owned by this module. The AI supplies content only
 * — it never emits LaTeX — so the layout cannot be redesigned, broken or made
 * ATS-hostile by a model response.
 *
 * ATS constraints held here: single column, no tabular/multicol, no images,
 * no icons, standard headings, real selectable text, and every link emitted as
 * a genuine \href annotation.
 */

/** Knobs the one-page optimiser may tighten, in order of least damage. */
export interface LayoutOptions {
  fontSize: 10 | 11;
  marginInches: number;
  /** Vertical space between sections, in points. */
  sectionSpacing: number;
  /** Extra leading between bullets, in points. */
  itemSpacing: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  fontSize: 11,
  marginInches: 0.5,
  sectionSpacing: 6,
  itemSpacing: 1,
};

/**
 * Escapes text for LaTeX.
 * Resume content routinely contains %, &, _, # and $ (C#, R&D, 40%), any of
 * which silently breaks compilation or corrupts output if left raw.
 */
export function escapeLatex(input: string): string {
  if (!input) return '';
  return input
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/\u2013/g, '--')
    .replace(/\u2014/g, '---')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, "''")
    .replace(/\u2022/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escapes a URL for use inside \href{}.
 * Percent and hash must survive as literal URL characters, so this differs
 * from ordinary text escaping.
 */
export function escapeUrl(url: string): string {
  return url
    .trim()
    .replace(/\\/g, '')
    .replace(/([%#{}])/g, '\\$1')
    .replace(/\s/g, '%20');
}

function href(url: string, label: string): string {
  return `\\href{${escapeUrl(url)}}{${escapeLatex(label)}}`;
}

/** Renders a display label for a URL, trimmed of scheme noise. */
export function prettyUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/$/, '');
}

const PREAMBLE = (o: LayoutOptions): string => `\\documentclass[letterpaper,${o.fontSize}pt]{article}

\\usepackage{latexsym}
\\usepackage[empty]{fullpage}
\\usepackage{titlesec}
\\usepackage[usenames,dvipsnames]{color}
\\usepackage{verbatim}
\\usepackage{enumitem}
\\usepackage[hidelinks]{hyperref}
\\usepackage{fancyhdr}
\\usepackage[english]{babel}
\\usepackage{tabularx}
\\input{glyphtounicode}

\\pagestyle{fancy}
\\fancyhf{}
\\fancyfoot{}
\\renewcommand{\\headrulewidth}{0pt}
\\renewcommand{\\footrulewidth}{0pt}

% Margins
\\addtolength{\\oddsidemargin}{-${(0.5 + (0.5 - o.marginInches)).toFixed(3)}in}
\\addtolength{\\evensidemargin}{-${(0.5 + (0.5 - o.marginInches)).toFixed(3)}in}
\\addtolength{\\textwidth}{${(1.0 + 2 * (0.5 - o.marginInches)).toFixed(3)}in}
\\addtolength{\\topmargin}{-${(0.7 - (0.5 - o.marginInches)).toFixed(3)}in}
\\addtolength{\\textheight}{${(1.4 + 2 * (0.5 - o.marginInches)).toFixed(3)}in}

\\urlstyle{same}
\\raggedbottom
\\raggedright
\\setlength{\\tabcolsep}{0in}

% Section heading: uppercase, with a horizontal rule beneath.
\\titleformat{\\section}{
  \\vspace{-4pt}\\scshape\\raggedright\\large
}{}{0em}{}[\\color{black}\\titlerule \\vspace{-5pt}]

% CRITICAL for ATS: makes the generated PDF's text properly extractable.
\\pdfgentounicode=1

% Jake's Resume item commands
\\newcommand{\\resumeItem}[1]{
  \\item\\small{
    {#1 \\vspace{-${o.itemSpacing + 1}pt}}
  }
}

\\newcommand{\\resumeSubheading}[4]{
  \\vspace{-2pt}\\item
    \\begin{tabular*}{0.97\\textwidth}[t]{l@{\\extracolsep{\\fill}}r}
      \\textbf{#1} & #2 \\\\
      \\textit{\\small#3} & \\textit{\\small #4} \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeProjectHeading}[2]{
    \\item
    \\begin{tabular*}{0.97\\textwidth}{l@{\\extracolsep{\\fill}}r}
      \\small#1 & #2 \\\\
    \\end{tabular*}\\vspace{-7pt}
}

\\newcommand{\\resumeSubItem}[1]{\\resumeItem{#1}\\vspace{-4pt}}
\\renewcommand\\labelitemii{$\\vcenter{\\hbox{\\tiny$\\bullet$}}$}

\\newcommand{\\resumeSubHeadingListStart}{\\begin{itemize}[leftmargin=0.15in, label={}]}
\\newcommand{\\resumeSubHeadingListEnd}{\\end{itemize}}
\\newcommand{\\resumeItemListStart}{\\begin{itemize}}
\\newcommand{\\resumeItemListEnd}{\\end{itemize}\\vspace{-${o.itemSpacing + 4}pt}}
`;

function renderHeader(r: TailoredResume): string {
  const pi = r.personalInfo;
  const parts: string[] = [];

  if (pi.location) parts.push(escapeLatex(pi.location));
  // Phone as a tel: link where it is dialable; plain text otherwise.
  if (pi.phone) {
    const digits = pi.phone.replace(/[^\d+]/g, '');
    parts.push(digits.length >= 7 ? `\\href{tel:${escapeUrl(digits)}}{${escapeLatex(pi.phone)}}` : escapeLatex(pi.phone));
  }
  if (pi.email) parts.push(href(`mailto:${pi.email}`, pi.email));

  const named: Array<ProfileLink | undefined> = [
    r.links.linkedin,
    r.links.github,
    r.links.portfolio,
    r.links.leetcode,
  ];
  for (const link of named) {
    if (link?.url) parts.push(href(link.url, link.label));
  }
  // Repo and live-demo URLs belong to their project entry, not the contact
  // line. Leaking them here wraps the header onto a second line and wastes the
  // most valuable space on the page.
  const projectUrls = new Set<string>();
  for (const p of r.projects) {
    if (p.repoUrl) projectUrls.add(p.repoUrl);
    if (p.liveUrl) projectUrls.add(p.liveUrl);
  }
  for (const link of r.links.other) {
    if (projectUrls.has(link.url)) continue;
    if (/github\.com\/[^/]+\/[^/]+/i.test(link.url)) continue;
    if (parts.length >= 8) break;
    parts.push(href(link.url, link.label));
  }

  return `\\begin{center}
    \\textbf{\\Huge \\scshape ${escapeLatex(pi.fullName)}} \\\\ \\vspace{2pt}
    \\small ${parts.join(' $|$ ')}
\\end{center}`;
}

function renderEducation(r: TailoredResume): string {
  if (r.education.length === 0) return '';
  const items = r.education
    .map((e) => {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' -- ');
      const degreeLine = [e.degree, e.gpa ? `CGPA: ${e.gpa}` : ''].filter(Boolean).join(', ');
      return `    \\resumeSubheading
      {${escapeLatex(e.institution)}}{${escapeLatex(e.location ?? '')}}
      {${escapeLatex(degreeLine)}}{${escapeLatex(dates)}}`;
    })
    .join('\n');
  return `\\section{Education}
  \\resumeSubHeadingListStart
${items}
  \\resumeSubHeadingListEnd`;
}

function renderExperienceLike(
  entries: TailoredResume['experience'],
  heading: string,
): string {
  if (entries.length === 0) return '';
  const items = entries
    .map((e) => {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' -- ');
      const bullets = e.bullets
        .map((b) => `        \\resumeItem{${escapeLatex(b.text)}}`)
        .join('\n');
      return `    \\resumeSubheading
      {${escapeLatex(e.role)}}{${escapeLatex(dates)}}
      {${escapeLatex(e.organization)}}{${escapeLatex(e.location ?? '')}}
${bullets ? `      \\resumeItemListStart\n${bullets}\n      \\resumeItemListEnd` : ''}`;
    })
    .join('\n');
  return `\\section{${heading}}
  \\resumeSubHeadingListStart
${items}
  \\resumeSubHeadingListEnd`;
}

function renderProjects(r: TailoredResume): string {
  if (r.projects.length === 0) return '';
  const items = r.projects
    .map((p) => {
      const tech = p.technologies.length > 0 ? ` $|$ \\emph{${escapeLatex(p.technologies.join(', '))}}` : '';
      // Project links render as real hyperlinks, never bare text.
      const linkBits: string[] = [];
      if (p.repoUrl) linkBits.push(href(p.repoUrl, 'Code'));
      if (p.liveUrl) linkBits.push(href(p.liveUrl, 'Live Demo'));
      const right = linkBits.length > 0
        ? `\\small ${linkBits.join(' $|$ ')}`
        : escapeLatex([p.startDate, p.endDate].filter(Boolean).join(' -- '));

      const bullets = p.bullets
        .map((b) => `        \\resumeItem{${escapeLatex(b.text)}}`)
        .join('\n');

      return `      \\resumeProjectHeading
          {\\textbf{${escapeLatex(p.name)}}${tech}}{${right}}
${bullets ? `          \\resumeItemListStart\n${bullets}\n          \\resumeItemListEnd` : ''}`;
    })
    .join('\n');
  return `\\section{Projects}
    \\resumeSubHeadingListStart
${items}
    \\resumeSubHeadingListEnd`;
}

function renderSkills(r: TailoredResume): string {
  const rows: string[] = [];
  const add = (label: string, values: string[]) => {
    if (values.length > 0) {
      rows.push(`     \\textbf{${label}}{: ${escapeLatex(values.join(', '))}}`);
    }
  };
  add('Languages', r.skills.languages);
  add('Frameworks', r.skills.frameworks);
  add('Libraries', r.skills.libraries);
  add('Developer Tools', r.skills.tools);
  add('Technologies', r.skills.technologies);
  add('Other', r.skills.other);
  if (rows.length === 0) return '';

  return `\\section{Technical Skills}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{
${rows.join(' \\\\\n')}
    }}
 \\end{itemize}`;
}

function renderCertifications(r: TailoredResume): string {
  if (r.certifications.length === 0) return '';
  const items = r.certifications
    .map((c) => {
      const label = [c.name, c.issuer, c.date].filter(Boolean).join(' -- ');
      const body = c.url ? href(c.url, label) : escapeLatex(label);
      return `    \\resumeItem{${body}}`;
    })
    .join('\n');
  return `\\section{Certifications}
  \\resumeItemListStart
${items}
  \\resumeItemListEnd`;
}

function renderAchievements(r: TailoredResume): string {
  if (r.achievements.length === 0) return '';
  const items = r.achievements
    .map((a) => {
      const body = a.url ? href(a.url, a.text) : escapeLatex(a.text);
      return `    \\resumeItem{${body}}`;
    })
    .join('\n');
  return `\\section{Achievements}
  \\resumeItemListStart
${items}
  \\resumeItemListEnd`;
}

function renderSummary(r: TailoredResume): string {
  if (!r.summary.trim()) return '';
  return `\\section{Summary}
 \\begin{itemize}[leftmargin=0.15in, label={}]
    \\small{\\item{${escapeLatex(r.summary)}}}
 \\end{itemize}`;
}

const RENDERERS: Record<SectionKey, (r: TailoredResume) => string> = {
  summary: renderSummary,
  education: renderEducation,
  experience: (r) => renderExperienceLike(r.experience, 'Experience'),
  internship: (r) => renderExperienceLike(r.internships, 'Internships'),
  projects: renderProjects,
  skills: renderSkills,
  certifications: renderCertifications,
  achievements: renderAchievements,
};

export function renderLatex(resume: TailoredResume, layout: LayoutOptions = DEFAULT_LAYOUT): string {
  const hidden = new Set(resume.hiddenSections);
  const body = resume.sectionOrder
    .filter((key) => !hidden.has(key))
    .map((key) => RENDERERS[key](resume))
    .filter((chunk) => chunk.trim().length > 0)
    .join(`\n\n\\vspace{${layout.sectionSpacing - 6}pt}\n\n`);

  return `${PREAMBLE(layout)}
\\begin{document}

${renderHeader(resume)}

${body}

\\end{document}
`;
}

/** Every URL the renderer is contractually obliged to emit as a live link. */
export function expectedLinks(resume: TailoredResume): Array<{ label: string; url: string }> {
  const out: Array<{ label: string; url: string }> = [];
  const hidden = new Set(resume.hiddenSections);

  if (resume.personalInfo.email) {
    out.push({ label: 'Email', url: `mailto:${resume.personalInfo.email}` });
  }
  for (const [label, link] of [
    ['LinkedIn', resume.links.linkedin],
    ['GitHub', resume.links.github],
    ['Portfolio', resume.links.portfolio],
    ['LeetCode', resume.links.leetcode],
  ] as const) {
    if (link?.url) out.push({ label, url: link.url });
  }

  // Mirror renderHeader's filter so the validator's expectations match exactly
  // what the template emits — otherwise validation fails on links we chose not
  // to render, or silently ignores ones we did.
  const projectUrls = new Set<string>();
  for (const p of resume.projects) {
    if (p.repoUrl) projectUrls.add(p.repoUrl);
    if (p.liveUrl) projectUrls.add(p.liveUrl);
  }
  let headerExtras = out.length;
  for (const link of resume.links.other) {
    if (projectUrls.has(link.url)) continue;
    if (/github\.com\/[^/]+\/[^/]+/i.test(link.url)) continue;
    if (headerExtras >= 8) break;
    headerExtras++;
    out.push({ label: link.label, url: link.url });
  }

  if (!hidden.has('projects')) {
    for (const p of resume.projects) {
      if (p.repoUrl) out.push({ label: `${p.name} (Code)`, url: p.repoUrl });
      if (p.liveUrl) out.push({ label: `${p.name} (Live Demo)`, url: p.liveUrl });
    }
  }
  if (!hidden.has('certifications')) {
    for (const c of resume.certifications) {
      if (c.url) out.push({ label: c.name, url: c.url });
    }
  }
  return out;
}
