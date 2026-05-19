const API_BASE = (import.meta.env.VITE_API_URL ?? '') + '/api';

const getToken = () => localStorage.getItem('authToken') || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Erro de servidor (${res.status}). Tente novamente.`);
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export interface UserData {
  email: string;
  isAdmin: boolean;
  isActive?: boolean;
  permissions: string[];
}

export interface LoginResponse {
  token: string;
  user: UserData;
}

export type QivezLancamento = Record<string, unknown>;

export interface BucketFile {
  name: string;
  size: number;
  updated: string | null;
  contentType: string | null;
  transportadora: string | null;
  columnMapping: string | null;
}

export interface ExtractRow {
  transportadora: string;
  arquivo: string;
  valor: unknown;
}

export interface QivezDashboardMonth {
  mes: string;
  total: number;
  total_false: number;
  soma_false: number;
  media_false: number;
}

export interface QivezDashboardResponse {
  totalCancelado: number;
  months: QivezDashboardMonth[];
}

export const api = {
  login: (email: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<UserData>('/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getUsers: () => request<UserData[]>('/users'),

  createUser: (email: string, password: string) =>
    request<{ message: string; email: string }>('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  updateUser: (email: string, updates: { permissions?: string[]; isAdmin?: boolean; isActive?: boolean }) =>
    request<{ message: string }>(`/users/${encodeURIComponent(email)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    }),

  resetUserPassword: (email: string, newPassword: string) =>
    request<{ message: string }>(`/users/${encodeURIComponent(email)}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    }),

  deleteUser: (email: string) =>
    request<{ message: string }>(`/users/${encodeURIComponent(email)}`, {
      method: 'DELETE',
    }),

  getQivezLancamentos: (filters: { dataInicio?: string; dataFim?: string; chaveCte?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.dataInicio) params.set('dataInicio', filters.dataInicio);
    if (filters.dataFim) params.set('dataFim', filters.dataFim);
    if (filters.chaveCte) params.set('chaveCte', filters.chaveCte);

    const query = params.toString();
    return request<QivezLancamento[]>(`/qivez/lancamentos${query ? `?${query}` : ''}`);
  },

  getQivezDashboard: () => request<QivezDashboardResponse>('/qivez/dashboard'),

  getPlanilhas: () => request<BucketFile[]>('/ferramentas/planilhas'),

  uploadPlanilhas: async (files: File[]): Promise<{ uploaded: string[] }> => {
    const token = getToken();
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    const res = await fetch(`${API_BASE}/ferramentas/planilhas/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(`Erro de servidor (${res.status}).`); }
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },

  downloadPlanilhaUrl: (filename: string) =>
    `${API_BASE}/ferramentas/planilhas/download?file=${encodeURIComponent(filename)}`,

  deletePlanilha: (filename: string) =>
    request<{ deleted: string }>('/ferramentas/planilhas/delete', {
      method: 'POST',
      body: JSON.stringify({ file: filename }),
    }),

  updatePlanilhaMetadata: (filename: string, fields: { transportadora?: string; columnMapping?: string }) =>
    request<{ updated: string }>('/ferramentas/planilhas/metadata', {
      method: 'POST',
      body: JSON.stringify({ file: filename, ...fields }),
    }),

  getPlanilhaColumns: (filename: string) =>
    request<string[]>(`/ferramentas/planilhas/columns?file=${encodeURIComponent(filename)}`),

  extractPlanilhas: () =>
    request<ExtractRow[]>('/ferramentas/planilhas/extract'),
};
