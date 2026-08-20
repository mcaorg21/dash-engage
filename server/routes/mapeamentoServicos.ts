import { Router } from 'express';
import { pool } from '../db.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';

const router = Router();

const TIPOS_SERVICO = ['Transporte', 'Telecom', 'Terceirizado', 'Marketplace', 'Demais Servicos'];
const SIMILARIDADE_MINIMA = 0.6;

async function findFornecedorSimilar(fornecedorPattern: string, ocrPdfPattern: string | null | undefined, excludeId?: number) {
  const result = await pool.query(
    `SELECT id, fornecedor_pattern, tipo_servico, similarity(lower(fornecedor_pattern), lower($1)) AS sim
     FROM mapeamento_tipo_servico
     WHERE fornecedor_pattern IS NOT NULL
       AND ($2::int IS NULL OR id != $2)
       AND similarity(lower(fornecedor_pattern), lower($1)) >= ${SIMILARIDADE_MINIMA}
       AND COALESCE(lower(ocr_pdf_pattern), '') = COALESCE(lower($3::text), '')
     ORDER BY sim DESC
     LIMIT 1`,
    [fornecedorPattern, excludeId ?? null, ocrPdfPattern || null]
  );
  return result.rows[0] as { id: number; fornecedor_pattern: string; tipo_servico: string; sim: number } | undefined;
}

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

router.get('/', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT m.*, (
        SELECT COUNT(*)::int FROM controle_arquivos_drive c
        WHERE fn_regra_bate(c.razao_social_emitente, c.cidade_uf_emitente, c.endereco_tomador, c.ocr_pdf, m.fornecedor_pattern, m.uf_emitente_pattern, m.endereco_tomador_pattern, m.padrao_pessoa_fisica, m.ocr_pdf_pattern)
      ) AS total_notas
      FROM mapeamento_tipo_servico m
      ORDER BY m.prioridade ASC, m.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Mapeamento servicos lista error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/fornecedores', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT DISTINCT razao_social_emitente
      FROM controle_arquivos_drive
      WHERE razao_social_emitente IS NOT NULL AND BTRIM(razao_social_emitente) <> ''
      ORDER BY razao_social_emitente
    `);
    res.json(result.rows.map((r: { razao_social_emitente: string }) => r.razao_social_emitente));
  } catch (err) {
    console.error('Mapeamento servicos fornecedores error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.get('/contagem', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      SELECT COALESCE(tipo_servico, 'Nao classificado') AS tipo_servico, COUNT(*)::int AS total
      FROM controle_arquivos_drive
      GROUP BY COALESCE(tipo_servico, 'Nao classificado')
      ORDER BY total DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Mapeamento servicos contagem error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const { tipoServico, fornecedorPattern, ufEmitentePattern, enderecoTomadorPattern, padraoPessoaFisica, prioridade, ativo, observacao, ocrPdfPattern } = req.body || {};
    if (!tipoServico || !TIPOS_SERVICO.includes(tipoServico)) {
      res.status(400).json({ error: 'Tipo de servico invalido' });
      return;
    }
    if (!padraoPessoaFisica && !fornecedorPattern && !ufEmitentePattern && !enderecoTomadorPattern && !ocrPdfPattern) {
      res.status(400).json({ error: 'Informe ao menos um criterio de match' });
      return;
    }
    if (fornecedorPattern) {
      const similar = await findFornecedorSimilar(fornecedorPattern, ocrPdfPattern);
      if (similar) {
        res.status(400).json({
          error: `Fornecedor muito parecido com a regra existente "${similar.fornecedor_pattern}" (${similar.tipo_servico}, ${Math.round(similar.sim * 100)}% de similaridade). Edite a regra existente em vez de criar uma nova.`,
        });
        return;
      }
    }

    const result = await pool.query(
      `INSERT INTO mapeamento_tipo_servico (tipo_servico, fornecedor_pattern, uf_emitente_pattern, endereco_tomador_pattern, padrao_pessoa_fisica, prioridade, ativo, observacao, ocr_pdf_pattern)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tipoServico,
        fornecedorPattern || null,
        ufEmitentePattern || null,
        enderecoTomadorPattern || null,
        Boolean(padraoPessoaFisica),
        Number.isFinite(Number(prioridade)) ? Number(prioridade) : 100,
        ativo === undefined ? true : Boolean(ativo),
        observacao || null,
        ocrPdfPattern || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Mapeamento servicos create error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Id invalido' }); return; }

    const { tipoServico, fornecedorPattern, ufEmitentePattern, enderecoTomadorPattern, padraoPessoaFisica, prioridade, ativo, observacao, ocrPdfPattern } = req.body || {};
    if (!tipoServico || !TIPOS_SERVICO.includes(tipoServico)) {
      res.status(400).json({ error: 'Tipo de servico invalido' });
      return;
    }
    if (!padraoPessoaFisica && !fornecedorPattern && !ufEmitentePattern && !enderecoTomadorPattern && !ocrPdfPattern) {
      res.status(400).json({ error: 'Informe ao menos um criterio de match' });
      return;
    }
    if (fornecedorPattern) {
      const similar = await findFornecedorSimilar(fornecedorPattern, ocrPdfPattern, id);
      if (similar) {
        res.status(400).json({
          error: `Fornecedor muito parecido com a regra existente "${similar.fornecedor_pattern}" (${similar.tipo_servico}, ${Math.round(similar.sim * 100)}% de similaridade). Edite a regra existente em vez de criar uma nova.`,
        });
        return;
      }
    }

    const result = await pool.query(
      `UPDATE mapeamento_tipo_servico
       SET tipo_servico = $1, fornecedor_pattern = $2, uf_emitente_pattern = $3, endereco_tomador_pattern = $4,
           padrao_pessoa_fisica = $5, prioridade = $6, ativo = $7, observacao = $8, ocr_pdf_pattern = $9, atualizado_em = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        tipoServico,
        fornecedorPattern || null,
        ufEmitentePattern || null,
        enderecoTomadorPattern || null,
        Boolean(padraoPessoaFisica),
        Number.isFinite(Number(prioridade)) ? Number(prioridade) : 100,
        ativo === undefined ? true : Boolean(ativo),
        observacao || null,
        ocrPdfPattern || null,
        id,
      ]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'Regra nao encontrada' }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Mapeamento servicos update error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const id = Number(req.params.id);
    if (!Number.isFinite(id)) { res.status(400).json({ error: 'Id invalido' }); return; }

    const result = await pool.query('DELETE FROM mapeamento_tipo_servico WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Regra nao encontrada' }); return; }
    res.json({ deleted: id });
  } catch (err) {
    console.error('Mapeamento servicos delete error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

router.post('/reclassificar', async (req: AuthRequest, res) => {
  try {
    const allowed = await hasPermission(req, 'ferramentas_mapeamento_servicos');
    if (!allowed) { res.status(403).json({ error: 'Acesso negado' }); return; }

    const result = await pool.query(`
      UPDATE controle_arquivos_drive
      SET tipo_servico = fn_classificar_tipo_servico(razao_social_emitente, cidade_uf_emitente, endereco_tomador, ocr_pdf)
    `);
    res.json({ atualizados: result.rowCount });
  } catch (err) {
    console.error('Mapeamento servicos reclassificar error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

export default router;
