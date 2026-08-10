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

router.get('/cnpjs', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT cnpj_tomador
      FROM controle_arquivos_drive
      WHERE cnpj_tomador IS NOT NULL AND BTRIM(cnpj_tomador) <> ''
      ORDER BY cnpj_tomador
    `);
    res.json(result.rows.map((r: { cnpj_tomador: string }) => r.cnpj_tomador));
  } catch (err) {
    console.error('NFSe cnpjs error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/canais-venda', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT canal_de_venda
      FROM controle_arquivos_drive
      WHERE canal_de_venda IS NOT NULL AND BTRIM(canal_de_venda) <> ''
      ORDER BY canal_de_venda
    `);
    res.json(result.rows.map((r: { canal_de_venda: string }) => r.canal_de_venda));
  } catch (err) {
    console.error('NFSe canais de venda error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/lista', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { numeroNota, dataInicio, dataFim, cnpjTomador, nomeArquivo, razaoSocialEmitente, campoData, cancelada, canalVenda, tipoServico } = req.query;

    const campoDataColuna = campoData === 'competencia' ? 'competencia_servico' : 'data_emissao';

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (numeroNota) {
      conditions.push(`CAST(numero_nota AS TEXT) ILIKE $${idx++}`);
      values.push(`%${String(numeroNota)}%`);
    }
    if (dataInicio) {
      conditions.push(`${campoDataColuna} >= $${idx++}`);
      values.push(String(dataInicio));
    }
    if (dataFim) {
      conditions.push(`${campoDataColuna} <= $${idx++}`);
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
    if (cancelada === 'true') {
      conditions.push(`cancelada = true`);
    } else if (cancelada === 'false') {
      conditions.push(`cancelada IS NOT TRUE`);
    }
    if (canalVenda) {
      conditions.push(`canal_de_venda = $${idx++}`);
      values.push(String(canalVenda));
    }
    if (tipoServico) {
      conditions.push(`tipo_servico = $${idx++}`);
      values.push(String(tipoServico));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM (
        SELECT DISTINCT ON (numero_nota) *
        FROM controle_arquivos_drive ${where}
        ORDER BY numero_nota, data_emissao DESC NULLS LAST
      ) sub
      ORDER BY data_emissao DESC NULLS LAST
      LIMIT 500`,
      values
    );

    res.json(result.rows);
  } catch (err) {
    console.error('NFSe lista error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.patch('/:id/valor-liquido', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'conciliacao_nfse_lista');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    const valorLiquido = Number(req.body?.valorLiquido);
    if (!Number.isFinite(id) || !Number.isFinite(valorLiquido)) {
      res.status(400).json({ error: 'Dados invalidos' });
      return;
    }

    const result = await pool.query(
      'UPDATE controle_arquivos_drive SET valor_liquido = $1 WHERE id = $2 RETURNING valor_liquido',
      [valorLiquido, id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Registro nao encontrado' });
      return;
    }
    res.json({ valor_liquido: result.rows[0].valor_liquido });
  } catch (err) {
    console.error('NFSe valor liquido update error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
