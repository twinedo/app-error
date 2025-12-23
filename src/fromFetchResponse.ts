import { fromFetch, type FetchResponseLike } from "./fromFetch.js";
import { type ErrorPolicy } from "./policy.js";
import { type AppError } from "./types.js";

export type FetchResponseWithBody = FetchResponseLike & {
  text?: () => Promise<string>;
  bodyUsed?: boolean;
};

const readResponseBody = async (
  response: FetchResponseWithBody
): Promise<unknown | undefined> => {
  const reader = response.text;
  if (typeof reader !== "function") return undefined;
  if (response.bodyUsed) return undefined;

  let text: string;
  try {
    text = await reader.call(response);
  } catch {
    return undefined;
  }

  if (text.trim().length === 0) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export const fromFetchResponse = async (
  response: FetchResponseWithBody,
  policy?: ErrorPolicy
): Promise<AppError> => {
  const safeResponse = response ?? ({} as FetchResponseWithBody);

  try {
    const body = await readResponseBody(safeResponse);
    return fromFetch(safeResponse, body, policy);
  } catch {
    return fromFetch(safeResponse, undefined, policy);
  }
};
