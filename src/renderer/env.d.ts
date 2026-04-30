import type { ElectronAPI } from '../shared/abstractions'

declare global {
  interface Window {
    api: ElectronAPI
  }
}

export { }
