import { bearerStatus } from "../../src/auth.js";
import { header, readJson, vercel } from "../lib/http.js";
import { writeCommission } from "../lib/store.js";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

export async function handle(req) {
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed." } };
  const auth = bearerStatus(header(req, "authorization"), process.env.COMMISSION_INGEST_TOKEN);
  if (auth) {
    return { status: auth, body: { error: auth === 503 ? "Ingest is not configured." : "Unauthorized." } };
  }
  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { status: 400, body: { error: "Body must be a JSON object." } };
  }
  try {
    await writeCommission(body);
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Storage is not configured." } };
    return { status: 502, body: { error: "Commission data could not be saved." } };
  }
  return { status: 200, body: { ok: true } };
}

export default vercel(handle);
