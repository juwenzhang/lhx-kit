import {defineStore} from 'pinia';
import {http} from '@/services/http';

export interface UserDetail {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface State {
  user: Partial<UserDetail>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  /**
   * Fingerprint that increments on every store mutation. The host shell uses
   * it as a key/dep to remount the renderer's `<Page>` — `createConfiguredPage`
   * snapshots `options.state` once at mount (packages/renderer/src/vue.ts:70),
   * so fresh state can only enter via a fresh component instance.
   */
  version: number;
}

export const useUserDetailStore = defineStore('user-detail', {
  state: (): State => ({
    user: {},
    loading: false,
    saving: false,
    error: null,
    version: 0
  }),
  actions: {
    async fetchUser(id: string): Promise<void> {
      this.loading = true;
      this.error = null;
      this.version += 1;
      try {
        const res = await http.get<UserDetail>(`/users/${id}`);
        this.user = res.data;
      } catch (err) {
        this.user = {};
        this.error = (err as Error).message ?? 'fetch failed';
      } finally {
        this.loading = false;
        this.version += 1;
      }
    },

    setField<K extends keyof UserDetail>(field: K, value: UserDetail[K]): void {
      this.user = {...this.user, [field]: value};
      this.version += 1;
    },

    async saveUser(): Promise<{ok: boolean; message: string}> {
      if (!this.user.id) return {ok: false, message: 'no user loaded'};
      this.saving = true;
      this.version += 1;
      try {
        await http.put(`/users/${this.user.id}`, this.user);
        return {ok: true, message: '保存成功'};
      } catch (err) {
        return {ok: false, message: (err as Error).message ?? 'save failed'};
      } finally {
        this.saving = false;
        this.version += 1;
      }
    },

    async deleteUser(): Promise<{ok: boolean; message: string}> {
      if (!this.user.id) return {ok: false, message: 'no user loaded'};
      try {
        await http.delete(`/users/${this.user.id}`);
        this.user = {};
        this.version += 1;
        return {ok: true, message: '删除成功'};
      } catch (err) {
        return {ok: false, message: (err as Error).message ?? 'delete failed'};
      }
    }
  }
});
