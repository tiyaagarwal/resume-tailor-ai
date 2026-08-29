import { describe, expect, it } from 'vitest';
import { structureResume } from '../../src/parsers/structure.ts';
import { analyzeJobDescription } from '../../src/parsers/jd.ts';
import { buildJdIndex } from '../../src/matching/scoring.ts';
import { rankContent } from '../../src/matching/ranking.ts';
import { composeTailoredResume } from '../../src/pipeline/compose.ts';
import { optimizeToOnePage } from '../../src/validation/optimizer.ts';
import { expectedLinks } from '../../src/rendering/latex.ts';
import { getPageCount, validateLinks } from '../../src/validation/pdf.ts';

/**
 * This is deliberately an integration test, not a unit test: it shells out to
 * the real `pdflatex` binary and reads the real compiled PDF with `pdf-lib`.
 * The one-page and hyperlink requirements are the two hard constraints of the
 * whole project, so asserting on real compiled output is worth the extra
 * runtime — a mock here would only prove the mock was self-consistent.
 */

function buildOverstuffedMaster() {
  const bullets = (n: number, label: string) =>
    Array.from({ length: n }, (_, i) => `- Delivered ${label} initiative ${i + 1} by designing and implementing a highly scalable backend service using Python, React, PostgreSQL, Redis and Docker, which significantly improved system reliability, maintainability and overall developer velocity across three engineering teams.`).join('\n');

  const text = `
Jordan Lee
jordan.lee@example.com | +1 555 000 1111 | Remote

EDUCATION
State University, Remote
B.S. in Computer Science, CGPA: 3.8/4.0

EXPERIENCE
Software Engineer | Globex | Remote
Jan 2021 -- Present
${bullets(6, 'backend')}

Software Engineer | Initech | Remote
Jan 2019 -- Dec 2020
${bullets(6, 'platform')}

PROJECTS
Alpha | Python, React, PostgreSQL | Jan 2020 -- Mar 2020
${bullets(4, 'alpha')}

Beta | Python, React, PostgreSQL | Apr 2020 -- Jun 2020
${bullets(4, 'beta')}

Gamma | Python, React, PostgreSQL | Jul 2020 -- Sep 2020
${bullets(4, 'gamma')}

TECHNICAL SKILLS
Languages: Python, Java, JavaScript, TypeScript, Go, C++, C#, Ruby, PHP, Kotlin, Swift, Rust
Frameworks: React, Node.js, Django, Flask, Spring Boot, Express, Next.js, Angular, Vue, Rails
Tools: Docker, Kubernetes, Git, Jenkins, Terraform, AWS, GCP, Azure, Postman, Jira
Technologies: PostgreSQL, MongoDB, Redis, Kafka, GraphQL, REST APIs, Microservices, Elasticsearch

CERTIFICATIONS
AWS Certified Solutions Architect, Amazon, 2023
Certified Kubernetes Administrator, CNCF, 2022
Google Cloud Professional Engineer, Google, 2021

ACHIEVEMENTS
Speaker at RegionalConf 2023 on distributed systems.
Published an internal engineering blog post read by 5,000+ engineers.
Mentored 8 junior engineers over two years.
`.trim();

  return structureResume({
    text,
    sourceFileName: 'jordan-lee.txt',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/jordanlee' },
      { label: 'GitHub', url: 'https://github.com/jordanlee' },
    ],
  });
}

describe('one-page optimization + PDF validation (integration)', () => {
  it('always converges to exactly one page, even from deliberately overstuffed content', async () => {
    const master = buildOverstuffedMaster();
    const jd = analyzeJobDescription(`
Senior Backend Engineer
Company: Acme Corp

Responsibilities
- Design backend services in Python and PostgreSQL.
- Build APIs consumed by React frontends.

Requirements
- 4+ years with Python, React and PostgreSQL.
- Experience with Docker and Kubernetes.
`);
    const index = buildJdIndex(jd);
    const ranked = rankContent(master, jd, index);
    const baseline = composeTailoredResume(master, jd, ranked);

    const result = await optimizeToOnePage(baseline);
    expect(result.pageCount).toBe(1);

    const recheck = await getPageCount(result.pdf);
    expect(recheck).toBe(1);
  });

  it('every expected hyperlink is a real, valid PDF annotation after optimization', async () => {
    const master = buildOverstuffedMaster();
    const jd = analyzeJobDescription(`
Backend Engineer
Company: Acme Corp
Requirements
- Python, React, PostgreSQL experience.
`);
    const index = buildJdIndex(jd);
    const ranked = rankContent(master, jd, index);
    const baseline = composeTailoredResume(master, jd, ranked);
    const result = await optimizeToOnePage(baseline);

    const expected = expectedLinks(result.resume);
    const validation = await validateLinks(result.pdf, expected);

    expect(validation.status).toBe('PASSED');
    expect(validation.invalidLinks).toHaveLength(0);
    expect(validation.validLinks).toBe(expected.length);
  });
});
