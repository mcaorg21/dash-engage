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

const municipioSql = `json_xml::jsonb #>> '{NFe,infNFe,dest,enderDest,xMun}'`;
const cnpjTomadorSql = `json_xml::jsonb #>> '{NFe,infNFe,dest,CNPJ}'`;
const empresaSql = `json_bd::jsonb #>> '{nfeProc,NFe,infNFe,emit,xFant}'`;

router.get('/sistemas', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfe_listar');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT sistema::text AS sistema
      FROM public.nfe_lancamentos_financeiros
      WHERE sistema IS NOT NULL AND sistema <> ''
        AND cancelada = false AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)
      ORDER BY sistema
    `);
    res.json(result.rows.map((r: { sistema: string }) => r.sistema));
  } catch (err) {
    console.error('NFe sistemas error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/municipios', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfe_listar');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT INITCAP(MIN(BTRIM(${municipioSql}))) AS municipio
      FROM public.nfe_lancamentos_financeiros
      WHERE cancelada = false
        AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)
        AND NULLIF(BTRIM(${municipioSql}), '') IS NOT NULL
      GROUP BY LOWER(BTRIM(${municipioSql}))
      ORDER BY municipio
    `);
    res.json(result.rows.map((r: { municipio: string }) => r.municipio));
  } catch (err) {
    console.error('NFe municipios error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/cnpjs', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfe_listar');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT BTRIM(${cnpjTomadorSql}) AS cnpj
      FROM public.nfe_lancamentos_financeiros
      WHERE cancelada = false
        AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)
        AND NULLIF(BTRIM(${cnpjTomadorSql}), '') IS NOT NULL
      ORDER BY cnpj
    `);
    res.json(result.rows.map((r: { cnpj: string }) => r.cnpj));
  } catch (err) {
    console.error('NFe cnpjs error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/lancamentos/count', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfe_listar');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT COUNT(*)::int AS total
      FROM public.nfe_lancamentos_financeiros
      WHERE cancelada = false
        AND (existe_qives_sysemp = false OR existe_sysemp_qives = false)
    `);
    res.json({ total: result.rows[0]?.total ?? 0 });
  } catch (err) {
    console.error('NFe lancamentos count error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/lancamentos', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfe_listar');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { dataInicio, dataFim, chaveNfe, sistema, municipio, cnpj, empresa } = req.query;
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

    if (typeof chaveNfe === 'string' && chaveNfe.trim()) {
      values.push(`%${chaveNfe.trim()}%`);
      filters.push(`chave_nfe ILIKE $${values.length}`);
    }

    if (typeof sistema === 'string' && sistema.trim()) {
      values.push(`%${sistema.trim()}%`);
      filters.push(`sistema ILIKE $${values.length}`);
    }

    if (typeof municipio === 'string' && municipio.trim()) {
      values.push(`%${municipio.trim()}%`);
      filters.push(`${municipioSql} ILIKE $${values.length}`);
    }

    if (typeof cnpj === 'string' && cnpj.trim()) {
      values.push(`%${cnpj.trim()}%`);
      filters.push(`${cnpjTomadorSql} ILIKE $${values.length}`);
    }

    if (typeof empresa === 'string' && empresa.trim()) {
      values.push(`%${empresa.trim()}%`);
      filters.push(`${empresaSql} ILIKE $${values.length}`);
    }

    const result = await pool.query(`
      SELECT
        id,
        data_lancamento,
        chave_nfe,
        tipo,
        sistema::text AS sistema,
        ${municipioSql} AS municipio,
        ${cnpjTomadorSql} AS cnpj_tomador,
        ${empresaSql} AS empresa,
        diferenca_valor AS valor,
        json_xml
      FROM public.nfe_lancamentos_financeiros
      WHERE ${filters.join(' AND ')}
      ORDER BY data_lancamento DESC, id DESC
    `, values);

    res.json(result.rows);
  } catch (err) {
    console.error('NFe lancamentos list error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
