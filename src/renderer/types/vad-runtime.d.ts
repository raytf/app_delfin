declare global {
  interface VadFrameProcessorOptions {
    positiveSpeechThreshold?: number
    negativeSpeechThreshold?: number
  }

  interface VadMicVADOptions extends VadFrameProcessorOptions {
    model?: 'v5' | 'legacy'
    baseAssetPath?: string
    onnxWASMBasePath?: string
    preSpeechPadMs?: number
    minSpeechMs?: number
    onSpeechStart?: () => Promise<void> | void
    onSpeechEnd?: (audio: Float32Array) => Promise<void> | void
    onVADMisfire?: () => Promise<void> | void
  }

  interface VadMicVADInstance {
    start: () => Promise<void>
    pause: () => Promise<void>
    destroy: () => Promise<void>
    setOptions: (options: Partial<VadFrameProcessorOptions>) => void
  }

  interface VadRuntimeGlobal {
    MicVAD: {
      new: (options?: Partial<VadMicVADOptions>) => Promise<VadMicVADInstance>
    }
  }

  interface OrtRuntimeGlobal {
    env?: unknown
  }

  interface Window {
    vad?: VadRuntimeGlobal
    ort?: OrtRuntimeGlobal
  }
}

export { }