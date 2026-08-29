import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api.ts';
import type { HistoryEntry } from '../types/index.ts';
import Spinner from '../components/Spinner.tsx';
import ErrorBanner from '../components/ErrorBanner.tsx';
import StatusPill from '../components/StatusPill.tsx';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    api
      .listHistory()
      .then((r) => setEntries(r.generations))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Could not load resume history.'));
  }

  useEffect(load, []);

  async function handleDuplicate(id: string) {
    setBusyId(id);
    try {
      await api.duplicateGeneration(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not duplicate this resume.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRegenerate(id: string) {
    setBusyId(id);
    try {
      await api.regenerateFresh(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not regenerate this resume.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this resume version? This cannot be undone.')) return;
    setBusyId(id);
    try {
      await api.deleteGeneration(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this resume.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <p className="font-mono text-xs uppercase tracking-widest text-seal mb-1.5">Resume History</p>
        <h1 className="font-display text-3xl font-semibold">Every version you've generated</h1>
        <p className="text-ink-soft mt-2">One master resume, unlimited tailored versions — all kept here.</p>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {!entries && !error && (
        <div className="flex justify-center py-16">
          <Spinner label="Loading history…" />
        </div>
      )}

      {entries && entries.length === 0 && (
        <div className="sheet p-10 text-center">
          <p className="text-ink-soft mb-4">You haven't generated any resumes yet.</p>
          <Link to="/" className="btn-primary inline-flex">
            Generate your first resume
          </Link>
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className="sheet overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left font-mono text-xs uppercase tracking-wider text-ink-faint">
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Generated</th>
                <th className="px-5 py-3 font-medium">ATS</th>
                <th className="px-5 py-3 font-medium">Page</th>
                <th className="px-5 py-3 font-medium">Links</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-ink/[0.02]">
                  <td className="px-5 py-3">
                    <Link to={`/analysis/${e.id}`} className="font-medium text-ink hover:text-press">
                      {e.jobTitle}
                    </Link>
                    <p className="text-xs text-ink-faint">{e.company}</p>
                  </td>
                  <td className="px-5 py-3 text-ink-soft font-mono text-xs">
                    {new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-3 font-mono">{e.atsMatchScore}</td>
                  <td className="px-5 py-3">
                    <span className={`tag ${e.pageCount === 1 ? 'tag-matched' : 'tag-missing'}`}>{e.pageCount}p</span>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={e.linkValidationStatus} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <a className="btn-ghost !px-2 !py-1 text-xs" href={api.downloadPdfUrl(e.id)} download>
                        PDF
                      </a>
                      <a className="btn-ghost !px-2 !py-1 text-xs" href={api.downloadDocxUrl(e.id)} download>
                        DOCX
                      </a>
                      <Link className="btn-ghost !px-2 !py-1 text-xs" to={`/editor/${e.id}`}>
                        Edit
                      </Link>
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={busyId === e.id}
                        onClick={() => handleRegenerate(e.id)}
                      >
                        Regenerate
                      </button>
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        disabled={busyId === e.id}
                        onClick={() => handleDuplicate(e.id)}
                      >
                        Duplicate
                      </button>
                      <button
                        className="btn-danger !px-2 !py-1 text-xs"
                        disabled={busyId === e.id}
                        onClick={() => handleDelete(e.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
