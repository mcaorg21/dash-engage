import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const router = Router();

async function hasPermission(req: AuthRequest, permission: string) {
  if (req.isAdmin) return true;
  if (!req.userEmail) return false;

  const result = await pool.query(
    'SELECT permissions FROM users WHERE email = $1 AND is_active = true',
    [req.userEmail]
  );

  return result.rows[0]?.permissions?.includes(permission) || false;
}

router.use(authenticate);

// Busca recursivamente o no infCte dentro do json_xml (pode estar aninhado em wrappers diferentes)
function findInfCte(obj: unknown): Record<string, unknown> | null {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const record = obj as Record<string, unknown>;
  if (record.infCte && typeof record.infCte === 'object') return record.infCte as Record<string, unknown>;
  for (const val of Object.values(record)) {
    const found = findInfCte(val);
    if (found) return found;
  }
  return null;
}

function extractRemInfo(jsonXmlRaw: unknown): string | null {
  let jsonXml = jsonXmlRaw;
  if (typeof jsonXml === 'string') {
    try { jsonXml = JSON.parse(jsonXml); } catch { return null; }
  }
  const infCte = findInfCte(jsonXml);
  const rem = infCte?.rem as Record<string, unknown> | undefined;
  if (!rem) return null;
  const cnpj = typeof rem.CNPJ === 'string' ? rem.CNPJ : '';
  const ender = rem.enderReme as Record<string, unknown> | undefined;
  const xMun = ender && typeof ender.xMun === 'string' ? ender.xMun : '';
  const info = [cnpj, xMun].filter(Boolean).join('_');
  return info || null;
}

router.post('/rem-info', async (req: AuthRequest, res) => {
  try {
    const chaves: string[] = Array.isArray(req.body?.chaves)
      ? req.body.chaves.filter((c: unknown): c is string => typeof c === 'string' && c.trim() !== '')
      : [];
    if (chaves.length === 0) { res.json({}); return; }

    const result = await pool.query(
      'SELECT chave_cte, json_xml FROM lancamentos_financeiros WHERE chave_cte = ANY($1)',
      [chaves],
    );

    const map: Record<string, string> = {};
    for (const row of result.rows) {
      const info = extractRemInfo(row.json_xml);
      if (info) map[row.chave_cte] = info;
    }
    res.json(map);
  } catch (err) {
    console.error('Qivez rem-info error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_painel');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const [monthly, canceladosResult] = await Promise.all([
      pool.query(`
        SELECT
            MAKE_DATE(EXTRACT(YEAR FROM data_lancamento)::int, EXTRACT(MONTH FROM data_lancamento)::int, 1) AS mes,
            COUNT(DISTINCT chave_cte)::int AS total,
            COUNT(*) FILTER (WHERE cancelada = false AND (existe_qives_sysemp = false OR existe_sysemp_qives = false))::int AS total_false,
            COALESCE(SUM(diferenca_valor) FILTER (WHERE cancelada = false AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)), 0)::float AS soma_false,
            COALESCE(AVG(diferenca_valor) FILTER (WHERE cancelada = false AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)), 0)::float AS media_false
        FROM lancamentos_financeiros
        GROUP BY 1
        ORDER BY 1
      `),
      pool.query(`SELECT COUNT(*)::int AS total_cancelado FROM lancamentos_financeiros WHERE cancelada = true`),
    ]);

    const totalCancelado = Number(canceladosResult.rows[0]?.total_cancelado || 0);

    res.json({
      totalCancelado,
      months: monthly.rows.map(row => ({
        mes: row.mes,
        total: Number(row.total || 0),
        total_false: Number(row.total_false || 0),
        soma_false: Number(row.soma_false || 0),
        media_false: Number(row.media_false || 0),
      })),
    });
  } catch (err) {
    console.error('Qivez dashboard error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/sistemas', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_listar');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT sistema::text AS sistema
      FROM public.lancamentos_financeiros
      WHERE sistema IS NOT NULL AND sistema <> ''
        AND cancelada = false AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)
      ORDER BY sistema
    `);
    res.json(result.rows.map((r: { sistema: string }) => r.sistema));
  } catch (err) {
    console.error('Qivez sistemas error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/lancamentos', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_listar');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { dataInicio, dataFim, chaveCte, sistema } = req.query;
    const filters = ['cancelada = false', '(existe_qives_sysemp = false OR existe_sysemp_qives = false)'];
    const values: string[] = [];

    if (typeof dataInicio === 'string' && dataInicio) {
      values.push(dataInicio);
      filters.push(`data_lancamento::date >= $${values.length}`);
    }

    if (typeof dataFim === 'string' && dataFim) {
      values.push(dataFim);
      filters.push(`data_lancamento::date <= $${values.length}`);
    }

    if (typeof chaveCte === 'string' && chaveCte.trim()) {
      values.push(`%${chaveCte.trim()}%`);
      filters.push(`chave_cte ILIKE $${values.length}`);
    }

    if (typeof sistema === 'string' && sistema.trim()) {
      values.push(`%${sistema.trim()}%`);
      filters.push(`sistema ILIKE $${values.length}`);
    }

    const result = await pool.query(`
      SELECT
        id,
        data_lancamento,
        chave_cte,
        tipo,
        sistema::text AS sistema,
        diferenca_valor AS valor,
        json_xml
      FROM public.lancamentos_financeiros
      WHERE ${filters.join(' AND ')}
      ORDER BY data_lancamento DESC, id DESC
    `, values);

    res.json(result.rows);
  } catch (err) {
    console.error('Qivez lancamentos list error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/sistemas-canceladas', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_canceladas');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT sistema::text AS sistema
      FROM public.lancamentos_financeiros
      WHERE sistema IS NOT NULL AND sistema <> '' AND cancelada = true
      ORDER BY sistema
    `);
    res.json(result.rows.map((r: { sistema: string }) => r.sistema));
  } catch (err) {
    console.error('Qivez sistemas-canceladas error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/canceladas', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_canceladas');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { dataInicio, dataFim, chaveCte, sistema } = req.query;
    const filters = ['cancelada = true'];
    const values: string[] = [];

    if (typeof dataInicio === 'string' && dataInicio) {
      values.push(dataInicio);
      filters.push(`data_lancamento::date >= $${values.length}`);
    }

    if (typeof dataFim === 'string' && dataFim) {
      values.push(dataFim);
      filters.push(`data_lancamento::date <= $${values.length}`);
    }

    if (typeof chaveCte === 'string' && chaveCte.trim()) {
      values.push(`%${chaveCte.trim()}%`);
      filters.push(`chave_cte ILIKE $${values.length}`);
    }

    if (typeof sistema === 'string' && sistema.trim()) {
      values.push(`%${sistema.trim()}%`);
      filters.push(`sistema ILIKE $${values.length}`);
    }

    const result = await pool.query(`
      SELECT
        id,
        data_lancamento,
        chave_cte,
        tipo,
        sistema::text AS sistema,
        diferenca_valor AS valor,
        json_xml
      FROM public.lancamentos_financeiros
      WHERE ${filters.join(' AND ')}
      ORDER BY data_lancamento DESC, id DESC
    `, values);

    res.json(result.rows);
  } catch (err) {
    console.error('Qivez canceladas list error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
