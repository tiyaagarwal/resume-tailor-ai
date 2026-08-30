import type {
  GapSuggestion,
  GenerationResult,
  HistoryEntry,
  JobDescription,
  MasterResume,
  MasterResumeSummary,
  SectionKey,
  TailoredResume,
  UploadPreview,
} from '../types/index.ts';

const BASE = '/api';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    let message = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON; keep the generic message
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  // ---- Master Resume ----
  async uploadResume(file: File): Promise<{ resume: MasterResume; preview: UploadPreview }> {
    const form = new FormData();
    form.append('resume', file);
    return request('/resumes', { method: 'POST', body: form });
  },
  async listResumes(): Promise<{ resumes: MasterResumeSummary[] }> {
    return request('/resumes');
  },
  async getResume(id: string): Promise<{ resume: MasterResume }> {
    return request(`/resumes/${id}`);
  },

  // ---- Job Description ----
  async submitJobDescriptionText(text: string): Promise<{ jobDescription: JobDescription }> {
    return request('/job-descriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  },
  async uploadJobDescriptionFile(file: File): Promise<{ jobDescription: JobDescription }> {
    const form = new FormData();
    form.append('jd', file);
    return request('/job-descriptions', { method: 'POST', body: form });
  },

  // ---- Generation ----
  async generate(masterResumeId: string, jobDescriptionId: string): Promise<{ generation: GenerationResult }> {
    return request('/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ masterResumeId, jobDescriptionId }),
    });
  },
  async regenerate(id: string, tailored?: TailoredResume): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/regenerate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tailored }),
    });
  },
  async optimize(id: string, tailored: TailoredResume): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/optimize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tailored }),
    });
  },
  async toggleSections(id: string, hiddenSections: SectionKey[]): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/sections`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hiddenSections }),
    });
  },
  async critique(id: string): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/critique`, { method: 'POST' });
  },
  async getGapSuggestions(id: string, masterResumeId: string): Promise<{ suggestions: GapSuggestion[] }> {
    return request(`/generations/${id}/gap-suggestions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ masterResumeId }),
    });
  },
  async regenerateAdditive(
    id: string,
    masterResumeId: string,
    acceptedSuggestions: GapSuggestion[],
  ): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/regenerate-additive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ masterResumeId, acceptedSuggestions }),
    });
  },

  // ---- History ----
  async listHistory(masterResumeId?: string): Promise<{ generations: HistoryEntry[] }> {
    const qs = masterResumeId ? `?masterResumeId=${encodeURIComponent(masterResumeId)}` : '';
    return request(`/history${qs}`);
  },
  async getGeneration(id: string): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}`);
  },
  async duplicateGeneration(id: string): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/duplicate`, { method: 'POST' });
  },
  async regenerateFresh(id: string): Promise<{ generation: GenerationResult }> {
    return request(`/generations/${id}/regenerate-fresh`, { method: 'POST' });
  },
  async deleteGeneration(id: string): Promise<void> {
    return request(`/generations/${id}`, { method: 'DELETE' });
  },
  downloadPdfUrl(id: string): string {
    return `${BASE}/generations/${id}/download.pdf`;
  },
  downloadDocxUrl(id: string): string {
    return `${BASE}/generations/${id}/download.docx`;
  },

  async health(): Promise<{ status: string; aiEngine: 'claude' | 'heuristic' }> {
    return request('/health');
  },
};
