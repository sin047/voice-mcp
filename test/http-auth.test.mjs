import test from "node:test";
import assert from "node:assert/strict";
import {
  createAccessGuard,
  isAccessAuthorized,
  ACCESS_TOKEN_MIN_LENGTH,
} from "../src/http-auth.mjs";

const TOKEN = "private-drama-test-token-0123456789abcdef";

function runGuard(token, authorization) {
  const headers = {};
  let statusCode = null;
  let body = null;
  let nextCalled = false;
  const req = {
    headers: { authorization },
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  };
  const res = {
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  createAccessGuard({ token })(req, res, () => { nextCalled = true; });
  return { headers, statusCode, body, nextCalled };
}

test("private HTTP guard fails closed when no strong token is configured", () => {
  const result = runGuard("", undefined);
  assert.equal(ACCESS_TOKEN_MIN_LENGTH, 32);
  assert.equal(result.statusCode, 503);
  assert.equal(result.body.error, "Private access is not configured");
  assert.equal(result.nextCalled, false);
  assert.equal(result.headers["cache-control"], "no-store");
});

test("private HTTP guard rejects missing and incorrect credentials", () => {
  for (const authorization of [undefined, "Bearer wrong-token", "Basic !!!"]) {
    const result = runGuard(TOKEN, authorization);
    assert.equal(result.statusCode, 401);
    assert.equal(result.body.error, "Authentication required");
    assert.equal(result.headers["www-authenticate"], 'Basic realm="Shin Private Drama", charset="UTF-8"');
    assert.equal(result.nextCalled, false);
  }
});

test("private HTTP guard accepts Bearer credentials", () => {
  const result = runGuard(TOKEN, `Bearer ${TOKEN}`);
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});

test("private HTTP guard accepts browser Basic Auth credentials", () => {
  const encoded = Buffer.from(`voice-mcp:${TOKEN}`, "utf8").toString("base64");
  const result = runGuard(TOKEN, `Basic ${encoded}`);
  assert.equal(result.nextCalled, true);
  assert.equal(result.statusCode, null);
});

test("authorization parser compares token values and rejects weak configured secrets", () => {
  assert.equal(isAccessAuthorized(`Bearer ${TOKEN}`, TOKEN), true);
  assert.equal(isAccessAuthorized(`Bearer ${TOKEN}x`, TOKEN), false);
  assert.equal(isAccessAuthorized(`Bearer ${TOKEN}`, "too-short"), false);
  assert.equal(isAccessAuthorized("Basic not-base64", TOKEN), false);
});
