// ============================================================================
// JM MAKER SPORTSWEAR — STRUCTURED DEBUG LOGGER
// Replaces silent empty catch blocks so warnings and unexpected errors are
// clearly labeled by module and easy to trace in browser DevTools.
// ============================================================================

export function logWarn(scope: string, message: string, detail?: unknown): void {
  if (detail !== undefined) {
    console.warn(`[JM Maker][${scope}] ${message}`, detail);
  } else {
    console.warn(`[JM Maker][${scope}] ${message}`);
  }
}

export function logError(scope: string, message: string, error?: unknown): void {
  if (error !== undefined) {
    console.error(`[JM Maker][${scope}] ${message}`, error);
  } else {
    console.error(`[JM Maker][${scope}] ${message}`);
  }
}
