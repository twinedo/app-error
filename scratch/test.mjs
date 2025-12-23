import { toAppError, defineErrorPolicy } from "../dist/index.js";

const policy = defineErrorPolicy({
  http: {
    message: (data) => data?.message,
    code: (data) => data?.code
  }
});

console.log(toAppError(new Error("boom"), policy));
console.log(toAppError("string error", policy));
console.log(toAppError({ status: 500, message: "server" }, policy));
console.log(toAppError({ name: "AbortError", message: "The operation was aborted." }));
console.log(toAppError({ code: "ETIMEDOUT", message: "timeout" }));
console.log(toAppError({ code: "ENOTFOUND", message: "dns" }));
