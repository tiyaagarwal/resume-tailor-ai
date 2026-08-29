import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { AppError, serverError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

const exec = promisify(execFile);
const log = logger('latex');

const ENGINE = process.env.LATEX_ENGINE ?? 'pdflatex';
const TIMEOUT_MS = 30_000;

let engineChecked: boolean | null = null;

/** Verifies the LaTeX engine exists so we can fail with a fixable message. */
export async function ensureEngine(): Promise<void> {
  if (engineChecked === true) return;
  try {
    await exec(ENGINE, ['--version'], { timeout: 10_000 });
    engineChecked = true;
  } catch {
    engineChecked = false;
    throw new AppError(
      500,
      `LaTeX engine "${ENGINE}" was not found on PATH. Install TeX Live (Debian/Ubuntu: "sudo apt-get install texlive-latex-recommended texlive-fonts-recommended"; macOS: "brew install --cask basictex") and restart the server.`,
    );
  }
}

/** Pulls the meaningful error out of a LaTeX log, which is mostly noise. */
function summarizeLatexLog(logText: string): string {
  const lines = logText.split('\n');
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('!')) {
      errors.push(lines.slice(i, i + 3).join(' ').replace(/\s+/g, ' ').trim());
      if (errors.length >= 3) break;
    }
  }
  return errors.length > 0 ? errors.join(' | ') : 'No specific error found in the LaTeX log.';
}

export interface CompileResult {
  pdf: Buffer;
  log: string;
}

/**
 * Compiles LaTeX to PDF in an isolated temp directory.
 *
 * Runs twice: the starred tabular environment with \extracolsep{\fill} used by
 * Jake's template needs a second pass for column widths to settle, otherwise
 * the right-aligned dates drift.
 */
export async function compileLatex(source: string): Promise<CompileResult> {
  await ensureEngine();
  const dir = await mkdtemp(join(tmpdir(), 'resume-latex-'));
  const texPath = join(dir, 'resume.tex');
  const pdfPath = join(dir, 'resume.pdf');
  const logPath = join(dir, 'resume.log');

  try {
    await writeFile(texPath, source, 'utf8');

    for (let pass = 0; pass < 2; pass++) {
      try {
        await exec(
          ENGINE,
          ['-interaction=nonstopmode', '-halt-on-error', '-file-line-error', 'resume.tex'],
          { cwd: dir, timeout: TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 },
        );
      } catch (err) {
        // pdflatex exits non-zero on warnings too; only a missing PDF is fatal.
        const logText = await readFile(logPath, 'utf8').catch(() => '');
        const stillOk = await readFile(pdfPath).then(
          () => true,
          () => false,
        );
        if (!stillOk) {
          log.error('compilation failed', summarizeLatexLog(logText));
          throw serverError(
            `The resume could not be rendered. LaTeX reported: ${summarizeLatexLog(logText)}`,
            { log: logText.slice(-4000) },
          );
        }
        if ((err as { killed?: boolean }).killed) {
          throw serverError('Resume rendering timed out. Please try again.');
        }
      }
    }

    const pdf = await readFile(pdfPath);
    const logText = await readFile(logPath, 'utf8').catch(() => '');
    if (pdf.length === 0) throw serverError('LaTeX produced an empty PDF.');
    return { pdf, log: logText };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
