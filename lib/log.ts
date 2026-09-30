import "server-only";

type LogFields = {
  requestId?: string;
  organizationId?: string;
  reconciliationId?: string;
  durationMs?: number;
  counts?: Record<string, number>;
  code?: string;
  [key: string]: unknown;
};

const SENSITIVE = /token|secret|password|authorization|cookie|key/i;

/**
 * Structured logs. Never include full financial datasets, uploaded documents,
 * auth tokens, or secrets (PRD §68).
 */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: LogFields = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (SENSITIVE.test(k)) continue;
    safe[k] = v;
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...safe,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}
