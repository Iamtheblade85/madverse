// ==============================
// APP.JS - ChipsWallet (NEW)
// Gestisce navigazione e dark mode
// ==============================

// Avvio dell'app al caricamento della pagina
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
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
