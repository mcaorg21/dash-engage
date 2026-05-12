import React, { useCallback, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';

type ModalVariant = 'alert' | 'confirm' | 'danger';

interface ModalState {
  open: boolean;
  variant: ModalVariant;
  title: string;
  message: string;
  resolve: ((value: boolean) => void) | null;
}

const CLOSED: ModalState = { open: false, variant: 'alert', title: '', message: '', resolve: null };

const icons: Record<ModalVariant, React.ReactNode> = {
  alert: <AlertCircle size={22} className="text-amber-500" />,
  confirm: <CheckCircle2 size={22} className="text-[var(--engage-blue-600)]" />,
  danger: <Trash2 size={22} className="text-red-500" />,
};

const confirmBtnClass: Record<ModalVariant, string> = {
  alert: 'bg-[var(--engage-blue-600)] hover:bg-[var(--engage-blue-500)] text-white',
  confirm: 'bg-[var(--engage-blue-600)] hover:bg-[var(--engage-blue-500)] text-white',
  danger: 'bg-red-600 hover:bg-red-700 text-white',
};

function AppModal({ state, onClose }: { state: ModalState; onClose: (value: boolean) => void }) {
  if (!state.open) return null;

  const isAlert = state.variant === 'alert';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--engage-blue-800)]/60 p-4 backdrop-blur-sm"
      onClick={() => onClose(false)}
    >
      <div
        className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 p-6">
          <div className="mt-0.5 shrink-0">{icons[state.variant]}</div>
          <div>
            {state.title && (
              <h3 className="mb-1 text-base font-bold text-slate-800">{state.title}</h3>
            )}
            <p className="whitespace-pre-wrap text-sm text-slate-600">{state.message}</p>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {!isAlert && (
            <button
              onClick={() => onClose(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            >
              Cancelar
            </button>
          )}
          <button
            autoFocus
            onClick={() => onClose(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${confirmBtnClass[state.variant]}`}
          >
            {isAlert ? 'OK' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function useModal() {
  const [state, setState] = useState<ModalState>(CLOSED);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const open = useCallback((variant: ModalVariant, message: string, title?: string) =>
    new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setState({ open: true, variant, title: title ?? '', message, resolve });
    }), []);

  const close = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(CLOSED);
  }, []);

  const modal = <AppModal state={state} onClose={close} />;

  return {
    modal,
    alert: (message: string, title?: string) => open('alert', message, title ?? 'Aviso'),
    confirm: (message: string, title?: string) => open('confirm', message, title ?? 'Confirmacao'),
    danger: (message: string, title?: string) => open('danger', message, title ?? 'Confirmacao'),
  };
}
