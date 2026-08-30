import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { JobDescription } from '../types/jd.ts';
import type { MasterResume } from '../types/resume.ts';
import type { GenerationResult } from '../types/tailored.ts';
import { env } from '../config/env.ts';
import { logger } from '../utils/logger.ts';

const log = logger('db');

/**
 * Local persistence for the reference implementation.
 *
 * DATABASE_URL=file:./data/db.json selects this file-backed store, which needs
 * no setup, no native bindings and no network — appropriate for local dev and
 * for evaluating the project without provisioning Postgres/SQLite tooling.
 * Swapping in a real database means implementing this same Store interface
 * against it; nothing above the db/ layer needs to change.
 */

export interface Store {
  masterResumes: Record<string, MasterResume>;
  jobDescriptions: Record<string, JobDescription>;
  generations: Record<string, GenerationResult>;
  /** masterResumeId -> ordered list of generation ids, newest first. */
  historyByMaster: Record<string, string[]>;
}

function emptyStore(): Store {
  return { masterResumes: {}, jobDescriptions: {}, generations: {}, historyByMaster: {} };
}

function resolvePath(): string {
  const url = env.databaseUrl;
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url;
  return resolve(process.cwd(), path);
}

let cache: Store | null = null;
let writeQueue: Promise<void> = Promise.resolve();

async function load(): Promise<Store> {
  if (cache) return cache;
  const path = resolvePath();
  if (!existsSync(path)) {
    cache = emptyStore();
    return cache;
  }
  let loaded: Store;
  try {
    const raw = await readFile(path, 'utf8');
    loaded = { ...emptyStore(), ...JSON.parse(raw) };
  } catch (err) {
    log.error(`could not read ${path}, starting from an empty store`, (err as Error).message);
    loaded = emptyStore();
  }
  cache = loaded;
  return loaded;
}

/** Writes are serialised through one queue so concurrent requests can't interleave a partial file. */
async function persist(): Promise<void> {
  const path = resolvePath();
  const data = cache ?? emptyStore();
  writeQueue = writeQueue.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await rename(tmp, path); // atomic on POSIX filesystems
  });
  await writeQueue;
}

export async function withStore<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const store = await load();
  const result = await fn(store);
  await persist();
  return result;
}

export async function readStore<T>(fn: (store: Store) => T): Promise<T> {
  const store = await load();
  return fn(store);
}
