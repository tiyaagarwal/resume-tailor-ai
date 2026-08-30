import type { TailoredBullet, TailoredProject } from '../types/tailored.ts';

/**
 * The custom template's Overview/Features/Tech Stack/Impact project layout
 * is a pure, render-time VIEW over a project's already truthfulness-checked
 * bullets — never new stored/tracked prose, and never independently
 * re-validated (see server/tests/validation/truthfulness.test.ts for the
 * regression test locking this in).
 */
export interface ProjectDetail {
  overview: string;
  features: TailoredBullet[];
  impact?: TailoredBullet;
  techStackLine: string;
}

const HAS_METRIC_RE = /\d/;

export function bucketProject(p: TailoredProject): ProjectDetail {
  const bullets = [...p.bullets];

  // The highest-relevance bullet that carries a number becomes the Impact
  // line — a project's most quantified claim is its most credible one.
  const impactIndex = bullets
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => HAS_METRIC_RE.test(b.text))
    .sort((a, b) => b.b.relevance - a.b.relevance)[0]?.i;
  const impact = impactIndex !== undefined ? bullets[impactIndex] : undefined;

  const remaining = bullets.filter((_, i) => i !== impactIndex);
  const overview = p.tagline?.trim() || remaining[0]?.text || p.name;
  const features = p.tagline?.trim() ? remaining : remaining.slice(1);

  return {
    overview,
    features,
    impact,
    techStackLine: p.technologies.join(' · '),
  };
}
