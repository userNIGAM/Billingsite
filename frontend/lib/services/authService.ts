import { apiClient } from '../apiClient';
import { unwrap } from './base';
import type { Admin, PageMeta } from '../../types/api';

interface AdminEnvelope {
  admin: Admin;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface SetupInput {
  name: string;
  email: string;
  password: string;
  setupToken: string;
}

export const authService = {
  /**
   * The token is an HttpOnly cookie, so there is nothing to store here — the
   * response is only used to populate the session UI.
   */
  async login(input: LoginInput): Promise<Admin> {
    const data = await apiClient.post<AdminEnvelope>('/auth/login', input);
    return unwrap<Admin>(data, 'admin');
  },

  /** First-run admin creation, gated server-side by ADMIN_SETUP_TOKEN. */
  async setup(input: SetupInput): Promise<Admin> {
    const data = await apiClient.post<AdminEnvelope>('/auth/setup', input);
    return unwrap<Admin>(data, 'admin');
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async me(): Promise<Admin> {
    const data = await apiClient.get<AdminEnvelope>('/auth/me');
    return unwrap<Admin>(data, 'admin');
  },
};

export interface RawEnvelope<T> {
  data: T;
  meta?: PageMeta;
}
