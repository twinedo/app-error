export type HeadersLike =
  | Record<string, string | string[] | number | undefined>
  | { get(name: string): string | null | undefined }
  | undefined;

export type HttpResponseLike = {
  status?: number;
  statusText?: string;
  headers?: HeadersLike;
};

export type HttpPolicy = {
  message: (data: unknown, response?: HttpResponseLike) => string | undefined;
  code: (data: unknown, response?: HttpResponseLike) => string | undefined;
  requestId: (headers?: HeadersLike) => string | undefined;
  retryable: (status?: number) => boolean;
  suggestion: (status?: number, data?: unknown, response?: HttpResponseLike) => string | undefined;
};

export type ErrorPolicy = {
  http?: Partial<HttpPolicy>;
};

export type NormalizedErrorPolicy = {
  http: HttpPolicy;
};

const DEFAULT_REQUEST_ID_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-trace-id",
  "traceparent",
  "x-amzn-trace-id",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeHeaderValue = (value: unknown): string | undefined => {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return undefined;
};

const getHeaderValue = (headers: HeadersLike, name: string): string | undefined => {
  if (!headers) return undefined;
  const lowerName = name.toLowerCase();

  const getter = (headers as { get?: (key: string) => string | null | undefined })
    .get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name) ?? getter.call(headers, lowerName);
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }

  if (isRecord(headers)) {
    const recordHeaders = headers as Record<
      string,
      string | string[] | number | undefined
    >;
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() !== lowerName) continue;
      const raw = recordHeaders[key];
      if (Array.isArray(raw)) {
        const first = normalizeHeaderValue(raw[0]);
        const normalized = normalizeString(first);
        if (normalized) return normalized;
      } else {
        const normalized = normalizeString(normalizeHeaderValue(raw));
        if (normalized) return normalized;
      }
    }
  }

  return undefined;
};

const extractString = (value: unknown): string | undefined =>
  normalizeString(value);

const extractFromArray = (value: unknown[]): string | undefined => {
  for (const item of value) {
    const message = extractMessageFromData(item);
    if (message) return message;
  }
  return undefined;
};

const extractMessageFromData = (data: unknown): string | undefined => {
  const direct = extractString(data);
  if (direct) return direct;

  if (Array.isArray(data)) return extractFromArray(data);
  if (!isRecord(data)) return undefined;

  const directKeys = ["message", "error", "detail", "title", "description"];
  for (const key of directKeys) {
    const value = extractString(data[key]);
    if (value) return value;
  }

  const errorValue = data.error;
  if (isRecord(errorValue)) {
    const nested = extractString(errorValue.message) ?? extractString(errorValue.detail);
    if (nested) return nested;
  }

  const errorsValue = data.errors;
  if (Array.isArray(errorsValue)) {
    const nested = extractFromArray(errorsValue);
    if (nested) return nested;
  }

  if (isRecord(errorsValue)) {
    for (const key of Object.keys(errorsValue)) {
      const fieldValue = errorsValue[key];
      if (Array.isArray(fieldValue)) {
        const nested = extractFromArray(fieldValue);
        if (nested) return nested;
      } else {
        const nested = extractString(fieldValue);
        if (nested) return nested;
      }
    }
  }

  return undefined;
};

const extractCodeFromData = (data: unknown): string | undefined => {
  if (Array.isArray(data)) {
    for (const item of data) {
      const code = extractCodeFromData(item);
      if (code) return code;
    }
    return undefined;
  }

  if (!isRecord(data)) return undefined;

  const directKeys = ["code", "errorCode", "error_code"];
  for (const key of directKeys) {
    const value = extractString(data[key]);
    if (value) return value;
  }

  const errorValue = data.error;
  if (isRecord(errorValue)) {
    const nested = extractString(errorValue.code) ?? extractString(errorValue.errorCode);
    if (nested) return nested;
  }

  return undefined;
};

const defaultHttpMessage = (data: unknown, response?: HttpResponseLike) => {
  const fromData = extractMessageFromData(data);
  if (fromData) return fromData;
  return extractString(response?.statusText);
};

const defaultHttpCode = (data: unknown) => extractCodeFromData(data);

const defaultRequestId = (headers?: HeadersLike) => {
  for (const header of DEFAULT_REQUEST_ID_HEADERS) {
    const value = getHeaderValue(headers, header);
    if (value) return value;
  }
  return undefined;
};

const defaultHttpRetryable = (status?: number) => {
  if (typeof status !== "number") return false;
  return status >= 500 && status <= 599;
};

const DEFAULT_HTTP_SUGGESTIONS: Record<number, string> = {
  400: "Please review your request and ensure all fields are correct.",
  401: "Please ensure you have valid credentials and try again.",
  403: "You do not have permission to perform this action.",
  404: "The requested resource could not be found. Please verify your request.",
  408: "The request took too long. Please try again shortly.",
  409: "A conflict occurred. Please refresh and try again.",
  422: "Some of the provided data is invalid. Please review your input.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "An internal server error occurred. Please try again later or contact support.",
  502: "The server received an invalid response. Please try again later.",
  503: "The service is temporarily unavailable. Please try again later.",
  504: "The server did not respond in time. Please try again later.",
};

const defaultHttpSuggestion = (status?: number): string | undefined => {
  if (typeof status !== "number") return undefined;
  return DEFAULT_HTTP_SUGGESTIONS[status];
};

const DEFAULT_HTTP_POLICY: HttpPolicy = {
  message: defaultHttpMessage,
  code: defaultHttpCode,
  requestId: defaultRequestId,
  retryable: defaultHttpRetryable,
  suggestion: defaultHttpSuggestion,
};

export const defineErrorPolicy = (
  ...configs: Array<ErrorPolicy | undefined>
): NormalizedErrorPolicy => {
  const merged: Partial<HttpPolicy> = {};

  for (const config of configs) {
    if (!config?.http) continue;
    Object.assign(merged, config.http);
  }

  return {
    http: {
      message: merged.message ?? DEFAULT_HTTP_POLICY.message,
      code: merged.code ?? DEFAULT_HTTP_POLICY.code,
      requestId: merged.requestId ?? DEFAULT_HTTP_POLICY.requestId,
      retryable: merged.retryable ?? DEFAULT_HTTP_POLICY.retryable,
      suggestion: merged.suggestion ?? DEFAULT_HTTP_POLICY.suggestion,
    },
  };
};
