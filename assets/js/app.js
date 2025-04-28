// ==============================
// APP.JS - ChipsWallet (NEW)
// Gestisce navigazione e dark mode
// ==============================


// ==============================
// Variabili Globali - Dati Utente dall'URL
// ==============================

// Funzione per leggere parametri dalla URL
function getQueryParam(param) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

// Recupera da URL
const userId = getQueryParam('user_id');
const token = getQueryParam('usx_token');
let userWaxAccount = "";

if (!userId || !token) {
  alert("Missing user_id or token in URL. Please access the app properly.");
  throw new Error("user_id or token missing");
}

async function preloadUserData() {
  try {
    const response = await fetch(`${BASE_URL}/main_door?user_id=${userId}&usx_token=${token}`);
    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }
    userWaxAccount = data.wax_account;
    console.log('User Wax Account loaded:', userWaxAccount);
  } catch (error) {
    console.error('Failed to preload wax_account from main_door:', error);
    alert("Failed to preload user data. Please reload the page.");
  }
}

// ==============================
// Avvio dell'app
// ==============================
document.addEventListener('DOMContentLoaded', initApp);

async function initApp() {
  await preloadUserData();  // ✅ ora funziona correttamente
  setupNavigation();
  setupDarkMode();
  loadInitialPage();
}

// ==============================
// NAVIGAZIONE DINAMICA
// ==============================
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav button');
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      const page = button.getAttribute('data-page');
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = '<div class="loader">Loading...</div>';

  // Simula un caricamento rapido
  setTimeout(async () => {
    switch (page) {
      case 'wallet':
        const balances = await getBalances();
        renderWallet(balances);
        break;
      case 'staking':
        const stakingPools = await getStakingPools();
        renderStaking(stakingPools);
        break;
      case 'nfts':
        const nftInventory = await getNFTInventory();
        renderNFTs(nftInventory);
        break;
      case 'pools':
        const nftFarms = await getNFTFarms();
        renderNFTFarms(nftFarms);
        break;
      case 'account':
        const userProfile = await getProfile();
        renderProfile(userProfile);
        break;
      default:
        mainContent.innerHTML = '<p>Page not found.</p>';
    }
  }, 300); // Leggero ritardo per vedere il loader
}

// ==============================
// DARK MODE
// ==============================
function setupDarkMode() {
  const toggle = document.getElementById('dark-mode-toggle');
  const prefersDark = localStorage.getItem('dark-mode') === 'true';

  if (prefersDark) {
    document.body.classList.add('dark-mode');
  }

  toggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dark-mode', isDark);
  });
}

// ==============================
// CARICA PRIMA PAGINA (Wallet)
// ==============================
function loadInitialPage() {
  navigateTo('wallet');
}
