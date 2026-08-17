import React, { useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, RefreshCw, Search, Tags, Trash2, X } from 'lucide-react';
import { api, type MapeamentoTipoServico, type MapeamentoTipoServicoInput } from '../utils/api';
import { useModal } from '../components/useModal';

const TIPOS_SERVICO = ['Transporte', 'Telecom', 'Terceirizado', 'Marketplace', 'Demais Servicos'];

const TIPO_BADGE_CLASS: Record<string, string> = {
  Transporte: 'bg-blue-100 text-blue-700 border-blue-200',
  Telecom: 'bg-purple-100 text-purple-700 border-purple-200',
  Terceirizado: 'bg-amber-100 text-amber-700 border-amber-200',
  Marketplace: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Demais Servicos': 'bg-orange-100 text-orange-700 border-orange-200',
  'Nao classificado': 'bg-red-50 text-red-600 border-red-200',
};

const EMPTY_FORM: MapeamentoTipoServicoInput = {
  tipoServico: 'Transporte',
  fornecedorPattern: '',
  ufEmitentePattern: '',
  enderecoTomadorPattern: '',
  padraoPessoaFisica: false,
  prioridade: 10,
  ativo: true,
  observacao: '',
};

const MapeamentoServicosView = () => {
  const [regras, setRegras] = useState<MapeamentoTipoServico[]>([]);
  const [contagem, setContagem] = useState<{ tipo_servico: string; total: number }[]>([]);
  const [fornecedores, setFornecedores] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<MapeamentoTipoServicoInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isReclassifying, setIsReclassifying] = useState(false);
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [mostrarSemNotas, setMostrarSemNotas] = useState(false);
  const { modal, alert: showAlert, danger } = useModal();

  const loadRegras = async () => {
    try {
      const data = await api.getMapeamentoTipoServico();
      setRegras(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar regras.');
    }
  };

  const loadContagem = async () => {
    try {
      const data = await api.getMapeamentoTipoServicoContagem();
      setContagem(data);
    } catch {
      // contagem e informativa; falha silenciosa nao bloqueia a tela
    }
  };

  const loadFornecedores = async () => {
    try {
      const data = await api.getMapeamentoFornecedores();
      setFornecedores(data);
    } catch {
      // lista e apenas para ajudar no autocomplete; falha silenciosa nao bloqueia a tela
    }
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadRegras(), loadContagem(), loadFornecedores()]).finally(() => setIsLoading(false));
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleNovaRegra = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsModalOpen(true);
  };

  const handleEdit = (regra: MapeamentoTipoServico) => {
    setEditingId(regra.id);
    setForm({
      tipoServico: regra.tipo_servico,
      fornecedorPattern: regra.fornecedor_pattern || '',
      ufEmitentePattern: regra.uf_emitente_pattern || '',
      enderecoTomadorPattern: regra.endereco_tomador_pattern || '',
      padraoPessoaFisica: regra.padrao_pessoa_fisica,
      prioridade: regra.prioridade,
      ativo: regra.ativo,
      observacao: regra.observacao || '',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.padraoPessoaFisica && !form.fornecedorPattern?.trim() && !form.ufEmitentePattern?.trim() && !form.enderecoTomadorPattern?.trim()) {
      showAlert('Informe ao menos um criterio: fornecedor, UF do emitente, endereco do tomador, ou marque o padrao pessoa fisica.');
      return;
    }
    setIsSaving(true);
    try {
      const payload: MapeamentoTipoServicoInput = {
        ...form,
        fornecedorPattern: form.fornecedorPattern?.trim() || undefined,
        ufEmitentePattern: form.ufEmitentePattern?.trim() || undefined,
        enderecoTomadorPattern: form.enderecoTomadorPattern?.trim() || undefined,
        observacao: form.observacao?.trim() || undefined,
      };
      if (editingId) {
        await api.updateMapeamentoTipoServico(editingId, payload);
      } else {
        await api.createMapeamentoTipoServico(payload);
      }
      resetForm();
      await loadRegras();
      try {
        await api.reclassificarTipoServico();
      } catch {
        // reclassificacao automatica e best-effort; falha aqui nao deve bloquear o cadastro da regra
      }
      await loadContagem();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao salvar regra.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (regra: MapeamentoTipoServico) => {
    danger(`Remover a regra de "${regra.tipo_servico}"${regra.fornecedor_pattern ? ` (${regra.fornecedor_pattern})` : ''}?`).then(async ok => {
      if (!ok) return;
      try {
        await api.deleteMapeamentoTipoServico(regra.id);
        if (editingId === regra.id) resetForm();
        await loadRegras();
        try {
          await api.reclassificarTipoServico();
        } catch {
          // reclassificacao automatica e best-effort; falha aqui nao deve bloquear a remocao da regra
        }
        await loadContagem();
      } catch (err: any) {
        showAlert(err.message || 'Erro ao remover regra.');
      }
    });
  };

  const handleToggleAtivo = async (regra: MapeamentoTipoServico) => {
    try {
      await api.updateMapeamentoTipoServico(regra.id, {
        tipoServico: regra.tipo_servico,
        fornecedorPattern: regra.fornecedor_pattern || undefined,
        ufEmitentePattern: regra.uf_emitente_pattern || undefined,
        enderecoTomadorPattern: regra.endereco_tomador_pattern || undefined,
        padraoPessoaFisica: regra.padrao_pessoa_fisica,
        prioridade: regra.prioridade,
        ativo: !regra.ativo,
        observacao: regra.observacao || undefined,
      });
      await loadRegras();
      try {
        await api.reclassificarTipoServico();
      } catch {
        // reclassificacao automatica e best-effort; falha aqui nao deve bloquear a atualizacao da regra
      }
      await loadContagem();
    } catch (err: any) {
      showAlert(err.message || 'Erro ao atualizar regra.');
    }
  };

  const handleReclassificar = async () => {
    setIsReclassifying(true);
    try {
      const result = await api.reclassificarTipoServico();
      await loadContagem();
      showAlert(`Reclassificacao concluida: ${result.atualizados} nota(s) atualizadas.`);
    } catch (err: any) {
      showAlert(err.message || 'Erro ao reclassificar.');
    } finally {
      setIsReclassifying(false);
    }
  };

  const regrasFiltradas = regras.filter(regra => {
    const matchFornecedor = !filtroFornecedor.trim() || (regra.fornecedor_pattern || '').toLowerCase().includes(filtroFornecedor.trim().toLowerCase());
    const matchTipo = !filtroTipo || regra.tipo_servico === filtroTipo;
    const matchNotas = mostrarSemNotas || regra.total_notas > 0;
    return matchFornecedor && matchTipo && matchNotas;
  });
  const regrasSemNotasOcultas = regras.length - regras.filter(r => r.total_notas > 0).length;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-[var(--engage-blue-500)]" size={32} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--engage-blue-800)]">
            <Tags className="text-[var(--engage-blue-500)]" /> Mapeamento de Servicos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Regras para classificar automaticamente as NFSe como Transporte, Telecom, Terceirizado ou Demais Servicos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleNovaRegra}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--engage-blue-600)] px-4 py-2.5 text-sm font-bold text-[var(--engage-blue-600)] transition-colors hover:bg-[var(--engage-blue-400)]/10"
          >
            <Plus size={16} />
            Nova Regra
          </button>
          <button
            onClick={handleReclassificar}
            disabled={isReclassifying}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--engage-blue-600)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)] disabled:opacity-70"
          >
            {isReclassifying ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Reclassificar tudo
          </button>
        </div>
      </div>

      {contagem.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {contagem.map(item => (
            <div key={item.tipo_servico} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className={`mb-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO_BADGE_CLASS[item.tipo_servico] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                {item.tipo_servico}
              </div>
              <div className="text-2xl font-bold text-slate-800">{item.total}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Buscar Fornecedor</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar por razao social"
              value={filtroFornecedor}
              onChange={event => setFiltroFornecedor(event.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
            />
          </div>
        </div>
        <div className="sm:w-56">
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Tipo de Servico</label>
          <select
            value={filtroTipo}
            onChange={event => setFiltroTipo(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
          >
            <option value="">Todos</option>
            {TIPOS_SERVICO.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-600">
          <input
            type="checkbox"
            checked={mostrarSemNotas}
            onChange={event => setMostrarSemNotas(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-[var(--engage-blue-600)] focus:ring-[var(--engage-blue-400)]"
          />
          Mostrar sem notas {regrasSemNotasOcultas > 0 && !mostrarSemNotas && `(${regrasSemNotasOcultas})`}
        </label>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        {error && <div className="p-8 text-sm font-medium text-red-600">{error}</div>}
        {!error && regras.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhuma regra cadastrada.</div>
        )}
        {!error && regras.length > 0 && regrasFiltradas.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhuma regra encontrada para o filtro atual.</div>
        )}
        {!error && regrasFiltradas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="w-28 whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Fornecedor</th>
                  <th className="w-40 whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Criterios adicionais</th>
                  <th className="w-24 whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Prioridade</th>
                  <th className="w-20 whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Ativo</th>
                  <th className="w-24 whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {regrasFiltradas.map((regra, rowIndex) => (
                  <tr key={regra.id} className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100/70'} transition-colors hover:bg-slate-200/70`}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO_BADGE_CLASS[regra.tipo_servico] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                        {regra.tipo_servico}
                      </span>
                    </td>
                    <td className="truncate px-4 py-3 text-slate-700" title={regra.fornecedor_pattern || undefined}>{regra.fornecedor_pattern || '-'}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {regra.uf_emitente_pattern || regra.endereco_tomador_pattern || regra.padrao_pessoa_fisica ? (
                        <div className="space-y-0.5 text-xs">
                          {regra.uf_emitente_pattern && (
                            <div><span className="font-bold text-slate-400">UF:</span> {regra.uf_emitente_pattern}</div>
                          )}
                          {regra.endereco_tomador_pattern && (
                            <div><span className="font-bold text-slate-400">Endereco:</span> {regra.endereco_tomador_pattern}</div>
                          )}
                          {regra.padrao_pessoa_fisica && (
                            <div className="font-bold text-amber-600">PF + Numero</div>
                          )}
                        </div>
                      ) : '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{regra.prioridade}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => handleToggleAtivo(regra)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${regra.ativo ? 'bg-[var(--engage-blue-500)]' : 'bg-slate-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${regra.ativo ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => handleEdit(regra)} className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-[var(--engage-blue-400)]/10 hover:text-[var(--engage-blue-500)]" title="Editar">
                        <Pencil size={16} />
                      </button>
                      <button onClick={() => handleDelete(regra)} className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Remover">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--engage-blue-800)]/60 p-4 backdrop-blur-sm" onClick={resetForm}>
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl" onClick={event => event.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
              <h2 className="text-lg font-bold text-slate-800">{editingId ? 'Editar regra' : 'Nova regra'}</h2>
              <button onClick={resetForm} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Tipo de Servico</label>
                  <select
                    value={form.tipoServico}
                    onChange={event => setForm({ ...form, tipoServico: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  >
                    {TIPOS_SERVICO.map(tipo => <option key={tipo} value={tipo}>{tipo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Fornecedor (razao social)</label>
                  <input
                    type="text"
                    list="fornecedores-conhecidos"
                    placeholder="Ex: Jadlog"
                    value={form.fornecedorPattern}
                    onChange={event => setForm({ ...form, fornecedorPattern: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  />
                  <datalist id="fornecedores-conhecidos">
                    {fornecedores.map(item => <option key={item} value={item} />)}
                  </datalist>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">UF Emitente</label>
                  <input
                    type="text"
                    placeholder="Ex: MG"
                    value={form.ufEmitentePattern}
                    onChange={event => setForm({ ...form, ufEmitentePattern: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Endereco Tomador contem</label>
                  <input
                    type="text"
                    placeholder="Ex: Serra"
                    value={form.enderecoTomadorPattern}
                    onChange={event => setForm({ ...form, enderecoTomadorPattern: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Prioridade</label>
                  <input
                    type="number"
                    value={form.prioridade}
                    onChange={event => setForm({ ...form, prioridade: Number(event.target.value) })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={form.padraoPessoaFisica}
                      onChange={event => setForm({ ...form, padraoPessoaFisica: event.target.checked })}
                      className="h-4 w-4 rounded border-slate-300 text-[var(--engage-blue-600)] focus:ring-[var(--engage-blue-400)]"
                    />
                    Padrao Pessoa Fisica + Numero
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Observacao</label>
                  <input
                    type="text"
                    placeholder="Anotacao livre (opcional)"
                    value={form.observacao}
                    onChange={event => setForm({ ...form, observacao: event.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                  />
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onClick={resetForm} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--engage-blue-600)] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)] disabled:opacity-70"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  {editingId ? 'Salvar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal}
    </div>
  );
};

export default MapeamentoServicosView;
