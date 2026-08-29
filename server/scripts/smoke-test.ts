/**
 * scripts/smoke-test.ts
 *
 * Not part of the shipped app. This exercises the real pipeline modules
 * end-to-end against sample data, using the real pdflatex binary and the real
 * pdf-lib / docx packages, to prove — not merely assert — that:
 *   - master-resume text structuring works,
 *   - job-description analysis + relevance scoring works,
 *   - content ranking/selection stays grounded in the master resume,
 *   - the Jake's Resume LaTeX template compiles,
 *   - the one-page optimizer converges,
 *   - every expected hyperlink is present as a real PDF annotation,
 *   - DOCX export succeeds.
 *
 * Run with: tsx scripts/smoke-test.ts   (from server/)
 */
import { writeFile } from 'node:fs/promises';
import { structureResume } from '../src/parsers/structure.ts';
import { analyzeJobDescription } from '../src/parsers/jd.ts';
import { buildJdIndex, computeAtsScore } from '../src/matching/scoring.ts';
import { rankContent } from '../src/matching/ranking.ts';
import { composeTailoredResume } from '../src/pipeline/compose.ts';
import { optimizeToOnePage } from '../src/validation/optimizer.ts';
import { expectedLinks } from '../src/rendering/latex.ts';
import { validateLinks, getPageCount } from '../src/validation/pdf.ts';
import { renderDocx } from '../src/rendering/docx.ts';
import { validateTruthfulness } from '../src/validation/truthfulness.ts';

const SAMPLE_RESUME_TEXT = `
Asha Rao
asha.rao@example.com | +91 98765 43210 | Bengaluru, Karnataka
linkedin.com/in/asharao | github.com/asharao | asharao.dev | leetcode.com/u/asharao

EDUCATION
Indian Institute of Technology, Bombay, Mumbai
B.Tech in Computer Science and Engineering, CGPA: 8.9/10
Aug 2022 -- May 2026
Relevant Coursework: Data Structures, Algorithms, Operating Systems, Distributed Systems, Machine Learning

EXPERIENCE
Software Engineering Intern | Flipkart | Bengaluru
May 2025 -- Jul 2025
- Built a REST API in Spring Boot and PostgreSQL that served product-recommendation data to 4 internal teams.
- Reduced p95 API latency by 32% by adding a Redis caching layer in front of the recommendation service.
- Wrote unit and integration tests with JUnit, raising service coverage from 61% to 88%.
- Containerised the service with Docker and deployed it to a Kubernetes cluster via GitHub Actions CI/CD.

INTERNSHIPS
Machine Learning Intern | Sprinklr | Remote
Jan 2025 -- Apr 2025
- Fine-tuned a PyTorch text-classification model on customer support tickets, improving F1 score from 0.71 to 0.84.
- Built a data pipeline in Python and Airflow to ingest and clean 2M+ support tickets weekly.

PROJECTS
RecoEngine | React, Node.js, MongoDB | Jan 2025 -- Mar 2025
- Built a full-stack recommendation engine using collaborative filtering, serving 500+ active test users.
- Designed a Node.js/Express API with MongoDB and deployed it on AWS EC2 behind an Nginx reverse proxy.

ChatRAG | Python, LangChain, FAISS, FastAPI | Sep 2024 -- Dec 2024
- Built a retrieval-augmented generation chatbot over internal docs using LangChain, FAISS and FastAPI.
- Indexed 10,000+ documents and reduced average query latency to under 400ms with a FAISS vector index.

TECHNICAL SKILLS
Languages: Python, Java, JavaScript, TypeScript, SQL, C++
Frameworks: React, Node.js, Express, Spring Boot, Django, PyTorch
Tools: Docker, Kubernetes, Git, GitHub Actions, AWS, Postman
Technologies: PostgreSQL, MongoDB, Redis, FAISS, REST APIs, Microservices

CERTIFICATIONS
AWS Certified Cloud Practitioner, Amazon Web Services, 2025
Deep Learning Specialization, Coursera, 2024

ACHIEVEMENTS
Ranked in the top 1% of 45,000 participants in Google Kick Start 2024.
Won 1st place at IIT Bombay's 36-hour hackathon (2024) among 120 teams.
`;

const SAMPLE_JD_TEXT = `
Backend Software Engineer — Payments Platform
Company: Razorpay
Location: Remote

About the Role
Razorpay's Payments Platform team builds the transactional core that moves money for
millions of Indian businesses. You will own backend services end to end.

Responsibilities
- Design and build scalable REST APIs and microservices that handle high transaction volume.
- Model data in PostgreSQL and optimise queries, indexes and schema migrations.
- Use Redis for caching and idempotency in distributed payment flows.
- Write unit and integration tests and maintain CI/CD pipelines.
- Containerise services with Docker and deploy to Kubernetes.

Requirements
- 0-2 years building backend services in Java, Python, or a similar language.
- Hands-on experience with Spring Boot or a comparable backend framework.
- Strong SQL skills and experience with PostgreSQL or MySQL.
- Experience with Docker and container orchestration (Kubernetes preferred).
- Familiarity with CI/CD pipelines (GitHub Actions, Jenkins, or similar).

Preferred Qualifications
- Experience with Redis or another in-memory cache.
- Exposure to microservices architecture and distributed systems.
- Familiarity with AWS.
`;

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  \x1b[32m\u2713\x1b[0m ${msg}`);
}

async function main(): Promise<void> {
  console.log('\n=== 1. Structuring master resume (zero-dependency parser) ===');
  const master = structureResume({
    text: SAMPLE_RESUME_TEXT.trim(),
    sourceFileName: 'asha-rao-resume.txt',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/asharao' },
      { label: 'GitHub', url: 'https://github.com/asharao' },
      { label: 'Portfolio', url: 'https://asharao.dev' },
      { label: 'LeetCode', url: 'https://leetcode.com/u/asharao' },
      { label: 'repo', url: 'https://github.com/asharao/recoengine' },
      { label: 'live', url: 'https://recoengine.asharao.dev' },
    ],
  });
  assert(master.personalInfo.fullName === 'Asha Rao', `name parsed: "${master.personalInfo.fullName}"`);
  assert(master.experience.length === 1, `experience entries found: ${master.experience.length}`);
  assert(master.internships.length === 1, `internship entries found: ${master.internships.length}`);
  assert(master.projects.length === 2, `project entries found: ${master.projects.length}`);
  assert(master.education.length === 1, `education entries found: ${master.education.length}`);
  assert(!!master.links.github, `GitHub link classified: ${master.links.github?.url}`);
  assert(!!master.links.linkedin, `LinkedIn link classified: ${master.links.linkedin?.url}`);
  assert(master.projects[0].repoUrl === 'https://github.com/asharao/recoengine', 'project repo link attached to RecoEngine');

  console.log('\n=== 2. Analysing job description (zero-dependency parser) ===');
  const jd = analyzeJobDescription(SAMPLE_JD_TEXT.trim());
  assert(jd.jobTitle.toLowerCase().includes('backend'), `job title detected: "${jd.jobTitle}"`);
  assert(jd.company === 'Razorpay', `company detected: "${jd.company}"`);
  assert(jd.requiredSkills.length > 0, `required skills detected: ${jd.requiredSkills.join(', ')}`);
  assert(jd.seniority === 'entry', `seniority detected: ${jd.seniority}`);
  assert(jd.domain === 'backend', `domain detected: ${jd.domain}`);

  console.log('\n=== 3. Relevance matching + ranking ===');
  const index = buildJdIndex(jd);
  const ranked = rankContent(master, jd, index);
  assert(ranked.experience.length > 0, `experience ranked and kept: ${ranked.experience.length}`);
  assert(
    ranked.experience[0].relevance >= (ranked.internships[0]?.relevance ?? 0),
    'the Flipkart backend internship outranks the ML internship for a backend JD',
  );
  const ats = computeAtsScore(master, jd, index);
  console.log(`  ATS match score: ${ats.overall}/100 (skills ${ats.skillCoverage}, keywords ${ats.keywordCoverage})`);
  assert(ats.overall > 0 && ats.overall <= 100, 'ATS score is an honest 0-100 value, not hardcoded to 100');

  console.log('\n=== 4. Composing tailored resume (deterministic, 100% grounded) ===');
  const baseline = composeTailoredResume(master, jd, ranked);
  for (const group of [...baseline.experience, ...baseline.internships, ...baseline.projects]) {
    for (const b of group.bullets) {
      assert(SAMPLE_RESUME_TEXT.includes(b.text), `bullet text traces verbatim to the master resume: "${b.text.slice(0, 50)}..."`);
    }
  }

  console.log('\n=== 5. Truthfulness validation on the untouched baseline ===');
  const truthfulness = validateTruthfulness(master, baseline);
  assert(truthfulness.status === 'PASSED', `truthfulness status: ${truthfulness.status}`);

  console.log('\n=== 6. Rendering Jake\'s Resume LaTeX -> compiling with REAL pdflatex ===');
  const optimized = await optimizeToOnePage(baseline);
  assert(optimized.pageCount === 1, `final PDF page count: ${optimized.pageCount} (must be exactly 1)`);
  console.log(`  optimization passes applied: ${optimized.steps.length}`);
  for (const step of optimized.steps) console.log(`    pass ${step.pass}: ${step.action} -> ${step.detail}`);

  await writeFile('/tmp/smoke-test-resume.pdf', optimized.pdf);
  const independentPageCount = await getPageCount(optimized.pdf);
  assert(independentPageCount === 1, `independent pdf-lib page-count recheck: ${independentPageCount}`);

  console.log('\n=== 7. Hyperlink validation on the compiled PDF (real /Annots extraction via pdf-lib) ===');
  const expected = expectedLinks(optimized.resume);
  console.log(`  expecting ${expected.length} links: ${expected.map((l) => l.label).join(', ')}`);
  const linkResult = await validateLinks(optimized.pdf, expected);
  console.log(`  ${JSON.stringify({ expected_links: linkResult.expectedLinks, found_links: linkResult.foundLinks, valid_links: linkResult.validLinks, status: linkResult.status }, null, 2)}`);
  assert(linkResult.status === 'PASSED', `hyperlink validation status: ${linkResult.status}`);
  assert(linkResult.validLinks === expected.length, `all ${expected.length} expected links are real, clickable PDF annotations`);

  console.log('\n=== 8. DOCX export (real docx package) ===');
  const docxBuffer = await renderDocx(optimized.resume);
  assert(docxBuffer.length > 1000, `DOCX file generated: ${docxBuffer.length} bytes`);
  await writeFile('/tmp/smoke-test-resume.docx', docxBuffer);

  console.log('\n\x1b[32m\x1b[1mALL SMOKE TESTS PASSED\x1b[0m');
  console.log('PDF written to  /tmp/smoke-test-resume.pdf');
  console.log('DOCX written to /tmp/smoke-test-resume.docx');
}

main().catch((err) => {
  console.error('\n\x1b[31mSMOKE TEST FAILED\x1b[0m');
  console.error(err);
  process.exit(1);
});
