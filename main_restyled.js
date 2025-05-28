// Globals
window.userData = {};
window.selectedNFTs = new Set();
window.currentPage = 1;
window.nftsPerPage = 12;
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
    console.info("[✅] Tokens disponibili caricati:", availableTokens);
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

  let filtered = originalStormsData.filter(record => {
    return (
      (!channelFilter || record.channel_name === channelFilter) &&
      (!statusFilter || record.status === statusFilter) &&
      (!offeredByFilter || record.offered_by === offeredByFilter)
    );
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

// Funzione iniziale aggiornata per supportare multi-temi via CSS
async function initApp() {
  try {
    console.info("[🔍] Inizio funzione initApp...");

    console.info("[🛰️] Estrazione parametri da URL in corso...");
    const params = getUrlParams();
    console.info("[🧩] Parametri ottenuti:", params);

    if (!params.userId || !params.usx_token) {
      console.warn("[⚠️] Parametri user_id o usx_token mancanti nell'URL. Attivazione login manuale.");
      renderAuthButton(false);
      return; // NON lanciare errore: attendi login da utente
    }

    console.info("[💾] Salvando parametri in window.userData...");
    window.userData = {
      userId: params.userId,
      usx_token: params.usx_token,
      wax_account: null
    };
    console.info("[📦] window.userData attuale:", window.userData);

    console.info("[🚪] Verifica credenziali con /main_door in corso...");
    const response = await fetch(`${BASE_URL}/main_door?user_id=${encodeURIComponent(params.userId)}&usx_token=${encodeURIComponent(params.usx_token)}`);
    const data = await response.json();
    console.info("[📨] Risposta ricevuta da /main_door:", data);

    if (!data.user_id || !data.wax_account) {
      console.warn("[⚠️] Credenziali non valide o incomplete. Mostro Login.");
      renderAuthButton(false);
      return;
    }

    window.userData.wax_account = data.wax_account;
    renderAuthButton(true);
    console.info("[✅] Login effettuato correttamente. Dati utente finali:", window.userData);

    await loadAvailableTokens();
    console.info("[🧹] Caricamento prima sezione Wallet...");
    loadSection('wallet');

    console.info("[🔗] Collegamento eventi pulsanti menu...");
    document.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.target.getAttribute('data-section');
        loadSection(section);
      });
    });

    console.info("[🏁] initApp completato senza errori.");

  } catch (error) {
    console.error("[❌] Errore critico in initApp:", error);
    document.getElementById('app').innerHTML = `
      <div class="error-message centered margin-top-lg">
        Errore: ${error.message}<br>Verifica il link o rifai il login.
      </div>`;
  }
}

function renderAuthButton(isLoggedIn) {
  const container = document.getElementById('auth-button-container');
  if (!container) return;

  container.innerHTML = `
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

  document.getElementById('auth-toggle-button').onclick = () => {
    if (isLoggedIn) {
      fetch(`${BASE_URL}/logout-secure`, { method: 'POST' })
        .then(() => location.reload())
        .catch(err => alert("Errore nel logout: " + err));
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
    <label class="form-label">Username</label>
    <input type="text" id="login-username" class="form-input" placeholder="Username">

    <label class="form-label">Wallet Address</label>
    <input type="text" id="login-wallet" class="form-input" placeholder="Wallet Address">

    <label class="form-label">Auth Token</label>
    <input type="text" id="login-token" class="form-input" placeholder="Auth Token">

    <button class="btn btn-primary" id="submit-login" style="margin-top: 1rem;">Submit</button>
  `;

  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.classList.add('modal-open');

  document.getElementById('submit-login').onclick = async () => {
    const username = document.getElementById('login-username').value.trim();
    const wallet = document.getElementById('login-wallet').value.trim();
    const token = document.getElementById('login-token').value.trim();

    try {
      const res = await fetch(`${BASE_URL}/login-secure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, wallet, token })
      });

      const data = await res.json();
      if (!data.user_id || !data.usx_token || !data.wax_account) throw new Error("Login fallito");

      // Reindirizza con nuovi parametri
      const url = new URL(window.location.href);
      url.searchParams.set('user_id', data.user_id);
      url.searchParams.set('usx_token', data.usx_token);
      window.location.href = url.toString();

    } catch (err) {
      alert("Login fallito: " + err.message);
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

async function loadCreateTokenStaking() {
  const container = document.getElementById('create-token-pool-container');
  console.log("[📦] Contenitore trovato:", container);

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

  console.log("[🖊️] Aggiornamento contenuto del contenitore con HTML dinamico");

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
    console.log("[📥] Data received from backend:", data);
    console.log("[🧪] Controllo data.pools:", data?.pools);

    if (!container) {
      console.warn("[⚠️] Container 'token-pool-details' non trovato, solo i dati vengono recuperati.");
      window.tokenPoolsData = data.pools;
      return;
    }

    if (shouldRender) {
      if (!res.ok || !data.pools) {
        container.innerHTML = `<div class="empty-message">No token staking pools found.</div>`;
        return;
      }

      window.tokenPoolsData = data.pools;
      console.log("[📦] window.tokenPoolsData assegnato:", window.tokenPoolsData);
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

  console.log("[🧩] Rendering pool buttons. Pools disponibili:", pools);

  function renderButtons(list) {
    container.innerHTML = '';
    list.forEach(pool => {
      const btn = document.createElement('button');
      btn.className = 'token-pool-btn';
      btn.textContent = pool.deposit_token?.symbol || 'Unknown';
      btn.onclick = () => renderTokenPoolDetails(pool);
      container.appendChild(btn);
      console.log("[🔘] Pool trovata:", pool);
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
  console.log("[👁️‍🗨️] Mostrando dettagli per pool:", pool);
  console.log("[🎁] Rewards nella pool:", pool.rewards);

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
  console.log("[✏️] Edit Daily Reward - Parametri:", {
    poolId,
    tokenSymbol,
    currentReward,
    depositTokenSymbol
  });

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

  console.log("[💰] Apri modale deposito:", {
    poolId,
    tokenSymbol,
    balance
  });

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
  console.log("[⚙️] Aprendo modale status pool:", { poolId, currentStatus });

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
    
      console.log("[🔁] Aggiornamento status pool:", {
        poolId,
        from: currentStatus,
        to: newStatus
      });
    
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
function loadSection(section) {
  console.log(`[📦] Caricando sezione: ${section}`);
  const app = document.getElementById('app');

  if (section === 'c2e-twitch') {
    app.innerHTML = `
      <div class="section-container">
        <h2 class="section-title text-center">C2E - Twitch</h2>
        <div class="c2e-menu">
          <button class="c2e-menu-btn" data-menu="log-reward-activity">Log Reward Activity</button>
          <button class="c2e-menu-btn" data-menu="log-storms-giveaways">Twitch Storms</button>
          <button class="c2e-menu-btn" data-menu="twitch-nfts-giveaways">Twitch NFTs Giveaways(NEW!)</button>
          <button class="c2e-menu-btn" data-menu="twitch-game">Twitch Game(!soon!)</button>
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
          <div id="wallet-table">Caricamento Wallet...</div>
        </div>
      `;
    loadWallet();
  } else if (section === 'nfts') {
    app.innerHTML = `
    <div class="section-container">
      <h2 class="section-title">My NFTs</h2>

      <div class="filters-group">
        <input type="text" id="search-template" placeholder="Search by Template Name..." class="form-input">

        <select id="filter-status" class="form-select">
          <option value="">All</option>
          <option value="Staked">Staked</option>
          <option value="Not Staked">Not Staked</option>
        </select>

        <select id="filter-stakable" class="form-select">
          <option value="">All</option>
          <option value="Stakable">Stakable</option>
          <option value="Not Stakable">Not Stakable</option>
        </select>

        <select id="filter-for-sale" class="form-select">
          <option value="">All</option>
          <option value="Yes">For Sale</option>
          <option value="No">Not For Sale</option>
        </select>

        <select id="filter-collection" class="form-select">
          <option value="">All</option>
        </select>

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
    console.log("[🧪] Entrato in blocco token-staking");
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
  }
  else if (section === 'account') {
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
        Section not fully implemented yet — but why not peek behind the scenes?
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
          <div class="typing-text">⌛ Loading blockchain data... please wait</div>
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
            <summary class="section-title2">🎟️ Telegram Passes</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeiaqwjojgpvt3qad4urb7acfxzo565rlzmjl4hhrpcoxrjkoicxuyy" alt="decor-left">
            <div id="telegram-passes"></div>
          </details>
  
          <details class="account-block2" decorated-block">
            <summary class="section-title2">📜 Recent Activity</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeicmgskdkv7l7zinxbmolfbwt36375h54gjss2sp4wrcynrvn4trsu" alt="decor-left">
            <div id="recent-activity"></div>
          </details>
  
          <details class="account-block2" decorated-block">
            <summary class="section-title2">🎁 Daily Box</summary>
            <img class="block-deco left" src="https://aquamarine-aggregate-hawk-978.mypinata.cloud/ipfs/bafybeifupqrjp4bgyfcdghqf7vctnygcvmq4fqrqihhhktrcvxyvxzcxwq" alt="decor-left">
            <div id="daily-box"></div>
          </details>
        </div>
      </div>
    `;
  
    loadAccountSection();
  }
}

async function loadAccountSection() {
  const { userId, usx_token } = window.userData;
  const container = document.querySelector('.loading-message');
  const sectionsWrapper = document.getElementById('account-sections');

  // Se abbiamo già tutti i dati, evita fetch
  if (window.accountData &&
      window.accountData.userInfo &&
      window.accountData.telegram &&
      window.accountData.twitch &&
      window.accountData.passes &&
      window.accountData.activity &&
      window.accountData.dailyBox) {
    
    // Mostra loader almeno 5 secondi prima del render
    await new Promise(resolve => setTimeout(resolve, 5000));
    container.classList.add('hidden');
    sectionsWrapper.style.display = 'block';
    renderPersonalInfo(window.accountData.userInfo);
    renderChatRewards(window.accountData.telegram, window.accountData.twitch);
    renderTelegramPasses(window.accountData.passes);
    renderRecentActivity(window.accountData.activity);
    renderDailyBox(window.accountData.dailyBox);
    return;
  }

  try {
    // Caricamento dati da endpoint
    const userInfoRes = await fetch(`${BASE_URL}/account/info?user_id=${userId}&usx_token=${usx_token}`);
    const userInfo = await userInfoRes.json();

    const [
      telegramRewardsRes,
      twitchRewardsRes,
      passesRes,
      activityRes,
      dailyBoxRes
    ] = await Promise.all([
      fetch(`${BASE_URL}/account/telegram_rewards?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/twitch_rewards?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/passes?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/activity?user_id=${userId}&usx_token=${usx_token}`),
      fetch(`${BASE_URL}/account/daily_box?user_id=${userId}&usx_token=${usx_token}`)
    ]);

    window.accountData = {
      userInfo,
      telegram: await telegramRewardsRes.json(),
      twitch: await twitchRewardsRes.json(),
      passes: await passesRes.json(),
      activity: await activityRes.json(),
      dailyBox: await dailyBoxRes.json()
    };

    // Mostra loader almeno 5 secondi
    await new Promise(resolve => setTimeout(resolve, 5000));

    container.classList.add('hidden');
    sectionsWrapper.style.display = 'block';

    renderPersonalInfo(window.accountData.userInfo);
    renderChatRewards(window.accountData.telegram, window.accountData.twitch);
    renderTelegramPasses(window.accountData.passes);
    renderRecentActivity(window.accountData.activity);
    renderDailyBox(window.accountData.dailyBox);

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

    case 'passes':
      wrapper.innerHTML = `<div class="account-card2" id="telegram-passes"></div>`;
      renderTelegramPasses(data.passes);
      break;

    case 'activity':
      wrapper.innerHTML = `<div class="account-card2" id="recent-activity"></div>`;
      renderRecentActivity(data.activity);
      break;

    case 'daily':
      wrapper.innerHTML = `<div class="account-card2" id="daily-box"></div>`;
      renderDailyBox(data.dailyBox);
      break;

    default:
      wrapper.innerHTML = `<p>Section not found</p>`;
  }
}

function renderDailyBox(data) {
  const { boxes = [], vip_active, claimed, dice_result } = data;

  const boxImages = {
    wood: '📦 Legno',
    bronze: '🟤 Bronzo',
    gold: '🟡 Oro',
    platinum: '💎 Platino'
  };

  const animationHTML = boxes.length > 0
    ? `<div class="box-animation">${boxes.map(type => `<p>${boxImages[type] || type}</p>`).join('')}</div>`
    : `<p>No boxes available today.</p>`;

  const diceHTML = (typeof dice_result === 'number')
    ? `<p>🎲 Dice rolled: <strong>${dice_result}</strong></p>`
    : `<p>🎲 Dice not rolled yet.</p>`;

  const vipStatus = vip_active
    ? `<span class="status-badge2 active2">VIP Active ✅</span>`
    : `<span class="status-badge2 inactive2">VIP Inactive ❌</span>`;

  document.getElementById('daily-box').innerHTML = `
    <p class="subtitle2">
      As a ChipsWallet member you can open one Daily Chest per day.<br>
      If you own the <strong>VIP Membership NFT</strong>, you can also claim a VIP Chest.<br>
      Not enough? Roll the dice — if you get a 6, win an extra Chest!<br>
      Chest types include <strong>Wood</strong>, <strong>Bronze</strong>, <strong>Gold</strong>...<br>
      Ever heard of a <strong>Platinum Chest</strong>? Check the blends here:<br>
      <a href="https://neftyblocks.com/collection/cryptochaos1/blends" target="_blank">
        https://neftyblocks.com/collection/cryptochaos1/blends
      </a>
    </p>
    <div class="mb-2">
      ${vipStatus} — 
      <a href="https://neftyblocks.com/collection/cryptochaos1/drops/210578" target="_blank">
        Get VIP NFT
      </a>
    </div>
    <div class="box-results mt-3">
      ${animationHTML}
      ${diceHTML}
      ${claimed ? '<p>✅ Box claimed today</p>' : '<p>🚫 Not claimed yet</p>'}
    </div>
  `;
}

function renderPersonalInfo(info) {
  const container = document.getElementById('personal-info');

  container.innerHTML = `
    <div class="card-glow">
      <h2 class="glow-text">👤 ${info.telegram_username || 'Unknown'}</h2>
      <p><span class="label">🎮 Twitch:</span> ${info.twitch_username || 'N/A'}</p>
      <p><span class="label">🔑 Wax Account:</span> <code>${info.wax_account}</code></p>
      <p><span class="label">🏅 Role:</span> <span class="role-tag">${info.role}</span></p>
      <p><span class="label">📈 Chips Staking Rank:</span> ${info.staking_rank ? `#${info.staking_rank}` : 'Out of Top 50'}</p>
      <p><span class="label">🧩 Chips NFTs Farm Staking Rank:</span> ${info.nft_rank ? `#${info.nft_rank}` : 'Out of Top 50'}</p>
    </div>
  `;
}

function renderChatRewards(telegram, twitch) {
  function renderBoosters(boosters, typeLabel, icon) {
    if (!boosters || boosters.length === 0) return `<p>No ${typeLabel} Boosters.</p>`;

    return `
      <details>
        <summary>${icon} ${typeLabel} Boosters</summary>
        ${boosters.map(b => `
          <p>
            ${b.type}: <strong>${b.points} pts</strong>
            ${b.channel ? `— <em>Only for ${b.channel}</em>` : `— <strong>Global</strong>`}
          </p>
        `).join('')}
      </details>
    `;
  }

  function renderPlatform(platform, icon) {
    const progress = Math.min((platform.xp / platform.xp_needed) * 100, 100).toFixed(1);

    const boostersHTML = `
      ${renderBoosters(platform.boosters?.xp, "XP", "📈")}
      ${renderBoosters(platform.boosters?.reward, "Reward", "💰")}
    `;

    const rewardsHTML = (platform.channels || []).map(ch => `
      <details>
        <summary>📣 ${ch.name}</summary>
        <table class="reward-table2">
          <thead>
            <tr><th>Token</th><th>Short Msg</th><th>Long Msg</th></tr>
          </thead>
          <tbody>
            ${ch.rewards.map(r => `
              <tr>
                <td>${r.token}</td>
                <td>${r.short_msg_reward}</td>
                <td>${r.long_msg_reward}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </details>
    `).join('');

    return `
      <div class="account-card2">
        <h4>${icon} ${platform.platform || 'Platform'}</h4>
        <p><strong>Username:</strong> ${platform.username}</p>
        <p><strong>Level:</strong> ${platform.level}</p>
        <p><strong>XP:</strong> ${platform.xp} / ${platform.xp_needed}</p>
        <div class="xp-bar2">
          <div class="xp-fill2" style="width:${progress}%"></div>
        </div>
        ${boostersHTML}
        <h5 class="subtitle2">💬 Channel Rewards</h5>
        ${rewardsHTML || '<p>No channel-specific rewards.</p>'}
      </div>
    `;
  }

  document.getElementById('chat-rewards').innerHTML = `
    ${renderPlatform(telegram, '📢')}
    ${renderPlatform(twitch, '🎮')}
  `;
}

function renderTelegramPasses(passes) {
  const statusClass = {
    "active": "status-badge2 active2",
    "expired": "status-badge2 inactive2"
  };

  document.getElementById('telegram-passes').innerHTML = `
    <ul>
      ${passes.map(p => `
        <li>
          <strong>${p.type}:</strong>
          <span class="${statusClass[p.status] || 'status-badge2'}">
            ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}
          </span>
        </li>
      `).join('')}
    </ul>
  `;
}

function renderRecentActivity(data) {
  document.getElementById('recent-activity').innerHTML = `
    <ul class="subtitle2">
      <li><strong>🎁 Last Boxes Claimed:</strong> ${data.last_boxes_claimed?.join(", ") || "None"}</li>
      <li><strong>💬 Last Chat Reward:</strong> ${data.last_chat_reward || "None"}</li>
      <li><strong>⛈️ Last Storm Win:</strong> ${data.last_storm_win || "None"}</li>
      <li><strong>🎉 Last NFT Giveaway:</strong> ${data.last_nft_giveaway || "None"}</li>
      <li><strong>🍀 Last LuckyDraw Tokens:</strong> ${data.last_luckydraw_tokens || "None"}</li>
      <li><strong>🌪️ Last NFT Storm:</strong> ${data.last_nft_storm || "None"}</li>
    </ul>
  `;
}

function populateNFTDropdown(nfts) {
  const dropdown = document.getElementById("nftAssetDropdown");
  console.log("[🧪] populateNFTDropdown() called");
  console.log("[📦] nfts received:", nfts);
  console.log("[📦] dropdown element:", dropdown);

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
        <td class="cell">${record.amount}</td>
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
      <select id="filter-username" class="filter-select">${createOptions(usernames)}</select>
      <select id="filter-channel" class="filter-select">${createOptions(channels)}</select>
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

// Storm Scheduler and Logs
// Funzione per aggiungere una nuova tempesta programmata
async function addScheduledStorm() {
  console.log("🔄 addScheduledStorm() called");
  const container = document.getElementById('c2e-content');
  // Leggi valori dal DOM
  const scheduledTimeLocal = document.getElementById('scheduledTime').value;
  const scheduledTimeUTC = new Date(scheduledTimeLocal).toISOString();
  const amount = document.getElementById('amount').value;
  const tokenSymbol = document.getElementById('tokenSymbol').value;
  const timeframe = document.getElementById('timeframe').value;
  const channelName = document.getElementById('channelName').value;
  const paymentMethod = document.getElementById('paymentMethod').value;

  console.log("📅 scheduledTimeLocal:", scheduledTimeLocal);
  console.log("🌐 scheduledTimeUTC (to send):", scheduledTimeUTC);
  console.log("💰 amount:", amount);
  console.log("🔠 tokenSymbol:", tokenSymbol);
  console.log("⏱️ timeframe:", timeframe);
  console.log("📺 channelName:", channelName);
  console.log("💳 paymentMethod:", paymentMethod);

  const { userId, usx_token, wax_account } = window.userData || {};

  console.log("👤 userId:", userId);
  console.log("🔐 usx_token:", usx_token);
  console.log("🧾 wax_account:", wax_account);

  if (!wax_account) {
    console.error("❌ wax_account is missing.");
    showToast("Error: wax_account is missing.", "error");
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

  console.log("📦 Payload to be sent:", payload);

  try {
    const url = `${BASE_URL}/add_storm?user_id=${userId}&usx_token=${usx_token}&wax_account=${wax_account}`;
    console.log("🌍 POST URL:", url);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log("📡 Response status:", res.status);

    const data = await res.json();
    console.log("📨 Response body:", data);

    if (data.success) {
      showToast(data.message, "success");
      console.log("✅ Storm added successfully");
      loadScheduledStorms(); // aggiorna tabella
    } else {
      showToast(`Error: ${data.error}`, "error");
      console.warn("⚠️ Backend error:", data.error);
    }

  } catch (err) {
    console.error("🔥 Network or unexpected error:", err);
    showToast(`Network error: ${err.message}`, "error");
  }
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
      <div class="section-container" >
        <h2 class="section-title" >Add New Scheduled Storm</h2>
        <div id="add-storm-form" class="form-container" >

          <!-- Scheduled Time and Timeframe -->
          <div >
            <div >
              <label class="input-label" >Scheduled Time</label>
              <input type="datetime-local" id="scheduledTime" class="input-field" >
            </div>
            <div >
              <label class="input-label" >Timeframe</label>
              <select id="timeframe" class="input-field" >
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
                <option value="30d">90d</option>
                <option value="30d">180d</option>
                <option value="1y">1y</option>
              </select>
            </div>
          </div>

          <!-- Amount and Token Symbol -->
          <div >
            <div >
              <label class="input-label" >Amount</label>
              <input type="number" id="amount" class="input-field" >
            </div>
            <div >
              <label class="input-label" >Token Symbol</label>
              <select id="tokenSymbol" class="input-field" >
                <option value="">Select Token</option>
              </select>
            </div>
          </div>

          <!-- Channel and Payment Method -->
          <div >
            <div >
              <label class="input-label" >Channel</label>
              <select id="channelName" class="input-field" >
                <option value="">Select Channel</option>
              </select>
            </div>
            <div >
              <label class="input-label" >Payment Method</label>
              <select id="paymentMethod" class="input-field" >
                <option value="twitch">Twitch</option>
                <option value="telegram">Telegram</option>
              </select>
            </div>
          </div>

          <!-- Add Storm Button -->
          <button id="submitStorm" class="btn-submit" >
            Add Storm
          </button>
        </div>

        <h2 class="section-title mt-6">Scheduled Storms</h2>
        <div id="table-container" class="table-container">
          Loading Scheduled Storms...
        </div>
      </div>
    `;

    // Aggiungi evento per inviare il form
    document.getElementById('submitStorm').addEventListener('click', addScheduledStorm);

    // Popola i token simbolo
    await populateTokenSymbols();
    // Popola i timeframes
    populateTimeframes();
    // Popola i canali
    await populateChannels();

    // Imposta i limiti per l'orario
    setScheduledTimeMinMax();

    // Carica la tabella delle tempeste programmate
    loadScheduledStorms();
  } catch (err) {
    container.innerHTML = `<div class="error-message">Error loading log storms and giveaways: ${err.message}</div>`;
  }
}

// Funzione per popolare il dropdown dei Token Symbols
async function populateTokenSymbols() {
  const tokenSelect = document.getElementById('tokenSymbol');
  
  if (window.walletBalances && Array.isArray(window.walletBalances)) {
    window.walletBalances.forEach(balance => {
      const option = document.createElement('option');
      option.value = balance.symbol;
      option.textContent = balance.symbol;
      tokenSelect.appendChild(option);
    });
  } else {
    console.error("walletBalances is not defined or not an array");
    tokenSelect.innerHTML = '<option value="">No tokens available</option>';
  }
}

// Funzione per popolare il dropdown dei Timeframes
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

    const data = await res.json();

    if (data.length === 0) {
      tableContainer.innerHTML = '<div>No scheduled storms found.</div>';
      return;
    }

    // Ordinamento: dal più recente al più vecchio
    data.sort((a, b) => new Date(b.scheduled_time) - new Date(a.scheduled_time));

    displayStormsData(data);
  } catch (err) {
    tableContainer.innerHTML = `<div class="error-message">Error loading scheduled storms: ${err.message}</div>`;
  }
}
function renderStormsTable(data) {
  const tableBody = document.querySelector('#table-container tbody');
  if (!tableBody) return;

  let rowsHTML = '';

  data.forEach((storm) => {
    let winnersHTML = '';
    const winnersRaw = storm.winners_display?.trim();

    if (storm.status === 'executed') {
      if (winnersRaw && winnersRaw.toLowerCase() !== 'soon') {
        const winnersArray = winnersRaw.split(' | ').map(w => w.trim().toUpperCase());

        winnersHTML += `<div class="winners-wrapper">`;

        winnersArray.forEach((winner, i) => {
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

  // Effetto stella cadente al click
  document.querySelectorAll('.winner-row').forEach(row => {
    row.addEventListener('click', () => {
      row.classList.add('clicked');
      setTimeout(() => row.classList.remove('clicked'), 700);
    });
  });
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

function displayStormsData(data) {
  const tableContainer = document.getElementById('table-container');
  originalStormsData = data;

  const getUniqueValues = (data, key) => [...new Set(data.map(item => item[key]).filter(Boolean))].sort();
  const createOptions = (values) => `<option value="">All</option>` + values.map(v => `<option value="${v}">${v}</option>`).join('');

  const channels = getUniqueValues(data, 'channel_name');
  const statuses = getUniqueValues(data, 'status');
  const offeredBys = getUniqueValues(data, 'offered_by');

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
      <button id="update-storms" class="btn btn-primary">Update Data</button>
    </div>
    <div>
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
    </div>
  `;
  renderStormsTable(data);

  document.getElementById('filter-channel').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-status').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-offeredby').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('update-storms').addEventListener('click', loadScheduledStorms);
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
  console.log("[📥] Risposta da /open_pools:", data);

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

 // Caricamento Wallet reale
async function loadWallet() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const saldoData = await response.json();

    window.walletBalances = saldoData.balances || [];
    console.info("[🧮] walletBalances salvati:", window.walletBalances);

    const walletTable = document.getElementById('wallet-table');
    if (!walletTable) {
      console.warn("[⚠️] wallet-table non trovato nel DOM. Skipping render.");
      return;
    }

    if (window.walletBalances.length > 0) {
      walletTable.innerHTML = `
        <div class="wallet-table-container">
          <table class="wallet-table card small">
            <thead class="thead">
              <tr>
                <th class="cell">Token</th>
                <th class="cell">Amount</th>
                <th class="cell">Stakeable</th>
                <th class="cell">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${window.walletBalances.map(token => `
                <tr class="row-border">
                  <td class="cell strong">${token.symbol}</td>
                  <td class="cell">${token.amount}</td>
                  <td class="cell">${token.stakeable}</td>
                  <td class="cell">
                    <div class="btn-group">
                      <button class="btn-action" data-action="withdraw" data-token="${token.symbol}">Withdraw</button>
                      <button class="btn-action" data-action="swap" data-token="${token.symbol}">Swap</button>
                      <button class="btn-action" data-action="transfer" data-token="${token.symbol}">Transfer</button>
                      ${token.stakeable ? `
                        <button class="btn-action" data-action="stake" data-token="${token.symbol}">Stake</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = btn.getAttribute('data-action');
          const token = btn.getAttribute('data-token');
          openModal(action, token);
        });
      });

    } else {
      walletTable.innerHTML = `<div class="empty-state">No balances available.</div>`;
    }

  } catch (error) {
    console.error("[❌] Error loading Wallet:", error);
  }
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
    console.log("[⚡] Withdraw Selected NFTs:", selectedIds);

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
} async function openModal(action, token) {
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);
  const tokenRow = Array.from(document.querySelectorAll('tr')).find(row => row.innerText.includes(token));
  const balanceCell = tokenRow ? tokenRow.querySelectorAll('td')[1] : null;
  const balance = balanceCell ? parseFloat(balanceCell.innerText) : 0;
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
          <select id="token-output" class="input-box" size="5"></select>
        </div>
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
  } else {
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
    const tokenOutput = document.getElementById('token-output');
    const previewButton = document.getElementById('preview-button');
    const submitButton = document.getElementById('submit-button');
    const swapPreview = document.getElementById('swap-preview');
    const loadingSpinner = document.getElementById('loading-spinner');
    const swapDataContainer = document.getElementById('swap-data');
    const minReceivedSpan = document.getElementById('min-received');
    const priceImpactSpan = document.getElementById('price-impact');

    function updateTokenDropdown(tokens) {
      tokenOutput.innerHTML = tokens.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    tokenSearch.addEventListener('input', () => {
      const search = tokenSearch.value.toLowerCase();
      const filtered = availableTokens.filter(t => t.toLowerCase().includes(search));
      updateTokenDropdown(filtered);
    });

    previewButton.addEventListener('click', async () => {
      const amount = parseFloat(input.value);
      const outputSelection = tokenOutput.value;
      if (!amount || amount <= 0 || !outputSelection) {
        alert("Insert valid amount and output token");
        return;
      }

      let [symbolOut, contractOut] = outputSelection.split("-");
      const symbolIn = token.toLowerCase();
      const contractInLower = contractIn.toLowerCase();

      const apiUrl = `https://alcor.exchange/api/v2/swapRouter/getRoute?trade_type=EXACT_INPUT&input=${symbolIn}-${contractInLower}&output=${symbolOut.toLowerCase()}-${contractOut.toLowerCase()}&amount=${amount}`;

      swapPreview.classList.remove('hidden');
      loadingSpinner.classList.remove('hidden');
      swapDataContainer.classList.add('hidden');

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
        const minReceived = (data.minReceived || 0) * 0.9;
        minReceivedSpan.textContent = minReceived.toFixed(4);
        priceImpactSpan.textContent = data.priceImpact || "-";
        loadingSpinner.classList.add('hidden');
        swapDataContainer.classList.remove('hidden');
        submitButton.disabled = false;
      } catch (err) {
        console.error("Swap preview error:", err);
        loadingSpinner.innerHTML = `<div class="text-error">⚠️ Failed to load blockchain data.</div>`;
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
        const outputSelection = tokenOutput.value;
        const [symbolOut, contractOut] = outputSelection.split("-");
        await executeAction(action, token, amount, symbolOut, contractOut);
      } else {
        await executeAction(action, token, amount);
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

} function showConfirmModal(message, onConfirm) {
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
async function executeAction(action, token, amount, tokenOut = null, contractOut = null) {
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

  // Aggiungiamo user_id e usx_token all'URL
  const fullUrl = `${endpoint}?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
  console.info(`[📤] Eseguo azione ${action} chiamando: ${fullUrl}`);

  let response;
  let data;

  try {
    let bodyData = {
      wax_account: wax_account,
      token_symbol: token,
      amount: amount
    };

    if (action === "swap") {
      bodyData = {
        wax_account: wax_account,
        from_token: token,
        to_token: tokenOut,
        amount: amount
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

  // ✅ A questo punto siamo sicuri che la risposta è valida
  if (action === "swap" && data.details) {
    const details = data.details;
    showToast(
      `Swap Success!\n${details.amount} ${details.from_token} ➡️ ${details.received_amount.toFixed(4)} ${details.to_token}\nPrice: ${details.execution_price}\nCommission: ${details.commission.toFixed(4)}`,
      "success"
    );
  } else if (action === "transfer" && data.message) {
    showToast(`${data.message}`, "success");
  } else if (action === "stake" && data.message) {
    showToast(`${data.message}`, "success");
  } else {
    showToast(`${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully`, "success");
  }

  console.info("[✅] Azione completata:", data.message || "Successo");
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
   2. AVVIO APP
   ───────────────────────────── */
initApp();

/* ─────────────────────────────
   3. SELECTOR TEMA DINAMICO
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



