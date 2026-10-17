import { describe, expect, it } from 'vitest';
import { summarizeLatexLog } from '../../src/rendering/compile.ts';

describe('summarizeLatexLog', () => {
  it('finds errors in -file-line-error format', () => {
    const log = [
      '(./resume.tex',
      './resume.tex:57: LaTeX Error: Unicode character ≥ (U+2265)',
      '               not set up for use with LaTeX.',
      '',
      'See the LaTeX manual or LaTeX Companion for explanation.',
    ].join('\n');
    expect(summarizeLatexLog(log)).toBe(
      './resume.tex:57: LaTeX Error: Unicode character ≥ (U+2265) not set up for use with LaTeX.',
    );
  });

  it('still finds classic "!" errors', () => {
    expect(summarizeLatexLog('! Undefined control sequence.\nl.12 \\foo\n')).toBe('! Undefined control sequence. l.12 \\foo');
  });

  it('says so when there is nothing to report', () => {
    expect(summarizeLatexLog('all good')).toBe('No specific error found in the LaTeX log.');
  });
});
