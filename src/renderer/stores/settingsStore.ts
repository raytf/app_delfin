import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface SettingsState {
  userName: string | null
  setUserName: (name: string) => void
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      userName: null,
      setUserName: (name: string) =>
        set({
          userName: name.trim(),
        }),
    }),
    {
      name: 'screen-copilot-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        userName: state.userName,
      }),
    },
  ),
)
