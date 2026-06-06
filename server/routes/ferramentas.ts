import { Router, type Response, type NextFunction } from 'express';
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
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });

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

const SYNC_WEBHOOK = 'https://primary-production-1a8e5.up.railway.app/webhook/2c2b8aee-2983-44f2-b334-052aa8f4596b-sincroniza-planilha-cte';

function parseSheetCteRows(
  buffer: Buffer,
  cteColumn: string,
  valueColumns: string[],
  skipLastRows = 0,
): { chave: string; valor: number | null }[] {
  try {
    // cellText: true + raw: false preserva chaves CTE como texto completo (evita notação científica)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    const colLower = (c: string) => c.toLowerCase();

    // Encontra coluna de chave CTE
    let headerRowIdx = -1;
    let cteIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 30); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const idx = row.findIndex(v => v != null && String(v).trim().toLowerCase() === colLower(cteColumn));
      if (idx !== -1) { headerRowIdx = i; cteIdx = idx; break; }
    }
    if (headerRowIdx === -1 || cteIdx === -1) return [];

    // Encontra coluna de valor (tenta na ordem)
    let valIdx = -1;
    for (const vc of valueColumns) {
      const headerRow = allRows[headerRowIdx];
      if (!Array.isArray(headerRow)) continue;
      const idx = headerRow.findIndex(v => v != null && String(v).trim().toLowerCase() === colLower(vc));
      if (idx !== -1) { valIdx = idx; break; }
    }

    const dataRows = allRows.slice(headerRowIdx + 1, skipLastRows > 0 ? -skipLastRows : undefined);
    const pairs: { chave: string; valor: number | null }[] = [];

    for (const row of dataRows) {
      if (!Array.isArray(row)) continue;
      const chaveRaw = row[cteIdx];
      if (chaveRaw == null || chaveRaw === '') continue;
      const chave = String(chaveRaw).trim();

      let valor: number | null = null;
      if (valIdx !== -1) {
        const v = row[valIdx];
        if (v != null && v !== '') {
          const num = typeof v === 'number' ? v : parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
          if (!isNaN(num)) valor = num;
        }
      }
      pairs.push({ chave, valor });
    }

    // Detecta se valores estão em centavos (>=90% inteiros)
    const numericVals = pairs.map(p => p.valor).filter((v): v is number => v != null);
    if (numericVals.length > 0) {
      const intCount = numericVals.filter(v => v % 1 === 0).length;
      if (intCount / numericVals.length >= 0.9) {
        return pairs.map(p => ({ ...p, valor: p.valor != null ? p.valor / 100 : null }));
      }
    }
    return pairs;
  } catch {
    return [];
  }
}

function parseSheetFirstValue(buffer: Buffer, column: string, partial = false): string | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;
    const sheet = workbook.Sheets[sheetName];
    const colLower = column.trim().toLowerCase();

    // Tenta com raw:false (texto formatado) e raw:true para maior compatibilidade
    for (const raw of [false, true]) {
      const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw });
      let headerRowIdx = -1;
      let colIdx = -1;
      for (let i = 0; i < Math.min(allRows.length, 30); i++) {
        const row = allRows[i];
        if (!Array.isArray(row)) continue;
        const idx = row.findIndex(v => {
          if (v == null) return false;
          const s = String(v).trim().replace(/\s+/g, ' ').toLowerCase();
          return partial ? s.includes(colLower) : s === colLower;
        });
        if (idx !== -1) { headerRowIdx = i; colIdx = idx; break; }
      }
      if (headerRowIdx === -1) continue;

      const dataRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
      for (let i = headerRowIdx + 1; i < dataRows.length; i++) {
        const row = dataRows[i] as unknown[];
        if (!Array.isArray(row)) continue;
        const v = row[colIdx];
        if (v != null && v !== '') return String(v);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function parseSheetCell(buffer: Buffer, cellRef: string): string | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;
    const sheet = workbook.Sheets[sheetName];
    const cell = sheet[cellRef];
    if (!cell || cell.v == null || cell.v === '') return null;
    return String(cell.v);
  } catch {
    return null;
  }
}

function parseSheetColumnSum(buffer: Buffer, column: string, skipLastRows = 0): number | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    const colLower = column.toLowerCase();

    let headerRowIdx = -1;
    let colIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 30); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const idx = row.findIndex(v => v != null && String(v).trim().toLowerCase() === colLower);
      if (idx !== -1) { headerRowIdx = i; colIdx = idx; break; }
    }
    if (headerRowIdx === -1) return null;

    // Coleta todos os valores numéricos da coluna
    const nums: number[] = [];
    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v != null && v !== '') {
        let num: number;
        if (typeof v === 'number') {
          num = v;
        } else {
          const s = String(v).trim().replace(/\./g, '').replace(',', '.');
          num = parseFloat(s);
        }
        if (!isNaN(num)) nums.push(num);
      }
    }

    // Remove os últimos N valores não-vazios (ex: linha de total)
    const values = skipLastRows > 0 ? nums.slice(0, -skipLastRows) : nums;
    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    const integerCount = values.filter(n => n % 1 === 0).length;
    const likelyCentavos = (integerCount / values.length) >= 0.9;
    return likelyCentavos ? sum / 100 : sum;
  } catch {
    return null;
  }
}

function apiKeyOrJwt(req: AuthRequest, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const expected = process.env.EXTRACT_API_KEY;
    if (!expected || apiKey !== expected) {
      res.status(401).json({ error: 'API key invalida.' });
      return;
    }
    return next();
  }
  authenticate(req, res, next);
}

async function handleExtract(_req: AuthRequest, res: Response) {
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

        const transportadora: string = (file.metadata as any).metadata?.transportadora || 'indefinida';
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
}

// Extract aceita JWT ou X-API-Key estatica (para n8n)
router.get('/planilhas/extract', apiKeyOrJwt, handleExtract);

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
    const headers = parseSheetHeaders(buffer);
    const cvValue = parseSheetFirstValue(buffer, 'NUMERO DA FATURA')
      ?? parseSheetFirstValue(buffer, 'fatura', true)
      ?? parseSheetCell(buffer, 'E3')
      ?? 'NAO_ENCONTRADO';

    // Tenta colunas padrão, depois as salvas no dicionário
    let cpSum = parseSheetColumnSum(buffer, 'BASE CALC')
      ?? parseSheetColumnSum(buffer, 'Frete', 1);
    if (cpSum == null) {
      try {
        await pool.query(`CREATE TABLE IF NOT EXISTS saved_value_column_names (column_name TEXT PRIMARY KEY)`);
        const { rows } = await pool.query<{ column_name: string }>(
          'SELECT column_name FROM saved_value_column_names ORDER BY column_name',
        );
        for (const { column_name } of rows) {
          cpSum = parseSheetColumnSum(buffer, column_name);
          if (cpSum != null) break;
        }
      } catch { /* ignora erro de DB */ }
    }

    res.json({ headers, cvValue, cpSum });
  } catch (err) {
    console.error('GCS columns error:', err);
    res.status(500).json({ error: 'Erro ao ler colunas do arquivo.' });
  }
});

router.get('/planilhas/column-sum', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    const column = String(req.query.column || '');
    if (!filename || !column) {
      res.status(400).json({ error: 'file e column sao obrigatorios.' });
      return;
    }
    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();
    const sum = parseSheetColumnSum(buffer, column);
    res.json({ sum });
  } catch (err) {
    console.error('GCS column-sum error:', err);
    res.status(500).json({ error: 'Erro ao calcular soma da coluna.' });
  }
});

const SIGLA_WEBHOOK = 'https://primary-production-1a8e5.up.railway.app/webhook/ae94c030-88ab-4410-9478-599b56f27664-retorna-sigla';

router.get('/planilhas/detect-sigla', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    const cteColumn = String(req.query.cteColumn || '');
    if (!filename || !cteColumn) {
      res.status(400).json({ error: 'file e cteColumn sao obrigatorios.' });
      return;
    }

    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) { res.json({ sigla: null }); return; }
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    const colLower = cteColumn.trim().toLowerCase();

    let headerRowIdx = -1, colIdx = -1;
    for (let i = 0; i < Math.min(allRows.length, 30); i++) {
      const row = allRows[i];
      if (!Array.isArray(row)) continue;
      const idx = row.findIndex(v => v != null && String(v).trim().replace(/\s+/g, ' ').toLowerCase() === colLower);
      if (idx !== -1) { headerRowIdx = i; colIdx = idx; break; }
    }
    if (headerRowIdx === -1) { res.json({ sigla: null }); return; }

    let chaveCteSample: string | null = null;
    const dataRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
    for (let i = headerRowIdx + 1; i < dataRows.length; i++) {
      const row = dataRows[i] as unknown[];
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v != null && v !== '') { chaveCteSample = String(v); break; }
    }

    if (!chaveCteSample) { res.json({ sigla: null }); return; }

    const webhookRes = await fetch(`${SIGLA_WEBHOOK}?chave_cte=${encodeURIComponent(chaveCteSample)}`);
    if (!webhookRes.ok) { res.json({ sigla: null }); return; }
    const raw = await webhookRes.json();
    // n8n pode retornar array ou objeto direto
    const data: { sigla?: string; transportadora?: string } = Array.isArray(raw) ? raw[0] : raw;
    res.json({ sigla: data?.sigla ?? null, transportadora: data?.transportadora ?? null });
  } catch (err) {
    console.error('detect-sigla error:', err);
    res.json({ sigla: null });
  }
});

router.post('/planilhas/sincronizar', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.body?.file || '');
    const cteColumn = String(req.body?.cteColumn || '');
    if (!filename || !cteColumn) {
      res.status(400).json({ error: 'file e cteColumn sao obrigatorios.' });
      return;
    }

    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();
    const [fileMeta] = await gcs.bucket(BUCKET_NAME).file(filename).getMetadata();
    const rawTransportadora: string = (fileMeta as any).metadata?.transportadora ?? '';
    // Remove espaço entre sigla e título: "ALF 87452" → "ALF87452"
    const transportadora_titulo = rawTransportadora.replace(/\s+/g, '');

    // Tenta colunas de valor na mesma ordem do endpoint /columns
    const { rows: vcRows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_value_column_names ORDER BY column_name',
    ).catch(() => ({ rows: [] }));
    const savedValueCols = vcRows.map(r => r.column_name);
    const valueColumns = ['BASE CALC', 'Frete', ...savedValueCols];

    const ctes = parseSheetCteRows(buffer, cteColumn, valueColumns, valueColumns.includes('Frete') ? 1 : 0);
    const valorTotal = ctes.reduce((sum, c) => sum + (c.valor ?? 0), 0);

    const chaves_cte = ctes.map(c => `'${c.chave}'`).join(',');
    const total_ctes = ctes.length;
    const payload = { transportadora_titulo, arquivo: filename, valorTotal, total_ctes, chaves_cte, ctes };

    const webhookRes = await fetch(SYNC_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const webhookBody = await webhookRes.text();
    let webhookJson: unknown;
    try { webhookJson = JSON.parse(webhookBody); } catch { webhookJson = webhookBody; }

    res.json({ sent: ctes.length, valorTotal, webhook: { status: webhookRes.status, body: webhookJson } });
  } catch (err) {
    console.error('Sincronizar error:', err);
    res.status(500).json({ error: 'Erro ao sincronizar planilha.' });
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

// ── Mapeamentos de valor — lista global de colunas de valor das CTe's ────────

router.get('/mapeamentos/valores', async (_req: AuthRequest, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS saved_value_column_names (
      column_name TEXT PRIMARY KEY
    )`);
    const { rows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_value_column_names ORDER BY column_name',
    );
    res.json(rows.map(r => r.column_name));
  } catch (err) {
    console.error('DB mapeamentos/valores error:', err);
    res.status(500).json({ error: 'Erro ao buscar mapeamentos de valor.' });
  }
});

router.post('/mapeamentos/valores', async (req: AuthRequest, res) => {
  try {
    const columnName = String(req.body?.columnName || '').trim();
    if (!columnName) { res.status(400).json({ error: 'columnName e obrigatorio.' }); return; }
    await pool.query(`CREATE TABLE IF NOT EXISTS saved_value_column_names (column_name TEXT PRIMARY KEY)`);
    await pool.query(
      `INSERT INTO saved_value_column_names (column_name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [columnName],
    );
    res.json({ saved: columnName });
  } catch (err) {
    console.error('DB save value column error:', err);
    res.status(500).json({ error: 'Erro ao salvar coluna de valor.' });
  }
});

router.delete('/mapeamentos/valores/:columnName', async (req: AuthRequest, res) => {
  try {
    const columnName = decodeURIComponent(req.params.columnName);
    await pool.query('DELETE FROM saved_value_column_names WHERE column_name = $1', [columnName]);
    res.json({ deleted: columnName });
  } catch (err) {
    console.error('DB delete value column error:', err);
    res.status(500).json({ error: 'Erro ao remover coluna de valor.' });
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
