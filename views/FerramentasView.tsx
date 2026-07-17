import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, CheckCircle2, ChevronDown, Copy, Download, FileSpreadsheet, Loader2, RefreshCw, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { api, type BucketFile, type ConciliacaoRecord } from '../utils/api';
import { useModal } from '../components/useModal';
import { TRANSPORTADORAS } from '../utils/transportadoras';
import { downloadCteXmlZip } from '../utils/cteXml';

const ACCEPTED = ['.xlsx', '.xls', '.csv', '.ods', '.xlsm', '.tsv'];
type LogEntry = { key: string; msg: string; value?: string; status: 'loading' | 'ok' | 'warn' };
const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const formatDate = (value: string | null) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  width?: string;
}

function SearchableSelect({ value, onChange, options, disabled, placeholder = 'Selecionar...', width = 'w-52' }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 2, left: r.left, width: Math.max(r.width, 320) });
    }
    setOpen(v => !v);
    setSearch('');
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = options.filter(o => !search || o.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`flex ${width} items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs transition-colors hover:border-[var(--engage-blue-400)] hover:bg-slate-50 disabled:opacity-50`}
      >
        <span className="flex-1 truncate text-left">
          {value
            ? <span className="font-medium text-slate-700">{value}</span>
            : <span className="text-slate-400">{placeholder}</span>}
        </span>
        <ChevronDown size={12} className="shrink-0 text-slate-400" />
      </button>

      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Procurar..."
              className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-[var(--engage-blue-400)]"
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
              className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2 text-left text-xs text-slate-400 hover:bg-slate-50"
            >
              <X size={11} /> Limpar selecao
            </button>
          )}
          <ul className="max-h-56 overflow-y-auto">
            {filtered.map(option => (
              <li key={option}>
                <button
                  type="button"
                  onClick={() => { onChange(option); setOpen(false); setSearch(''); }}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors hover:bg-slate-50 ${
                    value === option
                      ? 'bg-[var(--engage-blue-400)]/10 font-semibold text-[var(--engage-blue-700)]'
                      : 'text-slate-700'
                  }`}
                >
                  {option}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 text-center text-xs text-slate-400">Nenhum resultado</li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

const PlanilhasView = () => {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string[] | null>(null);

  const [bucketFiles, setBucketFiles] = useState<BucketFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  // Transportadora (per file, GCS metadata)
  const [editTransportadoras, setEditTransportadoras] = useState<Record<string, string>>({});
  const [editTransportadoraTextos, setEditTransportadoraTextos] = useState<Record<string, string>>({});
  const [savingTransportadora, setSavingTransportadora] = useState<string | null>(null);
  const [detectedCpSums, setDetectedCpSums] = useState<Record<string, number | null>>({});
  const [classifyingCp, setClassifyingCp] = useState<Record<string, string>>({});
  const [loadingCpSum, setLoadingCpSum] = useState<Record<string, boolean>>({});
  const [savedValueColumns, setSavedValueColumns] = useState<string[]>([]);
  const [syncingFile, setSyncingFile] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, { sent: number; valorTotal: number; status: number; sql?: string; retorno?: boolean; valor_diferenca?: number; quantidade_diferenca?: number; ctes_nao_encontradas?: string; semEncontroCte?: boolean } | null>>({});
  const [conciliacoes, setConciliacoes] = useState<ConciliacaoRecord[]>([]);
  const [copiedSql, setCopiedSql] = useState<string | null>(null);
  const [remInfoMap, setRemInfoMap] = useState<Record<string, { remInfo: string | null; json_xml: unknown }>>({});
  const [downloadingZip, setDownloadingZip] = useState<string | null>(null);

  const [fileLog, setFileLog] = useState<Record<string, LogEntry[]>>({});
  const [detalhesOpen, setDetalhesOpen] = useState<Record<string, boolean>>({});
  const [editMode, setEditMode] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'todos' | 'pendente' | 'sucesso' | 'erro' | 'conciliadas' | 'outrocnpj'>('pendente');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Global saved column names (DB)
  const [savedColumnNames, setSavedColumnNames] = useState<string[]>([]);
  const [loadingSavedNames, setLoadingSavedNames] = useState(true);

  // Per-file column detection state
  const [fileColumns, setFileColumns] = useState<Record<string, string[] | undefined>>({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});
  // Per-file selected column in UI (after detection)
  const [selectedColumn, setSelectedColumn] = useState<Record<string, string>>({});
  const [savingColumn, setSavingColumn] = useState<string | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const { modal, alert, danger, confirm } = useModal();
  const inputRef = useRef<HTMLInputElement>(null);
  const cteRetryCount = useRef<Record<string, number>>({});
  const savedColumnNamesRef = useRef<string[]>([]);
  const initialConciliacoesRef = useRef<string[]>([]); // snapshot dos nomes ao carregar a página

  const extractUrl = `${API_BASE}/ferramentas/planilhas/extract`;

  const loadSavedNames = useCallback(async () => {
    setLoadingSavedNames(true);
    try {
      const names = await api.getMapeamentos();
      savedColumnNamesRef.current = names;
      setSavedColumnNames(names);
    } catch {
      // non-critical, silently fail
    } finally {
      setLoadingSavedNames(false);
    }
  }, []);

  const loadSavedValueColumns = useCallback(async () => {
    try {
      const names = await api.getValorMapeamentos();
      setSavedValueColumns(names);
    } catch {
      // non-critical, silently fail
    }
  }, []);

  const loadConciliacoes = useCallback(async () => {
    try {
      const data = await api.getConciliacoes();
      setConciliacoes(data);
      initialConciliacoesRef.current = data.map(r => r.nome_arquivo);
    } catch {
      // non-critical
    }
  }, []);

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setListError(null);
    try {
      const data = await api.getPlanilhas();
      const sorted = data.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
      setBucketFiles(sorted);
      setEditTransportadoras(Object.fromEntries(sorted.map(f => {
        if (f.sigla) return [f.name, f.sigla];
        const parts = (f.transportadora ?? '').split(' ');
        return [f.name, parts[0] ?? ''];
      })));
      setEditTransportadoraTextos(Object.fromEntries(sorted.map(f => {
        if (f.titulo) return [f.name, f.titulo];
        const parts = (f.transportadora ?? '').split(' ');
        return [f.name, parts.slice(1).join(' ')];
      })));
      setSelectedColumn(prev => {
        const patch: Record<string, string> = {};
        sorted.forEach(f => { if (f.coluna_cte && !prev[f.name]) patch[f.name] = f.coluna_cte; });
        return { ...prev, ...patch };
      });
      setDetectedCpSums(prev => {
        const patch: Record<string, number | null> = {};
        sorted.forEach(f => { if (f.valor_total != null && !prev[f.name]) patch[f.name] = f.valor_total; });
        return { ...prev, ...patch };
      });
    } catch (err: any) {
      setListError(err.message || 'Erro ao listar arquivos.');
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
    loadSavedNames();
    loadSavedValueColumns();
    loadConciliacoes();
  }, [loadFiles, loadSavedNames, loadSavedValueColumns, loadConciliacoes]);

  // Auto-detecta colunas assim que os arquivos são carregados
  useEffect(() => {
    if (bucketFiles.length > 0) {
      bucketFiles.forEach(f => {
        if (f.coluna_cte && f.sigla && f.sigla !== 'NAO_ENCONTRADA' && f.titulo) {
          // Dados completos em cache — registra log e dispara sync direto
          setFileLog(prev => ({ ...prev, [f.name]: [
            { key: 'planilha', msg: 'Dados em cache', status: 'ok' },
            { key: 'titulo',   msg: 'Título',          value: f.titulo!,       status: 'ok' },
            { key: 'coluna',   msg: 'Coluna CTe',      value: f.coluna_cte!,   status: 'ok' },
            { key: 'sigla',    msg: 'Sigla',            value: f.sigla!,        status: 'ok' },
            ...(f.valor_total != null ? [{ key: 'valor', msg: "Valor Total CTe's", value: f.valor_total!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), status: 'ok' as const }] : []),
          ]}));
          handleSincronizar(f.name, f.coluna_cte, f.sigla, f.titulo, true);
        } else {
          fetchColumns(f.name);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucketFiles.length]);

  // Re-tenta auto-select quando savedColumnNames carrega (resolve race condition)
  useEffect(() => {
    if (savedColumnNames.length === 0) return;
    const savedSet = new Set(savedColumnNames);
    Object.entries(fileColumns).forEach(([filename, colsRaw]) => {
      const cols = colsRaw as string[] | undefined;
      if (!cols || selectedColumn[filename]) return;
      const match = cols.find(c => savedSet.has(c));
      if (match) {
        setSelectedColumn(prev => ({ ...prev, [filename]: match }));
        api.getPairedValueSum(filename, match).then(({ sum }) => {
          if (sum != null && sum > 0) setDetectedCpSums(prev => ({ ...prev, [filename]: sum }));
        }).catch(() => {});
        if (!editTransportadoras[filename]?.trim()) {
          api.detectSigla(filename, match).then(({ sigla }) => {
            if (sigla) setEditTransportadoras(prev => ({ ...prev, [filename]: sigla }));
          }).catch(err => console.warn('detect-sigla retry:', err));
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedColumnNames]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const result = await api.uploadPlanilhas(files);
      setUploadSuccess(result.uploaded);
      setPendingFiles([]);
      await loadFiles();
      result.uploaded.forEach(filename => fetchColumns(filename));
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao fazer upload.');
      setPendingFiles([]);
    } finally {
      setIsUploading(false);
    }
  };

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f =>
      ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext)),
    );
    if (arr.length === 0) return;
    const deduped = arr.filter(f => !pendingFiles.some(p => p.name === f.name));
    if (deduped.length === 0) return;
    setPendingFiles(prev => [...prev, ...deduped]);
    setUploadError(null);
    setUploadSuccess(null);
    uploadFiles(deduped);
  };

  const handleDelete = async (file: BucketFile) => {
    const ok = await danger(`Deletar "${file.name}"?\n\nEssa acao nao pode ser desfeita.`, 'Deletar arquivo');
    if (!ok) return;
    setDeletingFile(file.name);
    try {
      await api.deletePlanilha(file.name);
      setBucketFiles(prev => prev.filter(f => f.name !== file.name));
    } catch (err: any) {
      await alert(err.message || 'Erro ao deletar arquivo.', 'Erro');
    } finally {
      setDeletingFile(null);
    }
  };

  const handleBulkDelete = async () => {
    const names: string[] = Array.from(selectedFiles);
    if (names.length === 0) return;
    const ok = await danger(`Deletar ${names.length} arquivo${names.length !== 1 ? 's' : ''} selecionado${names.length !== 1 ? 's' : ''}?\n\nEssa acao nao pode ser desfeita.`, 'Deletar selecionados');
    if (!ok) return;
    setBulkDeleting(true);
    try {
      await Promise.all(names.map(name => api.deletePlanilha(name)));
      setBucketFiles(prev => prev.filter(f => !names.includes(f.name)));
      setSelectedFiles(new Set());
    } catch (err: any) {
      await alert(err.message || 'Erro ao deletar arquivos.', 'Erro');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDownload = (file: BucketFile) => {
    const url = api.downloadPlanilhaUrl(file.name);
    const token = localStorage.getItem('authToken') || '';
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      });
  };

  const handleSaveTransportadora = async (file: BucketFile) => {
    const sigla = editTransportadoras[file.name] ?? '';
    const titulo = (editTransportadoraTextos[file.name] ?? '').trim();
    const transportadora = titulo ? `${sigla} ${titulo}` : sigla;
    setSavingTransportadora(file.name);
    try {
      await api.updatePlanilhaMetadata(file.name, { transportadora });
      setBucketFiles(prev => prev.map(f => f.name === file.name ? { ...f, transportadora } : f));
    } catch (err: any) {
      await alert(err.message || 'Erro ao salvar transportadora.', 'Erro');
    } finally {
      setSavingTransportadora(null);
    }
  };

  const upsertLog = useCallback((filename: string, entry: LogEntry) => {
    setFileLog(prev => {
      const list = prev[filename] ?? [];
      const idx = list.findIndex(e => e.key === entry.key);
      if (idx === -1) return { ...prev, [filename]: [...list, entry] };
      return { ...prev, [filename]: list.map((e, i) => i === idx ? { ...e, ...entry } : e) };
    });
  }, []);

  const fetchColumns = async (filename: string) => {
    setFileLog(prev => ({ ...prev, [filename]: [] }));
    setLoadingColumns(prev => ({ ...prev, [filename]: true }));
    upsertLog(filename, { key: 'planilha', msg: 'Lendo planilha...', status: 'loading' });
    try {
      const raw = await api.getPlanilhaColumns(filename);
      const headers = Array.isArray(raw) ? raw : raw.headers;
      const cvValue = Array.isArray(raw) ? null : raw.cvValue;
      const cpSum = Array.isArray(raw) ? null : raw.cpSum;
      setFileColumns(prev => ({ ...prev, [filename]: headers }));
      upsertLog(filename, { key: 'planilha', msg: 'Planilha lida', value: `${headers.length} colunas`, status: 'ok' });

      // Título
      const tituloPrevio = editTransportadoraTextos[filename] ?? '';
      const tituloOk = cvValue != null && cvValue !== 'NAO_ENCONTRADO';
      const tituloFinal = tituloOk ? cvValue! : tituloPrevio;
      if (tituloOk) {
        upsertLog(filename, { key: 'titulo', msg: 'Título', value: cvValue!, status: 'ok' });
      } else {
        upsertLog(filename, { key: 'titulo', msg: 'Título não detectado automaticamente', status: 'warn' });
        if (!tituloFinal.trim()) setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
      }

      // Usa ref para garantir valor atualizado mesmo em chamadas via setTimeout
      const savedSet = new Set(savedColumnNamesRef.current);
      const autoMatch = headers.find(c => savedSet.has(c));
      if (autoMatch) {
        cteRetryCount.current[filename] = 0;
        setSelectedColumn(prev => ({ ...prev, [filename]: autoMatch }));
        upsertLog(filename, { key: 'coluna', msg: 'Coluna CTe', value: autoMatch, status: 'ok' });

        // Valor Total
        upsertLog(filename, { key: 'valor', msg: 'Calculando Valor Total CTe\'s...', status: 'loading' });
        api.getPairedValueSum(filename, autoMatch).then(({ sum, count }) => {
          upsertLog(filename, { key: 'ctes', msg: 'CTe\'s encontradas', value: String(count), status: count > 0 ? 'ok' : 'warn' });
          if (sum != null && sum > 0) {
            setDetectedCpSums(prev => ({ ...prev, [filename]: sum }));
            upsertLog(filename, { key: 'valor', msg: 'Valor Total CTe\'s', value: sum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), status: 'ok' });
          } else {
            upsertLog(filename, { key: 'valor', msg: 'Valor Total CTe\'s não calculado', status: 'warn' });
          }
        }).catch(() => {
          upsertLog(filename, { key: 'valor', msg: 'Erro ao calcular Valor Total', status: 'warn' });
        });

        // Sigla
        if (!editTransportadoras[filename]?.trim()) {
          upsertLog(filename, { key: 'sigla', msg: 'Procurando Sigla...', status: 'loading' });
          api.detectSigla(filename, autoMatch).then(({ sigla }) => {
            if (sigla) {
              setEditTransportadoras(prev => ({ ...prev, [filename]: sigla }));
              upsertLog(filename, { key: 'sigla', msg: 'Sigla', value: sigla, status: 'ok' });
              let tituloSync = tituloFinal;
              if (sigla === 'PTR') {
                const parts = tituloSync.split('-');
                tituloSync = parts[parts.length - 1];
                setEditTransportadoraTextos(prev => ({ ...prev, [filename]: tituloSync }));
                upsertLog(filename, { key: 'titulo', msg: 'Título', value: tituloSync, status: 'ok' });
              }
              if (tituloSync.trim() && tituloSync !== 'NAO_ENCONTRADO') handleSincronizar(filename, autoMatch, sigla, tituloSync, true);
            } else {
              upsertLog(filename, { key: 'sigla', msg: 'Sigla não detectada automaticamente', status: 'warn' });
              setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
            }
          }).catch(() => {
            upsertLog(filename, { key: 'sigla', msg: 'Erro ao detectar Sigla', status: 'warn' });
            setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
          });
        } else {
          upsertLog(filename, { key: 'sigla', msg: 'Sigla', value: editTransportadoras[filename], status: 'ok' });
          let tituloSync2 = tituloFinal;
          if (editTransportadoras[filename] === 'PTR') {
            const parts = tituloSync2.split('-');
            tituloSync2 = parts[parts.length - 1];
            setEditTransportadoraTextos(prev => ({ ...prev, [filename]: tituloSync2 }));
            upsertLog(filename, { key: 'titulo', msg: 'Título', value: tituloSync2, status: 'ok' });
          }
          if (tituloSync2.trim() && tituloSync2 !== 'NAO_ENCONTRADO') handleSincronizar(filename, autoMatch, editTransportadoras[filename], tituloSync2, true);
        }
      } else {
        const attempt = (cteRetryCount.current[filename] ?? 0) + 1;
        cteRetryCount.current[filename] = attempt;
        if (attempt <= 3) {
          upsertLog(filename, { key: 'coluna', msg: `Coluna CTe não detectada — tentando novamente (${attempt}/3)...`, status: 'loading' });
          setTimeout(() => fetchColumns(filename), 3000);
        } else {
          cteRetryCount.current[filename] = 0;
          upsertLog(filename, { key: 'coluna', msg: 'Coluna CTe não detectada automaticamente', status: 'warn' });
          setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
        }
      }

      // Preenche Título com o primeiro valor da coluna NUMERO DA FATURA
      // Se NAO_ENCONTRADO, preserva o que já estava preenchido
      let resolvedTitulo = editTransportadoraTextos[filename] ?? '';
      if (cvValue != null) {
        if (cvValue === 'NAO_ENCONTRADO') {
          // Não sobrescreve com NAO_ENCONTRADO — mantém o que estava ou deixa vazio
        } else {
          resolvedTitulo = cvValue;
        }
        setEditTransportadoraTextos(prev => ({ ...prev, [filename]: resolvedTitulo }));
      }
      // Armazena soma da coluna CP
      setDetectedCpSums(prev => ({ ...prev, [filename]: cpSum ?? null }));

      // Auto-save na metadata somente se sigla já estiver preenchida manualmente
      const sigla = editTransportadoras[filename] ?? '';
      if (sigla.trim()) {
        const merged = resolvedTitulo.trim() ? `${sigla} ${resolvedTitulo.trim()}`.trim() : sigla;
        const file = bucketFiles.find(f => f.name === filename);
        if (file && merged !== (file.transportadora ?? '')) {
          try {
            await api.updatePlanilhaMetadata(filename, { transportadora: merged });
            setBucketFiles(prev => prev.map(f => f.name === filename ? { ...f, transportadora: merged } : f));
          } catch { /* silently ignore */ }
        }
      }
    } catch (err: any) {
      upsertLog(filename, { key: 'planilha', msg: 'Erro ao ler planilha', status: 'warn' });
      await alert(err.message || 'Erro ao ler colunas do arquivo.', 'Erro');
      setFileColumns(prev => ({ ...prev, [filename]: [] }));
    } finally {
      setLoadingColumns(prev => ({ ...prev, [filename]: false }));
    }
  };

  const handleSincronizar = async (filename: string, cteColumn: string, sigla: string, titulo: string, autoSync = false) => {
    if (sigla === 'PTR') {
      const parts = titulo.split('-');
      titulo = parts[parts.length - 1];
    }
    setSyncingFile(filename);
    upsertLog(filename, { key: 'conciliar', msg: 'Conciliando...', status: 'loading' });
    try {
      const result = await api.sincronizarPlanilha(filename, cteColumn, sigla, titulo);
      const rawBody = result.webhook.body as any;
      const body = Array.isArray(rawBody) ? rawBody[0] : rawBody;
      const retorno = body?.retorno === true;
      const sql = typeof body?.sql === 'string' ? body.sql : undefined;
      const valor_diferenca = typeof body?.valor_diferenca === 'number' ? body.valor_diferenca : undefined;
      const quantidade_diferenca = typeof body?.quantidade_diferenca === 'number' ? body.quantidade_diferenca : undefined;
      const ctes_nao_encontradas = typeof body?.ctes_nao_encontradas === 'string' ? body.ctes_nao_encontradas : undefined;
      const semEncontroCte = sigla === 'SEM_ENCONTRO_CTE' || body?.sigla === 'SEM_ENCONTRO_CTE' || body?.transportadora === 'SEM_ENCONTRO_CTE';
      setSyncResults(prev => ({ ...prev, [filename]: { sent: result.sent, valorTotal: result.valorTotal, status: result.webhook.status, retorno, sql, valor_diferenca, quantidade_diferenca, ctes_nao_encontradas, semEncontroCte } }));
      if (ctes_nao_encontradas) {
        const chaves = ctes_nao_encontradas.split(',').map(c => c.trim()).filter(Boolean);
        if (chaves.length > 0) {
          api.getQivezRemInfo(chaves).then(map => {
            setRemInfoMap(prev => ({ ...prev, ...map }));
          }).catch(() => {});
        }
      }
      upsertLog(filename, {
        key: 'conciliar',
        msg: retorno ? 'Conciliado com sucesso' : 'Conciliação não aprovada',
        value: `${result.sent} CTe's · ${result.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        status: retorno ? 'ok' : 'warn',
      });
      if (retorno) {
        api.updatePlanilhaMetadata(filename, {
          transportadora: `${sigla} ${titulo}`.trim(),
          sigla,
          titulo,
          coluna_cte: cteColumn,
          valor_total: result.valorTotal,
        }).catch(() => {});
        setBucketFiles(prev => prev.map(f => f.name === filename
          ? { ...f, sigla, titulo, coluna_cte: cteColumn, valor_total: result.valorTotal }
          : f));
        if (!autoSync) {
          api.saveConciliacao({
            nome_arquivo: filename,
            sigla,
            titulo,
            coluna_cte: cteColumn,
            total_ctes: result.sent,
            valor_total: result.valorTotal,
            sql_retorno: sql,
          }).then(({ id, conciliado_em }) => {
            setConciliacoes(prev => [{
              id, nome_arquivo: filename, sigla, titulo, coluna_cte: cteColumn,
              total_ctes: result.sent, valor_total: result.valorTotal,
              sql_retorno: sql ?? null, conciliado_por: null, conciliado_em,
            }, ...prev]);
          }).catch(() => {});
        }
      } else {
        setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
      }
    } catch (err: any) {
      upsertLog(filename, { key: 'conciliar', msg: 'Erro ao conciliar', status: 'warn' });
      setDetalhesOpen(prev => ({ ...prev, [filename]: true }));
      await alert(err.message || 'Erro ao sincronizar.', 'Erro');
    } finally {
      setSyncingFile(null);
    }
  };

  const handleCopySql = (filename: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(filename);
  };

  const handleDownloadAllCtes = async (filename: string, ctesNaoEncontradas: string) => {
    const chaves = ctesNaoEncontradas.split(',').map(c => c.trim()).filter(Boolean);
    if (chaves.length === 0) return;
    setDownloadingZip(filename);
    try {
      let map = remInfoMap;
      const missing = chaves.filter(c => !map[c]);
      if (missing.length > 0) {
        const fetched = await api.getQivezRemInfo(missing);
        map = { ...map, ...fetched };
        setRemInfoMap(map);
      }
      const entries = chaves
        .filter(c => map[c]?.json_xml)
        .map(c => ({ chave: c, json_xml: map[c]!.json_xml }));
      const ok = entries.length > 0 && await downloadCteXmlZip(entries, `ctes-nao-encontradas-${filename.replace(/\.[^.]+$/, '')}.zip`);
      if (!ok) await alert('Nenhuma CTe encontrada no banco de dados para download.', 'Aviso');
    } catch (err: any) {
      await alert(err.message || 'Erro ao baixar CTes.', 'Erro');
    } finally {
      setDownloadingZip(null);
    }
  };

  const handleClassifyCp = async (filename: string) => {
    const column = classifyingCp[filename];
    if (!column) return;
    setLoadingCpSum(prev => ({ ...prev, [filename]: true }));
    try {
      const { sum } = await api.getPlanilhaColumnSum(filename, column);
      setDetectedCpSums(prev => ({ ...prev, [filename]: sum }));
      // Salva no dicionário se ainda não estiver
      if (!savedValueColumns.includes(column)) {
        await api.saveValorColumnName(column);
        setSavedValueColumns(prev => [...prev, column].sort());
      }
    } catch {
      // mantém null
    } finally {
      setLoadingCpSum(prev => ({ ...prev, [filename]: false }));
    }
  };

  const handleSaveColumnName = async (filename: string) => {
    const columnName = selectedColumn[filename] ?? '';
    if (!columnName) return;
    setSavingColumn(filename);
    try {
      await api.saveColumnName(columnName);
      setSavedColumnNames(prev => prev.includes(columnName) ? prev : [...prev, columnName].sort());
    } catch (err: any) {
      await alert(err.message || 'Erro ao salvar coluna.', 'Erro');
    } finally {
      setSavingColumn(null);
    }
  };

  const handleDeleteSavedName = async (columnName: string) => {
    const ok = await confirm(`Remover "${columnName}" da lista de colunas?\n\nEla nao sera mais extraida automaticamente.`, 'Remover coluna');
    if (!ok) return;
    try {
      await api.deleteColumnName(columnName);
      setSavedColumnNames(prev => prev.filter(n => n !== columnName));
    } catch (err: any) {
      await alert(err.message || 'Erro ao remover coluna.', 'Erro');
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(extractUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {modal}
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">Planilhas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie planilhas, detecte colunas e salve os nomes que devem ser extraidos automaticamente.
        </p>
      </div>

      {/* Upload */}
      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm space-y-2">
        <div
          className={`flex items-center gap-3 rounded-lg border border-dashed px-4 py-2.5 transition-colors cursor-pointer ${
            isUploading ? 'border-[var(--engage-blue-300)] bg-[var(--engage-blue-400)]/5 cursor-default' :
            isDragging ? 'border-[var(--engage-blue-500)] bg-[var(--engage-blue-400)]/5' :
            'border-slate-200 hover:border-[var(--engage-blue-400)] hover:bg-slate-50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
        >
          {isUploading
            ? <Loader2 size={15} className="shrink-0 animate-spin text-[var(--engage-blue-600)]" />
            : <Upload size={15} className="shrink-0 text-[var(--engage-blue-600)]" />
          }
          <span className="text-sm text-slate-600 flex-1">
            {isUploading
              ? <span className="font-medium text-[var(--engage-blue-700)]">Enviando {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}...</span>
              : <><span className="font-medium text-[var(--engage-blue-600)]">Clique ou arraste</span> para adicionar planilhas</>
            }
          </span>
          <span className="text-xs text-slate-400">{ACCEPTED.join(', ')}</span>
          <input ref={inputRef} type="file" multiple accept={ACCEPTED.join(',')} className="hidden"
            onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }} />
        </div>
        {uploadError && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">{uploadError}</div>}
        {uploadSuccess && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {uploadSuccess.length} arquivo{uploadSuccess.length !== 1 ? 's' : ''} enviado{uploadSuccess.length !== 1 ? 's' : ''} com sucesso.
          </div>
        )}
      </div>

      {/* File list */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-800">Repositorio</h2>
          <div className="flex items-center gap-2">
            {selectedFiles.size > 0 && (
              <button type="button" onClick={handleBulkDelete} disabled={bulkDeleting}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40">
                {bulkDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                Deletar {selectedFiles.size}
              </button>
            )}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar..."
                className="h-8 w-40 rounded-lg border border-slate-200 bg-white pl-7 pr-3 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-[var(--engage-blue-400)] focus:ring-1 focus:ring-[var(--engage-blue-400)]/30"
              />
            </div>
            <button type="button"
              onClick={() => bucketFiles.forEach(f => fetchColumns(f.name))}
              disabled={isLoadingFiles || bucketFiles.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40">
              <Search size={13} /> Detectar todos
            </button>
            <button type="button" onClick={loadFiles} disabled={isLoadingFiles}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
              <Loader2 size={16} className={isLoadingFiles ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {isLoadingFiles && <div className="p-8 text-sm font-medium text-slate-500">Carregando arquivos...</div>}
        {listError && <div className="p-8 text-sm font-medium text-red-600">{listError}</div>}
        {!isLoadingFiles && !listError && bucketFiles.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhum arquivo no repositorio.</div>
        )}

        {!isLoadingFiles && !listError && bucketFiles.length > 0 && (() => {
          const q = searchQuery.trim().toLowerCase();
          const snapshotCountFor = (name: string) => initialConciliacoesRef.current.filter(n => n === name).length;
          const siglaFor = (f: BucketFile) => (editTransportadoras[f.name] ?? '');
          const isSemEncontro = (f: BucketFile) => syncResults[f.name]?.semEncontroCte === true;
          const pendentes     = bucketFiles.filter(f => !syncResults[f.name] || siglaFor(f) === 'NAO_ENCONTRADA');
          const sucessos      = bucketFiles.filter(f => syncResults[f.name]?.retorno === true && snapshotCountFor(f.name) === 0 && siglaFor(f) !== 'NAO_ENCONTRADA' && !isSemEncontro(f));
          const erros         = bucketFiles.filter(f => syncResults[f.name]?.retorno === false && siglaFor(f) !== 'NAO_ENCONTRADA' && !isSemEncontro(f));
          const jaConciliadas = bucketFiles.filter(f => syncResults[f.name]?.retorno === true && snapshotCountFor(f.name) > 0 && siglaFor(f) !== 'NAO_ENCONTRADA' && !isSemEncontro(f));
          const outroCnpj     = bucketFiles.filter(f => isSemEncontro(f));
          const baseList   = activeTab === 'todos' ? bucketFiles
            : activeTab === 'sucesso'    ? sucessos
            : activeTab === 'erro'       ? erros
            : activeTab === 'conciliadas'? jaConciliadas
            : activeTab === 'outrocnpj'  ? outroCnpj
            : pendentes;
          const filesToShow = q ? baseList.filter(f => f.name.toLowerCase().includes(q)) : baseList;
          const allVisibleSelected = filesToShow.length > 0 && filesToShow.every(f => selectedFiles.has(f.name));
          return (
          <>
          {/* Abas */}
          <div className="flex items-center gap-0 border-b border-slate-100 px-4">
            {([
              ['todos',       'Todos',           bucketFiles.length],
              ['pendente',    'Pendente',         pendentes.length],
              ['sucesso',     'Sucesso',          sucessos.length],
              ['erro',        'Erro',             erros.length],
              ['conciliadas', 'Já Conciliadas',   jaConciliadas.length],
              ['outrocnpj',  'Faturas Outro CNPJ', outroCnpj.length],
            ] as const).map(([key, label, count]) => (
              <button key={key} type="button" onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${activeTab === key ? 'border-violet-500 text-violet-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === key ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            ))}
          </div>
          {/* Selecionar todos visíveis */}
          {filesToShow.length > 0 && (
            <div className="flex items-center gap-2 border-b border-slate-50 px-4 py-1.5">
              <input type="checkbox" checked={allVisibleSelected} onChange={e => {
                setSelectedFiles(prev => {
                  const next = new Set(prev);
                  if (e.target.checked) filesToShow.forEach(f => next.add(f.name));
                  else filesToShow.forEach(f => next.delete(f.name));
                  return next;
                });
              }} className="h-3.5 w-3.5 rounded accent-violet-600 cursor-pointer" />
              <span className="text-xs text-slate-400">
                {selectedFiles.size > 0 ? `${selectedFiles.size} selecionado${selectedFiles.size !== 1 ? 's' : ''}` : 'Selecionar todos'}
              </span>
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {filesToShow.map(file => {
                  const transpEdit = editTransportadoras[file.name] ?? '';
                  const transpTitulo = editTransportadoraTextos[file.name] ?? '';
                  const transpMerged = transpTitulo.trim() ? `${transpEdit} ${transpTitulo.trim()}` : transpEdit;
                  const isTranspDirty = transpMerged !== (file.transportadora ?? '');
                  const isTranspSaving = savingTransportadora === file.name;

                  const cols = fileColumns[file.name];
                  const isLoadingCols = loadingColumns[file.name] ?? false;
                  const colSelected = selectedColumn[file.name] ?? '';
                  const isAlreadySaved = savedColumnNames.includes(colSelected);
                  const isColSaving = savingColumn === file.name;
                  const cpSum = detectedCpSums[file.name];
                  const cpSumFmt = cpSum != null
                    ? cpSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : null;

                  const log = fileLog[file.name] ?? [];
                  const tituloWarn = (!transpTitulo.trim() || transpTitulo === 'NAO_ENCONTRADO') && log.some(e => e.key === 'titulo' && e.status === 'warn');
                  const conciliacaoCount = conciliacoes.filter(c => c.nome_arquivo === file.name).length;

                  return (
                    <div key={file.name} className="px-4 py-3 transition-colors hover:bg-slate-50/60">
                      {/* Linha 1: nome + ações + meta */}
                      <div className="mb-2.5 flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <input type="checkbox" checked={selectedFiles.has(file.name)} onChange={e => {
                            setSelectedFiles(prev => { const next = new Set(prev); e.target.checked ? next.add(file.name) : next.delete(file.name); return next; });
                          }} className="h-3.5 w-3.5 shrink-0 rounded accent-violet-600 cursor-pointer" />
                          <FileSpreadsheet size={15} className="shrink-0 text-emerald-500" />
                          <span className="truncate text-sm font-medium text-slate-700" title={file.name}>{file.name}</span>
                          {tituloWarn && (
                            <span className="animate-pulse shrink-0 inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                              <AlertCircle size={10} />
                              Salvar título
                            </span>
                          )}
                          {conciliacaoCount > 0 && (
                            <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600" title={`Conciliada ${conciliacaoCount}x`}>
                              <CheckCircle2 size={10} />
                              {conciliacaoCount > 1 ? `${conciliacaoCount}x conciliada` : 'Conciliada'}
                            </span>
                          )}
                          <button type="button" onClick={() => handleDownload(file)} title="Baixar"
                            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-[var(--engage-blue-400)]/10 hover:text-[var(--engage-blue-800)]">
                            <Download size={14} />
                          </button>
                          <button type="button" onClick={() => handleDelete(file)} disabled={deletingFile === file.name} title="Deletar"
                            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            {deletingFile === file.name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                          {/* Conciliar */}
                          {syncResults[file.name] ? (
                            <div className="flex items-center gap-1.5">
                              <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${syncResults[file.name]!.retorno ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                {syncResults[file.name]!.retorno ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                                {syncResults[file.name]!.sent} CTe's
                              </span>
                              {syncResults[file.name]!.retorno && syncResults[file.name]!.sql && (
                                <button type="button" onClick={() => handleCopySql(file.name, syncResults[file.name]!.sql!)}
                                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-white transition-colors ${copiedSql === file.name ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-800 hover:bg-slate-700'}`}>
                                  {copiedSql === file.name ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                                  {copiedSql === file.name ? 'Copiado!' : 'SQL'}
                                </button>
                              )}
                              <button type="button" onClick={() => setSyncResults(prev => ({ ...prev, [file.name]: null }))}
                                title="Reenviar" className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                                <RefreshCw size={13} />
                              </button>
                            </div>
                          ) : (
                            <button type="button"
                              onClick={() => handleSincronizar(file.name, colSelected, transpEdit, transpTitulo)}
                              disabled={!colSelected || !transpEdit.trim() || !transpTitulo.trim() || syncingFile === file.name}
                              title="Conciliar"
                              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-40">
                              {syncingFile === file.name ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                              Conciliar
                            </button>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                          <span>{formatBytes(file.size)}</span>
                          <span>{formatDate(file.updated)}</span>
                          <button type="button"
                            onClick={() => setDetalhesOpen(prev => ({ ...prev, [file.name]: !prev[file.name] }))}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-slate-100 hover:text-slate-600">
                            <ChevronDown size={12} className={`transition-transform duration-200 ${detalhesOpen[file.name] ? 'rotate-180' : ''}`} />
                            Detalhes
                          </button>
                        </div>
                      </div>

                      {/* Barra de loading inline */}
                      {(isLoadingCols || (fileLog[file.name] ?? []).some(e => e.status === 'loading')) && (
                        <div className="-mx-4 -mt-1 mb-1.5 h-[2px] animate-pulse bg-blue-400/60" />
                      )}

                      {/* Painel Detalhes */}
                      {detalhesOpen[file.name] && (() => {
                        const log = fileLog[file.name] ?? [];
                        const doneCount = log.filter(e => e.status === 'ok' || e.status === 'warn').length;
                        const progress = log.length > 0 ? Math.round(doneCount / log.length * 100) : 0;
                        const isRunning = log.some(e => e.status === 'loading');
                        const isEdit = editMode[file.name] ?? false;
                        return (
                          <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 space-y-2.5">

                            {/* Log de etapas */}
                            {log.length > 0 && (
                              <div>
                                <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className={`h-full rounded-full transition-all duration-500 ${isRunning ? 'bg-blue-400' : doneCount === log.length ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                    style={{ width: `${isRunning ? Math.max(progress, 10) : progress}%` }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  {log.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                      {entry.status === 'loading' ? <Loader2 size={11} className="shrink-0 animate-spin text-blue-500" />
                                        : entry.status === 'ok' ? <CheckCircle2 size={11} className="shrink-0 text-emerald-500" />
                                        : <AlertCircle size={11} className="shrink-0 text-amber-500" />}
                                      <span className="text-slate-500">{entry.msg}</span>
                                      {entry.value && <span className="font-semibold text-slate-700">{entry.value}</span>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {log.length > 0 && <div className="border-t border-slate-200" />}

                            {/* Campos */}
                            {cols === undefined ? (
                              <button type="button" onClick={() => fetchColumns(file.name)} disabled={isLoadingCols}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
                                {isLoadingCols ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                                Detectar colunas
                              </button>
                            ) : cols.length === 0 ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-red-500">Sem colunas detectadas</span>
                                <button type="button"
                                  onClick={() => setFileColumns(prev => { const n = { ...prev }; delete n[file.name]; return n; })}
                                  className="text-xs text-slate-400 underline hover:text-slate-600">Tentar novamente</button>
                              </div>
                            ) : isEdit ? (
                              /* Modo edição */
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                                  {/* Sigla */}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-slate-400">Sigla</span>
                                    <SearchableSelect
                                      value={transpEdit}
                                      onChange={v => setEditTransportadoras(prev => ({ ...prev, [file.name]: v }))}
                                      options={TRANSPORTADORAS}
                                      disabled={isTranspSaving}
                                      placeholder="Selecionar..."
                                    />
                                  </div>
                                  {/* Título */}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-slate-400">Título</span>
                                    <div className="flex items-center gap-1">
                                      <input type="text" value={transpTitulo}
                                        onChange={e => setEditTransportadoraTextos(prev => ({ ...prev, [file.name]: e.target.value }))}
                                        disabled={isTranspSaving} placeholder="Título"
                                        className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:opacity-50"
                                      />
                                      <button type="button" onClick={() => handleSaveTransportadora(file)}
                                        disabled={isTranspSaving || !isTranspDirty}
                                        className="inline-flex shrink-0 items-center rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40">
                                        {isTranspSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                      </button>
                                    </div>
                                  </div>
                                  <div className="mb-0.5 h-8 w-px shrink-0 self-end bg-slate-200" />
                                  {/* Coluna CTe */}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-slate-400">Coluna chave CTe</span>
                                    <div className="flex items-center gap-1">
                                      <SearchableSelect
                                        value={colSelected}
                                        onChange={v => setSelectedColumn(prev => ({ ...prev, [file.name]: v }))}
                                        options={cols}
                                        disabled={isColSaving}
                                        placeholder="Selecionar coluna..."
                                        width="w-44"
                                      />
                                      {isAlreadySaved && colSelected ? (
                                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700">
                                          <CheckCircle2 size={13} /> Salva
                                        </span>
                                      ) : (
                                        <button type="button" onClick={() => handleSaveColumnName(file.name)}
                                          disabled={isColSaving || !colSelected}
                                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--engage-blue-400)]/10 px-2.5 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:opacity-40">
                                          {isColSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                          Salvar
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mb-0.5 h-8 w-px shrink-0 self-end bg-slate-200" />
                                  {/* Valor Total */}
                                  <div className="flex flex-col gap-1">
                                    <span className="text-xs font-semibold text-slate-400">Valor Total CTe's</span>
                                    {cpSumFmt ? (
                                      <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700">{cpSumFmt}</span>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <SearchableSelect
                                          value={classifyingCp[file.name] ?? ''}
                                          onChange={v => setClassifyingCp(prev => ({ ...prev, [file.name]: v }))}
                                          options={cols}
                                          placeholder="Classificar coluna..."
                                          width="w-44"
                                        />
                                        <button type="button" onClick={() => handleClassifyCp(file.name)}
                                          disabled={!classifyingCp[file.name] || loadingCpSum[file.name]}
                                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40">
                                          {loadingCpSum[file.name] ? <Loader2 size={12} className="animate-spin" /> : 'Calcular'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <button type="button"
                                  onClick={() => setEditMode(prev => ({ ...prev, [file.name]: false }))}
                                  className="text-xs text-slate-400 underline hover:text-slate-600">
                                  Fechar edição
                                </button>
                              </div>
                            ) : (
                              /* Modo leitura */
                              <div>
                              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                                  {transpEdit && (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Sigla</span>
                                      <span className="font-semibold text-slate-700">{transpEdit}</span>
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1.5">
                                    <span className="text-slate-400">Título</span>
                                    {transpTitulo && transpTitulo !== 'NAO_ENCONTRADO'
                                      ? <span className="font-semibold text-slate-700">{transpTitulo}</span>
                                      : <span className="animate-pulse font-semibold text-red-500">— preencher</span>
                                    }
                                  </span>
                                  {colSelected && (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Coluna CTe</span>
                                      <span className="font-semibold text-slate-700">{colSelected}</span>
                                    </span>
                                  )}
                                  {cpSumFmt && (
                                    <span className="flex items-center gap-1.5">
                                      <span className="text-slate-400">Valor Total</span>
                                      <span className="font-semibold text-blue-700">{cpSumFmt}</span>
                                    </span>
                                  )}
                                </div>
                                <button type="button"
                                  onClick={() => setEditMode(prev => ({ ...prev, [file.name]: true }))}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50">
                                  Editar
                                </button>
                              </div>
                                {/* Motivo (quando conciliação falhou) */}
                                {syncResults[file.name] && !syncResults[file.name]!.retorno && (syncResults[file.name]!.valor_diferenca != null || syncResults[file.name]!.quantidade_diferenca != null || syncResults[file.name]!.ctes_nao_encontradas) && (
                                  <div className="mt-2 w-full rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 space-y-0.5">
                                    <p className="font-semibold">Motivo</p>
                                    {syncResults[file.name]!.valor_diferenca != null && (
                                      <p>Diferença valor: {syncResults[file.name]!.valor_diferenca!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                    )}
                                    {syncResults[file.name]!.quantidade_diferenca != null && (
                                      <p>Diferença qtd: {syncResults[file.name]!.quantidade_diferenca}</p>
                                    )}
                                    {syncResults[file.name]!.ctes_nao_encontradas && (
                                      <div className="pt-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <p>CTe's não encontradas:</p>
                                          <button type="button"
                                            onClick={() => handleDownloadAllCtes(file.name, syncResults[file.name]!.ctes_nao_encontradas!)}
                                            disabled={downloadingZip === file.name}
                                            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                                            {downloadingZip === file.name ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                                            Baixar todas
                                          </button>
                                        </div>
                                        {syncResults[file.name]!.ctes_nao_encontradas!.split(',').map(cte => cte.trim()).filter(Boolean).map(cte => (
                                          <p key={cte}>{remInfoMap[cte]?.remInfo ? `${cte} - ${remInfoMap[cte]!.remInfo!.toUpperCase()}` : cte}</p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
          </div>
          {filesToShow.length === 0 && activeTab !== 'conciliadas' && (
            <div className="p-8 text-center text-sm text-slate-400">Nenhum arquivo nesta aba.</div>
          )}
          {activeTab === 'conciliadas' && (
            <div className="border-t border-slate-100 px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Histórico de conciliações</h3>
                {conciliacoes.length > 0 && (
                  <button type="button"
                    onClick={async () => {
                      const ok = await danger('Limpar todo o histórico de conciliações?\n\nEssa ação não pode ser desfeita.', 'Limpar histórico');
                      if (!ok) return;
                      try {
                        await api.clearConciliacoes();
                        setConciliacoes([]);
                        initialConciliacoesRef.current = [];
                      } catch (err: any) {
                        await alert(err.message || 'Erro ao limpar histórico.', 'Erro');
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100">
                    <Trash2 size={12} /> Limpar histórico
                  </button>
                )}
              </div>
              {conciliacoes.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhuma conciliação registrada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-700">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        <th className="pb-2 pr-4">Arquivo</th>
                        <th className="pb-2 pr-4">Transportadora</th>
                        <th className="pb-2 pr-4 text-right">CTe's</th>
                        <th className="pb-2 pr-4 text-right">Valor Total</th>
                        <th className="pb-2 pr-4">Data</th>
                        <th className="pb-2">Usuário</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {conciliacoes.map(r => (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-2 pr-4 max-w-[200px] truncate font-medium" title={r.nome_arquivo}>{r.nome_arquivo}</td>
                          <td className="py-2 pr-4 text-slate-500">{r.sigla} {r.titulo}</td>
                          <td className="py-2 pr-4 text-right tabular-nums">{r.total_ctes}</td>
                          <td className="py-2 pr-4 text-right tabular-nums font-medium text-emerald-700">
                            {r.valor_total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap text-slate-400">
                            {new Date(r.conciliado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 text-slate-400">{r.conciliado_por ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          </>
          );
        })()}
      </div>

      {/* Saved column names */}
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Colunas salvas para extracao</h2>
          <p className="mt-1 text-sm text-slate-500">
            Qualquer planilha que tiver uma coluna com exatamente esses nomes sera incluida automaticamente no endpoint do n8n.
          </p>
        </div>

        {loadingSavedNames ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 size={13} className="animate-spin" /> Carregando...
          </div>
        ) : savedColumnNames.length === 0 ? (
          <p className="text-xs text-slate-400 italic">
            Nenhuma coluna salva ainda. Detecte as colunas de uma planilha e clique em Salvar.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {savedColumnNames.map(name => (
              <span key={name}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--engage-blue-200)] bg-[var(--engage-blue-400)]/8 px-3 py-1.5 text-xs font-medium text-[var(--engage-blue-800)]">
                {name}
                <button type="button" onClick={() => handleDeleteSavedName(name)}
                  className="ml-0.5 rounded text-[var(--engage-blue-400)] hover:text-red-500 transition-colors" title="Remover">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* n8n endpoint — oculto
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        ...
      </div>
      */}
    </div>
  );
};

export default PlanilhasView;
