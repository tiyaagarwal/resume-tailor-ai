import { env } from '../config/env.ts';
import { upstream } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

const log = logger('claude');
const API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export interface ClaudeCallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** 0 for deterministic, factual rewriting — this app never wants creative drift. */
  temperature?: number;
}

/**
 * Calls Claude and returns the raw text of its reply.
 *
 * Deliberately minimal: one system prompt, one user turn, no tool use. The
 * tailoring prompt asks for JSON-only output; parsing and validating that
 * output is the caller's job (see ai/tailor.ts), because a network client
 * should not also be a truthfulness gate.
 */
export async function callClaude(opts: ClaudeCallOptions): Promise<string> {
  if (!env.anthropicApiKey) {
    throw upstream('ANTHROPIC_API_KEY is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: opts.maxTokens ?? 2000,
        temperature: opts.temperature ?? 0,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.error(`Claude API error ${res.status}`, body.slice(0, 500));
      throw upstream(`The Claude API returned an error (HTTP ${res.status}).`, { body: body.slice(0, 500) });
    }

    const data = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
    };
    const text = data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('\n')
      .trim();

    if (!text) throw upstream('Claude returned an empty response.');
    return text;
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw upstream('The Claude API call timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/** Strips a ```json fence if the model added one despite being told not to. */
export function stripJsonFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}
