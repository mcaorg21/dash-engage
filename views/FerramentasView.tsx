import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Copy, Download, FileSpreadsheet, Loader2, Save, Search, Trash2, Upload, X } from 'lucide-react';
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

  // Transportadora state (per file, saved in GCS metadata)
  const [editTransportadoras, setEditTransportadoras] = useState<Record<string, string>>({});
  const [savingTransportadora, setSavingTransportadora] = useState<string | null>(null);

  // Column mapping state (per transportadora, saved in DB)
  const [editColumnMappings, setEditColumnMappings] = useState<Record<string, string>>({});
  const [fileColumns, setFileColumns] = useState<Record<string, string[] | undefined>>({});
  const [loadingColumns, setLoadingColumns] = useState<Record<string, boolean>>({});
  const [savingColumnMapping, setSavingColumnMapping] = useState<string | null>(null);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const { modal, alert, danger } = useModal();
  const inputRef = useRef<HTMLInputElement>(null);

  const extractUrl = `${API_BASE}/ferramentas/planilhas/extract`;

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setListError(null);
    try {
      const data = await api.getPlanilhas();
      const sorted = data.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
      setBucketFiles(sorted);
      setEditTransportadoras(Object.fromEntries(sorted.map(f => [f.name, f.transportadora ?? ''])));
      // Initialize column mappings keyed by transportadora (deduplicated)
      const colMappings: Record<string, string> = {};
      for (const f of sorted) {
        if (f.transportadora && f.columnMapping && !colMappings[f.transportadora]) {
          colMappings[f.transportadora] = f.columnMapping;
        }
      }
      setEditColumnMappings(colMappings);
    } catch (err: any) {
      setListError(err.message || 'Erro ao listar arquivos.');
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

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
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

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
      await loadFiles();
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
    const transportadora = editTransportadoras[file.name] ?? '';
    setSavingTransportadora(file.name);
    try {
      await api.updatePlanilhaMetadata(file.name, { transportadora });
      // Reflect the new columnMapping from DB (if this transportadora has one)
      const existingMapping = editColumnMappings[transportadora] ?? null;
      setBucketFiles(prev =>
        prev.map(f => f.name === file.name ? { ...f, transportadora, columnMapping: existingMapping } : f),
      );
    } catch (err: any) {
      await alert(err.message || 'Erro ao salvar transportadora.', 'Erro');
    } finally {
      setSavingTransportadora(null);
    }
  };

  const fetchColumns = async (filename: string) => {
    setLoadingColumns(prev => ({ ...prev, [filename]: true }));
    try {
      const cols = await api.getPlanilhaColumns(filename);
      setFileColumns(prev => ({ ...prev, [filename]: cols }));
    } catch (err: any) {
      await alert(err.message || 'Erro ao ler colunas do arquivo.', 'Erro');
      setFileColumns(prev => ({ ...prev, [filename]: [] }));
    } finally {
      setLoadingColumns(prev => ({ ...prev, [filename]: false }));
    }
  };

  const handleSaveColumnMapping = async (file: BucketFile) => {
    const transportadora = file.transportadora!;
    const columnMapping = editColumnMappings[transportadora] ?? '';
    if (!columnMapping) return;
    setSavingColumnMapping(file.name);
    try {
      await api.saveColumnMapping(transportadora, columnMapping);
      // Update all files that share this transportadora
      setBucketFiles(prev =>
        prev.map(f => f.transportadora === transportadora ? { ...f, columnMapping } : f),
      );
    } catch (err: any) {
      await alert(err.message || 'Erro ao salvar mapeamento.', 'Erro');
    } finally {
      setSavingColumnMapping(null);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(extractUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const mappedCount = bucketFiles.filter(f => f.columnMapping).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {modal}
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">Planilhas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie planilhas, associe transportadoras e configure quais colunas extrair para o n8n.
        </p>
      </div>

      {/* Upload area */}
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <h2 className="text-base font-bold text-slate-800">Enviar arquivos</h2>
        <div
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-12 transition-colors cursor-pointer
            ${isDragging
              ? 'border-[var(--engage-blue-500)] bg-[var(--engage-blue-400)]/5'
              : 'border-slate-200 hover:border-[var(--engage-blue-400)] hover:bg-slate-50'}`}
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
            <p className="mt-1 text-xs text-slate-400">
              {ACCEPTED.join(', ')} — varios arquivos simultaneos
            </p>
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
                {isUploading
                  ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                  : <><Upload size={15} /> Enviar {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}</>}
              </button>
              <button type="button" onClick={() => setPendingFiles([])} disabled={isUploading}
                className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-60">
                Limpar
              </button>
            </div>
          </div>
        )}
        {uploadError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{uploadError}</div>
        )}
        {uploadSuccess && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {uploadSuccess.length} arquivo{uploadSuccess.length !== 1 ? 's' : ''} enviado{uploadSuccess.length !== 1 ? 's' : ''} com sucesso.
          </div>
        )}
      </div>

      {/* Bucket file list */}
      <div className="rounded-xl border border-slate-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">Repositorio</h2>
            {!isLoadingFiles && bucketFiles.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">
                {mappedCount} de {bucketFiles.length} arquivo{bucketFiles.length !== 1 ? 's' : ''} com coluna mapeada
              </p>
            )}
          </div>
          <button type="button" onClick={loadFiles} disabled={isLoadingFiles}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40">
            <Loader2 size={16} className={isLoadingFiles ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoadingFiles && <div className="p-8 text-sm font-medium text-slate-500">Carregando arquivos...</div>}
        {listError && <div className="p-8 text-sm font-medium text-red-600">{listError}</div>}
        {!isLoadingFiles && !listError && bucketFiles.length === 0 && (
          <div className="p-8 text-sm font-medium text-slate-500">Nenhum arquivo no repositorio.</div>
        )}

        {!isLoadingFiles && !listError && bucketFiles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Nome</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Tamanho</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Atualizado em</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Transportadora</th>
                  <th className="whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">Coluna mapeada</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bucketFiles.map(file => {
                  const transpEdit = editTransportadoras[file.name] ?? '';
                  const transpSaved = file.transportadora ?? '';
                  const isTranspDirty = transpEdit !== transpSaved;
                  const isTranspSaving = savingTransportadora === file.name;

                  const activeTransp = file.transportadora;
                  const cols = activeTransp ? fileColumns[file.name] : undefined;
                  const isLoadingCols = loadingColumns[file.name] ?? false;
                  const colEdit = activeTransp ? (editColumnMappings[activeTransp] ?? '') : '';
                  const savedCol = file.columnMapping ?? '';
                  const isColDirty = colEdit !== savedCol;
                  const isColSaving = savingColumnMapping === file.name;

                  return (
                    <tr key={file.name} className="hover:bg-slate-50/70">
                      <td className="flex items-center gap-2 whitespace-nowrap px-4 py-3">
                        <FileSpreadsheet size={15} className="shrink-0 text-emerald-500" />
                        <span className="max-w-[240px] truncate font-medium text-slate-700" title={file.name}>{file.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatBytes(file.size)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(file.updated)}</td>

                      {/* Transportadora */}
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <SearchableSelect
                            value={transpEdit}
                            onChange={v => setEditTransportadoras(prev => ({ ...prev, [file.name]: v }))}
                            options={TRANSPORTADORAS}
                            disabled={isTranspSaving}
                            placeholder="Selecionar..."
                          />
                          <button type="button" onClick={() => handleSaveTransportadora(file)}
                            disabled={isTranspSaving || !isTranspDirty} title="Salvar transportadora"
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40">
                            {isTranspSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                          </button>
                        </div>
                      </td>

                      {/* Coluna mapeada */}
                      <td className="whitespace-nowrap px-4 py-3">
                        {!activeTransp ? (
                          <span className="text-xs text-slate-400 italic">Atribua uma transportadora primeiro</span>
                        ) : cols === undefined ? (
                          <div className="flex items-center gap-2">
                            {savedCol && (
                              <span className="max-w-[130px] truncate rounded-md bg-[var(--engage-blue-400)]/10 px-2 py-1 text-xs font-medium text-[var(--engage-blue-700)]" title={savedCol}>
                                {savedCol}
                              </span>
                            )}
                            <button type="button" onClick={() => fetchColumns(file.name)} disabled={isLoadingCols}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50">
                              {isLoadingCols ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                              {savedCol ? 'Alterar' : 'Detectar colunas'}
                            </button>
                          </div>
                        ) : cols.length === 0 ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-red-500">Sem colunas detectadas</span>
                            <button type="button"
                              onClick={() => setFileColumns(prev => { const n = { ...prev }; delete n[file.name]; return n; })}
                              className="text-xs text-slate-400 underline hover:text-slate-600">
                              Tentar novamente
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <SearchableSelect
                                value={colEdit}
                                onChange={v => setEditColumnMappings(prev => ({ ...prev, [activeTransp]: v }))}
                                options={cols}
                                disabled={isColSaving}
                                placeholder="Selecionar coluna..."
                                width="w-44"
                              />
                              <button type="button" onClick={() => handleSaveColumnMapping(file)}
                                disabled={isColSaving || !isColDirty} title="Salvar mapeamento"
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-40">
                                {isColSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Aplica-se a todas as planilhas de <span className="font-semibold">{activeTransp}</span>
                            </p>
                          </div>
                        )}
                      </td>

                      {/* Acoes */}
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button type="button" onClick={() => handleDownload(file)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20">
                            <Download size={13} /> Baixar
                          </button>
                          <button type="button" onClick={() => handleDelete(file)} disabled={deletingFile === file.name}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50">
                            {deletingFile === file.name ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                            Deletar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* n8n endpoint */}
      <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-800">Endpoint para n8n</h2>
          <p className="mt-1 text-sm text-slate-500">
            Retorna todos os valores das colunas mapeadas como{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono text-slate-700">
              {'[{ transportadora, arquivo, valor }]'}
            </code>.
            Os mapeamentos sao lidos do banco de dados — qualquer nova planilha da mesma transportadora ja e processada automaticamente.
          </p>
        </div>
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-mono text-slate-700 select-all">
                GET {extractUrl}
              </code>
              <button type="button" onClick={handleCopyUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50">
                <Copy size={13} />
                {copiedUrl ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Header obrigatorio</p>
            <code className="block rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-mono text-slate-700">
              Authorization: Bearer {'<seu-token>'}
            </code>
          </div>
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Exemplo de resposta</p>
            <pre className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-mono text-slate-700">{`[
  { "transportadora": "BRASPRESS", "arquivo": "braspress_maio.xlsx", "valor": "35123456789012345678901234567890123456789012345" },
  { "transportadora": "BRASPRESS", "arquivo": "braspress_maio.xlsx", "valor": "35987654321098765432109876543210987654321098765" },
  { "transportadora": "JADLOG",    "arquivo": "jadlog_abril.xlsx",   "valor": "35111111111111111111111111111111111111111111111" }
]`}</pre>
          </div>
          {mappedCount === 0 && !isLoadingFiles && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-700">
              Nenhum arquivo tem coluna mapeada. Configure a coluna na tabela acima para que o endpoint retorne dados.
            </div>
          )}
          {mappedCount > 0 && (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-700">
              {mappedCount} arquivo{mappedCount !== 1 ? 's' : ''} configurado{mappedCount !== 1 ? 's' : ''} — o endpoint vai extrair dados {mappedCount !== 1 ? 'deles' : 'dele'}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanilhasView;
