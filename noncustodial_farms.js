/* noncustodial_farms.js */
(function () {
  const DEFAULTS = {
    apiBaseUrl: "",
    endpoints: {
      templatesBySchema: "/api/templates-by-schema",
      saveRewards: "/api/farm/rewards/draft",
      farmBalances: "/api/farm/deposit/balances",
      depositToFarm: "/api/farm/deposit",
      farmsByCreator: "/api/farm/list",                 // GET ?creator=<wax>
      farmStats: "/api/farm/stats",                     // GET ?farm_id=... oppure ?creator=...
      farmDistributions: "/api/farm/distributions",     // GET ?farm_id=...&limit=100
      farmKick: "/api/farm/kick"                        // POST {farm_id, wax_account, reason}      
    },
    containerId: null,
    appTitle: "Manage Non-Custodial NFTs Farm",
    farmWalletAccount: "xcryptochips",
    memoTelegram: "deposit token",
    memoTwitch: "deposit twitch",
    autoMonitorEverySec: 120,
    ls: {
      lastCollection: "ncf.lastCollection.v2",
      tokens: "ncf.tokens.v2",
      wizard: "ncf.wizard.v1",
      selection: "ncf.selection.v2",
      rewardsPerToken: "ncf.rewardsPerToken.daily.v1",
      expiry: "ncf.expiry.v2",
      autoMonitor: "ncf.autoMonitor.v2"
    }
  };

  const $ = (s, p = document) => p.querySelector(s);
  const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));
  const once = (fn) => { let r; return (...a) => (r ??= fn(...a)); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (v, d = 0) => (v === null || v === undefined || v === "" || isNaN(+v) ? d : +v);
  const fmt = (n) => Number(n || 0).toLocaleString();
  const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const rLS = (k, f) => { try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(f)); } catch { return f; } };
  const wLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const toast = (() => { let tmr=null; return (m,k="info")=>{ let t=$("#ncf-toast"); if(!t){t=document.createElement("div");t.id="ncf-toast";t.setAttribute("role","status");document.body.appendChild(t);} t.textContent=m; t.dataset.kind=k; t.classList.add("show"); clearTimeout(tmr); tmr=setTimeout(()=>t.classList.remove("show"),2400); }; })();
  const apiBase = (cfg) => cfg.apiBaseUrl || window.BASE_URL || window.API_BASE || location.origin;
  const buildUrl = (b,p) => `${String(b).replace(/\/+$/,"")}${p}`;
  const getWax = () => (window.userData?.wax_account || "").trim();
  const nowPlusMin = (m)=>{const d=new Date(); d.setMinutes(d.getMinutes()+m); return d;};
  const toLoc = (d)=>{const p=(n)=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  const parseLoc = (v)=>{const d=new Date(v); return isNaN(d.getTime())?null:d;};
  const fetchJson = async (u,i)=>{const r=await fetch(u,i); if(!r.ok){const tx=await r.text().catch(()=> ""); throw new Error(`HTTP ${r.status} — ${tx||r.statusText}`);} return r.json();};
  const postJson = (u,b)=>fetchJson(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
  const twitchBalances = () => Array.isArray(window.twitchWalletBalances) ? window.twitchWalletBalances : [];
  const telegramBalances = () => Array.isArray(window.telegramWalletBalances) ? window.telegramWalletBalances : [];
  const percent = (i,m)=>{i=num(i,0);m=num(m,0); if(!isFinite(i)||!isFinite(m)||m<=0) return "—"; return `${clamp((i/m)*100,0,100).toFixed(1)}%`;};
  const injectStyles = once(()=>{
    const css=`#ncf-root .cy-card{background:rgba(12,16,22,.66);border:1px solid rgba(0,255,200,.18);border-radius:14px;box-shadow:0 0 22px rgba(0,255,200,.08),inset 0 0 0 1px rgba(255,255,255,.03);color:#e6eef8}
#ncf-root .muted{color:rgba(230,238,248,.75)}#ncf-root .soft{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px}
#ncf-root .row{display:flex;gap:.75rem;align-items:center;flex-wrap:wrap}#ncf-root .col{display:grid;gap:.5rem}#ncf-root .grid{display:grid;gap:12px}
#ncf-root .w-100{width:100%}#ncf-root .badge{display:inline-flex;align-items:center;gap:.5rem;padding:.35rem .6rem;border-radius:999px;font-size:.85rem;border:1px solid rgba(255,255,255,.08)}
#ncf-root .badge.ok{color:#22e4b6;background:rgba(34,228,182,.12)}#ncf-root .badge.warn{color:#f8c555;background:rgba(248,197,85,.12)}#ncf-root .badge.err{color:#ff7b7b;background:rgba(255,123,123,.12)}
#ncf-root .btn{cursor:pointer;border-radius:999px;padding:.6rem 1rem;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(20,28,36,.9),rgba(10,14,18,.9));color:#e6eef8}
#ncf-root .btn:focus{outline:none;box-shadow:0 0 0 2px rgba(0,255,200,.35)}#ncf-root .btn[disabled]{opacity:.6;cursor:not-allowed}
#ncf-root .btn-primary{border-color:transparent;background:linear-gradient(180deg,rgba(0,255,200,.9),rgba(0,196,255,.9));color:#001418;font-weight:800}
#ncf-root .btn-ghost{background:transparent}#ncf-root .btn-danger{border-color:rgba(255,0,90,.4);background:linear-gradient(180deg,rgba(255,0,90,.12),rgba(255,0,90,.08));color:#ffc4d8}
#ncf-root .chip{display:inline-flex;gap:.5rem;align-items:center;padding:.45rem .7rem;border-radius:999px;border:1px dashed rgba(255,255,255,.14);cursor:pointer}
#ncf-root .chip.active{border-color:rgba(0,255,200,.5);box-shadow:0 0 14px rgba(0,255,200,.15);color:#a7ffeb}
#ncf-root .input,#ncf-root .select{height:40px;padding:0 .8rem;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(10,14,18,.8);color:#e6eef8}
#ncf-toast{position:fixed;bottom:18px;left:50%;transform:translate(-50%,18px);opacity:0;background:rgba(12,16,22,.92);border:1px solid rgba(0,255,200,.25);color:#e6eef8;padding:.55rem .9rem;border-radius:12px;box-shadow:0 0 18px rgba(0,255,200,.15);z-index:9999;transition:all .18s ease}
#ncf-toast.show{opacity:1;transform:translate(-50%,0)}#ncf-toast[data-kind=error]{border-color:rgba(255,0,90,.35);box-shadow:0 0 18px rgba(255,0,90,.18)}
#ncf-rightpanel{position:sticky;top:1rem;align-self:flex-start;min-width:340px;max-width:420px}#ncf-root h2,#ncf-root h3,#ncf-root h4{color:#f2fbff;text-shadow:0 0 6px rgba(0,255,200,.12)}
#ncf-root small,#ncf-root .help{color:rgba(230,238,248,.75)}#ncf-wizard .step{display:none}#ncf-wizard .step.active{display:block}
#ncf-summary-table table{width:100%;border-collapse:separate;border-spacing:0}#ncf-summary-table th,#ncf-summary-table td{padding:.5rem;border-bottom:1px dashed rgba(255,255,255,.08);text-align:left}
#ncf-root table{width:100%;border-collapse:separate;border-spacing:0;font-size:.95rem}#ncf-root thead th{position:sticky;top:0;padding:.6rem .8rem;text-align:left;background:rgba(10,14,18,.95);border-bottom:1px solid rgba(255,255,255,.08);user-select:none;cursor:pointer}
#ncf-root tbody td{padding:.6rem .8rem;border-bottom:1px dashed rgba(255,255,255,.08)}#ncf-root tbody tr:hover{background:rgba(255,255,255,.03)}`
    const s=document.createElement("style"); s.id="ncf-styles"; s.textContent=css; document.head.appendChild(s);
  });

  const sumHoldingsFromDom = () => {
    const a=twitchBalances(), b=telegramBalances(), m=new Map();
    const add=(arr)=>arr.forEach(({symbol,amount})=>{ if(!symbol) return; const v=num(amount,0); m.set(symbol, num(m.get(symbol),0)+v); });
    add(a); add(b); return m;
  };

  const selectionKey = (collection, schema, tid) => `${collection}::${schema}::${tid}`;

  function createLayout(root, cfg) {
    root.innerHTML=`
      <div id="ncf-root" class="grid" style="grid-template-columns: 1fr minmax(340px,420px); gap:18px;">
        <div id="ncf-main" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:12px;">
            <div class="row" role="tablist" aria-label="Farm tabs">
              <button id="ncf-tab-edit"  role="tab" aria-selected="true"  class="btn btn-ghost">Create / Edit</button>
              <button id="ncf-tab-stats" role="tab" aria-selected="false" class="btn btn-ghost">View Farm Stats</button>
            </div>
          </section>
  
          <!-- TAB: CREATE / EDIT -->
          <section id="ncf-tabpane-edit"  class="cy-card" style="padding:16px;">
            <h2 style="margin:0 0 .25rem 0;">${esc(DEFAULTS.appTitle)}</h2>
            <div id="ncf-wizard" class="grid" style="gap:12px;">
              <div class="step" id="ncf-step-a">
                <h3 style="margin:.2rem 0;">Step 1 — Collection</h3>
                <div class="row">
                  <div class="col" style="min-width:260px;">
                    <label class="muted"><small>Collection name</small></label>
                    <input id="ncf-collection" class="input" placeholder="e.g. cryptochaos1"/>
                  </div>
                  <button id="ncf-load" class="btn btn-primary">Load</button>
                  <div class="badge" id="ncf-meta">Ready</div>
                </div>
                <div id="ncf-a-hint" class="help" style="margin-top:.5rem;">AtomicAssets collection name. Example: <code>cryptochaos1</code>.</div>
              </div>

              <div class="step" id="ncf-step-b">
                <h3 style="margin:.2rem 0;">Step 2 — Funds & Deposit</h3>
                <div class="soft" style="padding:10px; display:grid; gap:10px;">
                  <div class="row">
                    <select id="ncf-src" class="select" style="min-width:180px;">
                      <option value="twitch">From Twitch Wallet</option>
                      <option value="telegram">From Telegram Wallet</option>
                    </select>
                    <select id="ncf-token" class="select" style="min-width:160px;"><option value="">Select token…</option></select>
                    <div class="row">
                      <input id="ncf-amount" class="input" type="number" step="0.0001" min="0" placeholder="Amount" style="width:140px;"/>
                      <button id="ncf-max" class="btn btn-ghost">MAX</button>
                    </div>
                    <button id="ncf-deposit" class="btn">Deposit to Farm-Wallet</button>
                  </div>
                  <div id="ncf-bal-hint" class="muted">Balance: —</div>
                  <div id="ncf-empty" class="soft" style="display:none; padding:10px;">
                    <div class="badge warn">No available balance on this wallet</div>
                    <p class="help" style="margin:.4rem 0 0;">Send tokens to your internal wallet to get balance:</p>
                    <ul class="help" style="margin:.2rem 0 0 1rem;">
                      <li><strong>Twitch Wallet</strong> memo: <code>${esc(cfg.memoTwitch)}</code></li>
                      <li><strong>Telegram Wallet</strong> memo: <code>${esc(cfg.memoTelegram)}</code></li>
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
                      <label class="chip" style="user-select:none;">
                        <input id="ncf-auto" type="checkbox" style="position:absolute;opacity:0;pointer-events:none;"/>
                        Auto-monitor
                      </label>
                    </div>
                  </div>
                  <table style="margin-top:8px;">
                    <thead><tr><th>Token</th><th>Balance</th><th>Updated</th><th>Status</th></tr></thead>
                    <tbody id="ncf-farm-balances"><tr><td colspan="4" style="text-align:center;padding:10px;">No data</td></tr></tbody>
                  </table>
                  <div class="help" id="ncf-user-hints" style="margin-top:8px;"></div>
                  <div id="ncf-farm-alert" class="soft" style="display:none; padding:8px; margin-top:8px;">
                    <div class="badge err">Some active reward tokens have zero Farm-Wallet balance</div>
                  </div>
                </div>
                <div class="row" style="margin-top:10px;"><button id="ncf-next-b" class="btn btn-primary">Continue</button></div>
              </div>

              <div class="step" id="ncf-step-c">
                <h3 style="margin:.2rem 0;">Step 3 — Pick templates</h3>
                <div class="row" style="margin-bottom:8px;">
                  <input id="ncf-search" class="input w-100" placeholder="Search by Template ID or Name…"/>
                  <select id="ncf-schema" class="select"><option value="">All schemas</option></select>
                  <button id="ncf-expand" class="btn btn-ghost">Expand all</button>
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
                    <button id="ncf-select-all" class="btn btn-ghost">Select all</button>
                    <button id="ncf-clear" class="btn btn-ghost">Clear</button>
                    <button id="ncf-next-c" class="btn btn-primary">Continue</button>
                  </div>
                </div>
              </div>

              <div class="step" id="ncf-step-d">
                <h3 style="margin:.2rem 0;">Step 4 — Configure rewards (per asset, daily)</h3>
                <div class="help" style="margin:0 0 8px;">Choose tokens and set the daily amount per asset_id for each selected template. Expiration can only be extended.</div>
                <div id="ncf-rp-body" class="grid" style="gap:10px;">
                  <div class="soft" style="padding:12px; text-align:center;">No templates selected yet.</div>
                </div>
                <div class="row" style="margin-top:10px;">
                  <button id="ncf-save-draft" class="btn">Save Draft</button>
                  <button id="ncf-next-d" class="btn btn-primary">Continue</button>
                </div>
              </div>

              <div class="step" id="ncf-step-e">
                <h3 style="margin:.2rem 0;">Step 5 — Summary & Save</h3>
                <div id="ncf-summary" class="soft" style="padding:10px;"></div>
                <div class="row" style="margin-top:10px;">
                  <button id="ncf-confirm" class="btn btn-primary">Confirm & Save</button>
                </div>
              </div>
            </div>
          </section>

          <section id="ncf-collapsed" class="cy-card" style="padding:12px; display:none; margin-top:12px;">
            <div class="row" style="justify-content:space-between;align-items:center;">
              <strong>Farm configuration saved</strong>
              <span class="badge ok">Saved</span>
            </div>
          </section>

          <section id="ncf-summary-table" class="cy-card" style="padding:14px; display:none; margin-top:12px;">
            <h3 style="margin:.2rem 0;">Current Farm</h3>
            <div id="ncf-farm-table"></div>
          </section>
          <!-- TAB: STATS -->
          <section id="ncf-tabpane-stats" class="cy-card" style="padding:16px; display:none;">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <h2 style="margin:0;">Farm Stats</h2>
              <div class="row">
                <select id="ncf-farm-picker" class="select" style="min-width:260px;"><option value="">All farms (this creator)</option></select>
                <button id="ncf-refresh-stats" class="btn btn-ghost">Refresh</button>
              </div>
            </div>
  
            <div class="soft" style="padding:10px; margin-top:10px;">
              <div class="row" style="gap:10px; flex-wrap:wrap;">
                <div class="badge" id="ncf-stats-head-farms">Farms: 0</div>
                <div class="badge" id="ncf-stats-head-owners">Unique owners: 0</div>
                <div class="badge" id="ncf-stats-head-assets">Staked assets: 0</div>
                <div class="badge" id="ncf-stats-head-lastdist">Last distribution: —</div>
              </div>
            </div>
  
            <div class="grid" style="gap:12px; margin-top:10px;">
              <div class="soft" style="padding:10px;">
                <h4 style="margin:.2rem 0;">Rewards (grouped)</h4>
                <div class="help" style="margin:.2rem 0;">Grouped by <strong>Owner</strong> → <strong>Schema</strong> → <strong>Template</strong> → <strong>Token</strong>. Click a row to expand subtotals.</div>
                <div id="ncf-stats-grouped" style="overflow:auto; max-height:46vh;">
                  <div class="help">No data yet.</div>
                </div>
              </div>
  
              <div class="soft" style="padding:10px;">
                <h4 style="margin:.2rem 0;">Distributions history</h4>
                <div id="ncf-stats-history" style="overflow:auto; max-height:38vh;">
                  <div class="help">No history yet.</div>
                </div>
              </div>
            </div>
          </section>
        </div>
        <aside id="ncf-rightpanel" class="grid" style="gap:14px;">
          <section class="cy-card" style="padding:14px;">
            <h3 style="margin:.1rem 0 .5rem;">Tokens Library</h3>
            <div class="grid" style="gap:10px;">
              <div class="row">
                <input id="ncf-tok-contract" class="input" placeholder="Token contract (e.g. eosio.token)" style="min-width:220px;"/>
                <input id="ncf-tok-symbol" class="input" placeholder="Symbol (e.g. WAX)" style="width:140px;"/>
                <input id="ncf-tok-dec" class="input" type="number" min="0" max="18" step="1" placeholder="Decimals" style="width:120px;"/>
                <button id="ncf-tok-add" class="btn">Add</button>
              </div>
              <div id="ncf-token-list" class="row" style="flex-wrap:wrap;"></div>
              <div class="help">Tokens are sorted by what you currently hold across Twitch/Telegram wallets.</div>
            </div>
          </section>
        </aside>
      </div>
      <div id="ncf-toast"></div>
    `;
  }

  function bindTabs(state, cfg){
    const tabEdit  = $("#ncf-tab-edit");
    const tabStats = $("#ncf-tab-stats");
    const paneEdit  = $("#ncf-tabpane-edit");
    const paneStats = $("#ncf-tabpane-stats");
  
    const show = (which) => {
      const isEdit = which === "edit";
      tabEdit.setAttribute("aria-selected", isEdit ? "true" : "false");
      tabStats.setAttribute("aria-selected", !isEdit ? "true" : "false");
      paneEdit.style.display  = isEdit ? "" : "none";
      paneStats.style.display = !isEdit ? "" : "none";
      if (!isEdit) ensureStatsLoaded(state, cfg);
    };
  
    tabEdit.addEventListener("click", () => show("edit"));
    tabStats.addEventListener("click", () => show("stats"));
    // default: resta su Edit alla prima apertura
  }

  function renderSkeleton(el){ el.innerHTML=`<div class="soft" style="padding:1rem; text-align:center;"><div style="height:12px; width:240px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div><div style="height:12px; width:320px; margin:.35rem auto; background:rgba(255,255,255,.06); border-radius:8px;"></div></div>`; }

  function wizardGo(state, id){
    $$("#ncf-wizard .step").forEach(x=>x.classList.remove("active"));
    $(id).classList.add("active");
    state.wizard.step=id;
    wLS(DEFAULTS.ls.wizard, state.wizard);
  }

  function buildTokenOptionsFromSource(source){
    const list = source==="telegram" ? telegramBalances() : twitchBalances();
    const m=new Map();
    list.forEach(x=>{ const s=(x.symbol||"").toUpperCase(); if(!s) return; m.set(s, num(m.get(s),0)+num(x.amount,0)); });
    return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([symbol,amount])=>({symbol,amount}));
  }

  function renderTokenLibrary(state){
    const list=$("#ncf-token-list");
    const holdings=sumHoldingsFromDom();
    const arr=state.tokens.slice().sort((a,b)=>num(holdings.get(b.symbol),0)-num(holdings.get(a.symbol),0));
    if(!arr.length){ list.innerHTML=`<div class="help">No tokens configured. Add some above.</div>`; return; }
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
        state.tokens=state.tokens.filter(x=>!(x.contract===c&&x.symbol===s));
        Object.keys(state.rewardsPerToken).forEach(k=>{ if(state.rewardsPerToken[k]) delete state.rewardsPerToken[k][`${c}:${s}`];});
        wLS(DEFAULTS.ls.tokens,state.tokens); wLS(DEFAULTS.ls.rewardsPerToken,state.rewardsPerToken);
        renderTokenLibrary(state); updateRewardsPanel(state);
      });
    });
  }

  function sectionId(name){ return `ncf-sec-${name.replace(/[^a-z0-9]+/gi,"-")}`; }
  function th(l,k){ return `<th data-key="${k}" aria-sort="none">${l}</th>`; }
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

  function renderSections(el,data,state){
    const search=(state.search||"").toLowerCase().trim();
    const f=state.schemaFilter||"";
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
      const sid=sectionId(s.schema_name); const open=state.expandAll?" open":"";
      return `<details class="ncf-section"${open} id="${sid}">
        <summary style="display:flex; align-items:center; gap:.6rem; padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.08);">
          <span><strong>${esc(s.schema_name)}</strong></span><span class="badge">${s.templates.length}</span>
          <div style="margin-left:auto;" class="row"><button class="btn btn-ghost ncf-sec-select">Select schema</button><button class="btn btn-ghost ncf-sec-clear">Clear</button></div>
        </summary>
        <div style="overflow:auto;">
          <table class="ncf-table" data-schema="${esc(s.schema_name)}">
            <thead><tr>
              <th style="width:44px;"><input type="checkbox" class="ncf-head-check" title="Select visible"></th>
              ${th("ID","template_id")}${th("Name","template_name")}${th("Circulating","circulating_supply")}${th("Max","max_supply")}${th("% Mint","pct")}
            </tr></thead>
            <tbody>${s.templates.map(t=>rowHtml(s.schema_name,t,!!state.selection[selectionKey(state.collection,s.schema_name,t.template_id)])).join("")}</tbody>
          </table>
        </div></details>`;
    }).join("");
    filtered.forEach(s=>bindSection(sectionId(s.schema_name), s, state));
  }

  function bindSection(sid, schema, state){
    const sec=document.getElementById(sid);
    const table=$("table",sec);
    const head=$(".ncf-head-check",sec);
    $(".ncf-sec-select",sec).addEventListener("click",()=>{
      $$("tbody tr",table).forEach(r=>{ const chk=$(".ncf-row-check",r); if(!chk.checked) chk.checked=true; setSelected(state,state.collection,schema.schema_name,Number(r.dataset.tid),true);});
      updateRewardsPanel(state);
    });
    $(".ncf-sec-clear",sec).addEventListener("click",()=>{
      $$("tbody tr",table).forEach(r=>{ const chk=$(".ncf-row-check",r); if(chk.checked) chk.checked=false; setSelected(state,state.collection,schema.schema_name,Number(r.dataset.tid),false);});
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
    $$(".ncf-row-check",sec).forEach(chk=>chk.addEventListener("change",e=>{ const tr=e.target.closest("tr"); setSelected(state,state.collection,schema.schema_name,Number(tr.dataset.tid),e.target.checked); updateRewardsPanel(state);}));
    head.addEventListener("change",e=>{ $$("tbody tr",table).forEach(r=>{ const chk=$(".ncf-row-check",r); chk.checked=e.target.checked; setSelected(state,state.collection,schema.schema_name,Number(r.dataset.tid),e.target.checked);}); updateRewardsPanel(state);});
  }

  function loadSel(){ return rLS(DEFAULTS.ls.selection,{}); }
  function saveSel(s){ wLS(DEFAULTS.ls.selection,s); }
  function loadTokens(){ return rLS(DEFAULTS.ls.tokens,[]); }
  function saveTokens(a){ wLS(DEFAULTS.ls.tokens,a); }
  function loadRPT(){ return rLS(DEFAULTS.ls.rewardsPerToken,{}); }
  function saveRPT(m){ wLS(DEFAULTS.ls.rewardsPerToken,m); }
  function loadExp(){ return rLS(DEFAULTS.ls.expiry,{}); }
  function saveExp(m){ wLS(DEFAULTS.ls.expiry,m); }

  function setSelected(state, collection, schema, tid, on){
    const k=selectionKey(collection,schema,tid);
    if(on) state.selection[k]={collection,schema_name:schema,template_id:tid};
    else { delete state.selection[k]; delete state.rewardsPerToken[k]; delete state.expiry[k]; }
    saveSel(state.selection); saveRPT(state.rewardsPerToken); saveExp(state.expiry); updateSelectedCount(state);
  }
  function updateSelectedCount(state){
    const c=Object.values(state.selection).filter(x=>x.collection===state.collection).length;
    $("#ncf-count-selected").textContent=`Selected: ${c}`;
  }

  function enrichFromTable(schemaName, tid){
    const sid=sectionId(schemaName);
    const row=$(`#${sid} tr[data-tid="${tid}"]`);
    let name=null,circ=0,max=null;
    if(row){
      name=row.children[2].textContent.trim()||null;
      circ=Number(row.children[3].textContent.trim().replace(/[^\d]/g,""))||0;
      const m=row.children[4].textContent.trim(); max=m==="—"?null:Number(m.replace(/[^\d]/g,""))||0;
    }
    return {template_name:name,circulating_supply:circ,max_supply:max};
  }

  function activeTokenIds(state){
    const ids=new Set(); Object.values(state.rewardsPerToken).forEach(m=>{ if(!m) return; Object.keys(m).forEach(id=>ids.add(id)); }); return ids;
  }

  function renderFarmBalances(state){
    const tb = $("#ncf-farm-balances");
    const last = state.farmBalancesTS ? new Date(state.farmBalancesTS) : null;
    const ts = last ? last.toLocaleString() : "—";
  
    const ids = activeTokenIds(state); // Set("contract:symbol")
    const rows = [];
    let anyZero = false;
  
    if (ids.size) {
      ids.forEach(id => {
        const [c,s] = id.split(":");
        const bal = num(state.farmBalances.get(s), 0);
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
      // Nessun token "attivo" nelle regole ⇒ mostra tutti i saldi del Farm-Wallet
      if (state.farmBalances && state.farmBalances.size) {
        Array.from(state.farmBalances.entries())
          .sort((a,b)=>b[1]-a[1]) // saldo desc
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
  
    // Avviso solo se ci sono token attivi e almeno uno ha saldo 0.
    $("#ncf-farm-alert").style.display = (ids.size && anyZero) ? "" : "none";
  
    // Hint: se non ci sono token attivi, niente messaggi confusivi
    if (!ids.size) {
      $("#ncf-user-hints").innerHTML =
        `<p class="help" style="margin:0;">Tip: add a token on the Right Library (Step 4) to mark it as “active” (available as reward in your farm).</p>`;
    } else {
      // Mostra “hai X in TW/TG” per i token attivi
      const holdings = sumHoldingsFromDom();
      const hints = [];
      ids.forEach(id => {
        const [, symbol] = id.split(":");
        const have = num(holdings.get(symbol), 0);
        if (have > 0) hints.push(`You hold <strong>${fmt(have)} ${esc(symbol)}</strong> across Twitch/Telegram wallets.`);
      });
      $("#ncf-user-hints").innerHTML = hints.length
        ? `<p class="help" style="margin:0;">${hints.join(" ")}</p>`
        : `<p class="help" style="margin:0;">No local balances detected for your active tokens.</p>`;
    }
  }

  async function refreshFarmWalletBalances(state, cfg){
    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.farmBalances);
    try{
      const wax = getWax();
      const qs = wax ? `?creator=${encodeURIComponent(wax)}` : "";
      const raw = await fetchJson(url + qs);
  
      // ⚠️ Alcuni backend rispondono con una STRINGA JSON; normalizziamo.
      let data = raw;
      if (typeof data === "string") {
        try { data = JSON.parse(data); } catch { data = []; }
      }
      if (!Array.isArray(data)) data = [];
  
      const m = new Map();
      data.forEach(x => {
        const sym = (x.symbol || x.token_symbol || "").toUpperCase();
        if (!sym) return;
        m.set(sym, num(x.amount, 0));
      });
  
      state.farmBalances = m;
      state.farmBalancesTS = Date.now();
      renderFarmBalances(state);
    }catch(e){
      toast(String(e.message||e), "error");
    }
  }

  async function fetchFarmsForCreator(cfg){
    const wax = getWax();
    if(!wax) return [];
    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.farmsByCreator) + `?creator=${encodeURIComponent(wax)}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = []; } }
    return Array.isArray(data) ? data : [];
  }
  
  async function fetchFarmStats(cfg, {farm_id=null} = {}){
    let qs = farm_id ? `?farm_id=${encodeURIComponent(farm_id)}` : `?creator=${encodeURIComponent(getWax()||"")}`;
    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.farmStats) + qs;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = {}; } }
    return data || {};
  }
  
  async function fetchDistributions(cfg, {farm_id=null, limit=100} = {}){
    if(!farm_id) return [];
    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.farmDistributions) + `?farm_id=${encodeURIComponent(farm_id)}&limit=${limit}`;
    let data = await fetchJson(url);
    if (typeof data === "string") { try{ data = JSON.parse(data);} catch{ data = []; } }
    return Array.isArray(data) ? data : [];
  }
  
  async function postKick(cfg, body){
    const url = buildUrl(apiBase(cfg), DEFAULTS.endpoints.farmKick);
    return postJson(url, body);
  }
  
  function renderFarmPicker(state, farms){
    const sel = $("#ncf-farm-picker");
    const cur = sel.value;
    const opts = [`<option value="">All farms (this creator)</option>`]
      .concat(farms.map(f => `<option value="${esc(String(f.farm_id))}">#${esc(String(f.farm_id))} — ${esc(f.collection||"")}</option>`));
    sel.innerHTML = opts.join("");
    if (farms.some(f => String(f.farm_id) === cur)) sel.value = cur;
  }
  
function groupStatsView(stats){
  // shape attesa:
  // {
  //   summary: {
  //     owners, assets, last_distribution_at,
  //     per_token_last_cycle: { [SYMBOL]: totalPaid },
  //     active_tokens_last_cycle, active_templates_last_cycle,
  //     templates_configured_with_rewards
  //   },
  //   owners: [
  //     {
  //       owner, assets, last_rewarded_at,
  //       tokens: [{symbol, amount, token_contract}],
  //       trees: [{schema_name, template_id, token_contract, token_symbol, amount}]
  //     }, ...
  //   ]
  // }
  const owners = Array.isArray(stats?.owners) ? stats.owners : [];
  const head   = stats?.summary || {};

  // Header badges (già presenti nel layout)
  $("#ncf-stats-head-owners").textContent = `Unique owners: ${head.owners ?? owners.length}`;
  $("#ncf-stats-head-assets").textContent = `Staked assets: ${head.assets ?? 0}`;
  $("#ncf-stats-head-lastdist").textContent = `Last distribution: ${head.last_distribution_at ? new Date(head.last_distribution_at).toLocaleString() : "—"}`;

  // Pannello riepilogo extra (inserito in cima all'area grouped)
  const perToken = head.per_token_last_cycle && typeof head.per_token_last_cycle === "object"
    ? Object.entries(head.per_token_last_cycle).map(([sym, tot]) => [String(sym).toUpperCase(), Number(tot) || 0])
    : [];
  perToken.sort((a,b)=>b[1]-a[1]);

  const kpiCards = `
    <div class="grid" style="gap:10px; margin-bottom:10px;">
      <div class="row" style="gap:10px; flex-wrap:wrap;">
        <div class="badge" title="Number of tokens that actually paid something in the last completed cycle.">
          Active tokens (last cycle): ${head.active_tokens_last_cycle ?? perToken.length}
        </div>
        <div class="badge" title="Templates that produced any payout in the last completed cycle.">
          Active templates (last cycle): ${head.active_templates_last_cycle ?? 0}
        </div>
        <div class="badge" title="Templates configured with at least one active reward (configuration, not payout).">
          Templates with rewards (configured): ${head.templates_configured_with_rewards ?? 0}
        </div>
      </div>
      ${
        perToken.length
          ? `
            <div class="soft" style="padding:8px;">
              <div class="row" style="justify-content:space-between; align-items:center;">
                <h4 style="margin:.2rem 0;">Per-token totals (last cycle)</h4>
                <small class="help" title="Total amount distributed per token in the last completed payout cycle (typically daily).">What is this?</small>
              </div>
              <table>
                <thead>
                  <tr>
                    <th title="Token symbol">Token</th>
                    <th title="Total amount distributed in the last completed cycle">Total paid (last cycle)</th>
                  </tr>
                </thead>
                <tbody>
                  ${perToken.map(([sym,tot])=>`
                    <tr>
                      <td><strong>${esc(sym)}</strong></td>
                      <td>${fmt(tot)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="soft" style="padding:8px;">
               <div class="help">No token payouts recorded for the last cycle yet.</div>
             </div>`
      }
    </div>
  `;

  if (!owners.length) {
    $("#ncf-stats-grouped").innerHTML = kpiCards + `<div class="help">No stakers yet.</div>`;
    return;
  }

  // Calcolo subtotale per owner (per ordinamento e visual)
  const ownersWithSubtotal = owners.map(o=>{
    const subtotal = (Array.isArray(o.tokens) ? o.tokens : []).reduce((a,b)=>a+Number(b.amount||0),0);
    return {...o, _subtotal: subtotal};
  }).sort((a,b)=> b._subtotal - a._subtotal || (b.assets||0) - (a.assets||0));

  const htmlOwners = ownersWithSubtotal.map(o=>{
    const owner = o.owner || "—";
    const last  = o.last_rewarded_at ? new Date(o.last_rewarded_at).toLocaleString() : "—";
    const tokensLine = (o.tokens||[]).map(t=>`${esc(t.symbol)}: ${fmt(t.amount)}`).join(", ") || "—";

    // nested: schema → template → token
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
          <div class="row" style="gap:.5rem;" title="Amount paid for this token on the last completed cycle for this template.">
            <span class="badge" title="Token symbol">${esc(r.token_symbol)}</span>
            <small class="muted" title="Token contract">@${esc(r.token_contract||"")}</small>
            <span class="muted">last cycle: <strong>${fmt(r.amount||0)}</strong></span>
          </div>
        `).join("");

        return `
          <details>
            <summary class="row" style="gap:.5rem;" title="Click to see token subtotals for this template.">
              <strong>Template</strong> <span class="badge">ID ${esc(tid)}</span>
            </summary>
            ${inner}
          </details>`;
      }).join("");

      const subtotal = arr.reduce((a,b)=>a+Number(b.amount||0),0);
      return `
        <details>
          <summary class="row" style="gap:.5rem;" title="Click to expand this schema details.">
            <strong>Schema</strong> <span class="badge">${esc(schema)}</span>
            <span class="badge ok" title="Sum of all token payouts for this schema (last cycle).">Subtotal: ${fmt(subtotal)}</span>
          </summary>
          <div class="grid" style="gap:6px;">${templatesHtml}</div>
        </details>`;
    }).join("");

    return `
      <details class="soft" style="padding:8px;">
        <summary class="row" style="gap:.6rem;">
          <strong title="Staker wallet">${esc(owner)}</strong>
          <span class="badge" title="How many NFTs this staker currently has staked in this farm.">Assets: ${fmt(o.assets||0)}</span>
          <span class="badge ok" title="Sum of all rewards (all tokens) this staker received in the last completed cycle.">
            Subtotal: ${fmt(o._subtotal)}
          </span>
          <span class="badge" title="When this staker last received a payout.">Last: ${esc(last)}</span>
        </summary>
        <div class="grid" style="gap:8px; margin-top:6px;">
          <div class="help" title="Per-token subtotal for the last completed cycle.">
            Tokens subtotal: ${esc(tokensLine)}
          </div>
          <div>${schemaBlocks || "<div class='help'>No details</div>"}</div>
          <div class="row" style="gap:.5rem; margin-top:6px;">
            <button class="btn btn-danger ncf-kick" data-owner="${esc(owner)}"
              title="Remove this staker from the farm (their assets will stop earning).">
              Kick from staking
            </button>
          </div>
        </div>
      </details>`;
  }).join("");

  $("#ncf-stats-grouped").innerHTML = kpiCards + htmlOwners;

  // Bind pulsanti "Kick"
  $$("#ncf-stats-grouped .ncf-kick").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const farmId = $("#ncf-farm-picker").value || null;
      const owner = btn.dataset.owner;
      const reason = "manual kick (UI)";
      if(!farmId){ toast("Pick a specific farm to kick.", "error"); return; }
      try{
        await postKick({apiBaseUrl: apiBase({})}, { farm_id: farmId, wax_account: owner, reason });
        toast(`Kick requested for ${owner}.`);
      }catch(e){ toast(String(e.message||e), "error"); }
    });
  });
}

  
  function renderDistributionsHistory(list){
    if (!Array.isArray(list) || !list.length) {
      $("#ncf-stats-history").innerHTML = `<div class="help">No history yet.</div>`;
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
  
  async function ensureStatsLoaded(state, cfg){
    try{
      // 1) farms list
      const farms = await fetchFarmsForCreator(cfg);
      $("#ncf-stats-head-farms").textContent = `Farms: ${farms.length}`;
      renderFarmPicker(state, farms);
  
      // 2) carica stats per farm selezionata o per creator
      const farmId = $("#ncf-farm-picker").value || null;
      const stats = await fetchFarmStats(cfg, { farm_id: farmId || null });
      groupStatsView(stats);
  
      // 3) history se farm selezionata
      const history = farmId ? (await fetchDistributions(cfg, {farm_id: farmId, limit: 200})) : [];
      renderDistributionsHistory(history);
  
    }catch(e){
      toast(String(e.message||e), "error");
    }
  }

  function startAuto(state,cfg){ stopAuto(state); state.monitorId=setInterval(()=>refreshFarmWalletBalances(state,cfg),DEFAULTS.autoMonitorEverySec*1000); }
  function stopAuto(state){ if(state.monitorId){ clearInterval(state.monitorId); state.monitorId=null; } }

  function updateTopupPanel(state,cfg){
    const src=$("#ncf-src").value||"twitch";
    const tok=$("#ncf-token"); const amt=$("#ncf-amount"); const hint=$("#ncf-bal-hint"); const empty=$("#ncf-empty");
    const opts=buildTokenOptionsFromSource(src);
    const cur=tok.value;
    tok.innerHTML=`<option value="">Select token…</option>`+opts.map(o=>`<option value="${o.symbol}">${o.symbol} — balance ${fmt(o.amount)}</option>`).join("");
    const first=opts.find(o=>o.amount>0)?.symbol||"";
    tok.value=opts.some(o=>o.symbol===cur)?cur:first;
    const sym=tok.value||""; const bal=num(opts.find(o=>o.symbol===sym)?.amount,0);
    hint.textContent=`Balance: ${fmt(bal)} ${sym||""}`;
    amt.value="";
    empty.style.display=opts.some(o=>o.amount>0)?"none":"";
  }

  function updateRewardsPanel(state){
    updateSelectedCount(state);
    const sel=Object.values(state.selection).filter(x=>x.collection===state.collection);
    const body=$("#ncf-rp-body");
    if(!sel.length){ body.innerHTML=`<div class="soft" style="padding:12px;text-align:center;">No templates selected yet.</div>`; return; }
    const tokens=state.tokens;
    body.innerHTML=sel.map(s=>{
      const k=selectionKey(s.collection,s.schema_name,s.template_id);
      const meta=enrichFromTable(s.schema_name,s.template_id);
      const minISO=toLoc(nowPlusMin(5));
      const exISO=state.expiry[k]||"";
      const chips=tokens.map(t=>{
        const id=`${t.contract}:${t.symbol}`;
        const on=!!(state.rewardsPerToken[k]&&state.rewardsPerToken[k][id]!==undefined);
        return `<label class="chip ${on?"active":""}" data-key="${esc(k)}" data-token="${esc(id)}"><input type="checkbox" style="display:none"${on?" checked":""}/><strong>${esc(t.symbol)}</strong><small class="muted">@${esc(t.contract)}</small></label>`;
      }).join("") || `<div class="help">Add tokens in the right panel.</div>`;
      const inputs = tokens.map(t => {
        const id = `${t.contract}:${t.symbol}`;
        const on = !!(state.rewardsPerToken[k] && state.rewardsPerToken[k][id] !== undefined);
        const v  = on ? (state.rewardsPerToken[k][id] ?? "") : "";
        const show = on ? "" : "display:none;";  // <- se attivo ma v==="", mostra comunque
      
        return `<div class="row ncf-reward-row" data-key="${esc(k)}" data-token="${esc(id)}" style="${show}">
          <span class="muted" style="min-width:160px;"><strong>${esc(t.symbol)}</strong> <small>@${esc(t.contract)}</small></span>
          <input type="number" class="input ncf-reward-input" step="0.0001" min="0" placeholder="Reward per asset(NFT) each day" value="${String(v)}" style="width:220px;">
        </div>`;
      }).join("");
      return `<div class="soft" style="padding:10px;" data-item="${esc(k)}">
        <div class="row" style="justify-content:space-between;"><div class="row" style="gap:.5rem;"><strong>${esc(s.schema_name)}</strong><span class="muted">ID <button class="btn btn-ghost ncf-id-btn" style="padding:.15rem .5rem;">${s.template_id}</button></span></div><button class="btn btn-ghost ncf-remove">Remove</button></div>
        <div class="help" style="margin:.25rem 0 .5rem;">${esc(meta.template_name||"—")} · Circulating: ${fmt(meta.circulating_supply)} · Max: ${meta.max_supply==null?"—":fmt(meta.max_supply)}</div>
        <div class="grid" style="gap:8px;">
          <div class="row" style="align-items:flex-end;">
            <div class="col"><label class="muted"><small>Max validity</small></label><input type="datetime-local" class="input ncf-expiry" min="${minISO}" value="${exISO?toLoc(new Date(exISO)):""}" style="min-width:220px;"></div>
            <button class="btn btn-ghost ncf-plus7">+7d</button><button class="btn btn-ghost ncf-plus30">+30d</button>
          </div>
          <div class="col"><label class="muted"><small>Tokens</small></label><div class="row ncf-token-chips" style="flex-wrap:wrap;">${chips}</div></div>
          <div class="col"><div class="ncf-token-inputs">${inputs}</div></div>
        </div></div>`;
    }).join("");
    $$("#ncf-rp-body .ncf-id-btn").forEach(b=>b.addEventListener("click",()=>navigator.clipboard.writeText(b.textContent.trim()).then(()=>toast("Template ID copied"))));
    $$("#ncf-rp-body .ncf-remove").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const obj=state.selection[k]; if(!obj) return;
      const sid=sectionId(obj.schema_name); const row=$(`#${sid} tr[data-tid="${obj.template_id}"]`); if(row){ const chk=$(".ncf-row-check",row); if(chk) chk.checked=false; }
      delete state.selection[k]; delete state.rewardsPerToken[k]; delete state.expiry[k];
      saveSel(state.selection); saveRPT(state.rewardsPerToken); saveExp(state.expiry); updateRewardsPanel(state);
    }));
    $$("#ncf-rp-body .ncf-expiry").forEach(inp=>inp.addEventListener("change",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const nd=parseLoc(e.target.value);
      if(!nd){ delete state.expiry[k]; saveExp(state.expiry); return; }
      const prev=state.expiry[k]?new Date(state.expiry[k]):null; if(prev && nd<prev){ e.target.value=toLoc(prev); toast("Expiration can only be extended.","error"); return; }
      state.expiry[k]=nd.toISOString(); saveExp(state.expiry);
    }));
    $$("#ncf-rp-body .ncf-plus7").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const inp=$(".ncf-expiry",box);
      const base=state.expiry[k]?new Date(state.expiry[k]):nowPlusMin(5); const d=new Date(base); d.setDate(d.getDate()+7);
      state.expiry[k]=d.toISOString(); saveExp(state.expiry); inp.value=toLoc(d);
    }));
    $$("#ncf-rp-body .ncf-plus30").forEach(btn=>btn.addEventListener("click",e=>{
      const box=e.target.closest("[data-item]"); const k=box.dataset.item; const inp=$(".ncf-expiry",box);
      const base=state.expiry[k]?new Date(state.expiry[k]):nowPlusMin(5); const d=new Date(base); d.setDate(d.getDate()+30);
      state.expiry[k]=d.toISOString(); saveExp(state.expiry); inp.value=toLoc(d);
    }));
    // Delegation per i chip (attivo sempre, anche dopo re-render)
    const cssEscape = (window.CSS && CSS.escape) ? CSS.escape : (s)=>String(s).replace(/"/g,'\\"');
    
    if (!state._chipDelegationBound) {
      document.getElementById("ncf-rp-body").addEventListener("click", (e) => {
        const chip = e.target.closest(".ncf-token-chips .chip");
        if (!chip) return;
    
        e.preventDefault();
        // toggle UI
        chip.classList.toggle("active");
    
        const k  = chip.dataset.key;
        const id = chip.dataset.token;
        const on = chip.classList.contains("active");
    
        // stato logico
        state.rewardsPerToken[k] = state.rewardsPerToken[k] || {};
        if (on) {
          if (state.rewardsPerToken[k][id] === undefined) state.rewardsPerToken[k][id] = "";
        } else {
          delete state.rewardsPerToken[k][id];
        }
        saveRPT(state.rewardsPerToken);
    
        // mostra/nascondi la riga input corrispondente
        const row = document.querySelector(
          `.ncf-reward-row[data-key="${cssEscape(k)}"][data-token="${cssEscape(id)}"]`
        );
        if (row) row.style.display = on ? "" : "none";
      });
    
      state._chipDelegationBound = true;
    }

    $$("#ncf-rp-body .ncf-reward-input").forEach(inp=>inp.addEventListener("input",e=>{
      const row=e.target.closest(".ncf-reward-row"); const k=row.dataset.key; const id=row.dataset.token;
      state.rewardsPerToken[k]=state.rewardsPerToken[k]||{}; state.rewardsPerToken[k][id]=e.target.value; saveRPT(state.rewardsPerToken);
    }));
  }

  function buildDraftPayload(state, perHour=false){
    const items = Object.values(state.selection)
      .filter(x => x.collection === state.collection)
      .map(x => {
        const k = `${x.collection}::${x.schema_name}::${x.template_id}`;
        const expiry = state.expiry[k] || null;
        const per = state.rewardsPerToken[k] || {};
        const rewards = [];
  
        Object.entries(per).forEach(([id, v]) => {
          const amount = Number(v);
          if (!isFinite(amount) || amount <= 0) return;
          const [contract, symbol] = id.split(":");
          const meta = state.tokens.find(t => t.contract === contract && t.symbol === symbol) || {};
          rewards.push({
            token_contract: contract,
            token_symbol: symbol,
            decimals: meta.decimals ?? null,
            // SOLO per-day verso il backend:
            reward_per_asset_per_day: amount
          });
        });
  
        return { schema_name: x.schema_name, template_id: Number(x.template_id), expiry, rewards };
      });
  
    return {
      collection: state.collection,
      creator_wax_account: getWax() || null,
      policy: {
        distribution: "daily",
        semantics: "Rewards are per asset_id per day. Expiration can only be extended.",
        deposit_required: "Payouts require a positive Farm-Wallet balance."
      },
      tokens_catalog: state.tokens,
      total_selected: items.length,
      items
    };
  }


  async function saveDraft(state,cfg){
    const url=buildUrl(apiBase(cfg),DEFAULTS.endpoints.saveRewards);
    const sel=Object.values(state.selection).filter(x=>x.collection===state.collection);
    if(!sel.length){ toast("Select at least one template.","error"); return false; }
    const any=sel.some(x=>{ const k=selectionKey(x.collection,x.schema_name,x.template_id); const m=state.rewardsPerToken[k]||{}; return Object.values(m).some(v=>String(v).trim()!=="" && Number(v)>0); });
    if(!any){ toast("Add at least one token with a positive daily reward.","error"); return false; }
    try{ const res=await postJson(url, buildDraftPayload(state,true)); if(!(res && (res.ok===true||res.status==="ok"))) throw new Error("Draft failed"); sel.forEach(t=>toast(`Draft saved for T${t.template_id}`)); return true; } catch(e){ toast(String(e.message||e),"error"); return false; }
  }

  function renderSummary(state){
    const fw=[];
    activeTokenIds(state).forEach(id=>{ const [,s]=id.split(":"); fw.push({symbol:s,balance:num(state.farmBalances.get(s),0)});});
    const rows=Object.values(state.selection).filter(x=>x.collection===state.collection).map(x=>{
      const k=selectionKey(x.collection,x.schema_name,x.template_id);
      const per=state.rewardsPerToken[k]||{}; const exp=state.expiry[k]?new Date(state.expiry[k]).toLocaleString():"—";
      const rr=Object.entries(per).filter(([,v])=>Number(v)>0).map(([id,v])=>{ const [,s]=id.split(":"); return `${esc(s)}: ${v}/day`; }).join(", ") || "—";
      const meta=enrichFromTable(x.schema_name,x.template_id);
      return `<tr><td>${esc(x.schema_name)} <small class="muted">ID ${x.template_id} — ${esc(meta.template_name||"—")}</small></td><td>${rr}</td><td>${esc(exp)}</td></tr>`;
    }).join("");
    const fwRows=fw.length?fw.map(t=>`<li>${esc(t.symbol)} — Farm balance: <strong>${fmt(t.balance)}</strong></li>`).join(""):"<li>No active tokens</li>";
    $("#ncf-summary").innerHTML=`<div class="grid" style="gap:8px;">
      <div class="row"><strong>Collection:</strong> <span>${esc(state.collection)}</span></div>
      <div class="row"><strong>Creator:</strong> <span>${esc(getWax()||"—")}</span></div>
      <div class="soft" style="padding:8px;"><div class="muted">Farm-Wallet overview</div><ul class="help" style="margin:.3rem 0 0 1rem;">${fwRows}</ul></div>
      <div class="soft" style="padding:8px;"><table style="width:100%"><thead><tr><th>Template</th><th>Rewards (per day)</th><th>Expiry</th></tr></thead><tbody>${rows||`<tr><td colspan="3">No templates</td></tr>`}</tbody></table></div>
    </div>`;
  }

  function renderFinalTable(state){
    const root=$("#ncf-farm-table");
    const ids=activeTokenIds(state);
    const rows=Object.values(state.selection).filter(x=>x.collection===state.collection).map(x=>{
      const k=selectionKey(x.collection,x.schema_name,x.template_id);
      const per=state.rewardsPerToken[k]||{}; const exp=state.expiry[k]?new Date(state.expiry[k]).toLocaleString():"—";
      const tokenRows=Object.entries(per).filter(([,v])=>Number(v)>0).map(([id,v])=>{
        const [c,s]=id.split(":"); const bal=num(state.farmBalances.get(s),0); const st=bal>0?"OK":(ids.has(id)?"Low/0":"—");
        return `<div class="row" style="gap:.5rem;"><span class="badge">${esc(s)}</span><small class="muted">@${esc(c)}</small><span class="muted">reward: ${v}/day</span><span class="muted">FW: ${fmt(bal)}</span><span class="badge ${bal>0?"ok":"err"}">${st}</span></div>`;
      }).join("") || "<div class='muted'>—</div>";
      const meta=enrichFromTable(x.schema_name,x.template_id);
      return `<tr><td><strong>${esc(x.schema_name)}</strong> <small class="muted">ID ${x.template_id} — ${esc(meta.template_name||"—")}</small></td><td>${tokenRows}</td><td>${esc(exp)}</td></tr>`;
    }).join("");
    root.innerHTML=`<table><thead><tr><th>Template</th><th>Token → reward/h → FW balance</th><th>Expiry</th></tr></thead><tbody>${rows||`<tr><td colspan="3">No data</td></tr>`}</tbody></table>`;
  }

  async function performTopUp(state,cfg){
    const src=($("#ncf-src").value||"twitch").toLowerCase();
    const sym=($("#ncf-token").value||"").toUpperCase();
    const amt=Number($("#ncf-amount").value||"0");
    if(!sym){ toast("Select a token.","error"); return; }
    if(!(amt>0)){ toast("Enter a positive amount.","error"); return; }
    const opts=buildTokenOptionsFromSource(src); const bal=num(opts.find(o=>o.symbol===sym)?.amount,0);
    if(amt>bal){ toast("Amount exceeds your wallet balance.","error"); return; }
    const tc=(state.tokens.find(t=>(t.symbol||"").toUpperCase()===sym)?.contract)||null;
    const payload={creator_wax_account:getWax()||null, source:src, token_symbol:sym, token_contract:tc||undefined, amount:amt};
    try{
      const res=await postJson(buildUrl(apiBase(cfg),DEFAULTS.endpoints.depositToFarm), payload);
      if(!res||res.ok!==true) throw new Error("Deposit failed");
      toast("Deposit completed.");
      if(res.balances?.twitch) window.twitchWalletBalances=res.balances.twitch;
      if(res.balances?.telegram) window.telegramWalletBalances=res.balances.telegram;
      updateTopupPanel(state,cfg); await refreshFarmWalletBalances(state,cfg);
    }catch(e){ toast(String(e.message||e),"error");}
  }

  function initManageNFTsFarm(opts={}){
    injectStyles();
    const cfg={...DEFAULTS,...opts};
    const host = cfg.containerId ? document.getElementById(cfg.containerId) : (()=>{const d=document.createElement("div"); d.id="ncf-root-auto"; document.body.appendChild(d); return d;})();
    createLayout(host,cfg);
    let state;
    state={
      apiBaseUrl: apiBase(cfg),
      collection: rLS(DEFAULTS.ls.lastCollection,""),
      raw:null,
      search:"",
      schemaFilter:"",
      expandAll:true,
      selection: loadSel(),
      tokens: loadTokens(),
      rewardsPerToken: loadRPT(),
      expiry: loadExp(),
      farmBalances:new Map(),
      farmBalancesTS:null,
      monitorId:null,
      wizard: rLS(DEFAULTS.ls.wizard,{step:"#ncf-step-a"})
    };
    bindTabs(state, cfg);
    $("#ncf-collection").value=state.collection||"";
    $("#ncf-auto").checked=!!rLS(DEFAULTS.ls.autoMonitor,false);

    $("#ncf-load").addEventListener("click",()=>doLoad(state,cfg));
    $("#ncf-collection").addEventListener("keydown",(e)=>{ if(e.key==="Enter") doLoad(state,cfg); });

    $("#ncf-src").addEventListener("change",()=>updateTopupPanel(state,cfg));
    $("#ncf-token").addEventListener("change",()=>updateTopupPanel(state,cfg));
    $("#ncf-max").addEventListener("click",()=>{ const src=$("#ncf-src").value||"twitch"; const sym=($("#ncf-token").value||"").toUpperCase(); if(!sym) return; const bal=buildTokenOptionsFromSource(src).find(o=>o.symbol===sym)?.amount||0; $("#ncf-amount").value=String(bal);});
    $("#ncf-deposit").addEventListener("click",()=>performTopUp(state,cfg));
    $("#ncf-copy-account").addEventListener("click",()=>navigator.clipboard.writeText(cfg.farmWalletAccount).then(()=>toast("Account copied")));
    $("#ncf-copy-tw").addEventListener("click",()=>navigator.clipboard.writeText(cfg.memoTwitch).then(()=>toast("Memo copied")));
    $("#ncf-copy-tg").addEventListener("click",()=>navigator.clipboard.writeText(cfg.memoTelegram).then(()=>toast("Memo copied")));
    $("#ncf-refresh-farm").addEventListener("click",()=>refreshFarmWalletBalances(state,cfg));
    $("#ncf-auto").addEventListener("change",(e)=>{ wLS(DEFAULTS.ls.autoMonitor,!!e.target.checked); if(e.target.checked) startAuto(state,cfg); else stopAuto(state); });

    $("#ncf-search").addEventListener("input",(e)=>{ state.search=e.target.value||""; if(state.raw) renderSections($("#ncf-sections"), state.raw, state); });
    $("#ncf-schema").addEventListener("change",(e)=>{ state.schemaFilter=e.target.value||""; if(state.raw) renderSections($("#ncf-sections"), state.raw, state); });
    $("#ncf-expand").addEventListener("click",()=>{ state.expandAll=!state.expandAll; $("#ncf-expand").textContent=state.expandAll?"Collapse all":"Expand all"; if(state.raw) renderSections($("#ncf-sections"), state.raw, state); });
    $("#ncf-select-all").addEventListener("click",()=>{ if(!state.raw) return; (state.raw.schemas||[]).forEach(s=>(s.templates||[]).forEach(t=>setSelected(state,state.collection,s.schema_name,Number(t.template_id),true))); $$(".ncf-row-check").forEach(c=>c.checked=true); updateRewardsPanel(state); });
    $("#ncf-clear").addEventListener("click",()=>{ if(!state.raw) return; Object.keys(state.selection).forEach(k=>{ if(k.startsWith(`${state.collection}::`)){ delete state.selection[k]; delete state.rewardsPerToken[k]; delete state.expiry[k]; }}); saveSel(state.selection); saveRPT(state.rewardsPerToken); saveExp(state.expiry); $$(".ncf-row-check").forEach(c=>c.checked=false); updateRewardsPanel(state); });

    $("#ncf-tok-add").addEventListener("click",()=>{ const c=$("#ncf-tok-contract").value.trim(); const s=$("#ncf-tok-symbol").value.trim().toUpperCase(); const d=$("#ncf-tok-dec").value===""?null:Number($("#ncf-tok-dec").value); if(!c||!s){ toast("Provide contract and symbol.","error"); return; } if(state.tokens.some(t=>t.contract===c&&t.symbol===s)){ toast("Token already present."); return; } state.tokens.push({contract:c,symbol:s,decimals:d}); saveTokens(state.tokens); $("#ncf-tok-contract").value=""; $("#ncf-tok-symbol").value=""; $("#ncf-tok-dec").value=""; renderTokenLibrary(state); updateRewardsPanel(state); });
    $("#ncf-farm-picker").addEventListener("change", ()=> ensureStatsLoaded(state, cfg));
    $("#ncf-refresh-stats").addEventListener("click", ()=> ensureStatsLoaded(state, cfg));

    $("#ncf-next-b").addEventListener("click",()=>{
      const ok = true; if(!ok){ toast("Complete this step first.","error"); return; }
      wizardGo(state,"#ncf-step-c");
    });
    $("#ncf-save-draft").addEventListener("click",()=>saveDraft(state,cfg));
    $("#ncf-next-c").addEventListener("click",()=>{
      const count=Object.values(state.selection).filter(x=>x.collection===state.collection).length;
      if(!count){ toast("Select at least one template.","error"); return; }
      wizardGo(state,"#ncf-step-d"); updateRewardsPanel(state);
    });
    $("#ncf-next-d").addEventListener("click",async()=>{
      const ok=await saveDraft(state,cfg); if(!ok) return;
      renderSummary(state); wizardGo(state,"#ncf-step-e");
    });
    $("#ncf-confirm").addEventListener("click",async()=>{
      const ok=await saveDraft(state,cfg); if(!ok) return;
      toast("Configuration saved."); $("#ncf-wizard").style.display="none"; $("#ncf-collapsed").style.display=""; $("#ncf-summary-table").style.display=""; renderFinalTable(state);
    });

    document.addEventListener("visibilitychange",()=>{ if(document.hidden) stopAuto(state); });

    renderTokenLibrary(state);
    wizardGo(state, state.collection ? "#ncf-step-b" : "#ncf-step-a");
    if(state.collection) doLoad(state,cfg); else updateTopupPanel(state,cfg);
  }

  async function doLoad(state,cfg){
    const col=$("#ncf-collection").value.trim();
    if(!col){ toast("Enter a collection name.","error"); return; }
    state.collection=col; wLS(DEFAULTS.ls.lastCollection,col); $("#ncf-meta").textContent="Loading…"; $("#ncf-sections").innerHTML=""; renderSkeleton($("#ncf-status"));
    try{
      const data=await postJson(buildUrl(apiBase(cfg),DEFAULTS.endpoints.templatesBySchema),{collection_name:col});
      state.raw=data;
      const opts=(data.schemas||[]).map(s=>`<option value="${esc(s.schema_name)}">${esc(s.schema_name)}</option>`).join("");
      $("#ncf-schema").innerHTML=`<option value="">All schemas</option>${opts}`;
      const ts=(data.schemas||[]).length, tt=(data.schemas||[]).reduce((a,s)=>a+(s.templates?.length||0),0);
      $("#ncf-meta").textContent=`Collection: ${data.collection} — Schemas ${ts} — Templates ${tt}`;
      $("#ncf-status").innerHTML=""; renderSections($("#ncf-sections"),data,state); updateRewardsPanel(state);
      wizardGo(state,"#ncf-step-b");
      await refreshFarmWalletBalances(state,cfg);
      updateTopupPanel(state,cfg);
      if($("#ncf-auto").checked) startAuto(state,cfg);
    }catch(e){
      $("#ncf-status").innerHTML=`<div class="soft" style="padding:14px; text-align:center;">${esc(String(e.message||e))}</div>`;
      $("#ncf-meta").textContent="Error";
    }
  }

  window.initManageNFTsFarm = initManageNFTsFarm;
})();
