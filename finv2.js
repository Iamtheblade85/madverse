const apiBase = "https://iamemanuele.pythonanywhere.com"
const state = {
  wallets: [],
  events: [],
  eventsByDate: new Map(),
  dashboard: null,
  currentMonth: null,
  selectedDate: null,
  editContext: null,
  lastCardsDashboard: null
}
const mesiLunghi = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"]
const mesiCorti = ["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"]
const el = id => document.getElementById(id)

function formatISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseISODate(str) {
  if (!str) return null
  const parts = str.split("-")
  if (parts.length !== 3) return null
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10) - 1
  const d = parseInt(parts[2], 10)
  const dt = new Date(y, m, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null
  return dt
}

function formatDateHuman(iso) {
  const d = parseISODate(iso)
  if (!d) return iso || "—"
  const day = d.getDate()
  const m = mesiCorti[d.getMonth()]
  const y = d.getFullYear()
  return `${day} ${m} ${y}`
}

function formatMonthLabel(year, monthIndex) {
  return `${mesiLunghi[monthIndex]} ${year}`
}

function formatEuro(value) {
  if (value === null || value === undefined || isNaN(value)) return "—"
  try {
    return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(value)
  } catch(e) {
    return `${value.toFixed(2)}€`
  }
}

function parseNumberInput(v) {
  if (v == null || v === "") return null
  const s = String(v).replace(",",".")
  const n = parseFloat(s)
  if (isNaN(n)) return null
  return n
}

function updateApiStatus(ok) {
  const dot = el("apiStatusDot")
  const text = el("apiStatusText")
  if (!dot || !text) return
  if (ok) {
    dot.style.backgroundColor = "var(--ok)"
    text.textContent = "API: ok"
  } else {
    dot.style.backgroundColor = "var(--bad)"
    text.textContent = "API: errore"
  }
}

function showToast(title, message) {
  const area = el("toastArea")
  if (!area) return
  const d = document.createElement("div")
  d.className = "toast"
  const t = document.createElement("div")
  t.className = "t"
  t.textContent = title
  const m = document.createElement("div")
  m.className = "m"
  m.textContent = message
  d.appendChild(t)
  d.appendChild(m)
  area.appendChild(d)
  setTimeout(()=>{d.remove()},5000)
}

async function apiFetch(path, options) {
  const opts = options || {}
  if (!opts.headers) opts.headers = {"Content-Type":"application/json"}
  try {
    const res = await fetch(apiBase + path, opts)
    const ok = res.ok
    updateApiStatus(ok)
    if (!ok) {
      let msg = `Errore API ${res.status}`
      try {
        const t = await res.text()
        if (t) msg += `: ${t}`
      } catch(e) {}
      throw new Error(msg)
    }
    const ct = res.headers.get("Content-Type") || ""
    if (ct.includes("application/json")) return await res.json()
    return null
  } catch(e) {
    updateApiStatus(false)
    showToast("Errore di rete", "Impossibile contattare il server")
    throw e
  }
}

async function checkHealth() {
  try {
    await apiFetch("/health",{method:"GET"})
  } catch(e) {}
}

function setCurrentMonth(date) {
  const d = date || new Date()
  state.currentMonth = new Date(d.getFullYear(), d.getMonth(), 1)
  const monthLabel = el("monthLabel")
  if (monthLabel) monthLabel.textContent = formatMonthLabel(state.currentMonth.getFullYear(), state.currentMonth.getMonth())
}

function getMonthRange() {
  const m = state.currentMonth || new Date()
  const start = new Date(m.getFullYear(), m.getMonth(), 1)
  const end = new Date(m.getFullYear(), m.getMonth() + 1, 0)
  return {start, end}
}

function setSelectedDate(iso) {
  state.selectedDate = iso
  const ref = el("refDateLabel")
  if (ref) ref.textContent = formatDateHuman(iso)
  const snap = el("snapshotTitle")
  if (snap) snap.textContent = "📌 Stato al: " + iso
  const grid = el("calendarGrid")
  if (grid) {
    grid.querySelectorAll(".day").forEach(day=>{
      const d = day.getAttribute("data-date")
      day.setAttribute("aria-selected", d === iso ? "true" : "false")
    })
  }
  loadDashboard()
}
function setActiveTabUI(tab){
  document.body.dataset.activeTab = tab
  document.querySelectorAll('[data-tab]').forEach(b=>{
    b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false')
  })
}

function buildEventsByDate() {
  state.eventsByDate = new Map()
  state.events.forEach(ev=>{
    const d = ev.calendarDate || ev.date
    if (!d) return
    if (!state.eventsByDate.has(d)) state.eventsByDate.set(d,[])
    state.eventsByDate.get(d).push(ev)
  })
}

function mapEventTypeToClass(t) {
  if (t === "income") return "event-line--entrata"
  if (t === "expense") return "event-line--uscita"
  if (t === "card_purchase") return "event-line--acquisto"
  if (t === "card_due") return "event-line--quota"
  if (t === "card_repayment") return "event-line--rimborso"
  return ""
}

function mapEventTypeToLabel(t) {
  if (t === "income") return "Entrata"
  if (t === "expense") return "Uscita"
  if (t === "card_purchase") return "Acquisto su carta"
  if (t === "card_due") return "Quota dovuta"
  if (t === "card_repayment") return "Rimborso carta"
  return t || ""
}

function mapEventTypeToDotClass(t) {
  if (t === "income") return "dot dot--ok"
  if (t === "expense") return "dot dot--bad"
  if (t === "card_purchase") return "dot dot--card"
  if (t === "card_due") return "dot dot--due"
  if (t === "card_repayment") return "dot dot--repay"
  return "dot"
}

function computeDayTotals(events) {
  let totalIncome = 0
  let totalOut = 0          // uscite reali (expense + card_repayment)
  let totalCardPurchase = 0 // acquisti su carta
  let totalCardDue = 0      // quote dovute

  events.forEach(ev => {
    const amt = ev.amount || 0
    switch (ev.type) {
      case "income":
        totalIncome += amt
        break
      case "expense":
      case "card_repayment":
        totalOut += amt
        break
      case "card_purchase":
        totalCardPurchase += amt
        break
      case "card_due":
        totalCardDue += amt
        break
      default:
        break
    }
  })

  const net = totalIncome - totalOut
  return { totalIncome, totalOut, totalCardPurchase, totalCardDue, net }
}

function openDayEventsModal(isoDate) {
  const modal = el("dayEventsModal")
  if (!modal) return

  const headerDate = el("dayModalDate")
  const headerSummary = el("dayModalSummary")
  const content = el("dayModalContent")

  // Eventi del giorno (usa la Map, con fallback su filtro classico)
  let events = state.eventsByDate.get(isoDate)
  if (!events) {
    events = state.events.filter(ev => {
      const d = ev.calendarDate || ev.date
      return d === isoDate
    })
  }

  events = Array.isArray(events) ? [...events] : []
  events.sort((a,b)=>{
    const da = (a.calendarDate || a.date || "")
    const db = (b.calendarDate || b.date || "")
    return da.localeCompare(db)
  })

  // Header
  if (headerDate) headerDate.textContent = formatDateHuman(isoDate)

  if (headerSummary) {
    const t = computeDayTotals(events)
    let summary = `Entrate: ${formatEuro(t.totalIncome)} · Uscite reali: ${formatEuro(t.totalOut)} · Netto: ${formatEuro(t.net)}`
    if (t.totalCardPurchase || t.totalCardDue) {
      summary += ` · Carta: acquisti ${formatEuro(t.totalCardPurchase)} / quote ${formatEuro(t.totalCardDue)}`
    }
    headerSummary.textContent = summary
  }

  // Contenuto
  if (content) {
    content.innerHTML = ""

    if (!events.length) {
      const noEv = document.createElement("div")
      noEv.className = "hint"
      noEv.style.marginTop = "4px"
      noEv.textContent = "Nessun evento registrato per questo giorno."
      content.appendChild(noEv)
    } else {
      events.forEach(ev => {
        const row = document.createElement("button")
        row.type = "button"
        row.dataset.eventId = ev.id
        row.className = "day-modal-row " + (mapEventTypeToClass(ev.type) || "")
        row.style.cssText = `
          width:100%;
          border-radius:10px;
          border:1px solid rgba(148,163,184,0.45);
          padding:7px 9px;
          display:flex;
          flex-direction:column;
          gap:2px;
          background:rgba(15,23,42,0.95);
          cursor:pointer;
          text-align:left;
          transition:background 0.12s ease, transform 0.06s ease, box-shadow 0.12s ease;
        `
        row.addEventListener("mouseover", () => {
          row.style.background = "rgba(30,64,175,0.55)"
          row.style.transform = "translateY(-1px)"
          row.style.boxShadow = "0 8px 24px rgba(15,23,42,0.7)"
        })
        row.addEventListener("mouseout", () => {
          row.style.background = "rgba(15,23,42,0.95)"
          row.style.transform = "none"
          row.style.boxShadow = "none"
        })

        // Riga TOP: dot + titolo + importo
        const top = document.createElement("div")
        top.style.cssText = `
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:8px;
        `
        const left = document.createElement("div")
        left.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;"

        const dot = document.createElement("span")
        dot.className = mapEventTypeToDotClass(ev.type)
        dot.style.marginRight = "0"

        const title = document.createElement("span")
        title.style.cssText = "font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
        title.textContent = ev.title || mapEventTypeToLabel(ev.type)

        left.appendChild(dot)
        left.appendChild(title)

        const amt = document.createElement("span")
        amt.style.cssText = "font-size:13px;font-weight:600;white-space:nowrap;"
        amt.textContent = formatEuro(ev.amount || 0)

        top.appendChild(left)
        top.appendChild(amt)

        // Riga BOTTOM: tipo + wallet
        const bottom = document.createElement("div")
        bottom.style.cssText = "font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;"

        const typeLabel = document.createElement("span")
        typeLabel.textContent = mapEventTypeToLabel(ev.type)

        const wallet = getWalletById(ev.walletId || ev.cardWalletId || ev.fromWalletId || ev.toCardWalletId)
        const walletSpan = document.createElement("span")
        walletSpan.style.cssText = "text-align:right;flex:1;"
        walletSpan.textContent = wallet ? wallet.name : ""

        bottom.appendChild(typeLabel)
        bottom.appendChild(walletSpan)

        row.appendChild(top)
        row.appendChild(bottom)

        // Clic su riga evento ⇒ apre modale evento
        row.addEventListener("click", () => {
          const full = state.events.find(x => String(x.id) === String(ev.id)) || ev
          closeDayEventsModal()
          openEventOverlay(full)
        })

        content.appendChild(row)
      })
    }
  }

  modal.style.display = "flex"
}

function closeDayEventsModal() {
  const modal = el("dayEventsModal")
  if (modal) modal.style.display = "none"
}

function getWalletById(id) {
  if (!id) return null
  return state.wallets.find(w=>String(w.id) === String(id)) || null
}

function renderCalendar() {
  const grid = el("calendarGrid")
  if (!grid) return
  const tpl = el("tplEventLine")
  const {start,end} = getMonthRange()
  const year = start.getFullYear()
  const month = start.getMonth()
  const daysInMonth = end.getDate()
  grid.innerHTML = ""
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day)
    const iso = formatISODate(d)
    const events = state.eventsByDate.get(iso) || []
    const dayDiv = document.createElement("div")
    dayDiv.className = "day"
    dayDiv.setAttribute("data-date", iso)
    dayDiv.setAttribute("aria-selected", state.selectedDate === iso ? "true" : "false")
    const top = document.createElement("div")
    top.className = "day-top"
    const num = document.createElement("div")
    num.className = "day-num"
    num.textContent = String(day)
    const cnt = document.createElement("div")
    cnt.className = "day-count"
    const n = events.length
    cnt.textContent = n === 1 ? "1 evento" : `${n} eventi`
    top.appendChild(num)
    top.appendChild(cnt)
    dayDiv.appendChild(top)
    if (events.length === 0) {
      const h = document.createElement("div")
      h.className = "hint"
      h.textContent = "—"
      dayDiv.appendChild(h)
    } else {
      events.slice(0,3).forEach(ev=>{
        const clone = tpl.content.firstElementChild.cloneNode(true)
        clone.classList.add(mapEventTypeToClass(ev.type))
        const dot = clone.querySelector(".dot")
        if (dot) dot.className = mapEventTypeToDotClass(ev.type)
        const title = clone.querySelector(".title")
        if (title) title.textContent = ev.title || mapEventTypeToLabel(ev.type)
        const amt = clone.querySelector(".amt")
        if (amt) amt.textContent = formatEuro(ev.amount || 0)
        const m = clone.querySelector(".muted")
        if (m) {
          const w = getWalletById(ev.walletId || ev.cardWalletId || ev.toCardWalletId)
          m.textContent = w ? `· ${w.name}` : ""
        }
        clone.dataset.eventId = ev.id
        dayDiv.appendChild(clone)
      })
    }
    grid.appendChild(dayDiv)
  }
}

async function loadEvents() {
  const {start,end} = getMonthRange()
  const from = formatISODate(start)
  const to = formatISODate(end)
  const walletId = el("filterWallet") ? el("filterWallet").value : ""
  const type = el("filterType") ? el("filterType").value : ""
  const q = el("globalSearch") ? el("globalSearch").value.trim() : ""
  const params = new URLSearchParams()
  params.set("from", from)
  params.set("to", to)
  if (walletId) params.set("walletId", walletId)
  if (type) params.set("type", type)
  if (q) params.set("q", q)
  let data = []
  try {
    data = await apiFetch("/events?" + params.toString(),{method:"GET"})
  } catch(e) {
    data = []
  }
  state.events = Array.isArray(data) ? data : []
  buildEventsByDate()
  if (!state.selectedDate) {
    const todayISO = formatISODate(new Date())
    const {start:ms,end:me} = getMonthRange()
    const t = parseISODate(todayISO)
    if (t && t >= ms && t <= me) state.selectedDate = todayISO
    else state.selectedDate = formatISODate(ms)
  }
  renderCalendar()
  setSelectedDate(state.selectedDate)
}

function renderSnapshot() {
  const container = el("snapshotWalletCards")
  if (!container) return
  container.innerHTML = ""
  const tpl = el("tplWalletCard")
  if (!state.dashboard || !Array.isArray(state.dashboard.wallets)) return
  state.dashboard.wallets.forEach(w=>{
    const clone = tpl.content.firstElementChild.cloneNode(true)
    const nameEl = clone.querySelector(".wallet-name")
    const typeEl = clone.querySelector(".wallet-type")
    if (nameEl) nameEl.textContent = w.name || ""
    if (typeEl) typeEl.textContent = w.typeLabel || ("Tipo: " + (w.type || ""))
    const setKpi = (key, value) => {
      const elv = clone.querySelector(`[data-kpi="${key}"]`)
      if (!elv) return
      if (value == null) elv.textContent = "—"
      else elv.textContent = typeof value === "number" ? formatEuro(value) : String(value)
    }
    setKpi("balance", w.balance)
    setKpi("spentSoFar", w.spentSoFar)
    setKpi("spentRemaining", w.spentRemaining)
    setKpi("incomeSoFar", w.incomeSoFar)
    setKpi("incomeRemaining", w.incomeRemaining)
    if (w.compareLastMonthExpenses) {
      const c = w.compareLastMonthExpenses
      const txt = `${c.percent > 0 ? "+" : ""}${c.percent || 0}% (${c.amount >= 0 ? "+" : ""}${formatEuro(c.amount || 0)})`
      setKpi("compareLastMonthExpenses", txt)
    }
    if (w.compareLastMonthIncome) {
      const c = w.compareLastMonthIncome
      const txt = `${c.percent > 0 ? "+" : ""}${c.percent || 0}% (${c.amount >= 0 ? "+" : ""}${formatEuro(c.amount || 0)})`
      setKpi("compareLastMonthIncome", txt)
    }
    const nextEl = clone.querySelector('[data-kpi="nextEvent"]')
    if (nextEl) {
      if (w.nextEvent && w.nextEvent.date) {
        const txt = `${w.nextEvent.date} · ${w.nextEvent.title || ""} (${formatEuro(w.nextEvent.amount || 0)})`
        nextEl.textContent = txt
      } else nextEl.textContent = "—"
    }
    const catSlot = clone.querySelector('[data-slot="categories"]')
    if (catSlot) {
      const cats = Array.isArray(w.categories) ? w.categories.slice(0,10) : []
      if (!cats.length) {
        const row = document.createElement("div")
        row.className = "cat-row"
        const n = document.createElement("span")
        n.textContent = "—"
        const v = document.createElement("strong")
        v.textContent = "—"
        row.appendChild(n)
        row.appendChild(v)
        catSlot.appendChild(row)
      } else {
        cats.forEach(c=>{
          const row = document.createElement("div")
          row.className = "cat-row"
          const n = document.createElement("span")
          n.textContent = c.name || ""
          const v = document.createElement("strong")
          v.textContent = formatEuro(c.amount || 0)
          row.appendChild(n)
          row.appendChild(v)
          catSlot.appendChild(row)
        })
      }
    }
    const cardExtras = clone.querySelector('[data-slot="cardExtras"]')
    if (w.card && cardExtras) {
      cardExtras.classList.remove("hide")
      setKpi("cardLimit", w.card.limit)
      setKpi("availableCredit", w.card.availableCredit)
      setKpi("outstanding", w.card.outstanding)
      setKpi("dueByEom", w.card.dueByEom)
      setKpi("repaymentsThisMonth", w.card.repaymentsThisMonth)
      const df = clone.querySelector('[data-kpi="defaultSourceWallet"]')
      if (df) df.textContent = w.card.defaultSourceWalletName || "—"
    }
    container.appendChild(clone)
  })
}

async function loadDashboard() {
  const asOf = state.selectedDate || formatISODate(new Date())
  const d = parseISODate(asOf)
  const month = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` : asOf.slice(0,7)
  const params = new URLSearchParams()
  params.set("asOf", asOf)
  params.set("month", month)
  let data = null
  try {
    data = await apiFetch("/dashboard?" + params.toString(),{method:"GET"})
  } catch(e) {
    data = null
  }
  state.dashboard = data
  renderSnapshot()
}

async function loadWallets() {
  let data = []
  try {
    data = await apiFetch("/wallets",{method:"GET"})
  } catch(e) {
    data = []
  }
  state.wallets = Array.isArray(data) ? data : []
  const filterWallet = el("filterWallet")
  if (filterWallet) {
    const current = filterWallet.value
    filterWallet.innerHTML = ""
    const optAll = document.createElement("option")
    optAll.value = ""
    optAll.textContent = "Tutti"
    filterWallet.appendChild(optAll)
    state.wallets.forEach(w=>{
      const o = document.createElement("option")
      o.value = w.id
      o.textContent = w.name
      filterWallet.appendChild(o)
    })
    if (current) filterWallet.value = current
  }
  const walletSelects = ["fWallet","fCardWallet","fFromWallet","fToCard","methodsWalletSelect","defaultWallet","defaultCard"]
  walletSelects.forEach(id=>{
    const s = el(id)
    if (!s) return
    const keepFirst = s.id === "methodsWalletSelect" || s.id === "defaultWallet" || s.id === "defaultCard" || s.id === "fCardWallet" || s.id === "fFromWallet" || s.id === "fToCard"
    const firstText = s.options.length ? s.options[0].textContent : ""
    const firstValue = s.options.length ? s.options[0].value : ""
    s.innerHTML = ""
    if (keepFirst) {
      const o0 = document.createElement("option")
      o0.value = firstValue || ""
      o0.textContent = firstText || "Seleziona…"
      s.appendChild(o0)
    }
    state.wallets.forEach(w=>{
      if (id === "fWallet") {
        const o = document.createElement("option")
        o.value = w.id
        o.textContent = w.name
        s.appendChild(o)
      } else if (id === "fCardWallet" || id === "fToCard" || id === "defaultCard") {
        if (w.type === "card") {
          const o = document.createElement("option")
          o.value = w.id
          o.textContent = w.name
          s.appendChild(o)
        }
      } else if (id === "fFromWallet") {
        if (w.type !== "card") {
          const o = document.createElement("option")
          o.value = w.id
          o.textContent = w.name
          s.appendChild(o)
        }
      } else if (id === "methodsWalletSelect" || id === "defaultWallet") {
        const o = document.createElement("option")
        o.value = w.id
        o.textContent = w.name
        s.appendChild(o)
      }
    })
  })
  renderWalletTable()
  loadDefaultSelections()
}

function renderWalletTable() {
  const body = el("walletTableBody")
  if (!body) return
  body.innerHTML = ""
  if (!state.wallets.length) {
    const tr = document.createElement("tr")
    const cols = ["—","—","—","—","—"]
    cols.forEach(txt=>{
      const td = document.createElement("td")
      td.textContent = txt
      tr.appendChild(td)
    })
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const b1 = document.createElement("button")
    b1.className = "btn"
    b1.type = "button"
    b1.disabled = true
    b1.textContent = "Modifica"
    const b2 = document.createElement("button")
    b2.className = "btn btn--danger"
    b2.type = "button"
    b2.disabled = true
    b2.textContent = "Elimina"
    tdA.appendChild(b1)
    tdA.appendChild(b2)
    tr.appendChild(tdA)
    body.appendChild(tr)
    return
  }
  state.wallets.forEach(w=>{
    const tr = document.createElement("tr")
    const tdName = document.createElement("td")
    tdName.textContent = w.name || ""
    const tdType = document.createElement("td")
    tdType.textContent = w.type || ""
    const tdSaldo = document.createElement("td")
    tdSaldo.textContent = w.initialBalance != null ? formatEuro(w.initialBalance) : "—"
    const tdLimit = document.createElement("td")
    tdLimit.textContent = w.type === "card" && w.limit != null ? formatEuro(w.limit) : "—"
    const tdDefault = document.createElement("td")
    if (w.type === "card" && w.defaultSourceWalletId) {
      const src = getWalletById(w.defaultSourceWalletId)
      tdDefault.textContent = src ? src.name : w.defaultSourceWalletId
    } else tdDefault.textContent = "—"
    const tdAct = document.createElement("td")
    tdAct.className = "table-actions"
    const bEdit = document.createElement("button")
    bEdit.className = "btn"
    bEdit.type = "button"
    bEdit.textContent = "Modifica"
    bEdit.addEventListener("click",()=>editWallet(w))
    const bDel = document.createElement("button")
    bDel.className = "btn btn--danger"
    bDel.type = "button"
    bDel.textContent = "Elimina"
    bDel.addEventListener("click",()=>deleteWallet(w))
    tdAct.appendChild(bEdit)
    tdAct.appendChild(bDel)
    tr.appendChild(tdName)
    tr.appendChild(tdType)
    tr.appendChild(tdSaldo)
    tr.appendChild(tdLimit)
    tr.appendChild(tdDefault)
    tr.appendChild(tdAct)
    body.appendChild(tr)
  })
}

async function editWallet(w) {
  const name = prompt("Nome wallet (conto):", w.name || "")
  if (!name) return
  const type = prompt("Tipo (es. banca, carta, contanti):", w.type || "")
  if (!type) return
  const saldoStr = prompt("Saldo iniziale (EUR):", w.initialBalance != null ? String(w.initialBalance) : "")
  const saldo = saldoStr === null || saldoStr === "" ? w.initialBalance : parseNumberInput(saldoStr)
  if (saldoStr && saldo == null) {
    showToast("Importo non valido","Saldo iniziale non valido")
    return
  }
  let limit = w.limit
  let defaultSourceWalletId = w.defaultSourceWalletId
  if (type === "card") {
    const limStr = prompt("Limite carta (EUR):", w.limit != null ? String(w.limit) : "")
    limit = limStr === null || limStr === "" ? w.limit : parseNumberInput(limStr)
    if (limStr && limit == null) {
      showToast("Importo non valido","Limite carta non valido")
      return
    }
    const srcName = prompt("Wallet sorgente default per rimborsi (nome, opzionale):", (getWalletById(w.defaultSourceWalletId) || {}).name || "")
    if (srcName) {
      const src = state.wallets.find(x=>x.name === srcName && x.id !== w.id)
      if (src) defaultSourceWalletId = src.id
    }
  } else {
    limit = null
    defaultSourceWalletId = null
  }
  const payload = {
    name,
    type,
    initialBalance: saldo,
    limit,
    defaultSourceWalletId
  }
  try {
    await apiFetch(`/wallets/${w.id}`,{method:"PUT",body:JSON.stringify(payload)})
    showToast("Salvataggio completato","Wallet aggiornato")
    await loadWallets()
    await loadDashboard()
  } catch(e) {}
}

async function deleteWallet(w) {
  if (!confirm(`Vuoi davvero eliminare il wallet "${w.name}"?`)) return
  try {
    await apiFetch(`/wallets/${w.id}`,{method:"DELETE"})
    showToast("Evento eliminato","Wallet eliminato")
    await loadWallets()
    await loadEvents()
    await loadDashboard()
  } catch(e) {}
}

async function addWallet() {
  const name = prompt("Nome wallet (conto):","")
  if (!name) return
  const type = prompt("Tipo (es. banca, carta, contanti):","banca")
  if (!type) return
  const saldoStr = prompt("Saldo iniziale (EUR):","0")
  const saldo = parseNumberInput(saldoStr)
  if (saldo == null) {
    showToast("Importo non valido","Saldo iniziale non valido")
    return
  }
  let limit = null
  let defaultSourceWalletId = null
  if (type === "card") {
    const limStr = prompt("Limite carta (EUR):","0")
    limit = parseNumberInput(limStr)
    if (limit == null) {
      showToast("Importo non valido","Limite carta non valido")
      return
    }
    const srcName = prompt("Wallet sorgente default per rimborsi (nome, opzionale):","")
    if (srcName) {
      const src = state.wallets.find(x=>x.name === srcName)
      if (src) defaultSourceWalletId = src.id
    }
  }
  const payload = {
    name,
    type,
    initialBalance: saldo,
    limit,
    defaultSourceWalletId
  }
  try {
    await apiFetch("/wallets",{method:"POST",body:JSON.stringify(payload)})
    showToast("Salvataggio completato","Wallet creato")
    await loadWallets()
    await loadDashboard()
  } catch(e) {}
}

async function loadWalletMethods(walletId) {
  const body = el("methodsTableBody")
  if (!body) return
  body.innerHTML = ""
  if (!walletId) {
    const tr = document.createElement("tr")
    const tdM = document.createElement("td")
    tdM.textContent = "—"
    const tdR = document.createElement("td")
    tdR.className = "muted"
    tdR.textContent = "Seleziona un wallet per vedere i metodi"
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const b1 = document.createElement("button")
    b1.className = "btn"
    b1.type = "button"
    b1.disabled = true
    b1.textContent = "Modifica"
    const b2 = document.createElement("button")
    b2.className = "btn btn--danger"
    b2.type = "button"
    b2.disabled = true
    b2.textContent = "Elimina"
    tdA.appendChild(b1)
    tdA.appendChild(b2)
    tr.appendChild(tdM)
    tr.appendChild(tdR)
    tr.appendChild(tdA)
    body.appendChild(tr)
    return
  }
  let data = []
  try {
    data = await apiFetch(`/wallets/${walletId}/methods`,{method:"GET"})
  } catch(e) {
    data = []
  }
  state.methodsByWallet = state.methodsByWallet || {}
  state.methodsByWallet[walletId] = data
  if (!data.length) {
    const tr = document.createElement("tr")
    const tdM = document.createElement("td")
    tdM.textContent = "—"
    const tdR = document.createElement("td")
    tdR.className = "muted"
    tdR.textContent = "Nessun metodo configurato"
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const b1 = document.createElement("button")
    b1.className = "btn"
    b1.type = "button"
    b1.disabled = true
    b1.textContent = "Modifica"
    const b2 = document.createElement("button")
    b2.className = "btn btn--danger"
    b2.type = "button"
    b2.disabled = true
    b2.textContent = "Elimina"
    tdA.appendChild(b1)
    tdA.appendChild(b2)
    tr.appendChild(tdM)
    tr.appendChild(tdR)
    tr.appendChild(tdA)
    body.appendChild(tr)
    return
  }
  data.forEach(m=>{
    const tr = document.createElement("tr")
    const tdM = document.createElement("td")
    tdM.textContent = m.name || ""
    const tdR = document.createElement("td")
    tdR.textContent = m.ruleDescription || ""
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const bE = document.createElement("button")
    bE.className = "btn"
    bE.type = "button"
    bE.textContent = "Modifica"
    bE.addEventListener("click",()=>editMethod(walletId,m))
    const bD = document.createElement("button")
    bD.className = "btn btn--danger"
    bD.type = "button"
    bD.textContent = "Elimina"
    bD.addEventListener("click",()=>deleteMethod(m))
    tdA.appendChild(bE)
    tdA.appendChild(bD)
    tr.appendChild(tdM)
    tr.appendChild(tdR)
    tr.appendChild(tdA)
    body.appendChild(tr)
  })
}

async function addMethod() {
  const walletId = el("methodsWalletSelect") ? el("methodsWalletSelect").value : ""
  if (!walletId) {
    showToast("Campo obbligatorio","Seleziona un wallet per aggiungere un metodo")
    return
  }
  const name = prompt("Nome metodo (es. Unica soluzione, Rate 3 mesi):","")
  if (!name) return
  const rule = prompt("Descrizione regola (es. quota dovuta il 27 del mese):","")
  const payload = {name,ruleDescription:rule}
  try {
    await apiFetch(`/wallets/${walletId}/methods`,{method:"POST",body:JSON.stringify(payload)})
    showToast("Salvataggio completato","Metodo creato")
    await loadWalletMethods(walletId)
  } catch(e) {}
}

async function editMethod(walletId, m) {
  const name = prompt("Nome metodo:", m.name || "")
  if (!name) return
  const rule = prompt("Descrizione regola:", m.ruleDescription || "")
  const payload = {name,ruleDescription:rule}
  try {
    await apiFetch(`/methods/${m.id}`,{method:"PUT",body:JSON.stringify(payload)})
    showToast("Salvataggio completato","Metodo aggiornato")
    await loadWalletMethods(walletId)
  } catch(e) {}
}

async function deleteMethod(m) {
  if (!confirm(`Vuoi eliminare il metodo "${m.name}"?`)) return
  try {
    await apiFetch(`/methods/${m.id}`,{method:"DELETE"})
    showToast("Evento eliminato","Metodo eliminato")
    const sel = el("methodsWalletSelect")
    if (sel && sel.value) await loadWalletMethods(sel.value)
  } catch(e) {}
}

function getSelectedEventType() {
  const cards = Array.from(document.querySelectorAll("#eventTypeCards .type-card"))
  const active = cards.find(c=>c.getAttribute("aria-checked") === "true") || cards[0]
  return active ? active.dataset.eventType : "income"
}

function setSelectedEventType(t) {
  const cards = Array.from(document.querySelectorAll("#eventTypeCards .type-card"))
  cards.forEach(c=>{
    const active = c.dataset.eventType === t
    c.setAttribute("aria-checked", active ? "true" : "false")
  })
  const real = el("sectionRealMovement")
  const cardP = el("sectionCardPurchase")
  const cardR = el("sectionCardRepayment")
  if (real) real.style.display = (t === "income" || t === "expense") ? "" : "none"
  if (cardP) cardP.style.display = t === "card_purchase" ? "" : "none"
  if (cardR) cardR.style.display = t === "card_repayment" ? "" : "none"
}

function updateMethodSections() {
  const method = el("fMethod") ? el("fMethod").value : ""
  const one = el("methodOneShot")
  const mon = el("methodMonthly")
  const cus = el("methodCustom")
  const rev = el("methodRevolving")
  if (one) one.style.display = method === "one_shot" ? "" : "none"
  if (mon) mon.style.display = method === "monthly_installments" ? "" : "none"
  if (cus) cus.style.display = method === "custom_installments" ? "" : "none"
  if (rev) rev.style.display = method === "revolving" ? "" : "none"
}

function loadCategoriesFromStorage() {
  const raw = localStorage.getItem("cf_categories")
  if (!raw) return ["Spesa","Bollette","Trasporti","Abbonamenti","Stipendio"]
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length) return arr
  } catch(e) {}
  return ["Spesa","Bollette","Trasporti","Abbonamenti","Stipendio"]
}

function saveCategoriesToStorage(cats) {
  localStorage.setItem("cf_categories", JSON.stringify(cats))
}

function renderCategories() {
  const cats = loadCategoriesFromStorage()
  const select = el("fCategory")
  if (select) {
    const current = select.value
    select.innerHTML = ""
    const o0 = document.createElement("option")
    o0.value = ""
    o0.textContent = "Seleziona categoria…"
    select.appendChild(o0)
    cats.forEach(c=>{
      const o = document.createElement("option")
      o.value = c
      o.textContent = c
      select.appendChild(o)
    })
    if (current) select.value = current
  }
  const body = el("categoriesTableBody")
  if (!body) return
  body.innerHTML = ""
  if (!cats.length) {
    const tr = document.createElement("tr")
    const td = document.createElement("td")
    td.textContent = "—"
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const b1 = document.createElement("button")
    b1.className = "btn"
    b1.disabled = true
    b1.type = "button"
    b1.textContent = "Modifica"
    const b2 = document.createElement("button")
    b2.className = "btn btn--danger"
    b2.disabled = true
    b2.type = "button"
    b2.textContent = "Elimina"
    tdA.appendChild(b1)
    tdA.appendChild(b2)
    tr.appendChild(td)
    tr.appendChild(tdA)
    body.appendChild(tr)
    return
  }
  cats.forEach(c=>{
    const tr = document.createElement("tr")
    const td = document.createElement("td")
    td.textContent = c
    const tdA = document.createElement("td")
    tdA.className = "table-actions"
    const bE = document.createElement("button")
    bE.className = "btn"
    bE.type = "button"
    bE.textContent = "Modifica"
    bE.addEventListener("click",()=>{
      const catsNow = loadCategoriesFromStorage()
      const idx = catsNow.indexOf(c)
      if (idx === -1) return
      const nv = prompt("Modifica categoria:", c)
      if (!nv) return
      catsNow[idx] = nv
      saveCategoriesToStorage(catsNow)
      renderCategories()
    })
    const bD = document.createElement("button")
    bD.className = "btn btn--danger"
    bD.type = "button"
    bD.textContent = "Elimina"
    bD.addEventListener("click",()=>{
      const catsNow = loadCategoriesFromStorage()
      const idx = catsNow.indexOf(c)
      if (idx === -1) return
      if (!confirm(`Vuoi eliminare la categoria "${c}"?`)) return
      catsNow.splice(idx,1)
      saveCategoriesToStorage(catsNow)
      renderCategories()
    })
    tdA.appendChild(bE)
    tdA.appendChild(bD)
    tr.appendChild(td)
    tr.appendChild(tdA)
    body.appendChild(tr)
  })
}

function addCategory() {
  const cats = loadCategoriesFromStorage()
  const name = prompt("Nuova categoria:","")
  if (!name) return
  if (cats.includes(name)) {
    showToast("Categoria esistente","Questa categoria è già presente")
    return
  }
  cats.push(name)
  saveCategoriesToStorage(cats)
  renderCategories()
}

function loadDefaultSelections() {
  const defW = localStorage.getItem("cf_defaultWallet")
  const defC = localStorage.getItem("cf_defaultCard")
  if (defW && el("defaultWallet")) el("defaultWallet").value = defW
  if (defC && el("defaultCard")) el("defaultCard").value = defC
}

function saveDefaultSelections() {
  const dW = el("defaultWallet")
  const dC = el("defaultCard")
  if (dW) localStorage.setItem("cf_defaultWallet", dW.value || "")
  if (dC) localStorage.setItem("cf_defaultCard", dC.value || "")
}

function addCustomQuoteRow() {
  const tbody = el("customRows")
  if (!tbody) return
  const tr = document.createElement("tr")
  const tdD = document.createElement("td")
  const inpD = document.createElement("input")
  inpD.className = "input"
  inpD.type = "date"
  tdD.appendChild(inpD)
  const tdA = document.createElement("td")
  const inpA = document.createElement("input")
  inpA.className = "input"
  inpA.type = "number"
  inpA.step = "0.01"
  inpA.min = "0"
  inpA.placeholder = "0,00"
  inpA.addEventListener("input",updateCustomTotal)
  tdA.appendChild(inpA)
  const tdAct = document.createElement("td")
  tdAct.className = "table-actions"
  const b = document.createElement("button")
  b.className = "btn btn--danger"
  b.type = "button"
  b.textContent = "Rimuovi"
  b.addEventListener("click",()=>{
    tr.remove()
    updateCustomTotal()
  })
  tdAct.appendChild(b)
  tr.appendChild(tdD)
  tr.appendChild(tdA)
  tr.appendChild(tdAct)
  tbody.appendChild(tr)
  updateCustomTotal()
}

function updateCustomTotal() {
  const tbody = el("customRows")
  if (!tbody) return
  let total = 0
  tbody.querySelectorAll("tr").forEach(tr=>{
    const inp = tr.querySelector('input[type="number"]')
    if (!inp) return
    const v = parseNumberInput(inp.value)
    if (v != null) total += v
  })
  const label = el("customTotal")
  if (label) label.textContent = formatEuro(total)
}

function updateCloneBadge() {
  const chk = el("fCloneNextMonth")
  const badge = el("cloneInfoBadge")
  if (!chk || !badge) return
  const dot = badge.querySelector(".dot") || badge
  if (!chk.checked) {
    badge.textContent = ""
    const d = document.createElement("span")
    d.className = "dot"
    const txt = document.createElement("span")
    txt.textContent = " Nessun clone configurato"
    badge.appendChild(d)
    badge.appendChild(txt)
  } else {
    const n = el("fCloneN") ? el("fCloneN").value : ""
    const sp = el("fCloneSpacing") ? el("fCloneSpacing").value : "same_day"
    badge.textContent = ""
    const d = document.createElement("span")
    d.className = "dot"
    const txt = document.createElement("span")
    const nInt = parseInt(n || "1",10)
    const spLabel = sp === "same_day" ? "stesso giorno" : "giorni consecutivi"
    txt.textContent = ` ${nInt} clone/i, ${spLabel}`
    badge.appendChild(d)
    badge.appendChild(txt)
  }
}

function resetNewEventForm() {
  state.editContext = null
  const f = {
    title: el("fTitle"),
    amount: el("fAmount"),
    cat: el("fCategory"),
    cal: el("fCalendarDate"),
    notes: el("fNotes"),
    wallet: el("fWallet"),
    cardWallet: el("fCardWallet"),
    purchaseDate: el("fPurchaseDate"),
    method: el("fMethod"),
    dueOne: el("fDueDateOneShot"),
    instN: el("fInstN"),
    firstDue: el("fFirstDueMonthly"),
    instAmount: el("fInstAmount"),
    minMonthly: el("fMinMonthly"),
    interestPct: el("fInterestPct"),
    revMode: el("fRevolvingMode"),
    fromWallet: el("fFromWallet"),
    toCard: el("fToCard"),
    payDate: el("fPaymentDate"),
    repayAmount: el("fRepayAmount"),
    isSeries: el("fIsSeries"),
    seriesFreq: el("fSeriesFrequency"),
    seriesMode: el("fSeriesDurationMode"),
    seriesMonths: el("fSeriesMonths"),
    seriesFirst: el("fSeriesFirstDate"),
    cloneNext: el("fCloneNextMonth"),
    cloneN: el("fCloneN"),
    cloneSpacing: el("fCloneSpacing")
  }
  if (f.title) f.title.value = ""
  if (f.amount) f.amount.value = ""
  if (f.cat) f.cat.value = ""
  if (f.cal) f.cal.value = state.selectedDate || ""
  if (f.notes) f.notes.value = ""
  if (f.wallet) f.wallet.value = ""
  if (f.cardWallet) f.cardWallet.value = ""
  if (f.purchaseDate) f.purchaseDate.value = ""
  if (f.method) f.method.value = ""
  if (f.dueOne) f.dueOne.value = ""
  if (f.instN) f.instN.value = ""
  if (f.firstDue) f.firstDue.value = ""
  if (f.instAmount) f.instAmount.value = ""
  if (f.minMonthly) f.minMonthly.value = ""
  if (f.interestPct) f.interestPct.value = ""
  if (f.revMode) f.revMode.value = "simple"
  if (f.fromWallet) f.fromWallet.value = ""
  if (f.toCard) f.toCard.value = ""
  if (f.payDate) f.payDate.value = ""
  if (f.repayAmount) f.repayAmount.value = ""
  if (f.isSeries) f.isSeries.checked = false
  if (f.seriesFreq) f.seriesFreq.disabled = true
  if (f.seriesMode) f.seriesMode.value = "forever"
  if (f.seriesMonths) f.seriesMonths.value = ""
  if (f.seriesFirst) f.seriesFirst.value = ""
  if (f.cloneNext) f.cloneNext.checked = false
  if (f.cloneN) f.cloneN.value = ""
  if (f.cloneSpacing) f.cloneSpacing.value = "same_day"
  const tbody = el("customRows")
  if (tbody) {
    tbody.innerHTML = ""
    addCustomQuoteRow()
  }
  updateMethodSections()
  updateCloneBadge()
}

function buildSeriesPayload() {
  const isSeries = el("fIsSeries") ? el("fIsSeries").checked : false
  if (!isSeries) return null
  const freq = "monthly"
  const mode = el("fSeriesDurationMode") ? el("fSeriesDurationMode").value : "forever"
  const monthsStr = el("fSeriesMonths") ? el("fSeriesMonths").value : ""
  const first = el("fSeriesFirstDate") ? el("fSeriesFirstDate").value : ""
  if (!first) {
    showToast("Data non valida","Data prima occorrenza obbligatoria per la serie")
    return null
  }
  let months = null
  if (mode === "n_months") {
    const m = parseInt(monthsStr || "0",10)
    if (!m || m <= 0) {
      showToast("Campo obbligatorio","Numero di mesi per la serie non valido")
      return null
    }
    months = m
  }
  return {
    frequency: freq,
    durationMode: mode,
    months,
    firstDate: first
  }
}

function buildEventPayloadFromForm(isEditing) {
  const titleEl = el("fTitle")
  const amountEl = el("fAmount")
  const catEl = el("fCategory")
  const calEl = el("fCalendarDate")
  const notesEl = el("fNotes")
  const title = titleEl ? titleEl.value.trim() : ""
  if (!title) {
    showToast("Campo obbligatorio","Campo obbligatorio: Titolo")
    return null
  }
  const amount = parseNumberInput(amountEl ? amountEl.value : "")
  if (!amount || amount <= 0) {
    showToast("Importo non valido","Importo non valido")
    return null
  }
  const category = catEl ? catEl.value : ""
  if (!category) {
    showToast("Campo obbligatorio","Campo obbligatorio: Categoria")
    return null
  }
  const calendarDate = calEl ? calEl.value : ""
  if (!calendarDate || !parseISODate(calendarDate)) {
    showToast("Data non valida","Data nel calendario non valida")
    return null
  }
  const notes = notesEl ? notesEl.value.trim() : ""
  const type = getSelectedEventType()
  const base = {
    type,
    title,
    amount,
    category,
    calendarDate,
    notes
  }
  if (type === "income" || type === "expense") {
    const wId = el("fWallet") ? el("fWallet").value : ""
    if (!wId) {
      showToast("Campo obbligatorio","Seleziona un wallet")
      return null
    }
    base.walletId = wId
  }
  if (type === "card_purchase") {
    const cardId = el("fCardWallet") ? el("fCardWallet").value : ""
    const purchaseDate = el("fPurchaseDate") ? el("fPurchaseDate").value : ""
    const method = el("fMethod") ? el("fMethod").value : ""
    if (!cardId) {
      showToast("Campo obbligatorio","Seleziona una carta")
      return null
    }
    if (!purchaseDate || !parseISODate(purchaseDate)) {
      showToast("Data non valida","Data acquisto reale non valida")
      return null
       }
    if (!method) {
      showToast("Campo obbligatorio","Seleziona un metodo per costruire le quote")
      return null
    }
    base.cardWalletId = cardId
    base.purchaseDate = purchaseDate
    const schedule = {method}
    if (method === "one_shot") {
      const dd = el("fDueDateOneShot") ? el("fDueDateOneShot").value : ""
      if (!dd || !parseISODate(dd)) {
        showToast("Data non valida","Data quota dovuta non valida")
        return null
      }
      schedule.oneShot = {dueDate: dd}
    }
    if (method === "monthly_installments") {
      const instN = el("fInstN") ? parseInt(el("fInstN").value || "0",10) : 0
      const firstDue = el("fFirstDueMonthly") ? el("fFirstDueMonthly").value : ""
      const instAmount = parseNumberInput(el("fInstAmount") ? el("fInstAmount").value : "")
      if (!instN || instN < 2) {
        showToast("Campo obbligatorio","Numero rate non valido")
        return null
      }
      if (!firstDue || !parseISODate(firstDue)) {
        showToast("Data non valida","Prima quota dovuta non valida")
        return null
      }
      if (!instAmount || instAmount <= 0) {
        showToast("Importo non valido","Importo rata non valido")
        return null
      }
      schedule.monthlyInstallments = {count: instN, firstDueDate: firstDue, installmentAmount: instAmount}
    }
    if (method === "custom_installments") {
      const tbody = el("customRows")
      if (!tbody) return null
      const rows = Array.from(tbody.querySelectorAll("tr"))
      if (!rows.length) {
        showToast("Campo obbligatorio","Inserisci almeno una quota personalizzata")
        return null
      }
      const list = []
      for (const tr of rows) {
        const dInp = tr.querySelector('input[type="date"]')
        const aInp = tr.querySelector('input[type="number"]')
        const dd = dInp ? dInp.value : ""
        const aa = parseNumberInput(aInp ? aInp.value : "")
        if (!dd || !parseISODate(dd)) {
          showToast("Data non valida","Data quota personalizzata non valida")
          return null
        }
        if (!aa || aa <= 0) {
          showToast("Importo non valido","Importo quota personalizzata non valido")
          return null
        }
        list.push({date: dd, amount: aa})
      }
      schedule.customInstallments = list
    }
    if (method === "revolving") {
      const minM = parseNumberInput(el("fMinMonthly") ? el("fMinMonthly").value : "")
      const pct = parseNumberInput(el("fInterestPct") ? el("fInterestPct").value : "")
      const mode = el("fRevolvingMode") ? el("fRevolvingMode").value : "simple"
      if (!minM || minM < 0) {
        showToast("Importo non valido","Minimo mensile non valido")
        return null
      }
      if (pct == null || pct < 0) {
        showToast("Importo non valido","Interessi % mensile non validi")
        return null
      }
      schedule.revolving = {minMonthly: minM, interestPercent: pct, mode}
    }
    base.schedule = schedule
  }
  if (type === "card_repayment") {
    const fromWalletId = el("fFromWallet") ? el("fFromWallet").value : ""
    const toCardWalletId = el("fToCard") ? el("fToCard").value : ""
    const paymentDate = el("fPaymentDate") ? el("fPaymentDate").value : ""
    const repayAmount = parseNumberInput(el("fRepayAmount") ? el("fRepayAmount").value : "")
    if (!fromWalletId) {
      showToast("Campo obbligatorio","Seleziona il wallet sorgente")
      return null
    }
    if (!toCardWalletId) {
      showToast("Campo obbligatorio","Seleziona la carta di destinazione")
      return null
    }
    if (!paymentDate || !parseISODate(paymentDate)) {
      showToast("Data non valida","Data pagamento reale non valida")
      return null
    }
    if (!repayAmount || repayAmount <= 0) {
      showToast("Importo non valido","Importo rimborso non valido")
      return null
    }
    base.fromWalletId = fromWalletId
    base.toCardWalletId = toCardWalletId
    base.paymentDate = paymentDate
    base.amount = repayAmount
  }
  if (!isEditing) {
    const seriesPayload = buildSeriesPayload()
    if (seriesPayload === null && el("fIsSeries") && el("fIsSeries").checked) return null
    if (seriesPayload) base.series = seriesPayload
  }
  base.cloning = null
  const cloneChk = el("fCloneNextMonth") ? el("fCloneNextMonth").checked : false
  if (cloneChk && type === "card_purchase") {
    const nStr = el("fCloneN") ? el("fCloneN").value : ""
    const n = parseInt(nStr || "1",10)
    const spacing = el("fCloneSpacing") ? el("fCloneSpacing").value : "same_day"
    if (!n || n <= 0) {
      showToast("Campo obbligatorio","Numero copie non valido")
      return null
    }
    base.cloning = {count: n, spacing}
  }
  return base
}

function computeCloneDates(baseDateIso, cloning) {
  const res = []
  if (!cloning) return res
  const base = parseISODate(baseDateIso)
  if (!base) return res
  const adjustments = []
  for (let i = 1; i <= cloning.count; i++) {
    let target
    if (cloning.spacing === "same_day") {
      const mIndex = base.getMonth() + i
      const y = base.getFullYear() + Math.floor(mIndex / 12)
      const m = (mIndex % 12 + 12) % 12
      const day = base.getDate()
      target = new Date(y, m, day)
      if (target.getMonth() !== m) {
        const last = new Date(y, m + 1, 0)
        target = last
        adjustments.push({month: mesiLunghi[m], date: formatISODate(last)})
      }
    } else {
      const t = new Date(base.getTime())
      t.setDate(t.getDate() + i)
      target = t
    }
    res.push(formatISODate(target))
  }
  return {dates: res, adjustments}
}

async function saveEvent() {
  const isEditing = !!state.editContext
  const payload = buildEventPayloadFromForm(isEditing)
  if (!payload) return
  const edit = state.editContext
  try {
    if (edit && edit.mode === "single") {
      await apiFetch(`/events/${edit.eventId}`,{method:"PUT",body:JSON.stringify(payload)})
      showToast("Salvataggio completato","Evento aggiornato")
      state.editContext = null
    } else if (edit && edit.mode === "thisAndFuture" && edit.seriesId) {
      const fromDate = payload.calendarDate || state.selectedDate
      const body = {from: fromDate, patch: payload}
      await apiFetch(`/series/${edit.seriesId}/future`,{method:"PUT",body:JSON.stringify(body)})
      showToast("Salvataggio completato","Serie aggiornata da questa data in poi")
      state.editContext = null
    } else {
      const cloning = payload.cloning
      const hasCloning = !!cloning
      if (hasCloning) delete payload.cloning
      await apiFetch("/events",{method:"POST",body:JSON.stringify(payload)})
      if (hasCloning && payload.type === "card_purchase") {
        const baseDate = payload.calendarDate
        const {dates,adjustments} = computeCloneDates(baseDate, cloning)
        for (const d of dates) {
          const clonePayload = Object.assign({}, payload, {calendarDate:d, purchaseDate: payload.purchaseDate})
          if (clonePayload.series) delete clonePayload.series
          await apiFetch("/events",{method:"POST",body:JSON.stringify(clonePayload)})
        }
        if (adjustments.length) {
          showToast("Informazione","Alcune copie sono state spostate all’ultimo giorno del mese perché il giorno originale non esisteva")
        }
      }
      showToast("Salvataggio completato","Evento creato")
    }
    await loadEvents()
    await loadDashboard()
  } catch(e) {}
}

function openEventOverlay(evt) {
  const overlay = el("eventOverlay")
  if (!overlay) return
  overlay.classList.add("event-overlay--open")
  overlay.dataset.eventId = evt.id
  const badge = el("eventTypeBadge")
  const label = el("eventTypeLabel")
  const dot = badge ? badge.querySelector(".dot") : null
  if (label) label.textContent = mapEventTypeToLabel(evt.type)
  if (dot) dot.className = mapEventTypeToDotClass(evt.type)
  const meta = el("eventMeta")
  if (meta) {
    const wallet = getWalletById(evt.walletId || evt.cardWalletId || evt.toCardWalletId)
    const walletName = wallet ? wallet.name : "—"
    const impact = evt.type === "income" ? "Saldo +"
      : evt.type === "expense" ? "Saldo −"
      : evt.type === "card_purchase" ? "Plafond −"
      : evt.type === "card_due" ? "Debito (nessun movimento)"
      : evt.type === "card_repayment" ? "Saldo sorgente −, Plafond carta +"
      : ""
    const parts = []
    parts.push(`Wallet: ${walletName}`)
    parts.push(`Tipo: ${mapEventTypeToLabel(evt.type)}`)
    if (impact) parts.push(`Impatto: ${impact}`)
    if (evt.calendarDate) parts.push(`Data nel calendario: ${evt.calendarDate}`)
    if (evt.purchaseDate) parts.push(`Data acquisto reale: ${evt.purchaseDate}`)
    if (evt.paymentDate) parts.push(`Data pagamento reale: ${evt.paymentDate}`)
    meta.textContent = parts.join(" · ")
  }
  const seriesInfo = el("eventSeriesInfo")
  if (seriesInfo) {
    if (evt.seriesId) seriesInfo.classList.remove("hide")
    else seriesInfo.classList.add("hide")
  }
  const quotesSection = el("eventQuotesSection")
  if (quotesSection) {
    if (evt.type === "card_purchase") {
      quotesSection.classList.remove("hide")
      renderQuotesForPurchase(evt)
    } else {
      quotesSection.classList.add("hide")
      const list = el("eventQuotesList")
      if (list) list.innerHTML = ""
    }
  }
  const repSection = el("eventRepaymentSection")
  if (repSection) {
    if (evt.type === "card_repayment") {
      repSection.classList.remove("hide")
      const fromSel = el("editRepayFromWallet")
      const toSel = el("editRepayToCard")
      if (fromSel) {
        fromSel.innerHTML = ""
        state.wallets.filter(w=>w.type !== "card").forEach(w=>{
          const o = document.createElement("option")
          o.value = w.id
          o.textContent = w.name
          fromSel.appendChild(o)
        })
        if (evt.fromWalletId) fromSel.value = evt.fromWalletId
      }
      if (toSel) {
        toSel.innerHTML = ""
        state.wallets.filter(w=>w.type === "card").forEach(w=>{
          const o = document.createElement("option")
          o.value = w.id
          o.textContent = w.name
          toSel.appendChild(o)
        })
        if (evt.toCardWalletId) toSel.value = evt.toCardWalletId
      }
      const d = el("editRepayDate")
      const a = el("editRepayAmount")
      if (d) d.value = evt.paymentDate || evt.calendarDate || ""
      if (a) a.value = evt.amount != null ? String(evt.amount) : ""
    } else {
      repSection.classList.add("hide")
    }
  }
}

function closeEventOverlay() {
  const overlay = el("eventOverlay")
  if (overlay) overlay.classList.remove("event-overlay--open")
}

function renderQuotesForPurchase(purchaseEvent) {
  const list = el("eventQuotesList")
  if (!list) return
  list.innerHTML = ""
  const dueEvents = state.events.filter(ev=>ev.type === "card_due" && ev.parentId === purchaseEvent.id)
  if (!dueEvents.length) {
    const div = document.createElement("div")
    div.className = "event-quote-row"
    const s = document.createElement("span")
    s.textContent = "Nessuna quota trovata"
    div.appendChild(s)
    list.appendChild(div)
    return
  }
  dueEvents.sort((a,b)=>{
    const da = a.calendarDate || a.date || ""
    const db = b.calendarDate || b.date || ""
    return da.localeCompare(db)
  })
  dueEvents.forEach(ev=>{
    const row = document.createElement("div")
    row.className = "event-quote-row"
    const sMain = document.createElement("span")
    const d = ev.calendarDate || ev.date || ""
    sMain.textContent = `${d} · ${formatEuro(ev.amount || 0)}`
    const sState = document.createElement("span")
    sState.className = "muted"
    sState.textContent = `Stato: ${ev.status || "attiva"}`
    const act = document.createElement("span")
    act.className = "table-actions"
    const bE = document.createElement("button")
    bE.className = "btn"
    bE.type = "button"
    bE.textContent = "Modifica"
    bE.addEventListener("click",()=>editDueEvent(ev))
    const bSkip = document.createElement("button")
    bSkip.className = "btn btn--danger"
    bSkip.type = "button"
    bSkip.textContent = "Salta quota"
    bSkip.addEventListener("click",()=>deleteDueEvent(ev))
    act.appendChild(bE)
    act.appendChild(bSkip)
    row.appendChild(sMain)
    row.appendChild(sState)
    row.appendChild(act)
    list.appendChild(row)
  })
}

async function editDueEvent(ev) {
  const newDate = prompt("Nuova data quota (YYYY-MM-DD):", ev.calendarDate || ev.date || "")
  if (!newDate || !parseISODate(newDate)) {
    showToast("Data non valida","Data quota non valida")
    return
  }
  const amtStr = prompt("Nuovo importo quota (EUR):", ev.amount != null ? String(ev.amount) : "")
  const amt = parseNumberInput(amtStr)
  if (!amt || amt <= 0) {
    showToast("Importo non valido","Importo quota non valido")
    return
  }
  const payload = {
    calendarDate: newDate,
    amount: amt
  }
  try {
    await apiFetch(`/events/${ev.id}`,{method:"PUT",body:JSON.stringify(payload)})
    showToast("Salvataggio completato","Quota aggiornata")
    await loadEvents()
    const p = state.events.find(e=>e.id === ev.parentId) || null
    if (p) renderQuotesForPurchase(p)
    await loadDashboard()
  } catch(e) {}
}

async function deleteDueEvent(ev) {
  if (!confirm("Vuoi saltare questa quota? Verrà eliminata dal calendario.")) return
  try {
    await apiFetch(`/events/${ev.id}`,{method:"DELETE"})
    showToast("Evento eliminato","Quota eliminata")
    await loadEvents()
    const p = state.events.find(e=>e.id === ev.parentId) || null
    if (p) renderQuotesForPurchase(p)
    await loadDashboard()
  } catch(e) {}
}

function startEditEvent(eventId, mode) {
  const evt = state.events.find(e=>String(e.id) === String(eventId))
  if (!evt) {
    showToast("Errore","Evento non trovato")
    return
  }
  state.editContext = {mode, eventId: evt.id, seriesId: evt.seriesId || null}
  setActiveTabUI("nuovo")
  setSelectedEventType(evt.type)
  const t = el("fTitle")
  const a = el("fAmount")
  const c = el("fCategory")
  const d = el("fCalendarDate")
  const n = el("fNotes")
  if (t) t.value = evt.title || ""
  if (a) a.value = evt.amount != null ? String(evt.amount) : ""
  if (c) c.value = evt.category || ""
  if (d) d.value = evt.calendarDate || ""
  if (n) n.value = evt.notes || ""
  if (evt.type === "income" || evt.type === "expense") {
    const w = el("fWallet")
    if (w) w.value = evt.walletId || ""
  }
  if (evt.type === "card_purchase") {
    const cw = el("fCardWallet")
    const pd = el("fPurchaseDate")
    const m = el("fMethod")
    if (cw) cw.value = evt.cardWalletId || ""
    if (pd) pd.value = evt.purchaseDate || ""
    if (m && evt.schedule && evt.schedule.method) m.value = evt.schedule.method
    updateMethodSections()
  }
  if (evt.type === "card_repayment") {
    const fw = el("fFromWallet")
    const tw = el("fToCard")
    const pd = el("fPaymentDate")
    const ra = el("fRepayAmount")
    if (fw && evt.fromWalletId) fw.value = evt.fromWalletId
    if (tw && evt.toCardWalletId) tw.value = evt.toCardWalletId
    if (pd) pd.value = evt.paymentDate || evt.calendarDate || ""
    if (ra) ra.value = evt.amount != null ? String(evt.amount) : ""
  }
  const chkSeries = el("fIsSeries")
  if (chkSeries) chkSeries.checked = false
  const sf = el("fSeriesFrequency")
  if (sf) sf.disabled = true
  closeEventOverlay()
}

async function deleteSingleEvent(eventId) {
  if (!confirm("Vuoi davvero eliminare solo questo evento?")) return
  try {
    await apiFetch(`/events/${eventId}`,{method:"DELETE"})
    showToast("Evento eliminato","Evento eliminato")
    await loadEvents()
    await loadDashboard()
    closeEventOverlay()
  } catch(e) {}
}

async function deleteThisAndFuture(evt) {
  if (!evt.seriesId) {
    showToast("Errore","Questo evento non fa parte di una serie")
    return
  }
  if (!confirm("Questa azione modificherà anche gli eventi futuri: confermi l’eliminazione da questa data in poi?")) return
  const from = evt.calendarDate || state.selectedDate
  const params = new URLSearchParams()
  params.set("from", from)
  try {
    await apiFetch(`/series/${evt.seriesId}/future?${params.toString()}`,{method:"DELETE"})
    showToast("Evento eliminato","Eventi futuri della serie eliminati")
    await loadEvents()
    await loadDashboard()
    closeEventOverlay()
  } catch(e) {}
}

async function deleteSeriesAll(evt) {
  if (!evt.seriesId) {
    showToast("Errore","Questo evento non fa parte di una serie")
    return
  }
  if (!confirm("Vuoi eliminare tutta la serie? Tutti gli eventi collegati verranno rimossi.")) return
  try {
    await apiFetch(`/series/${evt.seriesId}`,{method:"DELETE"})
    showToast("Evento eliminato","Serie eliminata")
    await loadEvents()
    await loadDashboard()
    closeEventOverlay()
  } catch(e) {}
}

async function loadCardsDashboard() {
  const container = el("cardsDashboard")
  if (!container) return
  container.innerHTML = ""
  const asOf = state.selectedDate || formatISODate(new Date())
  const d = parseISODate(asOf)
  const month = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}` : asOf.slice(0,7)
  const params = new URLSearchParams()
  params.set("asOf", asOf)
  params.set("month", month)
  let data = null
  try {
    data = await apiFetch("/dashboard?" + params.toString(),{method:"GET"})
  } catch(e) {
    data = null
  }
  state.lastCardsDashboard = data
  if (!data || !Array.isArray(data.wallets)) {
    const fs = document.createElement("div")
    fs.className = "form-section"
    const p = document.createElement("p")
    p.className = "section-title"
    p.textContent = "Nessuna carta"
    fs.appendChild(p)
    container.appendChild(fs)
    return
  }
  const cards = data.wallets.filter(w=>w.type === "card" || (w.card && (w.card.outstanding != null || w.card.dueByEom != null)))
  if (!cards.length) {
    const fs = document.createElement("div")
    fs.className = "form-section"
    const p = document.createElement("p")
    p.className = "section-title"
    p.textContent = "Nessuna carta"
    fs.appendChild(p)
    container.appendChild(fs)
    return
  }
  cards.forEach(c=>{
    const fs = document.createElement("div")
    fs.className = "form-section"
    const title = document.createElement("p")
    title.className = "section-title"
    title.textContent = c.name || "Carta"
    fs.appendChild(title)
    const kpi = document.createElement("div")
    kpi.className = "kpi"
    const addKpi = (label,val) => {
      const dWrap = document.createElement("div")
      const k = document.createElement("div")
      k.className = "k"
      k.textContent = label
      const v = document.createElement("div")
      v.className = "v"
      v.textContent = val
      dWrap.appendChild(k)
      dWrap.appendChild(v)
      kpi.appendChild(dWrap)
    }
    const cardData = c.card || {}
    addKpi("Debito totale attuale", formatEuro(cardData.outstanding || 0))
    addKpi("Quote dovute entro fine mese", formatEuro(cardData.dueByEom || 0))
    addKpi("Rimborsi effettuati nel mese", formatEuro(cardData.repaymentsThisMonth || 0))
    const diff = (cardData.dueByEom || 0) - (cardData.repaymentsThisMonth || 0)
    addKpi("Differenza", formatEuro(diff))
    fs.appendChild(kpi)
    const hr = document.createElement("div")
    hr.className = "hr"
    fs.appendChild(hr)
    const table = document.createElement("table")
    table.setAttribute("aria-label","Elenco rimborsi del mese")
    const thead = document.createElement("thead")
    const trH = document.createElement("tr")
    ;["Data pagamento reale","Da wallet","Importo","Azioni"].forEach(h=>{
      const th = document.createElement("th")
      th.textContent = h
      trH.appendChild(th)
    })
    thead.appendChild(trH)
    table.appendChild(thead)
    const tbody = document.createElement("tbody")
    const repayments = Array.isArray(cardData.repayments) ? cardData.repayments : []
    if (!repayments.length) {
      const tr = document.createElement("tr")
      const td1 = document.createElement("td")
      td1.textContent = "—"
      const td2 = document.createElement("td")
      td2.textContent = "—"
      const td3 = document.createElement("td")
      td3.textContent = "—"
      const td4 = document.createElement("td")
      td4.className = "table-actions"
      const bE = document.createElement("button")
      bE.className = "btn"
      bE.type = "button"
      bE.disabled = true
      bE.textContent = "Modifica"
      const bD = document.createElement("button")
      bD.className = "btn btn--danger"
      bD.type = "button"
      bD.disabled = true
      bD.textContent = "Cancella"
      td4.appendChild(bE)
      td4.appendChild(bD)
      tr.appendChild(td1)
      tr.appendChild(td2)
      tr.appendChild(td3)
      tr.appendChild(td4)
      tbody.appendChild(tr)
    } else {
      repayments.forEach(r=>{
        const tr = document.createElement("tr")
        const td1 = document.createElement("td")
        td1.textContent = r.paymentDate || r.calendarDate || "—"
        const td2 = document.createElement("td")
        const w = getWalletById(r.fromWalletId)
        td2.textContent = w ? w.name : "—"
        const td3 = document.createElement("td")
        td3.textContent = formatEuro(r.amount || 0)
        const td4 = document.createElement("td")
        td4.className = "table-actions"
        const bE = document.createElement("button")
        bE.className = "btn"
        bE.type = "button"
        bE.textContent = "Modifica"
        bE.addEventListener("click",()=>startEditEvent(r.id,"single"))
        const bD = document.createElement("button")
        bD.className = "btn btn--danger"
        bD.type = "button"
        bD.textContent = "Cancella"
        bD.addEventListener("click",()=>deleteSingleEvent(r.id))
        td4.appendChild(bE)
        td4.appendChild(bD)
        tr.appendChild(td1)
        tr.appendChild(td2)
        tr.appendChild(td3)
        tr.appendChild(td4)
        tbody.appendChild(tr)
      })
    }
    table.appendChild(tbody)
    fs.appendChild(table)
    const hint = document.createElement("div")
    hint.className = "hint"
    hint.style.marginTop = "10px"
    hint.textContent = "“Suggerisci importo” è solo un suggerimento (nessuna azione automatica)."
    fs.appendChild(hint)
    container.appendChild(fs)
  })
}

function suggestRepayment() {
  const data = state.lastCardsDashboard
  if (!data || !Array.isArray(data.wallets)) {
    showToast("Suggerimento non disponibile","Carica prima i dati delle carte")
    return
  }
  const cards = data.wallets.filter(w=>w.type === "card" || w.card)
  if (!cards.length) {
    showToast("Suggerimento non disponibile","Nessuna carta trovata")
    return
  }
  if (cards.length === 1) {
    const c = cards[0]
    const cardData = c.card || {}
    const diff = (cardData.dueByEom || 0) - (cardData.repaymentsThisMonth || 0)
    const sug = diff > 0 ? diff : 0
    showToast("Suggerimento importo",`Per ${c.name} è consigliabile pagare almeno ${formatEuro(sug)} (debito entro fine mese meno rimborsi già effettuati).`)
    return
  }
  const names = cards.map(c=>c.name || "").filter(Boolean)
  const chosen = prompt("Per quale carta vuoi il suggerimento?\n" + names.join(", "))
  if (!chosen) return
  const card = cards.find(c=>c.name === chosen)
  if (!card) {
    showToast("Suggerimento non disponibile","Carta non trovata")
    return
  }
  const cardData = card.card || {}
  const diff = (cardData.dueByEom || 0) - (cardData.repaymentsThisMonth || 0)
  const sug = diff > 0 ? diff : 0
  showToast("Suggerimento importo",`Per ${card.name} è consigliabile pagare almeno ${formatEuro(sug)}.`)
}

function exportConfig() {
  const cfg = {
    categories: loadCategoriesFromStorage(),
    defaultWalletId: localStorage.getItem("cf_defaultWallet") || "",
    defaultCardId: localStorage.getItem("cf_defaultCard") || "",
    exportedAt: new Date().toISOString()
  }
  const blob = new Blob([JSON.stringify(cfg,null,2)],{type:"application/json"})
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "controllo-finanze-config.json"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function importConfig() {
  const text = prompt("Incolla qui il JSON di export:","")
  if (!text) return
  try {
    const cfg = JSON.parse(text)
    if (Array.isArray(cfg.categories)) {
      saveCategoriesToStorage(cfg.categories)
      renderCategories()
    }
    if (cfg.defaultWalletId && el("defaultWallet")) {
      el("defaultWallet").value = cfg.defaultWalletId
      localStorage.setItem("cf_defaultWallet", cfg.defaultWalletId)
    }
    if (cfg.defaultCardId && el("defaultCard")) {
      el("defaultCard").value = cfg.defaultCardId
      localStorage.setItem("cf_defaultCard", cfg.defaultCardId)
    }
    showToast("Salvataggio completato","Import completato")
  } catch(e) {
    showToast("Errore","JSON non valido")
  }
}

function resetUI() {
  if (!confirm("Vuoi resettare l’interfaccia? Verranno cancellate solo preferenze e filtri locali.")) return
  localStorage.removeItem("cf_categories")
  localStorage.removeItem("cf_defaultWallet")
  localStorage.removeItem("cf_defaultCard")
  const filterWallet = el("filterWallet")
  const filterType = el("filterType")
  const globalSearch = el("globalSearch")
  if (filterWallet) filterWallet.value = ""
  if (filterType) filterType.value = ""
  if (globalSearch) globalSearch.value = ""
  renderCategories()
  loadWallets()
  showToast("Reset UI","Preferenze interfaccia resettate")
}

function initEventListeners() {
  const cards = Array.from(document.querySelectorAll("#eventTypeCards .type-card"))
  cards.forEach(card=>{
    card.addEventListener("click",()=>{
      setSelectedEventType(card.dataset.eventType)
    })
    card.addEventListener("keydown",e=>{
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        setSelectedEventType(card.dataset.eventType)
      }
    })
  })
  const methodSel = el("fMethod")
  if (methodSel) methodSel.addEventListener("change",updateMethodSections)
  const btnAddCustomRow = el("btnAddCustomRow")
  if (btnAddCustomRow) btnAddCustomRow.addEventListener("click",addCustomQuoteRow)
  const cloneChk = el("fCloneNextMonth")
  if (cloneChk) cloneChk.addEventListener("change",updateCloneBadge)
  const cloneN = el("fCloneN")
  const cloneSp = el("fCloneSpacing")
  if (cloneN) cloneN.addEventListener("input",updateCloneBadge)
  if (cloneSp) cloneSp.addEventListener("change",updateCloneBadge)
  const btnReset = el("btnResetNewEvent")
  if (btnReset) btnReset.addEventListener("click",resetNewEventForm)
  const btnSave = el("btnSaveEvent")
  if (btnSave) btnSave.addEventListener("click",saveEvent)
  const grid = el("calendarGrid")
  if (grid) {
    grid.addEventListener("click", e => {
      // 1) Se ho cliccato su un evento, apro direttamente il modale evento
      const evLine = e.target.closest(".event-line")
      if (evLine && evLine.dataset.eventId) {
        const evt = state.events.find(x => String(x.id) === String(evLine.dataset.eventId))
        if (evt) openEventOverlay(evt)
        return
      }
  
      // 2) Altrimenti ho cliccato sul giorno ⇒ seleziono e apro il modale giorno
      const day = e.target.closest(".day")
      if (day) {
        const iso = day.getAttribute("data-date")
        if (iso) {
          setSelectedDate(iso)
          openDayEventsModal(iso)
        }
      }
    })
  }
  const btnPrev = el("btnPrevMonth")
  const btnNext = el("btnNextMonth")
  if (btnPrev) btnPrev.addEventListener("click",()=>{
    const m = state.currentMonth || new Date()
    setCurrentMonth(new Date(m.getFullYear(), m.getMonth()-1, 1))
    state.selectedDate = null
    loadEvents()
  })
  if (btnNext) btnNext.addEventListener("click",()=>{
    const m = state.currentMonth || new Date()
    setCurrentMonth(new Date(m.getFullYear(), m.getMonth()+1, 1))
    state.selectedDate = null
    loadEvents()
  })
  const filterWallet = el("filterWallet")
  const filterType = el("filterType")
  const globalSearch = el("globalSearch")
  if (filterWallet) filterWallet.addEventListener("change",loadEvents)
  if (filterType) filterType.addEventListener("change",loadEvents)
  if (globalSearch) globalSearch.addEventListener("change",loadEvents)
  const btnOggi = el("btnOggi")
  if (btnOggi) btnOggi.addEventListener("click",()=>{
    const today = new Date()
    setCurrentMonth(today)
    state.selectedDate = formatISODate(today)
    loadEvents()
  })
  const btnRicarica = el("btnRicarica")
  if (btnRicarica) btnRicarica.addEventListener("click",()=>{
    loadWallets()
    loadEvents()
    loadDashboard()
  })
  const methodsWalletSelect = el("methodsWalletSelect")
  if (methodsWalletSelect) methodsWalletSelect.addEventListener("change",()=>{
    loadWalletMethods(methodsWalletSelect.value)
  })
  const btnAddWallet = el("btnAddWallet")
  if (btnAddWallet) btnAddWallet.addEventListener("click",addWallet)
  const btnReloadWallets = el("btnReloadWallets")
  if (btnReloadWallets) btnReloadWallets.addEventListener("click",loadWallets)
  const btnAddMethod = el("btnAddMethod")
  if (btnAddMethod) btnAddMethod.addEventListener("click",addMethod)
  const btnAddCategory = el("btnAddCategory")
  if (btnAddCategory) btnAddCategory.addEventListener("click",addCategory)
  const btnReloadCategories = el("btnReloadCategories")
  if (btnReloadCategories) btnReloadCategories.addEventListener("click",renderCategories)
  const defaultWalletSel = el("defaultWallet")
  const defaultCardSel = el("defaultCard")
  if (defaultWalletSel) defaultWalletSel.addEventListener("change",saveDefaultSelections)
  if (defaultCardSel) defaultCardSel.addEventListener("change",saveDefaultSelections)
  const btnExport = el("btnExport")
  const btnImport = el("btnImport")
  const btnResetUI = el("btnResetUI")
  if (btnExport) btnExport.addEventListener("click",exportConfig)
  if (btnImport) btnImport.addEventListener("click",importConfig)
  if (btnResetUI) btnResetUI.addEventListener("click",resetUI)
  const btnCloseOverlay = el("btnCloseEventOverlay")
  if (btnCloseOverlay) btnCloseOverlay.addEventListener("click",closeEventOverlay)
  const btnEditSingle = el("btnEditSingle")
  const btnEditThisFuture = el("btnEditThisAndFuture")
  const btnDeleteSingle = el("btnDeleteSingle")
  const btnDeleteThisFuture = el("btnDeleteThisAndFuture")
  const btnDeleteSeries = el("btnDeleteSeries")
  if (btnEditSingle) btnEditSingle.addEventListener("click",()=>{
    const overlay = el("eventOverlay")
    if (!overlay) return
    const id = overlay.dataset.eventId
    if (!id) return
    startEditEvent(id,"single")
  })
  if (btnEditThisFuture) btnEditThisFuture.addEventListener("click",()=>{
    const overlay = el("eventOverlay")
    if (!overlay) return
    const id = overlay.dataset.eventId
    if (!id) return
    startEditEvent(id,"thisAndFuture")
  })
  if (btnDeleteSingle) btnDeleteSingle.addEventListener("click",()=>{
    const overlay = el("eventOverlay")
    if (!overlay) return
    const id = overlay.dataset.eventId
    if (!id) return
    deleteSingleEvent(id)
  })
  if (btnDeleteThisFuture) btnDeleteThisFuture.addEventListener("click",()=>{
    const overlay = el("eventOverlay")
    if (!overlay) return
    const id = overlay.dataset.eventId
    if (!id) return
    const evt = state.events.find(e=>String(e.id) === String(id))
    if (!evt) return
    deleteThisAndFuture(evt)
  })
  if (btnDeleteSeries) btnDeleteSeries.addEventListener("click",()=>{
    const overlay = el("eventOverlay")
    if (!overlay) return
    const id = overlay.dataset.eventId
    if (!id) return
    const evt = state.events.find(e=>String(e.id) === String(id))
    if (!evt) return
    deleteSeriesAll(evt)
  })
  const btnNewRepayment = el("btnNewRepayment")
  if (btnNewRepayment) btnNewRepayment.addEventListener("click",()=>{
    setActiveTabUI("nuovo")
    setSelectedEventType("card_repayment")
  })
  const btnSuggestRepaymentTop = el("btnSuggestRepayment")
  if (btnSuggestRepaymentTop) btnSuggestRepaymentTop.addEventListener("click",suggestRepayment)
  const btnRefreshCards = el("btnRefreshCards")
  if (btnRefreshCards) btnRefreshCards.addEventListener("click",loadCardsDashboard)
  const dayModal = el("dayEventsModal")
  const dayModalClose = el("dayModalClose")
  if (dayModalClose) {
    dayModalClose.addEventListener("click", () => {
      closeDayEventsModal()
    })
  }
  if (dayModal) {
    dayModal.addEventListener("click", e => {
      // chiudi cliccando sul backdrop scuro
      if (e.target === dayModal) {
        closeDayEventsModal()
      }
    })
  }
  
}

async function init() {
  const today = new Date()
  setCurrentMonth(today)
  const todayISO = formatISODate(today)
  state.selectedDate = todayISO
  const ref = el("refDateLabel")
  const snap = el("snapshotTitle")
  if (ref) ref.textContent = formatDateHuman(todayISO)
  if (snap) snap.textContent = "📌 Stato al: " + todayISO
  renderCategories()
  initEventListeners()
  await checkHealth()
  await loadWallets()
  await loadEvents()
  await loadDashboard()
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded",init)
} else {
  init()
}
