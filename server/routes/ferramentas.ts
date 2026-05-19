import { Router } from 'express';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import * as XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { pool } from '../db.js';

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
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 15 });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
    const seen = new Set<string>();
    const headers: string[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      for (const v of row) {
        if (v != null) {
          const s = String(v).trim();
          if (s && !seen.has(s)) {
            seen.add(s);
            headers.push(s);
          }
        }
      }
    }
    return headers;
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
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });

    // Find the header row that contains the target column (scan up to 30 rows)
    let headerRowIdx = -1;
    let colIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 30); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const idx = row.findIndex(v => v != null && String(v).trim() === column);
      if (idx !== -1) { headerRowIdx = i; colIdx = idx; break; }
    }
    if (headerRowIdx === -1) return [];

    const values: unknown[] = [];
    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v !== null && v !== undefined && v !== '') values.push(v);
    }
    return values;
  } catch {
    return [];
  }
}

router.use(authenticate);

// ── Planilhas (GCS files) ─────────────────────────────────────────────────────

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
    res.json(parseSheetHeaders(buffer));
  } catch (err) {
    console.error('GCS columns error:', err);
    res.status(500).json({ error: 'Erro ao ler colunas do arquivo.' });
  }
});

// Extract: for each file, auto-matches any saved column name found in its headers
router.get('/planilhas/extract', async (_req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_column_names',
    );
    const savedNames = new Set(rows.map(r => r.column_name));

    if (savedNames.size === 0) {
      res.json([]);
      return;
    }

    const [files] = await gcs.bucket(BUCKET_NAME).getFiles();
    const results: Array<{ transportadora: string; arquivo: string; coluna: string; valor: unknown }> = [];

    for (const file of files) {
      try {
        const [buffer] = await gcs.bucket(BUCKET_NAME).file(file.name).download();
        const headers = parseSheetHeaders(buffer);
        const matched = headers.find(h => savedNames.has(h));
        if (!matched) continue;

        const transportadora: string = (file.metadata as any).metadata?.transportadora ?? file.name;
        for (const valor of parseSheetColumn(buffer, matched)) {
          results.push({ transportadora, arquivo: file.name, coluna: matched, valor });
        }
      } catch (err) {
        console.error(`Erro ao processar ${file.name}:`, err);
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Extract error:', err);
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

// ── Mapeamentos — lista global de nomes de colunas a extrair ─────────────────

router.get('/mapeamentos', async (_req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_column_names ORDER BY column_name',
    );
    res.json(rows.map(r => r.column_name));
  } catch (err) {
    console.error('DB mapeamentos error:', err);
    res.status(500).json({ error: 'Erro ao buscar mapeamentos.' });
  }
});

router.post('/mapeamentos', async (req: AuthRequest, res) => {
  try {
    const columnName = String(req.body?.columnName || '').trim();
    if (!columnName) {
      res.status(400).json({ error: 'columnName e obrigatorio.' });
      return;
    }
    await pool.query(
      `INSERT INTO saved_column_names (column_name)
       VALUES ($1)
       ON CONFLICT (column_name) DO NOTHING`,
      [columnName],
    );
    res.json({ saved: columnName });
  } catch (err) {
    console.error('DB save column error:', err);
    res.status(500).json({ error: 'Erro ao salvar nome de coluna.' });
  }
});

router.delete('/mapeamentos/:columnName', async (req: AuthRequest, res) => {
  try {
    const columnName = decodeURIComponent(req.params.columnName);
    await pool.query('DELETE FROM saved_column_names WHERE column_name = $1', [columnName]);
    res.json({ deleted: columnName });
  } catch (err) {
    console.error('DB delete column error:', err);
    res.status(500).json({ error: 'Erro ao remover nome de coluna.' });
  }
});

export default router;
