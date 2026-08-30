import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { SectionKey, TailoredResume } from '../types/tailored.ts';
import { autoBoldMetrics, splitBoldRuns } from './textFormatting.ts';
import { bucketProject } from './projectDetail.ts';

/**
 * DOCX export. Mirrors the LaTeX renderer's content and section order exactly
 * so the two exports never disagree, but lays it out with native Word
 * paragraphs/styles rather than LaTeX commands — this file is what the user
 * edits further in Word, so it must be plain, clean, ATS-friendly formatting:
 * a single column, standard fonts, no text boxes, no tables-as-layout.
 */

const FONT = 'Calibri';

function heading(text: string): Paragraph {
  return new Paragraph({
    text: text.toUpperCase(),
    spacing: { before: 200, after: 60 },
    border: { bottom: { color: '000000', space: 1, style: 'single', size: 6 } },
    run: { bold: true, size: 22, font: FONT },
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: boldRuns(text),
  });
}

/** Splits `**bold**`-marked (or plain, auto-bolded-metric) text into
 *  TextRuns — the DOCX equivalent of latex.ts's renderBoldText, sharing the
 *  same `splitBoldRuns`/`autoBoldMetrics` so the two renderers never
 *  disagree on which phrases get bolded. */
function boldRuns(text: string, size = 20): TextRun[] {
  return splitBoldRuns(autoBoldMetrics(text)).map(
    (run) => new TextRun({ text: run.text, bold: run.bold, size, font: FONT }),
  );
}

function entryLine(left: string, right: (TextRun | ExternalHyperlink)[]): Paragraph {
  return new Paragraph({
    tabStops: [{ type: 'right', position: 9350 }],
    spacing: { before: 120, after: 0 },
    children: [new TextRun({ text: left, bold: true, size: 22, font: FONT }), new TextRun({ text: '\t', size: 20, font: FONT }), ...right],
  });
}

function linkRun(label: string, url: string): ExternalHyperlink {
  return new ExternalHyperlink({
    link: url,
    children: [new TextRun({ text: label, style: 'Hyperlink', size: 20, font: FONT })],
  });
}

function headerParagraphs(r: TailoredResume): Paragraph[] {
  const contactRuns: (TextRun | ExternalHyperlink)[] = [];
  const push = (node: TextRun | ExternalHyperlink) => {
    if (contactRuns.length > 0) contactRuns.push(new TextRun({ text: '  |  ', size: 20, font: FONT }));
    contactRuns.push(node);
  };

  if (r.personalInfo.phone) push(new TextRun({ text: `M.No.: ${r.personalInfo.phone}`, size: 20, font: FONT }));
  if (r.personalInfo.email) push(linkRun(`Email: ${r.personalInfo.email}`, `mailto:${r.personalInfo.email}`));
  if (r.links.portfolio) push(linkRun('Portfolio', r.links.portfolio.url));
  if (r.links.linkedin) push(linkRun('LinkedIn', r.links.linkedin.url));
  if (r.links.github) push(linkRun('GitHub', r.links.github.url));
  if (r.links.leetcode) push(linkRun('LeetCode', r.links.leetcode.url));

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: r.personalInfo.fullName.toUpperCase(), bold: true, size: 36, font: FONT })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: contactRuns }),
  ];
}

function summaryParagraphs(r: TailoredResume): Paragraph[] {
  if (!r.summary.trim()) return [];
  return [new Paragraph({ spacing: { after: 120 }, children: boldRuns(r.summary) })];
}

function educationSection(r: TailoredResume): Paragraph[] {
  if (r.education.length === 0) return [];
  const out: Paragraph[] = [heading('Education')];
  for (const e of r.education) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
    out.push(entryLine(`${e.degree} | ${e.institution}`, [new TextRun({ text: dates, italics: true, size: 20, font: FONT })]));
    if (e.gpa) {
      out.push(new Paragraph({ indent: { left: 260 }, spacing: { after: 60 }, children: [new TextRun({ text: `CGPA: ${e.gpa}`, size: 20, font: FONT })] }));
    }
  }
  return out;
}

function experienceSection(r: TailoredResume): Paragraph[] {
  if (r.experience.length === 0) return [];
  const out: Paragraph[] = [heading('Work Experience')];
  for (const e of r.experience) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
    const right: (TextRun | ExternalHyperlink)[] = [new TextRun({ text: dates, italics: true, size: 20, font: FONT })];
    if (e.certificateUrl) {
      right.push(new TextRun({ text: '  ', size: 20, font: FONT }));
      right.push(linkRun('Certificate', e.certificateUrl));
    }
    out.push(entryLine(`${e.organization} | ${e.role}`, right));
    for (const b of e.bullets) out.push(bulletParagraph(b.text));
  }
  return out;
}

function projectsSection(r: TailoredResume): Paragraph[] {
  if (r.projects.length === 0) return [];
  const out: Paragraph[] = [heading('Projects')];
  for (const p of r.projects) {
    const detail = bucketProject(p);
    const right: (TextRun | ExternalHyperlink)[] = p.repoUrl ? [linkRun('GitHub', p.repoUrl)] : [];
    out.push(entryLine(p.tagline ? `${p.name} -- ${p.tagline}` : p.name, right));
    if (detail.overview) {
      out.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Overview: ', bold: true, size: 20, font: FONT }), ...boldRuns(detail.overview)] }));
    }
    if (detail.features.length > 0) {
      out.push(new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: 'Features:', bold: true, size: 20, font: FONT })] }));
      for (const b of detail.features) out.push(bulletParagraph(b.text));
    }
    if (detail.techStackLine) {
      out.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({ text: 'Tech Stack: ', bold: true, size: 20, font: FONT }),
            new TextRun({ text: detail.techStackLine, size: 20, font: FONT }),
          ],
        }),
      );
    }
    if (detail.impact) {
      out.push(
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: 'Impact: ', bold: true, size: 20, font: FONT }), ...boldRuns(detail.impact.text)],
        }),
      );
    }
  }
  return out;
}

function skillsSection(r: TailoredResume): Paragraph[] {
  const rows = r.skills
    .map((c) => {
      const allItems = [...c.items, ...(c.fabricated ?? [])];
      return allItems.length > 0 ? { name: c.name, items: allItems } : null;
    })
    .filter((c): c is { name: string; items: string[] } => c !== null);
  if (rows.length === 0) return [];
  return [
    heading('Skills'),
    ...rows.map(
      (row) =>
        new Paragraph({
          spacing: { after: 30 },
          children: [
            new TextRun({ text: `${row.name}: `, bold: true, size: 20, font: FONT }),
            new TextRun({ text: row.items.join(' | '), size: 20, font: FONT }),
          ],
        }),
    ),
  ];
}

function workshopsSection(r: TailoredResume): Paragraph[] {
  if (r.workshops.length === 0) return [];
  return [
    heading('Workshops'),
    ...r.workshops.map((w) => {
      const label = [w.title, w.organizer, w.date].filter(Boolean).join(' - ');
      return w.url
        ? new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [linkRun(label, w.url)] })
        : bulletParagraph(label);
    }),
  ];
}

function hackathonsSection(r: TailoredResume): Paragraph[] {
  if (r.hackathons.length === 0) return [];
  return [
    heading('Hackathons'),
    ...r.hackathons.map((h) => {
      const label = [h.name, h.result, h.date].filter(Boolean).join(' - ');
      return h.url
        ? new Paragraph({ bullet: { level: 0 }, spacing: { after: 40 }, children: [linkRun(label, h.url)] })
        : bulletParagraph(label);
    }),
  ];
}

function certificationsSection(r: TailoredResume): Paragraph[] {
  if (r.certifications.length === 0) return [];
  const out: Paragraph[] = [heading('Certificates')];
  for (const c of r.certifications) {
    const left = [c.name, c.issuer, c.date].filter(Boolean).join(' | ');
    out.push(entryLine(left, c.url ? [linkRun('Certificate', c.url)] : []));
  }
  return out;
}

function extraCurricularSection(r: TailoredResume): Paragraph[] {
  if (r.extraCurricular.length === 0) return [];
  return [
    heading('Extra Curricular'),
    ...r.extraCurricular.map((e) => {
      const lead = [e.role, e.organization].filter(Boolean).join(' - ');
      return new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 40 },
        children: lead
          ? [new TextRun({ text: `${lead}: `, bold: true, size: 20, font: FONT }), ...boldRuns(e.impact)]
          : boldRuns(e.impact),
      });
    }),
  ];
}

const SECTION_BUILDERS: Record<SectionKey, (r: TailoredResume) => Paragraph[]> = {
  education: educationSection,
  skills: skillsSection,
  experience: experienceSection,
  projects: projectsSection,
  workshops: workshopsSection,
  hackathons: hackathonsSection,
  certifications: certificationsSection,
  extracurricular: extraCurricularSection,
};

export async function renderDocx(resume: TailoredResume): Promise<Buffer> {
  const hidden = new Set(resume.hiddenSections);
  const children: Paragraph[] = [
    ...headerParagraphs(resume),
    ...summaryParagraphs(resume),
    ...resume.sectionOrder.filter((k) => !hidden.has(k)).flatMap((k) => SECTION_BUILDERS[k](resume)),
  ];

  const doc = new Document({
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      },
    ],
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
    },
  });

  return Packer.toBuffer(doc);
}
