import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { SectionKey, TailoredResume } from '../types/tailored.ts';

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
    text,
    bullet: { level: 0 },
    spacing: { after: 40 },
    run: { size: 20, font: FONT },
  });
}

function subheading(left: string, right: string, sub: string, subRight: string): Paragraph[] {
  return [
    new Paragraph({
      tabStops: [{ type: 'right', position: 9350 }],
      spacing: { before: 120, after: 0 },
      children: [
        new TextRun({ text: left, bold: true, size: 22, font: FONT }),
        new TextRun({ text: `\t${right}`, size: 20, font: FONT }),
      ],
    }),
    new Paragraph({
      tabStops: [{ type: 'right', position: 9350 }],
      spacing: { after: 60 },
      children: [
        new TextRun({ text: sub, italics: true, size: 20, font: FONT }),
        new TextRun({ text: `\t${subRight}`, italics: true, size: 20, font: FONT }),
      ],
    }),
  ];
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

  if (r.personalInfo.location) push(new TextRun({ text: r.personalInfo.location, size: 20, font: FONT }));
  if (r.personalInfo.phone) push(new TextRun({ text: r.personalInfo.phone, size: 20, font: FONT }));
  if (r.personalInfo.email) push(linkRun(r.personalInfo.email, `mailto:${r.personalInfo.email}`));
  if (r.links.linkedin) push(linkRun(r.links.linkedin.label, r.links.linkedin.url));
  if (r.links.github) push(linkRun(r.links.github.label, r.links.github.url));
  if (r.links.portfolio) push(linkRun(r.links.portfolio.label, r.links.portfolio.url));
  if (r.links.leetcode) push(linkRun(r.links.leetcode.label, r.links.leetcode.url));

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: r.personalInfo.fullName, bold: true, size: 36, font: FONT })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: contactRuns }),
  ];
}

function summarySection(r: TailoredResume): Paragraph[] {
  if (!r.summary.trim()) return [];
  return [heading('Summary'), new Paragraph({ text: r.summary, run: { size: 20, font: FONT }, spacing: { after: 80 } })];
}

function educationSection(r: TailoredResume): Paragraph[] {
  if (r.education.length === 0) return [];
  const out: Paragraph[] = [heading('Education')];
  for (const e of r.education) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
    const degreeLine = [e.degree, e.gpa ? `CGPA: ${e.gpa}` : ''].filter(Boolean).join(', ');
    out.push(...subheading(e.institution, e.location ?? '', degreeLine, dates));
  }
  return out;
}

function experienceLikeSection(entries: TailoredResume['experience'], title: string): Paragraph[] {
  if (entries.length === 0) return [];
  const out: Paragraph[] = [heading(title)];
  for (const e of entries) {
    const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
    out.push(...subheading(e.role, dates, e.organization, e.location ?? ''));
    for (const b of e.bullets) out.push(bulletParagraph(b.text));
  }
  return out;
}

function projectsSection(r: TailoredResume): Paragraph[] {
  if (r.projects.length === 0) return [];
  const out: Paragraph[] = [heading('Projects')];
  for (const p of r.projects) {
    const techLine = p.technologies.length ? ` | ${p.technologies.join(', ')}` : '';
    const linkRuns: (TextRun | ExternalHyperlink)[] = [];
    if (p.repoUrl) linkRuns.push(linkRun('Code', p.repoUrl));
    if (p.liveUrl) {
      if (linkRuns.length) linkRuns.push(new TextRun({ text: '  |  ', size: 20, font: FONT }));
      linkRuns.push(linkRun('Live Demo', p.liveUrl));
    }
    out.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [new TextRun({ text: `${p.name}${techLine}`, bold: true, size: 20, font: FONT })],
      }),
    );
    if (linkRuns.length > 0) out.push(new Paragraph({ children: linkRuns, spacing: { after: 40 } }));
    for (const b of p.bullets) out.push(bulletParagraph(b.text));
  }
  return out;
}

function skillsSection(r: TailoredResume): Paragraph[] {
  const rows: string[] = [];
  const add = (label: string, values: string[]) => {
    if (values.length > 0) rows.push(`${label}: ${values.join(', ')}`);
  };
  add('Languages', r.skills.languages);
  add('Frameworks', r.skills.frameworks);
  add('Libraries', r.skills.libraries);
  add('Developer Tools', r.skills.tools);
  add('Technologies', r.skills.technologies);
  add('Other', r.skills.other);
  if (rows.length === 0) return [];
  return [
    heading('Technical Skills'),
    ...rows.map((line) => new Paragraph({ text: line, run: { size: 20, font: FONT }, spacing: { after: 30 } })),
  ];
}

function certificationsSection(r: TailoredResume): Paragraph[] {
  if (r.certifications.length === 0) return [];
  return [
    heading('Certifications'),
    ...r.certifications.map((c) =>
      bulletParagraph([c.name, c.issuer, c.date].filter(Boolean).join(' - ')),
    ),
  ];
}

function achievementsSection(r: TailoredResume): Paragraph[] {
  if (r.achievements.length === 0) return [];
  return [heading('Achievements'), ...r.achievements.map((a) => bulletParagraph(a.text))];
}

const SECTION_BUILDERS: Record<SectionKey, (r: TailoredResume) => Paragraph[]> = {
  summary: summarySection,
  education: educationSection,
  experience: (r) => experienceLikeSection(r.experience, 'Experience'),
  internship: (r) => experienceLikeSection(r.internships, 'Internships'),
  projects: projectsSection,
  skills: skillsSection,
  certifications: certificationsSection,
  achievements: achievementsSection,
};

export async function renderDocx(resume: TailoredResume): Promise<Buffer> {
  const hidden = new Set(resume.hiddenSections);
  const children: Paragraph[] = [
    ...headerParagraphs(resume),
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
