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
  transactions: [], // {id, date:'YYYY-MM-DD', kind:'income'|'expense', type, category, label, amount:number}
  calView: "month", // day|week|month|year
  calCursor: new Date(), // riferimento per calendario
  chartPeriod: "month", // day|week|month|year
  chartCursor: new Date(),
  editingId: null,

  chart: {
    instance: null,
    series: null,
  }
};

/* =========================
   DOM HELPERS
========================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function setStatus(msg){
  $("#statusText").textContent = msg;
}

function isoDate(d){
  // YYYY-MM-DD in locale-independent
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s){
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m-1, d);
}
function startOfDay(d){
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d, n){
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d){
  // week starts Monday (EU)
  const x = startOfDay(d);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const delta = (day === 0 ? -6 : 1 - day);
  return addDays(x, delta);
}
function endOfWeek(d){
  return addDays(startOfWeek(d), 6);
}
function startOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d){
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfYear(d){
  return new Date(d.getFullYear(), 0, 1);
}
function endOfYear(d){
  return new Date(d.getFullYear(), 11, 31);
}
function clampToDay(d){
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sameISO(a, b){
  return isoDate(a) === isoDate(b);
}

/* =========================
   API (FLASK)
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
    body: JSON.stringify(body)
  });
  if(!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return res.json();
}

async function loadTransactionsForRange(fromISO, toISO){
  // Backend: GET /api/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD
  // Deve restituire array di transactions
  return apiGet(`/api/transactions?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`);
}

async function loadAllTransactionsForUI(){
  // Per semplicità UI: carichiamo un range ampio attorno a "oggi"
  // (poi, volendo, si può paginare)
  const today = new Date();
  const from = isoDate(addDays(today, -370));
  const to = isoDate(addDays(today, 370));
  const data = await loadTransactionsForRange(from, to);
  state.transactions = normalizeTransactions(data);
}

async function createTransaction(tx){
  // POST /api/transactions
  return apiSend("/api/transactions", "POST", tx);
}
async function updateTransaction(id, tx){
  // PUT /api/transactions/:id
  return apiSend(`/api/transactions/${encodeURIComponent(id)}`, "PUT", tx);
}
async function deleteTransaction(id){
  // DELETE /api/transactions/:id
  return apiSend(`/api/transactions/${encodeURIComponent(id)}`, "DELETE", {});
}

function normalizeTransactions(data){
  // Accetta varianti del backend, ma produce forma standard
  if(!Array.isArray(data)) return [];
  return data.map(x => ({
    id: x.id ?? x._id ?? x.uuid ?? x.tx_id,
    date: x.date, // ISO YYYY-MM-DD
    kind: x.kind, // income|expense
    type: x.type ?? "",
    category: x.category ?? "",
    label: x.label ?? "",
    amount: Number(x.amount ?? 0)
  })).filter(x => x.id != null && x.date);
}

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
        requestAnimationFrame(() => {
          ensureChart();
          renderChart();
        });
      }
    });
  });
}

/* =========================
   CALENDAR RENDERING
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

  $("#btnPrev").addEventListener("click", () => {
    shiftCalendar(-1);
  });
  $("#btnNext").addEventListener("click", () => {
    shiftCalendar(1);
  });
  $("#btnToday").addEventListener("click", () => {
    state.calCursor = new Date();
    renderCalendar();
  });
}

function shiftCalendar(dir){
  const c = new Date(state.calCursor);
  if(state.calView === "day") c.setDate(c.getDate() + dir);
  else if(state.calView === "week") c.setDate(c.getDate() + 7*dir);
  else if(state.calView === "month") c.setMonth(c.getMonth() + dir);
  else if(state.calView === "year") c.setFullYear(c.getFullYear() + dir);
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

function txSignedAmount(tx){
  return tx.kind === "income" ? tx.amount : -tx.amount;
}

function txForISO(iso){
  return state.transactions.filter(t => t.date === iso);
}

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

  // Titolo range
  let title = "";
  if(state.calView === "day"){
    title = `Giorno • ${fmtDateIT.format(from)}`;
  } else if(state.calView === "week"){
    title = `Settimana • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  } else if(state.calView === "month"){
    title = `Mese • ${fmtMonthYear.format(from)}`;
  } else {
    title = `Anno • ${from.getFullYear()}`;
  }
  $("#calRangeTitle").textContent = title;

  // Summary
  const s = sumForRange(from, to);
  $("#sumIncome").textContent = fmtEUR.format(s.inc);
  $("#sumExpense").textContent = fmtEUR.format(s.exp);
  $("#sumNet").textContent = fmtEUR.format(s.net);
  $("#sumNet").classList.toggle("pos", s.net > 0);
  $("#sumNet").classList.toggle("neg", s.net < 0);

  // Render grid
  const root = $("#calendar");
  root.innerHTML = "";

  // DOW row only for week/month
  if(state.calView === "week" || state.calView === "month"){
    const dowRow = document.createElement("div");
    dowRow.className = "dow-row";
    const names = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"];
    for(const n of names){
      const el = document.createElement("div");
      el.className = "dow";
      el.textContent = n;
      dowRow.appendChild(el);
    }
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
    for(let i=0;i<7;i++){
      const d = addDays(from, i);
      grid.appendChild(buildDayCard(d, false, todayISO));
    }
    return;
  }

  if(state.calView === "month"){
    const first = startOfMonth(state.calCursor);
    const last = endOfMonth(state.calCursor);

    const gridStart = startOfWeek(first);
    const gridEnd = endOfWeek(last);

    for(let d = gridStart; d <= gridEnd; d = addDays(d, 1)){
      const isOutside = d.getMonth() !== state.calCursor.getMonth();
      grid.appendChild(buildDayCard(d, isOutside, todayISO));
    }
    return;
  }

  // year view: 12 "mini-months"
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

    // max 6 weeks => 42 cells
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

  // Click => vai tab movimenti e prefiltra per quella data
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
  if(tx.kind === "income") meta.innerHTML += `<span class="chip">Entrata</span>`;
  else meta.innerHTML += `<span class="chip">Spesa</span>`;
  if(tx.type) meta.innerHTML += `<span class="chip">${escapeHtml(tx.type)}</span>`;
  if(tx.category) meta.innerHTML += `<span class="chip">${escapeHtml(tx.category)}</span>`;

  el.appendChild(head);
  el.appendChild(meta);

  return el;
}

/* =========================
   MANAGE (CRUD)
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
    const tx = state.transactions.find(t => t.id === state.editingId);
    const ok = confirm(`Eliminare il movimento?\n\n${tx?.date} • ${tx?.label} • ${fmtEUR.format(tx?.amount ?? 0)}`);
    if(!ok) return;

    try{
      setStatus("Eliminazione...");
      await deleteTransaction(state.editingId);
      state.transactions = state.transactions.filter(t => t.id !== state.editingId);
      setStatus("Eliminato.");
      showNotice("Movimento eliminato.");
      resetForm();
      renderTxTable();
      renderCalendar();
      renderChart();
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
}

function showNotice(msg, isError=false){
  const n = $("#formNotice");
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

  return { date, kind, type, category, label, amount };
}

async function onSaveTx(){
  let tx;
  try{
    tx = readForm();
  }catch(err){
    showNotice(err.message, true);
    return;
  }

  try{
    if(state.editingId){
      setStatus("Salvataggio modifica...");
      const updated = await updateTransaction(state.editingId, tx);
      const norm = normalizeTransactions([updated])[0] ?? { ...tx, id: state.editingId };
      state.transactions = state.transactions.map(t => t.id === state.editingId ? norm : t);
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
    renderChart();
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
  rows.sort((a,b) => (a.date < b.date ? 1 : -1)); // desc by date

  if(f !== "all"){
    rows = rows.filter(t => t.kind === f);
  }
  if(q){
    rows = rows.filter(t => {
      // supporto: ricerca anche per data iso
      return (
        (t.date || "").toLowerCase().includes(q) ||
        (t.label || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q) ||
        (t.type || "").toLowerCase().includes(q)
      );
    });
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

  // bind edit
  tbody.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-edit");
      const tx = state.transactions.find(t => String(t.id) === String(id));
      if(tx){
        fillForm(tx);
        // scroll form in vista
        $("#panel-manage").scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

/* =========================
   CANDLESTICK CHART
========================= */
function initChartControls(){
  $$("#panel-chart [data-chart-period]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.chartPeriod = btn.dataset.chartPeriod;
      setSegmentedActive("#panel-chart .segmented", btn);
      renderChart();
    });
  });

  $("#btnChartPrev").addEventListener("click", () => shiftChart(-1));
  $("#btnChartNext").addEventListener("click", () => shiftChart(1));
  $("#btnChartToday").addEventListener("click", () => { state.chartCursor = new Date(); renderChart(); });
}

function shiftChart(dir){
  const c = new Date(state.chartCursor);
  if(state.chartPeriod === "day") c.setDate(c.getDate() + dir*30);      // scorrimento "pagina"
  else if(state.chartPeriod === "week") c.setDate(c.getDate() + dir*84);
  else if(state.chartPeriod === "month") c.setMonth(c.getMonth() + dir*12);
  else c.setFullYear(c.getFullYear() + dir*4);
  state.chartCursor = c;
  renderChart();
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
    rightPriceScale: {
      borderColor: "rgba(255,255,255,0.10)"
    },
    timeScale: {
      borderColor: "rgba(255,255,255,0.10)",
      timeVisible: true
    },
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

  // Resize
  window.addEventListener("resize", () => {
    const rect = el.getBoundingClientRect();
    chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
  });

  // initial sizing
  const rect = el.getBoundingClientRect();
  chart.applyOptions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
}

function chartRange(){
  // range "pagina" in base al periodo (per avere abbastanza candele)
  const c = clampToDay(state.chartCursor);

  if(state.chartPeriod === "day"){
    const from = addDays(c, -30);
    const to = addDays(c, 30);
    return { from, to };
  }
  if(state.chartPeriod === "week"){
    const from = addDays(c, -84);
    const to = addDays(c, 84);
    return { from, to };
  }
  if(state.chartPeriod === "month"){
    const from = new Date(c.getFullYear(), c.getMonth() - 12, 1);
    const to = new Date(c.getFullYear(), c.getMonth() + 12, 0);
    return { from, to };
  }
  // year
  const from = new Date(c.getFullYear() - 4, 0, 1);
  const to = new Date(c.getFullYear() + 4, 11, 31);
  return { from, to };
}

function bucketKey(d, period){
  const y = d.getFullYear();
  if(period === "day"){
    return isoDate(d);
  }
  if(period === "week"){
    const s = startOfWeek(d);
    return isoDate(s); // key = monday
  }
  if(period === "month"){
    const mm = String(d.getMonth() + 1).padStart(2,"0");
    return `${y}-${mm}-01`;
  }
  // year
  return `${y}-01-01`;
}

function dateFromBucketKey(key){
  return parseISODate(key);
}

function computeCandles(period, from, to){
  // Candele sul saldo cumulativo.
  // Assumiamo saldo iniziale = 0 prima del "from".
  // Se vuoi correttezza assoluta con storico infinito, aggiungeremo endpoint "initial balance".
  const fromISO = isoDate(from);
  const toISO = isoDate(to);

  // ordina tx per data asc
  const txs = state.transactions
    .filter(t => t.date >= fromISO && t.date <= toISO)
    .slice()
    .sort((a,b) => a.date < b.date ? -1 : 1);

  // costruiamo buckets consecutivi nell'intervallo
  const keys = [];
  if(period === "day"){
    for(let d = startOfDay(from); d <= to; d = addDays(d,1)){
      keys.push(isoDate(d));
    }
  } else if(period === "week"){
    let d = startOfWeek(from);
    const end = endOfWeek(to);
    while(d <= end){
      keys.push(isoDate(d));
      d = addDays(d,7);
    }
  } else if(period === "month"){
    let d = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while(d <= end){
      keys.push(bucketKey(d, "month"));
      d = new Date(d.getFullYear(), d.getMonth()+1, 1);
    }
  } else {
    let d = new Date(from.getFullYear(), 0, 1);
    const end = new Date(to.getFullYear(), 0, 1);
    while(d <= end){
      keys.push(bucketKey(d, "year"));
      d = new Date(d.getFullYear()+1, 0, 1);
    }
  }

  // indice tx
  let i = 0;
  let balance = 0;

  const candles = [];

  for(const key of keys){
    const bucketStart = dateFromBucketKey(key);
    let bucketEnd;

    if(period === "day"){
      bucketEnd = bucketStart;
    } else if(period === "week"){
      bucketEnd = endOfWeek(bucketStart);
    } else if(period === "month"){
      bucketEnd = endOfMonth(bucketStart);
    } else {
      bucketEnd = endOfYear(bucketStart);
    }

    // clamp agli estremi reali
    const bStartISO = isoDate(bucketStart);
    const bEndISO = isoDate(bucketEnd);

    // open
    const open = balance;

    let high = balance;
    let low = balance;

    // process all tx in this bucket
    while(i < txs.length && txs[i].date >= bStartISO && txs[i].date <= bEndISO){
      balance += txSignedAmount(txs[i]);
      if(balance > high) high = balance;
      if(balance < low) low = balance;
      i++;
    }

    const close = balance;

    // time: Lightweight Charts expects { time: 'YYYY-MM-DD' } (string ok)
    candles.push({
      time: bStartISO,
      open,
      high,
      low,
      close
    });
  }

  return candles;
}

function renderChart(){
  ensureChart();

  const { from, to } = chartRange();

  // Titolo range
  let title = "";
  if(state.chartPeriod === "day"){
    title = `Candele giornaliere • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  } else if(state.chartPeriod === "week"){
    title = `Candele settimanali • ${fmtDateIT.format(from)} → ${fmtDateIT.format(to)}`;
  } else if(state.chartPeriod === "month"){
    title = `Candele mensili • ${fmtMonthYear.format(from)} → ${fmtMonthYear.format(to)}`;
  } else {
    title = `Candele annuali • ${from.getFullYear()} → ${to.getFullYear()}`;
  }
  $("#chartRangeTitle").textContent = title;

  const candles = computeCandles(state.chartPeriod, from, to);
  state.chart.series.setData(candles);

  // footnote: note su saldo iniziale
  $("#chartFootnote").textContent =
    "Nota: il grafico calcola il saldo cumulativo partendo da 0 all’inizio dell’intervallo. " +
    "Per accuratezza assoluta su qualsiasi intervallo, aggiungeremo un endpoint di 'saldo iniziale' (vedi lista endpoints).";
}

/* =========================
   INIT / LOAD
========================= */
async function refreshAll(){
  try{
    setStatus("Caricamento dati...");
    await loadAllTransactionsForUI();
    setStatus("Dati aggiornati.");
    renderCalendar();
    renderTxTable();
    renderChart();
  }catch(err){
    console.error(err);
    setStatus("Errore caricamento.");
    // fallback: resta usabile anche senza backend (vuoto)
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
function escapeAttr(s){
  return escapeHtml(s).replaceAll("`","&#096;");
}

function initHeader(){
  $("#year").textContent = String(new Date().getFullYear());
  $("#pillNow").textContent = `Oggi: ${fmtDateIT.format(new Date())}`;
  $("#btnRefresh").addEventListener("click", () => refreshAll());
}

function initDefaults(){
  // default calendar view = month (come richiesto "default visualizzazione")
  state.calView = "month";
  state.calCursor = new Date();
  // chart default
  state.chartPeriod = "month";
  state.chartCursor = new Date();

  // set correct segmented active states
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
  // chart will render when chart tab opens, but we can render anyway:
  ensureChart();
  renderChart();
  refreshAll();
}

boot();
