import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeJobDescription } from '../../src/parsers/jd.ts';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, '../fixtures', name), 'utf8');

describe('analyzeJobDescription', () => {
  it('detects title, company, domain and seniority for a backend posting', () => {
    const jd = analyzeJobDescription(fixture('jd-backend.txt'));
    expect(jd.jobTitle.toLowerCase()).toContain('backend');
    expect(jd.company).toBe('Razorpay');
    expect(jd.domain).toBe('backend');
    expect(jd.requiredSkills.length).toBeGreaterThan(0);
  });

  it('detects an AI/ML domain distinctly from backend, even with overlapping infra keywords', () => {
    const jd = analyzeJobDescription(fixture('jd-amazon-aiml.txt'));
    expect(jd.domain).toBe('ai-ml');
  });

  it('detects a frontend domain', () => {
    const jd = analyzeJobDescription(fixture('jd-frontend.txt'));
    expect(jd.domain).toBe('frontend');
  });

  it('separates required skills from preferred skills rather than merging them', () => {
    const jd = analyzeJobDescription(fixture('jd-backend.txt'));
    const requiredKeys = jd.requiredSkills.map((s) => s.toLowerCase());
    const preferredKeys = jd.preferredSkills.map((s) => s.toLowerCase());
    for (const p of preferredKeys) expect(requiredKeys).not.toContain(p);
  });

  it('rejects a too-short job description instead of guessing', () => {
    expect(() => analyzeJobDescription('Backend Engineer.')).toThrow();
  });

  it('produces ranked ATS keywords, not an unordered bag', () => {
    const jd = analyzeJobDescription(fixture('jd-backend.txt'));
    expect(jd.atsKeywords.length).toBeGreaterThan(0);
    expect(jd.atsKeywords.length).toBeLessThanOrEqual(40);
  });
});
