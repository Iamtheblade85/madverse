// Globals
window.userData = {};
window.selectedNFTs = new Set();
window.currentPage = 1;
window.nftsPerPage = 24;
window.activePerks = []; 
window.activeChests = [];
window.selectedGoblins = new Set();
window.userGoblins = []; 
window.expeditionTimersRunning = window.expeditionTimersRunning || {};

if (!window.recentExpeditionKeys) {
  window.recentExpeditionKeys = new Set();
  setInterval(() => window.recentExpeditionKeys.clear(), 120000); 
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
    const response = await fetch('https://alcor.exchange/api/v2/tokens');
    const tokens = await response.json();
    availableTokens = tokens.map(t => `${t.symbol}-${t.contract}`);
  } catch (error) {
    console.error("[❌] Errore caricando tokens:", error);
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

// Aggiorna lo stato globale e localStorage se "remember me" è selezionato
function saveUserData(data, remember = false) {
  window.userData = {
    email: data.email,
    password: data.password,
    userId: data.user_id,
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

  // Caricamento iniziale sezione principale
  loadSection('loadLatestNews');

  // Collega pulsanti menu
  document.querySelectorAll('.menu-btn').forEach(btn => {
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

    <label style="margin-top: 1rem;">
      <input type="checkbox" id="remember-me"> Remember Me
    </label>

    <button class="btn btn-primary" id="submit-login" style="margin-top: 1rem;">Login</button>

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
        throw new Error("Credenziali non valide");
      }

      saveUserData({ ...data, email, password }, remember);
      location.reload();

    } catch (err) {
      alert("Errore nel login: " + err.message);
    }
  };
  document.getElementById('register-button').onclick = () => openRegisterModal();

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
      You must provide at least one contact method (Telegram or Twitch).
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
    const telegram = document.getElementById('reg-telegram').value.trim();
    const twitch = document.getElementById('reg-twitch').value.trim();
    const feedback = document.getElementById('register-feedback');

    if (!email || !password || !confirm || !wax_account || !telegram ) {
      feedback.textContent = "Please fill in all required fields.";
      return;
    }
    if (password !== confirm) {
      feedback.textContent = "Passwords do not match. Please check both fields";
      return;
    }
    //if (!telegram && !twitch) {
      //feedback.textContent = "You must provide at least Telegram account. Twitch is optional.";
      //return;
    //}

    try {
      const res = await fetch(`${BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, telegram, twitch, wax_account })
      });

      const data = await res.json();
      if (res.status === 400 && data.error === "Telegram ID not found") {
        feedback.innerHTML = `
          <div style="border: 1px solid #ff4d4d; border-radius: 8px; padding: 1rem; background:#1f1f1f; color:#ffdcdc;">
            <strong>🚫 You’re almost there!</strong><br><br>
            <span style="color:#ffb3b3;">To finish linking your wallet you need to register once in our Telegram bot.</span><br><br>
            <ol style="padding-left:1.2rem; font-size:0.9rem;">
              <li>Open <strong>Telegram</strong> and search <a href="https://t.me/xchaos18_bot" target="_blank" style="color:#7ec8ff;">@xchaos18_bot</a></li>
              <li>Send the command:<br>
                  <code style="background:#2b2b2b; padding:4px 6px; border-radius:4px;">/join ${wax_account || "&lt;your_wallet&gt;"}</code>
              </li>
              <li>Wait for the bot’s confirmation.</li>
              <li>Return here and press <em>Submit</em> again.</li>
            </ol>
            <small style="color:gray;">(This is required only the first time – afterwards you can ignore the bot.)</small>
          </div>
        `;
        return;           // interrompe il flusso: non disabilita i campi né avvia l’auto-login
      } else {
        feedback.textContent = data.message || "Registration complete.";
      }
      document.getElementById('submit-register').disabled = true;

      // Blocca i campi
      ['reg-email', 'reg-password', 'reg-password-confirm', 'reg-wax_account', 'reg-telegram', 'reg-twitch']
        .forEach(id => document.getElementById(id).setAttribute('disabled', true));

      // Attendi 3 secondi → login automatico → reload
      setTimeout(async () => {
        const loginRes = await fetch(`${BASE_URL}/login_mail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const loginData = await loginRes.json();
        if (!loginData.user_id || !loginData.usx_token || !loginData.wax_account) {
          alert("Login failed after registration.");
          location.reload();
          return;
        }

        saveUserData({ ...loginData, email, password }, true);
        finalizeAppLoad();

        // Chiudi modale
        modal.classList.add('hidden');
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');

      }, 3000);

    } catch (err) {
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

window.addEventListener("load", initApp);

async function loadCreateTokenStaking() {
  const container = document.getElementById('create-token-pool-container');
  container.innerHTML = `
    <input 
      type="text" 
      id="search-token-pool" 
      placeholder="Search your token..." 
      class="input-token-search"
    >

    <button 
      id="create-new-token-pool-btn" 
      class="btn btn-primary create-token-pool-btn"
    >
      ➕ Create New Token Pool
    </button>

    <div id="created-token-pools" class="token-pool-list"></div>
    <div id="token-pool-details"></div>
  `;

  document.getElementById('create-new-token-pool-btn').addEventListener('click', () => {
    renderNewTokenPoolForm();
  });

  await fetchAndRenderTokenPools();
}

window.loadCreateTokenStaking = loadCreateTokenStaking;
async function fetchAndRenderTokenPools(shouldRender = true) {
  const { userId } = window.userData;
  const container = document.getElementById('token-pool-details');

  try {
    const res = await fetch(`${BASE_URL}/get_staking_pools?user_id=${userId}`);
    const data = await res.json();
    if (!container) {
      window.tokenPoolsData = data.pools;
      return;
    }

    if (shouldRender) {
      if (!res.ok || !data.pools) {
        container.innerHTML = `<div class="empty-message">No token staking pools found.</div>`;
        return;
      }

      window.tokenPoolsData = data.pools;
      renderCreatedTokenPoolButtons(data.pools);
      renderTokenPoolDetails(data.pools[0]);
    }
  } catch (err) {
    if (container && shouldRender) {
      container.innerHTML = `<div class="error-message">Error loading token pools.</div>`;
    }
    console.error("[❌] Error loading pools:", err);
  }
}

function renderNewTokenPoolForm() {
  const container = document.getElementById('token-pool-details');
  container.innerHTML = `
    <div class="form-card" id="create-pool-form">
      <div id="step-1" class="form-step active-step">
        <h3 class="form-title">Step 1: Deposit Token</h3>
        <label class="form-label">Deposit Token Symbol</label>
        <input id="new-token-symbol" type="text" class="form-input" placeholder="e.g. CHIPS">
        <button class="btn btn-primary" id="go-to-step-2">Next ➡️</button>
      </div>
  
      <div id="step-2" class="form-step" style="display: none;">
        <h3 class="form-title">Step 2: Reward Tokens</h3>
        <div id="reward-token-entries" class="reward-token-grid"></div>
  
        <button class="btn btn-secondary add-reward-btn" id="add-reward-token">➕ Add Reward Token</button>
        <div class="step-buttons">
          <button class="btn btn-secondary" id="back-to-step-1">⬅️ Back</button>
          <button class="btn btn-primary submit-pool-btn" id="submit-new-token-pool">✅ Create Pool</button>
        </div>
      </div>
    </div>
  `;
  // Step navigation
  document.getElementById('go-to-step-2').addEventListener('click', () => {
    document.getElementById('step-1').style.display = 'none';
    document.getElementById('step-2').style.display = 'block';
  });
  
  document.getElementById('back-to-step-1').addEventListener('click', () => {
    document.getElementById('step-2').style.display = 'none';
    document.getElementById('step-1').style.display = 'block';
  });

  let rewardIndex = 0;
  function addRewardTokenEntry() {
    const wrapper = document.getElementById('reward-token-entries');
    const html = `
      <div class="reward-token-entry">
        <label class="form-label">Reward Token Symbol</label>
        <input type="text" class="form-input reward-symbol" placeholder="e.g. WAX">

        <label class="form-label">Total Reward Amount</label>
        <input type="number" class="form-input reward-total" placeholder="e.g. 1000">

        <label class="form-label">Daily Reward</label>
        <input type="number" class="form-input reward-daily" placeholder="e.g. 10">
      </div>`;
    wrapper.insertAdjacentHTML('beforeend', html);
    rewardIndex++;
  }

  document.getElementById('add-reward-token').addEventListener('click', addRewardTokenEntry);
  addRewardTokenEntry();

  document.getElementById('submit-new-token-pool').addEventListener('click', async () => {
    const symbol = document.getElementById('new-token-symbol').value.trim().toUpperCase();
    const { userId, usx_token, wax_account } = window.userData;

    const rewardTokens = Array.from(document.querySelectorAll('.reward-token-entry')).map(entry => {
      return {
        token_symbol: entry.querySelector('.reward-symbol').value.trim().toUpperCase(),
        total_reward: parseFloat(entry.querySelector('.reward-total').value),
        daily_reward: parseFloat(entry.querySelector('.reward-daily').value)
      };
    });

    if (!symbol || rewardTokens.some(r => !r.token_symbol || isNaN(r.total_reward) || isNaN(r.daily_reward))) {
      showToast("Please fill all fields with valid values.", "error");
      return;
    }

    try {
      const createRes = await fetch(`${BASE_URL}/create_staking_pool?user_id=${userId}&usx_token=${usx_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_token_symbol: symbol })
      });

      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to create pool");

      const poolId = createData.pool_id;

      for (let reward of rewardTokens) {
        const rewardRes = await fetch(`${BASE_URL}/add_pool_reward`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pool_id: poolId,
            token_symbol: reward.token_symbol,
            total_reward: reward.total_reward,
            daily_reward: reward.daily_reward,
            wax_account: wax_account
          })
        });

        const rewardData = await rewardRes.json();
        if (!rewardRes.ok) throw new Error(rewardData.error || "Failed to add reward token");
      }

      showToast("Token pool created with rewards!", "success");
      await fetchAndRenderTokenPools();

    } catch (err) {
      console.error("[❌] Error creating token pool:", err);
      showToast(err.message, "error");
    }
  });
}

function renderCreatedTokenPoolButtons(pools) {
  const container = document.getElementById('created-token-pools');
  const searchInput = document.getElementById('search-token-pool');

  function renderButtons(list) {
    container.innerHTML = '';
    list.forEach(pool => {
      const btn = document.createElement('button');
      btn.className = 'token-pool-btn';
      btn.textContent = pool.deposit_token?.symbol || 'Unknown';
      btn.onclick = () => renderTokenPoolDetails(pool);
      container.appendChild(btn);
    });
  }

  renderButtons(pools);

  searchInput.addEventListener('input', () => {
    const search = searchInput.value.toLowerCase();
    const filtered = pools.filter(p => p.deposit_token?.symbol?.toLowerCase().includes(search));
    renderButtons(filtered);
  });
}


function renderTokenPoolDetails(pool) {
  const container = document.getElementById('token-pool-details');
  const rewardsHTML = pool.rewards.map(reward => {
    const daysLeft = reward.daily_reward > 0
      ? Math.floor(reward.total_reward_deposit / reward.daily_reward)
      : '∞';

    return `
      <div class="reward-item">
        <p class="reward-text"><strong>🎯 Token:</strong> ${reward.token_symbol}</p>
        <p class="reward-text">💰 Total Deposited: <strong>${reward.total_reward_deposit}</strong></p>
        <p class="reward-text">📅 Daily Reward: <strong>${reward.daily_reward}</strong></p>
        <p class="reward-text">⏳ Days Remaining: <strong>${daysLeft}</strong></p>
        <button 
          class="btn btn-warning reward-edit-btn" 
          onclick="openEditDailyReward(${pool.pool_id}, '${reward.token_symbol}', ${reward.daily_reward}, '${pool.deposit_token.symbol}')">
          ✏️ Edit Daily Reward
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="token-pool-card">
      <h3 class="token-pool-title">${pool.deposit_token?.symbol || 'Unknown'} Pool</h3>
      <p class="pool-detail"><strong>Status:</strong> ${pool.status}</p>
      <p class="pool-detail"><strong>Created:</strong> ${pool.created_at}</p>
      ${rewardsHTML || '<p class="no-rewards-message">No rewards configured.</p>'}
      <button 
        class="btn btn-warning pool-status-btn" 
        onclick="openPoolStatusModal(${pool.pool_id}, '${pool.status || 'open'}')">
        🔄 Change Pool Status
      </button>
    </div>
  `;
}

function openEditDailyReward(poolId, tokenSymbol, currentReward, depositTokenSymbol) {
  const body = `
    <label class="form-label">New Daily Reward</label>
    <input 
      id="new-daily-reward" 
      type="number" 
      value="${currentReward}" 
      class="form-input"
    >
    <button id="submit-daily-reward" class="btn btn-action full-width" style="
      margin-top: 1rem;
      background: linear-gradient(135deg, #ffe600, #f39c12, #ff00ff);
      box-shadow: 0 0 5px #00ffcc, 0 0 20px #ff00ff;
      color: #000;
      font-weight: bold;
      border-radius: 8px;
    ">
      Update Reward
    </button>

    <button class="btn btn-secondary mt-medium" onclick="openDepositToPool(${poolId}, '${tokenSymbol}')">
      💰 Deposit More Tokens
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">Edit Daily Reward for ${tokenSymbol}</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('submit-daily-reward').onclick = async () => {
      const newReward = parseFloat(document.getElementById('new-daily-reward').value);
      if (isNaN(newReward) || newReward <= 0) {
        showToast("Please enter a valid reward value", "error");
        return;
      }

      try {
        const { userId, usx_token } = window.userData;
        const res = await fetch(`${BASE_URL}/update_pool_daily_reward?user_id=${userId}&usx_token=${usx_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pool_id: poolId,
            reward_token_symbol: tokenSymbol,
            new_daily_reward: newReward
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update reward");

        showToast("Daily reward updated", "success");
        closeModal();
        fetchAndRenderTokenPools();
      } catch (err) {
        console.error("[❌] Failed to update reward:", err);
        showToast(err.message, "error");
      }
    };
  }, 0); // ⏱ attende il render completo del DOM prima di bindare gli eventi
}

window.openEditDailyReward = openEditDailyReward;
function openDepositToPool(poolId, tokenSymbol) {
  const tokenBalance = window.walletBalances?.find(t => t.symbol === tokenSymbol);
  const balance = tokenBalance?.amount || 0;
  const body = `
    <p class="wallet-info">Available in Wallet: <strong>${balance}</strong></p>

    <label class="form-label">Amount</label>
    <input 
      type="number" 
      id="deposit-amount" 
      class="form-input" 
      placeholder="e.g. 100"
    >

    <button 
      id="submit-deposit" 
      class="btn btn-primary full-width"
    >
      Deposit Tokens
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">Deposit More ${tokenSymbol} into Pool</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('submit-deposit').onclick = async () => {
      const amount = parseFloat(document.getElementById('deposit-amount').value);

      if (!amount || amount <= 0 || amount > balance) {
        showToast("Invalid amount", "error");
        return;
      }

      try {
        const { userId, usx_token, wax_account } = window.userData;

        const res = await fetch(`${BASE_URL}/add_token_to_staking_pool?user_id=${userId}&usx_token=${usx_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pool_id: poolId,
            token_symbol: tokenSymbol,
            amount,
            wax_account
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Deposit failed");

        showToast("Tokens deposited successfully", "success");
        closeModal();
        loadWallet();
        fetchAndRenderTokenPools();
      } catch (err) {
        console.error("[❌] Error depositing tokens:", err);
        showToast(err.message, "error");
      }
    };
  }, 0); // per attendere il render completo del DOM
}
window.openDepositToPool = openDepositToPool;
function openPoolStatusModal(poolId, currentStatus) {
  const body = `
    <label class="form-label">Select new status</label>
    <select id="pool-status-select" class="form-select">
      <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open</option>
      <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed</option>
      <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>Maintenance</option>
    </select>
    <button id="submit-pool-status" class="btn btn-warning full-width" style="margin-top: 1rem;">
      Update Status
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">Change Pool Status</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('submit-pool-status').onclick = async () => {
      const newStatus = document.getElementById('pool-status-select').value;
      const { userId, usx_token } = window.userData;
    
      try {
        const res = await fetch(`${BASE_URL}/update_token_pool_status?user_id=${userId}&usx_token=${usx_token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pool_id: poolId, new_status: newStatus })
        });
    
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update status");
    
        const modalBody = document.querySelector('.modal-body');
    
        const feedbackBox = document.createElement('div');
        feedbackBox.innerHTML = `
          <p style="
            font-family: Papyrus, 'Courier New', cursive;
            font-size: 1.1rem;
            background-color: #111;
            border: 1px solid #00ffcc;
            border-radius: 8px;
            padding: 1rem;
            margin-top: 1rem;
            color: #39ff14;
            text-shadow: 0 0 1px #f39c12;
            box-shadow: 0 0 12px #00ffcc;
            text-align: center;
          ">
            ✅ Status updated successfully.<br>
            🔄 This window will close in <strong>5 seconds</strong>.<br>
            <button onclick="closeModal()" style="
              margin-top: 0.75rem;
              font-size: 0.9rem;
              background-color: transparent;
              border: 1px solid #f39c12;
              color: #ffe600;
              padding: 0.4rem 1rem;
              border-radius: 6px;
              cursor: pointer;
              transition: all 0.2s ease-in-out;
            ">Close Now</button>
          </p>
        `;
        modalBody.appendChild(feedbackBox);
    
        setTimeout(() => {
          closeModal();
          fetchAndRenderTokenPools();
        }, 5000);
      } catch (err) {
        console.error("[❌] Errore durante l'aggiornamento dello stato della pool:", err);
        showToast("Error: " + err.message, "error");
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
        ${r.token_symbol}: ${parseFloat(r.daily_reward_amount).toFixed(4)}/day
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

// ✅ Deposit Rewards
function openDepositForm(farmId) {
  const { userId, usx_token } = window.userData;
  const wallet = window.walletBalances || [];

  const body = `
    <div id="rewards-deposit-container"></div>
    <button id="add-more-reward" class="link-add-reward">➕ Add another token</button>
    <button id="submit-deposit" class="btn btn-success full-width" style="margin-top: 1rem;">
      Deposit All
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">Deposit Rewards to Farm</h3>`,
    body
  });

  setTimeout(() => {
    const container = document.getElementById('rewards-deposit-container');
    const addBtn = document.getElementById('add-more-reward');

    function renderRewardRow() {
      const div = document.createElement('div');
      div.className = 'reward-row';
      div.innerHTML = `
        <label class="form-label">Choose Token</label>
        <select class="form-input token-symbol">
          <option disabled selected value="">-- Select a token --</option>
          ${wallet.map(t => `<option value="${t.symbol}">${t.symbol}</option>`).join('')}
        </select>

        <div class="available-balance hidden"></div>

        <label class="form-label">Select %</label>
        <input type="range" class="range-input percent-range" min="0" max="100" value="0" disabled>

        <label class="form-label">Amount</label>
        <input type="number" class="form-input amount" placeholder="Amount" disabled>
      `;

      const select = div.querySelector('.token-symbol');
      const range = div.querySelector('.percent-range');
      const input = div.querySelector('.amount');
      const balanceText = div.querySelector('.available-balance');

      let currentBalance = 0;

      select.onchange = () => {
        const selectedToken = select.value;
        currentBalance = parseFloat(wallet.find(t => t.symbol === selectedToken)?.amount || 0);

        balanceText.innerHTML = `Available balance in your Wallet: <strong>${currentBalance.toFixed(4)} ${selectedToken}</strong>`;
        balanceText.classList.remove('hidden');

        range.disabled = false;
        input.disabled = false;
        input.value = '';
        range.value = 0;
      };

      range.oninput = () => {
        const percent = parseFloat(range.value);
        input.value = (currentBalance * percent / 100).toFixed(4);
      };

      input.oninput = () => {
        const amount = parseFloat(input.value);
        if (!isNaN(amount)) {
          range.value = Math.min(100, Math.round((amount / currentBalance) * 100));
        }
      };

      container.appendChild(div);
    }

    // Prima riga
    renderRewardRow();
    addBtn.onclick = () => renderRewardRow();

    document.getElementById('submit-deposit').onclick = async () => {
      const rows = document.querySelectorAll('.reward-row');
      const rewards = [];

      rows.forEach(row => {
        const selectEl = row.querySelector('.token-symbol');
        const symbol = selectEl?.value?.trim();
        const amount = parseFloat(row.querySelector('.amount').value);

        if (!symbol || isNaN(amount) || amount <= 0) return;

        rewards.push({ token_symbol: symbol.toUpperCase(), amount });
      });

      if (rewards.length === 0) {
        showToast("You must enter at least one valid reward", "error");
        return;
      }

      try {
        const res = await fetch(`${BASE_URL}/add_token_to_farm_v2?user_id=${userId}&usx_token=${usx_token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ farm_id: farmId, rewards })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Unknown error");

        showToast(data.message || "✅ Rewards deposited successfully", "success");
        closeModal();
        fetchAndRenderUserFarms();
      } catch (err) {
        console.error("[❌] Error depositing rewards:", err);
        showToast(err.message, "error");
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
  } else if (section === 'lp-league') {
      app.innerHTML = `
        <div class="section-container">
          <h2 class="section-title">LP LEAGUE : are you ready for it?</h2>
        </div>
      `;
    loadLpLeague();
  }  else if (section === 'nfts') {
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
        <input type="text" id="search-pools" placeholder="Search token pool name" class="form-input search-token-pool">
        <div id="pool-buttons" class="pool-buttons"></div>
        <div id="selected-pool-details">
          <div class="loading-message">Loading pool data...</div>
        </div>
      </div>
    `;
    loadStakingPools();
  
  } else if (section === 'nfts-staking') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title">NFT Staking</h2>
        <div id="nft-farms-container" class="vertical-list">Loading NFT farms...</div>
      </div>
    `;
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

function getRarityColorClass(rarity) {
  if (typeof rarity !== 'string') return 'neon-white';
  switch (rarity.toLowerCase()) {
    case 'common': return 'neon-green';
    case 'rare': return 'neon-blue';
    case 'epic': return 'neon-purple';
    case 'legendary': return 'neon-gold';
    case 'mythic': return 'neon-red';
    default: return 'neon-white';
  }
}

function getLevelColorClass(level) {
  if (level >= 10) return 'neon-red';
  if (level >= 7) return 'neon-gold';
  if (level >= 4) return 'neon-purple';
  if (level >= 2) return 'neon-blue';
  return 'neon-green';
}

function getRarityBorderClass(rarity) {
  if (typeof rarity !== 'string') return '';
  const map = {
    common: 'border-glow-green',
    rare: 'border-glow-blue',
    epic: 'border-glow-purple',
    legendary: 'border-glow-gold',
    mythic: 'border-glow-red'
  };
  return map[rarity.toLowerCase()] || '';
}

function getLabelColor(index) {
  const colors = ['#0ff', '#ff66cc', '#ffcc00', '#00ff99', '#66b2ff'];
  return colors[index % colors.length];
}

async function renderGoblinInventory() {
  const container = document.getElementById('goblin-content');
  container.innerHTML = `<p class="subtitle2">Fetching your goblins...</p>`;

  try {
    const res = await fetch(`${BASE_URL}/user_nfts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wax_account: window.userData.wax_account,
        user_id: window.userData.userId,
        usx_token: window.userData.usx_token
      })
    });

    const nfts = await res.json();
    // Mappa daily_power → daily-power
    nfts.forEach(nft => {
      if (nft.daily_power !== undefined) {
        nft["daily-power"] = nft.daily_power;
      }
    });    
    if (!Array.isArray(nfts) || nfts.length === 0) {
      container.innerHTML = `<p>No goblins found in your inventory.</p>`;
      return;
    }

    let sortBy = null;
    let sortAsc = true;
    let currentPage = 1;
    let itemsPerPage = 36;

    function paginate(data) {
      const start = (currentPage - 1) * itemsPerPage;
      return data.slice(start, start + itemsPerPage);
    }

    function renderPagination(totalItems) {
      const totalPages = Math.ceil(totalItems / itemsPerPage);
      const pagination = document.getElementById('pagination-controls');
      pagination.innerHTML = '';
      for (let i = 1; i <= totalPages; i++) {
        pagination.innerHTML += `<button class="page-btn ${i === currentPage ? 'active-tab' : ''}" data-page="${i}">${i}</button>`;
      }
      document.querySelectorAll('.page-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          currentPage = parseInt(btn.getAttribute('data-page'));
          applyFiltersAndSort();
        });
      });
    }

    container.innerHTML = `
      <div class="goblin-filters" id="goblin-filters" style="
        margin-bottom: 2rem;
        padding: 1.5rem;
        background: linear-gradient(to right, #111, #1a1a1a);
        border-radius: 16px;
        box-shadow: 0 0 12px #0ff;
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        justify-content: center;
        font-family: 'Orbitron', sans-serif;
      ">
        <input id="filter-name" placeholder="🔍 Search name..." style="
          padding: 0.6rem;
          width: 180px;
          border-radius: 8px;
          border: none;
          outline: none;
          background: #222;
          color: #0ff;
          font-size: 1rem;
          box-shadow: 0 0 5px #0ff;
        ">
    
        <select id="filter-rarity" style="
          padding: 0.6rem;
          border-radius: 8px;
          background: #222;
          color: #fff;
          font-size: 1rem;
          box-shadow: 0 0 5px #0ff;
        ">
          <option value="">All Rarities</option>
          <option value="common">Common</option>
          <option value="rare">Rare</option>
          <option value="epic">Epic</option>
          <option value="legendary">Legendary</option>
          <option value="mythic">Mythic</option>
        </select>
    
        <input id="filter-edition" type="number" min="1" placeholder="Edition #" style="
          width: 100px;
          padding: 0.6rem;
          border-radius: 8px;
          background: #222;
          color: #0ff;
          font-size: 1rem;
          box-shadow: 0 0 5px #0ff;
        ">
    
        ${['level', 'loot-hungry', 'speed', 'resistance', 'accuracy', 'daily-power'].map(attr => `
          <input id="filter-${attr}" type="number" min="0" placeholder="${attr}" style="
            width: 100px;
            padding: 0.6rem;
            border-radius: 8px;
            background: #222;
            color: #0ff;
            font-size: 1rem;
            box-shadow: 0 0 5px #0ff;
          ">
        `).join('')}
    
        <select id="items-per-page" style="
          padding: 0.6rem;
          border-radius: 8px;
          background: #222;
          color: #0ff;
          font-size: 1rem;
          box-shadow: 0 0 5px #0ff;
        ">
          <option value="6">6</option>
          <option value="12" selected>12</option>
          <option value="24">24</option>
        </select>
    
        <button id="reset-filters" class="btn btn-glow" style="
          padding: 0.6rem 1.2rem;
          background: #c00;
          color: #fff;
          border-radius: 8px;
          box-shadow: 0 0 8px #f00;
          font-weight: bold;
        ">🔄 Reset</button>
      </div>
    
      <div id="sort-buttons" style="
        margin-bottom: 1.5rem;
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        justify-content: center;
      ">
        ${['level', 'loot-hungry', 'speed', 'resistance', 'accuracy', 'daily-power'].map(attr => `
          <button class="btn btn-glow sort-btn" data-sort="${attr}" style="
            padding: 0.5rem 1rem;
            background: #222;
            color: #0ff;
            border-radius: 8px;
            font-size: 1rem;
            box-shadow: 0 0 6px #0ff;
            transition: all 0.2s ease;
          ">
            ⬍ Sort: ${attr}
          </button>
        `).join('')}
      </div>
    
      <div id="goblin-grid" class="goblin-inventory-grid" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 200px));
        justify-content: center;
        gap: 2rem;
        padding: 1rem 1rem 0 1rem;
      "></div>
    
      <div id="pagination-controls" class="pagination-controls" style="
        margin-top: 2rem;
        text-align: center;
      "></div>
    `;

    const gridContainer = document.getElementById('goblin-grid');

    function renderGrid(data) {
      const paginated = paginate(data);
    
      gridContainer.innerHTML = paginated.map(nft => `
        <div class="goblin-card ${getRarityBorderClass(nft.rarity)}" style="
          width: 100%;
          max-width: 200px;
          min-width: 170px;
          background: linear-gradient(to bottom, #0d0d0d, #1a1a1a);
          padding: 1.2rem;
          border-radius: 18px;
          text-align: center;
          font-family: 'Orbitron', sans-serif;
          color: #fff;
          position: relative;
          transition: transform 0.2s ease;
        " onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
    
          <img src="${nft.img}" alt="${nft.name}" style="
            width: 100%;
            border-radius: 12px;
            margin-bottom: 0.75rem;
            box-shadow: 0 0 12px rgba(0, 255, 255, 0.4);
          ">
    
          <div style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.3rem; color: #ffe600;">
            ${nft.name}
          </div>
    
          <div style="font-size: 1rem; margin-bottom: 0.2rem;">
            <span style="color: #888;">Rarity:</span> 
            <span class="${getRarityColorClass(nft.rarity)}">${nft.rarity}</span>
          </div>
    
          <div style="font-size: 1rem; margin-bottom: 0.2rem;">
            <span style="color: #888;">Edition:</span> <span style="color:#fff;">${nft.edition}</span>
          </div>
          <div style="font-size: 1rem;">
            <span style="color: #888;">Asset ID:</span> <span style="color:#ccc;">${nft.asset_id}</span>
          </div>
          <div style="font-size: 1rem; margin-bottom: 0.4rem;">
            <span style="color: #888;">Mint #:</span> <span style="color:#ccc;">${nft.template_mint}</span>
          </div>
    
          <div style="margin: 0.5rem 0; font-size: 1rem; color: #aaa; min-height: 30px; font-style: italic;">
            “${nft.description}”
          </div>
    
          <div class="goblin-attributes" style="
            font-size: 1rem;
            color: #0ff;
            text-align: left;
            margin: 0.75rem 0;
            background: rgba(0,255,255,0.05);
            padding: 0.5rem;
            border-radius: 10px;
          ">
            <div style="margin-bottom: 0.25rem;">
              <span style="color:#ffa500;">⚔ Level:</span> 
              <strong class="${getLevelColorClass(nft.level)}" style="margin-left: 4px;">${nft.level}</strong>
            </div>
            ${['resistance','accuracy','loot-hungry','speed','daily-power']
              .map((key, i) => `
                <div style="margin-bottom: 0.25rem;">
                  <span style="color:${getLabelColor(i)};">${key.replace('-', ' ')}:</span>
                  <strong style="color:#fff; margin-left: 4px;">${nft[key]}</strong>
                </div>`).join('')}
          </div>
        </div>
      `).join('');
    }

    function applyFiltersAndSort() {
      const name = document.getElementById("filter-name").value.toLowerCase();
      const rarity = document.getElementById("filter-rarity").value.toLowerCase();
      const edition = document.getElementById("filter-edition").value;
      itemsPerPage = parseInt(document.getElementById("items-per-page").value) || 12;

      const attrFilters = {
        "level": +document.getElementById("filter-level").value || null,
        "loot-hungry": +document.getElementById("filter-loot-hungry").value || null,
        "speed": +document.getElementById("filter-speed").value || null,
        "resistance": +document.getElementById("filter-resistance").value || null,
        "accuracy": +document.getElementById("filter-accuracy").value || null,
        "daily-power": +document.getElementById("filter-daily-power").value || null,
      };

      let filtered = nfts.filter(nft => {
        if (name && !nft.name.toLowerCase().includes(name)) return false;
        if (rarity && nft.rarity.toLowerCase() !== rarity) return false;
        if (edition && nft.edition != edition) return false;
        for (const key in attrFilters) {
          if (attrFilters[key] !== null && (+nft[key] || 0) < attrFilters[key]) return false;
        }
        return true;
      });

      if (sortBy) {
        filtered = filtered.sort((a, b) => {
          const aVal = +a[sortBy] || 0;
          const bVal = +b[sortBy] || 0;
          return sortAsc ? aVal - bVal : bVal - aVal;
        });
      }

      renderGrid(filtered);
      renderPagination(filtered.length);
    }

    document.querySelectorAll('#goblin-filters input, #goblin-filters select').forEach(el => {
      el.addEventListener('input', applyFiltersAndSort);
    });

    document.getElementById("reset-filters").addEventListener("click", () => {
      document.querySelectorAll('#goblin-filters input, #goblin-filters select').forEach(el => el.value = '');
      sortBy = null;
      sortAsc = true;
      currentPage = 1;
      applyFiltersAndSort();
    });

    document.querySelectorAll(".sort-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const field = btn.getAttribute("data-sort");
        if (sortBy === field) {
          sortAsc = !sortAsc;
        } else {
          sortBy = field;
          sortAsc = true;
        }
        applyFiltersAndSort();
      });
    });

    applyFiltersAndSort();

  } catch (err) {
    console.error("[renderGoblinInventory] Error:", err);
    container.innerHTML = `<p>Error loading inventory.</p>`;
  }
}

function renderList(filteredList = userGoblins) {
  const sorted = [...filteredList].sort((a, b) => b.daily_power - a.daily_power);
  const selected = selectedGoblins;
  const highlightStyle = (id) => selected.has(id) ? "background: rgba(255,255,0,0.1);" : "";

  document.getElementById('goblin-list').innerHTML = sorted.map(g => {
    const isExhausted = parseInt(g.daily_power) < 5;
    return `
      <div class="goblin-line" style="
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 0.6rem 1rem;
        border-bottom: 1px solid #333;
        border-radius: 10px;
        position: relative;
        ${highlightStyle(g.asset_id)}
      ">
        <div style="flex-basis: 15%; max-width: 15%; position: relative;">
          <img src="${g.img}" style="width:50px; height:auto; border-radius:8px; ${isExhausted ? 'filter: grayscale(100%) brightness(0.7);' : ''}">
          ${isExhausted ? `
            <div style="
              position: absolute;
              top: -10px;
              left: -20px;
              transform: rotate(-20deg);
              background: rgba(255, 0, 0, 0.85);
              color: white;
              padding: 2px 8px;
              font-size: 0.65rem;
              font-weight: bold;
              border-radius: 6px;
              box-shadow: 0 0 6px red;
              font-family: Orbitron, sans-serif;
            ">
              Exhausted
            </div>
          ` : ''}
        </div>
        <div style="flex-grow:1; font-size: 0.95rem; font-family: Orbitron, sans-serif; color: #fff;">
          <div><strong style="color:#ffe600;">${g.name}</strong></div>
          <div style="color:#ccc;">Rarity: <span>${g.rarity}</span></div>
          <div style="color:#aaa;">Level: ${g.level} | Main: ${g.main_attr}</div>
          <div style="color:#0ff;">Power: ${g["daily_power"]}</div>
          ${isExhausted ? `<div style="color:#f44; font-size: 0.7rem; margin-top: 4px;">Needs rest until tomorrow</div>` : ''}
        </div>
        <input type="checkbox" class="select-goblin-checkbox" data-id="${g.asset_id}"
          ${selected.has(g.asset_id) ? "checked" : ""}
          ${isExhausted ? "disabled" : ""}
          style="transform: scale(1.4); accent-color: #ffe600;">
      </div>
    `;
  }).join("");

  document.querySelectorAll('.select-goblin-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = cb.getAttribute('data-id');
      cb.checked ? selected.add(id) : selected.delete(id);
      updateSelectionSummary();
      renderList();
    });
  });
}

async function renderDwarfsCave() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="section-container">
      <h2 class="section-title">Dwarfs Gold Cave (Multiplayer Mode)</h2>
      <div id="dwarfs-cave-wrapper">
        <div id="canvas-wrapper"></div>
        <div id="global-expedition-list"></div>
        <div id="recent-expeditions-list"></div>
        <div id="bonus-chest-rewards"></div>
        <div id="goblin-list"></div>
        <div id="selection-summary"></div>
        <button onclick="selectAllGoblins()">Select All</button>
        <button onclick="selectBest50Goblins()">Select Best 50</button>
        <button id="start-expedition-btn" class="btn">🚀 Start Expedition</button>
      </div>
    </div>
  `;

  const user = window.userData;
  let syncInterval;
  
  function selectAllGoblins() {
    selectedGoblins = new Set(userGoblins.map(g => g.asset_id));
    loadUserGoblins();  // Ri-render con tutti selezionati
  }
  
  function selectBest50Goblins() {
    const top50 = userGoblins.slice(0, 50);  // Assumendo già ordinati
    selectedGoblins = new Set(top50.map(g => g.asset_id));
    loadUserGoblins();
  }

  const canvasWrapper = document.getElementById("canvas-wrapper");
  const canvas = document.createElement("canvas");
  canvas.id = "caveCanvas";
  canvas.width = 600;
  canvas.height = 600;
  canvas.style.width = "100%";
  canvas.style.maxWidth = "600px";
  canvasWrapper.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const perkSprites = {
    "dragon": { src: "perk_dragon.png", frames: 6 },
    "dwarf": { src: "perk_dwarf.png", frames: 6 },
    "skeletton": { src: "perk_skeleton.png", frames: 6 },
    "black_cat": { src: "perk_blackcat.png", frames: 6 }
  };

  const loadedImages = {};
  for (const key in perkSprites) {
    const img = new Image();
    img.src = perkSprites[key].src;
    loadedImages[key] = img;
  }

  const goblinImage = new Image(); goblinImage.src = "goblin.png";
  const shovelSprite = new Image(); shovelSprite.src = "shovel_sprite.png";
  const chestImage = new Image(); chestImage.src = "chest.png";
  const bgImg = new Image(); bgImg.src = "cave-grid.png";

  let caveObjects = { goblins: [], perks: [], chests: [] };
  let frameCount = 0;
  
  function constrainGoblinPosition(g) {
    const marginX = canvas.width * 0.13;
    const marginY = canvas.height * 0.13;
  
    g.x = Math.max(marginX, Math.min(canvas.width - marginX, g.x));
    g.y = Math.max(marginY, Math.min(canvas.height - marginY, g.y));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
  
    caveObjects.goblins.forEach(g => {
      const speed = g.speed ?? 1.5;
      const next = g.path[g.currentIndex + 1];
      if (next) {
        const dx = next.x - g.x;
        const dy = next.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          g.x += dx / dist * speed;
          g.y += dy / dist * speed;
        } else {
          g.x = next.x;
          g.y = next.y;
          g.currentIndex++;
        }
        constrainGoblinPosition(g);
      }
    
      // 💡 Highlight goblins not owned by the current user
      if (g.aura) {
        ctx.save();
        ctx.shadowColor = g.aura;
        ctx.shadowBlur = 20;
      }

      const size = 32; // impostato come metà della dimensione originale
      ctx.drawImage(goblinImage, g.x - size / 2, g.y - size / 2, size, size);
      
      if (g.owner !== user.wax_account) {
        ctx.restore();
      }

      // ✏️ Draw owner label for all goblins
      const labelText = g.owner;
      const labelX = g.x;
      const labelY = g.y - 38;
      
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      
      // Misura larghezza per disegnare rettangolo di sfondo
      const textWidth = ctx.measureText(labelText).width;
      const padding = 4;
      const rectWidth = textWidth + padding * 2;
      const rectHeight = 16;
      
      // Colore diverso per utente vs altri
      if (g.owner === user.wax_account) {
        ctx.fillStyle = "#333"; // sfondo scuro per sé
      } else {
        ctx.fillStyle = "#555"; // sfondo più chiaro per altri
      }
      
      // Disegna rettangolo sfondo
      ctx.fillRect(labelX - rectWidth / 2, labelY - rectHeight + 4, rectWidth, rectHeight);
      
      // Scrivi testo sopra
      ctx.fillStyle = "white";
      ctx.fillText(labelText, labelX, labelY);

    });
    
      // Perks animati
    caveObjects.perks.forEach(p => {
      const sprite = loadedImages[p.type];
      if (!sprite) return;
      const frames = perkSprites[p.type]?.frames || 1;
      const frame = Math.floor(frameCount / 5) % frames;
      ctx.drawImage(sprite, frame * 64, 0, 64, 64, p.x - 32, p.y - 32, 64, 64);
    });
    
    // Chest statiche
    caveObjects.chests.forEach(ch => {
      ctx.drawImage(chestImage, ch.x - 16, ch.y - 16, 32, 32);
    });

    // draw perks and chests (come già fai)
    frameCount++;
    requestAnimationFrame(draw);
  }

  function updateCaveData(data) {
    const allGoblins = (data.goblins || []).map(g => ({
      asset_id: g.asset_id,
      path: g.path || [{ x: g.x, y: g.y }],
      currentIndex: 0,
      x: g.path?.[0]?.x ?? g.x,
      y: g.path?.[0]?.y ?? g.y,
      owner: g.owner,
      aura: g.aura || null,
      rarity: g.rarity || "common",
      speed: 1 + (parseInt(g.asset_id.slice(-2), 16) % 10) / 10 
    }));
  
    // Mappa owner → lista dei suoi goblin
    const grouped = {};
    for (const goblin of allGoblins) {
      if (!grouped[goblin.owner]) grouped[goblin.owner] = [];
      grouped[goblin.owner].push(goblin);
    }
  
    // Ordina per rarity e prendi solo il più raro per owner
    const rarityOrder = { mythic: 5, legendary: 4, epic: 3, rare: 2, common: 1 };
    const filteredGoblins = Object.values(grouped).map(list => {
      return list.sort((a, b) => (rarityOrder[b.rarity] ?? 0) - (rarityOrder[a.rarity] ?? 0))[0];
    });
  
    caveObjects = {
      goblins: filteredGoblins,
      perks: data.perks || [],
      chests: data.chests || []
    };
  }


  async function syncExpeditionsAndCanvas() {
    try {
      const goblinPositions = {};
      for (const g of caveObjects.goblins) {
        goblinPositions[g.asset_id] = { x: g.x, y: g.y, currentIndex: g.currentIndex };
      }
            
      const res = await fetch(`${BASE_URL}/sync_expedition_state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wax_account: user.wax_account,
          positions: goblinPositions
        })
      });

      const data = await res.json();
      currentExpeditions = data.expeditions || [];
      renderExpeditions(currentExpeditions);
      renderRecentResults(data.recent || []);
      renderChestRewards(data.bonuses || []);
      updateCaveData(data.canvas || {});

    } catch (err) {
      console.error("[Sync Error]", err);
    }
  }

  function renderExpeditions(expeditions) {
    const list = document.getElementById("global-expedition-list");
    list.innerHTML = `<h3>🌍 Active Expeditions</h3>`;
    expeditions.forEach(e => {
      list.innerHTML += `
        <div>
          <strong>${e.wax_account}</strong>: ${e.total_goblins} goblins - Ends in ${e.seconds_remaining}s
        </div>`;
    });
  }

  function renderRecentResults(entries) {
    const container = document.getElementById("recent-expeditions-list");
    container.innerHTML = `<h3>🕒 Recent Results</h3>`;
    entries.forEach(item => {
      container.innerHTML += `
        <div><strong>${item.wax_account}</strong> won ${item.chips} CHIPS and ${item.nfts.length} NFTs</div>`;
    });
  }

  function renderChestRewards(entries) {
    const container = document.getElementById("bonus-chest-rewards");
    container.innerHTML = `<h3>🎁 Chest Wins</h3>`;
    entries.forEach(r => {
      container.innerHTML += `
        <div><strong>${r.wax_account}</strong> got ${r.stats.tokens.CHIPS ?? 0} CHIPS and ${r.nfts?.length || 0} NFTs</div>`;
    });
  }

  async function loadUserGoblins() {
    try {
      const res = await fetch(`${BASE_URL}/user_nfts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wax_account: user.wax_account,
          user_id: user.userId,
          usx_token: user.usx_token
        })
      });

      const goblins = (await res.json()).filter(n => n.type === "goblin");
      userGoblins = goblins;
      renderList();
    } catch (err) {
      console.error("[Goblin Load Error]", err);
    }
  }

  function updateSelectionSummary() {
    const box = document.getElementById("selection-summary");
    box.innerHTML = `Selected: ${selectedGoblins.size} goblins`;
  }

  document.getElementById("start-expedition-btn").onclick = async () => {
    if (selectedGoblins.size === 0) return alert("Select goblins first!");
    const assetIds = [...selectedGoblins];

    try {
      const res = await fetch(`${BASE_URL}/start_expedition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wax_account: user.wax_account,
          user_id: user.userId,
          usx_token: user.usx_token,
          goblin_ids: assetIds
        })
      });

      const result = await res.json();
      if (res.ok) {
        alert("Expedition started!");
        selectedGoblins.clear();
        await loadUserGoblins();
        await syncExpeditionsAndCanvas();
      } else {
        alert(result.error || "Failed to start expedition");
      }
    } catch (err) {
      console.error("[Start Expedition Error]", err);
    }
  };

  await loadUserGoblins();
  await syncExpeditionsAndCanvas();
  updateSelectionSummary();
  draw();
  syncInterval = setInterval(syncExpeditionsAndCanvas, 10000);
  window.onbeforeunload = () => clearInterval(syncInterval);
}

async function renderGoblinBlend() {
  const container = document.getElementById('goblin-content');
  container.innerHTML = `
    <div style="display: flex; justify-content: center; gap: 2rem; margin-bottom: 1rem;">
      <button id="tab-level" class="btn btn-glow active-tab">Level Upgrades</button>
      <button id="tab-rotation" class="btn btn-glow">Slot Rotation</button>
    </div>

    <div id="tab-content">
      <p style="color: #0ff;">Loading...</p>
    </div>
  `;

  const tabContent = document.getElementById("tab-content");
  const levelBtn = document.getElementById("tab-level");
  const rotationBtn = document.getElementById("tab-rotation");

  levelBtn.addEventListener("click", () => {
    setActiveTab("level");
  });

  rotationBtn.addEventListener("click", () => {
    setActiveTab("rotation");
  });

  async function setActiveTab(tabName) {
    // Aggiorna stile tab
    [levelBtn, rotationBtn].forEach(btn => btn.classList.remove("active-tab"));
    if (tabName === "level") levelBtn.classList.add("active-tab");
    else rotationBtn.classList.add("active-tab");

    // Mostra contenuto
    tabContent.innerHTML = `<p style="color: #0ff;">Loading...</p>`;

    if (tabName === "level") {
      await renderLevelUpgrades();
    } else {
      await renderSlotRotation();
    }
  }

  // Attiva tab iniziale
await setActiveTab("level");

  
  
  async function renderLevelUpgrades() {
    tabContent.innerHTML = `
      <div style="display: flex; justify-content: space-around; align-items: center; margin-bottom: 2rem;">
        <img src="https://example.com/levels.jpg" alt="Levels" style="height: 120px; border-radius: 12px; box-shadow: 0 0 15px #00f0ff;">
        <img src="https://example.com/rotation.jpg" alt="Rotation Cycle" style="height: 120px; border-radius: 12px; box-shadow: 0 0 15px #00f0ff;">
      </div>

      <div style="margin-bottom: 2rem; padding: 1rem; background: #111; border-radius: 12px; box-shadow: 0 0 10px #0ff; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; justify-content: center;">
        <button id="refresh-blends" class="btn btn-glow" style="padding: 0.6rem 1.2rem;">🔄 Refresh Data</button>
        <input id="filter-name" type="text" placeholder="Search name..." style="padding: 0.6rem; border-radius: 8px;">
        <select id="filter-rarity" style="padding: 0.6rem; border-radius: 8px;">
          <option value="">All Rarities</option>
          <option value="common">Common</option>
          <option value="rare">Rare</option>
          <option value="epic">Epic</option>
          <option value="legendary">Legendary</option>
          <option value="mythic">Mythic</option>
        </select>
        <input id="filter-edition" type="number" min="1" placeholder="Edition" style="width: 120px; padding: 0.6rem; border-radius: 8px;">
        <input id="filter-level" type="number" min="1" max="5" placeholder="Level" style="width: 100px; padding: 0.6rem; border-radius: 8px;">
        <select id="filter-attr" style="padding: 0.6rem; border-radius: 8px;">
          <option value="">Any Attribute</option>
          <option value="accuracy">Accuracy</option>
          <option value="resistance">Resistance</option>
          <option value="speed">Speed</option>
          <option value="loot-hungry">Loot-Hungry</option>
        </select>

      </div>
      <button id="refresh-blends" class="btn btn-glow">🔄 Refresh</button>
      <button id="force-update" class="btn btn-glow">⟳ Update</button>

      <div id="blend-results" style="
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 1.5rem;
        padding-bottom: 3rem;
      "></div>
    `;

    const blendResults = document.getElementById("blend-results");

    function applyFilters(blends) {
      const rarity = document.getElementById('filter-rarity').value.toLowerCase();
      const edition = +document.getElementById('filter-edition').value || null;
      const attr = document.getElementById('filter-attr')?.value.toLowerCase();
      const name = document.getElementById('filter-name')?.value.toLowerCase();
    
      return blends.filter(b => {
        if (rarity && b.rarity.toLowerCase() !== rarity) return false;
        if (edition && +b.edition !== edition) return false;
        if (name && !b.name.toLowerCase().includes(name)) return false;
    
        if (attr) {
          const mainAttr = b.ingredients[0]?.filters?.main_attr?.toLowerCase();
          if (mainAttr !== attr) return false;
        }
    
        return true;
      });
    }

    async function fetchBlendData() {
      const payload = {
        wax_account: window.userData.wax_account,
        user_id: window.userData.userId,
        usx_token: window.userData.usx_token
      };
      const res = await fetch(`${BASE_URL}/get_blend_data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }

  function renderBlendResults(blends) {
    blendResults.innerHTML = blends.map(item => {
      const ingredientList = item.ingredients.map(ing => {
        const ownedCount = ing.owned || 0;
        const neededCount = ing.needed || ing.quantity || 0;
        const ratio = `${ownedCount}/${neededCount}`;
  
        let color = "#0f0"; // green (complete)
        if (ownedCount === 0) color = "#f00"; // red (none)
        else if (ownedCount < neededCount) color = "#ffa500"; // orange (partial)
  
        const assetIds = ing.asset_ids?.length > 0
          ? `<br><span style="color:#888;font-size:0.95rem;">Assets: ${ing.asset_ids.join(', ')}</span>`
          : "";
  
        return `
          <li style="color: ${color}; font-size: 0.8rem;">
            ${ratio} × (schema: ${ing.schema_name}, id: ${ing.template_id})${assetIds}
          </li>`;
      }).join('');
  
      return `
        <div style="
          background: linear-gradient(to bottom, #0f0f0f, #1a1a1a);
          border-radius: 16px;
          padding: 1rem;
          text-align: center;
          box-shadow: 0 0 12px #00f0ff;
          font-family: 'Orbitron', sans-serif;
          transition: transform 0.2s ease;
          color: #fff;
        " onmouseover="this.style.transform='scale(1.03)'" onmouseout="this.style.transform='scale(1)'">
          <img src="${item.img}" alt="${item.name}" style="width: 80%; border-radius: 12px; margin-bottom: 0.75rem;">
          <div style="font-size: 1.25rem; font-weight: bold; margin-bottom: 0.4rem; color: #ffe600;">${item.name}</div>
          <div style="font-size: 1rem; color: #aaa;">Level: <span style="color: #fff;">${item.level}</span></div>
          <div style="font-size: 1rem; color: #aaa;">Rarity: <span style="color: #fff;">${item.rarity}</span></div>
          <div style="font-size: 1rem; color: #aaa;">Edition: <span style="color: #fff;">${item.edition}</span></div>
  
          <div style="margin-top: 1rem; text-align: left;">
            <strong style="color: #ffe600;">🔹 Ingredients:</strong>
            <ul style="list-style-type: none; padding-left: 0; margin-top: 0.5rem;">
              ${ingredientList}
            </ul>
          </div>
          <div style="margin-top: 1rem;">
            <a href="${item.blend_link}" target="_blank" class="btn btn-glow" style="padding: 0.5rem 1.2rem; font-size: 0.9rem;">🧪Blend @NeftyBlock</a>
          </div>              
        </div>
      `;
    }).join('');
  }


    let blendData;
    try {
      blendData = await fetchBlendData();
      renderBlendResults(blendData);
    } catch (err) {
      blendResults.innerHTML = "<p style='color:red'>Failed to load blends data.</p>";
    }

    document.getElementById("refresh-blends").addEventListener("click", async () => {
      blendData = await fetchBlendData();
      renderBlendResults(applyFilters(blendData));
    });

    document.getElementById("force-update").addEventListener("click", async () => {
      blendResults.innerHTML = "<p style='color: #0ff;'>Updating...</p>";
      try {
        const res = await fetch(`${BASE_URL}/get_blend_data`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wax_account: window.userData.wax_account,
            user_id: window.userData.userId,
            usx_token: window.userData.usx_token,
            force_update: true
          })
        });
        blendData = await res.json();
        renderBlendResults(applyFilters(blendData));
      } catch (e) {
        blendResults.innerHTML = "<p style='color:red;'>❌ Failed to update.</p>";
      }
    });
    
    ['filter-name', 'filter-rarity', 'filter-edition', 'filter-level', 'filter-attr'].forEach(id => {
      document.getElementById(id).addEventListener("input", () => {
        renderBlendResults(applyFilters(blendData));
      });
    });

  }

  async function renderSlotRotation() {
    try {
      const payload = {
        wax_account: window.userData.wax_account,
        user_id: window.userData.userId,
        usx_token: window.userData.usx_token
      };

      const res = await fetch(`${BASE_URL}/get_rotations_data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      tabContent.innerHTML = `
        <div style="padding: 1rem; background: #111; color: #fff; border-radius: 12px;">
          <h2 style="text-align:center; margin-bottom:1rem;">🌀 Slot Rotation Info</h2>
          <pre style="white-space: pre-wrap;">${JSON.stringify(data, null, 2)}</pre>
        </div>
      `;
    } catch (err) {
      console.error("Error fetching rotation data:", err);
      tabContent.innerHTML = `<p style="color:red">❌ Failed to load slot rotation data.</p>`;
    }
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

async function loadLpLeague() {
  const container = document.querySelector('.section-container');

  if (!window.userData || !window.userData.userId || !window.userData.usx_token || !window.userData.wax_account) {
    container.innerHTML += `<div class="error-message">User data is missing. Please log in again.</div>`;
    return;
  }

  const { userId, usx_token, wax_account } = window.userData;

  container.innerHTML = `
    <div class="lp-tabs">
      <button id="tab-instructions" class="lp-tab active">Instructions</button>
      <button id="tab-leaderboard" class="lp-tab">Leaderboard</button>
      <button id="tab-badges" class="lp-tab">Badge-Points Leaderboard</button>
    </div>
    <div id="lp-content" class="lp-content">
      <div class="info-message">Click on "Leaderboard" to view rankings.</div>
    </div>
  `;

  document.getElementById('tab-instructions').addEventListener('click', () => {
    document.getElementById('lp-content').innerHTML = `
      <div class="instructions" style="
        font-family: 'Papyrus', 'Courier New', cursive;
        font-size: 1.1rem;
        color: #39ff14;
        text-shadow: 0 0 3px #00ffcc, 0 0 7px #00ffcc;
        padding: 2rem;
        border: 2px solid #00ffcc;
        border-radius: 14px;
        box-shadow: 0 0 20px #00ffcc, 0 0 40px #ff00ff;
        animation: fade-slide 1s ease-in-out;
        background: rgba(0, 0, 0, 0.6);
        max-width: 900px;
        margin: 0 auto;
      ">
        <h3 style="
          font-size: 1.7rem;
          color: #FFD700;
          text-shadow: 0 0 5px #FFD700, 0 0 15px #FFE600;
          animation: glow-pulse 2s infinite;
          text-align: center;
          margin-bottom: 1.5rem;
        ">How to Participate in LP League</h3>
    
        <ul style="
          list-style-type: square;
          padding-left: 1.8rem;
          line-height: 1.7;
          font-size: 1.15rem;
          margin-bottom: 1.8rem;
        ">
          <li>Stake LP tokens on supported pools (Taco CHIPS/WAX, Taco CHIPS/SQJ, ALCOR CHIPS/WAX, ALCOR CHIPS/SQJ, ALCOR SQJ/WAX).</li>
          <li>Earn Points based on LP delta and token value (in WAX).</li>
          <li>Top performers earn WAX rewards from the <strong>15,000 WAX</strong> prize pool.</li>
          <li>Daily activity boosts score and earns you Badges!</li>
        </ul>
    
        <hr style="border-color: #00ffcc; margin: 1.8rem 0;">
    
        <h4 style="
          font-size: 1.4rem;
          color: #1affd5;
          text-shadow: 0 0 3px #00f0ff, 0 0 10px #00f0ff;
          margin-bottom: 0.8rem;
          animation: glow-pulse 2s infinite;
        ">Badge System & Extra Rewards</h4>
    
        <p style="margin-bottom: 1.2rem; line-height: 1.6;">
          Earn badges by completing various achievements during the LP League. Each badge grants you extra points (1 to 3). The <b>Top 5 players with the highest Badge Points</b> will receive a share of <span style="color: #FFD700; font-weight: bold;">2,000,000 $CHIPS tokens</span> as extra bonus rewards, in addition to the LP League rewards.
        </p>
    
        <div style="
          border: 2px dashed #FFD700;
          border-radius: 12px;
          padding: 1rem;
          box-shadow: 0 0 15px #FFD700, 0 0 25px #FFD700;
          margin-bottom: 1.5rem;
          font-size: 1rem;
          background: rgba(0, 0, 0, 0.4);
        ">
          <p style="margin-bottom: 0.8rem; text-align: center; font-weight: bold; color: #FFD700;">Top 5 Badge Points Holders will receive:</p>
          <ul style="
            list-style: none;
            padding-left: 0;
            text-align: center;
            line-height: 1.6;
          ">
            <li style="color: #FFD700;">🥇 1st place → 1,000,000 $CHIPS</li>
            <li style="color: #C0C0C0;">🥈 2nd place → 500,000 $CHIPS</li>
            <li style="color: #CD7F32;">🥉 3rd place → 300,000 $CHIPS</li>
            <li style="color: #00ffcc;">4th place → 150,000 $CHIPS</li>
            <li style="color: #1affd5;">5th place → 50,000 $CHIPS</li>
          </ul>
        </div>
    
        <div style="
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
          font-size: 1rem;
        ">
          <div style="border: 1px solid #FFD700; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #FFD700;">
            <b>🏆 Top 3</b> → Place in Top 3. <span style="color: #FFD700;">(+3 Points)</span>
          </div>
          <div style="border: 1px solid #C0C0C0; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #C0C0C0;">
            <b>🥈 Top 10</b> → Place in Top 10. <span style="color: #C0C0C0;">(+2 Points)</span>
          </div>
          <div style="border: 1px solid #4CAF50; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #4CAF50;">
            <b>Volume Hunter</b> → Reach 1,000+ Points. <span style="color: #4CAF50;">(+1 Point)</span>
          </div>
          <div style="border: 1px solid #FF5722; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #FF5722;">
            <b>Heavy Hitter</b> → Reach 5,000+ Points. <span style="color: #FF5722;">(+2 Points)</span>
          </div>
          <div style="border: 1px solid #2196F3; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #2196F3;">
            <b>Consistency</b> → 5+ Activity Movements. <span style="color: #2196F3;">(+1 Point)</span>
          </div>
          <div style="border: 1px solid #9C27B0; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #9C27B0;">
            <b>Ultra Consistent</b> → 20+ Activity Movements. <span style="color: #9C27B0;">(+3 Points)</span>
          </div>
          <div style="border: 1px solid #795548; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #795548;">
            <b>Daily Grinder</b> → 3+ Daily Deltas. <span style="color: #795548;">(+2 Points)</span>
          </div>
          <div style="border: 1px solid #E91E63; border-radius: 10px; padding: 0.7rem; box-shadow: 0 0 12px #E91E63;">
            <b>First Mover</b> → Active since Day 1. <span style="color: #E91E63;">(+3 Points)</span>
          </div>
        </div>
    
        <p style="margin-top: 1.2rem; font-style: italic; color: #1affd5;">
          The Badge Points Leaderboard is visible in the "Badge-Points Leaderboard" tab.
        </p>
      </div>
    `;

    setActiveTab('tab-instructions');
    document.getElementById('tab-instructions').click();
  });

  document.getElementById('tab-leaderboard').addEventListener('click', async () => {
    document.getElementById('lp-content').innerHTML = `<div class="loading">Loading LP League data...</div>`;
    setActiveTab('tab-leaderboard');
    await loadLpLeagueData(userId, usx_token, wax_account);
  });
  
  document.getElementById('tab-badges').addEventListener('click', () => {
    document.getElementById('lp-content').innerHTML = `<div class="loading">Loading Badge-Points Leaderboard...</div>`;
    setActiveTab('tab-badges');
    displayBadgePointsLeaderboard(originalData);
  });
}
function displayBadgePointsLeaderboard(data) {
  const container = document.getElementById('lp-content');

  const badgePointsMap = {
    'Top 3': 3,
    'Top 10': 2,
    'Volume Hunter': 2,
    'Heavy Hitter': 3,
    'Consistency': 1,
    'Ultra Consistent': 2,
    'Daily Grinder': 2,
    'First Mover': 1
  };

  const badgePointsData = data.map(record => {
    const totalBadgePoints = record.badges.reduce((sum, badge) => {
      return sum + (badgePointsMap[badge] || 0);
    }, 0);

    return {
      username: record.username,
      totalBadgePoints,
      badges: record.badges
    };
  });

  badgePointsData.sort((a, b) => b.totalBadgePoints - a.totalBadgePoints);

  const prizeMap = {
    1: '1,000,000 $CHIPS',
    2: '500,000 $CHIPS',
    3: '300,000 $CHIPS',
    4: '150,000 $CHIPS',
    5: '50,000 $CHIPS'
  };

  container.innerHTML = `
    <div style="
      font-family: 'Papyrus', 'Courier New', cursive;
      color: #39ff14;
      text-shadow: 0 0 3px #00ffcc, 0 0 7px #00ffcc;
      padding: 1.5rem;
      border: 2px solid #00ffcc;
      border-radius: 14px;
      box-shadow: 0 0 20px #00ffcc, 0 0 40px #ff00ff;
      animation: fade-slide 1s ease-in-out;
      background: rgba(0, 0, 0, 0.6);
      max-width: 1000px;
      margin: 0 auto;
    ">
      <h3 style="
        font-size: 1.6rem;
        color: #FFD700;
        text-shadow: 0 0 5px #FFD700, 0 0 15px #FFE600;
        animation: glow-pulse 2s infinite;
        text-align: center;
        margin-bottom: 1.5rem;
      ">Badge Points Leaderboard</h3>

      <table class="reward-table badge-points-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: rgba(0,255,255,0.1);">
            <th style="padding: 8px; border-bottom: 2px solid #00ffcc;">#</th>
            <th style="padding: 8px; border-bottom: 2px solid #00ffcc;">Username</th>
            <th style="padding: 8px; border-bottom: 2px solid #00ffcc;">Badge Points</th>
            <th style="padding: 8px; border-bottom: 2px solid #00ffcc;">Badges</th>
            <th style="padding: 8px; border-bottom: 2px solid #00ffcc;">Prize</th>
          </tr>
        </thead>
        <tbody>
          ${badgePointsData.map((record, index) => `
            <tr class="${index < 5 ? 'top5-animate' : ''}" style="
              text-align: center;
              border-bottom: 1px solid rgba(0,255,255,0.2);
              ${index < 5 ? 'font-weight:bold; color: #FFD700;' : ''}
            ">
              <td style="padding: 8px;">${index + 1}</td>
              <td style="padding: 8px;">${record.username}</td>
              <td style="padding: 8px;">${record.totalBadgePoints}</td>
              <td style="padding: 8px;">${record.badges.map(b => `
                <span class="badge-animated" style="
                  display: inline-block;
                  padding: 6px 10px;
                  margin: 3px;
                  border-radius: 12px;
                  font-size: 12px;
                  font-weight: bold;
                  color: white;
                  background-color: ${getBadgeColor(b)};
                  text-shadow: 0 0 2px #000, 0 0 5px #000;
                  animation: fadeInBadge 0.6s ease-in-out;
                  transition: transform 0.2s ease-in-out;
                " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'"
                >${b}</span>
              `).join(' ')}</td>
              <td style="padding: 8px;">
                ${prizeMap[index + 1] ? `<span style="color: #FFD700;">${prizeMap[index + 1]}</span>` : '-'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="badge-reward-glow" style="
        margin-top: 2rem;
        font-size: 1.2rem;
        font-weight: bold;
        color: #FFD700;
        text-align: center;
        animation: glowText 2s infinite;
      ">
        ✨ The Top 5 players will receive a total of 2,000,000 $CHIPS tokens as extra rewards! ✨
      </div>
    </div>
  `;
}

// Reuse your getBadgeColor function:
function getBadgeColor(badgeName) {
  switch (badgeName) {
    case 'Top 3': return '#FFD700';
    case 'Top 10': return '#C0C0C0';
    case 'Volume Hunter': return '#4CAF50';
    case 'Heavy Hitter': return '#FF5722';
    case 'Consistency': return '#2196F3';
    case 'Ultra Consistent': return '#9C27B0';
    case 'Daily Grinder': return '#795548';
    case 'First Mover': return '#E91E63';
    default: return '#607D8B';
  }
}

async function loadLpLeagueData(userId, usx_token, wax_account) {
  const container = document.getElementById('lp-content');

  try {
    const res = await fetch(`${BASE_URL}/lp_league?userId=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}&wax_account=${encodeURIComponent(wax_account)}`);

    if (!res.ok) throw new Error('Failed to fetch LP League data');

    const json = await res.json();
    const data = json.users;

    if (!Array.isArray(data) || data.length === 0) {
      container.innerHTML = '<div class="info-message">No LP League data available.</div>';
      return;
    }

    originalData = data;
    currentSort = { key: '', direction: 'asc' };

    displayLpLeagueData(data);

  } catch (err) {
    container.innerHTML = `<div class="error-message">Error: ${err.message}</div>`;
  }
}

function displayLpLeagueData(data) {
  const container = document.getElementById('lp-content');

  const getUnique = (arr, key) => [...new Set(arr.map(item => item[key]).filter(Boolean))].sort();
  const createOptions = values => `<option value="">All</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');
  const sortArrow = key => currentSort.key === key ? (currentSort.direction === 'asc' ? ' ↑' : ' ↓') : '';

  const usernames = getUnique(data, 'username');
  const topPools = getUnique(data, 'top_pool');

  container.innerHTML = `
    <div class="filter-toolbar">
      <select id="filter-username" class="filter-select">${createOptions(usernames)}</select>
      <select id="filter-pool" class="filter-select">${createOptions(topPools)}</select>
      <button id="refresh-leaderboard" class="btn btn-primary">Refresh</button>
    </div>

    <table class="reward-table">
      <thead>
        <tr>
          <th onclick="sortLpTable('rank')">#${sortArrow('rank')}</th>
          <th onclick="sortLpTable('username')">User${sortArrow('username')}</th>
          <th>Badges</th>
          <th onclick="sortLpTable('total_points')">Points${sortArrow('total_points')}</th>
          <th onclick="sortLpTable('reward')">Reward (WAX)${sortArrow('reward')}</th>
          <th onclick="sortLpTable('lp_activity_score')">Total Movements${sortArrow('lp_activity_score')}</th>
          <th>24h Movements</th>
          <th>Top Pool</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  renderLpTable(data);

  document.getElementById('filter-username').addEventListener('change', applyLpFiltersAndSort);
  document.getElementById('filter-pool').addEventListener('change', applyLpFiltersAndSort);
  document.getElementById('refresh-leaderboard').addEventListener('click', () =>
    loadLpLeagueData(window.userData.userId, window.userData.usx_token, window.userData.wax_account)
  );
}

function renderLpTable(data) {
  const tbody = document.querySelector('#lp-content tbody');
  let rows = '';
  
  const currentUser = window.userData.wax_account;
  
  data.forEach((record, index) => {
    const rowClass = index % 2 === 0 ? 'row-even' : 'row-odd';
    const isCurrentUser = record.username === currentUser;
  
    const highlightStyle = isCurrentUser ? `
      border: 3px solid gold;
      box-shadow: 0 0 20px gold;
      transform: scale(1.2);
      transition: all 0.3s ease-in-out;
      z-index: 1;
      position: relative;
    ` : '';
  
    const badgeStyle = `
      display: inline-block;
      padding: 6px 10px;
      margin: 4px 0;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
      color: red;
      text-shadow:
        -1px -1px 0 #000,
         1px -1px 0 #000,
        -1px  1px 0 #000,
         1px  1px 0 #000;
      animation: fadeIn 0.6s ease-in-out;
      text-align: center;
      width: 100%;
      box-sizing: border-box;
    `;
  
    const getBadgeColor = (badgeName) => {
      switch (badgeName) {
        case 'Top 3': return '#FFD700';
        case 'Top 10': return '#C0C0C0';
        case 'Volume Hunter': return '#4CAF50';
        case 'Heavy Hitter': return '#FF5722';
        case 'Consistency': return '#2196F3';
        case 'Ultra Consistent': return '#9C27B0';
        case 'Daily Grinder': return '#795548';
        case 'First Mover': return '#E91E63';
        default: return '#607D8B';
      }
    };
  
    const badgeDisplay = record.badges.length
      ? record.badges.map(b => `
        <span class="badge" style="${badgeStyle}; background-color: ${getBadgeColor(b)};" title="${b}">
          ${b}
        </span>
      `).join('<br>')
      : '';
  
    const topPool = record.top_pool || '';
    rows += `
      <tr class="${rowClass}" style="${highlightStyle}">
        <td>${record.rank}</td>
        <td>${record.username}</td>
        <td>${badgeDisplay}</td>
        <td>${record.total_points.toFixed(2)}</td>
        <td>${record.reward.toFixed(2)}</td>
        <td>${record.lp_activity_score}</td>
        <td>${record.daily_delta}</td>
        <td>${topPool}</td>
      </tr>
    `;
  });
  
  tbody.innerHTML = rows;

}

function applyLpFiltersAndSort() {
  const username = document.getElementById('filter-username').value;
  const pool = document.getElementById('filter-pool').value;

  let filtered = originalData.filter(record =>
    (!username || record.username === username) &&
    (!pool || record.top_pool === pool)
  );

  if (currentSort.key) {
    filtered.sort((a, b) => {
      const aVal = a[currentSort.key];
      const bVal = b[currentSort.key];

      if (typeof aVal === 'string') {
        return currentSort.direction === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }

  renderLpTable(filtered);
}

function sortLpTable(key) {
  if (currentSort.key === key) {
    currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.direction = 'asc';
  }

  applyLpFiltersAndSort();
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
    const progress = Math.min((platform.xp / platform.xp_needed) * 100, 100).toFixed(1);
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
          <button class="btn btn-secondary" id="add-template-btn">➕ Add another template</button>
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

  // 🎯 Se non trovata o non specificata, fallback
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
  const extraSelect = document.getElementById('multiExtraChannels');

  const res = await fetch(`${BASE_URL}/available_channels`);
  const data = await res.json();

  if (!data.channels || !Array.isArray(data.channels)) return;

  extraSelect.innerHTML = '';
  const selectedChannel = mainSelect.value;

  data.channels.forEach(channel => {
    if (channel !== selectedChannel) {
      const opt = document.createElement('option');
      opt.value = channel;
      opt.textContent = channel;
      extraSelect.appendChild(opt);
    }
  });
}

function updateMultiStormCostEstimation() {
  const amount = parseFloat(document.getElementById('multiAmount').value || 0);
  const count = parseInt(document.getElementById('multiCount').value || 0);
  const token = document.getElementById('multiTokenSymbol').value;
  const extraChannels = Array.from(document.getElementById('multiExtraChannels').selectedOptions).map(o => o.value);

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
          ${/* Tutto il contenuto originale di #add-storm-form (come già nel tuo codice) */''}
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
              <select id="multiExtraChannels" multiple class="input-field" style="width: 100%; height: 80px;">
                <!-- options dinamiche -->
              </select>
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
    const startTime = document.getElementById('multiStartTime').value;
    const intervalValue = document.getElementById('multiInterval').value;
    const stormCount = parseInt(document.getElementById('multiCount').value, 10);
    const amount = parseFloat(document.getElementById('multiAmount').value);
    const token = document.getElementById('multiTokenSymbol').value;
    const channel = document.getElementById('multiChannel').value;
    const paymentMethod = document.getElementById('multiPaymentMethod').value;
    const timeframe = document.getElementById('multiTimeframe').value;

    const requiredFields = [
      startTime,
      intervalValue,
      stormCount,
      amount,
      token,
      channel,
      paymentMethod,
      timeframe,
    ];
    
    const hasEmptyField = requiredFields.some(f => !f || f.toString().trim() === "");
    
    if (hasEmptyField) {
      showMultiStormFeedback("Please fill in all required fields.");
      return;
    }

    if (stormCount < 1) {
      showMultiStormFeedback("Storm count must be at least 1.");
      return;
    }

    // Funzione per convertire '15m', '2h', '1d' in millisecondi
    function intervalToMs(interval) {
      const unit = interval.slice(-1);
      const value = parseInt(interval.slice(0, -1), 10);
      const multipliers = { m: 60000, h: 3600000, d: 86400000 };
      return value * multipliers[unit] || 0;
    }
  
    const storms = [];
    const baseTime = new Date(startTime);
    const intervalMs = intervalToMs(intervalValue);
    
    const channels = [channel, ...Array.from(document.getElementById('multiExtraChannels').selectedOptions).map(o => o.value)];
    
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
 
    console.log("Generated Storms:", storms);

    try {
      const res = await fetch(`${BASE_URL}/schedule_storms_batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        loadScheduledStorms(); // Ricarica la tabella
        updateMultiStormCostEstimation();
      } else {
        const errorMsg = result.error || result.message || "Unknown error";
        showMultiStormFeedback("❌ Error: " + errorMsg, true);
      }
    } catch (err) {
      const errorMsg = result.error || result.message || "Unknown error";
      showMultiStormFeedback("❌ Error: " + errorMsg, true);
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
    <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin: 10px 0;">
      <button ${stormPag_currentPage === 1 ? 'disabled' : ''} onclick="renderStormsTable(stormPag_data, ${stormPag_currentPage - 1})">
        ◀ Previous
      </button>
      <span>Page ${stormPag_currentPage} of ${totalPages}</span>
      <button ${stormPag_currentPage === totalPages ? 'disabled' : ''} onclick="renderStormsTable(stormPag_data, ${stormPag_currentPage + 1})">
        Next ▶
      </button>
    </div>
  `;

  const topContainer = document.querySelector('#storm-pagination-top');
  const bottomContainer = document.querySelector('#storm-pagination-bottom');

  if (topContainer) topContainer.innerHTML = paginationHTML;
  if (bottomContainer) bottomContainer.innerHTML = paginationHTML;
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
 async function loadStakingPools() {
  const { userId, usx_token } = window.userData;
  const res = await fetch(`${BASE_URL}/open_pools?user_id=${userId}&usx_token=${usx_token}`);
  const data = await res.json();

  if (!data.pools || data.pools.length === 0) {
    document.getElementById('pool-buttons').innerHTML = `
      <div class="error-message">No staking pools found.</div>`;
    return;
  }

  const pools = data.pools;
  const poolButtonsContainer = document.getElementById('pool-buttons');
  const searchInput = document.getElementById('search-pools');

  window.stakingPools = pools;

  renderPoolButtons(pools);
  searchInput.addEventListener('input', () => {
    const search = searchInput.value.toLowerCase();
    const filtered = pools.filter(p =>
      p.token_symbol.toLowerCase().includes(search)
    );
    renderPoolButtons(filtered);
  });

  const defaultPool = pools.find(p => p.pool_id === 1) || pools[0];
  renderPoolDetails(defaultPool);
} function renderPoolButtons(pools) {
  const container = document.getElementById('pool-buttons');
  container.innerHTML = '';
  pools.forEach(pool => {
    const btn = document.createElement('button');
    btn.className = 'btn-action';
    btn.textContent = pool.token_symbol;
    btn.onclick = () => renderPoolDetails(pool);
    container.appendChild(btn);
  });
} function renderPoolDetails(pool) {
  const container = document.getElementById('selected-pool-details');
  const rewards = pool.rewards_info;
  const rewardsCount = rewards.length;

  // Calcolo responsive grid
  const gridClass = 'reward-grid';

  const rewardsHTML = rewards.map(r => `
    <div class="reward-box">
      <div class="reward-title">${r.reward_token}</div>
      <div><strong>Total:</strong> ${r.total_reward_deposit}</div>
      <div><strong>Daily:</strong> ${r.daily_reward}</div>
      <div><strong>APR:</strong> ${r.apr}%</div>
      <div><strong>Days Left:</strong> ${r.days_remaining}</div>
      <div class="reward-user-daily"><strong>Your Daily:</strong> ${r.user_daily_reward}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <h3 class="card-title">Pool: ${pool.token_symbol}</h3>
      <p class="label">Total Staked: <strong>${pool.total_staked}</strong></p>
      <p class="label section-space">You Staked: <strong>${pool.user_staked}</strong></p>

      <div class="btn-group section-space">
        <button class="btn btn-secondary" onclick="openStakeModal('add', ${pool.pool_id}, '${pool.token_symbol}')">Add Tokens</button>
        <button class="btn btn-secondary" onclick="openStakeModal('remove', ${pool.pool_id}, '${pool.token_symbol}')">Remove Tokens</button>
      </div>  

      <h2 class="subheading">Rewards</h2>
      <div class="${gridClass}">
        ${rewardsHTML}
      </div>
    </div>
  `;
}
function openStakeModal(type, poolId, tokenSymbol) {
  const { wax_account, userId, usx_token } = window.userData;

  let balance = 0;
  if (type === 'add') {
    const tokenData = window.walletBalances?.find(t => t.symbol === tokenSymbol);
    balance = tokenData ? parseFloat(tokenData.amount) : 0;
  } else if (type === 'remove') {
    const pool = window.stakingPools?.find(p => p.pool_id === poolId);
    balance = pool ? parseFloat(pool.user_staked || "0") : 0;
  }

  const title = type === 'add' ? 'Add Tokens to Farm' : 'Remove Tokens from Farm';
  const actionUrl = type === 'add' ? 'stake_add' : 'stake_remove';
  const availableLabel = type === 'add' ? 'Available in Wallet' : 'Staked in Farm';

  const body = `
    <p class="label">${availableLabel}: <strong>${balance.toFixed(4)}</strong> ${tokenSymbol}</p>

    <label class="label">Select %</label>
    <input id="stake-range" type="range" min="0" max="100" value="0" class="input-range">

    <label class="label">Amount</label>
    <input id="stake-amount" type="number" step="0.0001" class="input-field" value="0">

    <div id="stake-summary" class="text-muted section-space" style="margin-top: 0.5rem;"></div>

    <button class="btn btn-confirm full-width" id="stake-submit" style="margin-top: 1rem;">
      Go!
    </button>
  `;

  showModal({
    title: `<h3 class="modal-title">${title}</h3>`,
    body
  });

  setTimeout(() => {
    const range = document.getElementById('stake-range');
    const input = document.getElementById('stake-amount');
    const summary = document.getElementById('stake-summary');
    const submit = document.getElementById('stake-submit');

    function updateSummary(val) {
      let fee = 0;
      let net = val;
      if (type === 'remove') {
        fee = val * 0.0315;
        net = val - fee;
      }

      summary.innerHTML = type === 'add'
        ? `You will add <strong>${val.toFixed(4)}</strong> ${tokenSymbol}`
        : `Requested: <strong>${val.toFixed(4)}</strong> ${tokenSymbol}<br>Fee: ~<strong>${fee.toFixed(4)}</strong><br>Net Received: <strong>${net.toFixed(4)}</strong>`;
    }

    range.addEventListener('input', () => {
      const percent = parseFloat(range.value);
      const amount = parseFloat((balance * percent / 100).toFixed(4));
      input.value = amount;
      updateSummary(amount);
    });

    input.addEventListener('input', () => {
      const val = parseFloat(input.value) || 0;
      range.value = Math.min(100, Math.round((val / balance) * 100));
      updateSummary(val);
    });

    submit.onclick = async () => {
      const amount = parseFloat(input.value);
      if (!amount || amount <= 0 || amount > balance) {
        showModalMessage("Invalid input", "error");
        return;
      }

      const payload = {
        user_id: userId,
        pool_id: poolId,
        token_symbol: tokenSymbol,
        wax_account,
        amount
      };

      try {
        const res = await fetch(`${BASE_URL}/${actionUrl}?user_id=${userId}&usx_token=${usx_token}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Unknown error");

        showModalMessage(
          "✅ Your staking position has been updated successfully.<br>You can close this window now, or it will close automatically in 10 seconds.",
          "success"
        );
        
        setTimeout(() => {
          closeModal();
          loadWallet();
          loadStakingPools();
        }, 10000); // chiude dopo 10 secondi
      } catch (err) {
        console.error(err);
        showModalMessage(
          `❌ ${err.message || 'An unexpected error occurred.'}<br>You can close this window now, or it will close automatically in 10 seconds.`,
          "error"
        );
      
        setTimeout(() => {
          closeModal();
        }, 10000);
      }
    };
  }, 0);
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

async function loadWallet() {
  try {
    const { userId, usx_token, wax_account } = window.userData;
    // Carica Telegram
    const resTelegram = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const dataTelegram = await resTelegram.json();
    window.walletBalances = dataTelegram.balances || [];

    // Carica Twitch
    const resTwitch = await fetch(`${BASE_URL}/saldo/twitch?user_id=${userId}&usx_token=${usx_token}&wax_account=${wax_account}`);
    const dataTwitch = await resTwitch.json();
    window.twitchWalletBalances = dataTwitch.balances || [];

    const walletTable = document.getElementById('wallet-table');
    if (!walletTable) {
      console.warn("[⚠️] wallet-table non trovato nel DOM.");
      return;
    }

    // Pulsanti wallet selector animati
    walletTable.innerHTML = `
      <div class="wallet-switch-container">
        <button class="wallet-switch twitch-btn" data-wallet="twitch"
          style="font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          🎮 Twitch Wallet
        </button>
        
        <button class="wallet-switch telegram-btn" data-wallet="telegram"
          style="font-weight: bold; text-shadow: -1px -1px 0 red, 1px -1px 0 red, -1px 1px 0 red, 1px 1px 0 red;">
          🤖 Telegram Wallet
        </button>

      </div>

      <div style="text-align: center;">
        <div style="display: inline-block; text-align: left; margin-top: 1rem;">
          <p style="
            font-family: 'Rock Salt', cursive;
            text-transform: uppercase;
            font-size: 1rem;
            color: #00f0ff;
            margin: 0.25rem 0;
            text-shadow: 0 0 6px #00f0ff;
          ">
            Stake your tokens to let them work for you — easy gains, zero stress.
          </p>
          <p style="
            font-family: 'Rock Salt', cursive;
            text-transform: uppercase;
            font-size: 1rem;
            color: #ff00ff;
            margin: 0.25rem 0;
            text-shadow: 0 0 6px #ff00ff;
          ">
            Withdraw your assets whenever you want. It's your crypto, your rules.
          </p>
          <p style="
            font-family: 'Rock Salt', cursive;
            text-transform: uppercase;
            font-size: 1rem;
            color: #00ff44;
            margin: 0.25rem 0;
            text-shadow: 0 0 6px #00ff44;
          ">
            Swap tokens like a pro — fast, fair, and frictionless.
          </p>
          <p style="
            font-family: 'Rock Salt', cursive;
            text-transform: uppercase;
            font-size: 1rem;
            color: #ffa500;
            margin: 0.25rem 0;
            text-shadow: 0 0 6px #ffa500;
          ">
            Transfer tokens to friends or alt accounts in a blink.
          </p>
          <p style="
            font-family: 'Rock Salt', cursive;
            text-transform: uppercase;
            font-size: 1rem;
            color: #ffe600;
            margin: 0.25rem 0;
            text-shadow: 0 0 6px #ffe600;
            position: relative;
            border-right: 2px solid #ffe600;
            white-space: nowrap;
            overflow: hidden;
            animation: typing 3.5s steps(50, end), blink 1s step-end infinite;
          ">
            Transfer tokens between your wallets using the built-in Bridge. It's seamless, secure, and slick.
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
        </div>
      </div>
      <div id="wallet-content"></div>
    `;

    document.querySelectorAll('.wallet-switch').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-wallet');
        renderWalletTable(type);
      });
    });

  } catch (error) {
    console.error("[❌] Error loading wallets:", error);
  }
}

function renderWalletTable(type) {
  const balances = type === 'twitch' ? window.twitchWalletBalances : window.walletBalances;
  const container = document.getElementById('wallet-content');

  if (!balances || balances.length === 0) {
    container.innerHTML = `<div class="empty-state">No balances for ${type} wallet.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="wallet-table-container">
      <table class="wallet-table card small">
        <thead class="thead">
          <tr>
            <th class="cell">Token</th>
            <th class="cell">Amount</th>
            <th class="cell">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${balances.map(token => `
            <tr class="row-border">
              <td class="cell strong">${token.symbol}</td>
              <td class="cell">${token.amount}</td>
              <td class="cell">
                <div class="btn-group">
                  <button class="btn-action" data-action="withdraw" data-token="${token.symbol}" data-wallet="${type}">Withdraw</button>
                  <button class="btn-action" data-action="swap" data-token="${token.symbol}" data-wallet="${type}">Swap</button>
                  <button class="btn-action" data-action="transfer" data-token="${token.symbol}" data-wallet="${type}">Transfer</button>
                  <button class="btn-action" data-action="bridge_to" data-token="${token.symbol}" data-wallet="${type}">
                    🔁 Move to ${type === 'twitch' ? 'Telegram' : 'Twitch'}
                  </button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  // 🔧 CORRETTO: Rimozione doppia dichiarazione di `walletType`
  document.querySelectorAll('[data-action]').forEach(btn => {
    const action = btn.getAttribute('data-action');
    const token = btn.getAttribute('data-token');
    const walletType = btn.getAttribute('data-wallet') || 'telegram';
    btn.addEventListener('click', () => {
      openModal(action, token, walletType);
    });
  });
}
 
async function loadNFTs() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/mynfts?user_id=${userId}&usx_token=${usx_token}`);
    const nftsData = await response.json();

    window.nftsData = nftsData.nfts || [];
    console.info("[🔵] NFTs caricati:", window.nftsData.length);

    populateDropdowns(window.nftsData);
    renderNFTs();
    setupFilterEvents();
  } catch (error) {
    console.error("[❌] Errore caricando NFTs:", error);
    document.getElementById('nfts-loading').innerText = "❌ Error loading NFTs.";
  }
}

function populateDropdowns(nfts) {
  const collections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];
  const collectionSelect = document.getElementById('filter-collection');
  collectionSelect.innerHTML += collections.sort().map(c => `<option value="${c}">${c}</option>`).join('');
} 

function populateCollectionFilter(nfts) {
  const filterCollection = document.getElementById('filter-collection');
  const collections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];
  filterCollection.innerHTML += collections.sort().map(col => `<option value="${col}">${col}</option>`).join('');
} 

function renderNFTs() {
  const nftsList = document.getElementById('nfts-list');
  const loading = document.getElementById('nfts-loading');
  const count = document.getElementById('nfts-count');
  loading.classList.add('hidden');

  let filtered = [...window.nftsData];
  const search = document.getElementById('search-template').value.toLowerCase();
  if (search) {
    filtered = filtered.filter(nft =>
      nft.template_info.template_name.toLowerCase().includes(search)
    );
  }

  const status = document.getElementById('filter-status').value;
  const stakable = document.getElementById('filter-stakable').value;
  const forSale = document.getElementById('filter-for-sale').value;
  const collection = document.getElementById('filter-collection').value;

  if (status) filtered = filtered.filter(nft => nft.is_staked === status);
  if (status !== "Staked" && stakable) {
    filtered = filtered.filter(nft => nft.is_stakable === stakable);
  }
  if (forSale) filtered = filtered.filter(nft => nft.for_sale === forSale);
  if (collection) filtered = filtered.filter(nft =>
    nft.template_info.collection_name === collection
  );

  const sort = document.getElementById('sort-by').value;
  if (sort === "created_at_desc") {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === "created_at_asc") {
    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sort === "template_name_asc") {
    filtered.sort((a, b) =>
      a.template_info.template_name.localeCompare(b.template_info.template_name)
    );
  } else if (sort === "template_name_desc") {
    filtered.sort((a, b) =>
      b.template_info.template_name.localeCompare(a.template_info.template_name)
    );
  }

  count.innerText = `${filtered.length} NFTs found`;

  const totalPages = Math.ceil(filtered.length / window.nftsPerPage);
  if (window.currentPage > totalPages) window.currentPage = totalPages || 1;

  const start = (window.currentPage - 1) * window.nftsPerPage;
  const end = start + window.nftsPerPage;
  const pageNFTs = filtered.slice(start, end);

  if (pageNFTs.length > 0) {
    nftsList.innerHTML = pageNFTs.map(nft => `
      <div class="card card-hover nft-card">
        <input 
          type="checkbox" 
          class="nft-checkbox" 
          onclick="toggleNFTSelection(event, '${nft.asset_id}')" 
          ${window.selectedNFTs.has(nft.asset_id) ? "checked" : ""}>

        <div onclick="openNFTModal('${nft.asset_id}')" class="nft-card-content">
          ${nft.image_url ? `
            <img 
              src="${nft.image_url}" 
              alt="NFT Image" 
              class="nft-image" 
              onerror="handleNFTImageError(this)">
          ` : nft.video_url ? `
            <video 
              src="${nft.video_url}" 
              class="nft-video" 
              controls 
              autoplay 
              muted 
              loop 
              playsinline 
              onerror="handleNFTImageError(this)">
              Il tuo browser non supporta i video.
            </video>
          ` : `
            <img 
              src="fallback.jpg" 
              alt="Fallback NFT" 
              class="nft-image">
          `}
          <h3 class="nft-title">${nft.template_info.template_name}</h3>
          <p class="nft-subtitle"><strong>Asset ID:</strong> #${nft.asset_id}</p>
          <p class="nft-subtitle"><strong>NFT ID:</strong> ${nft.nft_id}</p>
        </div>
      </div>
    `).join('');
  } else {
    nftsList.innerHTML = `<div class="empty-state">No NFTs in your wallet match the filters.</div>`;
  }

  renderPagination(totalPages);
  updateBulkActions();
}

 function toggleNFTSelection(event, assetId) {
  event.stopPropagation(); // Evita che clicchi anche la card
  if (event.target.checked) {
    window.selectedNFTs.add(assetId);
  } else {
    window.selectedNFTs.delete(assetId);
  }
  updateBulkActions();
}

function updateBulkActions() {
  const bulk = document.getElementById('bulk-actions');
  
  if (window.selectedNFTs && window.selectedNFTs.size > 0) {
    bulk.classList.remove('hidden');
  } else {
    bulk.classList.add('hidden');
  }
} function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <button onclick="changePage(window.currentPage - 1)" 
            class="btn-pagination" 
            ${window.currentPage === 1 ? "disabled" : ""}>Previous</button>
    <span class="pagination-info">${window.currentPage} / ${totalPages}</span>
    <button onclick="changePage(window.currentPage + 1)" 
            class="btn-pagination" 
            ${window.currentPage === totalPages ? "disabled" : ""}>Next</button>
  `;
}

function changePage(newPage) {
  if (newPage < 1) newPage = 1;
  const totalPages = Math.ceil(window.nftsData.length / window.nftsPerPage);
  if (newPage > totalPages) newPage = totalPages;
  window.currentPage = newPage;
  renderNFTs();
}

function openNFTModal(assetId) {
  const nft = window.nftsData.find(n => n.asset_id === assetId);
  if (!nft) return;

  const modal = document.getElementById('modal-nft');
  const modalContent = modal.querySelector('#modal-content');

  modalContent.innerHTML = `
    <img src="${nft.image_url}" alt="NFT Image"
         style="max-height:150px; width:auto; display:block; margin:0 auto 1rem; opacity:0; transition:opacity 3s ease-in;" 
         onload="this.style.opacity='1'">
    <h2 class="modal-title">${nft.template_info.template_name}</h2>
    <p class="nft-subtitle"><strong>NFT ID:</strong>${nft.nft_id}</p>
    <p class="nft-detail"><strong>Asset ID:</strong> ${nft.asset_id}</p>
    <p class="nft-detail"><strong>Collection:</strong> ${nft.template_info.collection_name}</p>
    <p class="nft-detail"><strong>Schema:</strong> ${nft.template_info.schema_name}</p>
    <p class="nft-detail"><strong>Stakable?</strong> ${nft.is_stakable}</p>
    <p class="nft-detail"><strong>Staked?</strong> ${nft.is_staked}</p>
    <p class="nft-detail"><strong>On Sale?</strong> ${nft.for_sale}</p>
    <p class="nft-detail"><strong>Transferable?</strong> ${nft.template_info.is_transferable ? "Yes" : "No"}</p>
    <p class="nft-subtext">Acquired at: ${new Date(nft.created_at).toLocaleDateString()}</p>
  `;

  // Mostra la modale NFT
  modal.classList.remove('hidden');

  // Gestione bottone ×
  const closeBtn = modal.querySelector('.modal-close');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.classList.add('hidden');
    };
  }
}
 function setupFilterEvents() {
  document.getElementById('filter-status').addEventListener('change', renderNFTs);
  document.getElementById('filter-collection').addEventListener('change', renderNFTs);
  document.getElementById('sort-by').addEventListener('change', renderNFTs);
  document.getElementById('filter-stakable').addEventListener('change', renderNFTs);
  document.getElementById('filter-for-sale').addEventListener('change', renderNFTs);
  document.getElementById('search-template').addEventListener('input', renderNFTs);
  document.getElementById('bulk-withdraw').addEventListener('click', bulkWithdrawSelected);
  document.getElementById('bulk-send').addEventListener('click', bulkSendSelected);  
} async function bulkWithdrawSelected() {
  if (window.selectedNFTs.size === 0) return;

  showConfirmModal(`Withdraw ${window.selectedNFTs.size} selected NFTs?`, async () => {
    const selectedIds = Array.from(window.selectedNFTs);
    const { userId, usx_token, wax_account } = window.userData;
    const endpoint = `${BASE_URL}/withdraw_nft_v2?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
    const modalBody = document.querySelector('#universal-modal .modal-body');
    modalBody.innerHTML = `<p class="modal-text">Processing withdrawal of ${selectedIds.length} NFTs...</p>`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          wax_account: wax_account,
          asset_ids: selectedIds
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[❌] Errore server:", data.error || "Unknown error");
        modalBody.innerHTML = `
          <p class="modal-text text-danger">❌ Error withdrawing NFTs:</p>
          <p>${data.error || 'Unknown error'}</p>
          <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
        `;
        return;
      }

      // ✅ Successo: mostra bottone che gestisce chiusura e aggiornamento
      modalBody.innerHTML = `
        <p class="modal-text text-success">✅ Successfully withdrawn ${selectedIds.length} NFTs</p>
        <button class="btn btn-primary mt-medium" id="close-withdraw-success">Thanks, mate!</button>
      `;
      document.getElementById('close-withdraw-success').onclick = async () => {
        closeModal();
        window.selectedNFTs.clear();
        await loadNFTs();
      };

    } catch (error) {
      console.error("[❌] Errore rete:", error);
      modalBody.innerHTML = `
        <p class="modal-text text-danger">❌ Network or server error during NFT withdraw</p>
        <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
      `;
    }
  });
}

async function bulkSendSelected() {
  if (window.selectedNFTs.size === 0) return;

  const selectedIds = Array.from(window.selectedNFTs);

  const body = `
    <p>⚡ You are about to transfer these NFTs:</p>
    <p style="font-size: 0.9rem; word-break: break-all;">${selectedIds.join(", ")}</p>
    <label class="form-label mt-medium">Enter receiver's WAX account:</label>
    <input type="text" id="receiver-account" class="form-input" placeholder="e.g. receiver.wam">
    <div class="modal-actions mt-medium">
      <button class="btn btn-secondary" id="cancel-transfer">Cancel</button>
      <button class="btn btn-primary" id="confirm-receiver">Continue</button>
    </div>
  `;

  showModal({
    title: `<h3 class="modal-title">Send Selected NFTs</h3>`,
    body
  });

  setTimeout(() => {
    document.getElementById('cancel-transfer').onclick = () => closeModal();

    document.getElementById('confirm-receiver').onclick = () => {
      const receiver = document.getElementById('receiver-account').value.trim();

      if (!receiver) {
        const modalBody = document.querySelector('#universal-modal .modal-body');
        modalBody.insertAdjacentHTML('beforeend', `<p class="text-danger mt-small">❌ You must enter a valid WAX account.</p>`);
        return;
      }

      const confirmBody = `
        <p>You are about to transfer <strong>${selectedIds.length}</strong> NFTs to <strong>${receiver}</strong>.</p>
        <div class="modal-actions mt-medium">
          <button class="btn btn-secondary" id="cancel-final">Cancel</button>
          <button class="btn btn-danger" id="confirm-send">Confirm & Send</button>
        </div>
      `;

      showModal({
        title: `<h3 class="modal-title">Confirm Transfer</h3>`,
        body: confirmBody
      });

      setTimeout(() => {
        document.getElementById('cancel-final').onclick = () => closeModal();

        document.getElementById('confirm-send').onclick = async () => {
          const { userId, usx_token, wax_account } = window.userData;
          const endpoint = `${BASE_URL}/transfer_nfts?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
          const bodyData = { wax_account, asset_ids: selectedIds, receiver };

          const modalBody = document.querySelector('#universal-modal .modal-body');
          modalBody.innerHTML = `<p>🔄 Sending NFTs to <strong>${receiver}</strong>...</p>`;

          try {
            const response = await fetch(endpoint, {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify(bodyData)
            });

            const data = await response.json();

            if (!response.ok || data.error) {
              console.error("[❌] Transfer error:", data.error || "Unknown error");
              modalBody.innerHTML = `
                <p class="text-danger">❌ Transfer failed:</p>
                <p>${data.error || "Unknown error"}</p>
                <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
              `;
              return;
            }

            // ✅ Mostra il messaggio di successo con bottone "OK" che gestisce pulizia e aggiornamento
            modalBody.innerHTML = `
              <p class="text-success">✅ Successfully transferred ${selectedIds.length} NFTs to <strong>${receiver}</strong></p>
              <button class="btn btn-primary mt-medium" id="close-send-success">OK</button>
            `;

            document.getElementById('close-send-success').onclick = async () => {
              closeModal();
              window.selectedNFTs.clear();
              updateBulkActions();
              await loadNFTs();
            };

          } catch (error) {
            console.error("[❌] Network error:", error);
            modalBody.innerHTML = `
              <p class="text-danger">❌ Network or server error during transfer.</p>
              <button class="btn btn-secondary mt-medium" onclick="closeModal()">Close</button>
            `;
          }
        };
      }, 0);
    };
  }, 0);
} 

async function openModal(action, token, walletType = 'telegram') {
  let selectedTokenSymbol = null;
  let selectedTokenContract = null;   
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);
  const balances = walletType === 'twitch' ? window.twitchWalletBalances : window.walletBalances;
  const tokenInfo = balances.find(t => t.symbol === token);
  const balance = tokenInfo ? parseFloat(tokenInfo.amount) : 0;
  let contractIn = "";
  if (action === "swap") {
    const match = availableTokens.find(t => t.split("-")[0].toLowerCase() === token.toLowerCase());
    contractIn = match ? match.split("-")[1] : "";
  }

  if (action === "swap") {
    const title = action === 'swap' ? `Swap ${token}` : `${actionTitle} ${token}`;
    const body = `
      <h3 class="modal-title">Swap ${token}</h3>
      <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>
      <form id="action-form" class="form-wrapper">
        <div class="form-field">
          <label>Percentage</label>
          <input type="range" id="percent-range" class="input-range" min="0" max="100" value="0">
        </div>
        <div class="form-field">
          <label>Amount to Swap</label>
          <input type="number" id="amount" class="input-box" required min="0.0001" step="0.0001">
        </div>
        <div class="form-field">
          <label>Choose Output Token</label>
          <input type="text" id="token-search" class="input-box" placeholder="Search token...">
          <ul id="token-suggestions" class="token-suggestions"></ul>
        </div>
        
        <!-- Aggiungi questi 2 hidden per tener traccia del token scelto -->
        <input type="hidden" id="selected-token-symbol">
        <input type="hidden" id="selected-token-contract">

        <div id="swap-preview" class="swap-preview hidden">
          <div id="loading-spinner">🔄 Getting blockchain data...</div>
          <div id="swap-data" class="hidden">
            <div>Min Received: <span id="min-received" class="highlight"></span></div>
            <div>Price Impact: <span id="price-impact" class="highlight"></span>%</div>
          </div>
        </div>
        <button type="button" id="preview-button" class="btn btn-warning">Preview Swap</button>
        <button type="submit" id="submit-button" class="btn btn-success" disabled>Confirm Swap</button>
      </form>
    `; 
    showModal({ title: `<h3 class="modal-title">${title}</h3>`, body });
    await loadAvailableTokens();
  }
    else if (action === "bridge_to") {
      const targetWallet = walletType === 'twitch' ? 'telegram' : 'twitch';
      const title = `Bridge ${token} → ${targetWallet.charAt(0).toUpperCase() + targetWallet.slice(1)}`;
      const body = `
        <h3 class="modal-title">${title}</h3>
        <div class="text-muted">From: <strong>${walletType}</strong> | To: <strong>${targetWallet}</strong></div>
        <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>
        <form id="action-form" class="form-wrapper">
          <div class="form-field">
            <div class="form-field">
              <label>Percentage</label>
              <input type="range" id="percent-range" class="input-range" min="0" max="100" value="0">
            </div>          
            <label>Amount to Transfer</label>
            <input id="amount" type="number" step="0.0001" class="input-box" required>
          </div>
          <button id="submit-button" type="submit" class="btn btn-glow">Bridge Now</button>
        </form>
      `;
      showModal({ title: `<h3 class="modal-title">${title}</h3>`, body });
    }
  
  else {
    const title = action === 'swap' ? `Swap ${token}` : `${actionTitle} ${token}`;
    const body = `<h3 class="modal-title">${actionTitle} ${token}</h3>
      <div class="text-muted">Available: <strong>${balance}</strong> ${token}</div>
      ${action === 'transfer' ? `
        <div class="form-field">
          <label>Recipient Wax Account</label>
          <input type="text" id="receiver" class="input-box" placeholder="Enter destination wax_account" required>
        </div>` : `
        <div class="text-muted">Destination: <strong>${window.userData.wax_account}</strong></div>`}
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
  const percentRange = document.getElementById('percent-range');
  const amountInput = document.getElementById('amount');
  const submitButton = document.getElementById('submit-button');
  // Handlers comuni
  const range = document.getElementById('percent-range');
  const input = document.getElementById('amount');
  range.addEventListener('input', () => {
    const percent = parseFloat(range.value);
    input.value = (balance * percent / 100).toFixed(4);
  });
  input.addEventListener('input', () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      range.value = Math.min(100, Math.round((val / balance) * 100));
    }
  });

  // SWAP logic
  if (action === "swap") {
    const tokenSearch = document.getElementById('token-search');
    const tokenSuggestions = document.getElementById('token-suggestions');
    selectedTokenSymbol = document.getElementById('selected-token-symbol');
    selectedTokenContract = document.getElementById('selected-token-contract');
    const previewButton = document.getElementById('preview-button');
    const submitButton = document.getElementById('submit-button');
    const swapPreview = document.getElementById('swap-preview');
    const loadingSpinner = document.getElementById('loading-spinner');
    const swapDataContainer = document.getElementById('swap-data');
    const minReceivedSpan = document.getElementById('min-received');
    const priceImpactSpan = document.getElementById('price-impact');
    const availableTokensDetailed = availableTokens.map(t => {
      const [symbol, contract] = t.split("-");
      return { symbol, contract };
    });

      tokenSearch.addEventListener('input', () => {
        const search = tokenSearch.value.toLowerCase();
        const filtered = availableTokensDetailed.filter(t =>
          t.symbol.toLowerCase().includes(search)  // ← SOLO simbolo
        );
    
      tokenSuggestions.innerHTML = filtered.map(t => `
        <li class="token-suggestion-item" data-symbol="${t.symbol}" data-contract="${t.contract}">
          <strong>${t.symbol}</strong> — <small>${t.contract}</small>
        </li>
      `).join('');
    });
    
    tokenSuggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.token-suggestion-item');
      if (!item) return;
      const symbol = item.getAttribute('data-symbol');
      const contract = item.getAttribute('data-contract');
    
      tokenSearch.value = `${symbol} - ${contract}`;
      selectedTokenSymbol.value = symbol;
      selectedTokenContract.value = contract;
      
      tokenSuggestions.innerHTML = ''; // chiudi la lista
    });

    previewButton.addEventListener('click', async () => {
      
      const amount = parseFloat(input.value);
    
      const symbolOut = selectedTokenSymbol.value;
      const contractOut = selectedTokenContract.value;
      
      if (!amount || amount <= 0 || !symbolOut || !contractOut) {
        alert("Insert valid amount and output token");
        return;
      }
      const symbolIn = token.toLowerCase();
      const contractInLower = contractIn.toLowerCase();
    
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
    
      try {
        const response = await fetch(previewUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(bodyData)
        });
    
        const data = await response.json();   
        const minReceived = (data.minReceived || 0) * 0.9;
        minReceivedSpan.textContent = minReceived.toFixed(4);
        priceImpactSpan.textContent = data.priceImpact || "-";
    
        loadingSpinner.classList.add('hidden');
        swapDataContainer.classList.remove('hidden');
        submitButton.disabled = false;
    
      } catch (err) {
        console.error("Swap preview error:", err);
        loadingSpinner.innerHTML = `<div class="text-error">⚠️ Failed to load preview data.</div>`;
        submitButton.disabled = true;
      }
    });
  }
  // Percentuale su amount
  percentRange.addEventListener('input', () => {
    const percent = parseFloat(percentRange.value);
    amountInput.value = ((balance * percent) / 100).toFixed(4);
  });

  amountInput.addEventListener('input', () => {
    const manualAmount = parseFloat(amountInput.value);
    percentRange.value = Math.min(((manualAmount / balance) * 100).toFixed(0), 100);
  });

  document.getElementById('action-form').onsubmit = async (e) => {
    e.preventDefault();
    const amount = amountInput.value; 
    try {
      if (action === "swap") {               
        const symbolOut = selectedTokenSymbol.value;
        const contractOut = selectedTokenContract.value;
        await executeAction(action, token, amount, symbolOut, contractOut, walletType);
      } else {
        await executeAction(action, token, amount, null, null, walletType);
      }
      showModalMessage(`✅ ${actionTitle} completed successfully. Page will autoreload in 5 seconds`, 'success'); 
      // Puoi ritardare la chiusura per far vedere il messaggio, se vuoi
      setTimeout(() => {
        closeModal();
        loadWallet();
      }, 5000);
  
    } catch (error) {
      console.error(error);
      showModalMessage(`❌ Error during ${actionTitle}`, 'error');
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
async function executeAction(action, token, amount, tokenOut = null, contractOut = null, walletType = "telegram") {
  let tokenOutput = null;
  // Verifica se userId e wax_account sono presenti in window.userData
  if (!window.userData || !window.userData.userId || !window.userData.wax_account) {
    console.error("[❌] userId o wax_account non trovato in window.userData. Assicurati che i dati siano caricati prima di eseguire l'azione.");
    return; // Interrompe l'esecuzione se userId o wax_account non sono presenti
  }

  const { userId, usx_token, wax_account } = window.userData;
  console.info(`User ID: ${userId} | USX Token: ${usx_token} | WAX Account: ${wax_account}`);

  let endpoint = "";

  if (action === "withdraw") {
    endpoint = `${BASE_URL}/withdraw`;
  } else if (action === "swap") {
    endpoint = `${BASE_URL}/swap_tokens`;
  } else if (action === "transfer") {
    endpoint = `${BASE_URL}/transfer`;
  } else if (action === "stake") {
    endpoint = `${BASE_URL}/stake_add`;  // Usa /stake_add per l'azione "stake"
  }
  else if (action === "bridge_to") {
    endpoint = `${BASE_URL}/bridge_token`;
  }
  // Aggiungiamo user_id e usx_token all'URL
  const fullUrl = `${endpoint}?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
  console.info(`[📤] Eseguo azione ${action} chiamando: ${fullUrl}`);

  let response;
  let data;

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
      if (!receiver) {
        throw new Error("Recipient Wax Account is required for transfer.");
      }
      bodyData.receiver = receiver;
    } else if (action === "stake") {
      // Assicurati che i dati delle pools siano caricati prima di eseguire l'azione
      if (!window.tokenPoolsData || window.tokenPoolsData.length === 0) {
        console.info("[🧰] Caricamento dati delle staking pools...");
        await fetchAndRenderTokenPools(false); // False per evitare il rendering

        // Dopo aver caricato i dati, verifica se è stato trovato il pool per il token
        if (!window.tokenPoolsData || window.tokenPoolsData.length === 0) {
          throw new Error("No staking pools data available after loading.");
        }
      }

      // Recupera il pool_id dal token selezionato
      const poolData = window.tokenPoolsData.find(pool => pool.deposit_token.symbol.toLowerCase() === token.toLowerCase());
      
      if (!poolData) {
        throw new Error(`No staking pool found for token ${token}`);
      }

      // Aggiungi il pool_id ai dati per la richiesta di staking
      bodyData.pool_id = poolData.pool_id;  // Ottieni il pool_id dalla pool trovata
      console.info(`[📤] Pool ID per ${token}: ${poolData.pool_id}`);
    }
    else if (action === "bridge_to") {
      bodyData = {
        wax_account: wax_account,
        token_symbol: token,
        amount: amount,
        from_wallet: walletType,
        to_wallet: walletType === "twitch" ? "telegram" : "twitch"
      };
    }
    
    const body = JSON.stringify(bodyData);
    response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: body
    });
  } catch (networkError) {
    console.error("[❌] Errore di rete:", networkError);
    throw new Error("Network error or server unreachable.");
  }

  try {
    data = await response.json();
    console.info("[🔵] Risposta server:", data);
  } catch (parseError) {
    console.error("[❌] Errore parsing JSON:", parseError);
    throw new Error("Server error: invalid response format.");
  }

  if (!response.ok) {
    console.error(`[❌] Errore HTTP ${response.status}:`, data.error || "Unknown error");
    throw new Error(data.error || `HTTP error ${response.status}`);
  }

  if (data.error) {
    console.error(`[❌] API error:`, data.error);
    throw new Error(data.error);
  }

  let feedbackText = "";
  
  if (action === "swap" && data.details) {
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
        ${details.amount} ${details.from_token} ➡️ ${details.received_amount.toFixed(4)} ${details.to_token}<br>
        <em>Price:</em> ${details.execution_price}<br>
        <em>Fee:</em> ${details.commission.toFixed(4)}
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
        <em>Fee (2%):</em> ${data.fee_applied.toFixed(4)}<br>
        <em>Received:</em> ${data.net_amount.toFixed(4)}
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
document.querySelector('#universal-modal .modal-close').addEventListener('click', closeModal);


