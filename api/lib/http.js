export function send(res, result) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(result.headers || {}),
  };
  res.statusCode = result.status;
  for (const [key, value] of Object.entries(headers)) {
    if (value != null) res.setHeader(key, value);
  }
  res.end(JSON.stringify(result.body ?? {}));
}

export async function readJson(req) {
  try {
    if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
    let raw = "";
    if (typeof req.body === "string") raw = req.body;
    else if (Buffer.isBuffer(req.body)) raw = req.body.toString("utf8");
    else {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      raw = Buffer.concat(chunks).toString("utf8");
    }
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    const error = new Error("invalid json");
    error.status = 400;
    throw error;
  }
}

export function queryOf(req) {
  const source = req.query && typeof req.query === "object" ? req.query : null;
  if (source) {
    return Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
    );
  }
  const url = new URL(req.url || "/", "http://localhost");
  return Object.fromEntries(url.searchParams);
}

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"] || req.headers["X-Forwarded-For"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

export function header(req, name) {
  const value = req.headers[name.toLowerCase()] ?? req.headers[name];
  return Array.isArray(value) ? value[0] : value || "";
}

export function vercel(handle) {
  return async function handler(req, res) {
    try {
      send(res, await handle(req));
    } catch (error) {
      const status = error.status || 500;
      send(res, {
        status,
        body: { error: status === 400 ? "Invalid JSON." : "Something went wrong." },
      });
    }
  };
}
