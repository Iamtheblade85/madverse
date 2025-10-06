/* noncustodial_farms.js
 * Manage not-custodial NFTs Farm — Frontend single-file (HTML+CSS+JS)
 * Aggiunte: scadenza per template (estendibile, non accorciabile),
 * gestione multi-token deposito e reward per token.
 */

(function () {
  const DEFAULTS = {
    apiBaseUrl: "",         // es: "http://localhost:8080"
    endpointPath: "/api/templates-by-schema",
    containerId: null,
    appTitle: "Manage not-custodial NFTs Farm",
    storageKeySel: "nftFarm.selection.v1",
    storageKeyTokens: "nftFarm.tokens.v1",
    storageKeyRewardsPerToken: "nftFarm.rewardsPerToken.v1",
    storageKeyExpiry: "nftFarm.expiry.v1",
  };

  // ===== Utilities =====
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const debounce = (fn, ms = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text));
      toast("Copiato negli appunti");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copiato negli appunti");
    }
  };

  const downloadJson = (obj, filename = "rewards-draft.json") => {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = filename;
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Datetime helpers
  const nowPlusMinutes = (m) => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + m);
    return d;
  };
  const toDatetimeLocal = (d) => {
    // yyyy-MM-ddThh:mm for <input type="datetime-local">
    const pad = (n) => String(n).padStart(2, "0");
    const y = d.getFullYear();
    const M = pad(d.getMonth() + 1);
    const D = pad(d.getDate());
    const h = pad(d.getHours());
    const m = pad(d.getMinutes());
    return `${y}-${M}-${D}T${h}:${m}`;
  };
  const parseDatetimeLocal = (v) => {
    // v come "2025-10-06T12:00"
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // Toast minimal
  let toastTimer = null;
  const toast = (msg) => {
    let t = $("#nftf-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "nftf-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
  };

  // ===== Styles injection =====
  const injectStyles = () => {
    if ($("#nftf-styles")) return;
    const style = document.createElement("style");
    style.id = "nftf-styles";
    style.textContent = `
      :root {
        --nftf-bg: #0b0f14;
        --nftf-panel: #111821;
        --nftf-surface: #131c26;
        --nftf-soft: #0f1620;
        --nftf-border: #1e2a36;
        --nftf-accent: #58a6ff;
        --nftf-accent-weak: rgba(88,166,255,.15);
        --nftf-text: #e6eef8;
        --nftf-dim: #9fb3c8;
        --nftf-good: #25c2a0;
        --nftf-bad: #ff6b6b;
        --nftf-warn: #f8c555;
        --nftf-focus: 0 0 0 2px rgba(88,166,255,.4);
        --nftf-radius: 14px;
        --nftf-radius-sm: 10px;
        --nftf-shadow: 0 10px 30px rgba(0,0,0,.35);
        --nftf-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      }
      @media (prefers-color-scheme: light) {
        :root {
          --nftf-bg: #f6f8fb;
          --nftf-panel: #ffffff;
          --nftf-surface: #ffffff;
          --nftf-soft: #f1f5f9;
          --nftf-border: #d7e2ee;
          --nftf-text: #0d1b2a;
          --nftf-dim: #486581;
          --nftf-accent-weak: rgba(24,119,242,.12);
          --nftf-shadow: 0 10px 30px rgba(30, 41, 59, .12);
        }
      }
      * { box-sizing: border-box; }
      body.nftf-mounted { margin: 0; background: var(--nftf-bg); color: var(--nftf-text); font-family: var(--nftf-font); }
      #nftf-root { max-width: 1200px; margin: 30px auto; padding: 0 16px; }

      .nftf-card {
        background: linear-gradient(180deg, var(--nftf-surface), var(--nftf-soft));
        border: 1px solid var(--nftf-border);
        border-radius: var(--nftf-radius);
        box-shadow: var(--nftf-shadow);
      }
      .nftf-header { display: grid; gap: 8px; padding: 22px 20px; }
      .nftf-title { font-size: 22px; font-weight: 800; letter-spacing: .2px; }
      .nftf-sub { color: var(--nftf-dim); font-size: 14px; }

      .nftf-controls {
        display: grid; gap: 10px;
        padding: 14px; border-top: 1px solid var(--nftf-border);
        grid-template-columns: 1fr auto auto;
      }
      .nftf-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .nftf-input, .nftf-select {
        height: 40px; padding: 0 12px; outline: none;
        background: var(--nftf-panel); color: var(--nftf-text);
        border: 1px solid var(--nftf-border);
        border-radius: var(--nftf-radius-sm);
      }
      .nftf-input:focus, .nftf-select:focus { box-shadow: var(--nftf-focus); border-color: var(--nftf-accent); }
      .nftf-btn {
        height: 40px; padding: 0 14px; border-radius: 999px;
        border: 1px solid var(--nftf-border);
        background: linear-gradient(180deg, var(--nftf-panel), var(--nftf-soft));
        color: var(--nftf-text); cursor: pointer;
      }
      .nftf-btn.small { height: 32px; padding: 0 10px; border-radius: 10px; font-size: 12px; }
      .nftf-btn.primary { background: linear-gradient(180deg, var(--nftf-accent), #3a7bd5); border-color: transparent; color: white; }
      .nftf-btn.ghost { background: transparent; }
      .nftf-btn:focus { box-shadow: var(--nftf-focus); }
      .nftf-btn[disabled] { opacity: .6; cursor: not-allowed; }

      .nftf-summary {
        display: flex; gap: 12px; flex-wrap: wrap; align-items: center; color: var(--nftf-dim);
        padding: 10px 14px; border-top: 1px dashed var(--nftf-border);
        font-size: 13px;
      }
      .nftf-badge {
        background: var(--nftf-accent-weak); color: var(--nftf-accent);
        padding: 6px 10px; border-radius: 999px; font-weight: 700; font-size: 12px; border: 1px solid transparent;
      }
      .nftf-badge.good { color: var(--nftf-good); background: rgba(37,194,160,.12); }
      .nftf-badge.warn { color: var(--nftf-warn); background: rgba(248,197,85,.12); }
      .nftf-badge.dim { color: var(--nftf-dim); background: transparent; border-color: var(--nftf-border); }

      .nftf-body { padding: 0 0 12px; }
      .nftf-sections { display: grid; gap: 12px; margin-top: 12px; }

      details.nftf-section {
        border: 1px solid var(--nftf-border);
        border-radius: var(--nftf-radius);
        background: var(--nftf-panel);
        overflow: hidden;
      }
      .nftf-section > summary {
        list-style: none; cursor: pointer; padding: 12px 14px; font-weight: 700; display: flex; gap: 8px; align-items: center;
        background: linear-gradient(180deg, var(--nftf-soft), transparent);
        border-bottom: 1px solid var(--nftf-border);
      }
      .nftf-section[open] > summary { border-bottom-color: var(--nftf-border); }
      .nftf-section summary::-webkit-details-marker { display: none; }
      .nftf-section .nftf-section-actions { margin-left: auto; display: flex; gap: 8px; }

      .nftf-table-wrap { overflow: auto; }
      table.nftf-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 14px; }
      table.nftf-table thead th {
        position: sticky; top: 0; background: var(--nftf-panel); z-index: 1;
        text-align: left; padding: 10px 12px; font-weight: 800; letter-spacing: .2px; border-bottom: 1px solid var(--nftf-border); user-select: none; cursor: pointer;
      }
      table.nftf-table thead th.sortable:hover { background: linear-gradient(180deg, var(--nftf-soft), var(--nftf-panel)); }
      table.nftf-table tbody td { padding: 10px 12px; border-bottom: 1px dashed var(--nftf-border); vertical-align: middle; }
      table.nftf-table tbody tr:hover { background: linear-gradient(180deg, var(--nftf-soft), transparent); }
      .nftf-cell-id { font-variant-numeric: tabular-nums; }
      .nftf-id-btn { font-size: 12px; border: 1px dashed var(--nftf-border); padding: 3px 6px; border-radius: 8px; background: transparent; cursor: pointer; }
      .nftf-id-btn:hover { border-color: var(--nftf-accent); color: var(--nftf-accent); }

      .nftf-rightpanel {
        position: fixed; right: 16px; top: 16px; bottom: 16px; width: 420px;
        background: var(--nftf-panel); border: 1px solid var(--nftf-border);
        border-radius: var(--nftf-radius); box-shadow: var(--nftf-shadow);
        display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; transform: translateX(440px); transition: transform .25s ease;
      }
      .nftf-rightpanel.open { transform: translateX(0); }
      .nftf-rightpanel header { padding: 14px; border-bottom: 1px solid var(--nftf-border); display: flex; align-items: center; gap: 8px; }
      .nftf-rightpanel header h3 { margin: 0; font-size: 16px; }
      .nftf-rightpanel .nftf-rp-body { padding: 12px; overflow: auto; display: grid; gap: 12px; }
      .nftf-rp-item {
        border: 1px dashed var(--nftf-border); border-radius: 12px; padding: 10px; display: grid; gap: 10px;
        background: linear-gradient(180deg, var(--nftf-soft), transparent);
      }
      .nftf-rp-item .row { display: flex; justify-content: space-between; gap: 8px; align-items: center; flex-wrap: wrap; }
      .nftf-rp-item .meta { font-size: 12px; color: var(--nftf-dim); }
      .nftf-rp-item .reward-input {
        width: 140px; height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--nftf-border);
        background: var(--nftf-surface); color: var(--nftf-text);
      }
      .nftf-rp-item .dt-input {
        height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--nftf-border);
        background: var(--nftf-surface); color: var(--nftf-text);
      }
      .nftf-rp-footer { padding: 12px; border-top: 1px solid var(--nftf-border); display: grid; gap: 8px; }
      .nftf-rp-footer .nftf-btn { width: 100%; }

      .nftf-chip {
        display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px;
        border: 1px solid var(--nftf-border); background: transparent; cursor: pointer; font-size: 12px; margin: 3px 6px 0 0;
      }
      .nftf-chip.active { background: var(--nftf-accent-weak); border-color: var(--nftf-accent); color: var(--nftf-accent); }
      .nftf-chip input { display: none; }

      .nftf-empty, .nftf-error { padding: 18px; text-align: center; color: var(--nftf-dim); }
      .nftf-skel {
        background: linear-gradient(90deg, rgba(255,255,255,0), rgba(200,200,200,.08), rgba(255,255,255,0));
        animation: nftf-s 1.2s infinite; height: 14px; border-radius: 6px;
      }
      @keyframes nftf-s { 0%{background-position:-120px 0}100%{background-position:120px 0} }

      /* Modal tokens */
      .nftf-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 9998; }
      .nftf-modal.open { display: flex; }
      .nftf-modal .backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.5); }
      .nftf-modal .dialog {
        position: relative; width: min(720px, 92vw); max-height: 80vh; overflow: hidden;
        background: var(--nftf-panel); border: 1px solid var(--nftf-border); border-radius: 16px; box-shadow: var(--nftf-shadow);
        display: grid; grid-template-rows: auto 1fr auto;
      }
      .nftf-modal header { padding: 12px 14px; border-bottom: 1px solid var(--nftf-border); font-weight: 800; display: flex; align-items: center; gap: 10px; }
      .nftf-modal .body { padding: 12px; overflow: auto; display: grid; gap: 12px; }
      .nftf-modal .footer { padding: 12px; border-top: 1px solid var(--nftf-border); display: flex; justify-content: flex-end; gap: 8px; }
      .nftf-token-row { display: grid; grid-template-columns: 2fr 1fr 100px auto; gap: 8px; align-items: center; }
      .nftf-token-list { display: grid; gap: 8px; }
      .nftf-token-pill {
        display: inline-flex; gap: 6px; align-items: center; padding: 6px 10px; font-size: 12px;
        background: linear-gradient(180deg, var(--nftf-soft), transparent); border: 1px dashed var(--nftf-border); border-radius: 10px;
      }

      /* Toast */
      #nftf-toast {
        position: fixed; bottom: 18px; left: 50%; transform: translate(-50%, 20px); opacity: 0;
        padding: 10px 14px; border-radius: 12px; background: var(--nftf-panel); border: 1px solid var(--nftf-border); color: var(--nftf-text);
        box-shadow: var(--nftf-shadow); transition: all .18s ease; z-index: 9999; pointer-events: none;
      }
      #nftf-toast.show { opacity: 1; transform: translate(-50%, 0); }

      /* Small screens */
      @media (max-width: 900px) {
        .nftf-rightpanel { position: fixed; right: 0; left: 0; width: auto; height: 60vh; top: auto; bottom: 0; transform: translateY(64vh); }
        .nftf-rightpanel.open { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  };

  // ===== DOM Creation =====
  const createRoot = (containerId) => {
    let root;
    if (containerId) {
      root = document.getElementById(containerId);
      if (!root) {
        root = document.createElement("div");
        root.id = containerId;
        document.body.appendChild(root);
      }
    } else {
      root = document.createElement("div");
      root.id = "nft-farm-root";
      document.body.appendChild(root);
    }
    document.body.classList.add("nftf-mounted");

    root.innerHTML = `
      <div id="nftf-root">
        <section class="nftf-card">
          <div class="nftf-header">
            <div class="nftf-title">${DEFAULTS.appTitle}</div>
            <div class="nftf-sub">
              Le distribuzioni avvengono <strong>automaticamente ogni ora</strong> e solo se esiste un <strong>saldo reward residuo</strong> depositato dal creatore della farm.
            </div>
          </div>
          <div class="nftf-controls">
            <div class="nftf-row">
              <input id="nftf-api" class="nftf-input" placeholder="API base (es. http://localhost:8080)" />
              <input id="nftf-collection" class="nftf-input" placeholder="collection_name (es. cryptochaos1)" />
              <button id="nftf-load" class="nftf-btn primary">Carica</button>
            </div>
            <div class="nftf-row">
              <input id="nftf-search" class="nftf-input" placeholder="Cerca per ID o Nome template..." />
              <select id="nftf-schema-filter" class="nftf-select"><option value="">Tutti gli schemi</option></select>
              <button id="nftf-expand" class="nftf-btn ghost" title="Espandi/Comprimi">Espandi tutti</button>
              <button id="nftf-tokens" class="nftf-btn ghost" title="Gestisci token deposito">Gestisci token deposito</button>
            </div>
            <div class="nftf-row">
              <button id="nftf-select-all" class="nftf-btn ghost">Seleziona tutti</button>
              <button id="nftf-clear" class="nftf-btn ghost">Pulisci selezione</button>
              <span id="nftf-meta" class="nftf-badge dim">In attesa...</span>
            </div>
          </div>

          <div class="nftf-body">
            <div id="nftf-status"></div>
            <div id="nftf-sections" class="nftf-sections"></div>
            <div class="nftf-summary">
              <span class="nftf-badge" id="nftf-count-schemas">Schemi: 0</span>
              <span class="nftf-badge" id="nftf-count-templates">Template: 0</span>
              <span class="nftf-badge good" id="nftf-count-selected">Selezionati: 0</span>
            </div>
          </div>
        </section>
      </div>

      <aside id="nftf-rightpanel" class="nftf-rightpanel" aria-label="Selezione per rewards">
        <header>
          <h3>Rewards — Selezione</h3>
          <span id="nftf-rp-count" class="nftf-badge dim" style="margin-left:auto;">0</span>
          <button id="nftf-rp-close" class="nftf-btn ghost" title="Chiudi">Chiudi</button>
        </header>
        <div id="nftf-rp-body" class="nftf-rp-body">
          <div class="nftf-empty">Nessun template selezionato.</div>
        </div>
        <div class="nftf-rp-footer">
          <button id="nftf-rp-copy" class="nftf-btn">Copia JSON negli appunti</button>
          <button id="nftf-rp-download" class="nftf-btn">Scarica JSON</button>
          <button id="nftf-rp-emit" class="nftf-btn primary">Prosegui (emetti evento)</button>
        </div>
      </aside>

      <!-- Modal gestione token deposito -->
      <div id="nftf-modal" class="nftf-modal" aria-hidden="true">
        <div class="backdrop"></div>
        <div class="dialog">
          <header>Token deposito disponibili</header>
          <div class="body">
            <div class="nftf-token-row">
              <input id="tok-contract" class="nftf-input" placeholder="Contratto token (es. eosio.token)" />
              <input id="tok-symbol" class="nftf-input" placeholder="Simbolo (es. WAX)" />
              <input id="tok-dec" class="nftf-input" type="number" min="0" max="18" step="1" placeholder="Decimali" />
              <button id="tok-add" class="nftf-btn small">Aggiungi</button>
            </div>
            <div id="tok-list" class="nftf-token-list"></div>
          </div>
          <div class="footer">
            <button id="tok-close" class="nftf-btn">Chiudi</button>
          </div>
        </div>
      </div>
    `;
    return root;
  };

  // ===== Data fetching =====
  const fetchTemplatesBySchema = async (apiBaseUrl, collection) => {
    const url = `${apiBaseUrl.replace(/\/+$/,'')}${DEFAULTS.endpointPath}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_name: collection }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${txt || res.statusText}`);
    }
    return res.json();
  };

  // ===== Rendering =====
  const numeric = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const percent = (issued, max) => {
    const i = numeric(issued), m = numeric(max);
    if (i === null || m === null || !isFinite(i) || !isFinite(m) || m <= 0) return null;
    return Math.min(100, Math.max(0, (i / m) * 100));
  };

  const renderStatus = (el, state, msg = "") => {
    if (!el) return;
    if (state === "loading") {
      el.innerHTML = `
        <div class="nftf-empty">
          <div class="nftf-skel" style="height:16px;width:200px;margin:8px auto;"></div>
          <div class="nftf-skel" style="height:12px;width:300px;margin:8px auto;"></div>
        </div>`;
    } else if (state === "error") {
      el.innerHTML = `<div class="nftf-error">⚠️ ${escapeHtml(msg)}</div>`;
    } else {
      el.innerHTML = "";
    }
  };

  const schemaSectionId = (schema) => `nftf-sec-${schema.replace(/[^a-z0-9]+/gi, "-")}`;

  const renderSections = (sectionsEl, data, state) => {
    const { collection, schemas = [] } = data || {};
    const search = state.search.trim().toLowerCase();
    const filterSchema = state.schemaFilter || "";

    const filteredSchemas = schemas
      .filter(s => !filterSchema || s.schema_name === filterSchema)
      .map(s => {
        if (!search) return s;
        const filteredTemplates = s.templates.filter(t => {
          const idMatch = String(t.template_id).includes(search);
          const nameMatch = (t.template_name || "").toLowerCase().includes(search);
          return idMatch || nameMatch;
        });
        return { ...s, templates: filteredTemplates };
      })
      .filter(s => s.templates.length > 0);

    const totalSchemas = filteredSchemas.length;
    const totalTemplates = filteredSchemas.reduce((acc, s) => acc + s.templates.length, 0);

    $("#nftf-count-schemas").textContent = `Schemi: ${totalSchemas}`;
    $("#nftf-count-templates").textContent = `Template: ${totalTemplates}`;

    if (totalTemplates === 0) {
      sectionsEl.innerHTML = `<div class="nftf-empty">Nessun risultato. Prova a cambiare filtro o ricerca.</div>`;
      return;
    }

    sectionsEl.innerHTML = filteredSchemas.map(s => sectionHtml(s, state)).join("");
    filteredSchemas.forEach(s => bindSectionInteractions(s, state, collection));
  };

  const sectionHtml = (schemaObj, state) => {
    const sid = schemaSectionId(schemaObj.schema_name);
    const openAttr = state.expandAll ? " open" : "";
    return `
      <details class="nftf-section"${openAttr} id="${sid}">
        <summary>
          <span>${escapeHtml(schemaObj.schema_name)}</span>
          <span class="nftf-badge dim">${schemaObj.templates.length}</span>
          <div class="nftf-section-actions">
            <button class="nftf-btn ghost nftf-sec-select-all">Seleziona schema</button>
            <button class="nftf-btn ghost nftf-sec-clear">Pulisci</button>
          </div>
        </summary>
        <div class="nftf-table-wrap">
          <table class="nftf-table" data-schema="${escapeHtml(schemaObj.schema_name)}">
            <thead>
              <tr>
                <th style="width:42px;"><input type="checkbox" class="nftf-head-check" title="Seleziona visibili" /></th>
                ${thSortable("ID", "template_id")}
                ${thSortable("Nome", "template_name")}
                ${thSortable("Circulating", "circulating_supply")}
                ${thSortable("Max", "max_supply")}
                ${thSortable("% Mint", "pct")}
              </tr>
            </thead>
            <tbody>
              ${schemaObj.templates.map(t => rowHtml(schemaObj.schema_name, t, state)).join("")}
            </tbody>
          </table>
        </div>
      </details>
    `;
  };

  const thSortable = (label, key) => `
    <th class="sortable" data-key="${key}" aria-sort="none">
      <span>${label}</span>
    </th>`;

  const rowHtml = (schemaName, t, state) => {
    const selKey = selectionKey(state.collection, schemaName, t.template_id);
    const isChecked = !!state.selection[selKey];
    const p = percent(t.circulating_supply, t.max_supply);
    const pctStr = p === null ? "—" : `${p.toFixed(1)}%`;
    return `
      <tr data-tid="${t.template_id}">
        <td><input type="checkbox" class="nftf-row-check" ${isChecked ? "checked" : ""} /></td>
        <td class="nftf-cell-id">
          <button class="nftf-id-btn" title="Copia ID">${t.template_id}</button>
        </td>
        <td>${escapeHtml(t.template_name || "—")}</td>
        <td>${Number.isFinite(+t.circulating_supply) ? Number(t.circulating_supply).toLocaleString() : "0"}</td>
        <td>${t.max_supply === null || t.max_supply === undefined ? "—" : Number(t.max_supply).toLocaleString()}</td>
        <td>${pctStr}</td>
      </tr>
    `;
  };

  const bindSectionInteractions = (schemaObj, state, collection) => {
    const sid = schemaSectionId(schemaObj.schema_name);
    const section = document.getElementById(sid);
    const table = $("table.nftf-table", section);
    const headCheck = $(".nftf-head-check", section);
    const btnSelAll = $(".nftf-sec-select-all", section);
    const btnClear = $(".nftf-sec-clear", section);

    $$("thead th.sortable", table).forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        sortTable(table, key);
      });
    });

    $$("#" + sid + " .nftf-id-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.textContent.trim();
        copyToClipboard(id);
      });
    });

    $$("#" + sid + " .nftf-row-check").forEach(chk => {
      chk.addEventListener("change", (e) => {
        const tr = e.target.closest("tr");
        const tid = Number(tr.dataset.tid);
        setSelected(state, collection, schemaObj.schema_name, tid, e.target.checked);
        updateSelectionUI(state);
      });
    });

    headCheck.addEventListener("change", (e) => {
      const rows = $$("tbody tr", table);
      rows.forEach(r => {
        const chk = $(".nftf-row-check", r);
        const tid = Number(r.dataset.tid);
        chk.checked = e.target.checked;
        setSelected(state, collection, schemaObj.schema_name, tid, e.target.checked);
      });
      updateSelectionUI(state);
    });

    btnSelAll.addEventListener("click", () => {
      $$("tbody tr", table).forEach(r => {
        const chk = $(".nftf-row-check", r);
        if (!chk.checked) chk.checked = true;
        const tid = Number(r.dataset.tid);
        setSelected(state, collection, schemaObj.schema_name, tid, true);
      });
      updateSelectionUI(state);
    });

    btnClear.addEventListener("click", () => {
      $$("tbody tr", table).forEach(r => {
        const chk = $(".nftf-row-check", r);
        if (chk.checked) chk.checked = false;
        const tid = Number(r.dataset.tid);
        setSelected(state, collection, schemaObj.schema_name, tid, false);
      });
      updateSelectionUI(state);
    });
  };

  const sortTable = (table, key) => {
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    const th = $(`thead th[data-key="${key}"]`, table);
    const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
    $$("thead th.sortable", table).forEach(x => x.setAttribute("aria-sort", "none"));
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");

    const getVal = (tr) => {
      if (key === "template_id") return Number($(".nftf-cell-id", tr).textContent.trim());
      if (key === "template_name") return $(".nftf-cell-id", tr).nextElementSibling.textContent.trim().toLowerCase();
      if (key === "circulating_supply") return Number(tr.children[3].textContent.replace(/[^\d]/g, "")) || 0;
      if (key === "max_supply") {
        const s = tr.children[4].textContent.trim();
        return s === "—" ? -1 : Number(s.replace(/[^\d]/g, "")) || 0;
      }
      if (key === "pct") {
        const s = tr.children[5].textContent.trim();
        return s === "—" ? -1 : Number(s.replace("%", "")) || 0;
      }
      return 0;
    };

    rows.sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });

    rows.forEach(r => tbody.appendChild(r));
  };

  // ===== State & Persistence =====
  const selectionKey = (collection, schema, tid) => `${collection}::${schema}::${tid}`;

  const loadJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback)); } catch { return fallback; }
  };
  const saveJSON = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };

  const loadSelection = () => loadJSON(DEFAULTS.storageKeySel, {});
  const saveSelection = (sel) => saveJSON(DEFAULTS.storageKeySel, sel);

  const loadTokens = () => loadJSON(DEFAULTS.storageKeyTokens, []); // [{contract,symbol,decimals}]
  const saveTokens = (arr) => saveJSON(DEFAULTS.storageKeyTokens, arr);

  const loadRewardsPerToken = () => loadJSON(DEFAULTS.storageKeyRewardsPerToken, {}); // { key: { "contract:symbol": "0.1" } }
  const saveRewardsPerToken = (map) => saveJSON(DEFAULTS.storageKeyRewardsPerToken, map);

  const loadExpiry = () => loadJSON(DEFAULTS.storageKeyExpiry, {}); // { key: "ISO" }
  const saveExpiry = (map) => saveJSON(DEFAULTS.storageKeyExpiry, map);

  const setSelected = (state, collection, schema, tid, isSelected) => {
    const key = selectionKey(collection, schema, tid);
    if (isSelected) {
      state.selection[key] = { collection, schema_name: schema, template_id: tid };
    } else {
      delete state.selection[key];
      delete state.rewardsPerToken[key];
      delete state.expiry[key];
    }
    saveSelection(state.selection);
    saveRewardsPerToken(state.rewardsPerToken);
    saveExpiry(state.expiry);
  };

  // ===== Right panel (selection details) =====
  const updateSelectionUI = (state) => {
    const selected = Object.values(state.selection).filter(x => x.collection === state.collection);
    $("#nftf-count-selected").textContent = `Selezionati: ${selected.length}`;
    $("#nftf-rp-count").textContent = selected.length.toString();

    const panel = $("#nftf-rightpanel");
    const body = $("#nftf-rp-body");
    if (selected.length === 0) {
      body.innerHTML = `<div class="nftf-empty">Nessun template selezionato.</div>`;
      panel.classList.remove("open");
      return;
    }

    // Helper per arricchimento dal DOM
    const enrich = (sName, tid) => {
      const sid = schemaSectionId(sName);
      const row = $(`#${sid} tr[data-tid="${tid}"]`);
      let template_name = null, circulating_supply = 0, max_supply = null;
      if (row) {
        template_name = row.children[2].textContent.trim() || null;
        const circStr = row.children[3].textContent.trim().replace(/[^\d]/g, "");
        const maxStr = row.children[4].textContent.trim();
        circulating_supply = Number(circStr) || 0;
        max_supply = maxStr === "—" ? null : Number(maxStr.replace(/[^\d]/g, "")) || 0;
      }
      return { template_name, circulating_supply, max_supply };
    };

    const tokens = state.tokens;

    body.innerHTML = selected
      .map(x => {
        const { template_name, circulating_supply, max_supply } = enrich(x.schema_name, x.template_id);
        const key = selectionKey(x.collection, x.schema_name, x.template_id);

        const prevISO = state.expiry[key] || "";
        const minISO = toDatetimeLocal(nowPlusMinutes(5));

        // Chips token
        const tokenChips = tokens.map(t => {
          const id = `${t.contract}:${t.symbol}`;
          const active = !!(state.rewardsPerToken[key] && state.rewardsPerToken[key][id] !== undefined);
          return `<label class="nftf-chip ${active ? "active" : ""}" data-token="${id}">
              <input type="checkbox" ${active ? "checked" : ""}/>
              <span>${escapeHtml(t.symbol)}</span>
              <small class="nftf-dim">@${escapeHtml(t.contract)}</small>
            </label>`;
        }).join("");

        // Riga inputs reward per token (solo per token attivi)
        const rewardsRows = tokens.map(t => {
          const id = `${t.contract}:${t.symbol}`;
          const val = (state.rewardsPerToken[key] && state.rewardsPerToken[key][id] !== undefined)
            ? state.rewardsPerToken[key][id]
            : "";
          const active = val !== "" && val !== undefined;
          return `
            <div class="row nftf-reward-row" data-token="${id}" style="${active ? "" : "display:none;"}">
              <span class="meta">${escapeHtml(t.symbol)} <small class="nftf-dim">@${escapeHtml(t.contract)}</small></span>
              <input type="number" step="0.0001" min="0" class="reward-input" placeholder="Reward / holding" value="${val}" />
            </div>`;
        }).join("");

        return `
          <div class="nftf-rp-item" data-key="${key}">
            <div class="row">
              <strong>${escapeHtml(x.schema_name)}</strong>
              <span class="meta">ID <button class="nftf-id-btn">${x.template_id}</button></span>
            </div>
            <div class="row">
              <div class="meta" title="${escapeHtml(template_name || "—")}">${escapeHtml(template_name || "—")}</div>
              <button class="nftf-btn ghost nftf-rp-remove">Rimuovi</button>
            </div>
            <div class="row">
              <span class="meta">Circ: ${Number(circulating_supply).toLocaleString()} — Max: ${max_supply == null ? "—" : Number(max_supply).toLocaleString()}</span>
            </div>

            <div class="row" style="flex-direction:column; align-items:flex-start; gap:8px;">
              <label class="meta"><strong>Scadenza (validità massima)</strong></label>
              <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <input type="datetime-local" class="dt-input nftf-expiry" min="${minISO}" value="${prevISO ? toDatetimeLocal(new Date(prevISO)) : ""}" />
                <button class="nftf-btn small nftf-extend-7">+7 giorni</button>
                <button class="nftf-btn small nftf-extend-30">+30 giorni</button>
              </div>
              <div class="meta">Questa è la <strong>durata massima</strong> (estendibile, <u>non accorciabile</u>) entro cui verranno considerati gli asset ID di questo template per le distribuzioni orarie, a condizione che esista saldo reward residuo depositato.</div>
            </div>

            <div class="row" style="flex-direction:column; align-items:flex-start; gap:6px;">
              <label class="meta"><strong>Token per reward</strong> — i creatori possono depositare più token e decidere quali usare su questo template.</label>
              <div class="nftf-token-chips">${tokenChips || '<div class="meta">Nessun token configurato. Aggiungi token da "Gestisci token deposito".</div>'}</div>
              <div class="nftf-token-inputs" style="width:100%;">${rewardsRows}</div>
            </div>
          </div>
        `;
      }).join("");

    // Bind: copy/remove
    $$("#nftf-rp-body .nftf-id-btn").forEach(b => {
      b.addEventListener("click", () => copyToClipboard(b.textContent.trim()));
    });
    $$("#nftf-rp-body .nftf-rp-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const obj = state.selection[key];
        if (!obj) return;
        const sid = schemaSectionId(obj.schema_name);
        const row = $(`#${sid} tr[data-tid="${obj.template_id}"]`);
        if (row) {
          const chk = $(".nftf-row-check", row);
          if (chk) chk.checked = false;
        }
        delete state.selection[key];
        delete state.rewardsPerToken[key];
        delete state.expiry[key];
        saveSelection(state.selection);
        saveRewardsPerToken(state.rewardsPerToken);
        saveExpiry(state.expiry);
        updateSelectionUI(state);
      });
    });

    // Bind: expiry (max-only logic)
    $$("#nftf-rp-body .nftf-expiry").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const newDate = parseDatetimeLocal(e.target.value);
        if (!newDate) {
          delete state.expiry[key];
          saveExpiry(state.expiry);
          return;
        }
        const prev = state.expiry[key] ? new Date(state.expiry[key]) : null;
        if (prev && newDate < prev) {
          // Non accorciabile: ripristina vecchio valore
          e.target.value = toDatetimeLocal(prev);
          toast("La scadenza può solo essere estesa, non ridotta.");
          return;
        }
        state.expiry[key] = newDate.toISOString();
        saveExpiry(state.expiry);
      });
    });
    // Quick-extend buttons
    $$("#nftf-rp-body .nftf-extend-7").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const inp = $(".nftf-expiry", item);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base);
        d.setDate(d.getDate() + 7);
        state.expiry[key] = d.toISOString();
        inp.value = toDatetimeLocal(d);
        saveExpiry(state.expiry);
      });
    });
    $$("#nftf-rp-body .nftf-extend-30").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const inp = $(".nftf-expiry", item);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base);
        d.setDate(d.getDate() + 30);
        state.expiry[key] = d.toISOString();
        inp.value = toDatetimeLocal(d);
        saveExpiry(state.expiry);
      });
    });

    // Bind: token chips + reward inputs
    $$("#nftf-rp-body .nftf-token-chips .nftf-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const tokenId = chip.dataset.token;
        chip.classList.toggle("active");
        const active = chip.classList.contains("active");

        state.rewardsPerToken[key] = state.rewardsPerToken[key] || {};
        if (active) {
          // Se attivato e non esiste un valore, inizializza a vuoto
          if (state.rewardsPerToken[key][tokenId] === undefined) {
            state.rewardsPerToken[key][tokenId] = "";
          }
        } else {
          delete state.rewardsPerToken[key][tokenId];
        }
        saveRewardsPerToken(state.rewardsPerToken);

        // toggle riga input associata
        const row = $(`.nftf-reward-row[data-token="${CSS.escape(tokenId)}"]`, item);
        if (row) row.style.display = active ? "" : "none";
      });
    });

    $$("#nftf-rp-body .nftf-token-inputs .nftf-reward-row .reward-input").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const item = e.target.closest(".nftf-rp-item");
        const key = item.dataset.key;
        const tokenId = e.target.closest(".nftf-reward-row").dataset.token;
        state.rewardsPerToken[key] = state.rewardsPerToken[key] || {};
        state.rewardsPerToken[key][tokenId] = e.target.value;
        saveRewardsPerToken(state.rewardsPerToken);
      });
    });

    panel.classList.add("open");
  };

  const buildRewardsDraft = (state, data) => {
    // Arricchimento: schema_name -> Map(template_id -> templateObject)
    const enrichMap = new Map();
    (data.schemas || []).forEach(s => {
      const m = new Map();
      s.templates.forEach(t => m.set(Number(t.template_id), t));
      enrichMap.set(s.schema_name, m);
    });

    const selected = Object.values(state.selection).filter(x => x.collection === state.collection);

    const items = selected.map(x => {
      const key = selectionKey(x.collection, x.schema_name, x.template_id);
      const tpl = enrichMap.get(x.schema_name)?.get(Number(x.template_id)) || {};
      const expiry = state.expiry[key] || null;

      const rewards = [];
      const perToken = state.rewardsPerToken[key] || {};
      Object.entries(perToken).forEach(([tokId, val]) => {
        if (val === "" || Number(val) <= 0) return;
        const [contract, symbol] = tokId.split(":");
        const tokMeta = state.tokens.find(t => t.contract === contract && t.symbol === symbol) || {};
        rewards.push({
          token_contract: contract,
          token_symbol: symbol,
          decimals: tokMeta.decimals ?? null,
          reward_per_holding: Number(val),
        });
      });

      return {
        schema_name: x.schema_name,
        template_id: Number(x.template_id),
        template_name: tpl.template_name || null,
        circulating_supply: Number(tpl.circulating_supply || 0),
        max_supply: (tpl.max_supply === undefined ? null : tpl.max_supply),
        expiry, // ISO 8601 o null
        rewards, // array per-token
      };
    });

    return {
      collection: state.collection,
      policy: {
        distribution: "hourly",
        expiry_semantics: "expiry è una durata massima: può essere estesa ma non ridotta",
        deposit_required: "le distribuzioni avvengono solo se esiste saldo reward residuo",
      },
      tokens_catalog: state.tokens,
      total_selected: items.length,
      items
    };
  };

  // ===== Modal token manager =====
  const openTokensModal = () => $("#nftf-modal").classList.add("open");
  const closeTokensModal = () => $("#nftf-modal").classList.remove("open");

  const renderTokensList = (state) => {
    const list = $("#tok-list");
    if (!state.tokens.length) {
      list.innerHTML = `<div class="nftf-empty">Nessun token configurato.</div>`;
      return;
    }
    list.innerHTML = state.tokens.map(t => `
      <div class="nftf-token-pill" data-id="${t.contract}:${t.symbol}">
        <strong>${escapeHtml(t.symbol)}</strong>
        <span class="nftf-dim">@${escapeHtml(t.contract)}</span>
        <span class="nftf-dim">dec:${t.decimals ?? "—"}</span>
        <button class="nftf-btn small ghost nftf-token-del">Rimuovi</button>
      </div>
    `).join("");

    $$("#tok-list .nftf-token-del").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const pill = e.target.closest(".nftf-token-pill");
        const [contract, symbol] = pill.dataset.id.split(":");
        // rimuovi token
        state.tokens = state.tokens.filter(x => !(x.contract === contract && x.symbol === symbol));
        saveTokens(state.tokens);
        // rimuovi eventuali riferimenti nelle selezioni
        Object.keys(state.rewardsPerToken).forEach(k => {
          if (state.rewardsPerToken[k]) delete state.rewardsPerToken[k][`${contract}:${symbol}`];
        });
        saveRewardsPerToken(state.rewardsPerToken);
        renderTokensList(state);
        updateSelectionUI(state);
      });
    });
  };

  // ===== Main init =====
  function initManageNFTsFarm(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    injectStyles();
    const root = createRoot(cfg.containerId);

    // refs
    const elApi = $("#nftf-api");
    const elCollection = $("#nftf-collection");
    const elLoad = $("#nftf-load");
    const elSections = $("#nftf-sections");
    const elStatus = $("#nftf-status");
    const elSearch = $("#nftf-search");
    const elSchemaFilter = $("#nftf-schema-filter");
    const elExpand = $("#nftf-expand");
    const elMeta = $("#nftf-meta");
    const elSelectAll = $("#nftf-select-all");
    const elClear = $("#nftf-clear");
    const elTokensBtn = $("#nftf-tokens");

    const rp = $("#nftf-rightpanel");
    const rpClose = $("#nftf-rp-close");
    const rpCopy = $("#nftf-rp-copy");
    const rpDownload = $("#nftf-rp-download");
    const rpEmit = $("#nftf-rp-emit");

    const modal = $("#nftf-modal");
    const tokContract = $("#tok-contract");
    const tokSymbol = $("#tok-symbol");
    const tokDec = $("#tok-dec");
    const tokAdd = $("#tok-add");
    const tokClose = $("#tok-close");

    // state
    const state = {
      apiBaseUrl: cfg.apiBaseUrl || location.origin,
      collection: "",
      raw: null,
      search: "",
      schemaFilter: "",
      expandAll: true,
      selection: loadSelection(),
      tokens: loadTokens(),                        // [{contract,symbol,decimals}]
      rewardsPerToken: loadRewardsPerToken(),      // { key: { "contract:symbol": "0.1" } }
      expiry: loadExpiry(),                        // { key: ISO }
    };

    // Prefill
    elApi.value = state.apiBaseUrl;

    // Handlers
    const doLoad = async () => {
      const apiBaseUrl = elApi.value.trim();
      const collection = elCollection.value.trim();
      if (!apiBaseUrl || !collection) {
        toast("Compila API base e collection_name");
        return;
      }
      state.apiBaseUrl = apiBaseUrl;
      state.collection = collection;
      state.search = "";
      state.schemaFilter = "";
      state.expandAll = true;

      renderStatus(elStatus, "loading");
      elMeta.textContent = "Caricamento...";
      elSections.innerHTML = "";

      try {
        const data = await fetchTemplatesBySchema(state.apiBaseUrl, collection);
        state.raw = data;

        // Populate schema filter
        const options = (data.schemas || []).map(s => `<option value="${escapeHtml(s.schema_name)}">${escapeHtml(s.schema_name)}</option>`).join("");
        elSchemaFilter.innerHTML = `<option value="">Tutti gli schemi</option>${options}`;

        // Meta
        const totalSchemas = (data.schemas || []).length;
        const totalTemplates = (data.schemas || []).reduce((acc, s) => acc + (s.templates?.length || 0), 0);
        elMeta.textContent = `Collezione: ${data.collection} — Schemi ${totalSchemas} — Template ${totalTemplates}`;

        renderStatus(elStatus, "ready");
        renderSections(elSections, data, state);
        updateSelectionUI(state);
      } catch (err) {
        renderStatus(elStatus, "error", String(err.message || err));
        elMeta.textContent = "Errore";
      }
    };

    elLoad.addEventListener("click", doLoad);
    elCollection.addEventListener("keydown", (e) => { if (e.key === "Enter") doLoad(); });

    elSearch.addEventListener("input", debounce((e) => {
      state.search = e.target.value || "";
      if (state.raw) renderSections(elSections, state.raw, state);
    }, 180));

    elSchemaFilter.addEventListener("change", () => {
      state.schemaFilter = elSchemaFilter.value || "";
      if (state.raw) renderSections(elSections, state.raw, state);
    });

    elExpand.addEventListener("click", () => {
      state.expandAll = !state.expandAll;
      elExpand.textContent = state.expandAll ? "Comprimi tutti" : "Espandi tutti";
      if (state.raw) renderSections(elSections, state.raw, state);
    });

    elSelectAll.addEventListener("click", () => {
      if (!state.raw) return;
      (state.raw.schemas || []).forEach(s => {
        s.templates.forEach(t => setSelected(state, state.collection, s.schema_name, Number(t.template_id), true));
      });
      $$(".nftf-row-check").forEach(c => c.checked = true);
      updateSelectionUI(state);
    });

    elClear.addEventListener("click", () => {
      if (!state.raw) return;
      Object.keys(state.selection).forEach(k => {
        if (k.startsWith(`${state.collection}::`)) {
          delete state.selection[k];
          delete state.rewardsPerToken[k];
          delete state.expiry[k];
        }
      });
      saveSelection(state.selection);
      saveRewardsPerToken(state.rewardsPerToken);
      saveExpiry(state.expiry);
      $$(".nftf-row-check").forEach(c => c.checked = false);
      updateSelectionUI(state);
    });

    // Right panel actions
    rpClose.addEventListener("click", () => rp.classList.remove("open"));
    rpCopy.addEventListener("click", () => {
      if (!state.raw) return;
      const draft = buildRewardsDraft(state, state.raw);
      copyToClipboard(JSON.stringify(draft, null, 2));
    });
    rpDownload.addEventListener("click", () => {
      if (!state.raw) return;
      const draft = buildRewardsDraft(state, state.raw);
      downloadJson(draft, `rewards-${state.collection}.json`);
    });
    rpEmit.addEventListener("click", () => {
      if (!state.raw) return;
      const draft = buildRewardsDraft(state, state.raw);
      window.dispatchEvent(new CustomEvent("nftFarm:rewardsDraft", { detail: draft }));
      toast("Evento emesso: nftFarm:rewardsDraft");
    });

    // Tokens modal
    elTokensBtn.addEventListener("click", () => {
      openTokensModal();
      renderTokensList(state);
    });
    $(".backdrop", modal).addEventListener("click", closeTokensModal);
    tokClose.addEventListener("click", closeTokensModal);

    tokAdd.addEventListener("click", () => {
      const contract = tokContract.value.trim();
      const symbol = tokSymbol.value.trim().toUpperCase();
      const decimals = tokDec.value === "" ? null : Number(tokDec.value);
      if (!contract || !symbol) {
        toast("Inserisci contratto e simbolo");
        return;
      }
      // dedup
      if (state.tokens.some(t => t.contract === contract && t.symbol === symbol)) {
        toast("Token già presente");
        return;
      }
      state.tokens.push({ contract, symbol, decimals });
      saveTokens(state.tokens);
      tokContract.value = ""; tokSymbol.value = ""; tokDec.value = "";
      renderTokensList(state);
      updateSelectionUI(state); // per aggiornare le chips
    });

    // Auto-mount with defaults if present in URL
    const qp = new URLSearchParams(location.search);
    const qsApi = qp.get("api");
    const qsCol = qp.get("collection");
    if (qsApi) elApi.value = qsApi;
    if (qsCol) elCollection.value = qsCol;

    if ((qsApi || state.apiBaseUrl) && qsCol) {
      if (!qsApi) elApi.value = state.apiBaseUrl;
      doLoad();
    }
  }

  // Expose globally
  window.initManageNFTsFarm = initManageNFTsFarm;

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.__NFTF_AUTO_DISABLED__) {
      initManageNFTsFarm({ apiBaseUrl: DEFAULTS.apiBaseUrl });
    }
  });
})();
