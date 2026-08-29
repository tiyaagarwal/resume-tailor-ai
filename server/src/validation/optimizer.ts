import type { LayoutOptions } from '../rendering/latex.ts';
import { DEFAULT_LAYOUT, renderLatex } from '../rendering/latex.ts';
import { compileLatex } from '../rendering/compile.ts';
import type { OptimizationStep, TailoredResume } from '../types/tailored.ts';
import { logger } from '../utils/logger.ts';
import { getPageCount } from './pdf.ts';

const log = logger('optimizer');

/**
 * Automatic one-page enforcement.
 *
 * Content decisions come first and cosmetic ones last, so the resume loses its
 * least relevant material before it loses readability. Font and margin changes
 * are the final resort and are bounded — shrinking text until it fits would
 * produce a technically one-page resume that no recruiter can read.
 */

const MIN_LAYOUT = { fontSize: 10 as const, marginInches: 0.4, sectionSpacing: 2, itemSpacing: 0 };

interface Move {
  name: string;
  /** Applies one increment of this move; returns a description, or null. */
  apply: (r: TailoredResume, layout: LayoutOptions) => string | null;
}

const clone = (r: TailoredResume): TailoredResume => structuredClone(r);

/** Wordy phrasings that carry no information. Purely subtractive. */
const REDUNDANT_PHRASES: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, 'to'],
  [/\bwas responsible for\b/gi, ''],
  [/\bresponsible for\b/gi, ''],
  [/\bwith the goal of\b/gi, 'to'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bin an effort to\b/gi, 'to'],
  [/\ba variety of\b/gi, 'various'],
  [/\bhelped to\b/gi, 'helped'],
  [/\bworked on\b/gi, 'built'],
  [/\bmade use of\b/gi, 'used'],
  [/\butili[sz]ed\b/gi, 'used'],
  [/\bsuccessfully\b/gi, ''],
  [/\bvery\b/gi, ''],
  [/\bthat (was|were|is|are)\b/gi, ''],
  [/\s+which\s+/gi, ' '],
];

export function condenseBullet(text: string): string {
  let out = text;
  for (const [re, rep] of REDUNDANT_PHRASES) out = out.replace(re, rep);
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').trim();
}

/** All bullet-bearing items, so moves can treat them uniformly. */
function bulletGroups(r: TailoredResume) {
  return [...r.experience, ...r.internships, ...r.projects];
}

const MOVES: Move[] = [
  {
    name: 'remove-least-relevant-bullet',
    apply: (r) => {
      // Bullets are stored in descending relevance, so the last bullet of the
      // item with the most bullets is the cheapest thing on the page.
      const candidates = bulletGroups(r).filter(
        (g) => g.bullets.filter((b) => !b.locked).length > 1,
      );
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => b.bullets.length - a.bullets.length);
      const target = candidates[0];
      for (let i = target.bullets.length - 1; i >= 0; i--) {
        if (!target.bullets[i].locked) {
          const [removed] = target.bullets.splice(i, 1);
          const label = 'role' in target ? (target as { role: string }).role : (target as { name: string }).name;
          return `Removed the lowest-relevance bullet from "${label}": "${removed.text.slice(0, 60)}…"`;
        }
      }
      return null;
    },
  },
  {
    name: 'condense-wording',
    apply: (r) => {
      let changed = 0;
      for (const g of bulletGroups(r)) {
        for (const b of g.bullets) {
          if (b.locked) continue;
          const next = condenseBullet(b.text);
          if (next !== b.text && next.length > 20) {
            b.text = next;
            changed++;
          }
        }
      }
      return changed > 0 ? `Removed redundant wording from ${changed} bullet(s)` : null;
    },
  },
  {
    name: 'trim-skills',
    apply: (r) => {
      // Skill lists are relevance-ordered; drop from the tail.
      const cats = ['other', 'technologies', 'libraries', 'tools', 'frameworks', 'languages'] as const;
      for (const c of cats) {
        if (r.skills[c].length > 4) {
          const dropped = r.skills[c].pop();
          return `Removed the least relevant skill "${dropped}" from ${c}`;
        }
      }
      return null;
    },
  },
  {
    name: 'trim-achievements',
    apply: (r) => {
      if (r.achievements.length === 0) return null;
      const dropped = r.achievements.pop();
      return `Removed a lower-priority achievement: "${dropped?.text.slice(0, 50)}…"`;
    },
  },
  {
    name: 'trim-certifications',
    apply: (r) => {
      if (r.certifications.length <= 1) return null;
      const dropped = r.certifications.pop();
      return `Removed a lower-priority certification: "${dropped?.name}"`;
    },
  },
  {
    name: 'remove-least-relevant-project',
    apply: (r) => {
      if (r.projects.length <= 1) return null;
      const dropped = r.projects.pop();
      return `Removed the least relevant project "${dropped?.name}" to fit one page`;
    },
  },
  {
    name: 'tighten-spacing',
    apply: (_r, layout) => {
      if (layout.sectionSpacing > MIN_LAYOUT.sectionSpacing) {
        layout.sectionSpacing -= 2;
        return `Tightened section spacing to ${layout.sectionSpacing}pt`;
      }
      if (layout.itemSpacing > MIN_LAYOUT.itemSpacing) {
        layout.itemSpacing -= 1;
        return `Tightened bullet spacing to ${layout.itemSpacing}pt`;
      }
      return null;
    },
  },
  {
    name: 'reduce-margins',
    apply: (_r, layout) => {
      if (layout.marginInches > MIN_LAYOUT.marginInches) {
        layout.marginInches = Math.max(MIN_LAYOUT.marginInches, layout.marginInches - 0.05);
        return `Reduced page margins to ${layout.marginInches.toFixed(2)}in`;
      }
      return null;
    },
  },
  {
    name: 'reduce-font-size',
    apply: (_r, layout) => {
      if (layout.fontSize > MIN_LAYOUT.fontSize) {
        layout.fontSize = MIN_LAYOUT.fontSize;
        return `Reduced base font size to ${layout.fontSize}pt`;
      }
      return null;
    },
  },
  {
    name: 'remove-experience-bullet-floor',
    apply: (r) => {
      // Last resort before failing: allow single-bullet items to lose their
      // bullet rather than emitting a two-page resume.
      const groups = bulletGroups(r).filter((g) => g.bullets.some((b) => !b.locked));
      if (groups.length === 0) return null;
      const target = groups[groups.length - 1];
      const idx = target.bullets.findIndex((b) => !b.locked);
      if (idx < 0) return null;
      target.bullets.splice(idx, 1);
      return 'Removed a further bullet to fit the one-page limit';
    },
  },
];

export interface OptimizeResult {
  resume: TailoredResume;
  layout: LayoutOptions;
  pdf: Buffer;
  latex: string;
  pageCount: number;
  steps: OptimizationStep[];
}

const MAX_PASSES = 40;

/**
 * Renders, checks the page count, and applies one optimisation at a time until
 * the PDF is exactly one page.
 */
export async function optimizeToOnePage(
  input: TailoredResume,
  startLayout: LayoutOptions = DEFAULT_LAYOUT,
): Promise<OptimizeResult> {
  let resume = clone(input);
  const layout: LayoutOptions = { ...startLayout };
  const steps: OptimizationStep[] = [];

  let latex = renderLatex(resume, layout);
  let { pdf } = await compileLatex(latex);
  let pageCount = await getPageCount(pdf);

  let moveIndex = 0;
  let pass = 0;

  while (pageCount > 1 && pass < MAX_PASSES) {
    pass++;
    const before = pageCount;

    // Walk the move list in priority order, retrying each until exhausted.
    let description: string | null = null;
    let usedMove = '';
    const candidate = clone(resume);
    const candidateLayout = { ...layout };

    while (moveIndex < MOVES.length) {
      description = MOVES[moveIndex].apply(candidate, candidateLayout);
      if (description) {
        usedMove = MOVES[moveIndex].name;
        break;
      }
      moveIndex++;
    }

    if (!description) {
      log.warn('exhausted every optimisation move', { pageCount });
      break;
    }

    resume = candidate;
    Object.assign(layout, candidateLayout);

    latex = renderLatex(resume, layout);
    ({ pdf } = await compileLatex(latex));
    pageCount = await getPageCount(pdf);

    steps.push({
      pass,
      action: usedMove,
      detail: description,
      pageCountBefore: before,
      pageCountAfter: pageCount,
    });
    log.debug(`pass ${pass}: ${usedMove} -> ${pageCount} page(s)`);
  }

  return { resume, layout, pdf, latex, pageCount, steps };
}
