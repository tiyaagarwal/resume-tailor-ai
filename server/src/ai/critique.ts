import type { JobDescription } from '../types/jd.ts';
import type { CritiqueResult } from '../types/critique.ts';
import type { TailoredResume } from '../types/tailored.ts';
import { upstream } from '../utils/errors.ts';
import { newId, nowIso } from '../utils/id.ts';
import { logger } from '../utils/logger.ts';
import { callClaude, stripJsonFence } from './claudeClient.ts';

const log = logger('critique');

/**
 * Asks Claude to act as a strict reviewer of an already-tailored resume
 * against the job description it was tailored for: an honest ATS-style
 * score, genuine strengths, and a ranked list of concrete improvement areas.
 * Unlike ai/tailor.ts, this has no offline heuristic fallback — "be a
 * critic" is meaningless without an LLM, so a missing API key or an
 * unparseable response surfaces as a real error rather than a degraded
 * result.
 */

export function summarizeResumeForCritique(r: TailoredResume): string {
  const lines: string[] = [];
  lines.push(`Name: ${r.personalInfo.fullName}`);
  if (r.summary.trim()) lines.push(`Summary: ${r.summary.trim()}`);

  if (r.education.length > 0) {
    lines.push('EDUCATION:');
    for (const e of r.education) {
      lines.push(`- ${e.degree} — ${e.institution}${e.gpa ? `, GPA ${e.gpa}` : ''}`);
    }
  }

  if (r.skills.length > 0) {
    lines.push('SKILLS:');
    for (const c of r.skills) {
      lines.push(`- ${c.name}: ${[...c.items, ...(c.fabricated ?? [])].join(', ')}`);
    }
  }

  if (r.experience.length > 0) {
    lines.push('EXPERIENCE:');
    for (const e of r.experience) {
      const dates = [e.startDate, e.endDate].filter(Boolean).join(' - ');
      lines.push(`- ${e.role} at ${e.organization}${dates ? ` (${dates})` : ''}`);
      for (const b of e.bullets) lines.push(`  * ${b.text}`);
    }
  }

  if (r.projects.length > 0) {
    lines.push('PROJECTS:');
    for (const p of r.projects) {
      lines.push(`- ${p.name}${p.tagline ? ` — ${p.tagline}` : ''}${p.technologies.length ? ` [${p.technologies.join(', ')}]` : ''}`);
      for (const b of p.bullets) lines.push(`  * ${b.text}`);
    }
  }

  if (r.workshops.length > 0) {
    lines.push('WORKSHOPS:');
    for (const w of r.workshops) lines.push(`- ${w.title}`);
  }

  if (r.hackathons.length > 0) {
    lines.push('HACKATHONS:');
    for (const h of r.hackathons) lines.push(`- ${h.name}${h.result ? ` (${h.result})` : ''}`);
  }

  if (r.certifications.length > 0) {
    lines.push('CERTIFICATIONS:');
    for (const c of r.certifications) lines.push(`- ${c.name}${c.issuer ? ` — ${c.issuer}` : ''}`);
  }

  if (r.extraCurricular.length > 0) {
    lines.push('EXTRA CURRICULAR:');
    for (const e of r.extraCurricular) lines.push(`- ${e.impact}`);
  }

  return lines.join('\n');
}

function buildPrompt(tailored: TailoredResume, jd: JobDescription): { system: string; user: string } {
  const system = `You are a strict, senior technical recruiter and ATS reviewer. You evaluate a candidate's resume against a specific job description with honest, critical judgment — you are not here to be encouraging, you are here to be useful. Score fairly: a mediocre match should score in the 40s-60s, not the 80s, and a strong match should still name real gaps if any exist. Every improvement area you list must be concrete and actionable, tied to something specific the job description asks for that the resume under-serves — never vague filler like "add more detail" or "use stronger verbs" with nothing to point at. Respond with ONLY a JSON object, no prose, no markdown fences.`;

  const user = `Job title: ${jd.jobTitle}
Company: ${jd.company}
Required skills: ${jd.requiredSkills.join(', ') || 'none listed'}
Preferred skills: ${jd.preferredSkills.join(', ') || 'none listed'}
ATS keywords: ${jd.atsKeywords.slice(0, 25).join(', ') || 'none listed'}
Responsibilities: ${jd.responsibilities.join(' ') || 'none listed'}
Qualifications: ${jd.qualifications.join(' ') || 'none listed'}

Candidate's tailored resume:
${summarizeResumeForCritique(tailored)}

Return exactly this JSON shape:
{
  "atsScore": <integer 0-100, your own honest assessment of how well this resume matches this specific job>,
  "summary": "2-3 sentence overall verdict",
  "strengths": ["specific genuine strength", "..."],
  "improvementAreas": [
    { "title": "short label", "detail": "what is missing or weak and why it matters for this specific job", "keywords": ["relevant", "job description", "terms"] }
  ]
}
Limit strengths to at most 5 and improvementAreas to at most 6, ordered most important first.`;

  return { system, user };
}

interface RawCritiqueResponse {
  atsScore: number;
  summary: string;
  strengths: string[];
  improvementAreas: Array<{ title: string; detail: string; keywords?: string[] }>;
}

export function parseCritiqueResponse(raw: string): CritiqueResult | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as RawCritiqueResponse;
    if (
      typeof parsed.atsScore !== 'number' ||
      typeof parsed.summary !== 'string' ||
      !Array.isArray(parsed.strengths) ||
      !Array.isArray(parsed.improvementAreas)
    ) {
      return null;
    }
    return {
      atsScore: Math.max(0, Math.min(100, Math.round(parsed.atsScore))),
      summary: parsed.summary.trim(),
      strengths: parsed.strengths.filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
      improvementAreas: parsed.improvementAreas
        .filter((a) => a && typeof a.title === 'string' && typeof a.detail === 'string')
        .map((a) => ({
          id: newId('gap'),
          title: a.title.trim(),
          detail: a.detail.trim(),
          keywords: Array.isArray(a.keywords) ? a.keywords.filter((k): k is string => typeof k === 'string') : [],
        })),
      createdAt: nowIso(),
    };
  } catch (err) {
    log.warn('could not parse Claude critique response as JSON', (err as Error).message);
    return null;
  }
}

export async function critiqueResume(tailored: TailoredResume, jd: JobDescription): Promise<CritiqueResult> {
  const { system, user } = buildPrompt(tailored, jd);
  const raw = await callClaude({ system, user, maxTokens: 1500 });
  const parsed = parseCritiqueResponse(raw);
  if (!parsed) {
    throw upstream('Claude returned a critique response that could not be understood. Please try again.');
  }
  return parsed;
}
