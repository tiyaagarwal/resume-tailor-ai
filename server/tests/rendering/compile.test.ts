import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { compileLatex } from '../../src/rendering/compile.ts';
import { renderLatex } from '../../src/rendering/latex.ts';
import type { TailoredResume } from '../../src/types/tailored.ts';

function hasEngine(): boolean {
  try {
    execFileSync(process.env.LATEX_ENGINE ?? 'pdflatex', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Text as it really arrives from parsed PDFs and model output. */
const TRICKY = 'Cut p95 latency ≥ 40% (−120 ms) for ₹2 Cr ARR ⇒ α/β tests ✓ 🚀 中文 C:\\tools {x}^2 ~ σ′\u200b';

function trickyResume(): TailoredResume {
  return {
    masterResumeId: 'master_1',
    jobDescriptionId: 'jd_1',
    personalInfo: { fullName: 'José Łukasz Ștefan', email: 'test@example.com', phone: '+91 98765 43210', location: 'Bengaluru' },
    links: { other: [] },
    summary: TRICKY,
    sectionOrder: ['experience', 'skills'],
    hiddenSections: [],
    education: [],
    skills: [{ name: 'Languages', items: ['C#', 'C++', 'F#'] }],
    experience: [
      {
        id: 'exp_1',
        kind: 'experience',
        role: 'Engineer',
        organization: 'Acme R&D',
        bullets: [{ text: TRICKY, sourceId: 'exp_1', sourceIndex: 0, original: TRICKY, relevance: 0.9 }],
        relevance: 0.9,
      },
    ],
    projects: [],
    workshops: [],
    hackathons: [],
    certifications: [],
    extraCurricular: [],
  } as TailoredResume;
}

describe.skipIf(!hasEngine())('compileLatex (needs pdflatex on PATH)', () => {
  it('compiles a resume whose text contains symbols, emoji and non-Latin scripts', async () => {
    const { pdf } = await compileLatex(renderLatex(trickyResume()));
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
  }, 60_000);
});
