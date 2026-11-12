import { createHmac, timingSafeEqual } from "node:crypto";
import { header } from "./http.js";

const COOKIE = "sgc_session";
const MAX_AGE = 12 * 60 * 60;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    const error = new Error("SESSION_SECRET is not set");
    error.code = "UNCONFIGURED";
    throw error;
  }
  return value;
}

export function createSession(login) {
  const body = Buffer.from(
    JSON.stringify({
      name: login.name,
      role: login.role,
      rep: login.rep,
      exp: Date.now() + MAX_AGE * 1000,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function readToken(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const [body, sig] = String(token).split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const actual = Buffer.from(sig);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!data?.exp || data.exp < Date.now()) return null;
    if (data.role !== "admin" && data.role !== "rep") return null;
    if (data.role === "rep" && !data.rep) return null;
    return { name: data.name, role: data.role, rep: data.rep || null };
  } catch {
    return null;
  }
}

export function tokenFromRequest(req) {
  const raw = header(req, "cookie");
  const match = raw.match(/(?:^|;\s*)sgc_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function readSession(req) {
  return readToken(tokenFromRequest(req));
}

export function sessionCookie(token, { secure }) {
  const parts = [`${COOKIE}=${token}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${MAX_AGE}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie({ secure }) {
  const parts = [`${COOKIE}=`, "HttpOnly", "SameSite=Lax", "Path=/", "Max-Age=0"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function requestIsSecure(req) {
  if (process.env.VERCEL === "1") return true;
  const proto = header(req, "x-forwarded-proto");
  return proto.split(",")[0].trim() === "https";
}
