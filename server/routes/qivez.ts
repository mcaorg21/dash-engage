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

router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_painel');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const result = await pool.query(`
      SELECT
          DATE_TRUNC('month', data_lancamento) AS mes,
          COUNT(DISTINCT chave_cte)::int AS total,
          COUNT(DISTINCT chave_cte) FILTER (WHERE existe_qives_sysemp = false AND cancelada = true)::int  AS total_cancelado,
          COUNT(DISTINCT chave_cte) FILTER (WHERE existe_qives_sysemp = false AND cancelada = false)::int AS total_false,
          COALESCE(SUM(diferenca_valor) FILTER (WHERE existe_qives_sysemp = false AND cancelada = false), 0)::float AS soma_false,
          COALESCE(AVG(diferenca_valor) FILTER (WHERE existe_qives_sysemp = false AND cancelada = false), 0)::float AS media_false
      FROM lancamentos_financeiros
      GROUP BY 1
      ORDER BY 1
    `);

    res.json(result.rows.map(row => ({
      mes: row.mes,
      total: Number(row.total || 0),
      total_cancelado: Number(row.total_cancelado || 0),
      total_false: Number(row.total_false || 0),
      soma_false: Number(row.soma_false || 0),
      media_false: Number(row.media_false || 0),
    })));
  } catch (err) {
    console.error('Qivez dashboard error:', err);
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

    const { dataInicio, dataFim, chaveCte } = req.query;
    const filters = ['existe_qives_sysemp = false', 'cancelada = false'];
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

    const result = await pool.query(`
      SELECT
        id,
        data_lancamento,
        chave_cte,
        tipo,
        diferenca_valor AS valor,
        json_xml
      FROM public.lancamentos_financeiros
      WHERE ${filters.join(' AND ')}
      ORDER BY id ASC
    `, values);

    res.json(result.rows);
  } catch (err) {
    console.error('Qivez lancamentos list error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
