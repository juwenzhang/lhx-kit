import {create} from 'zustand';

export interface UserState {
  id: string;
  name: string;
}

interface UserStore {
  user: Partial<UserState>;
  setUser: (user: UserState) => void;
  clear: () => void;
}

export const useUserStore = create<UserStore>(set => ({
  user: {},
  setUser: user => set({user}),
  clear: () => set({user: {}})
}));
