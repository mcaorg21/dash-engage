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

router.get('/lancamentos', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_qivez_listar');
    if (!allowed) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const { dataInicio, dataFim } = req.query;
    const filters = ['existe_qives_sysemp = false'];
    const values: string[] = [];

    if (typeof dataInicio === 'string' && dataInicio) {
      values.push(dataInicio);
      filters.push(`data_lancamento::date >= $${values.length}`);
    }

    if (typeof dataFim === 'string' && dataFim) {
      values.push(dataFim);
      filters.push(`data_lancamento::date <= $${values.length}`);
    }

    const result = await pool.query(`
      SELECT *
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
