import type { Preset, PresetId } from './types'

export const PRESETS: Preset[] = [
  {
    id: 'lecture-slide',
    label: 'Lecture Slides',
    starterQuestions: [
      'Summarize this slide',
      'Explain the key concepts simply',
      'Quiz me on this material',
      'What are the important terms here?',
    ],
  },
  {
    id: 'generic-screen',
    label: 'Generic Screen',
    starterQuestions: [
      'What am I looking at?',
      'Summarize the key information',
      'Explain this in detail',
      'What should I pay attention to?',
    ],
  },
]

export const DEFAULT_PRESET: PresetId = 'lecture-slide'
export const SIDEBAR_WIDTH = 420
