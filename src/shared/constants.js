export const PRESETS = [
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
];
export const DEFAULT_PRESET = 'lecture-slide';
export const SIDEBAR_WIDTH = 420;
/**
 * Text sent to the sidecar for pure voice turns.
 * A non-empty string is required because sessionHandlers has an empty-text
 * guard. This constant also gives the model explicit context about its role.
 */
export const VOICE_TURN_TEXT = 'Please respond to what the user just asked.';
