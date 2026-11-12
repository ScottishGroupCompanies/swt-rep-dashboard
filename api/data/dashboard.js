import { buildDashboard } from "../../src/view.js";
import { queryOf, vercel } from "../lib/http.js";
import { readSession } from "../lib/session.js";
import { readSnapshot } from "../lib/store.js";

export async function handle(req) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return { status: 405, body: { error: "Method not allowed." } };
  }
  const session = readSession(req);
  if (!session) return { status: 401, body: { error: "Sign in required." } };

  let snapshot;
  try {
    snapshot = await readSnapshot();
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Storage is not configured." } };
    return { status: 502, body: { error: "Sales data could not be read." } };
  }
  if (!snapshot) {
    return {
      status: 200,
      body: {
        empty: true,
        role: session.role,
        viewer: session.name,
        companies: session.role === "admin" ? [{ id: "SWT", label: "Scottish Window Tinting" }, { id: "SSG", label: "Scottish Stained Glass" }] : [],
        commission: { status: "coming_soon" },
      },
    };
  }
  return buildDashboard(snapshot, session, queryOf(req));
}

export default vercel(handle);
