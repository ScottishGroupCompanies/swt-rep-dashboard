import { bearerStatus } from "../../src/auth.js";
import { prepareSnapshot } from "../../src/sales.js";
import { header, readJson, vercel } from "../lib/http.js";
import { storageMode, writeSnapshot } from "../lib/store.js";

export const config = {
  api: { bodyParser: { sizeLimit: "4mb" } },
};

export async function handle(req) {
  if (req.method !== "POST") return { status: 405, body: { error: "Method not allowed." } };
  const auth = bearerStatus(header(req, "authorization"), process.env.DATA_INGEST_TOKEN);
  if (auth) {
    return { status: auth, body: { error: auth === 503 ? "Ingest is not configured." : "Unauthorized." } };
  }
  const length = Number(header(req, "content-length") || 0);
  if (length > 4_500_000) return { status: 413, body: { error: "Upload is too large." } };

  if (storageMode() === "unconfigured") return { status: 503, body: { error: "Storage is not configured." } };

  const body = await readJson(req);
  const prepared = prepareSnapshot(body);
  if (!prepared.ok) return { status: 400, body: { error: "Upload was rejected.", errors: prepared.errors } };

  try {
    await writeSnapshot(prepared.snapshot);
  } catch (error) {
    if (error.code === "UNCONFIGURED") return { status: 503, body: { error: "Storage is not configured." } };
    return { status: 502, body: { error: "Sales data could not be saved." } };
  }
  return {
    status: 200,
    body: { ok: true, replaced_at: prepared.snapshot.updated_at, counts: prepared.counts },
  };
}

export default vercel(handle);
