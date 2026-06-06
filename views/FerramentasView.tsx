import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, ChevronDown, Copy, Download, FileSpreadsheet, Loader2, RefreshCw, Save, Search, Trash2, Upload, X } from 'lucide-react';
import { api, type BucketFile } from '../utils/api';
import { useModal } from '../components/useModal';
import { TRANSPORTADORAS } from '../utils/transportadoras';

const ACCEPTED = ['.xlsx', '.xls', '.csv', '.ods', '.xlsm', '.tsv'];
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
  const [syncResults, setSyncResults] = useState<Record<string, { sent: number; valorTotal: number; status: number; sql?: string; retorno?: boolean } | null>>({});
  const [copiedSql, setCopiedSql] = useState<string | null>(null);

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

  const extractUrl = `${API_BASE}/ferramentas/planilhas/extract`;

  const loadSavedNames = useCallback(async () => {
    setLoadingSavedNames(true);
    try {
      const names = await api.getMapeamentos();
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

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setListError(null);
    try {
      const data = await api.getPlanilhas();
      const sorted = data.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
      setBucketFiles(sorted);
      setEditTransportadoras(Object.fromEntries(sorted.map(f => {
        const parts = (f.transportadora ?? '').split(' ');
        return [f.name, parts[0] ?? ''];
      })));
      setEditTransportadoraTextos(Object.fromEntries(sorted.map(f => {
        const parts = (f.transportadora ?? '').split(' ');
        return [f.name, parts.slice(1).join(' ')];
      })));
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
  }, [loadFiles, loadSavedNames, loadSavedValueColumns]);

  // Auto-detecta colunas assim que os arquivos são carregados
  useEffect(() => {
    if (bucketFiles.length > 0) {
      bucketFiles.forEach(f => fetchColumns(f.name));
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
        if (!editTransportadoras[filename]?.trim()) {
          api.detectSigla(filename, match).then(({ sigla }) => {
            if (sigla) setEditTransportadoras(prev => ({ ...prev, [filename]: sigla }));
          }).catch(err => console.warn('detect-sigla retry:', err));
        }
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedColumnNames]);

  const addFiles = (incoming: FileList | File[]) => {
    const arr = Array.from(incoming).filter(f =>
      ACCEPTED.some(ext => f.name.toLowerCase().endsWith(ext)),
    );
    setPendingFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...arr.filter(f => !names.has(f.name))];
    });
    setUploadError(null);
    setUploadSuccess(null);
  };

  const removeFile = (name: string) => setPendingFiles(prev => prev.filter(f => f.name !== name));
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); addFiles(e.dataTransfer.files); };

  const handleUpload = async () => {
    if (pendingFiles.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const result = await api.uploadPlanilhas(pendingFiles);
      setUploadSuccess(result.uploaded);
      setPendingFiles([]);
      await loadFiles();
      result.uploaded.forEach(filename => fetchColumns(filename));
    } catch (err: any) {
      setUploadError(err.message || 'Erro ao fazer upload.');
    } finally {
      setIsUploading(false);
    }
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

  const fetchColumns = async (filename: string) => {
    setLoadingColumns(prev => ({ ...prev, [filename]: true }));
    try {
      const raw = await api.getPlanilhaColumns(filename);
      const headers = Array.isArray(raw) ? raw : raw.headers;
      const cvValue = Array.isArray(raw) ? null : raw.cvValue;
      const cpSum = Array.isArray(raw) ? null : raw.cpSum;
      setFileColumns(prev => ({ ...prev, [filename]: headers }));
      // Auto-select the first column that matches a saved name
      const savedSet = new Set(savedColumnNames);
      const autoMatch = headers.find(c => savedSet.has(c));
      if (autoMatch) {
        setSelectedColumn(prev => ({ ...prev, [filename]: autoMatch }));
        // Detecta sigla automaticamente via n8n se ainda não preenchida
        if (!editTransportadoras[filename]?.trim()) {
          api.detectSigla(filename, autoMatch).then(({ sigla }) => {
            if (sigla) setEditTransportadoras(prev => ({ ...prev, [filename]: sigla }));
          }).catch(err => console.warn('detect-sigla:', err));
        }
      }
      // Preenche Título com o primeiro valor da coluna NUMERO DA FATURA
      // Se NAO_ENCONTRADO, preserva o que já estava preenchido
      let resolvedTitulo = editTransportadoraTextos[filename] ?? '';
      if (cvValue != null) {
        if (cvValue !== 'NAO_ENCONTRADO' || !resolvedTitulo.trim()) {
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
      await alert(err.message || 'Erro ao ler colunas do arquivo.', 'Erro');
      setFileColumns(prev => ({ ...prev, [filename]: [] }));
    } finally {
      setLoadingColumns(prev => ({ ...prev, [filename]: false }));
    }
  };

  const handleSincronizar = async (filename: string, cteColumn: string, sigla: string, titulo: string) => {
    setSyncingFile(filename);
    try {
      const result = await api.sincronizarPlanilha(filename, cteColumn, sigla, titulo);
      const body = result.webhook.body as any;
      const retorno = body?.retorno === true;
      const sql = typeof body?.sql === 'string' ? body.sql : undefined;
      setSyncResults(prev => ({ ...prev, [filename]: { sent: result.sent, valorTotal: result.valorTotal, status: result.webhook.status, retorno, sql } }));
    } catch (err: any) {
      await alert(err.message || 'Erro ao sincronizar.', 'Erro');
    } finally {
      setSyncingFile(null);
    }
  };

  const handleCopySql = (filename: string, sql: string) => {
    navigator.clipboard.writeText(sql);
    setCopiedSql(filename);
    setTimeout(() => setCopiedSql(null), 2000);
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
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800">Enviar arquivos</h2>
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors cursor-pointer ${
            isDragging
              ? 'border-[var(--engage-blue-500)] bg-[var(--engage-blue-400)]/5'
              : 'border-slate-200 hover:border-[var(--engage-blue-400)] hover:bg-slate-50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--engage-blue-400)]/10">
            <Upload size={26} className="text-[var(--engage-blue-700)]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">
              Arraste arquivos aqui ou <span className="text-[var(--engage-blue-600)]">clique para selecionar</span>
            </p>
            <p className="mt-1 text-xs text-slate-400">{ACCEPTED.join(', ')} — varios arquivos simultaneos</p>
          </div>
          <input ref={inputRef} type="file" multiple accept={ACCEPTED.join(',')} className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)} />
        </div>

        {pendingFiles.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''} selecionado{pendingFiles.length !== 1 ? 's' : ''}
            </p>
            <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100">
              {pendingFiles.map(f => (
                <li key={f.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileSpreadsheet size={16} className="shrink-0 text-emerald-500" />
                    <span className="truncate text-sm font-medium text-slate-700">{f.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{formatBytes(f.size)}</span>
                  </div>
                  <button type="button" onClick={e => { e.stopPropagation(); removeFile(f.name); }}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-3 pt-1">
              <button type="button" onClick={handleUpload} disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--engage-blue-600)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)] disabled:opacity-60">
                {isUploading ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : <><Upload size={15} /> Enviar {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}</>}
              </button>
              <button type="button" onClick={() => setPendingFiles([])} disabled={isUploading}
                className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-60">
                Limpar
              </button>
            </div>
          </div>
        )}
        {uploadError && <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{uploadError}</div>}
        {uploadSuccess && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {uploadSuccess.length} arquivo{uploadSuccess.length !== 1 ? 's' : ''} enviado{uploadSuccess.length !== 1 ? 's' : ''} com sucesso.
          </div>
        )}
      </div>

      {/* File list */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-bold text-slate-800">Repositorio</h2>
          <div className="flex items-center gap-2">
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

        {!isLoadingFiles && !listError && bucketFiles.length > 0 && (
          <div className="divide-y divide-slate-100">
            {bucketFiles.map(file => {
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

                  return (
                    <div key={file.name} className="px-4 py-3 transition-colors hover:bg-slate-50/60">
                      {/* Linha 1: nome + ações + meta */}
                      <div className="mb-2.5 flex items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileSpreadsheet size={15} className="shrink-0 text-emerald-500" />
                          <span className="truncate text-sm font-medium text-slate-700" title={file.name}>{file.name}</span>
                          <button type="button" onClick={() => handleDownload(file)} title="Baixar"
                            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-[var(--engage-blue-400)]/10 hover:text-[var(--engage-blue-800)]">
                            <Download size={14} />
                          </button>
                          <button type="button" onClick={() => handleDelete(file)} disabled={deletingFile === file.name} title="Deletar"
                            className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            {deletingFile === file.name ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-3 text-xs text-slate-400">
                          <span>{formatBytes(file.size)}</span>
                          <span>{formatDate(file.updated)}</span>
                        </div>
                      </div>

                      {/* Linha 2: controles com labels em cima */}
                      <div className="flex flex-wrap items-end justify-end gap-x-3 gap-y-2">

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
                            <input
                              type="text"
                              value={transpTitulo}
                              onChange={e => setEditTransportadoraTextos(prev => ({ ...prev, [file.name]: e.target.value }))}
                              disabled={isTranspSaving}
                              placeholder="Título"
                              className="w-36 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none disabled:opacity-50"
                            />
                            <button type="button" onClick={() => handleSaveTransportadora(file)}
                              disabled={isTranspSaving || !isTranspDirty} title="Salvar"
                              className="inline-flex shrink-0 items-center rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40">
                              {isTranspSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                            </button>
                          </div>
                        </div>

                        <div className="mb-0.5 h-8 w-px shrink-0 self-end bg-slate-200" />

                        {/* Coluna chave CTE */}
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-semibold text-slate-400">Coluna chave CTe</span>
                          {cols === undefined ? (
                            <button type="button" onClick={() => fetchColumns(file.name)} disabled={isLoadingCols}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
                              {isLoadingCols ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                              Detectar
                            </button>
                          ) : cols.length === 0 ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-500">Sem colunas</span>
                              <button type="button"
                                onClick={() => setFileColumns(prev => { const n = { ...prev }; delete n[file.name]; return n; })}
                                className="text-xs text-slate-400 underline hover:text-slate-600">
                                Tentar novamente
                              </button>
                            </div>
                          ) : (
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
                                  disabled={isColSaving || !colSelected} title="Salvar nome da coluna"
                                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--engage-blue-400)]/10 px-2.5 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20 disabled:opacity-40">
                                  {isColSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                                  Salvar
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {cols !== undefined && (
                          <>
                            <div className="mb-0.5 h-8 w-px shrink-0 self-end bg-slate-200" />
                            {/* Valor Total CTe's */}
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-slate-400">Valor Total CTe's</span>
                              {cpSumFmt ? (
                                <span className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700">{cpSumFmt}</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <SearchableSelect
                                    value={classifyingCp[file.name] ?? ''}
                                    onChange={v => setClassifyingCp(prev => ({ ...prev, [file.name]: v }))}
                                    options={cols ?? []}
                                    placeholder="Classificar coluna..."
                                    width="w-44"
                                  />
                                  <button type="button"
                                    onClick={() => handleClassifyCp(file.name)}
                                    disabled={!classifyingCp[file.name] || loadingCpSum[file.name]}
                                    className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-40">
                                    {loadingCpSum[file.name] ? <Loader2 size={12} className="animate-spin" /> : 'Calcular'}
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="mb-0.5 h-8 w-px shrink-0 self-end bg-slate-200" />

                            {/* Conciliar */}
                            <div className="flex flex-col gap-1">
                              <span className="text-xs font-semibold text-slate-400">Conciliar</span>
                              {syncResults[file.name] ? (
                                <div className="flex items-center gap-2">
                                  <span className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${syncResults[file.name]!.retorno ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                    {syncResults[file.name]!.retorno ? <CheckCircle2 size={13} /> : null}
                                    {syncResults[file.name]!.sent} CTe's · {syncResults[file.name]!.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                  {syncResults[file.name]!.retorno && syncResults[file.name]!.sql && (
                                    <button type="button"
                                      onClick={() => handleCopySql(file.name, syncResults[file.name]!.sql!)}
                                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-slate-700">
                                      {copiedSql === file.name ? <CheckCircle2 size={12} /> : <Copy size={12} />}
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
                                  className="inline-flex items-center justify-center rounded-lg bg-violet-50 p-2 text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-40">
                                  {syncingFile === file.name ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                </button>
                              )}
                            </div>
                          </>
                        )}

                      </div>
                    </div>
                  );
                })}
          </div>
        )}
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
