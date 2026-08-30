import type { CritiqueImprovementArea, CritiqueResult, GapSuggestion } from '../types/critique.ts';
import type { MasterResume } from '../types/resume.ts';
import type { TailoredResume } from '../types/tailored.ts';
import { newId } from '../utils/id.ts';
import { skillKey } from '../utils/text.ts';
import type { JdIndex } from './scoring.ts';
import { scoreText } from './scoring.ts';

/**
 * Searches a (possibly different, bigger) master resume for real content
 * that would address a critique's improvement areas — never a JD keyword,
 * never AI invention, always verbatim text the user actually wrote about
 * themselves somewhere. Reuses the existing scoreText() relevance scorer;
 * no new scoring primitive is needed.
 */

const MAX_SUGGESTIONS_PER_AREA = 4;
const MIN_RELEVANCE = 0.12;

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** General JD relevance (scoreText) blended with how directly the text
 *  matches THIS specific improvement area's own keywords — a skill or
 *  bullet the area explicitly names should outrank one that's merely
 *  JD-adjacent. */
function areaRelevance(text: string, area: CritiqueImprovementArea, index: JdIndex): number {
  const base = scoreText(text, index).score;
  const lower = text.toLowerCase();
  const hits = area.keywords.filter((k) => k.trim() && lower.includes(k.toLowerCase())).length;
  const keywordBonus = area.keywords.length > 0 ? hits / area.keywords.length : 0;
  return Math.max(0, Math.min(1, base * 0.5 + keywordBonus * 0.5));
}

function findTailoredParent(candidates: Array<{ id: string; key: string }>, key: string): string | undefined {
  return candidates.find((c) => c.key === key)?.id;
}

type ScoredCandidate = Omit<GapSuggestion, 'id' | 'areaId'>;

export function findGapFillingContent(
  sourceMaster: MasterResume,
  critique: CritiqueResult,
  tailored: TailoredResume,
  index: JdIndex,
): GapSuggestion[] {
  const suggestions: GapSuggestion[] = [];

  const tailoredExperienceKeys = tailored.experience.map((e) => ({
    id: e.id,
    key: normalizeKey(`${e.role}|${e.organization}`),
  }));
  const tailoredProjectKeys = tailored.projects.map((p) => ({ id: p.id, key: normalizeKey(p.name) }));

  const tailoredBulletTexts = new Set(
    [...tailored.experience, ...tailored.projects].flatMap((g) => g.bullets.map((b) => normalizeKey(b.original))),
  );
  const tailoredSkillKeys = new Set(
    tailored.skills.flatMap((c) => [...c.items, ...(c.fabricated ?? [])]).map((s) => skillKey(s)),
  );
  const tailoredCertKeys = new Set(tailored.certifications.map((c) => normalizeKey(c.name)));
  const tailoredWorkshopKeys = new Set(tailored.workshops.map((w) => normalizeKey(w.title)));
  const tailoredHackathonKeys = new Set(tailored.hackathons.map((h) => normalizeKey(h.name)));
  const tailoredExtraCurricularKeys = new Set(tailored.extraCurricular.map((e) => normalizeKey(e.impact)));

  for (const area of critique.improvementAreas) {
    const scored: ScoredCandidate[] = [];

    // Experience + internships: bullet-level if the role is already in the
    // tailored resume, whole-item if it isn't.
    for (const e of [...sourceMaster.experience, ...sourceMaster.internships]) {
      const parentId = findTailoredParent(tailoredExperienceKeys, normalizeKey(`${e.role}|${e.organization}`));
      if (parentId) {
        for (const bulletText of e.bullets) {
          const relevance = areaRelevance(bulletText, area, index);
          if (relevance < MIN_RELEVANCE) continue;
          scored.push({
            kind: 'bullet',
            sourceId: e.id,
            sourceParentId: parentId,
            text: bulletText,
            relevance,
            alreadyIncluded: tailoredBulletTexts.has(normalizeKey(bulletText)),
          });
        }
      } else {
        const relevance = areaRelevance([e.role, e.organization, ...e.bullets].join(' '), area, index);
        if (relevance < MIN_RELEVANCE) continue;
        scored.push({
          kind: 'experience',
          sourceId: e.id,
          text: `${e.role} — ${e.organization}: ${e.bullets.slice(0, 2).join(' | ')}`,
          relevance,
          alreadyIncluded: false,
        });
      }
    }

    // Projects: same bullet-level-vs-whole-item pattern.
    for (const p of sourceMaster.projects) {
      const parentId = findTailoredParent(tailoredProjectKeys, normalizeKey(p.name));
      if (parentId) {
        for (const bulletText of p.bullets) {
          const relevance = areaRelevance(bulletText, area, index);
          if (relevance < MIN_RELEVANCE) continue;
          scored.push({
            kind: 'bullet',
            sourceId: p.id,
            sourceParentId: parentId,
            text: bulletText,
            relevance,
            alreadyIncluded: tailoredBulletTexts.has(normalizeKey(bulletText)),
          });
        }
      } else {
        const relevance = areaRelevance([p.name, p.tagline ?? '', ...p.bullets].join(' '), area, index);
        if (relevance < MIN_RELEVANCE) continue;
        scored.push({
          kind: 'project',
          sourceId: p.id,
          text: `${p.name}${p.tagline ? ` — ${p.tagline}` : ''}: ${p.bullets.slice(0, 2).join(' | ')}`,
          relevance,
          alreadyIncluded: false,
        });
      }
    }

    // Skills — always whole-item.
    for (const cat of sourceMaster.skills) {
      for (const item of cat.items) {
        const relevance = areaRelevance(item, area, index);
        if (relevance < MIN_RELEVANCE) continue;
        scored.push({
          kind: 'skill',
          sourceId: cat.name,
          text: item,
          relevance,
          alreadyIncluded: tailoredSkillKeys.has(skillKey(item)),
        });
      }
    }

    // Certifications, workshops, hackathons — always whole-item.
    for (const c of sourceMaster.certifications) {
      const relevance = areaRelevance(`${c.name} ${c.issuer ?? ''}`, area, index);
      if (relevance < MIN_RELEVANCE) continue;
      scored.push({
        kind: 'certification',
        sourceId: c.id,
        text: [c.name, c.issuer].filter(Boolean).join(' — '),
        relevance,
        alreadyIncluded: tailoredCertKeys.has(normalizeKey(c.name)),
      });
    }
    for (const w of sourceMaster.workshops) {
      const relevance = areaRelevance(`${w.title} ${w.organizer ?? ''} ${w.description ?? ''}`, area, index);
      if (relevance < MIN_RELEVANCE) continue;
      scored.push({
        kind: 'workshop',
        sourceId: w.id,
        text: w.title,
        relevance,
        alreadyIncluded: tailoredWorkshopKeys.has(normalizeKey(w.title)),
      });
    }
    for (const h of sourceMaster.hackathons) {
      const relevance = areaRelevance(`${h.name} ${h.result ?? ''} ${h.description ?? ''}`, area, index);
      if (relevance < MIN_RELEVANCE) continue;
      scored.push({
        kind: 'hackathon',
        sourceId: h.id,
        text: h.name,
        relevance,
        alreadyIncluded: tailoredHackathonKeys.has(normalizeKey(h.name)),
      });
    }

    // Extra curricular + achievements (achievements fold into extraCurricular
    // at compose time already — see pipeline/compose.ts).
    for (const e of [
      ...sourceMaster.extraCurricular,
      ...sourceMaster.achievements.map((a) => ({ id: a.id, impact: a.text })),
    ]) {
      const relevance = areaRelevance(e.impact, area, index);
      if (relevance < MIN_RELEVANCE) continue;
      scored.push({
        kind: 'extracurricular',
        sourceId: e.id,
        text: e.impact,
        relevance,
        alreadyIncluded: tailoredExtraCurricularKeys.has(normalizeKey(e.impact)),
      });
    }

    scored.sort((a, b) => b.relevance - a.relevance);
    for (const s of scored.slice(0, MAX_SUGGESTIONS_PER_AREA)) {
      suggestions.push({ id: newId('gapsug'), areaId: area.id, ...s });
    }
  }

  return suggestions;
}
