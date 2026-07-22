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

    const colLower = column.trim().toLowerCase();
    const values: unknown[] = [];
    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v !== null && v !== undefined && v !== '' && String(v).trim().toLowerCase() !== colLower) values.push(v);
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
    const colLower = (c: string) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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

    // Detecta coluna "CODIGO DE BARRAS DACTE" — se existir, filtra linhas sem esse campo
    const DACTE_COL = 'codigo de barras dacte';
    const headerRow = allRows[headerRowIdx];
    let dacteIdx = -1;
    if (Array.isArray(headerRow)) {
      dacteIdx = headerRow.findIndex(v => v != null && colLower(String(v).trim()) === DACTE_COL);
    }

    let dataRows = allRows.slice(headerRowIdx + 1, skipLastRows > 0 ? -skipLastRows : undefined);

    // Trunca na última linha que contém uma chave CT-e válida (exatamente 44 dígitos)
    // Isso exclui linhas de totais/rodapé que podem ter valores numéricos grandes mas != 44 dígitos
    let lastCteIdx = -1;
    for (let i = dataRows.length - 1; i >= 0; i--) {
      const row = dataRows[i];
      if (!Array.isArray(row)) continue;
      const v = (row as unknown[])[cteIdx];
      if (v == null || v === '') continue;
      const chave = String(v).replace(/^'+/, '').trim();
      if (chave.replace(/\D/g, '').length === 44) { lastCteIdx = i; break; }
    }
    if (lastCteIdx >= 0) dataRows = dataRows.slice(0, lastCteIdx + 1);

    const pairs: { chave: string; valor: number | null }[] = [];

    // Usa raw:false (texto formatado pelo Excel) para o valor — garante que formatos com
    // fator de escala (ex: BR #.##0,00 que XLSX interpreta como ÷1000) retornem o valor
    // visível correto (ex: "1.023,58") em vez do número interno escalado (ex: 1.02358)
    const parseNumeric = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return isFinite(v) ? v : null;
      // Remove símbolos de moeda e espaços, mantém dígitos, ponto, vírgula e sinal
      const s = String(v).trim().replace(/[^\d.,-]/g, '');
      if (!s) return null;
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      let num: number;
      if (lastComma > lastDot) {
        // Formato BR: 1.023,58 — vírgula é separador decimal
        num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
      } else if (lastDot > lastComma) {
        // Formato US: 1,023.58 — ponto é separador decimal
        num = parseFloat(s.replace(/,/g, ''));
      } else {
        num = parseFloat(s);
      }
      return isNaN(num) ? null : num;
    };

    const valorDisplayStrings: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      if (!Array.isArray(row)) continue;
      // Se a planilha tem coluna DACTE, pula linhas sem esse campo preenchido
      if (dacteIdx !== -1) {
        const dacte = (row as unknown[])[dacteIdx];
        if (dacte == null || String(dacte).trim() === '') continue;
      }
      const chaveRaw = row[cteIdx];
      if (chaveRaw == null || chaveRaw === '') continue;
      const chave = String(chaveRaw).replace(/^'+/, '').trim();
      // Pula linhas de cabeçalho repetido no meio dos dados
      if (colLower(chave) === colLower(cteColumn)) continue;
      // Pula chaves com 10 ou menos dígitos — não é uma chave CT-e válida
      if (chave.replace(/\D/g, '').length <= 10) continue;

      let valor: number | null = null;
      if (valIdx !== -1) {
        const v = (row as unknown[])[valIdx];
        valor = parseNumeric(v);
        if (valor !== null) valorDisplayStrings.push(String(v ?? ''));
      }
      pairs.push({ chave, valor });
    }

    // Heurística de centavos só aplica quando nenhum valor exibido tem separador decimal (vírgula BR)
    // Ex: "10.500,00" revela casas decimais — não é centavo, não divide por 100
    const hasDecimalDisplay = valorDisplayStrings.some(s => s.includes(','));
    if (!hasDecimalDisplay) {
      const numericVals = pairs.map(p => p.valor).filter((v): v is number => v != null);
      if (numericVals.length > 0) {
        const intCount = numericVals.filter(v => v % 1 === 0).length;
        if (intCount / numericVals.length >= 0.9) {
          return pairs.map(p => ({ ...p, valor: p.valor != null ? p.valor / 100 : null }));
        }
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
    // cellText + raw:false retorna o texto formatado pelo Excel (ex: "10.500,00" em vez do número 10500)
    const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
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

    const parseNumeric = (v: unknown): number | null => {
      if (v == null || v === '') return null;
      if (typeof v === 'number') return isFinite(v) ? v : null;
      const s = String(v).trim().replace(/[^\d.,-]/g, '');
      if (!s) return null;
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      if (lastComma > lastDot) return parseFloat(s.replace(/\./g, '').replace(',', '.'));
      if (lastDot > lastComma) return parseFloat(s.replace(/,/g, ''));
      return parseFloat(s);
    };

    const displayStrings: string[] = [];
    const nums: number[] = [];
    for (let i = headerRowIdx + 1; i < allRows.length; i++) {
      const row = allRows[i] as unknown[];
      if (!Array.isArray(row)) continue;
      const v = row[colIdx];
      if (v != null && v !== '') {
        const num = parseNumeric(v);
        if (num !== null && !isNaN(num)) {
          nums.push(num);
          displayStrings.push(String(v));
        }
      }
    }

    // Remove os últimos N valores não-vazios (ex: linha de total)
    const values = skipLastRows > 0 ? nums.slice(0, -skipLastRows) : nums;
    const displays = skipLastRows > 0 ? displayStrings.slice(0, -skipLastRows) : displayStrings;
    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    // Heurística de centavos só aplica quando nenhum valor exibido tem separador decimal (vírgula BR)
    // Valores como "10.500,00" revelam casas decimais explícitas — não são centavos
    const hasDecimalDisplay = displays.some(s => s.includes(','));
    if (!hasDecimalDisplay) {
      const integerCount = values.filter(n => n % 1 === 0).length;
      if ((integerCount / values.length) >= 0.9) return sum / 100;
    }
    return sum;
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

// Rotas que aceitam JWT ou X-API-Key estatica (para n8n)
router.get('/planilhas/extract', apiKeyOrJwt, handleExtract);

router.post('/planilhas/upload-base64', apiKeyOrJwt, async (req: AuthRequest, res) => {
  try {
    const files: { name: string; data: string; mimeType?: string }[] = Array.isArray(req.body?.files)
      ? req.body.files
      : [];

    if (files.length === 0) {
      res.status(400).json({ error: 'Nenhum arquivo enviado.' });
      return;
    }

    const bucket = gcs.bucket(BUCKET_NAME);
    const uploaded: string[] = [];

    await Promise.all(
      files.map(file => {
        if (!file.name || !file.data) throw new Error(`Arquivo inválido: name e data são obrigatórios.`);
        const buffer = Buffer.from(file.data, 'base64');
        const blob = bucket.file(file.name);
        return new Promise<void>((resolve, reject) => {
          const stream = blob.createWriteStream({
            metadata: { contentType: file.mimeType || 'application/octet-stream' },
            resumable: false,
          });
          stream.on('error', reject);
          stream.on('finish', () => { uploaded.push(file.name); resolve(); });
          stream.end(buffer);
        });
      }),
    );

    res.json({ uploaded });
  } catch (err: any) {
    console.error('GCS upload-base64 error:', err);
    res.status(500).json({ error: err.message || 'Erro ao fazer upload dos arquivos.' });
  }
});

router.use(authenticate);

// ── Planilhas (GCS files) ─────────────────────────────────────────────────────

router.get('/planilhas', async (_req: AuthRequest, res) => {
  try {
    const [files] = await gcs.bucket(BUCKET_NAME).getFiles();
    res.json(
      files.map(f => {
        const meta = (f.metadata as any).metadata ?? {};
        return {
          name: f.name,
          size: Number(f.metadata.size || 0),
          updated: f.metadata.updated ?? null,
          contentType: f.metadata.contentType ?? null,
          transportadora: meta.transportadora ?? null,
          sigla: meta.sigla ?? null,
          titulo: meta.titulo ?? null,
          coluna_cte: meta.coluna_cte ?? null,
          valor_total: meta.valor_total ? Number(meta.valor_total) : null,
        };
      }),
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
    if (req.body.sigla !== undefined) updates.sigla = String(req.body.sigla);
    if (req.body.titulo !== undefined) updates.titulo = String(req.body.titulo);
    if (req.body.coluna_cte !== undefined) updates.coluna_cte = String(req.body.coluna_cte);
    if (req.body.valor_total !== undefined) updates.valor_total = String(req.body.valor_total);
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
    const faturaPartial = parseSheetFirstValue(buffer, 'fatura', true);
    const cvValue = parseSheetFirstValue(buffer, 'NUMERO DA FATURA')
      ?? (faturaPartial && /\d/.test(faturaPartial) ? faturaPartial : null)
      ?? parseSheetCell(buffer, 'D3')
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

router.get('/planilhas/paired-value-sum', async (req: AuthRequest, res) => {
  try {
    const filename = String(req.query.file || '');
    const cteColumn = String(req.query.cteColumn || '');
    if (!filename || !cteColumn) { res.status(400).json({ error: 'file e cteColumn sao obrigatorios.' }); return; }
    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();
    const { rows: vcRows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_value_column_names ORDER BY column_name',
    ).catch(() => ({ rows: [] }));
    const savedValueCols = vcRows.map(r => r.column_name);
    const valueColumns = ['VAL RECEBER', 'Total Servico', 'Total Frete', 'Frete', 'Valor', ...savedValueCols];
    const ctes = parseSheetCteRows(buffer, cteColumn, valueColumns, 0);
    const sum = ctes.reduce((s, c) => s + (c.valor ?? 0), 0);
    res.json({ sum: ctes.length > 0 && sum > 0 ? sum : null, count: ctes.length });
  } catch (err) {
    console.error('paired-value-sum error:', err);
    res.json({ sum: null });
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
      if (v != null && v !== '') { chaveCteSample = String(v).replace(/^'+/, '').trim(); break; }
    }

    if (!chaveCteSample) { res.json({ sigla: null }); return; }

    const webhookRes = await fetch(`${SIGLA_WEBHOOK}?chave_cte=${encodeURIComponent(chaveCteSample)}&nome_planilha=${encodeURIComponent(filename)}`);
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

    const sigla = String(req.body?.sigla ?? '').trim();
    const titulo = String(req.body?.titulo ?? '').trim();
    const transportadora_titulo = (sigla + titulo).replace(/\s+/g, '');

    const [buffer] = await gcs.bucket(BUCKET_NAME).file(filename).download();

    // Tenta colunas de valor na mesma ordem do endpoint /columns
    const { rows: vcRows } = await pool.query<{ column_name: string }>(
      'SELECT column_name FROM saved_value_column_names ORDER BY column_name',
    ).catch(() => ({ rows: [] }));
    const savedValueCols = vcRows.map(r => r.column_name);
    const valueColumns = ['VAL RECEBER', 'Total Servico', 'Total Frete', 'Frete', 'Valor', ...savedValueCols];

    const ctes = parseSheetCteRows(buffer, cteColumn, valueColumns, 0);
    const valorTotal = ctes.reduce((sum, c) => sum + (c.valor ?? 0), 0);

    const ctesNormalized = ctes.map(c => ({ ...c, chave: c.chave.replace(/\D/g, '') }));
    const chaves_cte = ctesNormalized.map(c => `'${c.chave}'`).join(',');
    const total_ctes = ctesNormalized.length;
    const payload = { sigla, titulo, transportadora_titulo, arquivo: filename, valorTotal, total_ctes, chaves_cte, ctes: ctesNormalized };

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

// ── Histórico de conciliações ────────────────────────────────────────────────

router.get('/planilhas/conciliadas', async (_req, res) => {
  try {
    const { rows } = await pool.query<{
      id: number; nome_arquivo: string; sigla: string; titulo: string;
      coluna_cte: string; total_ctes: number; valor_total: string;
      sql_retorno: string | null; conciliado_por: string | null; conciliado_em: string;
    }>('SELECT * FROM planilhas_conciliadas ORDER BY conciliado_em DESC');
    res.json(rows.map(r => ({ ...r, valor_total: Number(r.valor_total) })));
  } catch (err) {
    console.error('DB conciliadas GET error:', err);
    res.status(500).json({ error: 'Erro ao buscar conciliações.' });
  }
});

router.post('/planilhas/conciliadas', async (req: AuthRequest, res) => {
  try {
    const { nome_arquivo, sigla, titulo, coluna_cte, total_ctes, valor_total, sql_retorno } = req.body ?? {};
    if (!nome_arquivo || sigla == null || titulo == null || !coluna_cte || total_ctes == null || valor_total == null) {
      res.status(400).json({ error: 'Campos obrigatórios ausentes.' }); return;
    }
    const { rows } = await pool.query<{ id: number; conciliado_em: string }>(
      `INSERT INTO planilhas_conciliadas (nome_arquivo, sigla, titulo, coluna_cte, total_ctes, valor_total, sql_retorno, conciliado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, conciliado_em`,
      [nome_arquivo, sigla, titulo, coluna_cte, Number(total_ctes), Number(valor_total), sql_retorno ?? null, req.userEmail ?? null],
    );
    res.json({ id: rows[0].id, conciliado_em: rows[0].conciliado_em });
  } catch (err) {
    console.error('DB conciliadas POST error:', err);
    res.status(500).json({ error: 'Erro ao salvar conciliação.' });
  }
});

router.delete('/planilhas/conciliadas', async (_req, res) => {
  try {
    await pool.query('DELETE FROM planilhas_conciliadas');
    res.json({ deleted: true });
  } catch (err) {
    console.error('DB conciliadas DELETE error:', err);
    res.status(500).json({ error: 'Erro ao limpar histórico.' });
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
