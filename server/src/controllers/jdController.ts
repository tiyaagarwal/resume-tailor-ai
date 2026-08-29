import type { Request, Response } from 'express';
import { saveJobDescription } from '../db/repositories.ts';
import { analyzeJobDescription } from '../parsers/jd.ts';
import { extractDocument } from '../parsers/index.ts';
import { badRequest } from '../utils/errors.ts';

export async function ingestJobDescription(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  let text: string;
  let sourceFileName: string | undefined;

  if (file) {
    const extracted = await extractDocument(file.originalname, file.buffer);
    text = extracted.text;
    sourceFileName = file.originalname;
  } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
    text = req.body.text;
  } else {
    throw badRequest('Provide a job description either as pasted text (field "text") or an uploaded PDF/DOCX (field "jd").');
  }

  const jd = analyzeJobDescription(text, sourceFileName);
  await saveJobDescription(jd);
  res.status(201).json({ jobDescription: jd });
}
