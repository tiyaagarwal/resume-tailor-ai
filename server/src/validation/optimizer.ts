import type { LayoutOptions } from '../rendering/latex.ts';
import { DEFAULT_LAYOUT, renderLatex } from '../rendering/latex.ts';
import { compileLatex } from '../rendering/compile.ts';
import type { OptimizationStep, TailoredResume } from '../types/tailored.ts';
import { logger } from '../utils/logger.ts';
import { getPageCount } from './pdf.ts';

const log = logger('optimizer');

/**
 * Automatic one-page enforcement for this app's custom template.
 *
 * Unlike a "content before cosmetics" template, this one is deliberately the
 * other way around: cosmetic compression (baseline stretch, entry/section
 * spacing, margins, font) always exhausts BEFORE anything on the page is
 * removed. Even then, only a Workshop/Hackathon, then a non-pinned Extra
 * Curricular entry, then a Certificate, then a 3rd project are cut — never
 * an Experience/Project bullet, except as the absolute last resort below,
 * which is loudly logged since reaching it means every other move failed.
 */

const MIN_LAYOUT: LayoutOptions = {
  fontSize: 10,
  marginSidesIn: 0.45,
  marginTopBottomIn: 0.35,
  baselineStretch: 0.8,
  sectionGapBeforePt: 3,
  sectionGapAfterPt: 1,
  projectEntryGapPt: 2,
  experienceEntryGapPt: 2,
};

const MIN_PROJECTS = 2;

interface Move {
  name: string;
  /** Applies one increment of this move; returns a description, or null. */
  apply: (r: TailoredResume, layout: LayoutOptions) => string | null;
}

const clone = (r: TailoredResume): TailoredResume => structuredClone(r);

/** All bullet-bearing items — used only by the last-resort move below. */
function bulletGroups(r: TailoredResume) {
  return [...r.experience, ...r.projects];
}

type NumericLayoutKey = Exclude<keyof LayoutOptions, 'fontSize'>;

function step(layout: LayoutOptions, key: NumericLayoutKey, delta: number, floor: number, unit: string): string | null {
  const current = layout[key];
  if (current <= floor) return null;
  const next = Math.max(floor, Math.round((current + delta) * 100) / 100);
  if (next === current) return null;
  layout[key] = next;
  return `Tightened ${key} to ${next}${unit}`;
}

/** Baseline stretch, spacing, margins, font — never touches content. This is
 *  the full move list for `preserveContent` mode (see `optimizeToOnePage`). */
const COSMETIC_MOVES: Move[] = [
  {
    name: 'reduce-baseline-stretch',
    apply: (_r, layout) => step(layout, 'baselineStretch', -0.02, MIN_LAYOUT.baselineStretch, ''),
  },
  {
    name: 'tighten-project-entry-gap',
    apply: (_r, layout) => step(layout, 'projectEntryGapPt', -1, MIN_LAYOUT.projectEntryGapPt, 'pt'),
  },
  {
    name: 'tighten-experience-entry-gap',
    apply: (_r, layout) => step(layout, 'experienceEntryGapPt', -1, MIN_LAYOUT.experienceEntryGapPt, 'pt'),
  },
  {
    name: 'tighten-section-gap-before',
    apply: (_r, layout) => step(layout, 'sectionGapBeforePt', -1, MIN_LAYOUT.sectionGapBeforePt, 'pt'),
  },
  {
    name: 'tighten-section-gap-after',
    apply: (_r, layout) => step(layout, 'sectionGapAfterPt', -1, MIN_LAYOUT.sectionGapAfterPt, 'pt'),
  },
  {
    name: 'reduce-side-margins',
    apply: (_r, layout) => step(layout, 'marginSidesIn', -0.02, MIN_LAYOUT.marginSidesIn, 'in'),
  },
  {
    name: 'reduce-topbottom-margins',
    apply: (_r, layout) => step(layout, 'marginTopBottomIn', -0.02, MIN_LAYOUT.marginTopBottomIn, 'in'),
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
];

/** Only reached in normal mode, never in `preserveContent` mode. Never a
 *  JD-relevant Experience/Project bullet until the absolute last resort. */
const CONTENT_MOVES: Move[] = [
  {
    name: 'remove-least-relevant-hackathon-or-workshop',
    apply: (r) => {
      if (r.hackathons.length > 0) {
        const dropped = r.hackathons.pop();
        return `Removed a lower-priority hackathon: "${dropped?.name}"`;
      }
      if (r.workshops.length > 0) {
        const dropped = r.workshops.pop();
        return `Removed a lower-priority workshop: "${dropped?.title}"`;
      }
      return null;
    },
  },
  {
    name: 'remove-least-relevant-extracurricular-non-pinned',
    apply: (r) => {
      for (let i = r.extraCurricular.length - 1; i >= 0; i--) {
        if (!r.extraCurricular[i].pinned) {
          const [removed] = r.extraCurricular.splice(i, 1);
          return `Removed a lower-priority extra-curricular entry: "${removed.impact.slice(0, 50)}…"`;
        }
      }
      return null;
    },
  },
  {
    name: 'trim-certifications',
    apply: (r) => {
      if (r.certifications.length === 0) return null;
      const dropped = r.certifications.pop();
      return `Removed a lower-priority certification: "${dropped?.name}"`;
    },
  },
  {
    name: 'drop-third-project',
    apply: (r) => {
      if (r.projects.length <= MIN_PROJECTS) return null;
      const dropped = r.projects.pop();
      return `Removed the least relevant project "${dropped?.name}" to fit one page`;
    },
  },
  {
    name: 'remove-experience-bullet-floor',
    apply: (r) => {
      // Absolute last resort. Reaching this means every cosmetic move and
      // every Workshop/Hackathon/Extra-Curricular/Certificate/3rd-project cut
      // still wasn't enough — that should be rare-to-never in practice.
      const groups = bulletGroups(r).filter((g) => g.bullets.some((b) => !b.locked));
      if (groups.length === 0) return null;
      const target = groups[groups.length - 1];
      const idx = target.bullets.findIndex((b) => !b.locked);
      if (idx < 0) return null;
      const [removed] = target.bullets.splice(idx, 1);
      log.error('last-resort bullet removal reached — every cosmetic and content-cut move was exhausted first', {
        removed: removed.text.slice(0, 60),
      });
      return 'Removed a further bullet to fit the one-page limit (last resort)';
    },
  },
];

const MOVES: Move[] = [...COSMETIC_MOVES, ...CONTENT_MOVES];

export interface OptimizeResult {
  resume: TailoredResume;
  layout: LayoutOptions;
  pdf: Buffer;
  latex: string;
  pageCount: number;
  steps: OptimizationStep[];
}

const MAX_PASSES = 40;

export interface OptimizeOptions {
  /** Walks only COSMETIC_MOVES — no Workshop/Hackathon/Extra-Curricular/
   *  Certificate/3rd-project/bullet cut is ever attempted. If cosmetics
   *  alone can't reach one page, this returns honestly with `pageCount > 1`
   *  rather than removing anything — used by the additive-regenerate flow,
   *  where the user explicitly asked that nothing be removed. */
  preserveContent?: boolean;
}

/**
 * Renders, checks the page count, and applies one optimisation at a time until
 * the PDF is exactly one page.
 */
export async function optimizeToOnePage(
  input: TailoredResume,
  startLayout: LayoutOptions = DEFAULT_LAYOUT,
  opts: OptimizeOptions = {},
): Promise<OptimizeResult> {
  let resume = clone(input);
  const layout: LayoutOptions = { ...startLayout };
  const steps: OptimizationStep[] = [];
  const moveList = opts.preserveContent ? COSMETIC_MOVES : MOVES;

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

    while (moveIndex < moveList.length) {
      description = moveList[moveIndex].apply(candidate, candidateLayout);
      if (description) {
        usedMove = moveList[moveIndex].name;
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
