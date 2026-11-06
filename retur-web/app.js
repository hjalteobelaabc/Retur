(() => {
"use strict";

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n, d) => new Intl.NumberFormat("da-DK", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n);
const kr = n => { const v = Math.round(Number(n || 0) * 100) / 100; return fmt(v, v % 1 ? 2 : 0) + " kr."; };
const pctf = n => fmt(n, 1) + " %";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const dkDate = s => { const d = parseISO(s); return `${d.getDate()}. ${MON3[d.getMonth()]}`; };
const MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
const MON3 = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const ymKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const CATS = ["Dagligvarer","Mad ude","Transport","Tøj","Underholdning","Abonnement","Bolig","Sundhed","Andet"];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const initial = s => esc((String(s || "?").trim()[0] || "?").toUpperCase());
const sum = arr => arr.reduce((a, p) => a + Number(p.amount || 0), 0);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= state ================= */
const STORE_KEY = "retur-demo-v1";
function sampleState() {
  const t = today(), y = t.getFullYear(), m = t.getMonth();
  const day = (offM, d) => iso(new Date(y, m + offM, Math.min(d, new Date(y, m + offM + 1, 0).getDate())));
  const P = (store, offM, d, amount, category) => ({ id: uid(), store, date: day(offM, d), amount, category, sample: true });
  const cur = [
    P("Netto", 0, 1, 18, "Dagligvarer"), P("Rejsekort", 0, 2, 150, "Transport"), P("Føtex", 0, 3, 312.5, "Dagligvarer"),
    P("Joe & The Juice", 0, 4, 69, "Mad ude"), P("H&M", 0, 5, 349, "Tøj"), P("Lidl", 0, 5, 186.75, "Dagligvarer"),
  ].filter(p => parseISO(p.date) <= t);
  const prev = [
    P("Netto", -1, 2, 142, "Dagligvarer"), P("Rejsekort", -1, 3, 300, "Transport"), P("Normal", -1, 6, 89, "Andet"),
    P("Rema 1000", -1, 9, 264.25, "Dagligvarer"), P("Biografen", -1, 12, 135, "Underholdning"), P("Zalando", -1, 14, 899, "Tøj"),
    P("Føtex", -1, 17, 401, "Dagligvarer"), P("7-Eleven", -1, 19, 54, "Mad ude"), P("Matas", -1, 21, 179, "Sundhed"),
    P("Lidl", -1, 24, 233.5, "Dagligvarer"), P("Sushi Shop", -1, 26, 289, "Mad ude"), P("Netto", -1, 28, 18, "Dagligvarer"),
    P("DSB", -1, 29, 308.25, "Transport"),
  ];
  const S = (name, amount, d) => ({ id: uid(), name, amount, interval: "måned", day: d, remind: true, sample: true });
  return {
    salary: 12000, savingsGoal: 2000, pro: true,
    ai: { month: ymKey(t), count: 0 },
    purchases: [...cur, ...prev],
    subs: [S("Netflix", 149, 1), S("iCloud+", 9, 3), S("Fitness World", 191, 5), S("Spotify", 119, 25)],
    hasSample: true,
  };
}
let state;
try { state = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch { state = null; }
if (!state || !Array.isArray(state.purchases) || !Array.isArray(state.subs)) state = sampleState();
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

let viewMonth = today(); viewMonth.setDate(1);
let period = "måned";
let chatTurns = [];
let chatBusy = false;
let flashId = null;

/* ================= derived ================= */
const subMonthly = s => s.interval === "år" ? s.amount / 12 : s.amount;
const subsTotal = () => state.subs.reduce((a, s) => a + subMonthly(s), 0);
function nextPayment(s) {
  const t = today();
  if (s.interval === "år" && s.nextDate) {
    let d = parseISO(s.nextDate);
    while (d < t) d = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    return d;
  }
  const mk = (y, m) => new Date(y, m, Math.min(s.day || 1, new Date(y, m + 1, 0).getDate()));
  let d = mk(t.getFullYear(), t.getMonth());
  if (d < t) d = mk(t.getFullYear(), t.getMonth() + 1);
  return d;
}
const daysUntil = d => Math.round((d - today()) / 864e5);
const whenText = d => { const n = daysUntil(d); return n === 0 ? "I dag" : n === 1 ? "I morgen" : n < 7 ? `Om ${n} dage` : `${d.getDate()}. ${MON3[d.getMonth()]}`; };
const inMonth = (p, d) => { const x = parseISO(p.date); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); };
const monthPurchases = d => state.purchases.filter(p => inMonth(p, d)).sort((a, b) => b.date.localeCompare(a.date));
function aiLeft() {
  const k = ymKey(today());
  if (!state.ai || state.ai.month !== k) { state.ai = { month: k, count: 0 }; save(); }
  return state.pro ? Infinity : Math.max(0, 5 - state.ai.count);
}
const useAi = () => { aiLeft(); state.ai.count++; save(); };
const refundAi = () => { state.ai.count = Math.max(0, state.ai.count - 1); save(); };

/* ================= server ================= */
async function api(path, body, signal) {
  let res;
  try {
    res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled" };
    throw { code: "offline" };
  }
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) throw { code: (data && data.error) || "upstream_error" };
  return data;
}
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw { code: "image_rejected" };
  const scale = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.85);
  return url.slice(url.indexOf(",") + 1);
}
const aiErr = code => ({
  offline: "Ingen forbindelse. Tjek dit internet og prøv igen.",
  rate_limited: "Der er sendt mange AI-forespørgsler. Prøv igen om lidt.",
  quota_reached: "AI er sat på pause, fordi månedens AI-budget er brugt. Du kan stadig tilføje betalinger selv.",
  image_rejected: "Billedet kunne ikke læses. Prøv et andet billede.",
  too_large: "Billedet er for stort. Prøv et andet billede.",
  invalid_json: "AI kunne ikke aflæse kvitteringen. Prøv et skarpere billede.",
  not_configured: "AI er ikke sat op. API-nøglen mangler på serveren.",
  bad_request: "Forespørgslen kunne ikke behandles. Prøv igen.",
}[code] || "Noget gik galt. Prøv igen.");

/* ================= icons ================= */
const svg = (p, s = 22, w = 1.8) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  home: s => svg('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>', s),
  card: s => svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>', s),
  repeat: s => svg('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>', s),
  chat: s => svg('<path d="M5 18.5 3.5 21l.8-4A8 8 0 1 1 8 19.6z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="2.6"/>', s),
  plus: s => svg('<path d="M12 5v14M5 12h14"/>', s, 2.3),
  gear: s => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', s),
  wallet: s => svg('<path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 7l12-3v3M16 13.5h1.5"/>', s),
  pig: s => svg('<path d="M5 11a7 6 0 0 1 12.5-2.5L20 8l-.5 3.5A6 6 0 0 1 17 16v3h-3v-2h-3v2H8v-3a6 6 0 0 1-3-5z"/><path d="M15.5 10.5h.01" stroke-width="2.6"/>', s),
  left: s => svg('<path d="M15 6l-6 6 6 6"/>', s, 2.2),
  right: s => svg('<path d="M9 6l6 6-6 6"/>', s, 2.2),
  send: s => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3 10l12 2-12 2z"/></svg>`,
  cam: s => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', s),
  doc: s => svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>', s),
  pen: s => svg('<path d="M4 20l4-1 11-11-3-3L5 16z"/>', s),
  spark: s => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>`,
  x: s => svg('<path d="M6 6l12 12M18 6L6 18"/>', s, 2.2),
  check: s => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s, 2.6),
  bell: s => svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>', s),
};

/* ================= shell ================= */
const NAV = [
  ["overblik", "Overblik", I.home],
  ["kob", "Køb", I.card],
  ["abonnementer", "Abonnementer", I.repeat],
  ["assistent", "AI-assistent", I.chat],
];
document.getElementById("app").innerHTML = `
<div class="shell">
  <aside class="side" aria-label="Hovedmenu">
    <a class="brand" href="#overblik">retur <span class="badge" data-pro>PRO</span></a>
    <nav class="nav">${NAV.map(([k, l, ic]) => `<a href="#${k}" data-tab="${k}">${ic(20)}${l}</a>`).join("")}</nav>
    <button class="btn primary add" data-act="add">${I.plus(18)} Tilføj betaling</button>
    <div class="side-foot">
      <div class="procard" data-procard></div>
      <button class="settings" data-act="settings">${I.gear(20)} Indstillinger</button>
    </div>
  </aside>
  <header class="mtop">
    <a class="brand" href="#overblik">retur <span class="badge" data-pro>PRO</span></a>
    <button class="icon-btn" data-act="settings" aria-label="Indstillinger">${I.gear(22)}</button>
  </header>
  <main class="main" id="view" tabindex="-1"></main>
</div>
<nav class="tabs" aria-label="Menu">
  <div class="in">
    <a href="#overblik" data-tab="overblik">${I.home(24)}Overblik</a>
    <a href="#kob" data-tab="kob">${I.card(24)}Køb</a>
    <button class="plus" data-act="add" aria-label="Tilføj betaling"><span class="p">${I.plus(26)}</span></button>
    <a href="#abonnementer" data-tab="abonnementer">${I.repeat(24)}Abonnementer</a>
    <a href="#assistent" data-tab="assistent">${I.chat(24)}AI</a>
  </div>
</nav>
<input type="file" id="camInput" accept="image/*" capture="environment" class="vh" tabindex="-1" aria-hidden="true">
<input type="file" id="fileInput" accept="image/jpeg,image/png,image/webp,image/gif,image/heic" class="vh" tabindex="-1" aria-hidden="true">
<div id="sheetRoot"></div>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>`;

/* ================= routing ================= */
const VIEWS = ["overblik", "kob", "abonnementer", "assistent"];
const route = () => { const h = location.hash.replace("#", ""); return VIEWS.includes(h) ? h : "overblik"; };
let lastRoute = null;
window.addEventListener("hashchange", () => render());

/* ================= views ================= */
function header(title, sub, right = "") {
  return `<div class="ph"><div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>${right}</div>`;
}
function monthSwitch() {
  const isCur = ymKey(viewMonth) === ymKey(today());
  return `<div class="month" role="group" aria-label="Vælg måned">
    <button class="icon-btn" data-act="prevM" aria-label="Forrige måned">${I.left(18)}</button>
    <strong>${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}</strong>
    <button class="icon-btn" data-act="nextM" aria-label="Næste måned" ${isCur ? "disabled" : ""}>${I.right(18)}</button></div>`;
}
function rowP(p, i = 0) {
  return `<button class="row ${p.id === flashId ? "flash" : ""}" style="--i:${i}" data-edit="${p.id}"><span class="av">${initial(p.store)}</span>
    <span class="grow"><div class="name">${esc(p.store)}</div><div class="meta">${dkDate(p.date)} · ${esc(p.category || "Andet")}</div></span>
    <span class="amt num">${kr(p.amount)}</span></button>`;
}
function chart(bars, labels, todayIdx = -1) {
  const max = Math.max(1, ...bars);
  return `<div class="chart" data-chart role="img" aria-label="Forbrug over perioden">
    ${bars.map((v, i) => { const h = v ? Math.max(3, v / max * 100) : 2; return `<div class="c" style="--h:${h}%"><div class="b ${v ? "" : "zero"} ${i === todayIdx ? "today" : ""}" style="height:${h}%;transition-delay:${Math.min(i * 14, 400)}ms"></div>${v ? `<span class="tip num">${kr(v)}</span>` : ""}</div>`; }).join("")}
  </div><div class="axis">${labels.map(l => `<span>${l}</span>`).join("")}</div>`;
}
const emptyBox = (title, text) => `<div class="empty"><b>${title}</b><span>${text}</span></div>`;

function vOverblik() {
  const mp = monthPurchases(viewMonth);
  const once = sum(mp), subs = subsTotal(), total = once + subs;
  const pct = state.salary > 0 ? total / state.salary * 100 : 0;
  const left = state.salary - total;
  const n = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const bars = [...Array(n)].map((_, i) => sum(mp.filter(p => parseISO(p.date).getDate() === i + 1)));
  const isCur = ymKey(viewMonth) === ymKey(today());
  const byCat = {};
  mp.forEach(p => { byCat[p.category || "Andet"] = (byCat[p.category || "Andet"] || 0) + p.amount; });
  if (subs) byCat["Abonnementer"] = subs;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const catMax = Math.max(1, ...cats.map(c => c[1]));
  const upcoming = [...state.subs].sort((a, b) => nextPayment(a) - nextPayment(b)).slice(0, 3);
  const savePct = state.savingsGoal > 0 ? Math.max(0, Math.min(100, left / state.savingsGoal * 100)) : 0;
  return `
  ${state.hasSample ? `<div class="banner"><span><b>Eksempeldata.</b> Tallene er opdigtede, så du kan prøve appen.</span><button class="link" data-act="clearSample">Ryd eksempeldata</button></div>` : ""}
  ${header("Dit overblik", "Køb og abonnementer samlet ét sted", monthSwitch())}
  <div class="grid kpis">
    <a class="card kpi hero" href="#kob">
      <div class="lbl"><span class="dot">${I.card(16)}</span>Forbrug i ${MONTHS[viewMonth.getMonth()].toLowerCase()}</div>
      <div class="val num" data-count="${total}" data-kind="kr">${kr(total)}</div>
      ${state.pro ? `<div class="bar"><i data-w="${Math.min(100, pct)}"></i></div><div class="foot"><span class="num" data-count="${pct}" data-kind="pct">${pctf(pct)}</span> af din løn</div>` : `<div class="foot">Engangskøb og abonnementer</div>`}
    </a>
    <button class="card kpi" data-act="settings">
      <div class="lbl"><span class="dot">${I.wallet(16)}</span>Udbetalt løn</div>
      <div class="val num" data-count="${state.salary}" data-kind="kr">${kr(state.salary)}</div>
      <div class="foot">Tryk for at ændre</div>
    </button>
    <a class="card kpi" href="#abonnementer">
      <div class="lbl"><span class="dot">${I.repeat(16)}</span>Abonnementer</div>
      <div class="val num" data-count="${subs}" data-kind="kr">${kr(subs)}</div>
      <div class="foot">${state.subs.length} aktive · ${kr(subs * 12)} om året</div>
    </a>
    ${state.pro ? `<button class="card kpi" data-act="settings">
      <div class="lbl"><span class="dot">${I.pig(16)}</span>Tilbage efter forbrug</div>
      <div class="val num" data-count="${left}" data-kind="kr">${kr(left)}</div>
      <div class="bar light"><i data-w="${savePct}"></i></div>
      <div class="foot">${left >= state.savingsGoal ? `Du når dit sparemål på ${kr(state.savingsGoal)}` : left > 0 ? `${kr(state.savingsGoal - left)} fra sparemålet` : "Over din løn denne måned"}</div>
    </button>` : `<button class="card kpi" data-act="settings">
      <div class="lbl"><span class="dot">${I.spark(16)}</span>Retur Pro</div>
      <div class="val">29 kr.</div><div class="foot">Sparemål, procent af løn og ubegrænset AI</div></button>`}
  </div>
  <div class="grid cols">
    <div class="stack">
      <section class="card">
        <div class="card-h"><h2>Forbrug pr. dag</h2><span class="sub" style="color:var(--muted);font-size:13px">Engangskøb · ${kr(once)}</span></div>
        ${chart(bars, ["1.", `${Math.ceil(n / 2)}.`, `${n}.`], isCur ? today().getDate() - 1 : -1)}
      </section>
      <section class="card">
        <div class="card-h"><h2>Seneste køb</h2><a class="link" href="#kob">Se alle</a></div>
        <div class="list">${mp.slice(0, 6).map(rowP).join("") || emptyBox("Ingen køb endnu", "Tryk på Tilføj betaling for at scanne din første kvittering.")}</div>
      </section>
    </div>
    <div class="stack">
      <section class="card askcard">
        <div class="card-h"><h2>Spørg om din økonomi</h2>${I.spark(18)}</div>
        <p>AI-assistenten svarer ud fra dine egne køb og abonnementer.</p>
        <form class="askform" data-form="quickask">
          <label class="vh" for="quickAsk">Spørg om din økonomi</label>
          <input id="quickAsk" placeholder="Hvad bruger jeg mest på?" autocomplete="off">
          <button class="send" aria-label="Send">${I.send(18)}</button>
        </form>
      </section>
      <section class="card">
        <div class="card-h"><h2>Kommende betalinger</h2><a class="link" href="#abonnementer">Alle</a></div>
        <div class="list">${upcoming.map((s, i) => { const d = nextPayment(s); return `<button class="row" style="--i:${i}" data-editsub="${s.id}"><span class="av">${initial(s.name)}</span><span class="grow"><div class="name">${esc(s.name)}</div><div class="meta">${whenText(d)}</div></span><span class="amt num">${kr(s.amount)}</span></button>`; }).join("") || emptyBox("Ingen abonnementer", "Tilføj dem med plusknappen.")}</div>
      </section>
      <section class="card">
        <div class="card-h"><h2>Fordeling</h2></div>
        <div class="cats">${cats.map(([c, v]) => `<div class="cat"><div class="top"><span>${esc(c)}</span><span class="num">${kr(v)}</span></div><div class="bar light"><i data-w="${v / catMax * 100}"></i></div></div>`).join("") || `<div class="empty" style="padding:8px">Ingen data i denne måned.</div>`}</div>
      </section>
    </div>
  </div>`;
}

function vKob() {
  const t = today();
  let items, bars, labels, title, todayIdx = -1;
  if (period === "uge") {
    const start = new Date(t); start.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d); });
    items = state.purchases.filter(p => days.includes(p.date));
    bars = days.map(d => sum(items.filter(p => p.date === d)));
    labels = ["man", "tir", "ons", "tor", "fre", "lør", "søn"]; title = "Denne uge"; todayIdx = (t.getDay() + 6) % 7;
  } else if (period === "år") {
    const y = t.getFullYear();
    items = state.purchases.filter(p => parseISO(p.date).getFullYear() === y);
    bars = [...Array(12)].map((_, m) => sum(items.filter(p => parseISO(p.date).getMonth() === m)));
    labels = ["jan", "apr", "jul", "okt", "dec"]; title = String(y); todayIdx = t.getMonth();
  } else {
    items = monthPurchases(viewMonth);
    const n = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    bars = [...Array(n)].map((_, i) => sum(items.filter(p => parseISO(p.date).getDate() === i + 1)));
    labels = ["1.", `${Math.ceil(n / 2)}.`, `${n}.`]; title = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
    if (ymKey(viewMonth) === ymKey(t)) todayIdx = t.getDate() - 1;
  }
  items = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const segs = ["uge", "måned", "år"];
  return `
  ${header("Køb", "Alle dine engangskøb", `<div style="display:flex;gap:10px;flex-wrap:wrap">${period === "måned" ? monthSwitch() : ""}
    <div class="seg" role="group" aria-label="Periode"><span class="pill"></span>${segs.map(p => `<button data-period="${p}" aria-pressed="${period === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}</div></div>`)}
  <section class="card">
    <div class="card-h"><div><div style="color:var(--muted);font-size:13px;font-weight:600">${title}</div><div class="num" style="font-size:28px;font-weight:800;letter-spacing:-.02em" data-count="${sum(items)}" data-kind="kr">${kr(sum(items))}</div></div>
    <button class="btn lime" data-act="add">${I.plus(16)} Tilføj</button></div>
    ${chart(bars, labels, todayIdx)}
  </section>
  <section class="card" style="margin-top:16px">
    <div class="card-h"><h2>${items.length} køb</h2></div>
    <div class="list">${items.map(rowP).join("") || emptyBox("Ingen køb i perioden", "Scan en kvittering eller tilføj et køb manuelt.")}</div>
  </section>`;
}

function vAbon() {
  const subs = [...state.subs].sort((a, b) => nextPayment(a) - nextPayment(b));
  const total = subsTotal();
  return `
  ${header("Abonnementer", "Faste betalinger og hvornår de trækkes", `<button class="btn primary" data-act="addSub">${I.plus(16)} Nyt abonnement</button>`)}
  <div class="grid kpis" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
    <div class="card kpi hero"><div class="lbl"><span class="dot">${I.repeat(16)}</span>Pr. måned</div><div class="val num" data-count="${total}" data-kind="kr">${kr(total)}</div><div class="foot">${state.subs.length} aktive abonnementer</div></div>
    <div class="card kpi"><div class="lbl"><span class="dot">${I.card(16)}</span>Pr. år</div><div class="val num" data-count="${total * 12}" data-kind="kr">${kr(total * 12)}</div><div class="foot">Hvis intet ændrer sig</div></div>
    <div class="card kpi"><div class="lbl"><span class="dot">${I.bell(16)}</span>Næste betaling</div><div class="val">${subs[0] ? esc(subs[0].name) : "Ingen"}</div><div class="foot">${subs[0] ? `${whenText(nextPayment(subs[0]))} · ${kr(subs[0].amount)}` : "Tilføj dit første abonnement"}</div></div>
  </div>
  <h2 style="font-size:16px;margin:24px 0 12px">Alle abonnementer</h2>
  <div class="subs">${subs.map((s, i) => { const d = nextPayment(s); const n = daysUntil(d);
    return `<button class="sub-card" style="--i:${i}" data-editsub="${s.id}">
      <div class="t"><span class="av">${initial(s.name)}</span><span style="flex:1;min-width:0"><div class="name" style="font-weight:700">${esc(s.name)}</div><div style="font-size:13px;color:var(--muted)">${s.interval === "år" ? "Årligt" : "Månedligt"}</div></span></div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="amt num">${kr(s.amount)}</span><span class="when ${n <= 3 ? "soon" : ""}">${I.bell(13)} ${whenText(d)}</span></div>
    </button>`; }).join("") || `<div class="card">${emptyBox("Ingen abonnementer endnu", "Tilføj Netflix, Spotify eller fitness, så holder Retur øje med betalingerne.")}</div>`}</div>
  ${subs.length ? `<p class="hint" style="text-align:left;margin-top:14px">Påmindelser dagen før en betaling kommer i den færdige app.</p>` : ""}`;
}

function vChat() {
  const left = aiLeft();
  const sugg = ["Hvad bruger jeg mest penge på?", "Hvad koster mine abonnementer om året?", "Hvad betyder et nyt abonnement på 150 kr.?", "Hvordan når jeg mit sparemål?"];
  return `
  ${header("AI-assistent", "Svarer ud fra dine egne tal")}
  <section class="card chatwrap">
    <div class="chatlog" id="chatlog" aria-live="polite">
      <div class="bot"><span class="av">${I.spark(16)}</span><div class="msg">Hej. Jeg kan se dine køb, abonnementer, løn og sparemål i Retur. Hvad vil du vide?</div></div>
      ${chatTurns.length ? "" : `<div class="sugs">${sugg.map(s => `<button data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
      ${chatTurns.map(chatBubble).join("")}
    </div>
    <div class="chatbar">
      <form class="askform" data-form="chat">
        <label class="vh" for="chatIn">Skriv en besked</label>
        <input id="chatIn" placeholder="Skriv en besked..." autocomplete="off" maxlength="600">
        <button class="send" aria-label="Send" ${chatBusy ? "disabled" : ""}>${I.send(18)}</button>
      </form>
      <div class="quota" data-quota>${state.pro ? "Pro: ubegrænset AI" : `${left} af 5 AI-interaktioner tilbage denne måned`}</div>
    </div>
  </section>`;
}
function chatBubble(t) {
  if (t.role === "user") return `<div class="msg u">${esc(t.content)}</div>`;
  const body = t.pending ? `<span class="typing" aria-label="Skriver"><i></i><i></i><i></i></span>` : esc(t.content);
  return `<div class="bot"><span class="av">${I.spark(16)}</span><div class="msg ${t.err ? "err" : ""}">${body}</div></div>`;
}

/* ================= render + motion ================= */
function render() {
  const r = route();
  const v = $("#view");
  const entering = r !== lastRoute;
  lastRoute = r;
  const html = r === "kob" ? vKob() : r === "abonnementer" ? vAbon() : r === "assistent" ? vChat() : vOverblik();
  v.innerHTML = `<div class="page">${html}</div>`;
  $$("[data-tab]").forEach(a => a.dataset.tab === r ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  $$("[data-pro]").forEach(b => b.hidden = !state.pro);
  $("[data-procard]").innerHTML = state.pro
    ? `<b>Retur Pro</b><span class="muted">Ubegrænset AI og sparemål er slået til.</span>`
    : `<b>Gratis</b><span class="muted">${aiLeft()} af 5 AI-interaktioner tilbage. Pro koster 29 kr. om måneden.</span>`;
  if (entering) {
    v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
    window.scrollTo({ top: 0 });
  }
  animateIn(v, entering);
  if (r === "assistent") { const log = $("#chatlog"); if (log) log.scrollTop = log.scrollHeight; }
  flashId = null;
}
const prevCounts = new Map();
function animateIn(root, entering) {
  requestAnimationFrame(() => {
    $$("[data-chart]", root).forEach(c => c.classList.add("in"));
    $$("[data-w]", root).forEach(i => { i.style.width = i.dataset.w + "%"; });
    const pill = $(".seg .pill", root), on = $(".seg [aria-pressed=true]", root);
    if (pill && on) { pill.style.width = on.offsetWidth + "px"; pill.style.transform = `translateX(${on.offsetLeft - 4}px)`; }
  });
  $$("[data-count]", root).forEach((el, idx) => {
    const to = Number(el.dataset.count), kind = el.dataset.kind;
    const key = `${lastRoute}:${idx}`;
    const from = entering ? 0 : (prevCounts.get(key) ?? to);
    prevCounts.set(key, to);
    if (reduced || from === to) return;
    const f = kind === "pct" ? pctf : kr;
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = f(from + (to - from) * e);
      if (k < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = f(to);
    };
    el.textContent = f(from); requestAnimationFrame(step);
  });
}

/* ================= global events ================= */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act],[data-edit],[data-editsub],[data-period],[data-sugg]");
  if (!b || b.closest("#sheetRoot")) return;
  const a = b.dataset.act;
  if (a === "add") openPlus();
  else if (a === "addSub") openForm({ mode: "new", data: { type: "sub", date: iso(today()), interval: "måned", category: "Abonnement" } });
  else if (a === "settings") openSettings();
  else if (a === "clearSample") clearSample();
  else if (a === "prevM") { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); }
  else if (a === "nextM") { const n = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); if (n <= today()) { viewMonth = n; render(); } }
  else if (b.dataset.edit) { const p = state.purchases.find(x => x.id === b.dataset.edit); if (p) openForm({ mode: "edit", data: { ...p, type: "once" } }); }
  else if (b.dataset.editsub) { const s = state.subs.find(x => x.id === b.dataset.editsub); if (s) openForm({ mode: "editsub", data: { id: s.id, store: s.name, amount: s.amount, type: "sub", interval: s.interval, date: iso(nextPayment(s)) } }); }
  else if (b.dataset.period) { period = b.dataset.period; if (period === "måned") { viewMonth = today(); viewMonth.setDate(1); } render(); }
  else if (b.dataset.sugg) sendChat(b.dataset.sugg);
});
document.addEventListener("submit", e => {
  const f = e.target;
  if (f.closest("#sheetRoot")) return;
  e.preventDefault();
  if (f.dataset.form === "quickask") { const q = $("#quickAsk").value.trim(); location.hash = "assistent"; if (q) setTimeout(() => sendChat(q), 60); }
  if (f.dataset.form === "chat") { const inp = $("#chatIn"); const q = inp.value.trim(); if (q) { inp.value = ""; sendChat(q); } }
});

/* ================= chat ================= */
function financeData() {
  const t = today();
  const cur = new Date(t.getFullYear(), t.getMonth(), 1), prev = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const r2 = n => Math.round(n * 100) / 100;
  const byCat = arr => arr.reduce((o, p) => (o[p.category || "Andet"] = r2((o[p.category || "Andet"] || 0) + p.amount), o), {});
  const mk = d => { const ps = monthPurchases(d); return { maaned: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, engangskoeb_i_alt: r2(sum(ps)), pr_kategori: byCat(ps), koeb: ps.slice(0, 40).map(p => ({ butik: p.store, dato: p.date, beloeb: p.amount, kategori: p.category })) }; };
  return {
    dato_i_dag: iso(t), udbetalt_loen_pr_maaned: state.salary, sparemaal_pr_maaned: state.savingsGoal,
    abonnementer: state.subs.map(s => ({ navn: s.name, beloeb: s.amount, interval: s.interval, naeste_betaling: iso(nextPayment(s)) })),
    abonnementer_pr_maaned_i_alt: r2(subsTotal()), denne_maaned: mk(cur), sidste_maaned: mk(prev),
  };
}
function appendChat(t) {
  const log = $("#chatlog"); if (!log) return null;
  $(".sugs", log)?.remove();
  log.insertAdjacentHTML("beforeend", chatBubble(t));
  log.scrollTop = log.scrollHeight;
  return log.lastElementChild;
}
async function sendChat(q) {
  if (chatBusy) return;
  if (route() !== "assistent") { location.hash = "assistent"; await sleep(60); }
  const user = { role: "user", content: q };
  chatTurns.push(user); appendChat(user);
  if (aiLeft() <= 0) {
    const t = { role: "assistant", content: "Du har brugt dine 5 gratis AI-interaktioner denne måned. Med Retur Pro får du ubegrænset AI for 29 kr. om måneden.", err: true };
    chatTurns.push(t); appendChat(t); return;
  }
  const reply = { role: "assistant", content: "", pending: true };
  chatTurns.push(reply);
  const el = appendChat(reply);
  chatBusy = true; const sendBtn = $("[data-form=chat] .send"); if (sendBtn) sendBtn.disabled = true;
  const history = chatTurns.filter(t => !t.err && !t.pending).slice(-10).map(t => ({ role: t.role, content: t.content }));
  while (history.length && history[0].role !== "user") history.shift();
  useAi();
  try {
    const { text } = await api("/api/chat", { messages: history, data: financeData() });
    reply.content = String(text || "").replace(/\*\*/g, "").trim() || "Jeg fik ikke noget svar. Prøv igen.";
  } catch (e) {
    refundAi(); reply.content = aiErr(e && e.code); reply.err = true;
  }
  reply.pending = false; chatBusy = false;
  const msg = el && $(".msg", el);
  if (msg) {
    msg.classList.toggle("err", !!reply.err);
    if (reduced || reply.err) msg.textContent = reply.content;
    else await typeOut(msg, reply.content);
  }
  if (sendBtn && sendBtn.isConnected) sendBtn.disabled = false;
  const q2 = $("[data-quota]"); if (q2) q2.textContent = state.pro ? "Pro: ubegrænset AI" : `${aiLeft()} af 5 AI-interaktioner tilbage denne måned`;
  $("#chatIn")?.focus();
}
async function typeOut(el, text) {
  const log = $("#chatlog");
  const words = text.split(/(\s+)/);
  el.textContent = "";
  for (let i = 0; i < words.length; i += 2) {
    if (!el.isConnected) return;
    el.textContent += words.slice(i, i + 2).join("");
    if (log) log.scrollTop = log.scrollHeight;
    await sleep(14);
  }
}

/* ================= sheets ================= */
let sheetCtl = null;
function sheet(html, onMount) {
  const root = $("#sheetRoot");
  const wasOpen = !!root.firstElementChild;
  root.innerHTML = `<div class="scrim ${wasOpen ? "open" : ""}"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body ${wasOpen ? "fade-swap" : ""}">${html}</div></div></div>`;
  const sc = root.firstElementChild;
  if (!wasOpen) requestAnimationFrame(() => requestAnimationFrame(() => sc.classList.add("open")));
  sc.addEventListener("click", e => { if (e.target === sc || e.target.closest("[data-x]")) closeSheet(); });
  document.addEventListener("keydown", escClose);
  onMount && onMount(sc.querySelector(".sheet"));
  setTimeout(() => sc.querySelector("input:not([type=radio]):not([type=checkbox]), button")?.focus({ preventScroll: true }), wasOpen ? 0 : 260);
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }
function closeSheet() {
  sheetCtl?.abort(); sheetCtl = null;
  const sc = $("#sheetRoot .scrim"); if (!sc) return;
  document.removeEventListener("keydown", escClose);
  sc.classList.remove("open");
  setTimeout(() => { if (sc.isConnected) sc.remove(); }, reduced ? 0 : 320);
}
const head = t => `<div class="sheet-h"><h3>${t}</h3><button class="icon-btn" data-x aria-label="Luk">${I.x(20)}</button></div>`;

function openPlus() {
  const left = aiLeft();
  sheet(`${head("Tilføj betaling")}
    <div class="opts">
      <button class="opt" data-pick="cam"><span class="ic">${I.cam(22)}</span><span class="grow"><div class="t">Tag et billede</div><div class="d">Scan din kvittering med kameraet</div></span>${I.right(18)}</button>
      <button class="opt" data-pick="file"><span class="ic">${I.doc(22)}</span><span class="grow"><div class="t">Upload kvittering</div><div class="d">Vælg et billede eller skærmbillede</div></span>${I.right(18)}</button>
      <button class="opt" data-pick="manual"><span class="ic">${I.pen(22)}</span><span class="grow"><div class="t">Tilføj manuelt</div><div class="d">Engangskøb eller abonnement</div></span>${I.right(18)}</button>
    </div>
    <p class="hint">${state.pro ? "Pro: ubegrænset kvitteringsscanning" : `${left} af 5 AI-interaktioner tilbage denne måned`}</p>`,
    el => el.addEventListener("click", e => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      if (b.dataset.pick === "manual") return openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } });
      if (aiLeft() <= 0) return toast("Du har brugt dine 5 gratis AI-interaktioner. Opgrader til Pro.", false);
      (b.dataset.pick === "cam" ? $("#camInput") : $("#fileInput")).click();
    }));
}
["#camInput", "#fileInput"].forEach(s => $(s).addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanReceipt(f); }));

const SCAN_STEPS = ["Finder kvitteringen", "Læser butik og dato", "Finder totalbeløbet", "Tjekker tallene"];
async function scanReceipt(file) {
  const url = URL.createObjectURL(file);
  sheet(`${head("Scanner kvittering")}
    <div class="scan"><img src="${url}" alt="Dit billede af kvitteringen"><span class="c c1"></span><span class="c c2"></span><span class="c c3"></span><span class="c c4"></span><span class="beam"></span></div>
    <div class="scan-status" id="scanStatus"><span class="spin"></span><span id="scanStep">${SCAN_STEPS[0]}</span></div>
    <button class="btn ghost block" data-x style="margin-top:14px">Annuller</button>`);
  sheetCtl = new AbortController();
  const ctl = sheetCtl;
  let si = 0;
  const stepT = setInterval(() => { const s = $("#scanStep"); if (!s) return clearInterval(stepT); si = Math.min(si + 1, SCAN_STEPS.length - 1); s.textContent = SCAN_STEPS[si]; s.classList.remove("fade-swap"); void s.offsetWidth; s.classList.add("fade-swap"); }, 1300);
  useAi();
  try {
    const image = await shrinkImage(file);
    if (ctl.signal.aborted) throw { code: "cancelled" };
    const r = await api("/api/receipt", { image, mediaType: "image/jpeg", today: iso(today()) }, ctl.signal);
    clearInterval(stepT);
    if (ctl.signal.aborted) return;
    URL.revokeObjectURL(url);
    if (!r || r.erKvittering === false) {
      return sheet(`${head("Ingen kvittering fundet")}<p style="margin:0 0 16px;color:var(--ink-2)">${esc(r?.note || "Billedet ligner ikke en kvittering.")}</p>
        <div class="form"><button class="btn primary block" data-retry>Prøv et andet billede</button><button class="btn ghost block" data-manual>Indtast selv</button></div>`,
        el => el.addEventListener("click", e => { if (e.target.closest("[data-retry]")) openPlus(); if (e.target.closest("[data-manual]")) openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } }); }));
    }
    const okDate = typeof r.dato === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dato) && !isNaN(parseISO(r.dato));
    const total = Number(r.total);
    openForm({ mode: "new", fromAi: true, low: r.sikkerhed === "lav" || !okDate || !isFinite(total) || total <= 0, data: {
      store: typeof r.butik === "string" ? r.butik : "", date: okDate ? r.dato : iso(today()), amount: isFinite(total) && total > 0 ? total : "",
      category: CATS.includes(r.kategori) ? r.kategori : "Andet", type: r.erAbonnement ? "sub" : "once", interval: r.interval === "år" ? "år" : "måned" } });
  } catch (e) {
    clearInterval(stepT);
    refundAi();
    if (e && e.code === "cancelled") return;
    const st = $("#scanStatus"); if (!st) return;
    $(".scan .beam")?.remove();
    st.innerHTML = `<span class="err-text">${esc(aiErr(e && e.code))}</span>`;
    const b = document.createElement("button"); b.className = "btn primary block"; b.style.marginTop = "12px"; b.textContent = "Indtast selv";
    b.onclick = () => openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } });
    st.after(b);
  }
}

function openForm({ mode, data, fromAi, low }) {
  const isSubEdit = mode === "editsub";
  const t = data.type || "once";
  const ai = fromAi ? "ai" : "";
  const title = fromAi ? "Tjek oplysninger" : mode === "new" ? (t === "sub" ? "Nyt abonnement" : "Ny betaling") : isSubEdit ? "Ret abonnement" : "Ret køb";
  sheet(`${head(title)}
    ${fromAi ? `<div style="margin:-4px 0 14px"><span class="chip">${I.spark(14)} Aflæst fra kvittering</span></div>` : ""}
    ${low ? `<div class="notice warn" style="margin-bottom:12px">Kvitteringen var svær at læse. Tjek felterne ekstra grundigt.</div>` : ""}
    <form id="payForm" class="form" novalidate>
      ${mode === "new" ? `<div class="radios" role="radiogroup" aria-label="Betalingstype"><label class="radio"><input type="radio" name="fType" value="once" ${t !== "sub" ? "checked" : ""}> Engangskøb</label><label class="radio"><input type="radio" name="fType" value="sub" ${t === "sub" ? "checked" : ""}> Abonnement</label></div>` : ""}
      <label class="field ${ai}"><span id="fStoreLbl">${t === "sub" ? "Navn" : "Butik"}</span><input id="fStore" required value="${esc(data.store || "")}" autocomplete="off" placeholder="${t === "sub" ? "Fx Netflix" : "Fx Netto"}"></label>
      <div class="two">
        <label class="field ${ai}"><span>Beløb (kr.)</span><input id="fAmount" class="num" inputmode="decimal" required value="${data.amount === "" || data.amount == null ? "" : String(data.amount).replace(".", ",")}" placeholder="0,00"></label>
        <label class="field ${ai}"><span id="fDateLbl">${t === "sub" ? "Næste betaling" : "Dato"}</span><input id="fDate" type="date" required value="${esc(data.date || iso(today()))}"></label>
      </div>
      <label class="field" id="catWrap" ${t === "sub" ? "hidden" : ""}><span>Kategori</span><select id="fCat">${CATS.filter(c => c !== "Abonnement").map(c => `<option ${c === data.category ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      <label class="field" id="intWrap" ${t === "sub" ? "" : "hidden"}><span>Interval</span><select id="fInt"><option value="måned" ${data.interval !== "år" ? "selected" : ""}>Månedligt</option><option value="år" ${data.interval === "år" ? "selected" : ""}>Årligt</option></select></label>
      <p id="fErr" class="err-text" hidden></p>
      <button class="btn primary block" type="submit" id="fSubmit">${mode === "new" ? (t === "sub" ? "Gem abonnement" : "Tilføj betaling") : "Gem ændringer"}</button>
      ${mode !== "new" ? `<button class="btn danger block" type="button" data-del>Slet</button>` : `<p class="hint" style="margin:0">Du kan rette alle felter</p>`}
    </form>`, el => {
    const f = $("#payForm", el);
    f.addEventListener("change", e => {
      if (e.target.name !== "fType") return;
      const sub = e.target.value === "sub";
      $("#intWrap", el).hidden = !sub; $("#catWrap", el).hidden = sub;
      $("#fDateLbl", el).textContent = sub ? "Næste betaling" : "Dato";
      $("#fStoreLbl", el).textContent = sub ? "Navn" : "Butik";
      $("#fSubmit", el).textContent = sub ? "Gem abonnement" : "Tilføj betaling";
    });
    f.addEventListener("submit", async e => {
      e.preventDefault();
      const store = $("#fStore", el).value.trim();
      const date = $("#fDate", el).value;
      const amount = Number($("#fAmount", el).value.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      const type = isSubEdit ? "sub" : mode === "edit" ? "once" : (f.querySelector("input[name=fType]:checked")?.value || "once");
      const err = !store ? "Skriv et navn." : !date ? "Vælg en dato." : !(amount > 0) || amount > 1e6 ? "Skriv et beløb over 0 kr." : "";
      const p = $("#fErr", el);
      if (err) { p.hidden = false; p.textContent = err; p.style.animation = "none"; void p.offsetWidth; p.style.animation = ""; return; }
      const btn = $("#fSubmit", el); btn.disabled = true; btn.innerHTML = `<span class="spin"></span>`;
      await sleep(reduced ? 0 : 280);
      if (type === "sub") {
        const d = parseISO(date), interval = $("#fInt", el).value;
        const rec = { id: data.id || uid(), name: store, amount, interval, day: d.getDate(), nextDate: date, remind: true };
        if (isSubEdit) state.subs = state.subs.map(s => s.id === rec.id ? { ...s, ...rec } : s); else state.subs.push(rec);
        save(); closeSheet(); toast(isSubEdit ? "Abonnement gemt" : "Abonnement tilføjet");
        if (route() !== "abonnementer" && !isSubEdit) location.hash = "abonnementer"; else render();
      } else {
        const rec = { id: data.id || uid(), store, date, amount, category: $("#fCat", el).value };
        if (mode === "edit") state.purchases = state.purchases.map(x => x.id === rec.id ? { ...x, ...rec } : x); else state.purchases.push(rec);
        const d = parseISO(date); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); if (viewMonth > today()) { viewMonth = today(); viewMonth.setDate(1); }
        flashId = rec.id;
        save(); closeSheet(); toast(mode === "edit" ? "Køb gemt" : "Betaling tilføjet"); render();
      }
    });
    el.querySelector("[data-del]")?.addEventListener("click", e => {
      const b = e.currentTarget;
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tryk igen for at slette"; return; }
      if (isSubEdit) state.subs = state.subs.filter(s => s.id !== data.id); else state.purchases = state.purchases.filter(x => x.id !== data.id);
      save(); closeSheet(); render(); toast("Slettet");
    });
  });
}

function clearSample() {
  state.purchases = state.purchases.filter(p => !p.sample); state.subs = state.subs.filter(s => !s.sample); state.hasSample = false;
  chatTurns = []; save(); render(); toast("Eksempeldata ryddet");
}
function openSettings() {
  sheet(`${head("Indstillinger")}
    <form id="setForm" class="form" novalidate>
      <div class="two">
        <label class="field"><span>Udbetalt løn pr. måned</span><input id="sSal" class="num" inputmode="numeric" value="${state.salary}"></label>
        <label class="field"><span>Sparemål pr. måned</span><input id="sGoal" class="num" inputmode="numeric" value="${state.savingsGoal}"></label>
      </div>
      <div class="setrow"><span style="flex:1"><div style="font-weight:700">Retur Pro</div><div style="font-size:13px;color:var(--muted)">29 kr. om måneden. Ubegrænset AI, sparemål og løn i procent. Slå fra for at se gratisversionen.</div></span>
        <label class="toggle"><input type="checkbox" id="sPro" ${state.pro ? "checked" : ""} aria-label="Retur Pro"><span></span></label></div>
      <button class="btn primary block" type="submit">Gem</button>
      ${state.hasSample ? `<button class="btn ghost block" type="button" data-clear>Ryd eksempeldata</button>` : `<button class="btn ghost block" type="button" data-sample>Indlæs eksempeldata</button>`}
      <p class="hint" style="margin:0">Dine data gemmes kun i denne browser.</p>
    </form>`, el => {
    $("#setForm", el).addEventListener("submit", e => {
      e.preventDefault();
      const n = v => Math.max(0, Number(String(v).replace(/[^\d,]/g, "").replace(",", ".")) || 0);
      state.salary = n($("#sSal", el).value); state.savingsGoal = n($("#sGoal", el).value); state.pro = $("#sPro", el).checked;
      save(); closeSheet(); render(); toast("Indstillinger gemt");
    });
    el.querySelector("[data-clear]")?.addEventListener("click", e => {
      const b = e.currentTarget;
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tryk igen for at rydde"; return; }
      closeSheet(); clearSample();
    });
    el.querySelector("[data-sample]")?.addEventListener("click", () => {
      const s = sampleState(); state.purchases = [...state.purchases, ...s.purchases]; state.subs = [...state.subs, ...s.subs]; state.hasSample = true;
      save(); closeSheet(); render(); toast("Eksempeldata indlæst");
    });
  });
}

/* ================= toast ================= */
function toast(msg, ok = true) {
  const box = $("#toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = `${ok ? `<span class="ok">${I.check(13)}</span>` : ""}<span></span>`;
  t.lastElementChild.textContent = msg;
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 260); }, 2600);
}

render();
})();
