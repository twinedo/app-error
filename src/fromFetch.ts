import {
  defineErrorPolicy,
  type ErrorPolicy,
  type HeadersLike,
  type HttpResponseLike,
} from "./policy.js";
import { type AppError } from "./types.js";

export type FetchResponseLike = {
  ok?: boolean;
  status?: number;
  statusText?: string;
  headers?: HeadersLike;
};

const DEFAULT_MESSAGE = "Something went wrong";

const normalizeMessage = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const defaultRetryable = (status?: number) => {
  if (typeof status !== "number") return false;
  return status >= 500 && status <= 599;
};

const safeInvoke = <T>(fn: () => T): T | undefined => {
  try {
    return fn();
  } catch {
    return undefined;
  }
};

export const fromFetch = (
  response: FetchResponseLike,
  body?: unknown,
  policy?: ErrorPolicy
): AppError => {
  const resolvedPolicy = defineErrorPolicy(policy);
  const status = typeof response.status === "number" ? response.status : undefined;

  const httpResponse: HttpResponseLike = {
    ...(status !== undefined ? { status } : {}),
    ...(response.statusText ? { statusText: response.statusText } : {}),
    ...(response.headers !== undefined ? { headers: response.headers } : {}),
  };

  const message =
    normalizeMessage(
      safeInvoke(() => resolvedPolicy.http.message(body, httpResponse))
    ) ?? DEFAULT_MESSAGE;

  const code = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.code(body, httpResponse))
  );

  const requestId = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.requestId(response.headers))
  );

  const retryable =
    safeInvoke(() => resolvedPolicy.http.retryable(status)) ??
    defaultRetryable(status);

  const DEFAULT_SUGGESTION = "An unexpected error occurred. Please try again or contact support.";

  const suggestion = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.suggestion(status, body, httpResponse))
  ) ?? DEFAULT_SUGGESTION;

  return {
    kind: "http",
    message,
    retryable,
    suggestion,
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
    ...(body !== undefined ? { details: body } : {}),
    ...(response !== undefined ? { cause: response } : {}),
  };
};
