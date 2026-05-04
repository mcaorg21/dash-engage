import React, { useEffect, useState } from 'react';
import { LayoutDashboard, LogOut, Menu, RefreshCw, Users, X } from 'lucide-react';
import UserManagementView from './UserManagementView';
import { api } from '../utils/api';

const INTERNAL_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const DashboardView = ({ user, onLogout }: { user: string; onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-[var(--engage-blue-800)] text-white transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between border-b border-white/15 p-6">
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

        <nav className="flex-1 space-y-1 overflow-y-auto px-4 py-6">
          <button
            onClick={() => handleTabChange('home')}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'home' ? 'bg-[var(--engage-blue-400)] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
          >
            <LayoutDashboard size={18} /> Inicio
          </button>

          {hasPermission('usuarios') && (
            <>
              <div className="px-4 pb-2 pt-5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                Configuracoes
              </div>
              <button
                onClick={() => handleTabChange('usuarios')}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'usuarios' ? 'bg-[var(--engage-blue-400)] text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <Users size={18} /> Controle de Usuarios
              </button>
            </>
          )}
        </nav>

        <div className="border-t border-white/15 p-4">
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
        </div>
      </main>
    </div>
  );
};

export default DashboardView;
