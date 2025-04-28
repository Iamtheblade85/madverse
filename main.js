// Globals
window.userData = {};

// Base URL reale
const BASE_URL = "https://iamemanuele.pythonanywhere.com";

// Estrai parametri da URL
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    userId: params.get('user_id'),
    usx_token: params.get('usx_token')
  };
}

// Funzione iniziale
async function initApp() {
  try {
    console.log("[🔍] Estraendo parametri da URL...");
    const params = getUrlParams();

    if (!params.userId || !params.usx_token) {
      throw new Error("Parametri user_id o usx_token mancanti nell'URL");
    }

    window.userData = {
      userId: params.userId,
      usx_token: params.usx_token,
      wax_account: null // Da popolare dopo /main_door
    };

    console.log("[🚪] Verificando credenziali con /main_door...");

    const response = await fetch(`${BASE_URL}/main_door?user_id=${params.userId}&usx_token=${params.usx_token}`);
    const data = await response.json();

    if (!data.success) throw new Error("Autenticazione fallita");

    // Aggiorna wax_account dopo verifica
    window.userData.wax_account = data.wax_account;

    console.log("[✅] User logged in:", window.userData);

    // Carica la prima sezione
    loadSection('wallet');

    // Eventi sui pulsanti menu
    document.querySelectorAll('.menu-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.target.getAttribute('data-section');
        loadSection(section);
      });
    });

  } catch (error) {
    console.error("[❌] Errore iniziale:", error);
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
          openModal(action, token);
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

// Apertura modale dinamica
function openModal(action, token) {
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');

  let actionTitle = action.charAt(0).toUpperCase() + action.slice(1);

  modalBody.innerHTML = `
    <h3 class="text-xl font-semibold mb-4">${actionTitle} ${token}</h3>
    <form id="action-form" class="space-y-4">
      <div>
        <label class="block mb-1">Amount</label>
        <input type="number" id="amount" class="w-full p-2 border rounded" required min="0.0001" step="0.0001">
      </div>
      <button type="submit" class="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
        Confirm ${actionTitle}
      </button>
    </form>
  `;

  // Mostra modale
  modal.classList.remove('hidden');

  // Gestione chiusura
  document.getElementById('close-modal').onclick = () => {
    modal.classList.add('hidden');
  };

  // Gestione submit form
  document.getElementById('action-form').onsubmit = async (e) => {
    e.preventDefault();
    const amount = document.getElementById('amount').value;

    try {
      await executeAction(action, token, amount);
      showToast(`${actionTitle} completato con successo`, "success");
      modal.classList.add('hidden');
      loadWallet(); // Ricarica saldo aggiornato
    } catch (error) {
      console.error(error);
      showToast(`Errore durante ${actionTitle}`, "error");
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      user_id: userId,
      usx_token: usx_token,
      wax_account: wax_account,
      token_symbol: token,
      amount: amount
    })
  });

  if (!response.ok) {
    throw new Error(`Errore chiamando ${endpoint}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || "Errore generico");
  }
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
