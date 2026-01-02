/* Calendar Finance Dashboard
 * - Coerente col backend (events/settings + endpoints series)
 * - Ricorrenze: soluzione C (materializzazione serie)
 * - Stats: Saldo attuale = fino a oggi (NO futuri) + Saldo alla data (date picker)
 */

(() => {
  "use strict";

  // -----------------------------
  // Utilities
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = (n) => String(n).padStart(2, "0");

  const toISODate = (d) => {
    const dt = (d instanceof Date) ? d : new Date(d);
    return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  };
  const fromISODate = (iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };

  const addMonths = (d, n) => {
    const x = new Date(d);
    const day = x.getDate();
    x.setMonth(x.getMonth() + n);
    while (x.getDate() !== day && x.getDate() > 1) x.setDate(x.getDate() - 1);
    return x;
  };

  const addYears = (d, n) => {
    const x = new Date(d);
    x.setFullYear(x.getFullYear() + n);
    return x;
  };

  const formatMoney = (val, currency = "EUR") => {
    const n = Number(val || 0);
    return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(n);
  };

  const formatDateHuman = (d) => {
    return new Intl.DateTimeFormat("it-IT", { weekday: "short", year: "numeric", month: "long", day: "2-digit" })
      .format(d);
  };

  const formatMonthHuman = (d) => {
    return new Intl.DateTimeFormat("it-IT", { year: "numeric", month: "long" }).format(d);
  };

  const formatRangeLabel = (start, end, view) => {
    if (view === "day") return formatDateHuman(start);
    if (view === "week") return `${formatDateHuman(start)} – ${formatDateHuman(end)}`;
    if (view === "month") return formatMonthHuman(start);
    if (view === "year") return String(start.getFullYear());
    return `${formatDateHuman(start)} – ${formatDateHuman(end)}`;
  };

  // Monday as week start
  const startOfWeek = (d) => {
    const x = startOfDay(d);
    const day = (x.getDay() + 6) % 7;
    return addDays(x, -day);
  };
  const endOfWeek = (d) => endOfDay(addDays(startOfWeek(d), 6));

  const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
  const endOfMonth = (d) => endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

  const startOfYear = (d) => new Date(d.getFullYear(), 0, 1);
  const endOfYear = (d) => endOfDay(new Date(d.getFullYear(), 11, 31));

  const clampDateToRange = (d, min, max) => {
    const t = d.getTime();
    return new Date(Math.min(Math.max(t, min.getTime()), max.getTime()));
  };

  const uid = () => crypto.randomUUID?.() || `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;

  // -----------------------------
  // API
  // -----------------------------
  const API_BASE = "https://iamemanuele.pythonanywhere.com/api";

  const API = {
    async request(path, { method = "GET", body, headers = {} } = {}) {
      const url = `${API_BASE}${path}`;

      const opts = {
        method,
        headers: {
          "Accept": "application/json",
          ...headers,
        },
        credentials: "omit",
      };

      if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }

      const res = await fetch(url, opts);

      let data = null;
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) data = await res.json().catch(() => null);
      else data = await res.text().catch(() => null);

      if (!res.ok) {
        const msg = (data && data.error) ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return data;
    },

    // --- Events ---
    listEvents(params = {}) {
      const qs = new URLSearchParams(params).toString();
      return this.request(`/events${qs ? `?${qs}` : ""}`);
    },
    createEvent(payload) {
      return this.request(`/events`, { method: "POST", body: payload });
    },
    updateEvent(id, payload) {
      return this.request(`/events/${encodeURIComponent(id)}`, { method: "PUT", body: payload });
    },
    deleteEvent(id) {
      return this.request(`/events/${encodeURIComponent(id)}`, { method: "DELETE" });
    },

    // --- Series ops (richiede backend aggiornato) ---
    deleteSeries(seriesId) {
      return this.request(`/series/${encodeURIComponent(seriesId)}`, { method: "DELETE" });
    },
    deleteSeriesFrom(seriesId, fromISO) {
      return this.request(`/series/${encodeURIComponent(seriesId)}/from/${encodeURIComponent(fromISO)}`, { method: "DELETE" });
    },

    // --- Settings ---
    getSettings() {
      return this.request(`/settings`);
    },
    saveSettings(payload) {
      return this.request(`/settings`, { method: "PUT", body: payload });
    }
  };

  // -----------------------------
  // State & Settings
  // -----------------------------
  const defaultSettings = {
    view: "month",
    density: "comfort",
    rangeMode: "all",       // all | from | between
    fromDate: "",
    toDate: "",
    search: "",
    category: "all",
    includeIncome: true,
    includeExpense: true,
    includeOther: true,
    sidebarOpen: true,
    initialBalance: 3412,
    currency: "EUR",

    // NUOVO: saldo alla data (default oggi)
    balanceAtDate: ""
  };

  const state = {
    settings: structuredClone(defaultSettings),
    events: [],
    anchorDate: startOfDay(new Date()),
    selectedEventId: null,
    draftEventId: null
  };

  let settingsTimer = null;
  function saveSettings() {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(async () => {
      try {
        await API.saveSettings(state.settings);
      } catch (e) {
        console.warn("Settings non salvati:", e.message);
      }
    }, 350);
  }

  // -----------------------------
  // Loaders
  // -----------------------------
  async function loadEventsFromBackend() {
    const data = await API.listEvents();
    const arr = Array.isArray(data) ? data : (data?.events || []);

    // Normalizza: mantieni compatibilità anche se alcuni campi non ci sono.
    return arr.map(e => ({
      ...e,
      time: e.time || "",
      notes: e.notes || "",
      pinned: !!e.pinned,
      recurrence: e.recurrence || "none",
      seriesId: e.seriesId ?? null,
      seriesMaster: !!e.seriesMaster
    }));
  }

  // -----------------------------
  // Filtering & Range
  // -----------------------------
  function getTrackingBounds(events) {
    const dates = events.map(e => e?.date).filter(Boolean).sort();
    if (!dates.length) {
      const t = startOfDay(new Date());
      return [t, t];
    }
    return [fromISODate(dates[0]), fromISODate(dates[dates.length - 1])];
  }

  function getEffectiveRangeForView() {
    const view = state.settings.view;
    const a = state.anchorDate;

    if (view === "day") return [startOfDay(a), endOfDay(a)];
    if (view === "week") return [startOfWeek(a), endOfWeek(a)];
    if (view === "month") return [startOfMonth(a), endOfMonth(a)];
    if (view === "year") return [startOfYear(a), endOfYear(a)];
    return [startOfMonth(a), endOfMonth(a)];
  }

  function getUserRangeConstraints() {
    const { rangeMode, fromDate, toDate } = state.settings;
    const [minTrack, maxTrack] = getTrackingBounds(state.events);

    if (rangeMode === "all") return [minTrack, maxTrack];

    if (rangeMode === "from") {
      const from = fromDate ? fromISODate(fromDate) : minTrack;
      return [startOfDay(from), maxTrack];
    }

    if (rangeMode === "between") {
      const from = fromDate ? fromISODate(fromDate) : minTrack;
      const to = toDate ? fromISODate(toDate) : maxTrack;
      const a = startOfDay(from);
      const b = endOfDay(to);
      return a <= b ? [a, b] : [b, a];
    }

    return [minTrack, maxTrack];
  }

  function passesTypeFilter(evt) {
    if (evt.type === "income" && !state.settings.includeIncome) return false;
    if (evt.type === "expense" && !state.settings.includeExpense) return false;
    if (evt.type === "other" && !state.settings.includeOther) return false;
    return true;
  }

  function passesCategoryFilter(evt) {
    const cat = (state.settings.category || "all").toLowerCase();
    if (cat === "all") return true;
    return (evt.category || "").toLowerCase() === cat;
  }

  function passesSearchFilter(evt) {
    const q = (state.settings.search || "").trim().toLowerCase();
    if (!q) return true;
    const hay = `${evt.title} ${evt.category} ${evt.notes}`.toLowerCase();
    return hay.includes(q);
  }

  function passesUserRange(evt) {
    const [uStart, uEnd] = getUserRangeConstraints();
    const d = fromISODate(evt.date);
    return d >= uStart && d <= uEnd;
  }

  function getFilteredEvents() {
    // NB: qui NON facciamo più espansioni “virtuali” per le serie materializzate.
    // Se hai eventi legacy ricorrenti senza seriesId, li vedrai solo nella loro data.
    // (Se vuoi support legacy, devi migrare o reintrodurre l'espansione SOLO per legacy.)
    return state.events
      .filter(e => e?.date)
      .filter(passesTypeFilter)
      .filter(passesCategoryFilter)
      .filter(passesSearchFilter)
      .filter(passesUserRange)
      .sort((a, b) => (a.date + (a.time || "")) < (b.date + (b.time || "")) ? -1 : 1);
  }

  // -----------------------------
  // Ricorrenze (Materializzazione serie)
  // -----------------------------
  const RECURRENCE_DEFAULTS = {
    monthlyMonths: 24, // 24 mesi
    yearlyYears: 5     // 5 anni
  };

  function daysInMonth(year, monthIndex0) {
    return new Date(year, monthIndex0 + 1, 0).getDate();
  }

  function addMonthsKeepingDay(baseDate, monthsToAdd, anchorDay) {
    const y0 = baseDate.getFullYear();
    const m0 = baseDate.getMonth();

    const targetMonth = m0 + monthsToAdd;
    const y = y0 + Math.floor(targetMonth / 12);
    const m = ((targetMonth % 12) + 12) % 12;

    const dim = daysInMonth(y, m);
    const day = Math.min(anchorDay, dim);

    return new Date(y, m, day);
  }

  function addYearsKeepingDay(baseDate, yearsToAdd, anchorMonthIndex0, anchorDay) {
    const y = baseDate.getFullYear() + yearsToAdd;
    const m = anchorMonthIndex0;

    const dim = daysInMonth(y, m);
    const day = Math.min(anchorDay, dim);

    return new Date(y, m, day);
  }

  function defaultRecurrenceUntilISO(startISO, mode) {
    const start = fromISODate(startISO);
    const anchorDay = start.getDate();
    const anchorMonth = start.getMonth();

    if (mode === "monthly") {
      const end = addMonthsKeepingDay(start, RECURRENCE_DEFAULTS.monthlyMonths, anchorDay);
      return toISODate(end);
    }
    if (mode === "yearly") {
      const end = addYearsKeepingDay(start, RECURRENCE_DEFAULTS.yearlyYears, anchorMonth, anchorDay);
      return toISODate(end);
    }
    return startISO;
  }

  function buildOccurrenceDates(master, untilISO) {
    const out = [];
    const mode = master.recurrence || "none";
    if (mode === "none") return out;

    const anchor = fromISODate(master.date);
    const anchorDay = anchor.getDate();
    const anchorMonth = anchor.getMonth();
    const until = fromISODate(untilISO);

    let guard = 0;

    if (mode === "monthly") {
      let k = 1;
      while (guard < 10000) {
        const cur = addMonthsKeepingDay(anchor, k, anchorDay);
        if (cur > until) break;
        out.push(toISODate(cur));
        k++;
        guard++;
      }
      return out;
    }

    if (mode === "yearly") {
      let k = 1;
      while (guard < 10000) {
        const cur = addYearsKeepingDay(anchor, k, anchorMonth, anchorDay);
        if (cur > until) break;
        out.push(toISODate(cur));
        k++;
        guard++;
      }
      return out;
    }

    return out;
  }

  async function materializeRecurrenceSeries(masterEvent, untilISO) {
    const seriesId = masterEvent.seriesId || masterEvent.id;
    const dates = buildOccurrenceDates(masterEvent, untilISO);

    const createdChildren = [];
    for (const iso of dates) {
      const payload = {
        title: masterEvent.title,
        category: masterEvent.category,
        type: masterEvent.type,
        amount: masterEvent.amount,
        date: iso,
        time: masterEvent.time || "",
        notes: masterEvent.notes || "",
        pinned: !!masterEvent.pinned,

        // figli sono eventi normali
        recurrence: "none",

        // legame serie
        seriesId,
        seriesMaster: false
      };

      const res = await API.createEvent(payload);
      const child = res?.event || res;
      if (child?.id) createdChildren.push(child);
    }

    return { seriesId, children: createdChildren };
  }

  // -----------------------------
  // Balance & Stats (NO FUTURI per saldo attuale)
  // -----------------------------
  function signedAmount(evt) {
    const amt = Number(evt.amount || 0);
    if (!amt) return 0;
    if (evt.type === "income") return +amt;
    if (evt.type === "expense") return -amt;
    return 0;
  }

  function computeBalanceUpTo(events, initialBalance, dateISO) {
    const cutoff = fromISODate(dateISO);
    let bal = Number(initialBalance || 0);

    for (const e of events) {
      if (!e?.date) continue;
      const d = fromISODate(e.date);
      if (d <= endOfDay(cutoff)) {
        bal += signedAmount(e);
      }
    }
    return bal;
  }

  function computeSnapshots(eventsInRange, initialBalance, rangeStart, rangeEnd) {
    const days = [];
    const map = new Map();

    for (const e of eventsInRange) {
      const k = e.date;
      map.set(k, (map.get(k) || 0) + signedAmount(e));
    }

    let bal = Number(initialBalance || 0);
    let cur = startOfDay(rangeStart);
    const last = startOfDay(rangeEnd);

    while (cur <= last) {
      const iso = toISODate(cur);
      bal += (map.get(iso) || 0);
      days.push({ date: iso, balance: bal });
      cur = addDays(cur, 1);
    }
    return days;
  }

  function computeVisibleStats(filteredEvents) {
    const [viewStart, viewEnd] = getEffectiveRangeForView();
    const [userStart, userEnd] = getUserRangeConstraints();

    const rangeStart = new Date(Math.max(viewStart.getTime(), userStart.getTime()));
    const rangeEnd = new Date(Math.min(viewEnd.getTime(), userEnd.getTime()));

    const inVisible = filteredEvents.filter(e => {
      const d = fromISODate(e.date);
      return d >= startOfDay(rangeStart) && d <= endOfDay(rangeEnd);
    });

    const incomeEvents = inVisible.filter(e => e.type === "income");
    const expenseEvents = inVisible.filter(e => e.type === "expense");

    const incomeSum = incomeEvents.reduce((s, e) => s + Number(e.amount || 0), 0);
    const expenseSum = expenseEvents.reduce((s, e) => s + Number(e.amount || 0), 0);
    const net = incomeSum - expenseSum;

    const snapshots = computeSnapshots(
      inVisible,
      state.settings.initialBalance,
      startOfDay(rangeStart),
      startOfDay(rangeEnd)
    );

    return {
      rangeStart, rangeEnd,
      incomeSum, expenseSum, net,
      incomeCount: incomeEvents.length,
      expenseCount: expenseEvents.length,
      snapshots
    };
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function render() {
    syncControlsFromState();
    renderCategoryOptions();
    renderCalendar();
    renderStats();
  }

  function syncControlsFromState() {
    const sidebar = $("#sidebar");
    sidebar.setAttribute("data-open", state.settings.sidebarOpen ? "true" : "false");

    $$("#viewSwitch .btn--seg").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.view === state.settings.view ? "true" : "false");
    });

    $$("#densitySwitch .btn--seg").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.density === state.settings.density ? "true" : "false");
    });

    $$("#rangePresets .btn--pill").forEach(btn => {
      btn.setAttribute("aria-pressed", btn.dataset.preset === state.settings.rangeMode ? "true" : "false");
    });

    $("#searchInput").value = state.settings.search || "";
    $("#toggleIncome").checked = !!state.settings.includeIncome;
    $("#toggleExpense").checked = !!state.settings.includeExpense;
    $("#toggleOther").checked = !!state.settings.includeOther;

    $("#fromDate").value = state.settings.fromDate || "";
    $("#toDate").value = state.settings.toDate || "";

    const host = $("#calendarView");
    host.dataset.view = state.settings.view;
    host.dataset.density = state.settings.density;

    const [viewStart, viewEnd] = getEffectiveRangeForView();
    $("#rangeLabel").textContent = formatRangeLabel(viewStart, viewEnd, state.settings.view);

    // balanceAtDate input
    const balInput = $("#balanceAtDate");
    if (balInput) balInput.value = state.settings.balanceAtDate || toISODate(new Date());
  }

  function getUniqueCategories() {
    const set = new Set(state.events.map(e => (e.category || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "it"));
  }

  function renderCategoryOptions() {
    const cats = getUniqueCategories();

    const sel = $("#categorySelect");
    const prev = state.settings.category || "all";
    sel.innerHTML = "";

    const optAll = document.createElement("option");
    optAll.value = "all";
    optAll.textContent = "Tutte";
    sel.appendChild(optAll);

    for (const c of cats) {
      const opt = document.createElement("option");
      opt.value = c.toLowerCase();
      opt.textContent = c;
      sel.appendChild(opt);
    }
    sel.value = prev;

    const list = $("#categoryList");
    list.innerHTML = "";
    for (const c of cats) {
      const o = document.createElement("option");
      o.value = c;
      list.appendChild(o);
    }
  }

  function renderCalendar() {
    const filtered = getFilteredEvents();
    const view = state.settings.view;

    const host = $("#calendarView");
    host.innerHTML = "";

    const [vs, ve] = getEffectiveRangeForView();
    $("#calendarTitle").textContent = `Calendario · ${formatRangeLabel(vs, ve, view)}`;

    $("#calendarSubtitle").textContent = `${filtered.length} eventi (filtrati)`;

    if (view === "day") host.appendChild(renderDayView(filtered));
    else if (view === "week") host.appendChild(renderWeekView(filtered));
    else if (view === "month") host.appendChild(renderMonthView(filtered));
    else if (view === "year") host.appendChild(renderYearView(filtered));
  }

  function renderDayView(events) {
    const [start] = getEffectiveRangeForView();
    const container = el("div", { className: "view view--day", id: "viewDayHost" });

    const dayISO = toISODate(start);

    const header = el("div", { className: "view__header", id: "dayHeader" }, [
      el("h2", { className: "view__title", id: "dayTitle", textContent: formatDateHuman(start) }),
      el("div", { className: "view__meta", id: "dayMeta", textContent: "Eventi del giorno" })
    ]);

    const list = el("div", { className: "event-list event-list--day", id: "dayEventList", role: "list" });

    const dayEvents = events.filter(e => e.date === dayISO);
    if (!dayEvents.length) {
      list.appendChild(emptyState("Nessun evento in questo giorno.", "event-empty event-empty--day"));
    } else {
      for (const e of dayEvents) list.appendChild(eventCard(e));
    }

    container.append(header, list);
    return container;
  }

  function renderWeekView(events) {
    const [start, end] = getEffectiveRangeForView();
    const container = el("div", { className: "view view--week", id: "viewWeekHost" });

    const header = el("div", { className: "view__header", id: "weekHeader" }, [
      el("h2", { className: "view__title", id: "weekTitle", textContent: `${formatDateHuman(start)} – ${formatDateHuman(end)}` }),
      el("div", { className: "view__meta", id: "weekMeta", textContent: "Griglia settimana" })
    ]);

    const grid = el("div", { className: "calendar-grid calendar-grid--week", id: "weekGrid" });

    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const iso = toISODate(d);

      const col = el("section", {
        className: "day-col day-col--week",
        id: `weekDay_${iso}`,
        "data-date": iso,
        role: "region",
        "aria-label": `Giorno ${formatDateHuman(d)}`
      });

      const colHeader = el("header", { className: "day-col__header" }, [
        el("div", { className: "day-col__dow", textContent: new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(d) }),
        el("div", { className: "day-col__date", textContent: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` })
      ]);

      const colBody = el("div", { className: "day-col__body", role: "list" });

      const dayEvents = events.filter(e => e.date === iso);
      if (!dayEvents.length) {
        colBody.appendChild(emptyState("—", "event-empty event-empty--tiny"));
      } else {
        for (const e of dayEvents) colBody.appendChild(eventBlock(e, { density: state.settings.density }));
      }

      col.append(colHeader, colBody);
      grid.appendChild(col);
    }

    container.append(header, grid);
    return container;
  }

  function renderMonthView(events) {
    const [start] = getEffectiveRangeForView();
    const container = el("div", { className: "view view--month", id: "viewMonthHost" });

    const header = el("div", { className: "view__header", id: "monthHeader" }, [
      el("h2", { className: "view__title", id: "monthTitle", textContent: formatMonthHuman(start) }),
      el("div", { className: "view__meta", id: "monthMeta", textContent: "Griglia mese" })
    ]);

    const grid = el("div", { className: "calendar-grid calendar-grid--month", id: "monthGrid" });

    const gridStart = startOfWeek(startOfMonth(start));
    const gridEnd = endOfWeek(endOfMonth(start));

    const dowRow = el("div", { className: "dow-row", id: "monthDowRow" });
    const dow = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
    for (const name of dow) dowRow.appendChild(el("div", { className: "dow-cell", textContent: name }));
    grid.appendChild(dowRow);

    let cur = gridStart;
    while (cur <= gridEnd) {
      const weekRow = el("div", { className: "week-row", role: "row" });

      for (let i = 0; i < 7; i++) {
        const d = addDays(cur, i);
        const iso = toISODate(d);
        const inMonth = d.getMonth() === start.getMonth();

        const cell = el("section", {
          className: `day-cell day-cell--month ${inMonth ? "is-in-month" : "is-out-month"}`,
          id: `monthDay_${iso}`,
          "data-date": iso,
          role: "gridcell",
          "aria-label": `Giorno ${formatDateHuman(d)}`
        });

        const cellHeader = el("header", { className: "day-cell__header" }, [
          el("div", { className: "day-cell__num", textContent: String(d.getDate()) }),
          el("button", {
            className: "btn btn--icon btn--cell-add",
            type: "button",
            "data-action": "quick-add",
            "data-date": iso,
            "aria-label": `Aggiungi evento il ${formatDateHuman(d)}`,
            textContent: "+"
          })
        ]);

        const cellBody = el("div", { className: "day-cell__body", role: "list" });
        const dayEvents = events.filter(e => e.date === iso);

        if (!dayEvents.length) {
          cellBody.appendChild(emptyState("", "event-empty event-empty--month"));
        } else {
          for (const e of dayEvents) cellBody.appendChild(eventBlock(e, { density: state.settings.density }));
        }

        cell.append(cellHeader, cellBody);
        weekRow.appendChild(cell);
      }

      grid.appendChild(weekRow);
      cur = addDays(cur, 7);
    }

    container.append(header, grid);
    return container;
  }

  function renderYearView(events) {
    const [start] = getEffectiveRangeForView();
    const container = el("div", { className: "view view--year", id: "viewYearHost" });

    const header = el("div", { className: "view__header", id: "yearHeader" }, [
      el("h2", { className: "view__title", id: "yearTitle", textContent: String(start.getFullYear()) }),
      el("div", { className: "view__meta", id: "yearMeta", textContent: "Vista anno" })
    ]);

    const wrap = el("div", { className: "year-grid", id: "yearGrid" });

    for (let m = 0; m < 12; m++) {
      const monthDate = new Date(start.getFullYear(), m, 1);
      const monthBox = el("section", {
        className: "month-mini",
        id: `mini_${start.getFullYear()}_${pad2(m + 1)}`,
        "data-month": String(m),
        "data-year": String(start.getFullYear()),
        role: "button",
        tabindex: "0",
        "aria-label": `Apri ${formatMonthHuman(monthDate)}`
      });

      const title = el("header", { className: "month-mini__header" }, [
        el("div", { className: "month-mini__title", textContent: new Intl.DateTimeFormat("it-IT", { month: "long" }).format(monthDate) }),
        el("div", { className: "month-mini__count", textContent: "" })
      ]);

      const body = el("div", { className: "month-mini__body" });

      const inThisMonth = events.filter(e => {
        const d = fromISODate(e.date);
        return d.getFullYear() === start.getFullYear() && d.getMonth() === m;
      });

      title.querySelector(".month-mini__count").textContent = `${inThisMonth.length} evt`;
      body.appendChild(el("div", { className: "badge-row" }, [
        el("span", { className: "badge", textContent: `Tot: ${inThisMonth.length}` })
      ]));

      monthBox.append(title, body);
      wrap.appendChild(monthBox);
    }

    container.append(header, wrap);
    return container;
  }

  // -----------------------------
  // Components
  // -----------------------------
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "className") node.className = v;
      else if (k === "textContent") node.textContent = v;
      else node.setAttribute(k, v);
    }
    if (!Array.isArray(children)) children = [children];
    for (const ch of children) {
      if (ch == null) continue;
      node.appendChild(ch.nodeType ? ch : document.createTextNode(String(ch)));
    }
    return node;
  }

  function emptyState(text, className) {
    return el("div", { className: `empty-state ${className || ""}`.trim() }, [
      el("div", { className: "empty-state__text", textContent: text })
    ]);
  }

  function categorySlug(cat) {
    return (cat || "uncategorized")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9\-_]/g, "");
  }

  function eventBlock(evt, { density = "comfort" } = {}) {
    const amt = evt.amount != null && evt.amount !== "" ? formatMoney(Number(evt.amount), state.settings.currency) : "";
    const cat = evt.category || "Senza categoria";

    const root = el("button", {
      className: [
        "event-block",
        `event-block--type-${evt.type}`,
        `event-block--cat-${categorySlug(cat)}`,
        evt.pinned ? "is-pinned" : "",
        density === "compact" ? "is-compact" : "is-comfort"
      ].filter(Boolean).join(" "),
      type: "button",
      id: `evt_${evt.id}`,
      "data-event-id": evt.id,
      "data-category": cat,
      "data-type": evt.type,
      "aria-label": `Evento: ${evt.title}, ${cat}, ${evt.date}`
    });

    const top = el("div", { className: "event-block__top" }, [
      el("span", { className: "event-block__title", textContent: evt.title }),
      evt.pinned ? el("span", { className: "event-block__pin", textContent: "★", "aria-hidden": "true" }) : null
    ]);

    const meta = el("div", { className: "event-block__meta" }, [
      el("span", { className: "event-block__cat", textContent: cat }),
      evt.time ? el("span", { className: "event-block__time", textContent: evt.time }) : null
    ].filter(Boolean));

    const amount = amt ? el("div", { className: "event-block__amount", textContent: amt }) : null;

    root.append(top, meta);
    if (amount) root.append(amount);

    root.addEventListener("click", () => openEventDrawer(evt.id));
    return root;
  }

  function eventCard(evt) {
    const amt = evt.amount != null && evt.amount !== "" ? formatMoney(Number(evt.amount), state.settings.currency) : "—";
    const cat = evt.category || "Senza categoria";

    const root = el("article", {
      className: [
        "event-card",
        `event-card--type-${evt.type}`,
        `event-card--cat-${categorySlug(cat)}`,
        evt.pinned ? "is-pinned" : ""
      ].filter(Boolean).join(" "),
      id: `evtCard_${evt.id}`,
      "data-event-id": evt.id,
      "data-category": cat,
      "data-type": evt.type,
      role: "listitem"
    });

    const header = el("header", { className: "event-card__header" }, [
      el("div", { className: "event-card__title", textContent: evt.title }),
      el("div", { className: "event-card__badges" }, [
        el("span", { className: "badge badge--type", textContent: evt.type }),
        el("span", { className: "badge badge--cat", textContent: cat }),
        evt.seriesId ? el("span", { className: "badge badge--series", textContent: evt.seriesMaster ? "serie: master" : "serie" }) : null,
        evt.pinned ? el("span", { className: "badge badge--pin", textContent: "★ evidenza" }) : null
      ].filter(Boolean))
    ]);

    const body = el("div", { className: "event-card__body" }, [
      el("div", { className: "kv-row" }, [
        kv("Data", evt.date),
        kv("Ora", evt.time || "—"),
        kv("Importo", amt)
      ]),
      el("div", { className: "event-card__notes", textContent: evt.notes || "" })
    ]);

    const footer = el("footer", { className: "event-card__footer" }, [
      el("button", { className: "btn btn--ghost event-card__btn", type: "button", "data-action": "open", textContent: "Apri" }),
      el("button", { className: "btn btn--ghost event-card__btn", type: "button", "data-action": "edit", textContent: "Modifica" })
    ]);

    root.append(header, body, footer);

    root.addEventListener("click", (e) => {
      const action = e.target?.getAttribute?.("data-action");
      if (action === "edit") {
        e.preventDefault();
        openEventModal("edit", evt.id);
        return;
      }
      if (action === "open") {
        e.preventDefault();
        openEventDrawer(evt.id);
        return;
      }
    });

    return root;
  }

  function kv(k, v) {
    return el("div", { className: "kv" }, [
      el("div", { className: "kv__k", textContent: k }),
      el("div", { className: "kv__v", textContent: v })
    ]);
  }

  // -----------------------------
  // Stats rendering
  // -----------------------------
  function renderStats() {
    const filtered = getFilteredEvents();

    // (A) Stats “nel range visibile”
    const vis = computeVisibleStats(filtered);
    $("#statsMeta").textContent = `${formatRangeLabel(vis.rangeStart, vis.rangeEnd, "custom")} · visibile`;

    $("#statIncome").textContent = formatMoney(vis.incomeSum, state.settings.currency);
    $("#statExpense").textContent = formatMoney(vis.expenseSum, state.settings.currency);
    $("#statNet").textContent = formatMoney(vis.net, state.settings.currency);
    $("#statIncomeCount").textContent = `${vis.incomeCount} eventi`;
    $("#statExpenseCount").textContent = `${vis.expenseCount} eventi`;

    // (B) Saldo attuale: SEMPRE fino a oggi (no futuri) usando gli eventi filtrati (tipo/categoria/search/range)
    // Nota: se vuoi ignorare il range e usare TUTTO lo storico filtrato solo per tipo/categoria/search, basta rimuovere passesUserRange da getFilteredEvents.
    const todayISO = toISODate(new Date());
    const balToday = computeBalanceUpTo(filtered, state.settings.initialBalance, todayISO);
    $("#statCurrentBalance").textContent = formatMoney(balToday, state.settings.currency);
    $("#statCurrentBalanceMeta").textContent = `Calcolato fino a ${todayISO}`;

    // (C) Saldo alla data selezionata
    const atISO = state.settings.balanceAtDate || todayISO;
    const balAt = computeBalanceUpTo(filtered, state.settings.initialBalance, atISO);
    $("#statBalanceAtDate").textContent = formatMoney(balAt, state.settings.currency);

    // snapshot list (ultimi 14 nel range visibile)
    const list = $("#snapshotList");
    list.innerHTML = "";

    const tail = vis.snapshots.slice(-14);
    for (const s of tail) {
      const item = el("div", { className: "snapshot-item", role: "listitem", "data-date": s.date }, [
        el("div", { className: "snapshot-item__date", textContent: s.date }),
        el("div", { className: "snapshot-item__value", textContent: formatMoney(s.balance, state.settings.currency) })
      ]);
      list.appendChild(item);
    }
    if (!tail.length) list.appendChild(emptyState("Nessuno snapshot nel range corrente.", "snapshot-empty"));
  }

  // -----------------------------
  // Drawer + Modal
  // -----------------------------
  function getEventForUIById(eventId) {
    return state.events.find(e => e.id === eventId) || null;
  }

  function openEventDrawer(eventId) {
    const evt = getEventForUIById(eventId);
    if (!evt) return;

    $("#btnEditEvent").disabled = false;
    $("#btnDeleteEvent").disabled = false;

    state.selectedEventId = eventId;

    const drawer = $("#eventDrawer");
    drawer.setAttribute("aria-hidden", "false");

    $("#drawerTitle").textContent = evt.title;

    const detail = $("#eventDetail");
    detail.innerHTML = "";
    detail.appendChild(renderEventDetail(evt));
  }

  function closeEventDrawer() {
    state.selectedEventId = null;
    $("#eventDrawer").setAttribute("aria-hidden", "true");
    $("#eventDetail").innerHTML = "";
  }

  function renderEventDetail(evt) {
    const cat = evt.category || "Senza categoria";
    const amt = evt.amount != null && evt.amount !== "" ? formatMoney(Number(evt.amount), state.settings.currency) : "—";

    const root = el("article", {
      className: [
        "event-detail",
        `event-detail--type-${evt.type}`,
        `event-detail--cat-${categorySlug(cat)}`
      ].join(" "),
      "data-event-id": evt.id
    });

    root.append(
      el("div", { className: "event-detail__row" }, [
        kv("Categoria", cat),
        kv("Tipo", evt.type),
        kv("Serie", evt.seriesId ? (evt.seriesMaster ? "Master" : "Occorrenza") : "—"),
        kv("Ricorrenza", evt.recurrence || "none"),
      ]),
      el("div", { className: "event-detail__row" }, [
        kv("Data", evt.date),
        kv("Ora", evt.time || "—"),
        kv("Importo", amt)
      ]),
      el("div", { className: "event-detail__notes" }, [
        el("h3", { className: "event-detail__notes-title", textContent: "Note" }),
        el("p", { className: "event-detail__notes-text", textContent: evt.notes || "—" })
      ])
    );

    return root;
  }

  function openEventModal(mode, eventId = null, prefillDateISO = null) {
    const modal = $("#eventModal");
    const title = $("#eventModalTitle");

    state.draftEventId = (mode === "edit") ? eventId : null;

    if (mode === "edit") {
      title.textContent = "Modifica evento";
      const evt = state.events.find(e => e.id === eventId);
      if (!evt) return;

      $("#evtTitle").value = evt.title || "";
      $("#evtCategory").value = evt.category || "";
      $("#evtType").value = evt.type || "other";
      $("#evtAmount").value = (evt.amount ?? "");
      $("#evtStart").value = evt.date || "";
      $("#evtTime").value = evt.time || "";
      $("#evtNotes").value = evt.notes || "";
      $("#evtRecurrence").value = evt.recurrence || "none";
      $("#evtPinned").checked = !!evt.pinned;
    } else {
      title.textContent = "Nuovo evento";
      $("#eventForm").reset();
      $("#evtType").value = "expense";
      $("#evtStart").value = prefillDateISO || toISODate(new Date());
      $("#evtRecurrence").value = "none";
      $("#evtPinned").checked = false;
    }

    if (typeof modal.showModal === "function") modal.showModal();
    else alert("Il browser non supporta <dialog>.");
  }

  function closeEventModal() {
    const modal = $("#eventModal");
    if (typeof modal.close === "function") modal.close();
  }

  async function upsertEventFromForm() {
    const data = {
      title: $("#evtTitle").value.trim(),
      category: $("#evtCategory").value.trim() || "Senza categoria",
      type: $("#evtType").value,
      amount: $("#evtAmount").value === "" ? null : Number($("#evtAmount").value),
      date: $("#evtStart").value,
      time: $("#evtTime").value,
      notes: $("#evtNotes").value.trim(),
      pinned: $("#evtPinned").checked,
      recurrence: $("#evtRecurrence").value // none|monthly|yearly
    };

    if (!data.title || !data.date) {
      alert("Titolo e data sono obbligatori.");
      return;
    }

    try {
      if (state.draftEventId) {
        // Edit: qui modifichi SOLO l'evento selezionato (non tutta la serie).
        const updated = await API.updateEvent(state.draftEventId, data);
        const evt = updated?.event || updated || { id: state.draftEventId, ...data };

        const idx = state.events.findIndex(e => e.id === state.draftEventId);
        if (idx >= 0) state.events[idx] = evt;
      } else {
        // Create
        const mode = data.recurrence || "none";

        if (mode === "none") {
          const created = await API.createEvent({
            ...data,
            recurrence: "none",
            seriesId: null,
            seriesMaster: false
          });
          const evt = created?.event || created;
          state.events.push(evt);
        } else {
          // Serie materializzata
          const seriesId = uid();

          // Master = prima occorrenza (evento reale)
          // IMPORTANT: per evitare espansioni future, NON creiamo eventi “virtuali”.
          // Il master può tenere recurrence per info, ma resta un record reale.
          const masterPayload = {
            ...data,
            seriesId,
            seriesMaster: true
          };

          const created = await API.createEvent(masterPayload);
          const master = created?.event || created;
          if (!master?.id) throw new Error("Backend non ha restituito l'id dell'evento.");

          // Materializza occorrenze future come eventi normali (recurrence none)
          const untilISO = defaultRecurrenceUntilISO(master.date, mode);
          const { children } = await materializeRecurrenceSeries(master, untilISO);

          // Per evitare doppioni, assicurati che tutti abbiano seriesId (master incluso)
          state.events.push(master, ...children);
        }
      }

      closeEventModal();
      render();
    } catch (err) {
      console.error(err);
      alert(`Salvataggio fallito: ${err.message}`);
    }
  }

  async function deleteSelectedEvent() {
    const id = state.selectedEventId;
    if (!id) return;

    const evt = getEventForUIById(id);
    if (!evt) return;

    const isSeries = !!evt.seriesId;
    const seriesId = evt.seriesId;

    if (!isSeries) {
      const ok = confirm(`Eliminare "${evt.title}"?`);
      if (!ok) return;

      try {
        await API.deleteEvent(evt.id);
        state.events = state.events.filter(e => e.id !== evt.id);
        closeEventDrawer();
        render();
      } catch (err) {
        console.error(err);
        alert(`Eliminazione fallita: ${err.message}`);
      }
      return;
    }

    const choice = prompt(
      `Evento in serie.\n` +
      `Scrivi:\n` +
      `1 = elimina solo questo evento\n` +
      `2 = elimina questo e tutti i successivi (da ${evt.date})\n` +
      `3 = elimina tutta la serie\n\n` +
      `Annulla per uscire.`,
      "1"
    );
    if (choice == null) return;

    try {
      if (choice === "1") {
        const ok = confirm(`Eliminare SOLO "${evt.title}" del ${evt.date}?`);
        if (!ok) return;

        await API.deleteEvent(evt.id);
        state.events = state.events.filter(e => e.id !== evt.id);
      } else if (choice === "2") {
        const ok = confirm(`Eliminare "${evt.title}" e TUTTI i successivi da ${evt.date}?`);
        if (!ok) return;

        await API.deleteSeriesFrom(seriesId, evt.date);
        state.events = state.events.filter(e => !(e.seriesId === seriesId && e.date >= evt.date));
      } else if (choice === "3") {
        const ok = confirm(`Eliminare TUTTA la serie di "${evt.title}"?`);
        if (!ok) return;

        await API.deleteSeries(seriesId);
        state.events = state.events.filter(e => e.seriesId !== seriesId);
      } else {
        alert("Scelta non valida.");
        return;
      }

      closeEventDrawer();
      render();
    } catch (err) {
      console.error(err);
      alert(`Eliminazione fallita: ${err.message}`);
    }
  }

  // -----------------------------
  // Navigation
  // -----------------------------
  function moveAnchor(delta) {
    const view = state.settings.view;
    if (view === "day") state.anchorDate = addDays(state.anchorDate, delta);
    else if (view === "week") state.anchorDate = addDays(state.anchorDate, 7 * delta);
    else if (view === "month") state.anchorDate = addMonths(state.anchorDate, delta);
    else if (view === "year") state.anchorDate = addYears(state.anchorDate, delta);
  }

  function goToday() {
    state.anchorDate = startOfDay(new Date());
  }

  // -----------------------------
  // Export / Import
  // -----------------------------
  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      events: state.events
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `calendar_finance_export_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file) {
    const text = await file.text();
    const payload = JSON.parse(text);

    const events = Array.isArray(payload.events) ? payload.events : [];
    if (!events.length) {
      alert("JSON valido ma senza eventi.");
      return;
    }

    // IMPORT: crea tutti gli eventi via API (id lasciato al backend)
    for (const e of events) {
      const { id, ...rest } = e;
      await API.createEvent(rest);
    }

    state.events = await loadEventsFromBackend();

    if (payload.settings) {
      state.settings = { ...state.settings, ...payload.settings };
      saveSettings();
    }

    render();
  }

  // -----------------------------
  // Wiring
  // -----------------------------
  function wireUI() {
    $("#btnSidebarToggle").addEventListener("click", () => {
      state.settings.sidebarOpen = !state.settings.sidebarOpen;
      saveSettings();
      render();
    });

    $("#btnPrev").addEventListener("click", () => {
      moveAnchor(-1);
      render();
    });

    $("#btnNext").addEventListener("click", () => {
      moveAnchor(1);
      render();
    });

    $("#btnToday").addEventListener("click", () => {
      goToday();
      render();
    });

    $$("#viewSwitch .btn--seg").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.view = btn.dataset.view;
        saveSettings();
        render();
      });
    });

    $$("#densitySwitch .btn--seg").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.density = btn.dataset.density;
        saveSettings();
        render();
      });
    });

    $("#btnNewEvent").addEventListener("click", () => openEventModal("new"));

    // Sidebar filters
    $("#searchInput").addEventListener("input", (e) => {
      state.settings.search = e.target.value;
      saveSettings();
      render();
    });

    $("#categorySelect").addEventListener("change", (e) => {
      state.settings.category = e.target.value;
      saveSettings();
      render();
    });

    $("#toggleIncome").addEventListener("change", (e) => {
      state.settings.includeIncome = e.target.checked;
      saveSettings();
      render();
    });

    $("#toggleExpense").addEventListener("change", (e) => {
      state.settings.includeExpense = e.target.checked;
      saveSettings();
      render();
    });

    $("#toggleOther").addEventListener("change", (e) => {
      state.settings.includeOther = e.target.checked;
      saveSettings();
      render();
    });

    // Range presets
    $$("#rangePresets .btn--pill").forEach(btn => {
      btn.addEventListener("click", () => {
        state.settings.rangeMode = btn.dataset.preset;

        const [minTrack, maxTrack] = getTrackingBounds(state.events);
        if (state.settings.rangeMode === "from" && !state.settings.fromDate) {
          state.settings.fromDate = toISODate(minTrack);
        }
        if (state.settings.rangeMode === "between") {
          if (!state.settings.fromDate) state.settings.fromDate = toISODate(minTrack);
          if (!state.settings.toDate) state.settings.toDate = toISODate(maxTrack);
        }

        saveSettings();
        render();
      });
    });

    $("#fromDate").addEventListener("change", (e) => {
      state.settings.fromDate = e.target.value;
      saveSettings();
      render();
    });

    $("#toDate").addEventListener("change", (e) => {
      state.settings.toDate = e.target.value;
      saveSettings();
      render();
    });

    // NUOVO: saldo alla data
    $("#balanceAtDate").addEventListener("change", (e) => {
      state.settings.balanceAtDate = e.target.value || toISODate(new Date());
      saveSettings();
      renderStats();
    });

    $("#btnClearFilters").addEventListener("click", () => {
      const keepView = state.settings.view;
      const keepDensity = state.settings.density;
      const keepSidebar = state.settings.sidebarOpen;
      const keepBalanceAt = state.settings.balanceAtDate || toISODate(new Date());

      state.settings = {
        ...structuredClone(defaultSettings),
        view: keepView,
        density: keepDensity,
        sidebarOpen: keepSidebar,
        balanceAtDate: keepBalanceAt
      };

      saveSettings();
      render();
    });

    $("#btnApplyFilters").addEventListener("click", () => render());

    // Calendar interactions
    $("#calendarView").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.getAttribute("data-action");
      if (action === "quick-add") {
        const iso = btn.getAttribute("data-date");
        openEventModal("new", null, iso);
      }
    });

    // Year mini months click
    $("#calendarView").addEventListener("click", (e) => {
      const box = e.target.closest(".month-mini");
      if (!box) return;
      const y = Number(box.dataset.year);
      const m = Number(box.dataset.month);
      if (Number.isFinite(y) && Number.isFinite(m)) {
        state.anchorDate = new Date(y, m, 1);
        state.settings.view = "month";
        saveSettings();
        render();
      }
    });

    // Drawer
    $("#btnCloseDrawer").addEventListener("click", closeEventDrawer);
    $("#btnEditEvent").addEventListener("click", () => {
      if (!state.selectedEventId) return;
      openEventModal("edit", state.selectedEventId);
    });
    $("#btnDeleteEvent").addEventListener("click", deleteSelectedEvent);

    // Modal
    $("#btnCloseModal").addEventListener("click", closeEventModal);
    $("#btnCancelEvent").addEventListener("click", closeEventModal);
    $("#eventForm").addEventListener("submit", (e) => {
      e.preventDefault();
      upsertEventFromForm();
    });

    // Export / Import
    $("#btnExport").addEventListener("click", exportJSON);
    $("#importFile").addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importJSON(file);
      } catch (err) {
        console.error(err);
        alert("Import fallito: JSON non valido.");
      } finally {
        e.target.value = "";
      }
    });

    // ESC closes
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = $("#eventModal");
        if (modal?.open) {
          closeEventModal();
          return;
        }
        const drawer = $("#eventDrawer");
        if (drawer?.getAttribute("aria-hidden") === "false") closeEventDrawer();
      }
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  async function init() {
    wireUI();

    try {
      // settings
      try {
        const s = await API.getSettings();
        const incoming = (s?.settings) ? s.settings : (s || {});
        state.settings = { ...structuredClone(defaultSettings), ...incoming };
      } catch {
        state.settings = structuredClone(defaultSettings);
      }

      // default balanceAtDate = oggi se non presente
      if (!state.settings.balanceAtDate) state.settings.balanceAtDate = toISODate(new Date());

      // events
      state.events = await loadEventsFromBackend();

      // bounds
      const [minTrack, maxTrack] = getTrackingBounds(state.events);
      state.anchorDate = clampDateToRange(startOfDay(new Date()), minTrack, maxTrack);

      // date inputs defaults
      if (!state.settings.fromDate) state.settings.fromDate = toISODate(minTrack);
      if (!state.settings.toDate) state.settings.toDate = toISODate(maxTrack);

      render();
    } catch (err) {
      console.error(err);
      alert(`Impossibile caricare dati dal backend: ${err.message}`);
      state.events = [];
      state.settings = structuredClone(defaultSettings);
      render();
    }
  }

  init();
})();
