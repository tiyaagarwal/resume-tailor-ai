import { describe, expect, it } from 'vitest';
import { escapeLatex, escapeUrl, expectedLinks, renderLatex } from '../../src/rendering/latex.ts';
import type { TailoredResume } from '../../src/types/tailored.ts';

function minimalResume(overrides: Partial<TailoredResume> = {}): TailoredResume {
  return {
    masterResumeId: 'master_1',
    jobDescriptionId: 'jd_1',
    personalInfo: { fullName: 'Test User', email: 'test@example.com', phone: '+1 555 123 4567', location: 'Remote' },
    links: {
      linkedin: { label: 'LinkedIn', url: 'https://linkedin.com/in/testuser' },
      github: { label: 'GitHub', url: 'https://github.com/testuser' },
      other: [],
    },
    summary: '',
    sectionOrder: ['education', 'experience', 'projects', 'skills'],
    hiddenSections: [],
    education: [],
    skills: { languages: ['C#'], frameworks: [], libraries: [], tools: [], technologies: [], other: [] },
    experience: [],
    internships: [],
    projects: [
      {
        id: 'proj_1',
        name: 'Demo',
        technologies: ['React'],
        bullets: [],
        repoUrl: 'https://github.com/testuser/demo',
        liveUrl: 'https://demo.testuser.dev',
        relevance: 0.5,
      },
    ],
    certifications: [],
    achievements: [],
    ...overrides,
  };
}

describe('escapeLatex', () => {
  it('escapes special characters that would otherwise break compilation', () => {
    expect(escapeLatex('C# & R&D at 40% (2022-2023)')).toContain('\\&');
    expect(escapeLatex('C# & R&D at 40% (2022-2023)')).toContain('\\%');
    expect(escapeLatex('50_percent')).toContain('\\_');
  });

  it('normalises smart quotes and dashes', () => {
    expect(escapeLatex('“quoted” — text')).not.toMatch(/[“”—]/);
  });
});

describe('escapeUrl', () => {
  it('percent-encodes spaces without mangling the rest of the URL', () => {
    expect(escapeUrl('https://example.com/my file')).toBe('https://example.com/my%20file');
  });
});

describe('renderLatex', () => {
  const resume = minimalResume();
  const tex = renderLatex(resume);

  it('produces a compilable single-column document shell', () => {
    expect(tex).toContain('\\documentclass');
    expect(tex).toContain('\\begin{document}');
    expect(tex).toContain('\\end{document}');
    expect(tex).not.toContain('\\begin{multicols}');
    expect(tex).not.toContain('includegraphics');
  });

  it('renders every visible section the resume declares', () => {
    expect(tex).toContain('\\section{Projects}');
    expect(tex).toContain('\\section{Technical Skills}');
  });

  it('omits a section entirely when it is hidden, rather than rendering an empty heading', () => {
    const hidden = renderLatex(minimalResume({ hiddenSections: ['skills'] }));
    expect(hidden).not.toContain('\\section{Technical Skills}');
  });
});

describe('expectedLinks', () => {
  it('lists the email, profile links, and project links as real hyperlinks the template must emit', () => {
    const resume = minimalResume();
    const links = expectedLinks(resume);
    const urls = links.map((l) => l.url);
    expect(urls).toContain('mailto:test@example.com');
    expect(urls).toContain('https://linkedin.com/in/testuser');
    expect(urls).toContain('https://github.com/testuser/demo');
    expect(urls).toContain('https://demo.testuser.dev');
  });

  it('excludes project links from the expectation when the projects section is hidden', () => {
    const resume = minimalResume({ hiddenSections: ['projects'] });
    const links = expectedLinks(resume);
    expect(links.map((l) => l.url)).not.toContain('https://github.com/testuser/demo');
  });
});
