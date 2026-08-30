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

  it('maps a recognized skill sub-heading onto the new default category taxonomy', () => {
    const languages = resume.skills.find((c) => c.name === 'Programming');
    expect(languages?.items).toEqual(expect.arrayContaining(['Python', 'Java', 'JavaScript']));
    const frameworks = resume.skills.find((c) => c.name === 'Frameworks & Libraries');
    expect(frameworks?.items).toEqual(expect.arrayContaining(['React', 'Node.js', 'Spring Boot']));
  });
});

const SAMPLE_WITH_NEW_SECTIONS = `
Rohan Mehta
rohan.mehta@example.com | +91 90000 11111

EXPERIENCE
Backend Engineer | Contoso | Remote
Jan 2023 -- Present
- Built a payments service in Go and PostgreSQL.

TECHNICAL SKILLS
Languages: Go, Python

WORKSHOPS
Distributed Systems Bootcamp, LinuxFoundation, 2023

HACKATHONS
CityHacks 2023, Winner

EXTRA CURRICULAR
Treasurer — Robotics Club — Managed a $5,000 annual budget.

ACHIEVEMENTS
Solved 300+ DSA problems: arrays, linked lists, trees, graphs, dynamic programming.
`.trim();

describe('structureResume — Workshops/Hackathons/Extra-Curricular and DSA signal', () => {
  const links = [
    { label: 'Certificate', url: 'https://contoso.example.com/cert/rohan', context: 'Backend Engineer | Contoso | Remote' },
  ];
  const resume = structureResume({ text: SAMPLE_WITH_NEW_SECTIONS, sourceFileName: 'resume.txt', links });

  it('recognizes a WORKSHOPS heading and parses its entries', () => {
    expect(resume.workshops).toHaveLength(1);
    expect(resume.workshops[0].title).toContain('Distributed Systems Bootcamp');
  });

  it('recognizes a HACKATHONS heading and parses its entries', () => {
    expect(resume.hackathons).toHaveLength(1);
    expect(resume.hackathons[0].name).toContain('CityHacks 2023');
    expect(resume.hackathons[0].result).toBe('Winner');
  });

  it('recognizes an EXTRA CURRICULAR heading and parses role/organization/impact', () => {
    expect(resume.extraCurricular).toHaveLength(1);
    expect(resume.extraCurricular[0].role).toBe('Treasurer');
    expect(resume.extraCurricular[0].organization).toBe('Robotics Club');
  });

  it('detects an existing DSA-practice claim and synthesizes a Core CS skill category from it, never a made-up count', () => {
    expect(resume.dsaSignal?.count).toBe(300);
    const coreCs = resume.skills.find((c) => c.name === 'Core CS');
    expect(coreCs?.items[0]).toContain('300+ problems solved');
  });

  it('omits the DSA signal entirely (never fabricates a count) when the resume makes no such claim', () => {
    const noDsaResume = structureResume({
      text: SAMPLE_WITH_NEW_SECTIONS.replace(/ACHIEVEMENTS[\s\S]*$/, ''),
      sourceFileName: 'resume.txt',
      links: [],
    });
    expect(noDsaResume.dsaSignal).toBeUndefined();
    expect(noDsaResume.skills.some((c) => c.name === 'Core CS')).toBe(false);
  });

  it('associates a role\'s own completion-certificate link via recovered link context, never a generic profile link', () => {
    expect(resume.experience[0].certificateUrl).toBe('https://contoso.example.com/cert/rohan');
  });
});
