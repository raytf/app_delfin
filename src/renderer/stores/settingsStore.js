import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
export const useSettingsStore = create()(persist((set) => ({
    userName: null,
    setUserName: (name) => set({
        userName: name.trim(),
    }),
}), {
    name: 'screen-copilot-settings',
    storage: createJSONStorage(() => localStorage),
    partialize: (state) => ({
        userName: state.userName,
    }),
}));
