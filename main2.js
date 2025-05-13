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

function applyThemeClasses(el, ...classes) {
  const currentTheme = document.body.className.split(' ').find(c => c.startsWith('theme-'));
  if (currentTheme) el.classList.add(...classes, currentTheme);
}

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

    // Gestione visuale dei pulsanti attivi
    document.querySelectorAll('.menu-btn').forEach(b => {
      b.classList.remove('active', 'bg-blue-700');
    });
    e.target.classList.add('active', 'btn-action');

    // Gestione sottomenu
    const submenu = e.target.nextElementSibling;
    if (submenu && submenu.classList.contains('submenu')) {
      const isVisible = !submenu.classList.contains('hidden');
      document.querySelectorAll('.submenu').forEach(s => s.classList.add('hidden'));
      if (!isVisible) submenu.classList.remove('hidden');
    } else {
      document.querySelectorAll('.submenu').forEach(s => s.classList.add('hidden'));
    }
  });
 btn.addEventListener('click', (e) => {
 const section = e.target.getAttribute('data-section');
 loadSection(section);
 });
 });

 console.info("[🏁] initApp completato senza errori.");

 } catch (error) {
 console.error("[❌] Errore critico in initApp:", error);
 document.getElementById('app').innerHTML = `
 <div class="text-red">
 Errore: ${error.message}<br>Verifica il link o rifai il login.
 </div>`;
 }
}
async function loadCreateTokenStaking() {
 const container = document.getElementById('create-token-pool-container');
 console.log("[📦] Contenitore trovato:", container);
container.innerHTML = `
  <input type="text" id="search-token-pool" placeholder="Search your token..." class="theme-input">
  <button id="create-new-token-pool-btn" class="btn-action">
    ➕ Create New Token Pool
  </button>
  <div id="created-token-pools" class="theme-token-pool-list theme-box"></div>
  <div id="token-pool-details" class="modal theme-card"></div>
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
 window.tokenPoolsData = data.pools; // Salva i dati senza fare rendering
 return; // Esci dalla funzione senza fare rendering
 }

 // Se la flag shouldRender è true, esegui il rendering
 if (shouldRender) {
 if (!res.ok || !data.pools) {
  container.innerHTML = `
    <div class="no-token-pools-message theme-box">
      No token staking pools found.
    </div>
  `;
 return;
 }

 window.tokenPoolsData = data.pools;
 console.log("[📦] window.tokenPoolsData assegnato:", window.tokenPoolsData);
 renderCreatedTokenPoolButtons(data.pools);
 renderTokenPoolDetails(data.pools[0]);
 }
 } catch (err) {
 if (container && shouldRender) {
container.innerHTML = `
  <div class="error-message theme-box">
    Error loading token pools.
  </div>
`;

 }
 console.error("[❌] Error loading pools:", err);
 }
}
 function renderNewTokenPoolForm() {
 const container = document.getElementById('token-pool-details');
container.innerHTML = `
  <div class="theme-card max-w-xl mx-auto">
    <h3 class="theme-title">Create a New Token Staking Pool</h3>

    <label class="block mb-2 font-semibold">Deposit Token Symbol</label>
    <input id="new-token-symbol" type="text" class="theme-input" placeholder="e.g. CHIPS">

    <div id="reward-token-entries"></div>

    <button class="btn-action" id="add-reward-token">
      ➕ Add Reward Token
    </button>

    <button id="submit-new-token-pool" class="btn-action">
      Create Pool
    </button>
  </div>
`;

 let rewardIndex = 0;

 function addRewardTokenEntry() {
 const wrapper = document.getElementById('reward-token-entries');
const html = `
  <div class="reward-token-entry theme-card mb-4">
    <label class="block font-semibold mb-1">Reward Token Symbol</label>
    <input type="text" class="reward-symbol theme-input" placeholder="e.g. WAX">

    <label class="block font-semibold mb-1">Total Reward Amount</label>
    <input type="number" class="reward-total theme-input" placeholder="e.g. 1000">

    <label class="block font-semibold mb-1">Daily Reward</label>
    <input type="number" class="reward-daily theme-input" placeholder="e.g. 10">
  </div>
`;

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
 applyThemeClasses(btn, 'btn-action');
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
  <div class="theme-card">
    <p class="theme-text"><strong>🎯 Token:</strong> ${reward.token_symbol}</p>
    <p class="theme-text">💰 Total Deposited: <strong>${reward.total_reward_deposit}</strong></p>
    <p class="theme-text">📅 Daily Reward: <strong>${reward.daily_reward}</strong></p>
    <p class="theme-text">⏳ Days Remaining: <strong>${daysLeft}</strong></p>
    <button 
      class="btn-action"
      onclick="openEditDailyReward(${pool.pool_id}, '${reward.token_symbol}', ${reward.daily_reward}, '${pool.deposit_token.symbol}')">
      ✏️ Edit Daily Reward
    </button>
  </div>
`;

container.innerHTML = `
  <div class="theme-card">
    <h3 class="theme-title">${pool.deposit_token?.symbol || 'Unknown'} Pool</h3>
    <p class="theme-text">Pool Status: <strong>${pool.status}</strong></p>
    <p class="theme-text">Created: ${pool.created_at}</p>
    ${rewardsHTML || '<p class="theme-alert">No rewards configured.</p>'}
    <button 
      class="btn-action"
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
  <h3 class="theme-title">Edit Daily Reward for ${tokenSymbol}</h3>

  <label class="block mb-2 font-semibold">New Daily Reward</label>
  <input id="new-daily-reward" type="number" value="${currentReward}" class="theme-input">

  <button id="submit-daily-reward" class="btn-action">
    Update Reward
  </button>

  <button class="btn-action" onclick="openDepositToPool(${poolId}, '${tokenSymbol}')">
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
 reward_token_symbol: tokenSymbol, // 👈 parametro corretto per token specifico
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
  <h3 class="theme-title">Deposit More ${tokenSymbol} into Pool</h3>
  <p class="theme-text">Available in Wallet: <strong>${balance}</strong></p>
  <label class="block mb-1">Amount</label>
  <input type="number" id="deposit-amount" class="theme-input" placeholder="e.g. 100">

  <button class="btn-action" id="submit-deposit">
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
  <h3 class="theme-title mb-4">Change Pool Status</h3>

  <label class="block mb-2 font-semibold">Select new status</label>
  <select id="pool-status-select" class="theme-input">
    <option value="open" ${currentStatus === 'open' ? 'selected' : ''}>Open</option>
    <option value="closed" ${currentStatus === 'closed' ? 'selected' : ''}>Closed</option>
    <option value="maintenance" ${currentStatus === 'maintenance' ? 'selected' : ''}>Maintenance</option>
  </select>

  <button id="submit-pool-status" class="btn-action">
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
 <input type="text" id="search-created-farm" placeholder="Search your farm name..." class="theme-search-farm">
 <button id="create-new-farm-btn" class="btn-action ml-2">
 ➕ Create New NFTs Farm
 </button>
 <div id="created-farm-buttons" class="theme-box"></div>
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
 container.innerHTML = `<div class="theme-alert">You don’t have any NFTs Staking Farm yet.</div>`;
 return;
 }

 // 🔥 SOLUZIONE: assegna i dati globalmente
 window.nftFarmsData = data.farms;

 renderCreatedFarmButtons(data.farms);
 renderCreatedFarmDetails(data.farms[0]);
 } catch (err) {
 container.innerHTML = `<div class="error-message">Error loading your farms.</div>`;
 console.error("[❌] Error loading user farms:", err);
 }
} function renderCreatedFarmButtons(farms) {
 const container = document.getElementById('created-farm-buttons');
 const searchInput = document.getElementById('search-created-farm');

 function renderButtons(list) {
 container.innerHTML = '';
 list.forEach(farm => {
 const btn = document.createElement('button');
 applyThemeClasses(btn, 'btn-action');
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
 <span class="theme-text-sm mr-4">

 💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong>
 </span>
 `).join('');

 const templatesHTML = farm.templates.map(tpl => {
 const rewards = tpl.daily_rewards.map(r => `
 <div class="theme-text-xs">
 ${r.token_symbol}: ${parseFloat(r.daily_reward_amount).toFixed(4)}/day
 </div>
 `).join('');

 return `
 <div class="template-block">
 <h4 class="h4">Template ID: ${tpl.template_id}</h4>
 ${rewards || '<div class="theme-cyberpunk-no-rewards>No rewards configured.</div>'}
 <div class="flex flex-wrap gap-2 mt-2">
 <button class="btn-action" onclick="openEditRewards(${tpl.template_id})">✏️ Edit Rewards</button>
 <button class="btn-action" onclick="openAddReward(${tpl.template_id})">➕ Add Reward</button>
 <button class="btn-action" onclick="removeTemplate(${tpl.template_id})">🗑️ Remove Template</button>
 </div>
 </div>
 `;
 }).join('');

 container.innerHTML = `
<div class="theme-card">
  <h3 class="theme-title theme-card-header">
    ${farm.farm_name}
    <span class="theme-text-sm">

 Status: <strong>${farm.status}</strong> • Created: ${farm.creation_date}
 </span>
 </h3>
<div class="theme-action-buttons">
  <button class="btn-action" onclick="openAddTemplateForm(${farm.farm_id})">➕ Add Template</button>
  <button class="btn-action" onclick="openDepositForm(${farm.farm_id})">💰 Deposit Rewards</button>
  <button class="btn-action" onclick="confirmFarmClosure(${farm.farm_id})">🚫 Close Farm</button>
  <button class="btn-action" onclick="changeFarmStatus(${farm.farm_id})">🔄 Change Status</button>
</div>
<div class="theme-reward-container">${rewardHTML}</div>
${templatesHTML || '<div class="theme-no-templates">No templates added yet.</div>'}


 `;
}

function renderNewFarmForm() {
 const container = document.getElementById('created-farm-details');
 container.innerHTML = `
 <div class="theme-card">
 <h3 class="theme-title">Create a New NFTs Staking Farm</h3>
 <label class="block mb-2">Farm Name</label>
 <input id="new-farm-name" type="text" class="theme-input">
 <button id="submit-new-farm" class="btn-action">
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
 <h3 class="theme-title">➕ Add Template to Farm</h3>
 <label class="block mb-2 font-semibold">Template ID</label>
 <input id="template-id" type="number" class="theme-input" placeholder="e.g. 123456">

 <div id="rewards-container">
 <label class="theme-label">Rewards</label>
 <div class="reward-entry">
 <input type="text" class="token-symbol theme-input" placeholder="Token Symbol (e.g. CHIPS)">
 <input type="number" class="reward-amount theme-input" placeholder="Amount per day">
 </div>
 </div>

 <button id="add-reward-btn" class="theme-link">➕ Add another reward</button>

 <button id="submit-add-template" class="btn-action">
 Add Template
 </button>
 `;

 modal.classList.remove('hidden');
 document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

 // ➕ Aggiungi nuova riga di reward
 document.getElementById('add-reward-btn').onclick = () => {
 const container = document.getElementById('rewards-container');
 const div = document.createElement('div');
 div.className = 'reward-entry theme-box flex gap-2 mb-2';
 div.innerHTML = `
   <input type="text" class="token-symbol theme-input" placeholder="Token Symbol (e.g. CHIPS)">
   <input type="number" class="reward-amount theme-input" placeholder="Amount per day">
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
  <h3 class="theme-title">Deposit Rewards to Farm</h3>
  <div id="rewards-deposit-container"></div>
  <button id="add-more-reward" class="theme-link">➕ Add another token</button>
  <button id="submit-deposit" class="btn-action">Deposit All</button>
`;


 modal.classList.remove('hidden');
 document.getElementById('close-modal').onclick = () => modal.classList.add('hidden');

 const container = document.getElementById('rewards-deposit-container');
 const addBtn = document.getElementById('add-more-reward');
 const wallet = window.walletBalances || [];

 function renderRewardRow(token = '') {
 const wallet = window.walletBalances || [];
const div = document.createElement('div');
applyThemeClasses(div, 'reward-row theme-box mb-6');
div.innerHTML = `
  <label class="block theme-text-sm">Choose Token</label>
  <select class="token-symbol theme-input">
    <option disabled selected value="">-- Select a token --</option>
    ${wallet.map(t => `<option value="${t.symbol}">${t.symbol}</option>`).join('')}
  </select>

  <div class="available-balance theme-text-sm hidden"></div>

  <label class="block theme-text-sm">Select %</label>
  <input type="range" class="percent-range" min="0" max="100" value="0" disabled>

  <label class="block theme-text-sm">Amount</label>
  <input type="number" class="amount theme-input" placeholder="Amount" disabled>
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
  <h3 class="theme-title text-error">Close Farm</h3>
  <p class="theme-text">Are you sure you want to <strong>close</strong> this farm? This will stop all rewards.</p>
  <div class="theme-modal-buttons">
    <button class="btn-secondary" onclick="document.getElementById('modal').classList.add('hidden')">Cancel</button>
    <button class="btn-danger" onclick="changeFarmStatus(${farmId}, 'closed')">Confirm</button>
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
  <h3 class="theme-title">Change Farm Status</h3>
  <select id="status-select" class="theme-input">
    <option value="open">Open</option>
    <option value="closed">Closed</option>
    <option value="setting">Setting</option>
  </select>
  <button class="btn-action" id="status-confirm">Update</button>
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
  <h3 class="theme-title">✏️ Edit Rewards for Template ID ${templateId}</h3>
  <div id="rewards-edit-container">
    ${(template.rewards || []).map(r => `
      <div class="reward-entry">
        <input type="text" class="token-symbol theme-input" value="${r.token_symbol}" placeholder="Token Symbol">
        <input type="number" class="reward-amount theme-input" value="${parseFloat(r.daily_reward_amount)}" placeholder="Amount per day">
      </div>
    `).join('')}
  </div>
  <button id="add-reward-btn" class="theme-link">➕ Add another reward</button>
  <button id="submit-edit-rewards" class="btn-action">Update Rewards</button>
`;


 // Aggiunta nuova riga
 document.getElementById('add-reward-btn').onclick = () => {
 const container = document.getElementById('rewards-edit-container');
const div = document.createElement('div');
applyThemeClasses(div, 'reward-entry');
div.innerHTML = `
  <input type="text" class="token-symbol theme-input" placeholder="Token Symbol">
  <input type="number" class="reward-amount theme-input" placeholder="Amount per day">
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
  <h3 class="theme-title">➕ Add Reward to Template ID ${templateId}</h3>
  <div class="reward-entry">
    <input type="text" id="new-token-symbol" class="theme-input" placeholder="Token Symbol (e.g. CHIPS)">
    <input type="number" id="new-reward-amount" class="theme-input" placeholder="Amount per day">
  </div>
  <button id="submit-new-reward" class="btn-action">Add Reward</button>
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
 // Nuova sezione C2E - Twitch con menu responsivo
app.innerHTML = `
  <h2 class="theme-section-title">C2E - Twitch</h2>
  <div class="theme-menu-container">
    <button class="menu-btn theme-tab" data-menu="log-reward-activity">Log Reward Activity</button>
    <button class="menu-btn theme-tab" data-menu="log-storms-giveaways">Log Storms & Giveaways</button>
    <button class="menu-btn theme-tab" data-menu="schedule-token-storm">Schedule Token-Storm</button>
    <button class="menu-btn theme-tab" data-menu="schedule-nft-giveaway">Schedule NFT-Giveaway</button>
  </div>
  <div id="c2e-content" class="theme-c2e-message">Loading last activity...</div>
`;
document.querySelectorAll('.menu-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    // Rimuovi la classe 'active-tab' da tutti
    document.querySelectorAll('.menu-btn').forEach(button =>
      button.classList.remove('active-tab')
    );

    // Aggiungi la classe attiva
    e.currentTarget.classList.add('active-tab');

    // Carica la vista associata
    const target = e.currentTarget.getAttribute('data-menu');
    if (target === 'log-reward-activity') loadLogRewardActivity();
    if (target === 'log-storms-giveaways') loadLogStormsGiveaways();
    if (target === 'schedule-token-storm') loadScheduleTokenStorm();
    if (target === 'schedule-nft-giveaway') loadScheduleNFTGiveaway();
  });
});


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
<h2 class="theme-title">Wallet</h2>
<div id="wallet-table" class="theme-table">Caricamento Wallet...</div>

 `;
 loadWallet();
 } else if (section === 'nfts') {
app.innerHTML = `
<h2 class="theme-title">My NFTs</h2>

<div class="theme-nft-filters">
  <input type="text" id="search-template" placeholder="Search by Template Name..." class="theme-input theme-nft-input">

  <select id="filter-status" class="theme-input theme-nft-input">
    <option value="">Status</option>
    <option value="Staked">Staked</option>
    <option value="Not Staked">Not Staked</option>
  </select>

  <select id="filter-stakable" class="theme-input theme-nft-input">
    <option value="">Stakeability</option>
    <option value="Stakable">Stakable</option>
    <option value="Not Stakable">Not Stakable</option>
  </select>

  <select id="filter-for-sale" class="theme-input theme-nft-input">
    <option value="">Sale Status</option>
    <option value="Yes">For Sale</option>
    <option value="No">Not For Sale</option>
  </select>

  <select id="filter-collection" class="theme-input theme-nft-input">
    <option value="">Collection</option>
  </select>

  <select id="sort-by" class="theme-input theme-nft-input">
    <option value="created_at_desc">Newest</option>
    <option value="created_at_asc">Oldest</option>
    <option value="template_name_asc">Template (A-Z)</option>
    <option value="template_name_desc">Template (Z-A)</option>
  </select>
</div>

<div id="bulk-actions" class="theme-bulk-actions hidden">
  <button id="bulk-withdraw" class="btn-action">Withdraw Selected</button>
  <button id="bulk-send" class="btn-action">Send Selected</button>
</div>

<div id="nfts-loading" class="theme-alert theme-text-center">🔄 Loading NFTs...</div>
<div id="nfts-count" class="theme-text-sm"></div>

<div id="nfts-list" class="theme-grid-nfts"></div>

<div id="pagination" class="theme-pagination"></div>

<div id="modal-nft" class="theme-modal">
  <div class="theme-card theme-modal-content">
    <button id="close-modal" class="theme-modal-close">&times;</button>
    <div id="modal-content"></div>
  </div>
</div>
`;

 loadNFTs();
 } else if (section === 'token-staking') {
 console.log("[🧪] Entrato in blocco token-staking");
app.innerHTML = `
  <h2 class="theme-title theme-staking-title">Token Staking</h2>

  <input type="text" id="search-pools" placeholder="Search token pool name" class="theme-input theme-staking-input">

  <div id="pool-buttons" class="theme-staking-buttons"></div>

  <div id="selected-pool-details">
    <div class="theme-alert theme-text-center">Loading pool data...</div>
  </div>
`;

 loadStakingPools(); // 🔥 chiamiamo la funzione che popola tutto
 } else if (section === 'nfts-staking') {
app.innerHTML = `
  <h2 class="theme-title theme-section-title">NFT Staking</h2>
  <div id="nft-farms-container" class="theme-box theme-staking-box">Loading NFT farms...</div>
`;

   loadNFTFarms();
   
   } else if (section === 'create-nfts-farm') {
app.innerHTML = `
  <h2 class="theme-title theme-section-title">Create NFTs Staking Farm</h2>
  <div id="create-nfts-farm-container" class="theme-box theme-staking-box">Loading...</div>
`;

   loadCreateNFTFarm();
   
   } else if (section === 'create-token-pool') {
app.innerHTML = `
  <h2 class="theme-title theme-section-title">Create Token Staking Pool</h2>
  <div id="create-token-pool-container" class="theme-box theme-staking-box">Loading...</div>
`;

   loadCreateTokenStaking();
   }
 async function loadNFTFarms() {
 const { userId, usx_token } = window.userData;
 const res = await fetch(`${BASE_URL}/nfts_farms?user_id=${userId}&usx_token=${usx_token}`);
 const data = await res.json();
 console.log("[🐛] Risposta intera da /nfts_farms:", JSON.stringify(data, null, 2));
 if (!data.farms || data.farms.length === 0) {
   document.getElementById('nft-farms-container').innerHTML = `
     <div class="theme-alert-error">No NFT farms found.</div>`;

 return;
 }

 window.nftFarmsData = data.farms;
 renderNFTFarmButtons(data.farms);

 const defaultFarm = data.farms.find(f => f.farm_name.toLowerCase().includes('chips')) || data.farms[0];
 renderNFTFarms([defaultFarm]);
} function renderNFTFarmButtons(farms) {
 const container = document.getElementById('nft-farms-container');
container.innerHTML = `
  <input type="text" id="search-nft-farm" placeholder="Search farm name..." class="theme-input theme-search-input">
  <div id="nft-farm-buttons" class="theme-box theme-farm-buttons"></div>
  <div id="nft-farm-details" class="theme-box theme-farm-details"></div>
`;
 const buttonContainer = document.getElementById('nft-farm-buttons');
 const searchInput = document.getElementById('search-nft-farm');

 function renderButtons(list) {
 buttonContainer.innerHTML = '';
 list.forEach(farm => {
 const btn = document.createElement('button');
 applyThemeClasses(btn, 'btn-action');
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

html += `
  <p class="theme-text theme-note-paragraph">
    Don’t have a NFT farm in CHIPS Wallet for your collection yet? You can create one 
    <button onclick="loadSection('create-nfts-farm')" class="btn-create-farm theme-link-button">
      Create NFTs Farm
    </button>
  </p>
`;
 farms.forEach(farm => {
 const templatesHTML = (farm.templates || []).map(template => {
const nftsHTML = (template.user_nfts || []).map(nft => `
  <div class="theme-nft-card">
    <img src="${nft.asset_img}" alt="NFT"
      class="theme-nft-img"
      onerror="this.onerror=null;this.src='https://via.placeholder.com/150?text=Image+Not+Found';">
    <div class="theme-nft-title">${nft.template_name}</div>
    <div class="theme-text-xs">#${nft.asset_id}</div>
    <button class="nft-stake-btn theme-nft-button"
      onclick="handleNFTStake(${farm.farm_id}, ${template.template_id}, '${nft.asset_id}', ${nft.is_staked})">
      ${nft.is_staked ? 'Unstake' : 'Stake'}
    </button>
  </div>
`).join('');
const rewardsHTML = (template.rewards || []).map(r => {
  const daily = parseFloat(r.daily_reward_amount);
  return `
    <div class="theme-text-xs theme-reward-entry">
      ${r.token_symbol}: ${isNaN(daily) ? "N/A" : daily.toFixed(4)}/day
    </div>
  `;
}).join('') || '<div class="theme-alert-soft theme-italic">No rewards</div>';

return `
  <div class="theme-template-block">
    <h4 class="theme-subtitle theme-template-id">Template ID: ${template.template_id}</h4>
    ${rewardsHTML}
    <div class="theme-grid-nfts-section">
      ${nftsHTML || '<div class="theme-alert-muted theme-text-xs theme-nfts-empty">You don’t own NFTs for this template</div>'}
    </div>
  </div>
`;

const farmRewards = (farm.farm_rewards || []).map(r => `
  <span class="theme-text-xs theme-reward-token">
    💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong>
  </span>
`).join('');

html += `
  <div class="theme-card theme-template-wrapper">
    <h3 class="theme-title theme-template-header">
      ${farm.farm_name}
      <span class="theme-text-sm theme-reward-line">
        ${farmRewards}
      </span>
    </h3>
    ${templatesHTML}
  </div>
`;

 // ✅ Imposta tutto insieme
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
 applyRewardFiltersAndSort(); // aggiorna righe
}

async function loadLogRewardActivity() {
 const container = document.getElementById('c2e-content');
 container.innerHTML = 'Loading Log Reward Activity...'; // Message to show while loading

 try {
 const res = await fetch(`${BASE_URL}/log_reward_activity`);

 if (!res.ok) {
 throw new Error('Network response was not ok');
 }

 const data = await res.json();

 if (data.length === 0) {
  container.innerHTML = `
    <div class="theme-alert-muted">
      No reward activity logs found.
    </div>`;
  return;
}


 // Save original data
 originalData = data;

 // Show the most recent 20 records
 const recentData = data.slice(0, 20).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

 displayLogData(recentData);

 } catch (err) {
  container.innerHTML = `
    <div class="theme-alert-error">
      Error loading log reward activity: ${err.message}
    </div>`;
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

function renderRewardTable(data) {
  const tbody = document.querySelector('#c2e-content tbody');
  let rows = '';

  data.forEach((record, index) => {
    rows += `
      <tr class="theme-table-row">
        <td class="theme-td">${record.username}</td>
        <td class="theme-td">${record.token_symbol}</td>
        <td class="theme-td">${record.amount}</td>
        <td class="theme-td">${record.channel}</td>
        <td class="theme-td">${record.origin_channel}</td>
        <td class="theme-td">${new Date(record.timestamp).toLocaleString()}</td>
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
  <div class="theme-filter-row">
    <select id="filter-username" class="theme-input theme-select-small">${createOptions(usernames)}</select>
    <select id="filter-channel" class="theme-input theme-select-small">${createOptions(channels)}</select>
    <select id="filter-sponsor" class="theme-input theme-select-small">${createOptions(sponsors)}</select>
    <button id="update-rewards" class="btn-action theme-update-button">Update Data</button>
  </div>

  <div class="theme-box theme-scroll-container">
    <table id="wallet-table" class="theme-reward-table">
      <thead>
        <tr class="theme-table-header">
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
 const { userId, usx_token, wax_account } = window.userData || {};
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

  container.innerHTML = '<div class="theme-alert">Loading Log Storms & Giveaways...</div>';

  try {
container.innerHTML = `
  <div class="theme-box ">
    <h2 class="theme-title theme-section-title">Add New Scheduled Storm</h2>

    <div id="add-storm-form" class="theme-grid-form">
      <div>
        <label class="input-label">Scheduled Time</label>
        <input type="datetime-local" id="scheduledTime" class="theme-input theme-input-block">
      </div>

      <div>
        <label class="input-label">Timeframe</label>
        <select id="timeframe" class="theme-input theme-input-block">
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

      <div>
        <label class="input-label">Amount</label>
        <input type="number" id="amount" class="theme-input theme-input-block">
      </div>

      <div>
        <label class="input-label">Token Symbol</label>
        <select id="tokenSymbol" class="theme-input theme-input-block">
          <option value="">Select Token</option>
        </select>
      </div>

      <div>
        <label class="input-label">Channel</label>
        <select id="channelName" class="theme-input theme-input-block">
          <option value="">Select Channel</option>
        </select>
      </div>

      <div>
        <label class="input-label">Payment Method</label>
        <select id="paymentMethod" class="theme-input theme-input-block">
          <option value="twitch">Twitch</option>
          <option value="telegram">Telegram</option>
        </select>
      </div>
    </div>

    <div class="theme-button-center">
      <button id="submitStorm" class="btn-action theme-button-lg">Add Storm</button>
    </div>

    <h2 class="theme-title theme-section-title">Scheduled Storms</h2>
    <div id="wallet-table" class="theme-box">Loading Scheduled Storms...</div>
  </div>
`;
    // Event + Data
    document.getElementById('submitStorm').addEventListener('click', addScheduledStorm);
    await populateTokenSymbols();
    populateTimeframes();
    await populateChannels();
    setScheduledTimeMinMax();
    loadScheduledStorms();

  } catch (err) {
    container.innerHTML = `<div class="theme-alert-errorr">Error loading log storms and giveaways: ${err.message}</div>`;
  }
}


// Funzione per popolare il dropdown dei Token Symbols
async function populateTokenSymbols() {
  const tokenSelect = document.getElementById('tokenSymbol');

  if (!tokenSelect) {
    console.warn("Elemento #tokenSymbol non trovato.");
    return;
  }

  tokenSelect.classList.add('theme-input'); // Applica la classe di input tematizzato

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
  if (!timeframeSelect) return;

  timeframeSelect.classList.add('theme-input'); // Applica stile tematizzato

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
  if (!channelSelect) return;

  channelSelect.classList.add('theme-input'); // Applica stile tematizzato

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

async function loadScheduledStorms() {
  const tableContainer = document.getElementById('wallet-table');
  if (!tableContainer) return;

  tableContainer.innerHTML = `<div class="theme-alert">Loading Scheduled Storms...</div>`;

  try {
    const res = await fetch(`${BASE_URL}/scheduled_storms`);

    if (!res.ok) {
      throw new Error('Network response was not ok');
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tableContainer.innerHTML = `<div class="theme-alert-muted">No scheduled storms found.</div>`;
      return;
    }

    // Ordina dal più recente al più vecchio
    data.sort((a, b) => new Date(b.scheduled_time) - new Date(a.scheduled_time));

    displayStormsData(data);
  } catch (err) {
    tableContainer.innerHTML = `<div class="theme-alert-error">Error loading scheduled storms: ${err.message}</div>`;
  }
}

function renderStormsTable(data) {
  const tableBody = document.querySelector('.table-auto tbody');
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
            <div class="theme-winner-row">
              <span class="theme-text-sm">${left}</span>
              <span class="theme-text-sm">${right}</span>
            </div>`;

        }
      } else {
        winnersHTML = `<span class="theme-text-xs">No winners in the selected time interval :(</span>`;
      }
    } else {
      winnersHTML = `<span class="theme-text-xs">Soon</span>`;
    }

    const pulse = storm.status === 'pending'
      ? `<div class="theme-pulse-pending"></div>`
      : `<div class="theme-pulse-complete"></div>`;

    rowsHTML += `
      <tr class="theme-table-row">
        <td class="theme-td">${storm.id}</td>
        <td class="theme-td">${new Date(storm.scheduled_time).toLocaleString()}</td>
        <td class="theme-td">${storm.offered_by}</td>
        <td class="theme-td">${storm.amount}</td>
        <td class="theme-td">${storm.token_symbol}</td>
        <td class="theme-td">${storm.channel_name}</td>
        <td class="theme-td">${storm.status}</td>
        <td class="theme-td">${winnersHTML}</td>
        <td class="theme-td">${pulse}</td>
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
  <div class="theme-filter-row">
    <select id="filter-channel" class="theme-input theme-select-small">${createOptions(channels)}</select>
    <select id="filter-status" class="theme-input theme-select-small">${createOptions(statuses)}</select>
    <select id="filter-offeredby" class="theme-input theme-select-small">${createOptions(offeredBys)}</select>
    <button id="update-storms" class="btn-action theme-update-button">Update Data</button>
  </div>

  <div class="theme-box theme-scroll-container">
    <table class="theme-table theme-storms-table theme-table-hover">
      <thead>
        <tr class="theme-table-header">
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
  // Eventi filtri e aggiornamento
  document.getElementById('filter-channel').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-status').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('filter-offeredby').addEventListener('change', applyStormsFiltersAndSort);
  document.getElementById('update-storms').addEventListener('click', loadScheduledStorms);
}

// Aggiungi effetto hover alle righe della tabella per migliorare l'interazione
function addHoverEffectToRows() {
 const rows = document.querySelectorAll('.table-row');
 rows.forEach(row => {
 row.addEventListener('mouseenter', () => {
 row.style.backgroundColor = '#e2e8f0'; // Colore chiaro al passaggio del mouse
 });
 row.addEventListener('mouseleave', () => {
 row.style.backgroundColor = ''; // Rimuove il colore al passaggio
 });
 });
}

// Load Schedule NFT-Giveaway
async function loadScheduleNFTGiveaway() {
  const container = document.getElementById('c2e-content');
  if (!container) return;

  container.innerHTML = `<div class="theme-alert">Loading Schedule NFT-Giveaway...</div>`;

  try {
    const res = await fetch(`${BASE_URL}/schedule_nft_giveaway`);
    const data = await res.json();

    container.innerHTML = `
      <div class="theme-box">
        <pre class="text-xs theme-text-sm">${JSON.stringify(data, null, 2)}</pre>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="theme-alert-error">Error loading schedule nft-giveaway: ${err.message}</div>`;
  }
}
function renderPoolButtons(pools) {
  const container = document.getElementById('pool-buttons');
  container.innerHTML = '';
  pools.forEach(pool => {
    const btn = document.createElement('button');
    applyThemeClasses(btn, 'btn-action');
    btn.textContent = pool.token_symbol;
    btn.onclick = () => renderPoolDetails(pool);
    container.appendChild(btn);
  });
}
 function renderPoolButtons(pools) {
 const container = document.getElementById('pool-buttons');
 container.innerHTML = '';
 pools.forEach(pool => {
 const btn = document.createElement('button');
 applyThemeClasses(btn, 'btn-action');
 btn.textContent = pool.token_symbol;
 btn.onclick = () => renderPoolDetails(pool);
 container.appendChild(btn);
 });
} function renderPoolDetails(pool) {
  const container = document.getElementById('selected-pool-details');
  const rewards = pool.rewards_info;
  const rewardsCount = rewards.length;

  // Responsive column logic
  let gridClass = 'theme-grid-1';
  if (rewardsCount === 2) gridClass = 'theme-grid-2';
  if (rewardsCount > 2) gridClass = 'theme-grid-auto';

const rewardsHTML = rewards.map(r => `
  <div class="theme-card theme-reward-card">
    <div class="theme-text-strong">${r.reward_token}</div>
    <div>Total: ${r.total_reward_deposit}</div>
    <div>Daily: ${r.daily_reward}</div>
    <div>APR: ${r.apr}%</div>
    <div>Days Left: ${r.days_remaining}</div>
    <div class="theme-positive"><strong>Your Daily:</strong> ${r.user_daily_reward}</div>
  </div>
`).join('');

container.innerHTML = `
  <div class="theme-box">
    <h3 class="theme-title theme-section-title">Pool: ${pool.token_symbol}</h3>
    <p class="theme-text-sm">Total Staked: <strong>${pool.total_staked}</strong></p>
    <p class="theme-text-sm">You Staked: <strong>${pool.user_staked}</strong></p>

    <div class="theme-button-row">
      <button class="btn-action" onclick="openStakeModal('add', ${pool.pool_id}, '${pool.token_symbol}')">Add Tokens</button>
      <button class="btn-action" onclick="openStakeModal('remove', ${pool.pool_id}, '${pool.token_symbol}')">Remove Tokens</button>
    </div>

    <h4 class="theme-subtitle theme-subtitle-spaced">Rewards</h4>
    <div class="theme-grid ${gridClass}">
      ${rewardsHTML}
    </div>
  </div>
`;
}
function openStakeModal(type, poolId, tokenSymbol) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
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

  modalBody.innerHTML = `
    <h3 class="theme-title">${title}</h3>
    <p class="theme-text-sm">${availableLabel}: <strong>${balance.toFixed(4)}</strong> ${tokenSymbol}</p>

    <label class="theme-label">Select %</label>
    <input id="stake-range" type="range" min="0" max="100" value="0" class="theme-range">

    <label class="theme-label mb-1">Amount</label>
    <input id="stake-amount" type="number" step="0.0001" class="theme-input" value="0">

    <div id="stake-summary" class="theme-text-xs"></div>

    <button class="btn-action" id="stake-submit">Go!</button>
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
      showToast("Invalid amount.", "error");
      return;
    }

    const body = {
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
        <div class="theme-table-wrapper">
          <table class="theme-table theme-table-hover">
            <thead>
              <tr>
                <th>Token</th>
                <th>Amount</th>
                <th>Stakeable</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${window.walletBalances.map(token => `
                <tr class="theme-table-row">
                  <td class="theme-td"><strong>${token.symbol}</strong></td>
                  <td class="theme-td">${token.amount}</td>
                  <td class="theme-td">${token.stakeable}</td>
                  <td class="theme-td">
                    <div class="btn-group theme-wallet-actions">
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
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          const token = btn.getAttribute('data-token');
          openModal(action, token);
        });
      });

    } else {
      walletTable.innerHTML = `<div class="theme-alert">No balances available.</div>`;
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
    renderNFTs(); // dovrebbe già essere tematizzata
    setupFilterEvents();
  } catch (error) {
    console.error("[❌] Errore caricando NFTs:", error);
    const loader = document.getElementById('nfts-loading');
    if (loader) loader.innerHTML = `<div class="theme-alert-error">❌ Error loading NFTs.</div>`;
  }
}
function populateDropdowns(nfts) {
  const collectionSelect = document.getElementById('filter-collection');
  const uniqueCollections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];
  
  collectionSelect.innerHTML += uniqueCollections
    .sort()
    .map(col => `<option value="${col}">${col}</option>`)
    .join('');
}
function populateCollectionFilter(nfts) {
  const filterCollection = document.getElementById('filter-collection');
  const collections = [...new Set(nfts.map(nft => nft.template_info.collection_name))];

  filterCollection.innerHTML += collections
    .sort()
    .map(col => `<option value="${col}">${col}</option>`)
    .join('');
}
function renderNFTs() {
  const nftsList = document.getElementById('nfts-list');
  const loading = document.getElementById('nfts-loading');
  const count = document.getElementById('nfts-count');

  loading.classList.add('hidden');

  let filtered = [...window.nftsData];

  // === FILTRI ===
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

  // === ORDINAMENTO ===
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

  // === PAGINAZIONE ===
  const totalPages = Math.ceil(filtered.length / window.nftsPerPage);
  if (window.currentPage > totalPages) window.currentPage = totalPages || 1;

  const start = (window.currentPage - 1) * window.nftsPerPage;
  const end = start + window.nftsPerPage;
  const pageNFTs = filtered.slice(start, end);

if (pageNFTs.length > 0) {
  nftsList.innerHTML = pageNFTs.map(nft => `
    <div class="theme-nft-card">
      <input type="checkbox" 
        class="theme-nft-checkbox" 
        onclick="toggleNFTSelection(event, '${nft.asset_id}')" 
        ${window.selectedNFTs.has(nft.asset_id) ? "checked" : ""}>

      <div onclick="openNFTModal('${nft.asset_id}')" class="theme-nft-content">
        <img src="${nft.image_url}" alt="NFT Image" class="theme-nft-img" onerror="this.onerror=null;this.src='https://via.placeholder.com/150?text=No+Image';">
        <h3 class="theme-nft-title">${nft.template_info.template_name}</h3>
        <p class="theme-nft-id">#${nft.asset_id}</p>
      </div>
    </div>
  `).join('');
} else {
  nftsList.innerHTML = `<div class="theme-alert theme-text-center">No NFTs match your filters.</div>`;
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
}
function renderPagination(totalPages) {
  const pagination = document.getElementById('pagination');
  if (totalPages <= 1) {
    pagination.innerHTML = '';
    return;
  }

  pagination.innerHTML = `
    <button onclick="changePage(window.currentPage - 1)" class="theme-button-secondary" ${window.currentPage === 1 ? "disabled" : ""}>Previous</button>
    <span class="theme-text">${window.currentPage} / ${totalPages}</span>
    <button onclick="changePage(window.currentPage + 1)" class="theme-button-secondary" ${window.currentPage === totalPages ? "disabled" : ""}>Next</button>
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
  <img src="${nft.image_url}" alt="NFT Image" class="theme-nft-modal-img"
    onerror="this.onerror=null;this.src='https://via.placeholder.com/150?text=Image+Not+Found';">

  <h2 class="theme-title">${nft.template_info.template_name}</h2>

  <div class="theme-text-sm">
    <p><strong>Asset ID:</strong> ${nft.asset_id}</p>
    <p><strong>Collection:</strong> ${nft.template_info.collection_name}</p>
    <p><strong>Schema:</strong> ${nft.template_info.schema_name}</p>
    <p><strong>Stakeable:</strong> ${nft.is_stakable}</p>
    <p><strong>Staked:</strong> ${nft.is_staked}</p>
    <p><strong>For Sale:</strong> ${nft.for_sale}</p>
    <p><strong>Transferable:</strong> ${nft.template_info.is_transferable ? "Yes" : "No"}</p>
    <p class="theme-note-muted">Acquired: ${new Date(nft.created_at).toLocaleDateString()}</p>
  </div>
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
  const { userId, usx_token, wax_account } = window.userData;
  const endpoint = `${BASE_URL}/withdraw_nft_v2?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wax_account, asset_ids: selectedIds })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[❌] Server error:", data.error || "Unknown error");
      showToast(`❌ ${data.error || 'Unknown error'}`, "error");
      return;
    }

    showToast(`✅ Successfully withdrawn ${selectedIds.length} NFTs`, "success");

    window.selectedNFTs.clear();
    await loadNFTs();
  } catch (error) {
    console.error("[❌] Network error:", error);
    showToast("❌ Network/server error during NFT withdraw", "error");
  }
}
async function bulkSendSelected() {
  if (window.selectedNFTs.size === 0) return;

  const selectedIds = Array.from(window.selectedNFTs);

  // Prompt personalizzato per account ricevente
  const receiver = prompt(
    `⚡ You are about to transfer these NFTs:\n\n${selectedIds.join(", ")}\n\nPlease enter the recipient's WAX account:`
  );

  if (!receiver) {
    showToast("Transfer cancelled: no recipient specified.", "error");
    return;
  }

  if (!confirm(`Confirm transfer of ${selectedIds.length} NFTs to ${receiver}?`)) {
    showToast("Transfer cancelled.", "error");
    return;
  }

  const { userId, usx_token, wax_account } = window.userData;
  const endpoint = `${BASE_URL}/transfer_nfts?user_id=${encodeURIComponent(userId)}&usx_token=${encodeURIComponent(usx_token)}`;
  const bodyData = {
    wax_account: receiver.trim(),
    asset_ids: selectedIds
  };

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
      showToast(`❌ Transfer failed: ${data.error || "Unknown error"}`, "error");
      return;
    }

    showToast(`✅ Successfully transferred ${selectedIds.length} NFTs to ${receiver}`, "success");

    window.selectedNFTs.clear();
    updateBulkActions();
    await loadNFTs();
  } catch (error) {
    console.error("[❌] Network error:", error);
    showToast("❌ Network or server error during transfer", "error");
  }
}
 async function openModal(action, token) {
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
  <h3 class="theme-title">Swap ${token}</h3>
  <div class="theme-text-sm">
    Available Balance: <span class="theme-text-strong">${balance}</span> ${token}
  </div>

  <form id="action-form" class="theme-form">
    <div>
      <label class="theme-label">Percentage</label>
      <input type="range" id="percent-range" class="theme-range" min="0" max="100" value="0">
    </div>

    <div>
      <label class="theme-label">Amount to Swap</label>
      <input type="number" id="amount" class="theme-input" required min="0.0001" step="0.0001">
    </div>

    <div>
      <label class="theme-label">Choose Output Token</label>
      <input type="text" id="token-search" placeholder="Search token..." class="theme-input theme-input-spaced">
      <select id="token-output" class="theme-input" size="5"></select>
    </div>

    <div id="swap-preview" class="theme-alert hidden">
      <div id="loading-spinner" class="theme-text-center">🔄 Getting blockchain data...</div>
      <div id="swap-data" class="hidden">
        <div>Minimum Received: <span id="min-received" class="theme-text-strong"></span></div>
        <div>Price Impact: <span id="price-impact" class="theme-text-strong"></span>%</div>
      </div>
    </div>

    <button id="preview-button" type="button" class="btn-action theme-btn-yellow">Preview Swap</button>
    <button id="submit-button" type="submit" class="btn-action theme-btn-green" disabled>Confirm Swap</button>
  </form>
`;
 // Load tokens for dropdown and preview button click handler (as already implemented)
 await loadAvailableTokens();

 } else {
 // Layout for Withdraw, Transfer, Stake (no changes here)
modalBody.innerHTML = `
<h3 class="theme-title mb-4">${actionTitle} ${token}</h3>
<div class="theme-text-sm mb-2">
Available Balance: <span class="font-semibold">${balance}</span> ${token}
</div>
${action === 'transfer' ? `
modalBody.innerHTML = `
  <h3 class="theme-title theme-spaced-title">${actionTitle} ${token}</h3>
  <div class="theme-text-sm theme-spaced-text">
    Available Balance: <span class="theme-text-strong">${balance}</span> ${token}
  </div>

  ${action === 'transfer' ? `
    <div class="theme-spaced-text">
      <label class="theme-label">Recipient Wax Account</label>
      <input type="text" id="receiver" class="theme-input" placeholder="Enter destination wax_account" required>
    </div>` : `
    <div class="theme-text-sm theme-spaced-text">
      Destination Wax Account: <span class="theme-text-strong">${window.userData.wax_account}</span>
    </div>`}

  <form id="action-form" class="theme-form">
    <div>
      <label class="theme-label">Percentage</label>
      <input type="range" id="percent-range" class="theme-range" min="0" max="100" value="0">
    </div>

    <div>
      <label class="theme-label">Amount</label>
      <input type="number" id="amount" class="theme-input" required min="0.0001" step="0.0001">
    </div>

    <button id="submit-button" type="submit" class="btn-action theme-btn-blue">
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
 minReceived = minReceived * 0.90; // Sottrai il 10%

 // Aggiornare i valori nell'interfaccia utente
 minReceivedSpan.textContent = minReceived.toFixed(4) || "-"; // Mostra il valore sottratto del 10%
 priceImpactSpan.textContent = data.priceImpact || "-";

 loadingSpinner.classList.add('hidden');
 swapDataContainer.classList.remove('hidden');
 submitButton.disabled = false;
 } catch (error) {
 console.error("[❌] Error fetching swap preview:", error);
 loadingSpinner.innerHTML = `<div id ="spinner" class="theme-text-red-500">⚠️ Failed to load blockchain data.</div>`;
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
 endpoint = `${BASE_URL}/stake_add`; // Usa /stake_add per l'azione "stake"
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
 bodyData.pool_id = poolData.pool_id; // Ottieni il pool_id dalla pool trovata
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

function showToast(message, type = "success") {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');

  toast.className = `toast ${type}`;
  toast.innerText = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 10000);
}

// Avvio app
initApp();

function injectThemeSelector() {
  const themes = [
    'theme-cyberpunk',
    'theme-sea',
    'theme-fire',
    'theme-ai',
    'theme-pixel',
    'theme-neural',
    'theme-natural',
    'theme-futuristic',
    'theme-retro',
    'theme-hacker'
  ];

  // Pulsante 🎨 per mostrare il selettore
const toggleBtn = document.createElement('button');
toggleBtn.id = 'theme-toggle-btn';
toggleBtn.innerText = '🎨';
toggleBtn.className = 'btn-action theme-selector-button';

const selector = document.createElement('select');
selector.id = 'theme-selector';
selector.setAttribute('aria-label', 'Theme Selector');
selector.className = 'theme-input theme-selector-dropdown';

  selector.innerHTML = themes.map(t => {
    const label = t.replace('theme-', '').replace(/-/g, ' ');
    return `<option value="${t}">${label[0].toUpperCase() + label.slice(1)}</option>`;
  }).join('');

  document.body.appendChild(toggleBtn);
  document.body.appendChild(selector);

  // Toggle visibilità selettore
  toggleBtn.addEventListener('click', () => {
    selector.style.display = selector.style.display === 'block' ? 'none' : 'block';
  });

  // Applica tema selezionato
  selector.addEventListener('change', (e) => {
    document.body.className = document.body.className
      .split(' ')
      .filter(c => !c.startsWith('theme-'))
      .join(' ')
      .trim();

    document.body.classList.add(e.target.value);
    localStorage.setItem('selected-theme', e.target.value);
  });

  // Carica tema salvato
  const savedTheme = localStorage.getItem('selected-theme') || themes[0];
  selector.value = savedTheme;
  document.body.classList.add(savedTheme);
}

document.addEventListener('DOMContentLoaded', injectThemeSelector);


