# ResumeTailor AI

Upload one **Master Resume**. For every job description you paste or upload, ResumeTailor AI
produces a truthful, ATS-friendly, **exactly one-page**, Jake's-Resume-style resume — with every
LinkedIn/GitHub/portfolio/project link a real, clickable PDF hyperlink, never plain text.

The same master resume is reused for unlimited job descriptions: Amazon AI/ML JD → an ML-focused
resume; a Backend Engineer JD → a backend-focused resume — same underlying facts, different
selection, ordering, and phrasing.

> **Status note:** this repository was built and its core pipeline (parsing, matching, LaTeX
> rendering, one-page optimization, hyperlink validation) was **actually executed and verified**
> in the environment it was built in — not just written — using `pdflatex`, `pdf-lib`, and `docx`
> directly against real fixture files. See [`server/scripts/smoke-test.ts`](server/scripts/smoke-test.ts)
> and [`server/tests`](server/tests). The Express/React layers are written against the dependency
> versions pinned in `package.json` but could not be `npm install`ed or run in a browser in that
> build environment (no network egress). Run `npm run install:all` locally to install everything
> and bring the full app up — see **Installation** below.

---

## Features

- **Upload once, reuse forever** — PDF or DOCX master resume, parsed into structured JSON and
  stored for unlimited future job descriptions.
- **Paste or upload the JD** — plain text, PDF, or DOCX.
- **Intelligent matching** — skill overlap, keyword overlap, semantic similarity, title relevance,
  and recency all feed into a per-item relevance score. Nothing is hardcoded to look good.
- **Strict truthfulness** — the AI may reword, shorten, reorder and select; it structurally cannot
  invent a skill, employer, metric, or result. A second, independent validator re-checks every
  AI-rewritten bullet against its source text and reverts any violation automatically.
- **Jake's Resume, always** — a fixed LaTeX template renders the content; the AI never emits
  LaTeX and cannot redesign, break, or de-ATS-ify the layout.
- **Exactly one page, enforced** — generate → render → check page count → optimize → re-render,
  looped until the compiled PDF is one page. Content-preserving moves (trim wording, drop the
  lowest-relevance bullet/project/skill) always happen before cosmetic ones (spacing, margins,
  font size).
- **Every link is a real hyperlink** — after compiling, the PDF's actual `/Annots` link
  annotations are extracted and compared against what the resume should contain (email as
  `mailto:`, LinkedIn/GitHub/portfolio/LeetCode, and every project's repo/live URL). A generation
  is not considered complete until this passes.
- **Analysis Dashboard** — ATS match score with a full breakdown, matched skills/keywords, what's
  missing from your master resume (genuinely absent) vs. missing from the generated resume (cut
  for space), and a plain-language reason for every inclusion/exclusion decision.
- **Resume Editor** — toggle sections, edit or remove bullets, lock bullets so AI regeneration
  never touches them, regenerate the whole resume or just optimize layout, with a live one-page
  preview.
- **Resume History** — every generated version is kept, downloadable as PDF/DOCX, regeneratable,
  duplicable, or deletable.
- **Works with or without an API key** — without `ANTHROPIC_API_KEY`, the deterministic heuristic
  engine (selection, ranking, and the master resume's own wording) still produces a fully valid,
  fully truthful, one-page resume. With a key, Claude rewrites the selected bullets for clarity
  and keyword integration, subject to the same truthfulness gate.

## What's intentionally out of scope for v1

- Drag-and-drop reordering of experience/projects in the editor (toggling visibility, editing,
  locking, and removing bullets are implemented; manual reordering is not).
- A hosted multi-user account system — this is a local-first reference implementation using a
  file-backed store (see below).

---

## Architecture

```
resume-tailor-ai/
├── client/                  React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/            HomePage, AnalysisPage, EditorPage, HistoryPage
│       ├── components/       FileDrop, ScoreRing, PdfPreview, StatusPill, Layout, …
│       ├── lib/api.ts         typed fetch client for the backend
│       └── types/             shapes mirroring the server's API responses
│
├── server/                  Node + TypeScript (ESM) + Express
│   └── src/
│       ├── parsers/          PDF (pdfjs-dist) / DOCX (zero-dependency zip+XML) / JD text →
│       │                     structured JSON, with hyperlinks preserved and classified
│       ├── matching/         skill taxonomy, relevance scoring, content ranking + section order
│       ├── pipeline/         compose.ts (deterministic, 100% truthful baseline) +
│       │                     generate.ts (full orchestration)
│       ├── ai/                Claude client + tailoring prompt, bullet-level only, with
│       │                     heuristic fallback
│       ├── rendering/        Jake's Resume LaTeX template, pdflatex compilation, DOCX export
│       ├── validation/       one-page optimizer, PDF page-count + hyperlink validation
│       │                     (pdf-lib), truthfulness guard
│       ├── db/                file-backed JSON store (repositories.ts is the swappable interface)
│       ├── controllers/, routes/, middleware/, config/
│       └── index.ts           Express entry point
│
├── .env.example
└── README.md (this file)
```

### The AI pipeline

```
Master Resume (PDF/DOCX)
      │  parsers/pdf.ts, parsers/docx.ts (zero-dependency zip/XML reader), parsers/structure.ts
      ▼
Structured Resume JSON  ────────────────────────────┐
                                                      │
Job Description (text/PDF/DOCX)                      │
      │  parsers/jd.ts                               │
      ▼                                               │
Structured JD JSON                                    │
      │                                               │
      ▼                                               ▼
matching/scoring.ts + matching/ranking.ts  (relevance scoring, section order decision)
      │
      ▼
pipeline/compose.ts   → a TailoredResume that is 100% copied verbatim from the master resume
      │                  (selection + ordering only, zero rewriting — the truthful baseline)
      ▼
ai/tailor.ts           → Claude rewrites ONLY the text of already-selected bullets + writes a
      │                  summary, from a prompt that forbids adding facts. Falls back to the
      │                  baseline verbatim on any error or missing API key.
      ▼
validation/truthfulness.ts → diffs every rewritten bullet against its source text for invented
      │                     numbers/technologies; violations are reverted to the original wording
      ▼
rendering/latex.ts + rendering/compile.ts → Jake's Resume LaTeX → real pdflatex compilation
      │
      ▼
validation/optimizer.ts → render, check page count, apply the least-damaging optimization move,
      │                   re-render — looped until exactly one page
      ▼
validation/pdf.ts → extract real PDF hyperlink annotations, compare against what the resume
      │             should contain; retry once on failure
      ▼
rendering/docx.ts → DOCX export mirroring the same content
      │
      ▼
Saved GenerationResult (PDF + DOCX + full audit trail: ATS score, selection reasons,
optimization steps, link validation, truthfulness result)
```

### How one-page enforcement works

`validation/optimizer.ts` renders the resume, checks the real compiled page count with `pdf-lib`,
and — while it's more than one page — applies exactly one optimization move per pass, from a
fixed priority list that always prefers preserving content over destroying it:

1. Remove the single lowest-relevance bullet (from whichever item has the most bullets).
2. Condense wordy phrasing ("was responsible for" → "", "utilized" → "used", etc.).
3. Trim the lowest-relevance skill from the largest skill category.
4. Trim the lowest-priority achievement, then certification.
5. Remove the lowest-relevance project.
6. Tighten section/bullet spacing.
7. Reduce margins (down to 0.4in).
8. Reduce font size (down to 10pt).
9. As a last resort, drop a further bullet.

It re-renders and re-checks after every single move — never applies several moves blind — and
stops the moment the PDF is one page. This was verified with a deliberately overstuffed fixture in
`server/tests/validation/optimizer.test.ts`, which really does trigger multiple passes and
converges to one page with all hyperlinks still valid.

### How hyperlink validation works

`rendering/latex.ts` emits every link as a real `\href{}` — including `mailto:` for the email and
`tel:` for a dialable phone number — never as plain text. `rendering/latex.ts`'s `expectedLinks()`
function independently derives the exact set of URLs the template is contractually obligated to
render. After compilation, `validation/pdf.ts` opens the real PDF with `pdf-lib`, walks every
page's `/Annots` → `/A` → `/URI`, and diffs that against `expectedLinks()` — reporting `PASSED`
only if every expected link is present, exactly matching, and untruncated. This is exactly the
`{ expected_links, found_links, valid_links, invalid_links, status }` contract from the spec.

### Truthfulness — how it's structurally enforced, not just prompted

1. `pipeline/compose.ts` builds the entire baseline resume by **copying fields verbatim** from the
   master resume — no text generation happens here at all.
2. `ai/tailor.ts` can only rewrite the `.text` of bullets that `compose.ts` already selected; it
   cannot add, remove, or reassign an item, and every rewritten bullet keeps an `original` field
   holding the master resume's exact wording.
3. `validation/truthfulness.ts` independently re-checks: any number or named technology in the
   rewritten text that isn't in the `original` text (or the candidate's declared skills, for the
   summary) is a violation, and violating bullets are reverted to their original wording before
   the resume is ever rendered.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, React Router |
| Backend | Node.js (ESM), TypeScript, Express |
| PDF parsing | [`pdfjs-dist`](https://www.npmjs.com/package/pdfjs-dist) (text + link annotations, layout-aware) |
| DOCX parsing | zero-dependency (built-in `zlib` + hand-rolled OOXML relationship resolution) |
| DOCX export | [`docx`](https://www.npmjs.com/package/docx) |
| PDF generation | LaTeX (`pdflatex`) — a Jake's-Resume-style template owned entirely by this app |
| PDF validation | [`pdf-lib`](https://www.npmjs.com/package/pdf-lib) (real page count + `/Annots` link extraction) |
| AI | Anthropic Claude API (`ANTHROPIC_API_KEY`), with a deterministic offline fallback |
| Persistence | File-backed JSON store (`server/src/db`) — no setup required; swap the `Store`/repository layer for Postgres/SQLite in production |

---

## Prerequisites

- **Node.js ≥ 18** and npm
- **A LaTeX distribution with `pdflatex` on your `PATH`.** This is required — it's how the PDF is
  actually generated.
  - Debian/Ubuntu: `sudo apt-get install texlive-latex-recommended texlive-fonts-recommended texlive-latex-extra`
  - macOS: `brew install --cask basictex` (then open a new terminal so `pdflatex` is on `PATH`)
  - Windows: install [MiKTeX](https://miktex.org/) or [TeX Live](https://www.tug.org/texlive/)
- (Optional) An [Anthropic API key](https://console.anthropic.com/) for AI-rewritten phrasing. The
  app works fully without one.

## Installation

```bash
git clone <your-fork-url> resume-tailor-ai
cd resume-tailor-ai
cp .env.example .env        # then fill in ANTHROPIC_API_KEY if you have one
npm run install:all         # installs server/ and client/ dependencies
```

## Environment variables

Set these in `.env` at the project root (`server/src/config/env.ts` reads it):

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Enables Claude-based bullet rewriting. Omit to use the offline heuristic engine. |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` | Model used for tailoring. |
| `PORT` | `4000` | Backend port. |
| `CLIENT_PORT` | `5173` | Vite dev server port. |
| `CORS_ORIGIN` | `http://localhost:5173` | Origin allowed to call the API. |
| `DATABASE_URL` | `file:./data/db.json` | File-backed store location. |
| `DATA_DIR` | `./data` | Root for uploads + generated PDFs/DOCX (gitignored). |
| `LATEX_ENGINE` | `pdflatex` | LaTeX binary to invoke. |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error`. |

### Claude API setup

1. Create a key at [console.anthropic.com](https://console.anthropic.com/).
2. Put it in `.env` as `ANTHROPIC_API_KEY=sk-ant-...`.
3. Restart the server. `GET /api/health` reports `"aiEngine": "claude"` once it's picked up; it
   reports `"heuristic"` (and the server logs a clear warning on startup) if the key is missing —
   this is not an error state, just a lower-fidelity mode.

## Running it

Two terminals:

```bash
npm run dev:server   # http://localhost:4000
npm run dev:client   # http://localhost:5173 (proxies /api to the server)
```

Or `cd server && npm run dev` / `cd client && npm run dev` directly.

## Running tests

```bash
cd server
npm test
```

This runs the Vitest suite in `server/tests/`, including real integration tests that shell out to
`pdflatex` and read the compiled PDF with `pdf-lib` — no mocking of the two hard requirements
(one page, real hyperlinks). It also parses the real fixture files in `server/tests/fixtures/`
(`master-resume.pdf`, `master-resume.docx`, and three sample job descriptions across backend,
frontend, and AI/ML domains).

There is also a standalone, dependency-light proof script:

```bash
cd server
npx tsx scripts/smoke-test.ts
```

It runs the entire pipeline against sample data end-to-end and writes a real compiled PDF/DOCX to
`/tmp/smoke-test-resume.{pdf,docx}` so you can open and inspect them directly.

## API overview

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/resumes` | Upload a master resume (`multipart/form-data`, field `resume`) |
| `GET` | `/api/resumes` / `/api/resumes/:id` | List / fetch master resumes |
| `POST` | `/api/job-descriptions` | Submit a JD (`{ text }` JSON, or `multipart/form-data` field `jd`) |
| `POST` | `/api/generate` | `{ masterResumeId, jobDescriptionId }` → full `GenerationResult` |
| `POST` | `/api/generations/:id/regenerate` | Re-run AI tailoring + validation, respecting locked bullets |
| `POST` | `/api/generations/:id/optimize` | Re-run only the one-page optimizer on edited content |
| `PATCH` | `/api/generations/:id/sections` | Toggle section visibility |
| `GET` | `/api/history` | List all generations (optionally `?masterResumeId=`) |
| `GET` | `/api/generations/:id/download.pdf` / `.docx` | Download a generated file |
| `POST` | `/api/generations/:id/duplicate` | Clone a version |
| `POST` | `/api/generations/:id/regenerate-fresh` | Full fresh re-run for the same resume+JD pair |
| `DELETE` | `/api/generations/:id` | Delete a version |
| `GET` | `/api/health` | `{ status, aiEngine }` |

## Error handling

Every parser throws a specific, user-facing `AppError` (see `server/src/utils/errors.ts`) for:
unsupported file types, corrupted/empty/password-protected/scanned PDFs, corrupted DOCX archives,
resumes with no recognizable sections, job descriptions too short to analyze, missing
`masterResumeId`/`jobDescriptionId`, a missing LaTeX engine (with the exact install command for
your OS), and LaTeX compilation failures (with the actual LaTeX error extracted from the log). The
Express `errorHandler` middleware turns all of these into `{ error, details }` JSON with the right
HTTP status; anything unexpected still returns a safe 500 instead of crashing the process.

## Git

This repo was built with logical, incremental commits (`git log --oneline` in the project root).
`.env`, `node_modules/`, `data/uploads/`, `data/generated/`, and LaTeX intermediates are gitignored
— nothing under `data/` or any API key is ever committed. Push it to your own GitHub repository
with:

```bash
git remote add origin <your-repo-url>
git push -u origin master
```
