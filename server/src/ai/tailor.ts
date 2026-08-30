import type { JobDescription } from '../types/jd.ts';
import type { MasterResume } from '../types/resume.ts';
import { allSkills } from '../types/resume.ts';
import type { TailoredBullet, TailoredResume } from '../types/tailored.ts';
import { env } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { callClaude, stripJsonFence } from './claudeClient.ts';

const log = logger('tailor');

/**
 * AI rewriting operates ONLY on bullets and the summary, and ONLY on bullets
 * that composeTailoredResume() already selected from the master resume. It
 * cannot add, remove, or reassign items — that keeps invention structurally
 * impossible rather than merely prompted-against. What the model IS allowed
 * to do: tighten wording, apply the action-verb structure, and integrate JD
 * terminology that is already true of the bullet.
 */

interface BulletTask {
  id: string; // `${itemId}:${sourceIndex}`
  original: string;
  /** JD terms already found in this bullet — safe to phrase more prominently. */
  relevantTerms: string[];
}

function collectBulletTasks(resume: TailoredResume): BulletTask[] {
  const tasks: BulletTask[] = [];
  for (const group of [...resume.experience, ...resume.projects]) {
    for (const b of group.bullets) {
      if (b.locked) continue;
      tasks.push({ id: `${b.sourceId}:${b.sourceIndex}`, original: b.original, relevantTerms: [] });
    }
  }
  return tasks;
}

function buildPrompt(
  master: MasterResume,
  jd: JobDescription,
  tasks: BulletTask[],
): { system: string; user: string } {
  const system = `You rewrite resume bullet points for ATS optimization. You NEVER invent, exaggerate, or add any fact, number, technology, or outcome that is not already stated in the bullet you are given. You may: rephrase, shorten, apply an "Action verb + what was built + technology + genuine result" structure, fix grammar, and surface technology names that are already present in the bullet more prominently. You must NOT: add metrics/percentages that are not already in the text, add technologies not already in the text, change the subject of the sentence, or claim a different scope of impact. If a bullet has no genuine result stated, do not invent one — just describe the action and technology. You may wrap the 1-2 most impactful EXISTING phrases or metrics per bullet in double-asterisk markdown bold markers (e.g. "**40%**" or "**REST API**") so the renderer can bold them — never wrap text that isn't already in the bullet, and never leave a marker unbalanced. Respond with ONLY a JSON object, no prose, no markdown fences.`;

  const user = `Job title: ${jd.jobTitle}
Company: ${jd.company}
JD required skills: ${jd.requiredSkills.slice(0, 20).join(', ') || 'none listed'}
JD preferred skills: ${jd.preferredSkills.slice(0, 15).join(', ') || 'none listed'}
JD ATS keywords: ${jd.atsKeywords.slice(0, 20).join(', ') || 'none listed'}

Candidate's professional summary source material (use ONLY these facts, do not add employers/skills/degrees not listed):
- Most relevant skills: ${allSkills(master.skills).slice(0, 12).join(', ')}
- Top role: ${master.experience[0] ? `${master.experience[0].role} at ${master.experience[0].organization}` : master.internships[0] ? `${master.internships[0].role} at ${master.internships[0].organization}` : 'none'}
- Education: ${master.education[0] ? `${master.education[0].degree} — ${master.education[0].institution}` : 'none'}

Bullets to rewrite (each has an id — return every id, unchanged text is fine if already strong):
${JSON.stringify(tasks.map((t) => ({ id: t.id, text: t.original })), null, 2)}

Return exactly this JSON shape:
{
  "summary": "2-3 sentences, third person, no heading label, 320 chars max, using ONLY facts listed above, or empty string if you cannot write one truthfully",
  "bullets": [{ "id": "string matching an input id", "text": "rewritten bullet, under 220 characters, may contain **bold** markers around existing key phrases/metrics" }]
}`;

  return { system, user };
}

interface ClaudeTailorResponse {
  summary: string;
  bullets: Array<{ id: string; text: string }>;
}

function parseResponse(raw: string, tasks: BulletTask[]): ClaudeTailorResponse | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as ClaudeTailorResponse;
    if (typeof parsed.summary !== 'string' || !Array.isArray(parsed.bullets)) return null;
    const validIds = new Set(tasks.map((t) => t.id));
    parsed.bullets = parsed.bullets
      .filter((b) => typeof b.id === 'string' && validIds.has(b.id) && typeof b.text === 'string' && b.text.trim())
      .map((b) => {
        // An odd count of "**" markers means an unbalanced/malformed bold
        // span — strip all markers from that bullet rather than reject the
        // whole response over one cosmetic slip.
        const markerCount = (b.text.match(/\*\*/g) ?? []).length;
        return markerCount % 2 === 0 ? b : { ...b, text: b.text.replace(/\*\*/g, '') };
      });
    return parsed;
  } catch (err) {
    log.warn('could not parse Claude tailoring response as JSON', (err as Error).message);
    return null;
  }
}

/**
 * Applies rewritten text onto the composed baseline. Every bullet keeps its
 * `original` field, so validation/truthfulness.ts can always diff the AI's
 * phrasing against what the master resume actually says.
 */
function applyRewrites(resume: TailoredResume, response: ClaudeTailorResponse): TailoredResume {
  const byId = new Map(response.bullets.map((b) => [b.id, b.text]));
  const rewrite = (b: TailoredBullet): TailoredBullet => {
    if (b.locked) return b;
    const key = `${b.sourceId}:${b.sourceIndex}`;
    const text = byId.get(key);
    return text ? { ...b, text } : b;
  };

  return {
    ...resume,
    summary: response.summary?.trim() || resume.summary,
    experience: resume.experience.map((e) => ({ ...e, bullets: e.bullets.map(rewrite) })),
    projects: resume.projects.map((p) => ({ ...p, bullets: p.bullets.map(rewrite) })),
  };
}

export interface TailorOutcome {
  resume: TailoredResume;
  engine: 'claude' | 'heuristic';
  note?: string;
}

/**
 * Runs AI rewriting over an already-composed, already-truthful baseline.
 * Falls back to the baseline verbatim (still fully truthful, just unpolished)
 * on any error — a missing/invalid API key must never block resume generation.
 */
export async function tailorWithAi(
  master: MasterResume,
  jd: JobDescription,
  baseline: TailoredResume,
): Promise<TailorOutcome> {
  if (!env.anthropicApiKey) {
    return { resume: baseline, engine: 'heuristic', note: 'ANTHROPIC_API_KEY not set.' };
  }

  const tasks = collectBulletTasks(baseline);
  if (tasks.length === 0) {
    return { resume: baseline, engine: 'heuristic', note: 'Nothing to rewrite.' };
  }

  try {
    const { system, user } = buildPrompt(master, jd, tasks);
    const raw = await callClaude({ system, user, maxTokens: 2500 });
    const parsed = parseResponse(raw, tasks);
    if (!parsed) {
      return { resume: baseline, engine: 'heuristic', note: 'Claude response failed validation; used the deterministic baseline instead.' };
    }
    return { resume: applyRewrites(baseline, parsed), engine: 'claude' };
  } catch (err) {
    log.warn('Claude tailoring failed, falling back to heuristic baseline', (err as Error).message);
    return { resume: baseline, engine: 'heuristic', note: (err as Error).message };
  }
}
