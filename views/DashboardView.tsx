import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { ChevronDown, ChevronRight, Download, FileText, LayoutDashboard, List, LogOut, Menu, RefreshCw, Upload, Users, X } from 'lucide-react';
import UserManagementView from './UserManagementView';
import { api } from '../utils/api';

const INTERNAL_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const qivezTabs = [
  { id: 'conciliacao_qivez_painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'conciliacao_qivez_listar', label: 'Listar', icon: List },
  { id: 'conciliacao_qivez_importar', label: 'Importar', icon: Upload },
];

const qivezTitles: Record<string, { title: string; description: string }> = {
  conciliacao_qivez_painel: {
    title: 'CTe - Painel',
    description: 'Resumo operacional da conciliacao CTe.',
  },
  conciliacao_qivez_listar: {
    title: 'CTe - Listar',
    description: 'Listagem de registros da conciliacao CTe.',
  },
  conciliacao_qivez_importar: {
    title: 'CTe - Importar',
    description: 'Importacao de dados para a conciliacao CTe.',
  },
};

const QivezPlaceholderView = ({ tab }: { tab: string }) => {
  const content = qivezTitles[tab];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">{content.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{content.description}</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 text-slate-500">
          <FileText className="text-[var(--engage-blue-500)]" size={22} />
          <span className="text-sm font-medium">Area criada. Conteudo do modulo sera implementado aqui.</span>
        </div>
      </div>
    </div>
  );
};

const formatCellValue = (value: unknown) => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Nao';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const formatDatePt = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return formatCellValue(value);

  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();

  return `${day}/${month}/${year}`;
};

const formatCurrency = (value: unknown) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return formatCellValue(value);

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

const escapeXml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const isXmlAttribute = (key: string) => key === 'xmlns' || key.startsWith('@');

const jsonToXmlNode = (key: string, value: unknown): string => {
  const tagName = key.startsWith('@') ? key.slice(1) : key;

  if (Array.isArray(value)) {
    return value.map(item => jsonToXmlNode(tagName, item)).join('');
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const attributes = Object.entries(record)
      .filter(([childKey]) => isXmlAttribute(childKey))
      .map(([childKey, childValue]) => {
        const attributeName = childKey.startsWith('@') ? childKey.slice(1) : childKey;
        return ` ${attributeName}="${escapeXml(childValue)}"`;
      })
      .join('');

    const children = Object.entries(record)
      .filter(([childKey]) => !isXmlAttribute(childKey))
      .map(([childKey, childValue]) => jsonToXmlNode(childKey, childValue))
      .join('');

    return `<${tagName}${attributes}>${children}</${tagName}>`;
  }

  return `<${tagName}>${escapeXml(value)}</${tagName}>`;
};

const jsonToXmlDocument = (value: unknown) => {
  if (!value || typeof value !== 'object') return String(value ?? '');

  const entries = Object.entries(value as Record<string, unknown>);
  const body = entries.map(([key, childValue]) => jsonToXmlNode(key, childValue)).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
};

const getXmlContent = (xmlSource: unknown) => {
  if (!xmlSource) return '';

  return typeof xmlSource === 'string' && xmlSource.trim().startsWith('<')
    ? xmlSource
    : jsonToXmlDocument(xmlSource);
};

const downloadTextFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadXml = (row: Record<string, unknown>) => {
  const xmlContent = getXmlContent(row.json_xml);
  if (!xmlContent) return;

  downloadTextFile(xmlContent, `lancamento-${formatCellValue(row.id)}.xml`);
};

const downloadBlobFile = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadFilteredXmlZip = async (rows: Record<string, unknown>[]) => {
  const zip = new JSZip();
  let total = 0;

  rows.forEach(row => {
    const xmlContent = getXmlContent(row.json_xml);
    if (!xmlContent) return;

    const id = formatCellValue(row.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const chaveCte = formatCellValue(row.chave_cte).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = chaveCte && chaveCte !== '-' ? `${chaveCte}.xml` : `lancamento-${id}.xml`;

    zip.file(filename, xmlContent);
    total += 1;
  });

  if (total === 0) return;

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlobFile(blob, 'lancamentos-cte-filtrados.zip');
};

const QivezListarView = () => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ dataInicio: '', dataFim: '' });

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await api.getQivezLancamentos(appliedFilters);
        if (!cancelled) setRows(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar lancamentos.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadRows();

    return () => {
      cancelled = true;
    };
  }, [appliedFilters]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">CTe - Listar</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lancamentos financeiros sem CTe Sysemp, ordenados por ID.
        </p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="w-full">
            <form
              className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto] lg:items-end"
              onSubmit={event => {
                event.preventDefault();
                setAppliedFilters({ dataInicio, dataFim });
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Inicio</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={event => setDataInicio(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Fim</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={event => setDataFim(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <button type="submit" className="rounded-lg bg-[var(--engage-blue-600)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)]">
                Filtrar
              </button>

              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
                onClick={() => {
                  setDataInicio('');
                  setDataFim('');
                  setAppliedFilters({ dataInicio: '', dataFim: '' });
                }}
              >
                Limpar
              </button>

              <button
                type="button"
                disabled={rows.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--engage-blue-400)]/10 px-4 py-2 text-sm font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:cursor-not-allowed disabled:opacity-40"
                onClick={() => downloadFilteredXmlZip(rows)}
              >
                <Download size={16} />
                Baixar filtrados
              </button>
            </form>
          </div>
        </div>

        {isLoading && (
          <div className="p-8 text-sm font-medium text-slate-500">Carregando lancamentos...</div>
        )}

        {error && (
          <div className="p-8 text-sm font-medium text-red-600">{error}</div>
        )}

        {!isLoading && !error && rows.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhum lancamento encontrado.</div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Data de lancamento</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Chave CTE</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">
                    Download
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, rowIndex) => (
                  <tr key={String(row.id ?? rowIndex)} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDatePt(row.data_lancamento)}</td>
                    <td className="max-w-[360px] truncate whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700" title={formatCellValue(row.chave_cte)}>
                      {formatCellValue(row.chave_cte)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCellValue(row.tipo)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{formatCurrency(row.valor)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        disabled={!row.json_xml}
                        onClick={() => downloadXml(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Download size={14} />
                        XML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const DashboardView = ({ user, onLogout }: { user: string; onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQivezOpen, setIsQivezOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [showLogoFallback, setShowLogoFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      try {
        const data = await api.me();
        if (cancelled) return;
        setUserPermissions(data.permissions || []);
        setIsAdmin(data.isAdmin || false);
      } catch {
        if (!cancelled) onLogout();
      } finally {
        if (!cancelled) setIsLoadingUser(false);
      }
    };

    fetchUser();
    const interval = setInterval(fetchUser, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [onLogout]);

  const hasPermission = (id: string) => isAdmin || userPermissions.includes(id);
  const hasAnyQivezPermission = qivezTabs.some(tab => hasPermission(tab.id));

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-slate-50">
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col overflow-hidden bg-[#061a5a] text-white transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="absolute left-[-180px] top-[-120px] h-[420px] w-[420px] rounded-full bg-[#7a1fa2]/65 blur-3xl" />
        <div className="absolute right-[-220px] top-1/3 h-[460px] w-[460px] rounded-full bg-[#1b4fd3]/70 blur-3xl" />
        <div className="absolute bottom-[-180px] left-8 h-[380px] w-[380px] rounded-full bg-[#c2185b]/45 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,255,255,0.1),rgba(6,26,90,0.18)_38%,rgba(3,12,40,0.72)_100%)]" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:radial-gradient(rgba(255,255,255,0.75)_1px,transparent_1px)] [background-size:4px_4px]" />

        <div className="relative flex items-center justify-between border-b border-white/15 p-6">
          <div className="min-w-0">
            {showLogoFallback ? (
              <>
                <div className="text-lg font-bold">Dash Engage</div>
                <div className="text-xs font-medium text-white/70">Area restrita</div>
              </>
            ) : (
              <img
                src={INTERNAL_LOGO_SRC}
                alt="Dash Engage"
                className="h-10 max-w-44 object-contain"
                onError={() => setShowLogoFallback(true)}
              />
            )}
          </div>
          <button className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={22} />
          </button>
        </div>

        <nav className="relative flex-1 space-y-1 overflow-y-auto px-4 py-6">
          <button
            onClick={() => handleTabChange('home')}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'home' ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          >
            <LayoutDashboard size={18} /> Inicio
          </button>

          {hasAnyQivezPermission && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Conciliacao
              </div>
              <button
                onClick={() => setIsQivezOpen(!isQivezOpen)}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${qivezTabs.some(tab => tab.id === activeTab) ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <span className="flex items-center gap-3">
                  <FileText size={18} /> CTe
                </span>
                {isQivezOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {isQivezOpen && (
                <div className="space-y-1 pl-4">
                  {qivezTabs.map(tab => {
                    if (!hasPermission(tab.id)) return null;
                    const Icon = tab.icon;

                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleTabChange(tab.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                      >
                        <Icon size={16} /> {tab.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {hasPermission('usuarios') && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Configuracoes
              </div>
              <button
                onClick={() => handleTabChange('usuarios')}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'usuarios' ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <Users size={18} /> Controle de Usuarios
              </button>
            </>
          )}
        </nav>

        <div className="relative border-t border-white/15 p-4">
          <button onClick={onLogout} className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10">
            <LogOut size={18} /> Sair
          </button>
        </div>
      </aside>

      <main className="flex w-full flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-[var(--engage-white)] px-4 md:px-8">
          <div className="flex items-center gap-3">
            <button className="-ml-2 rounded-lg p-2 text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/10 md:hidden" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="hidden text-[10px] font-bold uppercase tracking-widest text-slate-300 sm:block">
              Logado como: <span className="text-[var(--engage-blue-800)]">{user}</span>
            </div>
          </div>
          <button className="rounded-lg p-2 text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/10" title="Recarregar pagina" onClick={() => window.location.reload()}>
            <RefreshCw size={18} className={isLoadingUser ? 'animate-spin' : ''} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {activeTab === 'home' && (
            <div className="mx-auto max-w-7xl space-y-6">
              <div>
                <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">Base do projeto</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Login, sessao e controle de acesso estao ativos. Novos modulos podem ser adicionados a partir desta estrutura.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'usuarios' && hasPermission('usuarios') && (
            <div className="mx-auto max-w-7xl">
              <UserManagementView currentUser={user} />
            </div>
          )}

          {activeTab === 'conciliacao_qivez_listar' && hasPermission('conciliacao_qivez_listar') && (
            <QivezListarView />
          )}

          {activeTab !== 'conciliacao_qivez_listar' && qivezTabs.some(tab => tab.id === activeTab) && hasPermission(activeTab) && (
            <QivezPlaceholderView tab={activeTab} />
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardView;
