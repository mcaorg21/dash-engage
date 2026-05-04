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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#061a5a] px-4">
      <div className="absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#1b4fd3]/70 blur-3xl" />
      <div className="absolute -left-32 top-12 h-[520px] w-[520px] rounded-full bg-[#7a1fa2]/70 blur-3xl" />
      <div className="absolute -bottom-40 right-[-120px] h-[560px] w-[560px] rounded-full bg-[#c2185b]/60 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),rgba(6,26,90,0.25)_42%,rgba(3,12,40,0.82)_100%)]" />
      <div className="absolute inset-0 opacity-[0.08] [background-image:radial-gradient(rgba(255,255,255,0.7)_1px,transparent_1px)] [background-size:4px_4px]" />

      <div className="z-10 w-full max-w-md rounded-xl border border-white/15 bg-white/95 p-10 shadow-2xl shadow-black/25 backdrop-blur-md">
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
              className="w-full rounded-lg border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-white/30"
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
              className="w-full rounded-lg border border-white/20 bg-white px-4 py-3 text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-[var(--engage-blue-400)] focus:ring-2 focus:ring-white/30"
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
