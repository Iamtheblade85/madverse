// Globals
window.userData = {};

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
  }
  else if (section === 'nfts') {
    app.innerHTML = `
      <h2 class="text-2xl font-semibold mb-4">NFTs</h2>
      <p>Funzione in arrivo...</p>
    `;
  }
}

// Caricamento Wallet reale
async function loadWallet() {
  try {
    const { userId, usx_token } = window.userData;
    const response = await fetch(`${BASE_URL}/saldo?user_id=${userId}&usx_token=${usx_token}`);
    const saldoData = await response.json();

    const walletTable = document.getElementById('wallet-table');
    if (saldoData.balances) {
      walletTable.innerHTML = `
        <table class="min-w-full bg-white rounded-lg shadow">
          <thead class="bg-gray-200">
            <tr>
              <th class="py-2 px-4">Token</th>
              <th class="py-2 px-4">Amount</th>
              <th class="py-2 px-4">Stakeable</th>
              <th class="py-2 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${saldoData.balances.map(token => `
              <tr class="border-t">
                <td class="py-2 px-4 font-bold">${token.symbol}</td>
                <td class="py-2 px-4">${token.amount}</td>
                <td class="py-2 px-4">${token.stakeable}</td>
                <td class="py-2 px-4 space-x-2">
                  <button class="btn-action" data-action="withdraw" data-token="${token.symbol}">Withdraw</button>
                  <button class="btn-action" data-action="swap" data-token="${token.symbol}">Swap</button>
                  <button class="btn-action" data-action="transfer" data-token="${token.symbol}">Transfer</button>
                  <button class="btn-action" data-action="stake" data-token="${token.symbol}">Stake</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
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
        <div class="text-center text-gray-500">Nessun saldo disponibile.</div>
      `;
    }
  } catch (error) {
    console.error("[❌] Errore caricando Wallet:", error);
    document.getElementById('wallet-table').innerHTML = `
      <div class="text-center text-red-500">Errore caricando il Wallet.</div>
    `;
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
      <div class="mb-2 text-gray-600">
        Destination Wax Account: <span class="font-semibold">${window.userData.wax_account}</span>
      </div>
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
async function executeAction(action, token, amount) {
  const { userId, usx_token, wax_account } = window.userData;

  let endpoint = "";

  if (action === "withdraw") {
    endpoint = `${BASE_URL}/withdraw`;
  } else if (action === "swap") {
    endpoint = `${BASE_URL}/swap`;
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
    response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        wax_account: wax_account,
        token_symbol: token,
        amount: amount
      })
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

  console.info("[✅] Azione completata:", data.message || "Successo");
}

// Funzione toast dinamico
function showToast(message, type = "success") {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');

  toast.className = `
    p-4 rounded shadow
    ${type === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}
  `;
  toast.innerText = message;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Avvio app
initApp();
