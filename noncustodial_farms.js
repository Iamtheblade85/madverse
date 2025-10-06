/* noncustodial_farms.js
 * Manage Non-Custodial NFTs Farm — UI/logic (single file)
 * - Nessun input “API base”: usa opts.apiBaseUrl -> window.BASE_URL || window.API_BASE || location.origin
 * - Legge i saldi utente da window.twitchWalletBalances & window.telegramWalletBalances
 * - Rewards definiti per asset_id per giorno
 * - Salva regole al backend (Emit), poi aggiorna saldi Farm-Wallet con monitor opzionale
 * - NUOVO: Top-up diretto dal Twitch/Telegram Wallet via backend; se non ci sono fondi mostra istruzioni di deposito con memo
 * - UI guidata, moderna, coerente con stile cyber/glow
 */

(function () {
  // ---------- Config ----------
  const DEFAULTS = {
    apiBaseUrl: "",
    endpoints: {
      templatesBySchema: "/api/templates-by-schema",
      saveRewards: "/api/farm/rewards/draft",
      farmBalances: "/api/farm/deposit/balances",
      // NEW: top-up dal wallet utente verso Farm-Wallet, gestito dal backend
      // body atteso: { creator_wax_account, source: "twitch"|"telegram", token_symbol, token_contract?, amount }
      // risposta: { ok: true, tx_id?, balances?: {twitch:[...], telegram:[...]}, farm_balances?: [...] }
      depositToFarm: "/api/farm/deposit",
    },
    containerId: null,
    appTitle: "Manage Non-Custodial NFTs Farm",
    farmWalletAccount: "xcryptochips",
    farmWalletMemoTelegram: "deposit token",
    farmWalletMemoTwitch: "deposit twitch",
    autoMonitorEverySec: 120,
    ls: {
      selection: "ncf.selection.v1",
      tokens: "ncf.tokens.v1",
      rewardsPerToken: "ncf.rewardsPerToken.v1",
      expiry: "ncf.expiry.v1",
      lastCollection: "ncf.lastCollection.v1",
    },
  };

  // ---------- Small helpers ----------
  const $ = (sel, parent = document) => parent.querySelector(sel);
  const $$ = (sel, parent = document) => Array.from(parent.querySelectorAll(sel));
  const once = (fn) => { let r; return (...a) => (r ??= fn(...a)); };
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const num = (v, d = 0) => (v === null || v === undefined || v === "" || isNaN(+v) ? d : +v);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const escapeHtml = (s) => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");

  const readLS = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback)); } catch { return fallback; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  const toast = (() => {
    let timer = null;
    return (msg, kind = "info") => {
      let t = $("#ncf-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "ncf-toast";
        t.setAttribute("role","status");
        document.body.appendChild(t);
      }
      t.textContent = msg;
      t.dataset.kind = kind;
      t.classList.add("show");
      clearTimeout(timer);
      timer = setTimeout(() => t.classList.remove("show"), 2400);
    };
  })();

  const apiBase = (cfg) =>
    cfg.apiBaseUrl || window.BASE_URL || window.API_BASE || location.origin;

  const buildUrl = (base, path) => `${String(base).replace(/\/+$/,"")}${path}`;
  const getWax = () => (window.userData?.wax_account || "").trim();

  const nowPlusMinutes = (m) => { const d = new Date(); d.setMinutes(d.getMinutes() + m); return d; };
  const toDatetimeLocal = (d) => {
    const pad = (n) => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const parseLocalDT = (v) => { const d = new Date(v); return isNaN(d.getTime()) ? null : d; };

  // ---------- Minimal style (solo layout/leggibilità + toasts; il glow viene dal CSS globale) ----------
  const injectStyles = once(() => {
    const css = `
      #ncf-root .cy-card{background:rgba(12,16,22,.66);border:1px solid rgba(0,255,200,.18);border-radius:14px;box-shadow:0 0 22px rgba(0,255,200,.08),inset 0 0 0 1px rgba(255,255,255,.03);color:#e6eef8}
      #ncf-root .muted{color:rgba(230,238,248,.75)}
      #ncf-root .soft{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px}
      #ncf-root .row{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
      #ncf-root .col{display:grid;gap:.5rem}
      #ncf-root .grid{display:grid;gap:12px}
      #ncf-root .grid-2{grid-template-columns:1fr 1fr}
      #ncf-root .grid-3{grid-template-columns:repeat(3,1fr)}
      #ncf-root .w-100{width:100%}
      #ncf-root .badge{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .6rem;border-radius:999px;font-size:.85rem;border:1px solid rgba(255,255,255,.08)}
      #ncf-root .badge.ok{color:#22e4b6;background:rgba(34,228,182,.12)}
      #ncf-root .badge.warn{color:#f8c555;background:rgba(248,197,85,.12)}
      #ncf-root .badge.err{color:#ff7b7b;background:rgba(255,123,123,.12)}
      #ncf-root .btn{cursor:pointer;border-radius:999px;padding:.6rem 1rem;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(20,28,36,.9),rgba(10,14,18,.9));color:#e6eef8}
      #ncf-root .btn:focus{outline:none;box-shadow:0 0 0 2px rgba(0,255,200,.35)}
      #ncf-root .btn[disabled]{opacity:.6;cursor:not-allowed}
      #ncf-root .btn-primary{border-color:transparent;background:linear-gradient(180deg,rgba(0,255,200,.9),rgba(0,196,255,.9));color:#001418;font-weight:800}
      #ncf-root .btn-ghost{background:transparent}
      #ncf-root .btn-danger{border-color:rgba(255,0,90,.4);background:linear-gradient(180deg,rgba(255,0,90,.12),rgba(255,0,90,.08));color:#ffc4d8}
      #ncf-root .chip{display:inline-flex;gap:.5rem;align-items:center;padding:.45rem .7rem;border-radius:999px;border:1px dashed rgba(255,255,255,.14);cursor:pointer}
      #ncf-root .chip.active{border-color:rgba(0,255,200,.5);box-shadow:0 0 14px rgba(0,255,200,.15);color:#a7ffeb}
      #ncf-root .input,#ncf-root .select{height:40px;padding:0 .8rem;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(10,14,18,.8);color:#e6eef8}
      #ncf-root table{width:100%;border-collapse:separate;border-spacing:0;font-size:.95rem}
      #ncf-root thead th{position:sticky;top:0;padding:.6rem .8rem;text-align:left;background:rgba(10,14,18,.95);border-bottom:1px solid rgba(255,255,255,.08);user-select:none;cursor:pointer}
      #ncf-root tbody td{padding:.6rem .8rem;border-bottom:1px dashed rgba(255,255,255,.08)}
      #ncf-root tbody tr:hover{background:rgba(255,255,255,.03)}
      #ncf-toast{position:fixed;bottom:18px;left:50%;transform:translate(-50%,18px);opacity:0;background:rgba(12,16,22,.92);border:1px solid rgba(0,255,200,.25);color:#e6eef8;padding:.55rem .9rem;border-radius:12px;box-shadow:0 0 18px rgba(0,255,200,.15);z-index:9999;transition:all .18s ease}
      #ncf-toast.show{opacity:1;transform:translate(-50%,0)}
      #ncf-toast[data-kind="error"]{border-color:rgba(255,0,90,.35);box-shadow:0 0 18px rgba(255,0,90,.18)}
      #ncf-rightpanel{position:sticky;top:1rem;align-self:flex-start;min-width:340px;max-width:420px}
      #ncf-root h2,#ncf-root h3,#ncf-root h4{color:#f2fbff;text-shadow:0 0 6px rgba(0,255,200,.12)}
      #ncf-root small,#ncf-root .help{color:rgba(230,238,248,.75)}
      #ncf-topup .note{font-size:.9rem}
    `;
    const s = document.createElement("style");
    s.id = "ncf-styles";
    s.textContent = css;
    document.head.appendChild(s);
  });

  // ---------- Data adapters ----------
  const twitchBalances = () => Array.isArray(window.twitchWalletBalances) ? window.twitchWalletBalances : [];
  const telegramBalances = () => Array.isArray(window.telegramWalletBalances) ? window.telegramWalletBalances : [];

  const sumHoldingsFromDom = () => {
    const a = twitchBalances();
    const b = telegramBalances();
    const map = new Map();
    const add = (arr) => {
      arr.forEach(({ symbol, amount }) => {
        if (!symbol) return;
        const v = num(amount, 0);
        map.set(symbol, num(map.get(symbol), 0) + v);
      });
    };
    add(a); add(b);
    return map; // Map<symbol, totalAmount>
  };

  const fetchJson = async (url, init) => {
    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(()=> "");
      throw new Error(`HTTP ${res.status} — ${text || res.statusText}`);
    }
    return res.json();
  };

  const postJson = (url, body) =>
    fetchJson(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });

  // ---------- UI builders ----------
  const selectionKey = (collection, schema, tid) => `${collection}::${schema}::${tid}`;

  const percent = (issued, max) => {
    const i = num(issued, 0), m = num(max, 0);
    if (!isFinite(i) || !isFinite(m) || m <= 0) return "—";
    return `${clamp((i/m)*100, 0, 100).toFixed(1)}%`;
  };

  const renderSkeleton = (el) => {
    el.innerHTML = `
      <div class="soft" style="padding:1rem; text-align:center;">
        <div style="height:12px; width:240px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div>
        <div style="height:12px; width:320px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div>
      </div>`;
  };

  function createLayout(root, cfg) {
    root.innerHTML = `
      <div id="ncf-root" class="grid" style="grid-template-columns: 1fr minmax(340px,420px); gap:18px;">
        <div id="ncf-main" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:16px 16px 12px;">
            <h2 class="section-title" style="margin:0 0 .25rem 0;">${escapeHtml(DEFAULTS.appTitle)}</h2>
            <p class="muted" style="margin:.25rem 0 0;">
              Daily distributions run <strong>automatically</strong> and only if a <strong>remaining reward balance</strong> is deposited by the farm creator.
            </p>
            <div class="row" style="margin-top:12px; align-items:flex-end;">
              <div class="col" style="min-width:260px;">
                <label class="muted" for="ncf-collection"><small>Collection name</small></label>
                <input id="ncf-collection" class="input" placeholder="e.g. cryptochaos1" />
              </div>
              <button id="ncf-load" class="btn btn-primary">Load</button>
              <div class="badge" id="ncf-meta">Ready</div>
            </div>
            <div class="row" style="margin-top:10px;">
              <div class="col w-100">
                <input id="ncf-search" class="input" placeholder="Search by Template ID or Name…" />
              </div>
              <div class="col">
                <select id="ncf-schema" class="select">
                  <option value="">All schemas</option>
                </select>
              </div>
              <button id="ncf-expand" class="btn btn-ghost">Expand all</button>
              <button id="ncf-manage-tokens" class="btn btn-ghost">Manage deposit tokens</button>
            </div>
          </section>

          <section class="cy-card" style="padding:0;">
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid rgba(255,255,255,.08);">
              <h3 style="margin:0;">Step 2 — Pick templates</h3>
              <div>
                <button id="ncf-select-all" class="btn btn-ghost">Select all</button>
                <button id="ncf-clear" class="btn btn-ghost">Clear</button>
              </div>
            </div>
            <div id="ncf-table-wrap" style="overflow:auto; max-height:54vh;">
              <div id="ncf-status" style="padding:14px;"></div>
              <div id="ncf-sections"></div>
            </div>
            <div style="padding:10px 14px; border-top:1px solid rgba(255,255,255,.08); display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
              <span class="badge" id="ncf-count-schemas">Schemas: 0</span>
              <span class="badge" id="ncf-count-templates">Templates: 0</span>
              <span class="badge ok" id="ncf-count-selected">Selected: 0</span>
            </div>
          </section>
        </div>

        <aside id="ncf-rightpanel" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:14px;">
            <h3 style="margin:.1rem 0 .5rem;">Step 3 — Configure rewards</h3>
            <p class="help" style="margin-top:0;">
              Rewards are <strong>per asset</strong> and <strong>per day</strong>. Set a <em>max validity</em> (can be extended, not shortened) and pick which tokens fund each template’s daily reward.
            </p>
            <div id="ncf-rp-body" class="grid" style="gap:10px;">
              <div class="soft" style="padding:12px; text-align:center;">No templates selected yet.</div>
            </div>
          </section>

          <section class="cy-card" style="padding:14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
              <h3 style="margin:.1rem 0 .5rem;">Step 4 — Fund & monitor</h3>
              <div class="row" style="gap:8px;">
                <button id="ncf-refresh-farm" class="btn btn-ghost">Refresh balances</button>
                <label class="chip" style="user-select:none;">
                  <input id="ncf-auto-monitor" type="checkbox" style="position:absolute; opacity:0; pointer-events:none;" />
                  Auto-monitor
                </label>
              </div>
            </div>

            <!-- NEW: Top-up panel -->
            <div id="ncf-topup" class="soft" style="padding:12px; display:grid; gap:8px;">
              <div class="row">
                <select id="ncf-topup-source" class="select" style="min-width:180px;">
                  <option value="twitch">From Twitch Wallet</option>
                  <option value="telegram">From Telegram Wallet</option>
                </select>
                <select id="ncf-topup-token" class="select" style="min-width:160px;">
                  <option value="">Select token…</option>
                </select>
                <div class="row" style="gap:.5rem;">
                  <input id="ncf-topup-amount" class="input" type="number" step="0.0001" min="0" placeholder="Amount" style="width:140px;" />
                  <button id="ncf-topup-max" class="btn btn-ghost">MAX</button>
                </div>
                <button id="ncf-topup-submit" class="btn">Deposit to Farm-Wallet</button>
              </div>
              <div id="ncf-topup-balhint" class="note muted">Balance: —</div>
              <div id="ncf-topup-empty" class="soft" style="display:none; padding:10px;">
                <div class="badge warn">No available balance on this wallet</div>
                <p class="help" style="margin:.5rem 0 0;">
                  To add funds to your selected wallet, send tokens to <strong>${escapeHtml(DEFAULTS.farmWalletAccount)}</strong>:
                </p>
                <ul class="help" style="margin:.3rem 0 0 1rem;">
                  <li><strong>Twitch Wallet</strong> memo: <code>${escapeHtml(DEFAULTS.farmWalletMemoTwitch)}</code></li>
                  <li><strong>Telegram Wallet</strong> memo: <code>${escapeHtml(DEFAULTS.farmWalletMemoTelegram)}</code></li>
                </ul>
                <div class="row" style="margin-top:8px;">
                  <button id="ncf-copy-account-2" class="btn btn-ghost">Copy account</button>
                  <button id="ncf-copy-memo-tw" class="btn btn-ghost">Copy Twitch memo</button>
                  <button id="ncf-copy-memo-tg" class="btn btn-ghost">Copy Telegram memo</button>
                </div>
              </div>
            </div>

            <div id="ncf-farm-alert" style="display:none; margin:10px 0;" class="soft">
              <div style="padding:10px;">
                <div class="badge err">Farm-Wallet has no available tokens for some active rewards</div>
                <p class="help" style="margin:.5rem 0 0;">
                  Use the top-up panel above or deposit from your external wallet if needed.
                </p>
              </div>
            </div>

            <div class="soft" style="padding:10px;">
              <table>
                <thead>
                  <tr>
                    <th>Token</th>
                    <th>Farm-Wallet balance</th>
                    <th>Last update</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="ncf-farm-balances">
                  <tr><td colspan="4" style="text-align:center; padding:12px;">No data</td></tr>
                </tbody>
              </table>
            </div>
            <div class="help" id="ncf-user-hints" style="margin-top:10px;"></div>
          </section>

          <section class="cy-card" style="padding:14px;">
            <h3 style="margin:.1rem 0 .5rem;">Step 5 — Emit</h3>
            <p class="help" style="margin-top:0;">Save your farm settings to the backend. We will refresh balances right after.</p>
            <button id="ncf-emit" class="btn btn-primary w-100">Emit & Save</button>
          </section>
        </aside>
      </div>

      <!-- Tokens modal -->
      <div id="ncf-modal" style="display:none; position:fixed; inset:0; z-index:9998; align-items:center; justify-content:center;">
        <div class="backdrop" style="position:absolute; inset:0; background:rgba(0,0,0,.6);"></div>
        <div class="cy-card" style="position:relative; width:min(760px, 92vw); max-height:80vh; overflow:auto; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <h3 style="margin:0;">Manage deposit tokens</h3>
            <button class="btn btn-ghost" id="ncf-modal-close">Close</button>
          </div>
          <div class="grid" style="gap:10px; margin-top:10px;">
            <div class="soft" style="padding:10px;">
              <div class="row">
                <input id="ncf-tok-contract" class="input" placeholder="Token contract (e.g. eosio.token)" style="min-width:220px;" />
                <input id="ncf-tok-symbol" class="input" placeholder="Symbol (e.g. WAX)" style="width:140px;" />
                <input id="ncf-tok-dec" class="input" type="number" min="0" max="18" step="1" placeholder="Decimals" style="width:120px;" />
                <button id="ncf-tok-add" class="btn">Add token</button>
              </div>
              <p class="help" style="margin:.5rem 0 0;">Tip: tokens are sorted by what you already hold across Twitch/Telegram wallets.</p>
            </div>
            <div class="soft" style="padding:10px;">
              <div id="ncf-token-list" class="row" style="flex-wrap:wrap;"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ---------- Rendering: Schemas & Templates ----------
  function schemaSectionId(name) {
    return `ncf-sec-${name.replace(/[^a-z0-9]+/gi, "-")}`;
  }
  function th(label, key) { return `<th data-key="${key}" aria-sort="none">${label}</th>`; }
  function rowHtml(schemaName, t, checked) {
    const pct = percent(t.circulating_supply, t.max_supply);
    return `
      <tr data-tid="${t.template_id}">
        <td style="width:44px;"><input type="checkbox" class="ncf-row-check"${checked ? " checked" : ""}></td>
        <td><button class="btn btn-ghost ncf-id-btn" title="Copy ID" style="padding:.2rem .5rem;">${t.template_id}</button></td>
        <td>${escapeHtml(t.template_name || "—")}</td>
        <td>${fmt(t.circulating_supply)}</td>
        <td>${t.max_supply == null ? "—" : fmt(t.max_supply)}</td>
        <td>${pct}</td>
      </tr>`;
  }
  function sectionHtml(schema, state) {
    const sid = schemaSectionId(schema.schema_name);
    const open = state.expandAll ? " open" : "";
    return `
      <details class="ncf-section"${open} id="${sid}">
        <summary style="display:flex; align-items:center; gap:.6rem; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.08);">
          <span><strong>${escapeHtml(schema.schema_name)}</strong></span>
          <span class="badge">${schema.templates.length}</span>
          <div style="margin-left:auto;" class="row">
            <button class="btn btn-ghost ncf-sec-select-all">Select schema</button>
            <button class="btn btn-ghost ncf-sec-clear">Clear</button>
          </div>
        </summary>
        <div style="overflow:auto;">
          <table class="ncf-table" data-schema="${escapeHtml(schema.schema_name)}">
            <thead>
              <tr>
                <th style="width:44px;"><input type="checkbox" class="ncf-head-check" title="Select visible"></th>
                ${th("ID","template_id")}
                ${th("Name","template_name")}
                ${th("Circulating","circulating_supply")}
                ${th("Max","max_supply")}
                ${th("% Mint","pct")}
              </tr>
            </thead>
            <tbody>
              ${schema.templates.map(t => {
                const key = selectionKey(state.collection, schema.schema_name, t.template_id);
                return rowHtml(schema.schema_name, t, !!state.selection[key]);
              }).join("")}
            </tbody>
          </table>
        </div>
      </details>`;
  }
  function renderSections(el, data, state) {
    const search = (state.search || "").toLowerCase().trim();
    const filterSchema = state.schemaFilter || "";

    const filtered = (data.schemas || [])
      .filter(s => !filterSchema || s.schema_name === filterSchema)
      .map(s => {
        if (!search) return s;
        const ft = s.templates.filter(t => {
          const idMatch = String(t.template_id).includes(search);
          const nameMatch = (t.template_name || "").toLowerCase().includes(search);
          return idMatch || nameMatch;
        });
        return { ...s, templates: ft };
      })
      .filter(s => (s.templates || []).length > 0);

    const totalSchemas = filtered.length;
    const totalTemplates = filtered.reduce((acc, s) => acc + (s.templates?.length || 0), 0);

    $("#ncf-count-schemas").textContent = `Schemas: ${totalSchemas}`;
    $("#ncf-count-templates").textContent = `Templates: ${totalTemplates}`;

    if (!totalTemplates) {
      el.innerHTML = `<div class="soft" style="padding:14px; text-align:center;">No results. Try different filters.</div>`;
      return;
    }
    el.innerHTML = filtered.map(s => sectionHtml(s, state)).join("");
    filtered.forEach(s => bindSection(schemaSectionId(s.schema_name), s, state));
  }
  function bindSection(sid, schema, state) {
    const section = document.getElementById(sid);
    const table = $("table", section);
    const headCheck = $(".ncf-head-check", section);
    const btnSelAll = $(".ncf-sec-select-all", section);
    const btnClear = $(".ncf-sec-clear", section);

    // sort
    $$("thead th[data-key]", table).forEach(th => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        const dir = th.getAttribute("aria-sort") === "ascending" ? -1 : 1;
        $$("thead th[data-key]", table).forEach(x => x.setAttribute("aria-sort","none"));
        th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");

        const tbody = table.tBodies[0];
        const rows = Array.from(tbody.rows);
        const getVal = (tr) => {
          if (key === "template_id") return Number($(".ncf-id-btn", tr).textContent.trim());
          if (key === "template_name") return $(".ncf-id-btn", tr).parentElement.nextElementSibling.textContent.trim().toLowerCase();
          if (key === "circulating_supply") return Number(tr.children[3].textContent.replace(/[^\d]/g,"")) || 0;
          if (key === "max_supply") {
            const s = tr.children[4].textContent.trim();
            return s === "—" ? -1 : Number(s.replace(/[^\d]/g,"")) || 0;
          }
          if (key === "pct") {
            const s = tr.children[5].textContent.trim();
            return s === "—" ? -1 : Number(s.replace("%","")) || 0;
          }
          return 0;
        };
        rows.sort((a,b) => {
          const va = getVal(a), vb = getVal(b);
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });

    // copy id
    $$(".ncf-id-btn", section).forEach(btn => {
      btn.addEventListener("click", () => {
        navigator.clipboard.writeText(btn.textContent.trim()).then(() => toast("Template ID copied"));
      });
    });

    // row selection
    $$(".ncf-row-check", section).forEach(chk => {
      chk.addEventListener("change", (e) => {
        const tr = e.target.closest("tr");
        const tid = Number(tr.dataset.tid);
        setSelected(state, state.collection, schema.schema_name, tid, e.target.checked);
        updateRightPanel(state);
      });
    });

    // head select visible
    headCheck.addEventListener("change", (e) => {
      $$("tbody tr", table).forEach(r => {
        const chk = $(".ncf-row-check", r);
        if (!chk) return;
        const tid = Number(r.dataset.tid);
        chk.checked = e.target.checked;
        setSelected(state, state.collection, schema.schema_name, tid, e.target.checked);
      });
      updateRightPanel(state);
    });

    btnSelAll.addEventListener("click", () => {
      $$("tbody tr", table).forEach(r => {
        const chk = $(".ncf-row-check", r);
        if (!chk.checked) chk.checked = true;
        const tid = Number(r.dataset.tid);
        setSelected(state, state.collection, schema.schema_name, tid, true);
      });
      updateRightPanel(state);
    });

    btnClear.addEventListener("click", () => {
      $$("tbody tr", table).forEach(r => {
        const chk = $(".ncf-row-check", r);
        if (chk.checked) chk.checked = false;
        const tid = Number(r.dataset.tid);
        setSelected(state, state.collection, schema.schema_name, tid, false);
      });
      updateRightPanel(state);
    });
  }

  // ---------- Selection state ----------
  const loadSel = () => readLS(DEFAULTS.ls.selection, {});
  const saveSel = (s) => writeLS(DEFAULTS.ls.selection, s);
  const loadTokens = () => readLS(DEFAULTS.ls.tokens, []);
  const saveTokens = (arr) => writeLS(DEFAULTS.ls.tokens, arr);
  const loadRPT = () => readLS(DEFAULTS.ls.rewardsPerToken, {});       // { key: { "contract:symbol": "0.1" } }
  const saveRPT = (map) => writeLS(DEFAULTS.ls.rewardsPerToken, map);
  const loadExp = () => readLS(DEFAULTS.ls.expiry, {});                 // { key: ISO string }
  const saveExp = (map) => writeLS(DEFAULTS.ls.expiry, map);

  function setSelected(state, collection, schema, tid, on) {
    const key = selectionKey(collection, schema, tid);
    if (on) {
      state.selection[key] = { collection, schema_name: schema, template_id: tid };
    } else {
      delete state.selection[key];
      delete state.rewardsPerToken[key];
      delete state.expiry[key];
    }
    saveSel(state.selection);
    saveRPT(state.rewardsPerToken);
    saveExp(state.expiry);
    updateSelectedCount(state);
  }
  function updateSelectedCount(state) {
    const count = Object.values(state.selection).filter(x => x.collection === state.collection).length;
    $("#ncf-count-selected").textContent = `Selected: ${count}`;
  }

  // ---------- Right panel: Rewards config + Funding ----------
  function updateRightPanel(state) {
    updateSelectedCount(state);

    const selected = Object.values(state.selection).filter(x => x.collection === state.collection);
    const body = $("#ncf-rp-body");
    if (!selected.length) {
      body.innerHTML = `<div class="soft" style="padding:12px; text-align:center;">No templates selected yet.</div>`;
      return;
    }

    // DOM helpers to enrich name/supply from table
    const enrich = (schemaName, tid) => {
      const sid = schemaSectionId(schemaName);
      const row = $(`#${sid} tr[data-tid="${tid}"]`);
      let template_name = null, circulating_supply = 0, max_supply = null;
      if (row) {
        template_name = row.children[2].textContent.trim() || null;
        const circStr = row.children[3].textContent.trim().replace(/[^\d]/g,"");
        const maxStr = row.children[4].textContent.trim();
        circulating_supply = Number(circStr) || 0;
        max_supply = maxStr === "—" ? null : Number(maxStr.replace(/[^\d]/g,"")) || 0;
      }
      return { template_name, circulating_supply, max_supply };
    };

    const tokens = state.tokens;

    body.innerHTML = selected.map(sel => {
      const k = selectionKey(sel.collection, sel.schema_name, sel.template_id);
      const meta = enrich(sel.schema_name, sel.template_id);
      const existingISO = state.expiry[k] || "";
      const minISO = toDatetimeLocal(nowPlusMinutes(5));

      const chips = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const active = !!(state.rewardsPerToken[k] && state.rewardsPerToken[k][id] !== undefined);
        return `<label class="chip ${active ? "active": ""}" data-key="${escapeHtml(k)}" data-token="${escapeHtml(id)}">
          <input type="checkbox" style="display:none;" ${active ? "checked": ""}/>
          <strong>${escapeHtml(t.symbol)}</strong><small class="muted">@${escapeHtml(t.contract)}</small>
        </label>`;
      }).join("") || `<div class="help">No tokens configured yet. Use “Manage deposit tokens”.</div>`;

      const inputs = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const val = (state.rewardsPerToken[k] && state.rewardsPerToken[k][id] !== undefined)
          ? state.rewardsPerToken[k][id]
          : "";
        const show = val !== "" ? "" : "display:none;";
        return `
          <div class="row ncf-reward-row" data-key="${escapeHtml(k)}" data-token="${escapeHtml(id)}" style="${show}">
            <span class="muted" style="min-width:160px;"><strong>${escapeHtml(t.symbol)}</strong> <small>@${escapeHtml(t.contract)}</small></span>
            <input type="number" class="input ncf-reward-input" step="0.0001" min="0" placeholder="Reward / asset / day" value="${String(val)}" style="width:200px;">
          </div>`;
      }).join("");

      return `
        <div class="soft" style="padding:10px;" data-item="${escapeHtml(k)}">
          <div class="row" style="justify-content:space-between;">
            <div class="row" style="gap:.5rem;">
              <strong>${escapeHtml(sel.schema_name)}</strong>
              <span class="muted">ID <button class="btn btn-ghost ncf-id-btn" style="padding:.15rem .5rem;">${sel.template_id}</button></span>
            </div>
            <button class="btn btn-ghost ncf-remove">Remove</button>
          </div>

          <div class="help" style="margin:.25rem 0 .5rem;">
            ${escapeHtml(meta.template_name || "—")} · Circulating: ${fmt(meta.circulating_supply)} · Max: ${meta.max_supply == null ? "—" : fmt(meta.max_supply)}
          </div>

          <div class="grid" style="gap:8px;">
            <div class="row" style="align-items:flex-end;">
              <div class="col">
                <label class="muted"><small>Max validity (can be extended, not shortened)</small></label>
                <input type="datetime-local" class="input ncf-expiry" min="${minISO}" value="${existingISO ? toDatetimeLocal(new Date(existingISO)) : ""}" style="min-width:220px;">
              </div>
              <button class="btn btn-ghost ncf-plus7">+7 days</button>
              <button class="btn btn-ghost ncf-plus30">+30 days</button>
            </div>

            <div class="col">
              <label class="muted"><small>Pick tokens to fund daily reward</small></label>
              <div class="row ncf-token-chips" style="flex-wrap:wrap;">${chips}</div>
            </div>

            <div class="col">
              <div class="ncf-token-inputs">${inputs}</div>
            </div>
          </div>
        </div>`;
    }).join("");

    // Bind interactions
    $$("#ncf-rp-body .ncf-id-btn").forEach(b => {
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.textContent.trim()).then(() => toast("Template ID copied"));
      });
    });

    $$("#ncf-rp-body .ncf-remove").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const box = e.target.closest("[data-item]");
        const key = box.dataset.item;
        const obj = state.selection[key];
        if (!obj) return;
        // uncheck table row if present
        const sid = schemaSectionId(obj.schema_name);
        const row = $(`#${sid} tr[data-tid="${obj.template_id}"]`);
        if (row) {
          const chk = $(".ncf-row-check", row);
          if (chk) chk.checked = false;
        }
        delete state.selection[key];
        delete state.rewardsPerToken[key];
        delete state.expiry[key];
        saveSel(state.selection);
        saveRPT(state.rewardsPerToken);
        saveExp(state.expiry);
        updateRightPanel(state);
      });
    });

    // Expiry handling (max-only)
    $$("#ncf-rp-body .ncf-expiry").forEach(inp => {
      inp.addEventListener("change", (e) => {
        const box = e.target.closest("[data-item]");
        const key = box.dataset.item;
        const newDate = parseLocalDT(e.target.value);
        if (!newDate) {
          delete state.expiry[key];
          saveExp(state.expiry);
          return;
        }
        const prev = state.expiry[key] ? new Date(state.expiry[key]) : null;
        if (prev && newDate < prev) {
          e.target.value = toDatetimeLocal(prev);
          toast("Expiration can only be extended, not reduced.", "error");
          return;
        }
        state.expiry[key] = newDate.toISOString();
        saveExp(state.expiry);
      });
    });
    $$("#ncf-rp-body .ncf-plus7").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const box = e.target.closest("[data-item]"); const key = box.dataset.item;
        const inp = $(".ncf-expiry", box);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base); d.setDate(d.getDate()+7);
        state.expiry[key] = d.toISOString(); saveExp(state.expiry);
        inp.value = toDatetimeLocal(d);
      });
    });
    $$("#ncf-rp-body .ncf-plus30").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const box = e.target.closest("[data-item]"); const key = box.dataset.item;
        const inp = $(".ncf-expiry", box);
        const base = state.expiry[key] ? new Date(state.expiry[key]) : nowPlusMinutes(5);
        const d = new Date(base); d.setDate(d.getDate()+30);
        state.expiry[key] = d.toISOString(); saveExp(state.expiry);
        inp.value = toDatetimeLocal(d);
      });
    });

    // Token chips & inputs
    $$("#ncf-rp-body .ncf-token-chips .chip").forEach(chip => {
      chip.addEventListener("click", () => {
        chip.classList.toggle("active");
        const key = chip.dataset.key;
        const tokenId = chip.dataset.token;
        const active = chip.classList.contains("active");
        state.rewardsPerToken[key] = state.rewardsPerToken[key] || {};
        if (active) {
          if (state.rewardsPerToken[key][tokenId] === undefined) {
            state.rewardsPerToken[key][tokenId] = "";
          }
        } else {
          delete state.rewardsPerToken[key][tokenId];
        }
        saveRPT(state.rewardsPerToken);
        const row = $(`.ncf-reward-row[data-key="${CSS.escape(key)}"][data-token="${CSS.escape(tokenId)}"]`, body);
        if (row) row.style.display = active ? "" : "none";
      });
    });

    $$("#ncf-rp-body .ncf-reward-input").forEach(inp => {
      inp.addEventListener("input", (e) => {
        const row = e.target.closest(".ncf-reward-row");
        const key = row.dataset.key;
        const tokenId = row.dataset.token;
        state.rewardsPerToken[key] = state.rewardsPerToken[key] || {};
        state.rewardsPerToken[key][tokenId] = e.target.value;
        saveRPT(state.rewardsPerToken);
      });
    });
  }

  // ---------- Tokens modal ----------
  function openTokensModal() { $("#ncf-modal").style.display = "flex"; }
  function closeTokensModal() { $("#ncf-modal").style.display = "none"; }
  function renderTokenList(state) {
    const list = $("#ncf-token-list");
    const holdings = sumHoldingsFromDom(); // Map<symbol,amount>
    const weighted = state.tokens.slice()
      .sort((a,b) => (num(holdings.get(b.symbol),0) - num(holdings.get(a.symbol),0)));

    if (!weighted.length) {
      list.innerHTML = `<div class="help">No tokens configured. Add some using the fields above.</div>`;
      return;
    }

    list.innerHTML = weighted.map(t => {
      const held = num(holdings.get(t.symbol), 0);
      const hint = held > 0 ? `<span class="badge ok">You hold ${fmt(held)} ${escapeHtml(t.symbol)}</span>` : `<span class="badge">No local balance</span>`;
      return `
        <div class="soft" data-id="${escapeHtml(t.contract)}:${escapeHtml(t.symbol)}" style="padding:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:260px;">
          <div class="row">
            <strong>${escapeHtml(t.symbol)}</strong>
            <small class="muted">@${escapeHtml(t.contract)}</small>
            <small class="muted">dec:${t.decimals ?? "—"}</small>
          </div>
          <div class="row">
            ${hint}
            <button class="btn btn-ghost ncf-token-del">Remove</button>
          </div>
        </div>`;
    }).join("");

    $$("#ncf-token-list .ncf-token-del").forEach(btn => {
      btn.addEventListener("click", (e) => {
        const pill = e.target.closest("[data-id]");
        const [contract, symbol] = pill.dataset.id.split(":");
        state.tokens = state.tokens.filter(x => !(x.contract === contract && x.symbol === symbol));
        Object.keys(state.rewardsPerToken).forEach(k => {
          if (state.rewardsPerToken[k]) delete state.rewardsPerToken[k][`${contract}:${symbol}`];
        });
        saveTokens(state.tokens);
        saveRPT(state.rewardsPerToken);
        renderTokenList(state);
        updateRightPanel(state);
      });
    });
  }

  // ---------- Farm-Wallet funding & monitor ----------
  function activeRewardTokenIds(state) {
    const ids = new Set();
    Object.values(state.rewardsPerToken).forEach(map => {
      if (!map) return;
      Object.keys(map).forEach(id => ids.add(id)); // contract:symbol
    });
    return ids;
  }

  function renderBalancesTable(state) {
    const tbody = $("#ncf-farm-balances");
    const last = state.farmBalancesTS ? new Date(state.farmBalancesTS) : null;
    const fmtTS = last ? last.toLocaleString() : "—";

    const ids = activeRewardTokenIds(state);
    if (!ids.size) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:12px;">No active tokens in rewards.</td></tr>`;
      $("#ncf-farm-alert").style.display = "none";
      return;
    }

    const rows = [];
    let anyZero = false;
    ids.forEach(id => {
      const [contract, symbol] = id.split(":");
      const bal = num(state.farmBalances.get(symbol), 0); // keyed by symbol
      const status = bal > 0 ? `<span class="badge ok">OK</span>` : `<span class="badge err">0</span>`;
      if (bal <= 0) anyZero = true;
      rows.push(`
        <tr>
          <td><strong>${escapeHtml(symbol)}</strong> <small class="muted">@${escapeHtml(contract)}</small></td>
          <td>${fmt(bal)}</td>
          <td>${fmtTS}</td>
          <td>${status}</td>
        </tr>
      `);
    });

    tbody.innerHTML = rows.join("");
    $("#ncf-farm-alert").style.display = anyZero ? "" : "none";

    // Hints: bilanci locali
    const holdings = sumHoldingsFromDom();
    const hints = [];
    ids.forEach(id => {
      const [, symbol] = id.split(":");
      const have = num(holdings.get(symbol), 0);
      if (have > 0) hints.push(`You currently hold <strong>${fmt(have)} ${escapeHtml(symbol)}</strong> across Twitch/Telegram wallets.`);
    });
    $("#ncf-user-hints").innerHTML = hints.length ? `<p class="help" style="margin:0;">${hints.join(" ")}</p>` : `<p class="help" style="margin:0;">No local balances detected for your active tokens.</p>`;
  }

  async function refreshFarmWalletBalances(state, cfg) {
    const base = apiBase(cfg);
    const url = buildUrl(base, DEFAULTS.endpoints.farmBalances);
    const wax = getWax();
    try {
      const qs = wax ? `?creator=${encodeURIComponent(wax)}` : "";
      const data = await fetchJson(url + qs);
      const map = new Map(); // Map<symbol, amount>
      (Array.isArray(data) ? data : []).forEach(x => {
        const symbol = x.symbol || x.token_symbol; // tollerante
        if (!symbol) return;
        map.set(symbol, num(x.amount, 0));
      });
      state.farmBalances = map;
      state.farmBalancesTS = Date.now();
      renderBalancesTable(state);
    } catch (err) {
      toast(String(err.message || err), "error");
    }
  }

  function startAutoMonitor(state, cfg) {
    stopAutoMonitor(state);
    state.monitorId = setInterval(() => refreshFarmWalletBalances(state, cfg), DEFAULTS.autoMonitorEverySec * 1000);
  }
  function stopAutoMonitor(state) {
    if (state.monitorId) {
      clearInterval(state.monitorId);
      state.monitorId = null;
    }
  }

  // ---------- Top-up (deposit) UI/logic ----------
  function getSourceList(source) {
    return source === "telegram" ? telegramBalances() : twitchBalances();
  }
  function buildTokenOptionsFromSource(source) {
    const list = getSourceList(source);
    // Consolidiamo per symbol (alcune integrazioni potrebbero duplicare)
    const m = new Map();
    list.forEach(x => {
      const sym = (x.symbol || "").toUpperCase();
      if (!sym) return;
      const amt = num(x.amount, 0);
      m.set(sym, num(m.get(sym), 0) + amt);
    });
    // Ordina per saldo desc
    return Array.from(m.entries()).sort((a,b) => b[1]-a[1]).map(([symbol, amount]) => ({ symbol, amount }));
  }
  function findTokenContract(symbol, state) {
    symbol = (symbol || "").toUpperCase();
    const t = state.tokens.find(t => (t.symbol || "").toUpperCase() === symbol);
    return t?.contract || null;
  }

  function updateTopUpPanel(state) {
    const srcSel = $("#ncf-topup-source");
    const tokSel = $("#ncf-topup-token");
    const amtInp = $("#ncf-topup-amount");
    const balHint = $("#ncf-topup-balhint");
    const empty = $("#ncf-topup-empty");

    const source = srcSel.value || "twitch";
    const options = buildTokenOptionsFromSource(source);

    // Rebuild tokens select
    const current = tokSel.value;
    tokSel.innerHTML = `<option value="">Select token…</option>` + options.map(o => `<option value="${o.symbol}">${o.symbol} — balance ${fmt(o.amount)}</option>`).join("");

    // Preseleziona la prima con saldo > 0
    const first = options.find(o => o.amount > 0)?.symbol || "";
    const selSym = options.some(o => o.symbol === current) ? current : first;
    tokSel.value = selSym;

    const bal = options.find(o => o.symbol === selSym)?.amount || 0;
    balHint.textContent = `Balance: ${fmt(bal)} ${selSym || ""}`;
    amtInp.value = ""; // reset

    // Se non ci sono token con saldo > 0, mostra istruzioni di deposito
    const hasFunds = options.some(o => o.amount > 0);
    empty.style.display = hasFunds ? "none" : "";
  }

  async function performTopUp(state, cfg) {
    const srcSel = $("#ncf-topup-source");
    const tokSel = $("#ncf-topup-token");
    const amtInp = $("#ncf-topup-amount");
    const source = (srcSel.value || "twitch").toLowerCase();
    const token_symbol = (tokSel.value || "").toUpperCase();
    const amount = Number(amtInp.value || "0");

    if (!token_symbol) { toast("Select a token.", "error"); return; }
    if (!(amount > 0)) { toast("Enter a positive amount.", "error"); return; }

    // Validazione contro il saldo corrente della sorgente
    const opts = buildTokenOptionsFromSource(source);
    const bal = num(opts.find(o => o.symbol === token_symbol)?.amount, 0);
    if (amount > bal) { toast("Amount exceeds your wallet balance.", "error"); return; }

    const token_contract = findTokenContract(token_symbol, state); // best-effort, opzionale
    const payload = {
      creator_wax_account: getWax() || null,
      source, // "twitch" | "telegram"
      token_symbol,
      token_contract: token_contract || undefined,
      amount,
    };

    try {
      const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.depositToFarm);
      const res = await postJson(url, payload);
      if (!res || res.ok !== true) throw new Error("Deposit failed");
      toast("Deposit completed.");

      // (facoltativo) aggiorna arrays locali se il backend li ritorna
      if (res.balances?.twitch) window.twitchWalletBalances = res.balances.twitch;
      if (res.balances?.telegram) window.telegramWalletBalances = res.balances.telegram;

      // Refresh UI: top-up panel + farm balances
      updateTopUpPanel(state);
      await refreshFarmWalletBalances(state, cfg);
    } catch (e) {
      toast(String(e.message || e), "error");
    }
  }

  // ---------- Build payload & save (Emit) ----------
  function buildPayload(state) {
    const items = Object.values(state.selection)
      .filter(x => x.collection === state.collection)
      .map(x => {
        const key = selectionKey(x.collection, x.schema_name, x.template_id);
        const expiry = state.expiry[key] || null;
        const rewards = [];
        const perToken = state.rewardsPerToken[key] || {};
        Object.entries(perToken).forEach(([tokId, val]) => {
          if (val === "" || Number(val) <= 0) return;
          const [contract, symbol] = tokId.split(":");
          const tokMeta = state.tokens.find(t => t.contract === contract && t.symbol === symbol) || {};
          const qty = Number(val);
          rewards.push({
            token_contract: contract,
            token_symbol: symbol,
            decimals: tokMeta.decimals ?? null,
            reward_per_asset_per_day: qty,
            reward_per_holding: qty, // legacy compat
          });
        });
        return {
          schema_name: x.schema_name,
          template_id: Number(x.template_id),
          expiry, // ISO or null
          rewards,
        };
      });

    return {
      collection: state.collection,
      creator_wax_account: getWax() || null,
      policy: {
        distribution: "daily",
        semantics: "Rewards are per asset_id per day. Expiration is a max validity (can be extended, not shortened).",
        deposit_required: "Distributions only happen if there is remaining reward balance deposited.",
      },
      tokens_catalog: state.tokens,
      total_selected: items.length,
      items,
    };
  }

  async function emitAndSave(state, cfg) {
    const base = apiBase(cfg);
    const url = buildUrl(base, DEFAULTS.endpoints.saveRewards);

    const selected = Object.values(state.selection).filter(x => x.collection === state.collection);
    if (!selected.length) { toast("Please select at least one template.", "error"); return; }

    const anyToken = selected.some(x => {
      const k = selectionKey(x.collection, x.schema_name, x.template_id);
      const m = state.rewardsPerToken[k] || {};
      return Object.values(m).some(v => String(v).trim() !== "" && Number(v) > 0);
    });
    if (!anyToken) { toast("Add at least one token with a positive daily reward.", "error"); return; }

    const payload = buildPayload(state);

    try {
      const result = await postJson(url, payload);
      const ok = (result && (result.ok === true || result.status === "ok"));
      if (!ok) throw new Error("Emit failed. Please try again.");

      selected.forEach(t => toast(`Rewards defined for Template ${t.template_id}.`));
      await refreshFarmWalletBalances(state, cfg);
      const auto = $("#ncf-auto-monitor");
      if (auto && auto.checked) startAutoMonitor(state, cfg);
    } catch (err) {
      toast(String(err.message || err), "error");
    }
  }

  // ---------- Main init ----------
  function initManageNFTsFarm(opts = {}) {
    injectStyles();

    const cfg = { ...DEFAULTS, ...opts };

    const container = cfg.containerId ? document.getElementById(cfg.containerId) : null;
    const host = container || (() => { const d = document.createElement("div"); d.id = "ncf-root-auto"; document.body.appendChild(d); return d; })();

    createLayout(host, cfg);

    const state = {
      apiBaseUrl: apiBase(cfg),
      collection: readLS(DEFAULTS.ls.lastCollection, ""),
      raw: null,
      search: "",
      schemaFilter: "",
      expandAll: true,
      selection: loadSel(),
      tokens: loadTokens(),                   // [{contract,symbol,decimals}]
      rewardsPerToken: loadRPT(),             // { key: { "contract:symbol": "0.1" } }
      expiry: loadExp(),                      // { key: ISO }
      farmBalances: new Map(),                // Map<symbol, amount>
      farmBalancesTS: null,
      monitorId: null,
    };

    // Prefill UI
    $("#ncf-collection").value = state.collection || "";
    updateSelectedCount(state);

    // Controls
    $("#ncf-load").addEventListener("click", () => doLoad(state, cfg));
    $("#ncf-collection").addEventListener("keydown", (e) => { if (e.key === "Enter") doLoad(state, cfg); });

    $("#ncf-search").addEventListener("input", (e) => { state.search = e.target.value || ""; if (state.raw) renderSections($("#ncf-sections"), state.raw, state); });
    $("#ncf-schema").addEventListener("change", (e) => { state.schemaFilter = e.target.value || ""; if (state.raw) renderSections($("#ncf-sections"), state.raw, state); });
    $("#ncf-expand").addEventListener("click", () => {
      state.expandAll = !state.expandAll;
      $("#ncf-expand").textContent = state.expandAll ? "Collapse all" : "Expand all";
      if (state.raw) renderSections($("#ncf-sections"), state.raw, state);
    });

    $("#ncf-select-all").addEventListener("click", () => {
      if (!state.raw) return;
      (state.raw.schemas || []).forEach(s => (s.templates || []).forEach(t => setSelected(state, state.collection, s.schema_name, Number(t.template_id), true)));
      $$(".ncf-row-check").forEach(c => c.checked = true);
      updateRightPanel(state);
    });
    $("#ncf-clear").addEventListener("click", () => {
      if (!state.raw) return;
      Object.keys(state.selection).forEach(k => {
        if (k.startsWith(`${state.collection}::`)) {
          delete state.selection[k];
          delete state.rewardsPerToken[k];
          delete state.expiry[k];
        }
      });
      saveSel(state.selection); saveRPT(state.rewardsPerToken); saveExp(state.expiry);
      $$(".ncf-row-check").forEach(c => c.checked = false);
      updateRightPanel(state);
    });

    // Tokens modal
    $("#ncf-manage-tokens").addEventListener("click", () => { openTokensModal(); renderTokenList(state); });
    $("#ncf-modal-close").addEventListener("click", closeTokensModal);
    $(".backdrop", $("#ncf-modal")).addEventListener("click", closeTokensModal);
    $("#ncf-tok-add").addEventListener("click", () => {
      const c = $("#ncf-tok-contract").value.trim();
      const s = $("#ncf-tok-symbol").value.trim().toUpperCase();
      const d = $("#ncf-tok-dec").value === "" ? null : Number($("#ncf-tok-dec").value);
      if (!c || !s) { toast("Please provide contract and symbol.", "error"); return; }
      if (state.tokens.some(t => t.contract === c && t.symbol === s)) { toast("Token already present."); return; }
      state.tokens.push({ contract:c, symbol:s, decimals:d });
      saveTokens(state.tokens);
      $("#ncf-tok-contract").value = ""; $("#ncf-tok-symbol").value = ""; $("#ncf-tok-dec").value = "";
      renderTokenList(state);
      updateRightPanel(state);
    });

    // Funding — Farm balances & Auto monitor
    $("#ncf-refresh-farm").addEventListener("click", () => refreshFarmWalletBalances(state, cfg));
    $("#ncf-auto-monitor").addEventListener("change", (e) => { if (e.target.checked) startAutoMonitor(state, cfg); else stopAutoMonitor(state); });

    // Top-up panel bindings
    $("#ncf-topup-source").addEventListener("change", () => updateTopUpPanel(state));
    $("#ncf-topup-token").addEventListener("change", () => updateTopUpPanel(state));
    $("#ncf-topup-max").addEventListener("click", () => {
      const src = $("#ncf-topup-source").value || "twitch";
      const sym = ($("#ncf-topup-token").value || "").toUpperCase();
      if (!sym) return;
      const bal = buildTokenOptionsFromSource(src).find(o => o.symbol === sym)?.amount || 0;
      $("#ncf-topup-amount").value = String(bal);
    });
    $("#ncf-topup-submit").addEventListener("click", () => performTopUp(state, cfg));

    // Copy helpers
    $("#ncf-copy-account-2").addEventListener("click", () => navigator.clipboard.writeText(DEFAULTS.farmWalletAccount).then(() => toast("Account copied")));
    $("#ncf-copy-memo-tw").addEventListener("click", () => navigator.clipboard.writeText(DEFAULTS.farmWalletMemoTwitch).then(() => toast("Memo copied")));
    $("#ncf-copy-memo-tg").addEventListener("click", () => navigator.clipboard.writeText(DEFAULTS.farmWalletMemoTelegram).then(() => toast("Memo copied")));

    // Emit
    $("#ncf-emit").addEventListener("click", () => emitAndSave(state, cfg));

    // Stop monitor on hide
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopAutoMonitor(state); });

    // Init top-up UI
    updateTopUpPanel(state);

    // Autoload if collection stored
    if (state.collection) doLoad(state, cfg);
  }

  async function doLoad(state, cfg) {
    const col = $("#ncf-collection").value.trim();
    if (!col) { toast("Please enter a collection name.", "error"); return; }
    state.collection = col; writeLS(DEFAULTS.ls.lastCollection, col);
    $("#ncf-meta").textContent = "Loading…";
    $("#ncf-sections").innerHTML = "";
    renderSkeleton($("#ncf-status"));

    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.templatesBySchema);
    try {
      const data = await postJson(url, { collection_name: col });
      state.raw = data;

      const opts = (data.schemas || []).map(s => `<option value="${escapeHtml(s.schema_name)}">${escapeHtml(s.schema_name)}</option>`).join("");
      $("#ncf-schema").innerHTML = `<option value="">All schemas</option>${opts}`;

      const totalSchemas = (data.schemas || []).length;
      const totalTemplates = (data.schemas || []).reduce((acc, s) => acc + (s.templates?.length || 0), 0);
      $("#ncf-meta").textContent = `Collection: ${data.collection} — Schemas ${totalSchemas} — Templates ${totalTemplates}`;

      $("#ncf-status").innerHTML = "";
      renderSections($("#ncf-sections"), data, state);
      updateRightPanel(state);

      refreshFarmWalletBalances(state, cfg);
      updateTopUpPanel(state);
    } catch (err) {
      $("#ncf-status").innerHTML = `<div class="soft" style="padding:14px; text-align:center;">${escapeHtml(String(err.message || err))}</div>`;
      $("#ncf-meta").textContent = "Error";
    }
  }

  // ---------- Public API ----------
  window.initManageNFTsFarm = initManageNFTsFarm;
})();
