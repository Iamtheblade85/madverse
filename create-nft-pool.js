// File: create-nft-pool.js

async function loadCreateNFTFarm() {
  const container = document.getElementById("create-nfts-farm-container");
  const { userId, usx_token } = window.userData;

  try {
    const res = await fetch(`${BASE_URL}/get_farms?user_id=${userId}&usx_token=${usx_token}`);
    const data = await res.json();

    if (!res.ok || data.error) {
      container.innerHTML = `
        <div class="text-red-500 italic">You have no created farms yet.</div>
      `;
      return;
    }

    window.createdFarms = data.farms;
    renderCreatedFarms(data.farms);
  } catch (err) {
    console.error("[❌] Error loading created farms:", err);
    container.innerHTML = `<div class="text-red-500">Error loading your farms. Please try again later.</div>`;
  }
}

function renderCreatedFarms(farms) {
  const container = document.getElementById("create-nfts-farm-container");
  container.innerHTML = `
    <input type="text" id="search-created-farm" placeholder="Search your farm name..." class="mb-4 p-2 border rounded w-full md:w-1/2">
    <div id="created-farm-buttons" class="flex flex-wrap gap-2 mb-4"></div>
    <div id="created-farm-details"></div>
  `;

  const searchInput = document.getElementById("search-created-farm");
  const buttonContainer = document.getElementById("created-farm-buttons");

  function renderButtons(filteredFarms) {
    buttonContainer.innerHTML = '';
    filteredFarms.forEach(farm => {
      const btn = document.createElement("button");
      btn.className = "btn-action";
      btn.textContent = farm.farm_name;
      btn.onclick = () => renderFarmDetails(farm);
      buttonContainer.appendChild(btn);
    });
  }

  renderButtons(farms);

  searchInput.addEventListener("input", () => {
    const search = searchInput.value.toLowerCase();
    const filtered = farms.filter(f => f.farm_name.toLowerCase().includes(search));
    renderButtons(filtered);
  });
}

function renderFarmDetails(farm) {
  const details = document.getElementById("created-farm-details");

  const totalRewardsHTML = farm.total_rewards.map(r => `
    <span class="mr-2 text-sm">💰 ${r.token_symbol}: <strong>${parseFloat(r.total_reward).toFixed(4)}</strong></span>
  `).join("");

  const templatesHTML = farm.templates.map(t => {
    const rewardsHTML = t.daily_rewards.map(r => `
      <li class="text-xs">${r.token_symbol}: ${parseFloat(r.daily_reward_amount).toFixed(4)}/day</li>
    `).join("");

    return `
      <div class="border-t pt-2 mt-2">
        <div class="text-sm font-bold">Template ID: ${t.template_id}</div>
        <ul class="ml-4 text-gray-600">${rewardsHTML}</ul>
      </div>
    `;
  }).join("");

  details.innerHTML = `
    <div class="bg-white p-4 rounded shadow">
      <h3 class="text-lg font-bold mb-2 flex flex-wrap gap-2">
        ${farm.farm_name} <span class="text-sm font-normal text-gray-500">(${farm.status})</span>
      </h3>
      <div class="mb-2 text-sm text-gray-600">
        Created: ${new Date(farm.creation_date).toLocaleDateString()}<br>
        Updated: ${new Date(farm.updated_on).toLocaleDateString()}
      </div>
      <div class="mb-2">${totalRewardsHTML}</div>
      ${templatesHTML || '<div class="text-sm text-gray-400 italic">No templates yet</div>'}
    </div>
  `;
}

