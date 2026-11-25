import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { closeDatabase, ensureSeeded, nowIso } from './server/db.ts';
import { authRouter } from './server/routes/authRoutes.ts';
import { publicRouter } from './server/routes/publicRoutes.ts';
import { storeOrderRouter } from './server/routes/storeOrderRoutes.ts';
import { adminRouter } from './server/routes/adminRoutes.ts';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16mb' }));

// Instant healthcheck endpoint without database probe on boot
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() });
});

// Lazy initial data seeding on first API call
app.use('/api', async (_req, _res, next) => {
  try {
    await ensureSeeded();
    next();
  } catch (err) {
    next(err);
  }
});

// Mount API routers
app.use(authRouter);
app.use(publicRouter);
app.use(storeOrderRouter);
app.use(adminRouter);

// Return JSON 404 for unknown API paths
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'Endpoint API tidak ditemukan.' });
});

// Global JSON error handler (sanitizes unexpected errors)
app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith('/api/')) {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Format data permintaan tidak valid.' });
    }
    console.error('[WD.UP API Error]', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server. Silakan coba lagi.' });
  }
  return next(err);
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`WD.UP server listening on http://0.0.0.0:${PORT}`);
  });

  let shuttingDown = false;
  const gracefulShutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    });
    setTimeout(async () => {
      await closeDatabase();
      process.exit(0);
    }, 1500).unref();
  };

  process.once('SIGINT', () => void gracefulShutdown());
  process.once('SIGTERM', () => void gracefulShutdown());
}

startServer();
