/**
 * SVN 테이블 편집 보드 — Cloudflare Worker (로직 소스)
 *
 * ※ 이 파일 + index.html 을 build.py 로 합쳐 최종 _worker.js 를 만듭니다.
 *
 * 바인딩/환경변수 (Cloudflare Pages 설정):
 *   - D1 바인딩:  DB
 *   - 변수:       GOOGLE_CLIENT_ID, ALLOWED_DOMAIN, ADMIN_EMAILS(관리자 이메일들, 콤마구분)
 *   - 시크릿:     KAKAOWORK_WEBHOOK_URL, SESSION_SECRET, SYNC_TOKEN(동기화 스크립트용, 선택)
 */

const enc = new TextEncoder();

const INDEX_HTML = __HTML__;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/public-config") return json({ google_client_id: env.GOOGLE_CLIENT_ID || "" });
      if (path === "/api/auth/google" && request.method === "POST") return authGoogle(request, env, url);
      if (path === "/api/logout") return logout(url);
      if (path === "/api/me") return apiMe(request, env);
      // 사내 동기화 스크립트용(사용자 로그인 아님, SYNC_TOKEN 으로 인증)
      if (path === "/api/tables/sync" && request.method === "POST") return apiTablesSync(request, env);

      if (path.startsWith("/api/")) {
        const user = await getUser(request, env);
        if (!user) return json({ ok: false, error: "인증이 필요합니다." }, 401);
        const admin = isAdmin(env, user);

        if (path === "/api/status") return apiStatus(env, url);
        if (path === "/api/start" && request.method === "POST") return apiStart(request, env, user, url);
        if (path === "/api/finish" && request.method === "POST") return apiFinish(request, env, user, url, admin);
        if (path === "/api/config" && request.method === "GET") return apiGetConfig(env);

        // ---- 관리자 전용 ----
        if (path === "/api/config" && request.method === "POST") {
          if (!admin) return json({ ok: false, error: "관리자만 변경할 수 있습니다." }, 403);
          return apiSetConfig(request, env);
        }
        if (path === "/api/tables/add" && request.method === "POST") {
          if (!admin) return json({ ok: false, error: "관리자만 변경할 수 있습니다." }, 403);
          return apiTableAdd(request, env);
        }
        if (path === "/api/tables/remove" && request.method === "POST") {
          if (!admin) return json({ ok: false, error: "관리자만 변경할 수 있습니다." }, 403);
          return apiTableRemove(request, env);
        }
        return json({ ok: false, error: "not found" }, 404);
      }
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }

    // 화면은 항상 이 파일에 내장된 최신 HTML 로 서빙(정적 index.html 에 의존하지 않음).
    return new Response(INDEX_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
};

/* ---------------- 공통 ---------------- */
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}
function b64urlEncode(bytes) {
  let bin = ""; const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToString(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(sig);
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function nowIso() { return new Date().toISOString(); }

function adminList(env) {
  return (env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
}
function isAdmin(env, user) {
  return adminList(env).includes((user.email || "").toLowerCase());
}

/* ---------------- 세션 ---------------- */
async function makeSession(user, secret) {
  const payload = { email: user.email, name: user.name, exp: nowSec() + 60 * 60 * 12 };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}
async function readSession(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  if (sig !== await hmac(secret, body)) return null;
  try {
    const p = JSON.parse(b64urlDecodeToString(body));
    if (!p.exp || p.exp < nowSec()) return null;
    return p;
  } catch { return null; }
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(value, url, maxAge) {
  const secure = url.protocol === "https:" ? " Secure;" : "";
  return `sess=${encodeURIComponent(value)}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAge}`;
}
async function getUser(request, env) {
  return await readSession(getCookie(request, "sess"), env.SESSION_SECRET || "dev-secret");
}

/* ---------------- 인증 ---------------- */
async function authGoogle(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const cred = body.credential;
  if (!cred) return json({ ok: false, error: "credential 없음" }, 400);
  const resp = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
  if (!resp.ok) return json({ ok: false, error: "토큰 검증 실패" }, 401);
  const info = await resp.json();
  if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) return json({ ok: false, error: "클라이언트 불일치" }, 401);
  if (info.email_verified !== "true" && info.email_verified !== true) return json({ ok: false, error: "이메일 미인증" }, 401);
  const domain = (env.ALLOWED_DOMAIN || "").toLowerCase();
  const email = (info.email || "").toLowerCase();
  if (domain && !(email.endsWith("@" + domain) || (info.hd || "").toLowerCase() === domain))
    return json({ ok: false, error: `회사(${domain}) 계정만 접속할 수 있습니다.` }, 403);
  const user = { email, name: info.name || email.split("@")[0] };
  const token = await makeSession(user, env.SESSION_SECRET || "dev-secret");
  return json({ ok: true, user }, 200, { "Set-Cookie": sessionCookie(token, url, 60 * 60 * 12) });
}
function logout(url) { return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", url, 0) }); }
async function apiMe(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ authed: false });
  return json({ authed: true, email: user.email, name: user.name, is_admin: isAdmin(env, user) });
}

/* ---------------- 현황 ---------------- */
async function apiStatus(env, url) {
  try { await maybeRemindStale(env, url); } catch {}   // 1시간 초과 점유 알림(조회 시 확인)
  const tables = (await env.DB.prepare("SELECT table_name, memo FROM tables ORDER BY sort_order, table_name").all()).results || [];
  const editing = (await env.DB.prepare("SELECT table_name, user_email, user_name, started_at, note FROM editing").all()).results || [];
  const emap = {}; for (const e of editing) emap[e.table_name] = e;
  const names = new Set(tables.map(t => t.table_name));
  const rows = tables.map(t => rowOf(t.table_name, t.memo, emap[t.table_name]));
  for (const e of editing) if (!names.has(e.table_name)) rows.push(rowOf(e.table_name, "", e));
  return json({ tables: rows, svn_repo_url: await getSetting(env, "svn_repo_url", "") });
}
function rowOf(name, memo, e) {
  return {
    table: name, memo: memo || "", in_use: !!e,
    user_email: e ? e.user_email : null,
    user_name: e ? (e.user_name || e.user_email) : null,
    started_at: e ? e.started_at : null,
    elapsed: e ? humanDuration(e.started_at) : null,
    note: e ? (e.note || "") : "",
  };
}
async function apiStart(request, env, user, url) {
  const body = await request.json().catch(() => ({}));
  const table = (body.table || "").trim();
  const note = (body.note || "").trim();
  if (!table) return json({ ok: false, error: "table 필수" }, 400);
  const ins = await env.DB.prepare(
    "INSERT INTO editing(table_name,user_email,user_name,started_at,note) VALUES(?,?,?,?,?) ON CONFLICT(table_name) DO NOTHING"
  ).bind(table, user.email, user.name, nowIso(), note).run();
  if (ins.meta.changes === 1) {
    await logHistory(env, table, user.email, "start");
    await notify(env, url, `✏️ [시작] ${table} · ${user.name} · ${hhmm()}`);
    return json({ ok: true });
  }
  const row = await env.DB.prepare("SELECT * FROM editing WHERE table_name=?").bind(table).first();
  if (row && row.user_email === user.email) return json({ ok: true, already_mine: true });
  await logHistory(env, table, user.email, "conflict");
  await notify(env, url, `⚠️ [중복] ${table} · 이미 ${row.user_name || row.user_email}님 사용 중(${humanDuration(row.started_at)}) · 시도 ${user.name}`);
  return json({ ok: false, conflict: true, holder: { user_name: row.user_name || row.user_email, elapsed: humanDuration(row.started_at) } }, 409);
}
async function apiFinish(request, env, user, url, admin) {
  const body = await request.json().catch(() => ({}));
  const table = (body.table || "").trim();
  const row = await env.DB.prepare("SELECT * FROM editing WHERE table_name=?").bind(table).first();
  if (!row) return json({ ok: false, error: "현재 편집 중이 아닙니다." }, 400);
  if (row.user_email !== user.email && !admin)
    return json({ ok: false, error: `${row.user_name || row.user_email}님이 편집 중입니다. 본인 것만 종료할 수 있습니다.` }, 403);
  await env.DB.prepare("DELETE FROM editing WHERE table_name=?").bind(table).run();
  await logHistory(env, table, user.email, "finish");
  await notify(env, url, `✅ [완료] ${table} · ${row.user_name || row.user_email} · 소요 ${humanDuration(row.started_at)}`);
  return json({ ok: true });
}

/* ---------------- 설정/테이블(관리자) ---------------- */
async function apiGetConfig(env) { return json({ svn_repo_url: await getSetting(env, "svn_repo_url", "") }); }
async function apiSetConfig(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.svn_repo_url === "string") await setSetting(env, "svn_repo_url", body.svn_repo_url.trim());
  return json({ ok: true, svn_repo_url: await getSetting(env, "svn_repo_url", "") });
}
async function apiTableAdd(request, env) {
  const body = await request.json().catch(() => ({}));
  const name = (body.table_name || "").trim();
  const memo = (body.memo || "").trim();
  if (!name) return json({ ok: false, error: "table_name 필수" }, 400);
  const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM tables").first();
  await env.DB.prepare("INSERT INTO tables(table_name,memo,sort_order) VALUES(?,?,?) ON CONFLICT(table_name) DO UPDATE SET memo=excluded.memo")
    .bind(name, memo, (max.m || 0) + 1).run();
  return json({ ok: true });
}
async function apiTableRemove(request, env) {
  const body = await request.json().catch(() => ({}));
  const name = (body.table_name || "").trim();
  if (!name) return json({ ok: false, error: "table_name 필수" }, 400);
  await env.DB.prepare("DELETE FROM tables WHERE table_name=?").bind(name).run();
  await env.DB.prepare("DELETE FROM editing WHERE table_name=?").bind(name).run();
  return json({ ok: true });
}

// 사내 동기화 스크립트가 svn list 결과를 올리는 통로. SYNC_TOKEN 으로 인증.
async function apiTablesSync(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) return json({ ok: false, error: "인증 실패" }, 401);
  const body = await request.json().catch(() => ({}));
  const items = Array.isArray(body.tables) ? body.tables : null;
  if (!items) return json({ ok: false, error: "tables 배열 필요" }, 400);
  // 목록 전체 교체(편집 중 상태는 보존)
  await env.DB.prepare("DELETE FROM tables").run();
  let i = 0;
  for (const it of items) {
    const name = typeof it === "string" ? it : (it && it.table_name);
    const memo = typeof it === "string" ? "" : ((it && it.memo) || "");
    if (!name) continue;
    i++;
    await env.DB.prepare("INSERT OR IGNORE INTO tables(table_name,memo,sort_order) VALUES(?,?,?)").bind(name, memo, i).run();
  }
  if (typeof body.svn_repo_url === "string") await setSetting(env, "svn_repo_url", body.svn_repo_url.trim());
  return json({ ok: true, count: i });
}

async function getSetting(env, key, dflt) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind(key).first();
  return r ? r.value : dflt;
}
async function setSetting(env, key, value) {
  await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, value).run();
}
async function logHistory(env, table, email, action) {
  try { await env.DB.prepare("INSERT INTO history(table_name,user_email,action,at) VALUES(?,?,?,?)").bind(table, email, action, nowIso()).run(); } catch {}
}

/* ---------------- 장시간 점유 알림(1시간) ---------------- */
async function maybeRemindStale(env, url) {
  const mins = parseInt(env.STALE_MINUTES) || 60;   // 기본 60분
  const cutoff = new Date(Date.now() - mins * 60 * 1000).toISOString();
  const stale = (await env.DB.prepare(
    "SELECT table_name, user_name, user_email FROM editing WHERE reminded=0 AND started_at <= ?"
  ).bind(cutoff).all()).results || [];
  for (const r of stale) {
    // 원자적으로 '한 번만' 클레임 → 중복 발송 방지
    const claim = await env.DB.prepare("UPDATE editing SET reminded=1 WHERE table_name=? AND reminded=0").bind(r.table_name).run();
    if (claim.meta.changes === 1) {
      const who = r.user_name || r.user_email;
      await notify(env, url, `⏰ [1시간 경과] ${r.table_name} · ${who}님, 벌써 1시간째 잡고 계신데요…😏 진짜 계속 편집 중인 거 맞죠? 혹시 '완료' 누르는 거 깜빡하신 거 아니고요~?`);
    }
  }
}

/* ---------------- 카카오워크 ---------------- */
async function notify(env, url, text) {
  const hook = env.KAKAOWORK_WEBHOOK_URL;
  if (!hook) return;
  try {
    await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
  } catch {}
}

/* ---------------- 시간 ---------------- */
function hhmm() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().substr(11, 5); }
function humanDuration(startIso) {
  if (!startIso) return "-";
  const secs = Math.max(0, Math.floor((Date.now() - Date.parse(startIso)) / 1000));
  if (secs < 60) return secs + "초";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "분";
  return Math.floor(mins / 60) + "시간 " + (mins % 60) + "분";
}
