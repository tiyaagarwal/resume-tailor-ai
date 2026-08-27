import { inflateRawSync } from 'node:zlib';
import { badRequest } from '../utils/errors.ts';

/**
 * A dependency-free reader for the subset of ZIP that OOXML uses.
 *
 * We read the central directory rather than streaming local headers, because
 * local headers may carry zeroed sizes with a trailing data descriptor. Only
 * STORE (0) and DEFLATE (8) are supported, which is all Word emits.
 */

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

function findEndOfCentralDirectory(buf: Buffer): number {
  // EOCD is at least 22 bytes and may be followed by a comment up to 64 KiB.
  const minOffset = Math.max(0, buf.length - (22 + 0xffff));
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

export function readZipEntries(buf: Buffer): Map<string, ZipEntry> {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) {
    throw badRequest(
      'This file is not a readable DOCX archive. It may be corrupted or saved in an older .doc format — please re-save it as .docx and try again.',
    );
  }

  const entryCount = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  const entries = new Map<string, ZipEntry>();

  for (let i = 0; i < entryCount; i++) {
    if (ptr + 46 > buf.length || buf.readUInt32LE(ptr) !== SIG_CENTRAL) break;
    const compressionMethod = buf.readUInt16LE(ptr + 10);
    const compressedSize = buf.readUInt32LE(ptr + 20);
    const uncompressedSize = buf.readUInt32LE(ptr + 24);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localHeaderOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.subarray(ptr + 46, ptr + 46 + nameLen).toString('utf8');

    entries.set(name, {
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.size === 0) {
    throw badRequest('The DOCX archive appears to be empty or corrupted.');
  }
  return entries;
}

export function extractFile(buf: Buffer, entry: ZipEntry): Buffer {
  const off = entry.localHeaderOffset;
  if (buf.readUInt32LE(off) !== SIG_LOCAL) {
    throw badRequest(`Corrupted DOCX: bad local header for "${entry.name}".`);
  }
  // The local header repeats the name/extra lengths, and they can differ from
  // the central directory's, so we must read them here.
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(raw);
  if (entry.compressionMethod === 8) {
    try {
      return inflateRawSync(raw);
    } catch {
      throw badRequest(`Corrupted DOCX: could not decompress "${entry.name}".`);
    }
  }
  throw badRequest(
    `Unsupported compression in DOCX entry "${entry.name}" (method ${entry.compressionMethod}).`,
  );
}

/** Reads a named archive member as UTF-8 text, or null when absent. */
export function readTextEntry(buf: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  if (!entry) return null;
  return extractFile(buf, entry).toString('utf8');
}
