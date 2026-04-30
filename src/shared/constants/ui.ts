/**
 * Text sent to the sidecar for pure voice turns.
 * A non-empty string is required because sessionHandlers has an empty-text
 * guard. This constant also gives the model explicit context about its role.
 */
export const VOICE_TURN_TEXT = "Please respond to what the user just asked.";
