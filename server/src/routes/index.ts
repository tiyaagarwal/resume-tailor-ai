import { Router } from 'express';
import multer from 'multer';
import { asyncRoute } from '../middleware/errorHandler.ts';
import {
  getMasterResumeById,
  listMasterResumesHandler,
  uploadMasterResume,
} from '../controllers/resumeController.ts';
import { ingestJobDescription } from '../controllers/jdController.ts';
import {
  critiqueHandler,
  gapSuggestionsHandler,
  generateHandler,
  optimizeHandler,
  regenerateAdditiveHandler,
  regenerateHandler,
  toggleSectionsHandler,
} from '../controllers/generateController.ts';
import {
  deleteGenerationHandler,
  downloadDocx,
  downloadPdf,
  duplicateGeneration,
  getGenerationHandler,
  listHistory,
  regenerateFromHistory,
} from '../controllers/historyController.ts';
import { env } from '../config/env.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const router = Router();

// ---- Master Resume ----
router.post('/resumes', upload.single('resume'), asyncRoute(uploadMasterResume));
router.get('/resumes', asyncRoute(listMasterResumesHandler));
router.get('/resumes/:id', asyncRoute(getMasterResumeById));

// ---- Job Description ----
router.post('/job-descriptions', upload.single('jd'), asyncRoute(ingestJobDescription));

// ---- Generation (Analysis Dashboard + Editor read from this) ----
router.post('/generate', asyncRoute(generateHandler));
router.post('/generations/:id/regenerate', asyncRoute(regenerateHandler));
router.post('/generations/:id/optimize', asyncRoute(optimizeHandler));
router.patch('/generations/:id/sections', asyncRoute(toggleSectionsHandler));
router.post('/generations/:id/critique', asyncRoute(critiqueHandler));
router.post('/generations/:id/gap-suggestions', asyncRoute(gapSuggestionsHandler));
router.post('/generations/:id/regenerate-additive', asyncRoute(regenerateAdditiveHandler));

// ---- Resume History ----
router.get('/history', asyncRoute(listHistory));
router.get('/generations/:id', asyncRoute(getGenerationHandler));
router.get('/generations/:id/download.pdf', asyncRoute(downloadPdf));
router.get('/generations/:id/download.docx', asyncRoute(downloadDocx));
router.post('/generations/:id/regenerate-fresh', asyncRoute(regenerateFromHistory));
router.post('/generations/:id/duplicate', asyncRoute(duplicateGeneration));
router.delete('/generations/:id', asyncRoute(deleteGenerationHandler));

// ---- Health ----
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', aiEngine: env.anthropicApiKey ? 'claude' : 'heuristic' });
});
