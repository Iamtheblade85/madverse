// ==============================
// UI.JS - ChipsWallet (NEW)
// Parte 1: Wallet
// ==============================

// Toast notification system
function showToast(message, isSuccess = true) {
  const toast = document.createElement('div');
  toast.className = `toast ${isSuccess ? 'success' : 'error'}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 100);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==============================
// Wallet Page Rendering
// ==============================
async function renderWallet(balances) {
  const main = document.getElementById('main-content');
  if (!balances || !balances.balances || balances.balances.length === 0) {
    main.innerHTML = "<p>No balances found.</p>";
    return;
  }

  let html = `
    <h2>Wallet Balances</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Token</th>
            <th>Amount</th>
            <th>Withdraw</th>
            <th>Transfer</th>
            <th>Swap</th>
          </tr>
        </thead>
        <tbody>
  `;

  balances.balances.forEach(balance => {
    html += `
      <tr>
        <td>${balance.symbol}</td>
        <td>${balance.amount}</td>
        <td><button class="withdraw-btn" data-symbol="${balance.symbol}">Withdraw</button></td>
        <td><button class="transfer-btn" data-symbol="${balance.symbol}">Transfer</button></td>
        <td><button class="swap-btn" data-symbol="${balance.symbol}">Swap</button></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  main.innerHTML = html;

  setupWalletActions();
}

// ==============================
// Setup Wallet Actions
// ==============================
function setupWalletActions() {
  document.querySelectorAll('.withdraw-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const symbol = btn.getAttribute('data-symbol');
      const quantity = prompt(`Enter quantity to withdraw for ${symbol}:`);
      if (!quantity || isNaN(quantity)) {
        showToast('Invalid quantity', false);
        return;
      }
      try {
        await withdrawToken(symbol, parseFloat(quantity));
        showToast(`Withdraw successful for ${symbol}!`);
        navigateTo('wallet'); // reload balances
      } catch (error) {
        showToast(`Withdraw failed: ${error.message}`, false);
      }
    });
  });

  document.querySelectorAll('.transfer-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const symbol = btn.getAttribute('data-symbol');
      const quantity = prompt(`Enter quantity to transfer for ${symbol}:`);
      const receiver = prompt(`Enter receiver WAX account:`);
      if (!quantity || isNaN(quantity) || !receiver) {
        showToast('Invalid input', false);
        return;
      }
      try {
        // Transfer non implementato server-side: simuliamo messaggio
        showToast(`Transfer simulated: ${quantity} ${symbol} to ${receiver}`, true);
      } catch (error) {
        showToast(`Transfer failed: ${error.message}`, false);
      }
    });
  });

  document.querySelectorAll('.swap-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const symbol = btn.getAttribute('data-symbol');
      const quantity = prompt(`Enter quantity to swap from ${symbol}:`);
      const toSymbol = prompt(`Enter token to swap to:`);
      if (!quantity || isNaN(quantity) || !toSymbol) {
        showToast('Invalid swap input', false);
        return;
      }
      try {
        await swapTokens(symbol, toSymbol, parseFloat(quantity));
        showToast(`Swap successful: ${symbol} ➔ ${toSymbol}`);
        navigateTo('wallet'); // reload balances
      } catch (error) {
        showToast(`Swap failed: ${error.message}`, false);
      }
    });
  });
}
// ==============================
// Parte 2: Staking Pools
// ==============================

async function renderStaking(poolsData) {
  const main = document.getElementById('main-content');

  if (!poolsData || !poolsData.pools || poolsData.pools.length === 0) {
    main.innerHTML = "<p>No staking pools found.</p>";
    return;
  }

  let html = `
    <h2>Staking Pools</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Pool ID</th>
            <th>Deposit Token</th>
            <th>Status</th>
            <th>Created</th>
            <th>Stake</th>
          </tr>
        </thead>
        <tbody>
  `;

  poolsData.pools.forEach(pool => {
    html += `
      <tr>
        <td>${pool.pool_id}</td>
        <td>${pool.deposit_token}</td>
        <td>${pool.status}</td>
        <td>${new Date(pool.created_at).toLocaleString()}</td>
        <td><button class="stake-btn" data-pool-id="${pool.pool_id}">Stake</button></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  main.innerHTML = html;

  setupStakeActions();
}

// ==============================
// Setup Stake Actions
// ==============================
function setupStakeActions() {
  document.querySelectorAll('.stake-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const poolId = btn.getAttribute('data-pool-id');
      const amount = prompt(`Enter amount to stake into Pool #${poolId}:`);
      if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
        showToast('Invalid staking amount', false);
        return;
      }
      try {
        await stakeTokens(poolId, parseFloat(amount));
        showToast(`Successfully staked into Pool #${poolId}`);
        navigateTo('staking'); // ricarica la pagina staking
      } catch (error) {
        showToast(`Staking failed: ${error.message}`, false);
      }
    });
  });
}
// ==============================
// Parte 3: NFTs Inventory
// ==============================

async function renderNFTs(nftsData) {
  const main = document.getElementById('main-content');

  if (!nftsData || !nftsData.nfts || nftsData.nfts.length === 0) {
    main.innerHTML = "<p>No NFTs found in your inventory.</p>";
    return;
  }

  let html = `
    <h2>Your NFT Inventory</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Asset ID</th>
            <th>Template ID</th>
            <th>Template Name</th>
          </tr>
        </thead>
        <tbody>
  `;

  nftsData.nfts.forEach(nft => {
    html += `
      <tr>
        <td>${nft.asset_id}</td>
        <td>${nft.template_id}</td>
        <td>${nft.template_name || 'Unnamed'}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  main.innerHTML = html;
}
// ==============================
// Parte 4: NFT Farms
// ==============================

async function renderNFTFarms(farmsData) {
  const main = document.getElementById('main-content');

  if (!farmsData || !farmsData.farms || farmsData.farms.length === 0) {
    main.innerHTML = "<p>No NFT Farms found.</p>";
    return;
  }

  let html = `
    <h2>NFT Farms</h2>
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Farm ID</th>
            <th>Farm Name</th>
            <th>Reward Token</th>
            <th>Current Rewards</th>
            <th>Add Reward</th>
            <th>Remove Template</th>
          </tr>
        </thead>
        <tbody>
  `;

  farmsData.farms.forEach(farm => {
    html += `
      <tr>
        <td>${farm.farm_id}</td>
        <td>${farm.farm_name || 'Unnamed Farm'}</td>
        <td>${farm.reward_token}</td>
        <td>${farm.current_rewards}</td>
        <td><button class="add-reward-btn" data-farm-id="${farm.farm_id}">Add Reward</button></td>
        <td><button class="remove-template-btn" data-template-id="${farm.template_id}">Remove</button></td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  main.innerHTML = html;

  setupFarmsActions();
}

// ==============================
// Setup Farms Actions
// ==============================
function setupFarmsActions() {
  // Add Reward
  document.querySelectorAll('.add-reward-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const farmId = btn.getAttribute('data-farm-id');
      const tokenSymbol = prompt(`Enter token symbol to add as reward for Farm #${farmId}:`);
      const amount = prompt(`Enter amount to add as reward:`);

      if (!tokenSymbol || !amount || isNaN(amount) || parseFloat(amount) <= 0) {
        showToast('Invalid input for reward', false);
        return;
      }

      try {
        await addFarmReward(farmId, tokenSymbol, parseFloat(amount));
        showToast(`Successfully added ${amount} ${tokenSymbol} to Farm #${farmId}`);
        navigateTo('pools'); // reload farms
      } catch (error) {
        showToast(`Adding reward failed: ${error.message}`, false);
      }
    });
  });

  // Remove Template
  document.querySelectorAll('.remove-template-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const templateId = btn.getAttribute('data-template-id');
      const confirmDelete = confirm(`Are you sure you want to remove Template ID ${templateId} from farm?`);

      if (!confirmDelete) return;

      try {
        await removeFarmTemplate(templateId);
        showToast(`Template ID ${templateId} successfully removed from farm`);
        navigateTo('pools'); // reload farms
      } catch (error) {
        showToast(`Removing template failed: ${error.message}`, false);
      }
    });
  });
}
// ==============================
// Parte 5: Account/Profile
// ==============================

async function renderProfile(profileData) {
  const main = document.getElementById('main-content');

  if (!profileData || !profileData.general_data) {
    main.innerHTML = "<p>Unable to load profile information.</p>";
    showToast("Failed to load profile data", false);
    return;
  }

  const general = profileData.general_data;
  const mining = profileData.mining_info;
  const sqj = profileData.sqj_data;
  const chipsPass = profileData.chips_pass;
  const sqjPass = profileData.sqj_pass;
  const boosterReport = profileData.booster_report;

  let html = `
    <h2>Profile Overview</h2>

    <section class="profile-section">
      <h3>General Information 🧑</h3>
      <p><strong>Username:</strong> ${general.username}</p>
      <p><strong>Wax Account:</strong> ${general.wax_account}</p>
      <p><strong>Tier Level:</strong> ${general.tier_level}</p>
      <p><strong>Chips Level:</strong> ${general.chips_level}</p>
      <p><strong>XP (Messages Sent):</strong> ${general.chips_xp_actual}</p>
    </section>

    <section class="profile-section">
      <h3>Mining Rewards Info ⛏️</h3>
      <table>
        <thead>
          <tr>
            <th>Message Type</th>
            <th>Token Reward</th>
            <th>XP Reward</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Short Messages</td>
            <td>${mining.base_rewards.short_messages.tokens_reward}</td>
            <td>${mining.base_rewards.short_messages.xp_rewards}</td>
          </tr>
          <tr>
            <td>Long Messages</td>
            <td>${mining.base_rewards.long_messages.tokens_reward}</td>
            <td>${mining.base_rewards.long_messages.xp_rewards}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="profile-section">
      <h3>Booster Effects 🎯</h3>
      <p><strong>Common Boosters:</strong> ${mining.extra.booster_rewards.common} (+${mining.extra.total.common_percentage}%)</p>
      <p><strong>Rare Boosters:</strong> ${mining.extra.booster_rewards.rare} (+${mining.extra.total.rare_percentage}%)</p>
      <p><strong>Epic Boosters:</strong> ${mining.extra.booster_rewards.epic} (+${mining.extra.total.epic_percentage}%)</p>
      <p><strong>Legendary Boosters:</strong> ${mining.extra.booster_rewards.legendary} (+${mining.extra.total.legendary_percentage}%)</p>
      <p><strong>Total Booster Effect:</strong> +${mining.extra.total.booster_rewards_percentage}%</p>
    </section>

    <section class="profile-section">
      <h3>SQJ Palace Info 🏰</h3>
      <p><strong>SQJ Level:</strong> ${sqj.level}</p>
      <p><strong>Current XP:</strong> ${sqj.current_xp}</p>
      <p><strong>XP to Next Level:</strong> ${sqj.xp_to_next_level}</p>

      <h4>Rewards:</h4>
      <ul>
        ${sqj.rewards.map(reward => `
          <li>
            <strong>${reward.token}:</strong> +${reward.short} (Short) / +${reward.long} (Long)
          </li>
        `).join('')}
      </ul>
    </section>

    <section class="profile-section">
      <h3>Pass Status 🔒</h3>
      <p><strong>Chips Pass:</strong> ${chipsPass ? '<span class="badge success">Active</span>' : '<span class="badge error">Inactive</span>'}</p>
      <p><strong>SQJ Pass:</strong> ${sqjPass ? '<span class="badge success">Active</span>' : '<span class="badge error">Inactive</span>'}</p>
    </section>

    <section class="profile-section">
      <h3>Booster XP Report 📈</h3>
      <ul>
        ${boosterReport.map(item => `
          <li>
            <strong>Level ${item.level}:</strong> ${item.xp_bonus} XP Bonus
          </li>
        `).join('')}
      </ul>
    </section>
  `;

  main.innerHTML = html;
}
