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

export interface QivezDashboardMonth {
  mes: string;
  total: number;
  total_true: number;
  total_false: number;
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

  getQivezLancamentos: (filters: { dataInicio?: string; dataFim?: string } = {}) => {
    const params = new URLSearchParams();
    if (filters.dataInicio) params.set('dataInicio', filters.dataInicio);
    if (filters.dataFim) params.set('dataFim', filters.dataFim);

    const query = params.toString();
    return request<QivezLancamento[]>(`/qivez/lancamentos${query ? `?${query}` : ''}`);
  },

  getQivezDashboard: () => request<QivezDashboardMonth[]>('/qivez/dashboard'),
};
