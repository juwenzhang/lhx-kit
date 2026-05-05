import {defineStore} from 'pinia';

export interface UserState {
  id: string;
  name: string;
}

export const useUserStore = defineStore('user', {
  state: (): Partial<UserState> => ({}),
  actions: {
    setUser(user: UserState) {
      this.id = user.id;
      this.name = user.name;
    },
    clear() {
      this.$reset();
    }
  }
});
