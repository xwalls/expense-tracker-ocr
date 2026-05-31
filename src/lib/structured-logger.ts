import { randomUUID } from "node:crypto";

type LogDetails = Record<string, unknown>;

const SENSITIVE_KEY_PATTERN = /(token|secret|password|authorization|cookie|xml|ocrText|receiptData|cfdiXml)/i;

export function newTraceId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

export function logInfo(scope: string, event: string, details: LogDetails = {}) {
  console.log(formatLog(scope, { event, ...redactSensitiveDetails(details) }));
}

export function logError(scope: string, event: string, error: unknown, details: LogDetails = {}) {
  console.error(formatLog(scope, { event, ...redactSensitiveDetails(details), ...errorDetails(error) }));
}

export function errorDetails(error: unknown) {
  const cause = error instanceof Error && "cause" in error ? error.cause : null;
  const causeRecord = isRecord(cause) ? cause : null;

  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    causeCode: typeof causeRecord?.code === "string" ? causeRecord.code : null,
    causeHostname: typeof causeRecord?.hostname === "string" ? causeRecord.hostname : null,
  };
}

function formatLog(scope: string, payload: LogDetails) {
  return `[${scope}] ${JSON.stringify(payload)}`;
}

function redactSensitiveDetails(details: LogDetails) {
  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : value])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
