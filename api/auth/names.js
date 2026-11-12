import { listLoginNames } from "../../src/auth.js";
import { vercel } from "../lib/http.js";

export async function handle(req) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  try {
    return { status: 200, body: { names: listLoginNames() } };
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Sign-in is not configured." } };
    throw error;
  }
}

export default vercel(handle);
