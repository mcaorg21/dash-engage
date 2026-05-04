import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import qivezRoutes from './routes/qivez.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT_NAME);

const app = express();

if (!isProd) {
  app.use(cors({ origin: ['http://localhost:3141', 'http://0.0.0.0:3141'] }));
}

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/qivez', qivezRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

if (isProd) {
  const distPath = path.resolve(__dirname, '../dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3140;

initDb().then(() => {
  app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
