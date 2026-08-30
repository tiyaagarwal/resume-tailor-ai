import type { Request, Response } from 'express';
import { getMasterResume, listMasterResumes, saveMasterResume } from '../db/repositories.ts';
import { parseMasterResume } from '../parsers/index.ts';
import { badRequest } from '../utils/errors.ts';

export async function uploadMasterResume(req: Request, res: Response): Promise<void> {
  const file = (req as Request & { file?: Express.Multer.File }).file;
  if (!file) throw badRequest('No file was uploaded. Attach a PDF or DOCX under the field name "resume".');

  const resume = await parseMasterResume(file.originalname, file.buffer);
  await saveMasterResume(resume);

  res.status(201).json({
    resume,
    preview: {
      fullName: resume.personalInfo.fullName,
      email: resume.personalInfo.email,
      sectionsFound: {
        education: resume.education.length,
        experience: resume.experience.length,
        internships: resume.internships.length,
        projects: resume.projects.length,
        certifications: resume.certifications.length,
        achievements: resume.achievements.length,
        skills: resume.skills.reduce((n, cat) => n + cat.items.length, 0),
        links: Object.values(resume.links).filter(Boolean).length - 1 + resume.links.other.length,
      },
    },
  });
}

export async function getMasterResumeById(req: Request, res: Response): Promise<void> {
  const resume = await getMasterResume(req.params.id);
  res.json({ resume });
}

export async function listMasterResumesHandler(_req: Request, res: Response): Promise<void> {
  const resumes = await listMasterResumes();
  res.json({
    resumes: resumes.map((r) => ({
      id: r.id,
      fullName: r.personalInfo.fullName,
      sourceFileName: r.sourceFileName,
      createdAt: r.createdAt,
    })),
  });
}
