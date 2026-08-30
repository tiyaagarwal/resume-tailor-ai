import { describe, expect, it } from 'vitest';
import { parseCritiqueResponse, summarizeResumeForCritique } from '../../src/ai/critique.ts';
import type { TailoredResume } from '../../src/types/tailored.ts';

function minimalResume(overrides: Partial<TailoredResume> = {}): TailoredResume {
  return {
    masterResumeId: 'master_1',
    jobDescriptionId: 'jd_1',
    personalInfo: { fullName: 'Test User', email: 'test@example.com', phone: '', location: '' },
    links: { other: [] },
    summary: '',
    sectionOrder: ['experience', 'projects', 'skills'],
    hiddenSections: [],
    education: [],
    skills: [{ name: 'Programming', items: ['Python'] }],
    experience: [
      {
        id: 'exp_1',
        kind: 'experience',
        role: 'Engineer',
        organization: 'Acme',
        relevance: 0.9,
        bullets: [{ text: 'Built a service.', sourceId: 'exp_1', sourceIndex: 0, original: 'Built a service.', relevance: 0.9 }],
      },
    ],
    projects: [],
    workshops: [],
    hackathons: [],
    certifications: [],
    extraCurricular: [],
    ...overrides,
  };
}

describe('parseCritiqueResponse', () => {
  it('parses a valid, fenced JSON response', () => {
    const raw = '```json\n' + JSON.stringify({
      atsScore: 72,
      summary: 'Solid backend match, thin on cloud infra evidence.',
      strengths: ['Strong Python/Spring Boot experience'],
      improvementAreas: [
        { title: 'No cloud deployment evidence', detail: 'The JD wants AWS; nothing in the resume shows it.', keywords: ['AWS', 'Cloud'] },
      ],
    }) + '\n```';
    const result = parseCritiqueResponse(raw);
    expect(result).not.toBeNull();
    expect(result?.atsScore).toBe(72);
    expect(result?.strengths).toHaveLength(1);
    expect(result?.improvementAreas).toHaveLength(1);
    expect(result?.improvementAreas[0].id).toBeTruthy();
    expect(result?.improvementAreas[0].keywords).toEqual(['AWS', 'Cloud']);
    expect(result?.createdAt).toBeTruthy();
  });

  it('clamps an out-of-range atsScore into 0-100', () => {
    const raw = JSON.stringify({ atsScore: 140, summary: 's', strengths: [], improvementAreas: [] });
    expect(parseCritiqueResponse(raw)?.atsScore).toBe(100);
  });

  it('returns null when required fields are missing or malformed', () => {
    expect(parseCritiqueResponse(JSON.stringify({ summary: 's', strengths: [], improvementAreas: [] }))).toBeNull();
    expect(parseCritiqueResponse('not json at all')).toBeNull();
  });

  it('drops an improvement area missing a title or detail rather than failing the whole parse', () => {
    const raw = JSON.stringify({
      atsScore: 50,
      summary: 's',
      strengths: [],
      improvementAreas: [{ title: 'ok', detail: 'fine' }, { title: 'bad' }],
    });
    expect(parseCritiqueResponse(raw)?.improvementAreas).toHaveLength(1);
  });
});

describe('summarizeResumeForCritique', () => {
  it('includes populated sections and omits empty ones', () => {
    const summary = summarizeResumeForCritique(minimalResume());
    expect(summary).toContain('EXPERIENCE:');
    expect(summary).toContain('Built a service.');
    expect(summary).toContain('SKILLS:');
    expect(summary).not.toContain('PROJECTS:');
    expect(summary).not.toContain('WORKSHOPS:');
  });
});
