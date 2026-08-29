import { describe, expect, it } from 'vitest';
import { structureResume } from '../../src/parsers/structure.ts';
import { revertViolatingBullets, validateTruthfulness } from '../../src/validation/truthfulness.ts';
import type { TailoredResume } from '../../src/types/tailored.ts';

const master = structureResume({
  text: `
Sam Doe
sam@example.com

EXPERIENCE
Engineer | Acme | Remote
Jan 2022 -- Present
- Built a caching layer using Redis.
`.trim(),
  sourceFileName: 'x.txt',
  links: [],
});

function tailoredWithBulletText(text: string): TailoredResume {
  return {
    masterResumeId: master.id,
    jobDescriptionId: 'jd',
    personalInfo: master.personalInfo,
    links: master.links,
    summary: '',
    sectionOrder: ['experience'],
    hiddenSections: [],
    education: [],
    skills: { languages: [], frameworks: [], libraries: [], tools: [], technologies: [], other: [] },
    experience: [
      {
        id: master.experience[0].id,
        kind: 'experience',
        role: 'Engineer',
        organization: 'Acme',
        bullets: [
          {
            text,
            sourceId: master.experience[0].id,
            sourceIndex: 0,
            original: 'Built a caching layer using Redis.',
            relevance: 0.5,
          },
        ],
        relevance: 0.5,
      },
    ],
    internships: [],
    projects: [],
    certifications: [],
    achievements: [],
  };
}

describe('validateTruthfulness', () => {
  it('passes a rewrite that only rephrases, adding no new facts', () => {
    const result = validateTruthfulness(master, tailoredWithBulletText('Built a Redis caching layer to speed up requests.'));
    expect(result.status).toBe('PASSED');
  });

  it('flags a fabricated metric that does not exist in the source bullet', () => {
    const result = validateTruthfulness(
      master,
      tailoredWithBulletText('Built a Redis caching layer that improved latency by 47%.'),
    );
    expect(result.status).toBe('FAILED');
    expect(result.violations.some((v) => v.includes('47'))).toBe(true);
  });

  it('flags a fabricated technology that does not exist in the source bullet or skills list', () => {
    const result = validateTruthfulness(
      master,
      tailoredWithBulletText('Built a Redis caching layer using Kubernetes for orchestration.'),
    );
    expect(result.status).toBe('FAILED');
    expect(result.violations.some((v) => v.includes('Kubernetes'))).toBe(true);
  });
});

describe('revertViolatingBullets', () => {
  it('repairs a violation by restoring the original wording, never by deleting the bullet', () => {
    const bad = tailoredWithBulletText('Built a Redis caching layer using Kubernetes that improved latency by 47%.');
    const fixed = revertViolatingBullets(master, bad);
    expect(fixed.experience[0].bullets).toHaveLength(1);
    expect(fixed.experience[0].bullets[0].text).toBe('Built a caching layer using Redis.');
    expect(validateTruthfulness(master, fixed).status).toBe('PASSED');
  });
});
