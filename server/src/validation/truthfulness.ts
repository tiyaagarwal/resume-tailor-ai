import { detectSkills } from '../matching/taxonomy.ts';
import type { MasterResume } from '../types/resume.ts';
import { allSkills } from '../types/resume.ts';
import type { TailoredResume } from '../types/tailored.ts';

/**
 * A second, independent line of defence against fabrication.
 *
 * ai/tailor.ts is prompted not to invent facts and is structurally limited to
 * rewording existing bullets, but a language model's output is still not
 * something this app trusts blindly. This module re-derives, from plain text
 * comparison, whether a rewritten bullet introduced a number or a named
 * technology that was not present in its own `original` field. A generation
 * is not reported as complete while violations remain.
 */

export interface TruthfulnessResult {
  status: 'PASSED' | 'FAILED';
  violations: string[];
}

const NUMBER_RE = /\b\d[\d,]*\.?\d*%?\b/g;

function numbersIn(text: string): Set<string> {
  return new Set((text.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, '')));
}

/** Strips the `**bold**` markers the AI may add around existing key
 *  phrases/metrics (see ai/tailor.ts) before diffing, so a legitimate
 *  bold-marked rewrite of an unchanged number/technology can never look
 *  like injected content. */
function stripBoldMarkers(text: string): string {
  return text.replace(/\*\*/g, '');
}

/** Bullets may legitimately mention skills that live at the entry/master-resume level,
 *  not just verbatim in that one bullet — e.g. a project bullet naming a language
 *  declared in the candidate's skills list. Only genuinely new technology is a violation. */
function checkBullet(originalRaw: string, rewrittenRaw: string, knownSkills: Set<string>): string[] {
  const violations: string[] = [];
  const original = stripBoldMarkers(originalRaw);
  const rewritten = stripBoldMarkers(rewrittenRaw);

  const origNums = numbersIn(original);
  const newNums = [...numbersIn(rewritten)].filter((n) => !origNums.has(n));
  if (newNums.length > 0) {
    violations.push(`Introduced a number not present in the source bullet: "${newNums.join(', ')}" in "${rewritten.slice(0, 80)}"`);
  }

  const origTech = new Set(detectSkills(original).map((s) => s.toLowerCase()));
  const newTech = detectSkills(rewritten).filter(
    (s) => !origTech.has(s.toLowerCase()) && !knownSkills.has(s.toLowerCase()),
  );
  if (newTech.length > 0) {
    violations.push(`Introduced technology not present in the source bullet or skills list: "${newTech.join(', ')}" in "${rewritten.slice(0, 80)}"`);
  }

  return violations;
}

export function validateTruthfulness(master: MasterResume, tailored: TailoredResume): TruthfulnessResult {
  const knownSkills = new Set(allSkills(master.skills).map((s) => s.toLowerCase()));
  const violations: string[] = [];

  for (const group of [...tailored.experience, ...tailored.projects]) {
    for (const b of group.bullets) {
      violations.push(...checkBullet(b.original, b.text, knownSkills));
    }
  }

  // The summary is freeform prose with no single "original" to diff against,
  // so it is checked against the candidate's declared skills and role titles
  // instead: any named technology it uses must already be true of the resume.
  if (tailored.summary.trim()) {
    const mentioned = detectSkills(stripBoldMarkers(tailored.summary));
    const unknown = mentioned.filter((s) => !knownSkills.has(s.toLowerCase()));
    if (unknown.length > 0) {
      violations.push(`Summary mentions technology not found in the master resume's skills: "${unknown.join(', ')}"`);
    }
  }

  return { status: violations.length === 0 ? 'PASSED' : 'FAILED', violations };
}

/**
 * If AI rewriting produced a violation, the safest repair is reverting just
 * that bullet to its original wording — never dropping it or halting the
 * whole generation, since the original text is always truthful by
 * construction (it came verbatim from the master resume).
 */
export function revertViolatingBullets(master: MasterResume, tailored: TailoredResume): TailoredResume {
  const knownSkills = new Set(allSkills(master.skills).map((s) => s.toLowerCase()));
  const fix = <T extends { bullets: { original: string; text: string }[] }>(items: T[]): T[] =>
    items.map((item) => ({
      ...item,
      bullets: item.bullets.map((b) =>
        checkBullet(b.original, b.text, knownSkills).length > 0 ? { ...b, text: b.original } : b,
      ),
    }));

  return {
    ...tailored,
    experience: fix(tailored.experience),
    projects: fix(tailored.projects),
  };
}
