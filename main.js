// Globals
window.userData = {};
window.selectedNFTs = new Set();
window.currentPage = 1;
window.nftsPerPage = 12;

// Base URL reale
const BASE_URL = "https://iamemanuele.pythonanywhere.com";
let availableTokens = [];

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

// Funzione iniziale
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
    console.info("[🌐] Chiamata a:", `${BASE_URL}/main_door?user_id=${encodeURIComponent(params.userId)}&usx_token=${encodeURIComponent(params.usx_token)}`);

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
      <div class="text-red-500 text-center mt-8">
        Errore: ${error.message}<br>Verifica il link o rifai il login.
      </div>`;
  }
}
async function loadCreateTokenStaking() {
  const container = document.getElementById('create-token-pool-container');
  console.log("[📦] Contenitore trovato:", container);
  container.innerHTML = `
    <input type="text" id="search-token-pool" placeholder="Search your token..." class="mb-4 p-2 border rounded w-full md:w-1/2">
    <button id="create-new-token-pool-btn" class="ml-2 px-4 py-2 rounded text-white font-bold shadow bg-gradient-to-r from-green-400 to-green-600 hover:from-green-500 hover:to-green-700">
      ➕ Create New Token Pool
    </button>
    <div id="created-token-pools" class="flex flex-wrap gap-2 mb-4"></div>
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

    // Verifica se il container esiste prima di tentare di modificarlo
    if (!container) {
      console.warn("[⚠️] Container 'token-pool-details' non trovato, solo i dati vengono recuperati.");
      window.tokenPoolsData = data.pools;  // Salva i dati senza fare rendering
      return;  // Esci dalla funzione senza fare rendering
    }

    // Se la flag shouldRender è true, esegui il rendering
    if (shouldRender) {
      if (!res.ok || !data.pools) {
        container.innerHTML = `<div class="text-gray-600 italic">No token staking pools found.</div>`;
        return;
      }

      window.tokenPoolsData = data.pools;
      console.log("[📦] window.tokenPoolsData assegnato:", window.tokenPoolsData);
      renderCreatedTokenPoolButtons(data.pools);
      renderTokenPoolDetails(data.pools[0]);
    }
  } catch (err) {
    if (container && shouldRender) {
      container.innerHTML = `<div class="text-red-500">Error loading token pools.</div>`;
    }
    console.error("[❌] Error loading pools:", err);
  }
}
 function renderNewTokenPoolForm() {
  const container = document.getElementById('token-pool-details');
  container.innerHTML = `
    <div class="bg-white p-6 rounded shadow max-w-xl mx-auto">
      <h3 class="text-xl font-bold mb-4">Create a New Token Staking Pool</h3>

      <label class="block mb-2 font-semibold">Deposit Token Symbol</label>
      <input id="new-token-symbol" type="text" class="w-full border p-2 rounded mb-4" placeholder="e.g. CHIPS">

      <div id="reward-token-entries"></div>

      <button class="bg-blue-500 text-white px-3 py-1 rounded mb-4" id="add-reward-token">
        ➕ Add Reward Token
      </button>

      <button id="submit-new-token-pool" class="w-full bg-green-600 text-white font-semibold py-2 px-4 rounded shadow-md">
        Create Pool
      </button>
    </div>
  `;

  let rewardIndex = 0;

  function addRewardTokenEntry() {
    const wrapper = document.getElementById('reward-token-entries');
    const html = `
      <div class="reward-token-entry mb-4 border p-3 rounded shadow">
        <label class="block font-semibold mb-1">Reward Token Symbol</label>
        <input type="text" class="reward-symbol w-full border p-2 rounded mb-2" placeholder="e.g. WAX">

        <label class="block font-semibold mb-1">Total Reward Amount</label>
        <input type="number" class="reward-total w-full border p-2 rounded mb-2" placeholder="e.g. 1000">

        <label class="block font-semibold mb-1">Daily Reward</label>
        <input type="number" class="reward-daily w-full border p-2 rounded mb-2" placeholder="e.g. 10">
      </div>`;
    wrapper.insertAdjacentHTML('beforeend', html);
    rewardIndex++;
  }

  document.getElementById('add-reward-token').addEventListener('click', addRewardTokenEntry);
  addRewardTokenEntry(); // Add at least one by default

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
      // 1. Crea la pool
      const createRes = await fetch(`${BASE_URL}/create_staking_pool?user_id=${userId}&usx_token=${usx_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deposit_token_symbol: symbol
        })
      });

      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to create pool");

      const poolId = createData.pool_id;

      // 2. Aggiungi i reward token
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
      btn.className = 'btn-action';
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
      <div class="border-t pt-2 mt-2">
        <p class="text-gray-600 mb-1"><strong>🎯 Token:</strong> ${reward.token_symbol}</p>
        <p class="text-gray-600 mb-1">💰 Total Deposited: <strong>${reward.total_reward_deposit}</strong></p>
        <p class="text-gray-600 mb-1">📅 Daily Reward: <strong>${reward.daily_reward}</strong></p>
        <p class="text-gray-600 mb-1">⏳ Days Remaining: <strong>${daysLeft}</strong></p>
        <button 
          class="btn-action bg-yellow-500 text-white mt-2" 
          onclick="openEditDailyReward(${pool.pool_id}, '${reward.token_symbol}', ${reward.daily_reward}, '${pool.deposit_token.symbol}')">
          ✏️ Edit Daily Reward
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="bg-white p-4 rounded shadow">
      <h3 class="text-xl font-bold mb-4">${pool.deposit_token?.symbol || 'Unknown'} Pool</h3>
      <p class="text-gray-600 mb-2">Pool Status: <strong>${pool.status}</strong></p>
      <p class="text-gray-600 mb-2">Created: ${pool.created_at}</p>
      ${rewardsHTML || '<p class="text-gray-500 italic">No rewards configured.</p>'}
      <button 
        class="btn-action bg-yellow-600 text-white mt-4" 
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
    <h3 class="text-xl font-bold mb-4">Edit Daily Reward for ${tokenSymbol}</h3>
    
    <label class="block mb-2 font-semibold">New Daily Reward</label>
    <input id="new-daily-reward" type="number" value="${currentReward}" class="w-full border p-2 rounded mb-4">
    
    <button id="submit-daily-reward" class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded">
      Update Reward
    </button>
    
    <button class="btn-action bg-blue-500 text-white mt-2" onclick="openDepositToPool(${poolId}, '${tokenSymbol}')">
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
          reward_token_symbol: tokenSymbol,  // 👈 parametro corretto per token specifico
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
    <h3 class="text-xl font-bold mb-4">Deposit More ${tokenSymbol} into Pool</h3>
    <p class="text-gray-600 mb-2">Available in Wallet: <strong>${balance}</strong></p>
    <label class="block mb-1">Amount</label>
    <input type="number" id="deposit-amount" class="w-full border p-2 rounded mb-4" placeholder="e.g. 100">
    
    <button class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded" id="submit-deposit">
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
    <h3 class="text-xl font-bold mb-4">Change Pool Status</h3>
    <label class="block mb-2 font-semibold">Select new status</label>
    <select id="pool-status-select" class="w-full border p-2 rounded mb-4">
      <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open</option>
      <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed</option>
      <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>Maintenance</option>
    </select>
    <button id="submit-pool-status" class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded">
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
      fetchAndRenderTokenPools(); // 🔄 Refresh pools
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
    <input type="text" id="search-created-farm" placeholder="Search your farm name..." class="mb-4 p-2 border rounded w-full md:w-1/2">
    <button id="create-new-farm-btn" class="ml-2 px-4 py-2 rounded text-white font-bold shadow bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700">
      ➕ Create New NFTs Farm
    </button>
    <div id="created-farm-buttons" class="flex flex-wrap gap-2 mb-4"></div>
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
      container.innerHTML = `<div class="text-gray-600 italic">You don’t have any NFTs Staking Farm yet.</div>`;
      return;
    }

    // 🔥 SOLUZIONE: assegna i dati globalmente
    window.nftFarmsData = data.farms;

    renderCreatedFarmButtons(data.farms);
    renderCreatedFarmDetails(data.farms[0]);
  } catch (err) {
    container.innerHTML = `<div class="text-red-500">Error loading your farms.</div>`;
    console.error("[❌] Error loading user farms:", err);
  }
} function renderCreatedFarmButtons(farms) {
  const container = document.getElementById('created-farm-buttons');
  const searchInput = document.getElementById('search-created-farm');

  function renderButtons(list) {
    container.innerHTML = '';
    list.forEach(farm => {
      const btn = document.createElement('button');
      btn.className = 'btn-action';
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
    <span class="text-sm text-gray-600 mr-4">
      💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong>
    </span>
  `).join('');

  const templatesHTML = farm.templates.map(tpl => {
    const rewards = tpl.daily_rewards.map(r => `
      <div class="text-xs text-gray-700">
        ${r.token_symbol}: ${parseFloat(r.daily_reward_amount).toFixed(4)}/day
      </div>
    `).join('');

    return `
      <div class="border-t pt-4">
        <h4 class="font-bold mb-2">Template ID: ${tpl.template_id}</h4>
        ${rewards || '<div class="text-sm italic text-gray-400">No rewards configured.</div>'}
        <div class="flex flex-wrap gap-2 mt-2">
          <button class="btn-action bg-yellow-400 hover:bg-yellow-500" onclick="openEditRewards(${tpl.template_id})">✏️ Edit Rewards</button>
          <button class="btn-action bg-green-600 text-white" onclick="openAddReward(${tpl.template_id})">➕ Add Reward</button>
          <button class="btn-action bg-red-600 text-white" onclick="removeTemplate(${tpl.template_id})">🗑️ Remove Template</button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="bg-white p-4 rounded shadow">
      <h3 class="text-xl font-bold mb-2 flex flex-wrap items-center gap-2">
        ${farm.farm_name}
        <span class="text-sm font-normal text-gray-500">
          Status: <strong>${farm.status}</strong> • Created: ${farm.creation_date}
        </span>
      </h3>
      <div class="flex flex-wrap gap-2 mb-4">
        <button class="btn-action" onclick="openAddTemplateForm(${farm.farm_id})">➕ Add Template</button>
        <button class="btn-action" onclick="openDepositForm(${farm.farm_id})">💰 Deposit Rewards</button>
        <button class="btn-action bg-red-500 text-white" onclick="confirmFarmClosure(${farm.farm_id})">🚫 Close Farm</button>
        <button class="btn-action bg-yellow-500 text-black" onclick="changeFarmStatus(${farm.farm_id})">🔄 Change Status</button>
      </div>
      <div class="mb-2 flex flex-wrap gap-2">${rewardHTML}</div>
      ${templatesHTML || '<div class="text-gray-500">No templates added yet.</div>'}
    </div>
  `;
}

function renderNewFarmForm() {
  const container = document.getElementById('created-farm-details');
  container.innerHTML = `
    <div class="bg-white p-6 rounded shadow max-w-xl mx-auto">
      <h3 class="text-xl font-bold mb-4">Create a New NFTs Staking Farm</h3>
      <label class="block mb-2">Farm Name</label>
      <input id="new-farm-name" type="text" class="w-full border p-2 rounded mb-4">
      <button id="submit-new-farm" class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded shadow-md">
        Create Farm
      </button>
    </div>
    <p></p>
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
// ✅ Add Template to Farm
function openAddTemplateForm(farmId) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  const { userId, usx_token } = window.userData;

  body.innerHTML = `
    <h3 class="text-xl font-bold mb-4">➕ Add Template to Farm</h3>
    <label class="block mb-2 font-semibold">Template ID</label>
    <input id="template-id" type="number" class="w-full border p-2 rounded mb-4" placeholder="e.g. 123456">

    <div id="rewards-container">
      <label class="block mb-2 font-semibold">Rewards</label>
      <div class="reward-entry flex gap-2 mb-2">
        <input type="text" class="token-symbol w-1/2 border p-2 rounded" placeholder="Token Symbol (e.g. CHIPS)">
        <input type="number" class="reward-amount w-1/2 border p-2 rounded" placeholder="Amount per day">
      </div>
    </div>

    <button id="add-reward-btn" class="mb-4 text-sm text-blue-600 underline">➕ Add another reward</button>

    <button id="submit-add-template" class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded shadow">
      Add Template
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

  // ➕ Aggiungi nuova riga di reward
  document.getElementById('add-reward-btn').onclick = () => {
    const container = document.getElementById('rewards-container');
    const div = document.createElement('div');
    div.className = 'reward-entry flex gap-2 mb-2';
    div.innerHTML = `
      <input type="text" class="token-symbol w-1/2 border p-2 rounded" placeholder="Token Symbol (e.g. CHIPS)">
      <input type="number" class="reward-amount w-1/2 border p-2 rounded" placeholder="Amount per day">
    `;
    container.appendChild(div);
  };

  // 📤 Submit del form
  document.getElementById('submit-add-template').onclick = async () => {
    const templateId = parseInt(document.getElementById('template-id').value.trim());
    if (!templateId) {
      showToast("Template ID is required", "error");
      return;
    }

    const rewardElements = document.querySelectorAll('.reward-entry');
    const rewards = [];

    for (const el of rewardElements) {
      const symbol = el.querySelector('.token-symbol').value.trim().toUpper();
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
    <h3 class="text-xl font-bold mb-4">Deposit Rewards to Farm</h3>
    <div id="rewards-deposit-container"></div>
    <button id="add-more-reward" class="text-sm text-blue-600 underline mb-4">➕ Add another token</button>
    <button id="submit-deposit" class="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700">Deposit All</button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

  const container = document.getElementById('rewards-deposit-container');
  const addBtn = document.getElementById('add-more-reward');
  const wallet = window.walletBalances || [];
  
  function renderRewardRow(token = '') {
    const wallet = window.walletBalances || [];
    const div = document.createElement('div');
    div.className = 'reward-row mb-6 p-3 border rounded bg-gray-50';
    div.innerHTML = `
      <label class="block text-sm font-medium mb-1">Choose Token</label>
      <select class="token-symbol w-full border p-2 rounded mb-2">
        <option disabled selected value="">-- Select a token --</option>
        ${wallet.map(t => `<option value="${t.symbol}">${t.symbol}</option>`).join('')}
      </select>
  
      <div class="available-balance text-sm text-gray-600 mb-2 hidden"></div>
  
      <label class="block text-sm font-medium mb-1">Select %</label>
      <input type="range" class="percent-range w-full mb-2" min="0" max="100" value="0" disabled>
  
      <label class="block text-sm font-medium mb-1">Amount</label>
      <input type="number" class="amount w-full border p-2 rounded" placeholder="Amount" disabled>
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
  
    document.getElementById('rewards-deposit-container').appendChild(div);
  }

  // Prima riga iniziale
  renderRewardRow();

  addBtn.onclick = () => {
    renderRewardRow();
  };

  document.getElementById('submit-deposit').onclick = async () => {
    const rows = document.querySelectorAll('.reward-row');
    const rewards = [];
    rows.forEach(row => {
      const selectEl = row.querySelector('.token-symbol');
      const symbol = selectEl?.value?.trim();
      const amount = parseFloat(row.querySelector('.amount').value);

      if (!symbol || symbol === "" || isNaN(amount) || amount <= 0) {
        // Skippa riga non valida
        return;
      }
      rewards.push({ token_symbol: symbol.toUpper(), amount });
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
    <h3 class="text-xl font-bold text-red-600 mb-4">Close Farm</h3>
    <p class="mb-4">Are you sure you want to <strong>close</strong> this farm? This will stop all rewards.</p>
    <div class="flex justify-end gap-4">
      <button class="bg-gray-300 px-4 py-2 rounded" onclick="document.getElementById('modal').classList.add('hidden')">Cancel</button>
      <button class="bg-red-600 text-white px-4 py-2 rounded" onclick="changeFarmStatus(${farmId}, 'closed')">Confirm</button>
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
      <h3 class="text-xl font-bold mb-4">Change Farm Status</h3>
      <select id="status-select" class="w-full border p-2 rounded mb-4">
        <option value="open">Open</option>
        <option value="closed">Closed</option>
        <option value="setting">Setting</option>
      </select>
      <button class="bg-yellow-500 hover:bg-yellow-600 text-white w-full py-2 rounded" id="status-confirm">Update</button>
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
} async function openEditRewards(templateId) {
  const { userId, usx_token } = window.userData;
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');

  try {
    // 🔄 Richiama i dati aggiornati
    const res = await fetch(`${BASE_URL}/get_farms?user_id=${userId}&usx_token=${usx_token}`);
    const data = await res.json();

    if (!res.ok || !data.farms) {
      showToast("Error loading farms data", "error");
      return;
    }

    // 🔍 Cerca il template
    const farm = data.farms.find(f => f.templates?.some(t => t.template_id == templateId));
    const template = farm?.templates?.find(t => t.template_id == templateId);

    if (!template) {
      showToast("Template not found", "error");
      return;
    }

    // 🪟 Ora puoi mostrare il modal con i dati sicuri
    modal.classList.remove('hidden');
    document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

    body.innerHTML = `
      <h3 class="text-xl font-bold mb-4">✏️ Edit Rewards for Template ID ${templateId}</h3>
      <div id="rewards-edit-container">
        ${(template.rewards || []).map(r => `
          <div class="reward-entry flex gap-2 mb-2">
            <input type="text" class="token-symbol w-1/2 border p-2 rounded" value="${r.token_symbol}" placeholder="Token Symbol">
            <input type="number" class="reward-amount w-1/2 border p-2 rounded" value="${parseFloat(r.daily_reward_amount)}" placeholder="Amount per day">
          </div>
        `).join('')}
      </div>
      <button id="add-reward-btn" class="mb-4 text-sm text-blue-600 underline">➕ Add another reward</button>
      <button id="submit-edit-rewards" class="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded shadow">
        Update Rewards
      </button>
    `;

    // Aggiunta nuova riga
    document.getElementById('add-reward-btn').onclick = () => {
      const container = document.getElementById('rewards-edit-container');
      const div = document.createElement('div');
      div.className = 'reward-entry flex gap-2 mb-2';
      div.innerHTML = `
        <input type="text" class="token-symbol w-1/2 border p-2 rounded" placeholder="Token Symbol">
        <input type="number" class="reward-amount w-1/2 border p-2 rounded" placeholder="Amount per day">
      `;
      container.appendChild(div);
    };

    // Submit modifiche
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
        await fetchAndRenderUserFarms(); // refresh UI
      } catch (err) {
        console.error(err);
        showToast(err.message, "error");
      }
    };

  } catch (error) {
    console.error("[❌] Failed to open edit modal:", error);
    showToast("Failed to load data", "error");
  }
} window.openEditRewards = openEditRewards;

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
    <h3 class="text-xl font-bold mb-4">➕ Add Reward to Template ID ${templateId}</h3>
    <div class="reward-entry flex gap-2 mb-4">
      <input type="text" id="new-token-symbol" class="w-1/2 border p-2 rounded" placeholder="Token Symbol (e.g. CHIPS)">
      <input type="number" id="new-reward-amount" class="w-1/2 border p-2 rounded" placeholder="Amount per day">
    </div>
    <button id="submit-new-reward" class="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded shadow">
      Add Reward
    </button>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

  document.getElementById('submit-new-reward').onclick = async () => {
    const symbol = document.getElementById('new-token-symbol').value.trim().toUpper();
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
    // New C2E - Twitch Section with Menu
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">C2E - Twitch</h2>
      <div class="menu">
        <button class="menu-btn" data-menu="log-reward-activity">Log Reward Activity</button>
        <button class="menu-btn" data-menu="log-storms-giveaways">Log Storms & Giveaways</button>
        <button class="menu-btn" data-menu="schedule-token-storm">Schedule Token-Storm</button>
        <button class="menu-btn" data-menu="schedule-nft-giveaway">Schedule NFT-Giveaway</button>
      </div>
      <div id="c2e-content">Loading last activity...</div>
    `;

    // Set default view as Log Reward Activity
    loadLogRewardActivity();

    // Handle menu switching
    document.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const menu = e.target.getAttribute('data-menu');
        switch(menu) {
          case 'log-reward-activity':
            loadLogRewardActivity();
            break;
          case 'log-storms-giveaways':
            loadLogStormsGiveaways();
            break;
          case 'schedule-token-storm':
            loadScheduledStorms();
            break;
          case 'schedule-nft-giveaway':
            loadScheduleNFTGiveaway();
            break;
        }
      });
    });
  } else if (section === 'wallet') {
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">Wallet</h2>
      <div id="wallet-table">Caricamento Wallet...</div>
    `;
    loadWallet();
  } else if (section === 'nfts') {
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">My NFTs</h2>
  
      <div class="mb-4 flex flex-wrap gap-4 items-center">
        <input type="text" id="search-template" placeholder="Search by Template Name..." class="p-2 border rounded w-full md:w-1/3">
  
        <select id="filter-status" class="p-2 border rounded">
          <option value="">Status</option>
          <option value="Staked">Staked</option>
          <option value="Not Staked">Not Staked</option>
        </select>
  
        <select id="filter-stakable" class="p-2 border rounded">
          <option value="">Stakeability</option>
          <option value="Stakable">Stakable</option>
          <option value="Not Stakable">Not Stakable</option>
        </select>
  
        <select id="filter-for-sale" class="p-2 border rounded">
          <option value="">Sale Status</option>
          <option value="Yes">For Sale</option>
          <option value="No">Not For Sale</option>
        </select>
  
        <select id="filter-collection" class="p-2 border rounded">
          <option value="">Collection</option>
        </select>
  
        <select id="sort-by" class="p-2 border rounded">
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="template_name_asc">Template (A-Z)</option>
          <option value="template_name_desc">Template (Z-A)</option>
        </select>
      </div>
  
      <div id="bulk-actions" class="mb-4 hidden">
        <button id="bulk-withdraw" class="bg-blue-500 text-white py-2 px-4 rounded mr-2 hover:bg-blue-600">Withdraw Selected</button>
        <button id="bulk-send" class="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600">Send Selected</button>
      </div>
  
      <div id="nfts-loading" class="text-center my-4">🔄 Loading NFTs...</div>
      <div id="nfts-count" class="text-gray-600 mb-2"></div>
  
      <div id="nfts-list" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4"></div>
  
      <div id="pagination" class="flex justify-center items-center space-x-4 mt-6"></div>
  
      <div id="modal-nft" class="fixed inset-0 hidden bg-black bg-opacity-50 flex items-center justify-center">
        <div class="bg-white p-6 rounded shadow max-w-md w-full relative" style="max-height: 80vh; overflow-y: auto;">
          <button id="close-modal" class="absolute top-2 right-2 text-red-600 hover:text-red-800 text-4xl font-bold">&times;</button>
          <div id="modal-content"></div>
        </div>
      </div>
    `;
    loadNFTs();
  } else if (section === 'token-staking') {
    console.log("[🧪] Entrato in blocco token-staking");
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">Token Staking</h2>
  
      <input type="text" id="search-pools" placeholder="Search token pool name" class="mb-4 p-2 border rounded w-full md:w-1/2">
  
      <div id="pool-buttons" class="flex flex-wrap gap-2 mb-6"></div>
  
      <div id="selected-pool-details">
        <div class="text-center text-gray-500">Loading pool data...</div>
      </div>
    `;
    loadStakingPools();  // 🔥 chiamiamo la funzione che popola tutto
  } else if (section === 'nfts-staking') {
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">NFT Staking</h2>
      <div id="nft-farms-container" class="space-y-4">Loading NFT farms...</div>
    `;
    loadNFTFarms();
  } else if (section === 'create-nfts-farm') {
    app.innerHTML = `<h2 class="text-2xl font-semibold mb-4">Create NFTs Staking Farm</h2><div id="create-nfts-farm-container">Loading...</div>`;
    loadCreateNFTFarm(); // definita in create-nft-pool.js
  } else if (section === 'create-token-pool') {
    app.innerHTML = `<h2 class="text-2xl font-semibold mb-4">Create Token Staking Pool</h2><div id="create-token-pool-container">Loading...</div>`;
    loadCreateTokenStaking();
  }
} async function loadNFTFarms() {
  const { userId, usx_token } = window.userData;
  const res = await fetch(`${BASE_URL}/nfts_farms?user_id=${userId}&usx_token=${usx_token}`);
  const data = await res.json();
  console.log("[🐛] Risposta intera da /nfts_farms:", JSON.stringify(data, null, 2));
  if (!data.farms || data.farms.length === 0) {
    document.getElementById('nft-farms-container').innerHTML = `
      <div class="text-red-500">No NFT farms found.</div>`;
    return;
  }

  window.nftFarmsData = data.farms;
  renderNFTFarmButtons(data.farms);

  const defaultFarm = data.farms.find(f => f.farm_name.toLowerCase().includes('chips')) || data.farms[0];
  renderNFTFarms([defaultFarm]);
} function renderNFTFarmButtons(farms) {
  const container = document.getElementById('nft-farms-container');
  container.innerHTML = `
    <input type="text" id="search-nft-farm" placeholder="Search farm name..." class="mb-4 p-2 border rounded w-full md:w-1/2">
    <div id="nft-farm-buttons" class="flex flex-wrap gap-2 mb-4"></div>
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
} function renderNFTFarms(farms) {
  const container = document.getElementById('nft-farm-details');
  let html = '';

  // ✅ Messaggio introduttivo UNA SOLA VOLTA
  html += `
    <p class="italic text-gray-600 mb-2">
      Don’t have a NFT farm in CHIPS Wallet for your collection yet? You can create one 
      <button onclick="loadSection('create-nfts-farm')"
        class="ml-2 px-4 py-1 bg-yellow-400 text-gray-900 font-bold rounded-lg border-2 border-black shadow-lg transform hover:-translate-y-1 hover:shadow-xl transition-all duration-200 hover:bg-yellow-300 hover:text-black">
        Create NFTs Farm
      </button>
    </p>
  `;

  farms.forEach(farm => {
    const templatesHTML = (farm.templates || []).map(template => {
      const nftsHTML = (template.user_nfts || []).map(nft => `
        <div class="bg-gray-100 p-2 rounded shadow-sm text-sm text-center">
          <img src="${nft.asset_img}" alt="NFT"
            class="w-full h-24 object-contain mb-1 rounded"
            onerror="this.onerror=null;this.src='https://via.placeholder.com/150?text=Image+Not+Found';">
          <div class="font-semibold truncate">${nft.template_name}</div>
          <div class="text-xs text-gray-600">#${nft.asset_id}</div>
          <button class="mt-1 w-full text-white py-1 rounded ${nft.is_staked ? 'bg-red-500' : 'bg-green-500'}"
            onclick="handleNFTStake(${farm.farm_id}, ${template.template_id}, '${nft.asset_id}', ${nft.is_staked})">
            ${nft.is_staked ? 'Unstake' : 'Stake'}
          </button>
        </div>
      `).join('');

      const rewardsHTML = (template.rewards || []).map(r => {
        const daily = parseFloat(r.daily_reward_amount);
        return `
          <div class="text-xs text-gray-700">
            ${r.token_symbol}: ${isNaN(daily) ? "N/A" : daily.toFixed(4)}/day
          </div>
        `;
      }).join('') || '<div class="text-sm text-gray-500 italic">No rewards</div>';

      return `
        <div class="border-t pt-4">
          <h4 class="font-bold mb-2">Template ID: ${template.template_id}</h4>
          ${rewardsHTML}
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mt-2">
            ${nftsHTML || '<div class="text-gray-400 text-sm col-span-full">You don’t own NFTs for this template</div>'}
          </div>
        </div>
      `;
    }).join('');

    const farmRewards = (farm.farm_rewards || []).map(r => `
      <span class="ml-2">
        💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong>
      </span>
    `).join('');

    html += `
      <div class="bg-white p-4 rounded shadow">
        <h3 class="text-xl font-bold mb-2 flex flex-wrap items-center gap-2">
          ${farm.farm_name}
          <span class="text-sm font-normal text-gray-500">
            ${farmRewards}
          </span>
        </h3>
        ${templatesHTML}
      </div>
    `;
  });

  // ✅ Imposta tutto insieme
  container.innerHTML = html;
} // Load Log Reward Activity
async function loadLogRewardActivity() {
  const container = document.getElementById('c2e-content');
  container.innerHTML = 'Loading Log Reward Activity...';  // Mostra un messaggio di caricamento

  try {
    // Richiesta GET all'endpoint per ottenere i log delle attività di reward
    const res = await fetch(`${BASE_URL}/log_reward_activity`);
    
    // Verifica se la risposta è stata ok
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    // Ottieni i dati in formato JSON
    const data = await res.json();

    // Se non ci sono dati, mostra un messaggio
    if (data.length === 0) {
      container.innerHTML = '<div>No reward activity logs found.</div>';
      return;
    }

    // Funzione per visualizzare i dati in una tabella
    displayLogData(data);

  } catch (err) {
    // Gestione degli errori, nel caso ci sia un problema con la richiesta
    container.innerHTML = `<div class="text-red-500">Error loading log reward activity: ${err.message}</div>`;
  }
}

function displayLogData(data) {
  const container = document.getElementById('c2e-content');
  
  // Crea una tabella HTML
  let tableHTML = '<table class="table-auto border-collapse w-full text-sm text-left text-gray-900">';
  tableHTML += '<thead>';
  tableHTML += '<tr>';
  tableHTML += '<th class="border px-4 py-2">Username</th>';
  tableHTML += '<th class="border px-4 py-2">Token</th>';
  tableHTML += '<th class="border px-4 py-2">Amount</th>';
  tableHTML += '<th class="border px-4 py-2">Channel</th>';
  tableHTML += '<th class="border px-4 py-2">Sponsor</th>';
  tableHTML += '<th class="border px-4 py-2">Timestamp</th>';
  tableHTML += '</tr>';
  tableHTML += '</thead>';

  // Aggiungi i dati alla tabella
  tableHTML += '<tbody>';
  data.forEach(record => {
    tableHTML += `<tr>`;
    tableHTML += `<td class="border px-4 py-2">${record.username}</td>`;
    tableHTML += `<td class="border px-4 py-2">${record.token_symbol}</td>`;
    tableHTML += `<td class="border px-4 py-2">${record.amount}</td>`;
    tableHTML += `<td class="border px-4 py-2">${record.channel}</td>`;
    tableHTML += `<td class="border px-4 py-2">${record.origin_channel}</td>`;
    tableHTML += `<td class="border px-4 py-2">${new Date(record.timestamp).toLocaleString()}</td>`;
    tableHTML += `</tr>`;
  });
  tableHTML += '</tbody>';

  tableHTML += '</table>';

  // Inserisci la tabella nel contenitore
  container.innerHTML = tableHTML;
}

// Load Log Storms & Giveaways
async function loadLogStormsGiveaways() {
  const container = document.getElementById('c2e-content');
  container.innerHTML = 'Loading Log Storms & Giveaways...';

  try {
    // Mostra il modulo per aggiungere una nuova tempesta solo una volta
    container.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">Add New Scheduled Storm</h2>
      <div id="add-storm-form">
        <label class="block mb-2">Scheduled Time</label>
        <input type="datetime-local" id="scheduledTime" class="w-full border p-2 rounded mb-4">
        
        <label class="block mb-2">Amount</label>
        <input type="number" id="amount" class="w-full border p-2 rounded mb-4">
        
        <label class="block mb-2">Token Symbol</label>
        <input type="text" id="tokenSymbol" class="w-full border p-2 rounded mb-4">
        
        <label class="block mb-2">Timeframe</label>
        <input type="text" id="timeframe" class="w-full border p-2 rounded mb-4">
        
        <label class="block mb-2">Channel</label>
        <input type="text" id="channelName" class="w-full border p-2 rounded mb-4">
        
        <label class="block mb-2">Payment Method</label>
        <select id="paymentMethod" class="w-full border p-2 rounded mb-4">
          <option value="twitch">Twitch</option>
          <option value="telegram">Telegram</option>
        </select>

        <button id="submitStorm" class="bg-green-600 text-white py-2 px-4 rounded">Add Storm</button>
      </div>
      <h2 class="text-2xl font-semibold mt-6 mb-4">Scheduled Storms</h2>
      <div id="scheduled-storms-table">
        Loading Scheduled Storms...
      </div>
    `;

    // Aggiungi evento per inviare il form
    document.getElementById('submitStorm').addEventListener('click', addScheduledStorm);

    // Carica la tabella delle tempeste programmate
    loadScheduledStorms(); // Carica la tabella senza sovrascrivere il modulo

  } catch (err) {
    container.innerHTML = `<div class="text-red-500">Error loading log storms and giveaways: ${err.message}</div>`;
  }
}
// Funzione per caricare le tempeste programmate
async function loadScheduledStorms() {
  const tableContainer = document.getElementById('scheduled-storms-table');  // Sezione solo per la tabella
  tableContainer.innerHTML = 'Loading Scheduled Storms...';  // Mostra un messaggio di caricamento

  try {
    // Richiesta GET all'endpoint per ottenere le tempeste programmate
    const res = await fetch(`${BASE_URL}/scheduled_storms`);
    
    // Verifica se la risposta è stata ok
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    // Ottieni i dati in formato JSON
    const data = await res.json();

    // Se i dati sono vuoti, mostra un messaggio
    if (data.length === 0) {
      tableContainer.innerHTML = '<div>No scheduled storms found.</div>';
      return;
    }

    // Funzione per visualizzare i dati in una tabella
    displayStormsData(data);  // Visualizza i dati

  } catch (err) {
    // Gestione degli errori, nel caso ci sia un problema con la richiesta
    tableContainer.innerHTML = `<div class="text-red-500">Error loading scheduled storms: ${err.message}</div>`;
  }
}


// Funzione per visualizzare i dati delle tempeste programmate
function displayStormsData(data) {
  const tableContainer = document.getElementById('scheduled-storms-table');  // Contenitore della tabella
  
  // Crea una tabella HTML
  let tableHTML = '<table class="table-auto border-collapse w-full text-sm text-left text-gray-900">';
  tableHTML += '<thead>';
  tableHTML += '<tr>';
  tableHTML += '<th class="border px-4 py-2">ID</th>';
  tableHTML += '<th class="border px-4 py-2">Scheduled Time</th>';
  tableHTML += '<th class="border px-4 py-2">Offered By</th>';
  tableHTML += '<th class="border px-4 py-2">Amount</th>';
  tableHTML += '<th class="border px-4 py-2">Token</th>';
  tableHTML += '<th class="border px-4 py-2">Channel</th>';
  tableHTML += '<th class="border px-4 py-2">Status</th>';
  tableHTML += '</tr>';
  tableHTML += '</thead>';

  // Aggiungi i dati alla tabella
  tableHTML += '<tbody>';
  data.forEach(storm => {
    tableHTML += `<tr>`;
    tableHTML += `<td class="border px-4 py-2">${storm.id}</td>`;
    tableHTML += `<td class="border px-4 py-2">${new Date(storm.scheduled_time).toLocaleString()}</td>`;
    tableHTML += `<td class="border px-4 py-2">${storm.offered_by}</td>`;
    tableHTML += `<td class="border px-4 py-2">${storm.amount}</td>`;
    tableHTML += `<td class="border px-4 py-2">${storm.token_symbol}</td>`;
    tableHTML += `<td class="border px-4 py-2">${storm.channel_name}</td>`;
    tableHTML += `<td class="border px-4 py-2">${storm.status}</td>`;
    tableHTML += `</tr>`;
  });
  tableHTML += '</tbody>';

  tableHTML += '</table>';

  // Inserisci la tabella solo nel contenitore della tabella
  tableContainer.innerHTML = tableHTML;  // Ora aggiorniamo solo la tabella
}
// Funzione per aggiungere una nuova tempesta programmata
async function addScheduledStorm() {
  const container = document.getElementById('c2e-content');
  
  // Ottieni i dati del modulo (puoi anche fare riferimento a un form HTML)
  const scheduledTime = document.getElementById('scheduledTime').value; // esempio di input
  const amount = document.getElementById('amount').value;
  const tokenSymbol = document.getElementById('tokenSymbol').value;
  const timeframe = document.getElementById('timeframe').value;
  const channelName = document.getElementById('channelName').value;
  const paymentMethod = document.getElementById('paymentMethod').value;
  // Prendi il wax_account da window.userData
  const { userId, usx_token, wax_account } = window.userData;
  // Se non c'è wax_account, mostra un errore
  if (!wax_account) {
    container.innerHTML = `<div class="text-red-500">Error: wax_account is missing.</div>`;
    return;
  }
  const payload = {
    scheduled_time: scheduledTime,
    amount: amount,
    token_symbol: tokenSymbol,
    timeframe: timeframe,
    channel_name: channelName,
    payment_method: paymentMethod,
    wax_account: wax_account,
  };

  try {
    // Richiesta POST per aggiungere la tempesta
    const res = await fetch(`${BASE_URL}/add_storm?user_id=${userId}&&usx_token=${usx_token}&wax_account=${wax_account}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    // Verifica se la risposta è stata ok
    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await res.json();
    
    if (data.success) {
      container.innerHTML = `<div class="text-green-500">${data.message}</div>`;
    } else {
      container.innerHTML = `<div class="text-red-500">Error: ${data.error}</div>`;
    }

  } catch (err) {
    // Gestione degli errori nel caso ci sia un problema con la richiesta
    container.innerHTML = `<div class="text-red-500">Error adding scheduled storm: ${err.message}</div>`;
  }
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
    container.innerHTML = `<div class="text-red-500">Error loading schedule nft-giveaway: ${err.message}</div>`;
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
      <div class="text-red-500">No staking pools found.</div>`;
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

  // Calcolo responsivo colonne
  let gridColumns = 'grid-cols-1';
  if (rewardsCount === 2) {
    gridColumns = 'grid-cols-2';
  } else if (rewardsCount > 2) {
    gridColumns = 'sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2';
  }

  const rewardsHTML = rewards.map(r => `
    <div class="p-2 border-b md:border md:rounded">
      <div class="font-bold text-yellow-700">${r.reward_token}</div>
      <div><strong>Total:</strong> ${r.total_reward_deposit}</div>
      <div><strong>Daily:</strong> ${r.daily_reward}</div>
      <div><strong>APR:</strong> ${r.apr}%</div>
      <div><strong>Days Left:</strong> ${r.days_remaining}</div>
      <div class="text-green-700 font-semibold"><strong>Your Daily:</strong> ${r.user_daily_reward}</div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="bg-white shadow rounded p-4">
      <h3 class="text-xl font-bold mb-2">Pool: ${pool.token_symbol}</h3>
      <p class="text-sm text-gray-500 mb-2">Total Staked: <strong>${pool.total_staked}</strong></p>
      <p class="text-sm text-gray-500 mb-4">You Staked: <strong>${pool.user_staked}</strong></p>
      <div class="flex flex-wrap gap-4 mb-4">
        <button class="btn-action" onclick="openStakeModal('add', ${pool.pool_id}, '${pool.token_symbol}')">Add Tokens</button>
        <button class="btn-action" onclick="openStakeModal('remove', ${pool.pool_id}, '${pool.token_symbol}')">Remove Tokens</button>
      </div>      
      <h4 class="font-semibold mb-2">Rewards</h4>
      <div class="grid gap-4 ${gridColumns}">
        ${rewardsHTML}
      </div> 
    </div>
  `;
} function openStakeModal(type, poolId, tokenSymbol) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const wax_account = window.userData.wax_account;
  const user_id = window.userData.userId;
  const usx_token = window.userData.usx_token;
  let balance = 0;
  if (type === 'add') {
    const tokenData = window.walletBalances?.find(t => t.symbol === tokenSymbol);
    balance = tokenData ? parseFloat(tokenData.amount) : 0;
    console.log(`[🔎] Bilancio wallet per ${tokenSymbol}:`, balance);
  } else if (type === 'remove') {
    const pool = window.stakingPools?.find(p => p.pool_id === poolId);
    balance = pool ? parseFloat(pool.user_staked || "0") : 0;
    console.log(`[🔎] Staked balance in pool ${poolId} per ${tokenSymbol}:`, balance);
  }
  const title = type === 'add' ? 'Add Tokens to Farm' : 'Remove Tokens from Farm';
  const actionUrl = type === 'add' ? 'stake_add' : 'stake_remove';
  const availableLabel = type === 'add' ? 'Available in Wallet' : 'Staked in Farm';
  modalBody.innerHTML = `
    <h3 class="text-xl font-bold mb-4">${title}</h3>
    <p class="text-gray-600 mb-2">${availableLabel}: <strong>${balance.toFixed(4)}</strong> ${tokenSymbol}</p>
    <label class="block mb-1 text-sm">Select %</label>
    <input id="stake-range" type="range" min="0" max="100" value="0" class="w-full mb-2">
    <label class="block mb-1 text-sm">Amount</label>
    <input id="stake-amount" type="number" step="0.0001" class="w-full border p-2 rounded mb-4" value="0">
    <div id="stake-summary" class="text-sm text-gray-500 mb-4"></div>
    <button class="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700" id="stake-submit">
      Go!
    </button>
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
      loadStakingPools(); // Refresh
    } catch (err) {
      console.error(err);
      showToast("Operation failed: " + err.message, "error");
    }
  };
} // Caricamento Wallet reale
async function loadWallet() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const saldoData = await response.json();

    // 🔥 Salva globalmente i dati del wallet
    window.walletBalances = saldoData.balances || [];
    console.info("[🧮] walletBalances salvati:", window.walletBalances);

    const walletTable = document.getElementById('wallet-table');
    if (!walletTable) {
      console.warn("[⚠️] wallet-table non trovato nel DOM. Skipping render.");
      return; // Non continuare se la tabella non è nel DOM
    }

    if (window.walletBalances.length > 0) {
      walletTable.innerHTML = `
        <div class="w-full">
          <table class="w-full table-auto bg-white rounded-lg shadow text-xs">
            <thead class="bg-gray-200">
              <tr>
                <th class="px-2 py-1 w-1/4 text-left">Token</th>
                <th class="px-2 py-1 w-1/4 text-left">Amount</th>
                <th class="px-2 py-1 w-1/4 text-left">Stakeable</th>
                <th class="px-2 py-1 w-1/4 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${window.walletBalances.map(token => `
                <tr class="border-t">
                  <td class="px-2 py-1 font-bold">${token.symbol}</td>
                  <td class="px-2 py-1">${token.amount}</td>
                  <td class="px-2 py-1">${token.stakeable}</td>
                  <td class="px-2 py-1 flex flex-wrap gap-1">
                    <button class="btn-action" data-action="withdraw" data-token="${token.symbol}">Withdraw</button>
                    <button class="btn-action" data-action="swap" data-token="${token.symbol}">Swap</button>
                    <button class="btn-action" data-action="transfer" data-token="${token.symbol}">Transfer</button>
                    <button class="btn-action" data-action="stake" data-token="${token.symbol}">Stake</button>
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
      walletTable.innerHTML = `
        <div class="text-center text-gray-500">No balances available.</div>
      `;
    }
  } catch (error) {
    console.error("[❌] Error loading Wallet:", error);
  }
} async function loadNFTs() {
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

  // Ricerca
  const search = document.getElementById('search-template').value.toLowerCase();
  if (search) {
    filtered = filtered.filter(nft => nft.template_info.template_name.toLowerCase().includes(search));
  }

  const status = document.getElementById('filter-status').value;
  const stakable = document.getElementById('filter-stakable').value;
  const forSale = document.getElementById('filter-for-sale').value;
  const collection = document.getElementById('filter-collection').value;

  if (status) filtered = filtered.filter(nft => nft.is_staked === status);
  if (status === "Staked") {
    document.getElementById('filter-stakable').parentElement.style.display = 'none';
  } else {
    document.getElementById('filter-stakable').parentElement.style.display = 'block';
    if (stakable) filtered = filtered.filter(nft => nft.is_stakable === stakable);
  }

  if (forSale) filtered = filtered.filter(nft => nft.for_sale === forSale);
  if (collection) filtered = filtered.filter(nft => nft.template_info.collection_name === collection);

  // Ordinamento
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

  // PAGINAZIONE
  const totalPages = Math.ceil(filtered.length / window.nftsPerPage);
  if (window.currentPage > totalPages) window.currentPage = totalPages || 1;

  const start = (window.currentPage - 1) * window.nftsPerPage;
  const end = start + window.nftsPerPage;
  const pageNFTs = filtered.slice(start, end);

  if (pageNFTs.length > 0) {
    nftsList.innerHTML = pageNFTs.map(nft => `
      <div class="bg-white rounded-lg shadow relative p-2 hover:shadow-lg transition">
        <input type="checkbox" 
          class="absolute top-2 left-2 w-5 h-5 z-10" 
          onclick="toggleNFTSelection(event, '${nft.asset_id}')" 
          ${window.selectedNFTs.has(nft.asset_id) ? "checked" : ""}>
        
        <div onclick="openNFTModal('${nft.asset_id}')" class="nft-card-content cursor-pointer">
          <img src="${nft.image_url}" alt="NFT Image" class="w-full h-48 object-contain rounded">
          <h3 class="text-md font-semibold mt-2 truncate">${nft.template_info.template_name}</h3>
          <p class="text-gray-500 text-xs truncate">#${nft.asset_id}</p>
        </div>
      </div>
    `).join('');
  } else {
    nftsList.innerHTML = `<div class="text-center text-gray-500">No NFTs match your filters.</div>`;
  }

  renderPagination(totalPages);
  updateBulkActions();
} function toggleNFTSelection(event, assetId) {
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

  let html = `
    <button onclick="changePage(window.currentPage - 1)" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400" ${window.currentPage === 1 ? "disabled" : ""}>Previous</button>
    <span class="px-4">${window.currentPage} / ${totalPages}</span>
    <button onclick="changePage(window.currentPage + 1)" class="px-3 py-1 bg-gray-300 rounded hover:bg-gray-400" ${window.currentPage === totalPages ? "disabled" : ""}>Next</button>
  `;
  pagination.innerHTML = html;
} function changePage(newPage) {
  if (newPage < 1) newPage = 1;
  const totalPages = Math.ceil(window.nftsData.length / window.nftsPerPage);
  if (newPage > totalPages) newPage = totalPages;
  window.currentPage = newPage;
  renderNFTs();
} function openNFTModal(assetId) {
  const nft = window.nftsData.find(n => n.asset_id === assetId);
  if (!nft) return;

  const modal = document.getElementById('modal-nft');
  const content = document.getElementById('modal-content');

  content.innerHTML = `
    <img src="${nft.image_url}" alt="NFT Image" class="w-full object-contain mb-4 rounded">
    <h2 class="text-xl font-bold mb-2">${nft.template_info.template_name}</h2>
    <p class="text-gray-600 mb-1"><strong>Asset ID:</strong> ${nft.asset_id}</p>
    <p class="text-gray-600 mb-1"><strong>Collection:</strong> ${nft.template_info.collection_name}</p>
    <p class="text-gray-600 mb-1"><strong>Schema:</strong> ${nft.template_info.schema_name}</p>
    <p class="text-gray-600 mb-1"><strong>Stakeable:</strong> ${nft.is_stakable}</p>
    <p class="text-gray-600 mb-1"><strong>Staked:</strong> ${nft.is_staked}</p>
    <p class="text-gray-600 mb-1"><strong>For Sale:</strong> ${nft.for_sale}</p>
    <p class="text-gray-600 mb-1"><strong>Transferable:</strong> ${nft.template_info.is_transferable ? "Yes" : "No"}</p>
    <p class="text-gray-400 text-xs mt-2">Acquired: ${new Date(nft.created_at).toLocaleDateString()}</p>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
} function setupFilterEvents() {
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

  let contractIn = ""; // Initialize contractIn here

  if (action === "swap") {
    // 🔥 Perform token contract search when opening the modal, for safety and to ensure it's correct
    const match = availableTokens.find(t => t.split("-")[0].toLowerCase() === token.toLowerCase());

    if (match) {
      // If a match is found, assign the contract part to contractIn
      contractIn = match.split("-")[1];
      console.info(`[✅] Token ${token} contract found: ${contractIn}`);
    } else {
      // If no match is found, log an error and proceed without setting contractIn
      console.error(`[❌] No contract found for token: ${token}`);
    }

    // Layout for Swap action
    modalBody.innerHTML = `
      <h3 class="text-xl font-semibold mb-4">Swap ${token}</h3>
      <div class="mb-2 text-gray-600">
        Available Balance: <span class="font-semibold">${balance}</span> ${token}
      </div>
      <form id="action-form" class="space-y-4">
        <div>
          <label class="block mb-1">Percentage</label>
          <input type="range" id="percent-range" class="w-full" min="0" max="100" value="0">
        </div>
        <div>
          <label class="block mb-1">Amount to Swap</label>
          <input type="number" id="amount" class="w-full p-2 border rounded" required min="0.0001" step="0.0001">
        </div>
        <div>
          <label class="block mb-1">Choose Output Token</label>
          <input type="text" id="token-search" placeholder="Search token..." class="w-full p-2 border rounded mb-2">
          <select id="token-output" class="w-full p-2 border rounded" size="5"></select>
        </div>
        <div id="swap-preview" class="my-4 text-gray-600 hidden">
          <div id="loading-spinner" class="text-center my-2">🔄 Getting blockchain data...</div>
          <div id="swap-data" class="hidden">
            <div>Minimum Received: <span id="min-received" class="font-semibold"></span></div>
            <div>Price Impact: <span id="price-impact" class="font-semibold"></span>%</div>
          </div>
        </div>
        <button id="preview-button" type="button" class="w-full bg-yellow-500 text-white py-2 rounded hover:bg-yellow-600">
          Preview Swap
        </button>
        <button id="submit-button" type="submit" class="w-full bg-green-600 text-white py-2 rounded hover:bg-green-700" disabled>
          Confirm Swap
        </button>
      </form>
    `;

    // Load tokens for dropdown and preview button click handler (as already implemented)
    await loadAvailableTokens();

  } else {
    // Layout for Withdraw, Transfer, Stake (no changes here)
    modalBody.innerHTML = `
      <h3 class="text-xl font-semibold mb-4">${actionTitle} ${token}</h3>
      <div class="mb-2 text-gray-600">
        Available Balance: <span class="font-semibold">${balance}</span> ${token}
      </div>
      ${action === 'transfer' ? `
        <div class="mb-2">
          <label class="block mb-1 text-gray-600">Recipient Wax Account</label>
          <input type="text" id="receiver" class="w-full p-2 border rounded" placeholder="Enter destination wax_account" required>
        </div>
      ` : `
        <div class="mb-2 text-gray-600">
          Destination Wax Account: <span class="font-semibold">${window.userData.wax_account}</span>
        </div>
      `}
      <form id="action-form" class="space-y-4">
        <div>
          <label class="block mb-1">Percentage</label>
          <input type="range" id="percent-range" class="w-full" min="0" max="100" value="0">
        </div>
        <div>
          <label class="block mb-1">Amount</label>
          <input type="number" id="amount" class="w-full p-2 border rounded" required min="0.0001" step="0.0001">
        </div>
        <button id="submit-button" type="submit" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Confirm ${actionTitle}
        </button>
      </form>
    `;

  }

  modal.classList.remove('hidden');
  document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');
 // Now handle the button actions for 'swap'
  const percentRange = document.getElementById('percent-range');
  const amountInput = document.getElementById('amount');
  const submitButton = document.getElementById('submit-button');

  let swapPreview, loadingSpinner, swapDataContainer, executionPriceSpan, minReceivedSpan, priceImpactSpan;
  let tokenSearch, tokenOutput, previewButton;

  if (action === "swap") {
    swapPreview = document.getElementById('swap-preview');
    loadingSpinner = document.getElementById('loading-spinner');
    swapDataContainer = document.getElementById('swap-data');
    executionPriceSpan = document.getElementById('execution-price');
    minReceivedSpan = document.getElementById('min-received');
    priceImpactSpan = document.getElementById('price-impact');
    tokenSearch = document.getElementById('token-search');
    tokenOutput = document.getElementById('token-output');
    previewButton = document.getElementById('preview-button');

    // Load tokens only if not already loaded
    if (availableTokens.length === 0) {
      await loadAvailableTokens();
    }

    function updateTokenDropdown(tokens) {
      tokenOutput.innerHTML = tokens.map(t => `<option value="${t}">${t}</option>`).join('');
    }

    // Filter token list based on user input in the search field
    tokenSearch.addEventListener('input', () => {
      const search = tokenSearch.value.toLowerCase();
      const filtered = availableTokens.filter(t => t.toLowerCase().includes(search));
      updateTokenDropdown(filtered);
    });

    // Button to preview swap
    previewButton.addEventListener('click', async () => {
      const amount = parseFloat(amountInput.value);
      const outputSelection = tokenOutput.value;
      if (!amount || amount <= 0 || !outputSelection) {
        alert("Please enter a valid amount and select output token.");
        return;
      }
      let [symbolOut, contractOut] = outputSelection.split("-");
      symbolOut = symbolOut.toLowerCase();
      contractOut = contractOut.toLowerCase();
      const symbolIn = token.toLowerCase();
      const contractInLower = contractIn ? contractIn.toLowerCase() : ""; // Ensure contractIn is valid

      if (!contractInLower) {
        console.error("[❌] ContractIn is missing or invalid. Aborting swap preview.");
        alert("Token contract not found. Unable to proceed with the swap preview.");
        return;
      }

      const apiUrl = `https://alcor.exchange/api/v2/swapRouter/getRoute?trade_type=EXACT_INPUT&input=${symbolIn}-${contractInLower}&output=${symbolOut}-${contractOut}&amount=${amount}`;

      swapPreview.classList.remove('hidden');
      loadingSpinner.classList.remove('hidden');
      swapDataContainer.classList.add('hidden');

      try {
        const response = await fetch(apiUrl);
        const data = await response.json();
      
        // Sottrarre il 10% da Minimum Received
        let minReceived = data.minReceived || 0;
        minReceived = minReceived * 0.90;  // Sottrai il 10%
      
        // Aggiornare i valori nell'interfaccia utente
        minReceivedSpan.textContent = minReceived.toFixed(4) || "-";  // Mostra il valore sottratto del 10%
        priceImpactSpan.textContent = data.priceImpact || "-";
      
        loadingSpinner.classList.add('hidden');
        swapDataContainer.classList.remove('hidden');
        submitButton.disabled = false;
      } catch (error) {
        console.error("[❌] Error fetching swap preview:", error);
        loadingSpinner.innerHTML = `<div class="text-red-500">⚠️ Failed to load blockchain data.</div>`;
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
}

// Funzione che esegue azioni reali
async function executeAction(action, token, amount, tokenOut = null, contractOut = null) {
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
      // Verifica se `window.tokenPoolsData` è già stato caricato
      if (!window.tokenPoolsData || window.tokenPoolsData.length === 0) {
        console.info("[🧰] Caricamento dati delle staking pools...");
        
        // Chiama la funzione per caricare i dati delle pools
        await fetchAndRenderTokenPools(false);

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
// Funzione toast dinamico
function showToast(message, type = "success") {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');

  toast.className = `
    p-4 rounded shadow mb-2
    ${type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}
  `;
  toast.innerText = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 10000); // 🔥 Lieve miglioramento: aumentato a 10s così si leggono bene i dettagli swap
}

// Avvio app
initApp();
