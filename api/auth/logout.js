import { vercel } from "../lib/http.js";
import { clearCookie, requestIsSecure } from "../lib/session.js";

export async function handle(req) {
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed." } };
  return {
    status: 200,
    headers: { "Set-Cookie": clearCookie({ secure: requestIsSecure(req) }) },
    body: { ok: true },
  };
}

export default vercel(handle);
