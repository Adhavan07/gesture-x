import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { LocalStorageProvider } from './server/storage.ts';
import {
  DEFAULT_MAX_FILE_SIZE_MB,
  SERVER_ABSOLUTE_MAX_MB,
  validateFileMetadata,
} from './src/utils/fileValidation.ts';

dotenv.config();

const requestedPort = Number(process.env.PORT);
const nginxPort = Number(process.env.NGINX_PORT);
const PORT =
  Number.isFinite(requestedPort) && requestedPort > 0 && requestedPort !== nginxPort
    ? requestedPort
    : Number(process.env.DEFAULT_APP_PORT) || 3000;
const storageProvider = new LocalStorageProvider();

async function startServer() {
  await storageProvider.init();

  const app = express();
  app.use(express.json());

  // Serve MediaPipe WASM and local hand landmarker model directly without external CDN dependency
  app.use(
    '/mediapipe-wasm',
    express.static(path.resolve('node_modules/@mediapipe/tasks-vision/wasm'))
  );
  app.use('/models', express.static(path.resolve('public/models')));

  const uploadMiddleware = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        cb(null, storageProvider.getTempDir());
      },
      filename: (_req, file, cb) => {
        const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
        cb(null, `${unique}-${path.basename(file.originalname || 'file')}`);
      },
    }),
    limits: {
      fileSize: SERVER_ABSOLUTE_MAX_MB * 1024 * 1024,
      files: 1,
    },
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'gesturex-api' });
  });

  app.get('/api/uploads', async (_req, res) => {
    try {
      const [records, stats] = await Promise.all([
        storageProvider.listRecords(),
        storageProvider.getStats(),
      ]);
      res.json({ records, stats });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to list uploads.',
      });
    }
  });

  app.post('/api/upload', (req, res) => {
    uploadMiddleware.single('file')(req, res, async (multerErr) => {
      if (multerErr) {
        const message =
          multerErr instanceof multer.MulterError && multerErr.code === 'LIMIT_FILE_SIZE'
            ? `File exceeds maximum server limit of ${SERVER_ABSOLUTE_MAX_MB} MB.`
            : multerErr.message || 'Upload stream error.';
        res.status(400).json({ error: message });
        return;
      }

      const uploadedFile = req.file;
      if (!uploadedFile) {
        res.status(400).json({ error: 'No file received in upload request.' });
        return;
      }

      try {
        const requestedMaxMB = Number(req.body?.maxSizeMB || process.env.MAX_UPLOAD_SIZE_MB);
        const effectiveMaxMB =
          Number.isFinite(requestedMaxMB) && requestedMaxMB > 0
            ? Math.min(requestedMaxMB, SERVER_ABSOLUTE_MAX_MB)
            : DEFAULT_MAX_FILE_SIZE_MB;

        const validation = validateFileMetadata(
          {
            name: uploadedFile.originalname,
            size: uploadedFile.size,
            type: uploadedFile.mimetype,
          },
          effectiveMaxMB
        );

        if (!validation.valid) {
          await fs.unlink(uploadedFile.path).catch(() => undefined);
          res.status(400).json({ error: validation.error });
          return;
        }

        const record = await storageProvider.saveFile({
          tempFilePath: uploadedFile.path,
          originalName: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype,
          extension: validation.extension,
          size: uploadedFile.size,
          relativePath:
            typeof req.body?.relativePath === 'string' ? req.body.relativePath : undefined,
        });

        res.status(201).json({ record });
      } catch (err) {
        await fs.unlink(uploadedFile.path).catch(() => undefined);
        res.status(500).json({
          error: err instanceof Error ? err.message : 'Failed to store uploaded file.',
        });
      }
    });
  });

  app.delete('/api/uploads/:id', async (req, res) => {
    try {
      const deleted = await storageProvider.deleteRecord(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Upload record not found.' });
        return;
      }
      res.json({ deleted: true, id: req.params.id });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to delete upload record.',
      });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      appType: 'spa',
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: hmrDisabled ? false : true,
      },
      plugins: [
        {
          name: 'gesturex-hmr-attach',
          config(c) {
            c.server = c.server || {};
            c.server.middlewareMode = true;
            c.server.allowedHosts = true;
            c.server.ws = { server: httpServer };
            c.server.hmr = hmrDisabled ? false : true;
          },
        },
      ],
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`GESTUREX server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start GESTUREX server:', err);
  process.exit(1);
});
