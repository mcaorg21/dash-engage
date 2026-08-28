import React, { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { AlertCircle, BarChart3, Calendar, CalendarClock, ChevronDown, ChevronRight, Download, ExternalLink, FileSpreadsheet, FileText, LayoutDashboard, List, LogOut, Menu, Package, Receipt, RefreshCw, Tag, Upload, Users, Wrench, XCircle, X } from 'lucide-react';
import UserManagementView from './UserManagementView';
import PlanilhasView from './FerramentasView';
import MapeamentoServicosView from './MapeamentoServicosView';
import { api, type NfseRecord } from '../utils/api';
import { getXmlContent, getRemInfo, downloadTextFile } from '../utils/cteXml';
import { downloadNfeXml, downloadNfeXmlZip, getDestInfoNfe } from '../utils/nfeXml';

const INTERNAL_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const qivezTabs = [
  { id: 'conciliacao_qivez_painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'conciliacao_qivez_listar', label: 'Não Conciliadas', icon: List },
  { id: 'conciliacao_qivez_canceladas', label: 'Canceladas', icon: XCircle },
  { id: 'conciliacao_qivez_importar', label: 'Importar', icon: Upload },
];

const ferramentasTabs = [
  { id: 'ferramentas_planilhas', label: 'Conciliar Planilhas Transp.', icon: FileSpreadsheet },
  { id: 'ferramentas_mapeamento_servicos', label: 'Mapeamento Servicos', icon: Tag },
];

const nfseTabs = [
  { id: 'conciliacao_nfse_painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'conciliacao_nfse_nao_conciliadas', label: 'Não Conciliadas', icon: AlertCircle },
  { id: 'conciliacao_nfse_lista', label: 'Lista', icon: List },
];

const nfeTabs = [
  { id: 'conciliacao_nfe_listar', label: 'Não Conciliadas', icon: List },
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
  format = 'number',
}: {
  title: string;
  value: unknown;
  icon: React.ElementType;
  tone: string;
  details?: { label: string; value: string }[];
  format?: 'number' | 'currency';
}) => (
  <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-xs font-bold uppercase tracking-widest text-slate-400">{title}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">{format === 'currency' ? formatCurrency(value) : formatNumber(value)}</div>
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

const NfsePainelView = () => {
  const [rows, setRows] = useState<import('../utils/api').NfseDashboardMonth[]>([]);
  const [totalCancelado, setTotalCancelado] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartTooltip, setChartTooltip] = useState<{
    x: number;
    y: number;
    mes: string;
    label: string;
    value: number;
    isCurrency: boolean;
    id: string;
  } | null>(null);
  const [isChartTooltipPinned, setIsChartTooltipPinned] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await api.getNfseDashboard();
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
      valorTotal: acc.valorTotal + Number(row.valor_total || 0),
    }),
    { total: 0, valorTotal: 0 }
  );
  const maxValue = Math.max(...rows.map(row => Number(row.total || 0)), 1);
  const maxValorValue = Math.max(...rows.map(row => Number(row.valor_total || 0)), 1);
  const lastMonth = rows[rows.length - 1];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">NFSe - Painel</h1>
        <p className="mt-1 text-sm text-slate-500">Acompanhamento temporal das NFSe emitidas.</p>
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
            <DashboardCard title="Total NFSe" value={totals.total} icon={Receipt} tone="bg-[var(--engage-blue-400)]/10 text-[var(--engage-blue-800)]" />
            <DashboardCard title="Canceladas" value={totalCancelado} icon={AlertCircle} tone="bg-amber-50 text-amber-600" />
            <DashboardCard title="Valor Liquido Total" value={totals.valorTotal} format="currency" icon={FileText} tone="bg-emerald-50 text-emerald-600" />
            <DashboardCard title="Ultimo mes" value={lastMonth?.total ?? 0} icon={RefreshCw} tone="bg-[var(--engage-blue-500)]/10 text-[var(--engage-blue-500)]" />
          </div>

          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Evolucao mensal</h2>
                <p className="text-sm text-slate-500">Quantidade de notas em barras, valor liquido total em linha no eixo direito.</p>
              </div>
              <div className="flex flex-wrap gap-3 text-xs font-bold text-slate-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--engage-blue-600)]" /> Quantidade</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Valor Liquido</span>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="py-12 text-sm font-medium text-slate-500">Nenhum dado encontrado.</div>
            ) : (
              <div className="overflow-x-auto">
                <svg viewBox="0 0 1040 360" className="min-w-[820px]">
                  {[0, 1, 2, 3, 4].map(step => {
                    const y = 40 + step * 58;
                    const value = Math.round(maxValue - (maxValue / 4) * step);
                    const valorValue = maxValorValue - (maxValorValue / 4) * step;

                    return (
                      <g key={step}>
                        <line x1="56" y1={y} x2="940" y2={y} stroke="#e2e8f0" strokeWidth="1" />
                        <text x="44" y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px] font-bold">
                          {formatNumber(value)}
                        </text>
                        <text x="952" y={y + 4} textAnchor="start" className="fill-emerald-500 text-[11px] font-bold">
                          {formatCurrencyCompact(valorValue)}
                        </text>
                      </g>
                    );
                  })}

                  {(() => {
                    const chartWidth = 884;
                    const chartHeight = 232;
                    const groupWidth = chartWidth / rows.length;
                    const barWidth = Math.max(Math.min(groupWidth / 2.2, 26), 8);
                    const groupStart = (index: number) => 56 + index * groupWidth + groupWidth / 2;
                    const yFor = (value: number) => 272 - (value / maxValue) * chartHeight;
                    const yForValor = (value: number) => 272 - (value / maxValorValue) * chartHeight;
                    const points = rows.map((row, index) => ({
                      row,
                      x: groupStart(index),
                      y: yForValor(Number(row.valor_total || 0)),
                      value: Number(row.valor_total || 0),
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
                          <path d={areaPath} fill="url(#nfseValorAreaGradient)" opacity="0.16" />
                        )}
                        <defs>
                          <linearGradient id="nfseValorAreaGradient" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {rows.map((row, index) => {
                          const value = Number(row.total || 0);
                          const height = (value / maxValue) * chartHeight;
                          const x = groupStart(index) - barWidth / 2;
                          const y = yFor(value);
                          const tooltipData = {
                            x: x + barWidth / 2,
                            y,
                            mes: formatMonthPt(row.mes),
                            label: 'Quantidade',
                            value,
                            isCurrency: false,
                            id: `${row.mes}-total`,
                          };

                          return (
                            <g key={`${row.mes}-bar`}>
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
                                fill="var(--engage-blue-600)"
                                className="pointer-events-none transition-opacity"
                              />
                            </g>
                          );
                        })}
                        {linePath && (
                          <path
                            d={linePath}
                            fill="none"
                            stroke="#10b981"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="4"
                          />
                        )}
                        {points.map(point => (
                          <g key={String(point.row.mes)}>
                            <line x1={point.x} y1="40" x2={point.x} y2="272" stroke="#f1f5f9" strokeWidth="1" />
                            <circle cx={point.x} cy={point.y} r="13" fill="#fff" opacity="0" />
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r="6"
                              fill="#fff"
                              stroke="#10b981"
                              strokeWidth="4"
                              className="cursor-pointer transition-opacity hover:opacity-80"
                              onMouseEnter={() => {
                                if (isChartTooltipPinned) return;
                                setChartTooltip({
                                  x: point.x,
                                  y: point.y,
                                  mes: formatMonthPt(point.row.mes),
                                  label: 'Valor Liquido',
                                  value: point.value,
                                  isCurrency: true,
                                  id: `${point.row.mes}-valor_total`,
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
                                  label: 'Valor Liquido',
                                  value: point.value,
                                  isCurrency: true,
                                  id: `${point.row.mes}-valor_total`,
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
                            const tooltipHeight = 56;
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
                                  {chartTooltip.isCurrency ? formatCurrency(chartTooltip.value) : `${formatNumber(chartTooltip.value)} notas`}
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

const formatCurrencyCompact = (value: unknown) => {
  const amount = Number(value);
  if (Number.isNaN(amount)) return 'R$ 0';

  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  });
};

const roundMoney = (value: unknown) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const formatChaveNfeComDest = (row: Record<string, unknown>) => {
  const chave = formatCellValue(row.chave_nfe);
  const destInfo = getDestInfoNfe(row.json_xml);
  return destInfo ? `${chave} - ${destInfo.toUpperCase()}` : chave;
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

const CNPJ_LABELS: Record<string, string> = {
  '24867555000101': 'MG [24.867.555/0001-01] ENGAGE ELETRO COMERCIO S.A. - MATRIZ',
  '24867555000284': 'ES [24.867.555/0002-84] ENGAGE ELETRO COMERCIO S.A. - VAREJO',
  '24867555000365': 'ES [24.867.555/0003-65] ENGAGE ELETRO COMERCIO S.A. - ATACADO',
  '24867555000527': 'ES [24.867.555/0005-27] ENGAGE ELETRO COMERCIO S.A. - LOG',
  '24867555000608': 'ES [24.867.555/0006-08] ENGAGE ELETRO LOJA OUTLET',
  '24867555000799': 'SP [24.867.555/0007-99] ENGAGE ELETRO COMERCIO S.A. - SP',
  '24867555000870': 'MG [24.867.555/0008-70] ENGAGE ELETRO COMERCIO S.A. - EXTREMA',
};

const formatCnpj = (raw: string) => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14) return raw;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
};

const cnpjOptionLabel = (raw: string) => CNPJ_LABELS[raw.replace(/\D/g, '')] ?? formatCnpj(raw);

const normalizeEmpresaOptions = (values: string[]) => {
  const map = new Map<string, string>();

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) continue;

    const key = normalized.toLocaleLowerCase('pt-BR');
    if (!map.has(key)) {
      map.set(
        key,
        normalized.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('pt-BR')),
      );
    }
  }

  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
};

const QivezListarView = () => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [chaveCte, setChaveCte] = useState('');
  const [sistema, setSistema] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [cnpjs, setCnpjs] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '', municipio: '', cnpj: '' });

  useEffect(() => {
    api.getQivezSistemas().then(setSistemas).catch(() => {});
    api.getQivezMunicipios().then(values => setMunicipios(normalizeEmpresaOptions(values))).catch(() => {});
    api.getQivezCnpjs().then(values => setCnpjs([...values].sort())).catch(() => {});
  }, []);

  const getCurrentFilters = () => ({
    dataInicio,
    dataFim,
    chaveCte: chaveCte.trim(),
    sistema: sistema.trim(),
    municipio: municipio.trim(),
    cnpj: cnpj.trim(),
  });

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
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
        <button
          type="button"
          disabled={isLoading || isDownloading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 sm:w-auto"
          onClick={async () => {
            const filters = getCurrentFilters();
            setAppliedFilters(filters);
            setIsDownloading(true);
            setError(null);

            try {
              const filteredRows = await api.getQivezLancamentos(filters);
              setRows(filteredRows);
              await downloadFilteredXmlZip(filteredRows);
            } catch (err: any) {
              setError(err.message || 'Erro ao baixar lancamentos filtrados.');
            } finally {
              setIsDownloading(false);
            }
          }}
        >
          <Download size={16} />
          {isDownloading ? 'Baixando...' : 'Baixar filtrados'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="w-full">
            <form
              className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_minmax(180px,1.2fr)_auto_auto] lg:items-end"
              onSubmit={event => {
                event.preventDefault();
                setAppliedFilters(getCurrentFilters());
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

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Município</label>
                <select
                  value={municipio}
                  onChange={event => setMunicipio(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                >
                  <option value="">Todos</option>
                  {municipios.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">CNPJ Tomador</label>
                <select
                  value={cnpj}
                  onChange={event => setCnpj(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                >
                  <option value="">Todos</option>
                  {cnpjs.map(item => (
                    <option key={item} value={item}>{cnpjOptionLabel(item)}</option>
                  ))}
                </select>
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
                  setMunicipio('');
                  setCnpj('');
                  setAppliedFilters({ dataInicio: '', dataFim: '', chaveCte: '', sistema: '', municipio: '', cnpj: '' });
                }}
              >
                Limpar
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

const NfeListarView = () => {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [chaveNfe, setChaveNfe] = useState('');
  const [sistema, setSistema] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [municipios, setMunicipios] = useState<string[]>([]);
  const [cnpjs, setCnpjs] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ dataInicio: '', dataFim: '', chaveNfe: '', sistema: '', municipio: '', cnpj: '', empresa: '' });

  useEffect(() => {
    api.getNfeSistemas().then(setSistemas).catch(() => {});
    api.getNfeMunicipios().then(values => setMunicipios(normalizeEmpresaOptions(values))).catch(() => {});
    api.getNfeCnpjs().then(values => setCnpjs([...values].sort())).catch(() => {});
  }, []);

  const getCurrentFilters = () => ({
    dataInicio,
    dataFim,
    chaveNfe: chaveNfe.trim(),
    sistema: sistema.trim(),
    municipio: municipio.trim(),
    cnpj: cnpj.trim(),
    empresa: empresa.trim(),
  });

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await api.getNfeLancamentos(appliedFilters);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">NFe - Não Conciliadas</h1>
            {!isLoading && !error && (
              <span className="rounded-full bg-[var(--engage-blue-400)]/15 px-3 py-0.5 text-sm font-bold text-[var(--engage-blue-800)]">
                {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Lancamentos financeiros sem NFe Sysemp, ordenados por ID.
          </p>
        </div>
        <button
          type="button"
          disabled={isLoading || isDownloading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 sm:w-auto"
          onClick={async () => {
            const filters = getCurrentFilters();
            setAppliedFilters(filters);
            setIsDownloading(true);
            setError(null);

            try {
              const filteredRows = await api.getNfeLancamentos(filters);
              setRows(filteredRows);
              const entries = filteredRows.map(row => ({ chave: formatCellValue(row.chave_nfe), json_xml: row.json_xml }));
              await downloadNfeXmlZip(entries, 'lancamentos-nfe-filtrados.zip');
            } catch (err: any) {
              setError(err.message || 'Erro ao baixar lancamentos filtrados.');
            } finally {
              setIsDownloading(false);
            }
          }}
        >
          <Download size={16} />
          {isDownloading ? 'Baixando...' : 'Baixar filtrados'}
        </button>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="w-full">
            <form
              className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:items-end"
              onSubmit={event => {
                event.preventDefault();
                setAppliedFilters(getCurrentFilters());
              }}
            >
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Emissão Início</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={event => setDataInicio(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Emissão Fim</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={event => setDataFim(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Chave NFe</label>
                <input
                  type="search"
                  value={chaveNfe}
                  onChange={event => setChaveNfe(event.target.value)}
                  placeholder="Buscar pela chave"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Fornecedor</label>
                <input
                  type="search"
                  value={empresa}
                  onChange={event => setEmpresa(event.target.value)}
                  placeholder="Buscar fornecedor"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Município</label>
                <select
                  value={municipio}
                  onChange={event => setMunicipio(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                >
                  <option value="">Todos</option>
                  {municipios.map(item => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">CNPJ Engage</label>
                <select
                  value={cnpj}
                  onChange={event => setCnpj(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
                >
                  <option value="">Todos</option>
                  {cnpjs.map(item => (
                    <option key={item} value={item}>{cnpjOptionLabel(item)}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button type="submit" className="rounded-lg bg-[var(--engage-blue-600)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)]">
                  Filtrar
                </button>

                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
                  onClick={() => {
                    setDataInicio('');
                    setDataFim('');
                    setChaveNfe('');
                    setSistema('');
                    setMunicipio('');
                    setCnpj('');
                    setEmpresa('');
                    setAppliedFilters({ dataInicio: '', dataFim: '', chaveNfe: '', sistema: '', municipio: '', cnpj: '', empresa: '' });
                  }}
                >
                  Limpar
                </button>
              </div>
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
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Data Emissão</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Nº Nota</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">CNPJ Engage</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Fornecedor</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">CNPJ Fornecedor</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Chave NFe / Valor Total</th>
                  <th className="sticky right-0 whitespace-nowrap bg-slate-50 px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.15)]">
                    Download
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, rowIndex) => (
                  <tr key={String(row.id ?? rowIndex)} className="group hover:bg-slate-50/70">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDatePt(row.data_emissao)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{formatCellValue(row.numero_nota)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700" title={cnpjOptionLabel(String(row.cnpj_tomador || ''))}>
                      {formatCnpj(String(row.cnpj_tomador || ''))}
                    </td>
                    <td className="max-w-[220px] truncate whitespace-nowrap px-4 py-3 text-slate-700" title={formatCellValue(row.empresa)}>
                      {formatCellValue(row.empresa)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{formatCnpj(String(row.cnpj_fornecedor || ''))}</td>
                    <td className="max-w-[360px] px-4 py-3">
                      <div className="truncate font-mono text-xs text-slate-700" title={formatChaveNfeComDest(row)}>
                        {formatChaveNfeComDest(row)}
                      </div>
                      <div className="mt-0.5 font-medium text-slate-800">{formatCurrency(row.valor)}</div>
                    </td>
                    <td className="sticky right-0 whitespace-nowrap bg-white px-4 py-3 text-right shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.15)] group-hover:bg-slate-50">
                      <button
                        type="button"
                        disabled={!row.json_xml}
                        onClick={() => downloadNfeXml(row.json_xml, formatCellValue(row.chave_nfe))}
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

const nfseMesAtual = () => {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { inicio: fmt(primeiroDia), fim: fmt(hoje) };
};

const NFSE_PAGE_SIZE = 30;

const TIPOS_SERVICO = ['Transporte', 'Telecom', 'Terceirizado', 'Marketplace', 'Demais Servicos'];

const TIPO_SERVICO_BADGE_CLASS: Record<string, string> = {
  Transporte: 'border-blue-200 bg-blue-100 text-blue-700',
  Telecom: 'border-purple-200 bg-purple-100 text-purple-700',
  Terceirizado: 'border-amber-200 bg-amber-100 text-amber-700',
  Marketplace: 'border-emerald-200 bg-emerald-100 text-emerald-700',
  'Demais Servicos': 'border-orange-200 bg-orange-100 text-orange-700',
};

const computeValorLiquidoNfse = (row: NfseRecord) => {
  const totalTributos = [row.iss_retido, row.irrf, row.csll, row.pis, row.cofins, row.inss]
    .reduce<number>((sum, value) => sum + Number(value || 0), 0);
  return roundMoney(resolveValorServicos(row) - totalTributos);
};

const parseNfseJsonXml = (row: NfseRecord): any => {
  let jsonXml = row.json_xml;
  if (typeof jsonXml === 'string') {
    try { jsonXml = JSON.parse(jsonXml); } catch { return null; }
  }
  return jsonXml;
};

const resolveChaveNfse = (row: NfseRecord) => {
  const jsonXml = parseNfseJsonXml(row);
  const codigo = jsonXml?.Nfse?.InfNfse?.CodigoVerificacao;
  return typeof codigo === 'string' && codigo.trim() !== '' ? codigo.trim() : null;
};

// Valor dos servicos informado no XML da NFSe (usado quando a importacao gravou 0/vazio na coluna)
const getValorServicosFromXml = (row: NfseRecord): number | null => {
  const jsonXml = parseNfseJsonXml(row);
  const valor = jsonXml?.Nfse?.InfNfse?.DeclaracaoPrestacaoServico?.InfDeclaracaoPrestacaoServico?.Servico?.Valores?.ValorServicos;
  if (valor === null || valor === undefined || valor === '') return null;
  const parsed = Number(valor);
  return Number.isNaN(parsed) ? null : roundMoney(parsed);
};

const resolveValorServicos = (row: NfseRecord) => {
  const stored = Number(row.valor_total_servicos || 0);
  if (stored !== 0) return roundMoney(stored);

  const fromXml = getValorServicosFromXml(row);
  return fromXml !== null ? fromXml : 0;
};

// Valor liquido informado pela propria prefeitura no XML da NFSe (ja desconta as retencoes)
const getValorLiquidoFromXml = (row: NfseRecord): number | null => {
  const jsonXml = parseNfseJsonXml(row);
  const valor = jsonXml?.Nfse?.InfNfse?.ValoresNfse?.ValorLiquidoNfse;
  if (valor === null || valor === undefined || valor === '') return null;
  const parsed = Number(valor);
  return Number.isNaN(parsed) ? null : roundMoney(parsed);
};

const resolveValorLiquido = (row: NfseRecord) => {
  const fromXml = getValorLiquidoFromXml(row);
  if (fromXml !== null) return fromXml;

  const stored = row.valor_liquido;
  if (stored !== null && stored !== undefined && stored !== '') return roundMoney(stored);

  return computeValorLiquidoNfse(row);
};

const ValorLiquidoInput = ({ row, onSaved }: { row: NfseRecord; onSaved: (id: unknown, value: number) => void }) => {
  const rowId = row.id;
  const initialValue = resolveValorLiquido(row);
  const [value, setValue] = useState(() => initialValue.toFixed(2));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setValue(initialValue.toFixed(2));
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const handleBlur = async () => {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setValue(initialValue.toFixed(2));
      return;
    }
    const rounded = roundMoney(parsed);
    setValue(rounded.toFixed(2));
    if (Math.abs(rounded - initialValue) < 0.001) return;

    setSaving(true);
    setStatus('idle');
    try {
      await api.updateNfseValorLiquido(row.id as string | number, rounded);
      onSaved(row.id, rounded);
      setStatus('saved');
    } catch {
      setStatus('error');
      setValue(initialValue.toFixed(2));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-block">
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={event => setValue(event.target.value)}
        onBlur={handleBlur}
        disabled={saving}
        className={`w-28 rounded-lg border px-2 py-1.5 text-right text-sm font-bold outline-none transition-colors focus:ring-2 focus:ring-[var(--engage-blue-400)]/20 ${
          status === 'error'
            ? 'border-red-300 bg-red-50 text-red-700'
            : status === 'saved'
            ? 'border-green-300 bg-green-50 text-slate-800'
            : 'border-slate-200 bg-white text-slate-800 focus:border-[var(--engage-blue-400)]'
        }`}
      />
      {status === 'saved' && (
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700 shadow-sm">
          Salvo com sucesso
        </span>
      )}
    </div>
  );
};

const CANAL_VENDA_REVISAR = 'REVISAR - COMPARAÇÃO DE VALOR';

const CANAIS_VENDA_ADICIONAIS = ['LOJA INTEGRADA - O MAGAZINE', 'LOJA INTEGRADA - WINECOM'];

const CanalVendaEditor = ({ row, canaisVenda, onSaved }: { row: NfseRecord; canaisVenda: string[]; onSaved: (id: unknown, value: string) => void }) => {
  const rowId = row.id;
  const initialValue = typeof row.canal_de_venda === 'string' ? row.canal_de_venda : '';
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setValue(initialValue);
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  useEffect(() => {
    if (status !== 'saved') return;
    const timer = setTimeout(() => setStatus('idle'), 2500);
    return () => clearTimeout(timer);
  }, [status]);

  const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const novoValor = event.target.value;
    const anterior = value;
    setValue(novoValor);
    if (!novoValor || novoValor === anterior) return;

    setSaving(true);
    setStatus('idle');
    try {
      await api.updateNfseCanalVenda(row.id as string | number, novoValor);
      onSaved(row.id, novoValor);
      setStatus('saved');
    } catch {
      setStatus('error');
      setValue(anterior);
    } finally {
      setSaving(false);
    }
  };

  const opcoesDisponiveis = canaisVenda.filter(item => item !== CANAL_VENDA_REVISAR);

  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        title="Selecione o canal de venda correto"
        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide outline-none transition-colors focus:ring-2 focus:ring-[var(--engage-blue-400)]/20 ${
          status === 'error'
            ? 'border-red-300 bg-red-50 text-red-700'
            : 'border-amber-300 bg-amber-50 text-amber-700'
        }`}
      >
        <option value={CANAL_VENDA_REVISAR}>{CANAL_VENDA_REVISAR}</option>
        {opcoesDisponiveis.map(item => (
          <option key={item} value={item}>{item}</option>
        ))}
      </select>
      {status === 'saved' && (
        <span className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700 shadow-sm">
          Salvo com sucesso
        </span>
      )}
    </div>
  );
};

const NfseListaView = () => {
  const mesAtual = nfseMesAtual();
  const [rows, setRows] = useState<NfseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [chaveNfse, setChaveNfse] = useState('');
  const [campoData, setCampoData] = useState<'emissao' | 'competencia'>('emissao');
  const [dataInicio, setDataInicio] = useState(mesAtual.inicio);
  const [dataFim, setDataFim] = useState(mesAtual.fim);
  const [cnpjTomador, setCnpjTomador] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [razaoSocialEmitente, setRazaoSocialEmitente] = useState('');
  const [cancelada, setCancelada] = useState<'' | 'true' | 'false'>('');
  const [canalVenda, setCanalVenda] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [cnpjTomadors, setCnpjTomadors] = useState<string[]>([]);
  const [canaisVenda, setCanaisVenda] = useState<string[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState({ numeroNota: '', chaveNfse: '', campoData: 'emissao' as 'emissao' | 'competencia', dataInicio: mesAtual.inicio, dataFim: mesAtual.fim, cnpjTomador: '', nomeArquivo: '', razaoSocialEmitente: '', cancelada: '' as '' | 'true' | 'false', canalVenda: '', tipoServico: '' });
  const [displayLimit, setDisplayLimit] = useState(NFSE_PAGE_SIZE);

  useEffect(() => {
    api.getNfseCnpjs().then(values => setCnpjTomadors([...values].sort())).catch(() => {});
    api.getNfseCanaisVenda().then(values => setCanaisVenda(Array.from(new Set([...values, ...CANAIS_VENDA_ADICIONAIS])).sort())).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getNfseLista(appliedFilters);
        if (!cancelled) setRows(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar NFSe.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [appliedFilters]);

  const applyFilters = () => {
    setDisplayLimit(NFSE_PAGE_SIZE);
    setAppliedFilters({ numeroNota: numeroNota.trim(), chaveNfse: chaveNfse.trim(), campoData, dataInicio, dataFim, cnpjTomador: cnpjTomador.trim(), nomeArquivo: nomeArquivo.trim(), razaoSocialEmitente: razaoSocialEmitente.trim(), cancelada, canalVenda, tipoServico });
  };

  const clearFilters = () => {
    const mes = nfseMesAtual();
    setNumeroNota(''); setChaveNfse(''); setCampoData('emissao'); setDataInicio(mes.inicio); setDataFim(mes.fim); setCnpjTomador(''); setNomeArquivo(''); setRazaoSocialEmitente(''); setCancelada(''); setCanalVenda(''); setTipoServico('');
    setDisplayLimit(NFSE_PAGE_SIZE);
    setAppliedFilters({ numeroNota: '', chaveNfse: '', campoData: 'emissao', dataInicio: mes.inicio, dataFim: mes.fim, cnpjTomador: '', nomeArquivo: '', razaoSocialEmitente: '', cancelada: '', canalVenda: '', tipoServico: '' });
  };

  const hasUrl = rows.length > 0 && rows.some(r => r.url);
  const visibleRows = rows.slice(0, displayLimit);
  const remaining = rows.length - displayLimit;

  const exportNfse = async (exportFormat: 'xlsx' | 'csv') => {
    setShowExportMenu(false);
    const exportRows = rows.map(row => {
      const totalTributos = roundMoney(
        [row.iss_retido, row.irrf, row.csll, row.pis, row.cofins, row.inss]
          .reduce((sum, value) => sum + Number(value || 0), 0)
      );
      const valorServicos = resolveValorServicos(row);

      return {
        'Numero da Nota': String(row.numero_nota ?? ''),
        'Emissao': formatDatePt(row.data_emissao),
        'Competencia': formatDatePt(row.competencia_servico),
        'Emitente Nome': String(row.razao_social_emitente ?? ''),
        'Emitente CNPJ': String(row.cnpj_emitente ?? ''),
        'Valor Servicos': valorServicos,
        'ISS Retido': roundMoney(row.iss_retido),
        IRRF: roundMoney(row.irrf),
        CSLL: roundMoney(row.csll),
        PIS: roundMoney(row.pis),
        COFINS: roundMoney(row.cofins),
        INSS: roundMoney(row.inss),
        'Total Tributos': totalTributos,
        'Valor Liquido': resolveValorLiquido(row),
        'Nome Arquivo': String(row.nome_arquivo ?? ''),
        'Link Arquivo': String(row.webviewlink || row.url || ''),
        'CNPJ Tomador': String(row.cnpj_tomador ?? ''),
      };
    });

    const date = new Date().toISOString().slice(0, 10);
    if (exportFormat === 'csv') {
      const headers = Object.keys(exportRows[0] || {});
      const moneyHeaders = new Set(['Valor Servicos', 'ISS Retido', 'IRRF', 'CSLL', 'PIS', 'COFINS', 'INSS', 'Total Tributos', 'Valor Liquido']);
      const escapeCsv = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`;
      const lines = [
        headers.map(escapeCsv).join(';'),
        ...exportRows.map(item => headers.map(header => (
          moneyHeaders.has(header)
            ? Number(item[header as keyof typeof item]).toFixed(2).replace('.', ',')
            : escapeCsv(item[header as keyof typeof item])
        )).join(';')),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `nfse-${date}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const XLSX = await import('xlsx');
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const moneyColumns = [5, 6, 7, 8, 9, 10, 11, 12, 13];
    moneyColumns.forEach(column => {
      for (let row = 1; row <= exportRows.length; row += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell) cell.z = '0.00';
      }
    });
    worksheet['!cols'] = [16, 14, 14, 32, 20, ...Array(9).fill(15), 35, 45, 20].map(wch => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'NFSe');
    XLSX.writeFile(workbook, `nfse-${date}.xlsx`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">NFSe - Lista</h1>
            {!isLoading && !error && (
              <span className="rounded-full bg-[var(--engage-blue-400)]/15 px-3 py-0.5 text-sm font-bold text-[var(--engage-blue-800)]">
                {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">Notas fiscais de servico armazenadas no Drive.</p>
        </div>
        <div className="relative w-full sm:w-auto">
          <button
            type="button"
            disabled={isLoading || rows.length === 0}
            onClick={() => setShowExportMenu(current => !current)}
            aria-expanded={showExportMenu}
            aria-haspopup="menu"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:border-emerald-500 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-300 sm:w-auto"
          >
            <FileSpreadsheet size={16} />
            Baixar dados
            <ChevronDown size={15} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
          </button>
          {showExportMenu && (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-full min-w-44 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg sm:w-44"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => exportNfse('xlsx')}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" />
                Planilha XLSX
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => exportNfse('csv')}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              >
                <FileText size={16} className="text-emerald-600" />
                Arquivo CSV
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <form
            className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:items-end"
            onSubmit={event => { event.preventDefault(); applyFilters(); }}
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Razao Social</label>
              <input type="search" value={razaoSocialEmitente} onChange={event => setRazaoSocialEmitente(event.target.value)}
                placeholder="Buscar emitente"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Numero Nota</label>
              <input type="search" value={numeroNota} onChange={event => setNumeroNota(event.target.value)}
                placeholder="Buscar numero"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Chave NFSe</label>
              <input type="search" value={chaveNfse} onChange={event => setChaveNfse(event.target.value)}
                placeholder="Buscar chave"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Filtrar por</label>
              <select value={campoData} onChange={event => setCampoData(event.target.value as 'emissao' | 'competencia')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="emissao">Emissao</option>
                <option value="competencia">Competencia</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Data Inicio</label>
              <input type="date" value={dataInicio} onChange={event => setDataInicio(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Data Fim</label>
              <input type="date" value={dataFim} onChange={event => setDataFim(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">CNPJ Tomador</label>
              <select value={cnpjTomador} onChange={event => setCnpjTomador(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {cnpjTomadors.map(item => (
                  <option key={item} value={item}>{cnpjOptionLabel(item)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Nome Arquivo</label>
              <input type="search" value={nomeArquivo} onChange={event => setNomeArquivo(event.target.value)}
                placeholder="Buscar arquivo"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Cancelada</label>
              <select value={cancelada} onChange={event => setCancelada(event.target.value as '' | 'true' | 'false')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todas</option>
                <option value="true">Sim</option>
                <option value="false">Nao</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Canal de Venda</label>
              <select value={canalVenda} onChange={event => setCanalVenda(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {canaisVenda.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Tipo de Servico</label>
              <select value={tipoServico} onChange={event => setTipoServico(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {TIPOS_SERVICO.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className="rounded-lg bg-[var(--engage-blue-600)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)]">
                Filtrar
              </button>
              <button type="button" className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100" onClick={clearFilters}>
                Limpar
              </button>
            </div>
          </form>
        </div>

        {isLoading && <div className="p-8 text-sm font-medium text-slate-500">Carregando NFSe...</div>}
        {error && <div className="p-8 text-sm font-medium text-red-600">{error}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhuma nota encontrada.</div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Emissao / Nota</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Emitente</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor Servicos</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Detalhamento dos Tributos</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Nome Arquivo</th>
                    {hasUrl && <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">PDF</th>}
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor Liquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleRows.map((row, rowIndex) => (
                    <tr
                      key={String(row.id ?? rowIndex)}
                      className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100/70'} transition-colors hover:bg-slate-200/70`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700" title="Emissao">
                          <Calendar size={13} className="shrink-0 text-slate-400" />
                          {formatDatePt(row.data_emissao)}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-slate-500" title="Competencia">
                          <CalendarClock size={13} className="shrink-0 text-slate-400" />
                          {formatDatePt(row.competencia_servico)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500">Nota {formatCellValue(row.numero_nota)}</div>
                        {resolveChaveNfse(row) && (
                          <div className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-slate-400" title={resolveChaveNfse(row) || ''}>
                            {resolveChaveNfse(row)}
                          </div>
                        )}
                        {row.cancelada === true && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
                            <XCircle size={11} className="shrink-0" />
                            Cancelada
                          </span>
                        )}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        {(typeof row.canal_de_venda === 'string' && row.canal_de_venda.trim() !== '') || (typeof row.tipo_servico === 'string' && row.tipo_servico.trim() !== '') ? (
                          <div className="mb-1 flex flex-wrap gap-1">
                            {typeof row.canal_de_venda === 'string' && row.canal_de_venda.trim() !== '' && (
                              row.canal_de_venda.trim() === CANAL_VENDA_REVISAR ? (
                                <CanalVendaEditor
                                  row={row}
                                  canaisVenda={canaisVenda}
                                  onSaved={(id, value) => {
                                    setRows(prev => prev.map(item => (item.id === id ? { ...item, canal_de_venda: value } : item)));
                                  }}
                                />
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--engage-blue-400)]/30 bg-[var(--engage-blue-400)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--engage-blue-800)]">
                                  <Tag size={11} className="shrink-0" />
                                  {row.canal_de_venda}
                                </span>
                              )
                            )}
                            {typeof row.tipo_servico === 'string' && row.tipo_servico.trim() !== '' && (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO_SERVICO_BADGE_CLASS[row.tipo_servico] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                {row.tipo_servico}
                              </span>
                            )}
                          </div>
                        ) : null}
                        <div className="truncate text-slate-700" title={formatCellValue(row.razao_social_emitente)}>
                          {formatCellValue(row.razao_social_emitente)}
                        </div>
                        <div className="mt-1 whitespace-nowrap font-mono text-xs text-slate-500">
                          {formatCellValue(row.cnpj_emitente)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{formatCurrency(resolveValorServicos(row))}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-xs">
                        <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
                          {[
                            ['ISS Retido', row.iss_retido],
                            ['IRRF', row.irrf],
                            ['CSLL', row.csll],
                            ['PIS', row.pis],
                            ['COFINS', row.cofins],
                            ['INSS', row.inss],
                          ].map(([label, value]) => (
                            <React.Fragment key={String(label)}>
                              <span className="font-bold text-slate-500">{String(label)}</span>
                              <span className="text-right font-medium text-slate-700">{formatCurrency(value)}</span>
                            </React.Fragment>
                          ))}
                          <span className="mt-1 border-t border-slate-200 pt-1 font-bold text-slate-700">Total</span>
                          <span className="mt-1 border-t border-slate-200 pt-1 text-right font-bold text-slate-800">
                            {formatCurrency(
                              [row.iss_retido, row.irrf, row.csll, row.pis, row.cofins, row.inss]
                                .reduce((sum, v) => sum + Number(v || 0), 0)
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[320px] truncate whitespace-nowrap px-4 py-3 text-slate-700" title={formatCellValue(row.nome_arquivo)}>
                        {row.webviewlink ? (
                          <a href={String(row.webviewlink)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[var(--engage-blue-600)] hover:underline">
                            <ExternalLink size={13} className="shrink-0" />
                            {formatCellValue(row.nome_arquivo)}
                          </a>
                        ) : (
                          formatCellValue(row.nome_arquivo)
                        )}
                      </td>
                      {hasUrl && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {row.url ? (
                            <a href={String(row.url)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20">
                              <Download size={14} /> PDF
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3">
                        <ValorLiquidoInput
                          row={row}
                          onSaved={(id, value) => {
                            setRows(prev => prev.map(item => (item.id === id ? { ...item, valor_liquido: value } : item)));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {remaining > 0 && (
              <div className="border-t border-slate-100 px-6 py-4 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit(prev => prev + NFSE_PAGE_SIZE)}
                  className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Ver mais ({remaining} restante{remaining !== 1 ? 's' : ''})
                </button>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
};

const NfseNaoConciliadasView = () => {
  const [rows, setRows] = useState<NfseRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numeroNota, setNumeroNota] = useState('');
  const [chaveNfse, setChaveNfse] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [cnpjTomador, setCnpjTomador] = useState('');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [razaoSocialEmitente, setRazaoSocialEmitente] = useState('');
  const [canalVenda, setCanalVenda] = useState('');
  const [tipoServico, setTipoServico] = useState('');
  const [cnpjTomadors, setCnpjTomadors] = useState<string[]>([]);
  const [canaisVenda, setCanaisVenda] = useState<string[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ numeroNota: '', chaveNfse: '', dataInicio: '', dataFim: '', cnpjTomador: '', nomeArquivo: '', razaoSocialEmitente: '', canalVenda: '', tipoServico: '' });
  const [displayLimit, setDisplayLimit] = useState(NFSE_PAGE_SIZE);

  useEffect(() => {
    api.getNfseCnpjs().then(values => setCnpjTomadors([...values].sort())).catch(() => {});
    api.getNfseCanaisVenda().then(values => setCanaisVenda(Array.from(new Set([...values, ...CANAIS_VENDA_ADICIONAIS])).sort())).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await api.getNfseNaoConciliadas(appliedFilters);
        if (!cancelled) setRows(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Erro ao carregar NFSe.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [appliedFilters]);

  const applyFilters = () => {
    setDisplayLimit(NFSE_PAGE_SIZE);
    setAppliedFilters({ numeroNota: numeroNota.trim(), chaveNfse: chaveNfse.trim(), dataInicio, dataFim, cnpjTomador: cnpjTomador.trim(), nomeArquivo: nomeArquivo.trim(), razaoSocialEmitente: razaoSocialEmitente.trim(), canalVenda, tipoServico });
  };

  const clearFilters = () => {
    setNumeroNota(''); setChaveNfse(''); setDataInicio(''); setDataFim(''); setCnpjTomador(''); setNomeArquivo(''); setRazaoSocialEmitente(''); setCanalVenda(''); setTipoServico('');
    setDisplayLimit(NFSE_PAGE_SIZE);
    setAppliedFilters({ numeroNota: '', chaveNfse: '', dataInicio: '', dataFim: '', cnpjTomador: '', nomeArquivo: '', razaoSocialEmitente: '', canalVenda: '', tipoServico: '' });
  };

  const hasUrl = rows.length > 0 && rows.some(r => r.url);
  const visibleRows = rows.slice(0, displayLimit);
  const remaining = rows.length - displayLimit;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">NFSe - Não Conciliadas</h1>
          {!isLoading && !error && (
            <span className="rounded-full bg-[var(--engage-blue-400)]/15 px-3 py-0.5 text-sm font-bold text-[var(--engage-blue-800)]">
              {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-500">Notas fiscais de servico sem correspondencia no Sysemp (existe_sysemp = false).</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <form
            className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 lg:items-end"
            onSubmit={event => { event.preventDefault(); applyFilters(); }}
          >
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Razao Social</label>
              <input type="search" value={razaoSocialEmitente} onChange={event => setRazaoSocialEmitente(event.target.value)}
                placeholder="Buscar emitente"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Numero Nota</label>
              <input type="search" value={numeroNota} onChange={event => setNumeroNota(event.target.value)}
                placeholder="Buscar numero"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Chave NFSe</label>
              <input type="search" value={chaveNfse} onChange={event => setChaveNfse(event.target.value)}
                placeholder="Buscar chave"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Data Inicio</label>
              <input type="date" value={dataInicio} onChange={event => setDataInicio(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Data Fim</label>
              <input type="date" value={dataFim} onChange={event => setDataFim(event.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">CNPJ Tomador</label>
              <select value={cnpjTomador} onChange={event => setCnpjTomador(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {cnpjTomadors.map(item => (
                  <option key={item} value={item}>{cnpjOptionLabel(item)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Nome Arquivo</label>
              <input type="search" value={nomeArquivo} onChange={event => setNomeArquivo(event.target.value)}
                placeholder="Buscar arquivo"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Canal de Venda</label>
              <select value={canalVenda} onChange={event => setCanalVenda(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {canaisVenda.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-slate-400">Tipo de Servico</label>
              <select value={tipoServico} onChange={event => setTipoServico(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20">
                <option value="">Todos</option>
                {TIPOS_SERVICO.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" className="rounded-lg bg-[var(--engage-blue-600)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)]">
                Filtrar
              </button>
              <button type="button" className="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100" onClick={clearFilters}>
                Limpar
              </button>
            </div>
          </form>
        </div>

        {isLoading && <div className="p-8 text-sm font-medium text-slate-500">Carregando NFSe...</div>}
        {error && <div className="p-8 text-sm font-medium text-red-600">{error}</div>}
        {!isLoading && !error && rows.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhuma nota nao conciliada encontrada.</div>
        )}

        {!isLoading && !error && rows.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Emissao / Nota</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Emitente</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor Servicos</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Nome Arquivo</th>
                    {hasUrl && <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">PDF</th>}
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Valor Liquido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {visibleRows.map((row, rowIndex) => (
                    <tr
                      key={String(row.id ?? rowIndex)}
                      className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100/70'} transition-colors hover:bg-slate-200/70`}
                    >
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-1.5 text-slate-700" title="Emissao">
                          <Calendar size={13} className="shrink-0 text-slate-400" />
                          {formatDatePt(row.data_emissao)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-slate-500">Nota {formatCellValue(row.numero_nota)}</div>
                        {resolveChaveNfse(row) && (
                          <div className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-slate-400" title={resolveChaveNfse(row) || ''}>
                            {resolveChaveNfse(row)}
                          </div>
                        )}
                      </td>
                      <td className="max-w-[280px] px-4 py-3">
                        {(typeof row.canal_de_venda === 'string' && row.canal_de_venda.trim() !== '') || (typeof row.tipo_servico === 'string' && row.tipo_servico.trim() !== '') ? (
                          <div className="mb-1 flex flex-wrap gap-1">
                            {typeof row.canal_de_venda === 'string' && row.canal_de_venda.trim() !== '' && (
                              row.canal_de_venda.trim() === CANAL_VENDA_REVISAR ? (
                                <CanalVendaEditor
                                  row={row}
                                  canaisVenda={canaisVenda}
                                  onSaved={(id, value) => {
                                    setRows(prev => prev.map(item => (item.id === id ? { ...item, canal_de_venda: value } : item)));
                                  }}
                                />
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--engage-blue-400)]/30 bg-[var(--engage-blue-400)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--engage-blue-800)]">
                                  <Tag size={11} className="shrink-0" />
                                  {row.canal_de_venda}
                                </span>
                              )
                            )}
                            {typeof row.tipo_servico === 'string' && row.tipo_servico.trim() !== '' && (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TIPO_SERVICO_BADGE_CLASS[row.tipo_servico] || 'border-slate-200 bg-slate-100 text-slate-600'}`}>
                                {row.tipo_servico}
                              </span>
                            )}
                          </div>
                        ) : null}
                        <div className="truncate text-slate-700" title={formatCellValue(row.razao_social_emitente)}>
                          {formatCellValue(row.razao_social_emitente)}
                        </div>
                        <div className="mt-1 whitespace-nowrap font-mono text-xs text-slate-500">
                          {formatCellValue(row.cnpj_emitente)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-800">{formatCurrency(resolveValorServicos(row))}</td>
                      <td className="max-w-[320px] truncate whitespace-nowrap px-4 py-3 text-slate-700" title={formatCellValue(row.nome_arquivo)}>
                        {row.webviewlink ? (
                          <a href={String(row.webviewlink)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[var(--engage-blue-600)] hover:underline">
                            <ExternalLink size={13} className="shrink-0" />
                            {formatCellValue(row.nome_arquivo)}
                          </a>
                        ) : (
                          formatCellValue(row.nome_arquivo)
                        )}
                      </td>
                      {hasUrl && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {row.url ? (
                            <a href={String(row.url)} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20">
                              <Download size={14} /> PDF
                            </a>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )}
                      <td className="whitespace-nowrap px-4 py-3">
                        <ValorLiquidoInput
                          row={row}
                          onSaved={(id, value) => {
                            setRows(prev => prev.map(item => (item.id === id ? { ...item, valor_liquido: value } : item)));
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {remaining > 0 && (
              <div className="border-t border-slate-100 px-6 py-4 text-center">
                <button
                  type="button"
                  onClick={() => setDisplayLimit(prev => prev + NFSE_PAGE_SIZE)}
                  className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  Ver mais ({remaining} restante{remaining !== 1 ? 's' : ''})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const DashboardView = ({ user, onLogout }: { user: string; onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQivezOpen, setIsQivezOpen] = useState(false);
  const [isFerramentasOpen, setIsFerramentasOpen] = useState(false);
  const [isNfseOpen, setIsNfseOpen] = useState(false);
  const [isNfeOpen, setIsNfeOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [showLogoFallback, setShowLogoFallback] = useState(false);
  const [naoConciliadasCount, setNaoConciliadasCount] = useState(0);
  const [naoConciliadasNfseCount, setNaoConciliadasNfseCount] = useState(0);
  const [naoConciliadasNfeCount, setNaoConciliadasNfeCount] = useState(0);

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

  useEffect(() => {
    let cancelled = false;
    api.getQivezLancamentosCount()
      .then(({ total }) => { if (!cancelled) setNaoConciliadasCount(total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getNfseNaoConciliadasCount()
      .then(({ total }) => { if (!cancelled) setNaoConciliadasNfseCount(total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.getNfeLancamentosCount()
      .then(({ total }) => { if (!cancelled) setNaoConciliadasNfeCount(total); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const hasPermission = (id: string) => isAdmin || userPermissions.includes(id);
  const hasAnyQivezPermission = qivezTabs.some(tab => hasPermission(tab.id));
  const hasAnyFerramentasPermission = ferramentasTabs.some(tab => hasPermission(tab.id));
  const hasAnyNfsePermission = nfseTabs.some(tab => hasPermission(tab.id));
  const hasAnyNfePermission = nfeTabs.some(tab => hasPermission(tab.id));

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    localStorage.setItem('activeTab', tab);
    setIsMobileMenuOpen(false);
  };

  const handleQivezToggle = () => {
    setIsQivezOpen(prev => !prev);
  };

  const handleFerramentasToggle = () => {
    setIsFerramentasOpen(prev => !prev);
  };

  const handleNfseToggle = () => {
    setIsNfseOpen(prev => !prev);
  };

  const handleNfeToggle = () => {
    setIsNfeOpen(prev => !prev);
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

          {(hasAnyQivezPermission || hasAnyNfsePermission || hasAnyNfePermission) && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Conciliacao
              </div>

              {hasAnyQivezPermission && (
                <>
                  <button
                    onClick={handleQivezToggle}
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${qivezTabs.some(tab => tab.id === activeTab) ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    <span className="flex items-center gap-3">
                      <FileText size={18} /> CTe
                      {!isQivezOpen && naoConciliadasCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {naoConciliadasCount}
                        </span>
                      )}
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
                            {tab.id === 'conciliacao_qivez_listar' && naoConciliadasCount > 0 && (
                              <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                {naoConciliadasCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {hasAnyNfsePermission && (
                <>
                  <button
                    onClick={handleNfseToggle}
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${nfseTabs.some(tab => tab.id === activeTab) ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    <span className="flex items-center gap-3">
                      <Receipt size={18} /> NFSe
                      {!isNfseOpen && naoConciliadasNfseCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {naoConciliadasNfseCount}
                        </span>
                      )}
                    </span>
                    {isNfseOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isNfseOpen && (
                    <div className="space-y-1 pl-4">
                      {nfseTabs.map(tab => {
                        if (!hasPermission(tab.id)) return null;
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                          >
                            <Icon size={16} /> {tab.label}
                            {tab.id === 'conciliacao_nfse_nao_conciliadas' && naoConciliadasNfseCount > 0 && (
                              <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                {naoConciliadasNfseCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {hasAnyNfePermission && (
                <>
                  <button
                    onClick={handleNfeToggle}
                    className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${nfeTabs.some(tab => tab.id === activeTab) ? 'bg-white/15 text-white ring-1 ring-white/15' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    <span className="flex items-center gap-3">
                      <Package size={18} /> NFe
                      {!isNfeOpen && naoConciliadasNfeCount > 0 && (
                        <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {naoConciliadasNfeCount}
                        </span>
                      )}
                    </span>
                    {isNfeOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isNfeOpen && (
                    <div className="space-y-1 pl-4">
                      {nfeTabs.map(tab => {
                        if (!hasPermission(tab.id)) return null;
                        const Icon = tab.icon;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-white/20 text-white shadow-sm ring-1 ring-white/20' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                          >
                            <Icon size={16} /> {tab.label}
                            {tab.id === 'conciliacao_nfe_listar' && naoConciliadasNfeCount > 0 && (
                              <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                {naoConciliadasNfeCount}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {hasAnyFerramentasPermission && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Ferramentas
              </div>
              <button
                onClick={handleFerramentasToggle}
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

          {activeTab === 'ferramentas_mapeamento_servicos' && hasPermission('ferramentas_mapeamento_servicos') && (
            <MapeamentoServicosView />
          )}

          {activeTab === 'conciliacao_nfse_painel' && hasPermission('conciliacao_nfse_painel') && (
            <NfsePainelView />
          )}

          {activeTab === 'conciliacao_nfse_nao_conciliadas' && hasPermission('conciliacao_nfse_nao_conciliadas') && (
            <NfseNaoConciliadasView />
          )}

          {activeTab === 'conciliacao_nfse_lista' && hasPermission('conciliacao_nfse_lista') && (
            <NfseListaView />
          )}

          {activeTab === 'conciliacao_nfe_listar' && hasPermission('conciliacao_nfe_listar') && (
            <NfeListarView />
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardView;
