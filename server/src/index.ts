import cors from 'cors';
import express from 'express';
import { env, reportConfig } from './config/env.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { router } from './routes/index.ts';
import { ensureDataDirs } from './utils/files.ts';
import { logger } from './utils/logger.ts';

const log = logger('server');

async function main(): Promise<void> {
  await ensureDataDirs();

  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  app.listen(env.port, () => {
    reportConfig();
    log.info(`ResumeTailor AI server listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
