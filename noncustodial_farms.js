/* noncustodial_farms.js — PART 1/2 (Simple User UX + Base Framework)
   Paste PART 1 first. When you paste PART 2, they become one single file.
   UI language: EN only.
*/
(function () {
  "use strict";

  // ---------- CONFIG & CONSTANTS ----------
  const DEFAULTS = {
    apiBaseUrl: "", // falls back to window.BASE_URL || location.origin
    appTitle: "Non-Custodial NFT Farms",
    // Payout schedule requirement (explicit for users)
    payoutSchedule: "Distributions occur daily at 14:00 CET.",
    // Public endpoints (keep identical to backend contract you shared)
    endpoints: {
      // browsing / reading
      activeFarms: "/api/farm/list",                   // GET ?status=active
      farmStats: "/api/farm/stats",                    // GET ?farm_id=... OR ?creator=...
      farmDistributions: "/api/farm/distributions",    // GET ?farm_id=...&limit=100
      userHistory: "/api/farm/user-history",           // GET ?farm_id=...&owner=...&limit=200
      // (Creator endpoints are hooked in PART 2)
      templatesBySchema: "/api/templates-by-schema",
      saveRewards: "/api/farm/rewards/draft",
      farmBalances: "/api/farm/deposit/balances",
      depositToFarm: "/api/farm/deposit",
      farmsByCreator: "/api/farm/list",
      farmKick: "/api/farm/kick"
    },
    // Optional display values used elsewhere (kept for PART 2 compat)
    farmWalletAccount: "xcryptochips",
    memoTelegram: "deposit token",
    memoTwitch: "deposit twitch",
    containerId: null,
    ls: {
      autoMonitor: "ncf.autoMonitor.v2"
    }
  };

  // ---------- LIGHT UTILITIES ----------
  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const once = (fn) => { let r; return (...a) => (r ??= fn(...a)); };
  const num = (v, d = 0) => (v == null || v === "" || isNaN(+v) ? d : +v);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const esc = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  const getWax = () => (window.userData?.wax_account || "").trim();
  const apiBase = (cfg) => cfg.apiBaseUrl || window.BASE_URL || window.API_BASE || location.origin;
  const buildUrl = (b, p) => `${String(b).replace(/\/+$/, "")}${p}`;
  const toDateTime = (v) => (v ? new Date(v) : null);

  const fetchJson = async (u, init) => {
    const r = await fetch(u, init);
    if (!r.ok) {
      const tx = await r.text().catch(() => "");
      throw new Error(`HTTP ${r.status} — ${tx || r.statusText}`);
    }
    const raw = await r.text();
    try {
      return JSON.parse(raw);
    } catch {
      // backend might already return JSON; if not parseable, pass through
      return raw;
    }
  };
  const getJson = (u) => fetchJson(u);
  const postJson = (u, body) =>
    fetchJson(u, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
// ====== LIVE circulating (in-memory) ======
const ensureCircState = (state) => {
  if (!state._circ) {
    state._circ = { map: new Map(), timer: null, collection: null };
  }
  return state._circ;
};

// Legge dall'endpoint live (full o subset)
async function fetchCirculatingLive(state, collection, tids /* array opzionale */) {
  const base = apiBase(state.cfg).replace(/\/+$/,"");
  const qsTids = Array.isArray(tids) && tids.length ? `&tids=${encodeURIComponent(tids.join(","))}` : "";
  const url = `${base}/api/templates/circulating-live?collection=${encodeURIComponent(collection)}${qsTids}`;
  let data = await fetchJson(url);
  if (typeof data === "string") { try { data = JSON.parse(data); } catch { data = { items: [] }; } }
  const circ = ensureCircState(state);
  circ.map.clear();
  (data.items || []).forEach(it => {
    circ.map.set(Number(it.template_id), {
      circ: Number(it.circulating_supply || 0),
      max:  (it.max_supply == null ? null : Number(it.max_supply))
    });
  });
  circ.collection = collection;
  return circ;
}

// Aggiorna le tabelle Step C e i pannelli Step D
function applyCirculatingToUI(state) {
  const circ = ensureCircState(state);

  // Step C: tabella per schema
  document.querySelectorAll('#ncf-sections table.ncf-table tbody tr[data-tid]').forEach(tr => {
    const tid = Number(tr.getAttribute('data-tid'));
    const m = circ.map.get(tid);
    if (!m) return;
    const cells = tr.children; // [0..5] = [chk, ID, Nome, Circ, Max, %]
    const curCirc = Number((cells[3].textContent || "").replace(/[^\d]/g,"")) || 0;
    const curMaxTxt = cells[4].textContent.trim();
    const curMax = curMaxTxt === "—" ? null : Number(curMaxTxt.replace(/[^\d]/g,"")) || 0;

    if (curCirc !== m.circ) cells[3].textContent = m.circ.toLocaleString();
    if ((curMax ?? null) !== (m.max ?? null)) cells[4].textContent = (m.max == null ? "—" : m.max.toLocaleString());
    const pct = (m.max && m.max > 0) ? `${Math.min(100, (m.circ / m.max) * 100).toFixed(1)}%` : "—";
    cells[5].textContent = pct;
  });

  // Step D: ricostruisci righe e riepilogo che usano circulating
  updateRewardsPanel(state);
  refreshStep4Summary(state);
}

// Polling (default 60s). Usa subset = template visibili/selezionati per minimizzare payload.
function startLiveCircPolling(state, collection, intervalMs = 60000) {
  stopLiveCircPolling(state);
  const pickTids = () => {
    const ids = new Set();
    // 1) selezionati nello Step D:
    Object.values(state.creator?.selection || {})
      .filter(x => x.collection === state.creator.collection)
      .forEach(x => ids.add(Number(x.template_id)));
    // 2) visibili in Step C (righe filtrate correnti):
    document.querySelectorAll('#ncf-sections table.ncf-table tbody tr[data-tid]')
      .forEach(tr => ids.add(Number(tr.getAttribute('data-tid'))));
    return Array.from(ids.values());
  };

  const tick = async () => {
    try {
      const tids = pickTids();
      await fetchCirculatingLive(state, collection, tids);
      applyCirculatingToUI(state);
    } catch (e) {
      // silenzioso: se fallisce un giro non blocchiamo la UI
      console.warn("live circulating refresh failed:", e);
    }
  };

  // primo giro immediato (subset)
  tick();
  const circ = ensureCircState(state);
  circ.timer = setInterval(tick, Math.max(15000, Number(intervalMs) || 60000)); // minimo 15s di guardia
}

function stopLiveCircPolling(state) {
  const circ = ensureCircState(state);
  if (circ.timer) { clearInterval(circ.timer); circ.timer = null; }
}

  const toast = (() => {
    let tmr = null;
    return (m, kind = "info") => {
      let t = $("#ncf-toast");
      if (!t) {
        t = document.createElement("div");
        t.id = "ncf-toast";
        t.setAttribute("role", "status");
        t.setAttribute("aria-live", "polite");
        document.body.appendChild(t);
      }
      t.textContent = m;
      t.dataset.kind = kind;
      t.classList.add("show");
      clearTimeout(tmr);
      tmr = setTimeout(() => t.classList.remove("show"), 2600);
    };
  })();

  const injectStyles = once(() => {
    const css = `
:root { --card-bg: rgba(12,16,22,.66); --line: rgba(255,255,255,.08); --glow: rgba(0,255,200,.15); }
#ncf-root { color:#e6eef8; }
#ncf-root .cy-card{background:var(--card-bg);border:1px solid rgba(0,255,200,.18);border-radius:14px;box-shadow:0 0 22px var(--glow),inset 0 0 0 1px rgba(255,255,255,.03)}
#ncf-root .grid{display:grid;gap:12px} .row{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}
#ncf-root .muted{color:rgba(230,238,248,.75)} .soft{background:rgba(255,255,255,.03);border:1px solid var(--line);border-radius:12px}
#ncf-root .btn{cursor:pointer;border-radius:999px;padding:.6rem 1rem;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(20,28,36,.9),rgba(10,14,18,.9));color:#e6eef8}
#ncf-root .btn:focus{outline:none;box-shadow:0 0 0 2px rgba(0,255,200,.35)} .btn[disabled]{opacity:.6;cursor:not-allowed}
#ncf-root .btn-primary{border-color:transparent;background:linear-gradient(180deg,rgba(0,255,200,.9),rgba(0,196,255,.9));color:#001418;font-weight:800}
#ncf-root .btn-ghost{background:transparent}
#ncf-root .badge{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .6rem;border-radius:999px;font-size:.85rem;border:1px solid var(--line)}
#ncf-root .badge.ok{color:#22e4b6;background:rgba(34,228,182,.12)} .badge.warn{color:#f8c555;background:rgba(248,197,85,.12)} .badge.err{color:#ff7b7b;background:rgba(255,123,123,.12)}
#ncf-root table{width:100%;border-collapse:separate;border-spacing:0;font-size:.95rem;min-width:540px}
#ncf-root thead th{position:sticky;top:0;padding:.6rem .8rem;text-align:left;background:rgba(10,14,18,.95);border-bottom:1px solid var(--line)}
#ncf-root tbody td{padding:.6rem .8rem;border-bottom:1px dashed var(--line)}
#ncf-root details > summary {cursor:pointer;user-select:none}
#ncf-root .tabbar button[aria-selected="true"]{box-shadow:0 0 0 2px rgba(0,255,200,.35)}
#ncf-root .kpi{display:flex;gap:.5rem;flex-wrap:wrap}
#ncf-toast{position:fixed;bottom:18px;left:50%;transform:translate(-50%,18px);opacity:0;background:rgba(12,16,22,.92);border:1px solid rgba(0,255,200,.25);color:#e6eef8;padding:.55rem .9rem;border-radius:12px;box-shadow:0 0 18px var(--glow);z-index:9999;transition:all .18s ease}
#ncf-toast.show{opacity:1;transform:translate(-50%,0)}
    `.trim();
    const s = document.createElement("style");
    s.id = "ncf-styles";
    s.textContent = css;
    document.head.appendChild(s);
  });

  // ---------- DATA FETCHERS (READ-ONLY FLOW) ----------
  async function fetchActiveFarms(cfg) {
    const url = buildUrl(apiBase(cfg), cfg.endpoints.activeFarms) + `?status=active`;
    let data = await getJson(url);
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { data = []; }
    }
    return Array.isArray(data) ? data : [];
  }

  async function fetchFarmStats(cfg, farm_id) {
    const url = buildUrl(apiBase(cfg), cfg.endpoints.farmStats) + `?farm_id=${encodeURIComponent(farm_id)}`;
    let data = await getJson(url);
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { data = {}; }
    }
    return data || {};
  }

  async function fetchFarmDistributions(cfg, farm_id, limit = 100) {
    const url = buildUrl(apiBase(cfg), cfg.endpoints.farmDistributions) + `?farm_id=${encodeURIComponent(farm_id)}&limit=${limit}`;
    let data = await getJson(url);
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { data = []; }
    }
    return Array.isArray(data) ? data : [];
  }

  async function fetchUserHistory(cfg, farm_id, owner, limit = 200) {
    const url = buildUrl(apiBase(cfg), cfg.endpoints.userHistory) + `?farm_id=${encodeURIComponent(farm_id)}&owner=${encodeURIComponent(owner)}&limit=${limit}`;
    let data = await getJson(url);
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch { data = []; }
    }
    return Array.isArray(data) ? data : [];
  }

  // ---------- RENDER HELPERS ----------
  function skeleton(lines = 2) {
    const rows = Array.from({ length: lines })
      .map(() => `<div style="height:12px; width:${Math.round(220 + Math.random() * 160)}px; margin:.35rem 0; background:rgba(255,255,255,.06); border-radius:8px;"></div>`)
      .join("");
    return `<div class="soft" style="padding:1rem;">${rows}</div>`;
  }

  function renderHowItWorks(cfg) {
    return `
      <section class="cy-card" style="padding:16px;">
        <h2 style="margin:0 0 .5rem;">How it works</h2>
        <div class="grid">
          <div class="soft" style="padding:10px;">
            <h3 style="margin:.2rem 0;">Non-custodial by design</h3>
            <p class="muted" style="margin:.4rem 0;">
              You never send NFTs to anyone. To be rewarded, simply hold the required NFTs
              in your own wallet (e.g., AtomicHub, NFTHive, NeftyBlocks, etc.).
              If your NFTs match a farm’s valid <em>template_id</em>, you are eligible.
            </p>
            <p class="badge ok" title="Payout cadence">${esc(cfg.payoutSchedule)}</p>
          </div>

          <div class="soft" style="padding:10px;">
            <h3 style="margin:.2rem 0;">Rewards model</h3>
            <ul class="muted" style="margin:.4rem 0 .2rem 1.2rem;">
              <li>Rewards are <strong>per asset_id per day</strong>, configured per template.</li>
              <li>Tokens are never aggregated across different symbols.</li>
              <li>Distributions are sent directly to eligible owners’ wallets.</li>
            </ul>
          </div>

          <div class="soft" style="padding:10px;">
            <h3 style="margin:.2rem 0;">Who is this for?</h3>
            <ul class="muted" style="margin:.4rem 0 .2rem 1.2rem;">
              <li><strong>Collectors/Players:</strong> Browse active farms, open details, and see your history (when signed in).</li>
              <li><strong>Creators:</strong> Create/edit farms and see aggregate stats (Creator modules load in Part 2).</li>
            </ul>
          </div>
        </div>
      </section>
    `;
  }

  function renderFarmCard(f) {
    const id = esc(String(f.farm_id ?? "—"));
    const collection = esc(f.collection || "—");
    const creator = esc(f.creator || f.creator_wax_account || "—");
    return `
      <div class="soft" data-farm="${id}" style="padding:12px; display:flex; justify-content:space-between; gap:10px;">
        <div class="col">
          <div class="row" style="gap:.5rem;">
            <strong>Farm #${id}</strong>
            <span class="muted">${collection}</span>
          </div>
          <small class="muted">Creator: ${creator}</small>
        </div>
        <div class="row">
          <button class="btn btn-ghost ncf-view-farm">View</button>
        </div>
      </div>
    `;
  }

	function renderActiveFarmsList(state, farms) {
	  // usa l'id corretto, con fallback per compat vecchi
	  const box = document.querySelector("#ncf-list-view") || document.querySelector("#ncf-active-list");
	  if (!box) {
	    console.warn("NCF: missing list container (#ncf-list-view).");
	    return;
	  }
	
	  if (!farms.length) {
	    box.innerHTML = `<div class="help muted">No active farms found.</div>`;
	    return;
	  }
	
	  box.innerHTML = farms.map(renderFarmCard).join("");
	
	  // aggiorna i binding sul contenitore corretto
	  (box.querySelectorAll(".ncf-view-farm") || []).forEach((btn) => {
	    btn.addEventListener("click", () => {
	      const card = btn.closest("[data-farm]");
	      const farmId = card?.dataset.farm;
	      if (!farmId) return;
	      openFarmDetail(state, farmId);
	    });
	  });
	}

  function renderRemainingByToken(head) {
    const remaining = head?.remaining_by_token && typeof head.remaining_by_token === "object"
      ? Object.entries(head.remaining_by_token).map(([sym, amt]) => ({ symbol: String(sym).toUpperCase(), amount: Number(amt) || 0 }))
      : [];
    remaining.sort((a, b) => b.amount - a.amount);

    return remaining.length
      ? `
        <table>
          <thead><tr><th>Token</th><th>Remaining</th></tr></thead>
          <tbody>${remaining.map(r => `<tr><td><strong>${esc(r.symbol)}</strong></td><td>${fmt(r.amount)}</td></tr>`).join("")}</tbody>
        </table>`
      : `<div class="muted">No remaining budget reported.</div>`;
  }

  function renderConfigItemsTable(items) {
    if (!Array.isArray(items) || !items.length) {
      return `<div class="muted">No rewarded templates configured.</div>`;
    }
    const rows = items.map((it) => {
      const tokensHtml = (Array.isArray(it.rewards) ? it.rewards : [])
        .map((r) => `
          <div class="row" style="gap:.35rem;">
            <span class="badge">${esc(r.token_symbol)}</span>
            <small class="muted">@${esc(r.token_contract || "")}</small>
            <span class="muted">${fmt(r.reward_per_asset_per_day || 0)}/day</span>
          </div>
        `).join("") || `<div class="muted">—</div>`;
      const exp = it.expiry ? new Date(it.expiry).toLocaleString() : "—";
      return `
        <tr>
          <td><strong>${esc(it.schema_name || "—")}</strong> <small class="muted">ID ${esc(String(it.template_id))}</small></td>
          <td>${tokensHtml}</td>
          <td>${esc(exp)}</td>
        </tr>
      `;
    }).join("");

    return `
      <table>
        <thead><tr><th>Template</th><th>Tokens (per day)</th><th>Expiry</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderUserHistoryTable(evts) {
    if (!Array.isArray(evts) || !evts.length) {
      return `<div class="muted">No distributions for your wallet yet, or you do not hold eligible NFTs here.</div>`;
    }

    // per-symbol totals (never aggregate across symbols)
    const bySym = new Map();
    evts.forEach((ev) => {
      const sym = String(ev.token_symbol || "").toUpperCase();
      const amt = Number(ev.amount || 0);
      bySym.set(sym, (bySym.get(sym) || 0) + (isFinite(amt) ? amt : 0));
    });
    const totalsRows = Array.from(bySym.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([s, a]) => `<tr><td><strong>${esc(s)}</strong></td><td>${fmt(a)}</td></tr>`)
      .join("");

    const logRows = evts.map((ev) => `
      <tr>
        <td>${new Date(ev.ts).toLocaleString()}</td>
        <td><strong>${esc(String(ev.token_symbol || "").toUpperCase())}</strong></td>
        <td>${fmt(ev.amount || 0)}</td>
        <td>${esc(ev.schema_name || "—")} / ID ${esc(String(ev.template_id || "—"))}</td>
        <td>${esc(ev.note || "—")}</td>
      </tr>
    `).join("");

    return `
      <div class="grid" style="gap:10px;">
        <div class="soft" style="padding:8px;">
          <h4 style="margin:.2rem 0;">Per-token totals</h4>
          <table>
            <thead><tr><th>Token</th><th>Total received</th></tr></thead>
            <tbody>${totalsRows}</tbody>
          </table>
        </div>
        <div class="soft" style="padding:8px;">
          <h4 style="margin:.2rem 0;">Event log</h4>
          <table>
            <thead><tr><th>Time</th><th>Token</th><th>Amount</th><th>Template</th><th>Note</th></tr></thead>
            <tbody>${logRows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ---------- MAIN UI LAYOUT ----------
  function createLayout(root, cfg) {
    root.innerHTML = `
      <div id="ncf-root" class="grid" style="grid-template-columns: 1fr; gap:18px;">
        <section class="cy-card" style="padding:14px;">
          <div class="row" style="justify-content:space-between; align-items:center;">
            <h1 style="margin:0;">${esc(cfg.appTitle)}</h1>
            <div class="row tabbar" role="tablist" aria-label="Main tabs">
              <button id="ncf-tab-browse"  role="tab" aria-selected="true"  class="btn btn-ghost" aria-controls="ncf-pane-browse">Farms</button>
              <button id="ncf-tab-creator" role="tab" aria-selected="false" class="btn btn-ghost" aria-controls="ncf-pane-creator">Creator Dashboard</button>
              <button id="ncf-tab-stats"   role="tab" aria-selected="false" class="btn btn-ghost" aria-controls="ncf-pane-stats">Farm Stats</button>
              <button id="ncf-tab-help"    role="tab" aria-selected="false" class="btn btn-ghost" aria-controls="ncf-pane-help">How it works</button>
            </div>
          </div>
          <div class="soft" style="padding:8px; margin-top:8px;">
            <div class="row kpi">
              <span class="badge ok">Non-custodial</span>
              <span class="badge" title="Payout cadence">${esc(cfg.payoutSchedule)}</span>
              <span class="badge">Signed-in wallet: <strong>${esc(getWax() || "—")}</strong></span>
            </div>
            <p class="muted" style="margin:.4rem 0 0;">
              Hold eligible NFTs in your own wallet. You do not need to send NFTs to anyone to be rewarded.
            </p>
          </div>
        </section>

        <!-- BROWSE FARMS -->
        <section id="ncf-pane-browse" class="cy-card" style="padding:14px;">
          <div class="row" style="justify-content:space-between; align-items:center;">
            <h2 style="margin:0;">Active Farms</h2>
            <div class="row">
              <input id="ncf-search" class="input" placeholder="Search by collection, creator, or farm id…" style="height:40px;padding:0 .8rem;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(10,14,18,.8);color:#e6eef8;min-width:280px;">
              <button id="ncf-refresh" class="btn btn-ghost">Refresh</button>
            </div>
          </div>

          <div id="ncf-list-view" class="grid" style="gap:10px; margin-top:10px;">
            <div class="muted">${skeleton(3)}</div>
            <div class="muted">${skeleton(3)}</div>
          </div>

          <div id="ncf-detail-view" class="grid" style="gap:12px; display:none; margin-top:8px;">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <h3 style="margin:.2rem 0;">Farm Detail</h3>
              <button id="ncf-back-list" class="btn btn-ghost">Back to list</button>
            </div>

            <div id="ncf-detail-overview" class="grid" style="gap:10px;">
              ${skeleton(3)}
            </div>

            <div class="grid" style="gap:12px; margin-top:8px;">
              <div class="soft" style="padding:10px;">
                <h4 style="margin:.2rem 0;">Rewarded Templates</h4>
                <div id="ncf-detail-config">${skeleton(3)}</div>
              </div>

              <div class="soft" style="padding:10px;">
                <h4 style="margin:.2rem 0;">Your Distribution History</h4>
                <div id="ncf-detail-history">${skeleton(2)}</div>
              </div>
            </div>
          </div>
        </section>

        <!-- CREATOR DASHBOARD (mounted in PART 2) -->
        <section id="ncf-pane-creator" class="cy-card" style="padding:14px; display:none;">
          <h2 style="margin:0;">Creator Dashboard</h2>
          <div class="soft" style="padding:10px;">
            <div class="muted">This module will load when Part 2 is added.</div>
          </div>
        </section>

        <!-- FARM STATS (mounted in PART 2) -->
        <section id="ncf-pane-stats" class="cy-card" style="padding:14px; display:none;">
          <h2 style="margin:0;">Farm Stats</h2>
          <div class="soft" style="padding:10px;">
            <div class="muted">This module will load when Part 2 is added.</div>
          </div>
        </section>

        <!-- HELP -->
        <section id="ncf-pane-help" class="cy-card" style="padding:14px; display:none;">
          ${renderHowItWorks(cfg)}
        </section>
      </div>
      <div id="ncf-toast"></div>
    `;
  }

  // ---------- DETAIL RENDERERS (BROWSE FLOW) ----------
  function renderDetailOverview(stats, cfg) {
    const head = stats?.summary || {};
    const farmId = esc(String(stats.farm_id ?? "—"));
    const collection = esc(stats.collection || "—");
    const creator = esc(stats.creator || stats.creator_wax_account || "—");
    const validTemplates = head.valid_templates_total ?? (stats?.config?.items?.length ?? 0);
    const lastDist = head.last_distribution_at ? new Date(head.last_distribution_at).toLocaleString() : "—";

    return `
      <div class="soft" style="padding:10px;">
        <div class="row" style="gap:.5rem; flex-wrap:wrap;">
          <span class="badge">Farm #${farmId}</span>
          <span class="badge">Collection: ${collection}</span>
          <span class="badge">Creator: ${creator}</span>
          <span class="badge">Valid templates: ${fmt(validTemplates)}</span>
          <span class="badge" title="Payout cadence">${esc(cfg.payoutSchedule)}</span>
          <span class="badge">Last distribution: ${lastDist}</span>
        </div>
      </div>

      <div class="soft" style="padding:10px;">
        <h4 style="margin:.2rem 0;">Remaining rewards by token</h4>
        ${renderRemainingByToken(head)}
      </div>
    `;
  }

  // Open a farm and show detail view
  async function openFarmDetail(state, farmId) {
    const list = $("#ncf-list-view");
    const detail = $("#ncf-detail-view");
    const overview = $("#ncf-detail-overview");
    const configBox = $("#ncf-detail-config");
    const historyBox = $("#ncf-detail-history");

    state.currentFarmId = farmId;
    list.style.display = "none";
    detail.style.display = "";
    overview.innerHTML = skeleton(3);
    configBox.innerHTML = skeleton(3);
    historyBox.innerHTML = skeleton(2);

    try {
      const stats = await fetchFarmStats(state.cfg, farmId);

      // Overview + remaining_by_token
      overview.innerHTML = renderDetailOverview(stats, state.cfg);

      // Rewarded templates (config)
      const items = Array.isArray(stats?.config?.items) ? stats.config.items : [];
      configBox.innerHTML = renderConfigItemsTable(items);

      // Personal history (if signed in)
      const me = getWax();
      if (!me) {
        historyBox.innerHTML = `<div class="muted">Sign in to view your personal distribution history for this farm.</div>`;
      } else {
        try {
          const evts = await fetchUserHistory(state.cfg, farmId, me, 200);
          historyBox.innerHTML = renderUserHistoryTable(evts);
        } catch (e) {
          historyBox.innerHTML = `<div class="muted">Unable to load your history: ${esc(String(e.message || e))}</div>`;
        }
      }
    } catch (e) {
      overview.innerHTML = `<div class="soft" style="padding:10px;">${esc(String(e.message || e))}</div>`;
      configBox.innerHTML = "";
      historyBox.innerHTML = "";
    }
  }

  // ---------- LIST LOADING & SEARCH ----------
  function filterFarms(raw, q) {
    if (!q) return raw.slice();
    const s = q.trim().toLowerCase();
    return raw.filter((f) => {
      const id = String(f.farm_id ?? "").toLowerCase();
      const collection = String(f.collection || "").toLowerCase();
      const creator = String(f.creator || f.creator_wax_account || "").toLowerCase();
      return id.includes(s) || collection.includes(s) || creator.includes(s);
    });
  }

  async function loadActiveFarms(state) {
    const box = $("#ncf-list-view");
    box.innerHTML = `<div class="muted">${skeleton(3)}</div>`;
    try {
      const farms = await fetchActiveFarms(state.cfg);
      state.farms = Array.isArray(farms) ? farms : [];
      const q = $("#ncf-search").value || "";
      state.filtered = filterFarms(state.farms, q);
      renderActiveFarmsList(state, state.filtered);
    } catch (e) {
      box.innerHTML = `<div class="soft" style="padding:10px;">${esc(String(e.message || e))}</div>`;
    }
  }

  // ---------- TAB HANDLING ----------
  function showTab(which) {
    const tabs = [
      { btn: "#ncf-tab-browse",  pane: "#ncf-pane-browse"  },
      { btn: "#ncf-tab-creator", pane: "#ncf-pane-creator" },
      { btn: "#ncf-tab-stats",   pane: "#ncf-pane-stats"   },
      { btn: "#ncf-tab-help",    pane: "#ncf-pane-help"    }
    ];
    tabs.forEach(({ btn, pane }) => {
      const b = $(btn);
      const p = $(pane);
      const on = pane === `#ncf-pane-${which}`;
      if (b) b.setAttribute("aria-selected", on ? "true" : "false");
      if (p) p.style.display = on ? "" : "none";
    });
  }

  function bindBrowseEvents(state) {
    $("#ncf-refresh")?.addEventListener("click", () => loadActiveFarms(state));
    $("#ncf-search")?.addEventListener("input", (e) => {
      const q = e.target.value || "";
      state.filtered = filterFarms(state.farms || [], q);
      renderActiveFarmsList(state, state.filtered);
    });
    $("#ncf-back-list")?.addEventListener("click", () => {
      $("#ncf-detail-view").style.display = "none";
      $("#ncf-list-view").style.display = "";
    });
  }

  function bindTabsRoot(state) {
    $("#ncf-tab-browse")?.addEventListener("click", () => showTab("browse"));
    $("#ncf-tab-creator")?.addEventListener("click", () => showTab("creator"));
    $("#ncf-tab-stats")?.addEventListener("click", () => showTab("stats"));
    $("#ncf-tab-help")?.addEventListener("click", () => showTab("help"));
  }

  // ---------- PUBLIC INIT ----------
  function initNonCustodialFarms(opts = {}) {
    injectStyles();
    const cfg = { ...DEFAULTS, ...opts, endpoints: { ...DEFAULTS.endpoints, ...(opts.endpoints || {}) } };

    const host = cfg.containerId
      ? document.getElementById(cfg.containerId)
      : (() => {
          const d = document.createElement("div");
          d.id = "ncf-root-auto";
          document.body.appendChild(d);
          return d;
        })();

    createLayout(host, cfg);

    const state = {
      cfg,
      farms: [],
      filtered: [],
      currentFarmId: null
    };

    bindTabsRoot(state);
    bindBrowseEvents(state);
    showTab("browse");
    loadActiveFarms(state);

    // expose for debugging / future extensions (Part 2 hooks into same state)
    window.__NCF_STATE__ = state;
  }

// --- expose PART 1 live helpers for PART 2 ---
window.__NCF_API__ = Object.assign({}, window.__NCF_API__, {
  ensureCircState,
  fetchCirculatingLive,
  applyCirculatingToUI,
  startLiveCircPolling,
  stopLiveCircPolling,
});

// Back-compat export name (old code called this):
window.initNonCustodialFarms = initNonCustodialFarms;
window.initManageNFTsFarm = initNonCustodialFarms;
})();


/* noncustodial_farms.js — PART 2/2 (Creator Dashboard + Stats)
   Paste this *after* PART 1. Together they are one single JS.
*/
(function () {
  "use strict";

  // ---------- Tiny helpers (scoped; no conflicts with PART 1) ----------
  const $  = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const num = (v, d = 0) => (v == null || v === "" || isNaN(+v) ? d : +v);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const esc = (s) => String(s)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const nowPlusMin = (m)=>{const d=new Date(); d.setMinutes(d.getMinutes()+m); return d;};
  const toLoc = (d)=>{const p=(n)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  const parseLoc = (v)=>{const d=new Date(v); return isNaN(d.getTime())?null:d;};
  const selectionKey = (collection, schema, tid) => `${collection}::${schema}::${tid}`;
  const getWax = () => (window.userData?.wax_account || "").trim();
  const apiBase = (cfg) => cfg.apiBaseUrl || window.BASE_URL || window.API_BASE || location.origin;
  const buildUrl = (b, p) => `${String(b).replace(/\/+$/,"")}${p}`;
  const fetchJson = async (u,i)=>{const r=await fetch(u,i); if(!r.ok){const tx=await r.text().catch(()=> ""); throw new Error(`HTTP ${r.status} — ${tx||r.statusText}`);} const raw=await r.text(); try{return JSON.parse(raw);}catch{return raw;}};
  const postJson = (u,b)=>fetchJson(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
// ===== Bridge to PART 1 live helpers (must be loaded BEFORE this file) =====
const {
  ensureCircState,
  fetchCirculatingLive,
  applyCirculatingToUI,
  startLiveCircPolling,
  stopLiveCircPolling,
} = window.__NCF_API__ || {};

if (!fetchCirculatingLive || !applyCirculatingToUI) {
  console.error("NCF: PART 1 live helpers not loaded. Include PART 1 before PART 2.");
}

  // a second small toast (reuses same #ncf-toast node created by PART 1)
  const toast = (() => {
    let tmr = null;
    return (m, kind="info") => {
      let t = $("#ncf-toast");
      if(!t){
        t = document.createElement("div");
        t.id = "ncf-toast";
        document.body.appendChild(t);
      }
      t.textContent = m;
      t.dataset.kind = kind;
      t.classList.add("show");
      clearTimeout(tmr);
      tmr = setTimeout(()=>t.classList.remove("show"), 2600);
    };
  })();

  // ---------- Local storage (scoped keys; does not depend on PART 1 DEFAULTS) ----------
  const LS = {
    lastCollection: "ncf.lastCollection.v2",
    tokens: "ncf.tokens.v2",
    wizard: "ncf.wizard.v2",
    selection: "ncf.selection.v2",
    rewardsPerToken: "ncf.rewardsPerToken.daily.v1",
    expiry: "ncf.expiry.v2",
    autoMonitor: "ncf.autoMonitor.v2"
  };
  const rLS = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(f)); } catch { return f; } };
  const wLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ---------- Data accessors (Creator / Stats) ----------
  async function fetchFarmsForCreator(state){
    const wax = getWax();
    if(!wax) return [];
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.farmsByCreator) + `?creator=${encodeURIComponent(wax)}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = []; } }
    return Array.isArray(data) ? data : [];
  }
  async function fetchTemplatesBySchema(state, collection){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.templatesBySchema);
    let data = await postJson(url, { collection_name: collection });
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = {}; } }
    return data || {};
  }
  async function fetchFarmBalances(state){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.farmBalances);
    const wax = getWax();
    const qs = wax ? `?creator=${encodeURIComponent(wax)}` : "";
    let data = await fetchJson(url + qs);
    if (typeof data === "string") { try { data = JSON.parse(data); } catch { data = []; } }
    const m = new Map();
    (Array.isArray(data) ? data : []).forEach(x=>{
      const sym = (x.symbol || x.token_symbol || "").toUpperCase();
      if(!sym) return;
      m.set(sym, num(x.amount, 0));
    });
    return { map: m, ts: Date.now() };
  }
  async function fetchFarmStatsById(state, farmId){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.farmStats) + `?farm_id=${encodeURIComponent(farmId)}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = {}; } }
    return data || {};
  }
  async function fetchDistributions(state, farmId, limit=200){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.farmDistributions) + `?farm_id=${encodeURIComponent(farmId)}&limit=${limit}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = []; } }
    return Array.isArray(data) ? data : [];
  }
  async function fetchUserHistory(state, farmId, owner, limit=200){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.userHistory) + `?farm_id=${encodeURIComponent(farmId)}&owner=${encodeURIComponent(owner)}&limit=${limit}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = []; } }
    return Array.isArray(data) ? data : [];
  }
  async function postKick(state, body){
    const url = buildUrl(apiBase(state.cfg), state.cfg.endpoints.farmKick);
    return postJson(url, body);
  }

  // ---------- Wallet holdings helpers (for Twitch/Telegram internal wallets) ----------
  const twitchBalances = () => Array.isArray(window.twitchWalletBalances) ? window.twitchWalletBalances : [];
  const telegramBalances = () => Array.isArray(window.telegramWalletBalances) ? window.telegramWalletBalances : [];
  const sumHoldings = () => {
    const a=twitchBalances(), b=telegramBalances(), m=new Map();
    const add=(arr)=>arr.forEach(({symbol,amount})=>{ if(!symbol) return; const v=num(amount,0); m.set(symbol, num(m.get(symbol),0)+v); });
    add(a); add(b); return m;
  };
  const tokenOptsFromSource = (source) => {
    const list = source==="telegram" ? telegramBalances() : twitchBalances();
    const m = new Map();
    list.forEach(x=>{ const s=(x.symbol||"").toUpperCase(); if(!s) return; m.set(s, num(m.get(s),0)+num(x.amount,0)); });
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([symbol,amount])=>({symbol,amount}));
  };

  // ---------- Creator state bootstrap ----------
  function ensureCreatorState(state){
    if(!state.creator){
      state.creator = {
        collection: rLS(LS.lastCollection, ""),
        raw: null,
        search: "",
        schemaFilter: "",
        expandAll: true,
        selection: rLS(LS.selection, {}),
        tokens: rLS(LS.tokens, []),
        rewardsPerToken: rLS(LS.rewardsPerToken, {}),
        expiry: rLS(LS.expiry, {}),
        farmBalances: new Map(),
        farmBalancesTS: null,
        monitorId: null,
        wizard: rLS(LS.wizard, { step:"#ncf-step-a" }),
        _creatorFarms: []
      };
    }
  }

  // ---------- Creator UI (layout) ----------
  function mountCreatorDashboard(state){
    ensureCreatorState(state);
    const host = $("#ncf-pane-creator");
    if(!host) return;

    host.innerHTML = `
      <div class="grid" style="grid-template-columns: 1fr minmax(320px,420px); gap:18px;">
        <div id="ncf-creator-main" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:16px;">
            <h2 style="margin:0 0 .25rem 0;">Create / Edit Farm</h2>
            <div id="ncf-wizard" class="grid" style="gap:12px;">
              <!-- STEP A -->
              <div class="step" id="ncf-step-a">
                <h3 style="margin:.2rem 0;">Step 1 — Collection</h3>
                <div class="row">
                  <input id="ncf-collection" class="input" placeholder="AtomicAssets collection name (e.g. cryptochaos1)" style="min-width:280px;">
                  <button id="ncf-load" class="btn btn-primary">Load</button>
                  <div class="badge" id="ncf-meta">Ready</div>
                  <button id="ncf-refresh-farms" class="btn btn-ghost" title="Refresh your farms">My farms</button>
                </div>
                <div id="ncf-farms-box" class="soft" style="padding:10px; margin-top:8px;">
                  <div class="row" style="justify-content:space-between;">
                    <h4 style="margin:0;">Your farms (this creator)</h4>
                    <button id="ncf-reload-farms" class="btn btn-ghost">Refresh</button>
                  </div>
                  <div id="ncf-farms-list" class="grid" style="gap:8px; margin-top:6px;">
                    <div class="muted">No farms yet or not signed in.</div>
                  </div>
                </div>
              </div>

              <!-- STEP B -->
              <div class="step" id="ncf-step-b">
                <h3 style="margin:.2rem 0;">Step 2 — Funds & Deposit</h3>
                <div class="soft" style="padding:10px; display:grid; gap:10px;">
                  <div class="row">
                    <select id="ncf-src" class="input" style="min-width:180px;">
                      <option value="twitch">From Twitch Wallet</option>
                      <option value="telegram">From Telegram Wallet</option>
                    </select>
                    <select id="ncf-token" class="input" style="min-width:160px;"><option value="">Select token…</option></select>
                    <input id="ncf-amount" class="input" type="number" step="0.0001" min="0" placeholder="Amount" style="width:140px;">
                    <button id="ncf-max" class="btn btn-ghost">MAX</button>
                    <button id="ncf-deposit" class="btn">Deposit to Farm-Wallet</button>
                  </div>
                  <div id="ncf-bal-hint" class="muted">Balance: —</div>

                  <div id="ncf-empty" class="soft" style="display:none; padding:10px;">
                    <div class="badge warn">No available balance on this wallet</div>
                    <p class="muted" style="margin:.4rem 0 0;">Top up the internal wallet (memo shown below):</p>
                    <ul class="muted" style="margin:.2rem 0 0 1rem;">
						<li><strong>Twitch Wallet</strong> memo: <code>${esc(state.cfg.memoTwitch)}</code></li>
						<li><strong>Telegram Wallet</strong> memo: <code>${esc(state.cfg.memoTelegram)}</code></li>
                    </ul>
                    <div class="row" style="margin-top:8px;">
                      <button id="ncf-copy-account" class="btn btn-ghost">Copy account</button>
                      <button id="ncf-copy-tw" class="btn btn-ghost">Copy Twitch memo</button>
                      <button id="ncf-copy-tg" class="btn btn-ghost">Copy Telegram memo</button>
                    </div>
                  </div>
                </div>

                <div class="soft" style="padding:10px; margin-top:10px;">
                  <div class="row" style="justify-content:space-between;">
                    <h4 style="margin:0;">Farm-Wallet balances</h4>
                    <div class="row">
                      <button id="ncf-refresh-farm" class="btn btn-ghost">Refresh</button>
                      <label class="badge" style="cursor:pointer;">
                        <input id="ncf-auto" type="checkbox" style="margin-right:.5rem;"> Auto-monitor
                      </label>
                    </div>
                  </div>
                  <table style="margin-top:8px;">
                    <thead><tr><th>Token</th><th>Balance</th><th>Updated</th><th>Status</th></tr></thead>
                    <tbody id="ncf-farm-balances"><tr><td colspan="4" style="text-align:center;padding:10px;">No data</td></tr></tbody>
                  </table>
                  <div class="muted" id="ncf-user-hints" style="margin-top:8px;"></div>
                  <div id="ncf-farm-alert" class="soft" style="display:none; padding:8px; margin-top:8px;">
                    <div class="badge err">Some active reward tokens have zero Farm-Wallet balance</div>
                  </div>
                </div>

				<div class="row" style="margin-top:10px;">
				  <button id="ncf-prev-b" class="btn btn-ghost">Back</button>
				  <button id="ncf-cancel-b" class="btn btn-ghost">Cancel</button>
				  <button id="ncf-next-b" class="btn btn-primary" disabled>Continue</button>
				</div>

              </div>

              <!-- STEP C -->
              <div class="step" id="ncf-step-c">
                <h3 style="margin:.2rem 0;">Step 3 — Pick templates</h3>
                <div class="row" style="margin-bottom:8px;">
                  <input id="ncf-search-templates" class="input" placeholder="Search by Template ID or Name…" style="flex:1;min-width:240px;">
                  <select id="ncf-schema" class="input" style="min-width:180px;"><option value="">All schemas</option></select>
                  <button id="ncf-expand" class="btn btn-ghost" title="Expand or collapse all schemas">Collapse all</button>
                </div>
                <div id="ncf-table-wrap" style="overflow:auto; max-height:44vh;">
                  <div id="ncf-status" style="padding:8px;"></div>
                  <div id="ncf-sections"></div>
                </div>
				<div class="row" style="margin-top:8px;align-items:center;">
				  <span class="badge" id="ncf-count-schemas">Schemas: 0</span>
				  <span class="badge" id="ncf-count-templates">Templates: 0</span>
				  <span class="badge ok" id="ncf-count-selected">Selected: 0</span>
				  <div style="margin-left:auto;">
				    <button id="ncf-prev-c" class="btn btn-ghost">Back</button>
				    <button id="ncf-cancel-c" class="btn btn-ghost">Cancel</button>
				    <button id="ncf-select-all" class="btn btn-ghost" title="Select all visible">Select all</button>
				    <button id="ncf-clear" class="btn btn-ghost" title="Clear selection">Clear</button>
				    <button id="ncf-next-c" class="btn btn-primary" disabled>Continue</button>
				  </div>
				</div>
              </div>

              <!-- STEP D -->
              <div class="step" id="ncf-step-d">
                <h3 style="margin:.2rem 0;">Step 4 — Configure rewards (per asset, daily)</h3>
                <div id="ncf-stepd-summary" class="soft" style="padding:8px; position:sticky; top:0; z-index:5; margin-bottom:8px;">
                  <div class="row" style="gap:10px; flex-wrap:wrap;">
                    <span class="badge" id="ncf-sel-count">Selected: 0</span>
                    <span class="badge" id="ncf-active-tokens">Active tokens: 0</span>
                    <span class="badge ok" id="ncf-daily-cost" title="Estimated daily payout by token">Est. daily payout: —</span>
                  </div>
                </div>
                <div class="muted" style="margin:0 0 8px;">
                  Choose tokens and set the <strong>daily amount per asset_id</strong> for each selected template.
                  Expiration can only be extended. Tokens are <em>never</em> aggregated across symbols.
                </div>
                <div id="ncf-rp-body" class="grid" style="gap:10px;">
                  <div class="soft" style="padding:12px; text-align:center;">No templates selected yet.</div>
                </div>
				<div class="row" style="margin-top:10px;">
				  <button id="ncf-prev-d" class="btn btn-ghost">Back</button>
				  <button id="ncf-cancel-d" class="btn btn-ghost">Cancel</button>
				  <button id="ncf-save-draft" class="btn" disabled>Save Draft</button>
				  <button id="ncf-next-d" class="btn btn-primary" disabled>Continue</button>
				</div>

              </div>

              <!-- STEP E -->
              <div class="step" id="ncf-step-e">
                <h3 style="margin:.2rem 0;">Step 5 — Summary & Save</h3>
                <div class="muted" style="margin:0 0 8px;">
                  Summary of the configuration and Farm-Wallet balance check for the active tokens.
                </div>
                <div id="ncf-summary" class="soft" style="padding:10px;"></div>
				<div class="row" style="margin-top:10px;">
				  <button id="ncf-prev-e" class="btn btn-ghost">Back</button>
				  <button id="ncf-cancel-e" class="btn btn-ghost">Cancel</button>
				  <button id="ncf-confirm" class="btn btn-primary" disabled>Confirm & Save</button>
				</div>
              </div>
            </div>
          </section>

		<section id="ncf-collapsed" class="cy-card" style="padding:12px; display:none;">
		  <div class="row" style="justify-content:space-between;align-items:center;">
		    <div class="row" style="gap:.6rem;">
		      <strong>Farm configuration saved</strong>
		      <span class="badge ok">Saved</span>
		    </div>
		    <div class="row" style="gap:.5rem;">
		      <button id="ncf-edit-again" class="btn btn-ghost" title="Edit current config">Edit</button>
		      <button id="ncf-back-start" class="btn btn-ghost" title="Back to Step 1">Back to start</button>
		    </div>
		  </div>
		</section>

          <section id="ncf-summary-table" class="cy-card" style="padding:14px; display:none;">
            <h3 style="margin:.2rem 0;">Current Farm</h3>
            <div id="ncf-farm-table"></div>
          </section>
        </div>

        <!-- RIGHT: Tokens Library -->
        <aside id="ncf-rightpanel" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:14px;">
            <h3 style="margin:.1rem 0 .5rem;">Tokens Library</h3>
            <div class="muted" style="margin-bottom:.5rem;">
              Add tokens you intend to use as rewards. Sorting prioritizes tokens you hold in internal wallets.
            </div>
            <div class="grid" style="gap:10px;">
              <div class="row">
                <input id="ncf-tok-contract" class="input" placeholder="Token contract (e.g. eosio.token)" style="min-width:220px;">
                <input id="ncf-tok-symbol" class="input" placeholder="Symbol (e.g. WAX)" style="width:120px;">
                <input id="ncf-tok-dec" class="input" type="number" min="0" max="18" step="1" placeholder="Decimals" style="width:120px;">
                <button id="ncf-tok-add" class="btn">Add</button>
              </div>
              <div id="ncf-token-list" class="row" style="flex-wrap:wrap;"></div>
              <div class="muted">Tokens are sorted by what you currently hold across Twitch/Telegram wallets.</div>
            </div>
          </section>
        </aside>
      </div>
    `;

    // preload field(s)
    $("#ncf-collection").value = state.creator.collection || "";

    // attach handlers
    bindCreatorHandlers(state);
    // initial farms list + token library + balances panel
    loadCreatorFarms(state);
    renderTokenLibrary(state);
    updateTopupPanel(state);
    if (rLS(LS.autoMonitor, false)) {
      const auto = $("#ncf-auto"); if (auto) auto.checked = true;
      startAutoBalances(state);
    }
    // show step A by default
    wizardGo(state, state.creator.wizard.step || "#ncf-step-a");
  }

  // ---------- Token library ----------
  function renderTokenLibrary(state){
    const list=$("#ncf-token-list");
    const holdings=sumHoldings();
    const arr=state.creator.tokens.slice().sort((a,b)=>num(holdings.get(b.symbol),0)-num(holdings.get(a.symbol),0));
    if(!arr.length){ list.innerHTML=`<div class="muted">No tokens configured. Add some above.</div>`; return; }
    list.innerHTML=arr.map(t=>{
      const held=num(holdings.get(t.symbol),0);
      const hint=held>0?`<span class="badge ok">You hold ${fmt(held)} ${esc(t.symbol)}</span>`:`<span class="badge">No local balance</span>`;
      return `<div class="soft" data-id="${esc(t.contract)}:${esc(t.symbol)}" style="padding:8px; display:flex; align-items:center; justify-content:space-between; gap:10px; min-width:260px;">
        <div class="row"><strong>${esc(t.symbol)}</strong><small class="muted">@${esc(t.contract)}</small><small class="muted">dec:${t.decimals??"—"}</small></div>
        <div class="row">${hint}<button class="btn btn-ghost ncf-token-del">Remove</button></div>
      </div>`;
    }).join("");
    $$("#ncf-token-list .ncf-token-del").forEach(btn=>{
      btn.addEventListener("click",e=>{
        const pill=e.target.closest("[data-id]"); const [c,s]=pill.dataset.id.split(":");
        state.creator.tokens=state.creator.tokens.filter(x=>!(x.contract===c&&x.symbol===s));
        Object.keys(state.creator.rewardsPerToken).forEach(k=>{ if(state.creator.rewardsPerToken[k]) delete state.creator.rewardsPerToken[k][`${c}:${s}`];});
        wLS(LS.tokens,state.creator.tokens); wLS(LS.rewardsPerToken,state.creator.rewardsPerToken);
        renderTokenLibrary(state); updateRewardsPanel(state);
      });
    });
  }

  // ---------- Wizard helpers ----------
  function wizardGo(state, id){
    $$("#ncf-wizard .step").forEach(x=>x.style.display="none");
    const el = $(id);
    if(el){ el.style.display = ""; }
    state.creator.wizard.step=id;
    wLS(LS.wizard, state.creator.wizard);
  }

  function updateCTAState(state){
    const selOfThis = Object.values(state.creator.selection).filter(x => x.collection === state.creator.collection);
    const hasSel = selOfThis.length > 0;

    const hasAnyPositive = selOfThis.some(x => {
      const k = `${x.collection}::${x.schema_name}::${x.template_id}`;
      const m = state.creator.rewardsPerToken[k] || {};
      return Object.values(m).some(v => String(v).trim() !== "" && Number(v) > 0);
    });

    const set = (id, on) => { const el = document.getElementById(id); if(el) { el.disabled = !on; } };

    set("ncf-next-b", !!state.creator.collection);
    set("ncf-next-c", hasSel);
    set("ncf-save-draft", hasSel && hasAnyPositive);
    set("ncf-next-d",    hasSel && hasAnyPositive);
    set("ncf-confirm",   hasSel && hasAnyPositive);
  }

  function refreshStep4Summary(state){
    const sel = Object.values(state.creator.selection).filter(x => x.collection === state.creator.collection);
    const badgeSel = document.getElementById("ncf-sel-count");
    const badgeTok = document.getElementById("ncf-active-tokens");
    const badgePay = document.getElementById("ncf-daily-cost");
    if(!badgeSel || !badgeTok || !badgePay) return;

    badgeSel.textContent = `Selected: ${sel.length}`;

    // sum per token (never across symbols)
    const perToken = new Map();
	sel.forEach(x => {
	  const k = `${x.collection}::${x.schema_name}::${x.template_id}`;
	  const rewards = state.creator.rewardsPerToken[k] || {};
	  const circ = enrichFromTable(x.schema_name, x.template_id).circulating_supply || 0; // <-- moltiplicatore
	  Object.entries(rewards).forEach(([id, v]) => {
	    const [, sym] = id.split(":");
	    const perAssetDaily = Number(v) || 0;
	    const contrib = perAssetDaily > 0 ? perAssetDaily * circ : 0;
	    if (contrib > 0) perToken.set(sym, (perToken.get(sym) || 0) + contrib);
	  });
	});

    badgeTok.textContent = `Active tokens: ${perToken.size}`;
    const parts = Array.from(perToken.entries()).map(([s,a]) => `${s}: ${a}/day`);
    badgePay.textContent = parts.length ? `Est. daily payout: ${parts.join(" · ")}` : "Est. daily payout: —";
  }

  // ---------- Step A load collection ----------
  function renderSkeleton(el){ el.innerHTML=`<div class="soft" style="padding:1rem; text-align:center;"><div style="height:12px; width:240px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div><div style="height:12px; width:320px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div></div>`; }

  function sectionId(name){ return `ncf-sec-${name.replace(/[^a-z0-9]+/gi,"-")}`; }
  function th(l,k){ return `<th data-key="${k}" aria-sort="none">${l}</th>`; }
  const percent = (i,m)=>{i=num(i,0);m=num(m,0); if(!isFinite(i)||!isFinite(m)||m<=0) return "—"; return `${clamp((i/m)*100,0,100).toFixed(1)}%`;};
  function rowHtml(schemaName,t,checked){
    const pct=percent(t.circulating_supply,t.max_supply);
    return `<tr data-tid="${t.template_id}">
      <td style="width:44px;"><input type="checkbox" class="ncf-row-check"${checked?" checked":""}></td>
      <td><button class="btn btn-ghost ncf-id-btn" style="padding:.2rem .5rem;">${t.template_id}</button></td>
      <td>${esc(t.template_name||"—")}</td>
      <td>${fmt(t.circulating_supply)}</td>
      <td>${t.max_supply==null?"—":fmt(t.max_supply)}</td>
      <td>${pct}</td></tr>`;
  }

  function bindSection(state, sid, schema){
    const sec=document.getElementById(sid);
    const table=$("table",sec);
    const head=$(".ncf-head-check",sec);

    $(".ncf-sec-select",sec).addEventListener("click",()=>{
      $$("tbody tr",table).forEach(r=>{
        const chk=$(".ncf-row-check",r);
        if(!chk.checked) chk.checked=true;
        setSelected(state,state.creator.collection,schema.schema_name,Number(r.dataset.tid),true);
      });
      updateRewardsPanel(state);
    });
    $(".ncf-sec-clear",sec).addEventListener("click",()=>{
      $$("tbody tr",table).forEach(r=>{
        const chk=$(".ncf-row-check",r);
        if(chk.checked) chk.checked=false;
        setSelected(state,state.creator.collection,schema.schema_name,Number(r.dataset.tid),false);
      });
      updateRewardsPanel(state);
    });

    $$("thead th[data-key]",table).forEach(h=>{
      h.addEventListener("click",()=>{
        const key=h.dataset.key; const dir=h.getAttribute("aria-sort")==="ascending"?-1:1;
        $$("thead th[data-key]",table).forEach(x=>x.setAttribute("aria-sort","none")); h.setAttribute("aria-sort",dir===1?"ascending":"descending");
        const tb=table.tBodies[0]; const rows=Array.from(tb.rows);
        const get=(tr)=>{ if(key==="template_id") return Number($(".ncf-id-btn",tr).textContent.trim());
          if(key==="template_name") return tr.children[2].textContent.trim().toLowerCase();
          if(key==="circulating_supply") return Number(tr.children[3].textContent.replace(/[^\d]/g,""))||0;
          if(key==="max_supply"){ const s=tr.children[4].textContent.trim(); return s==="—"?-1:Number(s.replace(/[^\d]/g,""))||0;}
          if(key==="pct"){ const s=tr.children[5].textContent.trim(); return s==="—"?-1:Number(s.replace("%",""))||0;} return 0; };
        rows.sort((a,b)=>{const va=get(a),vb=get(b); if(va<vb) return -1*dir; if(va>vb) return 1*dir; return 0;});
        rows.forEach(r=>tb.appendChild(r));
      });
    });

    $$(".ncf-id-btn",sec).forEach(btn=>btn.addEventListener("click",()=>navigator.clipboard.writeText(btn.textContent.trim()).then(()=>toast("Template ID copied"))));
    $$(".ncf-row-check",sec).forEach(chk=>chk.addEventListener("change",e=>{
      const tr=e.target.closest("tr");
      setSelected(state,state.creator.collection,schema.schema_name,Number(tr.dataset.tid),e.target.checked);
      updateRewardsPanel(state);
    }));
    head.addEventListener("change",e=>{
      $$("tbody tr",table).forEach(r=>{
        const chk=$(".ncf-row-check",r);
        chk.checked=e.target.checked;
        setSelected(state,state.creator.collection,schema.schema_name,Number(r.dataset.tid),e.target.checked);
      });
      updateRewardsPanel(state);
    });
  }

  function renderSections(state, el, data){
    const search=(state.creator.search||"").toLowerCase().trim();
    const f=state.creator.schemaFilter||"";
    const filtered=(data.schemas||[])
      .filter(s=>!f||s.schema_name===f)
      .map(s=>{
        if(!search) return s;
        const ft=s.templates.filter(t=>String(t.template_id).includes(search)||(t.template_name||"").toLowerCase().includes(search));
        return {...s,templates:ft};
      })
      .filter(s=>(s.templates||[]).length>0);
    const totalSchemas=filtered.length;
    const totalTemplates=filtered.reduce((a,s)=>a+(s.templates?.length||0),0);
    $("#ncf-count-schemas").textContent=`Schemas: ${totalSchemas}`;
    $("#ncf-count-templates").textContent=`Templates: ${totalTemplates}`;
    if(!totalTemplates){ el.innerHTML=`<div class="soft" style="padding:14px; text-align:center;">No results. Try different filters.</div>`; return; }
    el.innerHTML=filtered.map(s=>{
      const sid=sectionId(s.schema_name); const open=state.creator.expandAll?" open":"";
      return `<details class="ncf-section"${open} id="${sid}">
        <summary style="display:flex; align-items:center; gap:.6rem; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.08);">
          <span><strong>${esc(s.schema_name)}</strong></span><span class="badge">${s.templates.length}</span>
          <div style="margin-left:auto;" class="row">
            <button class="btn btn-ghost ncf-sec-select">Select schema</button>
            <button class="btn btn-ghost ncf-sec-clear">Clear</button>
          </div>
        </summary>
        <div style="overflow:auto;">
          <table class="ncf-table" data-schema="${esc(s.schema_name)}">
            <thead><tr>
              <th style="width:44px;"><input type="checkbox" class="ncf-head-check" title="Select visible"></th>
              ${th("ID","template_id")}${th("Name","template_name")}${th("Circulating","circulating_supply")}${th("Max","max_supply")}${th("% Mint","pct")}
            </tr></thead>
            <tbody>${(s.templates||[]).map(t=>rowHtml(s.schema_name,t,!!state.creator.selection[selectionKey(state.creator.collection,s.schema_name,t.template_id)])).join("")}</tbody>
          </table>
        </div></details>`;
    }).join("");
    filtered.forEach(s=>bindSection(state, sectionId(s.schema_name), s));
  }

  function loadCreatorFarms(state){
    const box = $("#ncf-farms-list");
    if(!box) return;
    box.innerHTML = `<div class="muted">Loading…</div>`;
    fetchFarmsForCreator(state).then(farms=>{
      state.creator._creatorFarms = farms || [];
      if (!Array.isArray(farms) || !farms.length){
        box.innerHTML = `<div class="muted">No farms yet for this creator.</div>`;
        return;
      }
      box.innerHTML = farms.map(f => {
        const col = f.collection || "";
        const id  = String(f.farm_id ?? "—");
        return `
          <div class="soft" style="padding:8px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div class="row">
              <strong>${esc(col)}</strong>
              <small class="muted">#${esc(id)}</small>
            </div>
            <div class="row">
              <button class="btn btn-ghost ncf-farm-edit"  data-col="${esc(col)}">Edit</button>
              <button class="btn btn-ghost ncf-farm-stats" data-id="${esc(id)}">Stats</button>
            </div>
          </div>`;
      }).join("");
      $$("#ncf-farms-list .ncf-farm-edit").forEach(b=>{
        b.addEventListener("click", () => {
          const col = b.dataset.col || "";
          $("#ncf-collection").value = col;
          doLoadCollection(state);
          wizardGo(state, "#ncf-step-b");
        });
      });
      $$("#ncf-farms-list .ncf-farm-stats").forEach(b=>{
        b.addEventListener("click", () => {
          const id = b.dataset.id;
          // switch to Stats tab and pre-load that farm
          $("#ncf-tab-stats")?.click();
          ensureStatsPaneMounted(state, id);
        });
      });
    }).catch(e=>{
      box.innerHTML = `<div class="muted">${esc(String(e.message||e))}</div>`;
    });
  }

  // ---------- Balances table (Step B) ----------
  function activeTokenIds(state){
    const ids=new Set(); Object.values(state.creator.rewardsPerToken).forEach(m=>{ if(!m) return; Object.keys(m).forEach(id=>ids.add(id)); }); return ids;
  }
  function renderFarmBalances(state){
    const tb = $("#ncf-farm-balances");
    const last = state.creator.farmBalancesTS ? new Date(state.creator.farmBalancesTS) : null;
    const ts = last ? last.toLocaleString() : "—";

    const ids = activeTokenIds(state);
    const rows = [];
    let anyZero = false;

    if (ids.size) {
      ids.forEach(id => {
        const [c,s] = id.split(":");
        const bal = num(state.creator.farmBalances.get(s), 0);
        const st = bal > 0 ? `<span class="badge ok">OK</span>` : `<span class="badge err">0</span>`;
        if (bal <= 0) anyZero = true;
        rows.push(
          `<tr>
             <td><strong>${esc(s)}</strong> <small class="muted">@${esc(c)}</small></td>
             <td>${fmt(bal)}</td>
             <td>${ts}</td>
             <td>${st}</td>
           </tr>`
        );
      });
    } else {
      if (state.creator.farmBalances && state.creator.farmBalances.size) {
        Array.from(state.creator.farmBalances.entries())
          .sort((a,b)=>b[1]-a[1])
          .forEach(([symbol, bal]) => {
            const st = bal > 0 ? `<span class="badge ok">OK</span>` : `<span class="badge err">0</span>`;
            if (bal <= 0) anyZero = true;
            rows.push(
              `<tr>
                 <td><strong>${esc(symbol)}</strong></td>
                 <td>${fmt(bal)}</td>
                 <td>${ts}</td>
                 <td>${st}</td>
               </tr>`
            );
          });
      }
    }

    tb.innerHTML = rows.length
      ? rows.join("")
      : `<tr><td colspan="4" style="text-align:center;padding:10px;">No balances</td></tr>`;

    $("#ncf-farm-alert").style.display = (ids.size && anyZero) ? "" : "none";

    if (!ids.size) {
      $("#ncf-user-hints").innerHTML =
        `<p class="muted" style="margin:0;">Tip: add a token in the Tokens Library to mark it as “active” in Step 4.</p>`;
    } else {
      const holdings = sumHoldings();
      const hints = [];
      ids.forEach(id => {
        const [, symbol] = id.split(":");
        const have = num(holdings.get(symbol), 0);
        if (have > 0) hints.push(`You hold <strong>${fmt(have)} ${esc(symbol)}</strong> across Twitch/Telegram wallets.`);
      });
      $("#ncf-user-hints").innerHTML = hints.length
        ? `<p class="muted" style="margin:0;">${hints.join(" ")}</p>`
        : `<p class="muted" style="margin:0;">No local balances detected for your active tokens.</p>`;
    }
  }

async function refreshFarmWalletBalances(state){
  // se non sei loggato, non chiamare l'endpoint
  if (!getWax()) {
    state.creator.farmBalances = new Map();
    state.creator.farmBalancesTS = Date.now();
    renderFarmBalances(state);
    return;
  }
  try{
    const res = await fetchFarmBalances(state);
    state.creator.farmBalances = res.map;
    state.creator.farmBalancesTS = res.ts;
    renderFarmBalances(state);
  }catch(e){
    toast(String(e.message||e), "error");
  }
}

  function startAutoBalances(state){
    stopAutoBalances(state);
    state.creator.monitorId = setInterval(()=>refreshFarmWalletBalances(state), 120*1000);
  }
  function stopAutoBalances(state){
    if(state.creator.monitorId){ clearInterval(state.creator.monitorId); state.creator.monitorId=null; }
  }
  function updateTopupPanel(state){
    const src=$("#ncf-src")?.value||"twitch";
    const tok=$("#ncf-token"); const amt=$("#ncf-amount"); const hint=$("#ncf-bal-hint"); const empty=$("#ncf-empty");
    if(!tok||!amt||!hint||!empty) return;
    const opts=tokenOptsFromSource(src);
    const cur=tok.value;
    tok.innerHTML=`<option value="">Select token…</option>`+opts.map(o=>`<option value="${o.symbol}">${o.symbol} — balance ${fmt(o.amount)}</option>`).join("");
    const first=opts.find(o=>o.amount>0)?.symbol||"";
    tok.value=opts.some(o=>o.symbol===cur)?cur:first;
    const sym=tok.value||""; const bal=num(opts.find(o=>o.symbol===sym)?.amount,0);
    hint.textContent=`Balance: ${fmt(bal)} ${sym||""}`;
    amt.value="";
    empty.style.display=opts.some(o=>o.amount>0)?"none":"";
  }
  async function performTopUp(state){
    const src=($("#ncf-src").value||"twitch").toLowerCase();
    const sym=($("#ncf-token").value||"").toUpperCase();
    const amt=Number($("#ncf-amount").value||"0");
    if(!sym){ toast("Select a token.","error"); return; }
    if(!(amt>0)){ toast("Enter a positive amount.","error"); return; }
    const opts=tokenOptsFromSource(src); const bal=num(opts.find(o=>o.symbol===sym)?.amount,0);
    if(amt>bal){ toast("Amount exceeds your wallet balance.","error"); return; }
    const tc=(state.creator.tokens.find(t=>(t.symbol||"").toUpperCase()===sym)?.contract)||null;
    const payload={creator_wax_account:getWax()||null, source:src, token_symbol:sym, token_contract:tc||undefined, amount:amt};
    try{
      const res=await postJson(buildUrl(apiBase(state.cfg),state.cfg.endpoints.depositToFarm), payload);
      if(!res||res.ok!==true) throw new Error("Deposit failed");
      toast("Deposit completed.");
      if(res.balances?.twitch) window.twitchWalletBalances=res.balances.twitch;
      if(res.balances?.telegram) window.telegramWalletBalances=res.balances.telegram;
      updateTopupPanel(state); await refreshFarmWalletBalances(state);
    }catch(e){ toast(String(e.message||e),"error");}
  }

  // ---------- Step C selection ----------
  function setSelected(state, collection, schema, tid, on){
    const k=selectionKey(collection,schema,tid);
    if(on) state.creator.selection[k]={collection,schema_name:schema,template_id:tid};
    else { delete state.creator.selection[k]; delete state.creator.rewardsPerToken[k]; delete state.creator.expiry[k]; }
    wLS(LS.selection,state.creator.selection); wLS(LS.rewardsPerToken,state.creator.rewardsPerToken); wLS(LS.expiry,state.creator.expiry);
    updateSelectedCount(state);
    updateCTAState(state);
    refreshStep4Summary(state);
  }
  function updateSelectedCount(state){
    const c=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection).length;
    $("#ncf-count-selected").textContent=`Selected: ${c}`;
    updateCTAState(state);
    refreshStep4Summary(state);
  }

  // ---------- Step D rewards panel ----------
function enrichFromTable(schemaName, tid){
  // prova dalla mappa live prima
  const st = window.__NCF_STATE__;
  const circ = st ? ensureCircState(st) : null;
  const live = circ?.map?.get(Number(tid)) || null;

  // fallback: DOM (vecchi valori visuali se live ancora non pronto)
  let name = null, circDom = 0, maxDom = null;
  const sid = sectionId(schemaName);
  const row = document.querySelector(`#${sid} tr[data-tid="${tid}"]`);
  if (row) {
    name = row.children[2].textContent.trim() || null;
    circDom = Number(row.children[3].textContent.replace(/[^\d]/g,"")) || 0;
    const m = row.children[4].textContent.trim();
    maxDom = (m === "—" ? null : Number(m.replace(/[^\d]/g,"")) || 0);
  }

  return {
    template_name: name,
    circulating_supply: live ? live.circ : circDom,
    max_supply: live ? live.max : maxDom
  };
}


  function updateRewardsPanel(state){
    updateSelectedCount(state);
    const sel=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection);
    const body=$("#ncf-rp-body");
    if(!sel.length){ body.innerHTML=`<div class="soft" style="padding:12px;text-align:center;">No templates selected yet.</div>`; return; }
    const tokens=state.creator.tokens;
    body.innerHTML=sel.map(s=>{
      const k=selectionKey(s.collection,s.schema_name,s.template_id);
      const meta=enrichFromTable(s.schema_name,s.template_id);
      const minISO=toLoc(nowPlusMin(5));
      const exISO=state.creator.expiry[k]||"";
      const chips=tokens.map(t=>{
        const id=`${t.contract}:${t.symbol}`;
        const on=!!(state.creator.rewardsPerToken[k]&&state.creator.rewardsPerToken[k][id]!==undefined);
        return `<label class="badge ${on?"ok":""}" style="cursor:pointer;" data-key="${esc(k)}" data-token="${esc(id)}">
                  <input type="checkbox" style="display:none"${on?" checked":""}/>
                  <strong>${esc(t.symbol)}</strong> <small class="muted">@${esc(t.contract)}</small>
                </label>`;
      }).join("") || `<div class="muted">Add tokens in the right panel.</div>`;
      const inputs = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const on = !!(state.creator.rewardsPerToken[k] && state.creator.rewardsPerToken[k][id] !== undefined);
        const v  = on ? (state.creator.rewardsPerToken[k][id] ?? "") : "";
        const show = on ? "" : "display:none;";
        return `<div class="row ncf-reward-row" data-key="${esc(k)}" data-token="${esc(id)}" style="${show}">
          <span class="muted" style="min-width:160px;"><strong>${esc(t.symbol)}</strong> <small>@${esc(t.contract)}</small></span>
          <input type="number" class="input ncf-reward-input" step="0.0001" min="0" placeholder="Reward per asset(NFT) each day" value="${String(v)}" style="width:220px;">
        </div>`;
      }).join("");
      return `<div class="soft" style="padding:10px;" data-item="${esc(k)}">
        <div class="row" style="justify-content:space-between;">
          <div class="row" style="gap:.5rem;">
            <strong>${esc(s.schema_name)}</strong>
            <span class="muted">ID <button class="btn btn-ghost ncf-id-btn" style="padding:.15rem .5rem;">${s.template_id}</button></span>
          </div>
          <button class="btn btn-ghost ncf-remove">Remove</button>
        </div>
        <div class="muted" style="margin:.25rem 0 .5rem;">${esc(meta.template_name||"—")} · Circulating: ${fmt(meta.circulating_supply)} · Max: ${meta.max_supply==null?"—":fmt(meta.max_supply)}</div>
        <div class="grid" style="gap:8px;">
          <div class="row" style="align-items:flex-end;">
            <div class="row">
              <label class="muted" style="margin-right:.5rem;"><small>Max validity</small></label>
              <input type="datetime-local" class="input ncf-expiry" min="${minISO}" value="${exISO?toLoc(new Date(exISO)):""}" style="min-width:220px;">
            </div>
            <button class="btn btn-ghost ncf-plus7">+7d</button>
            <button class="btn btn-ghost ncf-plus30">+30d</button>
          </div>
          <div class="row ncf-token-chips" style="flex-wrap:wrap;">${chips}</div>
          <div class="col"><div class="ncf-token-inputs">${inputs}</div></div>
        </div>
      </div>`;
    }).join("");

    $$("#ncf-rp-body .ncf-id-btn").forEach(b=>b.addEventListener("click",()=>navigator.clipboard.writeText(b.textContent.trim()).then(()=>toast("Template ID copied"))));
    $$("#ncf-rp-body .ncf-remove").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const obj=state.creator.selection[k]; if(!obj) return;
      const sid=sectionId(obj.schema_name); const row=$(`#${sid} tr[data-tid="${obj.template_id}"]`); if(row){ const chk=$(".ncf-row-check",row); if(chk) chk.checked=false; }
      delete state.creator.selection[k]; delete state.creator.rewardsPerToken[k]; delete state.creator.expiry[k];
      wLS(LS.selection,state.creator.selection); wLS(LS.rewardsPerToken,state.creator.rewardsPerToken); wLS(LS.expiry,state.creator.expiry);
      updateRewardsPanel(state);
    }));
    $$("#ncf-rp-body .ncf-expiry").forEach(inp=>inp.addEventListener("change",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const nd=parseLoc(e.target.value);
      if(!nd){ delete state.creator.expiry[k]; wLS(LS.expiry,state.creator.expiry); return; }
      const prev=state.creator.expiry[k]?new Date(state.creator.expiry[k]):null; if(prev && nd<prev){ e.target.value=toLoc(prev); toast("Expiration can only be extended.","error"); return; }
      state.creator.expiry[k]=nd.toISOString(); wLS(LS.expiry,state.creator.expiry);
    }));
    $$("#ncf-rp-body .ncf-plus7").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const inp=$(".ncf-expiry",box);
      const base=state.creator.expiry[k]?new Date(state.creator.expiry[k]):nowPlusMin(5); const d=new Date(base); d.setDate(d.getDate()+7);
      state.creator.expiry[k]=d.toISOString(); wLS(LS.expiry,state.creator.expiry); inp.value=toLoc(d);
    }));
    $$("#ncf-rp-body .ncf-plus30").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const inp=$(".ncf-expiry",box);
      const base=state.creator.expiry[k]?new Date(state.creator.expiry[k]):nowPlusMin(5); const d=new Date(base); d.setDate(d.getDate()+30);
      state.creator.expiry[k]=d.toISOString(); wLS(LS.expiry,state.creator.expiry); inp.value=toLoc(d);
    }));

    // chips delegation
    if (!state.creator._chipDelegationBound) {
      document.getElementById("ncf-rp-body").addEventListener("click", (e) => {
        const chip = e.target.closest(".ncf-token-chips .badge");
        if (!chip) return;
        e.preventDefault();
        chip.classList.toggle("ok");
        const k  = chip.dataset.key;
        const id = chip.dataset.token;
        const on = chip.classList.contains("ok");
        state.creator.rewardsPerToken[k] = state.creator.rewardsPerToken[k] || {};
        if (on) {
          if (state.creator.rewardsPerToken[k][id] === undefined) state.creator.rewardsPerToken[k][id] = "";
        } else {
          delete state.creator.rewardsPerToken[k][id];
        }
        wLS(LS.rewardsPerToken,state.creator.rewardsPerToken);
        // show/hide input row
        const row = document.querySelector(`.ncf-reward-row[data-key="${CSS.escape(k)}"][data-token="${CSS.escape(id)}"]`);
        if (row) row.style.display = on ? "" : "none";
        updateCTAState(state);
        refreshStep4Summary(state);
      });
      state.creator._chipDelegationBound = true;
    }
    $$("#ncf-rp-body .ncf-reward-input").forEach(inp=>inp.addEventListener("input",e=>{
      const row=e.target.closest(".ncf-reward-row"); const k=row.dataset.key; const id=row.dataset.token;
      state.creator.rewardsPerToken[k]=state.creator.rewardsPerToken[k]||{}; state.creator.rewardsPerToken[k][id]=e.target.value; wLS(LS.rewardsPerToken,state.creator.rewardsPerToken);
      updateCTAState(state);
      refreshStep4Summary(state);
    }));

    updateCTAState(state);
    refreshStep4Summary(state);
  }

  // ---------- Build payload + summary ----------
  function buildDraftPayload(state){
    const items = Object.values(state.creator.selection)
      .filter(x => x.collection === state.creator.collection)
      .map(x => {
        const k = `${x.collection}::${x.schema_name}::${x.template_id}`;
        const expiry = state.creator.expiry[k] || null;
        const per = state.creator.rewardsPerToken[k] || {};
        const rewards = [];

        Object.entries(per).forEach(([id, v]) => {
          const amount = Number(v);
          if (!isFinite(amount) || amount <= 0) return;
          const [contract, symbol] = id.split(":");
          const meta = state.creator.tokens.find(t => t.contract === contract && t.symbol === symbol) || {};
          rewards.push({
            token_contract: contract,
            token_symbol: symbol,
            decimals: meta.decimals ?? null,
            reward_per_asset_per_day: amount
          });
        });

        return { schema_name: x.schema_name, template_id: Number(x.template_id), expiry, rewards };
      });

    return {
      collection: state.creator.collection,
      creator_wax_account: getWax() || null,
      policy: {
        distribution: "daily",
        semantics: "Rewards are per asset_id per day. Expiration can only be extended.",
        payout_time_cet: "14:00",
        non_custodial: "NFTs remain in the owner wallets; eligibility by template_id."
      },
      tokens_catalog: state.creator.tokens,
      total_selected: items.length,
      items
    };
  }

  function renderSummary(state){
    const fw=[];
    activeTokenIds(state).forEach(id=>{ const [,s]=id.split(":"); fw.push({symbol:s,balance:num(state.creator.farmBalances.get(s),0)});});
    const rows=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection).map(x=>{
      const k=selectionKey(x.collection,x.schema_name,x.template_id);
      const per=state.creator.rewardsPerToken[k]||{}; const exp=state.creator.expiry[k]?new Date(state.creator.expiry[k]).toLocaleString():"—";
      const rr=Object.entries(per).filter(([,v])=>Number(v)>0).map(([id,v])=>{ const [,s]=id.split(":"); return `${esc(s)}: ${v}/day`; }).join(", ") || "—";
      const meta=enrichFromTable(x.schema_name,x.template_id);
      return `<tr><td>${esc(x.schema_name)} <small class="muted">ID ${x.template_id} — ${esc(meta.template_name||"—")}</small></td><td>${rr}</td><td>${esc(exp)}</td></tr>`;
    }).join("");
    const fwRows=fw.length?fw.map(t=>`<li>${esc(t.symbol)} — Farm balance: <strong>${fmt(t.balance)}</strong></li>`).join(""):"<li>No active tokens</li>";
    $("#ncf-summary").innerHTML=`<div class="grid" style="gap:8px;">
      <div class="row"><strong>Collection:</strong> <span>${esc(state.creator.collection)}</span></div>
      <div class="row"><strong>Creator:</strong> <span>${esc(getWax()||"—")}</span></div>
      <div class="soft" style="padding:8px;"><div class="muted">Farm-Wallet overview</div><ul class="muted" style="margin:.3rem 0 0 1rem;">${fwRows}</ul></div>
      <div class="soft" style="padding:8px;"><table style="width:100%"><thead><tr><th>Template</th><th>Rewards (per day)</th><th>Expiry</th></tr></thead><tbody>${rows||`<tr><td colspan="3">No templates</td></tr>`}</tbody></table></div>
    </div>`;
  }

  function renderFinalTable(state){
    const root=$("#ncf-farm-table");
    const ids=activeTokenIds(state);
    const rows=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection).map(x=>{
      const k=selectionKey(x.collection,x.schema_name,x.template_id);
      const per=state.creator.rewardsPerToken[k]||{}; const exp=state.creator.expiry[k]?new Date(state.creator.expiry[k]).toLocaleString():"—";
      const tokenRows=Object.entries(per).filter(([,v])=>Number(v)>0).map(([id,v])=>{
        const [c,s]=id.split(":"); const bal=num(state.creator.farmBalances.get(s),0); const st=bal>0?"OK":(ids.has(id)?"Low/0":"—");
        return `<div class="row" style="gap:.5rem;"><span class="badge">${esc(s)}</span><small class="muted">@${esc(c)}</small><span class="muted">reward: ${v}/day</span><span class="muted">FW: ${fmt(bal)}</span><span class="badge ${bal>0?"ok":"err"}">${st}</span></div>`;
      }).join("") || "<div class='muted'>—</div>";
      const meta=enrichFromTable(x.schema_name,x.template_id);
      return `<tr><td><strong>${esc(x.schema_name)}</strong> <small class="muted">ID ${x.template_id} — ${esc(meta.template_name||"—")}</small></td><td>${tokenRows}</td><td>${esc(exp)}</td></tr>`;
    }).join("");
    root.innerHTML=`<table><thead><tr><th>Template</th><th>Token → reward/day → Farm-Wallet balance</th><th>Expiry</th></tr></thead><tbody>${rows||`<tr><td colspan="3">No data</td></tr>`}</tbody></table>`;
  }

  async function saveDraft(state){
    const sel=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection);
    if(!sel.length){ toast("Select at least one template.","error"); return false; }
    const any=sel.some(x=>{ const k=selectionKey(x.collection,x.schema_name,x.template_id); const m=state.creator.rewardsPerToken[k]||{}; return Object.values(m).some(v=>String(v).trim()!=="" && Number(v)>0); });
    if(!any){ toast("Add at least one token with a positive daily reward.","error"); return false; }
    try{
      const res=await postJson(buildUrl(apiBase(state.cfg),state.cfg.endpoints.saveRewards), buildDraftPayload(state));
      if(!(res && (res.ok===true||res.status==="ok"))) throw new Error("Draft failed");
      sel.forEach(t=>toast(`Draft saved for T${t.template_id}`));
      return true;
    } catch(e){
      toast(String(e.message||e),"error"); return false;
    }
  }

// ---------- Step A action ----------
async function doLoadCollection(state){
  const col = $("#ncf-collection").value.trim();
  if(!col){ toast("Enter a collection name.","error"); return; }

  state.creator.collection = col;
  wLS(LS.lastCollection, col);
  $("#ncf-meta").textContent = "Loading…";
  $("#ncf-sections").innerHTML = "";
  renderSkeleton($("#ncf-status"));

  // 1) Carica struttura schemi+template (unico step “blocking”)
  let data;
  try{
    data = await fetchTemplatesBySchema(state, col);
  }catch(e){
    $("#ncf-status").innerHTML = `<div class="soft" style="padding:14px; text-align:center;">${esc(String(e.message||e))}</div>`;
    $("#ncf-meta").textContent = "Error loading collection";
    return;
  }

  // 2) Render iniziale
  state.creator.raw = data;
  const opts=(data.schemas||[]).map(s=>`<option value="${esc(s.schema_name)}">${esc(s.schema_name)}</option>`).join("");
  $("#ncf-schema").innerHTML=`<option value="">All schemas</option>${opts}`;
  const ts=(data.schemas||[]).length, tt=(data.schemas||[]).reduce((a,s)=>a+(s.templates?.length||0),0);
  $("#ncf-status").innerHTML = "";
  $("#ncf-meta").innerHTML = `Collection: ${esc(data.collection||col)} — Schemas ${ts} — Templates ${tt}`;
  renderSections(state, $("#ncf-sections"), data);

  // 3) Live circulating (best-effort)
  try{
    await fetchCirculatingLive(state, data.collection || col, []);
    applyCirculatingToUI(state);
  }catch(e){
    console.warn("circulating-live failed:", e);
    toast("Live supply unavailable right now.", "error");
  }

  // 4) Avanza wizard + pannelli
  updateRewardsPanel(state);
  wizardGo(state, "#ncf-step-b");

  // 5) Farm-Wallet balances (best-effort e solo se loggato)
  try{
    if (getWax()) {
      await refreshFarmWalletBalances(state);
    } else {
      const tb = $("#ncf-farm-balances");
      if (tb) tb.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:10px;">Sign in to view balances</td></tr>`;
    }
  }catch(e){
    console.warn("balances fetch failed:", e);
  }
  updateTopupPanel(state);

  // 6) Polling live (silenzioso)
  try{
    startLiveCircPolling(state, data.collection || col, 60000);
  }catch(e){
    console.warn("startLiveCircPolling failed:", e);
  }
}

  // ---------- Creator handlers binding ----------
  function bindCreatorHandlers(state){
    // Step A
    $("#ncf-load")?.addEventListener("click",()=>doLoadCollection(state));
    $("#ncf-collection")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") doLoadCollection(state); });
    $("#ncf-refresh-farms")?.addEventListener("click",()=>loadCreatorFarms(state));
    $("#ncf-reload-farms")?.addEventListener("click",()=>loadCreatorFarms(state));

    // Step B
    $("#ncf-src")?.addEventListener("change",()=>updateTopupPanel(state));
    $("#ncf-token")?.addEventListener("change",()=>updateTopupPanel(state));
    $("#ncf-max")?.addEventListener("click",()=>{ const src=$("#ncf-src").value||"twitch"; const sym=($("#ncf-token").value||"").toUpperCase(); if(!sym) return; const bal=tokenOptsFromSource(src).find(o=>o.symbol===sym)?.amount||0; $("#ncf-amount").value=String(bal);});
    $("#ncf-deposit")?.addEventListener("click",()=>performTopUp(state));
    $("#ncf-copy-account").addEventListener("click",()=>navigator.clipboard.writeText(state.cfg.farmWalletAccount).then(()=>toast("Account copied")));
    $("#ncf-copy-tw").addEventListener("click",()=>navigator.clipboard.writeText(state.cfg.memoTwitch).then(()=>toast("Memo copied")));
    $("#ncf-copy-tg").addEventListener("click",()=>navigator.clipboard.writeText(state.cfg.memoTelegram).then(()=>toast("Memo copied")));
    $("#ncf-refresh-farm")?.addEventListener("click",()=>refreshFarmWalletBalances(state));
    $("#ncf-auto")?.addEventListener("change",(e)=>{ wLS(LS.autoMonitor, !!e.target.checked); if(e.target.checked) startAutoBalances(state); else stopAutoBalances(state); });
    $("#ncf-change-col")?.addEventListener("click", ()=> {
      state.creator.collection = "";
      wLS(LS.lastCollection, "");
      $("#ncf-collection").value = "";
      wizardGo(state, "#ncf-step-a");
    });
    $("#ncf-next-b")?.addEventListener("click",()=> wizardGo(state,"#ncf-step-c"));

    // Step C
    $("#ncf-search-templates")?.addEventListener("input",(e)=>{ state.creator.search=e.target.value||""; if(state.creator.raw) renderSections(state,$("#ncf-sections"), state.creator.raw); });
    $("#ncf-schema")?.addEventListener("change",(e)=>{ state.creator.schemaFilter=e.target.value||""; if(state.creator.raw) renderSections(state,$("#ncf-sections"), state.creator.raw); });
    $("#ncf-expand")?.addEventListener("click",()=>{ state.creator.expandAll=!state.creator.expandAll; $("#ncf-expand").textContent=state.creator.expandAll?"Collapse all":"Expand all"; if(state.creator.raw) renderSections(state,$("#ncf-sections"), state.creator.raw); });
    $("#ncf-select-all")?.addEventListener("click",()=>{ if(!state.creator.raw) return; (state.creator.raw.schemas||[]).forEach(s=>(s.templates||[]).forEach(t=>setSelected(state,state.creator.collection,s.schema_name,Number(t.template_id),true))); $$(".ncf-row-check").forEach(c=>c.checked=true); updateRewardsPanel(state); });
    $("#ncf-clear")?.addEventListener("click",()=>{ if(!state.creator.raw) return; Object.keys(state.creator.selection).forEach(k=>{ if(k.startsWith(`${state.creator.collection}::`)){ delete state.creator.selection[k]; delete state.creator.rewardsPerToken[k]; delete state.creator.expiry[k]; }}); wLS(LS.selection,state.creator.selection); wLS(LS.rewardsPerToken,state.creator.rewardsPerToken); wLS(LS.expiry,state.creator.expiry); $$(".ncf-row-check").forEach(c=>c.checked=false); updateRewardsPanel(state); });
    $("#ncf-next-c")?.addEventListener("click",()=>{ const count=Object.values(state.creator.selection).filter(x=>x.collection===state.creator.collection).length; if(!count){ toast("Select at least one template.","error"); return; } wizardGo(state,"#ncf-step-d"); updateRewardsPanel(state); });

    // Step D
    $("#ncf-save-draft")?.addEventListener("click",()=>saveDraft(state));
    $("#ncf-next-d")?.addEventListener("click",async()=>{ const ok=await saveDraft(state); if(!ok) return; renderSummary(state); wizardGo(state,"#ncf-step-e"); });

    // Step E
    $("#ncf-confirm")?.addEventListener("click",async()=>{ const ok=await saveDraft(state); if(!ok) return; toast("Configuration saved."); $("#ncf-wizard").style.display="none"; $("#ncf-collapsed").style.display=""; $("#ncf-summary-table").style.display=""; renderFinalTable(state); });
	
	  // Pulsanti post-salvataggio
	$("#ncf-edit-again")?.addEventListener("click", () => {
	  // riapri il wizard sullo Step D per modificare rewards/expiry
	  $("#ncf-collapsed").style.display = "none";
	  $("#ncf-summary-table").style.display = "none";
	  $("#ncf-wizard").style.display = "";
	  wizardGo(state, "#ncf-step-d");
	});
	
	$("#ncf-back-start")?.addEventListener("click", () => {
	  // torna alla sezione iniziale (Step A)
	  $("#ncf-collapsed").style.display = "none";
	  $("#ncf-summary-table").style.display = "none";
	  $("#ncf-wizard").style.display = "";
	  wizardGo(state, "#ncf-step-a");
	});

    // Tokens Library add
    $("#ncf-tok-add")?.addEventListener("click",()=>{ const c=$("#ncf-tok-contract").value.trim(); const s=$("#ncf-tok-symbol").value.trim().toUpperCase(); const d=$("#ncf-tok-dec").value===""?null:Number($("#ncf-tok-dec").value); if(!c||!s){ toast("Provide contract and symbol.","error"); return; } if(state.creator.tokens.some(t=>t.contract===c&&t.symbol===s)){ toast("Token already present."); return; } state.creator.tokens.push({contract:c,symbol:s,decimals:d}); wLS(LS.tokens,state.creator.tokens); $("#ncf-tok-contract").value=""; $("#ncf-tok-symbol").value=""; $("#ncf-tok-dec").value=""; renderTokenLibrary(state); updateRewardsPanel(state); });
	// helper di navigazione
	function goHomeCreator() { wizardGo(state, "#ncf-step-a"); }
	const backTo = {
	  b: () => wizardGo(state, "#ncf-step-a"),
	  c: () => wizardGo(state, "#ncf-step-b"),
	  d: () => wizardGo(state, "#ncf-step-c"),
	  e: () => wizardGo(state, "#ncf-step-d"),
	};
	
	// STEP B
	document.getElementById("ncf-prev-b")?.addEventListener("click", backTo.b);
	document.getElementById("ncf-cancel-b")?.addEventListener("click", goHomeCreator);
	
	// STEP C
	document.getElementById("ncf-prev-c")?.addEventListener("click", backTo.c);
	document.getElementById("ncf-cancel-c")?.addEventListener("click", goHomeCreator);
	
	// STEP D
	document.getElementById("ncf-prev-d")?.addEventListener("click", backTo.d);
	document.getElementById("ncf-cancel-d")?.addEventListener("click", goHomeCreator);
	
	// STEP E
	document.getElementById("ncf-prev-e")?.addEventListener("click", backTo.e);
	document.getElementById("ncf-cancel-e")?.addEventListener("click", goHomeCreator);

    // visibility pause auto
    document.addEventListener("visibilitychange",()=>{ if(document.hidden) stopAutoBalances(state); });
	// Stop polling quando non serve
	document.addEventListener("visibilitychange", () => {
	  if (document.hidden) stopLiveCircPolling(state);
	});
	
	// quando l’utente cambia tab principale, spegni/accendi in base al tab
	const tabIds = ["#ncf-tab-browse", "#ncf-tab-creator", "#ncf-tab-stats", "#ncf-tab-help"];
	tabIds.forEach(id => {
	  const b = document.querySelector(id);
	  if (!b) return;
	  b.addEventListener("click", () => {
	    const onCreator = (id === "#ncf-tab-creator");
	    if (!onCreator) stopLiveCircPolling(state);
	    else if (state.creator?.collection) {
	      startLiveCircPolling(state, state.creator.collection, 60000);
	    }
	  });
	});
	  
  }

  // ---------- Stats pane ----------
  function mountStatsPane(state){
    const host = $("#ncf-pane-stats");
    if(!host) return;
    host.innerHTML = `
      <div class="grid" style="gap:12px;">
        <div class="row" style="justify-content:space-between; align-items:center;">
          <h2 style="margin:0;">Farm Stats</h2>
          <div class="row">
            <select id="ncf-farm-picker" class="input" style="min-width:260px;">
              <option value="">All farms (this creator)</option>
            </select>
            <button id="ncf-refresh-stats" class="btn btn-ghost">Refresh</button>
            <input id="ncf-farm-quick-id" class="input" placeholder="Farm ID…" style="width:140px;">
            <button id="ncf-open-farmid" class="btn btn-ghost">Open</button>
          </div>
        </div>

        <div class="soft" style="padding:10px;">
          <div class="row" style="gap:10px; flex-wrap:wrap;">
            <div class="badge" id="ncf-stats-head-farms">Farms: 0</div>
            <div class="badge" id="ncf-stats-head-owners">Unique owners: 0</div>
            <div class="badge" id="ncf-stats-head-assets">Staked assets: 0</div>
            <div class="badge" id="ncf-stats-head-lastdist">Last distribution: —</div>
          </div>
        </div>

        <div class="grid" style="gap:12px;">
          <div class="soft" style="padding:10px;">
            <h4 style="margin:.2rem 0;">Rewards (grouped)</h4>
            <div class="muted" style="margin:.2rem 0;">Grouped by <strong>Owner</strong> → <strong>Schema</strong> → <strong>Template</strong> → <strong>Token</strong>.</div>
            <div id="ncf-stats-grouped" style="overflow:auto; max-height:46vh;">
              <div class="muted">No data yet.</div>
            </div>
          </div>

          <div class="soft" style="padding:10px;">
            <h4 style="margin:.2rem 0;">Distributions history</h4>
            <div id="ncf-stats-history" style="overflow:auto; max-height:38vh;">
              <div class="muted">No history yet.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    $("#ncf-refresh-stats")?.addEventListener("click", ()=> ensureStatsPaneMounted(state));
    $("#ncf-farm-picker")?.addEventListener("change", ()=> ensureStatsPaneMounted(state));
    $("#ncf-open-farmid")?.addEventListener("click", ()=>{
      const fid = ($("#ncf-farm-quick-id").value || "").trim();
      if(!fid){ toast("Enter a Farm ID.", "error"); return; }
      $("#ncf-farm-picker").value = "";
      ensureStatsPaneMounted(state, fid);
    });
    $("#ncf-farm-quick-id")?.addEventListener("keydown",(e)=>{ if(e.key==="Enter") $("#ncf-open-farmid").click(); });
  }

  function renderFarmPicker(state, farms){
    const sel = $("#ncf-farm-picker");
    const cur = sel.value;
    const opts = [`<option value="">All farms (this creator)</option>`]
      .concat(farms.map(f => `<option value="${esc(String(f.farm_id))}">#${esc(String(f.farm_id))} — ${esc(f.collection||"")}</option>`));
    sel.innerHTML = opts.join("");
    if (farms.some(f => String(f.farm_id) === cur)) sel.value = cur;
  }

  function groupStatsView(state, stats){
    const owners = Array.isArray(stats?.owners) ? stats.owners : [];
    const head   = stats?.summary || {};
    const creatorWax = (stats && (stats.creator_wax_account || stats.creator)) ? String(stats.creator_wax_account || stats.creator) : "";
    const me = String(getWax() || "");
    const isCreator = me && creatorWax && me.trim() === creatorWax.trim();

    $("#ncf-stats-head-owners").textContent = `Unique owners: ${head.owners ?? owners.length}`;
    $("#ncf-stats-head-assets").textContent = `Staked assets: ${head.assets ?? 0}`;
    $("#ncf-stats-head-lastdist").textContent = `Last distribution: ${head.last_distribution_at ? new Date(head.last_distribution_at).toLocaleString() : "—"}`;

    const perToken = head.per_token_last_cycle && typeof head.per_token_last_cycle === "object"
      ? Object.entries(head.per_token_last_cycle).map(([sym, tot]) => [String(sym).toUpperCase(), Number(tot) || 0])
      : [];
    perToken.sort((a,b)=>b[1]-a[1]);

    const kpiCards = `
      <div class="grid" style="gap:10px; margin-bottom:10px;">
        <div class="row" style="gap:10px; flex-wrap:wrap;">
          <div class="badge">Active tokens (last cycle): ${head.active_tokens_last_cycle ?? perToken.length}</div>
          <div class="badge">Active templates (last cycle): ${head.active_templates_last_cycle ?? 0}</div>
          <div class="badge">Templates with rewards (configured): ${head.templates_configured_with_rewards ?? 0}</div>
        </div>
        ${
          perToken.length
            ? `<div class="soft" style="padding:8px;">
                 <h5 style="margin:.2rem 0;">Per-token totals (last cycle)</h5>
                 <table><thead><tr><th>Token</th><th>Total paid</th></tr></thead>
                 <tbody>${perToken.map(([sym,tot])=>`<tr><td><strong>${esc(sym)}</strong></td><td>${fmt(tot)}</td></tr>`).join("")}</tbody></table>
               </div>`
            : `<div class="soft" style="padding:8px;"><div class="muted">No token payouts recorded for the last cycle yet.</div></div>`
        }
      </div>
    `;

    if (!owners.length) {
      $("#ncf-stats-grouped").innerHTML = kpiCards + `<div class="muted">No stakers yet.</div>`;
      return;
    }

    const ownersWithSubtotal = owners.map(o=>{
      const subtotal = (Array.isArray(o.tokens) ? o.tokens : []).reduce((a,b)=>a+Number(b.amount||0),0);
      return {...o, _subtotal: subtotal};
    }).sort((a,b)=> b._subtotal - a._subtotal || (b.assets||0) - (a.assets||0));

    const htmlOwners = ownersWithSubtotal.map(o=>{
      const owner = o.owner || "—";
      const last  = o.last_rewarded_at ? new Date(o.last_rewarded_at).toLocaleString() : "—";
      const tokensLine = (o.tokens||[]).map(t=>`${esc(t.symbol)}: ${fmt(t.amount)}`).join(", ") || "—";

      const trees = Array.isArray(o.trees) ? o.trees : [];
      const bySchema = new Map();
      trees.forEach(r=>{
        const key = r.schema_name || "—";
        if(!bySchema.has(key)) bySchema.set(key, []);
        bySchema.get(key).push(r);
      });

      const schemaBlocks = Array.from(bySchema.entries()).map(([schema, arr])=>{
        const byTemplate = new Map();
        arr.forEach(x=>{
          const k = String(x.template_id);
          if(!byTemplate.has(k)) byTemplate.set(k, []);
          byTemplate.get(k).push(x);
        });

        const templatesHtml = Array.from(byTemplate.entries()).map(([tid, rows])=>{
          const inner = rows.map(r=>`
            <div class="row" style="gap:.5rem;">
              <span class="badge">${esc(r.token_symbol)}</span>
              <small class="muted">@${esc(r.token_contract||"")}</small>
              <span class="muted">last cycle: <strong>${fmt(r.amount||0)}</strong></span>
            </div>
          `).join("");

          return `
            <details>
              <summary class="row" style="gap:.5rem;">
                <strong>Template</strong> <span class="badge">ID ${esc(tid)}</span>
              </summary>
              ${inner}
            </details>`;
        }).join("");

        const subtotal = arr.reduce((a,b)=>a+Number(b.amount||0),0);
        return `
          <details>
            <summary class="row" style="gap:.5rem;">
              <strong>Schema</strong> <span class="badge">${esc(schema)}</span>
              <span class="badge ok">Subtotal: ${fmt(subtotal)}</span>
            </summary>
            <div class="grid" style="gap:6px;">${templatesHtml}</div>
          </details>`;
      }).join("");

      const kickHtml = isCreator ? `
        <div class="row" style="gap:.5rem; margin-top:6px;">
          <button class="btn btn-ghost ncf-kick" data-owner="${esc(owner)}" title="Remove this staker from the farm">
            Kick from staking
          </button>
        </div>` : ``;

      return `
        <details class="soft" style="padding:8px;">
          <summary class="row" style="gap:.6rem;">
            <strong>${esc(owner)}</strong>
            <span class="badge">Assets: ${fmt(o.assets||0)}</span>
            <span class="badge ok">Subtotal: ${fmt(o._subtotal)}</span>
            <span class="badge">Last: ${esc(last)}</span>
          </summary>
          <div class="grid" style="gap:8px; margin-top:6px;">
            <div class="muted">Tokens subtotal: ${esc(tokensLine)}</div>
            <div>${schemaBlocks || "<div class='muted'>No details</div>"}</div>
            ${kickHtml}
          </div>
        </details>`;
    }).join("");

    $("#ncf-stats-grouped").innerHTML = kpiCards + htmlOwners;

    $$("#ncf-stats-grouped .ncf-kick").forEach(btn=>{
      btn.addEventListener("click", async ()=>{
        const farmId = $("#ncf-farm-picker").value || null;
        const owner = btn.dataset.owner;
        const reason = "manual kick (UI)";
        if(!farmId){ toast("Pick a specific farm to kick.","error"); return; }
        try{
          await postKick(state, { farm_id: farmId, wax_account: owner, reason });
          toast(`Kick requested for ${owner}.`);
        }catch(e){ toast(String(e.message||e), "error"); }
      });
    });
  }

  function renderDistributionsHistory(list){
    if (!Array.isArray(list) || !list.length) {
      $("#ncf-stats-history").innerHTML = `<div class="muted">No history yet.</div>`;
      return;
    }
    const rows = list.map(x=>`<tr>
      <td>${new Date(x.ts).toLocaleString()}</td>
      <td>${esc(x.token_symbol)}</td>
      <td>${fmt(x.total_amount)}</td>
      <td>${fmt(x.unique_owners)}</td>
      <td>${esc(x.schema_name || "—")}</td>
      <td>${esc(String(x.template_id || "—"))}</td>
    </tr>`).join("");

    $("#ncf-stats-history").innerHTML = `
      <table>
        <thead><tr>
          <th>Time</th><th>Token</th><th>Total paid</th><th>Owners</th><th>Schema</th><th>Template</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function ensureStatsPaneMounted(state, directFarmId=null){
    // load farms for picker
    try{
      const farms = await fetchFarmsForCreator(state);
      $("#ncf-stats-head-farms").textContent = `Farms: ${farms.length}`;
      renderFarmPicker(state, farms);

      const farmIdSel = directFarmId || $("#ncf-farm-picker").value || null;

      if (!farmIdSel && (!Array.isArray(farms) || farms.length === 0)) {
        $("#ncf-stats-grouped").innerHTML =
          `<div class="soft" style="padding:10px;">
             <div class="muted">
               You have no farms as a creator. Paste a <strong>Farm ID</strong> above, or switch to the <em>Farms</em> tab to browse public farms.
             </div>
           </div>`;
        $("#ncf-stats-history").innerHTML = `<div class="muted">No farm selected.</div>`;
        return;
      }

      const stats = await fetchFarmStatsById(state, farmIdSel || farms[0]?.farm_id);
      groupStatsView(state, stats);
      const history = (farmIdSel || farms[0]?.farm_id) ? (await fetchDistributions(state, (farmIdSel || farms[0]?.farm_id), 200)) : [];
      renderDistributionsHistory(history);
    }catch(e){
      toast(String(e.message||e), "error");
    }
  }

  // ---------- Bootstrapping PART 2 with PART 1 ----------
  function enhanceAfterInit(){
    const state = window.__NCF_STATE__;
    if(!state || !state.cfg) return;

    // mount creator & stats when their tabs are opened
    $("#ncf-tab-creator")?.addEventListener("click", ()=> {
      showTabFromPart2("creator");
      if (!state._creatorMounted) {
        mountCreatorDashboard(state);
        state._creatorMounted = true;
      }
    });
    $("#ncf-tab-stats")?.addEventListener("click", ()=> {
      showTabFromPart2("stats");
      if (!state._statsMounted) {
        mountStatsPane(state);
        ensureStatsPaneMounted(state);
        state._statsMounted = true;
      }
    });
    $("#ncf-tab-help")?.addEventListener("click", ()=> showTabFromPart2("help"));
    $("#ncf-tab-browse")?.addEventListener("click", ()=> showTabFromPart2("browse"));

    // If user starts on Creator/Stats tab, ensure it mounts on first click.
  }

  // mirror of PART 1 showTab (without overwriting it)
  function showTabFromPart2(which){
    const tabs = [
      { btn: "#ncf-tab-browse",  pane: "#ncf-pane-browse"  },
      { btn: "#ncf-tab-creator", pane: "#ncf-pane-creator" },
      { btn: "#ncf-tab-stats",   pane: "#ncf-pane-stats"   },
      { btn: "#ncf-tab-help",    pane: "#ncf-pane-help"    }
    ];
    tabs.forEach(({ btn, pane }) => {
      const b = $(btn);
      const p = $(pane);
      const on = pane === `#ncf-pane-${which}`;
      if (b) b.setAttribute("aria-selected", on ? "true" : "false");
      if (p) p.style.display = on ? "" : "none";
    });
  }

  // Patch exported init so PART 2 hooks are guaranteed
  const __oldInit = window.initNonCustodialFarms;
  window.initNonCustodialFarms = function(opts){
    const ret = __oldInit.call(this, opts);
    // defer to next tick to ensure PART 1 finished DOM build
    setTimeout(enhanceAfterInit, 0);
    return ret;
  };
  // keep alias
  window.initManageNFTsFarm = window.initNonCustodialFarms;

  // If PART 1 already ran before PART 2 got loaded
  if (window.__NCF_STATE__) {
    // we’re late—but we can still attach
    enhanceAfterInit();
  }

  // Done.
})();

/* ===================== BACKEND ENDPOINTS (expected) =====================

All responses should be JSON. Strings that are JSON-encoded are tolerated but JSON is preferred.

GET  /api/farm/list?status=active
  -> [ { farm_id, collection, creator (or creator_wax_account) }, ... ]

GET  /api/farm/list?creator=<wax>
  -> [ { farm_id, collection, creator (or creator_wax_account) }, ... ]

POST /api/templates-by-schema
  Body: { collection_name: string }
  -> {
       collection: string,
       schemas: [
         {
           schema_name: string,
           templates: [
             {
               template_id: number,
               template_name?: string,
               circulating_supply?: number,
               max_supply?: number|null
             }, ...
           ]
         }, ...
       ]
     }

GET  /api/farm/deposit/balances?creator=<wax>
  -> [ { token_symbol | symbol: string, amount: number }, ... ]
     (symbols uppercase, please)

POST /api/farm/deposit
  Body: {
    creator_wax_account: string,
    source: "twitch" | "telegram",
    token_symbol: string,
    token_contract?: string,
    amount: number
  }
  -> { ok: true, balances?: { twitch?: [...], telegram?: [...] } }

POST /api/farm/rewards/draft
  Body: {
    collection: string,
    creator_wax_account: string,
    policy: {
      distribution: "daily",
      semantics: string,
      payout_time_cet: "14:00",
      non_custodial: string
    },
    tokens_catalog: [ { contract, symbol, decimals|null }, ... ],
    total_selected: number,
    items: [
      {
        schema_name: string,
        template_id: number,
        expiry: string|null (ISO),
        rewards: [
          {
            token_contract: string,
            token_symbol: string,          // UPPERCASE
            decimals: number|null,
            reward_per_asset_per_day: number
          }, ...
        ]
      }, ...
    ]
  }
  -> { ok: true }  // or { status: "ok" }

GET  /api/farm/stats?farm_id=<id>
  -> {
       farm_id: string|number,
       collection: string,
       creator | creator_wax_account: string,
       summary: {
         owners: number,
         assets: number,
         last_distribution_at: ISO|string|null,
         valid_templates_total?: number,
         per_token_last_cycle?: { [SYMBOL]: number },
         active_tokens_last_cycle?: number,
         active_templates_last_cycle?: number,
         templates_configured_with_rewards?: number,
         remaining_by_token?: { [SYMBOL]: number }
       },
       config?: { items?: [
         { schema_name, template_id, expiry?: ISO, rewards?: [
             { token_contract, token_symbol, reward_per_asset_per_day }
         ] }
       ] },
       owners?: [
         {
           owner: string,
           assets: number,
           last_rewarded_at?: ISO,
           tokens?: [{ symbol, amount, token_contract? }],
           trees?: [
             { schema_name, template_id, token_contract, token_symbol, amount }
           ]
         }
       ]
     }

GET  /api/farm/distributions?farm_id=<id>&limit=200
  -> [ { ts: ISO, token_symbol: string, total_amount: number,
         unique_owners: number, schema_name?: string, template_id?: number }, ... ]

GET  /api/farm/user-history?farm_id=<id>&owner=<wax>&limit=200
  -> [ { ts: ISO, token_symbol: string, amount: number,
         schema_name?: string, template_id?: number, note?: string }, ... ]

POST /api/farm/kick
  Body: { farm_id: string|number, wax_account: string, reason?: string }
  -> { ok: true }

========================================================================= */

