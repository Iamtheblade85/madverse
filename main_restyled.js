// Globals
window.userData = {};
window.selectedNFTs = new Set();
window.currentPage = 1;
window.nftsPerPage = 12;

// Base URL reale
const BASE_URL = "https://iamemanuele.pythonanywhere.com";
let availableTokens = [];
let originalStormsData = [];
let currentSort = { key: '', direction: 'desc' };

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
      console.error("[⛔] Parametri user_id o usx_token mancanti nell'URL:", params);
      throw new Error("Parametri user_id o usx_token mancanti nell'URL");
    }

    console.info("[💾] Salvando parametri in window.userData...");
    window.userData = {
      userId: params.userId,
      usx_token: params.usx_token,
      wax_account: null // Da popolare dopo /main_door
    };
    console.info("[📦] window.userData attuale:", window.userData);

    console.info("[🚪] Verifica credenziali con /main_door in corso...");
    const response = await fetch(`${BASE_URL}/main_door?user_id=${encodeURIComponent(params.userId)}&usx_token=${encodeURIComponent(params.usx_token)}`);
    const data = await response.json();
    console.info("[📨] Risposta ricevuta da /main_door:", data);

    if (!data.user_id || !data.wax_account) {
      console.error("[🛑] Dati incompleti nella risposta di /main_door:", data);
      throw new Error("Autenticazione fallita");
    }

    console.info("[🖊️] Aggiornamento wax_account in window.userData...");
    window.userData.wax_account = data.wax_account;

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
    <div class="form-card">
      <h3 class="form-title">Create a New Token Staking Pool</h3>

      <label class="form-label">Deposit Token Symbol</label>
      <input id="new-token-symbol" type="text" class="form-input" placeholder="e.g. CHIPS">

      <div id="reward-token-entries"></div>

      <button class="btn btn-secondary add-reward-btn" id="add-reward-token">
        ➕ Add Reward Token
      </button>

      <button id="submit-new-token-pool" class="btn btn-primary submit-pool-btn">
        Create Pool
      </button>
    </div>
  `;

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
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  console.log("[✏️] Edit Daily Reward - Parametri:", {
    poolId,
    tokenSymbol,
    currentReward,
    depositTokenSymbol
  });

  body.innerHTML = `
    <h3 class="modal-title">Edit Daily Reward for ${tokenSymbol}</h3>
    
    <label class="form-label">New Daily Reward</label>
    <input 
      id="new-daily-reward" 
      type="number" 
      value="${currentReward}" 
      class="form-input"
    >
    
    <button id="submit-daily-reward" class="btn btn-primary full-width">
      Update Reward
    </button>
    
    <button class="btn btn-secondary mt-medium" onclick="openDepositToPool(${poolId}, '${tokenSymbol}')">
      💰 Deposit More Tokens
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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
      modal.classList.add('hidden');
      fetchAndRenderTokenPools();
    } catch (err) {
      console.error("[❌] Failed to update reward:", err);
      showToast(err.message, "error");
    }
  };
}

window.openEditDailyReward = openEditDailyReward;
function openDepositToPool(poolId, tokenSymbol) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  const tokenBalance = window.walletBalances?.find(t => t.symbol === tokenSymbol);
  const balance = tokenBalance?.amount || 0;

  console.log("[💰] Apri modale deposito:", {
    poolId,
    tokenSymbol,
    balance
  });

  body.innerHTML = `
    <h3 class="modal-title">Deposit More ${tokenSymbol} into Pool</h3>
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

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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
      modal.classList.add('hidden');
      loadWallet();
      fetchAndRenderTokenPools();
    } catch (err) {
      console.error("[❌] Error depositing tokens:", err);
      showToast(err.message, "error");
    }
  };
}

window.openDepositToPool = openDepositToPool;
function openPoolStatusModal(poolId, currentStatus) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  console.log("[⚙️] Aprendo modale status pool:", { poolId, currentStatus });

  body.innerHTML = `
    <h3 class="modal-title">Change Pool Status</h3>
    
    <label class="form-label">Select new status</label>
    <select id="pool-status-select" class="form-select">
      <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open</option>
      <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed</option>
      <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>Maintenance</option>
    </select>

    <button id="submit-pool-status" class="btn btn-warning full-width">
      Update Status
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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

      showToast("Pool status updated", "success");
      modal.classList.add('hidden');
      fetchAndRenderTokenPools();
    } catch (err) {
      console.error("[❌] Errore durante l'aggiornamento dello stato della pool:", err);
      showToast("Error: " + err.message, "error");
    }
  };
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
      ${templatesHTML || '<div class="empty-templates">No templates added yet.</div>'}
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
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const { userId, usx_token } = window.userData;

  body.innerHTML = `
    <h3 class="modal-title">➕ Add Template to Farm</h3>

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

    <button id="submit-add-template" class="btn btn-warning full-width">
      Add Template
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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
      modal.classList.add('hidden');
      await fetchAndRenderUserFarms();
    } catch (err) {
      console.error("[❌] Error adding template:", err);
      showToast(err.message, "error");
    }
  };
}

// ✅ Deposit Rewards
function openDepositForm(farmId) {
  const { userId, usx_token, wax_account } = window.userData;
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h3 class="modal-title">Deposit Rewards to Farm</h3>
    <div id="rewards-deposit-container"></div>
    <button id="add-more-reward" class="link-add-reward">➕ Add another token</button>
    <button id="submit-deposit" class="btn btn-success full-width">Deposit All</button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

  const container = document.getElementById('rewards-deposit-container');
  const addBtn = document.getElementById('add-more-reward');
  const wallet = window.walletBalances || [];

  function renderRewardRow(token = '') {
    const wallet = window.walletBalances || [];
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
      modal.classList.add('hidden');
      fetchAndRenderUserFarms();
    } catch (err) {
      console.error("[❌] Error depositing rewards:", err);
      showToast(err.message, "error");
    }
  };
}

// ✅ Confirm Close
function confirmFarmClosure(farmId) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h3 class="modal-title text-danger">Close Farm</h3>
    <p class="modal-text">Are you sure you want to <strong>close</strong> this farm? This will stop all rewards.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancel</button>
      <button class="btn btn-danger" onclick="changeFarmStatus(${farmId}, 'closed')">Confirm</button>
    </div>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
}

// ✅ Change Status
function changeFarmStatus(farmId, newStatus = null) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const { userId, usx_token } = window.userData;

  if (!newStatus) {
    body.innerHTML = `
      <h3 class="modal-title">Change Farm Status</h3>
      <select id="status-select" class="form-select">
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="setting">Setting</option>
      </select>
      <button class="btn btn-warning full-width" id="status-confirm">Update</button>
    `;

    modal.classList.remove('hidden');
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

    document.getElementById('status-confirm').onclick = () => {
      const selected = document.getElementById('status-select').value;
      changeFarmStatus(farmId, selected);
    };

    return;
  }

  fetch(`${BASE_URL}/update_farm_status?user_id=${userId}&usx_token=${usx_token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ farm_id: farmId, status: newStatus })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) throw new Error(data.error);
      showToast("✅ Farm status updated", "success");
      modal.classList.add('hidden');
      fetchAndRenderUserFarms();
    })
    .catch(err => {
      showToast("Error: " + err.message, "error");
    });
}
async function openEditRewards(templateId) {
  const { userId, usx_token } = window.userData;
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

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

    modal.classList.remove('hidden');
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

    body.innerHTML = `
      <h3 class="modal-title">✏️ Edit Rewards for Template ID ${templateId}</h3>
      <div id="rewards-edit-container">
        ${(template.rewards || []).map(r => `
          <div class="reward-entry">
            <input type="text" class="form-input half-width token-symbol" value="${r.token_symbol}" placeholder="Token Symbol">
            <input type="number" class="form-input half-width reward-amount" value="${parseFloat(r.daily_reward_amount)}" placeholder="Amount per day">
          </div>
        `).join('')}
      </div>
      <button id="add-reward-btn" class="link-add-reward">➕ Add another reward</button>
      <button id="submit-edit-rewards" class="btn btn-warning full-width">Update Rewards</button>
    `;

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
        modal.classList.add('hidden');
        await fetchAndRenderUserFarms();
      } catch (err) {
        console.error(err);
        showToast(err.message, "error");
      }
    };

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
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  body.innerHTML = `
    <h3 class="modal-title">➕ Add Reward to Template ID ${templateId}</h3>
    <div class="reward-entry">
      <input type="text" id="new-token-symbol" class="form-input half-width" placeholder="Token Symbol (e.g. CHIPS)">
      <input type="number" id="new-reward-amount" class="form-input half-width" placeholder="Amount per day">
    </div>
    <button id="submit-new-reward" class="btn btn-success full-width">
      Add Reward
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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
      modal.classList.add('hidden');
      fetchAndRenderUserFarms();
    } catch (err) {
      console.error("[❌] Error adding reward:", err);
      showToast(err.message, "error");
    }
  };
}

window.openAddReward = openAddReward; 
window.openEditRewards = openEditRewards;
// Funzione per caricare dinamicamente sezioni
function loadSection(section) {
  console.log(`[📦] Caricando sezione: ${section}`);
  const app = document.getElementById('app');

  if (section === 'c2e-twitch') {
    app.innerHTML = `
      <h2 class="section-title text-center">C2E - Twitch</h2>
      <div class="c2e-menu">
        <button class="c2e-menu-btn" data-menu="log-reward-activity">Log Reward Activity</button>
        <button class="c2e-menu-btn" data-menu="log-storms-giveaways">Log Storms & Giveaways</button>
        <button class="c2e-menu-btn" data-menu="schedule-token-storm">Schedule Token-Storm</button>
        <button class="c2e-menu-btn" data-menu="schedule-nft-giveaway">Schedule NFT-Giveaway</button>
      </div>
      <div id="c2e-content" class="c2e-content">Loading last activity...</div>
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
          case 'schedule-token-storm': loadScheduledStorms(); break;
          case 'schedule-nft-giveaway': loadScheduleNFTGiveaway(); break;
        }
      });
    });

  } else if (section === 'wallet') {
    app.innerHTML = `
      <h2 class="section-title">Wallet</h2>
      <div id="wallet-table">Caricamento Wallet...</div>
    `;
    loadWallet();

  } else if (section === 'nfts') {
    app.innerHTML = `
      <h2 class="section-title">My NFTs</h2>

      <div class="filters-group">
        <input type="text" id="search-template" placeholder="Search by Template Name..." class="form-input">

        <select id="filter-status" class="form-select">
          <option value="">Status</option>
          <option value="Staked">Staked</option>
          <option value="Not Staked">Not Staked</option>
        </select>

        <select id="filter-stakable" class="form-select">
          <option value="">Stakeability</option>
          <option value="Stakable">Stakable</option>
          <option value="Not Stakable">Not Stakable</option>
        </select>

        <select id="filter-for-sale" class="form-select">
          <option value="">Sale Status</option>
          <option value="Yes">For Sale</option>
          <option value="No">Not For Sale</option>
        </select>

        <select id="filter-collection" class="form-select">
          <option value="">Collection</option>
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
        <div class="modal-box">
          <button id="close-modal" class="modal-close">&times;</button>
          <div id="modal-content"></div>
        </div>
      </div>
    `;

    loadNFTs();
  }
else if (section === 'token-staking') {
  console.log("[🧪] Entrato in blocco token-staking");
  app.innerHTML = `
    <h2 class="section-title">Token Staking</h2>
    <input type="text" id="search-pools" placeholder="Search token pool name" class="form-input search-token-pool">
    <div id="pool-buttons" class="pool-buttons"></div>
    <div id="selected-pool-details">
      <div class="loading-message">Loading pool data...</div>
    </div>
  `;
  loadStakingPools();

} else if (section === 'nfts-staking') {
  app.innerHTML = `
    <h2 class="section-title">NFT Staking</h2>
    <div id="nft-farms-container" class="vertical-list">Loading NFT farms...</div>
  `;
  loadNFTFarms();

} else if (section === 'create-nfts-farm') {
  app.innerHTML = `
    <h2 class="section-title">Create NFTs Staking Farm</h2>
    <div id="create-nfts-farm-container">Loading...</div>
  `;
  loadCreateNFTFarm();

} else if (section === 'create-token-pool') {
  app.innerHTML = `
    <h2 class="section-title">Create Token Staking Pool</h2>
    <div id="create-token-pool-container">Loading...</div>
  `;
  loadCreateTokenStaking();
}
}
 async function loadNFTFarms() {
  const { userId, usx_token } = window.userData;
  const res = await fetch(`${BASE_URL}/nfts_farms?user_id=${userId}&usx_token=${usx_token}`);
  const data = await res.json();

  console.log("[🐛] Risposta intera da /nfts_farms:", JSON.stringify(data, null, 2));

  if (!data.farms || data.farms.length === 0) {
    document.getElementById('nft-farms-container').innerHTML = `
      <div class="error-message">No NFT farms found.</div>`;
    return;
  }

  window.nftFarmsData = data.farms;
  renderNFTFarmButtons(data.farms);

  const defaultFarm = data.farms.find(f => f.farm_name.toLowerCase().includes('chips')) || data.farms[0];
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
            onerror="this.onerror=null;this.src='https://via.placeholder.com/150?text=Image+Not+Found';">
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

      return `
        <div class="template-block">
          <h4 class="template-title">Template ID: ${template.template_id}</h4>
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
        ${templatesHTML}
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
      .slice(0, 20)
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
            <th>Timestamp${sortArrow('timestamp')}</th>
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
        <div id="wallet-table">
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
    "1d", "2d", "3d", "4d", "5d", "6d", "7d", "15d", "30d", "1y"
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
  const tableContainer = document.getElementById('wallet-table');
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
  const tableBody = document.querySelector('.storm-table tbody');
  if (!tableBody) return;

  let rowsHTML = '';

  data.forEach((storm, index) => {
    let winnersHTML = '';
    const winnersRaw = storm.winners_display?.trim();

    if (storm.status === 'executed') {
      if (winnersRaw && winnersRaw.toLowerCase() !== 'soon') {
        const winnersArray = winnersRaw.split(' | ').map(w => w.trim().toUpperCase());
        for (let i = 0; i < winnersArray.length; i += 2) {
          const left = winnersArray[i];
          const right = winnersArray[i + 1] || '';
          winnersHTML += `
            <div class="winner-row">
              <span class="winner-name">${left}</span>
              <span class="winner-name">${right}</span>
            </div>`;
        }
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
  const tableContainer = document.getElementById('wallet-table');
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
      <select id="filter-channel" class="filter-select">${createOptions(channels)}</select>
      <select id="filter-status" class="filter-select">${createOptions(statuses)}</select>
      <select id="filter-offeredby" class="filter-select">${createOptions(offeredBys)}</select>
      <button id="update-storms" class="btn btn-primary">Update Data</button>
    </div>

    <div class="table-container">
      <table class="storm-table">
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
    showToast(data.message || 'Success', 'success');
    
    // 🔁 Solo refresh della farm modificata
    const updatedFarm = window.nftFarmsData.find(f => f.farm_id === farmId);
    if (updatedFarm) {
      renderNFTFarms([updatedFarm]);
    }
  } catch (err) {
    console.error(err);
    showToast("Error: " + err.message, "error");
  }
} async function loadStakingPools() {
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
  let gridClass = 'reward-grid cols-1';
  if (rewardsCount === 2) {
    gridClass = 'reward-grid cols-2';
  } else if (rewardsCount > 2) {
    gridClass = 'reward-grid cols-auto';
  }

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

      <h4 class="subheading">Rewards</h4>
      <div class="${gridClass}">
        ${rewardsHTML}
      </div>
    </div>
  `;
}
function openStakeModal(type, poolId, tokenSymbol) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const wax_account = window.userData.wax_account;
  const user_id = window.userData.userId;
  const usx_token = window.userData.usx_token;

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

  modalBody.innerHTML = `
    <h3 class="modal-title">${title}</h3>
    <p class="label">${availableLabel}: <strong>${balance.toFixed(4)}</strong> ${tokenSymbol}</p>

    <label class="label">Select %</label>
    <input id="stake-range" type="range" min="0" max="100" value="0" class="input-range">

    <label class="label">Amount</label>
    <input id="stake-amount" type="number" step="0.0001" class="input-field" value="0">

    <div id="stake-summary" class="text-muted section-space"></div>

    <button class="btn btn-confirm" id="stake-submit">Go!</button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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
      alert("Invalid amount.");
      return;
    }

    const body = {
      user_id,
      pool_id: poolId,
      token_symbol: tokenSymbol,
      wax_account,
      amount
    };

    try {
      const res = await fetch(`${BASE_URL}/${actionUrl}?user_id=${user_id}&usx_token=${usx_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unknown error");

      showToast(json.message || "Success", "success");
      modal.classList.add('hidden');
      loadWallet();
      loadStakingPools();
    } catch (err) {
      console.error(err);
      showToast("Operation failed: " + err.message, "error");
    }
  };
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
                      <button class="btn-action" data-action="stake" data-token="${token.symbol}">Stake</button>
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
} function populateDropdowns(nfts) {
  const collections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];
  const collectionSelect = document.getElementById('filter-collection');
  collectionSelect.innerHTML += collections.sort().map(c => `<option value="${c}">${c}</option>`).join('');
} function populateCollectionFilter(nfts) {
  const filterCollection = document.getElementById('filter-collection');
  const collections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];
  filterCollection.innerHTML += collections.sort().map(col => `<option value="${col}">${col}</option>`).join('');
} function renderNFTs() {
  const nftsList = document.getElementById('nfts-list');
  const loading = document.getElementById('nfts-loading');
  const count = document.getElementById('nfts-count');

  loading.classList.add('hidden');

  let filtered = [...window.nftsData];

  const search = document.getElementById('search-template').value.toLowerCase();
  if (search) {
    filtered = filtered.filter(nft => nft.template_info.template_name.toLowerCase().includes(search));
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
  if (collection) filtered = filtered.filter(nft => nft.template_info.collection_name === collection);

  const sort = document.getElementById('sort-by').value;
  if (sort === "created_at_desc") {
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } else if (sort === "created_at_asc") {
    filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else if (sort === "template_name_asc") {
    filtered.sort((a, b) => a.template_info.template_name.localeCompare(b.template_info.template_name));
  } else if (sort === "template_name_desc") {
    filtered.sort((a, b) => b.template_info.template_name.localeCompare(a.template_info.template_name));
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
          <img src="${nft.image_url}" alt="NFT Image" class="nft-image">
          <h3 class="nft-title">${nft.template_info.template_name}</h3>
          <p class="nft-subtitle">#${nft.asset_id}</p>
        </div>
      </div>
    `).join('');
  } else {
    nftsList.innerHTML = `<div class="empty-state">No NFTs match your filters.</div>`;
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
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <img src="${nft.image_url}" alt="NFT Image" class="modal-image">
    <h2 class="modal-title">${nft.template_info.template_name}</h2>
    <p class="nft-detail"><strong>Asset ID:</strong> ${nft.asset_id}</p>
    <p class="nft-detail"><strong>Collection:</strong> ${nft.template_info.collection_name}</p>
    <p class="nft-detail"><strong>Schema:</strong> ${nft.template_info.schema_name}</p>
    <p class="nft-detail"><strong>Stakeable:</strong> ${nft.is_stakable}</p>
    <p class="nft-detail"><strong>Staked:</strong> ${nft.is_staked}</p>
    <p class="nft-detail"><strong>For Sale:</strong> ${nft.for_sale}</p>
    <p class="nft-detail"><strong>Transferable:</strong> ${nft.template_info.is_transferable ? "Yes" : "No"}</p>
    <p class="nft-subtext">Acquired: ${new Date(nft.created_at).toLocaleDateString()}</p>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
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
  if (!confirm(`Withdraw ${window.selectedNFTs.size} selected NFTs?`)) return;
  const selectedIds = Array.from(window.selectedNFTs);
  console.log("[⚡] Withdraw Selected NFTs:", selectedIds);
  const { userId, usx_token, wax_account } = window.userData; // 🔥 wax_account aggiunto qui sopra!
  const endpoint = `${BASE_URL}/withdraw_nft_v2?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ wax_account: wax_account, asset_ids: selectedIds }) // 🔥 body corretto qui
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[❌] Errore server:", data.error || "Unknown error");
      showToast(`Error withdrawing NFTs: ${data.error || 'Unknown error'}`, "error");
      return;
    }

    showToast(`✅ Successfully withdrawn ${selectedIds.length} NFTs`, "success");

    window.selectedNFTs.clear();
    await loadNFTs();

  } catch (error) {
    console.error("[❌] Errore rete:", error);
    showToast("Network or server error during NFT withdraw", "error");
  }
} async function bulkSendSelected() {
  if (window.selectedNFTs.size === 0) return;

  const selectedIds = Array.from(window.selectedNFTs);
  
  // Apri un piccolo modale customizzato
  const receiver = prompt(
    `⚡ You are about to transfer these NFTs:\n\n${selectedIds.join(", ")}\n\nPlease enter the receiver's WAX account:`
  );
  
  if (!receiver) {
    showToast("Transfer cancelled: no recipient specified.", "error");
    return;
  }

  if (!confirm(`Confirm transfer of ${selectedIds.length} NFTs to ${receiver}?`)) {
    showToast("Transfer cancelled.", "error");
    return;
  }

  const { userId, usx_token } = window.userData;
  const endpoint = `${BASE_URL}/transfer_nfts?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
  const bodyData = { wax_account: wax_account, asset_ids: selectedIds };
  console.log("[📤] Body da inviare:", JSON.stringify(bodyData));
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
    console.log("[📤] Dati ricevuti dal backend:", data);
    if (!response.ok || data.error) {
      console.error("[❌] Transfer error:", data.error || "Unknown error");
      showToast(`❌ Transfer failed: ${data.error || "Unknown error"}`, "error");
      return;
    }

    showToast(`✅ Successfully transferred ${selectedIds.length} NFTs to ${receiver}`, "success");

    // Dopo successo
    window.selectedNFTs.clear();
    updateBulkActions();
    await loadNFTs();

  } catch (error) {
    console.error("[❌] Network error:", error);
    showToast("Network error or server unreachable.", "error");
  }
} async function openModal(action, token) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  const tokenRow = Array.from(document.querySelectorAll('tr')).find(row => row.innerText.includes(token));
  const balanceCell = tokenRow ? tokenRow.querySelectorAll('td')[1] : null;
  const balance = balanceCell ? parseFloat(balanceCell.innerText) : 0;

  modalBody.innerHTML = "";

  let contractIn = "";
  if (action === "swap") {
    const match = availableTokens.find(t => t.split("-")[0].toLowerCase() === token.toLowerCase());
    contractIn = match ? match.split("-")[1] : "";
  }

  if (action === "swap") {
    modalBody.innerHTML = `
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
    await loadAvailableTokens();
  } else {
    modalBody.innerHTML = `
      <h3 class="modal-title">${actionTitle} ${token}</h3>
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
  }

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

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

  // Submit action
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
      showToast(`${actionTitle} completed successfully`, "success");
      modal.classList.add('hidden');
      loadWallet();
    } catch (error) {
      console.error(error);
      showToast(`Error during ${actionTitle}`, "error");
    }
  };
} function showConfirmModal(message, onConfirm) {
  const modal = document.getElementById('confirm-modal');
  const msg = document.getElementById('confirm-message');
  const cancelBtn = document.getElementById('confirm-cancel');
  const yesBtn = document.getElementById('confirm-yes');

  msg.textContent = message;
  modal.classList.remove('hidden');

  // Rimuovi eventuali vecchi listener
  cancelBtn.onclick = () => modal.classList.add('hidden');
  yesBtn.onclick = () => {
    modal.classList.add('hidden');
    onConfirm();
  };
}async function executeAction(action, token, amount, tokenOut = null, contractOut = null) {
  // Verifica se userId e wax_account sono presenti in window.userData
  if (!window.userData || !window.userData.userId || !window.userData.wax_account) {
    console.error("[❌] userId o wax_account non trovato in window.userData. Assicurati che i dati siano caricati prima di eseguire l'azione.");
    return; // Interrompe l'esecuzione se userId o wax_account non sono presenti
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
    position: absolute;
    top: 1rem;
    width: 15%;
    right: 1.5rem;
    padding: 0.5rem 1rem;
    background: linear-gradient(145deg, #1a1a1a, #333);
    color: #ffd700;
    border: 2px solid #ffae42;
    border-radius: 6px;
    font-weight: bold;
    font-family: 'Orbitron', sans-serif;
    box-shadow: 0 0 10px #ffae42;
    transition: all 0.3s ease;
    z-index: 9999;
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
    { name: 'Caveman', file: 'styles6_caveman2.css' },
    { name: 'ChipsWallet', file: 'styles6_chipswallet.css' },
    { name: 'Crypto World', file: 'styles6_crypto.css' },
    { name: 'Far West', file: 'styles6_farwest.css' },
    { name: 'Inferno', file: 'styles6_inferno.css' },
    { name: 'Oceanic Life', file: 'styles6_oceanic.css' },
    { name: 'Precious Gold', file: 'styles6_precious.css' },
    { name: 'Streaming', file: 'styles6_streaming.css' },
    { name: 'Jurassic', file: 'styles6_jurassic.css' },
    { name: 'Cybertribal', file: 'styles6_cybertriba_glow.css' }
  ];

  selector.innerHTML = themes
    .map(t => `<option value="${t.file}">${t.name}</option>`)
    .join('');

  // Inserisci accanto al titolo se presente
  const title = document.querySelector('.app-title');
  if (title && title.parentElement) {
    title.parentElement.style.position = 'relative'; // necessario per posizionamento assoluto
    title.parentElement.appendChild(selector);
  } else {
    document.body.appendChild(selector); // fallback
  }

  // Cambia foglio di stile dinamicamente
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

  // Cambio dinamico del tema
  selector.addEventListener('change', e => {
    swapCSS(e.target.value);
  });

  // Applica tema salvato
  const saved = localStorage.getItem('selected-css') || themes[0].file;
  selector.value = saved;
  swapCSS(saved);
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

