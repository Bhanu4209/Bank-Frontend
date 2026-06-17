const API_BASE =
  window.location.hostname === "localhost"
    ? "http://localhost:3000/api"
    : "https://YOUR-RENDER-APP.onrender.com/api";

let currentUser = null;

// ---------- helpers ----------
function showMsg(id, text, ok) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = "msg show " + (ok ? "ok" : "err");
}
function clearMsg(id) {
  const el = document.getElementById(id);
  el.className = "msg";
}

async function api(path, options = {}) {
  const token = localStorage.getItem("token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE + path, {
    ...options,
    headers,
    credentials: "include"
  });

  let data = {};
  try { data = await res.json(); } catch (e) {}

  if (!res.ok) {
    throw new Error(data.message || ("Request failed (" + res.status + ")"));
  }
  return data;
}

function genIdempotencyKey() {
  return "tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
}

// ---------- connection check ----------
async function checkConnection() {
  const statusEl = document.getElementById("connStatus");
  try {
    const res = await fetch(API_BASE.replace("/api", "/"));
    if (res.ok) {
      statusEl.textContent = "backend connected";
      statusEl.classList.add("connected");
    } else {
      statusEl.textContent = "backend reachable, unexpected response";
    }
  } catch (e) {
    statusEl.textContent = "backend not reachable — is it running on :3000?";
  }
}

// ---------- auth view toggles ----------
function showRegister() {
  document.getElementById("loginForm").classList.add("hidden");
  document.getElementById("registerForm").classList.remove("hidden");
  document.getElementById("authTitle").textContent = "Register";
}
function showLogin() {
  document.getElementById("registerForm").classList.add("hidden");
  document.getElementById("loginForm").classList.remove("hidden");
  document.getElementById("authTitle").textContent = "Log in";
}

// ---------- auth actions ----------
async function register() {
  clearMsg("regMsg");
  const name = document.getElementById("regName").value.trim();
  const email = document.getElementById("regEmail").value.trim();
  const password = document.getElementById("regPassword").value;

  if (!name || !email || !password) {
    showMsg("regMsg", "Fill in name, email, and password.", false);
    return;
  }

  const btn = document.getElementById("regBtn");
  btn.disabled = true;
  try {
    const data = await api("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password })
    });
    localStorage.setItem("token", data.token);
    currentUser = data.user;
    enterApp();
  } catch (e) {
    showMsg("regMsg", e.message, false);
  } finally {
    btn.disabled = false;
  }
}

async function login() {
  clearMsg("loginMsg");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  if (!email || !password) {
    showMsg("loginMsg", "Enter email and password.", false);
    return;
  }

  const btn = document.getElementById("loginBtn");
  btn.disabled = true;
  try {
    const data = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    localStorage.setItem("token", data.token);
    currentUser = data.user;
    enterApp();
  } catch (e) {
    showMsg("loginMsg", e.message, false);
  } finally {
    btn.disabled = false;
  }
}

async function logout() {
  clearMsg("logoutMsg");
  try {
    await api("/auth/logout", { method: "POST" });
  } catch (e) {
    // even if the call fails, clear local state so the UI is usable
  }
  localStorage.removeItem("token");
  currentUser = null;
  document.getElementById("appPanel").classList.add("hidden");
  document.getElementById("authPanel").classList.remove("hidden");
  showLogin();
}

// ---------- app view ----------
function enterApp() {
  document.getElementById("authPanel").classList.add("hidden");
  document.getElementById("appPanel").classList.remove("hidden");
  document.getElementById("userInfo").textContent =
    (currentUser?.name || "—") + "  ·  " + (currentUser?.email || "—");
  loadAccounts();
}

async function loadAccounts() {
  clearMsg("accountMsg");
  const list = document.getElementById("accountsList");
  list.innerHTML = '<div class="empty-note">Loading…</div>';
  try {
    const data = await api("/accounts");
    const accounts = data.accounts || [];
    if (accounts.length === 0) {
      list.innerHTML = '<div class="empty-note">No accounts yet. Create one above.</div>';
      return;
    }
    list.innerHTML = "";
    for (const acc of accounts) {
      const card = document.createElement("div");
      card.className = "account-card";
      card.innerHTML = `
        <div>
          <div>${acc.currency || "INR"} · ${acc.status}</div>
          <div class="id">${acc._id}</div>
        </div>
        <div class="balance-tag" id="bal-${acc._id}">…</div>
      `;
      list.appendChild(card);
      loadBalance(acc._id);
    }
  } catch (e) {
    list.innerHTML = "";
    showMsg("accountMsg", e.message, false);
  }
}

async function loadBalance(accountId) {
  const el = document.getElementById("bal-" + accountId);
  try {
    const data = await api("/accounts/balance/" + accountId);
    el.textContent = data.balance;
  } catch (e) {
    el.textContent = "—";
  }
}

async function createAccount() {
  clearMsg("accountMsg");
  try {
    await api("/accounts", { method: "POST" });
    showMsg("accountMsg", "Account created.", true);
    loadAccounts();
  } catch (e) {
    showMsg("accountMsg", e.message, false);
  }
}

async function sendTransaction() {
  clearMsg("txMsg");
  const fromAccount = document.getElementById("fromAccount").value.trim();
  const toAccount = document.getElementById("toAccount").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);

  if (!fromAccount || !toAccount || !amount || amount <= 0) {
    showMsg("txMsg", "Fill in from, to, and a positive amount.", false);
    return;
  }

  const btn = document.getElementById("sendBtn");
  btn.disabled = true;
  showMsg("txMsg", "Sending — this endpoint takes ~15s by design, please wait…", true);
  try {
    const data = await api("/transactions", {
      method: "POST",
      body: JSON.stringify({
        fromAccount,
        toAccount,
        amount,
        idempotencyKey: genIdempotencyKey()
      })
    });
    showMsg("txMsg", data.message || "Transaction completed.", true);
    loadAccounts();
  } catch (e) {
    showMsg("txMsg", e.message, false);
  } finally {
    btn.disabled = false;
  }
}

// ---------- boot ----------
(function init() {
  checkConnection();
  const token = localStorage.getItem("token");
  if (token) {
    // We don't have a "get current user" endpoint, so just try loading accounts;
    // if the token is invalid the API call will fail and we fall back to login.
    currentUser = { name: "", email: "" };
    enterApp();
    document.getElementById("userInfo").textContent = "Logged in (token found)";
  }
})();
