import {create} from 'zustand';
import {http} from '@/services/http';

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface UserDetailStore {
  user: Partial<UserDetail>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /**
   * `version` is a fingerprint that increments on every store mutation.
   * The host shell uses it as a `useMemo` dependency to recreate the
   * renderer's `<Page>` factory — the only way to push fresh `state`
   * into a renderer that snapshots `options.state` once at mount
   * (see packages/renderer/src/react.tsx:55).
   */
  version: number;
  fetchUser: (id: string) => Promise<void>;
  setField: (field: keyof UserDetail, value: string) => void;
  saveUser: () => Promise<{ok: boolean; message: string}>;
  deleteUser: () => Promise<{ok: boolean; message: string}>;
}

export const useUserDetailStore = create<UserDetailStore>((set, get) => ({
  user: {},
  loading: false,
  saving: false,
  error: null,
  version: 0,

  async fetchUser(id) {
    set(s => ({loading: true, error: null, version: s.version + 1}));
    try {
      const res = await http.get<UserDetail>(`/users/${id}`);
      set(s => ({user: res.data, loading: false, version: s.version + 1}));
    } catch (err) {
      set(s => ({
        user: {},
        loading: false,
        error: (err as Error).message ?? 'fetch failed',
        version: s.version + 1
      }));
    }
  },

  setField(field, value) {
    set(s => ({
      user: {...s.user, [field]: value},
      version: s.version + 1
    }));
  },

  async saveUser() {
    const {user} = get();
    if (!user.id) return {ok: false, message: 'no user loaded'};
    set(s => ({saving: true, version: s.version + 1}));
    try {
      await http.put(`/users/${user.id}`, user);
      set(s => ({saving: false, version: s.version + 1}));
      return {ok: true, message: '保存成功'};
    } catch (err) {
      set(s => ({saving: false, version: s.version + 1}));
      return {ok: false, message: (err as Error).message ?? 'save failed'};
    }
  },

  async deleteUser() {
    const {user} = get();
    if (!user.id) return {ok: false, message: 'no user loaded'};
    try {
      await http.delete(`/users/${user.id}`);
      set(s => ({user: {}, version: s.version + 1}));
      return {ok: true, message: '删除成功'};
    } catch (err) {
      return {ok: false, message: (err as Error).message ?? 'delete failed'};
    }
  }
}));
