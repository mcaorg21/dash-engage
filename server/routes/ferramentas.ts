import { Router } from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import * as XLSX from 'xlsx';
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

function parseSheetHeaders(buffer: Buffer): string[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 1 });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
    const firstRow = rows[0];
    if (!Array.isArray(firstRow)) return [];
    return firstRow.map(String).filter(Boolean);
  } catch {
    return [];
  }
}

function parseSheetColumn(buffer: Buffer, column: string): unknown[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
    return rows.map(row => row[column] ?? null).filter(v => v !== null && v !== '');
  } catch {
    return [];
  }
}

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
        transportadora: (f.metadata as any).metadata?.transportadora ?? null,
        columnMapping: (f.metadata as any).metadata?.columnMapping ?? null,
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

router.post('/planilhas/delete', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.body?.file || '');
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

router.post('/planilhas/metadata', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.body?.file || '');
    if (!filename) {
      res.status(400).json({ error: 'Arquivo nao informado.' });
      return;
    }
    const updates: Record<string, string> = {};
    if (req.body.transportadora !== undefined) updates.transportadora = String(req.body.transportadora);
    if (req.body.columnMapping !== undefined) updates.columnMapping = String(req.body.columnMapping);
    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'Nenhum campo para atualizar.' });
      return;
    }
    await gcs.bucket(BUCKET_NAME).file(filename).setMetadata({ metadata: updates });
    res.json({ updated: filename, ...updates });
  } catch (err) {
    console.error('GCS metadata error:', err);
    res.status(500).json({ error: 'Erro ao atualizar metadados.' });
  }
});

router.get('/planilhas/columns', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    if (!filename) {
      res.status(400).json({ error: 'Arquivo nao informado.' });
      return;
    }
    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();
    const headers = parseSheetHeaders(buffer);
    res.json(headers);
  } catch (err) {
    console.error('GCS columns error:', err);
    res.status(500).json({ error: 'Erro ao ler colunas do arquivo.' });
  }
});

router.get('/planilhas/extract', async (_req: AuthRequest, res) => {
  try {
    const [files] = await gcs.bucket(BUCKET_NAME).getFiles();

    const mapped = files.filter(f => {
      const meta = (f.metadata as any).metadata;
      return meta?.columnMapping;
    });

    const results: Array<{ transportadora: string; arquivo: string; valor: unknown }> = [];

    for (const file of mapped) {
      const meta = (file.metadata as any).metadata ?? {};
      const column: string = meta.columnMapping;
      const transportadora: string = meta.transportadora ?? file.name;

      try {
        const [buffer] = await gcs.bucket(BUCKET_NAME).file(file.name).download();
        const values = parseSheetColumn(buffer, column);
        for (const valor of values) {
          results.push({ transportadora, arquivo: file.name, valor });
        }
      } catch (err) {
        console.error(`Erro ao processar ${file.name}:`, err);
      }
    }

    res.json(results);
  } catch (err) {
    console.error('GCS extract error:', err);
    res.status(500).json({ error: 'Erro ao extrair dados das planilhas.' });
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
