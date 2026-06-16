import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { AlertCircle, BarChart3, ChevronDown, ChevronRight, Download, FileSpreadsheet, FileText, LayoutDashboard, List, LogOut, Menu, RefreshCw, Upload, Users, Wrench, XCircle, X } from 'lucide-react';
import UserManagementView from './UserManagementView';
import PlanilhasView from './FerramentasView';
import { api } from '../utils/api';
import { getXmlContent, getRemInfo, downloadTextFile } from '../utils/cteXml';

const INTERNAL_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const qivezTabs = [
  { id: 'conciliacao_qivez_painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'conciliacao_qivez_listar', label: 'Não Conciliadas', icon: List },
  { id: 'conciliacao_qivez_canceladas', label: 'Canceladas', icon: XCircle },
  { id: 'conciliacao_qivez_importar', label: 'Importar', icon: Upload },
];

const ferramentasTabs = [
  { id: 'ferramentas_planilhas', label: 'Conciliar Planilhas Transp.', icon: FileSpreadsheet },
];

const qivezTitles: Record<string, { title: string; description: string }> = {
  conciliacao_qivez_painel: {
    title: 'CTe - Painel',
    description: 'Resumo operacional da conciliacao CTe.',
  },
  conciliacao_qivez_listar: {
    title: 'CTe - Não Conciliadas',
    description: 'Listagem de registros da conciliacao CTe.',
  },
  conciliacao_qivez_canceladas: {
    title: 'CTe - Canceladas',
    description: 'Listagem de lancamentos com cancelada = true.',
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

const formatMonthPt = (value: unknown) => {
  if (!value) return '-';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return formatCellValue(value);

  return date.toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).replace('.', '');
};

const formatNumber = (value: unknown) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return '0';
  return amount.toLocaleString('pt-BR');
};

const DashboardCard = ({
  title,
  value,
  icon: Icon,
  tone,
  details,
}: {
  title: string;
  value: unknown;
  icon: React.ElementType;
  tone: string;
  details?: { label: string; value: string }[];
}) => (
  <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">{formatNumber(value)}</div>
        {details && (
          <div className="mt-3 space-y-1 text-xs font-semibold text-slate-500">
            {details.map(detail => (
              <div key={detail.label} className="flex flex-wrap gap-x-1">
                <span>{detail.label}:</span>
                <span className="text-slate-700">{detail.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tone}`}>
        <Icon size={24} />
      </div>
    </div>
  </div>
);

const QivezPainelView = () => {
  const [rows, setRows] = useState<import('../utils/api').QivezDashboardMonth[]>([]);
  const [totalCancelado, setTotalCancelado] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartTooltip, setChartTooltip] = useState<{
    x: number;
    y: number;
    mes: string;
    label: string;
    value: number;
    percent: number;
    id: string;
  } | null>(null);
  const [isChartTooltipPinned, setIsChartTooltipPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await api.getQivezDashboard();
        if (!cancelled) {
          setRows(data.months ?? []);
          setTotalCancelado(data.totalCancelado ?? 0);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar painel.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  const totals = rows.reduce(
    (acc, row) => ({
      total: acc.total + Number(row.total || 0),
      totalFalse: acc.totalFalse + Number(row.total_false || 0),
      somaFalse: acc.somaFalse + Number(row.soma_false || 0),
    }),
    { total: 0, totalFalse: 0, somaFalse: 0 }
  );
  const mediaFalse = totals.totalFalse ? totals.somaFalse / totals.totalFalse : 0;
  const maxValue = Math.max(...rows.map(row => Number(row.total || 0)), 1);
  const maxPendingValue = Math.max(...rows.map(row => Number(row.total_false || 0)), 1);
  const lastMonth = rows[rows.length - 1];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">CTe - Painel</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhamento temporal dos CTe conciliados e pendentes.</p>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-100 bg-white p-8 text-sm font-medium text-slate-500 shadow-sm">
          Carregando painel...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-100 bg-white p-8 text-sm font-medium text-red-600 shadow-sm">
          {error}
        </div>
      )}

      {!isLoading && !error && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <DashboardCard title="Total CTe" value={totals.total} icon={BarChart3} tone="bg-[var(--engage-blue-400)]/10 text-[var(--engage-blue-800)]" />
            <DashboardCard title="Cancelados" value={totalCancelado} icon={AlertCircle} tone="bg-amber-50 text-amber-600" />
            <DashboardCard
              title="Pendentes"
              value={totals.totalFalse}
              icon={XCircle}
              tone="bg-rose-50 text-rose-600"
              details={[
                { label: 'Soma', value: formatCurrency(totals.somaFalse) },
                { label: 'Media', value: formatCurrency(mediaFalse) },
              ]}
            />
            <DashboardCard title="Ultimo mes" value={lastMonth?.total_false ?? 0} icon={RefreshCw} tone="bg-[var(--engage-blue-500)]/10 text-[var(--engage-blue-500)]" />
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Evolucao mensal</h2>
                <p className="text-sm text-slate-500">Total e conciliados em barras, pendentes em linha no eixo direito.</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--engage-blue-600)]" /> Total</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Pendentes</span>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="py-12 text-sm font-medium text-slate-500">Nenhum dado encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <svg viewBox="0 0 980 360" className="min-w-[760px]">
                  {[0, 1, 2, 3, 4].map(step => {
                    const y = 40 + step * 58;
                    const value = Math.round(maxValue - (maxValue / 4) * step);
                    const pendingValue = Math.round(maxPendingValue - (maxPendingValue / 4) * step);

                    return (
                      <g key={step}>
                        <line x1="56" y1={y} x2="940" y2={y} stroke="#e2e8f0" strokeWidth="1" />
                        <text x="44" y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px] font-bold">
                          {formatNumber(value)}
                        </text>
                        <text x="952" y={y + 4} textAnchor="start" className="fill-rose-400 text-[11px] font-bold">
                          {formatNumber(pendingValue)}
                        </text>
                      </g>
                    );
                  })}

                  {(() => {
                    const chartWidth = 884;
                    const chartHeight = 232;
                    const groupWidth = chartWidth / rows.length;
                    const barWidth = Math.max(Math.min(groupWidth / 5, 18), 7);
                    const groupStart = (index: number) => 56 + index * groupWidth + groupWidth / 2;
                    const yFor = (value: number) => 272 - (value / maxValue) * chartHeight;
                    const yForPending = (value: number) => 272 - (value / maxPendingValue) * chartHeight;
                    const barSeries = [
                      { key: 'total' as const, label: 'Total', color: 'var(--engage-blue-600)', offset: 0 },
                    ];
                    const points = rows.map((row, index) => ({
                      row,
                      x: groupStart(index),
                      y: yForPending(Number(row.total_false || 0)),
                      value: Number(row.total_false || 0),
                      total: Number(row.total || 0),
                    }));
                    const linePath = points
                      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                      .join(' ');
                    const areaPath = points.length
                      ? `${linePath} L ${points[points.length - 1].x} 272 L ${points[0].x} 272 Z`
                      : '';

                    return (
                      <>
                        {areaPath && (
                          <path d={areaPath} fill="url(#pendingAreaGradient)" opacity="0.16" />
                        )}
                        <defs>
                          <linearGradient id="pendingAreaGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" />
                            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {rows.map((row, index) => (
                          <g key={`${row.mes}-bars`}>
                            {barSeries.map(item => {
                              const value = Number(row[item.key] || 0);
                              const total = Number(row.total || 0);
                              const percent = item.key === 'total' ? 100 : (total ? (value / total) * 100 : 0);
                              const height = (value / maxValue) * chartHeight;
                              const x = groupStart(index) + item.offset - barWidth / 2;
                              const y = yFor(value);

                              const tooltipData = {
                                x: x + barWidth / 2,
                                y,
                                mes: formatMonthPt(row.mes),
                                label: item.label,
                                value,
                                percent,
                                id: `${row.mes}-${item.key}`,
                              };
                              return (
                                <g key={item.key}>
                                  {/* Área de hover invisível por toda a altura da coluna */}
                                  <rect
                                    x={x}
                                    y={40}
                                    width={barWidth}
                                    height={232}
                                    fill="transparent"
                                    className="cursor-pointer"
                                    onMouseEnter={() => { if (!isChartTooltipPinned) setChartTooltip(tooltipData); }}
                                    onMouseLeave={() => { if (!isChartTooltipPinned) setChartTooltip(null); }}
                                    onClick={() => {
                                      if (isChartTooltipPinned && chartTooltip?.id === tooltipData.id) {
                                        setIsChartTooltipPinned(false); setChartTooltip(null);
                                      } else { setChartTooltip(tooltipData); setIsChartTooltipPinned(true); }
                                    }}
                                  />
                                  <rect
                                    x={x}
                                    y={y}
                                    width={barWidth}
                                    height={Math.max(height, value > 0 ? 10 : 0)}
                                    rx="4"
                                    fill={item.color}
                                    className="pointer-events-none transition-opacity"
                                  /></g>
                              );
                            })}
                          </g>
                        ))}
                        {linePath && (
                          <path
                            d={linePath}
                            fill="none"
                            stroke="#f43f5e"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="4"
                          />
                        )}
                        {points.map((point, index) => (
                          <g key={String(point.row.mes)}>
                            <line x1={point.x} y1="40" x2={point.x} y2="272" stroke="#f1f5f9" strokeWidth="1" />
                            <circle cx={point.x} cy={point.y} r="13" fill="#fff" opacity="0" />
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="6"
                              fill="#fff"
                              stroke="#f43f5e"
                              strokeWidth="4"
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              onMouseEnter={() => {
                                if (isChartTooltipPinned) return;
                                setChartTooltip({
                                  x: point.x,
                                  y: point.y,
                                  mes: formatMonthPt(point.row.mes),
                                  label: 'Pendentes',
                                  value: point.value,
                                  percent: point.total ? (point.value / point.total) * 100 : 0,
                                  id: `${point.row.mes}-total_false`,
                                });
                              }}
                              onMouseLeave={() => {
                                if (!isChartTooltipPinned) setChartTooltip(null);
                              }}
                              onClick={() => {
                                const nextTooltip = {
                                  x: point.x,
                                  y: point.y,
                                  mes: formatMonthPt(point.row.mes),
                                  label: 'Pendentes',
                                  value: point.value,
                                  percent: point.total ? (point.value / point.total) * 100 : 0,
                                  id: `${point.row.mes}-total_false`,
                                };

                                if (isChartTooltipPinned && chartTooltip?.id === nextTooltip.id) {
                                  setIsChartTooltipPinned(false);
                                  setChartTooltip(null);
                                  return;
                                }

                                setChartTooltip(nextTooltip);
                                setIsChartTooltipPinned(true);
                              }}
                            />
                            <text x={point.x} y="318" textAnchor="middle" className="fill-slate-500 text-[11px] font-bold">
                              {formatMonthPt(point.row.mes)}
                            </text>
                          </g>
                        ))}
                        {chartTooltip && (
                          (() => {
                            const tooltipWidth = 210;
                            const tooltipHeight = 72;
                            const tooltipX = Math.min(Math.max(chartTooltip.x - tooltipWidth / 2, 62), 940 - tooltipWidth);
                            const tooltipY = Math.min(Math.max(chartTooltip.y - tooltipHeight - 14, 12), 272 - tooltipHeight);
                            const textX = tooltipX + 14;

                            return (
                              <g pointerEvents="none">
                                <rect
                                  x={tooltipX}
                                  y={tooltipY}
                                  width={tooltipWidth}
                                  height={tooltipHeight}
                                  rx="8"
                                  fill="#0f172a"
                                  opacity="0.96"
                                />
                                <text x={textX} y={tooltipY + 24} className="fill-white text-[12px] font-bold">
                                  {chartTooltip.mes} - {chartTooltip.label}
                                </text>
                                <text x={textX} y={tooltipY + 44} className="fill-slate-200 text-[11px] font-medium">
                                  {formatNumber(chartTooltip.value)} CTe
                                </text>
                                <text x={textX} y={tooltipY + 60} className="fill-slate-200 text-[11px] font-medium">
                                  {chartTooltip.percent.toFixed(1).replace('.', ',')}% do total do mes
                                </text>
                              </g>
                            );
                          })()
                        )}
                      </>
                    );
                  })()}
                </svg>
              </div>
            )}
          </div>
        </>
      )}
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
  if (Number.isNaN(amount)) return 'R$ 0,00';

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatChaveCteComRem = (row: Record<string, unknown>) => {
  const chave = formatCellValue(row.chave_cte);
  const remInfo = getRemInfo(row.json_xml);
  return remInfo ? `${chave} - ${remInfo.toUpperCase()}` : chave;
};

const downloadXml = (row: Record<string, unknown>) => {
  const chave = formatCellValue(row.chave_cte);
  const xmlContent = getXmlContent(row.json_xml, chave !== '-' ? chave : undefined);
  if (!xmlContent) return;

  const chaveCte = chave.replace(/[^a-zA-Z0-9_-]/g, '_');
  const id = formatCellValue(row.id);
  const basename = chaveCte && chaveCte !== '-' ? chaveCte : `lancamento-${id}`;
  downloadTextFile(xmlContent, `${basename}.xml`);
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
    const chave = formatCellValue(row.chave_cte);
    const xmlContent = getXmlContent(row.json_xml, chave !== '-' ? chave : undefined);
    if (!xmlContent) return;

    const id = formatCellValue(row.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    const chaveCte = chave.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = chaveCte && chaveCte !== '-' ? `${chaveCte}.xml` : `lancamento-${id}.xml`;

    zip.file(filename, xmlContent);
    total += 1;
  });

  if (total === 0) return;

  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlobFile(blob, 'lancamentos-cte-filtrados.zip');
};

const BADGE_PALETTE = [
  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
  'bg-pink-50 text-pink-700 ring-1 ring-pink-200',
];

function sistemaBadgeClass(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) & 0xfffffff;
  return BADGE_PALETTE[hash % BADGE_PALETTE.length];
}

const SistemaBadge = ({ value }: { value: unknown }) => {
  if (value == null || String(value).trim() === '') return <span className="text-slate-400">—</span>;
  const label = String(value);
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold ${sistemaBadgeClass(label)}`}>
      {label}
    </span>
  );
};

const QivezListarView = () => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [chaveCte, setChaveCte] = useState('');
  const [sistema, setSistema] = useState('');
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '' });

  useEffect(() => {
    api.getQivezSistemas().then(setSistemas).catch(() => {});
  }, []);

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">CTe - Não Conciliadas</h1>
          {!isLoading && !error && (
            <span className="rounded-full bg-[var(--engage-blue-400)]/15 px-3 py-0.5 text-sm font-bold text-[var(--engage-blue-800)]">
              {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Lancamentos financeiros sem CTe Sysemp, ordenados por ID.
        </p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="w-full">
            <form
              className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,1.2fr)_auto_auto_auto] lg:items-end"
              onSubmit={event => {
                event.preventDefault();
                setAppliedFilters({ dataInicio, dataFim, chaveCte: chaveCte.trim(), sistema: sistema.trim() });
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

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Chave CTE</label>
                <input
                  type="search"
                  value={chaveCte}
                  onChange={event => setChaveCte(event.target.value)}
                  placeholder="Buscar pela chave"
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
                  setChaveCte('');
                  setSistema('');
                  setAppliedFilters({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '' });
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

        {sistemas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Origem:</span>
            <button
              type="button"
              onClick={() => { setSistema(''); setAppliedFilters(f => ({ ...f, sistema: '' })); }}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${sistema === '' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              Todos
            </button>
            {sistemas.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => { setSistema(s); setAppliedFilters(f => ({ ...f, sistema: s })); }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${sistema === s ? sistemaBadgeClass(s) + ' ring-2' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
        )}

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
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Origem</th>
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
                    <td className="whitespace-nowrap px-4 py-3">
                      <SistemaBadge value={row.sistema} />
                    </td>
                    <td className="max-w-[360px] truncate whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700" title={formatChaveCteComRem(row)}>
                      {formatChaveCteComRem(row)}
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

const QivezCanceladasView = () => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [chaveCte, setChaveCte] = useState('');
  const [sistema, setSistema] = useState('');
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '' });

  useEffect(() => {
    api.getQivezSistemasCanceladas().then(setSistemas).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getQivezCanceladas(appliedFilters);
        if (!cancelled) setRows(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar canceladas.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadRows();
    return () => { cancelled = true; };
  }, [appliedFilters]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">CTe - Canceladas</h1>
          {!isLoading && !error && (
            <span className="rounded-full bg-[var(--engage-blue-400)]/15 px-3 py-0.5 text-sm font-bold text-[var(--engage-blue-800)]">
              {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">Lancamentos marcados como cancelados.</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <form
            className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,1.4fr)_auto_auto_auto] lg:items-end"
            onSubmit={event => {
              event.preventDefault();
              setAppliedFilters({ dataInicio, dataFim, chaveCte: chaveCte.trim(), sistema: sistema.trim() });
            }}
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Inicio</label>
              <input type="date" value={dataInicio} onChange={event => setDataInicio(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Fim</label>
              <input type="date" value={dataFim} onChange={event => setDataFim(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Chave CTE</label>
              <input type="search" value={chaveCte} onChange={event => setChaveCte(event.target.value)}
                placeholder="Buscar pela chave"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <button type="submit" className="rounded-lg bg-[var(--engage-blue-600)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)]">
              Filtrar
            </button>
            <button type="button" className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
              onClick={() => { setDataInicio(''); setDataFim(''); setChaveCte(''); setSistema(''); setAppliedFilters({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '' }); }}>
              Limpar
            </button>
            <button type="button" disabled={rows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--engage-blue-400)]/10 px-4 py-2 text-sm font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => downloadFilteredXmlZip(rows)}>
              <Download size={16} /> Baixar filtrados
            </button>
          </form>
        </div>

        {sistemas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-6 py-3">
            <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Origem:</span>
            <button type="button"
              onClick={() => { setSistema(''); setAppliedFilters(f => ({ ...f, sistema: '' })); }}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${sistema === '' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Todos
            </button>
            {sistemas.map(s => (
              <button key={s} type="button"
                onClick={() => { setSistema(s); setAppliedFilters(f => ({ ...f, sistema: s })); }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition-all ${sistema === s ? sistemaBadgeClass(s) + ' ring-2' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {s}
              </button>
            ))}
          </div>
        )}

        {isLoading && <div className="p-8 text-sm font-medium text-slate-500">Carregando canceladas...</div>}
        {error && <div className="p-8 text-sm font-medium text-red-600">{error}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhum lancamento cancelado encontrado.</div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Data de lancamento</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Origem</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Chave CTE</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Tipo</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, rowIndex) => (
                  <tr key={String(row.id ?? rowIndex)} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDatePt(row.data_lancamento)}</td>
                    <td className="whitespace-nowrap px-4 py-3"><SistemaBadge value={row.sistema} /></td>
                    <td className="max-w-[360px] truncate whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700" title={formatCellValue(row.chave_cte)}>
                      {formatCellValue(row.chave_cte)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatCellValue(row.tipo)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{formatCurrency(row.valor)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button type="button" disabled={!row.json_xml} onClick={() => downloadXml(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:cursor-not-allowed disabled:opacity-40">
                        <Download size={14} /> XML
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
  const [isFerramentasOpen, setIsFerramentasOpen] = useState(false);
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
  const hasAnyFerramentasPermission = ferramentasTabs.some(tab => hasPermission(tab.id));

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

        <div className="relative flex items-center justify-center border-b border-white/15 p-6">
          <div className="min-w-0 text-center">
            {showLogoFallback ? (
              <>
                <div className="text-lg font-bold">Dash Engage</div>
                <div className="text-xs font-medium text-white/70">Area restrita</div>
              </>
            ) : (
              <img
                src={INTERNAL_LOGO_SRC}
                alt="Dash Engage"
                className="h-8 max-w-36 object-contain"
                onError={() => setShowLogoFallback(true)}
              />
            )}
          </div>
          <button className="absolute right-4 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
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

          {hasAnyFerramentasPermission && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Ferramentas
              </div>
              <button
                onClick={() => setIsFerramentasOpen(!isFerramentasOpen)}
                className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${ferramentasTabs.some(tab => tab.id === activeTab) ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <span className="flex items-center gap-3">
                  <Wrench size={18} /> Ferramentas
                </span>
                {isFerramentasOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>

              {isFerramentasOpen && (
                <div className="space-y-1 pl-4">
                  {ferramentasTabs.map(tab => {
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

          {activeTab === 'conciliacao_qivez_painel' && hasPermission('conciliacao_qivez_painel') && (
            <QivezPainelView />
          )}

          {activeTab === 'conciliacao_qivez_canceladas' && hasPermission('conciliacao_qivez_canceladas') && (
            <QivezCanceladasView />
          )}

          {activeTab !== 'conciliacao_qivez_listar' && activeTab !== 'conciliacao_qivez_painel' && activeTab !== 'conciliacao_qivez_canceladas' && qivezTabs.some(tab => tab.id === activeTab) && hasPermission(activeTab) && (
            <QivezPlaceholderView tab={activeTab} />
          )}

          {activeTab === 'ferramentas_planilhas' && hasPermission('ferramentas_planilhas') && (
            <PlanilhasView />
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardView;
