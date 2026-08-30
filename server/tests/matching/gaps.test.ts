import { describe, expect, it } from 'vitest';
import { structureResume } from '../../src/parsers/structure.ts';
import { analyzeJobDescription } from '../../src/parsers/jd.ts';
import { buildJdIndex } from '../../src/matching/scoring.ts';
import { findGapFillingContent } from '../../src/matching/gaps.ts';
import type { CritiqueResult } from '../../src/types/critique.ts';
import type { TailoredResume } from '../../src/types/tailored.ts';

const SOURCE_MASTER_TEXT = `
Jordan Lee
jordan.lee@example.com

EXPERIENCE
Backend Engineer | Globex | Remote
Jan 2022 -- Present
- Built REST APIs in Python and PostgreSQL for the payments service.
- Deployed the service to a Kubernetes cluster on AWS with autoscaling under load.

PROJECTS
Analytics Dashboard | Python, AWS, Kubernetes | Jan 2023 -- Mar 2023
- Built a real-time analytics dashboard deployed on Kubernetes with an AWS-managed pipeline.

TECHNICAL SKILLS
Languages: Python
Cloud: AWS, Kubernetes, Docker
`.trim();

const JD_TEXT = `
Senior Backend Engineer
Company: Acme

Requirements
- Strong Python and PostgreSQL experience.
- Production experience with Kubernetes and AWS.
`.trim();

function tailoredFromSource(experienceId: string, bullets: string[]): TailoredResume {
  return {
    masterResumeId: 'other_master',
    jobDescriptionId: 'jd_1',
    personalInfo: { fullName: 'Jordan Lee', email: 'jordan.lee@example.com', phone: '', location: '' },
    links: { other: [] },
    summary: '',
    sectionOrder: ['experience', 'skills'],
    hiddenSections: [],
    education: [],
    skills: [{ name: 'Programming', items: ['Python'] }, { name: 'Cloud & Deployment', items: ['AWS'] }],
    experience: [
      {
        id: experienceId,
        kind: 'experience',
        role: 'Backend Engineer',
        organization: 'Globex',
        relevance: 0.8,
        bullets: bullets.map((text, i) => ({ text, sourceId: experienceId, sourceIndex: i, original: text, relevance: 0.8 })),
      },
    ],
    // No "Analytics Dashboard" project — should surface as a whole-item suggestion.
    projects: [],
    workshops: [],
    hackathons: [],
    certifications: [],
    extraCurricular: [],
  };
}

describe('findGapFillingContent', () => {
  const sourceMaster = structureResume({ text: SOURCE_MASTER_TEXT, sourceFileName: 'source.txt', links: [] });
  const jd = analyzeJobDescription(JD_TEXT);
  const index = buildJdIndex(jd);
  const critique: CritiqueResult = {
    atsScore: 55,
    summary: 'Missing hands-on cloud deployment evidence.',
    strengths: [],
    createdAt: new Date(0).toISOString(),
    improvementAreas: [
      {
        id: 'area_cloud',
        title: 'Thin cloud deployment evidence',
        detail: 'The JD wants Kubernetes/AWS production experience.',
        keywords: ['Kubernetes', 'AWS'],
      },
    ],
  };

  it('suggests a missing bullet at bullet-level when the parent role is already in the tailored resume', () => {
    const sourceExpId = sourceMaster.experience[0].id;
    // The tailored resume already has this same role, but only the first bullet.
    const tailored = tailoredFromSource(sourceExpId, ['Built REST APIs in Python and PostgreSQL for the payments service.']);

    const suggestions = findGapFillingContent(sourceMaster, critique, tailored, index);
    const bulletSuggestion = suggestions.find((s) => s.kind === 'bullet');
    expect(bulletSuggestion).toBeDefined();
    expect(bulletSuggestion?.sourceParentId).toBe(sourceExpId);
    expect(bulletSuggestion?.text).toContain('Kubernetes');
    expect(bulletSuggestion?.alreadyIncluded).toBe(false);
  });

  it('suggests a whole project when it is not present in the tailored resume at all', () => {
    const sourceExpId = sourceMaster.experience[0].id;
    const tailored = tailoredFromSource(sourceExpId, ['Built REST APIs in Python and PostgreSQL for the payments service.']);

    const suggestions = findGapFillingContent(sourceMaster, critique, tailored, index);
    const projectSuggestion = suggestions.find((s) => s.kind === 'project');
    expect(projectSuggestion).toBeDefined();
    expect(projectSuggestion?.text).toContain('Analytics Dashboard');
    expect(projectSuggestion?.alreadyIncluded).toBe(false);
  });

  it('flags a skill suggestion as already included when the tailored resume already has it', () => {
    const sourceExpId = sourceMaster.experience[0].id;
    const tailored = tailoredFromSource(sourceExpId, ['Built REST APIs in Python and PostgreSQL for the payments service.']);

    const suggestions = findGapFillingContent(sourceMaster, critique, tailored, index);
    const awsSuggestion = suggestions.find((s) => s.kind === 'skill' && s.text === 'AWS');
    expect(awsSuggestion?.alreadyIncluded).toBe(true);
  });

  it('never invents content not present in the source master resume', () => {
    const sourceExpId = sourceMaster.experience[0].id;
    const tailored = tailoredFromSource(sourceExpId, ['Built REST APIs in Python and PostgreSQL for the payments service.']);
    const suggestions = findGapFillingContent(sourceMaster, critique, tailored, index);

    const sourceText = SOURCE_MASTER_TEXT.toLowerCase();
    for (const s of suggestions) {
      // Whole-item suggestions are synthesized previews (name + first
      // bullets), so just check every bullet-level one traces verbatim.
      if (s.kind === 'bullet') {
        expect(sourceText).toContain(s.text.toLowerCase());
      }
    }
  });
});
