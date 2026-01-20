    const API_URL = "https://script.google.com/macros/s/AKfycbxq5F8-Vrdf_vESgan85HyfwmXw9bBcjFtr1beeuvQLL1TUAWYvseSsDuDP30Mv-a_T9g/exec";
document.addEventListener("DOMContentLoaded", initApp);

async function initApp() {
  try {
    const ping = await apiGet("ping");
    console.log("API OK", ping);

    const res = await apiGet("getData");
    if (!res.success) throw res.message;

    renderTable(res.data);

  } catch (e) {
    showError(e);
  }
}

function apiGet(action) {
  return fetch(`${API_URL}?action=${action}`)
    .then(r => r.json());
}

function apiPost(action, data) {
  return fetch(`${API_URL}?action=${action}`, {
    method: "POST",
    body: JSON.stringify(data)
  }).then(r => r.json());
}

function renderTable(data) {
  if (!data.length) return;

  const thead = document.getElementById("thead");
  const tbody = document.getElementById("tbody");

  thead.innerHTML = "";
  Object.keys(data[0]).forEach(k => {
    thead.innerHTML += `<th>${k}</th>`;
  });

  tbody.innerHTML = "";
  data.forEach(row => {
    let tr = "<tr>";
    Object.values(row).forEach(v => {
      tr += `<td>${v}</td>`;
    });
    tr += "</tr>";
    tbody.innerHTML += tr;
  });
}

function showError(err) {
  document.getElementById("error").innerText =
    typeof err === "string" ? err : err.message || err;
}
;
