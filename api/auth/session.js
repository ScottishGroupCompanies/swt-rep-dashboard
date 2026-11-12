import { vercel } from "../lib/http.js";
import { readSession } from "../lib/session.js";

export async function handle(req) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  const session = readSession(req);
  if (!session) return { status: 401, body: { error: "Sign in required." } };
  return { status: 200, body: { name: session.name, role: session.role } };
}

export default vercel(handle);
