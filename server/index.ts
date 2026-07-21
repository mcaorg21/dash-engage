import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import qivezRoutes from './routes/qivez.js';
import ferramentasRoutes from './routes/ferramentas.js';
import nfseRoutes from './routes/nfse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);

const app = express();

if (!isProd) {
  app.use(cors({ origin: ['http://localhost:3143', 'http://0.0.0.0:3143'] }));
}

app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/qivez', qivezRoutes);
app.use('/api/ferramentas', ferramentasRoutes);
app.use('/api/nfse', nfseRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

if (isProd) {
  const distPath = path.resolve(__dirname, '../dist');
  // Assets com hash no nome: cache longo
  app.use('/assets', express.static(path.join(distPath, 'assets'), {
    maxAge: '1y',
    immutable: true,
  }));
  // index.html: sem cache para sempre pegar a versão mais recente
  app.use(express.static(distPath, { maxAge: 0, etag: false }));
  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3142;

initDb().then(() => {
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
