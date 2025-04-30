// create-nft-pool.js

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

    renderCreatedFarmButtons(data.farms);
    renderCreatedFarmDetails(data.farms[0]);
  } catch (err) {
    container.innerHTML = `<div class="text-red-500">Error loading your farms.</div>`;
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
