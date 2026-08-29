import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { logger } from '../utils/logger.ts';

const log = logger('config');

/**
 * Minimal .env loader (KEY=VALUE per line, '#' comments, optional quotes).
 * Hand-rolled rather than depending on the `dotenv` package: the format this
 * app needs is tiny, and every other layer of this codebase already avoids a
 * dependency wherever a few lines of code cover it just as well.
 */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '..', '.env')); // running from server/, root .env also counts

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

export const env = {
  port: Number(optional('PORT', '4000')),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  dataDir: optional('DATA_DIR', './data'),
  databaseUrl: optional('DATABASE_URL', 'file:./data/db.json'),
  latexEngine: optional('LATEX_ENGINE', 'pdflatex'),
  logLevel: optional('LOG_LEVEL', 'info'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || '',
  anthropicModel: optional('ANTHROPIC_MODEL', 'claude-sonnet-4-6'),
};

/**
 * The app is designed to degrade gracefully without an API key (the
 * deterministic heuristic engine in matching/ + pipeline/compose.ts takes
 * over), so a missing key is a warning, never a startup failure.
 */
export function reportConfig(): void {
  log.info(`listening config: port=${env.port} corsOrigin=${env.corsOrigin}`);
  if (!env.anthropicApiKey) {
    log.warn(
      'ANTHROPIC_API_KEY is not set. Tailoring will use the offline heuristic engine instead of Claude — resumes are still generated, ranked and validated, just without AI-rewritten phrasing. Set ANTHROPIC_API_KEY in .env to enable the AI engine.',
    );
  } else {
    log.info(`Claude tailoring enabled (model=${env.anthropicModel}).`);
  }
}
