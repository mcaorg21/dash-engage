import React, { useEffect, useState } from 'react';
import { Check, Key, Loader2, Plus, Search, Settings2, Shield, Trash2, Users, X } from 'lucide-react';
import { api } from '../utils/api';

const MENU_ITEMS = [
  { id: 'usuarios', label: 'Controle de Usuarios', group: 'Administracao' },
];

const PROTECTED_EMAILS: string[] = [];

export interface UserPermission {
  email: string;
  permissions: string[];
  isAdmin?: boolean;
}

const UserManagementView = ({ currentUser }: { currentUser: string }) => {
  const [users, setUsers] = useState<UserPermission[]>([]);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [savedMessage, setSavedMessage] = useState(false);
  const [selectedUserForPermissions, setSelectedUserForPermissions] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<string | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const showAlert = (message: string) => setAlertMessage(message);
  const showConfirm = (message: string, onConfirm: () => void) => setConfirmAction({ message, onConfirm });

  const loadUsers = async () => {
    try {
      const data = await api.getUsers();
      setUsers(data.map(u => ({ email: u.email, permissions: u.permissions, isAdmin: u.isAdmin })));
    } catch (err: any) {
      showAlert(`Erro ao carregar usuarios: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    const interval = setInterval(loadUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  const showSaved = () => {
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 2000);
  };

  const saveUserToDb = async (user: UserPermission) => {
    try {
      await api.updateUser(user.email, { permissions: user.permissions, isAdmin: user.isAdmin });
      setUsers(prev => prev.map(u => u.email === user.email ? user : u));
      showSaved();
    } catch (err: any) {
      showAlert(`Erro ao salvar permissoes: ${err.message}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) return;

    const cleanEmail = newUserEmail.trim().toLowerCase();
    if (users.some(u => u.email === cleanEmail)) {
      showAlert('Usuario ja existe.');
      return;
    }

    setIsSaving(true);
    try {
      await api.createUser(cleanEmail, newUserPassword);
      setNewUserEmail('');
      setNewUserPassword('');
      showAlert('Usuario criado com sucesso.');
      await loadUsers();
    } catch (err: any) {
      showAlert(`Erro ao criar usuario: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveUser = (email: string) => {
    if (PROTECTED_EMAILS.includes(email) || email === currentUser) {
      showAlert('Nao e possivel remover este usuario.');
      return;
    }
    showConfirm(`Remover ${email}? O usuario perdera acesso ao sistema.`, async () => {
      try {
        await api.deleteUser(email);
        showAlert(`Usuario ${email} removido com sucesso.`);
        await loadUsers();
      } catch (err: any) {
        showAlert(`Erro ao remover usuario: ${err.message}`);
      }
    });
  };

  const handleToggleAdmin = (email: string) => {
    if (PROTECTED_EMAILS.includes(email) || email === currentUser) {
      showAlert('Nao e possivel alterar o status de administrador deste usuario.');
      return;
    }
    const user = users.find(u => u.email === email);
    if (!user) return;
    const newIsAdmin = !user.isAdmin;
    showConfirm(
      `${newIsAdmin ? 'Conceder' : 'Remover'} privilegios de administrador para ${email}?`,
      () => saveUserToDb({ ...user, isAdmin: newIsAdmin })
    );
  };

  const handleResetPassword = async () => {
    if (!resetPasswordTarget || !newPasswordValue) return;
    if (newPasswordValue.length < 4) {
      showAlert('A senha deve ter pelo menos 4 caracteres.');
      return;
    }
    setIsResettingPassword(true);
    try {
      await api.resetUserPassword(resetPasswordTarget, newPasswordValue);
      showAlert(`Senha de ${resetPasswordTarget} redefinida com sucesso.`);
      setResetPasswordTarget(null);
      setNewPasswordValue('');
    } catch (err: any) {
      showAlert(`Erro ao redefinir senha: ${err.message}`);
    } finally {
      setIsResettingPassword(false);
    }
  };

  const togglePermission = (email: string, permissionId: string) => {
    const user = users.find(u => u.email === email);
    if (!user || user.isAdmin) return;
    const hasPerm = user.permissions.includes(permissionId);
    const newPerms = hasPerm
      ? user.permissions.filter(p => p !== permissionId)
      : [...user.permissions, permissionId];
    saveUserToDb({ ...user, permissions: newPerms });
  };

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchQuery.toLowerCase()));
  const groups = Array.from(new Set(MENU_ITEMS.map(i => i.group)));
  const selectedUser = users.find(u => u.email === selectedUserForPermissions);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Users className="text-slate-400" /> Controle de Usuarios
          </h1>
          <p className="mt-1 text-sm text-slate-500">Gerencie usuarios, administradores e permissoes.</p>
        </div>
        {savedMessage && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-600">
            <Check size={16} /> Alteracoes salvas
          </div>
        )}
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <form onSubmit={handleAddUser} className="mb-8 flex flex-col items-end gap-4 md:flex-row">
          <div className="w-full flex-1">
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Adicionar usuario</label>
            <input
              type="email"
              required
              placeholder="email@empresa.com"
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 focus:border-slate-400 focus:outline-none"
              value={newUserEmail}
              onChange={e => setNewUserEmail(e.target.value)}
            />
          </div>
          <div className="w-full flex-1">
            <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-slate-400">Senha inicial</label>
            <input
              type="text"
              required
              placeholder="Minimo 4 caracteres"
              className="w-full rounded-lg border border-slate-200 px-4 py-2.5 focus:border-slate-400 focus:outline-none"
              value={newUserPassword}
              onChange={e => setNewUserPassword(e.target.value)}
            />
          </div>
          <button type="submit" disabled={isSaving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-6 py-2.5 font-bold text-white transition-colors hover:bg-slate-800 disabled:opacity-70 md:w-auto">
            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            {isSaving ? 'Adicionando...' : 'Adicionar'}
          </button>
        </form>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por e-mail..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 py-2.5 pl-10 pr-4 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-4 text-xs font-bold uppercase tracking-widest text-slate-400">Usuario</th>
                <th className="pb-4 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Admin</th>
                <th className="pb-4 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Permissoes</th>
                <th className="pb-4 text-right text-xs font-bold uppercase tracking-widest text-slate-400">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredUsers.map(user => (
                <tr key={user.email} className="transition-colors hover:bg-slate-50/50">
                  <td className="flex items-center gap-2 py-4 font-medium text-slate-700">
                    {user.isAdmin && <Shield size={14} className="text-amber-500" title="Administrador" />}
                    {user.email}
                  </td>
                  <td className="py-4 text-center">
                    <button
                      onClick={() => handleToggleAdmin(user.email)}
                      disabled={PROTECTED_EMAILS.includes(user.email) || user.email === currentUser}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${user.isAdmin ? 'bg-amber-500' : 'bg-slate-200'} ${(PROTECTED_EMAILS.includes(user.email) || user.email === currentUser) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${user.isAdmin ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </td>
                  <td className="py-4 text-center">
                    <button onClick={() => setSelectedUserForPermissions(user.email)} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-200">
                      <Settings2 size={14} />
                      Gerenciar
                    </button>
                  </td>
                  <td className="flex items-center justify-end gap-1 py-4 text-right">
                    <button onClick={() => { setResetPasswordTarget(user.email); setNewPasswordValue(''); }} className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600" title="Redefinir senha">
                      <Key size={18} />
                    </button>
                    {!PROTECTED_EMAILS.includes(user.email) && user.email !== currentUser && (
                      <button onClick={() => handleRemoveUser(user.email)} className="inline-flex rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Remover usuario">
                        <Trash2 size={18} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedUserForPermissions && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Gerenciar permissoes</h3>
                <p className="text-xs text-slate-500">{selectedUser.email}</p>
              </div>
              <button onClick={() => setSelectedUserForPermissions(null)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              {selectedUser.isAdmin && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <Shield className="mt-0.5 shrink-0 text-amber-500" size={20} />
                  <p className="text-sm font-medium text-amber-800">
                    Este usuario e administrador e possui acesso total.
                  </p>
                </div>
              )}

              {groups.map(group => (
                <div key={group} className="space-y-3">
                  <div className="border-b border-slate-100 pb-2 text-sm font-bold uppercase tracking-wider text-slate-700">
                    {group}
                  </div>
                  <div className="space-y-3">
                    {MENU_ITEMS.filter(i => i.group === group).map(item => (
                      <label key={item.id} className={`flex items-center gap-3 ${selectedUser.isAdmin ? 'cursor-not-allowed opacity-70' : 'cursor-pointer group'}`}>
                        <div className="relative flex items-center">
                          <input
                            type="checkbox"
                            checked={selectedUser.isAdmin || selectedUser.permissions.includes(item.id)}
                            disabled={selectedUser.isAdmin}
                            onChange={() => togglePermission(selectedUser.email, item.id)}
                            className="peer sr-only"
                          />
                          <div className="h-5 w-9 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-disabled:opacity-50"></div>
                        </div>
                        <span className={`text-sm font-medium transition-colors ${selectedUser.isAdmin ? 'text-slate-500' : 'text-slate-600 group-hover:text-slate-900'}`}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50 p-6">
              <button onClick={() => setSelectedUserForPermissions(null)} className="rounded-lg bg-slate-900 px-6 py-2.5 font-bold text-white transition-colors hover:bg-slate-800">
                Concluido
              </button>
            </div>
          </div>
        </div>
      )}

      {resetPasswordTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-6">
              <div>
                <h3 className="text-lg font-bold text-slate-800">Redefinir senha</h3>
                <p className="text-xs text-slate-500">{resetPasswordTarget}</p>
              </div>
              <button onClick={() => setResetPasswordTarget(null)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400">Nova senha</label>
                <input
                  type="text"
                  placeholder="Digite a nova senha"
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 focus:border-slate-400 focus:outline-none"
                  value={newPasswordValue}
                  onChange={e => setNewPasswordValue(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <button onClick={() => setResetPasswordTarget(null)} className="rounded-lg px-4 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={handleResetPassword} disabled={isResettingPassword || !newPasswordValue} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-70">
                {isResettingPassword && <Loader2 size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="mb-2 text-lg font-bold text-slate-800">Confirmacao</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{confirmAction.message}</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 p-4">
              <button onClick={() => setConfirmAction(null)} className="rounded-lg px-4 py-2 font-medium text-slate-600 transition-colors hover:bg-slate-200">
                Cancelar
              </button>
              <button onClick={() => { confirmAction.onConfirm(); setConfirmAction(null); }} className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {alertMessage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="mb-2 text-lg font-bold text-slate-800">Aviso</h3>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{alertMessage}</p>
            </div>
            <div className="flex justify-end border-t border-slate-100 bg-slate-50 p-4">
              <button onClick={() => setAlertMessage(null)} className="rounded-lg bg-slate-900 px-4 py-2 font-medium text-white transition-colors hover:bg-slate-800">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
