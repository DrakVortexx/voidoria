import { io } from "../vendor/socket.io.esm.min.js";

(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const UI = {
    authScreen: $("#auth-screen"),
    customizeScreen: $("#customize-screen"),
    dashboardScreen: $("#dashboard-screen"),
    game: $("#game"),
    connecting: $("#connecting"),
    menuOverlay: $("#menu-overlay"),
  };

  // block color map for hotbar/shop icons (matching server block ids)
  const BLOCK_COLORS = {
    "block:dirt": "#8a5a36", "block:grass": "#5fb04a", "block:stone": "#8a8a8a",
    "block:cobblestone": "#6f6f6f", "block:planks": "#b99666", "block:wood": "#6b4a2a",
    "block:leaves": "#3f9c35", "block:sand": "#e8dba0", "block:sandstone": "#d8c699",
    "block:gravel": "#7f7f7f", "block:glass": "#bcd7e8", "block:coal_ore": "#3a3a3a",
    "block:iron_ore": "#d8b38a", "block:gold_ore": "#f5cd42", "block:diamond_ore": "#58e0c3",
    "block:void_ore": "#6b21a8", "block:void_stone": "#2b2440", "block:void_grass": "#5b4ab0",
    "block:cactus": "#3a8a32", "block:flower": "#ff7bd5", "block:stasis_chamber": "#7b5cf6",
  };

  const state = {
    user: null,
    profile: null,
    settings: null,
    inventory: [],
    catalog: {},
    selectedHotbar: 0,
    hotbar: new Array(9).fill(null),
    levelXpNeed: 100,
    socket: null,
    engine: null,
    connected: false,
  };

  const VOIDORIA = {
    state,
    getSelectedHotbar() { return state.hotbar[state.selectedHotbar]; },

    async goCustomize(user) {
      UI.authScreen.style.display = "none";
      window.Customize.show();
    },

    async showDashboard(user) {
      state.user = user;
      UI.authScreen.style.display = "none";
      UI.customizeScreen.style.display = "none";
      UI.game.style.display = "none";
      UI.menuOverlay.style.display = "none";
      await loadProfile();
      renderDashboard();
      UI.dashboardScreen.style.display = "flex";
    },

    async enterGame(user) {
      state.user = user;
      UI.authScreen.style.display = "none";
      UI.customizeScreen.style.display = "none";
      UI.dashboardScreen.style.display = "none";
      UI.game.style.display = "block";
      UI.connecting.style.display = "flex";
      await loadProfile();
      const meta = await API.meta();
      const cat = await API.world.catalog();
      state.catalog = cat.catalog;
      initEngine();
      await connectSocket();
      if (!state.connected) {
        notice("Failed to connect to game server", true);
      }
      UI.connecting.style.display = "none";
    },

    notify(title, msg, kind) { notice(title, msg, kind); },
  };

  window.VOIDORIA = VOIDORIA;

  // ---------- Auth boot ----------
  async function boot() {
    try {
      const data = await API.auth.me();
      if (!data.user) { showAuth(); return; }
      state.user = data.user;
      if (!data.player) {
        // user exists but never customized
        VOIDORIA.goCustomize(data.user);
        return;
      }
      VOIDORIA.showDashboard(data.user);
    } catch (e) {
      showAuth();
    }
  }

  function showAuth() {
    UI.authScreen.style.display = "flex";
    UI.game.style.display = "none";
    UI.customizeScreen.style.display = "none";
    UI.dashboardScreen.style.display = "none";
  }

  // ---------- Profile load ----------
  async function loadProfile() {
    const p = await API.player.me();
    state.profile = p.profile;
    state.settings = p.settings;
    state.levelXpNeed = p.profile.level * 100;
  }

  function renderDashboard() {
    const p = state.profile;
    if (!p) return;
    $("#dash-name").textContent = p.displayName;
    let coins = p.coins;
    API.economy.bal().then((r) => {
      coins = r.balance;
      drawDashStats();
    }).catch(() => drawDashStats());
    function drawDashStats() {
      $("#dash-stats").innerHTML = `
        <div class="dash-stat"><div class="k">Balance</div><div class="v money">$${(coins || 0).toLocaleString()}</div></div>
        <div class="dash-stat"><div class="k">Level</div><div class="v lvl">${p.level || 1}</div></div>
        <div class="dash-stat"><div class="k">Kills</div><div class="v">${p.kills || 0}</div></div>
        <div class="dash-stat"><div class="k">Deaths</div><div class="v">${p.deaths || 0}</div></div>
        <div class="dash-stat span2"><div class="k">Dimension</div><div class="v">${escapeHtml(p.dimension || "overworld")}</div></div>
      `;
    }
  }

  // ---------- Engine ----------
  function initEngine() {
    const canvas = $("#game-canvas");
    const engine = new window.VoxelEngine(canvas);
    engine.init();
    engine.position.x = state.profile.pos.x;
    engine.position.y = state.profile.pos.y;
    engine.position.z = state.profile.pos.z;
    engine.resetDimension(state.profile.dimension);
    state.engine = engine;
    engine.startLoop();
  }

  // ---------- Socket ----------
  function connectSocket() {
    return new Promise((resolve) => {
      const token = getCookie("session_token");
      const socket = io({ auth: { token } });
      state.socket = socket;
      if (state.engine) state.engine.setSocket(socket);

      socket.on("connect", () => {
        state.connected = true;
        socket.emit("move", { x: state.profile.pos.x, y: state.profile.pos.y, z: state.profile.pos.z, onGround: true });
        resolve();
      });

      socket.on("connect_error", (err) => {
        state.connected = false;
        notice("Socket error: " + err.message, true);
        resolve();
      });

      socket.on("world:init", (d) => {
        state.engine.resetDimension(d.isVoid ? "void" : "overworld");
      });

      socket.on("chunk", (d) => state.engine.onChunk(d));
      socket.on("chunk:unload", (d) => state.engine.onUnloadChunk(d));
      socket.on("block:update", (d) => {
        state.engine.onBlockUpdate(d);
        if (d.block === 0 && d.prev === 21) { /* void shard mined */ }
        refreshInventory();
      });

      socket.on("player:move", (d) => state.engine.updateOtherPlayer(d.id, d));
      socket.on("player:join", (d) => addChat("sys", d.name + " joined the server"));
      socket.on("player:leave", (d) => { state.engine.removeOtherPlayer(d.id); addChat("sys", "A player left"); });

      socket.on("chat", (d) => addChat(d.name, d.message));

      socket.on("forest", (d) => {});
      socket.on("border", (d) => { state.engine.position.x = d.x; state.engine.position.z = d.z; });

      socket.on("stats", (d) => updateHud(d));
      socket.on("inventory:update", () => refreshInventory());

      socket.on("teleport", (d) => state.engine.teleport(d));

      socket.on("damage", (d) => {
        updateHud({ health: d.health });
        flashDamage();
      });
      socket.on("respawn", (d) => { state.engine.teleport(d); });

      socket.on("void:hazard", (d) => {
        if (Date.now() < voidProtectedUntil) return; // still shielded
        notice("The Void consumes you!", "Void emergence!");
        voidEmergency();
      });
      socket.on("void:protected", () => { voidProtectedUntil = Date.now() + 8000; notice("A Void Totem shields you!", "Protected"); });

      socket.on("tp:request", (d) => {
        pendingTp = d;
        const el = $("#tp-prompt");
        $("#tp-prompt-text").textContent = d.kind === "tpa"
          ? (d.from + " wants to teleport to you.")
          : (d.from + " wants to teleport you to them.");
        el.style.display = "block";
      });

      socket.on("notification", (d) => notice(d.title, d.message));
      socket.on("bounty:claimed", (d) => notice("Bounty!", d.killer + " claimed a bounty on " + d.target));
      socket.on("fatal", (d) => { notice(d.error, "", true); });
      socket.on("error", (d) => notice(d.error, "", true));
    });
  }

  let pendingTp = null;
  let voidProtectedUntil = 0;
  $("#tp-accept").addEventListener("click", async () => {
    if (!pendingTp) return;
    pendingTp = null;
    $("#tp-prompt").style.display = "none";
    try { await API.teleport.tpaccept({ requestId: 0 }); } catch (e) {}
  });
  $("#tp-deny").addEventListener("click", async () => {
    if (!pendingTp) return;
    pendingTp = null;
    $("#tp-prompt").style.display = "none";
  });

  // ---------- HUD ----------
  function updateHud(d) {
    if (d.health !== undefined) {
      $("#bar-health").style.width = (d.health / (d.maxHealth || 20) * 100) + "%";
      $("#health-num").textContent = Math.floor(d.health);
    }
    if (d.hunger !== undefined) {
      $("#bar-hunger").style.width = (d.hunger / 20 * 100) + "%";
      $("#hunger-num").textContent = Math.floor(d.hunger);
    }
    if (d.xp !== undefined && d.level !== undefined) {
      const need = d.level * 100;
      $("#bar-xp").style.width = (d.xp / need * 100) + "%";
      $("#level-num").textContent = "Lv " + d.level;
      state.levelXpNeed = need;
    }
    if (d.x !== undefined) {
      const dim = d.dimension === "void" ? "Void" : "Overworld";
      $("#hud-coords").textContent = Math.floor(d.x) + ", " + Math.floor(d.y) + ", " + Math.floor(d.z) + " · " + dim;
    }
    if (d.coins !== undefined) {
      $("#hud-currency").textContent = "$" + Number(d.coins).toLocaleString();
    }
  }

  function flashDamage() {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;background:rgba(200,0,0,.35);z-index:7;pointer-events:none;transition:opacity .4s;";
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; setTimeout(() => el.remove(), 400); }, 60);
  }

  // ---------- Hotbar / Inventory ----------
  async function refreshInventory() {
    try {
      const data = await API.player.inventory();
      state.inventory = data.inventory;
      state.hotbar = new Array(9).fill(null);
      for (const it of data.inventory) {
        if (it.slot >= 0 && it.slot < 9) {
          state.hotbar[it.slot] = { itemType: it.itemType, amount: it.amount };
        }
      }
      renderHotbar();
    } catch (e) {}
  }

  function renderHotbar() {
    for (let i = 0; i < 9; i++) {
      const slotEl = $(`.hotbar-slot[data-hotbar="${i}"]`);
      slotEl.classList.toggle("active", state.selectedHotbar === i);
      const item = state.hotbar[i];
      let inner = "";
      if (item) {
        const color = BLOCK_COLORS[item.itemType] || "#777";
        inner = `<div class="ic" style="background:${color};border-radius:4px;"></div>`;
        slotEl.querySelector(".amt").textContent = item.amount || "";
      } else {
        inner = "";
        slotEl.querySelector(".amt").textContent = "";
      }
      const ic = slotEl.querySelector(".ic");
      if (ic) ic.remove();
      if (inner) slotEl.insertAdjacentHTML("afterbegin", inner);
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= 9) { state.selectedHotbar = n - 1; renderHotbar(); }
    }
    if (e.code === "KeyE") toggleMenu();
    if (e.code === "Escape") { if (UI.menuOverlay.style.display !== "none") closeMenu(); }
  });

  // ---------- Chat ----------
  function addChat(name, message) {
    const box = $("#chat-messages");
    const row = document.createElement("div");
    row.className = "msg";
    if (name === "sys") { row.innerHTML = `<span class="sys">${escapeHtml(message)}</span>`; }
    else { row.innerHTML = `<span class="name">${escapeHtml(name)}</span>: ${escapeHtml(message)}`; }
    box.appendChild(row);
    while (box.children.length > 40) box.removeChild(box.firstChild);
  }

  async function sendChat(text) {
    if (text.startsWith("/")) {
      await runCommand(text);
      return;
    }
    if (state.socket && state.socket.connected) state.socket.emit("chat", { message: text });
  }

  async function runCommand(text) {
    const parts = text.slice(1).trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    try {
      switch (cmd) {
        case "bal": { const r = await API.economy.bal(); addChat("sys", `Your balance: $${r.balance.toLocaleString()}`); break; }
        case "baltop": {
          const r = await API.economy.baltop();
          addChat("sys", baltopText(r.baltop)); break;
        }
        case "pay": {
          if (parts.length < 3) return addChat("sys", "Usage: /pay <player> <amount>");
          const r = await API.economy.pay({ username: parts[1], amount: Number(parts[2]) });
          addChat("sys", r.message); break;
        }
        case "spawn": { const r = await API.teleport.spawn(); addChat("sys", r.message); break; }
        case "rtp": { const r = await API.teleport.rtp(); addChat("sys", r.message); break; }
        case "home": { const r = await API.teleport.home({ name: parts[1] || "home" }); addChat("sys", r.message); break; }
        case "sethome": { await commandSethome(parts[1]); break; }
        case "tpa": {
          if (!parts[1]) return addChat("sys", "Usage: /tpa <player>");
          const r = await API.teleport.tpa({ username: parts[1] }); addChat("sys", r.message); break;
        }
        case "tpahere": {
          if (!parts[1]) return addChat("sys", "Usage: /tpahere <player>");
          const r = await API.teleport.tpahere({ username: parts[1] }); addChat("sys", r.message); break;
        }
        case "shop": addChat("sys", "Open the Shop from the menu (E) or the Shop panel."); break;
        case "ah": addChat("sys", "Open the Auction House from the menu (E)."); break;
        case "bounty": {
          if (!parts[1] || !parts[2]) return addChat("sys", "Usage: /bounty <player> <amount>");
          const r = await API.player.placeBounty({ target: parts[1], amount: Number(parts[2]) });
          addChat("sys", r.message); break;
        }
        case "bounties": { const r = await API.player.bounties(); addChat("sys", bountiesText(r.bounties)); break; }
        case "void": { const r = await API.world.travel({ dimension: "void" }); addChat("sys", r.message); break; }
        case "overworld": { const r = await API.world.travel({ dimension: "overworld" }); addChat("sys", r.message); break; }
        case "help": {
          addChat("sys", "Commands: /bal /pay /baltop /shop /ah /spawn /rtp /home /sethome /tpa /tpahere /bounty /bounties /void");
          break;
        }
        case "sellall": addChat("sys", "Use the Shop panel to sell items."); break;
        case "sell": addChat("sys", "Use the Shop panel to sell items."); break;
        default: addChat("sys", "Unknown command. Try /help"); break;
      }
    } catch (err) {
      addChat("sys", "Error: " + err.message);
    }
  }

  async function commandSethome(name) {
    const p = state.engine.position;
    const dim = state.engine.currentDimension;
    const r = await API.player.sethome({ name: name || "home", x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimension: dim });
    addChat("sys", r.message);
  }

  function baltopText(top) {
    return "Baltop: " + top.map((t, i) => `${i + 1}. ${t.name} $${t.amount.toLocaleString()}`).join("  ");
  }
  function bountiesText(list) {
    if (!list.length) return "No active bounties";
    return "Bounties: " + list.map((b) => `${b.target} $${b.amount.toLocaleString()}`).join("  ");
  }

  // Chat visibility
  let chatOpen = false;
  const chatInput = $("#chat-input");
  document.addEventListener("keydown", (e) => {
    if (e.code === "KeyT" && !chatOpen && UI.menuOverlay.style.display === "none") {
      chatOpen = true; chatInput.style.display = "block"; chatInput.focus();
      document.exitPointerLock && document.exitPointerLock();
    }
  });
  chatInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      const text = chatInput.value;
      chatInput.value = "";
      chatOpen = false; chatInput.style.display = "none";
      if (UI.menuOverlay.style.display === "none") state.engine.lock();
      if (text.trim()) await sendChat(text);
    } else if (e.key === "Escape") {
      chatOpen = false; chatInput.value = ""; chatInput.style.display = "none";
      state.engine.lock();
    }
  });
  $("#btn-chat-toggle").addEventListener("click", () => {
    if (!chatOpen) { chatOpen = true; chatInput.style.display = "block"; chatInput.focus(); }
  });

  // ---------- Notifications ----------
  function notice(title, message, isError) {
    const box = $("#notifications");
    const el = document.createElement("div");
    el.className = "note" + (isError ? " error" : "");
    el.innerHTML = title ? `<b>${escapeHtml(title)}</b>${message ? "<span>" + escapeHtml(message) + "</span>" : ""}` : escapeHtml(message);
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; setTimeout(() => el.remove(), 400); }, 4200);
    while (box.children.length > 6) box.removeChild(box.firstChild);
  }

  // ---------- Menu ----------
  function toggleMenu() {
    if (UI.menuOverlay.style.display === "none") openMenu(); else closeMenu();
  }
  async function openMenu() {
    UI.menuOverlay.style.display = "flex";
    document.exitPointerLock && document.exitPointerLock();
    await renderActivePanel();
    refreshInventory();
  }
  function closeMenu() {
    UI.menuOverlay.style.display = "none";
    state.engine.lock();
  }

  let activePanel = "profile";
  $$(".mnav").forEach((btn) => {
    btn.addEventListener("click", async () => {
      $$(".mnav").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activePanel = btn.dataset.panel;
      $$(".panel").forEach((p) => p.classList.remove("active"));
      $("#panel-" + activePanel).classList.add("active");
      await renderPanel(activePanel);
    });
  });

  async function renderActivePanel() {
    $$(".panel").forEach((p) => p.classList.remove("active"));
    $("#panel-" + activePanel).classList.add("active");
    await renderPanel(activePanel);
  }

  const PANEL_RENDERERS = {
    profile: renderProfile,
    inventory: renderInventoryPanel,
    shop: renderShop,
    auction: renderAuction,
    teleport: renderTeleport,
    bounties: renderBounties,
    homes: renderHomes,
    friends: renderFriends,
    settings: renderSettings,
    stats: renderStats,
    void: renderVoid,
  };

  async function renderPanel(name) {
    const fn = PANEL_RENDERERS[name];
    if (fn) await fn();
  }

  // ---------- Panels ----------
  async function renderProfile() {
    const p = state.profile;
    const el = $("#panel-profile");
    if (!p) {
      el.innerHTML = `<h2>Player Profile</h2><p class="sub">Your identity in Voidoria</p><p class="muted">Profile not loaded yet. Try again in a moment.</p>`;
      return;
    }
    el.innerHTML = `
      <h2>Player Profile</h2>
      <p class="sub">Your identity in Voidoria</p>
      <div class="avatar-block">
        <canvas id="profile-avatar" class="avatar-mini" width="64" height="64"></canvas>
        <div>
          <div class="grow"><strong>${escapeHtml(p.displayName)}</strong></div>
          <div class="muted">Level ${p.level} · ${p.kills} kills · ${p.deaths} deaths</div>
          <div class="muted">Dimension: ${p.dimension}</div>
        </div>
      </div>
      <div class="field">
        <input id="customize-edit" type="button" value="Edit Character">
      </div>
      <h3 style="margin-top:16px">Change Password</h3>
      <div class="field"><input id="pw-cur" type="password" placeholder="Current password"></div>
      <div class="field"><input id="pw-new" type="password" placeholder="New password"></div>
      <button class="btn primary" id="btn-change-pw">Update Password</button>
    `;
    drawMiniAvatar(state.profile.appearance || {});
    $("#customize-edit").addEventListener("click", () => {
      UI.game.style.display = "none";
      UI.menuOverlay.style.display = "none";
      window.Customize.show();
    });
    $("#btn-change-pw").addEventListener("click", async () => {
      try {
        await API.auth.changePassword({ currentPassword: $("#pw-cur").value, newPassword: $("#pw-new").value });
        notice("Password changed");
      } catch (err) { notice("", err.message, true); }
    });
  }

  function drawMiniAvatar(app) {
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#1a2050"; ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = app.skinTone || "#e0ac69"; ctx.fillRect(18, 8, 28, 18);
    ctx.fillStyle = app.shirtColor || "#2e7d9a"; ctx.fillRect(16, 26, 32, 18);
    ctx.fillStyle = app.hairColor || "#3b2a1a"; ctx.fillRect(18, 8, 28, 4);
    ctx.fillStyle = app.pantsColor || "#3f4c66"; ctx.fillRect(18, 44, 12, 12); ctx.fillRect(34, 44, 12, 12);
    swapCanvas("profile-avatar", c);
  }

  function swapCanvas(id, source) {
    const target = document.getElementById(id);
    if (!target) return;
    const ctx = target.getContext("2d");
    ctx.clearRect(0, 0, target.width, target.height);
    ctx.drawImage(source, 0, 0, target.width, target.height);
  }

  async function renderInventoryPanel() {
    const el = $("#panel-inventory");
    const inv = state.inventory;
    el.innerHTML = `<h2>Inventory</h2><p class="sub">${inv.length} stack(s)</p><div class="grid">` +
      inv.map((it) => {
        const color = BLOCK_COLORS[it.itemType] || "#777";
        const name = state.catalog[it.itemType]?.name || it.itemType;
        return `<div class="card"><h4>${icon(color)} ${escapeHtml(name)}</h4><div class="muted">x${it.amount}</div>
          <div class="btn-row">
            <button class="btn small primary" data-sell="${it.itemType}">Sell</button>
            <button class="btn small ghost" data-list="${it.itemType}">AH</button>
          </div></div>`;
      }).join("") + `</div>`;

    el.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", async () => {
      const itemType = b.dataset.sell;
      try { const r = await API.shop.sell({ itemType, quantity: await countOf(itemType) }); notice(r.message); refreshInventory(); }
      catch (err) { notice("", err.message, true); }
    }));
    el.querySelectorAll("[data-list]").forEach((b) => b.addEventListener("click", () => {
      state.auctionPrefill = b.dataset.list; switchTo("auction");
    }));
  }

  async function countOf(itemType) {
    const it = state.inventory.find((x) => x.itemType === itemType);
    return it ? it.amount : 1;
  }

  function icon(color) {
    return `<span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${color};vertical-align:-1px"></span>`;
  }

  async function renderShop() {
    const el = $("#panel-shop");
    el.innerHTML = `<h2>Voidoria Shop</h2><p class="sub">Prices are set by Voidoria and apply to everyone. Buy items from, or sell items to, the Shop.</p><div id="shop-body">Loading...</div>`;
    try {
      const data = await API.shop.all();
      let html = `<div class="toolbar"><select id="shop-cat"><option value="">All Categories</option>${data.categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select></div>`;
      html += data.categories.map((cat) => `
        <div class="shop-cat" data-cat="${cat.id}">
          <h3>${escapeHtml(cat.name)}</h3><div class="grid">
          ${cat.items.map((it) => `
            <div class="card">
              <h4>${icon(BLOCK_COLORS[it.itemType] || "#777")} ${escapeHtml(it.displayName)}</h4>
              <div class="muted">${it.buyPrice >= 0 ? `Buy $${it.buyPrice.toLocaleString()}` : "Not for sale"} · ${it.sellPrice >= 0 ? `Sell $${it.sellPrice.toLocaleString()}` : "Not sellable"}${it.stock != null ? ` · Stock: ${it.stock}` : ""}</div>
              <div class="btn-row">
                ${it.buyPrice >= 0 ? `<button class="btn small primary" data-buy="${it.itemType}">Buy</button>` : ""}
                ${it.sellPrice >= 0 ? `<button class="btn small ghost" data-sell="${it.itemType}">Sell</button>` : ""}
              </div>
            </div>`).join("")}
          </div></div>`).join("");
      el.querySelector("#shop-body").innerHTML = html;
      $("#shop-cat").addEventListener("change", (e) => {
        $$(".shop-cat").forEach((s) => { s.style.display = (s.dataset.cat === e.target.value || !e.target.value) ? "" : "none"; });
      });
      el.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buyItem(b.dataset.buy)));
      el.querySelectorAll("[data-sell]").forEach((b) => b.addEventListener("click", () => sellItem(b.dataset.sell)));
    } catch (err) {
      el.querySelector("#shop-body").innerHTML = `<div class="muted">Failed to load shop: ${escapeHtml(err.message)}</div>`;
    }
  }

  async function buyItem(itemType) {
    try { const r = await API.shop.buy({ itemType, quantity: 1 }); notice(r.message); refreshHud(); refreshInventory(); }
    catch (err) { notice("", err.message, true); }
  }
  async function sellItem(itemType) {
    try { const r = await API.shop.sellall({ itemType }); notice(r.message); refreshHud(); refreshInventory(); }
    catch (err) { notice("", err.message, true); }
  }
  async function refreshHud() {
    try { const r = await API.economy.bal(); $("#hud-currency").textContent = "$" + r.balance.toLocaleString(); } catch (e) {}
  }

  async function renderAuction() {
    const el = $("#panel-auction");
    el.innerHTML = `<h2>Auction House</h2><p class="sub">Player-to-player sales. List items, browse, and buy from other players.</p>
      <div class="ah-list-form">
        <h3>List an item</h3>
        <div class="field">
          <input id="ah-item" placeholder="Item ID (e.g. block:diamond)" value="${escapeHtml(state.auctionPrefill || "")}">
          <input id="ah-qty" type="number" min="1" placeholder="Qty" style="width:70px">
          <input id="ah-price" type="number" min="1" placeholder="Price $" style="width:110px">
          <button class="btn primary" id="ah-list">List</button>
        </div>
      </div>
      <div class="toolbar">
        <input id="ah-search" placeholder="Search...">
        <select id="ah-category"><option value="">All Categories</option></select>
        <select id="ah-sort">
          <option value="newest">Newest</option>
          <option value="cheapest">Cheapest</option>
          <option value="highest">Highest</option>
        </select>
        <label class="chk"><input type="checkbox" id="ah-mine"> My Listings</label>
        <button class="btn small primary" id="ah-refresh">Refresh</button>
      </div>
      <div id="ah-body">Loading...</div>`;
    $("#ah-list").addEventListener("click", listAuctionItem);
    $("#ah-refresh").addEventListener("click", loadAuction);
    $("#ah-search").addEventListener("input", debounce(loadAuction, 300));
    $("#ah-category").addEventListener("change", loadAuction);
    $("#ah-sort").addEventListener("change", loadAuction);
    $("#ah-mine").addEventListener("change", loadAuction);
    try {
      const cats = await API.auction.categories();
      $("#ah-category").innerHTML = `<option value="">All Categories</option>` + cats.categories.map((c) => `<option value="${c}">${c}</option>`).join("");
    } catch (_) {}
    await loadAuction();
  }

  async function listAuctionItem() {
    const itemType = $("#ah-item").value.trim();
    const quantity = Number($("#ah-qty").value);
    const price = Number($("#ah-price").value);
    try {
      const r = await API.auction.list({ itemType, quantity, price });
      notice(r.message);
      refreshInventory();
      loadAuction();
    } catch (err) { notice("", err.message, true); }
  }

  async function loadAuction() {
    const el = $("#ah-body");
    if (!el) return;
    const search = $("#ah-search") ? $("#ah-search").value : "";
    const category = $("#ah-category") ? $("#ah-category").value : "";
    const sort = $("#ah-sort") ? $("#ah-sort").value : "newest";
    const mine = $("#ah-mine") ? $("#ah-mine").checked : false;
    try {
      const q = new URLSearchParams();
      if (search) q.set("search", search);
      if (category) q.set("category", category);
      q.set("sort", sort);
      if (mine) q.set("mine", "1");
      const data = await API.auction.all(q.toString() ? "?" + q.toString() : "");
      el.innerHTML = data.listings.length
        ? `<div class="list">${data.listings.map((l) => `
            <div class="list-item">
              <div class="grow">
                <strong>${escapeHtml(l.name)}</strong> x${l.quantity}
                <div class="muted">${l.status === "ACTIVE" ? "Seller: " + escapeHtml(l.seller) : escapeHtml(l.status) + (l.buyer ? " · Bought by " + escapeHtml(l.buyer) : "")}</div>
              </div>
              <div class="price">$${l.price.toLocaleString()}</div>
              ${(mine && l.status === "ACTIVE")
                ? `<button class="btn small ghost" data-cancel="${l.id}">Cancel</button>`
                : (!mine && l.status === "ACTIVE" && !l.mine
                  ? `<button class="btn small primary" data-buy="${l.id}">Buy</button>`
                  : "")}
            </div>`).join("")}</div>`
        : `<div class="muted">No listings found.</div>`;
      el.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => buyAuction(b.dataset.buy)));
      el.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", () => cancelAuction(b.dataset.cancel)));
    } catch (err) { el.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`; }
  }

  async function buyAuction(id) {
    try { const r = await API.auction.buy({ listingId: id }); notice(r.message); refreshHud(); refreshInventory(); loadAuction(); }
    catch (err) { notice("", err.message, true); }
  }
  async function cancelAuction(id) {
    try { const r = await API.auction.cancel({ listingId: id }); notice(r.message); refreshInventory(); loadAuction(); }
    catch (err) { notice("", err.message, true); }
  }

  async function renderTeleport() {
    const el = $("#panel-teleport");
    el.innerHTML = `<h2>Teleportation</h2><p class="sub">Move around Voidoria instantly.</p>
      <div class="field" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn primary" id="tp-spawn">Go to Spawn</button>
        <button class="btn primary" id="tp-rtp">Random Teleport (RTP)</button>
      </div>
      <h3 style="margin-top:14px">TPA</h3>
      <div class="field"><input id="tpa-user" placeholder="Player name"><button class="btn primary" id="tpa-send">TPA</button></div>
      <div class="field"><input id="tpahere-user" placeholder="Player name"><button class="btn primary" id="tpahere-send">TPAHere</button></div>
      <h3 style="margin-top:14px">Stasis Chambers</h3>
      <div id="stasis-list">Loading...</div>`;
    $("#tp-spawn").addEventListener("click", async () => { try { const r = await API.teleport.spawn(); notice(r.message); } catch (e) { notice("", e.message, true); } });
    $("#tp-rtp").addEventListener("click", async () => { try { const r = await API.teleport.rtp(); notice(r.message); } catch (e) { notice("", e.message, true); } });
    $("#tpa-send").addEventListener("click", async () => { try { const r = await API.teleport.tpa({ username: $("#tpa-user").value }); notice(r.message); } catch (e) { notice("", e.message, true); } });
    $("#tpahere-send").addEventListener("click", async () => { try { const r = await API.teleport.tpahere({ username: $("#tpahere-user").value }); notice(r.message); } catch (e) { notice("", e.message, true); } });
    renderStasis();
  }

  async function renderStasis() {
    const box = $("#stasis-list");
    if (!box) return;
    try {
      const data = await API.stasis.all();
      box.innerHTML = `<button class="btn small primary" id="stasis-place">Place Chamber Here</button><div class="list" style="margin-top:10px">` +
        data.chambers.map((c) => `
          <div class="list-item"><div class="grow"><strong>${escapeHtml(c.name)}</strong><div class="muted">${c.dimension}</div></div>
            <div class="muted">${c.active ? "Active" : "Inactive"}</div>
            <button class="btn small ghost" data-tog="${c.id}">${c.active ? "Deactivate" : "Activate"}</button>
            <input class="stasis-target" data-id="${c.id}" placeholder="Pull player" style="width:120px">
            <button class="btn small primary" data-pull="${c.id}">Pull</button>
          </div>`).join("") + `</div>`;
      $("#stasis-place").addEventListener("click", async () => {
        const p = state.engine.position;
        try { const r = await API.stasis.place({ x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimension: state.engine.currentDimension }); notice(r.message); renderStasis(); } catch (e) { notice("", e.message, true); }
      });
      box.querySelectorAll("[data-tog]").forEach((b) => b.addEventListener("click", async () => { try { const r = await API.stasis.toggle({ id: b.dataset.tog }); notice(r.message); renderStasis(); } catch (e) { notice("", e.message, true); } }));
      box.querySelectorAll("[data-pull]").forEach((b) => b.addEventListener("click", async () => {
        const target = box.querySelector(`.stasis-target[data-id="${b.dataset.pull}"]`).value;
        if (!target) return notice("", "Enter a player name to pull");
        // resolve username -> id via a small lookup: reuse friends req error path as id? we need id. Use chat not feasible. Use a known global map or attempt by name via API.
        pullByName(b.dataset.pull, target);
      }));
    } catch (err) { box.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`; }
  }

  async function pullByName(chamberId, targetName) {
    try {
      const r = await API.stasis.pull({ id: chamberId, targetName });
      if (r && r.pulled) {
        notice("", r.message || "Player pulled");
        renderStasis();
      }
    } catch (e) {
      notice("", e.message, true);
      renderStasis();
    }
  }

  async function renderBounties() {
    const el = $("#panel-bounties");
    el.innerHTML = `<h2>Bounties</h2><p class="sub">Place a reward on another player's head.</p>
      <div class="field"><input id="bounty-target" placeholder="Target player"><input id="bounty-amount" type="number" placeholder="Amount $"><button class="btn primary" id="bounty-place">Place Bounty</button></div>
      <div id="bounty-list">Loading...</div>`;
    $("#bounty-place").addEventListener("click", async () => {
      try { const r = await API.player.placeBounty({ target: $("#bounty-target").value, amount: Number($("#bounty-amount").value) }); notice(r.message); loadBounties(); refreshHud(); } catch (e) { notice("", e.message, true); }
    });
    await loadBounties();
  }
  async function loadBounties() {
    const box = $("#bounty-list");
    if (!box) return;
    try {
      const data = await API.player.bounties();
      box.innerHTML = data.bounties.length
        ? `<div class="list">${data.bounties.map((b) => `<div class="list-item"><div class="grow"><strong>${escapeHtml(b.target)}</strong><div class="muted">by ${escapeHtml(b.creator)}</div></div><div class="price">$${b.amount.toLocaleString()}</div></div>`).join("")}</div>`
        : `<div class="muted">No active bounties.</div>`;
    } catch (err) { box.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`; }
  }

  async function renderHomes() {
    const el = $("#panel-homes");
    el.innerHTML = `<h2>Homes</h2><p class="sub">Set teleport homes anywhere in the world.</p>
      <div class="field"><input id="home-name" placeholder="home name"><button class="btn primary" id="home-set">Set Home</button></div>
      <div id="home-list">Loading...</div>`;
    $("#home-set").addEventListener("click", async () => {
      const p = state.engine.position;
      try { const r = await API.player.sethome({ name: $("#home-name").value || "home", x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), dimension: state.engine.currentDimension }); notice(r.message); loadHomes(); } catch (e) { notice("", e.message, true); }
    });
    await loadHomes();
  }
  async function loadHomes() {
    const box = $("#home-list");
    if (!box) return;
    try {
      const data = await API.player.homes();
      box.innerHTML = data.homes.length
        ? `<div class="list">${data.homes.map((h) => `<div class="list-item"><div class="grow"><strong>${escapeHtml(h.name)}</strong><div class="muted">${Math.floor(h.x)}, ${Math.floor(h.y)}, ${Math.floor(h.z)} · ${h.dimension}</div></div>
          <button class="btn small primary" data-tp="${escapeHtml(h.name)}">TP</button>
          <button class="btn small ghost" data-del="${escapeHtml(h.name)}">Del</button></div>`).join("")}</div>`
        : `<div class="muted">No homes set. Use /sethome or "Set Home" above.</div>`;
      box.querySelectorAll("[data-tp]").forEach((b) => b.addEventListener("click", async () => { try { const r = await API.teleport.home({ name: b.dataset.tp }); notice(r.message); } catch (e) { notice("", e.message, true); } }));
      box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => { try { await API.player.delhome({ name: b.dataset.del }); loadHomes(); } catch (e) {} }));
    } catch (err) { box.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`; }
  }

  async function renderFriends() {
    const el = $("#panel-friends");
    el.innerHTML = `<h2>Friends</h2><p class="sub">Connect with other survivors.</p>
      <div class="field"><input id="friend-name" placeholder="Username"><button class="btn primary" id="friend-add">Add Friend</button></div>
      <div id="friend-list">Loading...</div>`;
    $("#friend-add").addEventListener("click", async () => {
      try { const r = await API.player.friendRequest({ username: $("#friend-name").value }); notice(r.message); loadFriends(); } catch (e) { notice("", e.message, true); }
    });
    await loadFriends();
  }
  async function loadFriends() {
    const box = $("#friend-list");
    if (!box) return;
    try {
      const data = await API.player.friends();
      box.innerHTML = `<h4>Friends</h4>` + (data.friends.length ? `<div class="list">${data.friends.map((f) => `<div class="list-item"><strong>${escapeHtml(f.username)}</strong></div>`).join("")}</div>` : `<div class="muted">No friends yet.</div>`)
        + `<h4 style="margin-top:12px">Incoming requests</h4>` + (data.incoming.length ? `<div class="list">${data.incoming.map((f) => `<div class="list-item"><div class="grow">${escapeHtml(f.username)}</div><button class="btn small primary" data-accept="${f.id}">Accept</button></div>`).join("")}</div>` : `<div class="muted">None</div>`)
        + `<h4 style="margin-top:12px">Outgoing</h4>` + (data.outgoing.length ? `<div class="muted">${data.outgoing.map(escapeHtml).join(", ")}</div>` : `<div class="muted">None</div>`);
      box.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => { try { await API.player.friendRespond({ id: b.dataset.accept, accept: true }); loadFriends(); } catch (e) {} }));
    } catch (err) { box.innerHTML = `<div class="muted">${escapeHtml(err.message)}</div>`; }
  }

  async function renderSettings() {
    const el = $("#panel-settings");
    el.innerHTML = `<h2>Settings</h2><p class="sub">Your preferences, persisted to the server.</p><div id="settings-body">Loading...</div>`;
    const data = await API.player.settings();
    const rows = [
      ["allowTpa", "Allow TPA requests", state.settings?.allowTpa ?? true],
      ["allowTpaHere", "Allow TPAHere requests", state.settings?.allowTpaHere ?? true],
      ["autoAcceptTpa", "Auto-accept TPA", state.settings?.autoAcceptTpa ?? false],
      ["autoAcceptTpaHere", "Auto-accept TPAHere", state.settings?.autoAcceptTpaHere ?? false],
      ["chatVisible", "Show chat", state.settings?.chatVisible ?? true],
      ["chatNotifications", "Chat notifications", state.settings?.chatNotifications ?? true],
      ["allowPvp", "Allow PvP", state.settings?.allowPvp ?? true],
      ["showScoreboard", "Show scoreboard", state.settings?.showScoreboard ?? true],
      ["notifications", "Notifications", state.settings?.notifications ?? true],
    ];
    el.querySelector("#settings-body").innerHTML = rows.map(([k, label, val]) => `
      <div class="setting-row"><span class="lbl">${label}</span>
        <label class="switch"><input type="checkbox" data-k="${k}" ${val ? "checked" : ""}><span class="slider"></span></label>
      </div>`).join("");
    el.querySelectorAll("[data-k]").forEach((c) => c.addEventListener("change", async (e) => {
      try {
        await API.player.updateSettings({ [e.target.dataset.k]: e.target.checked });
        if (e.target.dataset.k === "allowPvp" || e.target.dataset.k === "allowTpa" || e.target.dataset.k === "allowTpaHere") {
          state.settings = await API.player.settings();
        }
        notice("Setting saved");
      } catch (err) { notice("", err.message, true); }
    }));
  }

  async function renderStats() {
    const el = $("#panel-stats");
    const r = await API.player.stats();
    const lb = await API.player.leaderboard();
    el.innerHTML = `<h2>Stats</h2><p class="sub">Your progress and the server leaderboard.</p>
      ${statLine("Level", r.level)}${statLine("Experience", `${r.xp} / ${r.nextXp}`)}
      ${statLine("Health", `${Math.floor(r.health)} / 20`)}${statLine("Hunger", `${Math.floor(r.hunger)} / 20`)}
      ${statLine("Kills", r.kills)}${statLine("Deaths", r.deaths)}${statLine("Balance", "$" + r.coins.toLocaleString())}
      <h3 style="margin-top:16px">Wealth Leaderboard</h3>
      ${lb.byCoins.map((t, i) => statLine(`${i + 1}. ${t.name}`, "$" + t.amount.toLocaleString())).join("")}
      <h3 style="margin-top:16px">Level Leaderboard</h3>
      ${lb.byLevel.map((t, i) => statLine(`${i + 1}. ${t.displayName}`, `Lv ${t.level}`)).join("")}`;
  }
  function statLine(k, v) { return `<div class="stat-line"><span class="k">${k}</span><span class="v">${v}</span></div>`; }

  async function renderVoid() {
    const el = $("#panel-void");
    el.innerHTML = `<h2>The Void</h2><p class="sub">A separate dimension of eternal dusk and valuable resources.</p>
      <div class="card"><h4>Void Shards</h4><p class="muted">Mine Void Shard Ore in The Void to obtain Void Shards.</p></div>
      <div class="card"><h4>Void Totems</h4><p class="muted">Craft 8 Void Shards + 1 Diamond into a Void Totem. Keep it in your offhand to survive Void hazards. Normal protection does not work in the Void.</p>
        <div class="btn-row"><button class="btn small primary" id="craft-totem">Craft Void Totem</button></div>
      </div>
      <div class="card"><h4>Travel</h4><p class="muted">Use /void to enter or /overworld to return. A Void Totem is required to survive entry.</p></div>
      <h3 style="margin-top:14px">Crafting Recipes</h3><div id="void-recipes"></div>`;
    $("#craft-totem").addEventListener("click", async () => {
      try { const r = await API.world.craft({ recipe: "void_totem" }); notice(r.message); refreshInventory(); } catch (e) { notice("", e.message, true); }
    });
    const rec = $("#void-recipes");
    const catalog = state.catalog;
    rec.innerHTML = Object.entries(state.catalog ? { void_totem: { name: "Void Totem", result: "item:void_totem", cost: { "item:void_shard": 8, "item:diamond": 1 } } } : {}).map(([id, r]) =>
      `<div class="card"><h4>${r.name}</h4><div class="muted">${Object.entries(r.cost).map(([it, n]) => `${(catalog[it]?.name || it)} x${n}`).join(" + ")} → ${(catalog[r.result]?.name || r.result)}</div></div>`).join("") || `<div class="muted">Recipes available.</div>`;
  }

  // ---------- menu/logout buttons ----------
  $("#btn-menu").addEventListener("click", openMenu);
  $("#btn-close-menu").addEventListener("click", closeMenu);
  $("#btn-logout").addEventListener("click", logout);

  $("#customize-play").addEventListener("click", async () => {
    const msg = $("#customize-msg");
    try {
      const appearance = window.Customize.getState();
      await API.player.appearance({ appearance });
      msg.textContent = "";
      msg.className = "form-msg";
      // ensure a profile exists (should already), then land on the dashboard
      await API.player.me();
      await VOIDORIA.showDashboard(state.user);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "form-msg";
    }
  });

  // ---------- dashboard buttons ----------
  function logout() {
    state.socket && state.socket.disconnect();
    state.engine && state.engine.dispose();
    try { API.auth.logout(); } catch (e) {}
    state.profile = null; state.inventory = []; state.hotbar = [];
    UI.game.style.display = "none";
    UI.menuOverlay.style.display = "none";
    UI.dashboardScreen.style.display = "none";
    showAuth();
  }
  $("#dashboard-play").addEventListener("click", () => VOIDORIA.enterGame(state.user));
  $("#dashboard-customize").addEventListener("click", () => {
    UI.dashboardScreen.style.display = "none";
    window.Customize.show();
  });
  $("#dashboard-logout").addEventListener("click", logout);

  // ---------- helpers ----------
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function getCookie(name) { const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)")); return m ? decodeURIComponent(m[1]) : null; }
  function switchTo(panel) {
    const btn = $$(".mnav").find((b) => b.dataset.panel === panel);
    if (btn) btn.click();
  }

  // void emergency: consume a Void Totem to shield against the Void
  function voidEmergency() {
    state.socket.emit("use", { itemType: "item:void_totem" });
    voidProtectedUntil = Date.now() + 1500; // wait for server confirmation
  }

  boot();
})();
