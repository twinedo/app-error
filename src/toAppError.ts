import { getAxiosLikeErrorInfo, toHttpResponseLike } from "./adapters/axiosLike.js";
import {
  defineErrorPolicy,
  type ErrorPolicy,
  type HeadersLike,
} from "./policy.js";
import { type AppError, type AppErrorKind, isAppError } from "./types.js";

const DEFAULT_MESSAGE = "Something went wrong";

const NETWORK_ERROR_CODES = new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_NETWORK",
]);

const TIMEOUT_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const normalizeMessage = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const defaultRetryable = (kind: AppErrorKind, status?: number): boolean => {
  if (kind === "network") return true;
  if (kind === "http" && typeof status === "number") {
    return status >= 500 && status <= 599;
  }
  return false;
};

const safeInvoke = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

const getErrorInfo = (error: unknown) => {
  if (!isRecord(error)) return { name: undefined, message: undefined, code: undefined };
  return {
    name: getString(error.name),
    message: getString(error.message),
    code: getString(error.code),
  };
};

const isTimeoutError = (name?: string, message?: string, code?: string) => {
  if (name === "AbortError") return true;
  if (code && TIMEOUT_ERROR_CODES.has(code)) return true;
  const lowered = message?.toLowerCase();
  return lowered ? lowered.includes("timeout") : false;
};

const isNetworkError = (name?: string, message?: string, code?: string) => {
  if (name === "TypeError") {
    const lowered = message?.toLowerCase() ?? "";
    if (
      lowered.includes("failed to fetch") ||
      lowered.includes("network request failed") ||
      lowered.includes("networkerror") ||
      lowered.includes("load failed")
    ) {
      return true;
    }
  }

  if (code && NETWORK_ERROR_CODES.has(code)) return true;

  const lowered = message?.toLowerCase() ?? "";
  return lowered.includes("network error");
};

const isParseError = (name?: string) => name === "SyntaxError";

const isValidationError = (error: unknown, name?: string) => {
  if (name && name.toLowerCase().includes("validation")) return true;
  if (!isRecord(error)) return false;
  return Array.isArray(error.issues) || Array.isArray(error.errors);
};

const normalizeExisting = (error: AppError): AppError => {
  const message = normalizeMessage(error.message) ?? DEFAULT_MESSAGE;
  const retryable =
    typeof error.retryable === "boolean"
      ? error.retryable
      : defaultRetryable(error.kind, error.status);

  return {
    ...error,
    message,
    retryable,
  };
};

const buildAppError = (options: {
  kind: AppErrorKind;
  message: string;
  status?: number | undefined;
  code?: string | undefined;
  retryable: boolean;
  requestId?: string | undefined;
  details?: unknown | undefined;
  cause?: unknown | undefined;
}): AppError => ({
  kind: options.kind,
  message: options.message,
  retryable: options.retryable,
  ...(options.status !== undefined ? { status: options.status } : {}),
  ...(options.code ? { code: options.code } : {}),
  ...(options.requestId ? { requestId: options.requestId } : {}),
  ...(options.details !== undefined ? { details: options.details } : {}),
  ...(options.cause !== undefined ? { cause: options.cause } : {}),
});

const fromStatusObject = (
  error: unknown,
  policy: ReturnType<typeof defineErrorPolicy>
): AppError | null => {
  if (!isRecord(error)) return null;
  if (typeof error.status !== "number" || error.status < 400) return null;

  const status = error.status;
  const statusText = getString(error.statusText);
  const headers = error.headers as HeadersLike | undefined;
  const response = {
    status,
    ...(statusText ? { statusText } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };

  const details =
    error.data !== undefined
      ? error.data
      : error.body !== undefined
        ? error.body
        : error.details;

  const message =
    normalizeMessage(safeInvoke(() => policy.http.message(details, response))) ??
    DEFAULT_MESSAGE;

  const code = safeInvoke(() => policy.http.code(details, response));
  const requestId = safeInvoke(() => policy.http.requestId(response.headers));
  const retryable =
    safeInvoke(() => policy.http.retryable(status)) ??
    defaultRetryable("http", status);

  return buildAppError({
    kind: "http",
    message,
    status,
    code: normalizeMessage(code),
    retryable,
    requestId: normalizeMessage(requestId),
    details,
    cause: error,
  });
};

export const toAppError = (error: unknown, policy?: ErrorPolicy): AppError => {
  const resolvedPolicy = defineErrorPolicy(policy);

  try {
    if (isAppError(error)) return normalizeExisting(error);

    const axiosInfo = getAxiosLikeErrorInfo(error);
    if (axiosInfo) {
      if (axiosInfo.response) {
        const response = toHttpResponseLike(axiosInfo);
        const message =
          normalizeMessage(
            safeInvoke(() => resolvedPolicy.http.message(axiosInfo.data, response))
          ) ?? DEFAULT_MESSAGE;
        const code = safeInvoke(() =>
          resolvedPolicy.http.code(axiosInfo.data, response)
        );
        const requestId = safeInvoke(() =>
          resolvedPolicy.http.requestId(axiosInfo.headers)
        );
        const retryable =
          safeInvoke(() => resolvedPolicy.http.retryable(axiosInfo.status)) ??
          defaultRetryable("http", axiosInfo.status);

        return buildAppError({
          kind: "http",
          message,
          status: axiosInfo.status,
          code: normalizeMessage(code),
          retryable,
          requestId: normalizeMessage(requestId),
          details: axiosInfo.data,
          cause: error,
        });
      }

      if (axiosInfo.isTimeout) {
        return buildAppError({
          kind: "timeout",
          message: DEFAULT_MESSAGE,
          retryable: false,
          cause: error,
        });
      }

      if (axiosInfo.isNetworkError) {
        return buildAppError({
          kind: "network",
          message: DEFAULT_MESSAGE,
          retryable: true,
          cause: error,
        });
      }
    }

    const { name, message, code } = getErrorInfo(error);

    if (isTimeoutError(name, message, code)) {
      return buildAppError({
        kind: "timeout",
        message: DEFAULT_MESSAGE,
        retryable: false,
        cause: error,
      });
    }

    if (isNetworkError(name, message, code)) {
      return buildAppError({
        kind: "network",
        message: DEFAULT_MESSAGE,
        retryable: true,
        cause: error,
      });
    }

    if (isParseError(name)) {
      return buildAppError({
        kind: "parse",
        message: DEFAULT_MESSAGE,
        retryable: false,
        cause: error,
      });
    }

    if (isValidationError(error, name)) {
      return buildAppError({
        kind: "validation",
        message: DEFAULT_MESSAGE,
        retryable: false,
        cause: error,
        details: error,
      });
    }

    const httpFromStatus = fromStatusObject(error, resolvedPolicy);
    if (httpFromStatus) return httpFromStatus;
  } catch {
    // Fall through to default.
  }

  return buildAppError({
    kind: "unknown",
    message: DEFAULT_MESSAGE,
    retryable: false,
    cause: error,
  });
};
