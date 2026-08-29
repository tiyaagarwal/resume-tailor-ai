import { describe, expect, it } from 'vitest';
import { structureResume } from '../../src/parsers/structure.ts';
import { analyzeJobDescription } from '../../src/parsers/jd.ts';
import { buildJdIndex, computeAtsScore } from '../../src/matching/scoring.ts';
import { rankContent, skillsOmittedButOwned } from '../../src/matching/ranking.ts';

const RESUME_TEXT = `
Priya Nair
priya.nair@example.com | Chennai, Tamil Nadu

EXPERIENCE
Backend Engineering Intern | Zoho | Chennai
Jun 2024 -- Aug 2024
- Built REST APIs in Spring Boot backed by PostgreSQL, serving 10k+ daily requests.
- Added Redis caching that cut average response time by 40%.
- Wrote integration tests with JUnit and set up a CI/CD pipeline in Jenkins.

PROJECTS
Weather Widget | HTML, CSS, JavaScript | Jan 2024 -- Feb 2024
- Built a simple weather dashboard using the OpenWeather API and vanilla JavaScript.

TECHNICAL SKILLS
Languages: Java, Python, SQL, JavaScript
Frameworks: Spring Boot, React
Tools: Docker, Jenkins, Git
Technologies: PostgreSQL, Redis, REST APIs

CERTIFICATIONS
Oracle Certified Java Programmer, Oracle, 2024
`.trim();

const JD_TEXT = `
Backend Engineer
Company: PayFlow

Responsibilities
- Build and maintain REST APIs and backend services in Java using Spring Boot.
- Work with PostgreSQL for data modelling and query optimisation.
- Use Redis for caching in high-throughput services.
- Maintain CI/CD pipelines and write automated tests.

Requirements
- Experience with Java and Spring Boot.
- Strong SQL and PostgreSQL experience.
- Familiarity with Redis and REST API design.
- Exposure to Kubernetes is a plus.
`.trim();

describe('scoring + ranking', () => {
  const master = structureResume({ text: RESUME_TEXT, sourceFileName: 'r.txt', links: [] });
  const jd = analyzeJobDescription(JD_TEXT);
  const index = buildJdIndex(jd);

  it('ranks the strongly-matching backend internship above the unrelated project', () => {
    const ranked = rankContent(master, jd, index);
    expect(ranked.experience[0].relevance).toBeGreaterThan(ranked.projects[0]?.relevance ?? 0);
  });

  it('produces an honest ATS score that is not pinned to 100', () => {
    const ats = computeAtsScore(master, jd, index);
    expect(ats.overall).toBeGreaterThan(0);
    expect(ats.overall).toBeLessThan(100);
    expect(ats.matchedSkills.map((s) => s.toLowerCase())).toEqual(
      expect.arrayContaining(['java', 'spring boot', 'postgresql', 'redis']),
    );
  });

  it('reports Kubernetes as genuinely missing rather than silently adding it', () => {
    const ats = computeAtsScore(master, jd, index);
    expect(ats.missingFromMasterResume.map((s) => s.toLowerCase())).toContain('kubernetes');
  });

  it('never introduces a skill into the ranked output that is absent from the master resume', () => {
    const ranked = rankContent(master, jd, index);
    const shown = new Set(
      [...ranked.skills.languages, ...ranked.skills.frameworks, ...ranked.skills.tools, ...ranked.skills.technologies].map((s) =>
        s.toLowerCase(),
      ),
    );
    for (const s of shown) {
      const inMaster = [
        ...master.skills.languages,
        ...master.skills.frameworks,
        ...master.skills.tools,
        ...master.skills.technologies,
      ].some((m) => m.toLowerCase() === s);
      expect(inMaster).toBe(true);
    }
  });

  it('distinguishes "cut for space" skills from "genuinely absent" skills', () => {
    const ranked = rankContent(master, jd, index);
    const omitted = skillsOmittedButOwned(master, ranked.skills, index);
    // Every skill category here is small enough that nothing should be cut,
    // but the function must never claim the candidate owns Kubernetes.
    expect(omitted.map((s) => s.toLowerCase())).not.toContain('kubernetes');
  });

  it('orders sections deliberately, never leaving the order empty', () => {
    const ranked = rankContent(master, jd, index);
    expect(ranked.sectionOrder.length).toBeGreaterThan(0);
    expect(ranked.sectionOrder).toContain('experience');
  });
});
