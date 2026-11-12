import { get, put } from "@vercel/blob";

const SALES_PATH = "sgc/sales-snapshot.json";
const COMMISSION_PATH = "sgc/commission.json";

const memory = {
  snapshot: null,
  commission: null,
};

export function storageMode() {
  if (process.env.DATA_STORE === "memory") return "memory";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return "unconfigured";
}

export function resetMemoryStore() {
  memory.snapshot = null;
  memory.commission = null;
}

function unconfigured() {
  const error = new Error("Storage is not configured");
  error.code = "UNCONFIGURED";
  throw error;
}

async function readBlob(pathname) {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch (error) {
    if (error?.name === "BlobNotFoundError") return null;
    throw error;
  }
}

async function writeBlob(pathname, value) {
  await put(pathname, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

export async function readSnapshot() {
  if (storageMode() === "memory") return memory.snapshot;
  if (storageMode() !== "blob") unconfigured();
  return readBlob(SALES_PATH);
}

export async function writeSnapshot(snapshot) {
  if (storageMode() === "memory") {
    memory.snapshot = snapshot;
    return;
  }
  if (storageMode() !== "blob") unconfigured();
  await writeBlob(SALES_PATH, snapshot);
}

export async function writeCommission(payload) {
  const stored = { updated_at: new Date().toISOString(), payload };
  if (storageMode() === "memory") {
    memory.commission = stored;
    return;
  }
  if (storageMode() !== "blob") unconfigured();
  await writeBlob(COMMISSION_PATH, stored);
}

export function memoryCommission() {
  return memory.commission;
}
