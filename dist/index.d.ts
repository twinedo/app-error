type AppErrorKind = "http" | "network" | "timeout" | "parse" | "validation" | "unknown";
type AppError = {
    kind: AppErrorKind;
    message: string;
    status?: number;
    code?: string;
    retryable?: boolean;
    requestId?: string;
    details?: unknown;
    cause?: unknown;
};
declare const isAppError: (value: unknown) => value is AppError;

type HeadersLike = Record<string, string | string[] | number | undefined> | {
    get(name: string): string | null | undefined;
} | undefined;
type HttpResponseLike = {
    status?: number;
    statusText?: string;
    headers?: HeadersLike;
};
type HttpPolicy = {
    message: (data: unknown, response?: HttpResponseLike) => string | undefined;
    code: (data: unknown, response?: HttpResponseLike) => string | undefined;
    requestId: (headers?: HeadersLike) => string | undefined;
    retryable: (status?: number) => boolean;
};
type ErrorPolicy = {
    http?: Partial<HttpPolicy>;
};
type NormalizedErrorPolicy = {
    http: HttpPolicy;
};
declare const defineErrorPolicy: (...configs: Array<ErrorPolicy | undefined>) => NormalizedErrorPolicy;

type FetchResponseLike = {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: HeadersLike;
};
declare const fromFetch: (response: FetchResponseLike, body?: unknown, policy?: ErrorPolicy) => AppError;

declare const toAppError: (error: unknown, policy?: ErrorPolicy) => AppError;

type AttemptResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: AppError;
};

declare const errorKey: (error: AppError | unknown) => string;
declare const isRetryable: (error: AppError | unknown) => boolean;
declare const attempt: <T>(fn: () => T | Promise<T>, policy?: ErrorPolicy) => Promise<AttemptResult<T>>;

export { type AppError, type AppErrorKind, type ErrorPolicy, type HeadersLike, type HttpPolicy, type HttpResponseLike, type NormalizedErrorPolicy, attempt, defineErrorPolicy, errorKey, fromFetch, isAppError, isRetryable, toAppError };
