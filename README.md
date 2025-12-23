# @twinedo/app-error

A small, dependency-free error normalization layer that turns any thrown error
(fetch, axios-like, or runtime) into a predictable `AppError` shape. Use it to
standardize UI messaging, retry logic, and logging across mixed stacks.

## Install

```bash
npm install @twinedo/app-error
```

## What problem this solves

Different APIs and HTTP clients emit wildly different error shapes. This library
normalizes them into a single `AppError` so your app can consistently:
- show a safe UI message
- decide whether to retry
- log a stable fingerprint

## Axios example

```ts
import axios from "axios";
import { toAppError } from "@twinedo/app-error";

try {
  await axios.get("/api/user");
} catch (error) {
  const appError = toAppError(error);
  console.log(appError.kind, appError.status, appError.message);
}
```

## Fetch example

```ts
import { fromFetch } from "@twinedo/app-error";

const response = await fetch("/api/user");
const body = await response.json().catch(() => undefined);

if (!response.ok) {
  throw fromFetch(response, body);
}
```

## Project A vs Project B policy configuration

```ts
import { defineErrorPolicy } from "@twinedo/app-error";

const projectAPolicy = defineErrorPolicy({
  http: {
    message: (data) => (typeof data === "object" && data ? data.message : undefined),
    code: (data) => (typeof data === "object" && data ? data.code : undefined),
    requestId: (headers) => headers?.get?.("x-request-id") ?? undefined,
  },
});

const projectBPolicy = defineErrorPolicy({
  http: {
    message: (data) =>
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : undefined,
    code: (data) =>
      typeof data === "object" && data && "errorCode" in data
        ? String((data as { errorCode: unknown }).errorCode)
        : undefined,
    requestId: (headers) => headers?.get?.("x-correlation-id") ?? undefined,
    retryable: (status) => status === 429 || (status ? status >= 500 : false),
  },
});
```

## React / React Native usage

```tsx
import { useEffect, useState } from "react";
import { fromFetch, isRetryable, toAppError } from "@twinedo/app-error";

export function ProfileScreen() {
  const [error, setError] = useState<ReturnType<typeof toAppError> | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch("/api/profile")
      .then(async (response) => {
        const body = await response.json().catch(() => undefined);
        if (!response.ok) throw fromFetch(response, body);
        return body;
      })
      .catch((err) => {
        if (!mounted) return;
        setError(toAppError(err));
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!error) return null;

  return (
    <>
      <Text>{error.message}</Text>
      {isRetryable(error) ? <Button title="Retry" /> : null}
    </>
  );
}
```

## Retry decision example

```ts
import { isRetryable, toAppError } from "@twinedo/app-error";

try {
  await apiCall();
} catch (error) {
  const appError = toAppError(error);
  if (isRetryable(appError)) {
    // show retry action or auto-retry
  }
}
```
