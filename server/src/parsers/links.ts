import type { ExperienceEntry, ProfileLink, ResumeLinks } from '../types/resume.ts';

/**
 * Sorts raw discovered links into the typed slots the renderer understands.
 *
 * Classification is by URL host, never by the visible label, because labels are
 * unreliable ("Repo", "here", a bare username) while hosts are not.
 */

const HOST_RULES: Array<{ test: RegExp; slot: keyof Omit<ResumeLinks, 'other'> }> = [
  { test: /(^|\.)linkedin\.com$/i, slot: 'linkedin' },
  { test: /(^|\.)github\.(com|io)$/i, slot: 'github' },
  { test: /(^|\.)leetcode\.com$/i, slot: 'leetcode' },
];

const PORTFOLIO_DENY =
  /(^|\.)(github\.com|linkedin\.com|leetcode\.com|gmail\.com|codeforces\.com|hackerrank\.com|kaggle\.com|medium\.com|x\.com|twitter\.com)$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** A GitHub URL with a repo path belongs to a project, not the profile slot. */
function isProfileLevelGithub(url: string): boolean {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean);
    return segments.length <= 1;
  } catch {
    return false;
  }
}

export function classifyLinks(discovered: ProfileLink[], email?: string): ResumeLinks {
  const links: ResumeLinks = { other: [] };
  const usedUrls = new Set<string>();

  for (const link of discovered) {
    const url = link.url.trim();
    if (!url || usedUrls.has(url)) continue;

    if (/^mailto:/i.test(url)) {
      usedUrls.add(url);
      continue; // email is carried on personalInfo, not in the link map
    }

    const host = hostOf(url);
    if (!host) continue;

    const rule = HOST_RULES.find((r) => r.test.test(host));
    if (rule) {
      if (rule.slot === 'github' && !isProfileLevelGithub(url)) {
        // Repository link: keep it available for project matching.
        links.other.push(link);
        usedUrls.add(url);
        continue;
      }
      if (!links[rule.slot]) {
        links[rule.slot] = { label: defaultLabel(rule.slot), url };
        usedUrls.add(url);
        continue;
      }
    }

    // First personal-looking domain becomes the portfolio.
    if (!links.portfolio && !PORTFOLIO_DENY.test(host) && /^https?:/i.test(url)) {
      links.portfolio = { label: 'Portfolio', url };
      usedUrls.add(url);
      continue;
    }

    links.other.push(link);
    usedUrls.add(url);
  }

  if (email && !/^mailto:/i.test(email)) {
    // normalisation only; the renderer builds the mailto: itself
  }
  return links;
}

function defaultLabel(slot: keyof Omit<ResumeLinks, 'other'>): string {
  switch (slot) {
    case 'linkedin':
      return 'LinkedIn';
    case 'github':
      return 'GitHub';
    case 'leetcode':
      return 'LeetCode';
    case 'portfolio':
      return 'Portfolio';
  }
}

/** Finds the best repo/live URL for a project by fuzzy-matching its name. */
export function findProjectLinks(
  projectName: string,
  discovered: ProfileLink[],
): { repoUrl?: string; liveUrl?: string } {
  const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return {};
  let repoUrl: string | undefined;
  let liveUrl: string | undefined;

  for (const link of discovered) {
    const url = link.url;
    const compact = url.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!compact.includes(slug)) continue;
    const host = hostOf(url);
    if (/(^|\.)github\.com$/i.test(host) && !isProfileLevelGithub(url)) {
      repoUrl ??= url;
    } else if (/^https?:/i.test(url)) {
      liveUrl ??= url;
    }
  }
  return { repoUrl, liveUrl };
}

/**
 * Associates each role's own completion-certificate URL (never a generic
 * profile link) by first trying to match a link's recovered `context` text
 * against that role's own role/organization/bullet text, falling back to a
 * certificate-labeled link only when no context match exists. Mutates the
 * given entries in place; `claimed` (shared across a whole resume's roles)
 * ensures the same link is never assigned to two different roles.
 */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function associateCertificateLinks(entries: ExperienceEntry[], discovered: ProfileLink[]): void {
  const claimed = new Set<string>();

  for (const entry of entries) {
    const blob = normalize([entry.role, entry.organization, ...entry.bullets].join(' '));

    const contextMatch = discovered.find(
      (link) => !claimed.has(link.url) && link.context && blob.includes(normalize(link.context).slice(0, 20)),
    );
    if (contextMatch) {
      claimed.add(contextMatch.url);
      entry.certificateUrl = contextMatch.url;
      continue;
    }

    const labelMatch = discovered.find(
      (link) => !claimed.has(link.url) && /certificate|certification|credential/i.test(link.label),
    );
    if (labelMatch) {
      claimed.add(labelMatch.url);
      entry.certificateUrl = labelMatch.url;
    }
  }
}
