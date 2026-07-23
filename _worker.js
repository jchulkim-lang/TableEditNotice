/**
 * SVN 테이블 편집 보드 — Cloudflare Worker (_worker.js)
 *
 * 스택: Cloudflare Pages(정적 index.html) + 이 Worker + D1 데이터베이스
 * 로그인: 회사 Google 계정(도메인 제한). 로그인한 사람이 곧 "사용 중인 사람".
 * 알림: 사용 시작/종료/중복 시 카카오워크 Incoming Webhook 으로 전송.
 *
 * 필요한 바인딩/환경변수 (Cloudflare Pages 설정에서):
 *   - D1 바인딩:  DB
 *   - 변수:       GOOGLE_CLIENT_ID       (예: xxxx.apps.googleusercontent.com)
 *                 ALLOWED_DOMAIN         (예: vicgamestudios.com)
 *                 ADMIN_EMAILS           (선택, 콤마구분. 강제 종료 권한)
 *   - 시크릿:     KAKAOWORK_WEBHOOK_URL  (카카오워크 웹훅 URL)
 *                 SESSION_SECRET         (세션 서명용 임의 문자열)
 */

const enc = new TextEncoder();

const INDEX_HTML = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SVN 테이블 편집 보드</title>
<script src="https://accounts.google.com/gsi/client" async defer></script>
<style>
 :root{--bg:#0f1115;--panel:#181b22;--panel2:#1f232c;--line:#2b303b;--ink:#e7eaf0;
  --muted:#9aa3b2;--accent:#ffe94a;--accent-ink:#3a2f00;--free:#37d399;--busy:#ff6b6b;--me:#5b8cff;}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);
  font-family:'Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif;font-size:14px}
 .wrap{max-width:840px;margin:0 auto;padding:22px}
 h1{font-size:19px;margin:0 0 4px} .sub{color:var(--muted);font-size:13px;margin-bottom:16px}
 .bar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--panel);
  border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:14px}
 .bar label{color:var(--muted)} input{background:var(--panel2);color:var(--ink);
  border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14px}
 .pill{font-size:12px;color:var(--muted);background:var(--panel2);border:1px solid var(--line);
  border-radius:999px;padding:4px 10px}
 .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden}
 .row{display:flex;align-items:center;gap:12px;padding:13px 16px;border-bottom:1px solid var(--line)}
 .row:last-child{border-bottom:none}
 .tname{flex:1;min-width:0} .tname .f{font-weight:600} .tname .m{font-size:12px;color:var(--muted);margin-top:2px}
 .badge{font-size:12px;font-weight:700;padding:4px 9px;border-radius:999px;white-space:nowrap}
 .b-free{color:var(--free);background:rgba(55,211,153,.12);border:1px solid rgba(55,211,153,.35)}
 .b-busy{color:var(--busy);background:rgba(255,107,107,.12);border:1px solid rgba(255,107,107,.35)}
 .b-me{color:var(--me);background:rgba(91,140,255,.14);border:1px solid rgba(91,140,255,.4)}
 .btn{border:1px solid var(--line);background:var(--panel2);color:var(--ink);border-radius:8px;
  padding:7px 12px;font-size:13px;cursor:pointer} .btn:hover{border-color:#3a4150}
 .btn-primary{background:var(--accent);color:var(--accent-ink);border-color:var(--accent);font-weight:700}
 .btn:disabled{opacity:.4;cursor:not-allowed}
 .toast{position:fixed;left:50%;top:20px;transform:translateX(-50%);background:#2a1416;
  border:1px solid var(--busy);color:#ffd7d7;padding:13px 18px;border-radius:12px;max-width:520px;
  box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:50;display:none}
 .toast.show{display:block} .foot{color:var(--muted);font-size:12px;margin-top:14px}
 .center{min-height:70vh;display:grid;place-items:center;text-align:center}
 .login{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:34px 30px;max-width:360px}
 .login h1{margin-bottom:8px} .login p{color:var(--muted);font-size:13px;margin:0 0 20px}
 .who{display:flex;align-items:center;gap:8px}
</style></head><body>
<div class="wrap">
  <div id="app"></div>
</div>
<div class="toast" id="toast"></div>

<script>
const $=s=>document.querySelector(s);
let ME=null, POLL=null, SVN_LOADED=false;

function toast(html){const t=$("#toast");t.innerHTML=html;t.classList.add("show");
  clearTimeout(toast._h);toast._h=setTimeout(()=>t.classList.remove("show"),4200);}

async function boot(){
  const me=await (await fetch("/api/me")).json();
  if(me.authed){ ME=me; renderBoard(); startPoll(); }
  else { renderLogin(); }
}

/* ---------- 로그인 화면 ---------- */
async function renderLogin(){
  stopPoll();
  const cfg=await (await fetch("/api/public-config")).json();
  $("#app").innerHTML=\`<div class="center"><div class="login">
    <h1>SVN 테이블 편집 보드</h1>
    <p>회사 Google 계정으로 로그인하세요.<br>회사 도메인 계정만 접속됩니다.</p>
    <div id="gbtn"></div>
    <div id="gmsg" style="color:var(--busy);font-size:12px;margin-top:12px"></div>
  </div></div>\`;
  function init(){
    if(!window.google||!google.accounts){ return setTimeout(init,300); }
    google.accounts.id.initialize({
      client_id: cfg.google_client_id,
      callback: async (resp)=>{
        const r=await fetch("/api/auth/google",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({credential:resp.credential})});
        const d=await r.json();
        if(d.ok){ boot(); } else { $("#gmsg").textContent=d.error||"로그인 실패"; }
      }
    });
    google.accounts.id.renderButton($("#gbtn"),{theme:"filled_blue",size:"large",text:"signin_with",shape:"pill"});
  }
  init();
}

/* ---------- 보드 화면 ---------- */
function renderBoard(){
  $("#app").innerHTML=\`
    <h1>SVN 테이블 편집 보드</h1>
    <div class="sub">누가 어떤 테이블을 쓰는지 실시간으로 표시됩니다. 수정할 때만 <b>사용 시작</b>을 눌러주세요.</div>
    <div class="bar">
      <span class="who"><span class="pill">👤 \${ME.name} · \${ME.email}</span></span>
      <button class="btn" onclick="logout()">로그아웃</button>
    </div>
    <div class="bar">
      <label>SVN Repo 주소</label>
      <input id="svn" placeholder="https://svn.회사.com/svn/GameData" style="flex:1;min-width:260px">
      <button class="btn" onclick="saveSvn()">저장</button>
      <span class="pill" id="svnMsg">알림 문구에도 이 주소가 함께 나갑니다</span>
    </div>
    <div class="card" id="list"></div>
    <div class="foot" id="foot"></div>\`;
  refresh();
}

async function refresh(){
  if(!ME) return;
  const r=await fetch("/api/status");
  if(r.status===401){ ME=null; renderLogin(); return; }
  const d=await r.json();
  if(!SVN_LOADED){ const el=$("#svn"); if(el){ el.value=d.svn_repo_url||""; SVN_LOADED=true; } }
  const foot=$("#foot"); if(foot) foot.textContent=d.svn_repo_url? ("SVN: "+d.svn_repo_url):"";
  const list=$("#list"); if(!list) return;
  list.innerHTML=d.tables.map(t=>{
    let badge,startDis=false,finDis=true;
    if(!t.in_use){badge='<span class="badge b-free">● 사용 가능</span>';}
    else if(t.user_email===ME.email){badge=\`<span class="badge b-me">✎ 내가 사용 중 · \${t.elapsed}</span>\`;finDis=false;startDis=true;}
    else{badge=\`<span class="badge b-busy">■ \${t.user_name} 사용 중 · \${t.elapsed}</span>\`;}
    const tt=t.table.replace(/'/g,"\\\\'");
    return \`<div class="row"><div class="tname"><div class="f">\${t.table}</div>
      <div class="m">\${t.memo||'&nbsp;'}</div></div>\${badge}
      <button class="btn btn-primary" \${startDis?'disabled':''} onclick="start('\${tt}')">사용 시작</button>
      <button class="btn" \${finDis?'disabled':''} onclick="finish('\${tt}')">사용 종료</button></div>\`;
  }).join("");
}

async function start(table){
  const r=await fetch("/api/start",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({table})});
  if(r.status===409){const d=await r.json();
    toast(\`⚠️ <b>\${table}</b> 은(는) 이미 <b>\${d.holder.user_name}</b>님이 사용 중입니다 (경과 \${d.holder.elapsed}).\`);}
  refresh();
}
async function finish(table){
  const r=await fetch("/api/finish",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({table})});
  if(!r.ok){const d=await r.json();toast(d.error||"종료 실패");}
  refresh();
}
async function saveSvn(){
  const v=($("#svn").value||"").trim();
  const r=await fetch("/api/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({svn_repo_url:v})});
  const d=await r.json();
  $("#svnMsg").textContent=d.ok?"저장됨 ✓":"저장 실패";
  setTimeout(()=>{const m=$("#svnMsg"); if(m) m.textContent="알림 문구에도 이 주소가 함께 나갑니다";},2500);
}
async function logout(){ await fetch("/api/logout"); ME=null; SVN_LOADED=false; if(window.google&&google.accounts) google.accounts.id.disableAutoSelect(); renderLogin(); }

function startPoll(){ stopPoll(); POLL=setInterval(refresh,3000); }
function stopPoll(){ if(POLL) clearInterval(POLL); POLL=null; }

boot();
</script>
</body></html>
`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/api/public-config") return json({ google_client_id: env.GOOGLE_CLIENT_ID || "" });
      if (path === "/api/auth/google" && request.method === "POST") return authGoogle(request, env, url);
      if (path === "/api/logout") return logout(url);
      if (path === "/api/me") return apiMe(request, env);

      if (path.startsWith("/api/")) {
        // 이하 API는 로그인 필요
        const user = await getUser(request, env);
        if (!user) return json({ ok: false, error: "인증이 필요합니다." }, 401);

        if (path === "/api/status") return apiStatus(env);
        if (path === "/api/start" && request.method === "POST") return apiStart(request, env, user, url);
        if (path === "/api/finish" && request.method === "POST") return apiFinish(request, env, user, url);
        if (path === "/api/config" && request.method === "GET") return apiGetConfig(env);
        if (path === "/api/config" && request.method === "POST") return apiSetConfig(request, env);
        return json({ ok: false, error: "not found" }, 404);
      }
    } catch (e) {
      return json({ ok: false, error: String(e && e.message || e) }, 500);
    }

    // 그 외 경로 → 대시보드 HTML (Worker에 내장되어 있어 ASSETS 바인딩 불필요)
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response(INDEX_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
};

/* ---------------- 공통 유틸 ---------------- */
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function b64urlEncode(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToString(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(sig);
}

/* ---------------- 세션(자체 서명 쿠키) ---------------- */
async function makeSession(user, secret) {
  const payload = { email: user.email, name: user.name, exp: nowSec() + 60 * 60 * 12 }; // 12시간
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return `${body}.${sig}`;
}
async function readSession(token, secret) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expect = await hmac(secret, body);
  if (sig !== expect) return null;
  try {
    const payload = JSON.parse(b64urlDecodeToString(body));
    if (!payload.exp || payload.exp < nowSec()) return null;
    return payload;
  } catch { return null; }
}
function nowSec() { return Math.floor(Date.now() / 1000); }
function nowIso() { return new Date().toISOString(); }

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
  const token = getCookie(request, "sess");
  return await readSession(token, env.SESSION_SECRET || "dev-secret");
}

/* ---------------- 인증 ---------------- */
// index.html 의 Google Sign-In 버튼이 준 id_token(credential)을 검증하고 세션 발급.
async function authGoogle(request, env, url) {
  const body = await request.json().catch(() => ({}));
  const cred = body.credential;
  if (!cred) return json({ ok: false, error: "credential 없음" }, 400);

  // Google tokeninfo 로 검증(간단·신뢰). 로그인 시에만 호출.
  const resp = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(cred));
  if (!resp.ok) return json({ ok: false, error: "토큰 검증 실패" }, 401);
  const info = await resp.json();

  if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID)
    return json({ ok: false, error: "클라이언트 불일치" }, 401);
  if (info.email_verified !== "true" && info.email_verified !== true)
    return json({ ok: false, error: "이메일 미인증" }, 401);

  const domain = (env.ALLOWED_DOMAIN || "").toLowerCase();
  const email = (info.email || "").toLowerCase();
  if (domain && !(email.endsWith("@" + domain) || (info.hd || "").toLowerCase() === domain))
    return json({ ok: false, error: `회사(${domain}) 계정만 접속할 수 있습니다.` }, 403);

  const user = { email, name: info.name || email.split("@")[0] };
  const token = await makeSession(user, env.SESSION_SECRET || "dev-secret");
  return json({ ok: true, user }, 200, { "Set-Cookie": sessionCookie(token, url, 60 * 60 * 12) });
}

function logout(url) {
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", url, 0) });
}

async function apiMe(request, env) {
  const user = await getUser(request, env);
  if (!user) return json({ authed: false });
  const admins = (env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return json({ authed: true, email: user.email, name: user.name, is_admin: admins.includes(user.email) });
}

/* ---------------- 상태/현황 ---------------- */
async function apiStatus(env) {
  const tables = (await env.DB.prepare("SELECT table_name, memo FROM tables ORDER BY sort_order, table_name").all()).results || [];
  const editing = (await env.DB.prepare("SELECT table_name, user_email, user_name, started_at, note FROM editing").all()).results || [];
  const emap = {};
  for (const e of editing) emap[e.table_name] = e;

  // 목록에 없지만 편집 중인 테이블도 포함
  const names = new Set(tables.map(t => t.table_name));
  const rows = tables.map(t => rowOf(t.table_name, t.memo, emap[t.table_name]));
  for (const e of editing) if (!names.has(e.table_name)) rows.push(rowOf(e.table_name, "", e));

  const svn = await getSetting(env, "svn_repo_url", "");
  return json({ tables: rows, svn_repo_url: svn });
}
function rowOf(name, memo, e) {
  return {
    table: name, memo: memo || "",
    in_use: !!e,
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

  // 비어 있을 때만 원자적으로 점유
  const ins = await env.DB.prepare(
    "INSERT INTO editing(table_name,user_email,user_name,started_at,note) VALUES(?,?,?,?,?) ON CONFLICT(table_name) DO NOTHING"
  ).bind(table, user.email, user.name, nowIso(), note).run();

  if (ins.meta.changes === 1) {
    await logHistory(env, table, user.email, "start");
    await notify(env, url, `✏️ [편집 시작] ${table}\n담당: ${user.name}\n시작: ${hhmm()}${note ? "\n메모: " + note : ""}\n※ 동시 편집을 피해 주세요.`);
    return json({ ok: true });
  }
  // 이미 누군가 점유 중
  const row = await env.DB.prepare("SELECT * FROM editing WHERE table_name=?").bind(table).first();
  if (row && row.user_email === user.email) return json({ ok: true, already_mine: true });
  await logHistory(env, table, user.email, "conflict");
  await notify(env, url, `⚠️ [중복 시도] ${table}\n이미 ${row.user_name || row.user_email}님이 편집 중(경과 ${humanDuration(row.started_at)}).\n시도: ${user.name}`);
  return json({ ok: false, conflict: true, holder: { user_name: row.user_name || row.user_email, elapsed: humanDuration(row.started_at) } }, 409);
}

async function apiFinish(request, env, user, url) {
  const body = await request.json().catch(() => ({}));
  const table = (body.table || "").trim();
  const admins = (env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const isAdmin = admins.includes(user.email);

  const row = await env.DB.prepare("SELECT * FROM editing WHERE table_name=?").bind(table).first();
  if (!row) return json({ ok: false, error: "현재 편집 중이 아닙니다." }, 400);
  if (row.user_email !== user.email && !isAdmin)
    return json({ ok: false, error: `${row.user_name || row.user_email}님이 편집 중입니다. 본인 것만 종료할 수 있습니다.` }, 403);

  await env.DB.prepare("DELETE FROM editing WHERE table_name=?").bind(table).run();
  await logHistory(env, table, user.email, "finish");
  await notify(env, url, `✅ [편집 완료] ${table}\n담당: ${row.user_name || row.user_email} · 소요 ${humanDuration(row.started_at)}\n이제 사용할 수 있습니다.`);
  return json({ ok: true });
}

/* ---------------- 설정(svn repo 등) ---------------- */
async function apiGetConfig(env) {
  return json({ svn_repo_url: await getSetting(env, "svn_repo_url", "") });
}
async function apiSetConfig(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.svn_repo_url === "string") await setSetting(env, "svn_repo_url", body.svn_repo_url.trim());
  return json({ ok: true, svn_repo_url: await getSetting(env, "svn_repo_url", "") });
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

/* ---------------- 카카오워크 알림 ---------------- */
async function notify(env, url, text) {
  const hook = env.KAKAOWORK_WEBHOOK_URL;
  const link = url ? `\n현황 보기: ${url.origin}` : "";
  if (!hook) return; // 미설정 시 조용히 무시
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text + link }),
    });
  } catch {}
}

/* ---------------- 시간 표기 ---------------- */
function hhmm() {
  // KST(UTC+9) 기준 HH:MM
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().substr(11, 5);
}
function humanDuration(startIso) {
  if (!startIso) return "-";
  const secs = Math.max(0, Math.floor((Date.now() - Date.parse(startIso)) / 1000));
  if (secs < 60) return secs + "초";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "분";
  return Math.floor(mins / 60) + "시간 " + (mins % 60) + "분";
}
