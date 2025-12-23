import type { HeadersLike, HttpResponseLike } from "../policy.js";

export type AxiosLikeResponse = {
  status?: number;
  statusText?: string;
  data?: unknown;
  headers?: HeadersLike;
};

export type AxiosLikeErrorInfo = {
  response?: AxiosLikeResponse;
  status?: number;
  data?: unknown;
  headers?: HeadersLike;
  code?: string;
  message?: string;
  isTimeout: boolean;
  isNetworkError: boolean;
};

const TIMEOUT_CODES = new Set(["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"]);
const NETWORK_CODES = new Set([
  "ERR_NETWORK",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const getStatus = (value: unknown): number | undefined =>
  typeof value === "number" ? value : undefined;

const getResponseLike = (value: unknown): AxiosLikeResponse | undefined => {
  if (!isRecord(value)) return undefined;

  const status = getStatus(value.status);
  const statusText = getString(value.statusText);
  const headers = value.headers as HeadersLike | undefined;

  return {
    ...(status !== undefined ? { status } : {}),
    ...(statusText ? { statusText } : {}),
    ...(value.data !== undefined ? { data: value.data } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
};

export const getAxiosLikeErrorInfo = (
  error: unknown
): AxiosLikeErrorInfo | null => {
  if (!isRecord(error)) return null;

  const isAxiosMarker = error.isAxiosError === true;
  const response = getResponseLike(error.response);
  const request = error.request;

  const looksAxios = isAxiosMarker || response !== undefined || request !== undefined;
  if (!looksAxios) return null;

  const code = getString(error.code);
  const message = getString(error.message);
  const status = response?.status;
  const data = response?.data;
  const headers = response?.headers;

  const messageLower = message?.toLowerCase();
  const isTimeout =
    (code ? TIMEOUT_CODES.has(code) : false) ||
    (messageLower ? messageLower.includes("timeout") : false);

  const isNetworkError =
    !response &&
    (request !== undefined ||
      (code ? NETWORK_CODES.has(code) : false) ||
      (messageLower ? messageLower.includes("network error") : false));

  return {
    isTimeout,
    isNetworkError,
    ...(response ? { response } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(data !== undefined ? { data } : {}),
    ...(headers !== undefined ? { headers } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
  };
};

export const isAxiosLikeError = (error: unknown): boolean =>
  getAxiosLikeErrorInfo(error) !== null;

export const toHttpResponseLike = (
  info: AxiosLikeErrorInfo
): HttpResponseLike | undefined => {
  if (!info.response) return undefined;
  const statusText = info.response.statusText;
  const headers = info.headers;
  return {
    ...(info.status !== undefined ? { status: info.status } : {}),
    ...(statusText ? { statusText } : {}),
    ...(headers !== undefined ? { headers } : {}),
  };
};
