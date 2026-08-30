import type { SectionKey, TailoredResume } from '../types/tailored.ts';
import { autoBoldMetrics, splitBoldRuns } from './textFormatting.ts';
import { bucketProject } from './projectDetail.ts';

/**
 * This app's custom LaTeX/Overleaf resume renderer.
 *
 * The template is fixed and owned by this module. The AI supplies content
 * only — it never emits LaTeX — so the layout cannot be redesigned, broken
 * or made ATS-hostile by a model response.
 *
 * ATS constraints held here: single column, no multicol, no images, no
 * icons, standard headings, real selectable text, and every link emitted as
 * a genuine \href annotation.
 */

/** Knobs the one-page optimiser may tighten, in order of least damage. */
export interface LayoutOptions {
  fontSize: 10 | 10.5;
  marginSidesIn: number;
  marginTopBottomIn: number;
  baselineStretch: number;
  sectionGapBeforePt: number;
  sectionGapAfterPt: number;
  projectEntryGapPt: number;
  experienceEntryGapPt: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  fontSize: 10.5,
  marginSidesIn: 0.5,
  marginTopBottomIn: 0.5,
  baselineStretch: 0.9,
  sectionGapBeforePt: 5,
  sectionGapAfterPt: 3,
  projectEntryGapPt: 6,
  experienceEntryGapPt: 3,
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
    .replace(/–/g, '--')
    .replace(/—/g, '---')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, "''")
    .replace(/•/g, '')
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

/** Renders text that may carry `**bold**` markers (from the AI path) or
 *  plain text (the heuristic path gets auto-bolded metrics applied first),
 *  as a mix of plain and `\textbf{}` LaTeX runs. Bullet char is always
 *  `\textbullet` via `tightitemize`, never a literal Unicode bullet. */
function renderBoldText(raw: string): string {
  return splitBoldRuns(autoBoldMetrics(raw))
    .map(({ text, bold }) => (bold ? `\\textbf{${escapeLatex(text)}}` : escapeLatex(text)))
    .join('');
}

const PREAMBLE = (o: LayoutOptions): string => `\\documentclass[letterpaper]{article}

\\usepackage[T1]{fontenc}
\\usepackage[top=${o.marginTopBottomIn}in,bottom=${o.marginTopBottomIn}in,left=${o.marginSidesIn}in,right=${o.marginSidesIn}in]{geometry}
\\usepackage{mathptmx}
\\usepackage{enumitem}
\\usepackage{xcolor}
\\usepackage{tabularx}
\\usepackage{needspace}
\\usepackage[hidelinks]{hyperref}
\\hypersetup{
  colorlinks=true,
  linkcolor=blue,
  urlcolor=blue
}

\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\renewcommand{\\baselinestretch}{${o.baselineStretch}}
\\fontsize{${o.fontSize}}{${(o.fontSize * 1.2).toFixed(1)}}\\selectfont
\\urlstyle{same}
\\raggedbottom

% CRITICAL for ATS: makes the generated PDF's text properly extractable.
\\pdfgentounicode=1

% Section header: gap, bold title, rule tucked close beneath it, small gap after.
\\newcommand{\\sectionheader}[1]{%
  \\vspace{${o.sectionGapBeforePt}pt}\\noindent{\\bfseries\\large #1}\\\\[-7pt]
  \\noindent\\rule{\\linewidth}{0.6pt}\\vspace{${o.sectionGapAfterPt}pt}%
}

% Title-left / date-or-link-right line, used for Education, Work Experience,
% Projects, Workshops, Hackathons, and Certificates entries.
\\newcommand{\\entryline}[2]{%
  \\noindent\\begin{tabularx}{\\linewidth}{@{}X r@{}}
    #1 & #2 \\\\
  \\end{tabularx}%
}

% Tight bullet list used for every bulleted block in the document.
\\newlist{tightitemize}{itemize}{2}
\\setlist[tightitemize]{leftmargin=1.15em, label=\\textbullet, itemsep=1pt, topsep=2pt, parsep=0pt, partopsep=0pt}
`;

function renderHeader(r: TailoredResume): string {
  const pi = r.personalInfo;
  const contactParts: string[] = [];
  if (pi.phone) contactParts.push(`M.No.: ${escapeLatex(pi.phone)}`);
  if (pi.email) contactParts.push(`Email: ${href(`mailto:${pi.email}`, pi.email)}`);

  const namedLinks: Array<[string, { url: string } | undefined]> = [
    ['Portfolio', r.links.portfolio],
    ['LinkedIn', r.links.linkedin],
    ['GitHub', r.links.github],
    ['LeetCode', r.links.leetcode],
  ];
  for (const [label, link] of namedLinks) {
    if (link?.url) contactParts.push(href(link.url, label));
  }

  return `\\begin{center}{\\LARGE\\bfseries ${escapeLatex(pi.fullName.toUpperCase())}}\\end{center}
\\begin{center}\\small ${contactParts.join(' | ')}\\end{center}`;
}

function renderSummary(r: TailoredResume): string {
  if (!r.summary.trim()) return '';
  return `\\vspace{4pt}\\noindent ${renderBoldText(r.summary)}\\vspace{4pt}`;
}

function renderEducation(r: TailoredResume): string {
  if (r.education.length === 0) return '';
  const items = r.education
    .map((e) => {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' -- ');
      const left = `\\textbullet\\ \\textbf{${escapeLatex(e.degree)} | ${escapeLatex(e.institution)}}`;
      const right = `\\emph{${escapeLatex(dates)}}`;
      const gpaLine = e.gpa ? `\\hspace{1.15em}CGPA: ${escapeLatex(e.gpa)}\\\\` : '';
      return `\\entryline{${left}}{${right}}\n${gpaLine}`;
    })
    .join('\n\\vspace{2pt}\n');
  return `\\sectionheader{EDUCATION}\n${items}`;
}

function renderExperience(r: TailoredResume, layout: LayoutOptions): string {
  if (r.experience.length === 0) return '';
  const items = r.experience
    .map((e) => {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' -- ');
      const right = e.certificateUrl
        ? `\\emph{${escapeLatex(dates)}}\\quad ${href(e.certificateUrl, 'Certificate')}`
        : `\\emph{${escapeLatex(dates)}}`;
      const left = `\\textbf{${escapeLatex(e.organization)} | ${escapeLatex(e.role)}}`;
      const bullets = e.bullets.map((b) => `  \\item ${renderBoldText(b.text)}`).join('\n');
      return [
        '\\Needspace{6\\baselineskip}',
        `\\entryline{${left}}{${right}}`,
        bullets ? `\\begin{tightitemize}\n${bullets}\n\\end{tightitemize}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join(`\n\\vspace{${layout.experienceEntryGapPt}pt}\n`);
  return `\\sectionheader{WORK EXPERIENCE}\n${items}`;
}

function renderProjects(r: TailoredResume, layout: LayoutOptions): string {
  if (r.projects.length === 0) return '';
  const items = r.projects
    .map((p) => {
      const detail = bucketProject(p);
      const left = `\\textbf{${escapeLatex(p.name)}${p.tagline ? ` -- ${escapeLatex(p.tagline)}` : ''}}`;
      const right = p.repoUrl ? href(p.repoUrl, 'GitHub') : '';
      const overviewLine = detail.overview ? `\\textbf{Overview:} ${renderBoldText(detail.overview)}\\\\` : '';
      const featuresBlock =
        detail.features.length > 0
          ? `\\textbf{Features:}\\begin{tightitemize}\n${detail.features
              .map((b) => `  \\item ${renderBoldText(b.text)}`)
              .join('\n')}\n\\end{tightitemize}`
          : '';
      const techLine = detail.techStackLine ? `\\textbf{Tech Stack:} ${escapeLatex(detail.techStackLine)}\\\\` : '';
      const impactLine = detail.impact ? `\\textbf{Impact:} ${renderBoldText(detail.impact.text)}\\\\` : '';
      return [
        '\\Needspace{6\\baselineskip}',
        `\\entryline{${left}}{${right}}`,
        overviewLine,
        featuresBlock,
        techLine,
        impactLine,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join(`\n\\vspace{${layout.projectEntryGapPt}pt}\n`);
  return `\\sectionheader{PROJECTS}\n${items}`;
}

function renderSkills(r: TailoredResume): string {
  const rows = r.skills
    .map((c) => {
      const allItems = [...c.items, ...(c.fabricated ?? [])];
      if (allItems.length === 0) return '';
      return `  \\item \\textbf{${escapeLatex(c.name)}:} ${allItems.map((s) => escapeLatex(s)).join(' | ')}`;
    })
    .filter(Boolean);
  if (rows.length === 0) return '';
  return `\\sectionheader{SKILLS}\n\\begin{tightitemize}\n${rows.join('\n')}\n\\end{tightitemize}`;
}

function renderWorkshops(r: TailoredResume): string {
  if (r.workshops.length === 0) return '';
  const items = r.workshops
    .map((w) => {
      const label = [w.title, w.organizer, w.date].filter(Boolean).map((s) => escapeLatex(s as string)).join(' — ');
      return `  \\item ${w.url ? href(w.url, label) : label}`;
    })
    .join('\n');
  return `\\sectionheader{WORKSHOPS}\n\\begin{tightitemize}\n${items}\n\\end{tightitemize}`;
}

function renderHackathons(r: TailoredResume): string {
  if (r.hackathons.length === 0) return '';
  const items = r.hackathons
    .map((h) => {
      const label = [h.name, h.result, h.date].filter(Boolean).map((s) => escapeLatex(s as string)).join(' — ');
      return `  \\item ${h.url ? href(h.url, label) : label}`;
    })
    .join('\n');
  return `\\sectionheader{HACKATHONS}\n\\begin{tightitemize}\n${items}\n\\end{tightitemize}`;
}

function renderCertifications(r: TailoredResume): string {
  if (r.certifications.length === 0) return '';
  const items = r.certifications
    .map((c) => {
      const left = [c.name, c.issuer, c.date].filter(Boolean).map((s) => escapeLatex(s as string)).join(' | ');
      const right = c.url ? href(c.url, 'Certificate') : '';
      return `\\entryline{${left}}{${right}}`;
    })
    .join('\n\\vspace{2pt}\n');
  return `\\sectionheader{CERTIFICATES}\n${items}`;
}

function renderExtraCurricular(r: TailoredResume): string {
  if (r.extraCurricular.length === 0) return '';
  const items = r.extraCurricular
    .map((e) => {
      const lead = [e.role, e.organization].filter(Boolean).map((s) => escapeLatex(s as string)).join(' — ');
      const text = lead ? `\\textbf{${lead}:} ${renderBoldText(e.impact)}` : renderBoldText(e.impact);
      return `  \\item ${text}`;
    })
    .join('\n');
  return `\\sectionheader{EXTRA CURRICULAR}\n\\begin{tightitemize}\n${items}\n\\end{tightitemize}`;
}

const RENDERERS: Record<SectionKey, (r: TailoredResume, layout: LayoutOptions) => string> = {
  education: renderEducation,
  skills: renderSkills,
  experience: renderExperience,
  projects: renderProjects,
  workshops: renderWorkshops,
  hackathons: renderHackathons,
  certifications: renderCertifications,
  extracurricular: renderExtraCurricular,
};

export function renderLatex(resume: TailoredResume, layout: LayoutOptions = DEFAULT_LAYOUT): string {
  const hidden = new Set(resume.hiddenSections);
  const body = resume.sectionOrder
    .filter((key) => !hidden.has(key))
    .map((key) => RENDERERS[key](resume, layout))
    .filter((chunk) => chunk.trim().length > 0)
    .join(`\n\n\\vspace{${layout.sectionGapBeforePt - 3}pt}\n\n`);

  return `${PREAMBLE(layout)}
\\begin{document}

${renderHeader(resume)}

${renderSummary(resume)}

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
    ['Portfolio', resume.links.portfolio],
    ['LinkedIn', resume.links.linkedin],
    ['GitHub', resume.links.github],
    ['LeetCode', resume.links.leetcode],
  ] as const) {
    if (link?.url) out.push({ label, url: link.url });
  }

  if (!hidden.has('experience')) {
    for (const e of resume.experience) {
      if (e.certificateUrl) out.push({ label: `${e.organization} Certificate`, url: e.certificateUrl });
    }
  }
  if (!hidden.has('projects')) {
    for (const p of resume.projects) {
      if (p.repoUrl) out.push({ label: `${p.name} (GitHub)`, url: p.repoUrl });
    }
  }
  if (!hidden.has('workshops')) {
    for (const w of resume.workshops) {
      if (w.url) out.push({ label: w.title, url: w.url });
    }
  }
  if (!hidden.has('hackathons')) {
    for (const h of resume.hackathons) {
      if (h.url) out.push({ label: h.name, url: h.url });
    }
  }
  if (!hidden.has('certifications')) {
    for (const c of resume.certifications) {
      if (c.url) out.push({ label: c.name, url: c.url });
    }
  }
  return out;
}
