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

router.get('/lista', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { numeroNota, dataInicio, dataFim, cnpjTomador, nomeArquivo, razaoSocialEmitente } = req.query;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (numeroNota) {
      conditions.push(`CAST(numero_nota AS TEXT) ILIKE $${idx++}`);
      values.push(`%${String(numeroNota)}%`);
    }
    if (dataInicio) {
      conditions.push(`data_emissao >= $${idx++}`);
      values.push(String(dataInicio));
    }
    if (dataFim) {
      conditions.push(`data_emissao <= $${idx++}`);
      values.push(String(dataFim));
    }
    if (cnpjTomador) {
      conditions.push(`cnpj_tomador ILIKE $${idx++}`);
      values.push(`%${String(cnpjTomador)}%`);
    }
    if (nomeArquivo) {
      conditions.push(`nome_arquivo ILIKE $${idx++}`);
      values.push(`%${String(nomeArquivo)}%`);
    }
    if (razaoSocialEmitente) {
      conditions.push(`razao_social_emitente ILIKE $${idx++}`);
      values.push(`%${String(razaoSocialEmitente)}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM controle_arquivos_drive ${where} ORDER BY data_emissao DESC NULLS LAST LIMIT 500`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error('NFSe lista error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
