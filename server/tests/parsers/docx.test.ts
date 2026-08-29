import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractDocx } from '../../src/parsers/docx.ts';
import { structureResume } from '../../src/parsers/structure.ts';

const fixturePath = resolve(__dirname, '../fixtures/master-resume.docx');

describe('extractDocx (real .docx fixture, zero-dependency zip/XML reader)', () => {
  const buf = readFileSync(fixturePath);
  const extracted = extractDocx(buf);

  it('extracts readable body text', () => {
    expect(extracted.text.length).toBeGreaterThan(50);
    expect(extracted.text).toContain('AARAV SHARMA');
  });

  it('resolves hyperlink relationship ids to their real target URLs, not just visible labels', () => {
    const byLabel = Object.fromEntries(extracted.links.map((l) => [l.label, l.url]));
    expect(byLabel['LinkedIn']).toBe('https://www.linkedin.com/in/aaravsharma');
    expect(byLabel['GitHub']).toBe('https://github.com/aaravsharma');
    expect(byLabel['LeetCode']).toBe('https://leetcode.com/u/aaravsharma');
  });

  it('captures a project repository link distinct from the profile GitHub link', () => {
    const repo = extracted.links.find((l) => l.url.includes('/semanticsearch'));
    expect(repo?.url).toBe('https://github.com/aaravsharma/semanticsearch');
  });

  it('feeds cleanly into structureResume without throwing', () => {
    expect(() => structureResume({ ...extracted, sourceFileName: 'master-resume.docx' })).not.toThrow();
  });
});
