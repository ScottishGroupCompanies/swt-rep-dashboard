import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { isExcludedRep } from "./reps.js";

const HASH_BYTES = 32;

export function hashCode(code) {
  const salt = randomBytes(16).toString("base64url");
  const hash = scryptSync(String(code), salt, HASH_BYTES).toString("base64url");
  return `scrypt$${salt}$${hash}`;
}

export function verifyCode(code, stored) {
  const [kind, salt, hash] = String(stored ?? "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const actual = scryptSync(String(code), salt, HASH_BYTES);
  let expected;
  try {
    expected = Buffer.from(hash, "base64url");
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function validHash(value) {
  return /^scrypt\$[^$]+\$[^$]+$/.test(String(value ?? ""));
}

function normalizeLogin(name, value) {
  const label = String(name ?? "").trim();
  if (!label || !value || typeof value !== "object" || Array.isArray(value)) return null;
  if (isExcludedRep(label)) return null;
  if (!validHash(value.codeHash)) return null;
  if (value.role === "admin") return { name: label, role: "admin", rep: null, codeHash: value.codeHash };
  if (value.role !== "rep") return null;
  const rep = String(value.rep ?? "").trim();
  if (!rep || isExcludedRep(rep)) return null;
  return { name: label, role: "rep", rep, codeHash: value.codeHash };
}

export function loadLogins() {
  const raw = process.env.DASHBOARD_LOGINS;
  if (!raw || !raw.trim()) {
    const error = new Error("DASHBOARD_LOGINS is not set");
    error.code = "UNCONFIGURED";
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const error = new Error("DASHBOARD_LOGINS is not valid JSON");
    error.code = "UNCONFIGURED";
    throw error;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("DASHBOARD_LOGINS must be an object");
    error.code = "UNCONFIGURED";
    throw error;
  }
  const logins = [];
  for (const [name, value] of Object.entries(parsed)) {
    const login = normalizeLogin(name, value);
    if (login) logins.push(login);
  }
  return logins;
}

export function listLoginNames() {
  return loadLogins()
    .map((login) => login.name)
    .sort((a, b) => a.localeCompare(b));
}

export function findLogin(name) {
  const label = String(name ?? "").trim();
  return loadLogins().find((login) => login.name === label) || null;
}

export function bearerStatus(header, secret) {
  if (!secret) return 503;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(String(header ?? ""));
  if (!match) return 401;
  const got = createHash("sha256").update(match[1]).digest();
  const want = createHash("sha256").update(String(secret)).digest();
  if (!timingSafeEqual(got, want)) return 401;
  return null;
}
