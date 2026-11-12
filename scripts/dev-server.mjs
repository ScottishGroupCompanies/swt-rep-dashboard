import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import names from "../api/auth/names.js";
import login from "../api/auth/login.js";
import logout from "../api/auth/logout.js";
import session from "../api/auth/session.js";
import dashboard from "../api/data/dashboard.js";
import ingestData from "../api/ingest/data.js";
import ingestCommission from "../api/ingest/commission.js";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "public");
const port = Number(process.env.PORT || 4173);
const routes = {
  "/api/auth/names": names,
  "/api/auth/login": login,
  "/api/auth/logout": logout,
  "/api/auth/session": session,
  "/api/data/dashboard": dashboard,
  "/api/ingest/data": ingestData,
  "/api/ingest/commission": ingestCommission,
};
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const handler = routes[url.pathname];
  if (handler) {
    await handler(req, res);
    return;
  }
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const path = normalize(join(root, requested));
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  try {
    const file = await readFile(path);
    res.setHeader("Content-Type", types[extname(path)] || "application/octet-stream");
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
