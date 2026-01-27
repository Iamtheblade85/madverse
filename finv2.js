const apiBase = "https://iamemanuele.pythonanywhere.com";
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
function monthKeyFromISO(iso) {
  if (!iso || iso.length < 7) return null
  return iso.slice(0, 7) // "YYYY-MM"
}

function sumCardRepaymentsForCard(cardId, monthKey, asOfIso) {
  // somma rimborsi reali nel mese, separando:
  // - fatti fino a data (paymentDate<=asOf)
  // - ancora previsti (paymentDate>asOf)
  let soFar = 0
  let remaining = 0

  const asOf = parseISODate(asOfIso)
  const asOfTime = asOf ? asOf.getTime() : null

  ;(state.events || []).forEach(ev => {
    if (ev.type !== "card_repayment") return
    if (String(ev.toCardWalletId) !== String(cardId)) return

    const dIso = ev.paymentDate || ev.calendarDate || ev.date
    if (!dIso) return

    if (monthKeyFromISO(dIso) !== monthKey) return

    const amt = Number(ev.amount || 0)
    if (!Number.isFinite(amt) || amt === 0) return

    if (!asOfTime) {
      // fallback: se non ho asOf valido, considero tutto "soFar"
      soFar += amt
      return
    }

    const d = parseISODate(dIso)
    if (!d) return

    if (d.getTime() <= asOfTime) soFar += amt
    else remaining += amt
  })

  return { soFar, remaining }
}

let payoffState = { purchaseEventId: null, cardWalletId: null, purchaseTitle: null };
let walletsCache = [];
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

function normalizeScheduleForBackend(schedule) {
  if (!schedule || typeof schedule !== "object") return schedule

  // Se è già nel formato backend, lascialo così
  if (typeof schedule.kind === "string" && (schedule.kind === "instant" || schedule.kind === "financing")) {
    return schedule
  }

  const method = (schedule.method || "").trim()

  // monthly_installments -> financing
  if (method === "monthly_installments") {
    const mi = schedule.monthlyInstallments || {}
    const cnt = parseInt(mi.count || 0, 10)
    const firstDue = (mi.firstDueDate || "").trim()
    const fsm = firstDue && firstDue.length >= 7 ? firstDue.slice(0, 7) : null

    const out = { ...schedule }
    out.kind = "financing"
    if (Number.isFinite(cnt) && cnt > 0) out.count = cnt
    if (fsm) out.firstStatementMonth = fsm

    return out
  }

  // Tutto il resto lo consideriamo "instant" (non genera rate nello statement)
  return { ...schedule, kind: "instant" }
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

  // Ricostruisce la mappa eventi in base alla nuova data di riferimento
  // (serve per capire quali quote carta sono già coperte dai rimborsi)
  buildEventsByDate()
  renderCalendar()

  const ref = el("refDateLabel")
  if (ref) ref.textContent = formatDateHuman(iso)

  const snap = el("snapshotTitle")
  if (snap) snap.textContent = "📌 Stato al: " + iso

  // Evidenzia il giorno selezionato nella griglia (dopo il re-render)
  const grid = el("calendarGrid")
  if (grid) {
    grid.querySelectorAll(".day").forEach(day => {
      const d = day.getAttribute("data-date")
      day.setAttribute("aria-selected", d === iso ? "true" : "false")
    })
  }

  // Aggiorna la dashboard / sidebar con gli importi calcolati alla nuova data
  loadDashboard()
}

function setActiveTabUI(tab){
  document.body.dataset.activeTab = tab
  document.querySelectorAll('[data-tab]').forEach(b=>{
    b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false')
  })
}

function buildEventsByDate() {
  // Mappa data ISO -> eventi mostrati in calendario
  state.eventsByDate = new Map()

  if (!Array.isArray(state.events) || !state.events.length) return

  const asOfIso = state.selectedDate || formatISODate(new Date())
  const asOfDate = parseISODate(asOfIso)

  // Se per qualche motivo la data non è valida, fallback “stupido” come prima
  if (!asOfDate) {
    state.events.forEach(ev => {
      const d = ev.calendarDate || ev.date
      if (!d) return
      if (!state.eventsByDate.has(d)) state.eventsByDate.set(d, [])
      state.eventsByDate.get(d).push(ev)
    })
    return
  }

  const asOfYear  = asOfDate.getFullYear()
  const asOfMonth = asOfDate.getMonth()
  const asOfTime  = asOfDate.getTime()

  // Aggregato per carta nel mese corrente
  // cardId -> { dueMonth: totale quote dovute nel mese, repUpTo: rimborsi nel mese fino alla data di riferimento }
  const cardAgg = new Map()
  const ensureAgg = (cardId) => {
    if (!cardAgg.has(cardId)) cardAgg.set(cardId, { dueMonth: 0, repUpTo: 0 })
    return cardAgg.get(cardId)
  }

  // 1) Calcola, per ogni carta, il totale quote del mese e rimborsi fino alla data di riferimento
  state.events.forEach(ev => {
    const dStr = ev.calendarDate || ev.date
    if (!dStr) return
    const d = parseISODate(dStr)
    if (!d) return

    // Ci interessa solo il mese della data di riferimento
    if (d.getFullYear() !== asOfYear || d.getMonth() !== asOfMonth) return

    if (ev.type === "card_due") {
      // Quote dovute del mese (tutte le date del mese)
      const cardId = ev.cardWalletId || ev.walletId || null
      if (!cardId) return
      const agg = ensureAgg(cardId)
      agg.dueMonth += ev.amount || 0
    } else if (ev.type === "card_repayment") {
      // Rimborsi del mese, solo fino alla data di riferimento
      const cardId = ev.toCardWalletId || ev.cardWalletId || null
      if (!cardId) return
      if (d.getTime() > asOfTime) return
      const agg = ensureAgg(cardId)
      agg.repUpTo += ev.amount || 0
    }
  })

  // 2) Determina quali carte hanno il mese completamente coperto
  const fullyPaidCards = new Set()
  cardAgg.forEach((v, cardId) => {
    if (v.dueMonth > 0 && v.repUpTo >= v.dueMonth - 0.01) {
      // mese coperto per questa carta → quote “dovute” possono sparire dal calendario
      fullyPaidCards.add(cardId)
    }
  })

  // 3) Popola eventsByDate, saltando le card_due delle carte completamente coperte
  state.events.forEach(ev => {
    const dStr = ev.calendarDate || ev.date
    if (!dStr) return

    if (ev.type === "card_due") {
      const d = parseISODate(dStr)
      if (d && d.getFullYear() === asOfYear && d.getMonth() === asOfMonth) {
        const cardId = ev.cardWalletId || ev.walletId || null
        if (cardId && fullyPaidCards.has(cardId)) {
          // Questa quota è relativa a una carta che, nel mese, è già completamente coperta dai rimborsi:
          // non la mostriamo nel calendario per non sporcare la vista.
          return
        }
      }
    }

    if (!state.eventsByDate.has(dStr)) state.eventsByDate.set(dStr, [])
    state.eventsByDate.get(dStr).push(ev)
  })
}

function mapEventTypeToClass(t) {
  if (t === "income") return "event-line--entrata"
  if (t === "expense") return "event-line--uscita"
  if (t === "card_purchase") return "event-line--acquisto"
  if (t === "card_due") return "event-line--quota"
  if (t === "card_repayment") return "event-line--rimborso"
  if (t === "card_credit") return "event-line--entrata"
  return ""
}

function mapEventTypeToLabel(t) {
  if (t === "income") return "Entrata"
  if (t === "expense") return "Uscita"
  if (t === "card_purchase") return "Acquisto su carta"
  if (t === "card_due") return "Quota dovuta"
  if (t === "card_repayment") return "Rimborso carta"
  if (t === "card_credit") return "Entrata su carta"
  return t || ""
}

function mapEventTypeToDotClass(t) {
  if (t === "income") return "dot dot--ok"
  if (t === "expense") return "dot dot--bad"
  if (t === "card_purchase") return "dot dot--card"
  if (t === "card_due") return "dot dot--due"
  if (t === "card_repayment") return "dot dot--repay"
  if (t === "card_credit") return "dot dot--ok"
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
      case "card_credit":
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
        // Pulsante selezione estinzione anticipata (solo per card_purchase)
        if (ev.type === "card_purchase" && ev.schedule && ev.schedule.kind === "financing") {
          const act = document.createElement("div")
          act.style.cssText = "margin-top:6px; display:flex; gap:8px; flex-wrap:wrap;"
        
          const bSel = document.createElement("button")
          bSel.type = "button"
          bSel.className = "btn"
          bSel.textContent = "Seleziona per estinzione"
          bSel.addEventListener("click", (e2) => {
            e2.stopPropagation()
        
            payoffState.purchaseEventId = Number(ev.id)
            payoffState.purchaseTitle = ev.title || `Purchase #${ev.id}`
            payoffState.cardWalletId = Number(ev.cardWalletId || ev.walletId || 0)
        
            // aggiorna label dentro tutte le card
            document.querySelectorAll('[data-kpi="payoffSelectedPurchase"]').forEach(x => {
              x.textContent = `${payoffState.purchaseTitle} (id:${payoffState.purchaseEventId})`
            })
        
            // prefill labels nel modal
            const pid = document.getElementById("payoffPurchaseIdLabel")
            const cid = document.getElementById("payoffCardWalletIdLabel")
            if (pid) pid.textContent = String(payoffState.purchaseEventId)
            if (cid) cid.textContent = payoffState.cardWalletId ? String(payoffState.cardWalletId) : "—"
        
            // prefill date odierna se vuote
            const today = new Date().toISOString().slice(0,10)
            const pd = document.getElementById("payoffPaymentDate")
            const cd = document.getElementById("payoffCalendarDate")
            if (pd && !pd.value) pd.value = today
            if (cd && !cd.value) cd.value = today
        
            showToast("Finanziamento selezionato", "Ora apri “Apri estinzione” nella carta.")
          })
        
          act.appendChild(bSel)
          row.appendChild(act)
        }

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
        const cls = mapEventTypeToClass(ev.type)
        if (cls) clone.classList.add(cls)
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
  const {start, end} = getMonthRange()
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
    data = await apiFetch("/events?" + params.toString(), { method: "GET" })
  } catch (e) {
    data = []
  }
  state.events = Array.isArray(data) ? data : []
  state.events.forEach(ev => {
    if (ev.type === "card_purchase" && ev.schedule) {
      ev.schedule = normalizeScheduleForBackend(ev.schedule)
    }
  })

  // Se non c'è ancora una data selezionata, scegli:
  // - oggi se è nel mese mostrato
  // - altrimenti il primo giorno del mese
  if (!state.selectedDate) {
    const todayISO = formatISODate(new Date())
    const { start: ms, end: me } = getMonthRange()
    const t = parseISODate(todayISO)
    if (t && t >= ms && t <= me) state.selectedDate = todayISO
    else state.selectedDate = formatISODate(ms)
  }

  // Questo chiamerà buildEventsByDate(), renderCalendar() e loadDashboard()
  setSelectedDate(state.selectedDate)
}

function renderSnapshot() {
  const container = el("snapshotWalletCards")
  if (!container) return
  container.innerHTML = ""

  const tpl = el("tplWalletCard")
  if (!state.dashboard || !Array.isArray(state.dashboard.wallets)) return

  state.dashboard.wallets.forEach(w => {
    const clone = tpl.content.firstElementChild.cloneNode(true)

    // Nome e tipo wallet
    const nameEl = clone.querySelector(".wallet-name")
    const typeEl = clone.querySelector(".wallet-type")
    if (nameEl) nameEl.textContent = w.name || ""
    if (typeEl) typeEl.textContent = w.typeLabel || ("Tipo: " + (w.type || ""))

    // Helper per scrivere i KPI
    const setKpi = (key, value) => {
      const elv = clone.querySelector(`[data-kpi="${key}"]`)
      if (!elv) return
      if (value == null) {
        elv.textContent = "—"
      } else if (typeof value === "number") {
        elv.textContent = formatEuro(value)
      } else {
        elv.textContent = String(value)
      }
    }

    setKpi("balance", w.balance)
    setKpi("spentSoFar", w.spentSoFar)
    setKpi("spentRemaining", w.spentRemaining)
    
    if (w.card) {
      const asOfIso = state.selectedDate || formatISODate(new Date())
      const monthKey = (asOfIso && asOfIso.length >= 7) ? asOfIso.slice(0, 7) : null
    
      const rep = monthKey ? sumCardRepaymentsForCard(w.id, monthKey, asOfIso) : { soFar: 0, remaining: 0 }
    
      // ✅ Entrate carta = rimborsi
      setKpi("incomeSoFar", rep.soFar)
    
      // ✅ Entrate previste = rimborsi futuri reali + (opzionale) rimborso virtuale se manca evento
      let incRem = rep.remaining
    
      const sr = w.card.scheduledRepayment || null
      if (sr && !sr.exists && sr.paymentDate && monthKeyFromISO(sr.paymentDate) === monthKey) {
        // Se l'evento rimborso NON esiste ancora, ma è "previsto" virtualmente,
        // lo mostro come "entrate ancora previste" usando suggestedAmount
        const v = Number(sr.suggestedAmount || 0)
        if (Number.isFinite(v) && v > 0) incRem += v
      }
    
      setKpi("incomeRemaining", incRem)
    } else {
      setKpi("incomeSoFar", w.incomeSoFar)
      setKpi("incomeRemaining", w.incomeRemaining)
    }


    if (w.compareLastMonthExpenses) {
      const c = w.compareLastMonthExpenses
      const pct = c.percent || 0
      const pctStr = `${pct > 0 ? "+" : ""}${pct.toFixed(2).replace(".", ",")}`
      const amt = c.amount || 0
      const amtStr = `${amt >= 0 ? "+" : ""}${formatEuro(amt)}`
      const txt = `${pctStr}% (${amtStr})`
      setKpi("compareLastMonthExpenses", txt)
    }

    if (w.compareLastMonthIncome) {
      const c = w.compareLastMonthIncome
      const pct = c.percent || 0
      const pctStr = `${pct > 0 ? "+" : ""}${pct.toFixed(2).replace(".", ",")}`
      const amt = c.amount || 0
      const amtStr = `${amt >= 0 ? "+" : ""}${formatEuro(amt)}`
      const txt = `${pctStr}% (${amtStr})`
      setKpi("compareLastMonthIncome", txt)
    }

    // Prossimo evento
    const nextEl = clone.querySelector('[data-kpi="nextEvent"]')
    if (nextEl) {
      if (w.nextEvent && w.nextEvent.date) {
        const txt = `${w.nextEvent.date} · ${w.nextEvent.title || ""} (${formatEuro(w.nextEvent.amount || 0)})`
        nextEl.textContent = txt
      } else {
        nextEl.textContent = "—"
      }
    }

    // Categorie principali
    const catSlot = clone.querySelector('[data-slot="categories"]')
    if (catSlot) {
      const cats = Array.isArray(w.categories) ? w.categories.slice(0, 10) : []
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
        cats.forEach(c => {
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

    // Se è una carta: sezione extra con debito netto dovuto nel mese
    const cardExtras = clone.querySelector('[data-slot="cardExtras"]');
    let netDue = null;

    if (w.card && cardExtras) {
      cardExtras.classList.remove("hide")

      const limitVal       = typeof w.card.limit === "number" ? w.card.limit : null
      const availVal       = typeof w.card.availableCredit === "number" ? w.card.availableCredit : null
      const outstandingVal = typeof w.card.outstanding === "number" ? w.card.outstanding : null
      // Backend nuovo: non inventiamo "netto".
      // dueByEom UI = statement.baselineAmount (baseline statement del mese)
      const stmtB = (w.card.statement && typeof w.card.statement.baselineAmount === "number")
        ? w.card.statement.baselineAmount
        : null
      setKpi("dueByEom", stmtB)
      // repaymentsThisMonth non arriva da /dashboard (nuovo backend) → mostra —
      setKpi("repaymentsThisMonth", null)
      // netDue lo usavamo solo per frasi di riepilogo: lo disattiviamo
      netDue = null
      setKpi("cardLimit", limitVal)
      setKpi("availableCredit", availVal)
      setKpi("outstanding", outstandingVal)
      const df = clone.querySelector('[data-kpi="defaultSourceWallet"]')
      if (df) df.textContent = w.card.defaultSourceWalletName || "—"

      // -------------------------
      // NEW: statement (backend-aligned)
      // -------------------------
      const stmt = w.card.statement || {}
      
      const setTxt = (k, v) => {
        const elx = clone.querySelector(`[data-kpi="${k}"]`)
        if (!elx) return
        elx.textContent = (v === null || v === undefined || v === "") ? "—" : String(v)
      }
      
      // window start/end
      setTxt("statementWindowStart", stmt.window?.start || "—")
      setTxt("statementWindowEnd", stmt.window?.end || "—")
      
      // baseline + counts + sums
      setKpi("statementBaselineAmount", (typeof stmt.baselineAmount === "number") ? stmt.baselineAmount : null)
      setTxt("statementInstantCount", (stmt.instantPurchasesCount ?? "—"))
      
      setKpi("statementCharges", (typeof stmt.charges === "number") ? stmt.charges : null)
      setKpi("statementCredits", (typeof stmt.credits === "number") ? stmt.credits : null)
      
      // installments list slot
      const instSlot = clone.querySelector('[data-slot="statementInstallments"]')
      if (instSlot) {
        instSlot.innerHTML = ""
        const inst = Array.isArray(stmt.installments) ? stmt.installments : []
        if (!inst.length) {
          const h = document.createElement("div")
          h.className = "hint"
          h.textContent = "Nessuna rata nel mese selezionato."
          instSlot.appendChild(h)
        } else {
          inst.forEach(line => {
            const row = document.createElement("div")
            row.style.cssText = "display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 8px; border:1px solid rgba(148,163,184,.22); border-radius:10px; background:rgba(2,6,23,.35);"
            const left = document.createElement("div")
            left.style.cssText = "display:flex; flex-direction:column; gap:2px;"
            const t = document.createElement("div")
            t.style.fontWeight = "600"
            t.style.fontSize = "12px"
            t.textContent = (line.title || "Rata")
            const meta = document.createElement("div")
            meta.style.cssText = "font-size:12px; opacity:.75;"
            meta.textContent = (line.category ? String(line.category) : "")
            left.appendChild(t)
            left.appendChild(meta)
      
            const right = document.createElement("div")
            right.style.fontWeight = "700"
            right.textContent = formatEuro(line.amount)
      
            row.appendChild(left)
            row.appendChild(right)
            instSlot.appendChild(row)
          })
        }
      }

      // -------------------------
      // NEW: scheduled repayment box
      // -------------------------
      const sr = w.card.scheduledRepayment || null

      setTxt("schedPaymentDate", sr ? (sr.paymentDate || "—") : "—")
      setKpi("schedBaseline", sr && typeof sr.baselineAmount === "number" ? sr.baselineAmount : null)
      setKpi("schedSuggested", sr && typeof sr.suggestedAmount === "number" ? sr.suggestedAmount : null)
      setTxt("schedExists", sr ? (sr.exists ? "Esiste" : "Manca") : "—")

      // prefill input suggested
      const inpAmt = clone.querySelector('[data-input="schedUserAmount"]')
      if (inpAmt && sr && typeof sr.suggestedAmount === "number") {
        if (!inpAmt.value) inpAmt.value = String(sr.suggestedAmount.toFixed(2))
      }

      // -------------------------
      // NEW: settings (prefill)
      // -------------------------
      const cs = w.card.settings || {}
      const setInput = (sel, val) => {
        const el = clone.querySelector(sel)
        if (!el) return
        if (val === null || val === undefined) return
        el.value = String(val)
      }

      setInput('[data-input="csTeilzahlung"]', (typeof cs.teilzahlungAmount === "number") ? cs.teilzahlungAmount : "")
      setInput('[data-input="csSollzins"]', (typeof cs.sollzinsAnnual === "number") ? cs.sollzinsAnnual : "")
      setInput('[data-input="csEffektivzins"]', (typeof cs.effektivzinsAnnual === "number") ? cs.effektivzinsAnnual : "")
      setInput('[data-input="csKreditlimit"]', (typeof w.card.limit === "number") ? w.card.limit : "")
      setInput('[data-input="csEffectiveFrom"]', cs.effectiveFrom || "")

      // cycle days / debit day non sono nel card.settings: li leggiamo dalla GET settings endpoint quando serve.
      // però etichetta rapida:
      setTxt("csTeilzahlungLabel", (typeof cs.teilzahlungAmount === "number") ? cs.teilzahlungAmount.toFixed(2) : "—")
      setTxt("csEffectiveFromLabel", cs.effectiveFrom || "—")

      // payoff selected label init
      const payoffSel = clone.querySelector('[data-kpi="payoffSelectedPurchase"]')
      if (payoffSel && !payoffSel.textContent.trim()) payoffSel.textContent = "—"

      // attach wallet id to actions
      const tagWalletActions = () => {
        clone.querySelectorAll("[data-action]").forEach(btn => {
          btn.dataset.walletId = String(w.id)
        })
      }
      tagWalletActions()
    }


    // Riassunto breve in alto (walletShortSummary)
    const shortEl = clone.querySelector('[data-kpi="walletShortSummary"]')
    if (shortEl) {
      let txt = "N.A."
      if (w.card) {
        const credits = (typeof w.card.statement?.credits === "number")
          ? w.card.statement.credits
          : 0
      
        const sr = w.card.scheduledRepayment || null
        if (!sr) {
          txt = `Rimborsi mese: ${formatEuro(credits)}.`
        } else if (sr.exists) {
          txt = `Rimborsi mese: ${formatEuro(credits)} · Rimborso programmato già presente su ${sr.paymentDate || "—"}.`
        } else {
          txt = `Rimborsi mese: ${formatEuro(credits)} · Rimborso programmato mancante: suggerito ${formatEuro(sr.suggestedAmount || 0)} al ${sr.paymentDate || "—"}.`
        }
      } else {
        const bal    = typeof w.balance === "number" ? w.balance : null
        const spent  = typeof w.spentSoFar === "number" ? w.spentSoFar : null
        const income = typeof w.incomeSoFar === "number" ? w.incomeSoFar : null
        if (bal != null && spent != null && income != null) {
          const net = income - spent
          const dir = net >= 0 ? "avanza" : "manca"
          txt = `Saldo: ${formatEuro(bal)} · Nel mese ${dir} ${formatEuro(Math.abs(net))}.`
        } else if (bal != null) {
          txt = `Saldo al giorno selezionato: ${formatEuro(bal)}.`
        } else {
          txt = "N.A."
        }
      }
      shortEl.textContent = txt
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
    data = await apiFetch("/dashboard?" + params.toString(), { method: "GET" })
  } catch (e) {
    data = null
  }

  // Fonte unica di verità per snapshot UI
  state.dashboard = data

  // Fonte unica di verità per le azioni carta (save settings / scheduled repayment / override)
  // NON usare una variabile globale separata: usa sempre state.dashboard
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
  walletsCache = state.wallets
  fillPayoffFromWalletSelect()

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
  const typeRaw = prompt("Tipo (es. banca, card, contanti):", w.type || "")
  const type = (typeRaw || "").trim().toLowerCase() === "carta" ? "card" : (typeRaw || "").trim().toLowerCase()

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
    base.walletId = Number(wId)

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
    base.cardWalletId = Number(cardId)

    base.purchaseDate = purchaseDate
    const schedule = {method}
    let schedule = { method }
    if (method === "one_shot") {
      const dd = el("fDueDateOneShot") ? el("fDueDateOneShot").value : ""
      if (!dd || !parseISODate(dd)) {
        showToast("Data non valida","Data quota dovuta non valida")
        return null
      }
      schedule.kind = "instant"

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
      schedule.kind = "financing"
      schedule.count = instN
      schedule.firstStatementMonth = firstDue.slice(0, 7) // "YYYY-MM"      
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
      schedule.kind = "financing"
      schedule.count = instN
      schedule.firstStatementMonth = firstDue.slice(0, 7) // "YYYY-MM"      
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
    schedule = normalizeScheduleForBackend(schedule)
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
    base.fromWalletId = Number(fromWalletId)
    base.toCardWalletId = Number(toCardWalletId)

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
    const m  = el("fMethod")
  
    if (cw) cw.value = evt.cardWalletId || ""
    if (pd) pd.value = evt.purchaseDate || ""
  
    const sch = evt.schedule || null
  
    // Determina method da schedule:
    let method = sch && sch.method ? sch.method : ""
  
    // Se manca method ma è financing, assumiamo monthly_installments
    if (!method && sch && sch.kind === "financing") method = "monthly_installments"
  
    if (m) m.value = method || ""
    updateMethodSections()
  
    // Prefill campi specifici
    if (method === "monthly_installments") {
      const instNEl = el("fInstN")
      const firstDueEl = el("fFirstDueMonthly")
      const instAmountEl = el("fInstAmount")
  
      const mi = (sch && sch.monthlyInstallments) ? sch.monthlyInstallments : {}
  
      // count: preferisci sch.count, fallback mi.count
      const cnt = Number.isFinite(Number(sch?.count)) ? Number(sch.count) : Number(mi.count)
      if (instNEl && Number.isFinite(cnt) && cnt > 0) instNEl.value = String(cnt)
  
      // firstDueDate: se c'è mi.firstDueDate, usa quello; altrimenti ricostruisci un fallback dal firstStatementMonth
      let fd = (mi.firstDueDate || "").trim()
      if (!fd && sch?.firstStatementMonth) {
        // fallback: mettiamo il 01 del mese (l’utente potrà correggere)
        fd = String(sch.firstStatementMonth) + "-01"
      }
      if (firstDueEl && fd) firstDueEl.value = fd
  
      // installmentAmount: se c’è lo mostriamo
      const ia = Number(mi.installmentAmount)
      if (instAmountEl && Number.isFinite(ia) && ia > 0) instAmountEl.value = String(ia)
    }
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
  showToast("Info", "Cards dashboard legacy disattivata: usa lo Snapshot.")
}

function suggestRepayment() {
  showToast("Info", "Suggerimento legacy disattivato: usa scheduledRepayment nello Snapshot.")
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
  if (btnSuggestRepaymentTop) btnSuggestRepaymentTop.addEventListener("click", () => {
    showToast("Info", "Suggerimento legacy disattivato: guarda Scheduled Repayment nello Snapshot.")
  })

  const btnRefreshCards = el("btnRefreshCards")
  if (btnRefreshCards) btnRefreshCards.addEventListener("click", () => {
    showToast("Info", "Cards dashboard legacy disattivata: usa lo Snapshot.")
  })

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
// ------------------------------
// NEW: Card actions (delegation)
// ------------------------------
function fillPayoffFromWalletSelect() {
  const sel = document.getElementById("payoffFromWalletId")
  if (!sel) return
  sel.innerHTML = ""

  const opts = (walletsCache || []).filter(w => w.type !== "card")
  if (!opts.length) {
    const o = document.createElement("option")
    o.value = ""
    o.textContent = "—"
    sel.appendChild(o)
    return
  }

  for (const w of opts) {
    const o = document.createElement("option")
    o.value = w.id
    o.textContent = `${w.name} (id:${w.id})`
    sel.appendChild(o)
  }
}

function findWalletInDashboard(walletId) {
  const d = state.dashboard
  if (!d || !Array.isArray(d.wallets)) return null
  return d.wallets.find(w => String(w.id) === String(walletId)) || null
}
function moneyOrNull(v) {
  if (v == null) return null
  const s = String(v).trim().replace(/\s+/g,"").replace(",", ".")
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function numberOrNull(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function intOrNull(v) {
  const n = Number(v)
  return Number.isInteger(n) ? n : null
}

function openPayoffModal() {
  const m = document.getElementById("payoffModal")
  if (!m) return
  m.classList.remove("hide")
}
function closePayoffModal() {
  const m = document.getElementById("payoffModal")
  if (!m) return
  m.classList.add("hide")
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]")
  if (!btn) return

  const action = btn.dataset.action
  const walletId = btn.dataset.walletId

  // helper: refresh dashboard after ops
  const refresh = async () => {
    // usa le tue funzioni esistenti di reload (qui assumo loadDashboard/refreshSnapshot; se non esiste, dimmelo e lo adatto)
    if (typeof loadDashboard === "function") await loadDashboard()
    if (typeof loadEvents === "function") await loadEvents()
  }

  if (action === "cardSaveSettings") {
    const w = findWalletInDashboard(walletId)
    if (!w) return
    const root = btn.closest('[data-slot="cardExtras"]') || btn.closest(".walletCard") || document
    const payload = {
      teilzahlungAmount: numberOrNull(root.querySelector('[data-input="csTeilzahlung"]')?.value),
      sollzinsAnnual: numberOrNull(root.querySelector('[data-input="csSollzins"]')?.value),
      effektivzinsAnnual: numberOrNull(root.querySelector('[data-input="csEffektivzins"]')?.value),
      // backend-aligned: è "limit" (UI legge w.card.limit)
      limit: numberOrNull(root.querySelector('[data-input="csKreditlimit"]')?.value),
      effectiveFrom: root.querySelector('[data-input="csEffectiveFrom"]')?.value || null,
      // days: interi
      cycleStartDay: intOrNull(root.querySelector('[data-input="csCycleStartDay"]')?.value),
      cycleEndDay: intOrNull(root.querySelector('[data-input="csCycleEndDay"]')?.value),
      debitDay: intOrNull(root.querySelector('[data-input="csDebitDay"]')?.value),
    }
    // pulizia: rimuovi chiavi null/undefined non inviate
    Object.keys(payload).forEach(k => {
      if (payload[k] === null || payload[k] === "" || payload[k] === undefined) delete payload[k]
    })
    await apiFetch(`/cards/${w.id}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    await refresh()
    return
  }
  if (action === "cardCreateScheduledRepayment") {
    const w = findWalletInDashboard(walletId)
    if (!w || !w.card) return
    const sr = w.card.scheduledRepayment
    if (!sr) {
      alert("scheduledRepayment non disponibile (backend).")
      return
    }
    if (sr.exists) {
      alert("Esiste già un rimborso su quella data. Usa Override.")
      return
    }

    const root = btn.closest('[data-slot="cardExtras"]') || btn.closest(".walletCard") || document
    const userAmount = moneyOrNull(root.querySelector('[data-input="schedUserAmount"]')?.value)
    if (!userAmount || userAmount <= 0) {
      alert("Inserisci un importo valido.")
      return
    }

    // fromWalletId: usa defaultSourceWalletId del wallet (non in w.card), quindi leggiamo da wallets list se presente
    const fromWalletId =
      (state.wallets.find(x => String(x.id) === String(w.id)) || {}).defaultSourceWalletId || null


    if (!fromWalletId) {
      alert("Manca defaultSourceWalletId sul wallet. Impostalo dalla UI wallet.")
      return
    }

    const newEvent = {
      type: "card_repayment",
      title: "Rimborso carta (scheduled)",
      amount: userAmount,
      category: "Card Repayment",
      calendarDate: sr.paymentDate,
      paymentDate: sr.paymentDate,
      fromWalletId: fromWalletId,
      toCardWalletId: w.id,
      notes: "",
    }

    await apiFetch(`/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newEvent)
    })

    await refresh()
    return
  }

  if (action === "cardOverrideScheduledRepayment") {
    const w = findWalletInDashboard(walletId)
    if (!w || !w.card) return

    const sr = w.card.scheduledRepayment
    if (!sr) {
      alert("scheduledRepayment non disponibile (backend).")
      return
    }
    if (!sr.exists) {
      alert("Non esiste ancora un rimborso su quella data. Prima crealo.")
      return
    }

    // trova l'evento reale di rimborso su debit date: lo cerchiamo dai dati già caricati nel frontend (dayEvents/list).
    // Se non hai cache eventi globale, facciamo una query events di quel giorno e wallet.
    const day = sr.paymentDate
    const events = await apiFetch(`/events?from=${day}&to=${day}`)
    const repay = (events || []).find(ev => ev.type === "card_repayment" && String(ev.toCardWalletId) === String(w.id) && (ev.paymentDate === day || ev.calendarDate === day))
    if (!repay) {
      alert("Non riesco a trovare l'evento rimborso. Apri il giorno e verifica.")
      return
    }

    const root = btn.closest('[data-slot="cardExtras"]') || btn.closest(".walletCard") || document
    const userAmount = moneyOrNull(root.querySelector('[data-input="schedUserAmount"]')?.value)
    if (!userAmount || userAmount <= 0) {
      alert("Inserisci un importo valido.")
      return
    }
    const deltaMode = root.querySelector('[data-input="schedDeltaMode"]')?.value || "fee"
    const baseline = (typeof sr.baselineAmount === "number")
      ? sr.baselineAmount
      : (w.card.statement && typeof w.card.statement.baselineAmount === "number")
        ? w.card.statement.baselineAmount
        : userAmount
    const payload = {
      userAmount: userAmount,
      baselineAmount: baseline,
      allocations: []
    }
    const delta = userAmount - baseline
    if (Math.abs(delta) >= 1e-9) {
      payload.deltaMode = deltaMode
    }
    await apiFetch(`/events/${repay.id}/repayment_override`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    await refresh()
    return
  }
  if (action === "openPayoffModal") {
    // apre modal se è stato selezionato un purchase financing
    if (!payoffState.purchaseEventId) {
      alert("Seleziona prima una card_purchase (finanziamento) dal calendario/lista eventi.")
      return
    }
    openPayoffModal()
    return
  }
})
// Payoff modal controls
document.addEventListener("DOMContentLoaded", () => {
  const closeBtn = document.getElementById("payoffCloseBtn")
  const submitBtn = document.getElementById("payoffSubmitBtn")
  if (closeBtn) closeBtn.addEventListener("click", closePayoffModal)

  if (submitBtn) submitBtn.addEventListener("click", async () => {
    const resEl = document.getElementById("payoffResult")
    const purchaseId = payoffState.purchaseEventId
    if (!purchaseId) return

    const fromWalletId = document.getElementById("payoffFromWalletId")?.value
    const paymentDate = document.getElementById("payoffPaymentDate")?.value
    const calendarDate = document.getElementById("payoffCalendarDate")?.value
    const payoffPrincipal = document.getElementById("payoffPrincipal")?.value
    const payoffInterest = document.getElementById("payoffInterest")?.value
    const notes = document.getElementById("payoffNotes")?.value || ""

    if (!fromWalletId || !paymentDate || !calendarDate || !payoffPrincipal) {
      alert("Compila: fromWalletId, paymentDate, calendarDate, payoffPrincipal.")
      return
    }

    const payload = {
      fromWalletId: Number(fromWalletId),
      paymentDate,
      calendarDate,
      payoffPrincipal: Number(payoffPrincipal),
      payoffInterest: payoffInterest ? Number(payoffInterest) : 0,
      notes
    }

    const out = await apiFetch(`/financings/${purchaseId}/payoff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })

    if (resEl) {
      resEl.textContent = out?.warning ? `OK. Warning: ${out.warning}` : "OK. Estinzione registrata."
    }

    // refresh dashboard
    if (typeof loadDashboard === "function") await loadDashboard()
  })
})
