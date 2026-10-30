import { createHash, timingSafeEqual } from "node:crypto";

const MIN_TOKEN_LENGTH = 32;

function extractCredential(authorization) {
  if (typeof authorization !== "string") return null;
  const value = authorization.trim();

  const bearer = /^Bearer\s+(.+)$/i.exec(value);
  if (bearer) return Buffer.from(bearer[1], "utf8");

  const basic = /^Basic\s+([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!basic) return null;

  const encoded = basic[1];
  const decoded = Buffer.from(encoded, "base64");
  if (decoded.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    return null;
  }

  const separator = decoded.indexOf(0x3a);
  if (separator < 1) return null;
  return decoded.subarray(separator + 1);
}

function matchesToken(candidate, expected) {
  if (!candidate || typeof expected !== "string") return false;
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function isAccessAuthorized(authorization, expectedToken) {
  if (typeof expectedToken !== "string" || expectedToken.length < MIN_TOKEN_LENGTH) {
    return false;
  }
  return matchesToken(extractCredential(authorization), expectedToken);
}

/**
 * Fail-closed HTTP guard for private preview routes.
 * Browsers can authenticate with Basic Auth; scripts may use Bearer tokens.
 */
export function createAccessGuard({ token, realm = "Shin Private Drama" } = {}) {
  const configured = typeof token === "string" && token.length >= MIN_TOKEN_LENGTH;
  const safeRealm = String(realm).replace(/[^a-zA-Z0-9 ._-]/g, "").slice(0, 64) || "Private";

  return (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");

    if (!configured) {
      return res.status(503).json({ error: "Private access is not configured" });
    }

    const authorization = typeof req.get === "function"
      ? req.get("authorization")
      : req.headers?.authorization;

    if (isAccessAuthorized(authorization, token)) return next();

    res.setHeader("WWW-Authenticate", `Basic realm="${safeRealm}", charset="UTF-8"`);
    return res.status(401).json({ error: "Authentication required" });
  };
}

export const ACCESS_TOKEN_MIN_LENGTH = MIN_TOKEN_LENGTH;
