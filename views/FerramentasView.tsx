import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { api, type BucketFile } from '../utils/api';

const ACCEPTED = ['.xlsx', '.xls', '.csv', '.ods', '.xlsm', '.tsv'];

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

const PlanilhasView = () => {
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string[] | null>(null);
  const [bucketFiles, setBucketFiles] = useState<BucketFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setListError(null);
    try {
      const data = await api.getPlanilhas();
      setBucketFiles(data.sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? '')));
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

  const removeFile = (name: string) =>
    setPendingFiles(prev => prev.filter(f => f.name !== name));

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">Planilhas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Envie planilhas de transportadoras para o repositorio.
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
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={e => e.target.files && addFiles(e.target.files)}
          />
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
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeFile(f.name); }}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleUpload}
                disabled={isUploading}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--engage-blue-600)] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[var(--engage-blue-500)] disabled:opacity-60"
              >
                {isUploading
                  ? <><Loader2 size={15} className="animate-spin" /> Enviando...</>
                  : <><Upload size={15} /> Enviar {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}</>}
              </button>
              <button
                type="button"
                onClick={() => setPendingFiles([])}
                disabled={isUploading}
                className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-60"
              >
                Limpar
              </button>
            </div>
          </div>
        )}

        {uploadError && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            {uploadError}
          </div>
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
          <h2 className="text-base font-bold text-slate-800">Repositorio</h2>
          <button
            type="button"
            onClick={loadFiles}
            disabled={isLoadingFiles}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <Loader2 size={16} className={isLoadingFiles ? 'animate-spin' : ''} />
          </button>
        </div>

        {isLoadingFiles && (
          <div className="p-8 text-sm font-medium text-slate-500">Carregando arquivos...</div>
        )}

        {listError && (
          <div className="p-8 text-sm font-medium text-red-600">{listError}</div>
        )}

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
                  <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Download</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {bucketFiles.map(file => (
                  <tr key={file.name} className="hover:bg-slate-50/70">
                    <td className="flex items-center gap-2 whitespace-nowrap px-4 py-3">
                      <FileSpreadsheet size={15} className="shrink-0 text-emerald-500" />
                      <span className="max-w-[400px] truncate font-medium text-slate-700" title={file.name}>
                        {file.name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatBytes(file.size)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(file.updated)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDownload(file)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--engage-blue-400)]/10 px-3 py-1.5 text-xs font-bold text-[var(--engage-blue-800)] transition-colors hover:bg-[var(--engage-blue-400)]/20"
                      >
                        <Download size={13} />
                        Baixar
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

export default PlanilhasView;
