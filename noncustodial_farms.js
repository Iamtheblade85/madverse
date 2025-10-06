(function () {
  const DEFAULTS = {
    apiBaseUrl: "",
    endpointPath: "/api/templates-by-schema",
    containerId: null,
    appTitle: "Manage Non-Custodial NFTs Farm",
    storageKeySel: "nftFarm.selection.v1",
    storageKeyTokens: "nftFarm.tokens.v1",
    storageKeyRewardsPerToken: "nftFarm.rewardsPerToken.v1",
    storageKeyExpiry: "nftFarm.expiry.v1"
  };

  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const escapeHtml = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const debounce = (fn, ms = 250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(String(text));
      toast("Copied to clipboard");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = String(text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      toast("Copied to clipboard");
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

  const nowPlusMinutes = (m) => { const d = new Date(); d.setMinutes(d.getMinutes() + m); return d; };
  const toDatetimeLocal = (d) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const parseDatetimeLocal = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

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

  const injectStyles = () => {
    if ($("#nftf-styles")) return;
    const style = document.createElement("style");
    style.id = "nftf-styles";
    style.textContent = `
      #nftf-root .nftf-bar { display: grid; gap: 12px; }
      #nftf-root .nftf-bar .row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      #nftf-root .nftf-meta { display:flex; gap:8px; flex-wrap:wrap; align-items:center; font-size:.95rem; }
      #nftf-root .nftf-chip { display:inline-flex; align-items:center; gap:6px; padding:6px 10px; border-radius:999px; border:1px solid var(--color-accent, #1affd5); cursor:pointer; background:transparent; }
      #nftf-root .nftf-chip.active { box-shadow: 0 0 8px var(--color-accent, #1affd5); }
      #nftf-root .nftf-tablewrap { overflow:auto; border:1px solid var(--color-accent, #1affd5); border-radius:10px; }
      #nftf-root table.nftf-table { width:100%; border-collapse:separate; border-spacing:0; font-size:0.95rem; }
      #nftf-root table.nftf-table thead th { position:sticky; top:0; background:#000; color:var(--color-highlight,#00f0ff); text-align:left; padding:10px 12px; border-bottom:1px solid var(--color-accent,#1affd5); cursor:pointer; }
      #nftf-root table.nftf-table tbody td { padding:10px 12px; border-bottom:1px dashed rgba(255,255,255,.15); }
      #nftf-root .nftf-id-btn { font-size:.85rem; border:1px dashed var(--color-accent,#1affd5); padding:3px 6px; border-radius:8px; background:transparent; cursor:pointer; }
      #nftf-rightpanel { position: fixed; right: 16px; top: 16px; bottom: 16px; width: 420px; background: rgba(0,0,0,.65); backdrop-filter: blur(6px); border: 1px solid var(--color-accent,#1affd5); border-radius: 14px; box-shadow: 0 0 18px rgba(0,255,204,.25); display: grid; grid-template-rows: auto 1fr auto; overflow: hidden; transform: translateX(440px); transition: transform var(--transition-speed,.3s) ease; z-index: 60; }
      #nftf-rightpanel.open { transform: translateX(0); }
      #nftf-rightpanel header { padding: 12px 14px; border-bottom: 1px solid var(--color-accent,#1affd5); display:flex; align-items:center; gap:8px; }
      #nftf-rightpanel .body { padding: 12px; overflow:auto; display:grid; gap:12px; }
      #nftf-rightpanel .item { border:1px dashed var(--color-accent,#1affd5); border-radius: 12px; padding: 10px; display:grid; gap:10px; background: rgba(0,0,0,.35); }
      #nftf-rightpanel .row { display:flex; gap:8px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
      #nftf-rightpanel .meta { opacity:.9; font-size:.9rem; }
      #nftf-rightpanel .reward-input, #nftf-rightpanel .dt-input { height: 36px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--color-accent,#1affd5); background: #000; color: var(--color-highlight,#00f0ff); }
      #nftf-rightpanel footer { padding: 12px; border-top: 1px solid var(--color-accent,#1affd5); display:grid; gap:8px; }
      #nftf-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; z-index: 70; }
      #nftf-modal.open { display: flex; }
      #nftf-modal .backdrop { position: absolute; inset: 0; background: var(--modal-bg, rgba(0,0,0,.85)); }
      #nftf-modal .dialog { position: relative; width: min(720px, 92vw); max-height: 80vh; overflow: hidden; background: #000; border: 1px solid var(--color-accent,#1affd5); border-radius: 16px; box-shadow: 0 0 20px rgba(0,255,204,.25); display: grid; grid-template-rows: auto 1fr auto; }
      #nftf-modal header, #nftf-modal .footer { padding: 12px 14px; border-bottom: 1px solid var(--color-accent,#1affd5); }
      #nftf-modal .footer { border-bottom: 0; border-top: 1px solid var(--color-accent,#1affd5); display:flex; justify-content:flex-end; gap:8px; }
      #nftf-modal .body { padding: 12px; overflow:auto; display:grid; gap:12px; }
      #nftf-toast { position: fixed; bottom: 18px; left: 50%; transform: translate(-50%, 20px); opacity: 0; padding: 10px 14px; border-radius: 12px; background: #000; border:1px solid var(--color-accent,#1affd5); color: var(--color-highlight,#00f0ff); box-shadow: 0 0 12px rgba(0,255,204,.3); transition: all .18s ease; z-index: 80; pointer-events: none; }
      #nftf-toast.show { opacity: 1; transform: translate(-50%, 0); }
      @media (max-width: 900px){ #nftf-rightpanel{ right:0; left:0; width:auto; height: 62vh; top:auto; bottom:0; transform: translateY(64vh); } #nftf-rightpanel.open{ transform: translateY(0); } }
    `;
    document.head.appendChild(style);
  };

  const createRoot = (containerId) => {
    let root;
    if (containerId) {
      root = document.getElementById(containerId);
      if (!root) { root = document.createElement("div"); root.id = containerId; document.body.appendChild(root); }
    } else {
      root = document.createElement("div");
      root.id = "nft-farm-root";
      document.body.appendChild(root);
    }

    root.innerHTML = `
      <div id="nftf-root" class="form-card">
        <h2 class="app-title" style="margin:0 0 .25rem 0;">${escapeHtml(DEFAULTS.appTitle)}</h2>
        <div class="app-subtitle" style="margin:0 0 1rem 0;">Hourly distributions run automatically if a remaining reward balance is deposited by the farm creator.</div>

        <div class="nftf-bar">
          <div class="row">
            <input id="nftf-api" class="form-input" placeholder="API base (e.g. https://api.example.com)" style="max-width:360px;">
            <input id="nftf-collection" class="form-input" placeholder="collection_name (e.g. cryptochaos1)" style="max-width:240px;">
            <button id="nftf-load" class="btn btn-primary">Load</button>
          </div>
          <div class="row">
            <input id="nftf-search" class="form-input" placeholder="Search by Template ID or Name..." style="flex:1; min-width:240px;">
            <select id="nftf-schema-filter" class="form-input" style="max-width:240px;"><option value="">All Schemas</option></select>
            <button id="nftf-expand" class="btn btn-secondary">Collapse all</button>
            <button id="nftf-tokens" class="btn">Manage deposit tokens</button>
          </div>
          <div class="row">
            <button id="nftf-select-all" class="btn">Select all</button>
            <button id="nftf-clear" class="btn">Clear selection</button>
            <div class="nftf-meta">
              <span id="nftf-meta">Ready</span>
              <span id="nftf-count-schemas"></span>
              <span id="nftf-count-templates"></span>
              <span id="nftf-count-selected"></span>
            </div>
          </div>
        </div>

        <div id="nftf-status" style="margin:10px 0;"></div>
        <div id="nftf-sections" class="nftf-sections"></div>
      </div>

      <aside id="nftf-rightpanel" aria-label="Rewards selection panel">
        <header>
          <strong>Rewards — Selection</strong>
          <span id="nftf-rp-count" style="margin-left:auto;">0</span>
          <button id="nftf-rp-close" class="btn">Close</button>
        </header>
        <div id="nftf-rp-body" class="body">
          <div class="meta">No template selected.</div>
        </div>
        <footer>
          <button id="nftf-rp-copy" class="btn">Copy JSON</button>
          <button id="nftf-rp-download" class="btn">Download JSON</button>
          <button id="nftf-rp-emit" class="btn btn-primary">Emit event</button>
        </footer>
      </aside>

      <div id="nftf-modal" aria-hidden="true">
        <div class="backdrop"></div>
        <div class="dialog">
          <header><strong>Deposit tokens catalog</strong></header>
          <div class="body">
            <div style="display:grid; grid-template-columns: 2fr 1fr 100px auto; gap:8px; align-items:center;">
              <input id="tok-contract" class="form-input" placeholder="Token contract (e.g. eosio.token)">
              <input id="tok-symbol" class="form-input" placeholder="Symbol (e.g. WAX)">
              <input id="tok-dec" class="form-input" type="number" min="0" max="18" step="1" placeholder="Decimals">
              <button id="tok-add" class="btn btn-secondary">Add</button>
            </div>
            <div id="tok-list" style="display:grid; gap:8px;"></div>
          </div>
          <div class="footer">
            <button id="tok-close" class="btn">Close</button>
          </div>
        </div>
      </div>
    `;
    return root;
  };

  const fetchTemplatesBySchema = async (apiBaseUrl, collection) => {
    const url = `${apiBaseUrl.replace(/\/+$/,'')}${DEFAULTS.endpointPath}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collection_name: collection })
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} — ${txt || res.statusText}`);
    }
    return res.json();
  };

  const numeric = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
  const percent = (issued, max) => {
    const i = numeric(issued), m = numeric(max);
    if (i === null || m === null || !isFinite(i) || !isFinite(m) || m <= 0) return null;
    return Math.min(100, Math.max(0, (i / m) * 100));
  };

  const renderStatus = (el, state, msg = "") => {
    if (!el) return;
    if (state === "loading") {
      el.innerHTML = `<div class="meta" style="text-align:center;">Loading...</div>`;
    } else if (state === "error") {
      el.innerHTML = `<div class="meta" style="text-align:center;color:var(--color-danger,#ff00ff);">⚠️ ${escapeHtml(msg)}</div>`;
    } else {
      el.innerHTML = "";
    }
  };

  const schemaSectionId = (schema) => `nftf-sec-${schema.replace(/[^a-z0-9]+/gi, "-")}`;

  const thSortable = (label, key) => `<th class="sortable" data-key="${key}" aria-sort="none"><span>${label}</span></th>`;

  const rowHtml = (schemaName, t, state) => {
    const selKey = selectionKey(state.collection, schemaName, t.template_id);
    const isChecked = !!state.selection[selKey];
    const p = percent(t.circulating_supply, t.max_supply);
    const pctStr = p === null ? "—" : `${p.toFixed(1)}%`;
    return `
      <tr data-tid="${t.template_id}">
        <td><input type="checkbox" class="nftf-row-check" ${isChecked ? "checked" : ""}></td>
        <td><button class="nftf-id-btn" title="Copy ID">${t.template_id}</button></td>
        <td>${escapeHtml(t.template_name || "—")}</td>
        <td>${Number.isFinite(+t.circulating_supply) ? Number(t.circulating_supply).toLocaleString() : "0"}</td>
        <td>${t.max_supply == null ? "—" : Number(t.max_supply).toLocaleString()}</td>
        <td>${pctStr}</td>
      </tr>
    `;
  };

  const sectionHtml = (schemaObj, state) => {
    const sid = schemaSectionId(schemaObj.schema_name);
    const openAttr = state.expandAll ? " open" : "";
    return `
      <details class="form-card"${openAttr} id="${sid}" style="padding:0;">
        <summary style="display:flex; align-items:center; gap:10px; padding:12px 14px; cursor:pointer;">
          <span><strong>${escapeHtml(schemaObj.schema_name)}</strong></span>
          <span class="meta" style="opacity:.9;">${schemaObj.templates.length}</span>
          <span style="margin-left:auto; display:flex; gap:8px;">
            <button class="btn nftf-sec-select-all">Select schema</button>
            <button class="btn nftf-sec-clear">Clear</button>
          </span>
        </summary>
        <div class="nftf-tablewrap">
          <table class="nftf-table" data-schema="${escapeHtml(schemaObj.schema_name)}">
            <thead>
              <tr>
                <th style="width:42px;"><input type="checkbox" class="nftf-head-check" title="Select visible"></th>
                ${thSortable("ID", "template_id")}
                ${thSortable("Name", "template_name")}
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

    $("#nftf-count-schemas").textContent = `Schemas: ${totalSchemas}`;
    $("#nftf-count-templates").textContent = `Templates: ${totalTemplates}`;

    if (totalTemplates === 0) {
      sectionsEl.innerHTML = `<div class="meta" style="text-align:center; opacity:.9;">No results. Try changing search or filter.</div>`;
      return;
    }

    sectionsEl.innerHTML = filteredSchemas.map(s => sectionHtml(s, state)).join("");
    filteredSchemas.forEach(s => bindSectionInteractions(s, state, collection));
  };

  const sortTable = (table, key) => {
    const tbody = table.tBodies[0];
    const rows = Array.from(tbody.rows);
    const th = $(`thead th[data-key="${key}"]`, table);
    const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
    $$("thead th.sortable", table).forEach(x => x.setAttribute("aria-sort", "none"));
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");

    const getVal = (tr) => {
      if (key === "template_id") return Number(tr.children[1].textContent.trim());
      if (key === "template_name") return tr.children[2].textContent.trim().toLowerCase();
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

  const bindSectionInteractions = (schemaObj, state, collection) => {
    const sid = schemaSectionId(schemaObj.schema_name);
    const section = document.getElementById(sid);
    const table = $("table.nftf-table", section);
    const headCheck = $(".nftf-head-check", section);
    const btnSelAll = $(".nftf-sec-select-all", section);
    const btnClear = $(".nftf-sec-clear", section);

    $$("thead th.sortable", table).forEach(th => {
      th.addEventListener("click", () => sortTable(table, th.dataset.key));
    });

    $$("#" + sid + " .nftf-id-btn").forEach(btn => {
      btn.addEventListener("click", () => copyToClipboard(btn.textContent.trim()));
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

  const selectionKey = (collection, schema, tid) => `${collection}::${schema}::${tid}`;

  const loadJSON = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback)); } catch { return fallback; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const loadSelection = () => loadJSON(DEFAULTS.storageKeySel, {});
  const saveSelection = (sel) => saveJSON(DEFAULTS.storageKeySel, sel);

  const loadTokens = () => loadJSON(DEFAULTS.storageKeyTokens, []);
  const saveTokens = (arr) => saveJSON(DEFAULTS.storageKeyTokens, arr);

  const loadRewardsPerToken = () => loadJSON(DEFAULTS.storageKeyRewardsPerToken, {});
  const saveRewardsPerToken = (map) => saveJSON(DEFAULTS.storageKeyRewardsPerToken, map);

  const loadExpiry = () => loadJSON(DEFAULTS.storageKeyExpiry, {});
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

  const updateSelectionUI = (state) => {
    const selected = Object.values(state.selection).filter(x => x.collection === state.collection);
    $("#nftf-count-selected").textContent = `Selected: ${selected.length}`;
    $("#nftf-rp-count").textContent = String(selected.length);

    const panel = $("#nftf-rightpanel");
    const body = $("#nftf-rp-body");
    if (selected.length === 0) {
      body.innerHTML = `<div class="meta">No template selected.</div>`;
      panel.classList.remove("open");
      return;
    }

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

    body.innerHTML = selected.map(x => {
      const { template_name, circulating_supply, max_supply } = enrich(x.schema_name, x.template_id);
      const key = selectionKey(x.collection, x.schema_name, x.template_id);

      const prevISO = state.expiry[key] || "";
      const minISO = toDatetimeLocal(nowPlusMinutes(5));

      const tokenChips = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const active = !!(state.rewardsPerToken[key] && state.rewardsPerToken[key][id] !== undefined);
        return `<label class="nftf-chip ${active ? "active" : ""}" data-token="${id}">
          <input type="checkbox" ${active ? "checked" : ""}>
          <span>${escapeHtml(t.symbol)}</span><small class="meta">@${escapeHtml(t.contract)}</small>
        </label>`;
      }).join("");

      const rewardsRows = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const val = (state.rewardsPerToken[key] && state.rewardsPerToken[key][id] !== undefined) ? state.rewardsPerToken[key][id] : "";
        const active = val !== "" && val !== undefined;
        return `<div class="row nftf-reward-row" data-token="${id}" style="${active ? "" : "display:none;"}">
          <span class="meta">${escapeHtml(t.symbol)} <small>@${escapeHtml(t.contract)}</small></span>
          <input type="number" step="0.0001" min="0" class="reward-input" placeholder="Reward / holding" value="${val}">
        </div>`;
      }).join("");

      return `
        <div class="item" data-key="${key}">
          <div class="row">
            <strong>${escapeHtml(x.schema_name)}</strong>
            <span class="meta">ID <button class="nftf-id-btn">${x.template_id}</button></span>
          </div>
          <div class="row">
            <div class="meta" title="${escapeHtml(template_name || "—")}">${escapeHtml(template_name || "—")}</div>
            <button class="btn nftf-rp-remove">Remove</button>
          </div>
          <div class="row"><span class="meta">Circ: ${Number(circulating_supply).toLocaleString()} — Max: ${max_supply == null ? "—" : Number(max_supply).toLocaleString()}</span></div>

          <div class="row" style="flex-direction:column; align-items:flex-start; gap:8px;">
            <label class="meta"><strong>Expiration (max validity)</strong></label>
            <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
              <input type="datetime-local" class="dt-input nftf-expiry" min="${minISO}" value="${prevISO ? toDatetimeLocal(new Date(prevISO)) : ""}">
              <button class="btn nftf-extend-7">+7 days</button>
              <button class="btn nftf-extend-30">+30 days</button>
            </div>
            <div class="meta">This is the <strong>maximum duration</strong> (extendable, <u>not reducible</u>) to consider asset IDs of this template for hourly distributions, provided a remaining reward balance exists.</div>
          </div>

          <div class="row" style="flex-direction:column; align-items:flex-start; gap:6px;">
            <label class="meta"><strong>Reward tokens</strong> — creators can deposit multiple tokens and choose which ones to use per template.</label>
            <div class="nftf-token-chips">${tokenChips || '<div class="meta">No tokens configured. Add from "Manage deposit tokens".</div>'}</div>
            <div class="nftf-token-inputs" style="width:100%;">${rewardsRows}</div>
          </div>
        </div>
      `;
    }).join("");

    $$("#nftf-rp-body .nftf-id-btn").forEach(b => b.addEventListener("click", () => copyToClipboard(b.textContent.trim())));
    $$("#nftf-rp-body .nftf-rp-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".item");
        const key = item.dataset.key;
        const obj = state.selection[key];
        if (!obj) return;
        const sid = schemaSectionId(obj.schema_name);
        const row = $(`#${sid} tr[data-tid="${obj.template_id}"]`);
        if (row) { const chk = $(".nftf-row-check", row); if (chk) chk.checked = false; }
        delete state.selection[key];
        delete state.rewardsPerToken[key];
        delete state.expiry[key];
        saveSelection(state.selection);
        saveRewardsPerToken(state.rewardsPerToken);
        saveExpiry(state.expiry);
        updateSelectionUI(state);
      });
    });

    $$("#nftf-rp-body .nftf-expiry").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const item = e.target.closest(".item");
        const key = item.dataset.key;
        const newDate = parseDatetimeLocal(e.target.value);
        if (!newDate) {
          delete state.expiry[key];
          saveExpiry(state.expiry);
          return;
        }
        const prev = state.expiry[key] ? new Date(state.expiry[key]) : null;
        if (prev && newDate < prev) {
          e.target.value = toDatetimeLocal(prev);
          toast("Expiration can only be extended, not reduced.");
          return;
        }
        state.expiry[key] = newDate.toISOString();
        saveExpiry(state.expiry);
      });
    });

    $$("#nftf-rp-body .nftf-extend-7").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".item");
        const key = item.dataset.key;
        const inp = $(".nftf-expiry", item);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base); d.setDate(d.getDate() + 7);
        state.expiry[key] = d.toISOString();
        inp.value = toDatetimeLocal(d);
        saveExpiry(state.expiry);
      });
    });
    $$("#nftf-rp-body .nftf-extend-30").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const item = e.target.closest(".item");
        const key = item.dataset.key;
        const inp = $(".nftf-expiry", item);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base); d.setDate(d.getDate() + 30);
        state.expiry[key] = d.toISOString();
        inp.value = toDatetimeLocal(d);
        saveExpiry(state.expiry);
      });
    });

    $$("#nftf-rp-body .nftf-token-chips .nftf-chip").forEach(chip => {
      chip.addEventListener("click", (e) => {
        const item = e.target.closest(".item");
        const key = item.dataset.key || item.getAttribute("data-key") || item.closest(".item").dataset.key;
        const tokenId = chip.dataset.token;
        chip.classList.toggle("active");
        const active = chip.classList.contains("active");
        state.rewardsPerToken[key] = state.rewardsPerToken[key] || {};
        if (active) {
          if (state.rewardsPerToken[key][tokenId] === undefined) state.rewardsPerToken[key][tokenId] = "";
        } else {
          delete state.rewardsPerToken[key][tokenId];
        }
        saveRewardsPerToken(state.rewardsPerToken);
        const row = $(`.nftf-reward-row[data-token="${CSS.escape(tokenId)}"]`, item);
        if (row) row.style.display = active ? "" : "none";
      });
    });

    $$("#nftf-rp-body .nftf-token-inputs .nftf-reward-row .reward-input").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const item = e.target.closest(".item");
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
          reward_per_holding: Number(val)
        });
      });

      return {
        schema_name: x.schema_name,
        template_id: Number(x.template_id),
        template_name: tpl.template_name || null,
        circulating_supply: Number(tpl.circulating_supply || 0),
        max_supply: (tpl.max_supply === undefined ? null : tpl.max_supply),
        expiry,
        rewards
      };
    });

    return {
      collection: state.collection,
      policy: {
        distribution: "hourly",
        expiry_semantics: "Expiration is a maximum window: can be extended but not reduced.",
        deposit_required: "Distributions occur only if a remaining reward balance exists."
      },
      tokens_catalog: state.tokens,
      total_selected: items.length,
      items
    };
  };

  const openTokensModal = () => $("#nftf-modal").classList.add("open");
  const closeTokensModal = () => $("#nftf-modal").classList.remove("open");

  const renderTokensList = (state) => {
    const list = $("#tok-list");
    if (!state.tokens.length) {
      list.innerHTML = `<div class="meta">No tokens configured.</div>`;
      return;
    }
    list.innerHTML = state.tokens.map(t => `
      <div class="form-card" data-id="${t.contract}:${t.symbol}" style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 10px;">
        <div class="meta"><strong>${escapeHtml(t.symbol)}</strong> <span style="opacity:.85">@${escapeHtml(t.contract)}</span> <span style="opacity:.7">dec:${t.decimals ?? "—"}</span></div>
        <button class="btn btn-secondary nftf-token-del">Remove</button>
      </div>
    `).join("");

    $$("#tok-list .nftf-token-del").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const pill = e.target.closest("[data-id]");
        const [contract, symbol] = pill.dataset.id.split(":");
        state.tokens = state.tokens.filter(x => !(x.contract === contract && x.symbol === symbol));
        saveTokens(state.tokens);
        Object.keys(state.rewardsPerToken).forEach(k => {
          if (state.rewardsPerToken[k]) delete state.rewardsPerToken[k][`${contract}:${symbol}`];
        });
        saveRewardsPerToken(state.rewardsPerToken);
        renderTokensList(state);
        updateSelectionUI(state);
      });
    });
  };

  function initManageNFTsFarm(opts = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    injectStyles();
    const root = createRoot(cfg.containerId);

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

    const state = {
      apiBaseUrl: cfg.apiBaseUrl || location.origin,
      collection: "",
      raw: null,
      search: "",
      schemaFilter: "",
      expandAll: true,
      selection: loadSelection(),
      tokens: loadTokens(),
      rewardsPerToken: loadRewardsPerToken(),
      expiry: loadExpiry()
    };

    elApi.value = state.apiBaseUrl;

    const doLoad = async () => {
      const apiBaseUrl = elApi.value.trim();
      const collection = elCollection.value.trim();
      if (!apiBaseUrl || !collection) { toast("Fill API base and collection_name"); return; }
      state.apiBaseUrl = apiBaseUrl;
      state.collection = collection;
      state.search = "";
      state.schemaFilter = "";
      state.expandAll = true;

      renderStatus(elStatus, "loading");
      elMeta.textContent = "Loading...";
      elSections.innerHTML = "";

      try {
        const data = await fetchTemplatesBySchema(state.apiBaseUrl, collection);
        state.raw = data;

        const options = (data.schemas || []).map(s => `<option value="${escapeHtml(s.schema_name)}">${escapeHtml(s.schema_name)}</option>`).join("");
        elSchemaFilter.innerHTML = `<option value="">All Schemas</option>${options}`;

        const totalSchemas = (data.schemas || []).length;
        const totalTemplates = (data.schemas || []).reduce((acc, s) => acc + (s.templates?.length || 0), 0);
        elMeta.textContent = `Collection: ${data.collection} — Schemas ${totalSchemas} — Templates ${totalTemplates}`;

        renderStatus(elStatus, "ready");
        $("#nftf-expand").textContent = "Collapse all";
        renderSections(elSections, data, state);
        updateSelectionUI(state);
      } catch (err) {
        renderStatus(elStatus, "error", String(err.message || err));
        elMeta.textContent = "Error";
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
      elExpand.textContent = state.expandAll ? "Collapse all" : "Expand all";
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
      toast("Event emitted: nftFarm:rewardsDraft");
    });

    elTokensBtn.addEventListener("click", () => { openTokensModal(); renderTokensList(state); });
    $(".backdrop", modal).addEventListener("click", closeTokensModal);
    tokClose.addEventListener("click", closeTokensModal);
    tokAdd.addEventListener("click", () => {
      const contract = tokContract.value.trim();
      const symbol = tokSymbol.value.trim().toUpperCase();
      const decimals = tokDec.value === "" ? null : Number(tokDec.value);
      if (!contract || !symbol) { toast("Enter contract and symbol"); return; }
      if (state.tokens.some(t => t.contract === contract && t.symbol === symbol)) { toast("Token already exists"); return; }
      state.tokens.push({ contract, symbol, decimals });
      saveTokens(state.tokens);
      tokContract.value = ""; tokSymbol.value = ""; tokDec.value = "";
      renderTokensList(state);
      updateSelectionUI(state);
    });

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

  window.initManageNFTsFarm = initManageNFTsFarm;
})();
