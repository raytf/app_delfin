/**
 * Startup .env validation.
 *
 * Rules (from docs/phases/phase-4-integration.md §4.6):
 *  - Warn via console.warn for every problem found.
 *  - Never throw — the app must always start even without a .env file.
 *  - Call this once, immediately after dotenv's config() in src/main/index.ts.
 */
export interface EnvValidationResult {
    /** All warning messages emitted. Empty array means no issues. */
    warnings: string[];
}
/**
 * Validates environment variables expected by the Electron main process.
 * Logs a console.warn for each issue and returns the full list of warnings.
 */
export declare function validateEnv(): EnvValidationResult;
