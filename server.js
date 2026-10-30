/*
 * Static file server + Halo ITSM submission endpoint. Node 18+, no dependencies.
 *
 *   node server.js
 *
 * Config (environment variables):
 *   HALO_BASE_URL         e.g. https://yourtenant.haloitsm.com   (required to enable submit)
 *   HALO_CLIENT_ID        API application client ID (client-credentials)
 *   HALO_CLIENT_SECRET    API application secret
 *   HALO_TICKETTYPE_ID    ticket type for these requests
 *   HALO_TICKET_CLIENT_ID Halo "client" (customer) the ticket is logged against
 *   HALO_AUTH_URL         optional; defaults to ${HALO_BASE_URL}/auth/token
 *   HALO_PRIORITY_IDS     optional JSON, e.g. {"standard":4,"elevated":3,"high":2,"blocked":2}
 *   HALO_EXTRA_FIELDS     optional JSON merged into the ticket (category, team, custom fields...)
 *   HALO_DRY_RUN=1        log the ticket payload instead of calling Halo
 *   PORT                  default 8000
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const engine = require("./engine.js");
const POLICY = require("./policy.js");
const COUNTRIES = require("./countries.js");
const { buildTicket } = require("./ticket.js");

const env = process.env;
const json = (name) => { try { return env[name] ? JSON.parse(env[name]) : {}; } catch { throw new Error(`${name} is not valid JSON`); } };

const cfg = {
  baseUrl: (env.HALO_BASE_URL || "").replace(/\/$/, ""),
  authUrl: env.HALO_AUTH_URL,
  clientIdAuth: env.HALO_CLIENT_ID,
  secret: env.HALO_CLIENT_SECRET,
  ticketTypeId: env.HALO_TICKETTYPE_ID ? Number(env.HALO_TICKETTYPE_ID) : undefined,
  clientId: env.HALO_TICKET_CLIENT_ID ? Number(env.HALO_TICKET_CLIENT_ID) : undefined,
  priorityIds: json("HALO_PRIORITY_IDS"),
  extraFields: json("HALO_EXTRA_FIELDS"),
  dryRun: env.HALO_DRY_RUN === "1",
};
const haloEnabled = cfg.dryRun || !!(cfg.baseUrl && cfg.clientIdAuth && cfg.secret && cfg.ticketTypeId && cfg.clientId);

// ---------- Halo client ----------
let token = null; // { value, expires }

async function getToken() {
  if (token && token.expires > Date.now() + 30000) return token.value;
  const res = await fetch(cfg.authUrl || `${cfg.baseUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: cfg.clientIdAuth, client_secret: cfg.secret, scope: "all" }),
  });
  if (!res.ok) throw new Error(`Halo auth failed (${res.status})`);
  const body = await res.json();
  token = { value: body.access_token, expires: Date.now() + (body.expires_in || 3600) * 1000 };
  return token.value;
}

async function createHaloTicket(ticket) {
  if (cfg.dryRun) { console.log("[dry run] ticket:", JSON.stringify(ticket, null, 2)); return { id: "DRY-RUN" }; }
  const res = await fetch(`${cfg.baseUrl}/api/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
    body: JSON.stringify([ticket]), // Halo's POST endpoints take an array
  });
  if (!res.ok) {
    console.error("Halo ticket create failed:", res.status, (await res.text()).slice(0, 500));
    throw new Error(`Halo rejected the ticket (${res.status})`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body[0] : body;
}

// ---------- HTTP ----------
const STATIC = {
  "/": "index.html", "/index.html": "index.html", "/styles.css": "styles.css", "/app.js": "app.js",
  "/engine.js": "engine.js", "/policy.js": "policy.js", "/countries.js": "countries.js",
};
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript" };

const hits = new Map(); // ip -> [timestamps]; crude limiter, 10 submits / 10 min
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 600000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 10;
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 50000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function sanitizeInput(raw) {
  const a = raw.access || {};
  return {
    legs: (Array.isArray(raw.legs) ? raw.legs : []).slice(0, 20).map((l) => ({ country: str(l?.country, 80), start: str(l?.start, 10), end: str(l?.end, 10) })),
    access: {
      vm: a.vm === true, saas: a.saas === true, other: a.other === true,
      apps: (Array.isArray(a.apps) ? a.apps : []).filter((x) => POLICY.apps[x]),
      otherText: str(a.otherText, 600),
    },
    sensitive: ["yes", "no", "unsure", ""].includes(raw.sensitive) ? raw.sensitive : "",
  };
}

async function handleSubmit(req, res) {
  if (!haloEnabled) return send(res, 503, { error: "Ticket submission is not configured." });
  if (limited(req.socket.remoteAddress)) return send(res, 429, { error: "Too many requests. Try again later." });

  let raw;
  try { raw = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: "Invalid request." }); }

  const requester = { name: str(raw.requester?.name, 120), email: str(raw.requester?.email, 200) };
  if (!requester.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requester.email))
    return send(res, 400, { error: "Enter your name and a valid email address." });

  // Re-evaluate server-side: ticket content never comes from the browser.
  const input = sanitizeInput(raw);
  const result = engine.evaluate(input, POLICY, COUNTRIES);
  if (result.errors.length) return send(res, 400, { error: result.errors[0].message });

  try {
    const { ticket } = buildTicket(result, input, requester, cfg, POLICY);
    const created = await createHaloTicket(ticket);
    send(res, 200, { id: created.id, url: cfg.baseUrl && created.id ? `${cfg.baseUrl}/tickets?id=${created.id}` : null });
  } catch (e) {
    console.error(e);
    send(res, 502, { error: "Could not create the ticket. Please contact the IT Service Desk." });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x").pathname;
  if (req.method === "GET" && url === "/api/config") return send(res, 200, { submitEnabled: haloEnabled });
  if (req.method === "POST" && url === "/api/submit") return handleSubmit(req, res);
  if (req.method === "GET" && STATIC[url]) {
    const file = STATIC[url];
    return send(res, 200, fs.readFileSync(path.join(__dirname, file)), TYPES[path.extname(file)]);
  }
  send(res, 404, { error: "Not found" });
});

if (require.main === module) {
  server.listen(env.PORT || 8000, () => console.log(`Travel Access Check on :${env.PORT || 8000} — Halo submit ${haloEnabled ? (cfg.dryRun ? "DRY RUN" : "enabled") : "disabled"}`));
}
module.exports = server;
