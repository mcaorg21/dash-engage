import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '../utils/api';

const LOGIN_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const LoginView = ({ onLogin }: { onLogin: (email: string, token: string) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLogoFallback, setShowLogoFallback] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    setIsLoading(true);
    setError('');

    try {
      const { token, user } = await api.login(cleanEmail, cleanPassword);
      onLogin(user.email, token);
    } catch (err: any) {
      setError(err.message || 'E-mail ou senha incorretos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--engage-blue-800)] px-4">
      <div className="z-10 w-full max-w-md rounded-xl border border-white/80 bg-[var(--engage-white)] p-10 shadow-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          {showLogoFallback ? (
            <h1 className="text-2xl font-bold text-[var(--engage-blue-800)]">Dash Engage</h1>
          ) : (
            <img
              src={LOGIN_LOGO_SRC}
              alt="Dash Engage"
              className="h-12 max-w-56 object-contain"
              onError={() => setShowLogoFallback(true)}
            />
          )}
          <p className="mt-1 text-sm font-medium text-slate-500">Area restrita</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-widest text-[var(--engage-blue-800)]">E-mail</label>
            <input
              type="email"
              required
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
              placeholder="usuario@empresa.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--engage-blue-800)]">Senha</label>
              <span className="text-right text-[10px] font-bold uppercase text-slate-400">
                Fale com o administrador.
              </span>
            </div>
            <input
              type="password"
              required
              className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none transition-colors focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-[var(--engage-blue-400)]/20"
              placeholder="********"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600">{error}</div>}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--engage-blue-600)] py-3 font-bold text-white shadow-lg shadow-[var(--engage-blue-800)]/20 transition-colors hover:bg-[var(--engage-blue-500)] disabled:opacity-70"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginView;
