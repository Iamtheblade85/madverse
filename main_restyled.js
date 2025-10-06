// ===== Version & Fetch Guard (anti-cache, reload coerente) =====
(() => {
  const FRONT_BUILD = window.__APP_BUILD__ || window.__DEX_BUILD__ || "dev";
  const BASE = (window.BASE_URL || "").replace(/\/+$/,"");

  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : (input?.url || "");
    const sameBackend = BASE && (url.startsWith(BASE) || url.startsWith("/"));
    const headers = new Headers(init.headers || {});
    headers.set("X-Client-Version", FRONT_BUILD);

    const res = await _origFetch(input, { ...init, cache: "no-store", headers });
    try {
      if (sameBackend) {
        const sv = res.headers.get("x-app-version");
        if (sv && sv !== FRONT_BUILD && !sessionStorage.getItem("__ver_mismatch")) {
          sessionStorage.setItem("__ver_mismatch", "1");
          location.replace(location.pathname + location.search + (location.hash || ""));
        }
      }
    } catch (_) {}
    return res;
  };

  // esponi per altri moduli
  window.__FRONT_BUILD__ = FRONT_BUILD;
})();

// Globals
window.userData = {};
window.selectedNFTs = new Set();
window.currentPage = 1;
window.nftsPerPage = 24;
window.activePerks = []; // Oggetti: { image, frame, x, y, tick, dir, etc }
window.activeChests = [];
window.expeditionTimersRunning = window.expeditionTimersRunning || {};

// === Precision helpers (global) ===
function getTokenDecimals(symbol) {
  const sym = (symbol || '').toUpperCase();

  const list = window.availableTokensDetailed || [];
  const official = (window.OFFICIAL_TOKENS || []).find(o => o.symbol === sym);
  if (official) {
    const m = list.find(t => (t.symbol || '').toUpperCase() === sym && (t.contract || '') === official.contract);
    if (m && Number.isInteger(m.precision)) return m.precision;
  }
  const m2 = list.find(t => (t.symbol || '').toUpperCase() === sym && Number.isInteger(t.precision));
  if (m2) return m2.precision;

  const p = (window.stakingPools || []).find(p => (p.deposit_token?.symbol || '').toUpperCase() === sym);
  if (p && Number.isInteger(p.deposit_token?.decimals)) return p.deposit_token.decimals;

  return 8;
}

function stepFromDecimals(dec) {
  return dec > 0 ? '0.' + '0'.repeat(dec - 1) + '1' : '1';
}

function truncToDecimals(value, dec) {
  const factor = Math.pow(10, dec);
  return Math.trunc((Number(value) || 0) * factor) / factor;
}

function fmtAmount(value, dec) {
  return truncToDecimals(value, dec).toFixed(dec);
}

function onDomReady(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") fn();
  else document.addEventListener("DOMContentLoaded", fn);
}

function isLoggedIn() {
  const { userId, usx_token, wax_account } = window.userData || {};
  return !!(userId && usx_token && wax_account);
}

function ensureNCFarmsLoaded(cb) {
  if (typeof window.initManageNFTsFarm === "function") return cb();
  if (window.__NCFARMS_LOADING__) {
    window.addEventListener("__ncfarms_ready__", cb, { once: true });
    return;
  }
  window.__NFTF_AUTO_DISABLED__ = true;
  window.__NCFARMS_LOADING__ = true;

  const build = window.__APP_BUILD__ || "dev";
  const selfSrc = Array.from(document.scripts).map(s => s.src).find(u => /main_restyled\.js/.test(u)) || "";
  const base = selfSrc ? selfSrc.replace(/[^\/?#]+(\?.*)?$/, "") : "";
  const candidates = [
    base + `noncustodial_farms.js?v=${build}`,
    `/js/noncustodial_farms.js?v=${build}`,
  ];

  const s = document.createElement("script");
  s.defer = true;

  let i = 0;
  const tryNext = () => {
    if (i >= candidates.length) {
      window.__NCFARMS_LOADING__ = false;
      console.error("Caricamento noncustodial_farms.js fallito");
      return;
    }
    s.src = candidates[i++];
    s.onerror = tryNext;
    document.head.appendChild(s);
  };

  s.onload = () => {
    window.__NCFARMS_LOADING__ = false;
    window.dispatchEvent(new Event("__ncfarms_ready__"));
    cb();
  };

  tryNext();
}

/**
 * Calibra amount+slider secondo i decimali del token e tronca per difetto.
 * - maxAmount = floor(balance, dec) - 1 step (se possibile)
 * - step = 10^-dec
 * - sincronizza range<->amount
 */
async function calibrateAmountControls({ symbol, balance, amountInputId = 'amount', rangeId = 'percent-range' }) {
  if (!window.availableTokensDetailed || !window.availableTokensDetailed.length) {
    try { await loadAvailableTokens(); } catch (_) {}
  }
  const decimals = getTokenDecimals(symbol);
  const amountEl = document.getElementById(amountInputId);
  const rangeEl  = document.getElementById(rangeId);
  if (!amountEl || !rangeEl) {
    return { decimals, step: stepFromDecimals(decimals), get maxAmount(){ return 0; }, setBalance(){}, setAmount(){} };
  }

  const stepStr = stepFromDecimals(decimals);
  const computeMax = (bal) => {
    const stepVal = Math.pow(10, -decimals);
    const floored = truncToDecimals(bal, decimals);
    const max = floored - stepVal;                    // <= massimo selezionabile: un "tick" sotto il balance
    return max > 0 ? truncToDecimals(max, decimals) : 0;
  };

  let maxAmount = computeMax(balance);

  amountEl.setAttribute('step', stepStr);
  amountEl.setAttribute('inputmode', 'decimal');
  amountEl.setAttribute('autocomplete', 'off');
  amountEl.value = '0';
  amountEl.setAttribute('max', maxAmount.toFixed(decimals));

  const updateFromPercent = () => {
    const pct = parseFloat(rangeEl.value) || 0;
    const raw = (balance * pct) / 100;
    let val = truncToDecimals(raw, decimals);
    if (val >= maxAmount) val = maxAmount;
    if (val < 0) val = 0;
    amountEl.value = val.toFixed(decimals);
  };

  const updateFromAmount = () => {
    let val = Number(amountEl.value) || 0;
    val = truncToDecimals(val, decimals);
    if (val > maxAmount) val = maxAmount;
    if (val < 0) val = 0;
    amountEl.value = val.toFixed(decimals);
    const pct = balance > 0 ? Math.floor((val / balance) * 100) : 0;
    rangeEl.value = String(Math.max(0, Math.min(100, pct)));
  };

  // Evita doppie bind in caso di ricalibrazioni
  if (rangeEl.__calHandler) rangeEl.removeEventListener('input', rangeEl.__calHandler);
  if (amountEl.__calHandler) amountEl.removeEventListener('input', amountEl.__calHandler);
  rangeEl.__calHandler = updateFromPercent;
  amountEl.__calHandler = updateFromAmount;
  rangeEl.addEventListener('input', updateFromPercent);
  amountEl.addEventListener('input', updateFromAmount);

  return {
    decimals,
    step: stepStr,
    get maxAmount() { return maxAmount; },
    setBalance(newBal) {
      balance = Number(newBal) || 0;
      maxAmount = computeMax(balance);
      amountEl.setAttribute('max', maxAmount.toFixed(decimals));
      updateFromAmount();
    },
    setAmount(v) {
      amountEl.value = String(v);
      updateFromAmount();
    }
  };
}

// === Modal Close Listener ===
document.addEventListener("click", (event) => {
  if (event.target.matches('.modal-close')) {
    const modal = event.target.closest('.modal');
    if (modal) {
      modal.classList.remove('active');
      modal.classList.add('hidden');
    }
    document.body.classList.remove('modal-open');
  }
});

// Base URL reale
const BASE_URL = "https://iamemanuele.pythonanywhere.com";
let availableTokens = [];
let originalData = [];
let filteredData = [];
let originalStormsData = [];
let currentSort = { key: '', direction: 'desc' };
let originalNftGiveawaysData = [];
let nftGiveawaySort = { key: '', direction: 'asc' };

function getUniqueValues(data, key) {
  return [...new Set(data.map(item => item[key]).filter(Boolean))].sort();
}

// Estrai parametri da URL
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    userId: params.get('user_id'),
    usx_token: params.get('usx_token')
  };
}

async function loadAvailableTokens() {
  try {
    const url = `${BASE_URL}/find_all_tokens`;
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    const payload = await response.json();

    // Il backend può rispondere come { tokens: [...] } o direttamente [...]
    const list = Array.isArray(payload?.tokens) ? payload.tokens : (Array.isArray(payload) ? payload : []);

    // Normalizziamo e salviamo sia forma "dettagliata" che stringhe legacy
    window.availableTokensDetailed = list.map(t => ({
      symbol: (t.symbol || t.token_symbol || '').toUpperCase(),
      contract: t.contract || t.account || t.contract_account || '',
      name: t.name || t.token_name || t.fullname || t.symbol || '',
      precision: t.precision ?? t.decimals ?? null
    })).filter(t => t.symbol && t.contract);

    // Back-compat con vecchio codice che consumava "SYMBOL-CONTRACT"
    window.availableTokens = window.availableTokensDetailed.map(t => `${t.symbol}-${t.contract}`);
  } catch (error) {
    console.error("[❌] Errore caricando tokens:", error);
    window.availableTokensDetailed = window.availableTokensDetailed || [];
    window.availableTokens = window.availableTokens || [];
  }
}

function handleNFTImageError(img) {
  img.onerror = null;
  img.src = 'https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeig2o4vay6s22kwcv6r6vt5psv3llsavotgr56g3ar2zcbf44ct4ge';
}

function applyStormsFiltersAndSort() {
  const channelFilter = document.getElementById('filter-channel')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';
  const offeredByFilter = document.getElementById('filter-offeredby')?.value || '';
  const startDateInput = document.getElementById('filter-start-date')?.value || '';
  const endDateInput = document.getElementById('filter-end-date')?.value || '';

  let filtered = originalStormsData.filter(record => {
    const recordDate = new Date(record.scheduled_time);

    const matchesChannel = !channelFilter || record.channel_name === channelFilter;
    const matchesStatus = !statusFilter || record.status === statusFilter;
    const matchesOfferedBy = !offeredByFilter || record.offered_by === offeredByFilter;
    const matchesStartDate = !startDateInput || recordDate >= new Date(startDateInput);
    const matchesEndDate = !endDateInput || recordDate <= new Date(endDateInput);

    return matchesChannel && matchesStatus && matchesOfferedBy && matchesStartDate && matchesEndDate;
  });

  if (currentSort.key) {
    filtered.sort((a, b) => {
      const aVal = a[currentSort.key];
      const bVal = b[currentSort.key];
      if (!aVal || !bVal) return 0;

      if (currentSort.direction === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }

  renderStormsTable(filtered);
}

// CHANGED: salva sia user_id che userId per compatibilità
function saveUserData(data, remember = false) {
  window.userData = {
    email: data.email,
    password: data.password,
    user_id: data.user_id ?? data.userId,   // <-- NEW
    userId: data.user_id ?? data.userId,    // <-- NEW (compat)
    usx_token: data.usx_token,
    wax_account: data.wax_account
  };
  if (remember) {
    localStorage.setItem('userData', JSON.stringify(window.userData));
  }
}

async function initApp() {
  console.info("[🔁] initApp started");

  // 1. Login automatico da localStorage (email + password)
  const saved = localStorage.getItem('userData');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const { email, password } = parsed;

      if (email && password) {
        const res = await fetch(`${BASE_URL}/login_mail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (res.ok && data.user_id && data.usx_token && data.wax_account) {
          saveUserData({ ...data, email, password }, true);
          return finalizeAppLoad();
        } 
      }
    } catch (err) {
      console.error("[❌] Error during auto-login:", err);
    }
  }

  // 2. Fallback login: user_id + usx_token da URL
  const urlParams = getUrlParams();
  if (urlParams.userId && urlParams.usx_token) {
    try {
      const res = await fetch(`${BASE_URL}/main_door?user_id=${encodeURIComponent(urlParams.userId)}&usx_token=${encodeURIComponent(urlParams.usx_token)}`);
      const data = await res.json();

      if (data.user_id && data.wax_account) {
        window.userData = {
          user_id: data.user_id,
          usx_token: urlParams.usx_token,
          wax_account: data.wax_account
        };
        return finalizeAppLoad();
      } 
    } catch (err) {
      console.error("[❌] Error in fallback login:", err);
    }
  }

  // 3. Nessun login valido → mostra login/registrazione
  renderAuthButton(false);
  openLoginModal();
}

async function finalizeAppLoad() {
  renderAuthButton(true);
  await loadAvailableTokens();
  window.dispatchEvent(new CustomEvent('user:loggedin', { detail: window.userData }));
  loadSection('loadLatestNews');
  document.querySelectorAll('.menu-button, .menu-btn').forEach(btn => { // <-- accetta entrambe le classi
    btn.addEventListener('click', (e) => {
      const section = e.target.getAttribute('data-section');
      loadSection(section);
    });
  });
}

function renderAuthButton(isLoggedIn) {
  const container = document.getElementById('auth-button-container');
  if (!container) return;

  let html = `
    <button id="auth-toggle-button" style="
      padding: 6px 12px;
      font-weight: bold;
      background-color: black;
      color: gold;
      border: 2px solid gold;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: 0 0 5px gold;
    ">
      ${isLoggedIn ? 'Logout' : 'Login'}
    </button>
  `;

  if (isLoggedIn && window.userData?.wax_account) {
    html += `
      <div class="intro-text" style="margin-top: 0.5rem;">
        Welcome ${window.userData.wax_account}
      </div>
    `;
    ensureBalancesLoaded()
  }

  container.innerHTML = html;
  document.getElementById('auth-toggle-button').onclick = () => {
    if (isLoggedIn) {
      localStorage.removeItem('userData');
      window.userData = {};
      location.reload();
    } else {
      openLoginModal();
    }
  };
}

function sanitizeHandle(v) {
  if (!v) return "";
  return v.trim().replace(/^@+/, ""); 
}

function openResetPwdModal() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const modalContent = modal.querySelector('.modal-content');
  const reqInputStyle = 'border:1px solid gold; box-shadow:0 0 4px rgba(255,215,0,0.35);';
  const optInputStyle = 'border:1px solid #444;';

  body.innerHTML = `
    <h3 class="modal-title">Reset Password</h3>

    <label class="form-label">Email <span style="color: gold;">(required)</span></label>
    <input type="email" id="rp-email" class="form-input" placeholder="your@email.com" required style="${reqInputStyle}">

    <label class="form-label">Wax Wallet <span style="color: gold;">(required)</span></label>
    <input type="text" id="rp-wax_account" class="form-input" placeholder="your wax wallet here" required style="${reqInputStyle}">

    <label class="form-label">Telegram username (without @)
      <span style="color: gray;">(optional — at least Telegram or Twitch)</span>
    </label>
    <input type="text" id="rp-telegram" class="form-input" placeholder="es. mario_rossi" style="${optInputStyle}">

    <label class="form-label">Twitch username (without @)
      <span style="color: gray;">(optional)</span>
    </label>
    <input type="text" id="rp-twitch" class="form-input" placeholder="es. mary_beauty" style="${optInputStyle}">

    <label class="form-label">New password <span style="color: gold;">(required)</span></label>
    <input type="password" id="rp-password" class="form-input" placeholder="Nuova password" required style="${reqInputStyle}">

    <label class="form-label">Confirm new password <span style="color: gold;">(required)</span></label>
    <input type="password" id="rp-password-confirm" class="form-input" placeholder="Repeat new password" required style="${reqInputStyle}">

    <div id="rp-feedback" style="margin-top: 0.75rem; font-size: 0.9rem;"></div>

    <div style="display:flex; gap:0.5rem; margin-top: 1rem;">
      <button class="btn btn-primary" id="rp-submit">Send request</button>
      <button class="btn" id="rp-back" style="background:#2b2b2b; border:1px solid #444;">Back to Login</button>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  // Pre-compila wax/email se già note
  if (window.userData?.wax_account) {
    const waxEl = document.getElementById('rp-wax_account');
    if (waxEl && !waxEl.value) waxEl.value = window.userData.wax_account;
  }
  if (window.userData?.email) {
    const emailEl = document.getElementById('rp-email');
    if (emailEl && !emailEl.value) emailEl.value = window.userData.email;
  }

  document.getElementById('rp-back').onclick = () => openLoginModal();
  document.getElementById('rp-submit').onclick = async () => {
    const email = document.getElementById('rp-email').value.trim();
    const wax = document.getElementById('rp-wax_account').value.trim();
    const telegram = sanitizeHandle(document.getElementById('rp-telegram').value);
    const twitch = sanitizeHandle(document.getElementById('rp-twitch').value);
    const pwd = document.getElementById('rp-password').value;
    const pwd2 = document.getElementById('rp-password-confirm').value;
    const feedback = document.getElementById('rp-feedback');

    if (!email) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = 'Email is required';
      return;
    }
    if (!wax) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = 'Wax Wallet is required due to security reasons.';
      return;
    }
    if (!telegram && !twitch) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = 'Insert at least one between Telegram or Twitch (without @).';
      return;
    }
    if (!pwd || !pwd2) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = 'Insert and confirm new password.';
      return;
    }
    if (pwd !== pwd2) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = 'Pssword doesn´t match. Please retype both fields again.';
      return;
    }

    const btn = document.getElementById('rp-submit');
    btn.disabled = true; btn.textContent = 'Sending...';

    try {
      const res = await fetch(`${BASE_URL}/reset_pwd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          wax_account: wax,
          telegram: telegram || null,
          twitch: twitch || null,
          new_password: pwd
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `Error ${res.status}`;
        throw new Error(msg);
      }

      feedback.style.color = 'gold';
      feedback.innerHTML = `✅ Password updated successfully. You can now do login.`;
      document.getElementById('rp-back').focus();

    } catch (err) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = `Error during password reset: ${err.message}`;
    } finally {
      btn.disabled = false; btn.textContent = 'Send request';
    }
  };

  if (!modalContent.querySelector('.modal-close')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 1rem;
      right: 1rem;
      font-size: 2rem;
      color: gold;
      background: none;
      border: none;
      cursor: pointer;
    `;
    closeBtn.onclick = () => {
      modal.classList.add('hidden');
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    };
    modalContent.prepend(closeBtn);
  }
}

function openLoginModal() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const modalContent = modal.querySelector('.modal-content');
  body.innerHTML = `
    <h3 class="modal-title">Login</h3>
    <label class="form-label">Email</label>
    <input type="email" id="login-email" class="form-input" placeholder="Email" required>
  
    <label class="form-label">Password</label>
    <input type="password" id="login-password" class="form-input" placeholder="Password" required>
  
    <div style="display: flex; align-items: center; gap: 1rem; margin-top: 1rem;">
      <label style="display: flex; align-items: center; gap: 0.4rem; margin: 0;">
        <input type="checkbox" id="remember-me">
        <span>Remember Me</span>
      </label>
    
      <button class="btn btn-primary" id="submit-login">Login</button>
    </div>

    <div style="margin-top: 0.5rem; font-size: 0.9rem;">
      <button id="forgot-password" style="color: gold; background: none; border: none; cursor: pointer; padding:0;">Forgot Password?</button>
    </div>
  
    <div style="margin-top: 1rem; font-size: 0.9rem;">
      You still haven’t an account? → 
      <button id="register-button" style="color: gold; background: none; border: none; cursor: pointer;">Register</button>
    </div>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  document.getElementById('submit-login').onclick = async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const remember = document.getElementById('remember-me').checked;

    try {
      const res = await fetch(`${BASE_URL}/login_mail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (!data.user_id || !data.usx_token || !data.wax_account) {
        throw new Error("Credential not valid.");
      }

      saveUserData({ ...data, email, password }, remember);
      location.reload();

    } catch (err) {
      alert("Login error: " + err.message);
    }
  };
  document.getElementById('register-button').onclick = () => openRegisterModal();
  document.getElementById('forgot-password').onclick = () => openResetPwdModal();

  // Aggiungi pulsante chiusura se non esiste
  if (!modalContent.querySelector('.modal-close')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 1rem;
      right: 1rem;
      font-size: 2rem;
      color: gold;
      background: none;
      border: none;
      cursor: pointer;
    `;
    closeBtn.onclick = () => {
      modal.classList.add('hidden');
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    };
    modalContent.prepend(closeBtn);
  }
}

function openRegisterModal() {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const modalContent = modal.querySelector('.modal-content');

  body.innerHTML = `
    <h3 class="modal-title">Register</h3>
    
    <label class="form-label">Email <span style="color: gold;">(required)</span></label>
    <input type="email" id="reg-email" class="form-input" placeholder="Email" required>
  
    <label class="form-label">Password <span style="color: gold;">(required)</span></label>
    <input type="password" id="reg-password" class="form-input" placeholder="Password" required>
  
    <label class="form-label">Confirm Password <span style="color: gold;">(required)</span></label>
    <input type="password" id="reg-password-confirm" class="form-input" placeholder="Repeat Password" required>

    <label class="form-label">Wax Wallet <span style="color: gold;">(required)</span></label>
    <input type="text" id="reg-wax_account" class="form-input" placeholder="your wax wallet here" required>
    
    <label class="form-label">Telegram Username (without @) <span style="color: gray;"></span></label>
    <input type="text" id="reg-telegram" class="form-input" placeholder="Telegram username">
  
    <label class="form-label">Twitch Username <span style="color: gray;">(optional)</span></label>
    <input type="text" id="reg-twitch" class="form-input" placeholder="Twitch username">
  
    <div style="margin-top: 0.5rem; font-size: 0.85rem; color: gray;">
      Telegram and Twitch are optional. If provided, Telegram will be linked to your account.
    </div>
    <div id="register-feedback" style="margin-top: 1rem; font-size: 0.9rem; color: gold;"></div>
  
    <button class="btn btn-primary" id="submit-register" style="margin-top: 1rem;">Submit</button>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  document.getElementById('submit-register').onclick = async () => {
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const confirm = document.getElementById('reg-password-confirm').value.trim();
    const wax_account = document.getElementById('reg-wax_account').value.trim();
    const telegramRaw = document.getElementById('reg-telegram').value.trim();
    const twitchRaw = document.getElementById('reg-twitch').value.trim();
    const feedback = document.getElementById('register-feedback');
  
    // CHANGED: telegram NON è più obbligatorio
    if (!email || !password || !confirm || !wax_account) {
      feedback.textContent = "Please fill in all required fields.";
      return;
    }
    if (password !== confirm) {
      feedback.textContent = "Passwords do not match. Please check both fields";
      return;
    }
  
    // CHANGED: sanitizza handle e manda null se vuoto
    const telegram = sanitizeHandle(telegramRaw) || null;
    const twitch = sanitizeHandle(twitchRaw) || null;
  
    try {
      const res = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, telegram, twitch, wax_account })
      });
  
      const data = await res.json().catch(() => ({}));
  
      // CHANGED: niente ramo speciale su "Telegram ID not found"
      if (!res.ok) {
        const msg = (data && (data.error || data.message)) || `Error ${res.status}`;
        throw new Error(msg);
      }
  
      // CHANGED: usa SUBITO i dati restituiti dal register
      // (il backend ti dà user_id, usx_token, wax_account)
      saveUserData({ ...data, email, password }, true);
      feedback.style.color = 'gold';
      feedback.textContent = data.message || 'Registration complete. Logging you in...';
  
      // Disabilita i campi e chiudi la modale -> carica app
      ['reg-email','reg-password','reg-password-confirm','reg-wax_account','reg-telegram','reg-twitch']
        .forEach(id => document.getElementById(id).setAttribute('disabled', true));
  
      // NIENTE più setTimeout + login_mail
      finalizeAppLoad();
  
      const modal = document.getElementById('modal');
      modal.classList.add('hidden');
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
  
    } catch (err) {
      feedback.style.color = '#ffb3b3';
      feedback.textContent = "Error during registration: " + err.message;
    }
  };

  // Pulsante chiusura
  if (!modalContent.querySelector('.modal-close')) {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 1rem;
      right: 1rem;
      font-size: 2rem;
      color: gold;
      background: none;
      border: none;
      cursor: pointer;
    `;
    closeBtn.onclick = () => {
      modal.classList.add('hidden');
      modal.classList.remove('active');
      document.body.classList.remove('modal-open');
    };
    modalContent.prepend(closeBtn);
  }
}

(function () {
  const qs = new URLSearchParams(location.search);
  const isOverlay =
    /\/overlay\.html$/i.test(location.pathname) ||
    /\/goblin_dex\.html$/i.test(location.pathname) && (qs.get('overlay') === '1' || document.body?.getAttribute('data-overlay') === '1');

  if (!isOverlay) {
    window.addEventListener('load', initApp);    
  }
})();

function closeModal() {
  const modal = document.getElementById('universal-modal');
  modal.classList.add('hidden');
  modal.classList.remove('active');
  document.body.classList.remove('modal-open');
  modal.querySelector('.modal-header').innerHTML = '';
  modal.querySelector('.modal-body').innerHTML = '';
  modal.querySelector('.modal-message').innerHTML = '';
  modal.querySelector('.modal-footer').innerHTML = '';
  modal.style.top = ''; // pulizia!
}

const qs_modal = new URLSearchParams(location.search);
const isOverlay =
    /\/overlay\.html$/i.test(location.pathname) ||
    /\/goblin_dex\.html$/i.test(location.pathname) && (qs_modal.get('overlay') === '1' || document.body?.getAttribute('data-overlay') === '1');

if (!isOverlay) {
  document.querySelector('#universal-modal .modal-close').addEventListener('click', closeModal);
}

/* ===========================================================
   TOKEN POOLS — CREATION & MANAGEMENT (NO EXTERNAL DEPENDENCIES)
   - Rich UI (inline CSS), Modals, Toast, Spinner
   - Works with existing endpoints (see comments)
   =========================================================== */

// ---------- Tiny UI helpers ----------
(function ensureUIHelpers(){
  if (!window.showToast) {
    window.showToast = (msg, type='info') => {
      const id = 'toast-'+Date.now();
      const bg = type==='success' ? '#10b981' : type==='error' ? '#ef4444' : '#2563eb';
      const el = document.createElement('div');
      el.id = id;
      el.style = `
        position:fixed; right:16px; top:16px; z-index:99999;
        background:${bg}; color:#fff; padding:10px 14px; border-radius:12px;
        box-shadow:0 10px 30px rgba(0,0,0,.35); font:600 14px/1.25 system-ui,Segoe UI,Roboto;
        max-width:380px; opacity:.98; transform:translateY(0); transition:.22s ease;
      `;
      el.textContent = msg;
      document.body.appendChild(el);
      setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(-6px)'; }, 2500);
      setTimeout(() => el.remove(), 2900);
    };
  }
  if (!window.showModal) {
    window.showModal = ({title='', body=''}) => {
      const wrap = document.createElement('div');
      wrap.className = 'modal-wrap';
      wrap.style = `
        position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:99998;
        display:flex; align-items:center; justify-content:center; padding:18px;
      `;
      const card = document.createElement('div');
      card.className = 'modal-card';
      card.style = `
        width:min(920px,95vw); background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937;
        border-radius:16px; box-shadow:0 30px 120px rgba(0,0,0,.7); overflow:hidden;
        font:400 14px/1.45 system-ui,Segoe UI,Roboto;
      `;
      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:14px 16px; border-bottom:1px solid #1f2937;">
          <div class="modal-title" style="font-weight:800; font-size:16px;">${title}</div>
          <button onclick="closeModal()" style="border:0; background:#111827; color:#9ca3af; padding:6px 10px; border-radius:10px; cursor:pointer;">✖</button>
        </div>
        <div class="modal-body" style="padding:14px 16px;">${body}</div>
      `;
      wrap.appendChild(card);
      document.body.appendChild(wrap);
    };
    window.closeModal = () => {
      const wrap = document.querySelector('.modal-wrap');
      if (wrap) wrap.remove();
    };
  }
})();

const spinnerHTML = `
  <div style="display:flex; align-items:center; gap:10px; padding:14px; color:#9ca3af;">
    <div style="width:16px; height:16px; border:2px solid #374151; border-top-color:#22d3ee; border-radius:50%; animation:spin 1s linear infinite;"></div>
    Loading...
  </div>
  <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
`;

const fmt = (n, dp=6) => {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });
};

function pct(part, total){
  const p = Number(total) > 0 ? (Number(part)/Number(total))*100 : 0;
  return isFinite(p) ? p : 0;
}

// ---------- Entrypoint ----------
async function loadCreateTokenStaking() {
  const container = document.getElementById('create-token-pool-container');
  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
      <input id="search-token-pool" placeholder="Search your token..." 
        style="flex:1; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:12px; padding:10px 12px; outline:none;">
      <button id="create-new-token-pool-btn"
        style="white-space:nowrap; background:linear-gradient(135deg,#22d3ee,#a78bfa); color:#0a0a0a; font-weight:900; border:0; border-radius:12px; padding:10px 14px; cursor:pointer; box-shadow:0 8px 30px rgba(34,211,238,.35);">
        ➕ Create New Token Pool
      </button>
    </div>

    <div id="created-token-pools" 
      style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;"></div>

    <div id="token-pool-details"
      style="border:1px solid #1f2937; border-radius:16px; background:#0b0f14; padding:12px; min-height:160px;">
      ${spinnerHTML}
    </div>
  `;

  document.getElementById('create-new-token-pool-btn').addEventListener('click', renderNewTokenPoolForm);
  await fetchAndRenderTokenPools(true);
}
window.loadCreateTokenStaking = loadCreateTokenStaking;

// ---------- Fetch & cache ----------
async function fetchAndRenderTokenPools(shouldRender = true) {
  const { wax_account } = window.userData || {};
  const details = document.getElementById('token-pool-details');
  const list = document.getElementById('created-token-pools');

  try {
    if (details && shouldRender) details.innerHTML = spinnerHTML;
    const res = await fetch(`${BASE_URL}/get_staking_pools?wax_account=${encodeURIComponent(wax_account)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    window.tokenPoolsData = data?.pools || [];
    window.walletBalances = (data?.balance || []).map(b => ({ symbol: b.token_symbol, amount: Number(b.amount||0) }));
    window.depositTokens = data?.tokens || [];

    if (!shouldRender) return;

    if (!data.pools || !data.pools.length) {
      if (list) list.innerHTML = '';
      if (details) details.innerHTML = `<div style="padding:12px; color:#9ca3af;">No token staking pools found.</div>`;
      return;
    }

    renderCreatedTokenPoolButtons(data.pools);
    renderTokenPoolDetails(data.pools[0]);
  } catch (e) {
    console.error("[❌] Error loading pools:", e);
    if (details && shouldRender) details.innerHTML = `<div style="padding:12px; color:#ef4444;">Error loading token pools.</div>`;
  }
}

// ---------- Create Form ----------
function renderNewTokenPoolForm() {
  const container = document.getElementById('token-pool-details');
  const depositOptions = (window.depositTokens||[])
    .map(t => `<option value="${t.symbol}">${t.symbol}</option>`)
    .join('');

  container.innerHTML = `
    <div style="display:grid; gap:14px;">
      <div style="border:1px solid #1f2937; border-radius:12px; padding:12px; background:#0b0f14;">
        <h3 style="margin:0 0 8px; font:800 18px/1.2 system-ui; color:#e5e7eb;">Create Token Pool</h3>
        <div style="display:grid; gap:8px; grid-template-columns:1fr 1fr;">
          <div>
            <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Deposit Token (immutable)</label>
            <input id="new-token-symbol" list="deposit-tokens" placeholder="e.g. CHIPS"
              style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
            <datalist id="deposit-tokens">${depositOptions}</datalist>
            <div style="color:#9ca3af; font-size:12px; margin-top:4px;">Il token di deposito e il nome farm <b>non si potranno modificare</b>.</div>
          </div>
          <div>
            <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Pool Name (optional, immutable)</label>
            <input id="new-pool-name" placeholder="Your Pool Name"
              style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
          </div>
        </div>
      </div>

      <div style="border:1px solid #1f2937; border-radius:12px; padding:12px; background:#0b0f14;">
        <h3 style="margin:0 0 8px; font:800 16px/1.2 system-ui; color:#e5e7eb;">Reward Tokens</h3>
        <div id="reward-token-entries" style="display:grid; gap:10px;"></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:space-between; margin-top:10px;">
          <button id="add-reward-token"
            style="background:#111827; color:#e5e7eb; border:1px solid #374151; border-radius:10px; padding:8px 12px; cursor:pointer;">
            ➕ Add Reward Token
          </button>
          <button id="submit-new-token-pool"
            style="background:linear-gradient(135deg,#22d3ee,#a78bfa); color:#0a0a0a; font-weight:900; border:0; border-radius:10px; padding:10px 14px; cursor:pointer;">
            ✅ Create Pool
          </button>
        </div>
      </div>
    </div>
  `;

  function addRewardTokenEntry() {
    const wrap = document.getElementById('reward-token-entries');
    wrap.insertAdjacentHTML('beforeend', `
      <div style="display:grid; gap:6px; grid-template-columns: 1fr 1fr 1fr; align-items:end;">
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Reward Token</label>
          <input type="text" class="reward-symbol" placeholder="e.g. WAX"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Total Reward</label>
          <input type="number" class="reward-total" placeholder="e.g. 1000"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Daily Reward</label>
          <input type="number" class="reward-daily" placeholder="e.g. 10"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
      </div>
    `);
  }
  document.getElementById('add-reward-token').onclick = addRewardTokenEntry;
  addRewardTokenEntry();

  document.getElementById('submit-new-token-pool').onclick = async () => {
    const symbol = document.getElementById('new-token-symbol').value.trim().toUpperCase();
    const pool_name = (document.getElementById('new-pool-name').value || '').trim() || null;
    const { userId, usx_token, wax_account } = window.userData || {};

    const rows = Array.from(document.querySelectorAll('#reward-token-entries > div'));
    const rewardTokens = rows.map(row => ({
      token_symbol: row.querySelector('.reward-symbol').value.trim().toUpperCase(),
      total_reward: parseFloat(row.querySelector('.reward-total').value),
      daily_reward: parseFloat(row.querySelector('.reward-daily').value),
    }));

    if (!symbol || rewardTokens.some(r => !r.token_symbol || isNaN(r.total_reward) || r.total_reward<=0 || isNaN(r.daily_reward) || r.daily_reward<=0)) {
      return showToast("Please fill all fields with valid positive values.", "error");
    }

    try {
      // crea pool (user_id/usx_token opzionali; wax_account è sempre nel body)
      const qs = new URLSearchParams();
      if (userId) qs.set('user_id', userId);
      if (usx_token) qs.set('usx_token', usx_token);
      const resCreate = await fetch(`${BASE_URL}/create_staking_pool?${qs.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_token_symbol: symbol, pool_name, wax_account })
      });
      const dataCreate = await resCreate.json();
      if (!resCreate.ok) throw new Error(dataCreate?.error || "Failed to create pool");

      const poolId = dataCreate.pool_id;

      // aggiungi reward tokens (e set daily)
      for (const reward of rewardTokens) {
        const resRw = await fetch(`${BASE_URL}/add_pool_reward`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pool_id: poolId,
            token_symbol: reward.token_symbol,
            total_reward: reward.total_reward,
            daily_reward: reward.daily_reward,
            wax_account
          })
        });
        const dataRw = await resRw.json();
        if (!resRw.ok) throw new Error(dataRw?.error || "Failed to add reward token");
      }

      showToast("Token pool created with rewards!", "success");
      await fetchAndRenderTokenPools(true);

    } catch (e) {
      console.error(e);
      showToast(e.message, "error");
    }
  };
}

// ---------- Pools list ----------
function renderCreatedTokenPoolButtons(pools) {
  const container = document.getElementById('created-token-pools');
  const searchInput = document.getElementById('search-token-pool');

  function renderButtons(list) {
    container.innerHTML = '';
    list.forEach(pool => {
      const btn = document.createElement('button');
      btn.textContent = pool.deposit_token?.symbol || 'Unknown';
      btn.style = `
        background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:12px;
        padding:8px 12px; cursor:pointer; font-weight:800; letter-spacing:.2px;
      `;
      btn.onclick = () => renderTokenPoolDetails(pool);
      container.appendChild(btn);
    });
  }

  renderButtons(pools);

  searchInput.oninput = () => {
    const q = (searchInput.value || '').toLowerCase();
    const filtered = pools.filter(p => (p.deposit_token?.symbol || '').toLowerCase().includes(q));
    renderButtons(filtered);
  };
}

// ---------- Details with tabs ----------
async function renderTokenPoolDetails(pool) {
  const container = document.getElementById('token-pool-details');
  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <div>
        <h3 style="margin:0; font:800 18px/1.2 system-ui; color:#e5e7eb;">${pool.deposit_token?.symbol || 'Unknown'} Pool</h3>
        <div style="color:#9ca3af; font-size:12px; margin-top:4px;">
          <b>Status:</b> ${pool.status} • <b>Created:</b> ${pool.created_at}
          ${pool.pool_name ? ` • <b>Name:</b> ${pool.pool_name}` : ''}
        </div>
      </div>
      <button
        style="background:#111827; color:#e5e7eb; border:1px solid #374151; border-radius:10px; padding:8px 10px; cursor:pointer;"
        onclick="openPoolStatusModal(${pool.pool_id}, '${pool.status||'settings'}')">
        🔄 Change Status
      </button>
    </div>

    <div style="display:flex; gap:8px; border-bottom:1px solid #1f2937; margin-bottom:10px;">
      <button class="tp-tab tp-tab-active" data-tab="overview"
        style="padding:8px 12px; background:#0b0f14; color:#e5e7eb; border:0; border-bottom:2px solid #22d3ee; cursor:pointer; font-weight:800;">
        Overview
      </button>
      <button class="tp-tab" data-tab="rewards"
        style="padding:8px 12px; background:#0b0f14; color:#9ca3af; border:0; border-bottom:2px solid transparent; cursor:pointer; font-weight:700;">
        Rewards
      </button>
      <button class="tp-tab" data-tab="stakers"
        style="padding:8px 12px; background:#0b0f14; color:#9ca3af; border:0; border-bottom:2px solid transparent; cursor:pointer; font-weight:700;">
        Stakers
      </button>
      <button class="tp-tab" data-tab="activity"
        style="padding:8px 12px; background:#0b0f14; color:#9ca3af; border:0; border-bottom:2px solid transparent; cursor:pointer; font-weight:700;">
        Activity
      </button>
    </div>

    <div id="tp-tabcontent-overview">${spinnerHTML}</div>
    <div id="tp-tabcontent-rewards" style="display:none;"></div>
    <div id="tp-tabcontent-stakers" style="display:none;"></div>
    <div id="tp-tabcontent-activity" style="display:none;"></div>
  `;

  // tabs
  container.querySelectorAll('.tp-tab').forEach(btn => {
    btn.onclick = (e) => {
      const tab = e.currentTarget.dataset.tab;
      container.querySelectorAll('.tp-tab').forEach(b => {
        b.classList.toggle('tp-tab-active', b.dataset.tab===tab);
        b.style.color = b.dataset.tab===tab ? '#e5e7eb' : '#9ca3af';
        b.style.borderBottomColor = b.dataset.tab===tab ? '#22d3ee' : 'transparent';
      });
      container.querySelectorAll('[id^="tp-tabcontent-"]').forEach(div => div.style.display='none');
      document.getElementById(`tp-tabcontent-${tab}`).style.display = '';
    };
  });

  // render each tab
  renderOverviewTab(pool);
  renderRewardsTab(pool);
  await renderStakersTab(pool);
  renderActivityTab(pool);
}

// ---------- Overview ----------
function renderOverviewTab(pool){
  const host = document.getElementById('tp-tabcontent-overview');
  const rewards = pool.rewards || [];
  const totalDaily = rewards.reduce((s,r)=> s + Number(r.daily_reward||0), 0);
  const chips = rewards.map(r => `
    <div style="display:inline-flex; gap:.35rem; align-items:center; padding:.25rem .55rem; border:1px solid #243042; border-radius:999px; margin:.2rem .2rem 0 0;">
      <span style="font-weight:800;">${r.token_symbol}</span>
      <span>${fmt(r.daily_reward,6)}/day</span>
    </div>`).join('');

  const rows = rewards.map(r => {
    const daysLeft = Number(r.daily_reward)>0 ? Math.floor(Number(r.total_reward_deposit||0)/Number(r.daily_reward||1)) : '∞';
    return `
      <tr>
        <td style="padding:8px; border-bottom:1px solid #111827;">${r.token_symbol}</td>
        <td style="padding:8px; border-bottom:1px solid #111827; text-align:right;">${fmt(r.total_reward_deposit,6)}</td>
        <td style="padding:8px; border-bottom:1px solid #111827; text-align:right;">${fmt(r.daily_reward,6)}</td>
        <td style="padding:8px; border-bottom:1px solid #111827; text-align:right;">${daysLeft}</td>
      </tr>
    `;
  }).join('');

  host.innerHTML = `
    <div style="display:grid; gap:12px;">
      <div style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:240px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
          <div style="color:#9ca3af; font-size:12px;">Total reward tokens/day</div>
          <div style="font-weight:900; font-size:20px; color:#e5e7eb;">${fmt(totalDaily,6)}</div>
          <div style="margin-top:8px;">${chips}</div>
        </div>
        <div style="flex:1; min-width:240px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
          <div style="color:#9ca3af; font-size:12px;">Rewards configured</div>
          <div style="font-weight:900; font-size:20px; color:#e5e7eb;">${rewards.length}</div>
          <div style="margin-top:8px; color:#9ca3af; font-size:12px;">Immutable: deposit token & name</div>
        </div>
      </div>

      <div style="border:1px solid #1f2937; border-radius:12px; background:#0d131a;">
        <div style="padding:10px 12px; border-bottom:1px solid #1f2937; font-weight:800;">Rewards summary</div>
        <div style="max-width:100%; overflow:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:14px;">
            <thead>
              <tr>
                <th style="text-align:left; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Token</th>
                <th style="text-align:right; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Total deposit</th>
                <th style="text-align:right; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Daily</th>
                <th style="text-align:right; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Days left</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="4" style="padding:10px; color:#9ca3af;">No rewards.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ---------- Rewards (manage) ----------
function renderRewardsTab(pool){
  const host = document.getElementById('tp-tabcontent-rewards');
  const rewards = pool.rewards || [];

  const items = rewards.map(r => {
    const daysLeft = Number(r.daily_reward)>0 ? Math.floor(Number(r.total_reward_deposit||0)/Number(r.daily_reward||1)) : '∞';
    return `
      <div style="border:1px solid #1f2937; border-radius:12px; padding:10px; background:#0d131a;">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
          <div>
            <div style="font-weight:900; color:#e5e7eb; letter-spacing:.2px;">🎯 ${r.token_symbol}</div>
            <div style="color:#9ca3af; font-size:12px;">Total: <b>${fmt(r.total_reward_deposit,6)}</b> • Daily: <b>${fmt(r.daily_reward,6)}</b> • Days left: <b>${daysLeft}</b></div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button
              style="background:#111827; color:#e5e7eb; border:1px solid #374151; border-radius:10px; padding:8px 10px; cursor:pointer;"
              onclick="openDepositToPool(${pool.pool_id}, '${r.token_symbol}', ${Number(r.daily_reward)||0})">
              💰 Top-up
            </button>
            <button
              style="background:linear-gradient(135deg,#ffe600,#f39c12,#ff00ff); color:#0a0a0a; font-weight:900; border:0; border-radius:10px; padding:8px 10px; cursor:pointer; box-shadow:0 0 5px #00ffcc, 0 0 20px #ff00ff;"
              onclick="openEditDailyReward(${pool.pool_id}, '${r.token_symbol}', ${Number(r.daily_reward)||0})">
              ✏️ Edit Daily
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const addNewHTML = `
    <div style="border:1px dashed #243042; border-radius:12px; padding:12px; background:#0b0f14;">
      <div style="font-weight:800; margin-bottom:8px;">Add new reward token</div>
      <div style="display:grid; gap:8px; grid-template-columns: 1fr 1fr 1fr; align-items:end;">
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Token symbol</label>
          <input id="add-rw-symbol" placeholder="e.g. WAX"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Total deposit</label>
          <input id="add-rw-total" type="number" placeholder="e.g. 1000"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
        <div>
          <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Daily reward</label>
          <input id="add-rw-daily" type="number" placeholder="e.g. 10"
            style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        </div>
      </div>
      <div style="margin-top:10px; display:flex; justify-content:flex-end;">
        <button id="add-rw-submit"
          style="background:#22d3ee; color:#0a0a0a; font-weight:900; border:0; border-radius:10px; padding:10px 12px; cursor:pointer;">
          ➕ Add reward token
        </button>
      </div>
    </div>
  `;

  host.innerHTML = `
    <div style="display:grid; gap:10px;">
      ${items || '<div style="padding:10px; color:#9ca3af;">No rewards configured.</div>'}
      ${addNewHTML}
    </div>
  `;

  document.getElementById('add-rw-submit').onclick = async () => {
    const sym = document.getElementById('add-rw-symbol').value.trim().toUpperCase();
    const tot = parseFloat(document.getElementById('add-rw-total').value);
    const day = parseFloat(document.getElementById('add-rw-daily').value);
    if (!sym || !isFinite(tot) || tot<=0 || !isFinite(day) || day<=0) {
      return showToast('Insert valid values', 'error');
    }
    try {
      const { wax_account } = window.userData || {};
      const res = await fetch(`${BASE_URL}/add_pool_reward`, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pool_id: pool.pool_id, token_symbol: sym, total_reward: tot, daily_reward: day, wax_account })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to add reward');
      showToast('Reward token added','success');
      fetchAndRenderTokenPools(true);
    } catch (e) {
      console.error(e);
      showToast(e.message,'error');
    }
  };
}

// ---------- Stakers (stats) ----------
async function renderStakersTab(pool){
  const host = document.getElementById('tp-tabcontent-stakers');
  host.innerHTML = spinnerHTML;

  try {
    // Se il backend espone questo endpoint, mostriamo dati reali.
    const res = await fetch(`${BASE_URL}/get_pool_stakers?pool_id=${pool.pool_id}`);
    if (res.ok) {
      const data = await res.json();
      const stakers = data?.stakers || [];
      const totalStaked = Number(data?.total_staked || stakers.reduce((s,x)=> s + Number(x.amount_staked||0), 0));
      const rows = stakers.map(s => `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #111827;">${s.wax_account}</td>
          <td style="padding:8px; border-bottom:1px solid #111827; text-align:right;">${fmt(s.amount_staked,6)}</td>
          <td style="padding:8px; border-bottom:1px solid #111827; text-align:right;">${fmt(pct(s.amount_staked,totalStaked),2)}%</td>
        </tr>
      `).join('');
      host.innerHTML = `
        <div style="display:grid; gap:12px;">
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <div style="flex:1; min-width:220px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
              <div style="color:#9ca3af; font-size:12px;">Total staked</div>
              <div style="font-weight:900; font-size:20px; color:#e5e7eb;">${fmt(totalStaked,6)}</div>
            </div>
            <div style="flex:1; min-width:220px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
              <div style="color:#9ca3af; font-size:12px;">Stakers</div>
              <div style="font-weight:900; font-size:20px; color:#e5e7eb;">${stakers.length}</div>
            </div>
          </div>
          <div style="border:1px solid #1f2937; border-radius:12px; background:#0d131a;">
            <div style="padding:10px 12px; border-bottom:1px solid #1f2937; font-weight:800;">Top stakers</div>
            <div style="max-width:100%; overflow:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                  <tr>
                    <th style="text-align:left; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Wax</th>
                    <th style="text-align:right; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Staked</th>
                    <th style="text-align:right; padding:8px; border-bottom:1px solid #111827; color:#9ca3af; font-weight:600;">Share</th>
                  </tr>
                </thead>
                <tbody>${rows || '<tr><td colspan="3" style="padding:10px; color:#9ca3af;">No data.</td></tr>'}</tbody>
              </table>
            </div>
          </div>
        </div>
      `;
      return;
    }
    // Fallback se endpoint non c’è: info sintetiche non disponibili
    host.innerHTML = `
      <div style="padding:12px; color:#9ca3af;">
        Detailed stakers statistics are not available on this server.  
        <div style="margin-top:6px;">(Optional endpoint: <code>/get_pool_stakers?pool_id=${pool.pool_id}</code>)</div>
      </div>
    `;
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div style="padding:12px; color:#ef4444;">Error loading stakers.</div>`;
  }
}

// ---------- Activity (stats/log) ----------
function renderActivityTab(pool){
  const host = document.getElementById('tp-tabcontent-activity');
  host.innerHTML = `
    <div style="display:grid; gap:12px;">
      <div id="tp-activity-cards" style="display:flex; gap:12px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
          <div style="color:#9ca3af; font-size:12px;">Rewards configured</div>
          <div style="font-weight:900; font-size:20px; color:#e5e7eb;">${(pool.rewards||[]).length}</div>
        </div>
        <div id="tp-activity-extra" style="flex:1; min-width:220px; border:1px solid #1f2937; border-radius:12px; background:#0d131a; padding:12px;">
          <div style="color:#9ca3af; font-size:12px;">Last reward time</div>
          <div style="font-weight:900; font-size:16px; color:#e5e7eb;">—</div>
        </div>
      </div>
      <div id="tp-activity-note" style="color:#9ca3af; font-size:12px;">
        If the backend provides <code>/get_pool_stats?pool_id=</code>, we’ll show more insights here.
      </div>
    </div>
  `;

  // Prova a ottenere statistiche aggiuntive (facoltative)
  (async ()=>{
    try {
      const res = await fetch(`${BASE_URL}/get_pool_stats?pool_id=${pool.pool_id}`);
      if (!res.ok) return;
      const data = await res.json();
      const last = data?.last_reward_time || '—';
      const stakers = Number(data?.stakers || 0);
      const total = Number(data?.total_staked || 0);
      const box = document.getElementById('tp-activity-extra');
      box.innerHTML = `
        <div style="color:#9ca3af; font-size:12px;">Last reward time</div>
        <div style="font-weight:900; font-size:16px; color:#e5e7eb;">${last}</div>
        <div style="color:#9ca3af; font-size:12px; margin-top:8px;">Stakers: <b>${stakers}</b> • Total staked: <b>${fmt(total,6)}</b></div>
      `;
      document.getElementById('tp-activity-note').remove();
    } catch {}
  })();
}

// ---------- Actions: Edit Daily ----------
function openEditDailyReward(poolId, tokenSymbol, currentReward=0) {
  const body = `
    <div style="display:grid; gap:8px;">
      <div>
        <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">New Daily Reward</label>
        <input id="new-daily-reward" type="number" value="${currentReward||0}" 
          style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
      </div>
      <div>
        <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Extra deposit (optional)</label>
        <input id="extra-deposit" type="number" placeholder="0 to keep" 
          style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        <div style="color:#9ca3af; font-size:12px; margin-top:4px;">
          Se desideri solo aggiornare il daily e il backend richiede un importo &gt; 0,
          imposterò automaticamente 0.000001.
        </div>
      </div>
      <button id="submit-daily-reward"
        style="margin-top:6px; background:linear-gradient(135deg,#ffe600,#f39c12,#ff00ff); box-shadow:0 0 5px #00ffcc, 0 0 20px #ff00ff;
        color:#000; font-weight:900; border-radius:10px; padding:10px 12px; border:0; cursor:pointer;">
        Update Reward
      </button>
    </div>
  `;
  showModal({ title:`Edit Daily Reward • ${tokenSymbol}`, body });

  setTimeout(() => {
    document.getElementById('submit-daily-reward').onclick = async () => {
      const daily = parseFloat(document.getElementById('new-daily-reward').value);
      let extra = parseFloat(document.getElementById('extra-deposit').value);
      if (isNaN(daily) || daily <= 0) return showToast("Please enter a valid daily reward","error");
      if (isNaN(extra) || extra < 0) extra = 0;
      if (extra === 0) extra = 0.000001; // compat con backend attuale

      try {
        const { wax_account } = window.userData || {};
        const res = await fetch(`${BASE_URL}/add_pool_reward`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            pool_id: poolId,
            token_symbol: tokenSymbol,
            total_reward: extra,
            daily_reward: daily,
            wax_account
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update reward');
        showToast('Daily reward updated','success');
        closeModal();
        fetchAndRenderTokenPools(true);
      } catch (e) {
        console.error(e);
        showToast(e.message,'error');
      }
    };
  }, 0);
}
window.openEditDailyReward = openEditDailyReward;

// ---------- Actions: Top-up (fixed) ----------
function openDepositToPool(poolId, tokenSymbol, currentDaily = 0) {
  // ---- helpers -------------------------------------------------------------
  const safeFmt = (n, d = 6) => {
    try { return typeof fmt === 'function' ? fmt(Number(n || 0), d) : Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: d }); }
    catch { return String(n || 0); }
  };

  const getWalletBalance = (wallet, symbol) => {
    const list = wallet === 'twitch'
      ? (window.twitchWalletBalances || [])
      : (window.telegramWalletBalances || []);
    return Number(list.find(t => t.symbol === symbol)?.amount || 0);
  };

  const chooseDefaultWallet = (symbol) => {
    const tg = getWalletBalance('telegram', symbol);
    const tw = getWalletBalance('twitch', symbol);
    // pick the wallet with the higher positive balance; fallback telegram
    if (tw > tg && tw > 0) return 'twitch';
    if (tg > 0) return 'telegram';
    return 'telegram';
  };

  const uid = 'dep-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // Initial (may be 0 before balances load)
  let selectedWallet = 'telegram';
  let bal = getWalletBalance(selectedWallet, tokenSymbol);

  // ---------- Build HTML as STRING (showModal requires strings) ----------
  const bodyHTML = `
    <div id="deposit-form-${uid}" style="display:grid; gap:8px;">
      <div>
        <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Wallet</label>
        <select id="wallet-source-${uid}"
          style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
          <option value="telegram" selected>Telegram</option>
          <option value="twitch">Twitch</option>
        </select>
      </div>

      <div id="available-line-${uid}" style="color:#9ca3af;">
        Available in <b id="wallet-name-${uid}">Telegram</b> wallet:
        <b id="wallet-balance-${uid}">${safeFmt(bal, 6)} ${tokenSymbol}</b>
      </div>

      <div>
        <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Amount to deposit</label>
        <input id="deposit-amount-${uid}" type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 100"
          style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
      </div>

      <div>
        <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Daily reward (keep same if empty)</label>
        <input id="deposit-daily-${uid}" type="number" inputmode="decimal" min="0" step="any" placeholder="${currentDaily || 0}"
          style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
      </div>

      <!-- Feedback INSIDE the modal -->
      <div id="deposit-feedback-${uid}" aria-live="polite"
        style="display:none; padding:10px 12px; border-radius:10px; border:1px solid #374151; background:#111827; color:#e5e7eb;"></div>

      <button id="submit-deposit-${uid}" type="button"
        style="background:#22d3ee; color:#0a0a0a; font-weight:900; border:0; border-radius:10px; padding:10px 12px; cursor:pointer;">
        Deposit Tokens
      </button>
    </div>
  `;

  // Show modal (title and body MUST be strings)
  showModal({ title: `Deposit ${tokenSymbol}`, body: bodyHTML });

  // Grab refs now that modal content is in DOM
  const $wallet = document.getElementById(`wallet-source-${uid}`);
  const $wName  = document.getElementById(`wallet-name-${uid}`);
  const $wBal   = document.getElementById(`wallet-balance-${uid}`);
  const $amount = document.getElementById(`deposit-amount-${uid}`);
  const $daily  = document.getElementById(`deposit-daily-${uid}`);
  const $submit = document.getElementById(`submit-deposit-${uid}`);
  const $feed   = document.getElementById(`deposit-feedback-${uid}`);

  // In-modal feedback (no global feedTopUp)
  const setFeedback = (type, lines) => {
    if (!$feed) return;
    const palette = {
      info:    { bg:'#111827', bd:'#374151' },
      error:   { bg:'#4b1d1d', bd:'#b91c1c' },
      success: { bg:'#16341d', bd:'#16a34a' }
    }[type || 'info'];
    $feed.style.display = lines && lines.length ? 'block' : 'none';
    $feed.style.background = palette.bg;
    $feed.style.border = `1px solid ${palette.bd}`;
    $feed.innerHTML = (lines || []).map(l => `<div>${l}</div>`).join('');
  };

  // Keep the "Available" line in sync
  const refreshBalance = () => {
    bal = getWalletBalance(selectedWallet, tokenSymbol);
    $wName.textContent = selectedWallet.charAt(0).toUpperCase() + selectedWallet.slice(1);
    $wBal.textContent  = `${safeFmt(bal, 6)} ${tokenSymbol}`;
  };

  // Load/refresh balances first, then set default wallet based on real balances
  Promise.resolve(typeof ensureBalancesLoaded === 'function' ? ensureBalancesLoaded(false) : null)
    .then(() => {
      // choose best default wallet and sync the UI
      selectedWallet = chooseDefaultWallet(tokenSymbol);
      if ($wallet) $wallet.value = selectedWallet;
      refreshBalance();
    })
    .catch(() => {
      // even if load fails, keep UI usable
      refreshBalance();
    });

  // Wallet change -> update balance line immediately
  $wallet.addEventListener('change', () => {
    selectedWallet = $wallet.value;
    refreshBalance();
    setFeedback('', []); // clear any previous feedback
  });

  // Submit
  $submit.onclick = async () => {
    setFeedback('', []);
    const amt = parseFloat($amount.value);
    const dailyVal = parseFloat($daily.value);
    const newDaily = (isNaN(dailyVal) || dailyVal <= 0) ? (currentDaily || 0) : dailyVal;

    if (!amt || amt <= 0 || amt > bal) {
      return setFeedback('error', [
        `Invalid amount: <b>${safeFmt(amt, 6)}</b> ${tokenSymbol}.`,
        `Available in <b>${selectedWallet}</b> wallet: <b>${safeFmt(bal, 6)}</b> ${tokenSymbol}.`,
        `Tip: amount must be > 0 and ≤ available balance.`
      ]);
    }

    const prev = $submit.textContent;
    $submit.disabled = true;
    $submit.textContent = 'Processing…';
    setFeedback('info', [
      `Pool: <b>${poolId}</b>`,
      `Token: <b>${tokenSymbol}</b>`,
      `Amount: <b>${safeFmt(amt, 6)}</b>`,
      `Daily reward to apply: <b>${safeFmt(newDaily, 6)}</b>`,
      `From wallet: <b>${selectedWallet}</b>`
    ]);

    try {
      const { wax_account } = window.userData || {};
      const res = await fetch(`${BASE_URL}/add_pool_reward`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          pool_id: poolId,
          token_symbol: tokenSymbol,
          total_reward: amt,
          daily_reward: newDaily,
          wax_account,
          wallet: selectedWallet // 'telegram' | 'twitch'
        })
      });

      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (!res.ok) throw new Error(data?.error || 'Deposit failed');

      // Optimistic local balance update so the line reflects the new available
      const list = selectedWallet === 'telegram' ? (window.telegramWalletBalances || []) : (window.twitchWalletBalances || []);
      const i = list.findIndex(t => t.symbol === tokenSymbol);
      if (i >= 0) list[i].amount = Math.max(0, Number(list[i].amount || 0) - amt);
      refreshBalance();

      setFeedback('success', [
        `Deposited <b>${safeFmt(amt, 6)}</b> ${tokenSymbol} from <b>${selectedWallet}</b> wallet.`,
        `Daily reward ${isNaN(dailyVal) || dailyVal <= 0 ? 'left unchanged' : `set to <b>${safeFmt(newDaily, 6)}</b>`}.`,
        data?.txid ? `Transaction ID: <b>${data.txid}</b>` : 'Transaction processed.',
        'Refreshing pools list…'
      ]);

      try { fetchAndRenderTokenPools(true); } catch (_) {}
      // keep modal open to let user read success (or close here if prefer)
      // closeModal();
    } catch (e) {
      console.error(e);
      setFeedback('error', [
        e?.message ? `Error: <b>${e.message}</b>` : 'Unknown error.',
        `Pool: <b>${poolId}</b> — Token: <b>${tokenSymbol}</b> — Wallet: <b>${selectedWallet}</b>`
      ]);
    } finally {
      $submit.disabled = false;
      $submit.textContent = prev;
    }
  };
}

window.openDepositToPool = openDepositToPool;

// ---------- Actions: Change Status ----------
function openPoolStatusModal(poolId, currentStatus='settings') {
  const body = `
    <div style="display:grid; gap:8px;">
      <label style="display:block; color:#9ca3af; font-weight:600; margin-bottom:6px;">Select new status</label>
      <select id="pool-status-select"
        style="width:100%; background:#0b0f14; color:#e5e7eb; border:1px solid #1f2937; border-radius:10px; padding:10px 12px;">
        ${['settings','active','closed'].map(s => `<option value="${s}" ${s===currentStatus?'selected':''}>${s}</option>`).join('')}
      </select>
      <button id="submit-pool-status"
        style="background:linear-gradient(135deg,#22d3ee,#a78bfa); color:#0a0a0a; font-weight:900; border:0; border-radius:10px; padding:10px 12px; cursor:pointer; margin-top:6px;">
        Update Status
      </button>
    </div>
  `;
  showModal({ title:`Change Pool Status`, body });

  setTimeout(() => {
    document.getElementById('submit-pool-status').onclick = async () => {
      const newStatus = document.getElementById('pool-status-select').value;
      try {
        const res = await fetch(`${BASE_URL}/update_pool_status`, {
          method:"POST",
          headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({ pool_id: poolId, status: newStatus })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to update status');

        const bodyEl = document.querySelector('.modal-body');
        const box = document.createElement('div');
        box.innerHTML = `
          <div style="margin-top:10px; padding:10px; border:1px solid #22d3ee; border-radius:10px; background:#0d131a; color:#e5e7eb; text-align:center;">
            ✅ Status updated to <b>${newStatus}</b>. Closing…
          </div>`;
        bodyEl.appendChild(box);
        setTimeout(() => { closeModal(); fetchAndRenderTokenPools(true); }, 900);
      } catch (e) {
        console.error(e);
        showToast("Error: "+e.message, "error");
      }
    };
  }, 0);
}
window.openPoolStatusModal = openPoolStatusModal;

// === 📦 CREAZIONE & GESTIONE DELLE NFTS FARM DELL'UTENTE ===

async function loadCreateNFTFarm() {
  const container = document.getElementById('create-nfts-farm-container');
  container.innerHTML = `
    <input 
      type="text" 
      id="search-created-farm" 
      placeholder="Search your farm name..." 
      class="input-farm-search"
    >

    <button 
      id="create-new-farm-btn" 
      class="btn btn-primary create-farm-btn"
    >
      ➕ Create New NFTs Farm
    </button>

    <div id="created-farm-buttons" class="farm-button-list"></div>
    <div id="created-farm-details"></div>
  `;

  document.getElementById('create-new-farm-btn').addEventListener('click', () => {
    renderNewFarmForm();
  });

  await fetchAndRenderUserFarms();
}

window.loadCreateNFTFarm = loadCreateNFTFarm;
async function fetchAndRenderUserFarms() {
  const { userId, usx_token } = window.userData;
  const container = document.getElementById('created-farm-details');

  try {
    const res = await fetch(`${BASE_URL}/get_farms?user_id=${userId}&usx_token=${usx_token}`);
    const data = await res.json();

    if (!res.ok || !data.farms) {
      container.innerHTML = `<div class="empty-message">You don’t have any NFTs Staking Farm yet.</div>`;
      return;
    }

    // 🔥 Salva globalmente
    window.nftFarmsData = data.farms;

    renderCreatedFarmButtons(data.farms);
    renderCreatedFarmDetails(data.farms[0]);
  } catch (err) {
    container.innerHTML = `<div class="error-message">Error loading your farms.</div>`;
    console.error("[❌] Error loading user farms:", err);
  }
}
function renderCreatedFarmButtons(farms) {
  const container = document.getElementById('created-farm-buttons');
  const searchInput = document.getElementById('search-created-farm');

  function renderButtons(list) {
    container.innerHTML = '';
    list.forEach(farm => {
      const btn = document.createElement('button');
      btn.className = 'farm-button';
      btn.textContent = farm.farm_name;
      btn.onclick = () => renderCreatedFarmDetails(farm);
      container.appendChild(btn);
    });
  }

  renderButtons(farms);

  searchInput.addEventListener('input', () => {
    const search = searchInput.value.toLowerCase();
    const filtered = farms.filter(f => f.farm_name.toLowerCase().includes(search));
    renderButtons(filtered);
  });
}

function renderCreatedFarmDetails(farm) {
  const container = document.getElementById('created-farm-details');

  const rewardHTML = farm.total_rewards.map(r => `
    <span class="reward-summary">
      💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong>
    </span>
  `).join('');

  const templatesHTML = farm.templates.map(tpl => {
    const rewards = tpl.daily_rewards.map(r => `
      <div class="reward-detail">
        ${r.token_symbol}: ${parseFloat(r.daily_reward_amount).toFixed(8)}/day
      </div>
    `).join('');

    return `
      <div class="template-block">
        <h4 class="template-title">Template ID: ${tpl.template_id}</h4>
        ${rewards || '<div class="empty-reward">No rewards configured.</div>'}
        <div class="template-actions">
          <button class="btn btn-warning" onclick="openEditRewards(${tpl.template_id})">✏️ Edit Rewards</button>
          <button class="btn btn-primary" onclick="openAddReward(${tpl.template_id})">➕ Add Reward</button>
          <button class="btn btn-danger" onclick="removeTemplate(${tpl.template_id})">🗑️ Remove Template</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="farm-card">
      <h3 class="farm-title-row">
        ${farm.farm_name}
        <span class="farm-meta">
          Status: <strong>${farm.status}</strong> • Created: ${farm.creation_date}
        </span>
      </h3>
      <div class="farm-actions">
        <button class="btn btn-secondary" onclick="openAddTemplateForm(${farm.farm_id})">➕ Add Template</button>
        <button class="btn btn-secondary" onclick="openDepositForm(${farm.farm_id})">💰 Deposit Rewards</button>
        <button class="btn btn-danger" onclick="confirmFarmClosure(${farm.farm_id})">🚫 Close Farm</button>
        <button class="btn btn-warning text-dark" onclick="changeFarmStatus(${farm.farm_id})">🔄 Change Status</button>
      </div>
      <div class="farm-rewards">${rewardHTML}</div>
      ${templatesHTML
        ? `<div class="template-grid">${templatesHTML}</div>`
        : '<div class="empty-templates">No templates added yet.</div>'}
    </div>
  `;
}

function renderNewFarmForm() {
  const container = document.getElementById('created-farm-details');
  container.innerHTML = `
    <div class="form-card">
      <h3 class="form-title">Create a New NFTs Staking Farm</h3>

      <label class="form-label">Farm Name</label>
      <input id="new-farm-name" type="text" class="form-input">

      <button id="submit-new-farm" class="btn btn-warning full-width">
        Create Farm
      </button>
    </div>
  `;

  document.getElementById('submit-new-farm').addEventListener('click', async () => {
    const name = document.getElementById('new-farm-name').value.trim();
    const { userId, usx_token } = window.userData;

    if (!name) {
      alert("Please enter a farm name.");
      return;
    }

    try {
      const res = await fetch(`${BASE_URL}/create_farm?user_id=${userId}&usx_token=${usx_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farm_name: name })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create farm.');

      showToast("Farm created successfully!", "success");
      await fetchAndRenderUserFarms();
    } catch (err) {
      console.error(err);
      showToast("Error creating farm: " + err.message, "error");
    }
  });
}


// Azioni su Template
function openAddTemplateForm(farmId) {
  const { userId, usx_token } = window.userData;

  const body = `
    <label class="form-label">Template ID</label>
    <input id="template-id" type="number" class="form-input" placeholder="e.g. 123456">

    <div id="rewards-container">
      <label class="form-label">Rewards</label>
      <div class="reward-entry">
        <input type="text" class="form-input half-width token-symbol" placeholder="Token Symbol (e.g. CHIPS)">
        <input type="number" class="form-input half-width reward-amount" placeholder="Amount per day">
      </div>
    </div>

    <button id="add-reward-btn" class="link-add-reward">➕ Add another reward</button>

    <button id="submit-add-template" class="btn btn-warning full-width" style="margin-top: 1rem;">
      Add Template
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">➕ Add Template to Farm</h3>`,
    body
  });

  setTimeout(() => {
    // Aggiunta nuova riga di reward
    document.getElementById('add-reward-btn').onclick = () => {
      const container = document.getElementById('rewards-container');
      const div = document.createElement('div');
      div.className = 'reward-entry';
      div.innerHTML = `
        <input type="text" class="form-input half-width token-symbol" placeholder="Token Symbol (e.g. CHIPS)">
        <input type="number" class="form-input half-width reward-amount" placeholder="Amount per day">
      `;
      container.appendChild(div);
    };

    // Submit handler
    document.getElementById('submit-add-template').onclick = async () => {
      const templateId = parseInt(document.getElementById('template-id').value.trim());
      if (!templateId) {
        showToast("Template ID is required", "error");
        return;
      }

      const rewardElements = document.querySelectorAll('.reward-entry');
      const rewards = [];

      for (const el of rewardElements) {
        const symbol = el.querySelector('.token-symbol').value.trim().toUpperCase();
        const amount = parseFloat(el.querySelector('.reward-amount').value.trim());

        if (!symbol || isNaN(amount) || amount <= 0) {
          showToast("Each reward must have a valid symbol and positive amount", "error");
          return;
        }

        rewards.push({ token_symbol: symbol, daily_reward_amount: amount });
      }

      if (rewards.length === 0) {
        showToast("At least one reward is required", "error");
        return;
      }

      try {
        const res = await fetch(`${BASE_URL}/add_farm_template?user_id=${userId}&usx_token=${usx_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ farm_id: farmId, template_id: templateId, rewards })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unknown error");

        showToast(data.message || "Template added successfully", "success");
        closeModal();
        await fetchAndRenderUserFarms();
      } catch (err) {
        console.error("[❌] Error adding template:", err);
        showToast(err.message, "error");
      }
    };
  }, 0);
}

// ✅ Deposit Rewards (feedback lives inside the modal)
function openDepositForm(farmId) {
  // ---- helpers -------------------------------------------------------------
  const getBalance = (wallet, symbol) => {
    const list = wallet === 'twitch'
      ? (window.twitchWalletBalances || [])
      : (window.telegramWalletBalances || []);
    return Number(list.find(t => t.symbol === symbol)?.amount || 0);
  };

  const pretty = (n, digits = 9) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });

  // Try to ensure balances are ready (no popups)
  try { if (typeof ensureBalancesLoaded === 'function') ensureBalancesLoaded(false); } catch (_) {}

  const { userId, usx_token } = (window.userData || {});
  const tg = (window.telegramWalletBalances || []);
  const tw = (window.twitchWalletBalances || []);

  // Build the selectable token list (union of both wallets)
  const symbolSet = new Set([...tg.map(t => t.symbol), ...tw.map(t => t.symbol)]);
  const tokenSymbols = Array.from(symbolSet).sort();

  // ---- modal body (feedback IS inside) ------------------------------------
  const body = `
    <div id="rewards-deposit-container"></div>
    <button id="add-more-reward" class="link-add-reward">➕ Add another token</button>

    <button id="submit-deposit" class="btn btn-success full-width" style="margin-top: 1rem;">
      Deposit All
    </button>

    <!-- Feedback INSIDE the modal, under the submit -->
    <div id="rewards-feedback" aria-live="polite"
      style="display:none; margin-top:.75rem; padding:10px 12px; border-radius:10px;
             border:1px solid #374151; background:#111827; color:#e5e7eb;"></div>
  `;

  showModal({
    title: `<h3 class="modal-title">Deposit Rewards to Farm</h3>`,
    body
  });

  setTimeout(() => {
    const container   = document.getElementById('rewards-deposit-container');
    const addBtn      = document.getElementById('add-more-reward');
    const submitBtn   = document.getElementById('submit-deposit');
    const feedbackEl  = document.getElementById('rewards-feedback');

    // In-modal feedback
    const setFeedback = (type, title, details = []) => {
      if (!feedbackEl) return;
      const palette = {
        info:    { bg:'#111827', bd:'#374151' },
        success: { bg:'#16341d', bd:'#16a34a' },
        error:   { bg:'#4b1d1d', bd:'#b91c1c' }
      }[type || 'info'];
      feedbackEl.style.display   = 'block';
      feedbackEl.style.background = palette.bg;
      feedbackEl.style.border     = `1px solid ${palette.bd}`;
      const list = details.map(li => `<li style="margin-left:1rem; list-style:disc;">${li}</li>`).join('');
      feedbackEl.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
          <strong style="font-weight:800;">${title}</strong>
          <span style="opacity:.7; font-size:.9em;">(${new Date().toLocaleString()})</span>
        </div>
        ${list ? `<ul style="padding-left:0; margin:0;">${list}</ul>` : ''}
      `;
      // make sure it’s visible inside the modal
      requestAnimationFrame(() => {
        try { feedbackEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch(_) {}
      });
    };

    function renderRewardRow() {
      const div = document.createElement('div');
      div.className = 'reward-row';
      div.style.marginBottom = '10px';
      div.innerHTML = `
        <label class="form-label">Choose Token</label>
        <select class="form-input token-symbol">
          <option disabled selected value="">-- Select a token --</option>
          ${tokenSymbols.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>

        <label class="form-label" style="margin-top:.5rem;">Source wallet</label>
        <select class="form-input wallet-source">
          <option value="telegram" selected>Telegram</option>
          <option value="twitch">Twitch</option>
        </select>

        <div class="available-balance hidden" style="color:#9ca3af; margin-top:.25rem;"></div>

        <label class="form-label" style="margin-top:.5rem;">Select %</label>
        <input type="range" class="range-input percent-range" min="0" max="100" value="0" disabled>

        <label class="form-label" style="margin-top:.5rem;">Amount</label>
        <input type="number" class="form-input amount" placeholder="Amount" disabled>
      `;

      const selectToken   = div.querySelector('.token-symbol');
      const selectWallet  = div.querySelector('.wallet-source');
      const range         = div.querySelector('.percent-range');
      const input         = div.querySelector('.amount');
      const balanceText   = div.querySelector('.available-balance');

      let currentBalance = 0;
      let currentSymbol = '';
      let currentWallet = 'telegram';

      const updateBalance = () => {
        currentBalance = currentSymbol ? getBalance(currentWallet, currentSymbol) : 0;
        if (currentSymbol) {
          balanceText.innerHTML =
            `Available in <b>${currentWallet}</b> wallet: <strong>${pretty(currentBalance)} ${currentSymbol}</strong>`;
          balanceText.classList.remove('hidden');
          range.disabled = false;
          input.disabled = false;
        } else {
          balanceText.classList.add('hidden');
          range.disabled = true;
          input.disabled = true;
        }
        range.value = '0';
        input.value = '';
      };

      selectToken.onchange = () => {
        currentSymbol = selectToken.value;
        const tgBal = getBalance('telegram', currentSymbol);
        const twBal = getBalance('twitch', currentSymbol);
        currentWallet = tgBal > 0 ? 'telegram' : (twBal > 0 ? 'twitch' : 'telegram');
        selectWallet.value = currentWallet;
        updateBalance();
      };

      selectWallet.onchange = () => {
        currentWallet = selectWallet.value;
        updateBalance();
      };

      range.oninput = () => {
        const percent = parseFloat(range.value) || 0;
        input.value = (currentBalance * percent / 100).toFixed(9);
      };

      input.oninput = () => {
        const amount = parseFloat(input.value);
        if (!isNaN(amount) && currentBalance > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((amount / currentBalance) * 100)));
          range.value = String(pct);
        }
      };

      container.appendChild(div);
    }

    // First row
    renderRewardRow();
    addBtn.onclick = () => renderRewardRow();

    submitBtn.onclick = async () => {
      const rows = document.querySelectorAll('.reward-row');
      const rewards = [];
      const issues = [];

      rows.forEach((row, idx) => {
        const idx1 = idx + 1;
        const symbolEl = row.querySelector('.token-symbol');
        const walletEl = row.querySelector('.wallet-source');
        const amountEl = row.querySelector('.amount');

        const symbol = symbolEl?.value?.trim();
        const wallet = walletEl?.value || 'telegram';
        const amount = parseFloat(amountEl?.value);

        if (!symbol) {
          issues.push(`Row ${idx1}: token not selected.`);
          return;
        }
        if (isNaN(amount) || amount <= 0) {
          issues.push(`Row ${idx1}: invalid amount for ${symbol}.`);
          return;
        }

        const available = getBalance(wallet, symbol);
        if (amount > available) {
          issues.push(`Row ${idx1}: amount ${pretty(amount)} > available ${pretty(available)} ${symbol} in ${wallet} wallet.`);
          return;
        }

        rewards.push({ token_symbol: symbol.toUpperCase(), amount, wallet });
      });

      if (rewards.length === 0) {
        return setFeedback('error', 'No valid rewards to deposit', [
          'Please add at least one row with a token, a source wallet and a positive amount.',
          ...(issues.length ? issues : [])
        ]);
      }

      if (issues.length) {
        setFeedback('info', 'Some rows were skipped', issues);
      }

      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = 'Processing…';
      setFeedback('info', 'Submitting deposit…', [
        `Farm ID: <b>${farmId}</b>`,
        `Rewards count: <b>${rewards.length}</b>`,
        ...rewards.map(r => `• <b>${r.amount}</b> ${r.token_symbol} from <b>${r.wallet}</b> wallet`)
      ]);

      try {
        const { userId, usx_token, wax_account } = window.userData;
        const url = `${BASE_URL}/add_token_to_farm_v2?user_id=${encodeURIComponent(userId || '')}&usx_token=${encodeURIComponent(usx_token || '')}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // NOTE: adds "wallet" per reward so the backend knows which wallet to debit
          body: JSON.stringify({ farm_id: farmId, rewards, wax_account: wax_account })
        });

        let data = {};
        try { data = await res.json(); } catch (_) {}

        if (!res.ok) throw new Error(data?.error || "Unknown error");

        setFeedback('success', 'Rewards deposited successfully', [
          data?.message ? data.message : 'Operation completed.',
          `Farm: <b>${farmId}</b>`,
          ...rewards.map(r => `• <b>${r.amount}</b> ${r.token_symbol} from <b>${r.wallet}</b> wallet`)
        ]);

        // Small delay so the user sees the success inside the modal
        setTimeout(() => {
          try { closeModal(); } catch(_) {}
          try { fetchAndRenderUserFarms(); } catch(_) {}
        }, 1000);
      } catch (err) {
        console.error("[Error depositing rewards]", err);
        setFeedback('error', 'Deposit failed', [
          err?.message ? `Reason: <b>${err.message}</b>` : 'Unknown error.',
          `Farm: <b>${farmId}</b>`,
          ...reards.map(r => `• Attempted: <b>${r.amount}</b> ${r.token_symbol} from <b>${r.wallet}</b> wallet`)
        ]);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = prevLabel;
      }
    };
  }, 0);
}

function confirmFarmClosure(farmId) {
  const body = `
    <p class="modal-text">Are you sure you want to <strong>close</strong> this farm? This will stop all rewards.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cancel-close-farm">Cancel</button>
      <button class="btn btn-danger" id="confirm-close-farm">Confirm</button>
    </div>
  `;

  showModal({
    title: `<h3 class="modal-title text-danger">Close Farm</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('cancel-close-farm').onclick = () => {
      closeModal();
    };

    document.getElementById('confirm-close-farm').onclick = () => {
      closeModal();
      changeFarmStatus(farmId, 'closed');
    };
  }, 0);
}

function changeFarmStatus(farmId, newStatus = null) {
  const { userId, usx_token } = window.userData;

  // Se lo status NON è passato, apri la modale di selezione
  if (!newStatus) {
    const body = `
      <select id="status-select" class="form-select">
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="setting">Setting</option>
      </select>
      <button class="btn btn-warning full-width" id="status-confirm" style="margin-top: 1rem;">
        Update
      </button>
    `;

    showModal({
      title: `<h3 class="modal-title">Change Farm Status</h3>`,
      body
    });

    setTimeout(() => {
      document.getElementById('status-confirm').onclick = () => {
        const selected = document.getElementById('status-select').value;
        closeModal();
        changeFarmStatus(farmId, selected); // ⬅️ Richiama se stesso con status selezionato
      };
    }, 0);

    return;
  }

  // Se lo status è stato passato, esegui la chiamata fetch
  fetch(`${BASE_URL}/update_farm_status?user_id=${userId}&usx_token=${usx_token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ farm_id: farmId, status: newStatus })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      showToast("✅ Farm status updated", "success");
      closeModal();
      fetchAndRenderUserFarms();
    })
    .catch(err => {
      showToast("Error: " + err.message, "error");
    });
}

async function openEditRewards(templateId) {
  const { userId, usx_token } = window.userData;

  try {
    const res = await fetch(`${BASE_URL}/get_farms?user_id=${userId}&usx_token=${usx_token}`);
    const data = await res.json();

    if (!res.ok || !data.farms) {
      showToast("Error loading farms data", "error");
      return;
    }

    const farm = data.farms.find(f => f.templates?.some(t => t.template_id == templateId));
    const template = farm?.templates?.find(t => t.template_id == templateId);

    if (!template) {
      showToast("Template not found", "error");
      return;
    }

    const body = `
      <div id="rewards-edit-container">
        ${(template.rewards || []).map(r => `
          <div class="reward-entry">
            <input type="text" class="form-input half-width token-symbol" value="${r.token_symbol}" placeholder="Token Symbol">
            <input type="number" class="form-input half-width reward-amount" value="${parseFloat(r.daily_reward_amount)}" placeholder="Amount per day">
          </div>
        `).join('')}
      </div>
      <button id="add-reward-btn" class="link-add-reward">➕ Add another reward</button>
      <button id="submit-edit-rewards" class="btn btn-warning full-width" style="margin-top: 1rem;">Update Rewards</button>
    `;

    showModal({
      title: `<h3 class="modal-title">✏️ Edit Rewards for Template ID ${templateId}</h3>`,
      body
    });

    setTimeout(() => {
      // Aggiungi nuova riga reward
      document.getElementById('add-reward-btn').onclick = () => {
        const container = document.getElementById('rewards-edit-container');
        const div = document.createElement('div');
        div.className = 'reward-entry';
        div.innerHTML = `
          <input type="text" class="form-input half-width token-symbol" placeholder="Token Symbol">
          <input type="number" class="form-input half-width reward-amount" placeholder="Amount per day">
        `;
        container.appendChild(div);
      };

      // Submit dei rewards aggiornati
      document.getElementById('submit-edit-rewards').onclick = async () => {
        const rewards = [];
        const entries = document.querySelectorAll('.reward-entry');

        for (const entry of entries) {
          const symbol = entry.querySelector('.token-symbol').value.trim();
          const amount = parseFloat(entry.querySelector('.reward-amount').value.trim());
          if (!symbol || isNaN(amount) || amount <= 0) {
            showToast("Each reward must be valid", "error");
            return;
          }
          rewards.push({ token_symbol: symbol, daily_reward_amount: amount });
        }

        try {
          const res = await fetch(`${BASE_URL}/update_template_rewards?user_id=${userId}&usx_token=${usx_token}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: templateId, rewards })
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || "Failed to update rewards");

          showToast(result.message || "Rewards updated", "success");
          closeModal();
          await fetchAndRenderUserFarms();
        } catch (err) {
          console.error(err);
          showToast(err.message, "error");
        }
      };
    }, 0);

  } catch (error) {
    console.error("[❌] Failed to open edit modal:", error);
    showToast("Failed to load data", "error");
  }
}
window.openEditRewards = openEditRewards;
function removeTemplate(templateId) {
  showConfirmModal(`Are you sure you want to delete Template ${templateId} and all related rewards?`, async () => {
    const { userId, usx_token } = window.userData;

    try {
      const res = await fetch(`${BASE_URL}/remove_template?user_id=${userId}&usx_token=${usx_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Unknown error');

      showToast(data.message || "Template removed successfully", "success");
      fetchAndRenderUserFarms();
    } catch (err) {
      console.error("[❌] Error removing template:", err);
      showToast("Error removing template: " + err.message, "error");
    }
  });
} function openAddReward(templateId) {
  const body = `
    <div class="reward-entry">
      <input type="text" id="new-token-symbol" class="form-input half-width" placeholder="Token Symbol (e.g. CHIPS)">
      <input type="number" id="new-reward-amount" class="form-input half-width" placeholder="Amount per day">
    </div>
    <button id="submit-new-reward" class="btn btn-success full-width" style="margin-top: 1rem;">
      Add Reward
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">➕ Add Reward to Template ID ${templateId}</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('submit-new-reward').onclick = async () => {
      const symbol = document.getElementById('new-token-symbol').value.trim().toUpperCase();
      const amount = parseFloat(document.getElementById('new-reward-amount').value.trim());

      if (!symbol || isNaN(amount) || amount <= 0) {
        showToast("Valid token symbol and amount are required", "error");
        return;
      }

      try {
        const { userId, usx_token } = window.userData;
        const res = await fetch(`${BASE_URL}/add_template_reward?user_id=${userId}&usx_token=${usx_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            template_id: templateId,
            reward: { token_symbol: symbol, daily_reward_amount: amount }
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to add reward");

        showToast(data.message || "Reward added", "success");
        closeModal();
        fetchAndRenderUserFarms();
      } catch (err) {
        console.error("[❌] Error adding reward:", err);
        showToast(err.message, "error");
      }
    };
  }, 0);
}
window.openAddReward = openAddReward; 
window.openEditRewards = openEditRewards;

// Funzione per caricare dinamicamente sezioni
async function loadSection(section) {
  const app = document.getElementById('app');
  const { userId, usx_token, wax_account } = window.userData;
  if (section === 'c2e-twitch') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title text-center">C2E - Twitch</h2>
          <div class="c2e-menu">
            <button class="c2e-menu-btn" data-menu="log-reward-activity"
              style="font-size: 2em; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
              Log Reward Activity
            </button>
            <button class="c2e-menu-btn" data-menu="log-storms-giveaways"
              style="font-size: 2em; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
              Twitch Storms
            </button>
            <button class="c2e-menu-btn" data-menu="twitch-nfts-giveaways"
              style="font-size: 2em; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
              Twitch NFTs Giveaways(NEW!)
            </button>
            <button class="c2e-menu-btn" data-menu="twitch-game"
              style="font-size: 2em; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
              Twitch Game(!soon!)
            </button>
          </div>
        <div id="c2e-content" class="c2e-content">Loading last activity...</div>
      </div>
    `;

    loadLogRewardActivity();

    document.querySelectorAll('.c2e-menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.c2e-menu-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        const menu = e.target.getAttribute('data-menu');
        switch(menu) {
          case 'log-reward-activity': loadLogRewardActivity(); break;
          case 'log-storms-giveaways': loadLogStormsGiveaways(); break;
          case 'twitch-nfts-giveaways': loadTwitchNftsGiveaways(); break;
          case 'twitch-game': loadTwitchGame(); break;
        }
      });
    });
	  } else if (section === 'noncustodialfarms') {
	  const app = document.getElementById('app');
	
	  if (!isLoggedIn?.() || (window.userData?.wax_account !== "agoscry4ever")) {
	    if (window.Swal) Swal.fire("Accesso negato", "Sezione riservata.", "warning");
	    return;
	  }
	
	  app.innerHTML = `
	    <div class="section-container">
	      <h2 class="section-title text-center">Manage not-custodial NFTs Farm</h2>
	      <div id="manage-nft-farm-page"></div>
	    </div>
	  `;
	
	  ensureNCFarmsLoaded(() => {
	    if (window.__NFTF_MOUNTED__) return;
	    const API_BASE = BASE_URL;
	    window.initManageNFTsFarm({
	      apiBaseUrl: API_BASE,
	      containerId: "manage-nft-farm-page",
	    });
	    window.__NFTF_MOUNTED__ = true;
	
	    if (!window.__NFTF_REWARD_LISTENER__) {
	      window.addEventListener("nftFarm:rewardsDraft", (e) => {
	        const draft = e.detail;
	        console.log("Rewards draft:", draft);
	      });
	      window.__NFTF_REWARD_LISTENER__ = true;
	    }
	  });
	
	  return;
	} else if (section === 'wallet') {
      app.innerHTML = `
        <div class="section-container">
          <h2 class="section-title">Wallet</h2>
          <div id="wallet-table">Loading Wallet...</div>
        </div>
      `;
    loadWallet();
  } else if (section === 'goblin-dex') {
      app.innerHTML = `
        <div class="section-container">
          <h2 class="section-title">Goblin Dex</h2>
          <div id="goblin-dex">Loading character...</div>
        </div>
      `;
    loadGoblinDex();
  } else if (section === 'nfts') {
    app.innerHTML = `
    <div class="section-container">
      <h2 class="section-title">My NFTs</h2>
      <div class="filters-group">
        <label for="search-template">Template:</label>
        <input type="text" id="search-template" placeholder="Search by Template Name..." class="form-input">
      
        <label for="filter-status">Status:</label>
        <select id="filter-status" class="form-select">
          <option value="">All</option>
          <option value="Staked">Staked</option>
          <option value="Not Staked">Not Staked</option>
        </select>
      
        <label for="filter-stakable">Stakable:</label>
        <select id="filter-stakable" class="form-select">
          <option value="">All</option>
          <option value="Stakable">Stakable</option>
          <option value="Not Stakable">Not Stakable</option>
        </select>
      
        <label for="filter-for-sale">For Sale:</label>
        <select id="filter-for-sale" class="form-select">
          <option value="">All</option>
          <option value="Yes">For Sale</option>
          <option value="No">Not For Sale</option>
        </select>
      
        <label for="filter-collection">Collection:</label>
        <select id="filter-collection" class="form-select">
          <option value="">All</option>
        </select>
      
        <label for="sort-by">Sort By:</label>
        <select id="sort-by" class="form-select">
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="template_name_asc">Template (A-Z)</option>
          <option value="template_name_desc">Template (Z-A)</option>
        </select>
      </div>


      <div id="bulk-actions" class="bulk-actions hidden">
        <button id="bulk-withdraw" class="btn btn-secondary">Withdraw Selected</button>
        <button id="bulk-send" class="btn btn-primary">Send Selected</button>
      </div>

      <div id="nfts-loading" class="nfts-loading">🔄 Loading NFTs...</div>
      <div id="nfts-count" class="nfts-count"></div>

      <div id="nfts-list" class="nfts-grid"></div>

      <div id="pagination" class="pagination"></div>
      <div id="modal-nft" class="modal-backdrop hidden">
        <div class="modal-content">
          <button class="modal-close">X</button>
          <div id="modal-content"></div>
        </div>
      </div>
      </div>
    `;
    loadNFTs();
  }
else if (section === 'token-staking') {
  app.innerHTML = `
    <div class="section-container">
      <h2 class="section-title">Token Staking</h2>

      <!-- Toolbar: Tabs + Distribution -->
      <div class="token-toolbar" style="display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; justify-content:space-between; margin-bottom:12px;">
        <div class="tabs" role="tablist" aria-label="Token staking tabs" style="display:flex; gap:6px;">
          <button id="tab-pools" class="tab active" role="tab" aria-selected="true" aria-controls="tab-pools-content">Pools</button>
          <button id="tab-earnings" class="tab" role="tab" aria-selected="false" aria-controls="tab-earnings-content">Earning History</button>
        </div>
        
        <div class="actions" id="dist-actions" style="display:none; align-items:center; gap:.5rem; margin: .5rem 0 1rem;">
          <label style="display:flex; align-items:center; gap:.35rem; font-size:.95rem;">
            <input type="checkbox" id="dist-dry" checked>
            Dry run
          </label>
          <button id="btn-distribute"
                  class="btn btn-primary"
                  style="display:inline-flex;align-items:center;gap:.5rem;padding:.5rem .9rem;border:1px solid #2b2b2b;border-radius:8px;background:#0d6efd;color:#fff;font-weight:600;cursor:pointer;">
            <span id="dist-spinner"
                  class="spin"
                  style="display:none;width:14px;height:14px;border:2px solid rgba(255,255,255,.6);border-top-color:#fff;border-radius:50%;"></span>
            <span id="dist-label">Run Distribution</span>
          </button>
        </div>
      </div>
      <style>
      @keyframes spin { to { transform: rotate(360deg); } }
      .spin { animation: spin .8s linear infinite; }
      </style>

      <!-- Tabs content -->
      <div id="tab-content">
        <!-- Pools tab -->
        <div id="tab-pools-content" role="tabpanel" aria-labelledby="tab-pools">
          <input type="text" id="search-pools" placeholder="Search token pool name" class="form-input search-token-pool" style="margin-bottom:10px;">
          <div id="pool-buttons" class="pool-buttons"></div>
          <div id="selected-pool-details">
            <div class="loading-message">Loading pool data...</div>
          </div>
        </div>

        <!-- Earnings tab -->
        <div id="tab-earnings-content" role="tabpanel" aria-labelledby="tab-earnings" hidden>
          <div class="card" style="margin-bottom:12px;">
            <h3 class="card-title">Earning History</h3>
            <div style="display:flex; gap:.5rem; align-items:flex-end; flex-wrap:wrap;">
              <div>
                <label class="label">From</label>
                <input type="date" id="eh-start" class="form-input" />
              </div>
              <div>
                <label class="label">To</label>
                <input type="date" id="eh-end" class="form-input" />
              </div>
              <div>
                <label class="label">Quick</label>
                <select id="eh-quick" class="form-input">
                  <option value="7">Last 7 days</option>
                  <option value="14">Last 14 days</option>
                  <option value="30">Last 30 days</option>
                </select>
              </div>
              <button id="eh-refresh" class="btn btn-secondary">Refresh</button>
            </div>
          </div>

          <div id="eh-summary" class="card" style="margin-bottom:12px;">
            <h4 class="card-title">Summary</h4>
            <div id="eh-summary-body" class="label">Select a range and click Refresh.</div>
          </div>

          <div id="eh-days"></div>
        </div>
      </div>
    </div>
  `;

  // init tabs
  initTokenStakingTabs();

  // 🔐 mostra il blocco solo se il wallet è quello autorizzato
  try {
    const allowedDist = (window.userData?.wax_account === 'agoscry4ever');
    const distActions = document.getElementById('dist-actions');
    if (distActions) distActions.style.display = allowedDist ? 'flex' : 'none';

    // singolo hook sul click
    const btn = document.getElementById('btn-distribute');
    if (btn && allowedDist) {
      btn.addEventListener('click', runTokenDistribution);
    }
  } catch (e) {
    console.warn('dist-actions init error', e);
  }

  // load pools tab una sola volta
  loadStakingPools();

  // init earning history defaults
  initEarningHistoryControls();
} else if (section === 'nfts-staking') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title">NFT Staking</h2>
  
        <!-- Toolbar con inline CSS -->
        <div id="farm-tools" style="
          display:flex;align-items:center;gap:12px;flex-wrap:wrap;
          background:#0f172a; /* slate-900 */
          border:1px solid rgba(255,255,255,0.08);
          padding:12px;border-radius:10px;margin-bottom:14px;
        ">
          <button id="btn-earnings" style="
            cursor:pointer;border:none;padding:10px 14px;border-radius:8px;
            background:#1e293b;color:#e2e8f0;font-weight:600;
            box-shadow:0 1px 1px rgba(0,0,0,0.15);
          ">📜 Earning History</button>
  
          <!-- Container Admin visibile solo per agoscry4ever -->
          <div id="admin-distribute-container" style="
            display:none;align-items:center;gap:10px;margin-left:auto;
            background:#0b1220;border:1px dashed rgba(255,255,255,0.12);
            padding:10px;border-radius:8px;
          ">
            <label for="dryrun-toggle" style="color:#cbd5e1;font-size:13px;display:flex;align-items:center;gap:6px;">
              <input id="dryrun-toggle" type="checkbox" checked
                style="width:16px;height:16px;accent-color:#22c55e;cursor:pointer;">
              Dry-run
            </label>
            <button id="btn-distribute" style="
              cursor:pointer;border:none;padding:10px 14px;border-radius:8px;
              background:#22c55e;color:#0b1220;font-weight:800;
              letter-spacing:0.2px;
              box-shadow:0 1px 1px rgba(0,0,0,0.25);
            ">⚙️ Run Distribution</button>
          </div>
        </div>
  
        <!-- Feedback dinamico per la distribuzione -->
        <div id="distribution-feedback" style="margin:-6px 0 16px 0;"></div>
  
        <div id="nft-farms-container" class="vertical-list">Loading NFT farms...</div>
      </div>
    `;
  
    // Inizializza la toolbar (visibilità admin, listeners)
    initFarmToolsControls();
  
    // Carica le farm
    loadNFTFarms();
  }
  
  else if (section === 'create-nfts-farm') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title">Create NFTs Staking Farm</h2>
        <div id="create-nfts-farm-container">Loading...</div>
      </div>
    `;
    loadCreateNFTFarm();
  }
   else if (section === 'create-token-pool') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title">Create Token Staking Pool</h2>
        <div id="create-token-pool-container">Loading...</div>
      </div>
    `;
    loadCreateTokenStaking();
  } else if (section === 'daily') {
  app.innerHTML = `
    <div class="section-container">
      <h2 class="section-title">Daily Chest</h2>
      <div id="daily-box">Loading...</div>
    </div>
  `;

  try {
    const dailyBoxRes = await fetch(`${BASE_URL}/daily_chest_open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        usx_token,
        wax_account
      })
    });

    const dailyBoxData = await dailyBoxRes.json();
    window.accountData = {
      ...window.accountData,
      dailyBox: dailyBoxData
    };

    renderDailyBox(dailyBoxData);
  } catch (err) {
    console.error("[❌] Failed to fetch daily box:", err);
    document.getElementById('daily-box').innerText = "Failed to load Daily Chest.";
  }
}  else if (section === 'account') {
    app.innerHTML = `
      <div class="section-container">
      
        <h2 class="section-title2">💠 Account Overview</h2>
        
        <p style="
        font-family: 'Rock Salt', cursive;
        text-transform: uppercase;
        font-size: 1rem;
        color: #ffe600;
        margin-top: 1rem;
        white-space: nowrap;
        overflow: hidden;
        border-right: 2px solid #ffe600;
        display: inline-block;
        animation: typing 3.5s steps(50, end), blink 1s step-end infinite;
        position: relative;
      ">
        Why not peek behind the scenes?
        <span style="
          position: absolute;
          left: 0;
          bottom: -4px;
          height: 2px;
          width: 0;
          background: #f39c12;
          animation: underlineSlide 2.5s ease-in-out 3s forwards;
        "></span>
      </p>

        <div class="loading-message typing-loader">
          <div class="typing-text">⌛ Loading blockchain data... please wait. </div>
          <div class="spinner-bar"></div>
        </div>
  
        <div id="account-sections" style="display: none;">
          <details open class="account-block2 decorated-block">
            <summary class="section-title2">👤 Personal Info</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeicm355ngr7bjtn7bifflfcndjct4hlyj36efpfdrgfufpm4t6esfq" alt="decor-left">
            <div id="personal-info"></div>
          </details>
  
          <details class="account-block2" decorated-block">
            <summary class="section-title2">💬 Chat Rewards</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeieyvsd5m7lertnqcnrcucrkjpyksajvx7f2jkpxvstevtwztmbk5u" alt="decor-left">
            <div id="chat-rewards"></div>
          </details>
    
          <details class="account-block2" decorated-block">
            <summary class="section-title2">📜 Recent Activity</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeicmgskdkv7l7zinxbmolfbwt36375h54gjss2sp4wrcynrvn4trsu" alt="decor-left">
            <div id="recent-activity"></div>
          </details>
  
        </div>
      </div>
    `;
  
    loadAccountSection();
  }
  else if (section === 'loadLatestNews') {
      app.innerHTML = `
        <div class="section-container">
          <h2 class="section-title">Guides and Infos</h2>  
          <div id="main-wrapper"></div>
        </div>
     `;
      showNewsSection()
    }
  }

function showNewsSection() {
  loadNewsList({ page: 1 });
}

function getSearchQuery() {
  return document.getElementById('news-search')?.value || '';
}

function getSelectedCategory() {
  return document.getElementById('news-category')?.value || '';
}

function createNewsWrapper() {
  const wrapper = document.createElement('div');
  wrapper.id = 'news-wrapper';
  wrapper.classList.add('fade-in');
  wrapper.style.display = 'block';
  document.getElementById('main-wrapper').prepend(wrapper);
  return wrapper;
}

function debounce(fn, delay) {
  let timeout;
  return function () {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn.apply(this, arguments), delay);
  };
}

async function loadNewsList({ page = 1, search = '', category = '' } = {}) {
  const { usx_token } = window.userData;
  const wrapper = document.getElementById('news-wrapper') || createNewsWrapper();
  wrapper.innerHTML = `<p class="loading-message">⏳ Loading news...</p>`;

  try {
    const res = await fetch(`${BASE_URL}/news/list?usx_token=${usx_token}&page=${page}&search=${encodeURIComponent(search)}&category=${category}`);
    const { articles, total_pages, current_page } = await res.json();

    wrapper.innerHTML = `
      <div class="account-card2">
        <h2 class="glow-text">📰 News</h2>

        <div class="news-filters">
          <input type="text" id="news-search" placeholder="🔍 Search news..." />
          <select id="news-category">
            <option value="">📂 All</option>
            <option value="Update">🔧 Updates</option>
            <option value="Event">🎉 Events</option>
            <option value="Guide">📘 Guides</option>
            /*<option value="Drop">🎁 Drops</option>*/
          </select>
        </div>

        ${articles.length > 0 ? articles.map(article => `
          <div class="news-item-card" style="
            background: linear-gradient(145deg, #1a1a2a, #2a2a40);
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 20px;
            border: 1px solid #444;
            box-shadow: 0 0 12px rgba(0, 255, 255, 0.15);
            transition: transform 0.3s ease;
          ">
            ${article.image_url ? `<img src="${article.image_url}" alt="img" class="news-img" style="width:100%; max-height:200px; object-fit:cover; border-radius:8px; margin-bottom:12px; box-shadow:0 0 8px rgba(0,255,255,0.2);" />` : ''}
          
            <div class="news-content">
              <div class="news-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span class="news-category" style="
                  background: rgba(0, 255, 255, 0.1);
                  color: #00f0ff;
                  padding: 4px 10px;
                  border-radius: 6px;
                  font-size: 13px;
                  font-weight: bold;
                  text-shadow: 0 0 5px #00ffff;
                ">${article.category || 'General'}</span>
          
                <small style="color:#aaa;">📅 ${article.date}</small>
              </div>
          
              <h3 class="news-title" style="
                color: #8ef;
                font-size: 22px;
                margin: 8px 0;
                text-shadow: 0 0 6px #0ff;
              ">${article.title}</h3>
          
              <p class="news-summary" style="
                color: #ccc;
                font-size: 15px;
                line-height: 1.6;
              ">${article.summary}</p>
          
              <div class="news-footer" style="margin-top:12px;">
                <button onclick="loadFullArticle(${article.id})" class="news-readmore-btn" style="
                  background: #00f0ff;
                  color: #000;
                  font-weight: bold;
                  padding: 8px 14px;
                  border: none;
                  border-radius: 6px;
                  cursor: pointer;
                  box-shadow: 0 0 8px #0ff;
                  transition: background 0.2s ease;
                ">🔎 Read More</button>
              </div>
            </div>
          </div>

        `).join('') : `<p style="color:#999;">No news available.</p>`}


        <div class="pagination">${renderPaginationControls(current_page, total_pages)}</div>
      </div>
    `;

    bindNewsFilters();

  } catch (err) {
    wrapper.innerHTML = `<div class="error-message">❌ Failed to load news: ${err.message}</div>`;
    console.error("[❌] Error loading news:", err);
  }
}

async function loadFullArticle(newsId) {
  const wrapper = document.getElementById('news-wrapper');
  wrapper.innerHTML = `<p class="loading-message">⏳ Loading article...</p>`;

  try {
    const res = await fetch(`${BASE_URL}/news/${newsId}`);
    const article = await res.json();

    if (article.error) {
      wrapper.innerHTML = `<p class="error-message">❌ ${article.error}</p>`;
      return;
    }

    wrapper.innerHTML = `
      <div class="account-card2" style="padding:20px; background:#1a1a2a; color:#ddd; border-radius:10px;">
        <button onclick="loadNewsList({ page: 1 })" class="back-btn" style="margin-bottom:15px; background:#666; color:white; padding:6px 12px; border:none; border-radius:5px; cursor:pointer;">🔙 Back</button>
        <h2 class="glow-text" style="font-size:28px; color:#8ef;">${article.title}</h2>
        <small style="display:block; margin:5px 0 15px; color:#aaa;">📅 ${article.date} | 🏷️ ${article.category || 'General'}</small>
        ${article.image_url ? `<img src="${article.image_url}" class="news-img-full" style="width:100%; max-height:300px; object-fit:cover; border-radius:10px; margin-bottom:20px;" />` : ''}
        <div class="news-full-content" style="font-size:16px; line-height:1.7; color:#ccc;">
          ${article.content}
        </div>
      </div>
    `;

  } catch (err) {
    wrapper.innerHTML = `<div class="error-message">❌ Error loading article: ${err.message}</div>`;
    console.error("[❌] Error loading full article:", err);
  }
}

function renderPaginationControls(current, total) {
  let html = '';
  for (let i = 1; i <= total; i++) {
    html += `<button class="${i === current ? 'active' : ''}" onclick="loadNewsList({ page: ${i}, search: getSearchQuery(), category: getSelectedCategory() })">${i}</button>`;
  }
  return html;
}

function bindNewsFilters() {
  document.getElementById('news-search')?.addEventListener('input', debounce(() => {
    loadNewsList({ page: 1, search: getSearchQuery(), category: getSelectedCategory() });
  }, 300));

  document.getElementById('news-category')?.addEventListener('change', () => {
    loadNewsList({ page: 1, search: getSearchQuery(), category: getSelectedCategory() });
  });
}

function loadGoblinDex() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="section-container" style="padding: 2rem; font-size: 1.3rem;">
      <h2 class="section-title text-center" style="margin-bottom: 2rem; font-size: 2.6rem;">Goblin Dex</h2>
  
      <div class="goblin-menu" style="
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 1.5rem;
        margin-bottom: 2rem;
      ">
        <button class="goblin-menu-btn active-tab" data-menu="inventory"
          style="padding: 1rem 2rem; font-size: 1.3rem; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          Goblin Inventory
        </button>
        <button class="goblin-menu-btn" data-menu="dwarf-cave"
          style="padding: 1rem 2rem; font-size: 1.3rem; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          Dwarfen Gold Cave
        </button>
        <button class="goblin-menu-btn" data-menu="blend"
          style="padding: 1rem 2rem; font-size: 1.3rem; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          Blend & Rotate slot
        </button>
        <button class="goblin-menu-btn" data-menu="history"
          style="padding: 1rem 2rem; font-size: 1.3rem; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          History
        </button>
        <button class="goblin-menu-btn" data-menu="hall-of-fame"
          style="padding: 1rem 2rem; font-size: 1.3rem; font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          Hall Of Fame
        </button>
      </div>
  
      <div id="goblin-content" class="goblin-content" style="font-size: 1.2rem;">
        Loading Goblin Inventory...
      </div>
    </div>
  `;

  // Gestione click menu
  document.querySelectorAll('.goblin-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.goblin-menu-btn').forEach(b => b.classList.remove('active-tab'));
      btn.classList.add('active-tab');
      const selected = btn.getAttribute('data-menu');

      // Caricamento dinamico
      switch (selected) {
        case 'inventory':
          renderGoblinInventory();
          break;
        case 'dwarf-cave':
          renderDwarfsCave();
          break;
        case 'blend':
          renderGoblinBlend();
          break;
        case 'upgrade':
          renderGoblinUpgrade();
          break;
        case 'history':
          renderGoblinHistory();
          break;
        case 'hall-of-fame':
          renderGoblinHallOfFame();
          break;
        default:
          document.getElementById('goblin-content').innerText = "Unknown section.";
      }
    });
  });

  // Carica la sezione di default (Goblin Inventory)
  renderGoblinInventory();
}

/* =========================
   Inventory helpers (readable, English)
   ========================= */

// Rarity → CSS classes (must match your existing CSS)
const RARITY_COLOR_CLASS = Object.freeze({
  common:    "neon-green",
  rare:      "neon-blue",
  epic:      "neon-purple",
  legendary: "neon-gold",
  mythic:    "neon-red",
});

const RARITY_BORDER_CLASS = Object.freeze({
  common:    "border-glow-green",
  rare:      "border-glow-blue",
  epic:      "border-glow-purple",
  legendary: "border-glow-gold",
  mythic:    "border-glow-red",
});

// Level color thresholds (descending priority)
const LEVEL_COLOR_BREAKPOINTS = Object.freeze([
  { min: 10, cls: "neon-red"    },
  { min:  7, cls: "neon-gold"   },
  { min:  4, cls: "neon-purple" },
  { min:  2, cls: "neon-blue"   },
  { min: -Infinity, cls: "neon-green" },
]);

// Accent palette for small labels/legends
const ACCENT_COLORS = Object.freeze(["#0ff", "#ff66cc", "#ffcc00", "#00ff99", "#66b2ff"]);

const _safeLower = (v) => (typeof v === "string" ? v.trim().toLowerCase() : "");

function getRarityColorClass(rarity) {
  const key = _safeLower(rarity);
  return RARITY_COLOR_CLASS[key] || "neon-white";
}
function getRarityBorderClass(rarity) {
  const key = _safeLower(rarity);
  return RARITY_BORDER_CLASS[key] || "";
}
function getLevelColorClass(level) {
  const n = Number(level) || 0;
  for (const bp of LEVEL_COLOR_BREAKPOINTS) {
    if (n >= bp.min) return bp.cls;
  }
  return "neon-green";
}
function getLabelColor(index) {
  const i = Math.abs(Number(index) || 0) % ACCENT_COLORS.length;
  return ACCENT_COLORS[i];
}

/* =========================
   Goblin Inventory (tabs: Goblins / Materials)
   ========================= */

async function renderGoblinInventory() {
  const container = document.getElementById("goblin-content");
  if (!container) return;

  // Local utils
  const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, m => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;", "`":"&#96;" }[m]
  ));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const rarityOrder = { common:1, uncommon:2, rare:3, epic:4, legendary:5, mythic:6 };

  // Materials metadata (based on your backend templates)
  const MATERIAL_META = {
    893711: {
      type: "magic_stone",
      prettyType: "Level Upgrader",
      name: "Upgrader",
      description: "Use it to promote your Goblin to the next level. Works for all rarities."
    },
    893710: {
      type: "rotation_stone",
      prettyType: "Slot Rotator",
      name: "Rotator",
      description: "Use it to move your Goblin to the next ability."
    }
  };

  // Initial skeleton
  container.innerHTML = `
    <div role="status" aria-live="polite" style="display:flex; gap:.5rem; margin-bottom:1rem;">
      <div class="cv-skel" style="height:42px; width:220px; border-radius:12px;"></div>
      <div class="cv-skel" style="height:42px; width:260px; border-radius:12px;"></div>
    </div>
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
      ${Array.from({length:9}).map(()=>`<div class="cv-skel" style="height:220px; border-radius:14px;"></div>`).join("")}
    </div>
  `;

  // Lightweight session cache (per user)
  const cacheKey = (() => {
    const wax = window.userData?.wax_account || "";
    const uid = window.userData?.userId || window.userData?.user_id || "";
    return `inv:${wax}:${uid}`;
  })();
  const getCache = () => {
    try { return JSON.parse(sessionStorage.getItem(cacheKey) || "null"); } catch { return null; }
  };
  const setCache = (data) => {
    try { sessionStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), data })); } catch {}
  };

  // Fetch /user_nfts with a single retry (and cache)
  let retried = false;
  async function fetchUserNFTs() {
    // short-lived cache (60s)
    const cached = getCache();
    if (cached && Date.now() - cached.t < 60_000) return cached.data;

    try {
      if (typeof API !== "undefined" && API.post) {
        const wax_account = window.userData?.wax_account;
        const user_id     = window.userData?.userId || window.userData?.user_id;
        const usx_token   = window.userData?.usx_token;
        const r = await API.post("/user_nfts", { wax_account, user_id, usx_token }, 15000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const arr = Array.isArray(r.data) ? r.data : [];
        setCache(arr);
        return arr;
      }
      const res = await fetch(`${BASE_URL}/user_nfts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wax_account: window.userData?.wax_account,
          user_id: window.userData?.userId,
          usx_token: window.userData?.usx_token
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      const data = Array.isArray(arr) ? arr : [];
      setCache(data);
      return data;
    } catch (e) {
      if (!retried) {
        retried = true;
        await new Promise(r => setTimeout(r, 10_000));
        return fetchUserNFTs();
      }
      console.warn("[renderGoblinInventory] /user_nfts error:", e);
      return [];
    }
  }

  const all = await fetchUserNFTs();

  // Normalize legacy keys
  all.forEach(nft => {
    if (nft.daily_power !== undefined) nft["daily-power"] = nft.daily_power;
    if (nft["loot-hungry"] === undefined && nft.loot_hungry !== undefined) nft["loot-hungry"] = nft.loot_hungry;
    if (typeof nft.img === "string") {
      if (nft.img.startsWith("https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/")) {
        nft.img = nft.img.replace("https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/", "https://ipfs.io/ipfs/");
      } else if (nft.img.startsWith("Q") || nft.img.startsWith("bafy")) {
        nft.img = `https://ipfs.io/ipfs/${nft.img}`;
      }
    }
  });

  // Split into goblins and materials
  const goblinsAll = (Array.isArray(all) ? all : []).filter(n => n.type === "goblin");
  const materialsRaw = (Array.isArray(all) ? all : []).filter(n => {
    const t = String(n.type || "").toLowerCase();
    return t === "magic_stone" || t === "rotation_stone";
  });

  // Aggregate materials by template_id (quantity + metadata)
  const byTpl = new Map();
  for (const m of materialsRaw) {
    const tpl = Number(m.template_id || 0);
    const cur = byTpl.get(tpl) || { ...m, quantity: 0 };
    cur.quantity += 1;
    if (MATERIAL_META[tpl]) {
      cur.prettyType  = MATERIAL_META[tpl].prettyType;
      cur.name        = MATERIAL_META[tpl].name;
      cur.description = MATERIAL_META[tpl].description;
      cur.type        = MATERIAL_META[tpl].type;
    }
    if (typeof cur.img === "string") {
      if (cur.img.startsWith("Q") || cur.img.startsWith("bafy")) cur.img = `https://ipfs.io/ipfs/${cur.img}`;
    }
    byTpl.set(tpl, cur);
  }
  const materialsAgg = Array.from(byTpl.values());

  // ======= Tab header (armored, accessible, inline-styled beauty) =======
  const tabBtnBase = `
    font-family: Orbitron, system-ui, sans-serif;
    display:inline-flex; align-items:center; gap:.55rem;
    border:1px solid rgba(255,255,255,.18);
    padding:.65rem 1.05rem;
    border-radius:14px; cursor:pointer;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    color:#eaeaea; letter-spacing:.15px; font-weight:800; font-size:.95rem;
    box-shadow:0 6px 18px rgba(0,0,0,.3), inset 0 0 0 rgba(255,255,255,0);
    transition:transform .12s ease, box-shadow .25s ease, border-color .25s ease, background .25s ease, color .2s ease;
    backdrop-filter: blur(6px);
  `;
  const tabBtnActive = `
    background:linear-gradient(180deg, #171717, #0f0f0f);
    border-color: rgba(255, 230, 0, .55);
    color:#ffe600;
    box-shadow:0 8px 28px rgba(255,230,0,.22), inset 0 0 14px rgba(255,230,0,.18);
    transform: translateY(-1px);
  `;
  const tabBtnHover = `this.style.transform='translateY(-1px)'; this.style.boxShadow='0 8px 24px rgba(255,230,0,.18)';`;
  const tabBtnOut   = `this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 18px rgba(0,0,0,.3)';`;

  // Render tabs shell
  container.innerHTML = `
    <div role="tablist" aria-label="Inventory Tabs" style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; margin-bottom:.8rem;">
      <button id="inv-tab-goblins"
              role="tab" aria-selected="true" tabindex="0"
              class="cv-btn"
              style="${tabBtnBase}${tabBtnActive}"
              onmouseenter="${tabBtnHover}"
              onmouseleave="${tabBtnOut}">
        🧌 <span>Goblins</span>
        <span class="cv-badge" style="border-color:#20444a;background:linear-gradient(180deg,#152024,#0f1a1c);color:#7ff6ff;">${goblinsAll.length}</span>
      </button>

      <button id="inv-tab-mats"
              role="tab" aria-selected="false" tabindex="-1"
              class="cv-btn"
              style="${tabBtnBase}"
              onmouseenter="${tabBtnHover}"
              onmouseleave="${tabBtnOut}">
        🧪 <span>Blending / Crafting Material</span>
        <span class="cv-badge" style="border-color:#20444a;background:linear-gradient(180deg,#152024,#0f1a1c);color:#7ff6ff;">${materialsAgg.length}</span>
      </button>

      <span style="margin-left:auto; color:#9aa0a6; font-size:.9rem;">Your Tavern</span>
    </div>
    <div id="inv-body"></div>
  `;

  const tabG = container.querySelector("#inv-tab-goblins");
  const tabM = container.querySelector("#inv-tab-mats");
  const body = container.querySelector("#inv-body");

  function setActiveTabStyles(active) {
    const set = (btn, isActive) => {
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.tabIndex = isActive ? 0 : -1;
      btn.style.cssText = tabBtnBase + (isActive ? tabBtnActive : "");
    };
    set(tabG, active === "goblins");
    set(tabM, active === "materials");
  }

  // Keyboard navigation (Left/Right, Home/End)
  container.querySelector('[role="tablist"]').addEventListener("keydown", (e) => {
    const tabs = [tabG, tabM];
    const idx = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    if (idx < 0) return;

    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;

    e.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  });

  /* =========================
     GOBLINS TAB
     ========================= */
  function renderGoblinTab() {
    body.innerHTML = `
      <div id="goblin-filters" class="cv-card"
           style="position:sticky; top:8px; z-index:20; margin-bottom:1rem; padding:.8rem;
                  backdrop-filter: blur(6px);
                  background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(12,12,12,.92));
                  border:1px solid var(--cv-border); box-shadow:0 8px 20px rgba(0,0,0,.35);">
        <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; justify-content:center;">
          <input id="g-name" placeholder="🔎 Search name or ID…" aria-label="Search goblins by name or asset ID"
                 style="background:#151515; border:1px solid #333; color:#eee; padding:.5rem .7rem; border-radius:10px; width:240px;">
          <select id="g-rarity" class="cv-btn" style="min-width:160px;" aria-label="Filter by rarity">
            <option value="">All Rarities</option>
            <option>Common</option><option>Uncommon</option><option>Rare</option>
            <option>Epic</option><option>Legendary</option><option>Mythic</option>
          </select>
          <div style="display:flex; align-items:center; gap:.45rem;">
            <label for="g-power" style="color:#ccc; font-size:.9rem;">Min Power</label>
            <input id="g-power" type="range" min="0" max="100" step="1" value="0">
            <span id="g-power-val" style="color:#0ff; font-size:.9rem;">0</span>
          </div>
          <div style="display:flex; background:#1a1a1a; border:1px solid #333; border-radius:10px; overflow:hidden;">
            <button class="cv-btn g-sort" data-k="level" style="border:none; border-right:1px solid #333;">Level</button>
            <button class="cv-btn g-sort" data-k="daily-power" style="border:none; border-right:1px solid #333;">Power</button>
            <button class="cv-btn g-sort" data-k="rarity" style="border:none;">Rarity</button>
          </div>
          <select id="g-page-size" class="cv-btn" title="Items per page" aria-label="Items per page">
            <option value="12">12 / page</option>
            <option value="24">24 / page</option>
            <option value="48">48 / page</option>
          </select>
          <button id="g-reset" class="cv-btn" title="Clear filters">🔄 Reset</button>
        </div>
      </div>

      <div id="goblin-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:12px;"></div>
      <div id="goblin-pagination" style="display:flex; gap:.4rem; justify-content:center; margin-top:.8rem;"></div>
    `;

    const state = {
      q: "", rarity: "", minPower: 0,
      sortKey: "rarity", sortAsc: false,
      page: 1, pageSize: 12
    };

    const el = {
      q: body.querySelector("#g-name"),
      rarity: body.querySelector("#g-rarity"),
      power: body.querySelector("#g-power"),
      powerVal: body.querySelector("#g-power-val"),
      size: body.querySelector("#g-page-size"),
      reset: body.querySelector("#g-reset"),
      grid: body.querySelector("#goblin-grid"),
      pager: body.querySelector("#goblin-pagination"),
    };

    const apply = debounce(() => { state.page = 1; render(); }, 150);

    el.q.addEventListener("input", () => { state.q = el.q.value.trim().toLowerCase(); apply(); });
    el.q.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    el.rarity.addEventListener("change", () => { state.rarity = el.rarity.value; apply(); });
    el.power.addEventListener("input", () => {
      state.minPower = Number(el.power.value) || 0;
      el.powerVal.textContent = String(state.minPower);
      apply();
    });
    el.size.addEventListener("change", () => { state.pageSize = Number(el.size.value) || 12; render(); });
    el.reset.addEventListener("click", () => {
      state.q = ""; el.q.value = "";
      state.rarity = ""; el.rarity.value = "";
      state.minPower = 0; el.power.value = 0; el.powerVal.textContent = "0";
      state.sortKey = "rarity"; state.sortAsc = false;
      state.page = 1; state.pageSize = 12;
      render();
    });
    body.querySelectorAll(".g-sort").forEach(b => {
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (state.sortKey === k) state.sortAsc = !state.sortAsc;
        else { state.sortKey = k; state.sortAsc = (k === "rarity"); }
        render();
      });
    });

    function filt(list) {
      const q = state.q;
      const rar = (state.rarity || "").toLowerCase();
      return list.filter(g => {
        const okQ = !q || String(g.name || "").toLowerCase().includes(q) || String(g.asset_id || "").includes(q);
        const okR = !rar || String(g.rarity || "").toLowerCase() === rar;
        const dp = Number(g["daily-power"] ?? g.daily_power ?? 0) || 0;
        return okQ && okR && dp >= state.minPower;
      });
    }
    function sort(list) {
      const sk = state.sortKey, asc = state.sortAsc;
      return list.slice().sort((a, b) => {
        let av, bv;
        if (sk === "rarity") {
          av = rarityOrder[String(a.rarity || "").toLowerCase()] || 0;
          bv = rarityOrder[String(b.rarity || "").toLowerCase()] || 0;
        } else {
          av = Number(a[sk]) || Number(a[sk?.replace("-", "_")]) || 0;
          bv = Number(b[sk]) || Number(b[sk?.replace("-", "_")]) || 0;
        }
        return asc ? (av - bv) : (bv - av);
      });
    }
    function paginate(list) {
      const start = (state.page - 1) * state.pageSize;
      return list.slice(start, start + state.pageSize);
    }
    function renderGrid(list) {
      const cards = list.map(nft => {
        const dp  = Number(nft["daily-power"] ?? nft.daily_power ?? 0) || 0;
        const lvl = Number(nft.level || 0);
        const tip = `Lvl ${lvl} • ${nft.rarity} • Power ${dp}\nACC ${nft.accuracy ?? 0} | RES ${nft.resistance ?? 0} | LOOT ${nft["loot-hungry"] ?? 0} | SPD ${nft.speed ?? 0}`;

        const rCl = getRarityBorderClass(nft.rarity);
        const levelClass = getLevelColorClass(lvl);
        const meterPct = Math.min(100, Math.max(6, Math.round(dp)));

        return `
          <div class="cv-card ${rCl}" style="padding:.8rem; border-radius:14px;" title="${esc(tip)}">
            <div style="display:flex; gap:.8rem;">
              <div style="position:relative; flex:0 0 auto;">
                <img src="${esc(nft.img)}" alt="Goblin artwork" loading="lazy"
                     style="width:82px; height:82px; border-radius:12px; object-fit:cover; outline:1px solid var(--cv-border); box-shadow:0 3px 10px rgba(0,0,0,.35);">
              </div>
              <div style="flex:1 1 auto; min-width:0;">
                <div style="display:flex; align-items:center; gap:.5rem;">
                  <strong style="color:#ffe600; font-family:Orbitron,system-ui,sans-serif; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                    ${esc(nft.name)}
                  </strong>
                  <span class="cv-rarity" style="background:#1a1a1a; border-color:#333;">${esc(nft.rarity)}</span>
                </div>
                <div style="display:flex; gap:.45rem; flex-wrap:wrap; margin:.4rem 0;">
                  <span class="cv-badge">Lvl <span class="${levelClass}" style="color:#fff;">${esc(lvl)}</span></span>
                  <span class="cv-badge">ID ${esc(nft.asset_id)}</span>
                </div>
                <div class="cv-meter"><div style="width:${meterPct}%;"></div></div>
                <div style="display:flex; gap:.6rem; margin-top:.4rem; color:#9aa0a6; font-size:.86rem;">
                  <span title="Daily Power">⚡ ${dp}</span>
                  <span title="Accuracy">🎯 ${esc(nft.accuracy ?? 0)}</span>
                  <span title="Resistance">🛡 ${esc(nft.resistance ?? 0)}</span>
                  <span title="Loot-Hungry">💰 ${esc(nft["loot-hungry"] ?? 0)}</span>
                  <span title="Speed">🏃 ${esc(nft.speed ?? 0)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join("");
      el.grid.innerHTML = cards || `<div class="cv-toast">No goblins found.</div>`;
    }
    function renderPager(total) {
      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      state.page = Math.min(state.page, pages);
      el.pager.innerHTML = Array.from({ length: pages }).map((_, i) => {
        const p = i + 1;
        const on = p === state.page ? "background:#2a2a2a; color:#ffe600;" : "";
        return `<button data-p="${p}" class="cv-btn" style="padding:.35rem .7rem; ${on}">${p}</button>`;
      }).join("");
      el.pager.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          state.page = Number(b.dataset.p) || 1;
          render();
          // small QoL: scroll to top of grid
          el.grid.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
    function render() {
      const f = filt(goblinsAll);
      const s = sort(f);
      renderPager(s.length);
      renderGrid(paginate(s));
    }
    render();
  }

  /* =========================
     MATERIALS TAB
     ========================= */
  function renderMaterialsTab() {
    body.innerHTML = `
      <div class="cv-card"
           style="position:sticky; top:8px; z-index:20; margin-bottom:1rem; padding:.8rem;
                  backdrop-filter: blur(6px);
                  background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(12,12,12,.92));
                  border:1px solid var(--cv-border); box-shadow:0 8px 20px rgba(0,0,0,.35);">
        <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; justify-content:space-between;">
          <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:center;">
            <input id="m-name" placeholder="🔎 Search material…" aria-label="Search materials by name"
                   style="background:#151515; border:1px solid #333; color:#eee; padding:.5rem .7rem; border-radius:10px; width:240px;">
            <select id="m-type" class="cv-btn" style="min-width:200px;" aria-label="Filter by material type">
              <option value="">All Materials</option>
              <option value="magic_stone">Level Upgrader</option>
              <option value="rotation_stone">Slot Rotator</option>
            </select>
            <div style="display:flex; background:#1a1a1a; border:1px solid #333; border-radius:10px; overflow:hidden;">
              <button class="cv-btn m-sort" data-k="name" style="border:none; border-right:1px solid #333;">Name</button>
              <button class="cv-btn m-sort" data-k="quantity" style="border:none; border-right:1px solid #333;">Qty</button>
              <button class="cv-btn m-sort" data-k="type" style="border:none;">Type</button>
            </div>
            <select id="m-page-size" class="cv-btn" title="Items per page" aria-label="Items per page">
              <option value="12">12 / page</option>
              <option value="24">24 / page</option>
              <option value="48">48 / page</option>
            </select>
            <button id="m-reset" class="cv-btn" title="Clear filters">🔄 Reset</button>
          </div>
          <div style="display:flex; gap:.5rem;">
            <button id="open-level" class="cv-btn" title="Open Level Up blends">🧪 Level Upgrades</button>
            <button id="open-rotation" class="cv-btn" title="Open Slot Rotation blends">🌀 Slot Rotation</button>
          </div>
        </div>
      </div>

      <div class="cv-card" style="margin-bottom:1rem; padding:.9rem; background:linear-gradient(180deg,#111,#0c0c0c);">
        <div style="display:flex; gap:1rem; flex-wrap:wrap;">
          <div class="cv-item" style="flex:1 1 280px; min-width:280px;">
            <h4 style="margin:.2rem 0; color:#ffcc66;">🔺 Level Upgrader</h4>
            <p style="margin:.35rem 0 .2rem; color:#cfcfcf;">
              Use to elevate a Goblin to the <strong>next level</strong>.<br>
              <strong>Rule:</strong> must match the Goblin's <em>rarity</em> and <em>main specialty</em>.
            </p>
          </div>
          <div class="cv-item" style="flex:1 1 280px; min-width:280px;">
            <h4 style="margin:.2rem 0; color:#7ff6ff;">🌀 Slot Rotator</h4>
            <p style="margin:.35rem 0 .2rem; color:#cfcfcf;">
              Use to switch the Goblin to the <strong>next ability</strong> in the rotation.<br>
              Required ingredients and combinations are shown in the <em>Slot Rotation</em> blends section.
            </p>
          </div>
        </div>
      </div>

      <div id="mat-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:12px;"></div>
      <div id="mat-pagination" style="display:flex; gap:.4rem; justify-content:center; margin-top:.8rem;"></div>
    `;

    // CTA hooks to your blending UI (if present)
    const openBlend = (tab) => {
      if (typeof window.renderGoblinBlend === "function") {
        window.renderGoblinBlend();
        setTimeout(() => {
          if (tab === "level") document.getElementById("tab-level")?.click();
          if (tab === "rotation") document.getElementById("tab-rotation")?.click();
        }, 50);
      }
    };
    document.getElementById("open-level").addEventListener("click", () => openBlend("level"));
    document.getElementById("open-rotation").addEventListener("click", () => openBlend("rotation"));

    const state = { q: "", type: "", sortKey: "name", sortAsc: true, page: 1, pageSize: 12 };
    const el = {
      q: body.querySelector("#m-name"),
      type: body.querySelector("#m-type"),
      size: body.querySelector("#m-page-size"),
      reset: body.querySelector("#m-reset"),
      grid: body.querySelector("#mat-grid"),
      pager: body.querySelector("#mat-pagination"),
    };

    const apply = debounce(() => { state.page = 1; render(); }, 150);

    el.q.addEventListener("input", () => { state.q = el.q.value.trim().toLowerCase(); apply(); });
    el.q.addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
    el.type.addEventListener("change", () => { state.type = el.type.value; apply(); });
    el.size.addEventListener("change", () => { state.pageSize = Number(el.size.value) || 12; render(); });
    el.reset.addEventListener("click", () => {
      state.q = ""; el.q.value = "";
      state.type = ""; el.type.value = "";
      state.sortKey = "name"; state.sortAsc = true;
      state.page = 1; state.pageSize = 12;
      render();
    });
    body.querySelectorAll(".m-sort").forEach(b => {
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (state.sortKey === k) state.sortAsc = !state.sortAsc;
        else { state.sortKey = k; state.sortAsc = (k !== "quantity"); }
        render();
      });
    });

    function filt(list) {
      const q = state.q;
      const t = (state.type || "").toLowerCase();
      return list.filter(m => {
        const okQ = !q || String(m.name || "").toLowerCase().includes(q) || String(m.prettyType || "").toLowerCase().includes(q);
        const okT = !t || String(m.type || "").toLowerCase() === t;
        return okQ && okT;
      });
    }
    function sort(list) {
      const sk = state.sortKey, asc = state.sortAsc;
      return list.slice().sort((a, b) => {
        if (sk === "name") {
          const av = String(a.name || a.prettyType || "").toLowerCase();
          const bv = String(b.name || b.prettyType || "").toLowerCase();
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        if (sk === "quantity") {
          const av = Number(a.quantity || 0), bv = Number(b.quantity || 0);
          return asc ? (av - bv) : (bv - av);
        }
        if (sk === "type") {
          const av = String(a.prettyType || a.type || ""), bv = String(b.prettyType || b.type || "");
          return asc ? av.localeCompare(bv) : bv.localeCompare(av);
        }
        return 0;
      });
    }
    function paginate(list) {
      const start = (state.page - 1) * state.pageSize;
      return list.slice(start, start + state.pageSize);
    }
    function card(m) {
      const qty = Number(m.quantity || 1);
      const tip = `${m.prettyType || m.type} • Qty ${qty}\n${m.description || ""}`;
      return `
        <div class="cv-card ${getRarityBorderClass(m.rarity)}"
             style="padding:.85rem; border-radius:14px; display:flex; gap:.8rem; align-items:flex-start;"
             title="${esc(tip)}">
          <img src="${esc(m.img)}" alt="Material artwork" loading="lazy"
               style="width:82px; height:82px; border-radius:12px; object-fit:cover; outline:1px solid var(--cv-border); box-shadow:0 3px 10px rgba(0,0,0,.35);">
          <div style="flex:1 1 auto; min-width:0;">
            <div style="display:flex; align-items:center; gap:.5rem;">
              <strong style="color:#ffcc66; font-family:Orbitron,system-ui,sans-serif; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${esc(m.name || (m.prettyType || "Material"))}
              </strong>
              <span class="cv-badge" style="border-color:#20444a;background:linear-gradient(180deg,#152024,#0f1a1c);color:#7ff6ff;">
                ${esc(m.prettyType || m.type)}
              </span>
            </div>
            <div style="display:flex; gap:.5rem; flex-wrap:wrap; margin-top:.4rem;">
              <span class="cv-badge">Qty: ${qty}</span>
              ${m.template_id ? `<span class="cv-badge">Template #${esc(m.template_id)}</span>` : ``}
            </div>
            ${m.description ? `<div style="color:#c9c9c9; font-size:.9rem; margin-top:.5rem; opacity:.9;">${esc(m.description)}</div>` : ``}
          </div>
        </div>
      `;
    }
    function renderGrid(list) {
      el.grid.innerHTML = list.map(card).join("") || `<div class="cv-toast">No materials found.</div>`;
    }
    function renderPager(total) {
      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      state.page = Math.min(state.page, pages);
      el.pager.innerHTML = Array.from({ length: pages }).map((_, i) => {
        const p = i + 1;
        const on = p === state.page ? "background:#2a2a2a; color:#ffe600;" : "";
        return `<button data-p="${p}" class="cv-btn" style="padding:.35rem .7rem; ${on}">${p}</button>`;
      }).join("");
      el.pager.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          state.page = Number(b.dataset.p) || 1;
          render();
          el.grid.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
    function render() {
      const f = filt(materialsAgg);
      const s = sort(f);
      renderPager(s.length);
      renderGrid(paginate(s));
    }
    render();
  }

  // Tab switching
  function selectTab(which) {
    if (which === "goblins") {
      setActiveTabStyles("goblins");
      renderGoblinTab();
    } else {
      setActiveTabStyles("materials");
      renderMaterialsTab();
    }
  }
  tabG.addEventListener("click", () => selectTab("goblins"));
  tabM.addEventListener("click", () => selectTab("materials"));

  // Default tab
  selectTab("goblins");
}

/* =========================================================
   Dwarfs Cave — Full Rebuild (UX/UI/Perf tuned)
   - Single RAF loop (no multiple initializations)
   - Visibility-aware polling with cleanup
   - Perk speed reduced by 50%
   - Chest dedup + correct removal after claim
   - Robust error handling & safe DOM updates
   - Improved layout and proportions
   - Recent lists with dedup & capped length
   - No duplicate element IDs
   ========================================================= */

(() => {
  "use strict";

  // ========= CONFIG =========
  // Mostra il bottone "Copy to stream on Twitch" solo a questi WAX account
  const COPY_BTN_WHITELIST = new Set(
    ['agoscry4ever','welshdanft55','ksgbk.wam'].map(s => s.toLowerCase())
  );

  if (!window.BASE_URL) window.BASE_URL = "https://iamemanuele.pythonanywhere.com";
  const BASE_URL = window.BASE_URL;
  const GRID_COLS = 90;
  const GRID_ROWS = Math.round(GRID_COLS * 9 / 16); // ~51
  // Back-compat per codice che usa ancora GRID_SIZE:
  const GRID_SIZE = GRID_COLS;
  // === Retry state for /user_nfts ===
  let userNFTsLoaded = false;          // diventa true al primo successo
  let userNFTsRetryScheduled = false;  // garantisce UN SOLO retry per sessione/sezione
  
  function sectionIsStillMounted() {
    // evita update se l’utente è uscito dalla sezione
    return !!document.getElementById("goblin-content");
  }

  const GLOBAL_REFRESH_MS = 23000; // 23s
  const COMMAND_POLL_MS = 31000;   // 31s
  const MAX_RECENT_EXPEDITIONS = 10;
  const MAX_BONUS_ROWS = 10;        // visible rows in bonus list (excluding header)
  const DEBUG = false;
  // --- trail config ---
  const TRAIL_LEN = 16;        // quanti segmenti massimo
  const TRAIL_MIN_DIST = 0.6;  // distanza minima (in celle) per aggiungere un punto
  const MARGIN_PCT = 0.15; // 15% di distanza dai bordi

  function getBounds(){
    // coordinate in CELLE (non pixel)
    const minX = Math.floor(GRID_COLS * MARGIN_PCT);
    const maxX = Math.ceil(GRID_COLS * (1 - MARGIN_PCT)) - 1;
    const minY = Math.floor(GRID_ROWS * MARGIN_PCT);
    const maxY = Math.ceil(GRID_ROWS * (1 - MARGIN_PCT)) - 1;
    return { minX, maxX, minY, maxY };
  }
  // ========= CONFIG OVERLAY =========
  const QS = new URLSearchParams(location.search);
  const OVERLAY_MODE =
    /\/overlay\.html$/i.test(location.pathname)
    || QS.get('overlay') === '1'
    || (document.body && document.body.getAttribute('data-overlay') === '1');
  
  const READONLY = OVERLAY_MODE || QS.get('readonly') === '1';
  const OVERLAY_START_URL = (window.START_URL || `${location.origin}/madverse/start.html`);

  // === OBS/ROTATION/NON-TICKER ===
  const OBS_MODE  = QS.get('obs') === '1';
  const ROT_SECS  = Math.max(5, Number(QS.get('rot') || 12)); // default 12s
  const NOTICKER  = OBS_MODE || OVERLAY_MODE || QS.get('noticker') === '1';
// Reinforcement limit: +5 per each 900338 owned
const BASE_LIMIT = 50;
const MAX_LIMIT = 250;
const REINFORCEMENT_TEMPLATE_ID = "900338"; // <- align with backend
let reinforcementCount = 0;
let CURRENT_LIMIT = BASE_LIMIT;
// helper unico per leggere il cap corrente in modo sicuro
function getSendCap(){
  return Math.min(
    MAX_LIMIT,
    Number((window && window.CURRENT_LIMIT) || CURRENT_LIMIT || BASE_LIMIT) || BASE_LIMIT
  );
}

async function fetchReinforcementCount(wax) {
  if (!wax) return 0;
  try {
    const r = await API.post("/reinforcement_count", { wax_account: wax }, 10000);
    if (r?.ok && typeof r.data?.count === "number") return r.data.count;
  } catch (e) {
    console.warn("[reinforcement] backend count failed:", e);
  }
  return 0; // safe default
}

async function refreshCurrentLimit() {
  try {
    const wax = Cave?.user?.wax_account;
    if (!wax) return;
    reinforcementCount = await fetchReinforcementCount(wax);
    CURRENT_LIMIT = Math.min(MAX_LIMIT, BASE_LIMIT + (reinforcementCount * 5));

    // Reflect on UI
    const btnFirst = document.querySelector("#cv-select-50");
    const btnBest  = document.querySelector("#cv-select-best");
    if (btnFirst) btnFirst.textContent = `✅ First ${CURRENT_LIMIT}`;
    if (btnBest)  btnBest.textContent  = `🏆 Best ${CURRENT_LIMIT}`;
    // If you print a “Selected: x / limit” anywhere, update it too
    if (typeof updateSummary === "function") updateSummary();
  } catch (e) {
    console.warn("[reinforcement] unable to refresh limit", e);
  }
}
  // ========= STATE (single source of truth) =========
  const Cave = {
    canvas: null,
    lastAllExpeditions: [],
    ctx: null,
    rafId: null,
    running: false,
    dpr: 1,
    bgCache: null,
    bgCacheCtx: null,
    observers: { io: null, ro: null },  
    // griglia
    cell: 10, 
    cellX: 10, 
    cellY: 10,
    offsetX: 0,   // nuovo
    offsetY: 0,   // nuovo
    gridW: 0,     // nuovo
    gridH: 0,     // nuovo
  
    assets: {
      loaded: false,
      goblin: null,
      shovel: null,
      chest: null,
      bg: null,
      perks: { dragon: null, dwarf: null, skeleton: null, black_cat: null },
      //decor: { rock: null, skull: null, spider: null, bush: null },

    },
  
    goblins: [],
    perks: [],
    chests: new Map(),
    decors: [],
    // timers/intervals
    intervals: { global: null, globalCountdown: null, command: null, winners: null },

    // dedup sets
    recentExpKeys: new Set(),
    bonusKeys: new Set(),

    // visibility
    visible: !document.hidden,
    // ticker cache
    tickerRecent: [],
    tickerWinners: [],

    // user context provided by the app
    user: {
      wax_account: window.userData?.wax_account || "",
      user_id: window.userData?.userId || "",
      usx_token: window.userData?.usx_token || ""
    },

    // UI elements cache
    el: {
      container: null,
      toast: null,
      videoOrCanvas: null,
      globalList: null,
      recentList: null,
      bonusList: null,
      selectionSummary: null,
      goblinList: null,
      chestPerkBtn: null,
    }
  };
  const inFlightClaims = new Set(); // set di String(chest_id)
  
  // ========= UTILITIES =========
	const log = (...a) => { if (DEBUG) console.log("[CAVE]", ...a); };

  const qs = (s, r = document) => r.querySelector(s);
  const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const randInt = (lo, hi) => Math.floor(Math.random() * (hi - lo + 1)) + lo;
  const safe = (v) => {
    if (v == null) return "";
    return String(v).replace(/[&<>"'`]/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;"
    }[m]));
  };

  // === Index NFT e normalizzazione attributi ===
Cave.nftIndex = new Map();   // asset_id (string) -> NFT intero

function toNumber(x){
  if (x == null) return 0;
  if (typeof x === 'number' && Number.isFinite(x)) return x;
  // estrae la prima cifra dal testo (gestisce "12", "12.5", "12%", " +12 ")
  const m = String(x).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** Ritorna un attributo numerico provando vari percorsi/casi.
 *  Esempi chiave: 'resistance', 'loot_hungry' (o 'loothungry'), 'speed', 'accuracy'
 */
function getStat(nft, key){
  if (!nft) return 0;

  const tryKeys = [key];
  // alias comuni
  if (key === 'loot_hungry') tryKeys.push('loothungry','lootHungry','loot-hungry');
  if (key === 'resistance') tryKeys.push('resist','stamina');

  // 1) livello piatto
  for (const k of tryKeys){
    if (nft[k] != null) return toNumber(nft[k]);
  }

  // 2) oggetti annidati tipici
  const buckets = [nft.attributes, nft.attrs, nft.stats, nft.data, nft.mutable_data, nft.immutable_data];
  for (const b of buckets){
    if (!b) continue;
    // a) come mappa
    for (const k of tryKeys){
      if (b && typeof b === 'object' && !Array.isArray(b) && b[k] != null) return toNumber(b[k]);
    }
    // b) come array [{trait_type,value}] (AtomicAssets-like)
    if (Array.isArray(b)){
      for (const ent of b){
        const trait = String(ent.trait_type || ent.trait || ent.key || '').toLowerCase();
        if (tryKeys.some(k => k.toLowerCase() === trait)){
          return toNumber(ent.value ?? ent.val);
        }
      }
    }
  }
  return 0;
}

/** Somma attributi per una lista di asset_id */
function sumExpeditionStats(assetIds = []){
  const sums = { resistance:0, loot_hungry:0, speed:0, accuracy:0 };
  assetIds.forEach(id => {
    const nft = Cave.nftIndex.get(String(id));
    if (!nft) return;
    sums.resistance  += getStat(nft, 'resistance');
    sums.loot_hungry += getStat(nft, 'loot_hungry');
    sums.speed       += getStat(nft, 'speed');
    sums.accuracy    += getStat(nft, 'accuracy');
  });
  return sums;
}

  function rarityBg(r="") {
    const k = String(r).toLowerCase();
    return ({
      common:"#202225", uncommon:"#15341d", rare:"#0d263a",
      epic:"#2a0f33", legendary:"#332406", mythic:"#33170a"
    }[k] || "#1a1a1a");
  }
  function rarityFg(r="") {
    const k = String(r).toLowerCase();
    return ({
      common:"#c9d1d9", uncommon:"#4ade80", rare:"#60a5fa",
      epic:"#c084fc", legendary:"#fbbf24", mythic:"#fb923c"
    }[k] || "#e5e7eb");
  }
  function rarityBorder(r="") {
    const k = String(r).toLowerCase();
    return ({
      common:"#2f3238", uncommon:"#2a5e39", rare:"#1f3e5f",
      epic:"#4a1f59", legendary:"#5b4715", mythic:"#5a2b17"
    }[k] || "#2a2a2a");
  }
  
  const timeHM = (d = new Date()) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // numeri compatti: 12500 -> 12.5k, 1000000 -> 1.0M
  function fmtNumCompact(n){
    n = Number(n||0);
    if (n < 1000) return String(n);
    if (n < 10000) return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
    if (n < 1000000) return Math.round(n/1000) + 'k';
    if (n < 10000000) return (n/1e6).toFixed(1).replace(/\.0$/,'') + 'M';
    return Math.round(n/1e6) + 'M';
  }
  
  // estrai i totali dal payload di all_expeditions (fallback su goblins[])
  function totalsFromExpeditionItem(e){
    // helper: legge il primo campo disponibile tra i nomi indicati (case-insensitive)
    const pick = (obj, names) => {
      if (!obj) return 0;
      for (const n of names){
        if (obj[n] != null) return toNumber(obj[n]);
        const kk = Object.keys(obj).find(k => k.toLowerCase() === String(n).toLowerCase());
        if (kk && obj[kk] != null) return toNumber(obj[kk]);
      }
      return 0;
    };
  
    // 1) preferisci i totali già calcolati dal backend (supporta alias)
    const src = e?.stats_totals || e?.attr_totals || e?.totals || e?.stats || null;
    if (src){
      return {
        res:  pick(src, ['resistance','res','R']),
        loot: pick(src, ['loot_hungry','loothungry','loot','L']),
        spd:  pick(src, ['speed','spd','S']),
        acc:  pick(src, ['accuracy','acc','A']),
      };
    }
  
    // 2) fallback: somma da e.goblins (senza MAI usare user_nfts)
    const gl = Array.isArray(e?.goblins) ? e.goblins : [];
    if (gl.length){
      return gl.reduce((a,g)=>{
        const A = g?.attributes || g?.attr || g?.stats || g || {};
        a.res  += pick(A, ['resistance','res','R']);
        a.loot += pick(A, ['loot_hungry','loothungry','loot','L']);
        a.spd  += pick(A, ['speed','spd','S']);
        a.acc  += pick(A, ['accuracy','acc','A']);
        return a;
      }, {res:0, loot:0, spd:0, acc:0});
    }
  
    // 3) niente dati → zeri
    return {res:0, loot:0, spd:0, acc:0};
  }



  function styleOnce() {
    if (qs("#cave-rebuilt-style")) return;
    const st = document.createElement("style");
    st.id = "cave-rebuilt-style";
    st.textContent = `
      :root{
        --cv-bg:#111; --cv-elev:#1a1a1a; --cv-border:#2b2b2b; --cv-soft:#141414;
        --cv-amber:#ffcc66; --cv-cyan:#7ff6ff; --cv-green:#78ff78; --cv-chip:#ffe600;
      }
    
      .cv-card{ background:var(--cv-bg); border-radius:14px; padding:1rem; color:#fff;
                box-shadow:0 0 12px rgba(0,255,255,.24); border:1px solid var(--cv-border); }
      .cv-card--amber{ box-shadow:0 0 12px rgba(255,165,0,.24); }
      .cv-card--green{ box-shadow:0 0 12px rgba(0,255,0,.24); }
      .cv-title{ color:var(--cv-chip); font-family: Orbitron, system-ui, sans-serif; margin:0 0 .5rem 0; }
    
      .cv-btn{ background:#1c1c1c; border:1px solid #444; color:var(--cv-chip);
               padding:.5rem .75rem; border-radius:10px; cursor:pointer; }
      .cv-btn:disabled{ opacity:.6; cursor:not-allowed; }
    
      .cv-toast{ margin:.5rem 0; padding:.8rem; background:#222; border-left:5px solid #0ff;
                 border-radius:8px; color:#fff; font-family:Orbitron, system-ui, sans-serif; }
      .cv-toast.ok{ border-left-color:#0f0; } .cv-toast.warn{ border-left-color:#ffa500; }
      .cv-toast.err{ border-left-color:#ff4d4d; }
    
      /* Utilities */
      .cv-row{ display:flex; align-items:center; justify-content:space-between; gap:.6rem; }
      .cv-soft-sep{ height:1px; background:rgba(255,255,255,.06); margin:.45rem 0; }
      .cv-badge{ display:inline-flex; align-items:center; gap:.35rem; font-size:.72rem;
                 padding:.18rem .55rem; border-radius:999px; border:1px solid #2a7f2a;
                 background:linear-gradient(180deg,#173e17,#0f2a0f); color:#9dff9d;
                 box-shadow:0 0 10px rgba(0,255,0,.12); }
      .cv-time{ font-size:.78rem; color:#b7ffb7; opacity:.85; }
      .cv-chip-key{ font-size:.78rem; color:#9aa0a6; letter-spacing:.3px; }
      .cv-chip-val{ font-weight:800; color:#eaeaea; }
      .cv-pill{ flex:1 1 0; background:#131313; border:1px solid var(--cv-border);
                border-radius:10px; padding:.35rem .55rem; }
      .cv-meter{ flex:1 1 auto; background:#141414; border:1px solid var(--cv-border);
                 border-radius:999px; height:9px; overflow:hidden; }
      .cv-meter > div{ height:100%; background:linear-gradient(90deg,#ffe600,#ff9d00);
                       box-shadow:inset 0 0 10px rgba(255,255,255,.25), 0 0 8px rgba(255,214,0,.35); }
                       
      /* --- Goblin card: prevent overflow, allow wrapping --- */
      .cv-gob-card,
      .cv-gob-card * { box-sizing: border-box; }
      
      .cv-gob-card { overflow: hidden; } /* contiene ribbon e qualsiasi assoluto */
      .cv-gob-card .cv-name { overflow-wrap: anywhere; word-break: break-word; }
      
      /* riga dei “pill” che può andare a capo senza uscire dalla card */
      .cv-gob-pillrow { display:flex; flex-wrap:wrap; gap:.45rem; }
      .cv-gob-pillrow .cv-pill { min-width:110px; flex:1 1 110px; }
          
      /* Grid helpers */
      .cv-cards{ display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:.75rem; align-items:stretch; }
      .cv-item{ background:var(--cv-elev); border:1px solid var(--cv-border); border-radius:12px; padding:.7rem .8rem; }
      .cv-item .cv-when{ opacity:.8; font-size:.9rem; }
      .cv-item .cv-line{ margin-top:.35rem; }
      
      /* --- Title row: keep name + rarity on one line --- */
      .cv-gob-head{ display:flex; align-items:center; gap:.5rem; min-width:0; }
      .cv-gob-head .cv-name{
        flex:1 1 auto; min-width:0;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        overflow-wrap:normal; word-break:normal;   /* override del precedente */
      }
      .cv-gob-head .cv-rarity{ flex:0 0 auto; white-space:nowrap; }

      /* Bonus grid: 30% più compatto rispetto a prima (230px -> ~160px) */
      #cv-bonus-grid{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
                      gap:.65rem; align-items:stretch; }
    
      /* Rarity tag */
      .cv-rarity{ font-size:.72rem; padding:.16rem .55rem; border-radius:999px;
                  border:1px solid #333; box-shadow:0 0 10px rgba(255,255,255,.05), inset 0 0 8px rgba(255,255,255,.06); }
    
      /* Compact card layout for “recent expeditions” */
      .cv-compact{ display:flex; flex-direction:column; gap:.35rem; padding:.65rem .7rem; border-radius:12px;
                   background:linear-gradient(180deg,#141414,#0f0f0f); border:1px solid var(--cv-border);
                   box-shadow:0 2px 8px rgba(0,0,0,.35); }
      .cv-compact .cv-head{ display:flex; align-items:center; justify-content:space-between; gap:.5rem; }
      .cv-compact .cv-name{ color:var(--cv-chip); font-weight:700; font-size:.95rem; max-width:60%;
                            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .cv-kv{ display:flex; gap:.45rem; }
      .cv-kv .kv{ flex:1 1 0; background:#0f0f0f; border:1px solid var(--cv-border); border-radius:10px; padding:.35rem .5rem; }
      .kv .k{ font-size:.72rem; color:#9aa0a6; } .kv .v{ font-weight:800; font-size:1.02rem; }
    
      @keyframes flick {
        0%{ box-shadow:0 0 15px #ffb800, inset 0 0 6px #ffa500; opacity:0.95; }
        100%{ box-shadow:0 0 35px #ffcc00, inset 0 0 14px #ffcc00; opacity:1; }
      }
      #cv-summary{
        position: sticky; bottom: 12px; z-index: 40;
        backdrop-filter: blur(6px);
        background: linear-gradient(180deg, rgba(20,20,20,.9), rgba(12,12,12,.9));
        border: 1px solid var(--cv-border);
        box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      .cv-skel{
        position:relative; overflow:hidden;
        background:#141414; border:1px solid var(--cv-border); border-radius:12px;
      }
      .cv-skel::after{
        content:""; position:absolute; inset:0;
        background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent);
        transform:translateX(-100%); animation:skel 1.2s infinite;
      }
      @keyframes skel{ to { transform:translateX(100%);} }
      .cv-btn:focus-visible,
      .cv-gob-card:focus-visible{
        outline:2px solid var(--cv-chip); outline-offset:2px;
      }
      @media (prefers-reduced-motion: reduce){
        *{ transition:none !important; animation:none !important; }
      }
      /* --- Overlay ticker (marquee) --- */
      #cv-ticker{
        position:absolute; left:0; right:0; bottom:0; height:60px;
        background:linear-gradient(180deg, rgba(0,0,0,.6), rgba(0,0,0,.85));
        border-top:1px solid rgba(255,255,255,.08);
        overflow:hidden; pointer-events:none;
        display:flex; flex-direction:column; gap:2px; padding:2px 0;
      }
      #cv-ticker .row{
        flex:1 1 0; overflow:hidden;
      }
      #cv-ticker .track{
        display:flex; gap:2rem; white-space:nowrap; will-change:transform;
        animation:cv-marquee linear infinite;
        padding:0 .75rem;
      }
      #cv-ticker .item{
        font-family:Orbitron, system-ui, sans-serif;
        font-size:.9rem;
        color:#ffe600; /* fallback */
        text-shadow:0 1px 2px rgba(0,0,0,.6);
        display:inline-flex; align-items:center; gap:.35rem;
      }
      #cv-ticker .dot{ opacity:.4; margin:0 .65rem; }
      
      /* palette tokenizzata per elementi */
      #cv-ticker .tk-user{ font-weight:900; filter:drop-shadow(0 0 6px rgba(255,255,255,.08)); }
      #cv-ticker .tk-chips{ color:#78ff78; font-weight:800; }
      #cv-ticker .tk-nfts{ color:#ffb74d; font-weight:800; }
      #cv-ticker .tk-goblins{ color:#7dd3fc; }
      #cv-ticker .tk-timer{ color:#a7f3d0; }
      
      /* attributi */
      #cv-ticker .tk-R{ color:#f87171; }
      #cv-ticker .tk-L{ color:#fde047; }
      #cv-ticker .tk-S{ color:#60a5fa; }
      #cv-ticker .tk-A{ color:#c084fc; }
      /* pill dei totali attributi: colori e wrapping */
      .cv-attr-grid .cv-chip-val{ white-space:normal; } /* consenti capo riga in card strette */
      
      .cv-pill.attr-R{ border-color:#4c1e1e; background:linear-gradient(180deg,#1b0d0d,#130909); }
      .cv-pill.attr-L{ border-color:#4a3a12; background:linear-gradient(180deg,#2a2211,#1c160a); }
      .cv-pill.attr-S{ border-color:#0f3a4a; background:linear-gradient(180deg,#0f1a1c,#0a1214); }
      .cv-pill.attr-A{ border-color:#3a124a; background:linear-gradient(180deg,#1a0f1c,#120a14); }
      
      .cv-pill.attr-R .cv-chip-key{ color:#fca5a5; }
      .cv-pill.attr-L .cv-chip-key{ color:#fde68a; }
      .cv-pill.attr-S .cv-chip-key{ color:#7dd3fc; }
      .cv-pill.attr-A .cv-chip-key{ color:#d8b4fe; }

      @keyframes cv-marquee{
        from{ transform:translateX(0) }
        to  { transform:translateX(-50%) }
      }
      .cv-pill{ min-width:0; }
      .cv-chip-val{
        font-weight:800; color:#eaeaea;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        font-size: clamp(.78rem, 2.1vw, .95rem); /* evita di “uscire a destra” */
      }
      
      /* === Goblin DeX — Canvas Logo (top bar) === */
      .cv-logo-wrap{
        position:relative; margin:-.25rem 0 .5rem 0; height:120px;
        display:flex; align-items:flex-end; justify-content:center; overflow:visible;
      }
      #cv-logo-canvas{
        width:100%; height:100%; display:block;
        filter:drop-shadow(0 8px 18px rgba(0,0,0,.45));
        animation:logoDrop .9s cubic-bezier(.25,1.25,.35,1) 1 both;
      }
      .cv-logo-toast{
        position:absolute; bottom:6px; left:50%; transform:translateX(-50%);
        pointer-events:none; color:#fff; font-family:Orbitron,system-ui,sans-serif; font-weight:900;
        text-shadow:0 2px 10px rgba(0,0,0,.8), 0 0 18px rgba(255,230,0,.55);
        white-space:nowrap; opacity:0; font-size: clamp(.9rem, 2.2vw, 1.2rem);
      }
      .cv-logo-toast.show{
        animation:popIn .25s ease-out forwards, messageGlow 1.8s ease-in-out 3 alternate;
      }
      @keyframes logoDrop{
        0%{ transform:translateY(-140px) scale(1.04) rotate(-2deg); opacity:.0 }
        70%{ transform:translateY(8px) scale(1.0) rotate(0deg); opacity:1 }
        100%{ transform:translateY(0) }
      }
      @keyframes popIn{
        from{ transform:translate(-50%,15px) scale(.85); opacity:0 }
        to  { transform:translate(-50%,0)   scale(1);    opacity:1 }
      }
      @keyframes messageGlow{
        0%  { text-shadow:0 2px 10px rgba(0,0,0,.8), 0 0 8px rgba(255,230,0,.35) }
        100%{ text-shadow:0 2px 10px rgba(0,0,0,.8), 0 0 24px rgba(0,255,170,.75), 0 0 40px rgba(0,160,255,.45) }
      }
      
      #cv-right { min-height: 420px; }
      #cv-rotator .cv-rot-panel { will-change: opacity; }
    `;
    document.head.appendChild(st);
  }

  function clearCanvas() {
    const { ctx, canvas } = Cave;
    // azzera la trasformazione per pulire in pixel nativi
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore(); // ripristina la trasformazione HiDPI impostata in resizeCanvas()
  }

  function hexToRgba(hex, alpha = 1) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "#ffe600");
    const r = m ? parseInt(m[1], 16) : 255;
    const g = m ? parseInt(m[2], 16) : 230;
    const b = m ? parseInt(m[3], 16) : 0;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  const toastCache = new Map(); // msg -> timestamp (per anti-flood)

  function toast(msg, type = "ok", ttl = 6000) {
    const now = Date.now();
    const last = toastCache.get(msg) || 0;
    if (now - last < 1200) return; // evita flood dello stesso messaggio in <1.2s
    toastCache.set(msg, now);
  
    const host = Cave.el.toast;
    if (!host) return;
    const div = document.createElement("div");
    div.className = `cv-toast ${type}`;
    div.textContent = msg;
    host.appendChild(div);
    setTimeout(() => div.remove(), ttl);
  }

  
  function renderSkeletons(hostSel, count=6, height=74){
    const host = qs(hostSel); if(!host) return;
    host.innerHTML = Array.from({length:count})
      .map(()=> `<div class="cv-skel" style="height:${height}px; margin-bottom:.6rem;"></div>`).join("");
  }
    
  function syncUserInto(caveUser) {
    const mem = window.userData || JSON.parse(localStorage.getItem('userData') || '{}');
    caveUser.wax_account = mem?.wax_account || "";
    caveUser.user_id     = (mem?.user_id ?? mem?.userId) || "";  // accetta entrambe, preferisci userId
    caveUser.usx_token   = mem?.usx_token || "";
  }
  
  function assertAuthOrThrow(caveUser) {
    if (!caveUser.wax_account || !caveUser.user_id || !caveUser.usx_token) {
      throw new Error("Missing auth data. Please log in.");
    }
  }

  // fetch helpers with timeout
  async function fetchJSON(url, opts = {}, timeout = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort("timeout"), timeout); // 👈 reason
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      const text = await res.text();
      let data;
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      if (err?.name === "AbortError") {
        // risposta standardizzata per i caller
        return { ok: false, status: 499, aborted: true, data: { error: "timeout" } };
      }
      throw err;
    } finally {
      clearTimeout(t);
    }
  }


  const API = {
    post: (path, body, t=15000) =>
      fetchJSON(`${BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body||{}) }, t),
    get: (path, t=15000) =>
      fetchJSON(`${BASE_URL}${path}`, {}, t),
  };
  async function fetchUserNFTsOnce(timeoutMs = 15000) {
    syncUserInto(Cave.user);
    assertAuthOrThrow(Cave.user);
    const payload = {
      wax_account: Cave.user.wax_account,
      user_id: Cave.user.user_id,
      usx_token: Cave.user.usx_token
    };
    return API.post("/user_nfts", payload, timeoutMs);
  }


  // Chiama /user_nfts; se fallisce, schedula UN SOLO retry tra 10s.
  // Al successo, chiama hydrateGoblinUI(data) e blocca altri retry finché la sezione non viene ricaricata.
async function loadUserNFTsWithSingleRetry() {
  try {
    const r = await fetchUserNFTsOnce(15000);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    // accetta sia array puro sia eventuali wrappaggi futuri { nfts:[...] }
    const data = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.nfts) ? r.data.nfts : []);
    if (!sectionIsStillMounted()) return;

    userNFTsLoaded = true;
    document.dispatchEvent(new CustomEvent('cv:userdata-maybe-updated'));
    hydrateGoblinUI(data);
  } catch (err) {
    if (!userNFTsRetryScheduled) {
      userNFTsRetryScheduled = true;
      toast("⚠️ Goblins not loaded, i will retry again in 10s…", "warn", 4000);
      setTimeout(async () => {
        if (userNFTsLoaded || !sectionIsStillMounted()) return;
        try {
          const r2 = await fetchUserNFTsOnce(20000);
          // stesso trattamento shape-agnostic del primo tentativo
          const ok = !!r2?.ok;
          const data2 = ok
            ? (Array.isArray(r2.data) ? r2.data : (Array.isArray(r2.data?.nfts) ? r2.data.nfts : []))
            : [];
          if (ok && Array.isArray(data2) && sectionIsStillMounted()) {
            userNFTsLoaded = true;
            document.dispatchEvent(new CustomEvent('cv:userdata-maybe-updated'));
            hydrateGoblinUI(data2);
            toast("✅ Goblins loaded", "ok", 2500);
          } else {
            toast("❌ Goblins not available at the moment. Please reload the page.", "err", 4000);
          }
        } catch (e2) {
          if (sectionIsStillMounted()) toast("❌ Goblins not available at the moment.", "err", 4000);
        }
      }, 10000);
    }
  }
}


  // ========= ASSETS =========
  function loadImg(src) {
    return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
  }
  async function loadAssets() {
    if (Cave.assets.loaded) return;
    const [goblin, shovel, chest, bg, dragon, dwarf, skeleton, black_cat] = await Promise.all([
      loadImg("goblin.png"),
      loadImg("shovel_sprite.png"),
      loadImg("chest.png"),
      loadImg("cave-grid.gif"),
      loadImg("perk_dragon.png"),
      loadImg("perk_dwarf.png"),
      loadImg("perk_skeleton.png"),
      loadImg("perk_blackcat.png")
    ]);
      //loadImg("rock.png"),
      //loadImg("skull.png"),
      //loadImg("spider.png"),
      //loadImg("bush.png")        
    Cave.assets.goblin = goblin;
    Cave.assets.shovel = shovel;
    Cave.assets.chest = chest;
    Cave.assets.bg = bg;
    Cave.assets.perks.dragon = dragon;
    Cave.assets.perks.dwarf = dwarf;
    Cave.assets.perks.skeleton = skeleton;
    Cave.assets.perks.black_cat = black_cat;
    // Cave.assets.decor = { rock, skull, spider, bush };
    Cave.assets.loaded = true;

    // costruisci cache se il canvas è già pronto
    buildBGCache();
  }
  
  function buildBGCache(){
    if (!Cave.canvas || !Cave.assets.bg?.complete) return;
    const w = Math.max(1, Math.floor(Cave.gridW));
    const h = Math.max(1, Math.floor(Cave.gridH));
  
    // usa OffscreenCanvas se disponibile
    try{
      const can = ('OffscreenCanvas' in window) ? new OffscreenCanvas(w, h) : document.createElement('canvas');
      can.width = w; can.height = h;
      const cx = can.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(Cave.assets.bg, 0, 0, Cave.assets.bg.width, Cave.assets.bg.height, 0, 0, w, h);
      Cave.bgCache = can;
      Cave.bgCacheCtx = cx;
    }catch{ Cave.bgCache = null; Cave.bgCacheCtx = null; }
  }

    function initDecorations() {
    Cave.decors = [];
    const pack = Cave.assets.decor || {};
    // prendi solo quelle effettivamente caricate
    const entries = Object.entries(pack).filter(([_, img]) => img && img.complete);
    if (!entries.length) return;
  
    const { minX, maxX, minY, maxY } = getBounds();
  
    const COUNT_PER_TYPE = 6;    // quante per tipo (regola a piacere)
    const FRAME_DELAY    = 12;   // velocità animazione (tick)
    for (const [type, image] of entries) {
      for (let i = 0; i < COUNT_PER_TYPE; i++) {
        const x = randInt(minX, maxX);
        const y = randInt(minY, maxY);
        Cave.decors.push({
          type,
          image,
          frames: 2,
          frame: 0,
          tick: 0,
          frameDelay: FRAME_DELAY,
          x, y
        });
      }
    }
  }

  function drawDecorations() {
    if (!Cave.decors || !Cave.decors.length) return;
  
    const destSize = 16; // 16x16 pixel sul canvas
    const { ctx } = Cave;
  
    for (const d of Cave.decors) {
      if (!d.image?.complete) continue;
  
      // avanza frame
      d.tick++;
      if (d.tick >= d.frameDelay) {
        d.tick = 0;
        d.frame = (d.frame + 1) % d.frames;
      }
  
      const srcW = d.image.width / d.frames; // 4 frame affiancati orizzontali
      const srcH = d.image.height;           // atteso 16
      const sx   = Math.floor(d.frame) * srcW;
  
      // posiziona al centro della cella (in px canvas)
      const dx = Cave.offsetX + d.x * Cave.cellX - destSize / 2;
      const dy = Cave.offsetY + d.y * Cave.cellY - destSize / 2;
  
      ctx.drawImage(d.image, sx, 0, srcW, srcH, dx, dy, destSize, destSize);
    }
  }
  
  function handleRealtimeMessage(msg){
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "chest_spawned") {
      const { minX, maxX, minY, maxY } = getBounds();
      upsertChest({
        id: String(msg.chest_id),
        x: clamp(msg.x, minX, maxX),
        y: clamp(msg.y, minY, maxY),
        from: msg.perk_type || "unknown",
        wax_account: msg.wax_account || "",
        taken: false, claimable: true, pending: false
      });
      toast(`Chest #${msg.chest_id} spawned by ${msg.wax_account}`, "ok");
    }
    if (msg.type === "chest_claimed") {
      Cave.chests.delete(String(msg.chest_id));
      toast(`Chest #${msg.chest_id} claimed by ${msg.claimed_by}`, "warn");
    }
  }
  
  let _pollTimer = null, _lastEventId = 0;
  
  function startRealtimePolling(){
    if (_pollTimer) return;
    const FRONT_BUILD = window.__FRONT_BUILD__ || "dev";
    const poll = async () => {
      try {
        const r = await fetch(`${BASE_URL}/events/poll?since=${_lastEventId}`, { method:"GET" });
        const j = await r.json();
        if (Array.isArray(j.events)) {
          for (const e of j.events) handleRealtimeMessage(e);
        }
        _lastEventId = j.next_id || _lastEventId;
      } catch(_) {}
      _pollTimer = setTimeout(poll, 4000);
    };
    _pollTimer = setTimeout(poll, 0);
  }
  
  function stopRealtimePolling(){
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  }
  
  function initRealtimeSSE(){
    if (Cave._es) return;
    try {
      const FRONT_BUILD = window.__FRONT_BUILD__ || "dev";
      const es = new EventSource(`${BASE_URL}/events?cv=${encodeURIComponent(FRONT_BUILD)}`);
      es.onopen = () => log("SSE connected");
      es.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        handleRealtimeMessage(msg);
      };
      es.onerror = (ev) => { log("SSE error/reconnect", ev); };
      Cave._es = es;
      window.addEventListener("beforeunload", () => es.close(), { once: true });
    } catch (e) { log("SSE init failed", e); }
  }
  
  function closeRealtimeSSE(){
    if (Cave._es) { try { Cave._es.close(); } catch {} Cave._es = null; }
  }
  
  function bootRealtime(){
    const isOverlay = !!(window.CAVE_OVERLAY || document.body?.getAttribute('data-overlay') === '1');
    if (isOverlay || document.hidden) {
      closeRealtimeSSE();
      startRealtimePolling();
    } else {
      stopRealtimePolling();
      initRealtimeSSE();
    }
  }

  // ========= CANVAS =========
  function setupCanvas(c) {
    Cave.canvas = c;
    Cave.ctx = c.getContext("2d");
    resizeCanvas();
    observeCanvasVisibility();
    observeContainerResize();
    window.addEventListener("resize", resizeCanvas, { passive: true });
  }
  function teardownCanvas() {
    window.removeEventListener("resize", resizeCanvas);
    Cave.canvas = null;
    Cave.ctx = null;
    Cave.observers.io?.disconnect?.();
    Cave.observers.ro?.disconnect?.();
    Cave.observers.io = null;
    Cave.observers.ro = null;
  }
  function observeCanvasVisibility(){
    if (!('IntersectionObserver' in window) || !Cave.canvas) return;
    Cave.observers.io?.disconnect?.();
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
       if (e.isIntersecting){
         startRAF(); startCommandPolling(); bootRealtime();
       } else {
         stopRAF(); stopCommandPolling();
         // chiudi canale realtime se esce dal viewport
         stopRealtimePolling?.();   // se hai implementato il polling
         closeRealtimeSSE?.();      // se l’SSE è attivo
       }
      });
    }, { root: null, threshold: 0.01 });
    io.observe(Cave.canvas);
    Cave.observers.io = io;
  }
  
  function observeContainerResize(){
    const host = Cave.canvas?.parentElement;
    if (!('ResizeObserver' in window) || !host) return;
    Cave.observers.ro?.disconnect?.();
    const ro = new ResizeObserver(()=> resizeCanvas());
    ro.observe(host);
    Cave.observers.ro = ro;
  }

  function observeContainerRemoval(){
    const mo = new MutationObserver(()=>{
      if(!document.getElementById("goblin-content")){
        stopRAF();
        stopCommandPolling();
        if (Cave.intervals.global){ clearInterval(Cave.intervals.global); Cave.intervals.global = null; }
        if (Cave.intervals.globalCountdown){ clearInterval(Cave.intervals.globalCountdown); Cave.intervals.globalCountdown = null; }
        if (Cave._es) { try { Cave._es.close(); } catch {} Cave._es = null; }
        userNFTsLoaded = false;
        userNFTsRetryScheduled = false;
        teardownCanvas();
        mo.disconnect();
      }
    });
    mo.observe(document.body, {childList:true, subtree:true});
  }
    
function resizeCanvas() {
  const c = Cave.canvas;
  if (!c || !c.parentElement) return;

  const cssW = c.parentElement.clientWidth;
  const cssH = Math.floor(cssW * 9 / 16);
  const dpr  = Cave.dpr;

  // dimensioni CSS
  c.style.width  = `${cssW}px`;
  c.style.height = `${cssH}px`;

  // dimensioni interne (pixel reali)
  c.width  = Math.floor(cssW * dpr);
  c.height = Math.floor(cssH * dpr);

  // HiDPI + smoothing off
  const ctx = Cave.ctx;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.imageSmoothingQuality = "low";

  // la griglia ora riempie il canvas 16:9
  Cave.gridW  = cssW;
  Cave.gridH  = cssH;
  Cave.offsetX = 0;
  Cave.offsetY = 0;

  // celle non quadrate
  Cave.cellX = Cave.gridW / GRID_COLS;
  Cave.cellY = Cave.gridH / GRID_ROWS;

  // compat (usa il min per scale sprite/testi)
  Cave.cell  = Math.min(Cave.cellX, Cave.cellY);

  // ricostruisci la cache dello sfondo
  buildBGCache();
}


  function startRAF() {
    if (Cave.running || !Cave.canvas) return;
    Cave.running = true;
    lastTS = performance.now();
    Cave.rafId = requestAnimationFrame(tick);
  }
  function stopRAF() {
    Cave.running = false;
    if (Cave.rafId) cancelAnimationFrame(Cave.rafId);
    Cave.rafId = null;
  }

  // ========= LOGO CANVAS (title "Goblin DeX") =========
Cave.logo = {
  canvas: null, ctx: null, dpr: Math.max(1, window.devicePixelRatio||1),
  rafId: null, running: false, w: 0, h: 0, baseY: 0,
  title: 'GOblin DeX',
  eyes: { next: performance.now() + 1000 + Math.random()*2000, t:0, closing:false },
  eyes2:{ next: performance.now() +  800 + Math.random()*2200, t:0, closing:false },
  goblins: []
};

function setupLogoCanvas(c){
  Cave.logo.canvas = c;
  Cave.logo.ctx = c.getContext('2d');
  resizeLogoCanvas();
  window.addEventListener('resize', resizeLogoCanvas, { passive:true });
  startLogoRAF();
}
function resizeLogoCanvas(){
  const c = Cave.logo.canvas; if(!c || !c.parentElement) return;
  const cssW = c.parentElement.clientWidth, cssH = 120;
  const dpr = Cave.logo.dpr = Math.max(1, window.devicePixelRatio||1);
  c.style.width = cssW+'px'; c.style.height = cssH+'px';
  c.width = Math.floor(cssW*dpr); c.height = Math.floor(cssH*dpr);
  const ctx = Cave.logo.ctx; ctx.setTransform(dpr,0,0,dpr,0,0); ctx.imageSmoothingEnabled = false;
  Cave.logo.w = cssW; Cave.logo.h = cssH; Cave.logo.baseY = Math.round(cssH * 0.68);
}
function startLogoRAF(){ if (Cave.logo.running) return; Cave.logo.running = true; logoLast = performance.now(); requestAnimationFrame(logoTick); }
function stopLogoRAF(){ Cave.logo.running = false; if (Cave.logo.rafId) cancelAnimationFrame(Cave.logo.rafId); Cave.logo.rafId = null; }

let logoLast = performance.now();
function logoTick(ts){
  if (!Cave.logo.running) return;
  const dt = ts - logoLast; logoLast = ts;
  drawLogo(dt);
  Cave.logo.rafId = requestAnimationFrame(logoTick);
}

function drawLogo(dt){
  const { ctx } = Cave.logo; if(!ctx) return;
  const w=Cave.logo.w, h=Cave.logo.h; ctx.clearRect(0,0,w,h);

  // sottile fascia luminosa di sfondo
  const gbg = ctx.createLinearGradient(0,0,0,h);
  gbg.addColorStop(0,'rgba(255,255,255,.02)'); gbg.addColorStop(1,'rgba(0,0,0,.0)');
  ctx.fillStyle = gbg; ctx.fillRect(0,0,w,h);

  // Titolo stilizzato
  const title = Cave.logo.title;
  ctx.save();
  ctx.font = '900 64px Orbitron, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const centerX = w/2, baseY = Cave.logo.baseY;

  const grad = ctx.createLinearGradient(0, baseY-50, 0, baseY+18);
  grad.addColorStop(0, '#fff2a8'); grad.addColorStop(.35,'#ffd34d'); grad.addColorStop(.7,'#c58a0a'); grad.addColorStop(1,'#6b4700');
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.fillStyle  = grad;
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
  ctx.fillText(title, centerX, baseY);
  ctx.shadowColor = 'transparent';
  ctx.strokeText(title, centerX, baseY);

  // Occhi nell' "O" (se non presente, usa la "o")
  const idxO = title.indexOf('O') >= 0 ? title.indexOf('O') : title.indexOf('o');
  const pre  = title.slice(0, Math.max(0, idxO));
  const wFull = ctx.measureText(title).width;
  const wPre  = ctx.measureText(pre).width;
  const wCh   = ctx.measureText(title[idxO] || 'o').width;
  const oCx   = centerX - wFull/2 + wPre + wCh/2;
  const oCy   = baseY - 34;
  const oR    = Math.max(14, wCh*0.42);
  drawBlinkingEyes(ctx, oCx, oCy, oR, dt);

  ctx.restore();

  // Goblin che attraversano il logo
  drawLogoGoblins(dt);
}

function drawBlinkingEyes(ctx, cx, cy, r, dt){
  // aggiorna stato blink per i due occhi (intervallo 1–3s, indipendenti)
  [Cave.logo.eyes, Cave.logo.eyes2].forEach(st=>{
    st.next ??= performance.now()+1000+Math.random()*2000;
    if (performance.now() >= st.next && !st.closing) st.closing = true;
    const spd = 0.008; // velocità chiusura/apertura
    if (st.closing){ st.t += dt*spd; if (st.t>=1){ st.t=1; st.closing=false; st.next = performance.now()+1000+Math.random()*2000; } }
    else if (st.t>0){ st.t -= dt*spd; if (st.t<0) st.t=0; }
  });

  const t = Cave.logo.eyes.t || 0; // uso lo stesso per la resa (ammiccamenti sfalsati restano, ma resa coerente)
  const eyeOffset = r*0.32, eyeR = r*0.22;

  function paintOne(x){
    ctx.save();
    // bulbo
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x, cy, eyeR, 0, Math.PI*2); ctx.fill();
    // pupilla (si “stringe” quando t → 1)
    const pupilR = eyeR*0.55*(1 - 0.85*t);
    ctx.fillStyle = '#00ffd5';
    ctx.beginPath(); ctx.arc(x, cy, Math.max(0,pupilR), 0, Math.PI*2); ctx.fill();
    // palpebre
    const lidH = eyeR*2*t; ctx.fillStyle = '#553a00';
    ctx.fillRect(x - eyeR - 1, cy - eyeR, eyeR*2 + 2, lidH);
    ctx.restore();
  }
  paintOne(cx - eyeOffset);
  paintOne(cx + eyeOffset);
}

function drawLogoGoblins(dt){
  const list = Cave.logo.goblins; if (!list.length) return;
  const ctx = Cave.logo.ctx, img = Cave.assets.goblin;
  for (const g of list){
    if (!g.diving){
      g.t += dt * g.speed;
      const p = followPath(g.path, g.t);
      g.x = p.x; g.y = p.y;
      if (p.done){ g.diving = true; g.vx = 0; g.vy = 0.15; g.xd = g.x; g.yd = g.y; }
    } else {
      g.vy += dt * 0.0006;        // gravità
      g.xd += dt * 0.02;          // lieve drift in avanti
      g.yd += g.vy * dt;
      g.x = g.xd; g.y = g.yd;
      if (g.y > Cave.logo.h + 12){ // è uscito dal logo → entra nel canvas di gioco
        spawnGoblinIntoCaveFromLogo(g.wax, g.x / Cave.logo.w);
        g.done = true;
      }
    }
    if (img?.complete){
      const s = 64 * 0.45, off = s * .5;
      ctx.drawImage(img, g.x - off, g.y - off, s, s);
    } else {
      ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.arc(g.x, g.y, 8, 0, Math.PI*2); ctx.fill();
    }
  }
  for (let i=list.length-1;i>=0;i--) if (list[i].done) list.splice(i,1);
}

function followPath(pts, t){
  if (!pts || pts.length<2) return {x:0,y:0,done:true};
  const seg = Math.min(pts.length-1, Math.floor(t));
  const f   = t - seg;
  const a = pts[seg], b = pts[Math.min(seg+1, pts.length-1)];
  return { x: a.x + (b.x-a.x)*f, y: a.y + (b.y-a.y)*f, done: seg >= pts.length-2 && f>=1 };
}

function computeLogoPath(){
  const ctx = Cave.logo.ctx, w=Cave.logo.w, baseY=Cave.logo.baseY;
  ctx.save(); ctx.font='900 64px Orbitron, system-ui, sans-serif'; ctx.textBaseline='alphabetic'; ctx.textAlign='left';
  const text = Cave.logo.title;
  const fullW = ctx.measureText(text).width;
  const left  = (w - fullW)/2;

  const way = [];
  let y = baseY - 6;          // linea di cammino bassa
  way.push({ x: -80, y });    // entra da sinistra

  // “scalata” stilizzata: bordo sinistro su / giù per ogni lettera
  let cursor = left;
  for (const ch of text){
    const cw = ctx.measureText(ch).width;
    const topY = baseY - 56;
    way.push({ x: cursor + cw*0.15, y });       // avvicinati al bordo lettera
    way.push({ x: cursor + cw*0.15, y: topY }); // arrampica
    way.push({ x: cursor + cw*0.85, y: topY }); // cammina sul tetto
    way.push({ x: cursor + cw*0.95, y: topY+6 });// scendi un filo tra lettere
    cursor += cw;
  }
  way.push({ x: left + fullW + 20, y: baseY - 10 }); // zona tuffo
  ctx.restore();
  return way;
}

function triggerLogoGoblin(wax){
  const path = computeLogoPath();
  Cave.logo.goblins.push({ t:0, speed: 0.002 + Math.random()*0.001, path, wax, diving:false });
}

function showLogoToast(msg){
  const host = document.getElementById('cv-logo-toast'); if (!host) return;
  host.textContent = msg;
  host.classList.remove('show'); void host.offsetWidth; // reset anim
  host.classList.add('show');
  setTimeout(()=> host.classList.remove('show'), 3200);
}

function spawnGoblinIntoCaveFromLogo(wax, xNorm){ // xNorm: 0..1 relativo al logo
  const { minX, maxX, minY, maxY } = getBounds();
  const gx = clamp(Math.round(minX + xNorm * (maxX - minX)), minX, maxX);
  const gy = minY + 1;
  const color = colorByIndex(Math.abs(hashCode(wax||'')));
  Cave.goblins.push({
    x: gx, y: gy, wax_account: wax || 'guest',
    path: [], trail: [], _lastTrailX: gx, _lastTrailY: gy,
    digging:false, shovelFrame:0, frameTimer:0, color,
    // seed minimi per il movimento
    speed: 0.9, turnRate: 2.0, heading: Math.random()*Math.PI*2,
    // 👇 evita il crash: crea subito un target valido
    target: { x: randInt(minX, maxX), y: randInt(minY, maxY) },
    pauseTil: 0, speedBoostUntil: 0, walkPhase: Math.random()*Math.PI*2, walkBob: 0
  });
}

  function hashCode(str=''){ let h=0; for(let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0; } return h; }
  function hueFromString(str=''){ const h = Math.abs(hashCode(str)); return h % 360; }

  // ========= DRAWING =========
  function drawBG() {
    const { ctx, bgCache, assets, gridW, gridH, offsetX, offsetY } = Cave;
    if (bgCache) {
      ctx.drawImage(bgCache, offsetX, offsetY);
    } else if (assets.bg?.complete) {
      ctx.drawImage(assets.bg, 0, 0, assets.bg.width, assets.bg.height, offsetX, offsetY, gridW, gridH);
    } else {
      // Fallback anti-nero
      ctx.fillStyle = '#0b0b0b';
      ctx.fillRect(offsetX, offsetY, gridW, gridH);
    }
  }

  function drawChests() {
    const { ctx, assets, cell } = Cave;
    if (!assets.chest?.complete) return;
    Cave.chests.forEach(ch => {
      if (ch.taken) return;
      const cx = Cave.offsetX + ch.x * Cave.cellX;
      const cy = Cave.offsetY + ch.y * Cave.cellY;
      const scale = 0.45;
      const w = assets.chest.width * scale;
      const h = assets.chest.height * scale;
      ctx.drawImage(assets.chest, cx - w/2, cy - h/2, w, h);
    });
  }
  
  function drawGoblinTrail(g) {
    const { ctx, cell, offsetX, offsetY } = Cave;
    const t = g.trail;
    if (!t || t.length < 2) return;
  
    ctx.save();
    ctx.lineCap = "round";
    const w = Math.max(1, Math.min(Cave.cellX, Cave.cellY) * 0.20);
    ctx.lineWidth = w; 
    for (let i = 0; i < t.length - 1; i++) {
      const a = t[i], b = t[i + 1];
      const alpha = (1 - i / t.length) * 0.80; // fade verso il passato
      ctx.strokeStyle = hexToRgba(g.color || "#ffe600", alpha);
      ctx.beginPath();
      ctx.moveTo(Cave.offsetX + a.x * Cave.cellX, Cave.offsetY + a.y * Cave.cellY);
      ctx.lineTo(Cave.offsetX + b.x * Cave.cellX, Cave.offsetY + b.y * Cave.cellY);      
      ctx.stroke();
    }
    ctx.restore();
  }
  
  function drawGoblin(g) {
    const { ctx, assets } = Cave;
    const cell = Math.min(Cave.cellX, Cave.cellY);
    const px = Cave.offsetX + g.x * Cave.cellX;
    const bobPx = (g.walkBob || 0) * Math.min(Cave.cellX, Cave.cellY);
    const py = Cave.offsetY + g.y * Cave.cellY + bobPx;
  
    // scia prima
    drawGoblinTrail(g);
  
    const gScale = 5, sScale = 3;
    const gSize = cell * gScale;
    const gOff  = (gSize - cell) / 2;
  
    if (assets.goblin?.complete) {
      ctx.drawImage(assets.goblin, px - gOff, py - gOff, gSize, gSize);
    }
    // label
    ctx.font = `${Math.max(10, cell * 0.9)}px Orbitron, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    const labelW = cell * 2.2;
    const labelH = cell * 0.8;
    const footY  = py + (gSize / 2);
    const margin = cell * 0.25;
    let boxX = px - (labelW / 2);
    let boxY = footY + margin;
    
    // clamp per non uscire dal canvas
    boxX = Math.max(0, Math.min(boxX, Cave.gridW - labelW));
    boxY = Math.max(0, Math.min(boxY, Cave.gridH - labelH));
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.fillRect(boxX, boxY, labelW, labelH);    
    ctx.fillStyle = g.color || "#ffe600";
    ctx.fillText(g.wax_account, boxX + labelW / 2, boxY + labelH / 2);
    // shovel: 8x8 px, sopra la testa (no overlap)
    if (g.digging && assets.shovel?.complete) {
      const frames = 6;
      const fw = assets.shovel.width / frames;
      const fh = assets.shovel.height;
      const sx = g.shovelFrame * fw;
    
      const sSize  = 24;   // 8x8 pixel sul canvas
      const margin = 2;   // distanzina dalla testa
    
      // top del goblin in px canvas
      const goblinTop = py - (gSize / 2);
    
      // centra la pala orizzontalmente sul goblin e mettila sopra la testa
      const dx = px - (sSize / 2);
      const dy = goblinTop - margin - sSize;
    
      ctx.drawImage(assets.shovel, sx, 0, fw, fh, dx, dy, sSize, sSize);
    }
  }

  function drawPerksAndAdvance() {
    const { ctx } = Cave;
    if (!Cave.perks.length) return;
  
    for (let p of Cave.perks) {
      if (!p.image?.complete) continue;
  
      // frame advance
      p.tick++;
      if (p.tick >= p.frameDelay) {
        p.tick = 0;
        p.frame = (p.frame + 1) % p.frames;
      }
  
      // === Bounds calcolati UNA volta per iterazione ===
      const bounds = getBounds();
      const { minX, maxX, minY, maxY } = bounds;
  
      const wy = p.waveY(p.x);
      const px = Cave.offsetX + p.x * Cave.cellX;
      const py = Cave.offsetY + wy   * Cave.cellY;
  
      // fuori safe-area → stop
      if (p.x < minX - 1 || p.x > maxX + 1 || wy < minY - 1 || wy > maxY + 1) {
        p.done = true;
        continue;
      }

      const srcW = p.image.width / p.frames;
      const srcH = p.image.height;
      const sx = Math.floor(p.frame) * srcW;
      ctx.drawImage(p.image, sx, 0, srcW, srcH, px - 16, py - 16, 32, 32);
  
      // drop chest una sola volta, dentro safe-area
      if (!p.hasDropped && Math.random() < 0.25) {
        p.hasDropped = true;
  
        const dx = randInt(minX, maxX);
        const dy = randInt(minY, maxY);
  
        const chest = {
          id: null,
          x: dx, y: dy, destX: dx, destY: dy,
          from: p.perkName,
          wax_account: p.wax_account,
          taken: false,
          claimable: false,
          pending: true
        };
  
        // prova spawn su backend
        try {
          syncUserInto(Cave.user);
          assertAuthOrThrow(Cave.user);
        } catch {
          console.warn("[spawn_chest] skipped: not authenticated");
        }
  
        API.post("/spawn_chest", {
          wax_account: p.wax_account,
          perk_type: p.perkName,
          x: dx, y: dy
        }, 12000).then(r => {
          if (r.ok && r?.data?.chest_id != null) {
            chest.id = String(r.data.chest_id);
            chest.pending = false;
            chest.claimable = true;
            upsertChest(chest);
          } else {
            chest.pending = false;
            chest.claimable = false;
            console.warn("[spawn_chest] risposta non valida:", r);
          }
        }).catch(e => {
          chest.pending = false;
          chest.claimable = false;
          console.warn("[spawn_chest] errore:", e);
        });
      }
  
      // avanzamento entro safe-area (riusa i bounds sopra)
      p.x += p.dir === "left-to-right" ? p.speed : -p.speed;
      if (p.x < minX - 1 || p.x > maxX + 1) p.done = true;
    }
  
    // pulizia
    Cave.perks = Cave.perks.filter(p => !p.done);
  }

  // ========= GAME LOGIC =========
  function colorByIndex(i) {
    const palette = ['#ffd700','#00ffff','#ff69b4','#7fff00','#ffa500','#00ff7f','#ff4500'];
    return palette[i % palette.length];
  }
  function genPath(x1,y1,x2,y2) {
    const path = []; let cx=x1, cy=y1;
    while (cx!==x2 || cy!==y2) {
      if (cx!==x2) cx += x2 > cx ? 1 : -1;
      else if (cy!==y2) cy += y2 > cy ? 1 : -1;
      path.push([cx,cy]);
    }
    return path;
  }
  function tryClaimNearby(g){
    Cave.chests.forEach((ch, key) => {
      const inside2x2 = (g.x >= ch.x && g.x <= ch.x + 1) && (g.y >= ch.y && g.y <= ch.y + 1);
  
      if (g.digging && inside2x2 && ch.claimable && !ch.taken && !ch.claiming) {
        if (ch.id != null) {
          const cid = String(ch.id);
          if (inFlightClaims.has(cid)) return;
          inFlightClaims.add(cid);
        }
  
        ch.claiming = true;           // mostra spinner logico, ma non nascondere la chest
        // NON impostare taken/taken_by finché non ho conferma
  
        (async () => {
          try {
            syncUserInto(Cave.user);
            assertAuthOrThrow(Cave.user);
  
            if (!ch.id || isNaN(Number(ch.id))) { console.warn("[claim_chest] invalid id"); return; }
            if (!g.wax_account) { console.warn("[claim_chest] missing wax_account"); return; }
  
            const payload = { wax_account: g.wax_account, chest_id: Number(ch.id) };
            const rs = await API.post("/claim_chest", payload, 15000);
  
            if (rs.status === 409) {
              Cave.chests.delete(key);
              const by = rs.data?.claimed_by ? ` by ${safe(rs.data.claimed_by)}` : "";
              toast(`Chest #${safe(ch.id)} already claimed${by}.`, "warn");
              return;
            }
            if (!rs.ok) return;  // fallimento silenzioso
  
            const reward  = rs.data;
            const chestId = reward?.chest_id ?? ch.id;
            const chips   = reward?.stats?.tokens?.CHIPS ?? 0;
            const nfts    = Array.isArray(reward?.nfts) ? reward.nfts.length : 0;
            ch.taken = true;         
            ch.taken_by = g.wax_account;
            
            if (chips === 0 && nfts === 0) {
              toast(`${g.wax_account} opened Chest #${safe(chestId)} from ${ch.from}… it was empty.`, "warn");
            } else {
              toast(`${g.wax_account} won ${chips} CHIPS and ${nfts} NFTs from Chest #${safe(chestId)} (${ch.from})!`, "ok");
            }
  
            if (Array.isArray(reward?.winners)) renderBonusListFromBackend(reward.winners);
            else appendBonusReward({ ...reward, chest_id: chestId }, g.wax_account, ch.from);
  
            Cave.chests.delete(key);
          } catch (e) {
            ch.claiming = false;
          } finally {
            if (ch.id != null) inFlightClaims.delete(String(ch.id));
          }
        })();
      }
    });
  }
  
  function moveGoblin(g, dt) {
    const dtSec = Math.min(0.05, Math.max(0.001, dt/1000)); // 1–50 ms
    if (g.digging) { tryClaimNearby(g); return; }
  
    const { minX, maxX, minY, maxY } = getBounds();
    if (!g.target) g.target = { x: randInt(minX, maxX), y: randInt(minY, maxY) };
    // seed on first run (retrocompat)
    if (g.speed == null) {
      g.speed    = 7.6 + Math.random()*0.6;     // celle/sec
      g.turnRate = 9.9 + Math.random()*0.9;     // rad/sec
      g.heading  = Math.random() * Math.PI * 2; // rad
      g.target   = { x: randInt(minX, maxX), y: randInt(minY, maxY) };
      g.walkPhase = Math.random() * Math.PI * 2;
      g.walkBob   = 0;
      g.pauseTil  = 0;
      g.speedBoostUntil = 0;
    }
  
    // micro-pause casuale
    if (performance.now() < g.pauseTil) { g.walkBob *= 0.9; return; }
  
    // nuovo waypoint ogni tanto o quando arrivato
    const distToTarget = Math.hypot(g.target.x - g.x, g.target.y - g.y);
    if (distToTarget < 1.0 || Math.random() < 0.002) {
      g.target.x = randInt(minX, maxX);
      g.target.y = randInt(minY, maxY);
      if (Math.random() < 0.02) g.pauseTil = performance.now() + (100 + Math.random()*200);
    }
    // cerca chest più vicina per bias della direzione
    let seek = null, seekD2 = 999;
    Cave.chests.forEach(ch => {
      if (ch.taken || !ch.claimable) return;
      const dx = g.x - ch.x, dy = g.y - ch.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < seekD2) { seekD2 = d2; seek = ch; }
    });

    // vira verso il target, con un po' di wander noise
    let desired_path = Math.atan2(g.target.y - g.y, g.target.x - g.x);
    const CHEST_SEEK_R = 3.0; // celle
    if (seek && seekD2 < CHEST_SEEK_R*CHEST_SEEK_R) {
      const toChest = Math.atan2(seek.y - g.y, seek.x - g.x);
      desired_path = desired_path*0.65 + toChest*0.35;          // piega la rotta verso la chest
      if (seekD2 < 1.8*1.8) g.speedBoostUntil = performance.now() + 1200; // sprint 1.2s
    }
    let delta = ((desired_path - g.heading + Math.PI*3) % (Math.PI*2)) - Math.PI;
    const maxTurn = g.turnRate * dtSec;
    if (delta >  maxTurn) delta =  maxTurn;
    if (delta < -maxTurn) delta = -maxTurn;
    g.heading += delta;
    g.heading += (Math.random() - 0.5) * 0.2 * dtSec; // wander
  
    // separazione (anti-ammasso)
    let sepX = 0, sepY = 0, seen = 0;
    const SEP_RADIUS = 1.6; // celle
    for (const o of Cave.goblins) {
      if (o === g) continue;
      const dx = g.x - o.x, dy = g.y - o.y;
      const d2 = dx*dx + dy*dy;
      if (d2 > SEP_RADIUS*SEP_RADIUS || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (SEP_RADIUS - d) / SEP_RADIUS;
      sepX += dx / (d || 0.0001) * push;
      sepY += dy / (d || 0.0001) * push;
      seen++;
    }
    if (seen) {
      const ang = Math.atan2(sepY, sepX);
      g.heading = g.heading * 0.8 + ang * 0.2;  // blend lontano dal gruppo
    }
  
    // steering per restare in safe-area
    if (g.x < minX+0.5 || g.x > maxX-0.5 || g.y < minY+0.5 || g.y > maxY-0.5) {
      const back = Math.atan2(
        clamp(g.y, minY+1, maxY-1) - g.y,
        clamp(g.x, minX+1, maxX-1) - g.x
      );
      g.heading = g.heading * 0.6 + back * 0.4;
    }
  
    // avanza
    const boost = (g.speedBoostUntil && performance.now() < g.speedBoostUntil) ? 1.35 : 1.0;
    const vx = Math.cos(g.heading) * g.speed * boost;
    const vy = Math.sin(g.heading) * g.speed * boost;
    g.x = clamp(g.x + vx * dtSec, minX, maxX);
    g.y = clamp(g.y + vy * dtSec, minY, maxY);
  
    // trail
    if (!g.trail || !g.trail.length) {
      g.trail = [{ x: g.x, y: g.y }];
      g._lastTrailX = g.x; g._lastTrailY = g.y;
    } else {
      const dxT = g.x - g._lastTrailX, dyT = g.y - g._lastTrailY;
      if ((dxT*dxT + dyT*dyT) >= (TRAIL_MIN_DIST*TRAIL_MIN_DIST)) {
        g.trail.unshift({ x: g.x, y: g.y });
        g._lastTrailX = g.x; g._lastTrailY = g.y;
        if (g.trail.length > TRAIL_LEN) g.trail.pop();
      }
    }
  
    // bobbing di camminata (effetto “passi”)
    const stepHz = clamp(g.speed * 0.8, 0.4, 1.6); // 0.4–1.6 passi/sec
    g.walkPhase += stepHz * dtSec * Math.PI * 2;
    g.walkBob = Math.sin(g.walkPhase) * 0.12; // in "celle"
  
    // se una chest è molto vicina → scava
    let nearest = null, bestD2 = 99;
    Cave.chests.forEach(ch => {
      if (ch.taken || !ch.claimable) return;
      const dx = g.x - ch.x, dy = g.y - ch.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < bestD2) { bestD2 = d2; nearest = ch; }
    });
    if (nearest && bestD2 < 1.2*1.2 && !g.digging) {
      g.digging = true;
      g.shovelFrame = 0; g.frameTimer = 0;
      g.trail = g.trail.slice(0, Math.ceil(TRAIL_LEN/2));
      tryClaimNearby(g);
      setTimeout(() => g.digging = false, 1800 + Math.random()*800);
    }
  }

  function updateGoblinAnim(delta) {
    Cave.goblins.forEach(g => {
      if (!g.digging) return;
      g.frameTimer += delta;
      if (g.frameTimer >= 100) {
        g.shovelFrame = (g.shovelFrame + 1) % 6;
        g.frameTimer = 0;
      }
    });
  }

  // ========= CHESTS HELPERS =========
  function synthChestKey(ch) {
    return `${ch.wax_account}|${ch.from}|${ch.x}|${ch.y}`;
  }
  function upsertChest(ch) {
    const key = ch.id ? String(ch.id) : synthChestKey(ch);
    const ex = Cave.chests.get(key);
    Cave.chests.set(key, ex ? { ...ex, ...ch } : ch);
  }
  function clearChests() { Cave.chests.clear(); }

  // ========= PERKS =========
  function triggerPerk(perkName, wax_account) {
    if (!Cave.assets.loaded || !Cave.canvas) return;

    const sprite = {
      dragon: { img: Cave.assets.perks.dragon, frames:6 },
      dwarf: { img: Cave.assets.perks.dwarf, frames:6 },
      skeleton: { img: Cave.assets.perks.skeleton, frames:6 },
      black_cat: { img: Cave.assets.perks.black_cat, frames:6 },
    }[perkName] || { img: Cave.assets.perks.dragon, frames:6 };

    if (!sprite.img?.complete) return;

    const dir = Math.random() < 0.5 ? "left-to-right" : "right-to-left";
    const { minX, maxX, minY, maxY } = getBounds();
    const amp  = 3 + Math.random()*4;
    const freq = 0.15 + Math.random()*0.15;
    
    // parti dal bordo interno della safe-area
    const startX = dir === "left-to-right" ? minX : maxX;
    
    // baseY scelto in modo che baseY ± amp resti dentro i limiti
    const baseY  = randInt(minY + Math.ceil(amp), maxY - Math.ceil(amp));

    // 50% slower than original (0.3–0.6)
    const speed = (0.3 + Math.random()*0.3) * 0.5;

    Cave.perks.push({
      image: sprite.img,
      frames: sprite.frames,
      frame: 0, tick: 0, frameDelay: 8,
      x: startX, y: baseY,
      dir, speed,
      waveY: (xPos) => clamp(baseY + Math.sin(xPos * freq) * amp, minY, maxY),
      perkName, wax_account,
      hasDropped: false, done: false
    });
  }

  // ========= LISTS / UI PANELS =========
  function appendBonusReward(reward, wax_account, source) {
    const c = Cave.el.bonusList; if (!c) return;
  
    let grid = qs("#cv-bonus-grid", c);
    if (!grid) {
      c.insertAdjacentHTML("beforeend",
        `<div id="cv-bonus-grid"
              style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
                     gap:.75rem; align-items:stretch;"></div>`);

      grid = qs("#cv-bonus-grid", c);
    }
  
    const chips = reward?.stats?.tokens?.CHIPS ?? 0;
    const nfts  = Array.isArray(reward?.nfts) ? reward.nfts.length : 0;
    const chestId = reward?.chest_id; // 👈 dal backend
  
    // dedup forte per chest_id; fallback soft con firma
    const dedupKey = chestId ? `ch:${chestId}` :
      `${wax_account}|${source}|${chips}|${nfts}|${new Date().getHours()}${new Date().getMinutes()}`;
  
    if (Cave.bonusKeys.has(dedupKey)) return;
    Cave.bonusKeys.add(dedupKey);
    if (Cave.bonusKeys.size > 64) {
      Cave.bonusKeys = new Set(Array.from(Cave.bonusKeys).slice(-32));
    }
  
    const card = document.createElement("div");
    card.className = "cv-item";
    card.style.cssText = `
      position:relative; background:linear-gradient(180deg,#0f150f,#0b110b);
      border:1px solid #1f4d1f; border-radius:14px; padding:.8rem .9rem;
      box-shadow:0 6px 16px rgba(0,0,0,.35), inset 0 0 12px rgba(0,255,0,.08);
      transition:transform .12s ease, box-shadow .12s ease;
    `;
    card.innerHTML = `
      <div class="cv-row" style="margin-bottom:.4rem;">
        ${chestId ? `<span class="cv-badge">Chest #${safe(chestId)}</span>` : `<span></span>`}
        <span class="cv-time" title="${new Date().toLocaleString()}">${timeHM()}</span>
      </div>
    
      <div class="cv-row" style="gap:.5rem;">
        <strong style="color:#9dff9d; font-family:Orbitron,system-ui,sans-serif; font-size:.95rem;">
          ${safe(wax_account)}
        </strong>
        <span style="font-size:.8rem; color:#c9e7c9; opacity:.9;">opened a <strong style="color:#78ff78;">${safe(source)}</strong> chest</span>
      </div>
    
      <div class="cv-kv" style="margin-top:.55rem;">
        <div class="kv">
          <div class="k">CHIPS</div>
          <div class="v" style="color:#78ff78;">${chips}</div>
        </div>
        <div class="kv">
          <div class="k">NFTs</div>
          <div class="v" style="color:#ffb74d;">${nfts}</div>
        </div>
      </div>
    `;

    card.addEventListener("mouseover",()=> card.style.transform="translateY(-2px)");
    card.addEventListener("mouseout", ()=> card.style.transform="translateY(0)");
  
    grid.prepend(card);
  
    // Cap visivo
    while (grid.children.length > MAX_BONUS_ROWS) grid.lastElementChild?.remove();
  }
    
  async function renderRecentList(preloadedData = null) {
    try {
      const c = Cave.el.recentList; 
      if (!c || !Cave.visible) return;
  
      // Header + contenitore griglia + skeleton
      c.innerHTML = `
        <h4 style="color:#ffa500;">🕒 Recent Expedition Results</h4>
        <div id="cv-recent-grid" class="cv-cards"></div>
      `;
      renderSkeletons("#cv-recent-grid", 6, 72);
      Cave.recentExpKeys.clear();
  
      // ── ottieni i dati ──
      let arr = [];
      if (preloadedData) {
        arr = Array.isArray(preloadedData) ? preloadedData
            : Array.isArray(preloadedData?.items) ? preloadedData.items
            : Array.isArray(preloadedData?.results) ? preloadedData.results
            : [];
      } else {
        const r = await API.get("/recent_expeditions", 12000);
        if (r.aborted) return;
        if (!r.ok) {
          c.insertAdjacentHTML("beforeend",
            `<div class="cv-toast warn">Could not load recent expeditions (HTTP ${r.status}).</div>`);
          return;
        }
        arr = Array.isArray(r.data) ? r.data
            : Array.isArray(r.data?.items) ? r.data.items
            : Array.isArray(r.data?.results) ? r.data.results
            : [];
      }
  
      const list = arr.slice(0, MAX_RECENT_EXPEDITIONS);
      const grid = qs("#cv-recent-grid", c);
      const frag = document.createDocumentFragment();
  
      list.forEach(item => {
        const ts = item.timestamp ?? item.created_at ?? item.time;
        const dt = ts ? new Date(ts) : null;
        const chips = item.chips ?? item.stats?.tokens?.CHIPS ?? 0;
        const nftsCount = item.nfts_count ?? (Array.isArray(item.nfts) ? item.nfts.length : 0);
        const key = `${item.wax_account}|${ts}|${chips}|${nftsCount}`;
        if (Cave.recentExpKeys.has(key)) return;
        Cave.recentExpKeys.add(key);
  
        const card = document.createElement("div");
        card.className = "cv-compact";
        card.innerHTML = `
          <div class="cv-head">
            <div class="cv-name">${safe(item.wax_account)}</div>
            ${dt ? `<span class="cv-time" title="${new Date(ts).toLocaleString()}">${timeHM(dt)}</span>` : ""}
          </div>
          <div style="font-size:.85rem; color:#ddd; opacity:.9;">Expedition result</div>
          <div class="cv-kv">
            <div class="kv">
              <div class="k">CHIPS</div>
              <div class="v" style="color:#78ff78;">${safe(chips)}</div>
            </div>
            <div class="kv">
              <div class="k">NFTs</div>
              <div class="v" style="color:#ffb74d;">${safe(nftsCount)}</div>
            </div>
          </div>
        `;
        frag.appendChild(card);
      });
  
      grid.innerHTML = "";         // <-- rimuove gli skeleton
      grid.appendChild(frag);
      // === ticker: salva e aggiorna
      Cave.tickerRecent = list;
      updateTickerFromArrays(Cave.tickerRecent, Cave.tickerWinners, Cave.lastAllExpeditions||[]);
    } catch (e) {
      if (e?.name === "AbortError") return;
      console.warn("Recent list failed:", e);
      const c2 = Cave.el.recentList;
      if (c2) c2.insertAdjacentHTML("beforeend",
        `<div class="cv-toast err">Error loading recent expeditions.</div>`);
    }
  }

  function prependRecentFromResult(result, wax_account) {
    const c = Cave.el.recentList; if (!c) return;
    const grid = qs("#cv-recent-grid", c) || c; // fallback
  
    const chips = result?.stats?.tokens?.CHIPS ?? 0;
    const nfts = Array.isArray(result?.nfts) ? result.nfts.length : 0;
    const k = `${wax_account}|${new Date().getHours()}${new Date().getMinutes()}|${chips}|${nfts}`;
    if (Cave.recentExpKeys.has(k)) return;
    Cave.recentExpKeys.add(k);
  
    const card = document.createElement("div");
    card.className = "cv-item";
    card.innerHTML = `
      <div class="cv-head">
        <div class="cv-name">${safe(wax_account)}</div>
        <span class="cv-time" title="${new Date().toLocaleString()}">${timeHM()}</span>
      </div>
      <div style="font-size:.85rem; color:#ddd; opacity:.9;">Expedition result</div>
      <div class="cv-kv">
        <div class="kv"><div class="k">CHIPS</div><div class="v" style="color:#78ff78;">${chips}</div></div>
        <div class="kv"><div class="k">NFTs</div><div class="v" style="color:#ffb74d;">${nfts}</div></div>
      </div>
    `;

    grid.prepend(card);
  
    // Cap a MAX_RECENT_EXPEDITIONS
    while (grid.children.length > MAX_RECENT_EXPEDITIONS) {
      grid.lastElementChild?.remove();
    }
  }

  function renderBonusListFromBackend(winners = []) {
    const c = Cave.el.bonusList; if (!c) return;
  
    c.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.6rem;">
        <h4 style="color:#78ff78; margin:0; font-family:Orbitron,system-ui,sans-serif;">🎁 Latest Chest Rewards</h4>
        <span style="font-size:.72rem; background:#133113; color:#b7ffb7; border:1px solid #1f5220; padding:.15rem .45rem; border-radius:999px;">live</span>
      </div>
      <div id="cv-bonus-grid"
        style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:.75rem; align-items:stretch;"></div>
    `;
    const grid = qs("#cv-bonus-grid", c);
  
    const frag = document.createDocumentFragment();
    winners.forEach(w => {
      // dedup per chest_id se disponibile
      const dk = w.chest_id ? `ch:${w.chest_id}` :
        `${w.wax_account}|${w.perk_type}|${w.chips}|${w.nfts_count}|${w.created_at}`;
      if (Cave.bonusKeys.has(dk)) return;
      Cave.bonusKeys.add(dk);
  
      const card = document.createElement("div");
      card.className = "cv-item";
      card.style.cssText = `
        position:relative; background:linear-gradient(180deg,#0f150f,#0b110b);
        border:1px solid #1f4d1f; border-radius:14px; padding:.8rem .9rem;
        box-shadow:0 6px 16px rgba(0,0,0,.35), inset 0 0 12px rgba(0,255,0,.08);
        transition:transform .12s ease, box-shadow .12s ease;
      `;
      card.innerHTML = `
        <div class="cv-row" style="margin-bottom:.4rem;">
          ${w.chest_id ? `<span class="cv-badge">Chest #${safe(w.chest_id)}</span>` : `<span></span>`}
          <span class="cv-time" title="${new Date(w.created_at).toLocaleString()}">${timeHM(new Date(w.created_at))}</span>
        </div>
      
        <div class="cv-row" style="gap:.5rem;">
          <strong style="color:#9dff9d; font-family:Orbitron,system-ui,sans-serif; font-size:.95rem;">
            ${safe(w.wax_account)}
          </strong>
          <span style="font-size:.8rem; color:#c9e7c9; opacity:.9;">opened a <strong style="color:#78ff78;">${safe(w.perk_type)}</strong> chest</span>
        </div>
      
        <div class="cv-kv" style="margin-top:.55rem;">
          <div class="kv">
            <div class="k">CHIPS</div>
            <div class="v" style="color:#78ff78;">${safe(w.chips)}</div>
          </div>
          <div class="kv">
            <div class="k">NFTs</div>
            <div class="v" style="color:#ffb74d;">${safe(w.nfts_count)}</div>
          </div>
        </div>
      `;

      card.addEventListener("mouseover",()=> card.style.transform="translateY(-2px)");
      card.addEventListener("mouseout", ()=> card.style.transform="translateY(0)");
  
      frag.appendChild(card);
    });
    grid.appendChild(frag);
    // === ticker: salva e aggiorna
    Cave.tickerWinners = winners;
    updateTickerFromArrays(Cave.tickerRecent, Cave.tickerWinners, Cave.lastAllExpeditions||[]);       
  }

  // --- Rotatore pannelli destri (OBS) ---
function startRightPanelRotator(options = {}) {
  // seconds: da ?rot=.. oppure ROT_SECS globale oppure 12
  const rotSec = Math.max(5, Math.min(60, Number(options.seconds || (typeof ROT_SECS !== 'undefined' ? ROT_SECS : 12))));
  const panels = [
    document.getElementById('cv-panel-live'),
    document.getElementById('cv-panel-recent'),
    document.getElementById('cv-panel-bonus'),
  ].filter(Boolean);

  if (!panels.length) return;

  // setup iniziale (mostra solo il primo)
  panels.forEach((p, i) => {
    p.hidden = i !== 0;
    p.style.opacity = i === 0 ? '1' : '0';
    p.style.transition = 'opacity .35s ease';
  });

  // namespace per gli interval del progetto
  window.Cave = window.Cave || {};
  Cave.intervals = Cave.intervals || {};
  if (Cave.intervals.panelRot) clearInterval(Cave.intervals.panelRot);

  // indice corrente (persistito su Cave per poterlo rileggere al refresh dati)
  Cave._activePanelIndex = Cave._activePanelIndex ?? 0;
  Cave._activePanelIndex = Cave._activePanelIndex % panels.length;

  // avvio rotazione
  Cave.intervals.panelRot = setInterval(() => {
    const cur = panels[Cave._activePanelIndex % panels.length];
    Cave._activePanelIndex = (Cave._activePanelIndex + 1) % panels.length;
    const nxt = panels[Cave._activePanelIndex];

    if (cur) {
      cur.style.opacity = '0';
      setTimeout(() => { cur.hidden = true; }, 350);
    }
    if (nxt) {
      nxt.hidden = false;
      requestAnimationFrame(() => { nxt.style.opacity = '1'; });
    }
  }, rotSec * 1000);
}

function stopRightPanelRotator() {
  if (window.Cave?.intervals?.panelRot) {
    clearInterval(Cave.intervals.panelRot);
    Cave.intervals.panelRot = null;
  }
}

  function ensureTicker(){
    if (typeof NOTICKER !== 'undefined' && NOTICKER) return null;
    let t = qs('#cv-ticker'); if (t) return t;
    const wrap = Cave.el.videoOrCanvas; if (!wrap) return null;
    wrap.style.position = 'relative';
    t = document.createElement('div');
    t.id = 'cv-ticker';
    t.innerHTML = `
      <div class="row"><div class="track" id="cv-ticker-top"></div></div>
      <div class="row"><div class="track" id="cv-ticker-bottom"></div></div>
    `;
    wrap.appendChild(t);
    return t;
  }

  // velocità: più grande è il contenuto, più lungo è il giro (ma non oltre i 26s)
  const TICKER_MIN_S = 12, TICKER_MAX_S = 26, TICKER_PX_PER_SEC = 160;
  
  function updateTickerFromArrays(recent = [], winners = [], live = []) {
    if (typeof NOTICKER !== 'undefined' && NOTICKER) return;
    const t = ensureTicker(); if (!t) return;
    const top = qs('#cv-ticker-top', t);
    const bottom = qs('#cv-ticker-bottom', t);
  
    const userHTML = (name) => {
      const h = hueFromString(name||'');
      // colore per-utente via HSL
      return `<span class="tk-user" style="color:hsl(${h},78%,62%)">${safe(name)}</span>`;
    };
  
    // Riga TOP = recent
    const topHTML = recent.map(r => {
      const chips = r.chips ?? r.stats?.tokens?.CHIPS ?? 0;
      const nfts  = r.nfts_count ?? (Array.isArray(r.nfts) ? r.nfts.length : 0);
      return (
        `<span class="item">` +
        `⛏️ ${userHTML(r.wax_account)}` +
        ` <span class="tk-chips">+${safe(chips)} CHIPS</span>` +
        ` <span class="tk-nfts">${safe(nfts)} NFT</span>` +
        `</span>`
      );
    });
  
    // Riga BOTTOM = live
    const bottomHTML = live.map(e => {
      const goblins = e.total_goblins ?? (Array.isArray(e.goblins) ? e.goblins.length : 0);
      const mm = Math.max(0, Math.floor((e.seconds_remaining ?? 0)/60));
      const ss = Math.max(0, Math.floor((e.seconds_remaining ?? 0)%60));
      const tots = totalsFromExpeditionItem(e);
      return (
        `<span class="item">` +
        `🚶 ${userHTML(e.wax_account)}` +
        ` <span class="tk-goblins">${safe(goblins)} goblins</span>` +
        ` <span class="tk-timer">${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}</span>` +
        ` <span class="tk-R">R:${fmtNumCompact(tots.res)}</span>` +
        ` <span class="tk-L">L:${fmtNumCompact(tots.loot)}</span>` +
        ` <span class="tk-S">S:${fmtNumCompact(tots.spd)}</span>` +
        ` <span class="tk-A">A:${fmtNumCompact(tots.acc)}</span>` +
        `</span>`
      );
    });
  
    function fillTrackHTML(trackEl, htmlArr, delay = '0s'){
      // reset pulito
      trackEl.style.animation = 'none';
      trackEl.innerHTML = '';
    
      // un solo HTML e due gruppi identici per un loop senza accumuli
      const inner = htmlArr.join('<span class="dot">·</span>');
      const spacer = '<span class="spacer" style="display:inline-block;width:48px"></span>';
      const innerWithSpacer = inner + spacer;      
      trackEl.innerHTML =
        `<div class="group">${innerWithSpacer}</div><div class="group" aria-hidden="true">${innerWithSpacer}</div>`;
    
      // misura SOLO il primo gruppo (larghezza reale del contenuto)
      void trackEl.offsetWidth; // reflow
      const g = trackEl.querySelector('.group');
      const contentW = Math.ceil(g ? g.scrollWidth : trackEl.scrollWidth/2);   
      trackEl.style.width = (contentW * 2) + 'px';
      const seconds = Math.max(12, Math.min(26, contentW / 160));
      trackEl.style.setProperty('--tkd', `${seconds}s`);
      trackEl.style.animation = `cv-marquee var(--tkd) linear infinite`;
      trackEl.style.animationDelay = delay;
    }
    fillTrackHTML(top,    topHTML,    '0s');
    fillTrackHTML(bottom, bottomHTML, '-2s');
  }

  function renderOverlayGeneralStats(data = []){
    const host = document.getElementById('cv-general-stats'); if (!host) return;
    const totalExp = data.length;
    let totalGobs = 0, tot = { res:0, loot:0, spd:0, acc:0 }, sumSec = 0;
  
    data.forEach(e=>{
      totalGobs += e.total_goblins ?? (Array.isArray(e.goblins) ? e.goblins.length :
                   Array.isArray(e.goblin_ids) ? e.goblin_ids.length : 0);
      const s = totalsFromExpeditionItem(e);
      tot.res  += s.res; tot.loot += s.loot; tot.spd  += s.spd; tot.acc  += s.acc;
      sumSec   += Number(e.seconds_remaining)||0;
    });
  
    const avgSec = totalExp ? Math.round(sumSec / totalExp) : 0;
    const mm = String(Math.floor(avgSec/60)).padStart(2,'0');
    const ss = String(Math.floor(avgSec%60)).padStart(2,'0');
  
    host.innerHTML = `
      <div class="cv-row" style="gap:.8rem; flex-wrap:wrap;">
        <div class="cv-item" style="flex:1 1 110px;"><div>Expeditions</div><div style="font-family:Orbitron,system-ui,sans-serif; font-weight:900; font-size:1.1rem;">${totalExp}</div></div>
        <div class="cv-item" style="flex:1 1 110px;"><div>Goblins</div><div style="font-family:Orbitron,system-ui,sans-serif; font-weight:900; font-size:1.1rem;">${totalGobs}</div></div>
        <div class="cv-item" style="flex:1 1 110px;"><div>⏳ Avg time</div><div style="font-family:Orbitron,system-ui,sans-serif; font-weight:900; font-size:1.1rem;">${mm}:${ss}</div></div>
      </div>
      <div class="cv-row" style="gap:.4rem; margin-top:.45rem; flex-wrap:wrap;">
        <div class="cv-pill attr-R"><div class="cv-chip-key">R</div><div class="cv-chip-val">${fmtNumCompact(tot.res)}</div></div>
        <div class="cv-pill attr-L"><div class="cv-chip-key">L</div><div class="cv-chip-val">${fmtNumCompact(tot.loot)}</div></div>
        <div class="cv-pill attr-S"><div class="cv-chip-key">S</div><div class="cv-chip-val">${fmtNumCompact(tot.spd)}</div></div>
        <div class="cv-pill attr-A"><div class="cv-chip-key">A</div><div class="cv-chip-val">${fmtNumCompact(tot.acc)}</div></div>
      </div>
    `;
  }

  // ========= GLOBAL EXPEDITIONS & CANVAS DATA ========= 
  let globalFetchBusy = false;
  Cave._liveUsersPrev = new Set();
  
  async function renderGlobalExpeditions(preloadedData = null) {
    if (!preloadedData) { if (globalFetchBusy) return; globalFetchBusy = true; }
  
    if (!Cave.visible || !Cave.el.globalList || !Cave.el.videoOrCanvas) {
      if (!preloadedData) globalFetchBusy = false;
      return;
    }
  
    try {
      // ===== dati =====
      let data;
      if (preloadedData) {
        data = Array.isArray(preloadedData) ? preloadedData : [];
      } else {
        const r = READONLY ? await API.get('/public_all_expeditions', 12000)
                           : await API.post('/all_expeditions', {}, 12000);
        if (r.aborted || !r.ok) { if (!preloadedData) globalFetchBusy = false; return; }
        data = Array.isArray(r.data) ? r.data : [];
      }
  
      // ===== canvas seed + chest sync (come tua versione) =====
      Cave.el.globalList.innerHTML = "";
      if (!qs("#caveCanvas", Cave.el.videoOrCanvas)) {
        Cave.el.videoOrCanvas.innerHTML = `<canvas id="caveCanvas"></canvas>`;
        setupCanvas(qs("#caveCanvas", Cave.el.videoOrCanvas));
        startRAF();
      }
  
      if (data.length === 0) {
        clearChests(); Cave.goblins = [];
        Cave.lastAllExpeditions = [];
        qs('#cv-general-stats').innerHTML = `
          <div class="cv-row">
            <div><strong>Expeditions:</strong> 0</div>
            <div><strong>Goblins:</strong> 0</div>
          </div>`;
        updateTickerFromArrays(Cave.tickerRecent||[], Cave.tickerWinners||[], []);
        return;
      }
  
      // goblin seed
      const { minX, maxX, minY, maxY } = getBounds();
      Cave.goblins = data.map((e, i) => {
        const gx = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        const gy = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        return { x: gx, y: gy, wax_account: e.wax_account, path: [], trail:[{x:gx,y:gy}], _lastTrailX:gx, _lastTrailY:gy, digging:false, shovelFrame:0, frameTimer:0, color: colorByIndex(i) };
      });
  
      // chests live
      const liveIds = new Set();
      data.forEach(e => {
        if (!Array.isArray(e.chests)) return;
        e.chests.forEach(ch => {
          const hasId = ch.id != null && !isNaN(Number(ch.id));
          if (!hasId) return;
          const id = String(ch.id); liveIds.add(id);
          const cx = clamp(ch.x, minX, maxX), cy = clamp(ch.y, minY, maxY);
          upsertChest({ id, x:cx, y:cy, from: ch.from || "unknown", wax_account: e.wax_account, taken:false, claimable:true, pending:false });
        });
      });
      Cave.chests.forEach((ch, key) => {
        if (ch.id != null && !liveIds.has(String(ch.id))) Cave.chests.delete(key);
      });
  
      // salva per ticker e general stats
      Cave.lastAllExpeditions = data;
      renderOverlayGeneralStats(data);
  
      // ===== feedback start/end (diff) =====
      const nowUsers = new Set(data.map(e => e.wax_account));
      // new -> started
      nowUsers.forEach(u => { if (!Cave._liveUsersPrev.has(u)) toast(`${u} started an expedition — good hunt, goblins!`, "ok", 3500); });
      // ended -> missing
      Cave._liveUsersPrev.forEach(u => { if (!nowUsers.has(u)) toast(`${u}'s expedition ended.`, "warn", 3000); });
      Cave._liveUsersPrev = nowUsers;
  
      // ===== cards list (compact, con attributi R/L/S/A) =====
      const list = Cave.el.globalList;
      list.style.display = "grid";
      list.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
      list.style.gap = ".6rem";
  
      const timers = [];
      data.forEach((e,i)=>{
        const end = Date.now() + (Number(e.seconds_remaining)||0) * 1000;
        const id = `cv-timer-${i}`;
        const sums = totalsFromExpeditionItem(e);
        const gobCount =
          e.total_goblins ??
          (Array.isArray(e.goblins) ? e.goblins.length :
           Array.isArray(e.goblin_ids) ? e.goblin_ids.length : 0);
  
        const card = document.createElement("div");
        card.className = "cv-compact";
        card.innerHTML = `
          <div class="cv-row">
            <strong style="color:var(--cv-chip); font-family:Orbitron,system-ui,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:62%;">${safe(e.wax_account)}</strong>
            <span id="${id}" style="color:#0f0; font-family:Orbitron,system-ui,sans-serif;">⏳ --:--</span>
          </div>
          <div style="font-size:.85rem; color:#7ff6ff;">Goblins: <strong>${gobCount}</strong></div>
          <div style="display:flex; flex-wrap:wrap; gap:.25rem; margin-top:.3rem;">
            <div class="cv-pill attr-R"><div class="cv-chip-key">R</div><div class="cv-chip-val">${fmtNumCompact(sums.res)}</div></div>
            <div class="cv-pill attr-L"><div class="cv-chip-key">L</div><div class="cv-chip-val">${fmtNumCompact(sums.loot)}</div></div>
            <div class="cv-pill attr-S"><div class="cv-chip-key">S</div><div class="cv-chip-val">${fmtNumCompact(sums.spd)}</div></div>
            <div class="cv-pill attr-A"><div class="cv-chip-key">A</div><div class="cv-chip-val">${fmtNumCompact(sums.acc)}</div></div>
          </div>
        `;
        list.appendChild(card);
        timers.push({ id, end });
      });
  
      if (Cave.intervals.globalCountdown) clearInterval(Cave.intervals.globalCountdown);
      Cave.intervals.globalCountdown = setInterval(()=>{
        const now = Date.now();
        timers.forEach(t=>{
          const el = document.getElementById(t.id); if (!el) return;
          const rem = t.end - now;
          if (rem <= 0) el.textContent = "✅ Done";
          else {
            const m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
            el.textContent = `⏳ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
          }
        });
      }, 1000);
  
      // ticker: top = recent, bottom = live
      updateTickerFromArrays(Cave.tickerRecent||[], Cave.tickerWinners||[], data);
    } catch (e) {
      if (e?.name !== "AbortError") console.warn("Global expeditions failed:", e);
    } finally {
      if (!preloadedData) globalFetchBusy = false;
    }
  }


  // ========= USER COUNTDOWN =========
// ========= USER COUNTDOWN (timer + instructions) =========
async function renderUserCountdown(expedition_id, seconds, assetIds = []) {
  const host = qs("#expedition-summary-block"); if (!host) return;
  const wax = Cave.user.wax_account; if (!wax) return;

  // evita doppio timer per lo stesso utente
  window.expeditionTimersRunning = window.expeditionTimersRunning || {};
  if (window.expeditionTimersRunning[wax]) return;
  window.expeditionTimersRunning[wax] = true;

  // rimuovi eventuale countdown precedente
  const prev = qs("#user-exp-countdown");
  if (prev) prev.remove();

  // crea il contenitore countdown
  const box = document.createElement("div");
  box.id = "user-exp-countdown";
  box.style.cssText = "margin-top:1rem; font-family:Orbitron,system-ui,sans-serif; color:#e8f6ff;";
  host.appendChild(box);

  // struttura: TIMER (in alto) + INSTRUCTIONS (sotto, con wrapping forzato)
  box.innerHTML = `
    <div id="cv-countdown-timer"
         style="font-size:1.2rem; color:#00e6ff; text-align:center; margin-bottom:.5rem;">
      ⏳ Time Left: --:--
    </div>

    <div id="cv-instructions" class="cv-card"
         style="margin-top:.4rem; padding:1rem; border:1px solid #2b2b2b;
                background:linear-gradient(180deg,#141414,#0d0d0d);
                border-radius:14px; box-shadow:0 0 14px rgba(0,0,0,.45), inset 0 0 16px rgba(0,255,255,.08);
                white-space:normal; overflow-wrap:anywhere; word-break:break-word;
                max-width:100%; overflow:hidden;">
      <h3 class="cv-title" style="font-size:1.05rem; margin:0 0 .5rem;">📜 Welcome to the Dwarf’s Gold Cave</h3>
      <p style="margin:.35rem 0;">
        💥 Choose up to <strong>50 goblins</strong> to raid the cave.
        Each <strong>Troops Reinforcement NFT</strong> you own adds <strong>+5 slots</strong>,
        up to a maximum of <strong>250</strong>.
      </p>
      <p style="margin:.35rem 0;">
        ⏳ You can now <strong>choose the duration</strong> of your expedition — from quick
        <strong>5 minutes</strong> to <strong>24 hours</strong>. Faster teams reduce the final time.
      </p>
      <p style="margin:.35rem 0;">
        💰 Earn variable <strong>CHIPS</strong> and <strong>NFT</strong> rewards.
        Your squad’s <strong>accuracy</strong> increases the chance to find NFTs.
      </p>
      <p style="margin:.35rem 0;">🏆 Use <strong>Best Goblins</strong> to auto-pick your elite team!</p>
      <div style="background:#2a2a2a; border-left:4px solid #ffe600; padding:.7rem; margin-top:.6rem;
                  font-weight:bold; color:#ffd700;">
        ⚠️ After an expedition, goblins must rest in the <strong>Tavern</strong> for <strong>5 minutes</strong>.
      </div>
    </div>
  `;

  const timerEl = qs("#cv-countdown-timer", box);

  // countdown loop (aggiorna solo il timer, non tocca le instructions)
  let end = Date.now() + seconds * 1000;
  const t = setInterval(async () => {
    const rem = end - Date.now();
    if (rem <= 0) {
      clearInterval(t);
      timerEl.textContent = "⏳ Expedition completed! Checking status...";
      try {
        syncUserInto(Cave.user);
        assertAuthOrThrow(Cave.user);

        const status = await API.post("/expedition_status", {
          wax_account: wax,
          user_id: Cave.user.user_id,
          usx_token: Cave.user.usx_token
        }, 12000);
        if (!status.ok) throw new Error(`Status ${status.status}`);

        const result = await API.post("/end_expedition", {
          wax_account: wax,
          user_id: Cave.user.user_id,
          usx_token: Cave.user.usx_token,
          expedition_id
        }, 15000);
        if (!result.ok) {
          timerEl.textContent = "❌ Failed to retrieve expedition result.";
          window.expeditionTimersRunning[wax] = false;
          return;
        }

        await renderRecentList();
        await renderGlobalExpeditions();
        prependRecentFromResult(result.data, wax);

        timerEl.textContent = "✅ Expedition complete!";
        // (non rimuovo il box: le instructions restano visibili)
      } catch (e) {
        timerEl.textContent = "⚠️ Expedition fetch error.";
        console.warn("end_expedition error:", e);
      } finally {
        window.expeditionTimersRunning[wax] = false;
      }
    } else {
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      timerEl.textContent = `⏳ Time Left: ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }
  }, 1000);
}


  // ========= POLLING (Perk commands) =========
  function startCommandPolling() {
    if (READONLY) return;
    if (Cave.intervals.command) return;
    Cave.intervals.command = setInterval(async ()=>{
      if (!Cave.visible) return;
      if (!Cave.canvas) return;
      try {
        syncUserInto(Cave.user);
        assertAuthOrThrow(Cave.user);          
        const r = await API.post("/check_perk_command", { wax_account: Cave.user.wax_account }, 12000);
        if (!r.ok) return;
        const perk = r.data;
        if (perk && perk.perk) {
          triggerPerk(perk.perk, perk.wax_account);
          toast(`${safe(perk.wax_account)} triggered ${perk.perk}`, "ok", 4000);
        }
      } catch (e) {
        log("perk polling err", e);
      }
    }, COMMAND_POLL_MS);
  }
  function stopCommandPolling() {
    if (Cave.intervals.command) {
      clearInterval(Cave.intervals.command);
      Cave.intervals.command = null;
    }
  }

  // ========= RAF LOOP =========
  let lastTS = performance.now();
  function tick(ts) {
    if (!Cave.running) return;
    const dt = ts - lastTS; lastTS = ts;
  
    clearCanvas();
    drawBG();
    drawPerksAndAdvance();
    drawChests();
    Cave.goblins.forEach(g => moveGoblin(g, dt));
    if (window.GoblinCrash) GoblinCrash.onAfterMove();
    Cave.goblins.forEach(drawGoblin);
    updateGoblinAnim(dt);
    if (window.GoblinCrash) GoblinCrash.draw(Cave.ctx);
  
    Cave.rafId = requestAnimationFrame(tick);
  }

function hydrateGoblinUI(allNfts) {
  // --- normalizza forma e chiavi legacy ---
  const all = Array.isArray(allNfts) ? allNfts : [];
  all.forEach(nft => {
    if (!nft || typeof nft !== "object") return;
    // daily-power ↔ daily_power
    if (nft.daily_power === undefined && nft["daily-power"] !== undefined) {
      nft.daily_power = nft["daily-power"];
    }
    // loot-hungry ↔ loot_hungry
    if (nft.loot_hungry === undefined && nft["loot-hungry"] !== undefined) {
      nft.loot_hungry = nft["loot-hungry"];
    }
    // pinata → ipfs.io (hardening)
    if (typeof nft.img === "string" &&
        nft.img.startsWith("https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/")) {
      nft.img = nft.img.replace(
        "https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/",
        "https://ipfs.io/ipfs/"
      );
    }
  });

  // --- filtra i goblin (case-insensitive, per massima compatibilità) ---
  const goblins = all.filter(n => String(n?.type || "").toLowerCase() === "goblin");

  // --- indicizza per asset_id (sempre stringa) ---
  Cave.nftIndex.clear();
  goblins.forEach(n => Cave.nftIndex.set(String(n.asset_id), n));

  if (!goblins.length) {
    if (Cave.el.selectionSummary) {
      Cave.el.selectionSummary.innerHTML = `<div class="cv-toast">No goblins available for expedition.</div>`;
    }
    return;
  }

  // --- calcolo cap iniziale dai Reinforcement presenti nel payload /user_nfts ---
  const specialCount = (Array.isArray(allNfts) ? allNfts : [])
    .filter(n => String(n.template_id) === "900338")
    .length;

  const BASE_LIMIT = 50;
  const EXTRA_PER_ASSET = 5;
  const HARD_CAP = 250;
  // fallback "statico" basato sugli NFT ricevuti ora
  const DYN_LIMIT = Math.min(HARD_CAP, BASE_LIMIT + specialCount * EXTRA_PER_ASSET);

  // helper numerico
  const num = (v) => Number(v ?? 0) || 0;

  // --- stato UI selezione/filtri/sort ---
  let selected = new Set();
  let sortBy = "rarity";
  let filterQuery = "";
  let filterRarity = "";
  let minPower = 0;

  // --- helper cap: usa quello calcolato dinamicamente da updateSummary se già disponibile; altrimenti DYN_LIMIT ---
  function getSendCap() {
    // window.CURRENT_LIMIT viene impostato in updateSummary() quando arrivano i rinforzi dal backend
    const fromWin = (typeof window !== "undefined") ? Number(window.CURRENT_LIMIT || 0) || 0 : 0;
    const cap = fromWin > 0 ? fromWin : DYN_LIMIT;
    return Math.max(1, Math.min(HARD_CAP, cap));
  }

  function saveFilters(){
    localStorage.setItem("caveFilters", JSON.stringify({
      filterQuery, filterRarity, minPower, sortBy
    }));
  }
  function loadFilters(){
    try{
      const s = JSON.parse(localStorage.getItem("caveFilters") || "{}");
      filterQuery   = s.filterQuery   || "";
      filterRarity  = s.filterRarity  || "";
      minPower      = Number(s.minPower || 0);
      sortBy        = s.sortBy        || "rarity";
      // Sync UI
      const $q = qs("#cv-search"), $r = qs("#cv-rarity"), $p = qs("#cv-power"), $pv = qs("#cv-power-val");
      if ($q)  $q.value         = filterQuery;
      if ($r)  $r.value         = filterRarity;
      if ($p)  $p.value         = String(minPower);
      if ($pv) $pv.textContent  = String(minPower);
    }catch{}
  }
  function applyFilters(src){
    const q = filterQuery.trim().toLowerCase();
    return src.filter(g=>{
      const okQuery  = !q || `${g.name||""}`.toLowerCase().includes(q) || String(g.asset_id).includes(q);
      const okRarity = !filterRarity || String(g.rarity||"").toLowerCase() === filterRarity.toLowerCase();
      const okPower  = num(g.daily_power) >= minPower;
      return okQuery && okRarity && okPower;
    });
  }

  // ripristina filtri e evidenzia sort
  loadFilters();
  qsa("#cv-sort-segment .cv-btn").forEach(b => b.style.background="#1a1a1a");
  const activeSortBtn = qs(`#cv-sort-segment .cv-btn[data-sort="${sortBy}"]`);
  if (activeSortBtn) activeSortBtn.style.background = "#2a2a2a";
  const sortSeg = qs("#cv-sort-segment");
  if (sortSeg) {
    sortSeg.addEventListener("click", (e)=>{
      const btn = e.target.closest('.cv-btn[data-sort]');
      if (!btn) return;
      sortBy = btn.dataset.sort || "rarity";
      qsa("#cv-sort-segment .cv-btn").forEach(b => b.style.background = "#1a1a1a");
      btn.style.background = "#2a2a2a";
      saveFilters();
      renderList();
    });
  }

  function renderList(list = goblins) {
    const filtered = applyFilters(list);
    const sorted = [...filtered].sort((a,b) => num(b[sortBy]) - num(a[sortBy]));
    const af = qs("#cv-active-filters");
    if (af){
      af.innerHTML = [
        filterQuery   ? `<span class="cv-badge" style="border-color:#20444a;background:linear-gradient(180deg,#152024,#0f1a1c);color:#7ff6ff;">🔎 ${safe(filterQuery)}</span>` : "",
        filterRarity  ? `<span class="cv-badge">${safe(filterRarity)}</span>` : "",
        minPower > 0  ? `<span class="cv-badge" style="border-color:#665200;background:linear-gradient(180deg,#2a2211,#1c160a);color:#ffcc66;">⚡ ≥ ${minPower}</span>` : ""
      ].filter(Boolean).join("");
    }

    Cave.el.goblinList.style.cssText = `
      display:grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap:12px;
      align-items:stretch;
    `;

    const maxPower = Math.max(1, ...sorted.map(g => num(g.daily_power)));
    const html = sorted.map(g => {
      const tired = num(g.daily_power) < 5;
      const sel = selected.has(g.asset_id);
      const dp  = num(g.daily_power);
      const pct = Math.max(6, Math.round(dp / maxPower * 100)); // min 6% per visibilità

      const ribbon = tired ? `
        <div style="
          position:absolute; top:8px; right:8px; transform:rotate(0deg);
          background:linear-gradient(135deg,#d32f2f,#b71c1c); color:#fff;
          font-weight:700; font-size:.7rem; padding:.25rem .5rem; border-radius:8px;
          box-shadow:0 0 8px rgba(255,0,0,.5); letter-spacing:.5px;">RESTING</div>` : "";

      return `
        <div class="cv-gob-card" data-id="${safe(g.asset_id)}" data-disabled="${tired?1:0}"
             role="checkbox" tabindex="0" aria-checked="${sel ? 'true':'false'}"
             aria-label="Select goblin ${safe(g.name)}"
             style="
          display:flex; flex-direction:column; gap:.6rem;
          background:linear-gradient(180deg,#151515,#0f0f0f);
          border:1px solid ${sel ? "rgba(255,230,0,.6)" : "var(--cv-border)"};
          box-shadow:${sel ? "0 0 16px rgba(255,230,0,.35), 0 0 0 1px rgba(255,230,0,.25) inset" : "0 2px 12px rgba(0,0,0,.35)"};
          border-radius:14px; padding:.75rem; transition:transform .12s, box-shadow .12s, border-color .12s;
          cursor:${tired ? "not-allowed" : "pointer"}; position:relative; overflow:hidden; ${tired ? "opacity:.78; filter:grayscale(10%) brightness(.95);" : ""}
        ">
          <div style="display:flex; align-items:center; gap:.8rem; min-width:0;">
            <div style="position:relative; flex:0 0 auto;">
              <img src="${safe(g.img)}" alt="" loading="lazy"
                   style="width:68px; height:68px; border-radius:14px; object-fit:cover; outline:1px solid var(--cv-border); box-shadow:0 3px 10px rgba(0,0,0,.35);">
              ${ribbon}
            </div>

            <div style="flex:1 1 auto; min-width:0;">
              <div class="cv-gob-head" style="display:flex; align-items:center; gap:.5rem; min-width:0;">
                <strong class="cv-name" style="color:var(--cv-chip); font-family:Orbitron,system-ui,sans-serif; font-size:1rem;">
                  ${safe(g.name)}
                </strong>
                <span class="cv-rarity" style="
                  background:${rarityBg(g.rarity)}; color:${rarityFg(g.rarity)}; border-color:${rarityBorder(g.rarity)};">
                  ${safe(g.rarity)}
                </span>
              </div>

              <div class="cv-gob-pillrow" style="display:flex; flex-wrap:wrap; gap:.45rem; margin-top:.45rem;">
                <div class="cv-pill"><div class="cv-chip-key">LEVEL</div><div class="cv-chip-val">${safe(g.level)}</div></div>
                <div class="cv-pill">
                  <div class="cv-chip-key">ABILITY</div>
                  <div class="cv-chip-val" style="white-space:normal; overflow-wrap:anywhere;">${safe(g.main_attr)}</div>
                </div>
                <div class="cv-pill"><div class="cv-chip-key">POWER</div><div class="cv-chip-val" style="color:#7efcff;">${dp}</div></div>
              </div>
            </div>

          <input type="checkbox" class="cv-sel" ${sel ? "checked" : ""} ${tired ? "disabled" : ""}
                 style="transform:scale(1.25); accent-color:#ffe600; flex:0 0 auto; align-self:flex-start;">
          </div>

          <div style="display:flex; align-items:center; gap:.6rem; margin-top:.55rem;">
            <div class="cv-meter"><div style="width:${pct}%;"></div></div>
            <div style="min-width:56px; text-align:right; font-size:.82rem; font-weight:800; color:#7efcff;">${dp}</div>
          </div>

          <div class="cv-row" style="opacity:.85; margin-top:.25rem;">
            <div style="font-size:.74rem; color:#9aa0a6; white-space:normal; overflow-wrap:anywhere;">
              ID: <span style="color:#cfcfcf; font-weight:600;">${safe(g.asset_id)}</span>
            </div>
            <div style="font-size:.94rem; color:#9aa0a6;">Power</div>
          </div>
        </div>
      `;
    }).join("");

    Cave.el.goblinList.innerHTML = html;

    // Delegation una sola volta
    if (!Cave._goblinListDelegated) {
      Cave._goblinListDelegated = true;

      Cave.el.goblinList.addEventListener("click", (e) => {
        const card = e.target.closest(".cv-gob-card");
        if (!card) return;
        let checkbox = e.target.closest(".cv-sel");
        if (card.dataset.disabled === "1") return;
        if (!checkbox) {
          checkbox = card.querySelector(".cv-sel");
          if (!checkbox) return;
          checkbox.checked = !checkbox.checked;
        }
        const id = card.dataset.id;
        const checked = checkbox.checked;
        if (checked) selected.add(id); else selected.delete(id);
        card.style.border = checked ? "1px solid rgba(255,230,0,.6)" : "1px solid #2a2a2a";
        card.style.boxShadow = checked
          ? "0 0 16px rgba(255,230,0,.35), 0 0 0 1px rgba(255,230,0,.25) inset"
          : "0 2px 12px rgba(0,0,0,.35)";
        updateSummary();
      });

      Cave.el.goblinList.addEventListener("mouseover", (e) => {
        const card = e.target.closest(".cv-gob-card");
        if (!card || card.dataset.disabled === "1") return;
        card.style.transform = "translateY(-2px)";
      });
      Cave.el.goblinList.addEventListener("mouseout", (e) => {
        const card = e.target.closest(".cv-gob-card");
        if (!card || card.dataset.disabled === "1") return;
        card.style.transform = "translateY(0)";
      });
      Cave.el.goblinList.addEventListener("keydown", (e) => {
        const card = e.target.closest(".cv-gob-card");
        if (!card || card.dataset.disabled === "1") return;
        if (e.key === " " || e.key === "Enter"){
          e.preventDefault();
          const cb = card.querySelector(".cv-sel");
          cb.checked = !cb.checked;
          const id = card.dataset.id;
          if (cb.checked) selected.add(id); else selected.delete(id);
          card.setAttribute("aria-checked", cb.checked ? "true":"false");
          card.style.border = cb.checked ? "1px solid rgba(255,230,0,.6)" : "1px solid #2a2a2a";
          card.style.boxShadow = cb.checked
            ? "0 0 16px rgba(255,230,0,.35), 0 0 0 1px rgba(255,230,0,.25) inset"
            : "0 2px 12px rgba(0,0,0,.35)";
          updateSummary();
        }
      });

      // Duration select → keep current value in memory (ID e scope corretti)
      Cave.ui = Cave.ui || {};
      Cave.ui.getDurationSeconds = function(){
        const el = document.querySelector("#cv-duration");
        const sec = Number(el?.value || 3600);
        return Math.max(300, Math.min(86400, sec)); // 5m..24h (il backend clampa comunque)
      };
    }
  }

  // Mostra scheda info Reinforcement e mantiene il flusso esistente (summary + duration + start)
  async function updateSummary() {
    const wax = Cave?.user?.wax_account;
    if (!wax || !Cave?.el?.selectionSummary) return;

    // 1) Fetch Troops Reinforcement ownership (fallback safe)
    let ownedReinforcements = 0;
    try {
      ownedReinforcements = Number(await fetchReinforcementCount(wax)) || 0;
    } catch (_) {
      ownedReinforcements = 0;
    }
    try { window.reinforcementCount = ownedReinforcements; } catch {}

    // 2) Compute limits
    const MAX_REINFORCEMENTS_USABLE = 40;       // puoi usarne fino a 40
    const HARD_CAP_LOCAL            = 250;      // 50 base + 40*5 = 250
    const baseLimit                 = Number(typeof BASE_LIMIT !== "undefined" ? BASE_LIMIT : 50) || 50;
    const maxLimit                  = Number(typeof HARD_CAP   !== "undefined" ? HARD_CAP   : HARD_CAP_LOCAL) || HARD_CAP_LOCAL;

    const appliedReinforcements = Math.min(ownedReinforcements, MAX_REINFORCEMENTS_USABLE);
    const computedLimit = Math.min(maxLimit, baseLimit + appliedReinforcements * 5);

    try { window.CURRENT_LIMIT = computedLimit; } catch {}

    // 3) Build info card
    const boosted = computedLimit > baseLimit;
    const infoCardHTML = `
      <div style="
        width:100%; max-width:980px; margin:.5rem auto 0;
        background: linear-gradient(180deg, #1c1c1c 0%, #121212 100%);
        border: 1px solid ${boosted ? '#3ce281' : '#2a2a2a'};
        border-radius: 14px; padding: 12px 14px;
        color:#eaeaea; box-shadow: 0 6px 18px rgba(0,0,0,.35);
        display:flex; gap:14px; align-items:flex-start; justify-content:space-between; flex-wrap:wrap;
      ">
        <div style="display:flex; gap:10px; align-items:flex-start;">
          <div style="
            width:38px; height:38px; flex:0 0 38px;
            border-radius:10px; display:flex; align-items:center; justify-content:center;
            background:${boosted ? '#183622' : '#222'}; border:1px solid ${boosted ? '#2c7a4b' : '#333'};
            font-size:20px;">🗡️</div>
          <div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <strong style="font-size:1rem; letter-spacing:.2px;">Troops Reinforcement</strong>
              <span style="
                font-size:.75rem; padding:2px 8px; border-radius:999px;
                border:1px solid ${boosted ? '#3ce281' : '#525252'};
                background:${boosted ? 'rgba(60,226,129,.10)' : 'rgba(82,82,82,.10)'}; color:${boosted ? '#9ff7c0' : '#bdbdbd'};
              ">
                ${boosted ? 'Boost Active' : 'No Boost'}
              </span>
            </div>

            <div style="margin-top:4px; font-size:.92rem; line-height:1.35;">
              <div style="opacity:.95;">
                You own <b>${ownedReinforcements}</b> Troops Reinforcement NFT${ownedReinforcements===1?'':'s'}.
                Each NFT adds <b>+5 goblins</b> per expedition.
              </div>
              <div style="opacity:.9;">
                You can use up to <b>${MAX_REINFORCEMENTS_USABLE}</b> (that’s <b>+200</b> max) — raising the cap to <b>${HARD_CAP_LOCAL}</b> goblins per expedition.
              </div>
            </div>
          </div>
        </div>

        <div style="text-align:right; min-width:180px;">
          <div style="font-size:.8rem; color:#b5b5b5; margin-bottom:2px;">Current sending cap</div>
          <div style="
            font-size:1.1rem; font-weight:700; letter-spacing:.3px;
            color:${boosted ? '#a6f3c9' : '#e6e6e6'};
          ">
            ${computedLimit} / ${HARD_CAP_LOCAL}
          </div>
          <div style="font-size:.78rem; color:#9c9c9c; margin-top:6px;">
            Base: ${baseLimit} • Applied NFTs: ${appliedReinforcements}/${MAX_REINFORCEMENTS_USABLE}
          </div>
        </div>
      </div>
    `;

    // 4) Build selector row
    const selectorRowHTML = `
      <div style="display:flex; align-items:center; gap:.75rem; flex-wrap:wrap; justify-content:center; margin-top:.6rem;">
        <span style="color:#ffe600;">
          Selected: ${selected.size} / ${computedLimit}
        </span>

        <label for="cv-duration" style="color:#cfcfcf; font-size:.9rem;">Duration</label>
        <select id="cv-duration" required
          style="background:#1a1a1a; color:#fff; border:1px solid #444; border-radius:8px; padding:.35rem .5rem;">
          <option value="">-- choose --</option>
          <option value="300">5 min</option>
          <option value="1800">30 min</option>
          <option value="3600">60 min</option>
          <option value="7200">2 hours</option>
          <option value="21600">6 hours</option>
          <option value="86400">24 hours</option>
        </select>

        <button class="cv-btn" id="cv-start" style="margin-left:.25rem;">🚀 Start Expedition</button>
      </div>
    `;

    // 5) Render
    Cave.el.selectionSummary.innerHTML = infoCardHTML + selectorRowHTML;

    // 6) Bind start action (limite gestito QUI, non fuori)
    qs("#cv-start").onclick = async () => {
      if (READONLY) { toast("Overlay read-mode only.", "warn"); return; }

      const btn = qs("#cv-start");
      const durSel = qs("#cv-duration");
      const durSec = Number(durSel?.value || 0);

      btn.disabled = true;
      btn.textContent = "⏳ Starting...";

      if (!selected.size) {
        toast("Select at least 1 goblin to start.", "warn");
        btn.disabled = false; btn.textContent = "🚀 Start Expedition";
        return;
      }
      if (!durSec) {
        toast("Please choose a duration.", "warn");
        btn.disabled = false; btn.textContent = "🚀 Start Expedition";
        return;
      }

      // Enforce computedLimit mentre preserviamo l'ordine; solo POWER≥5
      const ids = [];
      for (const id of selected) {
        const g = Cave.nftIndex.get(String(id));
        if (g && num(g.daily_power) >= 5) {
          ids.push(String(id));
          if (ids.length === computedLimit) break;
        }
      }
      if (!ids.length) {
        toast("All selected goblins are too tired.", "warn");
        btn.disabled = false; btn.textContent = "🚀 Start Expedition";
        return;
      }
      if (selected.size > computedLimit) {
        toast(`Selected ${selected.size} goblins — sending only the first ${computedLimit}.`, "warn");
      }

      try {
        syncUserInto(Cave.user);
        assertAuthOrThrow(Cave.user);

        // invia anche duration_seconds
        const r = await API.post("/start_expedition", {
          wax_account: Cave.user.wax_account,
          user_id:     Cave.user.user_id,
          usx_token:   Cave.user.usx_token,
          goblin_ids:  ids,
          duration_seconds: durSec
        }, 20000);

        if (r.status === 409) {
          toast(r.data?.error || "Already in expedition.", "warn");
        } else if (r.ok) {
          toast("Expedition started!", "ok");
          try { triggerLogoGoblin(Cave.user.wax_account || 'guest'); } catch {}
          try { showLogoToast(`${safe(Cave.user.wax_account)} just joined the band! Good hunting!`); } catch {}

          // usa la durata restituita dal backend
          await renderUserCountdown(r.data.expedition_id, r.data.duration_seconds, ids);
          await renderGlobalExpeditions();
        } else {
          toast("Something went wrong.", "err");
        }
      } catch (e) {
        toast("Failed to start expedition.", "err");
        console.error(e);
      } finally {
        btn.disabled = false;
        btn.textContent = "🚀 Start Expedition";
      }
    };
  }

  // --- selezione automatica "Best" con cap sicuro ---
  function autoBest() {
    selected.clear();
    const scored = goblins
      .filter(g => num(g.daily_power) >= 5)
      .map(g => ({ id: g.asset_id, score: num(g.level) + num(g[g.main_attr]) }))
      .sort((a,b) => b.score - a.score)
      .slice(0, getSendCap());
    scored.forEach(s => selected.add(s.id));
    renderList(); updateSummary();
  }

  // --- toolbar binds ---
  const btnFirstSel = qs("#cv-select-50");
  const btnDeselect = qs("#cv-deselect");
  const btnBestSel  = qs("#cv-select-best");

  if (btnFirstSel) {
    btnFirstSel.onclick = () => {
      selected.clear();
      goblins.filter(g => num(g.daily_power) >= 5)
        .slice(0, getSendCap())
        .forEach(g => selected.add(g.asset_id));
      renderList(); updateSummary();
    };
  }
  if (btnDeselect) {
    btnDeselect.onclick = () => { selected.clear(); renderList(); updateSummary(); };
  }
  if (btnBestSel) {
    btnBestSel.onclick = () => autoBest();
  }

  const $search = qs("#cv-search");
  if ($search) $search.addEventListener("input", e => { filterQuery = e.target.value; renderList(); saveFilters(); });

  const $rarity = qs("#cv-rarity");
  if ($rarity) $rarity.addEventListener("change", e => { filterRarity = e.target.value; renderList(); saveFilters(); });

  const powerRange = qs("#cv-power");
  const powerVal = qs("#cv-power-val");
  if (powerRange && powerVal){
    powerRange.addEventListener("input", e => {
      minPower = Number(e.target.value)||0;
      powerVal.textContent = String(minPower);
      renderList(); saveFilters();
    });
  }

  // --- render iniziale + summary ---
  renderList();
  updateSummary();

  // --- aggiorna label pulsanti in base al cap corrente/fallback ---
  const btnFirst = qs("#cv-select-50");
  const btnBest  = qs("#cv-select-best");
  if (btnFirst) btnFirst.textContent = `✅ First ${getSendCap()}`;
  if (btnBest)  btnBest.textContent  = `🏆 Best ${getSendCap()}`;
}
  
  // ========= MAIN RENDER =========
  async function renderDwarfsCave() {
    styleOnce();

    const container = document.getElementById("goblin-content");
    if (!container) return;
    Cave.el.container = container;

    container.innerHTML = `
      <div id="expedition-summary-block" style="margin-bottom:1.2rem; display:flex; gap:1.5rem; align-items:flex-start; flex-wrap:wrap;">
        <div style="flex:1 1 56%; min-width:320px;">
          <h3 class="cv-title">⛏️ Global Expeditions in Progress</h3>
          <div id="cv-toast-host" role="status" aria-live="polite"></div>
          <!-- 🔰 Canvas-Logo -->
          <div id="cv-logo-wrap" class="cv-logo-wrap">
            <canvas id="cv-logo-canvas"></canvas>
            <div id="cv-logo-toast" class="cv-logo-toast"></div>
          </div>
          <div id="cv-video-or-canvas" style="width:100%; margin-top:.5rem;">
            <canvas id="caveCanvas" style="width:80%; height:auto; display:block; border-radius:12px; box-shadow:0 0 10px #ffe600;"></canvas>
          </div>
        </div>
        <div style="flex:1 1 44%; min-width:280px;">
          <!-- 🌍 LIVE EXPEDITIONS -->
          <div id="cv-global-list" class="cv-card"
               style="margin-bottom:1rem; padding:1rem; border:1px solid #2b2b2b;
                      background:linear-gradient(180deg,#141414,#0d0d0d);
                      border-radius:14px; box-shadow:0 0 14px rgba(0,0,0,.45), inset 0 0 16px rgba(0,255,255,.08);">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.6rem;">
              <h4 style="color:#00e6ff; margin:0; font-family:Orbitron,system-ui,sans-serif;">🌍 Live Expeditions (in progress)</h4>
              <span title="Aggiornamento automatico"
                    style="font-size:.72rem; background:#152024; color:#7ff6ff; border:1px solid #20444a;
                           padding:.15rem .45rem; border-radius:999px;">auto refresh</span>
            </div>
            <!-- Le card delle spedizioni in corso vengono inserite via JS -->
          </div>
        
          <!-- ⛏️ RECENT RESULTS -->
          <div id="cv-recent-list" class="cv-card cv-card--amber"
               style="padding:1rem; border:1px solid #3a2e10; background:linear-gradient(180deg,#1a1405,#120d03); border-radius:14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.6rem;">
              <h4 style="color:#ffcc66; margin:0; font-family:Orbitron,system-ui,sans-serif;">⛏️ Latest Expedition Results</h4>
              <span style="font-size:.72rem; background:#2a2211; color:#ffcc66; border:1px solid #4a3a12; padding:.15rem .45rem; border-radius:999px;">last 10</span>
            </div>
            <div id="cv-recent-grid"
                 style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:.75rem; align-items:stretch;"></div>
            <div id="cv-recent-empty" style="display:none; margin-top:.5rem; color:#caa;">No results yet.</div>
          </div>
        
          <!-- 🎁 BONUS REWARDS -->
          <div id="cv-bonus-list" class="cv-card cv-card--green"
               style="margin-top:1rem; padding:1rem; border:1px solid #124a12; background:linear-gradient(180deg,#0d180d,#0a130a); border-radius:14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:.5rem; margin-bottom:.6rem;">
              <h4 style="color:#78ff78; margin:0; font-family:Orbitron,system-ui,sans-serif;">🎁 Latest Chest Rewards</h4>
              <span style="font-size:.72rem; background:#133113; color:#b7ffb7; border:1px solid #1f5220; padding:.15rem .45rem; border-radius:999px;">live</span>
            </div>
            <div id="cv-bonus-grid"
                 style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:.75rem; align-items:stretch;"></div>
          </div>
        
          <!-- ℹ️ INFO + CTA -->
          <div style="margin:.9rem 0 .2rem; text-align:center; color:#e9e3bf; font-size:.92rem;">
            ⏱️ <strong>Perk attempt:</strong> 1 every <strong>10 min</strong> per WAX account ·
            <span style="opacity:.9;">~50% chance to spawn a chest</span>
          </div>
        
          <div style="text-align:center; margin-bottom:1rem;">
            <button id="cv-chest-btn" class="cv-btn"
                    aria-label="Try to trigger a perk and drop a chest"
                    style="display:inline-flex; align-items:center; gap:.5rem; padding:.72rem 1.05rem; border-radius:12px;
                           border:1px solid #665200; background:linear-gradient(180deg,#ffe066,#ffbf00);
                           color:#1a1200; font-weight:800; letter-spacing:.2px;
                           box-shadow:0 4px 14px rgba(255,200,0,.25), inset 0 0 8px rgba(255,255,255,.35);
                           transition:transform .08s ease, box-shadow .2s ease; cursor:pointer;">
              <span>🎁 Try a Perk Drop</span>
            </button>

            <span id="cv-copy-overlay-wrap" style="display:none;">
              <button id="cv-copy-overlay" class="cv-btn" style="margin-left:.6rem; padding:.72rem 1.05rem;">
                📋 Copy to stream on Twitch
              </button>
            </span>
          
            <div style="font-size:.82rem; color:#cdbb7a; margin-top:.35rem;">Cooldown applies automatically.</div>
          </div>

          <!-- micro-hover inline senza CSS globali -->
          <script>
            (function(){
              const b = document.getElementById('cv-chest-btn');
              if(!b) return;
              b.addEventListener('mouseenter', ()=>{ b.style.transform='translateY(-1px)'; b.style.boxShadow='0 6px 20px rgba(255,200,0,.35), inset 0 0 10px rgba(255,255,255,.5)'; });
              b.addEventListener('mouseleave', ()=>{ b.style.transform='translateY(0)';      b.style.boxShadow='0 4px 14px rgba(255,200,0,.25), inset 0 0 8px rgba(255,255,255,.35)'; });
              b.addEventListener('mousedown',  ()=>{ b.style.transform='translateY(1px)';  });
              b.addEventListener('mouseup',    ()=>{ b.style.transform='translateY(-1px)'; });
            })();
          </script>
        </div>
      </div>

      <div class="cv-card" style="background:linear-gradient(135deg,#3e1f05,#140b02);
           border:2px solid #ffd700; color:#ffeabf; font-family:'Papyrus','Fantasy',cursive;
           font-size:1.05rem; line-height:1.6; box-shadow:0 0 25px #ffb800, inset 0 0 12px #ffa500;
           text-align:center; animation:flick 2s infinite alternate; letter-spacing:1px; text-shadow:1px 1px 2px #000;">
        🔥 Want to change your Goblin for another one with a different Ability?<br>
        <strong>Great!</strong> The next evolution is <u>coming THIS WEEK!!!</u>! #RotationPower
      </div>

      <div style="margin:1.2rem 0;"><p class="subtitle2">Select your goblins and start the expedition!</p></div>

      <div style="display:flex; flex-wrap:wrap; gap:1.5rem;">
        <div style="flex:1 1 76%; min-width:320px;">
		<div style="margin-bottom:1rem; display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; justify-content:center;">

		  <input id="cv-search" placeholder="Search name or ID…" 
				 style="background:#151515; border:1px solid #333; color:#eee; padding:.55rem .7rem; border-radius:10px; width:220px;">

		  <select id="cv-rarity" class="cv-btn" style="min-width:160px;">
			<option value="">All Rarities</option>
			<option>Common</option><option>Uncommon</option><option>Rare</option>
			<option>Epic</option><option>Legendary</option><option>Mythic</option>
		  </select>

		  <div style="display:flex; align-items:center; gap:.45rem;">
			<label for="cv-power" style="color:#ccc; font-size:.9rem;">Min Power</label>
			<input id="cv-power" type="range" min="0" max="100" step="1" value="0">
			<span id="cv-power-val" style="color:#0ff; font-size:.9rem;">0</span>
		  </div>

		  <div id="cv-sort-segment" style="display:flex; background:#1a1a1a; border:1px solid #333; border-radius:10px; overflow:hidden;">
			<button class="cv-btn" data-sort="rarity" style="border:none; border-right:1px solid #333;">Rarity</button>
			<button class="cv-btn" data-sort="level"  style="border:none; border-right:1px solid #333;">Level</button>
			<button class="cv-btn" data-sort="daily_power" style="border:none;">Power</button>
		  </div>

		  <!-- ⏳ NEW: Duration selector (5m → 24h) --><button class="cv-btn" id="cv-select-50">✅ First ${CURRENT_LIMIT}</button>
		  <button class="cv-btn" id="cv-select-best">🏆 Best ${CURRENT_LIMIT}</button>
		  <button class="cv-btn" id="cv-deselect">❌ Clear</button>

		  <!-- ℹ️ NEW: dynamic limit hint -->
		  <div id="cv-limit-hint" style="width:100%; text-align:center; margin-top:.35rem; color:#cdbb7a; font-size:.9rem;">
			Limit: <b>50</b> goblins per expedition. Each Reinforcement NFT adds <b>+5</b>, up to <b>250 Goblins for each expedition</b>.
		  </div>
		</div>

        <div id="cv-summary" class="cv-card" style="text-align:center;"></div>
        <div id="cv-active-filters" class="cv-row" style="justify-content:flex-start; flex-wrap:wrap; gap:.4rem; margin:.35rem 0;"></div>
        <div id="cv-goblin-list" style="display:flex; flex-direction:column; gap:.5rem;"></div>
        </div>
      </div>
    `;

    // cache elements
    Cave.el.toast = qs("#cv-toast-host", container);
    Cave.el.videoOrCanvas = qs("#cv-video-or-canvas", container);
    Cave.el.logoCanvas = qs("#cv-logo-canvas", container);
    if (Cave.el.logoCanvas) setupLogoCanvas(Cave.el.logoCanvas);
    Cave.el.globalList = qs("#cv-global-list", container);
    Cave.el.recentList = qs("#cv-recent-list", container);
    Cave.el.bonusList = qs("#cv-bonus-list", container);
    Cave.el.selectionSummary = qs("#cv-summary", container);
    Cave.el.goblinList = qs("#cv-goblin-list", container);
    Cave.el.chestPerkBtn = qs("#cv-chest-btn", container);
    renderSkeletons("#cv-bonus-grid", 6, 72);
    // assets
    loadAssets();
    //initDecorations();
    requestAnimationFrame(() => { bootRealtime(); });
    
    const initialCanvas = qs("#caveCanvas", Cave.el.videoOrCanvas);
    if (initialCanvas) {
      setupCanvas(initialCanvas);
      startRAF();
      startCommandPolling();
      if (window.GoblinCrash) GoblinCrash.init(Cave);
    }

    // ── BOOTSTRAP: fetch in parallelo, no blocchi tra loro ──
    const pAll    = API.post("/all_expeditions", {}, 10000);  // timeout più corto
    const pRecent = API.get("/recent_expeditions", 10000);

    // placeholder UI subito
    renderSkeletons("#cv-goblin-list", 8, 96);
    
    // risolvi senza bloccare la pagina se uno scade
    const [rAll, rRecent] = await Promise.allSettled([pAll, pRecent]);
    
    // 1) Live expeditions
    if (rAll.status === "fulfilled" && rAll.value?.ok) {
      await renderGlobalExpeditions(rAll.value.data); // <-- passiamo dati pre-caricati
    } else {
      // fallback: crea canvas e avvia loop comunque
      if (!qs("#caveCanvas", Cave.el.videoOrCanvas)) {
        Cave.el.videoOrCanvas.innerHTML = `<canvas id="caveCanvas" style="width:80%; height:auto; display:block; border-radius:12px; box-shadow:0 0 10px #ffe600;"></canvas>`;
        setupCanvas(qs("#caveCanvas", Cave.el.videoOrCanvas));
        startRAF();
        startCommandPolling();
        bootRealtime();
      }
    }
    
    // avvia refresh periodico (fetch “normale” come prima)
    if (Cave.intervals.global) clearInterval(Cave.intervals.global);
    Cave.intervals.global = setInterval(async ()=>{
      await renderGlobalExpeditions(); // userà il proprio fetch
    }, GLOBAL_REFRESH_MS);
    
    // 2) Recent expeditions
    if (rRecent.status === "fulfilled" && rRecent.value?.ok) {
      await renderRecentList(rRecent.value.data); // <-- passiamo dati pre-caricati
    } else {
      await renderRecentList(); // farà il proprio fetch con timeout ridotto
    }

    // 3) Goblin dell’utente (con retry singolo su /user_nfts)
    await loadUserNFTsWithSingleRetry();
	await refreshCurrentLimit();

    // chest perk button
    Cave.el.chestPerkBtn.onclick = async () => {
      if (READONLY) { toast("Overlay read-mode only.", "warn"); return; }

      const btn = Cave.el.chestPerkBtn; btn.disabled = true; btn.textContent = "Checking...";
      try {
        syncUserInto(Cave.user);
        assertAuthOrThrow(Cave.user);          
        const r = await API.post("/try_chest_perk", {
          wax_account: Cave.user.wax_account,
          user_id: Cave.user.user_id,
          usx_token: Cave.user.usx_token
        }, 12000);

        if (r.status === 429) toast(`⏳ Wait: ${r.data?.seconds_remaining}s until next perk try.`,"warn");
        else if (r.ok && r.data?.perk_awarded) {
          toast(`🎉 Perk "${r.data.perk_type.toUpperCase()}" dropped!`,"ok");
          triggerPerk(r.data.perk_type, Cave.user.wax_account);
        } else toast("😢 No perk awarded.","warn");
      } catch (e) {
        toast("❌ Error trying chest drop.","err");
      } finally { btn.disabled=false; btn.textContent="🎁 Try a Perk Drop"; }
    };
    
    function ensureCopyButtonVisibility(){
      // sincronizza i dati utente dalla memoria del sito (come fai altrove)
      syncUserInto(Cave.user);
      const wax = (Cave.user.wax_account || '').toLowerCase();
    
      const wrap = qs('#cv-copy-overlay-wrap', container);
      const btn  = qs('#cv-copy-overlay', container);
      if (!wrap || !btn) return;
    
      // mostra solo se in whitelist
      const allowed = COPY_BTN_WHITELIST.has(wax);
      wrap.style.display = 'inline-block'; //allowed ? 'inline-block' : 'none';
    
      // bind click una sola volta
      if (!btn._bound){ //allowed && !btn._bound
        btn._bound = true;
        btn.onclick = async () => {
          syncUserInto(Cave.user);
          const ud={wax_account:Cave.user.wax_account,user_id:Cave.user.user_id,usx_token:Cave.user.usx_token};
          const ud64=btoa(unescape(encodeURIComponent(JSON.stringify(ud))));
          const url = `${location.origin}/madverse/goblin_dex.html?overlay=1&readonly=1&obs=1&noticker=1&rot=12&ud=${ud64}`;
          try{
            await navigator.clipboard.writeText(url);
            toast('✅ Overlay URL copied. Paste it in OBS StreamLab ➜ Browser Source.', 'ok', 4000);
          }catch{
            prompt('Copy this URL to your StreamLab Overlay:', url);
          }
        };
      }
    }
    
    // 1) prova subito (se l'utente è già loggato verrà mostrato)
    ensureCopyButtonVisibility();
    
    // 2) riprova dopo il bootstrap dei dati utente/NFT (quando finiscono di caricarsi)
    setTimeout(ensureCopyButtonVisibility, 1500);
    
    // 3) riprova anche dopo il retry di /user_nfts (quando usi loadUserNFTsWithSingleRetry)
    document.addEventListener('cv:userdata-maybe-updated', ensureCopyButtonVisibility);
    // Quando /user_nfts popola Cave.nftIndex, rifaccio le cards live
    document.addEventListener('cv:userdata-maybe-updated', () => {
      try {
        if (Array.isArray(Cave.lastAllExpeditions) && Cave.lastAllExpeditions.length) {
          // Rerender immediato senza aspettare un nuovo fetch
          renderGlobalExpeditions(Cave.lastAllExpeditions);
        } else {
          // Se non ho cache locale, faccio il fetch normale
          renderGlobalExpeditions();
        }
      } catch (e) {
        console.warn('[cv:userdata-maybe-updated] rerender failed:', e);
      }
    });

    // Hydrate global winners (ultimi 10)
    try {
      const rw = await API.get("/recent_winners", 10000);
      if (rw.ok && Array.isArray(rw.data)) {
        renderBonusListFromBackend(rw.data);
      }
    } catch (e) {
      console.warn("recent_winners failed:", e);
    }
    // Copy overlay URL
    const copyBtn = qs('#cv-copy-overlay', container);
    if (copyBtn){
      copyBtn.onclick = async () => {
        syncUserInto(Cave.user);
        const ud={wax_account:Cave.user.wax_account,user_id:Cave.user.user_id,usx_token:Cave.user.usx_token};
        const ud64=btoa(unescape(encodeURIComponent(JSON.stringify(ud))));
        const url=`${location.origin}/madverse/goblin_dex.html?overlay=1&readonly=1&obs=1&noticker=1&rot=12&ud=${ud64}`;
        try{
          await navigator.clipboard.writeText(url);
          toast('✅ Overlay URL copied. Paste it in OBS StreamLab ➜ Browser Source.', 'ok', 4000);
        }catch{
          prompt('Copy this URL to your StreamLab Overlay:', url);
        }
      };
    }

    // if user expedition in progress
    try {
      syncUserInto(Cave.user);
      assertAuthOrThrow(Cave.user);        
      const s = await API.post("/expedition_status", {
        wax_account: Cave.user.wax_account,
        user_id: Cave.user.user_id,
        usx_token: Cave.user.usx_token
      }, 12000);
      if (s.status === 200) {
		refreshCurrentLimit();
        await renderUserCountdown(s.data.expedition_id, s.data.seconds_remaining, s.data.goblin_ids || []);
      }
    } catch {}
    observeContainerRemoval();
  }
  
  async function renderDwarfsCaveOverlay(){
    styleOnce();
    (function(){
      try{
        const qs=new URLSearchParams(location.search);
        const ud64=qs.get('ud');
        if(!ud64) return;
        const ud=JSON.parse(decodeURIComponent(escape(atob(ud64))));
        if(ud&&ud.wax_account&&ud.user_id&&ud.usx_token){
          window.userData=ud;
          localStorage.setItem('userData',JSON.stringify(ud));
          document.dispatchEvent(new CustomEvent('cv:userdata-ready'));
        }
      }catch{}
    })();

    const root = document.getElementById('overlay-root') || document.body;
    root.innerHTML = `
      <div id="overlay-shell">
        <div style="grid-column:1 / -1;">
          <div id="cv-logo-wrap" class="cv-logo-wrap">
            <canvas id="cv-logo-canvas"></canvas>
            <div id="cv-logo-toast" class="cv-logo-toast"></div>
          </div>
        </div>
    
        <div id="cv-video-or-canvas" class="cv-card" style="position:relative;">
          <div id="cv-toast-host" role="status" aria-live="polite"></div>
          <canvas id="caveCanvas"></canvas>
        </div>
    
        <aside id="cv-right" class="cv-card">
          <div id="cv-rotator">
            <section id="cv-panel-live" class="cv-rot-panel">
              <h4 class="cv-title" style="margin-top:0;">🌍 Live Expeditions</h4>
              <div id="cv-global-list"></div>
            </section>
    
            <section id="cv-panel-recent" class="cv-rot-panel" hidden>
              <div id="cv-recent-list">
                <div id="cv-recent-grid" class="cv-cards"></div>
              </div>
            </section>
    
            <section id="cv-panel-bonus" class="cv-rot-panel" hidden>
              <div id="cv-bonus-list"></div>
            </section>
          </div>
        </aside>
      </div>
    `;

    // cache UI minime
    Cave.el.toast        = qs('#cv-toast-host');
    Cave.el.videoOrCanvas= qs('#cv-video-or-canvas');
    const logoCanvas     = qs('#cv-logo-canvas');
    if (logoCanvas) setupLogoCanvas(logoCanvas);
    Cave.el.globalList   = qs('#cv-global-list');
    Cave.el.bonusList    = qs('#cv-bonus-list');
    Cave.el.recentList   = qs('#cv-recent-list');
    Cave.visible = true;

    // canvas
    setupCanvas(qs('#caveCanvas'));
    if (window.GoblinCrash) GoblinCrash.init(Cave);
    loadAssets();
    startRAF();
    bootRealtime()
    startRightPanelRotator();
    // primo fetch (overlay usa public se disponibile)
    const fetchAll = READONLY
      ? API.get('/public_all_expeditions', 12000)
      : API.post('/all_expeditions', {}, 12000);
  
    const [rAll, rRecent, rWin] = await Promise.allSettled([
      fetchAll,
      API.get('/recent_expeditions', 12000),
      API.get('/recent_winners', 12000)
    ]);
  
    if (rAll.status==='fulfilled' && rAll.value?.ok) await renderGlobalExpeditions(rAll.value.data);
    if (rWin.status==='fulfilled' && rWin.value?.ok)  renderBonusListFromBackend(rWin.value.data);
    if (rRecent.status==='fulfilled' && rRecent.value?.ok) await renderRecentList(rRecent.value.data);
  
    // aggiorna ticker righe
    Cave.tickerRecent  = (rRecent.status==='fulfilled' && rRecent.value?.ok && Array.isArray(rRecent.value.data)) ? rRecent.value.data : [];
    Cave.tickerWinners = (rWin.status==='fulfilled'    && rWin.value?.ok    && Array.isArray(rWin.value.data))    ? rWin.value.data    : [];
    updateTickerFromArrays(Cave.tickerRecent, Cave.tickerWinners, Cave.lastAllExpeditions||[]);
  
    // refresh periodico
    if (Cave.intervals.global) clearInterval(Cave.intervals.global);
    Cave.intervals.global = setInterval(async ()=>{
      try{
        const all = READONLY ? await API.get('/public_all_expeditions', 12000)
                             : await API.post('/all_expeditions', {}, 12000);
        const rec = await API.get('/recent_expeditions', 12000);
        const win = await API.get('/recent_winners', 12000);
        if (all.ok) await renderGlobalExpeditions(all.data);
        if (win.ok) { renderBonusListFromBackend(win.data); Cave.tickerWinners = win.data; }
        if (rec.ok) { await renderRecentList(rec.data); Cave.tickerRecent = rec.data; }
        updateTickerFromArrays(Cave.tickerRecent, Cave.tickerWinners, Cave.lastAllExpeditions||[]);
      }catch{}
    }, GLOBAL_REFRESH_MS);
  }


  // ========= VISIBILITY =========
  document.addEventListener("visibilitychange", () => {
    Cave.visible = !document.hidden;
    if (Cave.visible) {
      startCommandPolling();
      bootRealtime();
    } else {
      stopCommandPolling();
      stopRealtimePolling?.();     // ferma polling se presente
      closeRealtimeSSE?.();      
      // opzionale: accorcia le scie per evitare burst al rientro
      Cave.goblins.forEach(g => {
        if (Array.isArray(g.trail)) g.trail = g.trail.slice(0, 4);
      });
    }
  });
  
  document.addEventListener("visibilitychange", () => {
    bootRealtime();
  });

  // ========= EXPOSE =========
  window.renderDwarfsCave = renderDwarfsCave;
  window.renderDwarfsCaveOverlay = renderDwarfsCaveOverlay;
  
  // Avvio auto se siamo in overlay (richiede le costanti del Punto 1)
  if (OVERLAY_MODE) {
    renderDwarfsCaveOverlay();
  } else {
    renderDwarfsCave();
  }

})();






async function renderGoblinBlend() {
  const container = document.getElementById("goblin-content");
  if (!container) return;

  // --- small utils ---
  const esc = (v) => String(v ?? "").replace(/[&<>"'`]/g, m => (
    { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;", "`":"&#96;" }[m]
  ));
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const rarityOrder = { common:0, rare:1, epic:2, legendary:3, mythic:4 };

  // --- polished tab buttons (keep classes, add inline styles) ---
  const tabBase = `
    font-family: Orbitron, system-ui, sans-serif;
    display:inline-flex; align-items:center; gap:.55rem;
    border:1px solid rgba(255,255,255,.18);
    padding:.6rem 1.0rem; border-radius:14px; cursor:pointer;
    background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
    color:#eaeaea; letter-spacing:.15px; font-weight:800; font-size:.95rem;
    box-shadow:0 6px 18px rgba(0,0,0,.3), inset 0 0 0 rgba(255,255,255,0);
    transition:transform .12s ease, box-shadow .25s ease, border-color .25s ease, background .25s ease, color .2s ease;
    backdrop-filter: blur(6px);
  `;
  const tabActive = `
    background:linear-gradient(180deg, #171717, #0f0f0f);
    border-color: rgba(255, 230, 0, .55);
    color:#ffe600;
    box-shadow:0 8px 28px rgba(255,230,0,.22), inset 0 0 14px rgba(255,230,0,.18);
    transform: translateY(-1px);
  `;

  container.innerHTML = `
    <div role="tablist" aria-label="Blend Tabs"
         style="display:flex; justify-content:center; gap:.8rem; margin-bottom:1rem; flex-wrap:wrap;">
      <button id="tab-level" class="btn btn-glow active-tab" role="tab" aria-selected="true" tabindex="0"
              style="${tabBase}${tabActive}"
              onmouseenter="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 8px 24px rgba(255,230,0,.18)';"
              onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 18px rgba(0,0,0,.3)';">
        🔺 Level Upgrades
      </button>
      <button id="tab-rotation" class="btn btn-glow" role="tab" aria-selected="false" tabindex="-1"
              style="${tabBase}"
              onmouseenter="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 8px 24px rgba(255,230,0,.18)';"
              onmouseleave="this.style.transform='translateY(0)'; this.style.boxShadow='0 6px 18px rgba(0,0,0,.3)';">
        🌀 Slot Rotation
      </button>
    </div>

    <div id="tab-content" aria-live="polite">
      <div class="cv-skel" style="height:180px; border-radius:16px;"></div>
    </div>
  `;

  const tabContent   = document.getElementById("tab-content");
  const levelBtn     = document.getElementById("tab-level");
  const rotationBtn  = document.getElementById("tab-rotation");

  function setActiveTabStyles(activeId) {
    const set = (btn, isActive) => {
      btn.setAttribute("aria-selected", isActive ? "true" : "false");
      btn.tabIndex = isActive ? 0 : -1;
      btn.style.cssText = (isActive ? (tabBase + tabActive) : tabBase);
      // keep original classes intact: btn btn-glow (+ active-tab toggle)
      btn.classList.toggle("active-tab", isActive);
    };
    set(levelBtn, activeId === "tab-level");
    set(rotationBtn, activeId === "tab-rotation");
  }

  // keyboard nav within tablist
  container.querySelector('[role="tablist"]').addEventListener("keydown", (e) => {
    const tabs = [levelBtn, rotationBtn];
    const idx = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  });

  levelBtn.addEventListener("click", () => setActiveTab("level"));
  rotationBtn.addEventListener("click", () => setActiveTab("rotation"));

  async function setActiveTab(tabName) {
    setActiveTabStyles(tabName === "level" ? "tab-level" : "tab-rotation");
    tabContent.innerHTML = `
      <div class="cv-skel" style="height:180px; border-radius:16px;"></div>
    `;
    if (tabName === "level") await renderLevelUpgrades();
    else await renderSlotRotation();
  }

  // Activate initial tab
  await setActiveTab("level");

  // =========================
  // LEVEL UPGRADES
  // =========================
  async function renderLevelUpgrades() {
    tabContent.innerHTML = `
      <div class="cv-card"
           style="margin-bottom:1rem; padding:.9rem; background:linear-gradient(180deg,#101010,#0b0b0b);
                  border:1px solid var(--cv-border); border-radius:16px;">
        <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div style="color:#d7d7d7; max-width:820px; line-height:1.4;">
            <strong style="color:#ffe600;">How it works:</strong>
            Upgraders can be used to level up a Goblin of the <em>same rarity</em> and <em>same main specialty</em>.
            Filters below help you find craftable upgrades quickly.
          </div>
          <div style="display:flex; gap:.6rem;">
            <button id="blend-refresh" class="btn btn-glow" title="Reload blends">🔄 Refresh</button>
            <button id="blend-force" class="btn btn-glow" title="Force rebuild cache">⟳ Update</button>
          </div>
        </div>
      </div>

      <div id="blend-toolbar" class="cv-card"
           style="position:sticky; top:8px; z-index:30; margin-bottom:1rem; padding:.8rem;
                  backdrop-filter: blur(6px);
                  background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(12,12,12,.92));
                  border:1px solid var(--cv-border); border-radius:16px; box-shadow:0 8px 20px rgba(0,0,0,.35);">
        <div style="display:flex; flex-wrap:wrap; gap:.6rem; align-items:center; justify-content:center;">
          <input id="f-name" placeholder="🔎 Search name…" aria-label="Search by name"
                           style="background:#151515; border:1px solid #333; color:#eee; padding:.5rem .7rem; border-radius:10px; width:min(240px,100%); max-width:100%;">

          <select id="f-rarity" class="btn btn-glow" style="min-width:160px;" aria-label="Filter by rarity">
            <option value="">All Rarities</option>
            <option>Common</option><option>Rare</option><option>Epic</option><option>Legendary</option><option>Mythic</option>
          </select>
          <select id="f-attr" class="btn btn-glow" style="min-width:170px;" aria-label="Filter by main attribute">
            <option value="">Any Attribute</option>
            <option value="accuracy">Accuracy</option>
            <option value="resistance">Resistance</option>
            <option value="speed">Speed</option>
            <option value="loot-hungry">Loot-Hungry</option>
          </select>
          <input id="f-edition" type="number" min="1" placeholder="Edition"
                 style="width:120px; padding:.5rem .7rem; border-radius:10px; background:#151515; border:1px solid #333; color:#eee;">
          <input id="f-level" type="number" min="2" max="20" placeholder="Target Level"
                 style="width:130px; padding:.5rem .7rem; border-radius:10px; background:#151515; border:1px solid #333; color:#eee;">
          <label style="display:inline-flex; align-items:center; gap:.45rem; color:#ddd; user-select:none;">
            <input id="f-craftable" type="checkbox"> Only craftable
          </label>

          <div style="display:flex; background:#1a1a1a; border:1px solid #333; border-radius:10px; overflow:hidden;">
            <button class="btn btn-glow f-sort" data-k="progress" style="border:none; border-right:1px solid #333;">Progress</button>
            <button class="btn btn-glow f-sort" data-k="rarity" style="border:none; border-right:1px solid #333;">Rarity</button>
            <button class="btn btn-glow f-sort" data-k="level" style="border:none;">Level</button>
          </div>

          <select id="f-page" class="btn btn-glow" title="Items per page" aria-label="Items per page">
            <option value="12">12 / page</option>
            <option value="24">24 / page</option>
            <option value="48">48 / page</option>
          </select>
          <button id="f-reset" class="btn btn-glow" title="Clear filters">🔄 Reset</button>
        </div>
      </div>

      <div id="blend-summary" style="color:#9aa0a6; margin:.2rem 0 .8rem;"></div>
      <div id="blend-results"
                 style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; padding-bottom:2rem; width:100%; box-sizing:border-box;"></div>


      <div id="blend-pagination" style="display:flex; gap:.4rem; justify-content:center; margin-top:.6rem;"></div>
    `;

    const els = {
      refresh:  document.getElementById("blend-refresh"),
      force:    document.getElementById("blend-force"),
      name:     document.getElementById("f-name"),
      rarity:   document.getElementById("f-rarity"),
      attr:     document.getElementById("f-attr"),
      edition:  document.getElementById("f-edition"),
      level:    document.getElementById("f-level"),
      craft:    document.getElementById("f-craftable"),
      sortBtns: Array.from(tabContent.querySelectorAll(".f-sort")),
      pageSel:  document.getElementById("f-page"),
      reset:    document.getElementById("f-reset"),
      summary:  document.getElementById("blend-summary"),
      grid:     document.getElementById("blend-results"),
      pager:    document.getElementById("blend-pagination"),
    };

    const state = {
      q: "", rarity: "", attr: "", edition: null, level: null, onlyCraft: false,
      sortKey: "progress", sortAsc: false, page: 1, pageSize: 12,
      data: []
    };

    // Data fetchers
    async function fetchBlendData(force = false) {
      const payload = {
        wax_account: window.userData?.wax_account,
        user_id:     window.userData?.userId,
        usx_token:   window.userData?.usx_token,
        ...(force ? { force_update: true } : {})
      };
      const res = await fetch(`${BASE_URL}/get_blend_data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    // Filter + sort helpers
    const apply = debounce(() => { state.page = 1; render(); }, 150);

    els.name.addEventListener("input", () => { state.q = els.name.value.trim().toLowerCase(); apply(); });
    els.rarity.addEventListener("change", () => { state.rarity = els.rarity.value; apply(); });
    els.attr.addEventListener("change", () => { state.attr = els.attr.value; apply(); });
    els.edition.addEventListener("input", () => { state.edition = Number(els.edition.value) || null; apply(); });
    els.level.addEventListener("input", () => { state.level = Number(els.level.value) || null; apply(); });
    els.craft.addEventListener("change", () => { state.onlyCraft = !!els.craft.checked; apply(); });
    els.pageSel.addEventListener("change", () => { state.pageSize = Number(els.pageSel.value) || 12; render(); });

    els.reset.addEventListener("click", () => {
      state.q = ""; els.name.value = "";
      state.rarity = ""; els.rarity.value = "";
      state.attr = ""; els.attr.value = "";
      state.edition = null; els.edition.value = "";
      state.level = null; els.level.value = "";
      state.onlyCraft = false; els.craft.checked = false;
      state.sortKey = "progress"; state.sortAsc = false;
      state.page = 1; state.pageSize = 12;
      render();
    });

    els.sortBtns.forEach(b => {
      b.addEventListener("click", () => {
        const k = b.dataset.k;
        if (state.sortKey === k) state.sortAsc = !state.sortAsc;
        else { state.sortKey = k; state.sortAsc = (k !== "progress"); }
        render();
      });
    });

    els.refresh.addEventListener("click", async () => {
      try {
        els.refresh.disabled = true;
        const data = await fetchBlendData(false);
        state.data = Array.isArray(data) ? data : [];
        render();
      } catch (e) {
        toastError("Failed to load blends data.");
      } finally {
        els.refresh.disabled = false;
      }
    });

    els.force.addEventListener("click", async () => {
      els.grid.innerHTML = `<p style="color:#0ff;">Updating...</p>`;
      try {
        const data = await fetchBlendData(true);
        state.data = Array.isArray(data) ? data : [];
        render();
      } catch (e) {
        toastError("❌ Failed to update.");
      }
    });

    function toastError(msg) {
      els.grid.innerHTML = `<div class="cv-card" style="padding:.9rem; border-radius:14px; color:#ff7b7b;">${esc(msg)}</div>`;
    }

    // logic helpers
    function coverageOf(blend) {
      // min( owned/needed ) across ingredients; returns [ratio 0..1, ownedSum, needSum]
      if (!Array.isArray(blend?.ingredients) || blend.ingredients.length === 0) return [0,0,0];
      let minRatio = 1, ownedSum = 0, needSum = 0;
      for (const ing of blend.ingredients) {
        const need = Number(ing.needed || ing.quantity || 0);
        const own  = Number(ing.owned || 0);
        needSum += need; ownedSum += Math.min(own, need);
        const r = need ? (own / need) : 1;
        minRatio = Math.min(minRatio, r);
      }
      return [Math.max(0, Math.min(1, minRatio)), ownedSum, needSum];
    }

    function filt(list) {
      const q = state.q;
      const rar = (state.rarity || "").toLowerCase();
      const attr = (state.attr || "").toLowerCase();
      const ed = state.edition;
      const lvl = state.level;

      return list.filter(b => {
        if (q && !String(b.name || "").toLowerCase().includes(q)) return false;
        if (rar && String(b.rarity || "").toLowerCase() !== rar) return false;
        if (attr) {
          const m = String(b.main_attr || "").toLowerCase();
          if (m !== attr) return false;
        }
        if (ed && Number(b.edition || 0) !== ed) return false;
        if (lvl && Number(b.level || 0) !== lvl) return false;
        if (state.onlyCraft && !b.can_blend) return false;
        return true;
      });
    }

    function sortList(list) {
      const sk = state.sortKey, asc = state.sortAsc;
      return list.slice().sort((a, b) => {
        if (sk === "progress") {
          const [ra] = coverageOf(a), [rb] = coverageOf(b);
          return asc ? (ra - rb) : (rb - ra);
        }
        if (sk === "rarity") {
          const av = rarityOrder[String(a.rarity || "").toLowerCase()] ?? 99;
          const bv = rarityOrder[String(b.rarity || "").toLowerCase()] ?? 99;
          return asc ? (av - bv) : (bv - av);
        }
        if (sk === "level") {
          const av = Number(a.level || 0), bv = Number(b.level || 0);
          return asc ? (av - bv) : (bv - av);
        }
        return 0;
      });
    }

    function paginate(list) {
      const start = (state.page - 1) * state.pageSize;
      return list.slice(start, start + state.pageSize);
    }

    function ingredientRow(ing) {
      const need = Number(ing.needed || ing.quantity || 0);
      const own  = Number(ing.owned  || 0);
      const done = own >= need;
      const color = done ? "#8cff8c" : (own > 0 ? "#ffcc66" : "#ff7b7b");
      const ids = Array.isArray(ing.asset_ids) && ing.asset_ids.length ? ing.asset_ids.join(", ") : "";
      const copyBtn = ids ? `<button class="btn btn-glow" data-copy="${esc(ids)}"
                                style="padding:.25rem .45rem; font-size:.8rem; flex:0 0 auto;">Copy IDs</button>` : "";
      return `
        <li style="display:flex; flex-wrap:wrap; align-items:center; gap:.45rem; margin:.25rem 0; color:${color}; font-size:.9rem; width:100%; box-sizing:border-box;">
          <span style="min-width:72px; text-align:right;">${own}/${need}</span>
          <span style="opacity:.85;">(schema: ${esc(ing.schema_name)}, tpl: ${esc(ing.template_id)})</span>
          ${ids ? `<span style="color:#9aa0a6; font-size:.85rem; display:block; max-width:100%; white-space:normal; word-break:break-word; overflow-wrap:anywhere;">• IDs: ${esc(ids)}</span>` : ""}
          ${copyBtn}
        </li>
      `;
    }

    function card(blend) {
      const [ratio, ownedSum, needSum] = coverageOf(blend); // 0..1
      const pct = Math.round(ratio * 100);
      const can = !!blend.can_blend;
      const barColor = can ? "linear-gradient(90deg,#25ff8a,#00e0a4)" : "linear-gradient(90deg,#ffb347,#ffcc66)";
      const status = can ? "Ready to blend" : (pct > 0 ? "Partially ready" : "Missing ingredients");

      const disabled = can ? "" : "opacity:.6; pointer-events:none;";
      const title = can ? "Open on NeftyBlocks" : "You don't have all required ingredients yet";

      const headTip = `Rarity: ${blend.rarity} • Level: ${blend.level}` + (blend.edition ? ` • Edition: ${blend.edition}` : "");
      const attrTip = blend.main_attr ? `Main attribute: ${blend.main_attr}` : "";

      const ingredients = Array.isArray(blend.ingredients) ? blend.ingredients.map(ingredientRow).join("") : "";

      return `
        <div class="cv-card" style="padding:.9rem; border-radius:16px; background:linear-gradient(180deg,#0f0f0f,#161616);
                                             border:1px solid var(--cv-border); box-shadow:0 8px 22px rgba(0,0,0,.35);
                                             max-width:100%; width:100%; overflow:hidden; box-sizing:border-box;">
          <div style="display:flex; gap:.8rem;">
            <img src="${esc(blend.img)}" alt="${esc(blend.name)}" loading="lazy"
                 style="width:86px; height:86px; border-radius:12px; object-fit:cover;
                        outline:1px solid var(--cv-border); box-shadow:0 3px 10px rgba(0,0,0,.35);">
            <div style="flex:1 1 auto; min-width:0;">
              <div title="${esc(headTip)}"
                   style="display:flex; align-items:center; justify-content:space-between; gap:.6rem;">
                <strong style="color:#ffe600; font-family:Orbitron,system-ui,sans-serif; font-size:1.05rem;
                               white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${esc(blend.name)}
                </strong>
                ${blend.main_attr ? `<span class="cv-badge" title="${esc(attrTip)}">${esc(blend.main_attr)}</span>` : ""}
              </div>

              <div style="display:flex; gap:.55rem; flex-wrap:wrap; margin:.35rem 0; color:#cfcfcf; font-size:.9rem;">
                <span class="cv-badge">Rarity: ${esc(blend.rarity)}</span>
                <span class="cv-badge">Level: ${esc(blend.level)}</span>
                ${blend.edition ? `<span class="cv-badge">Edition: ${esc(blend.edition)}</span>` : ""}
              </div>

              <div class="cv-meter" title="${pct}% • ${ownedSum}/${needSum} items">
                <div style="width:${pct}%; background:${barColor};"></div>
              </div>
              <div style="margin-top:.35rem; font-size:.88rem; color:${can ? '#8cff8c' : (pct>0 ? '#ffcc66' : '#ff7b7b')};">
                ${esc(status)} • ${ownedSum}/${needSum} ingredients
              </div>
            </div>
          </div>

          <div style="margin-top:.6rem;">
            <strong style="color:#ffe600;">🔹 Ingredients</strong>
            <ul style="list-style:none; padding-left:0; margin:.45rem 0 0; word-break:break-word; overflow-wrap:anywhere;">
              ${ingredients}
            </ul>
          </div>

          <div style="display:flex; gap:.6rem; justify-content:flex-end; margin-top:.8rem;">
            <a href="${esc(blend.blend_link)}" target="_blank" rel="noopener"
               class="btn btn-glow" title="${esc(title)}"
               style="padding:.45rem 1rem; font-size:.95rem; ${disabled}">🧪 Blend @NeftyBlocks</a>
          </div>
        </div>
      `;
    }

    function renderPager(total) {
      const pages = Math.max(1, Math.ceil(total / state.pageSize));
      state.page = Math.min(state.page, pages);
      els.pager.innerHTML = Array.from({ length: pages }).map((_, i) => {
        const p = i + 1;
        const on = p === state.page ? "background:#2a2a2a; color:#ffe600;" : "";
        return `<button data-p="${p}" class="btn btn-glow" style="padding:.35rem .7rem; ${on}">${p}</button>`;
      }).join("");
      els.pager.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          state.page = Number(b.dataset.p) || 1;
          render();
          els.grid.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }

    function hydrateCopyButtons(scope) {
      scope.querySelectorAll("[data-copy]").forEach(btn => {
        btn.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(btn.dataset.copy);
            btn.textContent = "Copied!";
            setTimeout(() => (btn.textContent = "Copy IDs"), 900);
          } catch {
            btn.textContent = "Copy failed";
            setTimeout(() => (btn.textContent = "Copy IDs"), 900);
          }
        });
      });
    }

    function renderSummary(raw, filtered) {
      const total = raw.length;
      const shown = filtered.length;
      const craftable = filtered.filter(b => b.can_blend).length;
      els.summary.innerHTML = `
        <span style="margin-right:.8rem;">Results: <strong>${shown}</strong> / ${total}</span>
        <span>Craftable now: <strong style="color:#8cff8c;">${craftable}</strong></span>
      `;
    }

    function render() {
      const f = filt(state.data);
      const s = sortList(f);
      renderSummary(state.data, s);
      renderPager(s.length);
      const page = paginate(s);
      els.grid.innerHTML = page.map(card).join("") || `<div class="cv-card" style="padding:.9rem;">No results.</div>`;
      hydrateCopyButtons(els.grid);
    }

    // initial load
    try {
      state.data = await fetchBlendData(false);
      render();
    } catch (err) {
      els.grid.innerHTML = `<div style="color:#ff7b7b;">Failed to load blends data.</div>`;
    }
  }

  // =========================
  // SLOT ROTATION
  // =========================
  async function renderSlotRotation() {
    tabContent.innerHTML = `
      <div class="cv-card" style="margin-bottom:1rem; padding:.9rem; border-radius:16px;
                                  background:linear-gradient(180deg,#101010,#0b0b0b); border:1px solid var(--cv-border);">
        <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div style="color:#d7d7d7; max-width:820px; line-height:1.4;">
            <strong style="color:#7ff6ff;">Rotation basics:</strong>
            Rotators allow you to switch a Goblin to the <em>next ability</em> in its cycle.
            The exact recipes and required items are listed below when available.
          </div>
          <button id="rot-refresh" class="btn btn-glow" title="Reload rotation data">🔄 Refresh</button>
        </div>
      </div>

      <div id="rot-body" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:1rem; width:100%; box-sizing:border-box;"></div>
      <div id="rot-fallback" style="margin-top:1rem;"></div>
    `;

    const rotBody = document.getElementById("rot-body");
    const rotFallback = document.getElementById("rot-fallback");
    const rotRefresh = document.getElementById("rot-refresh");

    async function fetchRotationData() {
      const payload = {
        wax_account: window.userData?.wax_account,
        user_id:     window.userData?.userId,
        usx_token:   window.userData?.usx_token
      };
      const res = await fetch(`${BASE_URL}/get_rotations_data`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }

    function renderFromData(data) {
      rotBody.innerHTML = "";
      rotFallback.innerHTML = "";

      // Try to render common shapes; otherwise show formatted JSON as fallback
      if (Array.isArray(data) && data.length) {
        rotBody.innerHTML = data.map((row, i) => {
          const from = row.from || row.source || row.current || "";
          const to   = row.to   || row.target || row.next    || "";
          const need = Array.isArray(row.ingredients || row.requirements) ? (row.ingredients || row.requirements) : [];
          const reqList = need.map(n => {
            const qty = Number(n.quantity || n.needed || 1);
            const nm  = n.name || n.template_id || "Item";
            return `<li style="margin:.25rem 0; color:#cfcfcf;">${qty} × ${esc(nm)}</li>`;
          }).join("");

          return `
            <div class="cv-card" style="padding:1rem; border-radius:16px; background:linear-gradient(180deg,#0f0f0f,#161616);
                                                     border:1px solid var(--cv-border); max-width:100%; width:100%; overflow:hidden; box-sizing:border-box;">
              <div style="display:flex; gap:.8rem; align-items:center; justify-content:space-between;">
                <strong style="color:#7ff6ff; overflow-wrap:anywhere; word-break:break-word; max-width:100%; display:block;">${esc(from)} ➜ ${esc(to)}</strong>
              </div>
              ${reqList ? `
                <div style="margin-top:.5rem;">
                  <strong style="color:#ffe600;">Ingredients</strong>
                  <ul style="list-style:none; padding-left:0; margin:.35rem 0 0;">${reqList}</ul>
                </div>
              ` : ``}
            </div>
          `;
        }).join("");
      } else {
        rotFallback.innerHTML = `
          <div class="cv-card" style="padding:.9rem; border-radius:16px;">
            <h3 style="margin:0 0 .6rem 0;">Raw rotation data</h3>
            <pre style="white-space:pre-wrap; color:#ddd; background:#0f0f0f; padding:.7rem; border-radius:12px; border:1px solid #222;">
${esc(JSON.stringify(data, null, 2))}
            </pre>
          </div>
        `;
      }
    }

    async function load() {
      rotBody.innerHTML = `<div class="cv-skel" style="height:140px; border-radius:16px;"></div>`;
      try {
        const data = await fetchRotationData();
        renderFromData(data);
      } catch (err) {
        rotBody.innerHTML = `<div style="color:#ff7b7b;">❌ Failed to load slot rotation data.</div>`;
      }
    }

    rotRefresh.addEventListener("click", load);
    await load();
  }
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

async function renderGoblinHistory() {
  const container = document.getElementById('goblin-content');
  container.innerHTML = `
    <p style="
      font-family: 'Rock Salt', cursive;
      text-transform: uppercase;
      font-size: 1rem;
      color: #ffe600;
      margin-top: 1rem;
      white-space: nowrap;
      overflow: hidden;
      border-right: 2px solid #ffe600;
      display: inline-block;
      animation: typing 3.5s steps(50, end), blink 1s step-end infinite;
      position: relative;
    ">
      Travel back in time — Track your goblin deeds, blends, and victories!
      <span style="
        position: absolute;
        left: 0;
        bottom: -4px;
        height: 2px;
        width: 0;
        background: #f39c12;
        animation: underlineSlide 2.5s ease-in-out 3s forwards;
      "></span>
    </p>
    <div id="history-table-container" style="margin-top: 2rem;"></div>
  `;

  const tableContainer = document.getElementById('history-table-container');

  try {
    const res = await fetch(`${BASE_URL}/user_expedition_history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wax_account: window.userData.wax_account })
    });

    if (!res.ok) throw new Error("Failed to fetch history");

    const history = await res.json();

    if (!history.length) {
      tableContainer.innerHTML = `<p style="color:#ccc;">No expedition history since July 7, 2025.</p>`;
      return;
    }

    let table = `
      <table style="
        width: 100%;
        border-collapse: collapse;
        font-family: Orbitron, sans-serif;
        color: #fff;
        box-shadow: 0 0 10px #ffe600;
        border-radius: 12px;
        overflow: hidden;
      ">
        <thead>
          <tr style="background: #222;">
            <th style="padding: 0.75rem;">#</th>
            <th style="padding: 0.75rem;">Date</th>
            <th style="padding: 0.75rem;">Duration</th>
            <th style="padding: 0.75rem;">CHIPS</th>
            <th style="padding: 0.75rem;">NFTs</th>
            <th style="padding: 0.75rem;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${history.map((h, i) => {
            const date = new Date(h.start_time).toLocaleString();
            return `
              <tr style="background: ${i % 2 === 0 ? '#111' : '#1c1c1c'};">
                <td style="padding: 0.6rem; text-align: center;">${h.expedition_id}</td>
                <td style="padding: 0.6rem;">${date}</td>
                <td style="padding: 0.6rem; text-align: center;">${formatDuration(h.duration_minutes)}</td>
                <td style="padding: 0.6rem; color: #0f0; text-align: center;">${h.chips}</td>
                <td style="padding: 0.6rem; color: #ffa500; text-align: center;">${h.nfts}</td>
                <td style="padding: 0.6rem; text-align: center;">${h.status}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    tableContainer.innerHTML = table;

  } catch (err) {
    console.error("❌ Error in renderGoblinHistory:", err);
    tableContainer.innerHTML = `<p style="color:#f44;">Failed to load history data.</p>`;
  }
}

const PAGE_SIZE = 100;
let fullData = [];
let filteredData2 = [];
let currentPage = 1;

async function renderGoblinHallOfFame() {
  const container = document.getElementById('goblin-content');
  container.innerHTML = `
    <p style="
      font-family: 'Rock Salt', cursive;
      text-transform: uppercase;
      font-size: 1rem;
      color: #ffe600;
      margin-top: 1rem;
      white-space: nowrap;
      overflow: hidden;
      border-right: 2px solid #ffe600;
      display: inline-block;
      animation: typing 3.5s steps(50, end), blink 1s step-end infinite;
      position: relative;
    ">
      Bow before legends — Only the most epic goblins make it to the Hall of Fame!
      <span style="
        position: absolute;
        left: 0;
        bottom: -4px;
        height: 2px;
        width: 0;
        background: #f39c12;
        animation: underlineSlide 2.5s ease-in-out 3s forwards;
      "></span>
    </p>

    <div style="margin: 1rem 0; display: flex; gap: 1rem; flex-wrap: wrap;">
      <label>
        Filter by Owner:
        <select id="owner-filter">
          <option value="">All</option>
        </select>
      </label>
      <label>
        Filter by Goblin ID:
        <select id="goblin-filter">
          <option value="">All</option>
        </select>
      </label>
    </div>

    <div id="hof-table-container"></div>
    <div id="pagination-controls" style="margin-top: 1rem; text-align: center;"></div>
  `;

  const tableContainer = document.getElementById("hof-table-container");

  try {
    const res = await fetch(`${BASE_URL}/goblin_hall_of_fame`);
    if (!res.ok) throw new Error("Failed to fetch Hall of Fame data");

    const hof = await res.json();
    if (!hof.length) {
      tableContainer.innerHTML = `<p style="color:#ccc;">No goblins have made it to the Hall of Fame yet.</p>`;
      return;
    }

    // Ordinamento
    hof.sort((a, b) =>
      b.total_chips - a.total_chips ||
      b.total_nfts - a.total_nfts ||
      b.avg_chips_per_exp - a.avg_chips_per_exp ||
      b.nfts_per_exp - a.nfts_per_exp ||
      b.win_rate - a.win_rate ||
      b.expeditions_count - a.expeditions_count
    );

    fullData = hof;
    populateFilters2(hof);
    applyFiltersAndRender2();

    document.getElementById("owner-filter").addEventListener("change", () => {
      currentPage = 1;
      applyFiltersAndRender2();
    });

    document.getElementById("goblin-filter").addEventListener("change", () => {
      currentPage = 1;
      applyFiltersAndRender2();
    });

  } catch (err) {
    console.error("[renderGoblinHallOfFame] Error:", err);
    tableContainer.innerHTML = `<p style="color:#f44;">Failed to load Hall of Fame.</p>`;
  }
}

function populateFilters2(data) {
  const ownerSet = new Set();
  const goblinSet = new Set();
  data.forEach(g => {
    ownerSet.add(g.owner);
    goblinSet.add(g.goblin_id);
  });

  const ownerFilter = document.getElementById("owner-filter");
  [...ownerSet].sort().forEach(o => {
    const opt = document.createElement("option");
    opt.value = o;
    opt.textContent = o;
    ownerFilter.appendChild(opt);
  });

  const goblinFilter = document.getElementById("goblin-filter");
  [...goblinSet].sort((a, b) => a - b).forEach(gid => {
    const opt = document.createElement("option");
    opt.value = gid;
    opt.textContent = gid;
    goblinFilter.appendChild(opt);
  });
}

function applyFiltersAndRender2() {
  const owner = document.getElementById("owner-filter").value;
  const goblinId = document.getElementById("goblin-filter").value;

  filteredData2 = fullData.filter(g =>
    (!owner || g.owner === owner) &&
    (!goblinId || String(g.goblin_id) === goblinId)
  );

  renderTablePage2();
  renderPaginationControls2();
}

function renderTablePage2() {
  const tableContainer = document.getElementById("hof-table-container");
  const waxAccount = window.userData?.wax_account || null;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filteredData2.slice(start, start + PAGE_SIZE);

  const rows = pageItems.map((gob, i) => {
    const index = start + i;
    const isUserGoblin = waxAccount && gob.owner === waxAccount;
    const rowStyle = isUserGoblin
      ? `background: #1a1; font-weight: bold; border: 2px solid #0f0;
         box-shadow: 0 0 10px #0f0, 0 0 20px #0f0;
         animation: pulse 1.5s infinite alternate ease-in-out;`
      : `background: ${index % 2 === 0 ? '#111' : '#1a1a1a'};`;

    const placeMedal =
      index === 0 ? "🥇" :
      index === 1 ? "🥈" :
      index === 2 ? "🥉" : `${index + 1}`;

    return `
      <tr style="${rowStyle}">
        <td style="padding: 0.6rem; text-align: center;">${placeMedal}</td>
        <td style="padding: 0.6rem; text-align: center;">${gob.goblin_id}</td>
        <td style="padding: 0.6rem; text-align: center;">${gob.owner}</td>
        <td style="padding: 0.6rem; text-align: center;">${gob.expeditions_count}</td>
        <td style="padding: 0.6rem; text-align: center;">${gob.wins}</td>
<td style="padding: 0.6rem; text-align: center;">${((gob.win_rate ?? 0) * 100).toFixed(1)}%</td>


        <td style="padding: 0.6rem; color: #0f0; text-align: center;">${gob.total_chips}</td>
<td style="padding: 0.6rem; text-align: center;">${(gob.avg_chips_per_exp ?? 0).toFixed(2)}</td>

        <td style="padding: 0.6rem; color: #ffa500; text-align: center;">${gob.total_nfts}</td>
<td style="padding: 0.6rem; text-align: center;">${(gob.nfts_per_exp ?? 0).toFixed(2)}</td>
      </tr>
    `;
  }).join("");

  const table = `
    <table style="
      width: 100%;
      border-collapse: collapse;
      font-family: Orbitron, sans-serif;
      color: #fff;
      box-shadow: 0 0 10px #ffe600;
      border-radius: 12px;
      overflow: hidden;
    ">
      <thead>
        <tr style="background: #222;">
          <th style="padding: 0.75rem;">#</th>
          <th style="padding: 0.75rem;">Goblin ID</th>
          <th style="padding: 0.75rem;">Owner</th>
          <th style="padding: 0.75rem;">Expeditions</th>
          <th style="padding: 0.75rem;">Wins</th>
          <th style="padding: 0.75rem;">Win %</th>
          <th style="padding: 0.75rem;">CHIPS</th>
          <th style="padding: 0.75rem;">CHIPS/EXP</th>
          <th style="padding: 0.75rem;">NFTs</th>
          <th style="padding: 0.75rem;">NFTs/EXP</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  tableContainer.innerHTML = table;
}

function renderPaginationControls2() {
  const totalPages = Math.ceil(filteredData2.length / PAGE_SIZE);
  const container = document.getElementById("pagination-controls");

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let controls = "";

  for (let i = 1; i <= totalPages; i++) {
    controls += `
      <button onclick="changePage2(${i})" style="
        margin: 0 4px;
        padding: 6px 10px;
        background: ${i === currentPage ? '#ffe600' : '#333'};
        color: ${i === currentPage ? '#000' : '#fff'};
        border: none;
        border-radius: 4px;
        cursor: pointer;
      ">${i}</button>
    `;
  }

  container.innerHTML = controls;
}

function changePage2(page) {
  currentPage = page;
  renderTablePage2();
  renderPaginationControls2();
}

function setActiveTab(tabId) {
  document.querySelectorAll('.lp-tab').forEach(tab => tab.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
}

async function loadAccountSection() {
  const { userId, usx_token } = window.userData;
  const container = document.querySelector('.loading-message');
  const sectionsWrapper = document.getElementById('account-sections');

  try {
    // Caricamento dati da endpoint
    const userInfoRes = await fetch(`${BASE_URL}/account/info?user_id=${userId}&usx_token=${usx_token}`);
    const userInfo = await userInfoRes.json();

    const [
      telegramRewardsRes,
      twitchRewardsRes,
      activityRes
    ] = await Promise.all([
      fetch(`${BASE_URL}/account/telegram_rewards?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/twitch_rewards?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/activity?user_id=${userId}&usx_token=${usx_token}`)
    ]);

    window.accountData = {
      userInfo,
      telegram: await telegramRewardsRes.json(),
      twitch: await twitchRewardsRes.json(),
      activity: await activityRes.json(),
    };

    // Mostra loader almeno 5 secondi
    await new Promise(resolve => setTimeout(resolve, 5000));

    container.classList.add('hidden');
    sectionsWrapper.style.display = 'block';

    renderPersonalInfo(window.accountData.userInfo);
    renderChatRewards(window.accountData.telegram, window.accountData.twitch);
    renderRecentActivity(window.accountData.activity);

  } catch (err) {
    container.innerHTML = `<div class="error-message">❌ Error loading account data: ${err.message}</div>`;
    console.error("[❌] Error loading account:", err);
  }
}

function renderAccountSubsection(sectionId) {
  const data = window.accountData;
  const wrapper = document.getElementById('account-sections');
  wrapper.innerHTML = ''; // pulisce tutto
  switch (sectionId) {
    case 'info':
      wrapper.innerHTML = `<div class="account-card2" id="personal-info"></div>`;
      renderPersonalInfo(data.userInfo);
      break;

    case 'chat':
      wrapper.innerHTML = `<div class="account-card2" id="chat-rewards"></div>`;
      renderChatRewards(data.telegram, data.twitch);
      break;

    case 'activity':
      wrapper.innerHTML = `<div class="account-card2" id="recent-activity"></div>`;
      renderRecentActivity(data.activity);
      break;

    default:
      wrapper.innerHTML = `<p>Section not found</p>`;
  }
}

async function renderDailyBox(data) {
  const boxImages = {
    wood: '📦 Wood',
    bronze: '🟤 Bronze',
    gold: '🟡 Gold',
    platinum: '💎 Platinum'
  };

  let html = `
    <p class="subtitle2">
      If you own the <strong>VIP Membership NFT</strong>, you can claim a Chest daily.<br>
      Chest types include <strong>Wood</strong>, <strong>Bronze</strong>, <strong>Gold</strong>, <strong>Platinum</strong>.<br>
      Will you get Tokens, NFTs, Evet-Tickets and more? You can also scroll the chests-blends ;)
    </p>
    <div class="mb-2">
      <span class="status-badge2 ${data.vip_active ? 'active2' : 'inactive2'}">
        ${data.vip_active ? 'VIP Active ✅' : 'VIP Inactive ❌'}
      </span>
    </div>
  `;

  // Caso: utente ha chests pending da aprire
  if (data.pending_chests && data.pending_chests.length > 0 && data.vip_active) {
    html += `
      <div class="box-results mt-3">
        <p>🚀 You have <strong>${data.pending_chests.length}</strong> chest(s) ready to open:</p>
        <div class="pending-chests-buttons" style="display:flex; flex-wrap:wrap; gap:1rem; margin-top:1rem;">
    `;

    data.pending_chests.forEach(chest => {
      html += `
        <button class="btn btn-primary btn-open-chest" data-chest-id="${chest.id}" data-chest-type="${chest.chest_type}" style="
          flex:1 1 180px;
          padding:1rem;
          border-radius:12px;
          box-shadow:0 0 10px #0ff;
          font-size:1rem;
          transition: all 0.3s ease;
        ">
          🎁 Open ${boxImages[chest.chest_type] || chest.chest_type} Chest
        </button>
      `;
    });

    html += `
        </div>
        <div id="chest-reveal-area" style="margin-top:2rem;"></div>
      </div>
    `;

  }
  if (!data.vip_active) {
    html += `
      <div class="box-results mt-3">
        <p class="intro-text">🚀 You don’t have <strong>VIP Membership NFT Pass</strong>! Get one to be able to open the chests.</p>
        <div class="pending-chests-buttons" style="display:flex; flex-wrap:wrap; gap:1rem; margin-top:1rem;">
    `;
  }
  if (data.last_opened_result) {
    // Caso: utente ha già aperto oggi → mostra risultato
    html += `
      <div class="box-results mt-3">
        <p style="font-size:1.1rem; color:#fff; margin-bottom:1rem;">
          ✅ Your last claimed chest: 
          <strong style="color:gold;">
            ${boxImages[data.last_opened_result?.chest_type] || data.last_opened_result?.chest_type}
          </strong>
        </p>
    
        <div class="box-items mt-2" style="
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 1.5rem;
          padding: 0.5rem;
        ">
          ${(data.last_opened_result?.items || []).map(item => `
            <div class="box-item card-glow" style="
              background: #1a1a1a;
              padding: 1rem;
              border-radius: 16px;
              text-align: center;
              transition: transform 0.2s ease, box-shadow 0.2s ease;
              border: 1px solid rgba(255,255,255,0.1);
              box-shadow: 0 2px 6px rgba(0,0,0,0.5);
              cursor: pointer;
            "
            onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 0 16px rgba(255,255,255,0.2)'"
            onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 6px rgba(0,0,0,0.5)'"
            >
              <img src="${item.media_url}" alt="${item.name}" style="
                max-width: 150px;
                height: auto;
                margin-bottom: 0.75rem;
                border-radius: 8px;
                box-shadow: 0 0 8px rgba(0,0,0,0.3);
              ">
    
              <div style="font-weight: bold; font-size: 1rem; color: #fff;">
                ${item.name}
              </div>
    
              <div style="font-size: 0.85rem; color: #ccc; margin-bottom: 0.25rem;">
                (${item.type})
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;


  } 
  if ((!data.pending_chests || data.pending_chests.length === 0)) {
    html += `
      <div class="box-results mt-3">
        <p>🚫 No chest available at the moment. Please check back tomorrow!</p>
      </div>
    `;
  }

  document.getElementById('daily-box').innerHTML = html;

  // UX: Se ci sono pending chests → abilita i bottoni
  document.querySelectorAll('.btn-open-chest').forEach(btn => {
    btn.addEventListener('click', async () => {
      const chestId = btn.getAttribute('data-chest-id');
      const chestType = btn.getAttribute('data-chest-type');

      btn.disabled = true;
      btn.innerText = `Opening ${chestType}...`;

      const revealRes = await fetch(`${BASE_URL}/daily_chest_reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: window.userData.userId,
          usx_token: window.userData.usx_token,
          wax_account: window.userData.wax_account,
          chest_id: chestId
        })
      });
      
      const revealData = await revealRes.json();
      
      // 🔥 Esegui questa in background senza attendere
      fetch(`${BASE_URL}/withdraw_chest_prizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: window.userData.userId,
          usx_token: window.userData.usx_token,
          wax_account: window.userData.wax_account,
          chest_id: chestId
        })
      });
      
      // 🔮 Mostra subito il modale, senza attendere withdraw
      showChestModal(
        revealData.chest_video,
        revealData.items,
        async () => {
          const dailyBoxRes = await fetch(`${BASE_URL}/daily_chest_open`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: window.userData.userId,
              usx_token: window.userData.usx_token,
              wax_account: window.userData.wax_account
            })
          });
          window.accountData.dailyBox = await dailyBoxRes.json();
          renderDailyBox(window.accountData.dailyBox);
        }
      );

  // --- AGGIUNGI QUESTO ---
    showChestModal(
      revealData.chest_video, 
      revealData.items,
      async () => {
        // onCloseCallback → reload della dailyBox section
        const dailyBoxRes = await fetch(`${BASE_URL}/daily_chest_open`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: window.userData.userId,
            usx_token: window.userData.usx_token,
            wax_account: window.userData.wax_account
          })
        });
        window.accountData.dailyBox = await dailyBoxRes.json();
        renderDailyBox(window.accountData.dailyBox);
      }
    );
  });
});
}

function parseDescription(description) {
  const result = [];

  // Se non inizia con 'Template ID:', ritorna la descrizione intera
  if (!description.startsWith('Template ID:')) {
    result.push(description);
    return result;
  }

  // Split della descrizione in parti
  const parts = description.split(/[|;]/);
  let templateIdFound = false;

  parts.forEach(part => {
    const [key, value] = part.split(':').map(x => x.trim());
    if (key === 'Template ID' && value) {
      result.push(`Template ID: ${value}`);
      templateIdFound = true;
    }
  });

  // Se per qualche motivo non è stato trovato il Template ID, restituisce la descrizione originale
  if (!templateIdFound) {
    result.push(description);
  }

  return result;
}

function showChestModal(videoUrl, rewards, onCloseCallback) {
  // Rimuovi eventuale modale precedente
  const oldModal = document.getElementById('chest-modal');
  if (oldModal) oldModal.remove();

  // Aggiungi animazioni CSS dinamicamente
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes shake {
      0% { transform: translate(0, 0); }
      10% { transform: translate(-10px, 0); }
      20% { transform: translate(10px, 0); }
      30% { transform: translate(-10px, 0); }
      40% { transform: translate(10px, 0); }
      50% { transform: translate(-10px, 0); }
      60% { transform: translate(10px, 0); }
      70% { transform: translate(-10px, 0); }
      80% { transform: translate(10px, 0); }
      90% { transform: translate(-10px, 0); }
      100% { transform: translate(0, 0); }
    }

    @keyframes glow-border {
      0% { box-shadow: 0 0 10px #0ff, 0 0 20px #0ff, 0 0 30px #0ff; }
      50% { box-shadow: 0 0 20px #0ff, 0 0 40px #0ff, 0 0 60px #0ff; }
      100% { box-shadow: 0 0 10px #0ff, 0 0 20px #0ff, 0 0 30px #0ff; }
    }
  `;
  document.head.appendChild(style);

  // Crea modale base
  const modal = document.createElement('div');
  modal.id = 'chest-modal';
  modal.style.position = 'fixed';
  modal.style.top = '0';
  modal.style.left = '0';
  modal.style.width = '100vw';
  modal.style.height = '100vh';
  modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
  modal.style.display = 'flex';
  modal.style.justifyContent = 'center';
  modal.style.alignItems = 'center';
  modal.style.zIndex = '9999';
  modal.style.flexDirection = 'column';
  modal.style.padding = '2rem';
  modal.style.boxSizing = 'border-box';

  // Contenitore interno
  const inner = document.createElement('div');
  inner.style.background = '#111';
  inner.style.padding = '1rem';
  inner.style.borderRadius = '12px';
  inner.style.maxWidth = '800px';
  inner.style.width = '100%';
  inner.style.display = 'flex';
  inner.style.flexDirection = 'column';
  inner.style.alignItems = 'center';
  inner.style.position = 'relative';
  inner.style.animation = 'shake 2s, glow-border 2s infinite';

  // Video
  const video = document.createElement('video');
  video.src = videoUrl;
  video.autoplay = true;
  video.controls = true;
  video.muted = true;
  video.style.borderRadius = '12px';
  video.style.marginBottom = '1rem';
  
  // ✅ Limiti responsive
  video.style.maxHeight = '40vh';
  video.style.maxWidth = '100%';
  video.style.height = 'auto';
  video.style.width = 'auto';
  inner.appendChild(video);

  // Area rewards (inizialmente nascosta)
  const rewardsArea = document.createElement('div');
  rewardsArea.style.display = 'none';
  rewardsArea.style.marginTop = '1rem';
  rewardsArea.style.width = '100%';
  rewardsArea.style.display = 'grid';
  rewardsArea.style.gridTemplateColumns = 'repeat(auto-fit, minmax(120px, 1fr))';
  rewardsArea.style.gap = '1rem';
  rewardsArea.style.justifyItems = 'center';

  inner.appendChild(rewardsArea);

  // Pulsante chiudi
  const closeButton = document.createElement('button');
  closeButton.innerText = '✅ Close and Reload';
  closeButton.className = 'btn btn-primary';
  closeButton.style.marginTop = '1rem';
  closeButton.style.display = 'none';
  closeButton.addEventListener('click', () => {
    modal.remove();
    style.remove(); // pulizia della style aggiunta
    if (typeof onCloseCallback === 'function') {
      onCloseCallback();
    }
  });
  inner.appendChild(closeButton);

  // Dopo 2s rimuovi l'effetto shake
  setTimeout(() => {
    inner.style.animation = 'glow-border 2s infinite';
  }, 2000);

  // Quando il video termina → mostra rewards
  video.addEventListener('ended', () => {
    // Popola rewards
    rewards.forEach(item => {
      const itemDiv = document.createElement('div');
      itemDiv.className = 'box-item card-glow';
      itemDiv.style.padding = '1rem';
      itemDiv.style.borderRadius = '12px';
      itemDiv.style.textAlign = 'center';
      itemDiv.style.transition = 'all 0.3s ease';
      itemDiv.style.background = '#222';
      itemDiv.style.width = '100%';
      itemDiv.style.maxWidth = '140px';
      itemDiv.style.boxSizing = 'border-box';
  
      // ❗ MANCAVA QUESTO
      const descriptionHtml = `<div style="font-size:0.9rem; color:#aaa;">${item.description}</div>`;
      itemDiv.innerHTML = `
        <img src="${item.media_url}" alt="${item.name}" style="max-width:100px; margin-bottom:0.5rem;">
        <div><strong>${item.name}</strong> (${item.type})</div>
      `;
  
      rewardsArea.appendChild(itemDiv);
    });
  
    rewardsArea.style.display = 'grid';
    closeButton.style.display = 'block';
  });

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

function showEmailEditForm(currentEmail) {
  const emailBlock = document.getElementById('email-block');

  emailBlock.innerHTML = `
    <form id="email-form">
      <label for="new-email" class="label">📧 New Email:</label>
      <input type="email" id="new-email" value="${currentEmail}" required placeholder="Enter new email..." />
      <button type="submit" class="small-btn">💾 Save</button>
      <button type="button" class="small-btn cancel" id="cancel-email-btn">✖ Cancel</button>
      <div id="email-feedback" class="form-feedback" style="margin-top: 8px;"></div>
    </form>
  `;

  const feedbackEl = document.getElementById('email-feedback');

  document.getElementById('cancel-email-btn').addEventListener('click', () => {
    renderPersonalInfo(window.accountData.userInfo); // ripristina
  });

  document.getElementById('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newEmail = document.getElementById('new-email').value;
    feedbackEl.innerHTML = '⏳ Updating...';
    feedbackEl.style.color = '#888';

    try {
      const res = await fetch(`${BASE_URL}/account/update_email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: window.userData.userId,
          usx_token: window.userData.usx_token,
          new_email: newEmail
        })
      });

      const result = await res.json();

      if (res.ok) {
        feedbackEl.innerHTML = '✅ Email updated successfully!';
        feedbackEl.style.color = 'limegreen';

        // aggiorna localmente
        window.accountData.userInfo.email = newEmail;

        // Dopo un breve delay, ricarica la sezione
        setTimeout(() => {
          renderPersonalInfo(window.accountData.userInfo);
        }, 1500);
      } else {
        feedbackEl.innerHTML = `❌ ${result.error || 'Unknown error.'}`;
        feedbackEl.style.color = 'crimson';
      }
    } catch (err) {
      feedbackEl.innerHTML = `❌ Failed to update email: ${err.message}`;
      feedbackEl.style.color = 'crimson';
    }
  });
}

function renderPersonalInfo(info) {
  const container = document.getElementById('personal-info');

  const sub = info.subscription;

  const subscriptionHTML = sub ? `
    <div style="margin-top: 20px; padding: 15px; border: 1px solid #44c4e7; border-radius: 10px; background-color: #101820; color: #e0f7fa;">
      <h3 style="margin-bottom: 10px;">📦 Active Subscription</h3>
      <p><span style="font-weight:bold;">📺 Channel:</span> ${sub.channel}</p>
      <p><span style="font-weight:bold;">📆 Term:</span> ${sub.subscription_term} (${sub.duration_months} month${sub.duration_months > 1 ? 's' : ''})</p>
      <p><span style="font-weight:bold;">🎯 Version:</span> ${sub.version}</p>
      <p><span style="font-weight:bold;">💸 Price (USD):</span> $${sub.price_usd} (${sub.discount_percent}% discount)</p>
      <p><span style="font-weight:bold;">🪙 Paid in WAX:</span> ${sub.paid_wax_amount} ${sub.token_symbol}</p>
      <p><span style="font-weight:bold;">💵 Value in USD:</span> ~$${sub.usd_value_estimated} @ ${sub.usd_to_wax_rate} USD/WAX</p>
      <p><span style="font-weight:bold;">🕒 Start:</span> ${sub.start_date}</p>
      <p><span style="font-weight:bold;">⏳ Expires:</span> ${sub.expiry_date}</p>
      <p><span style="font-weight:bold;">📌 Status:</span> <span style="color: ${sub.is_active ? '#00ff99' : '#ff6666'}; font-weight: bold;">${sub.is_active ? 'Active' : 'Expired'}</span></p>
      <p><span style="font-weight:bold;">📝 Memo:</span> <code>${sub.memo || 'N/A'}</code></p>
    </div>
  ` : `
    <div style="margin-top: 20px; padding: 15px; border: 1px dashed #aaa; border-radius: 10px; background-color: #1a1a1a; color: #ccc;">
      <h3 style="margin-bottom: 10px;">📦 Subscription</h3>
      <p>You don´t  own any Twitch-Channel with an active CryptoChips Sub. Consider to activate one. </p>
    </div>
  `;

  container.innerHTML = `
    <div class="card-glow">
      <h2 class="glow-text">👤 ${info.telegram_username || 'Unknown'}</h2>
      <p><span class="label">🎮 Twitch:</span> ${info.twitch_username || 'N/A'}</p>
      <p><span class="label">🔑 Wax Account:</span> <code>${info.wax_account}</code></p>
      <p><span class="label">🏅 Role:</span> <span class="role-tag">${info.role}</span></p>
      <p><span class="label">📈 Chips Staking Rank:</span> ${info.staking_rank ? `#${info.staking_rank}` : 'Out of Top 50'}</p>
      <p><span class="label">🧩 Chips NFTs Farm Staking Rank:</span> ${info.nft_rank ? `#${info.nft_rank}` : 'Out of Top 50'}</p>

      <div id="email-block">
        <p><span class="label">📧 Email:</span> <span id="email-text">${info.email || 'Not Set'}</span></p>
        <button class="small-btn" id="change-email-btn">✏️ Change Email</button>
      </div>

      ${subscriptionHTML}
    </div>
  `;

  const btn = document.getElementById('change-email-btn');
  btn.addEventListener('click', () => {
    showEmailEditForm(info.email || '');
  });
}

function renderChatRewards(telegram, twitch) {
  function renderBoosters(boosters, typeLabel, icon) {
    if (!boosters || boosters.length === 0) return `<p>No ${typeLabel} Boosters.</p>`;
  
    const marketplaceLinks = {
      common: "https://neftyblocks.com/collection/cryptochaos1/drops/219979",
      rare: "https://neftyblocks.com/collection/cryptochaos1/drops/219980",
      epic: "https://neftyblocks.com/collection/cryptochaos1/drops/219981",
      legendary: "https://neftyblocks.com/collection/cryptochaos1/drops/219983"
    };
  
    let totalFlatBoost = 0;
    let totalPercentBoost = 0;
  
    const capitalize = str => str.charAt(0).toUpperCase() + str.slice(1);
  
    const rows = boosters.map(b => {
      const singleBoost = b.boost.replace('%', '').replace('+', '');
      const isPercent = b.boost.includes('%');
      const numericBoost = parseFloat(singleBoost);
      const totalBoost = numericBoost * b.count;
  
      if (isPercent) {
        totalPercentBoost += totalBoost;
      } else {
        totalFlatBoost += totalBoost;
      }
  
      const rarityName = `${capitalize(b.type)} Chips Mining Amplifier`;
  
      return `
        <tr>
          <td><strong>${rarityName}</strong></td>
          <td>${b.count}</td>
          <td>${b.boost}</td>
          <td>${isPercent ? totalBoost + '%' : '+' + totalBoost}</td>
          <td>Global</td>
          <td><a href="${marketplaceLinks[b.type]}" target="_blank">🔗 Link</a></td>
        </tr>
      `;
    }).join('');
  
    return `
      <details open>
        <summary>${icon} ${typeLabel} Boosters</summary>
        <table class="reward-table2">
          <thead>
            <tr>
              <th>Booster</th>
              <th>Qty</th>
              <th>Boost %</th>
              <th>Total Boost</th>
              <th>Usecase</th>
              <th>Marketplace</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="mt-2">
          <strong>Total Percent Boost:</strong> ${totalPercentBoost}%
        </p>
      </details>
    `;
  }
  function renderXPBoosters(boosters, typeLabel, icon) {
    if (!boosters || boosters.length === 0) return `<p>No ${typeLabel} Boosters.</p>`;
  
      const rows = boosters.map(b => {
      const statusLabel = b.status === "expired"
        ? `<span style="color: #888;">❌ Expired</span>`
        : b.status === "active"
          ? `<span style="color: green;">✅ Active</span>`
          : `<span style="color: orange;">🚫 Not Owned</span>`;
        
      return `
        <tr>
          <td><strong>${b.type}</strong></td>
          <td>${b.points}</td>
          <td>${b.channel}</td>
          <td>${b.boost || "-"} XP</td>
          <td>${statusLabel}</td>
          <td><a href="${b.marketplace}" target="_blank">🔗 Link</a></td>
        </tr>
      `;
    }).join(''); // 🔥 IMPORTANTE!
    return `
      <details open>
        <summary>${icon} ${typeLabel} Boosters</summary>
        <table class="reward-table2">
          <thead>
            <tr>
              <th>Type</th>
              <th>Qty</th>
              <th>Usecase</th>
              <th>Boost</th>
              <th>Status</th>
              <th>Marketplace</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
    `;
  }

  function renderPlatform(platform, icon) {
    const progress = Math.min((platform.xp / platform.xp_needed) * 100, 100).toFixed(3);
    const boostersHTML = `
      ${renderXPBoosters(platform.boosters?.xp, "XP", "📈")}
      ${renderBoosters(platform.boosters?.reward, "Reward", "💰")}
    `;
    
    const isTwitch = platform.platform === "Twitch";
    
    const rewardsHTML = (platform.channels || []).map(ch => {
      const passLabel = ch.pass
        ? `
          <a href="${ch.pass}" target="_blank" style="
            background-color: #ffefd5;
            border: 1px solid #f4a261;
            color: #e76f51;
            padding: 4px 10px;
            border-radius: 5px;
            font-weight: 600;
            text-decoration: none;
            box-shadow: 0 0 4px rgba(0,0,0,0.1);
            transition: all 0.2s ease-in-out;
          " onmouseover="this.style.backgroundColor='#ffe0b3';"
            onmouseout="this.style.backgroundColor='#ffefd5';">
            🔑 Pass Required
          </a>
        `
        : `
          <span style="
            background-color: #e0ffe0;
            color: #2e7d32;
            padding: 4px 10px;
            border-radius: 5px;
            font-weight: 600;
          ">
            ✅ Free Access
          </span>
        `;
    
      const rows = ch.rewards.map(r => isTwitch
        ? `
          <tr>
            <td>${r.token}</td>
            <td>${r.msg_reward}</td>
          </tr>
        `
        : `
          <tr>
            <td>${r.token}</td>
            <td>${r.short_msg_reward}</td>
            <td>${r.short_msg_xp}</td>
            <td>${r.long_msg_reward}</td>
            <td>${r.long_msg_xp}</td>
          </tr>
        `
      ).join('');
    
      const headers = isTwitch
        ? `
          <tr>
            <th>Token</th>
            <th>Message Reward</th>
          </tr>
        `
        : `
          <tr>
            <th>Token</th>
            <th>Short Msg Reward</th>
            <th>Short Msg XP</th>
            <th>Long Msg Reward</th>
            <th>Long Msg XP</th>
          </tr>
        `;
    
        return `
          <details>
            <summary style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
              <span style="
                background-color: #d0e6ff;
                color: #1e3a8a;
                padding: 6px 12px;
                border-radius: 6px;
                font-weight: bold;
                cursor: pointer;
                transition: background-color 0.2s ease-in-out;
              " onmouseover="this.style.backgroundColor='#bcdfff';"
                onmouseout="this.style.backgroundColor='#d0e6ff';">
                📣 ${ch.name}(Details)
              </span>
              ${passLabel}
            </summary>
        
            ${ch.name === 'sugarqueenjanice' ? `
              <div style="
                background: linear-gradient(to right, #ffccf9, #ffe0f0);
                border: 2px solid #e91e63;
                border-radius: 12px;
                padding: 16px;
                margin: 20px 0;
                text-align: center;
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
                font-family: 'Segoe UI', sans-serif;
              ">
                <h3 style="
                  color: #c2185b;
                  margin: 0;
                  font-size: 1.2em;
                  font-weight: 700;
                ">
                  💖 SQJ ACTIVE PASS HOLDERS GET 50% MORE REWARDS PER MESSAGE!
                </h3>
                <p style="
                  color: #880e4f;
                  margin-top: 8px;
                  font-size: 1em;
                  font-weight: 500;
                ">
                  Just by holding a valid pass, your messages are worth more! Enjoy boosted earnings while you chat 💬✨
                </p>
              </div>
            ` : ''}
        
            <table class="reward-table2 mt-2">
              <thead>${headers}</thead>
              <tbody>${rows}</tbody>
            </table>
          </details>
        `;
    }).join('');
  return `
    <div class="card-glow">
      <h2 class="glow-text">${icon} ${platform.platform || 'Platform'}</h2>
      <p><span class="label">👤 Username:</span> ${platform.username}</p>
      <p><span class="label">🏅 Level:</span> ${platform.level}</p>
      <p><span class="label">📈 XP:</span> ${platform.xp} / ${platform.xp_needed}</p>
      <div class="xp-bar2">
        <div class="xp-fill2" style="width:${progress}%"></div>
      </div>
      ${boostersHTML}
      <h2 class="glow-text">💬 Channel Rewards</h2>
      ${rewardsHTML || '<p>No channel-specific rewards.</p>'}
    </div>
  `;
  }

  document.getElementById('chat-rewards').innerHTML = `
    ${renderPlatform(telegram, '📢')}
    ${renderPlatform(twitch, '🎮')}
  `;
}

function formatActivityEntry(entry) {
  if (!entry) return "None";

  if (Array.isArray(entry)) {
    return entry.map(item => {
      if (typeof item === 'object') {
        return `<div class="activity-object">${Object.entries(item).map(([k, v]) => `
          <span class="activity-label">${k}:</span> <span class="activity-value">${v}</span>
        `).join("<br>")}</div>`;
      }
      return `<span>${item}</span>`;
    }).join("<hr class='activity-divider'>");
  }

  if (typeof entry === 'object') {
    return Object.entries(entry).map(([key, val]) => {
      return `<span class="activity-label">${key}:</span> <span class="activity-value">${val}</span>`;
    }).join("<br>");
  }

  return `<span>${entry}</span>`;
}
function relabelKey(key) {
  const map = {
    contest_id: "🆔 Contest ID",
    nft_id: "🧩 NFT ID",
    template_name: "🖼️ Template Name",
    image: "🖼️ NFT Image",
    timestamp: "⏰ Datetime",
    token_symbol: "🪙 Token",
    amount: "💰 Amount",
    winner: "🏆 Winner",
    asset_id: "🧬 Asset ID",
    num_winners: "🎯 Winners",
    box_type: "📦 Box Type",
    reward: "🎁 Reward",
    username: "👤 Username",
    origin_channel: "📡 Origin",
    channel: "📺 Channel",
    stormed_by: "⚡ Stormed By",
    msg: "💬 Message",
    thread: "🧵 Thread",
    chat_id: "🗨️ Chat Name",
    end_time: "⏳ When",
    end_date: "📅 When",
    asset_img: "🖼️ NFT Image",
    asset_video: "🎞️ NFT Video",
    fee: "💸 Fee",
    template_id: "🔖 Template ID"
  };

  return map[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderRecentActivity(data) {
  function renderActivitySection(activity, label, icon, entries) {
    const renderedEntries = entries.map(({ key, title }) => {
      if (!(key in activity) || !activity[key]) {
        return `<tr><td colspan="2" style="color:#888;">${title}</td><td style="color:#aaa;">None</td></tr>`;
      }

      const value = activity[key];

      if (Array.isArray(value)) {
        const rows = value.map(v => `
          <div class="activity-object" style="margin-bottom:8px;">
            ${Object.entries(v).map(([k, val]) => `
              <span class='activity-label' style="color:#ff00ff; font-weight:bold; margin-right:6px;">${relabelKey(k)}:</span>
              <span class='activity-value' style="color:#00ffee;">${val}</span>
            `).join('<br>')}
          </div>
        `).join('<hr style="border:0; border-top:1px dashed #444; margin:8px 0;">');
        return `<tr><td colspan="2">${title}</td><td>${rows}</td></tr>`;
      }

      if (typeof value === 'object') {
        const objectRows = Object.entries(value).map(([k, val]) => {
          if (k === 'asset_img') {
            return `<img src="${val}" alt="NFT Image" style="max-width:120px; border-radius:8px; margin-top:6px;">`;
          }
      
          return `
            <span class='activity-label' style="color:#ff00ff; font-weight:bold; margin-right:6px;">${relabelKey(k)}:</span>
            <span class='activity-value' style="color:#00ffee;">${val}</span>`;
        }).join('<br>');
      
        return `<tr><td colspan="2">${title}</td><td>${objectRows}</td></tr>`;
      }

      return `<tr><td colspan="2">${title}</td><td><span class='activity-value' style="color:#00ffee;">${value}</span></td></tr>`;
    }).join('');

    return `
      <details open class="card-glow" style="margin-bottom:2rem; padding:1.5rem; background:rgba(0,0,0,0.3); border-radius:12px; box-shadow:0 0 12px #0ff;">
        <summary class="glow-text" style="text-align:center; font-size:1.4rem; padding:0.8rem 0; cursor:pointer;">${icon} ${label} Activity</summary>
        <table class="reward-table2" style="width:100%; margin-top:1rem; border-collapse: collapse;">
          <tbody>${renderedEntries}</tbody>
        </table>
      </details>
    `;
  }

  const telegramEntries = [
    { key: 'last_chat_reward', title: '💬 Last Chat Reward' },
    { key: 'last_storm_win', title: '⛈️ Last Storm Win' },
    { key: 'last_nft_giveaway', title: '🎉 Last NFT Giveaway' },
    { key: 'last_luckydraw_tokens', title: '🍀 Last LuckyDraw Tokens' },
  ];
  
  const twitchEntries = [
    { key: 'last_chat_reward', title: '💬 Last Chat Reward' },
    { key: 'last_storm_win', title: '⛈️ Last Storm Win' },
    { key: 'last_nft_storm', title: '🌪️ Last NFT Storm' },
  ];
  
  const telegramHTML = renderActivitySection(data.telegram, 'Telegram', '📢', telegramEntries);
  const twitchHTML = renderActivitySection(data.twitch, 'Twitch', '🎮', twitchEntries);


  document.getElementById('recent-activity').innerHTML = `
    ${telegramHTML}
    ${twitchHTML}
  `;
}

function toggleActivitySection(id) {
  const el = document.getElementById(id);
  el.classList.toggle('collapsed');
}

function populateNFTDropdown(nfts) {
  const dropdown = document.getElementById("nftAssetDropdown");

  if (!dropdown) {
    console.warn("⚠️ Dropdown not found in DOM!");
    return;
  }

  if (!nfts || !nfts.length) {
    dropdown.innerHTML = `<option value="">No NFTs found</option>`;
    return;
  }

  dropdown.innerHTML = `<option value="">Select NFT</option>` + 
    nfts.map(nft => {
      const info = nft.template_info || {};
      return `
        <option 
          value="${nft.asset_id}" 
          data-collection="${info.collection_name || ''}" 
          data-template="${info.template_id || ''}">
          ${nft.asset_id} - ${info.template_name || 'Unnamed Template'}
        </option>
      `;
    }).join('');
}

async function loadTwitchNftsGiveaways() {
  const container = document.getElementById('c2e-content');
  container.innerHTML = 'Loading Twitch NFTs Giveaways...';

  container.innerHTML = `
      <div class="form-container" id="nft-giveaway-form">
        <div id="giveaway-template-section">
          <div class="template-selection-info">
            <p>Select one or more <strong>template IDs</strong> from your NFTs. Only NFTs belonging to the selected templates will be eligible for the giveaway.</p>
            <p>The number of winners will match the total number of NFTs selected. You can limit the number of winners by setting a <strong>maximum limit</strong>.</p>
          </div>
          <div id="giveaway-templates-wrapper"></div>
          <!-- <button class="btn btn-secondary" id="add-template-btn">➕ Add another template</button> -->
        </div>
        
        <label class="input-label">Draw Date & Time</label>
        <input type="text" id="nftGiveawayTime" class="input-field" placeholder="Select date & time" readonly />
        
        <label class="input-label">Timeframe</label>
        <select id="nftGiveawayTimeframe" class="input-field">
          <option value="">Select duration</option>
          <option value="10m">10 minutes</option>
          <option value="15m">15 minutes</option>
          <option value="30m">30 minutes</option>
          <option value="45m">45 minutes</option>
          <option value="1h">1 hour</option>
          <option value="2h">2 hours</option>
          <option value="3h">3 hours</option>
          <option value="1d">1 day</option>
          <option value="2d">2 days</option>
          <option value="3d">3 days</option>
        </select>

        <label class="input-label">Channel</label>
        <select id="nftGiveawayChannel" class="input-field"></select>
      
        <button id="submitNftGiveaway" class="btn-submit">Add NFT Giveaway</button>
      </div>
      <h2 class="section-title mt-6">Scheduled NFTs Giveaways</h2>
      <div class="filter-toolbar">
        <input type="text" id="filter-template-id" class="filter-input" placeholder="Template ID..." />
        <input type="text" id="filter-collection" class="filter-input" placeholder="Collection..." />
        <select id="filter-channel" class="filter-select"></select>
        <select id="filter-status" class="filter-select">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <button class="btn btn-secondary" id="reset-nft-filters">Reset</button>
      </div>
      <div id="nft-giveaways-table" class="table-container">Loading scheduled giveaways...</div>
    </div>
  `;
  flatpickr("#nftGiveawayTime", {
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    time_24hr: true,
    defaultDate: new Date(),
    allowInput: false,
    locale: {
      firstDayOfWeek: 1 // Inizia da lunedì
    }
  });

  // Event listener per invio form
  document.getElementById('submitNftGiveaway').addEventListener('click', submitNftGiveaway);
  document.getElementById('filter-template-id').addEventListener('input', applyNftGiveawayFiltersAndSort);
  document.getElementById('filter-collection').addEventListener('input', applyNftGiveawayFiltersAndSort);
  document.getElementById('filter-channel').addEventListener('change', applyNftGiveawayFiltersAndSort);
  document.getElementById('filter-status').addEventListener('change', applyNftGiveawayFiltersAndSort);
  document.getElementById('reset-nft-filters').addEventListener('click', () => {
    document.getElementById('filter-template-id').value = '';
    document.getElementById('filter-collection').value = '';
    document.getElementById('filter-channel').value = '';
    document.getElementById('filter-status').value = '';
    applyNftGiveawayFiltersAndSort();
  });

  // Carica canali disponibili
  await populateGiveawayChannels();
  if (!window.nftsData) {
    const { userId, usx_token } = window.userData;
    try {
      const response = await fetch(`${BASE_URL}/mynfts?user_id=${userId}&usx_token=${usx_token}`);
      const nftsData = await response.json();
      window.nftsData = nftsData.nfts || [];
    } catch (err) {
      console.error("❌ Failed to fetch NFTs:", err);
      showToast("Error loading NFTs", "error");
      return;
    }
  }
    
  // Popola opzioni con asset dell utente
  if (!window.nftsData && !window.nftsData.length > 0) {
    setupDynamicTemplateSelector(window.nftsData);
  } else {
    const { userId, usx_token } = window.userData;
  
    try {
      const response = await fetch(`${BASE_URL}/mynfts?user_id=${userId}&usx_token=${usx_token}`);
      const nftsData = await response.json();
  
      if (!nftsData.nfts || nftsData.nfts.length < 1) {
        console.warn("⚠️ No NFTs found in response.");
      } else {
        window.nftsData = nftsData.nfts;
        console.info("[🔵] NFTs caricati:", window.nftsData.length);
        setupDynamicTemplateSelector(window.nftsData);
      }
    } catch (err) {
      console.error("❌ Errore nel caricamento degli NFT:", err);
      showToast("Error loading NFTs", "error");
    }
  }
  
  // Carica la lista dei giveaway programmati
  loadScheduledNftGiveaways();
}

function setupDynamicTemplateSelector() {
  const wrapper = document.getElementById("giveaway-templates-wrapper");
  const btn = document.getElementById("add-template-btn");
  let index = 0;

  function renderTemplateInput() {
    const tplDiv = document.createElement("div");
    tplDiv.className = "giveaway-template-block";

    const templateOptions = Object.entries(groupTemplatesById(window.nftsData)).map(([tplId, obj]) => {
      return `<option value="${tplId}" data-collection="${obj.collection}" data-count="${obj.assets.length}">${tplId} - ${obj.name} (${obj.assets.length} owned)</option>`;
    }).join('');

    tplDiv.innerHTML = `
      <label class="form-label">Template</label>
      <select class="form-input template-dropdown" data-index="${index}">
        <option disabled selected value="">-- Select Template --</option>
        ${templateOptions}
      </select>
      <label class="form-label mt-1">NFTs to Give Away <span class="max-available"></span></label>
      <input type="number" class="form-input nft-count-input" min="1" value="1" />
    `;

    wrapper.appendChild(tplDiv);

    const dropdown = tplDiv.querySelector('.template-dropdown');
    const maxText = tplDiv.querySelector('.max-available');
    const inputField = tplDiv.querySelector('.nft-count-input');

    dropdown.addEventListener('change', () => {
      const selected = dropdown.options[dropdown.selectedIndex];
      const max = selected.getAttribute('data-count') || 0;
      maxText.innerText = `(max: ${max})`;
      inputField.max = max;
      inputField.value = Math.min(max, 1);
    });

    index++;
  }

  // Iniziale
  renderTemplateInput();
  btn.addEventListener('click', renderTemplateInput);
}

function groupTemplatesById(nfts) {
  const map = {};
  for (const nft of nfts) {
    if (nft.gived_out === 'locked') continue;  // 👈 ESCLUSO

    const info = nft.template_info;
    if (!info || !info.template_id) continue;

    const tplId = info.template_id;
    if (!map[tplId]) {
      map[tplId] = {
        name: info.template_name || "Unnamed",
        collection: info.collection_name || "unknown",
        assets: []
      };
    }
    map[tplId].assets.push(nft);
  }
  return map;
}

async function populateGiveawayChannels() {
  const select = document.getElementById('nftGiveawayChannel');

  try {
    const res = await fetch(`${BASE_URL}/available_channels`);
    const data = await res.json();

    if (!Array.isArray(data.channels)) {
      console.error("❌ Invalid data format from /available_channels:", data);
      showToast("Failed to load channels.", "error");
      select.innerHTML = `<option value="">No channels</option>`;
      return;
    }

    select.innerHTML = `<option value="">Select Channel</option>` +
      data.channels.map(ch => `<option value="${ch}">${ch}</option>`).join('');

  } catch (err) {
    console.error("❌ Error loading channels:", err);
    showToast("Error loading channel list.", "error");
    select.innerHTML = `<option value="">Error</option>`;
  }
}

async function submitNftGiveaway() {
  const wrapper = document.getElementById("giveaway-templates-wrapper");
  const blocks = wrapper.querySelectorAll(".giveaway-template-block");

  const assetObjects = [];
  const selectedTemplates = [];

  const nfts = window.nftsData || [];

  for (const block of blocks) {
    const tplSelect = block.querySelector(".template-dropdown");
    const countInput = block.querySelector(".nft-count-input");
    const tplId = tplSelect?.value;
    const max = parseInt(tplSelect.selectedOptions[0]?.dataset.count || 0);
    const collection = tplSelect.selectedOptions[0]?.dataset.collection || "";
    const count = parseInt(countInput?.value || "0");

    if (!tplId || isNaN(count) || count < 1 || count > max) {
      showToast("Please review template selection: invalid values", "error");
      return;
    }

    const matchingAssets = nfts
      .filter(n =>
        n.template_info?.template_id == tplId &&
        n.gived_out !== 'locked' &&
        n.gived_out !== 'yes'
      )
      .slice(0, count);

    assetObjects.push(...matchingAssets.map(n => ({
      asset_id: n.asset_id,
      template_id: tplId,
      collection_name: collection
    })));

    selectedTemplates.push(tplId);
  }

  const assetIds = assetObjects.map(a => a.asset_id);
  const templateIds = [...new Set(selectedTemplates)];
  const collectionNames = [...new Set(assetObjects.map(a => a.collection_name))];

  if (assetIds.length === 0) {
    showToast("Select at least one NFT", "error");
    return;
  }

  if (collectionNames.length !== 1) {
    showToast("All selected NFTs must belong to the same collection", "error");
    return;
  }

  const drawTimeInput = document.getElementById('nftGiveawayTime');
  const drawTime = drawTimeInput && drawTimeInput.value ? new Date(drawTimeInput.value).toISOString() : null;
  const channel = document.getElementById('nftGiveawayChannel')?.value;
  const timeframe = document.getElementById('nftGiveawayTimeframe')?.value;
  const { userId, usx_token, wax_account } = window.userData;

  if (!drawTime || !channel || !timeframe) {
    showToast("Please fill all required fields (time, channel, timeframe)", "error");
    return;
  }

  const payload = {
    asset_objects: assetObjects, // 👈 nuova struttura [{ asset_id, template_id, collection_name }]
    asset_ids: assetIds,
    template_ids: templateIds,
    scheduled_time: drawTime,
    channel_name: channel,
    wax_account_donor: wax_account,
    timeframe
  };

  try {
    const res = await fetch(`${BASE_URL}/add_nft_giveaway?user_id=${userId}&usx_token=${usx_token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error(data.error || "Failed to schedule giveaway");
    }

    showToast("NFT Storm scheduled successfully!", "success");
    loadScheduledNftGiveaways();

  } catch (err) {
    console.error("❌ Error submitting NFT giveaway:", err);
    showToast(err.message, "error");
  }
}

async function loadScheduledNftGiveaways() {
  const table = document.getElementById('nft-giveaways-table');
  table.innerHTML = "Loading...";

  const { userId, usx_token } = window.userData;

  try {
    const res = await fetch(`${BASE_URL}/get_scheduled_nft_giveaways?user_id=${userId}&usx_token=${usx_token}`);
    const data = await res.json();

    if (!data.length) {
      table.innerHTML = "<div class='info-message'>No giveaways scheduled.</div>";
      return;
    }

    // Salva i dati originali per filtri e ordinamenti
    originalNftGiveawaysData = data;

    // Popola filtro canali dinamicamente
    const uniqueChannels = [...new Set(data.map(g => g.channel_name).filter(Boolean))];
    const channelSelect = document.getElementById('filter-channel');
    if (channelSelect) {
      channelSelect.innerHTML = `<option value="">All Channels</option>` +
        uniqueChannels.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Applica subito i filtri e sorting correnti
    applyNftGiveawayFiltersAndSort();

  } catch (err) {
    console.error(err);
    table.innerHTML = `<div class="error-message">Failed to load giveaways: ${err.message}</div>`;
  }
}

function applyNftGiveawayFiltersAndSort() {
  const templateFilter = document.getElementById('filter-template-id')?.value.trim();
  const collectionFilter = document.getElementById('filter-collection')?.value.trim().toLowerCase();
  const channelFilter = document.getElementById('filter-channel')?.value;
  const statusFilter = document.getElementById('filter-status')?.value;

  let filtered = originalNftGiveawaysData.filter(g => {
    return (
      (!templateFilter || g.template_id.toString().includes(templateFilter)) &&
      (!collectionFilter || g.collection_name.toLowerCase().includes(collectionFilter)) &&
      (!channelFilter || g.channel_name === channelFilter) &&
      (!statusFilter || g.status === statusFilter)
    );
  });

  if (nftGiveawaySort.key) {
    filtered.sort((a, b) => {
      const aVal = a[nftGiveawaySort.key];
      const bVal = b[nftGiveawaySort.key];

      if (nftGiveawaySort.direction === 'asc') return aVal > bVal ? 1 : -1;
      else return aVal < bVal ? 1 : -1;
    });
  }

  renderNftGiveawaysTable(filtered);
}
function renderNftGiveawaysTable(data) {
  const table = document.getElementById('nft-giveaways-table');

  // Raggruppa per ID logico
  const grouped = {};
  for (const g of data) {
    const key = `${g.scheduled_time}|${g.channel_name}|${g.username_donor}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(g);
  }

  let html = `
    <table class="styled-table">
      <thead>
        <tr>
          <th onclick="sortNftGiveaways('scheduled_time')">Time</th>
          <th onclick="sortNftGiveaways('username_donor')">Sponsored by</th>
          <th>Templates</th>
          <th>Collections</th>
          <th onclick="sortNftGiveaways('channel_name')">Channel</th>
          <th>Timeframe</th>
          <th onclick="sortNftGiveaways('status')">Status</th>
          <th>Winners & Assets</th>
          <th>Live</th>
        </tr>
      </thead>
      <tbody>
  `;

  for (const [key, group] of Object.entries(grouped)) {
    const [time, channel, donor] = key.split('|');
    const templates = [...new Set(group.map(g => g.template_id))].join(', ');
    const collections = [...new Set(group.map(g => g.collection_name))].join(', ');
    const status = group[0].status || 'pending';
    const timeframe = group[0].timeframe || '0';
    const first = group[0];
    const winners = (first.winner || "").split(',').map(w => w.trim()).filter(Boolean);
    const assets = (first.asset_id || "").split(',').map(a => a.trim()).filter(Boolean);

    let winnerBlocks = '';
    if (status === 'failed') {
      winnerBlocks = `<div class="info-message">
        No eligible winners in the ${timeframe}
      </div>`;
    } else if (status === 'pending') {
      winnerBlocks = `<div class="info-message">
        Coming soon
      </div>`;
    } else {
      winnerBlocks = `<div class="winners-wrapper">`;
      for (let i = 0; i < winners.length; i++) {
        const colorIndex = i % 6;
        winnerBlocks += `
          <div class="winner-row winner-color-${colorIndex}">
            <span class="winner-name">winner: ${winners[i].toUpperCase()}</span>
            <span class="winner-asset">→ asset: ${assets[i] || '???'}</span>
          </div>`;
      }
      winnerBlocks += `</div>`;
    }

    html += `
      <tr>
        <td>${new Date(time).toLocaleString()}</td>
        <td>${donor}</td>
        <td>${templates}</td>
        <td>${collections}</td>
        <td>${channel}</td>
        <td>${timeframe}</td>
        <td>${status}</td>
        <td>${winnerBlocks}</td>
        <td class="live-element ${status}">
          <span class="dot"></span>
        </td>        
      </tr>
    `;
  }

  html += `</tbody></table>`;
  table.innerHTML = html;

  // Click effect
  document.querySelectorAll('.winner-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.add('clicked');
      setTimeout(() => row.classList.remove('clicked'), 700);
    });
  });
}

function sortNftGiveaways(key) {
  if (nftGiveawaySort.key === key) {
    nftGiveawaySort.direction = nftGiveawaySort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    nftGiveawaySort.key = key;
    nftGiveawaySort.direction = 'asc';
  }
  applyNftGiveawayFiltersAndSort();
}
window.sortNftGiveaways = sortNftGiveaways;

async function loadNFTFarms(defaultFarmName = null) {
  const { userId, usx_token } = window.userData;
  const res = await fetch(`${BASE_URL}/nfts_farms?user_id=${userId}&usx_token=${usx_token}`);
  const data = await res.json();

  if (!data.farms || data.farms.length === 0) {
    document.getElementById('nft-farms-container').innerHTML = `
      <div class="error-message">No NFT farms found.</div>`;
    return;
  }

  window.nftFarmsData = data.farms;
  renderNFTFarmButtons(data.farms);

  // 🔍 Se specificato, cerca farm col nome desiderato
  let defaultFarm = null;
  if (defaultFarmName) {
    defaultFarm = data.farms.find(f =>
      f.farm_name.toLowerCase().includes(defaultFarmName.toLowerCase())
    );
  }

  // 🎯 Fallback
  if (!defaultFarm) {
    defaultFarm = data.farms.find(f =>
      f.farm_name.toLowerCase().includes('chips')
    ) || data.farms[0];
  }

  renderNFTFarms([defaultFarm]);
}

function renderNFTFarmButtons(farms) {
  const container = document.getElementById('nft-farms-container');
  container.innerHTML = `
    <input type="text" id="search-nft-farm" placeholder="Search farm name..." class="form-input search-farm-input">
    <div id="nft-farm-buttons" class="farm-button-group"></div>
    <div id="nft-farm-details"></div>
  `;

  const buttonContainer = document.getElementById('nft-farm-buttons');
  const searchInput = document.getElementById('search-nft-farm');

  function renderButtons(list) {
    buttonContainer.innerHTML = '';
    list.forEach(farm => {
      const btn = document.createElement('button');
      btn.className = 'btn-action';
      btn.textContent = farm.farm_name;
      btn.onclick = () => renderNFTFarms([farm]);
      buttonContainer.appendChild(btn);
    });
  }

  renderButtons(farms);

  searchInput.addEventListener('input', () => {
    const search = searchInput.value.toLowerCase();
    const filtered = farms.filter(f => f.farm_name.toLowerCase().includes(search));
    renderButtons(filtered);
  });
}

function renderNFTFarms(farms) {
  const container = document.getElementById('nft-farm-details');
  let html = '';

  html += `
    <p class="intro-text">
      Don’t have a NFT farm in CHIPS Wallet for your collection yet? You can create one 
      <button onclick="loadSection('create-nfts-farm')" class="btn btn-create-farm">
        Create NFTs Farm
      </button>
    </p>
  `;

  farms.forEach(farm => {
    const templatesHTML = (farm.templates || []).map(template => {
      const nftsHTML = (template.user_nfts || []).map(nft => `
        <div class="nft-card">
          <img src="${nft.asset_img}" alt="NFT"
            class="nft-image"
            onerror="handleNFTImageError(this)">
          <div class="nft-name">${nft.template_name}</div>
          <div class="nft-id">#${nft.asset_id}</div>
          <button class="${nft.is_staked ? 'btn btn-unstake' : 'btn btn-stake'}"
            onclick="handleNFTStake(${farm.farm_id}, ${template.template_id}, '${nft.asset_id}', ${nft.is_staked})">
            ${nft.is_staked ? 'Unstake' : 'Stake'}
          </button>
        </div>
      `).join('');

      const rewardsHTML = (template.rewards || []).map(r => {
        const daily = parseFloat(r.daily_reward_amount);
        return `
          <div class="nft-reward">
            ${r.token_symbol}: ${isNaN(daily) ? "N/A" : daily.toFixed(4)}/day
          </div>
        `;
      }).join('') || '<div class="no-rewards">No rewards</div>';
      
      const rawImg = template.user_nfts?.[0]?.asset_img || template.template_img;
      const imgUrl = rawImg ? `https://ipfs.io/ipfs/${rawImg}` : null;
      
      const templateImageHTML = imgUrl
        ? `<div class="template-image-wrapper" style="text-align:center; margin: 0.5rem 0;">
            <img src="${imgUrl}" alt="Template Image"
                 style="
                   display: block;
                   margin: 0 auto;
                   max-height: 200px;
                   max-width: 100%;
                   object-fit: contain;
                   border-radius: 10px;
                   box-shadow: none !important;
                   filter: none !important;
                   text-shadow: none !important;
                 ">
           </div>`
        : '';

      return `
        <div class="template-block">
          <h4 class="template-title">Template ID: ${template.template_id}</h4>
          ${templateImageHTML}
          ${rewardsHTML}
          <div class="nft-grid">
            ${nftsHTML || '<div class="no-nfts">You don’t own NFTs for this template</div>'}
          </div>
        </div>
      `;
    }).join('');

    const farmRewards = (farm.farm_rewards || []).map(r => `
      <span class="farm-reward">💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong></span>
    `).join('');

    html += `
      <div class="farm-card">
        <h3 class="farm-title">
          ${farm.farm_name}
          <span class="farm-rewards">${farmRewards}</span>
        </h3>
        <div class="template-grid">
          ${templatesHTML || '<div class="empty-templates">No templates available.</div>'}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function initFarmToolsControls() {
  // Earning History
  const btnEarnings = document.getElementById('btn-earnings');
  btnEarnings?.addEventListener('click', () => {
    showEarningsHistory(); // ricostruisce l’intera section-container
  });

  // Admin: Run Distribution
  const adminBox = document.getElementById('admin-distribute-container');
  const isAdmin = window?.userData?.wax_account === 'agoscry4ever';
  if (isAdmin) {
    adminBox.style.display = 'flex';
    const btn = document.getElementById('btn-distribute');
    btn?.addEventListener('click', runDistribution);
  }
}

async function runDistribution() {
  const feedback = document.getElementById('distribution-feedback');
  const dryRun = !!document.getElementById('dryrun-toggle')?.checked;

  // UI: loading
  feedback.innerHTML = `
    <div style="
      background:#0b1220;border:1px solid rgba(255,255,255,0.08);
      padding:10px 12px;border-radius:8px;color:#cbd5e1;
    ">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="spinner" style="
          width:16px;height:16px;border:2px solid rgba(255,255,255,0.2);
          border-top-color:#22c55e;border-radius:50%;animation:spin 0.9s linear infinite;
        "></div>
        <div><strong>Running distribution</strong> ${dryRun ? '(dry-run)' : '(live)'}...</div>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${BASE_URL}/farms/distribute`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ dry_run: dryRun })
    });
    const data = await res.json();

    if (!res.ok || data.success === false) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    // Aggrega i totali per token
    const totals = {};
    (data.changes || []).forEach(ch => {
      const sym = ch.token_symbol;
      totals[sym] = (totals[sym] || 0) + Number(ch.reward_assigned || 0);
    });

    const totalsHTML = Object.keys(totals).length
      ? `<div style="margin-top:8px;">
           <div style="font-weight:700;margin-bottom:6px;color:#e2e8f0;">Totals by token</div>
           ${Object.entries(totals).map(([k,v]) => `
             <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed rgba(255,255,255,0.08);">
               <span style="color:#94a3b8;">${k}</span>
               <span style="color:#e2e8f0;font-weight:700;">${v.toFixed(6)}</span>
             </div>
           `).join('')}
         </div>`
      : `<div style="margin-top:8px;color:#94a3b8;">No rewards distributed.</div>`;

    // Lista cambi (primi 25)
    const top = (data.changes || []).slice(0, 25);
    const listHTML = top.length
      ? `<div style="margin-top:10px;">
           <div style="font-weight:700;margin-bottom:6px;color:#e2e8f0;">Recent changes</div>
           <div style="max-height:240px;overflow:auto;border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
             ${top.map(ch => `
               <div style="display:flex;gap:8px;justify-content:space-between;padding:8px 10px;border-bottom:1px solid rgba(255,255,255,0.06);">
                 <div style="color:#a5b4fc;">
                   <span style="color:#93c5fd;">${ch.wax_account}</span>
                   <span style="color:#94a3b8;"> | farm #${ch.farm_id}</span>
                 </div>
                 <div style="color:#e2e8f0;">${ch.token_symbol}: +${Number(ch.reward_assigned).toFixed(6)}</div>
                 <div style="color:#94a3b8;">(${Number(ch.before_balance).toFixed(3)} → ${Number(ch.after_balance).toFixed(3)})</div>
                 <div style="color:#22c55e;font-weight:700;">${ch.storage}</div>
               </div>
             `).join('')}
           </div>
           ${data.changes && data.changes.length > 25
              ? `<div style="margin-top:6px;color:#94a3b8;">and ${data.changes.length - 25} more…</div>`
              : ''}
         </div>`
      : '';

    feedback.innerHTML = `
      <div style="
        background:#0b1220;border:1px solid rgba(255,255,255,0.08);
        padding:12px;border-radius:10px;color:#cbd5e1;
      ">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${dryRun ? '#22c55e' : '#f59e0b'};"></div>
          <div><strong>Distribution completed</strong> ${dryRun ? '(dry-run)' : '(live)'}</div>
        </div>
        ${totalsHTML}
        ${listHTML}
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `;
  } catch (err) {
    feedback.innerHTML = `
      <div style="background:#1f2937;border:1px solid #ef4444;padding:12px;border-radius:10px;color:#fecaca;">
        <div style="font-weight:800;color:#fca5a5;">Error</div>
        <div style="color:#fef2f2;">${String(err.message || err)}</div>
      </div>
    `;
  }
}


// =========================
// Earning History: ricostruzione totale della sezione
// =========================

async function showEarningsHistory() {
  const sc = document.querySelector('.section-container');
  if (!sc) return;

  // Header + controlli range + contenitore risultati (inline CSS only)
  sc.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h2 style="margin:0;color:#e2e8f0;font-size:22px;letter-spacing:0.3px;">Earning History</h2>
      <button onclick="loadSection('nfts-staking')" style="
        cursor:pointer;border:none;padding:8px 12px;border-radius:8px;
        background:#1e293b;color:#e2e8f0;font-weight:600;
      ">⟵ Back to Farms</button>
    </div>

    <div id="eh-controls" style="
      display:flex;gap:10px;align-items:end;flex-wrap:wrap;
      background:#0f172a;border:1px solid rgba(255,255,255,0.08);
      padding:12px;border-radius:10px;margin-bottom:12px;
    ">
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label style="color:#94a3b8;font-size:12px;">Start</label>
        <input id="eh-start" type="date" style="
          background:#0b1220;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);
          padding:8px;border-radius:8px;
        ">
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label style="color:#94a3b8;font-size:12px;">End</label>
        <input id="eh-end" type="date" style="
          background:#0b1220;color:#e2e8f0;border:1px solid rgba(255,255,255,0.1);
          padding:8px;border-radius:8px;
        ">
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label style="color:#0f172a;font-size:12px;">&nbsp;</label>
        <button id="eh-apply" style="
          cursor:pointer;border:none;padding:9px 12px;border-radius:8px;
          background:#22c55e;color:#0b1220;font-weight:800;
        ">Apply</button>
      </div>
      <div style="display:flex;gap:8px;margin-left:auto;">
        <button data-days="7"  class="eh-preset" style="${ehPresetStyle()}">7d</button>
        <button data-days="30" class="eh-preset" style="${ehPresetStyle()}">30d</button>
        <button data-days="90" class="eh-preset" style="${ehPresetStyle()}">90d</button>
      </div>
    </div>

    <div id="eh-output"></div>
  `;

  // Eventi controlli
  document.getElementById('eh-apply').addEventListener('click', () => {
    const start = document.getElementById('eh-start').value;
    const end   = document.getElementById('eh-end').value;
    fetchAndRenderEarnings({ start, end });
  });
  document.querySelectorAll('.eh-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      fetchAndRenderEarnings({ days: Number(btn.getAttribute('data-days')) });
    });
  });

  // Primo load: 7 giorni
  fetchAndRenderEarnings({ days: 7 });
}

function ehPresetStyle() {
  return `
    cursor:pointer;border:none;padding:8px 10px;border-radius:8px;
    background:#1e293b;color:#e2e8f0;font-weight:700;
  `;
}

async function fetchAndRenderEarnings({ start, end, days } = {}) {
  const out = document.getElementById('eh-output');
  const wax = window?.userData?.wax_account;
  if (!wax) {
    out.innerHTML = `<div style="${ehCardWarn()}">Wax account not found in session.</div>`;
    return;
  }

  // Loading
  out.innerHTML = `
    <div style="${ehCardBase()}">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.2);
          border-top-color:#22c55e;border-radius:50%;animation:spin 0.9s linear infinite;"></div>
        <div style="color:#cbd5e1;">Loading earnings…</div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  // Costruisci querystring
  const params = new URLSearchParams({ wax_account: wax });
  if (start) params.append('start', start);
  if (end)   params.append('end', end);
  if (!start && !end && days) params.append('days', String(days));

  try {
    const res = await fetch(`${BASE_URL}/farms/earnings?` + params.toString());
    const data = await res.json();

    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    renderEarningsView(out, data);
  } catch (err) {
    out.innerHTML = `
      <div style="${ehCardError()}">
        <div style="font-weight:800;color:#fca5a5;margin-bottom:6px;">Error</div>
        <div style="color:#fef2f2;">${String(err.message || err)}</div>
      </div>
    `;
  }
}

function renderEarningsView(container, payload) {
  // Nessun record
  if (!payload?.available || !payload?.days || payload.days.length === 0) {
    container.innerHTML = `
      <div style="${ehCardBase()}">
        <div style="color:#e2e8f0;font-weight:700;margin-bottom:6px;">No earnings found</div>
        <div style="color:#94a3b8;">Try expanding the date range.</div>
      </div>
    `;
    return;
  }

  const hdr = `
    <div style="${ehCardBase()}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div>
          <div style="color:#94a3b8;font-size:12px;">Wax Account</div>
          <div style="color:#e2e8f0;font-weight:800;">${payload.wax_account}</div>
        </div>
        <div>
          <div style="color:#94a3b8;font-size:12px;">Range</div>
          <div style="color:#e2e8f0;font-weight:700;">${payload.range.start} → ${payload.range.end}</div>
        </div>
        <div>
          <div style="color:#94a3b8;font-size:12px;">Total Reward</div>
          <div style="color:#22c55e;font-weight:900;">${Number(payload.summary?.total_reward || 0).toFixed(6)}</div>
        </div>
      </div>
      ${renderTotalsByToken(payload.summary?.totals_by_token)}
    </div>
  `;

  const daysHTML = payload.days.map(day => {
    const farmsHTML = (day.farms || []).map(f => {
      const tokens = f.tokens || {};
      const tokensList = Object.keys(tokens).length
        ? Object.entries(tokens).map(([sym, info]) => `
            <div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px dashed rgba(255,255,255,0.06);">
              <div style="color:#a5b4fc;">${sym}</div>
              <div style="color:#e2e8f0;font-weight:700;">+${Number(info.amount || 0).toFixed(6)}</div>
              <div style="color:#94a3b8;">(${Number(info.before||0).toFixed(3)} → ${Number(info.after||0).toFixed(3)})</div>
              <div style="color:#22c55e;font-weight:800;">${info.storage || '-'}</div>
            </div>
          `).join('')
        : `<div style="color:#94a3b8;">No tokens</div>`;

      const templates = f.templates || {};
      const tmplList = Object.keys(templates).length
        ? Object.entries(templates).map(([tpl, qty]) => `
            <span style="
              display:inline-block;background:#0b1220;border:1px solid rgba(255,255,255,0.08);
              color:#cbd5e1;padding:4px 8px;border-radius:999px;font-size:12px;margin:3px;
            ">Tpl ${tpl} × ${qty}</span>
          `).join('')
        : `<span style="color:#94a3b8;">No templates</span>`;

      return `
        <div style="
          border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:12px;background:#0a0f1a;
        ">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="color:#e2e8f0;font-weight:800;">Farm #${f.farm_id} — ${escapeHTML(f.farm_name || '')}</div>
            <div style="color:#94a3b8;">NFTs: <strong style="color:#cbd5e1;">${f.nft_count}</strong></div>
          </div>
          <div style="margin-bottom:8px;">${tmplList}</div>
          <div>${tokensList}</div>
          <div style="margin-top:10px;text-align:right;color:#cbd5e1;">
            Day subtotal: <strong style="color:#22c55e;">${Number(f.total_reward||0).toFixed(6)}</strong>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="${ehCardBase()}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="color:#e2e8f0;font-weight:900;">${day.date}</div>
          <div style="color:#94a3b8;">Total: <strong style="color:#22c55e;">${Number(day.total_reward||0).toFixed(6)}</strong></div>
        </div>
        ${renderTotalsByToken(day.totals_by_token)}
        <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:10px;">
          ${farmsHTML || `<div style="color:#94a3b8;">No farms for this day.</div>`}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = hdr + daysHTML;
}

function renderTotalsByToken(obj) {
  if (!obj || Object.keys(obj).length === 0) return `
    <div style="color:#94a3b8;">No token totals.</div>
  `;
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;">
      ${Object.entries(obj).map(([k,v]) => `
        <div style="
          background:#0b1220;border:1px solid rgba(255,255,255,0.08);
          padding:8px 10px;border-radius:10px;min-width:150px;
          display:flex;justify-content:space-between;gap:10px;
        ">
          <span style="color:#a5b4fc;">${k}</span>
          <strong style="color:#e2e8f0;">${Number(v).toFixed(6)}</strong>
        </div>
      `).join('')}
    </div>
  `;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Card styles inline helpers
function ehCardBase() {
  return "background:#0f172a;border:1px solid rgba(255,255,255,0.08);padding:12px;border-radius:10px;color:#cbd5e1;margin-bottom:12px;";
}
function ehCardWarn() {
  return "background:#0b1220;border:1px solid #f59e0b;padding:12px;border-radius:10px;color:#fde68a;";
}
function ehCardError() {
  return "background:#1f2937;border:1px solid #ef4444;padding:12px;border-radius:10px;color:#fecaca;";
}

function applyRewardFiltersAndSort() {
  const username = document.getElementById('filter-username').value;
  const channel = document.getElementById('filter-channel').value;
  const sponsor = document.getElementById('filter-sponsor').value;

  let filtered = originalData.filter(record =>
    (!username || record.username === username) &&
    (!channel || record.channel === channel) &&
    (!sponsor || record.origin_channel === sponsor)
  );

  if (currentSort.key) {
    filtered.sort((a, b) => {
      const aVal = a[currentSort.key];
      const bVal = b[currentSort.key];

      if (currentSort.direction === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });
  }

  renderRewardTable(filtered);
}
function sortRewardTable(key) {
  if (currentSort.key === key) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.direction = 'asc';
  }

  displayLogData(originalData); // aggiorna intestazioni
  applyRewardFiltersAndSort();  // aggiorna righe
}
async function loadLogRewardActivity() {
  const container = document.getElementById('c2e-content');
  container.innerHTML = 'Loading Log Reward Activity...';

  try {
    const res = await fetch(`${BASE_URL}/log_reward_activity`);

    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await res.json();

    if (data.length === 0) {
      container.innerHTML = '<div class="info-message">No reward activity logs found.</div>';
      return;
    }

    originalData = data;

    const recentData = data
      .slice(0, 40)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    displayLogData(recentData);

  } catch (err) {
    container.innerHTML = `<div class="error-message">Error loading log reward activity: ${err.message}</div>`;
  }
}

function filterData() {
  const usernameFilter = document.getElementById('filter-username').value.toLowerCase();
  const channelFilter = document.getElementById('filter-channel').value.toLowerCase();

  const filteredData = originalData.filter(record => {
    return (
      (usernameFilter === "" || record.username.toLowerCase().includes(usernameFilter)) &&
      (channelFilter === "" || record.channel.toLowerCase().includes(channelFilter))
    );
  });

  displayLogData(filteredData);
}

function resetFilters() {
  document.getElementById('filter-username').value = '';
  document.getElementById('filter-channel').value = '';
  displayLogData(originalData);
}

function renderRewardTable(data) {
  const tbody = document.querySelector('#c2e-content tbody');
  let rows = '';

  data.forEach((record, index) => {
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';

    rows += `
      <tr class="${rowClass}">
        <td class="cell">${record.username}</td>
        <td class="cell">${record.token_symbol}</td>
        <td class="cell">${parseFloat(record.amount).toFixed(4)}</td>
        <td class="cell">${record.channel}</td>
        <td class="cell">${record.origin_channel}</td>
        <td class="cell">${new Date(record.timestamp).toLocaleString()}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows;
}

function displayLogData(data) {
  const container = document.getElementById('c2e-content');
  originalData = data;

  const getUniqueValues = (arr, key) => [...new Set(arr.map(item => item[key]).filter(Boolean))].sort();
  const createOptions = (values) => `<option value="">All</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
  const sortArrow = (key) => currentSort.key === key ? (currentSort.direction === 'asc' ? ' ↑' : ' ↓') : '';

  const usernames = getUniqueValues(data, 'username');
  const channels = getUniqueValues(data, 'channel');
  const sponsors = getUniqueValues(data, 'origin_channel');

  container.innerHTML = `
    <div class="filter-toolbar">
      <label for="filter-username">Filter by Username:</label>
      <select id="filter-username" class="filter-select">${createOptions(usernames)}</select>
      <label for="filter-channel">Filter by Channel:</label>
      <select id="filter-channel" class="filter-select">${createOptions(channels)}</select>
      <label for="filter-sponsor">Filter by Sponsor:</label>
      <select id="filter-sponsor" class="filter-select">${createOptions(sponsors)}</select>
      <button id="update-rewards" class="btn btn-primary">Update Data</button>
    </div>

    <div>
      <table class="reward-table">
        <thead>
          <tr>
            <th>Username${sortArrow('username')}</th>
            <th>Token</th>
            <th>Amount${sortArrow('amount')}</th>
            <th>Channel${sortArrow('channel')}</th>
            <th>Sponsor${sortArrow('origin_channel')}</th>
            <th>When${sortArrow('timestamp')}</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `;

  renderRewardTable(data);

  document.getElementById('filter-username').addEventListener('change', applyRewardFiltersAndSort);
  document.getElementById('filter-channel').addEventListener('change', applyRewardFiltersAndSort);
  document.getElementById('filter-sponsor').addEventListener('change', applyRewardFiltersAndSort);
  document.getElementById('update-rewards').addEventListener('click', loadLogRewardActivity);
}

function showStormFeedback(message, isError = false) {
  const feedback = document.getElementById('storm-feedback');
  if (!feedback) return;

  feedback.style.display = 'block';
  feedback.style.backgroundColor = isError ? 'salmon' : 'lightgreen';
  feedback.style.color = isError ? '#721c24' : '#155724';
  feedback.style.border = isError ? '1px solid #f5c6cb' : '1px solid #c3e6cb';
  feedback.textContent = message;

  // Nascondi il messaggio dopo 5 secondi
  setTimeout(() => {
    feedback.style.display = 'none';
  }, 5000);
}

// Storm Scheduler and Logs
// Funzione per aggiungere una nuova tempesta programmata
async function addScheduledStorm() {
  const container = document.getElementById('c2e-content');
  const scheduledTimeLocal = document.getElementById('scheduledTime').value;
  const scheduledTimeUTC = new Date(scheduledTimeLocal).toISOString();
  const amount = document.getElementById('amount').value;
  const tokenSymbol = document.getElementById('tokenSymbol').value;
  const timeframe = document.getElementById('timeframe').value;
  const channelName = document.getElementById('channelName').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  const { userId, usx_token, wax_account } = window.userData || {};

  if (!wax_account) {
    console.error("❌ wax_account is missing.");
    showStormFeedback("Error: wax_account is missing.", true);
    return;
  }

  const payload = {
    scheduled_time: scheduledTimeUTC,
    amount,
    token_symbol: tokenSymbol,
    timeframe,
    channel_name: channelName,
    payment_method: paymentMethod,
    wax_account
  };

  try {
    const url = `${BASE_URL}/add_storm?user_id=${userId}&usx_token=${usx_token}&wax_account=${wax_account}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.success) {
      showStormFeedback(data.message, false); 
      loadScheduledStorms(); // aggiorna tabella
    } else {
      showStormFeedback(`Error: ${data.error}`, true); 
      console.warn("⚠️ Backend error:", data.error);
    }

  } catch (err) {
    console.error("🔥 Network or unexpected error:", err);
    showStormFeedback(`Network error: ${err.message}`, true); 
  }
}

async function populateMultiTokenSymbols(walletType) {
  const tokenSelect = document.getElementById('multiTokenSymbol');
  tokenSelect.innerHTML = '';

  const { userId, usx_token, wax_account } = window.userData;
  let balances = [];

  if (walletType === 'telegram') {
    const resTelegram = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const dataTelegram = await resTelegram.json();
    balances = dataTelegram.balances || [];
  } else if (walletType === 'twitch') {
    const resTwitch = await fetch(`${BASE_URL}/saldo/twitch?user_id=${userId}&usx_token=${usx_token}&wax_account=${wax_account}`);
    const dataTwitch = await resTwitch.json();
    balances = dataTwitch.balances || [];
  }
  const uniqueSymbols = new Map();
  balances.forEach(balance => {
    if (balance.symbol && !uniqueSymbols.has(balance.symbol)) {
      uniqueSymbols.set(balance.symbol, balance.amount || 0);
    }
  });
  
  window.multiTokenBalances = {}; // ora va qui
  uniqueSymbols.forEach((amount, symbol) => {
    window.multiTokenBalances[symbol] = amount;
    const option = document.createElement('option');
    option.value = symbol;
    option.textContent = `${symbol} (available: ${amount})`;
    tokenSelect.appendChild(option);
  });
}

async function populateMultiChannels() {
  const channelSelect = document.getElementById('multiChannel');
  channelSelect.innerHTML = '';

  try {
    const res = await fetch(`${BASE_URL}/available_channels`);
    const data = await res.json();
    
    if (data.channels && Array.isArray(data.channels)) {
      data.channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        channelSelect.appendChild(option);
      });
    } else {
      channelSelect.innerHTML = '<option value="">No channels available</option>';
    }
  } catch (err) {
    channelSelect.innerHTML = '<option value="">Error loading channels</option>';
  }
}

function showMultiStormFeedback(message, isError = false) {
  const feedback = document.getElementById('multi-feedback');
  if (!feedback) return;

  feedback.style.display = 'block';
  feedback.style.backgroundColor = isError ? 'salmon' : 'lightgreen';
  feedback.style.color = isError ? '#721c24' : '#155724';
  feedback.style.border = isError ? '1px solid #f5c6cb' : '1px solid #c3e6cb';
  feedback.textContent = message;

  setTimeout(() => {
    feedback.style.display = 'none';
  }, 5000);
}

async function populateExtraChannels() {
  const mainSelect = document.getElementById('multiChannel');
  const container = document.getElementById('multiExtraChannels');

  const res = await fetch(`${BASE_URL}/available_channels`);
  const data = await res.json();

  if (!data.channels || !Array.isArray(data.channels)) return;

  container.innerHTML = '';
  const selectedChannel = mainSelect.value;

  data.channels.forEach(channel => {
    if (channel !== selectedChannel) {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.margin = '0.25rem 0';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = channel;
      checkbox.name = 'extraChannel';
      checkbox.classList.add('extra-channel-checkbox');

      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${channel}`));
      container.appendChild(label);
    }
  });
}

function updateMultiStormCostEstimation() {
  const amount = parseFloat(document.getElementById('multiAmount').value || 0);
  const count = parseInt(document.getElementById('multiCount').value || 0);
  const token = document.getElementById('multiTokenSymbol').value;
  const extraChannels = Array.from(document.querySelectorAll('.extra-channel-checkbox:checked')).map(cb => cb.value);
  if (!amount || !count || !token) return;

  const stormsPerChannel = count;
  const totalChannels = 1 + extraChannels.length;
  const totalStorms = stormsPerChannel * totalChannels;

  const totalCost = amount * totalStorms * 1.065;
  const userBalances = window.multiTokenBalances || {}; // viene popolato sotto
  const userBalance = userBalances[token] || 0;
  const remaining = userBalance - totalCost;

  document.getElementById('multiStormCost').textContent = `💰 Total Cost (incl. 6.5% fee): ${totalCost.toFixed(4)} ${token}`;
  document.getElementById('multiStormRemaining').textContent = `💼 Remaining Balance: ${remaining.toFixed(4)} ${token}`;
}

async function loadLogStormsGiveaways() {
  let container = document.getElementById('c2e-content');

  if (!container) {
    console.error("Elemento 'c2e-content' non trovato nel DOM.");
    return;
  }

  container.innerHTML = 'Loading Log Storms & Giveaways...';
  try {
    // Visualizza il modulo per aggiungere una tempesta
    container.innerHTML = `
      <div class="section-container">
        <h2 class="section-title">Add Scheduled Storm</h2>
    
        <!-- TOGGLER -->
        <div style="margin-bottom: 20px; display: flex; align-items: center; gap: 12px;">
          <span style="font-weight: bold;">Mode:</span>
          <div style="display: flex; border: 2px solid #4f46e5; border-radius: 30px; overflow: hidden;">
            <button id="toggle-single" style="
              background-color: #4f46e5;
              color: white;
              border: none;
              padding: 8px 20px;
              font-weight: bold;
              cursor: pointer;
              transition: background-color 0.3s ease;
            ">Single</button>
            <button id="toggle-multi" style="
              background-color: #e0e7ff;
              color: #1e40af;
              border: none;
              padding: 8px 20px;
              font-weight: bold;
              cursor: pointer;
              transition: background-color 0.3s ease;
            ">Multi</button>
          </div>
        </div>
    
        <!-- FORM SINGOLO -->
        <div id="single-form">
          <div id="add-storm-form" class="form-container">
    
            <!-- Scheduled Time and Timeframe -->
            <div style="display: flex; gap: 16px; align-items: flex-start;">
              <div style="flex: 0 0 20%;">
                <label class="input-label">Scheduled Time</label>
                <input type="datetime-local" id="scheduledTime" class="input-field">
              </div>
              <div style="flex: 0 0 20%;">
                <label class="input-label">Period</label>
                <select id="timeframe" class="input-field">
                  <option value="">Select Period</option>
                  <option value="5m">5m</option>
                  <option value="10m">10m</option>
                  <option value="15m">15m</option>
                  <option value="20m">20m</option>
                  <option value="30m">30m</option>
                  <option value="1h">1h</option>
                  <option value="2h">2h</option>
                  <option value="3h">3h</option>
                  <option value="4h">4h</option>
                  <option value="5h">5h</option>
                  <option value="6h">6h</option>
                  <option value="12h">12h</option>
                  <option value="1d">1d</option>
                  <option value="2d">2d</option>
                  <option value="3d">3d</option>
                  <option value="4d">4d</option>
                  <option value="5d">5d</option>
                  <option value="6d">6d</option>
                  <option value="7d">7d</option>
                  <option value="15d">15d</option>
                  <option value="30d">30d</option>
                  <option value="90d">90d</option>
                  <option value="180d">180d</option>
                  <option value="1y">1y</option>
                </select>
              </div>
            </div>
    
            <!-- Amount and Token Symbol -->
            <div>
              <div>
                <label class="input-label">Payment Method</label>
                <select id="paymentMethod" class="input-field">
                  <option value="twitch">Twitch</option>
                  <option value="telegram">Telegram</option>
                </select>
              </div>
              <div>
                <label class="input-label">Amount</label>
                <input type="number" id="amount" class="input-field">
              </div>
              <div>
                <label class="input-label">Token Symbol</label>
                <select id="tokenSymbol" class="input-field">
                  <option value="">Select Token</option>
                </select>
              </div>
            </div>
            <div>
              <div>
                <label class="input-label">Channel</label>
                <select id="channelName" class="input-field">
                  <option value="">Select Channel</option>
                </select>
              </div>
            </div>
            <div style="height: 10px;"></div>
    
            <div id="storm-feedback" style="margin-bottom: 16px; padding: 10px; border-radius: 6px; display: none; font-weight: bold; font-size: 14px;"></div>
    
            <button id="submitStorm" class="btn-submit">
              Add Storm
            </button>
          </div>
        </div>
    
        <!-- FORM MULTIPLO -->
        <div id="multi-form" style="display:none;">
          <div style="border: 2px dashed #6366f1; padding: 20px; border-radius: 10px; background-color: transparent;">
            <p style="font-weight: bold; font-size: 16px; color: #4f46e5; margin-bottom: 10px;">🚀 Schedule Multiple Storms</p>
            <div id="multi-feedback" style="margin-bottom: 16px; padding: 10px; border-radius: 6px; display: none; font-weight: bold; font-size: 14px;"></div>
        
            <!-- Payment Method -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Payment Method</label>
              <select id="multiPaymentMethod" class="input-field" style="width: 100%;">
                <option value="twitch">Twitch</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
            
            <!-- Start time -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Start Time</label>
              <input type="datetime-local" id="multiStartTime" class="input-field" style="width: 100%;">
            </div>
        
            <!-- Interval -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Storms Frequency</label>
              <select id="multiInterval" class="input-field" style="width: 100%;">
                <option value="">Select Interval</option>
                <option value="5m">5 minutes</option>
                <option value="10m">10 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="30m">30 minutes</option>
                <option value="1h">1 hour</option>
                <option value="2h">2 hours</option>
                <option value="1d">1 day</option>
              </select>
            </div>
        
            <!-- Number of storms -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Storms Quantity</label>
              <input type="number" id="multiCount" min="1" class="input-field" style="width: 100%;">
            </div>
            
            <!-- Timeframe della Storm -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Storm Period</label>
              <select id="multiTimeframe" class="input-field" style="width: 100%;">
                <option value="">Select Timeframe</option>
                <option value="5m">5m</option>
                <option value="10m">10m</option>
                <option value="15m">15m</option>
                <option value="20m">20m</option>
                <option value="30m">30m</option>
                <option value="1h">1h</option>
                <option value="2h">2h</option>
                <option value="3h">3h</option>
                <option value="4h">4h</option>
                <option value="5h">5h</option>
                <option value="6h">6h</option>
                <option value="12h">12h</option>
                <option value="1d">1d</option>
                <option value="2d">2d</option>
                <option value="3d">3d</option>
                <option value="4d">4d</option>
                <option value="5d">5d</option>
                <option value="6d">6d</option>
                <option value="7d">7d</option>
                <option value="15d">15d</option>
                <option value="30d">30d</option>
                <option value="90d">90d</option>
                <option value="180d">180d</option>
                <option value="1y">1y</option>
              </select>
            </div>

            <!-- Amount -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Amount</label>
              <input type="number" id="multiAmount" class="input-field" style="width: 100%;">
            </div>
        
            <!-- Token -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Token Symbol</label>
              <select id="multiTokenSymbol" class="input-field" style="width: 100%;">
                <option value="">Select Token</option>
              </select>
            </div>
            <!-- Summary Costs -->
            <div style="margin-top:12px; font-size: 0.95rem; color: #333;">
              <div id="multiStormCost" style="margin-bottom:6px;">💰 Total Cost (incl. 6.5% fee): —</div>
              <div id="multiStormRemaining" style="color:#444;">💼 Remaining Balance: —</div>
            </div>

            <!-- Channel -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Channel</label>
              <select id="multiChannel" class="input-field" style="width: 100%;">
                <option value="">Select Channel</option>
              </select>
            </div>
            <!-- Other Channels -->
            <div style="margin-bottom: 12px;">
              <label style="font-weight: 600;">Also apply these storms to:</label>
              <div id="multiExtraChannels" class="channel-checkbox-group"></div>

            </div>
        
            <!-- Submit button -->
            <button id="submitMultiStorms" class="btn-submit" style="margin-top: 10px;">Submit Multiple Storms</button>
          </div>
        </div>
    
        <h2 class="section-title mt-6">Scheduled Storms</h2>
        <div id="table-container" class="table-container">
          Loading Scheduled Storms...
        </div>
      </div>
    `;
    const toggleSingle = document.getElementById('toggle-single');
    const toggleMulti = document.getElementById('toggle-multi');
    const singleForm = document.getElementById('single-form');
    const multiForm = document.getElementById('multi-form');
    
    toggleSingle.addEventListener('click', () => {
      singleForm.style.display = 'block';
      multiForm.style.display = 'none';
      toggleSingle.style.backgroundColor = '#4f46e5';
      toggleSingle.style.color = 'white';
      toggleMulti.style.backgroundColor = '#e0e7ff';
      toggleMulti.style.color = '#1e40af';
    });
    
    toggleMulti.addEventListener('click', () => {
      singleForm.style.display = 'none';
      multiForm.style.display = 'block';
      toggleMulti.style.backgroundColor = '#4f46e5';
      toggleMulti.style.color = 'white';
      toggleSingle.style.backgroundColor = '#e0e7ff';
      toggleSingle.style.color = '#1e40af';
    });
    
    // Aggiungi evento per inviare il form
    document.getElementById('submitStorm').addEventListener('click', addScheduledStorm);

    // Popola i token simbolo
    const paymentMethodSelect = document.getElementById('paymentMethod');
    
    // Carica i token iniziali alla selezione predefinita
    const initialWalletType = paymentMethodSelect.value;
    await populateTokenSymbols(initialWalletType);
    
    // Ricarica i token se l'utente cambia metodo
    paymentMethodSelect.addEventListener('change', () => {
      const walletType = paymentMethodSelect.value;
      populateTokenSymbols(walletType);
    });

    // Popola i timeframes
    populateTimeframes();
    // Popola i canali
    await populateChannels();
    // Popola anche i campi del form multiplo
    await populateMultiTokenSymbols(document.getElementById('multiPaymentMethod').value);
    await populateMultiChannels();
    await populateExtraChannels();

    // Imposta i limiti per l'orario
    setScheduledTimeMinMax();
    const multiPaymentSelect = document.getElementById('multiPaymentMethod');
    multiPaymentSelect.addEventListener('change', () => {
      const walletType = multiPaymentSelect.value;
      populateMultiTokenSymbols(walletType);
      updateMultiStormCostEstimation();
    });

    // Carica la tabella delle tempeste programmate
    loadScheduledStorms();
  } catch (err) {
    container.innerHTML = `<div class="error-message">Error loading log storms and giveaways: ${err.message}</div>`;
  }
  document.getElementById('multiChannel').addEventListener('change', populateExtraChannels);

  ['multiAmount', 'multiCount', 'multiTokenSymbol', 'multiExtraChannels'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateMultiStormCostEstimation);
  });

  document.getElementById('submitMultiStorms').addEventListener('click', async () => {
    const button = document.getElementById('submitMultiStorms');
    button.disabled = true;
    button.textContent = 'Submitting...';
  
    const startTime = document.getElementById('multiStartTime').value;
    const intervalValue = document.getElementById('multiInterval').value;
    const stormCount = parseInt(document.getElementById('multiCount').value, 10);
    const amount = parseFloat(document.getElementById('multiAmount').value);
    const token = document.getElementById('multiTokenSymbol').value;
    const channel = document.getElementById('multiChannel').value;
    const paymentMethod = document.getElementById('multiPaymentMethod').value;
    const timeframe = document.getElementById('multiTimeframe').value;
  
    const requiredFields = [startTime, intervalValue, stormCount, amount, token, channel, paymentMethod, timeframe];
    const hasEmptyField = requiredFields.some(f => !f || f.toString().trim() === "");
  
    if (hasEmptyField) {
      showMultiStormFeedback("Please fill in all required fields.");
      button.disabled = false;
      button.textContent = 'Submit Multiple Storms';
      return;
    }
  
    if (stormCount < 1) {
      showMultiStormFeedback("Storm count must be at least 1.");
      button.disabled = false;
      button.textContent = 'Submit Multiple Storms';
      return;
    }
  
    function intervalToMs(interval) {
      const unit = interval.slice(-1);
      const value = parseInt(interval.slice(0, -1), 10);
      const multipliers = { m: 60000, h: 3600000, d: 86400000 };
      return value * multipliers[unit] || 0;
    }
  
    const baseTime = new Date(startTime);
    const intervalMs = intervalToMs(intervalValue);
    const extraChannels = Array.from(document.querySelectorAll('.extra-channel-checkbox:checked')).map(cb => cb.value);
    const channels = [channel, ...extraChannels];
  
    const storms = [];
    channels.forEach(ch => {
      for (let i = 0; i < stormCount; i++) {
        const scheduledDate = new Date(baseTime.getTime() + i * intervalMs);
        const isoString = scheduledDate.toISOString().slice(0, 16);
        storms.push({
          scheduled_time: isoString,
          timeframe,
          amount,
          token_symbol: token,
          channel_name: ch,
          payment_method: paymentMethod
        });
      }
    });
  
    try {
      const res = await fetch(`${BASE_URL}/schedule_storms_batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: window.userData.userId,
          token: window.userData.usx_token,
          wax_account: window.userData.wax_account,
          storms,
          interval: intervalValue,
          count: stormCount
        })
      });
  
      const result = await res.json();
  
      if (result.success) {
        showMultiStormFeedback("✅ Multiple storms scheduled successfully!");
        loadScheduledStorms();
        updateMultiStormCostEstimation();
      } else {
        const errorMsg = result.error || result.message || "Unknown error";
        showMultiStormFeedback("❌ Error: " + errorMsg, true);
      }
  
    } catch (err) {
      showMultiStormFeedback("❌ Error: " + err.message, true);
  
    } finally {
      button.disabled = false;
      button.textContent = 'Submit Multiple Storms';
    }
  });  
}

async function populateTokenSymbols(walletType) {
  const tokenSelect = document.getElementById('tokenSymbol');
  tokenSelect.innerHTML = '';
  const { userId, usx_token, wax_account } = window.userData;

  let balances = [];

  if (walletType === 'telegram') {
    const resTelegram = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const dataTelegram = await resTelegram.json();
    balances = dataTelegram.balances || [];
  } else if (walletType === 'twitch') {
    // Recupera bilanci da Twitch
    const resTwitch = await fetch(`${BASE_URL}/saldo/twitch?user_id=${userId}&usx_token=${usx_token}&wax_account=${wax_account}`);
    const dataTwitch = await resTwitch.json();
    balances = dataTwitch.balances || [];
  } else {
    console.warn('Wallet type unknown:', walletType);
    return;
  }

  const uniqueSymbols = new Map();

  balances.forEach(balance => {
    if (balance.symbol && !uniqueSymbols.has(balance.symbol)) {
      uniqueSymbols.set(balance.symbol, balance.amount || 0);
    }
  });

  // Aggiungi le opzioni al select
  uniqueSymbols.forEach((amount, symbol) => {
    const option = document.createElement('option');
    option.value = symbol;
    option.textContent = `${symbol} (available: ${amount})`;
    tokenSelect.appendChild(option);
  });
}

function populateTimeframes() {
  const timeframeSelect = document.getElementById('timeframe');
  const timeframes = [
    "5m", "10m", "15m", "20m", "30m", "1h", "2h", "3h", "4h", "5h", "6h", "12h",
    "1d", "2d", "3d", "4d", "5d", "6d", "7d", "15d", "30d", "90d", "180d", "1y"
  ];

  timeframes.forEach(frame => {
    const option = document.createElement('option');
    option.value = frame;
    option.textContent = frame;
    timeframeSelect.appendChild(option);
  });
}

// Funzione per popolare il dropdown dei Channel
async function populateChannels() {
  const channelSelect = document.getElementById('channelName');
  
  try {
    const res = await fetch(`${BASE_URL}/available_channels`);
    const data = await res.json();
    
    if (data.channels && Array.isArray(data.channels)) {
      data.channels.forEach(channel => {
        const option = document.createElement('option');
        option.value = channel;
        option.textContent = channel;
        channelSelect.appendChild(option);
      });
    } else {
      console.error("Channels data is invalid");
      channelSelect.innerHTML = '<option value="">No channels available</option>';
    }
  } catch (err) {
    console.error("Error loading channels:", err);
    channelSelect.innerHTML = '<option value="">Error loading channels</option>';
  }
}

// Funzione per popolare il campo orario con un minimo di 15 minuti e massimo 1 mese
function setScheduledTimeMinMax() {
  const scheduledTimeInput = document.getElementById('scheduledTime');
  const now = new Date();
  const minDate = new Date(now.getTime() + 15 * 60000); // 15 minuti da adesso
  const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60000); // 1 mese da adesso

  const minDateString = minDate.toISOString().slice(0, 16); // Limite inferiore (15 minuti dopo)
  const maxDateString = maxDate.toISOString().slice(0, 16); // Limite superiore (1 mese dopo)

  scheduledTimeInput.min = minDateString;
  scheduledTimeInput.max = maxDateString;
}

// Funzione per caricare le tempeste programmate
async function loadScheduledStorms() {
  const tableContainer = document.getElementById('table-container');
  tableContainer.innerHTML = 'Loading Scheduled Storms...';

  try {
    const res = await fetch(`${BASE_URL}/scheduled_storms`);

    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const allData = await res.json();

    if (allData.length === 0) {
      tableContainer.innerHTML = '<div>No scheduled storms found.</div>';
      return;
    }

    // Ordina tutti per scheduled_time (opzionale)
    allData.sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time));

    displayStormsData(allData);

  } catch (err) {
    tableContainer.innerHTML = `<div class="error-message">Error loading scheduled storms: ${err.message}</div>`;
  }
}

// Variabili globali univoche
let stormPag_currentPage = 1;
const stormPag_itemsPerPage = 100;
let stormPag_data = [];

function renderStormsTable(data, page = 1) {
  stormPag_data = data; // memorizziamo i dati globalmente
  stormPag_currentPage = page;

  const tableBody = document.querySelector('#table-container tbody');
  if (!tableBody) return;

  const start = (page - 1) * stormPag_itemsPerPage;
  const end = start + stormPag_itemsPerPage;
  const currentData = data.slice(start, end);

  let rowsHTML = '';

  currentData.forEach((storm) => {
    let winnersHTML = '';
    const winnersRaw = storm.winners_display?.trim();

    if (storm.status === 'executed') {
      if (winnersRaw && winnersRaw.toLowerCase() !== 'soon') {
        const winnersArray = winnersRaw.split(' | ').map(w => w.trim().toUpperCase());

        winnersHTML += `<div class="winners-wrapper">`;
        winnersArray.forEach((winner) => {
          winnersHTML += `
            <div class="winner-row">
              <span class="winner-name">${winner}</span>
            </div>`;
        });
        winnersHTML += `</div>`;
      } else {
        winnersHTML = `<span class="no-winners">No winners in the selected time interval :(</span>`;
      }
    } else {
      winnersHTML = `<span class="pending-winners">soon</span>`;
    }

    const pulse = storm.status === 'pending'
      ? `<div class="status-dot pending"></div>`
      : `<div class="status-dot executed"></div>`;

    rowsHTML += `
      <tr class="storm-row">
        <td class="cell">${storm.id}</td>
        <td class="cell">${new Date(storm.scheduled_time).toLocaleString()}</td>
        <td class="cell">${storm.offered_by}</td>
        <td class="cell">${storm.amount}</td>
        <td class="cell">${storm.token_symbol}</td>
        <td class="cell">${storm.channel_name}</td>
        <td class="cell">${storm.status}</td>
        <td class="cell">${winnersHTML}</td>
        <td class="cell">${pulse}</td>
      </tr>
    `;
  });

  tableBody.innerHTML = rowsHTML;
  addHoverEffectToRows();

  document.querySelectorAll('.winner-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.add('clicked');
      setTimeout(() => row.classList.remove('clicked'), 700);
    });
  });

  renderStormsPaginationControls(data.length);
}

function renderStormsPaginationControls(totalItems) {
  const totalPages = Math.ceil(totalItems / stormPag_itemsPerPage);

  const paginationHTML = `
    <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 10px 0; flex-wrap: wrap;">
      <button ${stormPag_currentPage === 1 ? 'disabled' : ''} onclick="renderStormsTable(stormPag_data, ${stormPag_currentPage - 1})">
        ◀ Previous
      </button>
      <span>Page ${stormPag_currentPage} of ${totalPages}</span>
      <button ${stormPag_currentPage === totalPages ? 'disabled' : ''} onclick="renderStormsTable(stormPag_data, ${stormPag_currentPage + 1})">
        Next ▶
      </button>
      
      <div style="display: flex; align-items: center; gap: 6px;">
        <label for="page-jump-input">Go to page:</label>
        <input type="number" id="page-jump-input" min="1" max="${totalPages}" style="width: 60px;" />
        <button id="page-jump-btn">Go</button>
      </div>
    </div>
  `;

  const topContainer = document.querySelector('#storm-pagination-top');
  const bottomContainer = document.querySelector('#storm-pagination-bottom');

  if (topContainer) topContainer.innerHTML = paginationHTML;
  if (bottomContainer) bottomContainer.innerHTML = paginationHTML;

  // Aggiungi listener al bottone "Go"
  const addPageJumpHandler = (container) => {
    const input = container.querySelector('#page-jump-input');
    const btn = container.querySelector('#page-jump-btn');

    if (btn && input) {
      btn.addEventListener('click', () => {
        const targetPage = parseInt(input.value, 10);
        if (!isNaN(targetPage) && targetPage >= 1 && targetPage <= totalPages) {
          renderStormsTable(stormPag_data, targetPage);
        } else {
          alert(`Please enter a page number between 1 and ${totalPages}`);
        }
      });
    }
  };

  if (topContainer) addPageJumpHandler(topContainer);
  if (bottomContainer) addPageJumpHandler(bottomContainer);
}

function sortStormsTable(key) {
  if (currentSort.key === key) {
    // Inverti direzione se si clicca due volte sullo stesso campo
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    // Altrimenti imposta nuova chiave e direzione ascendente
    currentSort.key = key;
    currentSort.direction = 'asc';
  }

  applyStormsFiltersAndSort(); // Ricalcola tabella con nuovo ordinamento
}

function displayStormsData(data, fullDataForFilters = data) {
  const tableContainer = document.getElementById('table-container');
  originalStormsData = data;
  const getUniqueValues = (data, key) => [...new Set(data.map(item => item[key]).filter(Boolean))].sort();
  const createOptions = (values) => `<option value="">All</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
  const channels = getUniqueValues(fullDataForFilters, 'channel_name');
  const statuses = getUniqueValues(fullDataForFilters, 'status');
  const offeredBys = getUniqueValues(fullDataForFilters, 'offered_by');
  const sortArrow = (key) => {
    if (currentSort.key === key) {
      return currentSort.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  tableContainer.innerHTML = `
    <div class="filter-toolbar">
      <div class="filter-group">
        <label for="filter-channel">Channel:</label>
        <select id="filter-channel" class="filter-select">${createOptions(channels)}</select>
      </div>
      <div class="filter-group">
        <label for="filter-status">Status:</label>
        <select id="filter-status" class="filter-select">${createOptions(statuses)}</select>
      </div>
      <div class="filter-group">
        <label for="filter-offeredby">Offered By:</label>
        <select id="filter-offeredby" class="filter-select">${createOptions(offeredBys)}</select>
      </div>
      <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
        <strong>Scheduled Time Range:</strong>
        <div style="display: flex; gap: 10px; align-items: center;">
          <label for="filter-start-date">From:</label>
          <input type="datetime-local" id="filter-start-date" />
          <label for="filter-end-date">To:</label>
          <input type="datetime-local" id="filter-end-date" />
        </div>
      </div>
      <button id="update-storms" class="btn btn-primary">Update Data</button>
    </div>

    <div>
      <div id="storm-pagination-top"></div>
      <table class="reward-table">
        <thead>
          <tr>
            <th onclick="sortStormsTable('id')">Storm-ID${sortArrow('id')}</th>
            <th onclick="sortStormsTable('scheduled_time')">Start Time${sortArrow('scheduled_time')}</th>
            <th onclick="sortStormsTable('offered_by')">Offered By${sortArrow('offered_by')}</th>
            <th onclick="sortStormsTable('amount')">Amount${sortArrow('amount')}</th>
            <th onclick="sortStormsTable('token_symbol')">Token${sortArrow('token_symbol')}</th>
            <th onclick="sortStormsTable('channel_name')">Channel${sortArrow('channel_name')}</th>
            <th onclick="sortStormsTable('status')">Status${sortArrow('status')}</th>
            <th>Winners</th>
            <th></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
      <div id="storm-pagination-bottom"></div>
    </div>
  `;
  renderStormsTable(data);

  document.getElementById('filter-channel').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-status').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-offeredby').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('update-storms').addEventListener('click', loadScheduledStorms);
  document.getElementById('filter-start-date').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-end-date').addEventListener('change', applyStormsFiltersAndSort);  
}
function addHoverEffectToRows() {
  const rows = document.querySelectorAll('.reward-table tbody tr');
  rows.forEach(row => {
    row.addEventListener('mouseenter', () => {
      row.classList.add('hovered');
    });
    row.addEventListener('mouseleave', () => {
      row.classList.remove('hovered');
    });
  });
}

function findNFTCardByAssetId(assetId) {
  const cards = document.querySelectorAll('.nft-card');
  for (const card of cards) {
    const idDiv = card.querySelector('.nft-id');
    if (idDiv && idDiv.textContent.trim() === `#${assetId}`) {
      return card;
    }
  }
  return null;
}

async function showNFTCardMessage(cardElement, message, isError = false) {
  // 🔄 Rimuove eventuali messaggi già presenti nella card
  const existing = cardElement.querySelector('.nft-message');
  if (existing) existing.remove();

  // 🧱 Crea un nuovo div per il messaggio
  const msgDiv = document.createElement('div');
  msgDiv.className = 'nft-message'; // per styling extra via CSS se desiderato
  msgDiv.textContent = message;     // Imposta il testo del messaggio

  // 💄 Stili di base per tema "cybertribal"
  msgDiv.style.marginTop = '0.75rem';                  // Spazio sopra al messaggio
  msgDiv.style.padding = '10px 14px';                  // Padding interno
  msgDiv.style.borderRadius = '10px';                  // Angoli arrotondati
  msgDiv.style.fontSize = '0.95rem';                   // Dimensione testo
  msgDiv.style.fontWeight = 'bold';                    // ➕ Testo in grassetto
  msgDiv.style.fontFamily = '"Orbitron", sans-serif';  // Font cyber
  msgDiv.style.letterSpacing = '0.03em';               // Spaziatura lettere
  msgDiv.style.textAlign = 'center';                   // Testo centrato
  msgDiv.style.backgroundColor = '#000';               // Sfondo nero
  msgDiv.style.border = `1px solid ${isError ? '#ff1a4b' : '#39ff14'}`; // Bordo neon
  msgDiv.style.color = isError ? '#ff1a4b' : '#39ff14'; // Colore testo neon
  msgDiv.style.textShadow = isError
    ? '0 0 5px #ff1a4b'
    : '0 0 6px #39ff14';                               // Glow neon leggero
  msgDiv.style.transition = 'opacity 0.3s ease';       // Dissolvenza

  // 📌 Aggiunge il messaggio nella card NFT
  cardElement.appendChild(msgDiv);

  // ⏳ Rimuove il messaggio dopo 4 secondi
  setTimeout(() => {
    msgDiv.style.opacity = '0';             // Inizio dissolvenza
    setTimeout(() => msgDiv.remove(), 300); // Rimuove dopo fade
  }, 4000);
}

// Aggiungi effetto hover alle righe della tabella per migliorare l'interazione
function addHoverEffectToRows() {
  const rows = document.querySelectorAll('.storm-table tbody tr');
  rows.forEach(row => {
    row.addEventListener('mouseenter', () => {
      row.classList.add('hovered');
    });
    row.addEventListener('mouseleave', () => {
      row.classList.remove('hovered');
    });
  });
}

// Load Schedule NFT-Giveaway
async function loadScheduleNFTGiveaway() {
  const container = document.getElementById('c2e-content');
  container.innerHTML = 'Loading Schedule NFT-Giveaway...';
  try {
    const res = await fetch(`${BASE_URL}/schedule_nft_giveaway`);
    const data = await res.json();
    container.innerHTML = JSON.stringify(data, null, 2);  // Display the data
  } catch (err) {
    container.innerHTML = `<div class="error-message">Error loading schedule nft-giveaway: ${err.message}</div>`;
  }
} async function handleNFTStake(farmId, templateId, assetId, isStaked) {
  const { userId, usx_token, wax_account } = window.userData;
  const action = isStaked ? 'remove' : 'add';
  const endpoint = `${BASE_URL}/${isStaked ? 'nft_remove' : 'nft_add'}?user_id=${userId}&usx_token=${usx_token}`;

  // Trova la card NFT prima della fetch
  const cardElement = findNFTCardByAssetId(assetId);

  // 🔍 Trova il nome della farm corrente per ricaricarla dopo
  const currentFarm = window.nftFarmsData?.find(f => f.farm_id === farmId);
  const currentFarmName = currentFarm?.farm_name || null;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        farm_id: farmId,
        template_id: templateId,
        wax_account,
        action
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Unknown error');

    if (cardElement) {
      await showNFTCardMessage(
        cardElement,
        (data.message || 'Success') + '\nYou can now close this window or wait for the farm to reload in 5 seconds...',
        false
      );
    
      // ⏳ Wait 5 seconds before reloading farms
      await new Promise(resolve => setTimeout(resolve, 5000));
    
      // 🔁 Reload all farms, keeping the current one active
      await loadNFTFarms(currentFarmName);
    }
  } catch (err) {
    console.error(err);
    if (cardElement) {
      await showNFTCardMessage(cardElement, "Errore: " + err.message, true);
    }
  }
}

// ========== Helpers ==========
function fmtNum(n, dp=6) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: dp });
}
function todayISO() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDaysISO(baseISO, delta) {
  const d = baseISO ? new Date(baseISO + 'T00:00:00Z') : new Date();
  d.setUTCDate(d.getUTCDate() + delta);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ========== Tabs ==========
function initTokenStakingTabs() {
  const tabPools = document.getElementById('tab-pools');
  const tabEarns = document.getElementById('tab-earnings');
  const contentPools = document.getElementById('tab-pools-content');
  const contentEarns = document.getElementById('tab-earnings-content');

  const activate = (which) => {
    const poolsActive = which === 'pools';
    tabPools.classList.toggle('active', poolsActive);
    tabPools.setAttribute('aria-selected', poolsActive ? 'true' : 'false');
    tabEarns.classList.toggle('active', !poolsActive);
    tabEarns.setAttribute('aria-selected', poolsActive ? 'false' : 'true');

    contentPools.hidden = !poolsActive;
    contentEarns.hidden = poolsActive;
  };

  tabPools.addEventListener('click', () => activate('pools'));
  tabEarns.addEventListener('click', () => {
    activate('earnings');
    // auto-refresh if empty
    const daysHost = document.getElementById('eh-days');
    if (!daysHost.dataset.loaded) {
      fetchTokenEarnings();
    }
  });

  // default: pools
  activate('pools');
}
// ========== Distribution Runner ==========
async function runTokenDistribution() {
  const btn = document.getElementById('btn-distribute');
  const spinner = document.getElementById('dist-spinner');
  const label = document.getElementById('dist-label');

  try {
    const dry = document.getElementById('dist-dry')?.checked ?? true;
    const adminWax = window.userData?.wax_account || "";

    // safety client-side (server farà comunque il check)
    if (adminWax !== 'agoscry4ever') {
      return Swal.fire('Forbidden', 'You are not allowed to run distribution.', 'error');
    }

    // UI: loading on
    if (btn) { btn.disabled = true; btn.style.opacity = '0.7'; }
    if (spinner) spinner.style.display = 'inline-block';
    if (label) label.textContent = dry ? 'Running (dry)…' : 'Running…';

    const res = await fetch(`${BASE_URL}/token_farms/distribute`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ dry_run: dry, admin_wax: adminWax })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      const msg = data?.error || 'Distribution failed';
      return Swal.fire('Error', msg, 'error');
    }

    const changes = Array.isArray(data.changes) ? data.changes : [];
    if (!changes.length) {
      return Swal.fire(
        'Done',
        `Distribution completed (${dry ? 'DRY-RUN' : 'LIVE'}). No per-user details returned.`,
        'success'
      );
    }

    // —— build summary (come già facevi) ——
    const byToken = {};
    const byPool  = {};
    changes.forEach(ch => {
      byToken[ch.token_symbol] = (byToken[ch.token_symbol] || 0) + Number(ch.net_assigned || 0);
      const key = `${ch.pool_id}:${ch.pool_name}`;
      byPool[key] = (byPool[key] || 0) + Number(ch.net_assigned || 0);
    });

    const tokenLines = Object.entries(byToken)
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([sym, amt]) => `<li><code>${sym}</code>: <b>${amt.toFixed(6)}</b></li>`).join('');

    const poolLines = Object.entries(byPool)
      .map(([k, amt]) => {
        const [pid, pname] = k.split(':');
        return `<li>Pool <b>${pname}</b> (#${pid}): <b>${amt.toFixed(6)}</b></li>`;
      }).join('');

    const rows = changes.slice(0, 200).map(ch => `
      <tr>
        <td>${ch.wax_account}</td>
        <td>${ch.pool_name} (#${ch.pool_id})</td>
        <td>${ch.token_symbol}</td>
        <td>${Number(ch.net_assigned).toFixed(6)}</td>
        <td>${Number(ch.fee_wallet || 0).toFixed(6)}</td>
        <td>${Number(ch.before || 0).toFixed(6)} → ${Number(ch.after || 0).toFixed(6)}</td>
        <td>${ch.storage}</td>
      </tr>
    `).join('');

    const html = `
      <div style="text-align:left">
        <p><b>Mode:</b> ${dry ? 'DRY-RUN' : 'LIVE'}</p>
        <p><b>Events:</b> ${changes.length}</p>

        <h4>Totals by token</h4>
        <ul>${tokenLines || '<li>-</li>'}</ul>

        <h4>Totals by pool</h4>
        <ul>${poolLines || '<li>-</li>'}</ul>

        <h4>Details (first 200)</h4>
        <div style="max-height:360px; overflow:auto; border:1px solid #333; border-radius:6px;">
          <table class="table-basic" style="width:100%; font-size:.9rem;">
            <thead>
              <tr>
                <th>Wax</th>
                <th>Pool</th>
                <th>Token</th>
                <th>Net</th>
                <th>Fee</th>
                <th>Balance</th>
                <th>Storage</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${changes.length > 200 ? `<p style="margin-top:8px;">…and ${changes.length - 200} more rows</p>` : ''}
      </div>
    `;

    Swal.fire({
      title: 'Token Farms Distribution',
      html,
      width: 900,
      confirmButtonText: 'OK'
    });

  } catch (err) {
    console.error(err);
    Swal.fire('Error', 'Unexpected error while running distribution', 'error');
  } finally {
    // UI: loading off
    const btn = document.getElementById('btn-distribute');
    const spinner = document.getElementById('dist-spinner');
    const label = document.getElementById('dist-label');
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    if (spinner) spinner.style.display = 'none';
    if (label) label.textContent = 'Run Distribution';
  }
}

// ========== Pools (existing UX kept) ==========
async function loadStakingPools() {
  try {
    const { userId, usx_token } = window.userData || {};
    const res = await fetch(`${BASE_URL}/open_pools?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`);
    const data = await res.json();

    if (!data.pools || data.pools.length === 0) {
      document.getElementById('pool-buttons').innerHTML = `<div class="error-message">No staking pools found.</div>`;
      document.getElementById('selected-pool-details').innerHTML = '';
      return;
    }

    const pools = data.pools;
    window.stakingPools = pools;

    renderPoolButtons(pools);

    const searchInput = document.getElementById('search-pools');
    searchInput.addEventListener('input', () => {
      const search = (searchInput.value || '').toLowerCase();
      const filtered = pools.filter(p => (p.token_symbol || '').toLowerCase().includes(search));
      renderPoolButtons(filtered);
    });

    const defaultPool = pools.find(p => p.pool_id === 1) || pools[0];
    renderPoolDetails(defaultPool);
  } catch (e) {
    console.error(e);
    document.getElementById('selected-pool-details').innerHTML = `<div class="error-message">Failed to load pools.</div>`;
  }
}

function renderPoolButtons(pools) {
  const container = document.getElementById('pool-buttons');
  container.innerHTML = '';
  pools.forEach(pool => {
    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.textContent = pool.token_symbol;
    btn.onclick = () => renderPoolDetails(pool);
    container.appendChild(btn);
  });
}
function renderPoolDetails(pool) {
  const container = document.getElementById('selected-pool-details');
  const rewards = Array.isArray(pool.rewards_info) ? pool.rewards_info : [];
  const depSym = (pool.token_symbol || pool.deposit_token?.symbol || 'UNKNOWN').toUpperCase();

  const rewardsHTML = rewards.map(r => `
    <div class="reward-box">
      <div class="reward-title">${r.reward_token}</div>
      <div><strong>Total:</strong> ${fmtNum(r.total_reward_deposit, 6)}</div>
      <div><strong>Daily:</strong> ${fmtNum(r.daily_reward, 6)}</div>
      <div><strong>APR:</strong> ${fmtNum(r.apr, 2)}%</div>
      <div><strong>Days Left:</strong> ${fmtNum(r.days_remaining, 0)}</div>
      <div class="reward-user-daily"><strong>Your Daily:</strong> ${fmtNum(r.user_daily_reward, 6)}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div
      role="region"
      aria-label="Staking Pool Details"
      style="
        margin-top:12px;
        padding:16px;
        border-radius:14px;
        background:
          radial-gradient(1200px 600px at 0% 100%, rgba(0,255,200,.08), transparent 45%),
          radial-gradient(1200px 600px at 100% 0%, rgba(255,0,255,.08), transparent 45%),
          linear-gradient(180deg, rgba(12,12,16,.96), rgba(9,9,12,.96));
        border:1px solid rgba(255,255,255,.12);
        box-shadow: 0 0 26px rgba(0,255,200,.12), inset 0 0 20px rgba(255,0,255,.06);
        color:#e7fffa;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      "
    >
      <!-- Header -->
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <h3
          class="card-title"
          style="
            margin:0;
            font-size:1.15rem;
            font-weight:900;
            letter-spacing:.3px;
            color:#9afbd9;
            text-shadow: 0 0 8px rgba(0,255,200,.35), 0 0 10px rgba(255,0,255,.18);
            line-height:1.2;
          "
        >
          Pool: ${depSym}
        </h3>
    
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
          <div
            title="Pool ID"
            style="
              padding:4px 8px;
              border:1px solid rgba(255,255,255,.16);
              border-radius:999px;
              font-weight:800;
              font-size:.85rem;
              color:#e7fffa;
              background:linear-gradient(135deg, rgba(0,255,200,.14), rgba(255,0,255,.10));
              box-shadow: inset 0 0 10px rgba(0,255,200,.10);
            "
          >#${pool.pool_id}</div>
    
          <div
            title="Status"
            style="
              padding:4px 10px;
              border:1px solid rgba(0,255,160,.35);
              border-radius:999px;
              font-weight:900;
              font-size:.80rem;
              color:#00150f;
              background:linear-gradient(135deg, rgba(0,255,160,.25), rgba(0,255,200,.18));
              box-shadow: 0 0 10px rgba(0,255,160,.20);
              text-transform:uppercase;
              letter-spacing:.4px;
            "
          ">${(pool.status||'active')}</div>
        </div>
      </div>
    
      <!-- Stats -->
      <div
        style="
          display:grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap:10px;
          margin-top:12px;
        "
      >
        <div
          style="
            padding:12px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.14);
            background:linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.25));
            box-shadow: inset 0 0 12px rgba(0,255,200,.08);
          "
        >
          <div style="font-size:.85rem; opacity:.85; margin-bottom:2px;">
            Total Staked
          </div>
          <div style="font-weight:900; font-size:1.05rem; color:#fff;">
            <span id="total-staked-${pool.pool_id}">
              ${fmtNum(pool.total_staked, 6)}
            </span>
            <span style="opacity:.9; font-weight:800;">${depSym}</span>
          </div>
        </div>
        <div
          style="
            padding:12px;
            border-radius:12px;
            border:1px solid rgba(255,255,255,.14);
            background:linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.25));
            box-shadow: inset 0 0 12px rgba(0,255,200,.08);
            margin-top:10px;
          "
        >
          <div style="font-size:.85rem; opacity:.85; margin-bottom:2px;">
            You Staked
          </div>
          <div style="font-weight:900; font-size:1.05rem; color:#fff;">
            <span id="you-staked-${pool.pool_id}">
              ${fmtNum(pool.user_staked, 6)}
            </span>
            <span style="opacity:.9; font-weight:800;">${depSym}</span>
          </div>
        </div>
      </div>
    
      <!-- Actions -->
      <div
        class="btn-group"
        style="
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top:14px;
        "
      >
        <button
          type="button"
          onclick="openStakeModal('add', ${pool.pool_id}, '${depSym}')"
          aria-label="Add tokens to pool ${depSym}"
          style="
            padding:10px 14px;
            border-radius:12px;
            border:1px solid rgba(0,255,200,.35);
            background:linear-gradient(135deg, rgba(0,255,200,.18), rgba(255,0,255,.12));
            color:#00150f;
            font-weight:900;
            letter-spacing:.2px;
            cursor:pointer;
            box-shadow: 0 0 14px rgba(0,255,200,.25);
            transition: transform .08s ease-in-out, box-shadow .12s ease-in-out;
          "
          onmouseover="this.style.boxShadow='0 0 18px rgba(0,255,200,.35)'; this.style.transform='translateY(-1px)';"
          onmouseout="this.style.boxShadow='0 0 14px rgba(0,255,200,.25)'; this.style.transform='translateY(0)';"
        >➕ Add Tokens</button>
    
        <button
          type="button"
          onclick="openStakeModal('remove', ${pool.pool_id}, '${depSym}')"
          aria-label="Remove tokens from pool ${depSym}"
          style="
            padding:10px 14px;
            border-radius:12px;
            border:1px solid rgba(255,0,120,.35);
            background:linear-gradient(135deg, rgba(255,0,120,.18), rgba(255,160,0,.12));
            color:#1a0a0e;
            font-weight:900;
            letter-spacing:.2px;
            cursor:pointer;
            box-shadow: 0 0 14px rgba(255,0,120,.25);
            transition: transform .08s ease-in-out, box-shadow .12s ease-in-out;
          "
          onmouseover="this.style.boxShadow='0 0 18px rgba(255,0,120,.35)'; this.style.transform='translateY(-1px)';"
          onmouseout="this.style.boxShadow='0 0 14px rgba(255,0,120,.25)'; this.style.transform='translateY(0)';"
        >➖ Remove Tokens</button>
      </div>
    
      <!-- Rewards -->
      <h2
        class="subheading"
        style="
          margin:16px 0 8px;
          font-size:1rem;
          font-weight:900;
          color:#9afbd9;
          letter-spacing:.3px;
          text-shadow:0 0 8px rgba(0,255,200,.25);
        "
      >Rewards</h2>
    
      <div
        class="reward-grid"
        style="
          display:grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap:10px;
        "
      >
        ${
          rewards.length
            ? rewards.map(r => `
              <div
                style="
                  padding:12px;
                  border-radius:12px;
                  border:1px solid rgba(255,255,255,.12);
                  background:
                    linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,.25));
                  box-shadow: inset 0 0 12px rgba(0,255,200,.06);
                "
                title="${r.reward_token} reward details"
              >
                <div
                  style="
                    font-weight:900; color:#e7fffa; margin-bottom:6px;
                    display:flex; align-items:center; justify-content:space-between;
                  "
                >
                  <span style="letter-spacing:.2px;">${r.reward_token}</span>
                  <span style="
                    font-size:.75rem; padding:2px 8px; border-radius:999px;
                    border:1px solid rgba(255,255,255,.14);
                    color:#9afbd9; background:rgba(0,255,200,.08);
                  ">
                    APR ${fmtNum(r.apr, 2)}%
                  </span>
                </div>
    
                <div style="display:flex; justify-content:space-between; font-size:.9rem; margin:4px 0;">
                  <span style="opacity:.85;">Total</span>
                  <strong style="color:#fff;">${fmtNum(r.total_reward_deposit, 6)}</strong>
                </div>
    
                <div style="display:flex; justify-content:space-between; font-size:.9rem; margin:4px 0;">
                  <span style="opacity:.85;">Daily</span>
                  <strong style="color:#fff;">${fmtNum(r.daily_reward, 6)}</strong>
                </div>
    
                <div style="display:flex; justify-content:space-between; font-size:.9rem; margin:4px 0;">
                  <span style="opacity:.85;">Days Left</span>
                  <strong style="color:#fff;">${fmtNum(r.days_remaining, 0)}</strong>
                </div>
    
                <div style="
                  margin-top:6px; padding:8px; border-radius:10px;
                  border:1px dashed rgba(255,255,255,.16);
                  background:linear-gradient(180deg, rgba(0,255,200,.06), rgba(255,0,255,.05));
                  font-size:.9rem;
                ">
                  <span style="opacity:.85;">Your Daily</span>
                  <span style="float:right; font-weight:900; color:#fff;">${fmtNum(r.user_daily_reward, 6)}</span>
                </div>
              </div>
            `).join('')
            : `<div style="
                 padding:14px; border:1px dashed rgba(255,255,255,.18);
                 border-radius:12px; color:#e7fffa; text-align:center;
                 background:linear-gradient(180deg, rgba(0,255,200,.05), rgba(255,0,255,.05));
               ">
                 No rewards configured.
               </div>`
        }
      </div>
    </div>
  `;
}

// ========== Earning History ==========
function initEarningHistoryControls() {
  const startEl = document.getElementById('eh-start');
  const endEl   = document.getElementById('eh-end');
  const quickEl = document.getElementById('eh-quick');
  const refresh = document.getElementById('eh-refresh');

  // default: last 7 days
  const end = todayISO();
  const start = addDaysISO(end, -6);
  startEl.value = start;
  endEl.value = end;
  quickEl.value = '7';

  quickEl.addEventListener('change', () => {
    const days = parseInt(quickEl.value, 10) || 7;
    const e = todayISO();
    const s = addDaysISO(e, -(days - 1));
    startEl.value = s;
    endEl.value = e;
  });

  refresh.addEventListener('click', () => fetchTokenEarnings());
}

async function fetchTokenEarnings() {
  const start = (document.getElementById('eh-start').value || '').trim();
  const end   = (document.getElementById('eh-end').value   || '').trim();
  const { wax_account } = window.userData || {};

  const params = new URLSearchParams();
  if (wax_account) params.set('wax_account', wax_account);
  if (start) params.set('start', start);
  if (end) params.set('end', end);

  const hostDays = document.getElementById('eh-days');
  const hostSum  = document.getElementById('eh-summary-body');
  hostDays.dataset.loaded = '1';
  hostDays.innerHTML = `<div class="loading-message">Loading earnings...</div>`;
  hostSum.textContent = 'Loading…';

  try {
    const res = await fetch(`${BASE_URL}/token_farms/earnings?` + params.toString());
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    renderTokenEarnings(data);
  } catch (e) {
    console.error(e);
    hostDays.innerHTML = `<div class="error-message">Failed to load earnings.</div>`;
    hostSum.textContent = 'Error while loading.';
  }
}

function renderTokenEarnings(payload) {
  const hostDays = document.getElementById('eh-days');
  const hostSum  = document.getElementById('eh-summary-body');

  if (!payload || payload.available === false || !Array.isArray(payload.days) || payload.days.length === 0) {
    hostDays.innerHTML = `<div class="label">No earnings in the selected range.</div>`;
    hostSum.textContent = 'Total: 0';
    return;
  }

  // Summary
  const totals = payload.summary?.totals_by_token || {};
  const totalNet = payload.summary?.total_net || 0;
  const chips = Object.keys(totals)
    .map(sym => `<div class="chip" style="display:inline-flex; gap:.35rem; align-items:center; padding:.25rem .5rem; border:1px solid #2b2b2b; border-radius:999px; margin:.2rem .2rem 0 0;">
      <span style="font-weight:700;">${sym}</span>
      <span>${fmtNum(totals[sym], 6)}</span>
    </div>`).join('');
  hostSum.innerHTML = `
    <div><strong>Total net:</strong> ${fmtNum(totalNet, 6)}</div>
    <div style="margin-top:6px;">${chips || ''}</div>
  `;

  // Per-day rendering
  const days = payload.days;
  hostDays.innerHTML = days.map(day => {
    const totalsByToken = day.totals_by_token || {};
    const badges = Object.keys(totalsByToken).map(sym => `
      <div class="chip" style="display:inline-flex; gap:.35rem; align-items:center; padding:.2rem .5rem; border:1px solid #2b2b2b; border-radius:999px;">
        <span style="font-weight:700;">${sym}</span>
        <span>${fmtNum(totalsByToken[sym], 6)}</span>
      </div>
    `).join('');

    const pools = (day.pools || []).map(p => {
      const tokens = p.tokens || {};
      const tokenLines = Object.keys(tokens).map(sym => {
        const t = tokens[sym] || {};
        return `
          <div class="kv-line" style="display:flex; justify-content:space-between;">
            <div><strong>${sym}</strong> <span style="opacity:.8;">(${t.storage})</span></div>
            <div>+${fmtNum(t.net, 6)}</div>
          </div>
        `;
      }).join('');
      return `
        <div class="card" style="padding:.75rem; border:1px solid #2b2b2b; border-radius:10px;">
          <div class="label"><strong>${p.pool_name}</strong></div>
          <div class="label" style="opacity:.85;">Stake: ${fmtNum(p.user_stake, 6)} / Total ${fmtNum(p.stakes_total, 6)}</div>
          <div style="margin-top:.5rem; display:flex; flex-direction:column; gap:.25rem;">
            ${tokenLines || '<div class="label">No tokens</div>'}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="card" style="margin-bottom:10px;">
        <div class="card-title" style="display:flex; justify-content:space-between; align-items:center;">
          <span>${day.date}</span>
          <span style="display:flex; gap:.35rem; flex-wrap:wrap;">${badges}</span>
        </div>
        <div class="pools-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:10px; margin-top:.5rem;">
          ${pools || '<div class="label">No pools</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// 🔄 Carica e cache i bilanci se mancanti o se force=true.
// Salva in: window.twitchWalletBalances, window.telegramWalletBalances
async function ensureBalancesLoaded(force = false) {
  const { userId, usx_token, wax_account } = window.userData || {};
  if (!userId || !usx_token || !wax_account) {
    console.warn("[wallet] userData incompleta.");
    return { twitch: [], telegram: [] };
  }

  const needTwitch   = force || !Array.isArray(window.twitchWalletBalances);
  const needTelegram = force || !Array.isArray(window.telegramWalletBalances);

  const tasks = [];
  if (needTelegram) {
    tasks.push(
      fetch(`${BASE_URL}/saldo?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`)
        .then(r => r.json()).then(j => j?.balances || []).then(arr => (window.telegramWalletBalances = arr))
        .catch(() => (window.telegramWalletBalances = []))
    );
    window.walletBalances = window.telegramWalletBalances
  }
  if (needTwitch) {
    tasks.push(
      fetch(`${BASE_URL}/saldo/twitch?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}&wax_account=${encodeURIComponent(wax_account)}`)
        .then(r => r.json()).then(j => j?.balances || []).then(arr => (window.twitchWalletBalances = arr))
        .catch(() => (window.twitchWalletBalances = []))
    );
  }
  if (tasks.length) await Promise.all(tasks);

  return {
    twitch: window.twitchWalletBalances || [],
    telegram: window.telegramWalletBalances || []
  };
}

function openStakeModal(type, poolId, tokenSymbol) {
  const { wax_account, userId, usx_token } = window.userData || {};
  const sym = (tokenSymbol || '').toUpperCase();
  let walletType = window.currentWalletTab || 'twitch'; // 'twitch'|'telegram'

  // UI skeleton immediata (loader)
  showModal({
    title: `<h3 class="modal-title" style="margin:0 0 8px;color:#e7fffa;font-weight:900;text-shadow:0 0 10px rgba(0,255,200,.35),0 0 10px rgba(255,0,255,.25)">${type==='add'?'Add':'Remove'} ${sym}</h3>`,
    body: `
      <div style="display:flex;align-items:center;gap:10px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:linear-gradient(180deg,rgba(12,12,16,.92),rgba(10,10,12,.92));color:#9afbd9;">
        <div class="spinner" style="width:18px;height:18px;border:3px solid rgba(0,255,200,.25);border-top-color:#00ffc8;border-radius:50%;animation:spin .8s linear infinite"></div>
        <div>Loading balances…</div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
    `
  });

  // Assicura i balances prima di calcolare
  ensureBalancesLoaded().then(async () => {
    const getBal = (w, token) => {
      const list = (w === 'twitch' ? window.twitchWalletBalances : window.telegramWalletBalances) || [];
      const row = list.find(r => (r.symbol || '').toUpperCase() === token.toUpperCase());
      return parseFloat(row?.amount || 0);
    };

    // balance mostrato nella testata (source per ADD, staked per REMOVE)
    let headerBalance = 0;
    if (type === 'add') {
      headerBalance = getBal(walletType, sym);
    } else {
      const pool = (window.stakingPools || []).find(p => p.pool_id === poolId);
      headerBalance = parseFloat(pool?.user_staked || 0);
    }

    const feePct = (type === 'remove') ? 0.0315 : 0;
    const toFix = (n, d=6) => Number(n || 0).toFixed(d);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    // corpo modale completo
    const body = `
      <div style="
        background:
          radial-gradient(1200px 600px at 10% -10%, rgba(0,255,200,.08), transparent 40%),
          radial-gradient(1000px 500px at 110% 110%, rgba(255,0,255,.08), transparent 40%),
          linear-gradient(180deg, rgba(10,10,10,.95), rgba(12,12,16,.95));
        border: 1px solid rgba(0,255,200,.25);
        box-shadow: 0 0 30px rgba(0,255,200,.15), inset 0 0 20px rgba(255,0,255,.07);
        border-radius: 14px; padding: 16px; color: #e7fffa;
        font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      ">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="font-weight:800; letter-spacing:.3px; color:#9afbd9; text-shadow:0 0 8px rgba(0,255,200,.35);">
            ${type==='add'?'Available':'Staked in Farm'}:
            <span id="stake-available" style="color:#fff;">${toFix(headerBalance)}</span> <span style="opacity:.9">${sym}</span>
          </div>
          <div style="font-size:.85rem;opacity:.8;">Pool #${poolId}</div>
        </div>

        <!-- segmented wallet switch -->
        <div style="margin:8px 0 12px;">
          <div role="tablist" aria-label="Wallet selector" style="
            display:flex; gap:0; align-items:center; width:100%;
            background:rgba(0,0,0,.35); border:1px solid rgba(255,255,255,.18);
            border-radius:999px; overflow:hidden; box-shadow:inset 0 0 12px rgba(0,255,200,.1);
          ">
            <button id="seg-twitch" role="tab" aria-selected="false" data-w="twitch" style="
              flex:1; padding:10px 12px; border:none; cursor:pointer; font-weight:900; letter-spacing:.2px;
              background:transparent; color:#e7fffa;
            ">🎮 Twitch</button>
            <button id="seg-telegram" role="tab" aria-selected="false" data-w="telegram" style="
              flex:1; padding:10px 12px; border:none; cursor:pointer; font-weight:900; letter-spacing:.2px;
              background:transparent; color:#e7fffa;
            ">🤖 Telegram</button>
          </div>
          <div id="seg-sub" style="margin-top:6px; font-size:.85rem; opacity:.8;">
            ${type==='add'?'Source':'Destination'} wallet: <strong id="seg-label">${walletType.toUpperCase()}</strong>
          </div>
        </div>

        <!-- quick chips -->
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin:4px 0 8px;">
          ${[10,25,50,75,100].map(p => `
            <button class="stake-quick" data-p="${p}" style="
              border:1px solid rgba(255,255,255,.14); color:#e7fffa; background:transparent;
              padding:6px 10px; border-radius:8px; cursor:pointer;
              box-shadow: 0 0 8px rgba(0,255,200,.15); font-weight:700; letter-spacing:.2px;
            ">${p}%</button>`).join('')}
        </div>

        <!-- range -->
        <div style="margin:8px 0 6px;">
          <input id="stake-range" type="range" min="0" max="100" value="0" style="
            width:100%; accent-color:#00e6b8;
            background:linear-gradient(90deg, rgba(0,255,200,.25), rgba(255,0,255,.25));
          ">
        </div>

        <!-- amount -->
        <div style="display:flex; gap:8px; align-items:center;">
          <label for="stake-amount" style="font-size:.95rem;opacity:.9;">Amount</label>
          <input id="stake-amount" type="number" step="0.000001" value="0" inputmode="decimal" style="
            flex:1; padding:10px 12px; border-radius:10px;
            border:1px solid rgba(255,255,255,.14);
            background:rgba(0,0,0,.35); color:#fff;
            box-shadow: inset 0 0 10px rgba(0,255,200,.08);
          ">
          <div style="opacity:.8">${sym}</div>
        </div>

        <!-- summary -->
        <div id="stake-summary" style="
          margin-top:10px; padding:10px; border-radius:10px;
          border:1px dashed rgba(255,255,255,.16);
          background:linear-gradient(180deg, rgba(0,255,200,.06), rgba(255,0,255,.05));
          font-size:.95rem; line-height:1.35;
        ">
          <div>You will ${type==='add'?'add':'remove'} <strong>0.000000</strong> ${sym}</div>
          ${feePct>0?`<div>Fee (~${(feePct*100).toFixed(2)}%): <strong>0.000000</strong> ${sym}</div>`:''}
          ${feePct>0?`<div>Net received: <strong>0.000000</strong> ${sym}</div>`:''}
          <div style="margin-top:6px; font-size:.85rem; opacity:.75;">
            ${type==='add'?'Source':'Destination'}: <strong id="sum-wallet">${walletType.toUpperCase()}</strong> wallet
          </div>
        </div>

        <button id="stake-submit" style="
          width:100%; margin-top:14px; padding:12px 14px; border-radius:12px;
          border:1px solid rgba(0,255,200,.4); color:#00150f; font-weight:900; letter-spacing:.3px;
          background: conic-gradient(from 180deg at 50% 50%, #ffe600, #f39c12, #ff00ff, #00ffcc, #ffe600);
          box-shadow: 0 0 18px rgba(0,255,200,.35), inset 0 0 30px rgba(255,0,255,.12);
          cursor:pointer; transition: transform .08s ease-in-out;
        ">
          <span id="stake-submit-txt">Go!</span>
          <span id="stake-submit-spin" style="display:none; margin-left:8px;">⏳</span>
        </button>
      </div>
    `;
    showModal({ title: document.querySelector('#universal-modal .modal-title')?.outerHTML || '', body });

    // refs
    const $ = (id) => document.getElementById(id);
    const elAvail = $('stake-available');
    const elRange = $('stake-range');
    const elAmt   = $('stake-amount');
    const elSum   = $('stake-summary');
    const elBtn   = $('stake-submit');
    const elTxt   = $('stake-submit-txt');
    const elSpn   = $('stake-submit-spin');
    const elSegT  = $('seg-twitch');
    const elSegG  = $('seg-telegram');
    const elSegLb = $('seg-label');
    const elSumW  = $('sum-wallet');

    // Calibra precisione/step per il token della pool
    const initialAvail = (type === 'add') ? headerBalance : headerBalance;
    const stakeCal = await calibrateAmountControls({
      symbol: sym,
      balance: initialAvail,
      amountInputId: 'stake-amount',
      rangeId: 'stake-range'
    });
    const DEC = stakeCal.decimals;

    function setSegActive(which) {
      [elSegT, elSegG].forEach(b=>{
        const active = b?.dataset?.w === which;
        b.style.background = active
          ? (which==='twitch'
              ? 'linear-gradient(135deg, rgba(255,0,255,.22), rgba(120,0,255,.14))'
              : 'linear-gradient(135deg, rgba(0,255,160,.25), rgba(0,255,200,.15))')
          : 'transparent';
        b.setAttribute('aria-selected', active ? 'true' : 'false');
        b.style.boxShadow = active ? '0 0 8px rgba(0,255,160,.25)' : 'none';
      });
      if (elSegLb) elSegLb.textContent = which.toUpperCase();
      if (elSumW)  elSumW.textContent  = which.toUpperCase();
    }
    setSegActive(walletType);

    function updateHeaderAvail() {
      if (type === 'add') {
        const v = getBal(walletType, sym);
        if (elAvail) elAvail.textContent = fmtAmount(v, DEC);
        return v;
      }
      if (elAvail) elAvail.textContent = fmtAmount(headerBalance, DEC);
      return headerBalance;
    }

    function renderSummary() {
      const avail = (type==='add') ? getBal(walletType, sym) : headerBalance;
      stakeCal.setBalance(avail); // aggiorna massimo selezionabile secondo i decimali

      const val = Number(elAmt.value) || 0;
      const fee = val * feePct;
      const net = val - fee;

      elSum.innerHTML = `
        <div>You will ${type==='add'?'add':'remove'} <strong>${fmtAmount(val, DEC)}</strong> ${sym}</div>
        ${feePct>0?`<div>Fee (~${(feePct*100).toFixed(2)}%): <strong>${fmtAmount(fee, DEC)}</strong> ${sym}</div>`:''}
        ${feePct>0?`<div>Net received: <strong>${fmtAmount(net, DEC)}</strong> ${sym}</div>`:''}
        <div style="margin-top:6px; font-size:.85rem; opacity:.75;">
          ${type==='add'?'Source':'Destination'}: <strong>${walletType.toUpperCase()}</strong> wallet
        </div>
      `;

      const disabled = (val <= 0 || val > stakeCal.maxAmount);
      elBtn.disabled = disabled;
      elBtn.style.opacity = disabled ? 0.6 : 1;
      elBtn.style.cursor  = disabled ? 'not-allowed' : 'pointer';
    }

    // switch tra wallet
    [elSegT, elSegG].forEach(btn => btn?.addEventListener('click', ()=>{
      walletType = btn.dataset.w;
      window.currentWalletTab = walletType;
      if (type === 'add') {
        const v = updateHeaderAvail();
        stakeCal.setBalance(v);
      }
      setSegActive(walletType);
      renderSummary();
    }));

    // quick chips (10/25/50/75/100)
    document.querySelectorAll('.stake-quick').forEach(b=>{
      b.addEventListener('click', ()=>{
        const pct = Number(b.dataset.p || 0);
        const avail = (type==='add') ? getBal(walletType, sym) : headerBalance;
        const raw = (avail * pct) / 100;
        stakeCal.setAmount(raw);     // tronca e sincronizza slider
        renderSummary();
      });
    });

    // ricalcola summary quando cambia slider/amount
    elRange.addEventListener('input', renderSummary);
    elAmt.addEventListener('input', renderSummary);

    // init
    updateHeaderAvail();
    renderSummary();
    elBtn.addEventListener('click', async ()=>{
      const avail = (type==='add') ? getBal(walletType, sym) : headerBalance;
      const amount = clamp(parseFloat(elAmt.value||'0'), 0, avail);
      if (amount<=0 || amount>avail) return;

      // disabilita globalmente le azioni e il pulsante specifico
      setButtonsEnabled(false);
      elBtn.disabled = true; 
      elTxt.textContent = (type==='add')?'Processing…':'Unstaking…'; 
      elSpn.style.display='inline-block';

      const payload = {
        user_id: userId,
        pool_id: poolId,
        token_symbol: sym,
        wax_account,
        amount,
        ...(type==='add' ? { source_wallet: walletType } : { target_wallet: walletType })
      };

      try {
        const res = await fetch(`${BASE_URL}/${type==='add'?'stake_add':'stake_remove'}?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`, {
          method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Request failed');

        if (json && json.new_user_staked != null) {
          const el = document.getElementById(`you-staked-${poolId}`);
          if (el) el.textContent = fmtNum(json.new_user_staked, 6);
        }
        if (json && json.new_pool_total_staked != null) {
          const totEl = document.getElementById(`total-staked-${poolId}`);
          if (totEl) totEl.textContent = fmtNum(json.new_pool_total_staked, 6);
        }

        const pools = window.stakingPools || [];
        const i = pools.findIndex(p => p.pool_id === poolId);
        if (i > -1) {
          if (json.new_user_staked != null) pools[i].user_staked = json.new_user_staked;
          if (json.new_pool_total_staked != null) pools[i].total_staked = json.new_pool_total_staked;
        }

        showModalMessage("✅ Operation completed successfully. Closing in 5s…", "success");

        setTimeout(async ()=>{
          closeModal();
          await ensureBalancesLoaded(true);                   // refresh balances
          await loadWallet(window.currentWalletTab||'twitch', true); // resta sul tab attuale
          if (typeof loadStakingPools==='function') loadStakingPools();
        }, 5000);
      } catch (e) {
        console.error(e);
        showModalMessage(`❌ ${e.message || 'Unexpected error'}`, 'error');

        // riabilita SOLO in errore
        setButtonsEnabled(true);
        elBtn.disabled=false; 
        elTxt.textContent='Go!'; 
        elSpn.style.display='none';
      }
    });
  });
}

function showModalMessage(message, type = 'info') {
  const messageBox = document.querySelector('#universal-modal .modal-message');
  if (!messageBox) return;

  messageBox.innerHTML = `
    <div class="modal-alert ${type}">
      ${message}
    </div>
  `;
}

async function loadWallet(preferredTab = 'twitch', force = false) {
  const desired = preferredTab || window.currentWalletTab || 'twitch';
  await ensureBalancesLoaded(force); // permette il refresh forzato dal backend

  const walletHost = document.getElementById('wallet-table');
  if (!walletHost) return;

  walletHost.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;">
      <!-- segmented switch -->
      <div role="tablist" aria-label="Wallets" style="
        display:flex; gap:0; background:rgba(0,0,0,.35);
        border:1px solid rgba(255,255,255,.18); border-radius:999px; overflow:hidden;
        box-shadow:inset 0 0 12px rgba(0,255,200,.1);
      ">
        <button class="wallet-tab" data-w="twitch" role="tab" aria-selected="false" style="
          padding:8px 14px; border:none; cursor:pointer; font-weight:900; color:#e7fffa; background:transparent;
        ">🎮 Twitch</button>
        <button class="wallet-tab" data-w="telegram" role="tab" aria-selected="false" style="
          padding:8px 14px; border:none; cursor:pointer; font-weight:900; color:#e7fffa; background:transparent;
        ">🤖 Telegram</button>
        <button class="wallet-tab" data-w="history" role="tab" aria-selected="false" style="
          padding:8px 14px; border:none; cursor:pointer; font-weight:900; color:#e7fffa; background:transparent;
        ">📜 Transactions History</button>        
      </div>

      <!-- search -->
      <div style="display:flex;align-items:center;gap:8px;">
        <input id="wallet-search" placeholder="Search token…" style="
          padding:8px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.14);
          background:rgba(0,0,0,.35); color:#fff; min-width:220px;
          box-shadow: inset 0 0 8px rgba(0,255,200,.08);
        ">
      </div>
    </div>

    <div id="wallet-content" style="margin-top:12px;"></div>
  `;

   const setActive = (w) => {
     walletHost.querySelectorAll('.wallet-tab').forEach(b=>{
       const active = b.dataset.w === w;
      b.style.background = active
        ? (w==='twitch'
            ? 'linear-gradient(135deg, rgba(255,0,255,.22), rgba(120,0,255,.14))'
            : w==='telegram'
              ? 'linear-gradient(135deg, rgba(0,255,160,.25), rgba(0,255,200,.15))'
              : 'linear-gradient(135deg, rgba(0,160,255,.25), rgba(0,200,255,.15))')
        : 'transparent';
       b.style.boxShadow = active ? '0 0 8px rgba(0,255,160,.25)' : 'none';
       b.setAttribute('aria-selected', active ? 'true':'false');
     });
   };


  walletHost.querySelectorAll('.wallet-tab').forEach(b=>{
    b.addEventListener('click', ()=>{
      const w = b.dataset.w;
      window.currentWalletTab = w;
      setActive(w);
      renderWalletView(w);
    });
  });

  window.currentWalletTab = desired;
  setActive(desired);
  renderWalletView(desired);
}

function renderWalletView(type) {
  const container = document.getElementById('wallet-content');
  const searchEl  = document.getElementById('wallet-search');
  if (searchEl && searchEl.parentElement) {
    searchEl.parentElement.style.display = (type === 'history') ? 'none' : 'flex';
  }

  // Stub "Transactions Historie" (implementerai in seguito)
  if (type === 'history') {
    container.innerHTML = `
      <div class="cv-card" style="padding:12px; border-radius:14px; margin-bottom:10px;">
        <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; justify-content:space-between;">
          <div style="display:flex; gap:.6rem; flex-wrap:wrap; align-items:center;">
            <input id="th-search" placeholder="Search (tx, memo, from, to…)" style="
              background:#151515; border:1px solid #333; color:#eee; padding:.55rem .7rem; border-radius:10px; width:260px;">
            <select id="th-type" class="cv-btn" title="Type" style="min-width:150px;">
              <option value="">All Types</option>
              <option value="withdraw">Withdraw</option>
              <option value="swap">Swap</option>
              <option value="transfer">Transfer</option>
              <option value="bridge">Bridge</option>
            </select>
            <select id="th-status" class="cv-btn" title="Status" style="min-width:150px;">
              <option value="">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
            </select>
            <select id="th-channel" class="cv-btn" title="Channel" style="min-width:150px;">
              <option value="">All Channels</option>
              <option value="twitch">Twitch</option>
              <option value="telegram">Telegram</option>
              <option value="wax">On-chain</option>
              <option value="internal">Internal</option>
            </select>
            <select id="th-symbol" class="cv-btn" title="Token" style="min-width:140px;">
              <option value="">All Tokens</option>
            </select>
            <select id="th-range" class="cv-btn" title="Time range" style="min-width:140px;">
              <option value="">All time</option>
              <option value="24h">Last 24h</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          <div style="display:flex; gap:.5rem; align-items:center;">
            <button id="th-refresh" class="cv-btn" title="Refresh">⟳ Refresh</button>
          </div>
        </div>
      </div>

      <div id="th-list" style="display:grid; gap:10px;"></div>

      <div id="th-footer" style="display:flex; justify-content:center; margin-top:10px;">
        <button id="th-loadmore" class="btn btn-glow" style="min-width:220px;">Load more</button>
      </div>
    `;

    // ---------- State ----------
    const th = {
      items: [],            // raw audit rows
      txMap: new Map(),     // key -> aggregated tx
      rows: [],             // aggregated list (render)
      nextCursor: null,
      loading: false,
      pageSize: 100,
      filters: { q:'', type:'', status:'', channel:'', symbol:'', range:'' }
    };

    const el = {
      list: document.getElementById('th-list'),
      loadMore: document.getElementById('th-loadmore'),
      refresh: document.getElementById('th-refresh'),
      export: null,
      search: document.getElementById('th-search'),
      type: document.getElementById('th-type'),
      status: document.getElementById('th-status'),
      channel: document.getElementById('th-channel'),
      symbol: document.getElementById('th-symbol'),
      range: document.getElementById('th-range'),
      footer: document.getElementById('th-footer')
    };

    // ---------- Utils ----------
    const esc = v => String(v ?? '').replace(/[&<>"'`]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[m]));
    const fmtAmt = (n, d=6) => (Number(n||0) || 0).toFixed(d);
    const fmtDate = iso => { try { return new Date(iso).toLocaleString(); } catch { return iso||''; } };
    const debounce = (fn, ms=160) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

    // ---------- Fetch (≤100 per call) ----------
    async function fetchAuditPage(cursor=null) {
      const payload = {
        user_id: window.userData?.userId,
        usx_token: window.userData?.usx_token,
        wax_account: window.userData?.wax_account,
        limit: th.pageSize,
        cursor,
        filters: { // the backend may ignore; client will still filter
          type: th.filters.type,
          status: th.filters.status,
          channel: th.filters.channel,
          symbol: th.filters.symbol,
          q: th.filters.q,
          range: th.filters.range
        }
      };
      try {
        if (typeof API !== 'undefined' && API.post) {
          const r = await API.post('/audit_history', payload, 15000);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.data?.items ? r.data : { items: Array.isArray(r.data) ? r.data : [], next_cursor: null };
        }
        const res = await fetch(`${BASE_URL}/audit_history`, {
          method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data?.items ? data : { items: Array.isArray(data) ? data : [], next_cursor: null };
      } catch(e) {
        console.warn('[history] fetch failed:', e);
        return { items: [], next_cursor: null };
      }
    }

    // ---------- Aggregation helpers ----------
    // Build grouping key:
    //  - prefer tx_id
    //  - else compose from (reference_type, reference_id, channel, from/to) + minute bucket
    function txKeyFor(it) {
      const et  = String(it.event_type||'').toLowerCase();
      const rt  = String(it.reference_type||'').toLowerCase();
      const id  = it.id && String(it.id);
      const txid= it.tx_id || it.metadata?.tx_id;
    
      if (txid) return `tx::${txid}`;
    
      // 🔒 NON aggregare transfer/bridge (mostra ogni riga separata)
      if (rt === 'internal_transfer' || et.startsWith('transfer') || et.startsWith('bridge')) {
        return `row::${id || crypto?.randomUUID?.() || Math.random()}`;
      }
    
      // 🏧 Withdraw: gruppo "initiated + send" per simbolo+destinatario su bucket 20'
      if (rt === 'withdraw' || et.startsWith('withdraw') || et === 'send') {
        const sym = (it.symbol||'').toUpperCase();
        const to  = (it.to_account||'').toLowerCase();
        const tms = it.created_at ? new Date(it.created_at).getTime() : Date.now();
        const bucket = Math.floor(tms / (20*60*1000)); // 20 minuti
        return `wd::${sym}|${to}|${bucket}`;
      }
    
      // 🔄 Swap: raggruppa per pair + canale + importo input su bucket 5'
      if (rt === 'swap' || et.startsWith('swap')) {
        const ref = String(it.reference_id||'').toUpperCase(); // es: FROM->TO
        const ch  = String(it.channel||'').toLowerCase();
        const ain = (it.amount!=null) ? Number(it.amount).toFixed(6) : '0';
        const tms = it.created_at ? new Date(it.created_at).getTime() : Date.now();
        const bucket = Math.floor(tms / (5*60*1000));
        return `sw::${ref}|${ch}|${ain}|${bucket}`;
      }
    
      // fallback: non aggregare
      return `row::${id || crypto?.randomUUID?.() || Math.random()}`;
    }


    function upsertTx(it) {
      const et = String(it.event_type||'').toLowerCase();
      if (et === 'network_fee' || et === 'fee_collected') return; // hide fees always

      // Infer primary type for UI
      const primaryType = (() => {
        const rt = String(it.reference_type||'').toLowerCase();
        if (rt === 'swap') return 'swap';
        if (rt === 'internal_transfer') return 'transfer';
        if (rt === 'bridge') return 'bridge';
        // withdraw flow tags:
        if (['withdraw_initiated','withdraw_completed','withdraw_failed','send'].includes(et)) return 'withdraw';
        return rt || (it.object_type || 'tx');
      })();

      const key = txKeyFor(it);
      const cur = th.txMap.get(key) || {
        key,
        type: primaryType,                 // withdraw|swap|transfer|bridge
        status: 'pending',                 // pending|success|failed
        created_at: it.created_at || null,
        updated_at: it.created_at || null,
        channel: (it.channel || '').toLowerCase(),
        from_account: it.from_account || '',
        to_account: it.to_account || '',
        tx_id: it.tx_id || it.metadata?.tx_id || null,
        memo: it.memo || '',
        // amounts (we show net / received and/or spent)
        amount_in: null,   // e.g., swap debit / withdraw requested
        symbol_in: null,
        amount_out: null,  // e.g., swap credit / withdraw sent / transfer net / bridge net
        symbol_out: null,
        // swap pair parsing (FROM->TO)
        pair: null,
        meta: it.metadata || {}
      };

      // time bounds
      if (it.created_at) {
        if (!cur.created_at || new Date(it.created_at) < new Date(cur.created_at)) cur.created_at = it.created_at;
        if (!cur.updated_at || new Date(it.created_at) > new Date(cur.updated_at)) cur.updated_at = it.created_at;
      }
      // memo (keep the latest meaningful)
      if (it.memo && (!cur.memo || it.memo.length > cur.memo.length)) cur.memo = it.memo;

      // Populate amounts/status by event type
      switch (et) {
        // ---------- WITHDRAW ----------
        case 'withdraw_initiated': {
          // tentative net (if provided via metadata), but keep pending
          cur.status = (cur.status === 'success' || cur.status === 'failed') ? cur.status : 'pending';
          if (cur.amount_out == null) cur.amount_out = Number(it.metadata?.net_on_chain || it.amount || 0);
          if (!cur.symbol_out) cur.symbol_out = it.symbol || cur.symbol_out;
          break;
        }
        case 'send':
        case 'withdraw_completed': {
          cur.status = 'success';
          cur.amount_out = Number(it.amount || cur.amount_out || 0); // show net sent
          cur.symbol_out = it.symbol || cur.symbol_out;
          if (!cur.tx_id && it.tx_id) cur.tx_id = it.tx_id;
          if (it.to_account) cur.to_account = it.to_account;
          break;
        }
        case 'withdraw_failed': {
          if (cur.status !== 'success') cur.status = 'failed';
          break;
        }

        // ---------- SWAP ----------
        case 'swap': {
          cur.type = 'swap';
        
          // pair FROM->TO
          const ref = it.reference_id || '';
          const parts = ref.split('->');
          if (parts.length === 2) {
            cur.pair = `${parts[0].toUpperCase()}→${parts[1].toUpperCase()}`;
            if (!cur.symbol_in)  cur.symbol_in  = parts[0].toUpperCase();
            if (!cur.symbol_out) cur.symbol_out = parts[1].toUpperCase();
          }
        
          // input: amount + symbol dal record principale
          if (it.amount != null)  cur.amount_in  = Number(it.amount);
          if (it.symbol)          cur.symbol_in  = it.symbol.toUpperCase();
        
          // output netto: ricavalo dalle metadata (real_output_before_fees - commission_dynamic)
          const md = it.metadata || {};
          const outNet = (md.real_output_before_fees!=null && md.commission_dynamic!=null)
            ? (Number(md.real_output_before_fees) - Number(md.commission_dynamic))
            : (md.quoted_output!=null && md.commission_total!=null)
              ? (Number(md.quoted_output) - Number(md.commission_total))
              : null;
          if (outNet != null) {
            cur.amount_out = outNet;
            if (!cur.symbol_out && parts.length === 2) cur.symbol_out = parts[1].toUpperCase();
          }
        
          // stato: usa il flag success nelle metadata, altrimenti resta pending; 'swap_failed' lo imposterà a failed
          if (md.success === true) cur.status = 'success';
          else if (md.success === false && cur.status !== 'success') cur.status = 'failed';
          break;
        }

        case 'debit': { // from_token spent
          cur.type = 'swap';
          cur.amount_in = Number(it.amount || cur.amount_in || 0);
          cur.symbol_in = it.symbol || cur.symbol_in;
          break;
        }
        case 'credit': { // to_token received (net!)
          cur.type = 'swap';
          cur.status = 'success';
          cur.amount_out = Number(it.amount || cur.amount_out || 0);
          cur.symbol_out = it.symbol || cur.symbol_out;
          break;
        }
        case 'swap_failed': {
          if (cur.status !== 'success') cur.status = 'failed';
          break;
        }

        // ---------- TRANSFER ----------
        case 'transfer': { // success; amount already net of fee
          cur.type = 'transfer';
          cur.status = 'success';
          cur.amount_out = Number(it.amount || cur.amount_out || 0);
          cur.symbol_out = it.symbol || cur.symbol_out;
          break;
        }
        case 'transfer_denied':
        case 'transfer_failed': {
          cur.type = 'transfer';
          if (cur.status !== 'success') cur.status = 'failed';
          if (cur.amount_out == null && it.amount != null) {
            cur.amount_out = Number(it.amount); cur.symbol_out = it.symbol || cur.symbol_out;
          }
          break;
        }

        // ---------- BRIDGE ----------
        case 'bridge_success': {
          cur.type = 'bridge';
          cur.status = 'success';
          // amount: gross; net amount in metadata.net_amount (prefer net display)
          if (it.metadata?.net_amount != null) {
            cur.amount_out = Number(it.metadata.net_amount);
            cur.symbol_out = it.symbol || cur.symbol_out;
          } else {
            cur.amount_out = Number(it.amount || cur.amount_out || 0);
            cur.symbol_out = it.symbol || cur.symbol_out;
          }
          break;
        }
        case 'bridge_failed':
        case 'bridge_denied': {
          cur.type = 'bridge';
          if (cur.status !== 'success') cur.status = 'failed';
          if (cur.amount_out == null && it.amount != null) {
            cur.amount_out = Number(it.amount); cur.symbol_out = it.symbol || cur.symbol_out;
          }
          break;
        }

        default: {
          // fallback: keep whatever; do not expose fees
          break;
        }
      }

      // keep channel/from/to if provided later
      if (it.channel && !cur.channel) cur.channel = String(it.channel||'').toLowerCase();
      if (it.from_account && !cur.from_account) cur.from_account = it.from_account;
      if (it.to_account && !cur.to_account) cur.to_account = it.to_account;

      th.txMap.set(key, cur);
    }

    function aggregateItems(items) {
      for (const it of items) upsertTx(it);
      th.rows = Array.from(th.txMap.values())
        .sort((a,b)=> new Date(b.created_at||0) - new Date(a.created_at||0));
    }

    // ---------- Filters ----------
    function inRange(createdAt, rangeKey) {
      if (!rangeKey) return true;
      const ts = createdAt ? new Date(createdAt).getTime() : 0;
      const now = Date.now();
      if (!ts) return false;
      if (rangeKey==='24h')  return (now - ts) <= 24*3600*1000;
      if (rangeKey==='7d')   return (now - ts) <= 7*24*3600*1000;
      if (rangeKey==='30d')  return (now - ts) <= 30*24*3600*1000;
      return true;
    }

    function applyClientFilters() {
      const q = (th.filters.q||'').trim().toLowerCase();
      const { type, status, channel, symbol, range } = th.filters;

      return th.rows.filter(r=>{
        const okT   = !type   || (r.type||'').toLowerCase() === type;
        const okS   = !status || r.status === status;
        const okC   = !channel|| (r.channel||'').toLowerCase() === channel;
        const okSym = !symbol || (r.symbol_in||'').toLowerCase() === symbol.toLowerCase()
                               || (r.symbol_out||'').toLowerCase() === symbol.toLowerCase();
        const okR   = inRange(r.created_at, range);
        const text  = [
          r.tx_id, r.memo, r.from_account, r.to_account, r.symbol_in, r.symbol_out, r.type, r.channel, r.pair
        ].map(v=>String(v||'').toLowerCase()).join(' ');
        const okQ   = !q || text.includes(q);
        return okT && okS && okC && okSym && okR && okQ;
      });
    }

    function buildSymbolOptions() {
      const set = new Set();
      th.rows.forEach(r=>{
        if (r.symbol_in)  set.add(r.symbol_in);
        if (r.symbol_out) set.add(r.symbol_out);
      });
      el.symbol.innerHTML = `<option value="">All Tokens</option>${
        [...set].sort().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')
      }`;
    }

    // ---------- UI bits ----------
    function statusChip(s) {
      if (s==='success') return `<span class="cv-badge" style="background:rgba(0,255,160,.16); border-color:#1e634d; color:#83ffd6;">SUCCESS</span>`;
      if (s==='failed')  return `<span class="cv-badge" style="background:rgba(255,60,60,.16); border-color:#6d1e1e; color:#ffb3b3;">FAILED</span>`;
      return `<span class="cv-badge" style="background:rgba(255,200,0,.14); border-color:#6a5514; color:#ffe28a;">PENDING</span>`;
    }
    function typeIcon(t) {
      t = String(t||'').toLowerCase();
      if (t==='withdraw') return '⬇';
      if (t==='swap')     return '🔄';
      if (t==='transfer') return '🔁';
      if (t==='bridge')   return '🔀';
      return '⧉';
    }
    function channelChip(c) {
      c = String(c||'').toLowerCase();
      if (c==='twitch')   return `<span class="cv-badge" style="background:rgba(255,0,255,.10); border-color:#5a2a6e; color:#ffc7ff;">Twitch</span>`;
      if (c==='telegram') return `<span class="cv-badge" style="background:rgba(0,255,200,.10); border-color:#1e5d57; color:#a7fff0;">Telegram</span>`;
      if (c==='wax')      return `<span class="cv-badge" style="background:rgba(0,160,255,.10); border-color:#1e4663; color:#aee3ff;">On-chain</span>`;
      return `<span class="cv-badge" style="background:rgba(180,180,180,.10); border-color:#424242; color:#e7e7e7;">Internal</span>`;
    }

    function rightValue(r){
      if (r.type==='swap') {
        const left  = r.amount_in != null ? `${fmtAmt(r.amount_in)} ${esc(r.symbol_in||'')}` : '';
        const right = r.amount_out!= null ? `${fmtAmt(r.amount_out)} ${esc(r.symbol_out||'')}`: '';
        if (left && right) return `${left} → ${right}`;
        if (right) return right;
        return left || '-';
      }
      // withdraw / transfer / bridge
      if (r.amount_out != null && r.symbol_out) return `${fmtAmt(r.amount_out)} ${esc(r.symbol_out)}`;
      return '-';
    }

    function rowDetails(r){
      // No fees shown; only helpful info
      const lines = [];
      if (r.pair) lines.push(`<div><strong>Pair</strong>: ${esc(r.pair)}</div>`);
      if (r.memo) lines.push(`<div><strong>Note</strong>: ${esc(r.memo)}</div>`);
      if (r.from_account) lines.push(`<div><strong>From</strong>: ${esc(r.from_account)}</div>`);
      if (r.to_account)   lines.push(`<div><strong>To</strong>: ${esc(r.to_account)}</div>`);
      if (r.meta?.execution_price != null) lines.push(`<div><strong>Execution price</strong>: ${esc(r.meta.execution_price)}</div>`);
      if (r.meta?.quoted_output != null)   lines.push(`<div><strong>Quoted output</strong>: ${esc(r.meta.quoted_output)}</div>`);
      if (r.type==='bridge' && r.meta?.net_amount != null) lines.push(`<div><strong>Net bridged</strong>: ${fmtAmt(r.meta.net_amount)} ${esc(r.symbol_out||'')}</div>`);
      return lines.join('') || `<div style="opacity:.8;">No extra details.</div>`;
    }
    
    function toneFor(r){
      const t=(r.type||'').toLowerCase();
      const s=r.status;
      const T={
        withdraw:{grad:'linear-gradient(135deg, rgba(255,0,180,.12), rgba(120,0,255,.10))'},
        swap    :{grad:'linear-gradient(135deg, rgba(0,180,255,.12), rgba(0,255,200,.10))'},
        transfer:{grad:'linear-gradient(135deg, rgba(255,180,0,.12), rgba(255,80,0,.10))'},
        bridge  :{grad:'linear-gradient(135deg, rgba(160,255,0,.12), rgba(0,200,120,.10))'}
      }[t] || {grad:'linear-gradient(135deg, rgba(200,200,200,.08), rgba(150,150,150,.06))'};
      const S={
        success:{border:'1px solid rgba(0,255,160,.28)', shadow:'0 0 18px rgba(0,255,160,.14)'},
        failed :{border:'1px solid rgba(255,80,80,.28)', shadow:'0 0 18px rgba(255,80,80,.12)'},
        pending:{border:'1px solid rgba(255,200,0,.22)', shadow:'0 0 18px rgba(255,200,0,.10)'}
      }[s] || {border:'1px solid rgba(255,255,255,.12)', shadow:'0 0 12px rgba(0,0,0,.2)'};
      return { ...T, ...S };
    }
    
    function typePill(t){
      t=String(t||'TX').toLowerCase();
      const M={
        withdraw:{bg:'rgba(255,0,180,.18)', br:'#7a2a6e'}, 
        swap    :{bg:'rgba(0,180,255,.18)', br:'#1e4663'},
        transfer:{bg:'rgba(255,180,0,.18)', br:'#6a4a14'},
        bridge  :{bg:'rgba(160,255,0,.18)', br:'#275a1e'}
      }[t] || {bg:'rgba(180,180,180,.14)', br:'#444'};
      const ico = typeIcon(t);
      return `<span class="cv-badge" style="background:${M.bg}; border-color:${M.br};">${ico} ${t.toUpperCase()}</span>`;
    }
    
    function statusChip(s){
      const m={
        success:{bg:'rgba(0,255,160,.16)', br:'#1e634d', fg:'#83ffd6', ico:'✔'},
        failed :{bg:'rgba(255,60,60,.16)',  br:'#6d1e1e', fg:'#ffb3b3', ico:'✖'},
        pending:{bg:'rgba(255,200,0,.14)',  br:'#6a5514', fg:'#ffe28a', ico:'…'}
      }[String(s||'').toLowerCase()] || {bg:'rgba(180,180,180,.14)', br:'#424242', fg:'#e7e7e7', ico:'•'};
      return `<span class="cv-badge" style="background:${m.bg}; border-color:${m.br}; color:${m.fg};">${m.ico} ${String(s||'').toUpperCase()}</span>`;
    }
    
    function amountHTML(r){
      const col = r.status==='failed' ? '#ff9a9a' : r.status==='pending' ? '#ffe28a' : '#9afbd9';
      return `<div style="font-weight:900; color:${col};">${rightValue(r)}</div>`;
    }

    function renderRows() {
      const rows = applyClientFilters();
      if (!rows.length) {
        el.list.innerHTML = `
          <div class="cv-card" style="padding:14px; text-align:center;">
            <div style="font-weight:800; color:#e7fffa; margin-bottom:4px;">No transactions match your filters.</div>
            <div style="opacity:.8;">Try clearing filters or loading more.</div>
          </div>`;
        return;
      }

      el.list.innerHTML = rows.map((r,i)=>{
        const waxLike = r.tx_id && /^[a-f0-9]{64}$/i.test(r.tx_id);
        const txUrl = waxLike ? `https://waxblock.io/transaction/${esc(r.tx_id)}` : '';
        const subtitle = [
          r.type ? r.type.toUpperCase() : 'TX',
          r.pair ? `• ${r.pair}` : (r.symbol_out || r.symbol_in ? `• ${esc(r.symbol_out||r.symbol_in)}`:''),
          r.channel ? `• ${r.channel}` : '',
          `• ${fmtDate(r.created_at)}`
        ].join(' ');
        const tip = `${(r.type||'TX').toUpperCase()} • ${r.status.toUpperCase()}
        ${r.pair||''}
        From: ${r.from_account||'-'}
        To:   ${r.to_account||'-'}
        ${r.memo||''}`.trim();

        const tone = toneFor(r);
        return `
          <div class="cv-card" title="${esc(tip)}" style="
            border-radius:14px; padding:10px;
            display:grid; grid-template-columns: 48px 1fr auto;
            gap:12px; align-items:center; overflow:hidden;
            background:${tone.grad}; border:${tone.border}; box-shadow:${tone.shadow};
          ">
            <div style="
              width:48px; height:48px; border-radius:12px; display:flex; align-items:center; justify-content:center;
              background:rgba(255,255,255,.03); outline:2px solid rgba(255,255,255,.06);
              font-size:1.2rem;">${typeIcon(r.type)}</div>
        
            <div style="min-width:0;">
              <div style="display:flex; gap:.6rem; align-items:center; flex-wrap:wrap;">
                ${typePill(r.type)}
                ${statusChip(r.status)}
                ${channelChip(r.channel)}
                ${r.symbol_out ? `<span class="cv-badge">${esc(r.symbol_out)}</span>` : (r.symbol_in ? `<span class="cv-badge">${esc(r.symbol_in)}</span>`:'')}
                ${r.to_account ? `<span class="cv-badge">→ ${esc(r.to_account)}</span>`:''}
              </div>
              <div style="color:#9aa0a6; font-size:.9rem; margin-top:.25rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${esc(subtitle)}
              </div>
              <div class="th-details" style="display:none; margin-top:.55rem; padding:.6rem; border:1px solid rgba(255,255,255,.12); border-radius:10px;
                    background:linear-gradient(180deg, rgba(12,14,16,.92), rgba(10,10,12,.92)); color:#dbecee;">
                ${rowDetails(r)}
              </div>
            </div>
        
            <div style="text-align:right; min-width:200px;">
              ${amountHTML(r)}
              <div style="margin-top:.35rem; display:flex; gap:.4rem; justify-content:flex-end; flex-wrap:wrap;">
                ${txUrl ? `<a href="${txUrl}" target="_blank" class="cv-btn" style="padding:.25rem .5rem;">View TX</a>` : `<span style="opacity:.7; padding:.25rem .5rem;">No TX yet</span>`}
                <button class="cv-btn th-toggle" data-i="${i}" style="padding:.25rem .5rem;">Details</button>
              </div>
            </div>
          </div>
        `;

      }).join('');

      // bind details toggles
      el.list.querySelectorAll('.th-toggle').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const card = btn.closest('.cv-card');
          const det  = card?.querySelector('.th-details');
          if (!det) return;
          const shown = det.style.display !== 'none';
          det.style.display = shown ? 'none' : 'block';
          btn.textContent = shown ? 'Details' : 'Hide';
        });
      });
    }

    // ---------- Load / More / Refresh ----------
    async function initialLoad() {
      th.loading = true;
      el.loadMore.disabled = true;
      th.txMap = new Map();
      el.loadMore.textContent = 'Loading…';
      const { items, next_cursor } = await fetchAuditPage(null);
      th.items = items || [];
      th.nextCursor = next_cursor || null;
      aggregateItems(th.items);
      buildSymbolOptions();
      renderRows();
      th.loading = false;
      el.loadMore.disabled = !th.nextCursor;
      el.loadMore.textContent = th.nextCursor ? 'Load more' : 'No more';
    }

    async function loadMore() {
      if (!th.nextCursor || th.loading) return;
      th.loading = true;
      el.loadMore.disabled = true;
      el.loadMore.textContent = 'Loading…';
      const { items, next_cursor } = await fetchAuditPage(th.nextCursor);
      (items||[]).forEach(i=> th.items.push(i));
      th.nextCursor = next_cursor || null;
      aggregateItems(items||[]);
      buildSymbolOptions();
      renderRows();
      th.loading = false;
      el.loadMore.disabled = !th.nextCursor;
      el.loadMore.textContent = th.nextCursor ? 'Load more' : 'No more';
    }

    // ---------- CSV Export (current filtered rows) ----------
    function exportCSV() {
      const rows = applyClientFilters();
      const head = ['date','status','type','channel','from','to','symbol_in','amount_in','symbol_out','amount_out','pair','tx_id','memo'];
      const lines = [head.join(',')].concat(rows.map(r => ([
        `"${(fmtDate(r.created_at)).replace(/"/g,'""')}"`,
        `"${(r.status||'').toUpperCase()}"`,
        `"${(r.type||'').toUpperCase()}"`,
        `"${r.channel||''}"`,
        `"${(r.from_account||'').replace(/"/g,'""')}"`,
        `"${(r.to_account||'').replace(/"/g,'""')}"`,
        `"${r.symbol_in||''}"`,
        `"${r.amount_in!=null ? fmtAmt(r.amount_in) : ''}"`,
        `"${r.symbol_out||''}"`,
        `"${r.amount_out!=null ? fmtAmt(r.amount_out) : ''}"`,
        `"${r.pair||''}"`,
        `"${r.tx_id||''}"`,
        `"${(r.memo||'').replace(/"/g,'""')}"`
      ].join(','))));
      const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `transactions_${Date.now()}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=> URL.revokeObjectURL(url), 1500);
    }

    // ---------- Bindings ----------
    el.loadMore.addEventListener('click', loadMore);
    el.refresh .addEventListener('click', initialLoad);
    //el.export  .addEventListener('click', exportCSV);

    const applyFilters = debounce(()=>{
      th.filters.q = el.search?.value || '';
      th.filters.type = (el.type?.value || '').toLowerCase();
      th.filters.status = (el.status?.value || '').toLowerCase();
      th.filters.channel = (el.channel?.value || '').toLowerCase();
      th.filters.symbol = el.symbol?.value || '';
      th.filters.range  = el.range?.value || '';
      renderRows();
    }, 140);

    el.search.addEventListener('input', applyFilters);
    el.type  .addEventListener('change', applyFilters);
    el.status.addEventListener('change', applyFilters);
    el.channel.addEventListener('change', applyFilters);
    el.symbol.addEventListener('change', applyFilters);
    el.range .addEventListener('change', applyFilters);

    // Kick-off
    initialLoad();
    return;
  }

  const raw = type==='twitch' ? (window.twitchWalletBalances||[]) : (window.telegramWalletBalances||[]);
  const balances = [...raw].sort((a,b)=> (b.amount||0)-(a.amount||0));

  const paint = (filter='')=>{
    const q = (filter||'').trim().toLowerCase();
    const rows = q ? balances.filter(t=> (t.symbol||'').toLowerCase().includes(q)) : balances;

    if (!rows.length) {
      container.innerHTML = `
        <div style="
          padding:18px; border:1px dashed rgba(255,255,255,.2); border-radius:12px;
          background:linear-gradient(180deg, rgba(0,255,200,.06), rgba(255,0,255,.05));
          color:#e7fffa; text-align:center;
        ">No tokens in <strong>${type}</strong> wallet.</div>`;
      return;
    }

    container.innerHTML = `
      <div style="
        display:grid; gap:10px;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      ">
        ${rows.map(t => `
          <div style="
            border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:12px;
            background:
              radial-gradient(600px 300px at 0% 100%, rgba(0,255,200,.07), transparent 55%),
              radial-gradient(600px 300px at 100% 0%, rgba(255,0,255,.07), transparent 55%),
              linear-gradient(180deg, rgba(10,10,12,.92), rgba(8,8,10,.92));
            box-shadow: 0 0 18px rgba(0,255,200,.1), inset 0 0 14px rgba(255,0,255,.05);
          ">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <div style="font-weight:900; color:#e7fffa; letter-spacing:.2px;">${t.symbol}</div>
              <div style="font-size:.85rem; color:#9afbd9;">${Number(t.amount||0).toFixed(6)}</div>
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <button class="token-act" data-action="withdraw" data-token="${t.symbol}" data-wallet="${type}" style="
                flex:1; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.18);
                background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
              ">Withdraw</button>
              <button class="token-act" data-action="swap" data-token="${t.symbol}" data-wallet="${type}" style="
                flex:1; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.18);
                background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
              ">Swap</button>
              <button class="token-act" data-action="transfer" data-token="${t.symbol}" data-wallet="${type}" style="
                flex:1; padding:8px; border-radius:10px; border:1px solid rgba(255,255,255,.18);
                background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
              ">Transfer</button>
              <button class="token-act" data-action="bridge_to" data-token="${t.symbol}" data-wallet="${type}" style="
                width:100%; padding:8px; border-radius:10px; border:1px solid rgba(0,255,200,.35);
                background:linear-gradient(135deg, rgba(0,255,200,.2), rgba(255,0,255,.14));
                color:#00150f; font-weight:900; cursor:pointer; box-shadow:0 0 14px rgba(0,255,200,.25);
              ">🔁 Move to ${type==='twitch'?'Telegram':'Twitch'}</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // bind azioni
    container.querySelectorAll('.token-act').forEach(btn=>{
      const action = btn.getAttribute('data-action');
      const token  = btn.getAttribute('data-token');
      const wallet = btn.getAttribute('data-wallet');
      btn.addEventListener('click', ()=> openModal(action, token, wallet));
    });
  };

  paint();
  searchEl?.addEventListener('input', ()=> paint(searchEl.value));
}

function renderWalletTable(type) {
  window.currentWalletTab = type; // traccia tab corrente

  const balances = type === 'twitch' ? (window.twitchWalletBalances || []) : (window.walletBalances || []);
  const container = document.getElementById('wallet-content');

  // evidenzia tab attivo se i bottoni esistono già
  const host = document.getElementById('wallet-table');
  if (host) {
    const tb = host.querySelector('.twitch-btn');
    const gb = host.querySelector('.telegram-btn');
    if (tb && gb) {
      if (type === 'twitch') {
        tb.style.background = 'linear-gradient(135deg, rgba(255,0,255,.22), rgba(120,0,255,.14))';
        tb.style.boxShadow  = '0 0 8px rgba(255,0,255,.25)';
        gb.style.background = 'transparent';
        gb.style.boxShadow  = 'none';
      } else {
        gb.style.background = 'linear-gradient(135deg, rgba(0,255,160,.25), rgba(0,255,200,.15))';
        gb.style.boxShadow  = '0 0 8px rgba(0,255,160,.25)';
        tb.style.background = 'transparent';
        tb.style.boxShadow  = 'none';
      }
    }
  }

  if (!balances || balances.length === 0) {
    container.innerHTML = `
      <div style="
        padding:18px; border:1px dashed rgba(255,255,255,.2); border-radius:12px;
        background:linear-gradient(180deg, rgba(0,255,200,.06), rgba(255,0,255,.05));
        color:#e7fffa; text-align:center;
      ">
        No balances for <strong>${type}</strong> wallet.
      </div>`;
    return;
  }

  container.innerHTML = `
    <div style="
      margin-top:10px;
      background:
        radial-gradient(900px 450px at 0% 100%, rgba(0,255,200,.08), transparent 45%),
        radial-gradient(900px 450px at 100% 0%, rgba(255,0,255,.08), transparent 45%),
        linear-gradient(180deg, rgba(10,10,12,.92), rgba(8,8,10,.92));
      border: 1px solid rgba(255,255,255,.12);
      border-radius: 14px;
      padding: 12px;
      box-shadow: 0 0 26px rgba(0,255,200,.12), inset 0 0 20px rgba(255,0,255,.06);
    ">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <div style="font-weight:900; color:#9afbd9; letter-spacing:.3px; text-shadow:0 0 8px rgba(0,255,200,.35);">
          Wallet: ${type.toUpperCase()}
        </div>
        <div style="font-size:.85rem; opacity:.8;">Tokens: ${balances.length}</div>
      </div>

      <div style="overflow:auto; border-radius:10px; border:1px solid rgba(255,255,255,.12);">
        <table style="width:100%; border-collapse:separate; border-spacing:0; min-width:520px;">
          <thead>
            <tr style="background:linear-gradient(180deg, rgba(0,255,200,.14), rgba(0,0,0,0));">
              <th style="text-align:left; padding:10px; color:#00e6b8;">Token</th>
              <th style="text-align:right; padding:10px; color:#00e6b8;">Amount</th>
              <th style="text-align:center; padding:10px; color:#00e6b8;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${balances.map(token => `
              <tr style="
                border-top:1px solid rgba(255,255,255,.08);
                transition: background .12s ease;
              " onmouseover="this.style.background='rgba(0,255,200,.06)';"
                onmouseout="this.style.background='transparent';">
                <td style="padding:10px; font-weight:800; color:#e7fffa;">${token.symbol}</td>
                <td style="padding:10px; text-align:right; color:#fff;">${Number(token.amount || 0).toFixed(6)}</td>
                <td style="padding:10px; text-align:center;">
                  <div style="display:flex; gap:6px; justify-content:center; flex-wrap:wrap;">
                    <button class="btn-action" data-action="withdraw" data-token="${token.symbol}" data-wallet="${type}" style="
                      padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.18);
                      background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
                    ">Withdraw</button>
                    <button class="btn-action" data-action="swap" data-token="${token.symbol}" data-wallet="${type}" style="
                      padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.18);
                      background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
                    ">Swap</button>
                    <button class="btn-action" data-action="transfer" data-token="${token.symbol}" data-wallet="${type}" style="
                      padding:6px 10px; border-radius:8px; border:1px solid rgba(255,255,255,.18);
                      background:transparent; color:#e7fffa; cursor:pointer; font-weight:700;
                    ">Transfer</button>
                    <button class="btn-action" data-action="bridge_to" data-token="${token.symbol}" data-wallet="${type}" style="
                      padding:6px 10px; border-radius:8px; border:1px solid rgba(0,255,200,.35);
                      background:linear-gradient(135deg, rgba(0,255,200,.2), rgba(255,0,255,.14));
                      color:#00150f; font-weight:900; cursor:pointer;
                      box-shadow: 0 0 14px rgba(0,255,200,.25);
                    ">
                      🔁 Move to ${type === 'twitch' ? 'Telegram' : 'Twitch'}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const token = btn.getAttribute('data-token');
    const walletType = btn.getAttribute('data-wallet') || 'twitch';
    btn.addEventListener('click', () => {
      openModal(action, token, walletType);
    });
  });
}
 
/* ===========================
 *  NFTs UI – enhanced version
 * =========================== */

/* Globals & defaults */
window.nftsData      = window.nftsData || [];
window.selectedNFTs  = window.selectedNFTs || new Set();
window.nftsPerPage   = window.nftsPerPage || 24;
window.currentPage   = window.currentPage || 1;

/* ---------- Utilities ---------- */
function fmt_slider(num, d = 0) {
  const n = Number(num || 0);
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}
function fmtDate(d) {
  try {
    return new Date(d).toLocaleDateString();
  } catch (_) {
    return String(d || '');
  }
}
function el(id) { return document.getElementById(id); }
function safeText(s) { return (s ?? '').toString(); }

function handleNFTImageError(mediaEl) {
  // fallback: se img o video falliscono, mostra un placeholder
  const wrap = mediaEl?.closest('.nft-card-media');
  if (wrap) {
    wrap.innerHTML = `
      <div style="
        width:100%; aspect-ratio: 1/1; display:flex; align-items:center; justify-content:center;
        background:linear-gradient(135deg, rgba(0,255,200,.08), rgba(255,0,255,.06));
        border:1px dashed rgba(255,255,255,.14); border-radius:12px; color:#9afbd9; font-weight:800;
      ">
        No Preview
      </div>
    `;
  }
}

/* ---------- Load & bootstrap ---------- */
async function loadNFTs() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/mynfts?user_id=${userId}&usx_token=${usx_token}`);
    const nftsData = await response.json();

    window.nftsData = nftsData.nfts || [];
    console.info("[🔵] NFTs caricati:", window.nftsData.length);

    // UI: mini header (sezione filtri già esiste: qui armonizziamo un po’ lo stile, se presenti)
    beautifyFilterBar();

    // dropdown collections
    populateDropdowns(window.nftsData);

    // render + events
    renderNFTs();
    setupFilterEvents();
  } catch (error) {
    console.error("[❌] Errore caricando NFTs:", error);
    const loading = el('nfts-loading');
    if (loading) loading.innerText = "❌ Error loading NFTs.";
  }
}

function beautifyFilterBar() {
  const barIds = ['search-template', 'filter-status', 'filter-stakable', 'filter-for-sale', 'filter-collection', 'sort-by'];
  barIds.forEach(id => {
    const node = el(id);
    if (node) {
      node.style.border        = '1px solid rgba(255,255,255,.14)';
      node.style.borderRadius  = '10px';
      node.style.background    = 'rgba(0,0,0,.35)';
      node.style.color         = '#e7fffa';
      node.style.padding       = '8px 10px';
      node.style.boxShadow     = 'inset 0 0 8px rgba(0,255,200,.08)';
      node.style.minWidth      = (id==='search-template') ? '220px' : '';
    }
  });

  // Count pill container
  const count = el('nfts-count');
  if (count) {
    count.style.padding = '6px 10px';
    count.style.border = '1px solid rgba(255,255,255,.14)';
    count.style.borderRadius = '999px';
    count.style.background = 'linear-gradient(135deg, rgba(0,255,200,.12), rgba(255,0,255,.10))';
    count.style.color = '#e7fffa';
    count.style.fontWeight = '800';
    count.style.boxShadow = '0 0 12px rgba(0,255,200,.15) inset';
  }
}

/* ---------- Filters (dropdowns) ---------- */
function populateDropdowns(nfts) {
  const collections = [...new Set(nfts.map(nft => safeText(nft.template_info.collection_name)))].filter(Boolean);
  const collectionSelect = el('filter-collection');
  if (!collectionSelect) return;

  const options = collections.sort().map(c => `<option value="${c}">${c}</option>`).join('');
  // non sovrascrivere eventuale "All": aggiungiamo
  collectionSelect.innerHTML = collectionSelect.innerHTML + options;
}

// legacy alias
function populateCollectionFilter(nfts) {
  populateDropdowns(nfts);
}

/* ---------- Rendering core ---------- */
function computeFilteredSorted() {
  let filtered = [...window.nftsData];

  // search
  const searchEl = el('search-template');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  if (q) {
    filtered = filtered.filter(nft =>
      safeText(nft.template_info.template_name).toLowerCase().includes(q) ||
      safeText(nft.asset_id).includes(q) ||
      safeText(nft.template_info.collection_name).toLowerCase().includes(q)
    );
  }

  // filters
  const status     = el('filter-status')?.value || '';
  const stakable   = el('filter-stakable')?.value || '';
  const forSale    = el('filter-for-sale')?.value || '';
  const collection = el('filter-collection')?.value || '';

  if (status)    filtered = filtered.filter(nft => nft.is_staked === status);
  if (status !== "Staked" && stakable) filtered = filtered.filter(nft => nft.is_stakable === stakable);
  if (forSale)   filtered = filtered.filter(nft => nft.for_sale === forSale);
  if (collection)filtered = filtered.filter(nft => safeText(nft.template_info.collection_name) === collection);

  // sort
  const sort = el('sort-by')?.value || '';
  if (sort === "created_at_desc") {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === "created_at_asc") {
    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sort === "template_name_asc") {
    filtered.sort((a, b) => safeText(a.template_info.template_name).localeCompare(safeText(b.template_info.template_name)));
  } else if (sort === "template_name_desc") {
    filtered.sort((a, b) => safeText(b.template_info.template_name).localeCompare(safeText(a.template_info.template_name)));
  }

  return filtered;
}

function updateCounts(filtered) {
  const total = window.nftsData.length;
  const sel   = window.selectedNFTs.size;
  const stakedCount   = filtered.filter(n => n.is_staked === 'Staked').length;
  const stakableCount = filtered.filter(n => n.is_stakable === 'Stakable').length;

  const countEl = el('nfts-count');
  if (countEl) {
    countEl.textContent = `${fmt_slider(filtered.length)} of ${fmt_slider(total)} • Selected ${fmt_slider(sel)} • Staked ${fmt_slider(stakedCount)} • Stakable ${fmt_slider(stakableCount)}`;
  }

  // badge sui bulk-actions
  const bulk = el('bulk-actions');
  if (bulk) {
    let badge = bulk.querySelector('#selected-counter-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'selected-counter-badge';
      badge.style.marginLeft = '8px';
      badge.style.padding = '4px 8px';
      badge.style.border = '1px solid rgba(255,255,255,.14)';
      badge.style.borderRadius = '999px';
      badge.style.fontSize = '.85rem';
      badge.style.background = 'linear-gradient(135deg, rgba(0,255,200,.12), rgba(255,0,255,.10))';
      badge.style.color = '#e7fffa';
      badge.style.fontWeight = '800';
      bulk.appendChild(badge);
    }
    badge.textContent = `Selected: ${fmt_slider(sel)}`;
  }
}

function buildNFTCard(nft) {
  const title       = safeText(nft.template_info.template_name);
  const assetId     = safeText(nft.asset_id);
  const nftId       = safeText(nft.nft_id);
  const collection  = safeText(nft.template_info.collection_name);
  const schema      = safeText(nft.template_info.schema_name);
  const isStaked    = safeText(nft.is_staked);
  const isStakable  = safeText(nft.is_stakable);
  const onSale      = safeText(nft.for_sale);
  const createdAt   = fmtDate(nft.created_at);
  const checked     = window.selectedNFTs.has(assetId) ? 'checked' : '';

  // Media prioritization: image → video → fallback
  let mediaHTML = '';
  if (nft.image_url) {
    mediaHTML = `
      <img src="${nft.image_url}" alt="NFT Image"
           class="nft-image"
           onerror="handleNFTImageError(this)"
           style="width:100%; height:auto; display:block; border-radius:12px;">
    `;
  } else if (nft.video_url) {
    mediaHTML = `
      <video src="${nft.video_url}" class="nft-video"
             autoplay muted loop playsinline
             onerror="handleNFTImageError(this)"
             style="width:100%; border-radius:12px;">
        Your browser does not support video.
      </video>
    `;
  } else {
    mediaHTML = `
      <div style="
        width:100%; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center;
        border-radius:12px; border:1px dashed rgba(255,255,255,.14);
        background:linear-gradient(135deg, rgba(0,255,200,.08), rgba(255,0,255,.06)); color:#9afbd9; font-weight:800;">
        No Preview
      </div>
    `;
  }

  // Badges
  const badge = (text, hue) => `
    <span style="
      display:inline-block; padding:2px 8px; border-radius:999px; font-size:.75rem; font-weight:900;
      border:1px solid rgba(255,255,255,.14); color:#00150f;
      background:linear-gradient(135deg, rgba(${hue},.85), rgba(0,255,200,.65));
      box-shadow:0 0 10px rgba(0,255,200,.18); margin-right:6px;">
      ${text}
    </span>`;

  const stakedBadge   = isStaked === 'Staked' ? badge('Staked', '255,0,255') : '';
  const stakableBadge = isStakable === 'Stakable' ? badge('Stakable', '0,255,160') : '';
  const saleBadge     = onSale === 'Yes' ? badge('On Sale', '255,180,0') : '';

  return `
    <div class="card card-hover nft-card" style="
      border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:12px;
      background:
        radial-gradient(600px 300px at 0% 100%, rgba(0,255,200,.07), transparent 55%),
        radial-gradient(600px 300px at 100% 0%, rgba(255,0,255,.07), transparent 55%),
        linear-gradient(180deg, rgba(10,10,12,.92), rgba(8,8,10,.92));
      box-shadow: 0 0 18px rgba(0,255,200,.1), inset 0 0 14px rgba(255,0,255,.05);
      position:relative;">
      
      <input type="checkbox" class="nft-checkbox"
             onclick="toggleNFTSelection(event, '${assetId}')"
             ${checked}
             style="position:absolute; top:10px; left:10px; width:18px; height:18px; cursor:pointer;">

      <div class="nft-card-content" onclick="openNFTModal('${assetId}')" style="cursor:pointer;">
        <div class="nft-card-media" style="margin-bottom:10px;">${mediaHTML}</div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <h3 class="nft-title" style="color:#e7fffa; font-size:1.0rem; margin:0; font-weight:900;">${title}</h3>
          <div style="font-size:.8rem; color:#9afbd9;">#${assetId}</div>
        </div>

        <div style="margin:6px 0;">${stakedBadge}${stakableBadge}${saleBadge}</div>

        <div style="font-size:.85rem; color:#c7fff0;">
          <div><strong>Collection:</strong> ${collection}</div>
          <div><strong>Schema:</strong> ${schema}</div>
          <div style="opacity:.8"><strong>NFT ID:</strong> ${nftId} &nbsp;•&nbsp; <strong>Acquired:</strong> ${createdAt}</div>
        </div>
      </div>
    </div>
  `;
}

function renderNFTs() {
  const nftsList = el('nfts-list');
  const loading  = el('nfts-loading');
  loading?.classList.add('hidden');

  const filtered = computeFilteredSorted();
  updateCounts(filtered);

  // Pagination (responsive to filter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / window.nftsPerPage));
  if (window.currentPage > totalPages) window.currentPage = totalPages;

  const start = (window.currentPage - 1) * window.nftsPerPage;
  const pageNFTs = filtered.slice(start, start + window.nftsPerPage);

  // Grid host styling
  if (nftsList) {
    nftsList.style.display = 'grid';
    nftsList.style.gap = '12px';
    nftsList.style.gridTemplateColumns = 'repeat(auto-fit, minmax(230px, 1fr))';
  }

  if (pageNFTs.length > 0) {
    nftsList.innerHTML = pageNFTs.map(buildNFTCard).join('');
  } else {
    nftsList.innerHTML = `
      <div class="empty-state" style="
        padding:18px; border:1px dashed rgba(255,255,255,.2); border-radius:12px;
        background:linear-gradient(180deg, rgba(0,255,200,.06), rgba(255,0,255,.05));
        color:#e7fffa; text-align:center;">
        No NFTs in your wallet match the filters.
      </div>
    `;
  }

  renderPagination(totalPages);
  updateBulkActions();
}

/* ---------- Selection & bulk ---------- */
function toggleNFTSelection(event, assetId) {
  event.stopPropagation();
  if (event.target.checked) {
    window.selectedNFTs.add(assetId);
  } else {
    window.selectedNFTs.delete(assetId);
  }
  updateBulkActions();
  // aggiorna conteggi live
  const filtered = computeFilteredSorted();
  updateCounts(filtered);
}

function updateBulkActions() {
  const bulk = el('bulk-actions');
  if (!bulk) return;

  // base visibility
  if (window.selectedNFTs && window.selectedNFTs.size > 0) {
    bulk.classList.remove('hidden');
  } else {
    bulk.classList.add('hidden');
  }

  // migliora lo stile container
  bulk.style.display = 'flex';
  bulk.style.alignItems = 'center';
  bulk.style.gap = '8px';
  bulk.style.flexWrap = 'wrap';

  // migliora stile pulsanti (se esistono già nel DOM)
  ['bulk-withdraw', 'bulk-send'].forEach(id => {
    const b = el(id);
    if (!b) return;
    b.style.border = '1px solid rgba(255,255,255,.18)';
    b.style.borderRadius = '10px';
    b.style.background = 'linear-gradient(135deg, rgba(0,255,200,.18), rgba(255,0,255,.14))';
    b.style.color = '#00150f';
    b.style.fontWeight = '900';
    b.style.padding = '8px 12px';
    b.style.boxShadow = '0 0 12px rgba(0,255,200,.25)';
    b.style.cursor = 'pointer';
  });

  // opzionale: seleziona tutto nella pagina corrente
  let selBtn = el('select-all-page');
  if (!selBtn) {
    selBtn = document.createElement('button');
    selBtn.id = 'select-all-page';
    selBtn.textContent = 'Select This Page';
    selBtn.style.border = '1px solid rgba(255,255,255,.18)';
    selBtn.style.borderRadius = '10px';
    selBtn.style.background = 'transparent';
    selBtn.style.color = '#e7fffa';
    selBtn.style.fontWeight = '800';
    selBtn.style.padding = '8px 12px';
    selBtn.style.cursor = 'pointer';
    bulk.prepend(selBtn);

    selBtn.addEventListener('click', () => {
      const filtered = computeFilteredSorted();
      const start = (window.currentPage - 1) * window.nftsPerPage;
      const pageNFTs = filtered.slice(start, start + window.nftsPerPage);
      pageNFTs.forEach(n => window.selectedNFTs.add(n.asset_id));
      renderNFTs();
    });
  }

  // Clear selection
  let clrBtn = el('clear-selection');
  if (!clrBtn) {
    clrBtn = document.createElement('button');
    clrBtn.id = 'clear-selection';
    clrBtn.textContent = 'Clear Selection';
    clrBtn.style.border = '1px solid rgba(255,255,255,.18)';
    clrBtn.style.borderRadius = '10px';
    clrBtn.style.background = 'transparent';
    clrBtn.style.color = '#e7fffa';
    clrBtn.style.fontWeight = '800';
    clrBtn.style.padding = '8px 12px';
    clrBtn.style.cursor = 'pointer';
    bulk.prepend(clrBtn);

    clrBtn.addEventListener('click', () => {
      window.selectedNFTs.clear();
      renderNFTs();
    });
  }
}

/* ---------- Pagination ---------- */
function renderPagination(totalPages) {
  const pagination = el('pagination');
  if (!pagination) return;

  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  // styling
  pagination.style.display = 'flex';
  pagination.style.alignItems = 'center';
  pagination.style.justifyContent = 'center';
  pagination.style.gap = '8px';
  pagination.style.marginTop = '10px';

  const btnStyle = `
    padding:8px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.18);
    background:transparent; color:#e7fffa; cursor:pointer; font-weight:800;
  `;
  const disabledStyle = `opacity:.5; cursor:not-allowed;`;

  const prevDisabled = window.currentPage === 1 ? 'disabled' : '';
  const nextDisabled = window.currentPage === totalPages ? 'disabled' : '';

  pagination.innerHTML = `
    <button onclick="changePage(window.currentPage - 1)" style="${btnStyle}${prevDisabled ? disabledStyle:''}" ${prevDisabled}>Previous</button>
    <span class="pagination-info" style="color:#9afbd9; font-weight:800;">${window.currentPage} / ${totalPages}</span>
    <button onclick="changePage(window.currentPage + 1)" style="${btnStyle}${nextDisabled ? disabledStyle:''}" ${nextDisabled}>Next</button>
  `;
}

function changePage(newPage) {
  if (newPage < 1) newPage = 1;
  const filtered = computeFilteredSorted();
  const totalPages = Math.max(1, Math.ceil(filtered.length / window.nftsPerPage));
  if (newPage > totalPages) newPage = totalPages;
  window.currentPage = newPage;
  renderNFTs();
}

/* ---------- Modal (details) ---------- */
function openNFTModal(assetId) {
  const nft = window.nftsData.find(n => String(n.asset_id) === String(assetId));
  if (!nft) return;

  const title = safeText(nft.template_info.template_name);
  const rows = [
    ['NFT ID', safeText(nft.nft_id)],
    ['Asset ID', safeText(nft.asset_id)],
    ['Collection', safeText(nft.template_info.collection_name)],
    ['Schema', safeText(nft.template_info.schema_name)],
    ['Stakable?', safeText(nft.is_stakable)],
    ['Staked?', safeText(nft.is_staked)],
    ['On Sale?', safeText(nft.for_sale)],
    ['Transferable?', nft.template_info.is_transferable ? 'Yes' : 'No'],
    ['Acquired at', fmtDate(nft.created_at)]
  ];

  // Media
  let media = '';
  if (nft.image_url) {
    media = `<img src="${nft.image_url}" alt="NFT" onerror="handleNFTImageError(this)" style="max-height:220px; width:auto; display:block; margin:0 auto 12px; border-radius:12px;">`;
  } else if (nft.video_url) {
    media = `<video src="${nft.video_url}" autoplay muted loop playsinline onerror="handleNFTImageError(this)" style="max-height:240px; width:100%; display:block; margin:0 auto 12px; border-radius:12px;"></video>`;
  } else {
    media = `
      <div style="
        width:100%; height:220px; display:flex; align-items:center; justify-content:center;
        border-radius:12px; border:1px dashed rgba(255,255,255,.14);
        background:linear-gradient(135deg, rgba(0,255,200,.08), rgba(255,0,255,.06)); color:#9afbd9; font-weight:800;">
        No Preview
      </div>
    `;
  }

  const body = `
    <div style="
      background:
        radial-gradient(900px 450px at 0% 100%, rgba(0,255,200,.08), transparent 45%),
        radial-gradient(900px 450px at 100% 0%, rgba(255,0,255,.08), transparent 45%),
        linear-gradient(180deg, rgba(10,10,12,.95), rgba(8,8,10,.95));
      border: 1px solid rgba(255,255,255,.12); border-radius: 14px; padding: 12px;
      box-shadow: 0 0 26px rgba(0,255,200,.12), inset 0 0 20px rgba(255,0,255,.06); color:#e7fffa;">
      ${media}
      <h2 class="modal-title" style="margin:0 0 6px; font-weight:900;">${title}</h2>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-top:8px;">
        ${rows.map(([k,v])=>`
          <div style="
            border:1px solid rgba(255,255,255,.12); border-radius:10px; padding:8px;
            background:rgba(0,0,0,.25);">
            <div style="font-size:.75rem; opacity:.8;">${k}</div>
            <div style="font-weight:800;">${safeText(v)}</div>
          </div>`).join('')}
      </div>
    </div>
  `;

  if (typeof showModal === 'function') {
    showModal({
      title: `<h3 class="modal-title">${title}</h3>`,
      body
    });
  } else {
    // Fallback (se non hai showModal): usa #modal-nft
    const modal = el('modal-nft');
    const modalContent = modal?.querySelector('#modal-content');
    if (!modal || !modalContent) return;
    modalContent.innerHTML = body;
    modal.classList.remove('hidden');
    modal.querySelector('.modal-close')?.addEventListener('click', ()=> modal.classList.add('hidden'));
  }
}

/* ---------- Events ---------- */
function setupFilterEvents() {
  // debounce per ricerca
  const debounce = (fn, ms=160) => {
    let t; return (...args)=>{ clearTimeout(t); t = setTimeout(()=>fn(...args), ms); };
  };
  const debouncedRender = debounce(()=> renderNFTs(), 120);

  el('filter-status')?.addEventListener('change', renderNFTs);
  el('filter-collection')?.addEventListener('change', renderNFTs);
  el('sort-by')?.addEventListener('change', renderNFTs);
  el('filter-stakable')?.addEventListener('change', renderNFTs);
  el('filter-for-sale')?.addEventListener('change', renderNFTs);
  el('search-template')?.addEventListener('input', debouncedRender);

  el('bulk-withdraw')?.addEventListener('click', bulkWithdrawSelected);
  el('bulk-send')?.addEventListener('click', bulkSendSelected);
}

/* ---------- Bulk actions ---------- */
async function bulkWithdrawSelected() {
  if (!window.selectedNFTs || window.selectedNFTs.size === 0) return;

  showConfirmModal(`Withdraw ${window.selectedNFTs.size} selected NFTs?`, async () => {
    const selectedIds = Array.from(window.selectedNFTs);
    const { userId, usx_token, wax_account } = window.userData;
    const endpoint = `${BASE_URL}/withdraw_nft_v2?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
    const modalBody = document.querySelector('#universal-modal .modal-body');
    if (modalBody) modalBody.innerHTML = `<p class="modal-text">Processing withdrawal of ${selectedIds.length} NFTs...</p>`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wax_account: wax_account, asset_ids: selectedIds })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[❌] Errore server:", data.error || "Unknown error");
        if (modalBody) {
          modalBody.innerHTML = `
            <p class="modal-text text-danger">❌ Error withdrawing NFTs:</p>
            <p>${data.error || 'Unknown error'}</p>
            <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
          `;
        }
        return;
      }

      // ✅ Successo
      if (modalBody) {
        modalBody.innerHTML = `
          <p class="modal-text text-success">✅ Successfully withdrawn ${selectedIds.length} NFTs</p>
          <button class="btn btn-primary mt-medium" id="close-withdraw-success">Thanks, mate!</button>
        `;
        document.getElementById('close-withdraw-success').onclick = async () => {
          closeModal();
          window.selectedNFTs.clear();
          await loadNFTs();
        };
      }

    } catch (error) {
      console.error("[❌] Errore rete:", error);
      if (modalBody) {
        modalBody.innerHTML = `
          <p class="modal-text text-danger">❌ Network or server error during NFT withdraw</p>
          <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
        `;
      }
    }
  });
}

async function bulkSendSelected() {
  if (!window.selectedNFTs || window.selectedNFTs.size === 0) return;
  const selectedIds = Array.from(window.selectedNFTs);

  const body = `
    <p>⚡ You are about to transfer these NFTs:</p>
    <p style="font-size: 0.9rem; word-break: break-all;">${selectedIds.join(", ")}</p>
    <label class="form-label mt-medium">Enter receiver's WAX account:</label>
    <input type="text" id="receiver-account" class="form-input" placeholder="e.g. receiver.wam" style="
      width:100%; padding:10px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.14);
      background:rgba(0,0,0,.35); color:#fff; box-shadow: inset 0 0 8px rgba(0,255,200,.08);">
    <div class="modal-actions mt-medium" style="display:flex; gap:10px; margin-top:10px;">
      <button class="btn btn-secondary" id="cancel-transfer">Cancel</button>
      <button class="btn btn-primary" id="confirm-receiver">Continue</button>
    </div>
  `;

  showModal({ title: `<h3 class="modal-title">Send Selected NFTs</h3>`, body });

  setTimeout(() => {
    el('cancel-transfer').onclick = () => closeModal();

    el('confirm-receiver').onclick = () => {
      const receiver = el('receiver-account').value.trim();

      if (!receiver) {
        const modalBody = document.querySelector('#universal-modal .modal-body');
        modalBody?.insertAdjacentHTML('beforeend', `<p class="text-danger mt-small">❌ You must enter a valid WAX account.</p>`);
        return;
      }

      const confirmBody = `
        <p>You are about to transfer <strong>${selectedIds.length}</strong> NFTs to <strong>${receiver}</strong>.</p>
        <div class="modal-actions mt-medium" style="display:flex; gap:10px; margin-top:10px;">
          <button class="btn btn-secondary" id="cancel-final">Cancel</button>
          <button class="btn btn-danger" id="confirm-send">Confirm & Send</button>
        </div>
      `;

      showModal({ title: `<h3 class="modal-title">Confirm Transfer</h3>`, body: confirmBody });

      setTimeout(() => {
        el('cancel-final').onclick = () => closeModal();

        el('confirm-send').onclick = async () => {
          const { userId, usx_token, wax_account } = window.userData;
          const endpoint = `${BASE_URL}/transfer_nfts?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
          const bodyData = { wax_account, asset_ids: selectedIds, receiver };

          const modalBody = document.querySelector('#universal-modal .modal-body');
          if (modalBody) modalBody.innerHTML = `<p>🔄 Sending NFTs to <strong>${receiver}</strong>...</p>`;

          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { "Accept": "application/json", "Content-Type": "application/json" },
              body: JSON.stringify(bodyData)
            });

            const data = await response.json();

            if (!response.ok || data.error) {
              console.error("[❌] Transfer error:", data.error || "Unknown error");
              if (modalBody) {
                modalBody.innerHTML = `
                  <p class="text-danger">❌ Transfer failed:</p>
                  <p>${data.error || "Unknown error"}</p>
                  <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
                `;
              }
              return;
            }
            if (modalBody) {
              modalBody.innerHTML = `
                <p class="text-success">✅ Successfully transferred ${selectedIds.length} NFTs to <strong>${receiver}</strong></p>
                <button class="btn btn-primary mt-medium" id="close-send-success">OK</button>
              `;
            }

            el('close-send-success').onclick = async () => {
              closeModal();
              window.selectedNFTs.clear();
              updateBulkActions();
              await loadNFTs();
            };

          } catch (error) {
            console.error("[❌] Network error:", error);
            if (modalBody) {
              modalBody.innerHTML = `
                <p class="text-danger">❌ Network or server error during transfer.</p>
                <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
              `;
            }
          }
        };
      }, 0);
    };
  }, 0);
}

/* ============= End NFTs UI ============= */

async function openModal(action, token, walletType = 'telegram') {
  // Title + bilanci corretti per il wallet scelto
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);
  const balances = walletType === 'twitch'
    ? (window.twitchWalletBalances || [])
    : (window.telegramWalletBalances || []);
  const tokenInfo = balances.find(t => (t.symbol || '').toLowerCase() === (token || '').toLowerCase());
  const balance = tokenInfo ? (parseFloat(tokenInfo.amount) || 0) : 0;

  // Per SWAP (ricerca contract del token IN, se serve)
  let contractIn = "";
  if (action === "swap" && Array.isArray(availableTokens)) {
    const match = availableTokens.find(t => t.split("-")[0].toLowerCase() === token.toLowerCase());
    contractIn = match ? match.split("-")[1] : "";
  }

  // --- Costruzione modale per i vari casi ---
   if (action === "swap") {
    const title = `Swap ${token}`;
    const body = `
      <h3 class="modal-title">Swap ${token}</h3>
      <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>

      <form id="action-form" class="form-wrapper">
        <!-- Percentage -->
        <div class="form-field">
          <label>Percentage</label>
          <input type="range" id="percent-range" class="input-range" min="0" max="100" value="0">
        </div>

        <!-- Amount -->
        <div class="form-field">
          <label>Amount to Swap</label>
          <input type="number" id="amount" class="input-box" required min="0.0001" step="0.0001">
        </div>

        <!-- Output Token (nuovo combobox) -->
        <div class="form-field" style="position:relative;">
          <label>Output Token</label>
          <div id="token-combobox" role="combobox" aria-haspopup="listbox" aria-owns="token-listbox" aria-expanded="false" style="
              display:flex; gap:8px; align-items:center;">
            <input
              type="text"
              id="token-search"
              class="input-box"
              placeholder="Type to search (e.g. WAX)…"
              autocomplete="off"
              aria-autocomplete="list"
              aria-controls="token-listbox"
              style="flex:1;"
            >
            <button type="button" id="token-clear" class="btn" title="Clear" style="
              border:1px solid rgba(255,255,255,.18); background:transparent; color:#e7fffa; border-radius:8px; padding:6px 10px; cursor:pointer;">
              ✖
            </button>
          </div>

          <div id="token-hint" style="font-size:.85rem; opacity:.75; margin-top:6px;">
            Start typing to search. Results update as you type.
          </div>

          <div id="token-listbox" role="listbox" tabindex="-1" style="
              margin-top:8px; max-height:260px; overflow:auto;
              border:1px solid rgba(255,255,255,.14); border-radius:10px;
              background:rgba(0,0,0,.35); display:none; ">
          </div>

          <input type="hidden" id="selected-token-symbol">
          <input type="hidden" id="selected-token-contract">
        </div>

        <!-- Preview -->
        <div id="swap-preview" class="swap-preview hidden" style="margin-top:8px;">
          <div id="loading-spinner">🔄 Getting blockchain data...</div>
          <div id="swap-data" class="hidden">
            <div>Min Received: <span id="min-received" class="highlight"></span></div>
            <div>Price Impact: <span id="price-impact" class="highlight"></span>%</div>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          <button type="button" id="preview-button" class="btn btn-warning">Preview Swap</button>
          <button type="submit" id="submit-button" class="btn btn-success" disabled>Confirm Swap</button>
        </div>
      </form>
    `;
    showModal({ title: `<h3 class="modal-title">${title}</h3>`, body });
  } else if (action === "bridge_to") {
    const targetWallet = walletType === 'twitch' ? 'telegram' : 'twitch';
    const title = `Bridge ${token} → ${targetWallet.charAt(0).toUpperCase() + targetWallet.slice(1)}`;
    const body = `
      <h3 class="modal-title">${title}</h3>
      <div class="text-muted">From: <strong>${walletType}</strong> | To: <strong>${targetWallet}</strong></div>
      <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>
      <form id="action-form" class="form-wrapper">
        <div class="form-field">
          <label>Percentage</label>
          <input type="range" id="percent-range" class="input-range" min="0" max="100" value="0">
        </div>
        <div class="form-field">
          <label>Amount to Transfer</label>
          <input id="amount" type="number" step="0.0001" class="input-box" required>
        </div>
        <button id="submit-button" type="submit" class="btn btn-glow">Bridge Now</button>
      </form>
    `;
    showModal({ title: `<h3 class="modal-title">${title}</h3>`, body });
  } else {
    const title = `${actionTitle} ${token}`;
    const body = `
      <h3 class="modal-title">${title}</h3>
      <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>
      ${action === 'transfer' ? `
        <div class="form-field">
          <label>Recipient Wax Account</label>
          <input type="text" id="receiver" class="input-box" placeholder="Enter destination wax_account" required>
        </div>` : `
        <div class="text-muted">Destination: <strong>${window.userData?.wax_account || ''}</strong></div>`}
      <form id="action-form" class="form-wrapper">
        <div class="form-field">
          <label>Percentage</label>
          <input id="percent-range" type="range" class="input-range" min="0" max="100" value="0">
        </div>
        <div class="form-field">
          <label>Amount</label>
          <input id="amount" type="number" step="0.0001" class="input-box" required>
        </div>
        <button id="submit-button" type="submit" class="btn btn-primary">Confirm ${actionTitle}</button>
      </form>
    `;
    showModal({ title: `<h3 class="modal-title">${title}</h3>`, body });
  }

  // Assicurati che il DOM del modal sia montato prima di querySelettori/bind
  // await new Promise(r => requestAnimationFrame(() => r()));

  // Elementi comuni del form + calibrazione precisione/step su base token
  const percentRange = document.getElementById('percent-range');
  const amountInput  = document.getElementById('amount');
  const submitButton = document.getElementById('submit-button');
  const form         = document.getElementById('action-form');

  if (!percentRange || !amountInput || !submitButton || !form) {
    console.warn('[wallet] modal elements not found yet');
    return;
  }

  // Calibra controls in base ai decimali del token di ORIGINE
  const calibrator = await calibrateAmountControls({
    symbol: token,
    balance: balance,
    amountInputId: 'amount',
    rangeId: 'percent-range'
  });

  // Suggerimento step visibile (facoltativo)
  amountInput.placeholder = `step ${calibrator.step}`;

  // --- SWAP logic ---
  if (action === "swap") {
    await loadAvailableTokens(); // assicura la lista dei token

    // ===== Official tokens registry (EDITA SOLO I CONTRACTS SE NECESSARIO) =====
    const OFFICIAL_TOKENS = (window.OFFICIAL_TOKENS && window.OFFICIAL_TOKENS.length)
      ? window.OFFICIAL_TOKENS
      : [
          { symbol: 'WAX',   contract: 'eosio.token' },
          { symbol: 'CHIPS', contract: 'xcryptochips' }, // ⬅️ TODO
          { symbol: 'LUX',   contract: 'xcryptochips' }    // ⬅️ TODO
        ];
    const OFFICIAL_SYMBOLS = new Set(OFFICIAL_TOKENS.map(t => t.symbol));

    const isOfficial = (t) =>
      OFFICIAL_TOKENS.some(o => o.symbol === t.symbol && o.contract === t.contract);

    // ==========================================================================

    // Refs
    const tokenSearch            = document.getElementById('token-search');
    const tokenListbox           = document.getElementById('token-listbox');
    const tokenHint              = document.getElementById('token-hint');
    const tokenClear             = document.getElementById('token-clear');
    const selectedTokenSymbolEl  = document.getElementById('selected-token-symbol');
    const selectedTokenContractEl= document.getElementById('selected-token-contract');
    const previewButton          = document.getElementById('preview-button');
    const swapPreview            = document.getElementById('swap-preview');
    const loadingSpinner         = document.getElementById('loading-spinner');
    const swapDataContainer      = document.getElementById('swap-data');
    const minReceivedSpan        = document.getElementById('min-received');
    const priceImpactSpan        = document.getElementById('price-impact');
    const submitButton           = document.getElementById('submit-button');

    // Dati
    const allTokens = (window.availableTokensDetailed && window.availableTokensDetailed.length)
      ? window.availableTokensDetailed
      : (Array.isArray(window.availableTokens) ? window.availableTokens.map(s=>{
          const [symbol, contract] = s.split('-'); return { symbol, contract, name: symbol };
        }) : []);

    // Helper
    const n = (s) => (s || '').toString().toLowerCase();

    // Ranking: official >>> match esatto >>> inizia con >>> include >>> contract hit
    const scoreToken = (t, q) => {
      const officialBoost = isOfficial(t) ? 2000 : 0;
      if (!q) return officialBoost; // senza query, mostra prima gli official
      let s = officialBoost;
      if (n(t.symbol) === q) s += 1000;
      else if (n(t.symbol).startsWith(q)) s += 750;
      else if (n(t.name || '').startsWith(q)) s += 500;
      else if (n(t.symbol).includes(q)) s += 300;
      if ((t.contract || '').toLowerCase().includes(q)) s += 100;
      return s;
    };

    const MAX_RENDER = 80;
    let activeIndex = -1;
    let currentItems = [];

    const renderList = (items, totalCount, q) => {
      currentItems = items;
      tokenListbox.innerHTML = items.map((t, i) => {
        const officialBadge = isOfficial(t)
          ? `<span style="margin-left:8px; padding:2px 6px; border-radius:999px; font-size:.75rem; font-weight:800; color:#00150f;
               background:linear-gradient(135deg, rgba(0,255,200,.9), rgba(0,160,255,.9)); box-shadow:0 0 8px rgba(0,255,200,.35);">OFFICIAL</span>`
          : '';

        return `
          <div class="token-option" role="option" aria-selected="false"
               data-symbol="${t.symbol}" data-contract="${t.contract}"
               style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px;
                      border-bottom:1px solid rgba(255,255,255,.08); cursor:pointer;">
            <div>
              <div style="font-weight:900; color:#e7fffa;">
                ${t.symbol} <small style="opacity:.8">— ${t.contract}</small> ${officialBadge}
              </div>
              ${t.name ? `<div style="font-size:.85rem; opacity:.8;">${t.name}</div>` : ''}
            </div>
            <div style="font-size:.75rem; opacity:.65;"></div>
          </div>
        `;
      }).join('');

      if (totalCount > items.length) {
        tokenListbox.insertAdjacentHTML('beforeend', `
          <div style="padding:8px 12px; font-size:.85rem; opacity:.75;">Showing ${items.length} of ${totalCount} results. Keep typing to narrow down.</div>
        `);
      }

      tokenListbox.style.display = items.length ? 'block' : 'none';
      const combo = document.getElementById('token-combobox');
      if (combo) combo.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    };

    const filterAndRender = (qRaw) => {
      const q = n(qRaw).trim();
      const scored = allTokens.map(t => ({ ...t, __score: scoreToken(t, q) }));
      const filtered = scored
        .filter(t => t.__score > 0 || !q)
        .sort((a, b) => b.__score - a.__score || a.symbol.localeCompare(b.symbol));

      // Se la query contiene un simbolo ufficiale (wax/chips/lux), pinna quel token ufficiale in cima
      const targetSym = Array.from(OFFICIAL_SYMBOLS).find(sym => q.includes(sym.toLowerCase()));
      if (targetSym) {
        const idx = filtered.findIndex(t => t.symbol === targetSym && isOfficial(t));
        if (idx > 0) {
          const [pinned] = filtered.splice(idx, 1);
          filtered.unshift(pinned);
        }
      }

      const slice = filtered.slice(0, Math.max(10, Math.min(MAX_RENDER, filtered.length)));
      activeIndex = -1;
      renderList(slice, filtered.length, qRaw);
      tokenHint.textContent = slice.length ? '' : 'No results. Try another query.';
    };

    // Debounce semplice
    let tId;
    const debounce = (fn, ms=180) => (...args) => { clearTimeout(tId); tId = setTimeout(()=>fn(...args), ms); };

    // Select handler
    const selectToken = (symbol, contract) => {
      selectedTokenSymbolEl.value = symbol;
      selectedTokenContractEl.value = contract;
      tokenSearch.value = `${symbol} — ${contract}`;
      tokenListbox.style.display = 'none';
      const combo = document.getElementById('token-combobox');
      if (combo) combo.setAttribute('aria-expanded', 'false');

      const amt = parseFloat(amountInput.value) || 0;
      submitButton.disabled = !(symbol && contract && amt > 0);
      previewButton.disabled = !(symbol && contract && amt > 0);
    };

    // Input typing (live filter)
    tokenSearch.addEventListener('input', debounce((e) => {
      filterAndRender(e.target.value);
    }, 120));

    // Clic su item
    tokenListbox.addEventListener('click', (ev) => {
      const item = ev.target.closest('.token-option');
      if (!item) return;
      selectToken(item.getAttribute('data-symbol'), item.getAttribute('data-contract'));
    });

    // Tastiera: frecce + Enter
    tokenSearch.addEventListener('keydown', (ev) => {
      const items = Array.from(tokenListbox.querySelectorAll('.token-option'));
      if (!items.length) return;

      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIndex = Math.min(items.length - 1, activeIndex + 1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        if (activeIndex >= 0 && items[activeIndex]) {
          const el = items[activeIndex];
          selectToken(el.getAttribute('data-symbol'), el.getAttribute('data-contract'));
        }
        return;
      } else {
        return;
      }

      items.forEach((it, i) => {
        const sel = i === activeIndex;
        it.setAttribute('aria-selected', sel ? 'true' : 'false');
        it.style.background = sel ? 'rgba(0,255,200,.10)' : 'transparent';
      });
      if (items[activeIndex]) items[activeIndex].scrollIntoView({ block:'nearest' });
    });

    // Clear
    tokenClear.addEventListener('click', () => {
      tokenSearch.value = '';
      selectedTokenSymbolEl.value = '';
      selectedTokenContractEl.value = '';
      tokenListbox.style.display = 'none';
      const combo = document.getElementById('token-combobox');
      if (combo) combo.setAttribute('aria-expanded', 'false');
      tokenHint.textContent = 'Start typing to search. Results update as you type.';
      submitButton.disabled = true;
      previewButton.disabled = true;
      tokenSearch.focus();
    });

    // Primo render: query vuota (gli OFFICIAL risulteranno in top per via del boost)
    filterAndRender('');
    tokenSearch.select();

    // Preview click (immutato, ma validazione severa)
    previewButton.addEventListener('click', async () => {
      const amount = parseFloat(amountInput.value) || 0;
      const symbolOut   = selectedTokenSymbolEl.value;
      const contractOut = selectedTokenContractEl.value;

      if (!amount || amount <= 0 || !symbolOut || !contractOut) {
        alert("Insert valid amount and output token");
        return;
      }

      const previewUrl = `${BASE_URL}/preview_swap?user_id=${encodeURIComponent(window.userData.userId)}&usx_token=${encodeURIComponent(window.userData.usx_token)}`;
      const bodyData = {
        wax_account: window.userData.wax_account,
        from_token: token,
        to_token: symbolOut,
        amount: amount,
        wallet_type: walletType
      };

      swapPreview.classList.remove('hidden');
      loadingSpinner.classList.remove('hidden');
      swapDataContainer.classList.add('hidden');
      submitButton.disabled = true;

      try {
        const response = await fetch(previewUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyData)
        });
        const data = await response.json();

        const minReceived = ((data.minReceived || 0) * 0.9);
        if (minReceivedSpan) minReceivedSpan.textContent = minReceived.toFixed(9);
        if (priceImpactSpan) priceImpactSpan.textContent = data.priceImpact ?? "-";

        loadingSpinner.classList.add('hidden');
        swapDataContainer.classList.remove('hidden');
        submitButton.disabled = !(symbolOut && contractOut && amount > 0);
      } catch (err) {
        console.error("Swap preview error:", err);
        loadingSpinner.innerHTML = `<div class="text-error">⚠️ Failed to load preview data.</div>`;
        submitButton.disabled = true;
      }
    });

    // Abilita/disabilita submit dinamicamente quando cambia l'importo
    amountInput.addEventListener('input', () => {
      const amount = parseFloat(amountInput.value) || 0;
      submitButton.disabled = !(amount > 0 && selectedTokenSymbolEl.value && selectedTokenContractEl.value);
      previewButton.disabled = !(amount > 0 && selectedTokenSymbolEl.value && selectedTokenContractEl.value);
    });
  }

  // Submit del form (azioni)
  form.onsubmit = async (e) => {
    e.preventDefault();
    const amount = amountInput.value;

    // disabilita subito TUTTE le azioni per evitare doppi submit
    setButtonsEnabled(false);
    submitButton.disabled = true;
    const previewBtn = document.getElementById('preview-button');
    if (previewBtn) previewBtn.disabled = true;

    try {
      if (action === "swap") {
        const symbolOutEl   = document.getElementById('selected-token-symbol');
        const contractOutEl = document.getElementById('selected-token-contract');
        const symbolOut     = symbolOutEl ? symbolOutEl.value : null;
        const contractOut   = contractOutEl ? contractOutEl.value : null;
        await executeAction(action, token, amount, symbolOut, contractOut, walletType);
      } else {
        await executeAction(action, token, amount, null, null, walletType);
      }

      showModalMessage(`✅ ${actionTitle} completed successfully. Refresh in 5 seconds…`, 'success');
      setTimeout(async () => {
        closeModal();
        // forza il fetch dal backend e ricarica la tab attuale (se l’utente l’ha cambiata nel mentre)
        await loadWallet(window.currentWalletTab || walletType, true);
      }, 5000);
    } catch (error) {
      console.error(error);
      showModalMessage(`❌ Error during ${actionTitle}`, 'error');

      // riabilita i pulsanti solo in caso di errore
      setButtonsEnabled(true);
      submitButton.disabled = false;
      if (previewBtn) previewBtn.disabled = false;
    }
  };
}
    
function showConfirmModal(message, onConfirm) {
  const body = `
    <p class="modal-text">${message}</p>
    <div class="modal-actions" style="margin-top: 1rem;">
      <button class="btn btn-secondary" id="confirm-cancel">Cancel</button>
      <button class="btn btn-danger" id="confirm-yes">Confirm</button>
    </div>
  `;

  showModal({
    title: `<h3 class="modal-title text-danger">Confirm Action</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('confirm-cancel').onclick = () => {
      closeModal();
    };

    document.getElementById('confirm-yes').onclick = () => {
      closeModal();
      onConfirm?.(); // Esegui solo se definito
    };
  }, 0);
}

function setButtonsEnabled(enabled) {
  // Tutti i pulsanti d’azione che vogliamo (de)abilitare globalmente
  const selectors = [
    '.token-act',       // card grid actions
    '.btn-action',      // table actions
    '#submit-button',   // submit modale generico
    '#preview-button',  // preview swap
    '#stake-submit',    // stake modale
    '#bulk-withdraw',   // bulk actions
    '#bulk-send'
  ];

  const buttons = document.querySelectorAll(selectors.join(','));
  buttons.forEach(btn => {
    if (!btn) return;
    btn.disabled = !enabled;
    btn.setAttribute('aria-disabled', String(!enabled));
    btn.style.pointerEvents = enabled ? '' : 'none';
    btn.style.opacity = enabled ? '' : '0.65';
  });
}

async function executeAction(action, token, amount, tokenOut = null, contractOut = null, walletType = "telegram") {
  if (!window.userData || !window.userData.userId || !window.userData.wax_account) {
    console.error("[❌] userId o wax_account non trovato in window.userData. Assicurati che i dati siano caricati prima di eseguire l'azione.");
    setButtonsEnabled(true);
    return;
  }

  // Invalida cache locale per evitare riusi di dati obsoleti
  window.twitchWalletBalances = undefined;
  window.telegramWalletBalances = undefined;

  // Disabilita subito tutte le azioni (verrà riabilitato SOLO in errore)
  setButtonsEnabled(false);

  let interimFeedbackDiv = null;
  if (action === "withdraw" || action === "swap") {
    interimFeedbackDiv = document.createElement('div');
    interimFeedbackDiv.id = 'interim-feedback';
    interimFeedbackDiv.style = `
      margin-top: 1rem;
      padding: 1rem;
      border-left: 4px solid #ffaa00;
      background: rgba(255, 170, 0, 0.1);
      color: #aa7700;
      font-family: 'Courier New', monospace;
      font-size: 0.92rem;
      border-radius: 6px;
    `;
    interimFeedbackDiv.textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} in progress, please wait...`;
    document.querySelector('#action-form').appendChild(interimFeedbackDiv);
  }

  const { userId, usx_token, wax_account } = window.userData;
  let endpoint = "";
  if (action === "withdraw") {
    endpoint = `${BASE_URL}/withdraw`;
  } else if (action === "swap") {
    endpoint = `${BASE_URL}/swap_tokens`;
  } else if (action === "transfer") {
    endpoint = `${BASE_URL}/transfer`;
  } else if (action === "stake") {
    endpoint = `${BASE_URL}/stake_add`;
  } else if (action === "bridge_to") {
    endpoint = `${BASE_URL}/bridge_token`;
  }
  const fullUrl = `${endpoint}?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;

  try {
    let bodyData = {
      wax_account: wax_account,
      token_symbol: token,
      amount: amount,
      wallet_type: walletType
    };

    if (action === "swap") {
      bodyData = {
        wax_account: wax_account,
        from_token: token,
        to_token: tokenOut,
        amount: amount,
        wallet_type: walletType
      };
    } else if (action === "transfer") {
      const receiverInput = document.getElementById('receiver');
      const receiver = receiverInput ? receiverInput.value.trim() : "";
      if (!receiver) throw new Error("Recipient Wax Account is required for transfer.");
      bodyData.receiver = receiver;
    } else if (action === "stake") {
      if (!window.tokenPoolsData || window.tokenPoolsData.length === 0) {
        console.info("[🧰] Caricamento dati delle staking pools...");
        await fetchAndRenderTokenPools(false);
        if (!window.tokenPoolsData || window.tokenPoolsData.length === 0) throw new Error("No staking pools data available after loading.");
      }
      const poolData = window.tokenPoolsData.find(pool => pool.deposit_token.symbol.toLowerCase() === token.toLowerCase());
      if (!poolData) throw new Error(`No staking pool found for token ${token}`);
      bodyData.pool_id = poolData.pool_id;
      console.info(`[📤] Pool ID per ${token}: ${poolData.pool_id}`);
    } else if (action === "bridge_to") {
      bodyData = {
        wax_account: wax_account,
        token_symbol: token,
        amount: amount,
        from_wallet: walletType,
        to_wallet: walletType === "twitch" ? "telegram" : "twitch"
      };
    }

    const body = JSON.stringify(bodyData);
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body
    });

    const data = await response.json();
    console.info("[🔵] Risposta server:", data);

    if (interimFeedbackDiv) interimFeedbackDiv.remove();

    if (!response.ok) {
      console.error(`[❌] Errore HTTP ${response.status}:`, data.error || "Unknown error");
      throw new Error(data.error || `HTTP error ${response.status}`);
    }
    if (data.error) {
      console.error(`[❌] API error:`, data.error);
      throw new Error(data.error);
    }

    let feedbackText = "";

    if (action === "withdraw") {
      feedbackText = `
        <div style="
          margin-top: 1rem;
          padding: 1rem;
          border-left: 4px solid #ffaa00;
          background: rgba(255, 170, 0, 0.1);
          color: #aa7700;
          font-family: 'Courier New', monospace;
          font-size: 0.92rem;
          border-radius: 6px;
          box-shadow: 0 0 12px #ffaa0088;
          animation: fadeIn 0.4s ease-in-out;
        ">
          <strong>Withdraw Completed Successfully</strong><br>
          ${data.message}<br>
          ${data.fee ? `Fee applied: ${data.fee} ${token}` : ''}
        </div>
      `;
    } else if (action === "swap" && data.details) {
      const details = data.details;
      feedbackText = `
        <div style="
          margin-top: 1rem;
          padding: 1rem;
          border-left: 4px solid #00ffcc;
          background: rgba(0, 255, 204, 0.05);
          color: #00ffcc;
          font-family: 'Courier New', monospace;
          font-size: 0.92rem;
          border-radius: 6px;
          box-shadow: 0 0 12px #00ffcc88;
          animation: fadeIn 0.4s ease-in-out;
        ">
          <strong>Swap Completed</strong><br>
          ${details.amount} ${details.from_token} ➡️ ${details.received_amount.toFixed(9)} ${details.to_token}<br>
          <em>Price:</em> ${details.execution_price}<br>
          <em>Fee:</em> ${details.commission.toFixed(9)}
        </div>
      `;
    } else if (action === "bridge_to" && data.net_amount && data.fee_applied !== undefined) {
      feedbackText = `
        <div style="
          margin-top: 1rem;
          padding: 1rem;
          border-left: 4px solid #ff33cc;
          background: rgba(255, 51, 204, 0.07);
          color: #ff33cc;
          font-family: 'Courier New', monospace;
          font-size: 0.92rem;
          border-radius: 6px;
          box-shadow: 0 0 12px #ff33cc88;
          animation: fadeIn 0.4s ease-in-out;
        ">
          <strong>Bridge Successful 🔁</strong><br>
          From: <span style="color:#ff8800; font-weight:bold">${data.from_wallet.toUpperCase()}</span> →
          To: <span style="color:#00bfff; font-weight:bold">${data.to_wallet.toUpperCase()}</span><br><br>
          <em>Token:</em> <strong>${token}</strong><br>
          <em>Amount Sent:</em> ${amount}<br>
          <em>Fee (2%):</em> ${data.fee_applied.toFixed(9)}<br>
          <em>Received:</em> ${data.net_amount.toFixed(9)}
        </div>
      `;
    } else if (data.message) {
      feedbackText = `
        <div style="
          margin-top: 1rem;
          padding: 1rem;
          border-left: 4px solid #aa66ff;
          background: rgba(170, 102, 255, 0.07);
          color: #aa66ff;
          font-family: 'Courier New', monospace;
          font-size: 0.92rem;
          border-radius: 6px;
          box-shadow: 0 0 12px #aa66ff88;
          animation: fadeIn 0.4s ease-in-out;
        ">
          <strong>${action.charAt(0).toUpperCase() + action.slice(1)}:</strong> ${data.message}
        </div>
      `;
    } else {
      feedbackText = `
        <div style="
          margin-top: 1rem;
          padding: 1rem;
          border-left: 4px solid #33ff77;
          background: rgba(51, 255, 119, 0.07);
          color: #33ff77;
          font-family: 'Courier New', monospace;
          font-size: 0.92rem;
          border-radius: 6px;
          box-shadow: 0 0 12px #33ff7788;
          animation: fadeIn 0.4s ease-in-out;
        ">
          <strong>${action} completed successfully.</strong>
        </div>
      `;
    }

    const feedbackDiv = document.createElement('div');
    feedbackDiv.innerHTML = feedbackText;
    document.querySelector('#action-form').appendChild(feedbackDiv);

  } catch (networkError) {
    console.error("[❌] Errore di rete:", networkError);
    if (interimFeedbackDiv) interimFeedbackDiv.remove();
    const errorDiv = document.createElement('div');
    errorDiv.style = `
      margin-top: 1rem;
      padding: 1rem;
      border-left: 4px solid #ff4444;
      background: rgba(255, 68, 68, 0.1);
      color: #ff4444;
      font-family: 'Courier New', monospace;
      font-size: 0.92rem;
      border-radius: 6px;
    `;
    errorDiv.textContent = `Errore di rete: ${networkError.message || networkError}`;
    document.querySelector('#action-form').appendChild(errorDiv);

    // Riabilita i pulsanti SOLO in caso di errore
    setButtonsEnabled(true);
  } finally {
    // Non riabilitiamo qui: in caso di successo restano disabilitati fino al reload
  }
}

/* ─────────────────────────────
   1. TOAST DINAMICO
   ───────────────────────────── */
function showToast(message, type = "success") {
  const wrap = document.getElementById('toast-container');
  if (!wrap) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;   // <─ classi semantiche
  toast.textContent = message;

  wrap.appendChild(toast);
  setTimeout(() => toast.remove(), 10_000);  // 10 s di visibilità
}

/* ─────────────────────────────
   2. SELECTOR TEMA DINAMICO
   ───────────────────────────── */
function injectThemeSelector() {
  const selector = document.createElement('select');
  selector.id = 'theme-selector';

  // CSS inline con animazioni LED/Neon
  selector.style.cssText = `
    display: block;
    width: 180px;
    margin-top: 0.5rem;
    margin-right: 0.5rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(145deg, #1a1a1a, #333);
    color: #ffd700;
    border: 2px solid #ffae42;
    border-radius: 6px;
    font-weight: bold;
    font-family: 'Orbitron', sans-serif;
    box-shadow: 0 0 10px #ffae42;
    transition: all 0.3s ease;
    z-index: 999;
  `;

  selector.addEventListener('mouseover', () => {
    selector.style.boxShadow = '0 0 20px #ffd700, 0 0 40px #ffcc00';
    selector.style.transform = 'scale(1.05)';
  });

  selector.addEventListener('mouseout', () => {
    selector.style.boxShadow = '0 0 10px #ffae42';
    selector.style.transform = 'scale(1)';
  });

  const themes = [
    { name: 'Cybertribal', file: 'styles6_cybertriba_glow.css' },
  ];

  // Opzione predefinita "Choose your way"
  selector.innerHTML = `
    <option disabled selected value="">Choose your way</option>
    ${themes.map(t => `<option value="${t.file}">${t.name}</option>`).join('')}
  `;

  // Inserisci sotto al bottone Login/Logout
  const container = document.getElementById('auth-button-container');
  if (container) {
    container.appendChild(selector);
  } else {
    document.body.appendChild(selector); // fallback
  }

  // Gestione cambio tema
  function swapCSS(href) {
    let link = document.getElementById('theme-style');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.id = 'theme-style';
      document.head.appendChild(link);
    }
    link.href = href;
    localStorage.setItem('selected-css', href);
  }

  // Applica tema salvato, se presente
  const saved = localStorage.getItem('selected-css');
  if (saved) {
    selector.value = saved;
    swapCSS(saved);
  }

  // Cambio dinamico del tema
  selector.addEventListener('change', e => {
    if (e.target.value) {
      swapCSS(e.target.value);
    }
  });
}
document.addEventListener('DOMContentLoaded', injectThemeSelector);

// ✅ Collegamento universale ai pulsanti con attributo data-section
document.querySelectorAll('[data-section]').forEach(btn => {
  btn.addEventListener('click', e => {
    const section = btn.getAttribute('data-section');
    if (section) {
      loadSection(section);
    }
  });
});

function ensureUniversalModalExists() {
  if (document.getElementById('universal-modal')) return;

  const modal = document.createElement('div');
  modal.id = 'universal-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-content">
      <button class="modal-close">×</button>
      <div class="modal-header"></div>
      <div class="modal-message"></div>
      <div class="modal-body"></div>
      <div class="modal-footer"></div>
    </div>
  `;
  document.body.appendChild(modal);

  // Bind close once
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
}

function showModal({ title = '', body = '', footer = '' }) {
  ensureUniversalModalExists()
  const modal = document.getElementById('universal-modal');

  modal.querySelector('.modal-header').innerHTML = title;
  modal.querySelector('.modal-body').innerHTML = body;
  modal.querySelector('.modal-footer').innerHTML = footer;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  // 💡 Aspetta che il browser calcoli dimensioni visibili
  setTimeout(() => {
    const scrollY = window.scrollY || window.pageYOffset;
    const viewportHeight = window.innerHeight;
    const modalHeight = modal.offsetHeight || 300;

    const top = scrollY + (viewportHeight - modalHeight) / 2;
    modal.style.top = `${Math.max(top, 40)}px`;
  }, 0);
}
