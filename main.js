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

// Funzione per caricare dinamicamente sezioni
function loadSection(section) {
  console.log(`[📦] Caricando sezione: ${section}`);
  const app = document.getElementById('app');

  if (section === 'wallet') {
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
        <button id="bulk-withdraw" class="bg-blue-500 text-white py-2 px-4 rounded mr-2 hover:bg-blue-600">Withdraw All Selected</button>
        <button id="bulk-send" class="bg-green-500 text-white py-2 px-4 rounded hover:bg-green-600">Send All Selected</button>
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
  const rewardsHTML = pool.rewards_info.map(r => `
    <div class="bg-gray-100 rounded p-3 shadow-sm border flex-1 min-w-[80px] max-w-xs">
      <h4 class="font-bold text-yellow-700 mb-1">${r.reward_token}</h4>
      <p class="text-sm"><strong>Total:</strong> ${r.total_reward_deposit}</p>
      <p class="text-sm"><strong>Daily:</strong> ${r.daily_reward}</p>
      <p class="text-sm"><strong>APR:</strong> ${r.apr}%</p>
      <p class="text-sm"><strong>Days Left:</strong> ${r.days_remaining}</p>
      <p class="text-green-700 text-sm font-semibold">Your Daily: ${r.user_daily_reward}</p>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="bg-white shadow rounded p-4">
      <h3 class="text-xl font-bold mb-2">Pool: ${pool.token_symbol}</h3>
      <p class="text-sm text-gray-500 mb-4">Total Staked: <strong>${pool.total_staked}</strong></p>
      <p class="text-sm text-gray-500 mb-4">You Staked: <strong>${pool.user_staked}</strong></p>
      <h4 class="font-semibold mb-2">Rewards</h4>
      <div class="flex flex-wrap gap-4">
        ${rewardsHTML}
      </div>
    </div>
  `;
} // Caricamento Wallet reale
async function loadWallet() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const saldoData = await response.json();

    const walletTable = document.getElementById('wallet-table');
    if (saldoData.balances) {
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
              ${saldoData.balances.map(token => `
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
      // Attacco eventi sugli action buttons
      document.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = btn.getAttribute('data-action');
          const token = btn.getAttribute('data-token');
          console.log(`[⚙️] Azione selezionata: ${action} su ${token}`);
          openModal(action, token);  // ✅ CHIAMATA CORRETTA
        });
      });
      
    } else {
      walletTable.innerHTML = `
        <div class="text-center text-gray-500">No balances available.</div>
      `;
    }
  } catch (error) {
    console.error("[❌] Error loading Wallet:", error);
    document.getElementById('wallet-table').innerHTML = `
      <div class="text-center text-red-500">Error loading wallet data.</div>
    `;
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
}
// Funzione che esegue azioni reali
async function executeAction(action, token, amount, tokenOut = null, contractOut = null) {
  const { userId, usx_token, wax_account } = window.userData;

  let endpoint = "";

  if (action === "withdraw") {
    endpoint = `${BASE_URL}/withdraw`;
  } else if (action === "swap") { // 🔥 NOTA: nel frontend lo chiamiamo "swap", non "swap_tokens"
    endpoint = `${BASE_URL}/swap_tokens`;
  } else if (action === "transfer") {
    endpoint = `${BASE_URL}/transfer`;
  } else if (action === "stake") {
    endpoint = `${BASE_URL}/stake`;
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
