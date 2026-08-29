import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractPdf } from '../../src/parsers/pdf.ts';
import { parseMasterResume } from '../../src/parsers/index.ts';

const fixturePath = resolve(__dirname, '../fixtures/master-resume.pdf');

describe('extractPdf (real .pdf fixture, pdfjs-dist based)', () => {
  it('recovers link annotations with their visible labels', async () => {
    const buf = readFileSync(fixturePath);
    const extracted = await extractPdf(buf);
    const byLabel = Object.fromEntries(extracted.links.map((l) => [l.label, l.url]));
    expect(byLabel['LinkedIn']).toBe('https://www.linkedin.com/in/aaravsharma');
    expect(byLabel['GitHub']).toBe('https://github.com/aaravsharma');
  });
});

describe('parseMasterResume end-to-end on a real PDF', () => {
  it('structures a full resume: education, multiple roles, multiple projects, all with real bullets', async () => {
    const buf = readFileSync(fixturePath);
    const resume = await parseMasterResume('master-resume.pdf', buf);

    expect(resume.personalInfo.fullName).toContain('AARAV SHARMA');
    expect(resume.education).toHaveLength(1);
    expect(resume.experience.length).toBeGreaterThanOrEqual(2);
    expect(resume.projects.length).toBeGreaterThanOrEqual(3);

    for (const role of resume.experience) {
      expect(role.bullets.length).toBeGreaterThan(0);
    }
    for (const project of resume.projects) {
      expect(project.bullets.length).toBeGreaterThan(0);
    }
  });

  it('attaches distinct repo URLs to each project rather than reusing one link everywhere', async () => {
    const buf = readFileSync(fixturePath);
    const resume = await parseMasterResume('master-resume.pdf', buf);
    const repoUrls = resume.projects.map((p) => p.repoUrl).filter(Boolean);
    expect(new Set(repoUrls).size).toBe(repoUrls.length);
  });
});
