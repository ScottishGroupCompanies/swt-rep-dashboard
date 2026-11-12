import { findLogin, verifyCode } from "../../src/auth.js";
import { clientIp, readJson, vercel } from "../lib/http.js";
import { clearFailures, isLimited, recordFailure } from "../lib/ratelimit.js";
import { createSession, requestIsSecure, sessionCookie } from "../lib/session.js";

export async function handle(req) {
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed." } };
  const body = await readJson(req);
  const name = String(body?.name ?? "").trim();
  const code = String(body?.code ?? "").trim();
  const ip = clientIp(req);
  const keys = [ip, `${ip}:${name.toLowerCase()}`];
  if (keys.some((key) => isLimited(key))) {
    return { status: 429, body: { error: "Too many attempts. Try again later." } };
  }

  let login = null;
  try {
    login = findLogin(name);
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Sign-in is not configured." } };
    throw error;
  }

  const valid = login ? verifyCode(code, login.codeHash) : verifyCode(code, dummyHash());
  if (!login || !valid) {
    for (const key of keys) recordFailure(key);
    return { status: 401, body: { error: "That name or code is not valid." } };
  }

  let token;
  try {
    token = createSession(login);
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Sign-in is not configured." } };
    throw error;
  }
  for (const key of keys) clearFailures(key);
  return {
    status: 200,
    headers: { "Set-Cookie": sessionCookie(token, { secure: requestIsSecure(req) }) },
    body: { name: login.name, role: login.role },
  };
}

let cachedDummy;
function dummyHash() {
  cachedDummy ||= "scrypt$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  return cachedDummy;
}

export default vercel(handle);
