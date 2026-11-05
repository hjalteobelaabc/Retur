(() => {
"use strict";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const kr = n => new Intl.NumberFormat("da-DK", { maximumFractionDigits: Math.abs(n) % 1 ? 2 : 0, minimumFractionDigits: Math.abs(n) % 1 ? 2 : 0 }).format(Math.round(n * 100) / 100) + " kr.";
const pctf = n => new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(n) + " %";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const dkDate = s => { const d = parseISO(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const MONTHS = ["Januar","Februar","Marts","April","Maj","Juni","Juli","August","September","Oktober","November","December"];
const MON3 = ["jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const CATS = ["Dagligvarer","Mad ude","Transport","Tøj","Underholdning","Abonnement","Bolig","Sundhed","Andet"];
const ymKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

/* ---------- state ---------- */
const STORE_KEY = "retur-demo-v1";
function sampleState() {
  const t = today();
  const y = t.getFullYear(), m = t.getMonth();
  const day = (offM, d) => iso(new Date(y, m + offM, Math.min(d, new Date(y, m + offM + 1, 0).getDate())));
  const P = (store, offM, d, amount, category) => ({ id: uid(), store, date: day(offM, d), amount, category, sample: true });
  const tday = t.getDate();
  const cur = [
    P("Netto", 0, 1, 18, "Dagligvarer"), P("Rejsekort", 0, 2, 150, "Transport"), P("Føtex", 0, 3, 312.5, "Dagligvarer"),
    P("Joe & The Juice", 0, 4, 69, "Mad ude"), P("H&M", 0, 5, 349, "Tøj"), P("Lidl", 0, 5, 186.75, "Dagligvarer"),
  ].filter(p => parseISO(p.date) <= t || tday < 2);
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
if (!state || !Array.isArray(state.purchases)) state = sampleState();
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {} }

let viewMonth = today(); viewMonth.setDate(1);
let period = "måned";
let chatTurns = [];
let chatBusy = false;

/* ---------- derived ---------- */
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
const inMonth = (p, d) => { const x = parseISO(p.date); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); };
const monthPurchases = d => state.purchases.filter(p => inMonth(p, d)).sort((a, b) => b.date.localeCompare(a.date));
const sum = arr => arr.reduce((a, p) => a + Number(p.amount || 0), 0);

function aiLeft() {
  const k = ymKey(today());
  if (state.ai.month !== k) { state.ai = { month: k, count: 0 }; save(); }
  return state.pro ? Infinity : Math.max(0, 5 - state.ai.count);
}
function useAi() { aiLeft(); state.ai.count++; save(); }

/* ---------- AI via egen server (/api) ---------- */
const sampleFn = true, canImages = true, aiReady = true;
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
// Gør billedet mindre før upload (max 1568 px på længste led, JPEG). Sparer tokens og holder os under Vercels grænse.
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
  image_rejected: "Billedet kunne ikke læses. Prøv et andet billede.",
  too_large: "Billedet er for stort. Prøv et andet billede.",
  invalid_json: "AI kunne ikke aflæse kvitteringen. Prøv et skarpere billede.",
  not_configured: "AI er ikke sat op endnu. API-nøglen mangler på serveren.",
  bad_request: "Forespørgslen var ugyldig. Prøv igen.",
}[code] || "Noget gik galt. Prøv igen.");

/* ---------- icons ---------- */
const I = {
  wallet: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4z"/><path d="M4 7l11-3v3"/><path d="M16 13.5h1.5"/></svg>',
  card: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>',
  repeat: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/></svg>',
  pig: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M5 11a7 6 0 0 1 12.5-2.5L20 8l-.5 3.5A6 6 0 0 1 17 16v3h-3v-2h-3v2H8v-3a6 6 0 0 1-3-5z"/><circle cx="15.5" cy="10.5" r=".6" fill="currentColor"/></svg>',
  chev: '<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  left: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6l6 6-6 6"/></svg>',
  bubble: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 12a8 7 0 1 1 3.5 5.8L4 19l1-3.3A6.8 6.8 0 0 1 4 12z"/></svg>',
  send: '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 20l18-8L3 4l2.5 8z"/></svg>',
  cam: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  doc: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>',
  pen: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20l4-1 11-11-3-3L5 16z"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
  bot: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 4v4"/><circle cx="9.5" cy="13.5" r="1" fill="currentColor"/><circle cx="14.5" cy="13.5" r="1" fill="currentColor"/></svg>',
  x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const initial = s => esc((String(s || "?").trim()[0] || "?").toUpperCase());

/* ---------- routing ---------- */
const VIEWS = ["overblik", "kob", "abonnementer", "assistent"];
const route = () => { const h = location.hash.replace("#", ""); return VIEWS.includes(h) ? h : "overblik"; };
window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

/* ---------- views ---------- */
function vOverblik() {
  const mp = monthPurchases(viewMonth);
  const once = sum(mp);
  const subs = subsTotal();
  const total = once + subs;
  const pct = state.salary > 0 ? total / state.salary * 100 : 0;
  const left = state.salary - total;
  const isCur = ymKey(viewMonth) === ymKey(today());
  return `
  ${state.hasSample ? `<div class="notice" style="margin-top:4px"><b>Eksempeldata.</b> Tallene er opdigtede, så du kan prøve appen. Ryd dem under indstillinger.</div>` : ""}
  <h1>Dit overblik</h1>
  <div class="month">
    <button class="iconbtn" data-act="prevM" aria-label="Forrige måned">${I.left}</button>
    <strong>${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}</strong>
    <button class="iconbtn" data-act="nextM" aria-label="Næste måned" ${isCur ? "disabled style='opacity:.3'" : ""}>${I.right}</button>
  </div>
  <div class="stack">
    <button class="card tap row" data-act="settings">
      <span class="ico">${I.wallet}</span>
      <span class="grow"><span class="label">Udbetalt løn</span><div class="big">${kr(state.salary)}</div></span>${I.chev}
    </button>
    <a class="card tap row" href="#kob" style="text-decoration:none;color:inherit">
      <span class="ico">${I.card}</span>
      <span class="grow"><span class="label">Registreret forbrug</span><div class="big">${kr(total)}</div>
        ${state.pro ? `<div class="pct">${pctf(pct)}</div><div class="sub" style="color:var(--ink)">af din udbetalte løn</div>` : ""}
        <div class="sub" style="margin-top:6px">Engangskøb ${kr(once)} · Abonnementer ${kr(subs)}</div></span>${I.chev}
    </a>
    ${state.pro ? `
    <div class="card">
      <div style="font-weight:700;font-size:19px;margin-bottom:10px">Din opsparing</div>
      <button class="row tap" data-act="settings" style="background:none;border:0;padding:0">
        <span class="ico">${I.pig}</span>
        <span class="grow"><span class="label">Mål pr. måned</span><div class="big" style="font-size:26px">${kr(state.savingsGoal)}</div></span>${I.chev}
      </button>
      <div class="sub" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;color:var(--ink)">
        ${left >= state.savingsGoal ? `Du har <b>${kr(left)}</b> tilbage. Du når dit mål.` : left > 0 ? `Du har <b>${kr(left)}</b> tilbage. Du mangler ${kr(state.savingsGoal - left)} for at nå dit mål.` : `Dit forbrug er ${kr(-left)} over din løn.`}
      </div>
    </div>` : ""}
  </div>
  <h2>Seneste køb</h2>
  <div class="card list" style="padding-block:4px">
    ${mp.slice(0, 5).map(itemRow).join("") || `<div class="empty">Ingen køb i ${MONTHS[viewMonth.getMonth()].toLowerCase()}. Tryk på plus for at tilføje.</div>`}
  </div>
  <form class="ask" data-form="quickask">
    <span style="color:var(--muted);display:grid">${I.bubble}</span>
    <label class="vh" for="quickAsk">Spørg om din økonomi</label>
    <input id="quickAsk" placeholder="Spørg om din økonomi..." autocomplete="off">
    <button class="send" aria-label="Send">${I.send}</button>
  </form>`;
}
function itemRow(p) {
  return `<button class="item" data-edit="${p.id}"><span class="av">${initial(p.store)}</span>
    <span class="grow"><div class="name">${esc(p.store)}</div><div class="meta">${dkDate(p.date)} · ${esc(p.category || "Andet")}</div></span>
    <span class="amt">${kr(p.amount)}</span></button>`;
}

function vKob() {
  const t = today();
  let items, bars, labels, title;
  if (period === "uge") {
    const start = new Date(t); start.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d); });
    items = state.purchases.filter(p => days.includes(p.date));
    bars = days.map(d => sum(items.filter(p => p.date === d)));
    labels = ["man", "søn"]; title = "Denne uge";
  } else if (period === "år") {
    const y = t.getFullYear();
    items = state.purchases.filter(p => parseISO(p.date).getFullYear() === y);
    bars = [...Array(12)].map((_, m) => sum(items.filter(p => parseISO(p.date).getMonth() === m)));
    labels = ["jan", "dec"]; title = String(y);
  } else {
    items = monthPurchases(viewMonth);
    const n = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    bars = [...Array(n)].map((_, i) => sum(items.filter(p => parseISO(p.date).getDate() === i + 1)));
    labels = ["1.", n + "."]; title = `${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  }
  items = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const max = Math.max(1, ...bars);
  return `
  <h1>Køb</h1>
  <div class="seg" role="group" aria-label="Periode">
    ${["uge", "måned", "år"].map(p => `<button data-period="${p}" aria-pressed="${period === p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join("")}
  </div>
  <div class="card" style="margin-top:12px">
    <div class="label">${title} · engangskøb</div>
    <div class="big">${kr(sum(items))}</div>
    <div class="chart" role="img" aria-label="Forbrug fordelt på ${period === "år" ? "måneder" : "dage"}">
      ${bars.map((v, i) => `<div class="b ${v ? "" : "zero"}" style="height:${v ? Math.max(4, v / max * 100) : 2}%" title="${v ? kr(v) : "0 kr."}"></div>`).join("")}
    </div>
    <div class="chart-x"><span>${labels[0]}</span><span>${labels[1]}</span></div>
  </div>
  <h2>${items.length} ${items.length === 1 ? "køb" : "køb"}</h2>
  <div class="card list" style="padding-block:4px">${items.map(itemRow).join("") || `<div class="empty">Ingen køb i perioden.</div>`}</div>`;
}

function vAbon() {
  const subs = [...state.subs].sort((a, b) => nextPayment(a) - nextPayment(b));
  return `
  <h1>Abonnementer</h1>
  <div class="card row" style="background:var(--lime);border-color:var(--lime-2)">
    <span class="ico" style="background:var(--card)">${I.repeat}</span>
    <span class="grow"><div class="big">${kr(subsTotal())}</div><div class="sub" style="color:var(--ink)">om måneden · ${kr(subsTotal() * 12)} om året</div></span>
  </div>
  <h2>Næste betalinger</h2>
  <div class="card list" style="padding-block:4px">
    ${subs.map(s => { const d = nextPayment(s); const days = Math.round((d - today()) / 864e5);
      return `<button class="item" data-editsub="${s.id}"><span class="av">${initial(s.name)}</span>
      <span class="grow"><div class="name">${esc(s.name)}</div><div class="meta">${days === 0 ? "I dag" : days === 1 ? "I morgen" : `${d.getDate()}. ${MON3[d.getMonth()]}`} · ${s.interval === "år" ? "årligt" : "månedligt"}</div></span>
      <span class="amt">${kr(s.amount)}</span></button>`; }).join("") || `<div class="empty">Ingen abonnementer endnu. Tryk på plus og vælg abonnement.</div>`}
  </div>
  ${subs.length ? `<p class="hint" style="text-align:left">Påmindelser dagen før en betaling kommer i den færdige app.</p>` : ""}`;
}

function vChat() {
  const left = aiLeft();
  const sugg = ["Hvad bruger jeg mest penge på?", "Hvad koster mine abonnementer om året?", "Hvad betyder et nyt abonnement på 150 kr. om måneden?", "Hvordan når jeg mit sparemål?"];
  return `
  <h1 style="display:flex;align-items:center;gap:10px">Din AI-assistent</h1>
  <div class="chat" id="chat">
    ${chatTurns.length ? "" : `<div class="bot"><span class="av">${I.bot}</span><div class="msg a">Hej. Jeg kan se dine køb, abonnementer, løn og sparemål i Retur. Spørg mig om dit forbrug.</div></div>
      <div class="sugs">${sugg.map(s => `<button data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
    ${chatTurns.map(t => t.role === "user" ? `<div class="msg u">${esc(t.content)}</div>` : `<div class="bot"><span class="av">${I.bot}</span><div class="msg a ${t.err ? "err" : ""}">${esc(t.content)}</div></div>`).join("")}
  </div>
  <div class="chatbar">
    <form class="ask" data-form="chat" style="margin-top:6px">
      <span style="color:var(--muted);display:grid">${I.bubble}</span>
      <label class="vh" for="chatIn">Skriv en besked</label>
      <input id="chatIn" placeholder="Skriv en besked..." autocomplete="off" ${chatBusy ? "disabled" : ""}>
      <button class="send" aria-label="Send" ${chatBusy ? "disabled" : ""}>${I.send}</button>
    </form>
    <div class="quota">${state.pro ? "Pro: ubegrænset AI" : `${left} af 5 AI-interaktioner tilbage denne måned`}</div>
  </div>`;
}

function render() {
  const r = route();
  const v = $("#view");
  v.innerHTML = r === "kob" ? vKob() : r === "abonnementer" ? vAbon() : r === "assistent" ? vChat() : vOverblik();
  document.querySelectorAll("nav.tabs a").forEach(a => { if (a.dataset.tab === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  $("#proBadge").hidden = !state.pro;
  if (r === "assistent") { const c = $("#chat"); if (c && chatTurns.length) c.lastElementChild?.scrollIntoView({ block: "end" }); }
}

/* ---------- events in view ---------- */
$("#view").addEventListener("click", e => {
  const b = e.target.closest("[data-act],[data-edit],[data-editsub],[data-period],[data-sugg]");
  if (!b) return;
  if (b.dataset.act === "prevM") { viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); render(); }
  else if (b.dataset.act === "nextM") { const n = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); if (n <= today()) { viewMonth = n; render(); } }
  else if (b.dataset.act === "settings") openSettings();
  else if (b.dataset.edit) { const p = state.purchases.find(x => x.id === b.dataset.edit); if (p) openForm({ mode: "edit", data: { ...p, type: "once" } }); }
  else if (b.dataset.editsub) { const s = state.subs.find(x => x.id === b.dataset.editsub); if (s) openForm({ mode: "editsub", data: { id: s.id, store: s.name, amount: s.amount, type: "sub", interval: s.interval, date: iso(nextPayment(s)), category: "Abonnement" } }); }
  else if (b.dataset.period) { period = b.dataset.period; if (period === "måned") { viewMonth = today(); viewMonth.setDate(1); } render(); }
  else if (b.dataset.sugg) sendChat(b.dataset.sugg);
});
$("#view").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  if (f.dataset.form === "quickask") { const q = $("#quickAsk").value.trim(); location.hash = "assistent"; if (q) setTimeout(() => sendChat(q), 0); }
  if (f.dataset.form === "chat") { const q = $("#chatIn").value.trim(); if (q) sendChat(q); }
});

/* ---------- chat ---------- */
function financeData() {
  const t = today();
  const cur = new Date(t.getFullYear(), t.getMonth(), 1);
  const prev = new Date(t.getFullYear(), t.getMonth() - 1, 1);
  const byCat = arr => arr.reduce((o, p) => (o[p.category || "Andet"] = Math.round(((o[p.category || "Andet"] || 0) + p.amount) * 100) / 100, o), {});
  const mk = d => { const ps = monthPurchases(d); return { maaned: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, engangskoeb_i_alt: Math.round(sum(ps) * 100) / 100, pr_kategori: byCat(ps), koeb: ps.slice(0, 40).map(p => ({ butik: p.store, dato: p.date, beloeb: p.amount, kategori: p.category })) }; };
  return {
    dato_i_dag: iso(t),
    udbetalt_loen_pr_maaned: state.salary,
    sparemaal_pr_maaned: state.savingsGoal,
    abonnementer: state.subs.map(s => ({ navn: s.name, beloeb: s.amount, interval: s.interval, naeste_betaling: iso(nextPayment(s)) })),
    abonnementer_pr_maaned_i_alt: Math.round(subsTotal() * 100) / 100,
    denne_maaned: mk(cur),
    sidste_maaned: mk(prev),
  };
}
async function sendChat(q) {
  if (chatBusy) return;
  if (aiLeft() <= 0) { chatTurns.push({ role: "user", content: q }, { role: "assistant", content: "Du har brugt dine 5 gratis AI-interaktioner denne måned. Med Retur Pro får du ubegrænset AI for 29 kr. om måneden.", err: true }); render(); return; }
  chatTurns.push({ role: "user", content: q });
  const reply = { role: "assistant", content: "Tænker..." };
  chatTurns.push(reply);
  chatBusy = true; render();
  const history = chatTurns.slice(0, -1).filter(t => !t.err).slice(-10).map(t => ({ role: t.role, content: t.content }));
  while (history.length && history[0].role !== "user") history.shift();
  try {
    useAi();
    const { text } = await api("/api/chat", { messages: history, data: financeData() });
    reply.content = String(text || "").replace(/\*\*/g, "");
  } catch (e) {
    state.ai.count = Math.max(0, state.ai.count - 1);
    reply.content = aiErr(e && e.code); reply.err = true;
  } finally { chatBusy = false; save(); render(); setTimeout(() => $("#chatIn")?.focus(), 0); }
}

/* ---------- sheets ---------- */
function sheet(html, onMount) {
  const root = $("#sheetRoot");
  root.innerHTML = `<div class="scrim" data-close><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;
  const sc = root.firstElementChild;
  sc.addEventListener("click", e => { if (e.target === sc || e.target.closest("[data-x]")) closeSheet(); });
  document.addEventListener("keydown", escClose);
  onMount && onMount(sc.firstElementChild);
  sc.querySelector("button, input")?.focus({ preventScroll: true });
}
function escClose(e) { if (e.key === "Escape") closeSheet(); }
function closeSheet() { scanCtl?.abort(); scanCtl = null; $("#sheetRoot").innerHTML = ""; document.removeEventListener("keydown", escClose); }
const head = t => `<div class="sheet-h"><h3>${t}</h3><button class="iconbtn" data-x aria-label="Luk">${I.x}</button></div>`;

function openPlus() {
  const aiOk = sampleFn && canImages;
  const left = aiLeft();
  sheet(`${head("Tilføj betaling")}
    <div class="stack" style="margin-top:8px">
      <button class="opt" data-pick="cam" ${aiOk ? "" : 'aria-disabled="true"'}><span class="ico">${I.cam}</span><span class="grow"><div class="t">Tag et billede</div><div class="d">Scan din kvittering</div></span>${I.chev}</button>
      <button class="opt" data-pick="file" ${aiOk ? "" : 'aria-disabled="true"'}><span class="ico">${I.doc}</span><span class="grow"><div class="t">Upload kvittering</div><div class="d">Vælg et billede eller skærmbillede</div></span>${I.chev}</button>
      <button class="opt" data-pick="manual"><span class="ico">${I.pen}</span><span class="grow"><div class="t">Tilføj manuelt</div><div class="d">Skriv oplysningerne selv</div></span>${I.chev}</button>
    </div>
    <p class="hint">${state.pro ? "Pro: ubegrænset kvitteringsscanning" : `${left} af 5 AI-interaktioner tilbage denne måned`}</p>`,
    el => el.addEventListener("click", e => {
      const b = e.target.closest("[data-pick]"); if (!b) return;
      if (b.dataset.pick === "manual") return openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } });
      if (!aiOk) return;
      if (aiLeft() <= 0) return toast("Du har brugt dine 5 gratis AI-interaktioner. Opgrader til Pro.");
      (b.dataset.pick === "cam" ? $("#camInput") : $("#fileInput")).click();
    }));
}
$("#plusBtn").addEventListener("click", openPlus);
["#camInput", "#fileInput"].forEach(s => $(s).addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; if (f) scanReceipt(f); }));

let scanCtl = null;
async function scanReceipt(file) {
  const url = URL.createObjectURL(file);
  sheet(`${head("Scan kvittering")}
    <div class="scan"><img src="${url}" alt="Dit billede af kvitteringen"><span class="c c1"></span><span class="c c2"></span><span class="c c3"></span><span class="c c4"></span><span class="line"></span></div>
    <div class="scanbar" id="scanStatus">Aflæser butik, dato og beløb...</div>
    <button class="ghost" data-x style="margin-top:12px">Annuller</button>`);
  scanCtl = new AbortController();
  const ctl = scanCtl;
  try {
    useAi();
    const image = await shrinkImage(file);
    if (ctl.signal.aborted) return;
    const r = await api("/api/receipt", { image, mediaType: "image/jpeg", today: iso(today()) }, ctl.signal);
    if (ctl.signal.aborted) return;
    URL.revokeObjectURL(url);
    if (!r || r.erKvittering === false) {
      return sheet(`${head("Ingen kvittering fundet")}<p>${esc(r?.note || "Billedet ligner ikke en kvittering.")}</p><div class="stack"><button class="primary" data-retry>Prøv et andet billede</button><button class="ghost" data-manual>Indtast selv</button></div>`,
        el => el.addEventListener("click", e => { if (e.target.closest("[data-retry]")) openPlus(); if (e.target.closest("[data-manual]")) openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } }); }));
    }
    const okDate = typeof r.dato === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dato) && !isNaN(parseISO(r.dato));
    const total = Number(r.total);
    openForm({ mode: "new", fromAi: true, low: r.sikkerhed === "lav" || !okDate || !isFinite(total), data: {
      store: typeof r.butik === "string" ? r.butik : "", date: okDate ? r.dato : iso(today()), amount: isFinite(total) ? total : "",
      category: CATS.includes(r.kategori) ? r.kategori : "Andet", type: r.erAbonnement ? "sub" : "once", interval: r.interval === "år" ? "år" : "måned" } });
  } catch (e) {
    if (e && e.code === "cancelled") return;
    state.ai.count = Math.max(0, state.ai.count - 1); save();
    const st = $("#scanStatus"); if (!st) return;
    st.textContent = aiErr(e && e.code);
    $(".scan .line")?.remove();
    const b = document.createElement("button"); b.className = "primary"; b.style.marginTop = "12px"; b.textContent = "Indtast selv";
    b.onclick = () => openForm({ mode: "new", data: { type: "once", date: iso(today()), category: "Andet" } });
    st.after(b);
  }
}

function openForm({ mode, data, fromAi, low }) {
  const isSubEdit = mode === "editsub";
  const t = data.type || "once";
  sheet(`${head(fromAi ? "Tjek oplysninger" : mode === "new" ? "Ny betaling" : "Ret betaling")}
    ${fromAi ? `<div style="text-align:center;margin:2px 0 12px"><span class="chip">${I.spark} Aflæst fra kvittering</span></div>` : ""}
    ${low ? `<div class="notice" style="margin-bottom:10px">Kvitteringen var svær at læse. Tjek felterne ekstra grundigt.</div>` : ""}
    <form id="payForm" class="stack" novalidate>
      <label class="field"><span>${t === "sub" ? "Navn" : "Butik"}</span><input id="fStore" required value="${esc(data.store || "")}" autocomplete="off"></label>
      <label class="field"><span id="fDateLbl">${t === "sub" ? "Næste betaling" : "Dato"}</span><input id="fDate" type="date" required value="${esc(data.date || iso(today()))}"></label>
      <label class="field"><span>Beløb (kr.)</span><input id="fAmount" inputmode="decimal" required value="${data.amount === "" || data.amount == null ? "" : String(data.amount).replace(".", ",")}" placeholder="0,00"></label>
      <div id="catWrap" ${t === "sub" ? "hidden" : ""}><label class="field"><span>Kategori</span><select id="fCat">${CATS.map(c => `<option ${c === data.category ? "selected" : ""}>${c}</option>`).join("")}</select></label></div>
      ${mode === "edit" || isSubEdit ? "" : `<div><div style="font-weight:700;font-size:19px;margin:8px 0 10px">Betalingstype</div>
      <div class="radios"><label class="radio"><input type="radio" name="fType" value="once" ${t !== "sub" ? "checked" : ""}> Engangskøb</label><label class="radio"><input type="radio" name="fType" value="sub" ${t === "sub" ? "checked" : ""}> Abonnement</label></div></div>`}
      <div id="intWrap" ${t === "sub" ? "" : "hidden"}><label class="field"><span>Interval</span><select id="fInt"><option value="måned" ${data.interval !== "år" ? "selected" : ""}>Månedligt</option><option value="år" ${data.interval === "år" ? "selected" : ""}>Årligt</option></select></label></div>
      <p id="fErr" class="danger" hidden style="margin:0;font-size:14px"></p>
      <button class="primary" type="submit">${mode === "new" ? (t === "sub" ? "Gem abonnement" : "Tilføj betaling") : "Gem ændringer"}</button>
      ${mode !== "new" ? `<button class="ghost danger" type="button" data-del>Slet</button>` : `<p class="hint" style="margin:0">Du kan rette alle felter</p>`}
    </form>`, el => {
    const f = $("#payForm", el);
    f.addEventListener("change", e => {
      if (e.target.name !== "fType") return;
      const sub = e.target.value === "sub";
      $("#intWrap", el).hidden = !sub; $("#catWrap", el).hidden = sub;
      $("#fDateLbl", el).textContent = sub ? "Næste betaling" : "Dato";
      f.querySelector("button[type=submit]").textContent = sub ? "Gem abonnement" : "Tilføj betaling";
    });
    f.addEventListener("submit", e => {
      e.preventDefault();
      const store = $("#fStore", el).value.trim();
      const date = $("#fDate", el).value;
      const amount = Number($("#fAmount", el).value.replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
      const type = isSubEdit ? "sub" : mode === "edit" ? "once" : (f.querySelector("input[name=fType]:checked")?.value || "once");
      const err = !store ? "Skriv et navn." : !date ? "Vælg en dato." : !(amount > 0) || amount > 1e6 ? "Skriv et beløb over 0 kr." : "";
      if (err) { const p = $("#fErr", el); p.textContent = err; p.hidden = false; return; }
      if (type === "sub") {
        const d = parseISO(date); const interval = $("#fInt", el).value;
        const rec = { id: data.id || uid(), name: store, amount, interval, day: d.getDate(), nextDate: date, remind: true };
        if (isSubEdit) state.subs = state.subs.map(s => s.id === rec.id ? { ...s, ...rec } : s); else state.subs.push(rec);
        toast(isSubEdit ? "Abonnement gemt" : "Abonnement tilføjet");
        save(); closeSheet(); location.hash = "abonnementer"; render();
      } else {
        const rec = { id: data.id || uid(), store, date, amount, category: $("#fCat", el).value };
        if (mode === "edit") state.purchases = state.purchases.map(p => p.id === rec.id ? { ...p, ...rec } : p); else state.purchases.push(rec);
        const d = parseISO(date); viewMonth = new Date(d.getFullYear(), d.getMonth(), 1); if (viewMonth > today()) { viewMonth = today(); viewMonth.setDate(1); }
        toast(mode === "edit" ? "Køb gemt" : "Betaling tilføjet");
        save(); closeSheet(); render();
      }
    });
    el.querySelector("[data-del]")?.addEventListener("click", () => {
      const b = el.querySelector("[data-del]");
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tryk igen for at slette"; return; }
      if (isSubEdit) state.subs = state.subs.filter(s => s.id !== data.id); else state.purchases = state.purchases.filter(p => p.id !== data.id);
      save(); closeSheet(); render(); toast("Slettet");
    });
  });
}

function openSettings() {
  sheet(`${head("Indstillinger")}
    <form id="setForm" class="stack" novalidate>
      <label class="field"><span>Udbetalt løn pr. måned (kr.)</span><input id="sSal" inputmode="numeric" value="${state.salary}"></label>
      <label class="field"><span>Sparemål pr. måned (kr.)</span><input id="sGoal" inputmode="numeric" value="${state.savingsGoal}"></label>
      <div class="card row"><span class="grow"><div style="font-weight:700">Retur Pro</div><div class="sub">29 kr. om måneden. Ubegrænset AI, sparemål, løn og forbrug i procent. Slå fra for at se gratisversionen.</div></span>
        <label class="toggle"><input type="checkbox" id="sPro" ${state.pro ? "checked" : ""} aria-label="Retur Pro"><span></span></label></div>
      <button class="primary" type="submit">Gem</button>
      ${state.hasSample ? `<button class="ghost" type="button" data-clear>Ryd eksempeldata</button>` : `<button class="ghost" type="button" data-sample>Indlæs eksempeldata</button>`}
      <p class="hint" style="margin:0">Dine data gemmes kun i denne browser.</p>
    </form>`, el => {
    $("#setForm", el).addEventListener("submit", e => {
      e.preventDefault();
      const n = v => Math.max(0, Number(String(v).replace(/[^\d,]/g, "").replace(",", ".")) || 0);
      state.salary = n($("#sSal", el).value); state.savingsGoal = n($("#sGoal", el).value); state.pro = $("#sPro", el).checked;
      save(); closeSheet(); render(); toast("Gemt");
    });
    el.querySelector("[data-clear]")?.addEventListener("click", e => {
      const b = e.currentTarget;
      if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "Tryk igen for at rydde"; return; }
      state.purchases = state.purchases.filter(p => !p.sample); state.subs = state.subs.filter(s => !s.sample); state.hasSample = false;
      chatTurns = []; save(); closeSheet(); render(); toast("Eksempeldata ryddet");
    });
    el.querySelector("[data-sample]")?.addEventListener("click", () => {
      const s = sampleState(); state.purchases = [...state.purchases, ...s.purchases]; state.subs = [...state.subs, ...s.subs]; state.hasSample = true;
      save(); closeSheet(); render(); toast("Eksempeldata indlæst");
    });
  });
}
$("#openSettings").addEventListener("click", openSettings);

let toastT;
function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600);
}

render();
})();
