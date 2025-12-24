# @twinedo/app-error

Framework-agnostic error normalization for fetch, axios-like clients, and runtime failures.

## Why this exists

Most teams talk to more than one backend.
Each backend returns a different error shape (Project A vs Project B).
fetch and axios surface errors in different ways.
So every project rewrites the same parsing, message, and retry rules.
This library produces one predictable AppError for UI, logging, and retries.

## Features

- Predictable `AppError` shape for UI, logging, and retry logic
- Works with `fetch` responses and axios-like errors
- Configurable per backend via `defineErrorPolicy`
- Framework-agnostic (React, React Native, Vue, Angular, Node)
- TypeScript-first with exported types
- Defensive normalization that never throws
- Retry decision helpers like `isRetryable`
- Zero dependencies

## Guarantees & Non-Goals

### Guarantees
This library guarantees that:

- Every normalization function (`toAppError`, `fromFetch`, `fromFetchResponse`) **never throws**
- You always receive a **predictable `AppError` shape**
- `message` is always safe to display in UI
- Original errors are preserved via `cause` for debugging
- No input error is mutated
- Behavior is deterministic and side-effect free
- Fully TypeScript-friendly with stable public types

### Non-Goals
This library intentionally does NOT:

- Automatically guess backend-specific error schemas
- Perform logging, reporting, or analytics
- Display UI or toast notifications
- Enforce localization or translations
- Replace HTTP clients like fetch or axios
- Hide errors or swallow failures silently

If your project has backend-specific error formats, use
`defineErrorPolicy` to explicitly describe how errors should be interpreted.

## Install

```bash
npm install @twinedo/app-error
```

Published as the scoped package `@twinedo/app-error`. Ships ESM + CJS builds
with TypeScript types and works in Node and browser runtimes.

## Examples

### Example 1 — Axios with try/catch

```ts
import axios from "axios";
import { defineErrorPolicy, isRetryable, toAppError } from "@twinedo/app-error";

const policy = defineErrorPolicy();

try {
  const response = await axios.get<{ id: string; name: string }>("/api/user");
  console.log("User:", response.data.name);
} catch (err) {
  const appError = toAppError(err, policy);
  console.error(appError.message);

  if (isRetryable(appError)) {
    // show a retry action or schedule a retry
  }
}
```

### Example 2 — Fetch handling non-OK responses

```ts
import { defineErrorPolicy, fromFetchResponse, toAppError } from "@twinedo/app-error";

const policy = defineErrorPolicy();

try {
  const res = await fetch("/api/user");

  if (!res.ok) {
    throw await fromFetchResponse(res, policy);
  }

  const data = await res.json();
  console.log("User:", data);
} catch (err) {
  const appError = toAppError(err, policy);
  console.error(appError.message);
}
```

### Example 3 — Project A vs Project B backend policies

```ts
import axios from "axios";
import {
  defineErrorPolicy,
  toAppError,
  fromFetchResponse,
} from "@twinedo/app-error";

// Tony backend: { error: { message, code } }, x-request-id
const policyTony = defineErrorPolicy({
  http: {
    message: (data) => (data as any)?.error?.message,
    code: (data) => (data as any)?.error?.code,
    requestId: (headers) => (headers as any)?.["x-request-id"],
  },
});

// Bobby backend: { message | msg, code }, x-correlation-id
const policyBobby = defineErrorPolicy({
  http: {
    message: (data) => (data as any)?.message ?? (data as any)?.msg,
    code: (data) => (data as any)?.code,
    requestId: (headers) => (headers as any)?.["x-correlation-id"],
  },
});

// One handler for UI/logs
function handleError(err: unknown, policy = policyTony) {
  const e = toAppError(err, policy);
  console.error(e.message, e.code, e.requestId);
}

// Request using axios (Tony backend)
async function loadUserAxios() {
  try {
    await axios.get("/api/user"); // Tony API
  } catch (err) {
    handleError(err, policyTony);
  }
}

// Request using fetch (Bobby backend)
async function loadUserFetch() {
  try {
    const res = await fetch("/api/user"); // Bobby API
    if (!res.ok) throw await fromFetchResponse(res, policyBobby);
  } catch (err) {
    handleError(err, policyBobby);
  }
}
```

### Example 4 — attempt() helper

```ts
import { attempt } from "@twinedo/app-error";

const result = await attempt(() => apiCall());

if (result.ok) {
  console.log("Data:", result.data);
} else {
  console.error(result.error.message);
}
```
