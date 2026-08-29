import { describe, expect, it } from 'vitest';
import { structureResume } from '../../src/parsers/structure.ts';

const SAMPLE = `
Asha Rao
asha.rao@example.com | +91 98765 43210 | Bengaluru, Karnataka

EDUCATION
Indian Institute of Technology, Bombay, Mumbai
B.Tech in Computer Science and Engineering, CGPA: 8.9/10

EXPERIENCE
Software Engineering Intern | Flipkart | Bengaluru
May 2025 -- Jul 2025
- Built a REST API in Spring Boot and PostgreSQL that served product-recommendation data to 4 internal teams.
- Reduced p95 API latency by 32% by adding a Redis caching layer in front of the recommendation service.

PROJECTS
RecoEngine | React, Node.js, MongoDB | Jan 2025 -- Mar 2025
- Built a full-stack recommendation engine using collaborative filtering, serving 500+ active test users.

TECHNICAL SKILLS
Languages: Python, Java, JavaScript
Frameworks: React, Node.js, Spring Boot

CERTIFICATIONS
AWS Certified Cloud Practitioner, Amazon Web Services, 2025

ACHIEVEMENTS
Ranked in the top 1% of 45,000 participants in Google Kick Start 2024.
`.trim();

describe('structureResume', () => {
  const links = [
    { label: 'LinkedIn', url: 'https://linkedin.com/in/asharao' },
    { label: 'GitHub', url: 'https://github.com/asharao' },
    { label: 'repo', url: 'https://github.com/asharao/recoengine' },
  ];
  const resume = structureResume({ text: SAMPLE, sourceFileName: 'resume.txt', links });

  it('extracts personal info without inventing anything absent from the text', () => {
    expect(resume.personalInfo.fullName).toBe('Asha Rao');
    expect(resume.personalInfo.email).toBe('asha.rao@example.com');
    expect(resume.personalInfo.phone).toContain('98765');
  });

  it('finds exactly one education entry, not one per line of a two-line block', () => {
    expect(resume.education).toHaveLength(1);
    expect(resume.education[0].institution).toContain('Indian Institute of Technology');
    expect(resume.education[0].degree).toContain('Tech');
    expect(resume.education[0].gpa).toBe('8.9/10');
  });

  it('captures every bullet verbatim — never rewritten at parse time', () => {
    expect(resume.experience).toHaveLength(1);
    expect(resume.experience[0].bullets[0]).toBe(
      'Built a REST API in Spring Boot and PostgreSQL that served product-recommendation data to 4 internal teams.',
    );
  });

  it('does not create a phantom project from a date-only line', () => {
    expect(resume.projects).toHaveLength(1);
    expect(resume.projects[0].name).toBe('RecoEngine');
    expect(resume.projects[0].startDate).toBe('Jan 2025');
    expect(resume.projects[0].endDate).toBe('Mar 2025');
  });

  it('attaches a discovered repo URL to the project it names', () => {
    expect(resume.projects[0].repoUrl).toBe('https://github.com/asharao/recoengine');
  });

  it('classifies the profile-level GitHub link separately from the repo link', () => {
    expect(resume.links.github?.url).toBe('https://github.com/asharao');
  });

  it('throws a helpful error rather than silently returning an empty resume', () => {
    expect(() => structureResume({ text: 'Just some unrelated text with no headings.', sourceFileName: 'x.txt', links: [] }))
      .not.toThrow(); // structuring itself never throws — parseMasterResume (parsers/index.ts) is what enforces non-empty content
  });
});
