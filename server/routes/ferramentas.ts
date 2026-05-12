import { Router } from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const BUCKET_NAME = 'repositorio-planilhas-clientes';

function createStorage() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    return new Storage({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON),
    });
  }
  const keyFilename =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(PROJECT_ROOT, '.credentials', 'engage-eletro-ea9e7604c7b8.json');
  return new Storage({ keyFilename });
}

const gcs = createStorage();

router.use(authenticate);

router.get('/planilhas', async (_req: AuthRequest, res) => {
  try {
    const [files] = await gcs.bucket(BUCKET_NAME).getFiles();
    res.json(
      files.map(f => ({
        name: f.name,
        size: Number(f.metadata.size || 0),
        updated: f.metadata.updated ?? null,
        contentType: f.metadata.contentType ?? null,
      })),
    );
  } catch (err) {
    console.error('GCS list error:', err);
    res.status(500).json({ error: 'Erro ao listar arquivos do bucket.' });
  }
});

router.post('/planilhas/upload', upload.array('files'), async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const bucket = gcs.bucket(BUCKET_NAME);

    await Promise.all(
      files.map(
        file =>
          new Promise<void>((resolve, reject) => {
            const blob = bucket.file(file.originalname);
            const stream = blob.createWriteStream({
              metadata: { contentType: file.mimetype },
              resumable: false,
            });
            stream.on('error', reject);
            stream.on('finish', resolve);
            stream.end(file.buffer);
          }),
      ),
    );

    res.json({ uploaded: files.map(f => f.originalname) });
  } catch (err) {
    console.error('GCS upload error:', err);
    res.status(500).json({ error: 'Erro ao fazer upload dos arquivos.' });
  }
});

router.delete('/planilhas', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    if (!filename) {
      res.status(400).json({ error: 'Arquivo nao informado.' });
      return;
    }
    await gcs.bucket(BUCKET_NAME).file(filename).delete();
    res.json({ deleted: filename });
  } catch (err) {
    console.error('GCS delete error:', err);
    res.status(500).json({ error: 'Erro ao deletar arquivo.' });
  }
});

router.get('/planilhas/download', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    if (!filename) {
      res.status(400).json({ error: 'Arquivo nao informado.' });
      return;
    }
    const file = gcs.bucket(BUCKET_NAME).file(filename);
    const [metadata] = await file.getMetadata();
    res.setHeader('Content-Type', String(metadata.contentType || 'application/octet-stream'));
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    file.createReadStream().pipe(res);
  } catch (err) {
    console.error('GCS download error:', err);
    res.status(500).json({ error: 'Erro ao baixar arquivo.' });
  }
});

export default router;
