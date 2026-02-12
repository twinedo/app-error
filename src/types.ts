export type AppErrorKind =
  | "http"
  | "network"
  | "timeout"
  | "parse"
  | "validation"
  | "unknown";

export type AppError = {
  kind: AppErrorKind;
  message: string;
  suggestion: string;
  status?: number;
  code?: string;
  retryable?: boolean;
  requestId?: string;
  details?: unknown;
  cause?: unknown;
};

const APP_ERROR_KINDS: Record<AppErrorKind, true> = {
  http: true,
  network: true,
  timeout: true,
  parse: true,
  validation: true,
  unknown: true,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isAppError = (value: unknown): value is AppError => {
  if (!isRecord(value)) return false;
  const kind = value.kind;
  if (typeof kind !== "string" || !(kind in APP_ERROR_KINDS)) return false;
  if (typeof value.message !== "string") return false;
  if (typeof value.suggestion !== "string") return false;
  return true;
};
