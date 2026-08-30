import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { env, reportConfig } from './config/env.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { router } from './routes/index.ts';
import { ensureDataDirs } from './utils/files.ts';
import { logger } from './utils/logger.ts';

const log = logger('server');

// In a single-service production deploy, this server also serves the built
// React client (client/dist, a sibling of server/ under the repo root) so
// there's one process, one port, and no CORS to configure. In local dev,
// client/dist doesn't exist (Vite serves the client separately) and this
// whole block is skipped.
const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDist = join(__dirname, '..', '..', 'client', 'dist');

async function main(): Promise<void> {
  await ensureDataDirs();

  const app = express();
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: '2mb' }));

  app.use('/api', router);

  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(join(clientDist, 'index.html'));
    });
  }

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
