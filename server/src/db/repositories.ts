import type { JobDescription } from '../types/jd.ts';
import type { MasterResume } from '../types/resume.ts';
import type { GenerationResult } from '../types/tailored.ts';
import { notFound } from '../utils/errors.ts';
import { readStore, withStore } from './store.ts';

// ---------- Master Resumes ----------

export async function saveMasterResume(resume: MasterResume): Promise<MasterResume> {
  return withStore((s) => {
    s.masterResumes[resume.id] = resume;
    return resume;
  });
}

export async function getMasterResume(id: string): Promise<MasterResume> {
  const resume = await readStore((s) => s.masterResumes[id]);
  if (!resume) throw notFound(`No master resume found with id "${id}". Upload one first.`);
  return resume;
}

export async function listMasterResumes(): Promise<MasterResume[]> {
  return readStore((s) => Object.values(s.masterResumes).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
}

// ---------- Job Descriptions ----------

export async function saveJobDescription(jd: JobDescription): Promise<JobDescription> {
  return withStore((s) => {
    s.jobDescriptions[jd.id] = jd;
    return jd;
  });
}

export async function getJobDescription(id: string): Promise<JobDescription> {
  const jd = await readStore((s) => s.jobDescriptions[id]);
  if (!jd) throw notFound(`No job description found with id "${id}".`);
  return jd;
}

// ---------- Generations (Resume History) ----------

export async function saveGeneration(gen: GenerationResult): Promise<GenerationResult> {
  return withStore((s) => {
    s.generations[gen.id] = gen;
    const list = s.historyByMaster[gen.masterResumeId] ?? [];
    s.historyByMaster[gen.masterResumeId] = [gen.id, ...list.filter((id) => id !== gen.id)];
    return gen;
  });
}

export async function getGeneration(id: string): Promise<GenerationResult> {
  const gen = await readStore((s) => s.generations[id]);
  if (!gen) throw notFound(`No generated resume found with id "${id}".`);
  return gen;
}

export async function listGenerationsForMaster(masterResumeId: string): Promise<GenerationResult[]> {
  return readStore((s) => {
    const ids = s.historyByMaster[masterResumeId] ?? [];
    return ids.map((id) => s.generations[id]).filter((g): g is GenerationResult => Boolean(g));
  });
}

export async function listAllGenerations(): Promise<GenerationResult[]> {
  return readStore((s) =>
    Object.values(s.generations).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
}

export async function deleteGeneration(id: string): Promise<void> {
  await withStore((s) => {
    const gen = s.generations[id];
    if (!gen) throw notFound(`No generated resume found with id "${id}".`);
    delete s.generations[id];
    const list = s.historyByMaster[gen.masterResumeId] ?? [];
    s.historyByMaster[gen.masterResumeId] = list.filter((gid) => gid !== id);
  });
}
