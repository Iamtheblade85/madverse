/* =========================
   CONFIG
========================= */
const API_BASE = "https://iamemanuele.pythonanywhere.com";

const fmtEUR = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const fmtDateIT = new Intl.DateTimeFormat("it-IT", { year: "numeric", month: "2-digit", day: "2-digit" });
const fmtMonthYear = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

/* =========================
   STATE
========================= */
const state = {
  transactions: [],
  calView: "month",
  calCursor: new Date(),

  chartPeriod: "month",
  chartCursor: new Date(),

  editingId: null,

  initialBalanceSetting: null, // {date:'YYYY-MM-DD', balance:number} (persistente su backend)
  balanceCache: new Map(),     // key: ISO date, value: number

  chart: { instance: null, series: null },
};

/* =========================
   DOM HELPERS
========================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(msg){ $("#statusText").textContent = msg; }

function isoDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s){
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d){
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun .. 6 Sat
  const delta = (day === 0 ? -6 : 1 - day); // Monday start
  return addDays(x, delta);
}
function endOfWeek(d){ return addDays(startOfWeek(d), 6); }
function startOfMonth(d){ return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d){ return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function startOfYear(d){ return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d){ return new Date(d.getFullYear(), 11, 31); }
function clampToDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/* =========================
   API
========================= */
async function apiGet(path){
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Accept": "application/json" } });
  if(!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}
async function apiSend(path, method, body){
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if(!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return res.json();
}

/* ---- Transactions ---- */
async function loadTransactionsForRange(fromISO, toISO){
  return apiGet(`/api/transactions?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`);
}
async function createTransaction(tx){ return apiSend("/api/transactions", "POST", tx); }
async function updateTransaction(id, tx){ return apiSend(`/api/transactions/${encodeURIComponent(id)}`, "PUT", tx); }
async function deleteTransaction(id){ return apiSend(`/api/transactions/${encodeURIComponent(id)}`, "DELETE", {}); }

/* ---- Initial balance (setting) ----
   Saldo iniziale persistente:
   GET /api/settings/initial-balance -> {date, balance} oppure null
   PUT /api/settings/initial-balance -> body {date, balance} -> {date, balance}
*/
async function getInitialBalanceSetting(){
  return apiGet("/api/settings/initial-balance");
}
async function setInitialBalanceSetting(payload){
  return apiSend("/api/settings/initial-balance", "PUT", payload);
}

/* ---- Balance at date ----
   Saldo a inizio giornata della data 'at':
   GET /api/balance?at=YYYY-MM-DD -> { balance: number }
*/
async function getBalanceAt(atISO){
  const cached = state.balanceCache.get(atISO);
  if(typeof cached === "number") return cached;

  const data = await apiGet(`/api/balance?at=${encodeURIComponent(atISO)}`);
  const bal = Number(data?.balance ?? 0);
  state.balanceCache.set(atISO, bal);
  return bal;
}

function normalizeTransactions(data){
  if(!Array.isArray(data)) return [];
  return data.map(x => ({
    id: x.id ?? x._id ?? x.uuid ?? x.tx_id,
    date: x.date,
    kind: x.kind,
    type: x.type ?? "",
    category: x.category ?? "",
    label: x.label ?? "",
    amount: Number(x.amount ?? 0)
  })).filter(x => x.id != null && x.date);
}

function txSignedAmount(tx){ return tx.kind === "income" ? tx.amount : -tx.amount; }

/* =========================
   TABS
========================= */
function initTabs(){
  const tabs = [
    { tab: "#tab-calendar", panel: "#panel-calendar" },
    { tab: "#tab-manage", panel: "#panel-manage" },
    { tab: "#tab-chart", panel: "#panel-chart" },
  ];

  tabs.forEach(({tab, panel}) => {
    $(tab).addEventListener("click", () => {
      tabs.forEach(({tab:t, panel:p}) => {
        $(t).classList.remove("active");
        $(t).setAttribute("aria-selected", "false");
        $(p).classList.remove("active");
      });
      $(tab).classList.add("active");
      $(tab).setAttribute("aria-selected", "true");
      $(panel).classList.add("active");

      if(panel === "#panel-chart"){
        requestAnimationFrame(async () => {
          ensureChart();
          await renderChart();
        });
      }
    });
  });
}

/* =========================
   CALENDAR
========================= */
function setSegmentedActive(containerSel, activeBtn){
  $$(containerSel + " .seg").forEach(b => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

function initCalendarControls(){
  $$("#panel-calendar [data-cal-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.calView = btn.dataset.calView;
      setSegmentedActive("#panel-calendar .segmented", btn);
      renderCalendar();
    });
  });

  $("#btnPrev").addEventListener("click", () => shiftCalendar(-1));
  $("#btnNext").addEventListener("click", () => shiftCalendar(1));
  $("#btnToday").addEventListener("click", () => { state.calCursor = new Date(); renderCalendar(); });
}

function shiftCalendar(dir){
  const c = new Date(state.calCursor);
  if(state.calView === "day") c.setDate(c.getDate() + dir);
  else if(state.calView === "week") c.setDate(c.getDate() + 7*dir);
  else if(state.calView === "month") c.setMonth(c.getMonth() + dir);
  else c.setFullYear(c.getFullYear() + dir);
  state.calCursor = c;
  renderCalendar();
}

function getCalendarRange(){
  const c = clampToDay(state.calCursor);
  if(state.calView === "day") return { from: c, to: c };
  if(state.calView === "week") return { from: startOfWeek(c), to: endOfWeek(c) };
  if(state.calView === "month") return { from: startOfMonth(c), to: endOfMonth(c) };
  return { from: startOfYear(c), to: endOfYear(c) };
}

function txForISO(iso){ return state.transactions.filter(t => t.date === iso); }

function sumForRange(from, to){
  const fromISO = isoDate(from);
  const toISO = isoDate(to);
  let inc = 0, exp = 0;
  for(const tx of state.transactions){
    if(tx.date >= fromISO && tx.date <= toISO){
      if(tx.kind === "income") inc += tx.amount;
      else exp += tx.amount;
    }
  }
  return { inc, exp, net: inc - exp };
}

function renderCalendar(){
  const { from, to } = getCalendarRange();

  let title = "";
  if(state.calView === "day") title = `Giorno • ${fmtDateIT.format(from)}`;
  else if(state.calView === "week") title = `Settimana • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  else if(state.calView === "month") title = `Mese • ${fmtMonthYear.format(from)}`;
  else title = `Anno • ${from.getFullYear()}`;
  $("#calRangeTitle").textContent = title;

  const s = sumForRange(from, to);
  $("#sumIncome").textContent = fmtEUR.format(s.inc);
  $("#sumExpense").textContent = fmtEUR.format(s.exp);
  $("#sumNet").textContent = fmtEUR.format(s.net);
  $("#sumNet").classList.toggle("pos", s.net > 0);
  $("#sumNet").classList.toggle("neg", s.net < 0);

  const root = $("#calendar");
  root.innerHTML = "";

  if(state.calView === "week" || state.calView === "month"){
    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"].forEach(n => {
      const el = document.createElement("div");
      el.className = "dow";
      el.textContent = n;
      dowRow.appendChild(el);
    });
    root.appendChild(dowRow);
  }

  const grid = document.createElement("div");
  grid.className = `cal-grid ${state.calView}`;
  root.appendChild(grid);

  const todayISO = isoDate(new Date());

  if(state.calView === "day"){
    grid.appendChild(buildDayCard(from, false, todayISO));
    return;
  }
  if(state.calView === "week"){
    for(let i=0;i<7;i++) grid.appendChild(buildDayCard(addDays(from,i), false, todayISO));
    return;
  }
  if(state.calView === "month"){
    const first = startOfMonth(state.calCursor);
    const last = endOfMonth(state.calCursor);
    const gridStart = startOfWeek(first);
    const gridEnd = endOfWeek(last);

    for(let d = gridStart; d <= gridEnd; d = addDays(d,1)){
      const isOutside = d.getMonth() !== state.calCursor.getMonth();
      grid.appendChild(buildDayCard(d, isOutside, todayISO));
    }
    return;
  }

  // year view (mini-months)
  for(let m=0; m<12; m++){
    const box = document.createElement("div");
    box.className = "card";
    box.style.padding = "12px";
    box.style.minHeight = "180px";

    const monthDate = new Date(state.calCursor.getFullYear(), m, 1);
    const head = document.createElement("div");
    head.className = "card-title";
    head.style.marginBottom = "8px";
    head.textContent = fmtMonthYear.format(monthDate);
    box.appendChild(head);

    const mini = document.createElement("div");
    mini.className = "cal-grid month";
    mini.style.gap = "8px";
    box.appendChild(mini);

    const first = startOfMonth(monthDate);
    const last = endOfMonth(monthDate);
    const gridStart = startOfWeek(first);
    const gridEnd = endOfWeek(last);

    for(let d = gridStart; d <= gridEnd; d = addDays(d,1)){
      const isOutside = d.getMonth() !== m;
      mini.appendChild(buildDayCard(d, isOutside, todayISO, true));
    }

    grid.appendChild(box);
  }
}

function buildDayCard(d, muted, todayISO, compact=false){
  const iso = isoDate(d);
  const txs = txForISO(iso);

  let dayIncome = 0, dayExpense = 0;
  for(const t of txs){
    if(t.kind === "income") dayIncome += t.amount;
    else dayExpense += t.amount;
  }

  const card = document.createElement("div");
  card.className = "day-card";
  if(muted) card.classList.add("muted");
  if(iso === todayISO) card.classList.add("today");
  if(compact){
    card.style.minHeight = "92px";
    card.style.padding = "9px";
  }

  const top = document.createElement("div");
  top.className = "day-top";
  card.appendChild(top);

  const left = document.createElement("div");
  left.innerHTML = `<div class="day-num">${d.getDate()}</div>
                    <div class="day-date">${iso}</div>`;
  top.appendChild(left);

  const badges = document.createElement("div");
  badges.className = "day-badges";
  if(dayIncome > 0){
    const b = document.createElement("div");
    b.className = "badge pos";
    b.textContent = `+${fmtEUR.format(dayIncome)}`;
    badges.appendChild(b);
  }
  if(dayExpense > 0){
    const b = document.createElement("div");
    b.className = "badge neg";
    b.textContent = `-${fmtEUR.format(dayExpense)}`;
    badges.appendChild(b);
  }
  top.appendChild(badges);

  const list = document.createElement("div");
  list.className = "tx-list";
  card.appendChild(list);

  const maxItems = compact ? 2 : 4;
  txs.slice(0, maxItems).forEach(tx => list.appendChild(buildTxItem(tx)));

  if(txs.length > maxItems){
    const more = document.createElement("div");
    more.className = "badge";
    more.textContent = `+ ${txs.length - maxItems} altri`;
    list.appendChild(more);
  }

  card.addEventListener("click", () => {
    $("#tab-manage").click();
    $("#txSearch").value = iso;
    renderTxTable();
  });

  return card;
}

function buildTxItem(tx){
  const el = document.createElement("div");
  el.className = "tx";

  const head = document.createElement("div");
  head.className = "tx-head";
  const amt = document.createElement("div");
  amt.className = "tx-amt " + (tx.kind === "income" ? "pos" : "neg");
  amt.textContent = (tx.kind === "income" ? "+" : "-") + fmtEUR.format(tx.amount);

  head.innerHTML = `<div class="tx-label">${escapeHtml(tx.label)}</div>`;
  head.appendChild(amt);

  const meta = document.createElement("div");
  meta.className = "tx-meta";
  meta.innerHTML += `<span class="chip">${tx.kind === "income" ? "Entrata" : "Spesa"}</span>`;
  if(tx.type) meta.innerHTML += `<span class="chip">${escapeHtml(tx.type)}</span>`;
  if(tx.category) meta.innerHTML += `<span class="chip">${escapeHtml(tx.category)}</span>`;

  el.appendChild(head);
  el.appendChild(meta);

  return el;
}

/* =========================
   MANAGE (CRUD + Initial balance setting)
========================= */
function initManage(){
  $("#btnNewTx").addEventListener("click", () => resetForm());
  $("#btnCancelEdit").addEventListener("click", () => resetForm());

  $("#txForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await onSaveTx();
  });

  $("#btnDeleteTx").addEventListener("click", async () => {
    if(!state.editingId) return;
    const tx = state.transactions.find(t => String(t.id) === String(state.editingId));
    const ok = confirm(`Eliminare il movimento?\n\n${tx?.date} • ${tx?.label} • ${fmtEUR.format(tx?.amount ?? 0)}`);
    if(!ok) return;

    try{
      setStatus("Eliminazione...");
      await deleteTransaction(state.editingId);
      state.transactions = state.transactions.filter(t => String(t.id) !== String(state.editingId));
      setStatus("Eliminato.");
      showNotice("Movimento eliminato.");
      resetForm();
      renderTxTable();
      renderCalendar();
      state.balanceCache.clear();
      await renderChart();
    }catch(err){
      console.error(err);
      setStatus("Errore.");
      showNotice("Errore durante l'eliminazione.", true);
    }
  });

  $("#txSearch").addEventListener("input", () => renderTxTable());
  $("#txFilterKind").addEventListener("change", () => renderTxTable());

  $("#btnExportJson").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.transactions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transactions.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Initial balance setting
  $("#initBalForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await saveInitBalanceFromUI();
  });
  $("#btnReloadInitBal").addEventListener("click", async () => {
    await loadInitBalanceToUI();
  });
}

function showNotice(msg, isError=false){
  const n = $("#formNotice");
  n.textContent = msg;
  n.style.color = isError ? "rgba(255,90,107,0.95)" : "rgba(255,255,255,0.70)";
}
function showInitBalNotice(msg, isError=false){
  const n = $("#initBalNotice");
  n.textContent = msg;
  n.style.color = isError ? "rgba(255,90,107,0.95)" : "rgba(255,255,255,0.70)";
}

function resetForm(){
  state.editingId = null;
  $("#txId").value = "";
  $("#txDate").value = isoDate(new Date());
  $("#txKind").value = "income";
  $("#txType").value = "";
  $("#txCategory").value = "";
  $("#txLabel").value = "";
  $("#txAmount").value = "";
  $("#btnDeleteTx").disabled = true;
  showNotice("Pronto per un nuovo inserimento.");
}

function fillForm(tx){
  state.editingId = tx.id;
  $("#txId").value = tx.id;
  $("#txDate").value = tx.date;
  $("#txKind").value = tx.kind;
  $("#txType").value = tx.type ?? "";
  $("#txCategory").value = tx.category ?? "";
  $("#txLabel").value = tx.label ?? "";
  $("#txAmount").value = String(tx.amount ?? "");
  $("#btnDeleteTx").disabled = false;
  showNotice("Stai modificando un movimento esistente.");
}

function readForm(){
  const date = $("#txDate").value;
  const kind = $("#txKind").value;
  const type = $("#txType").value.trim();
  const category = $("#txCategory").value.trim();
  const label = $("#txLabel").value.trim();
  const amount = Number($("#txAmount").value);

  if(!date) throw new Error("Data mancante");
  if(kind !== "income" && kind !== "expense") throw new Error("Tipo movimento non valido");
  if(!category) throw new Error("Categoria mancante");
  if(!label) throw new Error("Label mancante");
  if(!Number.isFinite(amount) || amount < 0) throw new Error("Importo non valido");

  return { date, kind, type, category, label, amount: Math.round(amount * 100) / 100 };
}

async function onSaveTx(){
  let tx;
  try{ tx = readForm(); }
  catch(err){ showNotice(err.message, true); return; }

  try{
    if(state.editingId){
      setStatus("Salvataggio modifica...");
      const updated = await updateTransaction(state.editingId, tx);
      const norm = normalizeTransactions([updated])[0] ?? { ...tx, id: state.editingId };
      state.transactions = state.transactions.map(t => String(t.id) === String(state.editingId) ? norm : t);
      setStatus("Aggiornato.");
      showNotice("Movimento aggiornato.");
    }else{
      setStatus("Creazione movimento...");
      const created = await createTransaction(tx);
      const norm = normalizeTransactions([created])[0] ?? { ...tx, id: crypto.randomUUID?.() ?? String(Date.now()) };
      state.transactions.push(norm);
      setStatus("Creato.");
      showNotice("Movimento creato.");
      fillForm(norm);
    }

    renderTxTable();
    renderCalendar();
    state.balanceCache.clear();
    await renderChart();
  }catch(err){
    console.error(err);
    setStatus("Errore.");
    showNotice("Errore durante il salvataggio. Controlla backend / endpoint.", true);
  }
}

function renderTxTable(){
  const q = ($("#txSearch").value || "").trim().toLowerCase();
  const f = $("#txFilterKind").value;

  let rows = [...state.transactions];
  rows.sort((a,b) => (a.date < b.date ? 1 : -1)); // desc

  if(f !== "all") rows = rows.filter(t => t.kind === f);
  if(q){
    rows = rows.filter(t =>
      (t.date || "").toLowerCase().includes(q) ||
      (t.label || "").toLowerCase().includes(q) ||
      (t.category || "").toLowerCase().includes(q) ||
      (t.type || "").toLowerCase().includes(q)
    );
  }

  const tbody = $("#txTbody");
  tbody.innerHTML = "";

  for(const tx of rows){
    const tr = document.createElement("tr");
    const kindTag = tx.kind === "income"
      ? `<span class="tag pos">Entrata</span>`
      : `<span class="tag neg">Spesa</span>`;
    const amt = tx.kind === "income"
      ? `<span class="tx-amt pos">+${fmtEUR.format(tx.amount)}</span>`
      : `<span class="tx-amt neg">-${fmtEUR.format(tx.amount)}</span>`;

    tr.innerHTML = `
      <td>${escapeHtml(tx.date)}</td>
      <td>${kindTag}</td>
      <td>
        <div style="font-weight:750">${escapeHtml(tx.category || "")}</div>
        <div style="color:rgba(255,255,255,0.62); font-size:12px; margin-top:2px;">
          ${escapeHtml(tx.type || "")}
        </div>
      </td>
      <td>${escapeHtml(tx.label)}</td>
      <td class="right">${amt}</td>
      <td class="right">
        <button class="btn btn-ghost" data-edit="${escapeAttr(tx.id)}" type="button">Modifica</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const tx = state.transactions.find(t => String(t.id) === String(id));
      if(tx){
        fillForm(tx);
        $("#panel-manage").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

/* =========================
   INITIAL BALANCE UI
========================= */
async function loadInitBalanceToUI(){
  try{
    setStatus("Carico saldo iniziale...");
    const data = await getInitialBalanceSetting(); // {date,balance} oppure null
    state.initialBalanceSetting = (data && data.date) ? { date: data.date, balance: Number(data.balance ?? 0) } : null;

    if(state.initialBalanceSetting){
      $("#initBalDate").value = state.initialBalanceSetting.date;
      $("#initBalValue").value = String(state.initialBalanceSetting.balance);
      showInitBalNotice(`Saldo iniziale attuale: ${state.initialBalanceSetting.date} • ${fmtEUR.format(state.initialBalanceSetting.balance)}`);
    }else{
      // default suggerito
      $("#initBalDate").value = isoDate(new Date(new Date().getFullYear(), 0, 1));
      $("#initBalValue").value = "0";
      showInitBalNotice("Nessun saldo iniziale salvato: impostalo per avere grafico accurato.");
    }

    setStatus("Pronto.");
  }catch(err){
    console.error(err);
    setStatus("Errore.");
    showInitBalNotice("Errore nel caricamento del saldo iniziale (endpoint mancante?).", true);
  }
}

async function saveInitBalanceFromUI(){
  const date = $("#initBalDate").value;
  const balance = Number($("#initBalValue").value);

  if(!date){
    showInitBalNotice("Data saldo iniziale mancante.", true);
    return;
  }
  if(!Number.isFinite(balance)){
    showInitBalNotice("Saldo iniziale non valido.", true);
    return;
  }

  try{
    setStatus("Salvo saldo iniziale...");
    const saved = await setInitialBalanceSetting({ date, balance: Math.round(balance * 100) / 100 });
    state.initialBalanceSetting = { date: saved.date, balance: Number(saved.balance ?? 0) };
    showInitBalNotice(`Salvato: ${state.initialBalanceSetting.date} • ${fmtEUR.format(state.initialBalanceSetting.balance)}`);
    state.balanceCache.clear();
    await renderChart();
    setStatus("Pronto.");
  }catch(err){
    console.error(err);
    setStatus("Errore.");
    showInitBalNotice("Errore nel salvataggio (endpoint mancante?).", true);
  }
}

/* =========================
   CANDLESTICK
========================= */
function initChartControls(){
  $$("#panel-chart [data-chart-period]").forEach(btn => {
    btn.addEventListener("click", async () => {
      state.chartPeriod = btn.dataset.chartPeriod;
      setSegmentedActive("#panel-chart .segmented", btn);
      await renderChart();
    });
  });

  $("#btnChartPrev").addEventListener("click", async () => { shiftChart(-1); await renderChart(); });
  $("#btnChartNext").addEventListener("click", async () => { shiftChart(1); await renderChart(); });
  $("#btnChartToday").addEventListener("click", async () => { state.chartCursor = new Date(); await renderChart(); });
}

function shiftChart(dir){
  const c = new Date(state.chartCursor);
  if(state.chartPeriod === "day") c.setDate(c.getDate() + dir*30);
  else if(state.chartPeriod === "week") c.setDate(c.getDate() + dir*84);
  else if(state.chartPeriod === "month") c.setMonth(c.getMonth() + dir*12);
  else c.setFullYear(c.getFullYear() + dir*4);
  state.chartCursor = c;
}

function ensureChart(){
  if(state.chart.instance) return;

  const el = $("#candlestickChart");
  const chart = LightweightCharts.createChart(el, {
    layout: {
      background: { color: "rgba(0,0,0,0)" },
      textColor: "rgba(255,255,255,0.80)",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
    },
    grid: {
      vertLines: { color: "rgba(255,255,255,0.06)" },
      horzLines: { color: "rgba(255,255,255,0.06)" },
    },
    rightPriceScale: { borderColor: "rgba(255,255,255,0.10)" },
    timeScale: { borderColor: "rgba(255,255,255,0.10)", timeVisible: true },
    crosshair: {
      vertLine: { color: "rgba(255,255,255,0.20)" },
      horzLine: { color: "rgba(255,255,255,0.20)" },
    },
  });

  const series = chart.addCandlestickSeries({
    upColor: "rgba(53,208,127,0.95)",
    downColor: "rgba(255,90,107,0.95)",
    borderUpColor: "rgba(53,208,127,1)",
    borderDownColor: "rgba(255,90,107,1)",
    wickUpColor: "rgba(53,208,127,1)",
    wickDownColor: "rgba(255,90,107,1)",
  });

  state.chart.instance = chart;
  state.chart.series = series;

  window.addEventListener("resize", () => {
    const rect = el.getBoundingClientRect();
    chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
  });

  const rect = el.getBoundingClientRect();
  chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
}

function chartRange(){
  const c = clampToDay(state.chartCursor);
  if(state.chartPeriod === "day") return { from: addDays(c,-30), to: addDays(c,30) };
  if(state.chartPeriod === "week") return { from: addDays(c,-84), to: addDays(c,84) };
  if(state.chartPeriod === "month"){
    return { from: new Date(c.getFullYear(), c.getMonth()-12, 1), to: new Date(c.getFullYear(), c.getMonth()+12, 0) };
  }
  return { from: new Date(c.getFullYear()-4, 0, 1), to: new Date(c.getFullYear()+4, 11, 31) };
}

function dateFromBucketKey(key){ return parseISODate(key); }
function bucketKey(d, period){
  const y = d.getFullYear();
  if(period === "day") return isoDate(d);
  if(period === "week") return isoDate(startOfWeek(d)); // monday
  if(period === "month"){
    const mm = String(d.getMonth()+1).padStart(2,"0");
    return `${y}-${mm}-01`;
  }
  return `${y}-01-01`;
}

async function computeCandles(period, from, to){
  // Base balance: saldo a INIZIO del giorno "from"
  let balance = 0;
  try{
    balance = await getBalanceAt(isoDate(from));
  }catch{
    balance = 0; // fallback
  }

  const fromISO = isoDate(from);
  const toISO = isoDate(to);

  const txs = state.transactions
    .filter(t => t.date >= fromISO && t.date <= toISO)
    .slice()
    .sort((a,b) => a.date < b.date ? -1 : 1);

  const keys = [];
  if(period === "day"){
    for(let d = startOfDay(from); d <= to; d = addDays(d,1)) keys.push(isoDate(d));
  } else if(period === "week"){
    let d = startOfWeek(from);
    const end = endOfWeek(to);
    while(d <= end){ keys.push(isoDate(d)); d = addDays(d,7); }
  } else if(period === "month"){
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while(d <= end){ keys.push(bucketKey(d,"month")); d = new Date(d.getFullYear(), d.getMonth()+1, 1); }
  } else {
    let d = new Date(from.getFullYear(), 0, 1);
    const end = new Date(to.getFullYear(), 0, 1);
    while(d <= end){ keys.push(bucketKey(d,"year")); d = new Date(d.getFullYear()+1, 0, 1); }
  }

  let i = 0;
  const candles = [];

  for(const key of keys){
    const bucketStart = dateFromBucketKey(key);
    let bucketEnd;
    if(period === "day") bucketEnd = bucketStart;
    else if(period === "week") bucketEnd = endOfWeek(bucketStart);
    else if(period === "month") bucketEnd = endOfMonth(bucketStart);
    else bucketEnd = endOfYear(bucketStart);

    const bStartISO = isoDate(bucketStart);
    const bEndISO = isoDate(bucketEnd);

    const open = balance;
    let high = balance;
    let low = balance;

    while(i < txs.length && txs[i].date >= bStartISO && txs[i].date <= bEndISO){
      balance += txSignedAmount(txs[i]);
      if(balance > high) high = balance;
      if(balance < low) low = balance;
      i++;
    }

    const close = balance;

    candles.push({ time: bStartISO, open, high, low, close });
  }

  return { candles, baseBalance: await safeNumber(getBalanceAt(isoDate(from)), 0) };
}

async function renderChart(){
  ensureChart();

  const { from, to } = chartRange();

  let title = "";
  if(state.chartPeriod === "day") title = `Candele giornaliere • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  else if(state.chartPeriod === "week") title = `Candele settimanali • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  else if(state.chartPeriod === "month") title = `Candele mensili • ${fmtMonthYear.format(from)} → ${fmtMonthYear.format(to)}`;
  else title = `Candele annuali • ${from.getFullYear()} → ${to.getFullYear()}`;
  $("#chartRangeTitle").textContent = title;

  // render
  try{
    const res = await computeCandles(state.chartPeriod, from, to);
    state.chart.series.setData(res.candles);

    // note
    $("#chartFootnote").textContent =
      `Saldo usato come base (inizio ${isoDate(from)}): ${fmtEUR.format(res.baseBalance)}. ` +
      `Il saldo viene calcolato dal backend con saldo iniziale persistente + movimenti precedenti.`;
  }catch(err){
    console.error(err);
    $("#chartFootnote").textContent =
      "Errore nel caricamento/calcolo saldo (controlla endpoint /api/balance e saldo iniziale).";
  }
}

function safeNumber(promiseOrValue, fallback){
  // helper: se è una Promise, non blocca qui; usato solo in computeCandles via await.
  // qui teniamo per compatibilità in caso di refactoring.
  return promiseOrValue;
}

/* =========================
   INIT / LOAD
========================= */
async function refreshAll(){
  try{
    setStatus("Caricamento dati...");

    // Carichiamo transazioni in range ampio (puoi ottimizzare dopo con paginazione)
    const today = new Date();
    const from = isoDate(addDays(today, -370));
    const to = isoDate(addDays(today, 370));
    const data = await loadTransactionsForRange(from, to);
    state.transactions = normalizeTransactions(data);

    renderCalendar();
    renderTxTable();

    await loadInitBalanceToUI();

    state.balanceCache.clear();
    await renderChart();

    setStatus("Dati aggiornati.");
  }catch(err){
    console.error(err);
    setStatus("Errore caricamento.");
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("`","&#096;"); }

function initHeader(){
  $("#year").textContent = String(new Date().getFullYear());
  $("#pillNow").textContent = `Oggi: ${fmtDateIT.format(new Date())}`;
  $("#btnRefresh").addEventListener("click", () => refreshAll());
}

function initDefaults(){
  state.calView = "month";
  state.calCursor = new Date();
  state.chartPeriod = "month";
  state.chartCursor = new Date();

  const calBtn = $(`#panel-calendar [data-cal-view="${state.calView}"]`);
  if(calBtn) setSegmentedActive("#panel-calendar .segmented", calBtn);

  const chartBtn = $(`#panel-chart [data-chart-period="${state.chartPeriod}"]`);
  if(chartBtn) setSegmentedActive("#panel-chart .segmented", chartBtn);
}

function boot(){
  initHeader();
  initTabs();
  initCalendarControls();
  initManage();
  initChartControls();
  initDefaults();
  resetForm();
  renderCalendar();
  renderTxTable();
  ensureChart();
  renderChart(); // best-effort
  refreshAll();
}

boot();
