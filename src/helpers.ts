import { type ErrorPolicy } from "./policy.js";
import { toAppError } from "./toAppError.js";
import { type AppError, isAppError } from "./types.js";

export type AttemptResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AppError };

const normalizeMessage = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export { isAppError } from "./types.js";

export const errorKey = (error: AppError | unknown): string => {
  const normalized = isAppError(error) ? error : toAppError(error);
  const parts = [
    normalized.kind,
    normalized.status !== undefined ? String(normalized.status) : undefined,
    normalizeMessage(normalized.code),
    normalizeMessage(normalized.message),
  ].filter((value): value is string => Boolean(value));

  return parts.join("|");
};

export const isRetryable = (error: AppError | unknown): boolean => {
  const normalized = isAppError(error) ? error : toAppError(error);
  if (typeof normalized.retryable === "boolean") return normalized.retryable;

  if (normalized.kind === "network") return true;
  if (normalized.kind === "http") {
    return typeof normalized.status === "number" && normalized.status >= 500;
  }

  return false;
};

export const attempt = async <T>(
  fn: () => T | Promise<T>,
  policy?: ErrorPolicy
): Promise<AttemptResult<T>> => {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toAppError(error, policy) };
  }
};
