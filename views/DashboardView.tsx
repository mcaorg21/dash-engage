import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, LayoutDashboard, List, LogOut, Menu, RefreshCw, Upload, Users, X } from 'lucide-react';
import UserManagementView from './UserManagementView';
import { api } from '../utils/api';

const INTERNAL_LOGO_SRC = '/logo/white-logo.7e189ed.webp';

const qivezTabs = [
  { id: 'conciliacao_qivez_painel', label: 'Painel', icon: LayoutDashboard },
  { id: 'conciliacao_qivez_listar', label: 'Listar', icon: List },
  { id: 'conciliacao_qivez_importar', label: 'Importar', icon: Upload },
];

const qivezTitles: Record<string, { title: string; description: string }> = {
  conciliacao_qivez_painel: {
    title: 'Qivez - Painel',
    description: 'Resumo operacional da conciliacao Qivez.',
  },
  conciliacao_qivez_listar: {
    title: 'Qivez - Listar',
    description: 'Listagem de registros da conciliacao Qivez.',
  },
  conciliacao_qivez_importar: {
    title: 'Qivez - Importar',
    description: 'Importacao de dados para a conciliacao Qivez.',
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

const DashboardView = ({ user, onLogout }: { user: string; onLogout: () => void }) => {
  const [activeTab, setActiveTab] = useState('home');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQivezOpen, setIsQivezOpen] = useState(false);
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

        <div className="relative flex items-center justify-between border-b border-white/15 p-6">
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
                  <FileText size={18} /> Qivez
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

          {qivezTabs.some(tab => tab.id === activeTab) && hasPermission(activeTab) && (
            <QivezPlaceholderView tab={activeTab} />
          )}
        </div>
      </main>
    </div>
  );
};

export default DashboardView;
