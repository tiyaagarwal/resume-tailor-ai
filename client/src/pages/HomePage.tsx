import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FileDrop from '../components/FileDrop.tsx';
import Spinner from '../components/Spinner.tsx';
import ErrorBanner from '../components/ErrorBanner.tsx';
import { api, ApiError } from '../lib/api.ts';
import type { MasterResumeSummary, UploadPreview } from '../types/index.ts';

type JdMode = 'paste' | 'upload';

export default function HomePage() {
  const navigate = useNavigate();

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [savedResumes, setSavedResumes] = useState<MasterResumeSummary[]>([]);

  const [jdMode, setJdMode] = useState<JdMode>('paste');
  const [jdText, setJdText] = useState('');
  const [jdFile, setJdFile] = useState<File | null>(null);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listResumes()
      .then((r) => setSavedResumes(r.resumes))
      .catch(() => {
        /* not fatal — the picker is a convenience */
      });
  }, []);

  async function handleResumeFile(file: File) {
    setResumeFile(file);
    setUploading(true);
    setUploadError(null);
    setPreview(null);
    setMasterResumeId(null);
    try {
      const { resume, preview } = await api.uploadResume(file);
      setMasterResumeId(resume.id);
      setPreview(preview);
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Could not parse this resume. Please try another file.');
    } finally {
      setUploading(false);
    }
  }

  const canGenerate = Boolean(masterResumeId) && (jdMode === 'paste' ? jdText.trim().length > 40 : Boolean(jdFile));

  async function handleGenerate() {
    if (!masterResumeId || !canGenerate) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const jd =
        jdMode === 'paste'
          ? await api.submitJobDescriptionText(jdText)
          : await api.uploadJobDescriptionFile(jdFile!);
      const { generation } = await api.generate(masterResumeId, jd.jobDescription.id);
      navigate(`/analysis/${generation.id}`);
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Something went wrong while generating your resume.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="mb-10 max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-widest text-seal mb-2">One master resume · unlimited tailored versions</p>
        <h1 className="font-display text-4xl font-semibold text-ink mb-3">
          Tailor your resume to the job — truthfully, and on one page.
        </h1>
        <p className="text-ink-soft leading-relaxed">
          Upload your full resume once. For every job description, ResumeTailor AI ranks what's actually
          relevant, rewrites it for clarity, and typesets it into a one-page, ATS-friendly resume in Jake's
          Resume format — never inventing a skill, a metric, or a line of experience you don't have.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Master Resume card */}
        <section className="sheet p-6 flex flex-col gap-4">
          <div>
            <h2 className="font-display text-lg font-semibold">Master Resume</h2>
            <p className="text-sm text-ink-faint mt-0.5">PDF or DOCX. Parsed once, reused for every job.</p>
          </div>

          <FileDrop
            label="Upload"
            hint="PDF or DOCX, up to 10 MB"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            file={resumeFile}
            onFile={handleResumeFile}
            disabled={uploading}
          />

          {uploading && <Spinner label="Parsing your resume…" />}
          {uploadError && <ErrorBanner message={uploadError} onDismiss={() => setUploadError(null)} />}

          {preview && (
            <div className="rounded-md border border-approve/25 bg-approve/5 px-4 py-3">
              <p className="text-sm font-medium text-approve mb-2">
                Parsed {preview.fullName ? `— ${preview.fullName}` : ''}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-ink-soft">
                <span>{preview.sectionsFound.experience} experience</span>
                <span>{preview.sectionsFound.internships} internships</span>
                <span>{preview.sectionsFound.projects} projects</span>
                <span>{preview.sectionsFound.education} education</span>
                <span>{preview.sectionsFound.skills} skills</span>
                <span>{preview.sectionsFound.links} links</span>
              </div>
            </div>
          )}

          {savedResumes.length > 0 && (
            <div className="pt-2 border-t border-line">
              <label className="field-label">Or reuse a previous upload</label>
              <select
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
                value={masterResumeId ?? ''}
                onChange={(e) => {
                  const id = e.target.value;
                  setMasterResumeId(id || null);
                  setPreview(null);
                  setResumeFile(null);
                }}
              >
                <option value="">Select a saved master resume…</option>
                {savedResumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.fullName} — {r.sourceFileName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>

        {/* Job Description card */}
        <section className="sheet p-6 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Job Description</h2>
              <p className="text-sm text-ink-faint mt-0.5">Paste the posting, or upload it as a file.</p>
            </div>
            <div className="flex rounded-md border border-line overflow-hidden text-xs font-mono">
              <button
                className={`px-3 py-1.5 ${jdMode === 'paste' ? 'bg-press text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setJdMode('paste')}
              >
                Paste
              </button>
              <button
                className={`px-3 py-1.5 ${jdMode === 'upload' ? 'bg-press text-white' : 'bg-white text-ink-soft'}`}
                onClick={() => setJdMode('upload')}
              >
                Upload
              </button>
            </div>
          </div>

          {jdMode === 'paste' ? (
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              placeholder="Paste the full job posting here — responsibilities and requirements included…"
              className="w-full min-h-[280px] resize-y rounded-md border border-line bg-white px-3 py-2.5 text-sm leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-press"
            />
          ) : (
            <FileDrop
              label="Upload"
              hint="PDF or DOCX"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              file={jdFile}
              onFile={setJdFile}
            />
          )}
        </section>
      </div>

      {generateError && (
        <div className="mt-6">
          <ErrorBanner message={generateError} onDismiss={() => setGenerateError(null)} />
        </div>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button className="btn-primary px-6 py-3 text-base" disabled={!canGenerate || generating} onClick={handleGenerate}>
          {generating ? <Spinner label="Generating your tailored resume…" /> : 'Generate Tailored Resume'}
        </button>
        {!canGenerate && !generating && (
          <span className="text-xs font-mono text-ink-faint">
            {!masterResumeId ? 'Upload a master resume to continue' : 'Add a job description to continue'}
          </span>
        )}
      </div>
    </div>
  );
}
