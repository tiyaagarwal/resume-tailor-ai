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
      portfolio: { label: 'Portfolio', url: 'https://testuser.dev' },
      leetcode: { label: 'LeetCode', url: 'https://leetcode.com/u/testuser' },
      other: [{ label: 'Codeforces', url: 'https://codeforces.com/profile/testuser' }],
    },
    summary: '',
    sectionOrder: ['education', 'experience', 'projects', 'skills'],
    hiddenSections: [],
    education: [],
    skills: [{ name: 'Programming', items: ['C#'] }],
    experience: [
      {
        id: 'exp_1',
        kind: 'experience',
        role: 'Software Engineer',
        organization: 'Acme',
        bullets: [
          { text: 'Built a **REST API** serving 10,000+ requests/day.', sourceId: 'exp_1', sourceIndex: 0, original: 'Built a REST API serving 10,000+ requests/day.', relevance: 0.9 },
        ],
        relevance: 0.9,
        certificateUrl: 'https://acme.example.com/certificate/testuser',
      },
    ],
    projects: [
      {
        id: 'proj_1',
        name: 'Demo',
        tagline: 'A demo project',
        technologies: ['React'],
        bullets: [{ text: 'Shipped a working prototype in two weeks.', sourceId: 'proj_1', sourceIndex: 0, original: 'Shipped a working prototype in two weeks.', relevance: 0.7 }],
        repoUrl: 'https://github.com/testuser/demo',
        liveUrl: 'https://demo.testuser.dev',
        relevance: 0.5,
      },
    ],
    workshops: [{ id: 'ws_1', title: 'React Deep Dive', url: 'https://workshops.example.com/react' }],
    hackathons: [{ id: 'hack_1', name: 'HackTown', result: 'Winner', url: 'https://hacktown.example.com' }],
    certifications: [{ id: 'cert_1', name: 'AWS Certified', issuer: 'Amazon', url: 'https://aws.example.com/cert' }],
    extraCurricular: [{ id: 'extra_1', role: 'Club Lead', organization: 'Coding Club', impact: 'Organized weekly sessions.' }],
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

  it('renders every visible section the resume declares, using the shared \\sectionheader macro', () => {
    expect(tex).toContain('\\sectionheader{PROJECTS}');
    expect(tex).toContain('\\sectionheader{SKILLS}');
    expect(tex).toContain('\\sectionheader{WORK EXPERIENCE}');
  });

  it('omits a section entirely when it is hidden, rather than rendering an empty heading', () => {
    const hidden = renderLatex(minimalResume({ hiddenSections: ['skills'] }));
    expect(hidden).not.toContain('\\sectionheader{SKILLS}');
  });

  it('always uses \\textbullet for bullets, never a literal Unicode bullet character', () => {
    expect(tex).toContain('label=\\textbullet');
    expect(tex).not.toMatch(/\\item\s*•/);
  });

  it('renders exactly one hyperlink on a project entry\'s title/name line', () => {
    const projectLine = tex.split('\n').find((l) => l.includes('\\entryline{\\textbf{Demo'));
    expect(projectLine).toBeDefined();
    expect((projectLine?.match(/\\href/g) ?? []).length).toBe(1);
  });

  it('bolds a marked phrase in a bullet as \\textbf{}', () => {
    expect(tex).toContain('\\textbf{REST API}');
  });
});

describe('expectedLinks', () => {
  it('lists the email and the fixed 4-link header set as real hyperlinks the template must emit', () => {
    const resume = minimalResume();
    const links = expectedLinks(resume);
    const urls = links.map((l) => l.url);
    expect(urls).toContain('mailto:test@example.com');
    expect(urls).toContain('https://linkedin.com/in/testuser');
    expect(urls).toContain('https://github.com/testuser');
    expect(urls).toContain('https://testuser.dev');
    expect(urls).toContain('https://leetcode.com/u/testuser');
  });

  it('includes a project\'s repo URL but never its liveUrl (single GitHub link only)', () => {
    const resume = minimalResume();
    const urls = expectedLinks(resume).map((l) => l.url);
    expect(urls).toContain('https://github.com/testuser/demo');
    expect(urls).not.toContain('https://demo.testuser.dev');
  });

  it('includes a role\'s certificate URL, a workshop/hackathon URL, and a certification URL', () => {
    const resume = minimalResume();
    const urls = expectedLinks(resume).map((l) => l.url);
    expect(urls).toContain('https://acme.example.com/certificate/testuser');
    expect(urls).toContain('https://workshops.example.com/react');
    expect(urls).toContain('https://hacktown.example.com');
    expect(urls).toContain('https://aws.example.com/cert');
  });

  it('never includes a links.other entry — this template has no header overflow slot', () => {
    const resume = minimalResume();
    const urls = expectedLinks(resume).map((l) => l.url);
    expect(urls).not.toContain('https://codeforces.com/profile/testuser');
  });

  it('excludes project links from the expectation when the projects section is hidden', () => {
    const resume = minimalResume({ hiddenSections: ['projects'] });
    const links = expectedLinks(resume);
    expect(links.map((l) => l.url)).not.toContain('https://github.com/testuser/demo');
  });
});
