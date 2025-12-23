import {
  defineErrorPolicy,
  type ErrorPolicy,
  type HeadersLike,
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

  const message =
    normalizeMessage(
      safeInvoke(() => resolvedPolicy.http.message(body, response))
    ) ?? DEFAULT_MESSAGE;

  const code = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.code(body, response))
  );

  const requestId = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.requestId(response.headers))
  );

  const retryable =
    safeInvoke(() => resolvedPolicy.http.retryable(status)) ??
    defaultRetryable(status);

  return {
    kind: "http",
    message,
    retryable,
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
    ...(requestId ? { requestId } : {}),
    ...(body !== undefined ? { details: body } : {}),
    ...(response !== undefined ? { cause: response } : {}),
  };
};
