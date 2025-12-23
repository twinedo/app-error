// src/policy.ts
var DEFAULT_REQUEST_ID_HEADERS = [
  "x-request-id",
  "x-correlation-id",
  "x-trace-id",
  "traceparent",
  "x-amzn-trace-id"
];
var isRecord = (value) => typeof value === "object" && value !== null;
var normalizeString = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
};
var normalizeHeaderValue = (value) => {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return void 0;
};
var getHeaderValue = (headers, name) => {
  if (!headers) return void 0;
  const lowerName = name.toLowerCase();
  const getter = headers.get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name) ?? getter.call(headers, lowerName);
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  if (isRecord(headers)) {
    const recordHeaders = headers;
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
  return void 0;
};
var extractString = (value) => normalizeString(value);
var extractFromArray = (value) => {
  for (const item of value) {
    const message = extractMessageFromData(item);
    if (message) return message;
  }
  return void 0;
};
var extractMessageFromData = (data) => {
  const direct = extractString(data);
  if (direct) return direct;
  if (Array.isArray(data)) return extractFromArray(data);
  if (!isRecord(data)) return void 0;
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
  return void 0;
};
var extractCodeFromData = (data) => {
  if (Array.isArray(data)) {
    for (const item of data) {
      const code = extractCodeFromData(item);
      if (code) return code;
    }
    return void 0;
  }
  if (!isRecord(data)) return void 0;
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
  return void 0;
};
var defaultHttpMessage = (data, response) => {
  const fromData = extractMessageFromData(data);
  if (fromData) return fromData;
  return extractString(response?.statusText);
};
var defaultHttpCode = (data) => extractCodeFromData(data);
var defaultRequestId = (headers) => {
  for (const header of DEFAULT_REQUEST_ID_HEADERS) {
    const value = getHeaderValue(headers, header);
    if (value) return value;
  }
  return void 0;
};
var defaultHttpRetryable = (status) => {
  if (typeof status !== "number") return false;
  return status >= 500 && status <= 599;
};
var DEFAULT_HTTP_POLICY = {
  message: defaultHttpMessage,
  code: defaultHttpCode,
  requestId: defaultRequestId,
  retryable: defaultHttpRetryable
};
var defineErrorPolicy = (...configs) => {
  const merged = {};
  for (const config of configs) {
    if (!config?.http) continue;
    Object.assign(merged, config.http);
  }
  return {
    http: {
      message: merged.message ?? DEFAULT_HTTP_POLICY.message,
      code: merged.code ?? DEFAULT_HTTP_POLICY.code,
      requestId: merged.requestId ?? DEFAULT_HTTP_POLICY.requestId,
      retryable: merged.retryable ?? DEFAULT_HTTP_POLICY.retryable
    }
  };
};

// src/types.ts
var APP_ERROR_KINDS = {
  http: true,
  network: true,
  timeout: true,
  parse: true,
  validation: true,
  unknown: true
};
var isRecord2 = (value) => typeof value === "object" && value !== null;
var isAppError = (value) => {
  if (!isRecord2(value)) return false;
  const kind = value.kind;
  if (typeof kind !== "string" || !(kind in APP_ERROR_KINDS)) return false;
  return typeof value.message === "string";
};

// src/fromFetch.ts
var DEFAULT_MESSAGE = "Something went wrong";
var normalizeMessage = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
};
var defaultRetryable = (status) => {
  if (typeof status !== "number") return false;
  return status >= 500 && status <= 599;
};
var safeInvoke = (fn) => {
  try {
    return fn();
  } catch {
    return void 0;
  }
};
var fromFetch = (response, body, policy) => {
  const resolvedPolicy = defineErrorPolicy(policy);
  const status = typeof response.status === "number" ? response.status : void 0;
  const message = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.message(body, response))
  ) ?? DEFAULT_MESSAGE;
  const code = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.code(body, response))
  );
  const requestId = normalizeMessage(
    safeInvoke(() => resolvedPolicy.http.requestId(response.headers))
  );
  const retryable = safeInvoke(() => resolvedPolicy.http.retryable(status)) ?? defaultRetryable(status);
  return {
    kind: "http",
    message,
    retryable,
    ...status !== void 0 ? { status } : {},
    ...code ? { code } : {},
    ...requestId ? { requestId } : {},
    ...body !== void 0 ? { details: body } : {},
    ...response !== void 0 ? { cause: response } : {}
  };
};

// src/adapters/axiosLike.ts
var TIMEOUT_CODES = /* @__PURE__ */ new Set(["ECONNABORTED", "ETIMEDOUT", "ESOCKETTIMEDOUT"]);
var NETWORK_CODES = /* @__PURE__ */ new Set([
  "ERR_NETWORK",
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH"
]);
var isRecord3 = (value) => typeof value === "object" && value !== null;
var getString = (value) => typeof value === "string" ? value : void 0;
var getStatus = (value) => typeof value === "number" ? value : void 0;
var getResponseLike = (value) => {
  if (!isRecord3(value)) return void 0;
  const status = getStatus(value.status);
  const statusText = getString(value.statusText);
  const headers = value.headers;
  return {
    ...status !== void 0 ? { status } : {},
    ...statusText ? { statusText } : {},
    ...value.data !== void 0 ? { data: value.data } : {},
    ...headers !== void 0 ? { headers } : {}
  };
};
var getAxiosLikeErrorInfo = (error) => {
  if (!isRecord3(error)) return null;
  const isAxiosMarker = error.isAxiosError === true;
  const response = getResponseLike(error.response);
  const request = error.request;
  const looksAxios = isAxiosMarker || response !== void 0 || request !== void 0;
  if (!looksAxios) return null;
  const code = getString(error.code);
  const message = getString(error.message);
  const status = response?.status;
  const data = response?.data;
  const headers = response?.headers;
  const messageLower = message?.toLowerCase();
  const isTimeout = (code ? TIMEOUT_CODES.has(code) : false) || (messageLower ? messageLower.includes("timeout") : false);
  const isNetworkError2 = !response && (request !== void 0 || (code ? NETWORK_CODES.has(code) : false) || (messageLower ? messageLower.includes("network error") : false));
  return {
    isTimeout,
    isNetworkError: isNetworkError2,
    ...response ? { response } : {},
    ...status !== void 0 ? { status } : {},
    ...data !== void 0 ? { data } : {},
    ...headers !== void 0 ? { headers } : {},
    ...code ? { code } : {},
    ...message ? { message } : {}
  };
};
var toHttpResponseLike = (info) => {
  if (!info.response) return void 0;
  const statusText = info.response.statusText;
  const headers = info.headers;
  return {
    ...info.status !== void 0 ? { status: info.status } : {},
    ...statusText ? { statusText } : {},
    ...headers !== void 0 ? { headers } : {}
  };
};

// src/toAppError.ts
var DEFAULT_MESSAGE2 = "Something went wrong";
var NETWORK_ERROR_CODES = /* @__PURE__ */ new Set([
  "ENOTFOUND",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_NETWORK"
]);
var TIMEOUT_ERROR_CODES = /* @__PURE__ */ new Set([
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED"
]);
var isRecord4 = (value) => typeof value === "object" && value !== null;
var getString2 = (value) => typeof value === "string" ? value : void 0;
var normalizeMessage2 = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
};
var defaultRetryable2 = (kind, status) => {
  if (kind === "network") return true;
  if (kind === "http" && typeof status === "number") {
    return status >= 500 && status <= 599;
  }
  return false;
};
var safeInvoke2 = (fn) => {
  try {
    return fn();
  } catch {
    return void 0;
  }
};
var getErrorInfo = (error) => {
  if (!isRecord4(error)) return { name: void 0, message: void 0, code: void 0 };
  return {
    name: getString2(error.name),
    message: getString2(error.message),
    code: getString2(error.code)
  };
};
var isTimeoutError = (name, message, code) => {
  if (name === "AbortError") return true;
  if (code && TIMEOUT_ERROR_CODES.has(code)) return true;
  const lowered = message?.toLowerCase();
  return lowered ? lowered.includes("timeout") : false;
};
var isNetworkError = (name, message, code) => {
  if (name === "TypeError") {
    const lowered2 = message?.toLowerCase() ?? "";
    if (lowered2.includes("failed to fetch") || lowered2.includes("network request failed") || lowered2.includes("networkerror") || lowered2.includes("load failed")) {
      return true;
    }
  }
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const lowered = message?.toLowerCase() ?? "";
  return lowered.includes("network error");
};
var isParseError = (name) => name === "SyntaxError";
var isValidationError = (error, name) => {
  if (name && name.toLowerCase().includes("validation")) return true;
  if (!isRecord4(error)) return false;
  return Array.isArray(error.issues) || Array.isArray(error.errors);
};
var normalizeExisting = (error) => {
  const message = normalizeMessage2(error.message) ?? DEFAULT_MESSAGE2;
  const retryable = typeof error.retryable === "boolean" ? error.retryable : defaultRetryable2(error.kind, error.status);
  return {
    ...error,
    message,
    retryable
  };
};
var buildAppError = (options) => ({
  kind: options.kind,
  message: options.message,
  retryable: options.retryable,
  ...options.status !== void 0 ? { status: options.status } : {},
  ...options.code ? { code: options.code } : {},
  ...options.requestId ? { requestId: options.requestId } : {},
  ...options.details !== void 0 ? { details: options.details } : {},
  ...options.cause !== void 0 ? { cause: options.cause } : {}
});
var fromStatusObject = (error, policy) => {
  if (!isRecord4(error)) return null;
  if (typeof error.status !== "number" || error.status < 400) return null;
  const status = error.status;
  const statusText = getString2(error.statusText);
  const headers = error.headers;
  const response = {
    status,
    ...statusText ? { statusText } : {},
    ...headers !== void 0 ? { headers } : {}
  };
  const details = error.data !== void 0 ? error.data : error.body !== void 0 ? error.body : error.details;
  const message = normalizeMessage2(safeInvoke2(() => policy.http.message(details, response))) ?? DEFAULT_MESSAGE2;
  const code = safeInvoke2(() => policy.http.code(details, response));
  const requestId = safeInvoke2(() => policy.http.requestId(response.headers));
  const retryable = safeInvoke2(() => policy.http.retryable(status)) ?? defaultRetryable2("http", status);
  return buildAppError({
    kind: "http",
    message,
    status,
    code: normalizeMessage2(code),
    retryable,
    requestId: normalizeMessage2(requestId),
    details,
    cause: error
  });
};
var toAppError = (error, policy) => {
  const resolvedPolicy = defineErrorPolicy(policy);
  try {
    if (isAppError(error)) return normalizeExisting(error);
    const axiosInfo = getAxiosLikeErrorInfo(error);
    if (axiosInfo) {
      if (axiosInfo.response) {
        const response = toHttpResponseLike(axiosInfo);
        const message2 = normalizeMessage2(
          safeInvoke2(() => resolvedPolicy.http.message(axiosInfo.data, response))
        ) ?? DEFAULT_MESSAGE2;
        const code2 = safeInvoke2(
          () => resolvedPolicy.http.code(axiosInfo.data, response)
        );
        const requestId = safeInvoke2(
          () => resolvedPolicy.http.requestId(axiosInfo.headers)
        );
        const retryable = safeInvoke2(() => resolvedPolicy.http.retryable(axiosInfo.status)) ?? defaultRetryable2("http", axiosInfo.status);
        return buildAppError({
          kind: "http",
          message: message2,
          status: axiosInfo.status,
          code: normalizeMessage2(code2),
          retryable,
          requestId: normalizeMessage2(requestId),
          details: axiosInfo.data,
          cause: error
        });
      }
      if (axiosInfo.isTimeout) {
        return buildAppError({
          kind: "timeout",
          message: DEFAULT_MESSAGE2,
          retryable: false,
          cause: error
        });
      }
      if (axiosInfo.isNetworkError) {
        return buildAppError({
          kind: "network",
          message: DEFAULT_MESSAGE2,
          retryable: true,
          cause: error
        });
      }
    }
    const { name, message, code } = getErrorInfo(error);
    if (isTimeoutError(name, message, code)) {
      return buildAppError({
        kind: "timeout",
        message: DEFAULT_MESSAGE2,
        retryable: false,
        cause: error
      });
    }
    if (isNetworkError(name, message, code)) {
      return buildAppError({
        kind: "network",
        message: DEFAULT_MESSAGE2,
        retryable: true,
        cause: error
      });
    }
    if (isParseError(name)) {
      return buildAppError({
        kind: "parse",
        message: DEFAULT_MESSAGE2,
        retryable: false,
        cause: error
      });
    }
    if (isValidationError(error, name)) {
      return buildAppError({
        kind: "validation",
        message: DEFAULT_MESSAGE2,
        retryable: false,
        cause: error,
        details: error
      });
    }
    const httpFromStatus = fromStatusObject(error, resolvedPolicy);
    if (httpFromStatus) return httpFromStatus;
  } catch {
  }
  return buildAppError({
    kind: "unknown",
    message: DEFAULT_MESSAGE2,
    retryable: false,
    cause: error
  });
};

// src/helpers.ts
var normalizeMessage3 = (value) => {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
};
var errorKey = (error) => {
  const normalized = isAppError(error) ? error : toAppError(error);
  const parts = [
    normalized.kind,
    normalized.status !== void 0 ? String(normalized.status) : void 0,
    normalizeMessage3(normalized.code),
    normalizeMessage3(normalized.message)
  ].filter((value) => Boolean(value));
  return parts.join("|");
};
var isRetryable = (error) => {
  const normalized = isAppError(error) ? error : toAppError(error);
  if (typeof normalized.retryable === "boolean") return normalized.retryable;
  if (normalized.kind === "network") return true;
  if (normalized.kind === "http") {
    return typeof normalized.status === "number" && normalized.status >= 500;
  }
  return false;
};
var attempt = async (fn, policy) => {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: toAppError(error, policy) };
  }
};
export {
  attempt,
  defineErrorPolicy,
  errorKey,
  fromFetch,
  isAppError,
  isRetryable,
  toAppError
};
