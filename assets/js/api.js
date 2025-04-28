// ==============================
// API.JS - ChipsWallet (NEW)
// Comunicazione con il backend API
// ==============================

// Imposta l'URL base
const BASE_URL = "https://iamemanuele.pythonanywhere.com";

// Funzione helper per gestire errori
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Server Error");
    }
    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// ==============================
// GET Requests
// ==============================

// Wallet balances
async function getBalances() {
  return fetchAPI(`/saldo?user_id=${userId}&usx_token=${token}`);
}

// Staking pools
async function getStakingPools() {
  return fetchAPI(`/open_pools?user_id=${userId}&usx_token=${token}`);
}

// NFT Inventory
async function getNFTInventory() {
  return fetchAPI(`/mynfts?user_id=${userId}&usx_token=${token}`);
}

// NFT Farms (Pools)
async function getNFTFarms() {
  return fetchAPI(`/nfts_farms?user_id=${userId}&usx_token=${token}`);
}

// User Profile
async function getProfile() {
  return fetchAPI(`/profile?user_id=${userId}&usx_token=${token}`);
}

// ==============================
// POST Requests
// ==============================

// Withdraw tokens
async function withdrawToken(symbol, amount) {
  const body = {
    wax_account: userWaxAccount,
    token_symbol: symbol,
    amount: amount
  };
  return fetchAPI(`/withdraw?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Swap tokens
async function swapTokens(fromSymbol, toSymbol, amount) {
  const body = {
    wax_account: userWaxAccount,
    from_token: fromSymbol,
    to_token: toSymbol,
    amount: amount
  };
  return fetchAPI(`/swap_tokens?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Stake tokens
async function stakeTokens(poolId, amount) {
  const body = {
    wax_account: userWaxAccount,
    pool_id: poolId,
    amount: amount
  };
  return fetchAPI(`/stake?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Create a new staking pool
async function createStakingPool(poolData) {
  return fetchAPI(`/create_staking_pool?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(poolData)
  });
}

// Create a new NFT farm
async function createNFTFarm(farmData) {
  return fetchAPI(`/create_nft_farm?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(farmData)
  });
}

// Add a reward token to a farm
async function addFarmReward(farmId, tokenSymbol, amount) {
  const body = {
    farm_id: farmId,
    token_symbol: tokenSymbol,
    amount: amount
  };
  return fetchAPI(`/add_token_to_farm?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Update rewards for a template
async function updateTemplateRewards(templateId, rewards) {
  const body = {
    template_id: templateId,
    rewards: rewards
  };
  return fetchAPI(`/update_template_rewards?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Remove a farm template
async function removeFarmTemplate(templateId) {
  const body = {
    template_id: templateId
  };
  return fetchAPI(`/remove_template?user_id=${userId}&usx_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
