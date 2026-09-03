/* ============================================================================
 * VOIDORIA — 2D top-down Canvas economy-MMO client
 * Server is authoritative for all economy actions; this client only renders
 * and issues REST calls.
 * ==========================================================================*/
(function () {
  const $ = (id) => document.getElementById(id);
  const ui = { notify: (msg, ok) => null };

  const DECOR = {
    wood: "#5b8c3a", stone: "#8f9297", iron_ore: "#cd7f5b", copper_ore: "#d08b52",
    coal: "#3a3a3a", wheat: "#d9c15c", cotton: "#e8e4d8", sand: "#e0d5a8",
    clay: "#b98a54", water: "#5a9fd6", gold_ore: "#e0b64a", berries: "#8a4a8a",
    lumber: "#8a6138", metal_parts: "#9aa0a8", copper: "#c9805a", glass: "#aee3ea",
    brick: "#b4552e", flour: "#efe6cf", thread: "#d9cdb8", fuel: "#2f2f2f",
    planks: "#a4763f", metal_component: "#b0b6bd", wiring: "#e0a54a",
    fabric: "#c9b8d9", furniture: "#9c6b3a", machinery: "#6b6870",
    electronics: "#5f6a7a", brick_block: "#a04a28", glass_pane: "#bfe6ec",
    bread: "#e0b056", jam: "#c84a4a", stone_pickaxe: "#7a8087",
    iron_pickaxe: "#b9bec7", axe: "#b9a26b", wagon: "#6b4a2a", gem: "#a78bfa",
    blueprint: "#7b5cf6", crate_common: "#a4763f", crate_rare: "#5a9fd6",
    crate_epic: "#a78bfa", crate_legendary: "#f0c24a",
  };

  /* ---------------- SVG icon generator ---------------- */
  function iconSvg(emoji, size) {
    const s = size || 22;
    return `<svg width="${s}" height="${s}" viewBox="0 0 32 32" aria-hidden="true"><text x="16" y="23" font-size="20" text-anchor="middle">${emoji}</text></svg>`;
  }

  /* ================= FLOW CONTROLLER ================= */
  const VOIDORIA = {
    user: null,
    isNew: false,
    player: null,

    show(id) {
      ["auth-screen", "customize-screen", "dashboard-screen", "game"].forEach((x) => {
        $(x).style.display = x === id ? (id === "customize-screen" || id === "dashboard-screen" ? "flex" : "block") : "none";
      });
    },

    goCustomize(user) {
      VOIDORIA.user = user;
      window.Customize.show();
    },

    async showDashboard(user) {
      VOIDORIA.user = user;
      $("dashboard-screen").style.display = "flex";
      $("auth-screen").style.display = "none";
      $("customize-screen").style.display = "none";
      $("game").style.display = "none";
      try {
        const snap = await API.profile.me();
        VOIDORIA.player = snap;
        $("dash-name").textContent = snap.profile?.displayName || user?.username || "Survivor";
        const st = snap.stats || {};
        $("dash-stats").innerHTML = `
          <div class="stat-chip">Balance <b>$${num(snap.balance)}</b></div>
          <div class="stat-chip">Net Worth <b>$${num(snap.netWorth)}</b></div>
          <div class="stat-chip">Level <b>${st.level || 1}</b></div>
          <div class="stat-chip">Region <b>${snap.profile?.region || "Aurora"}</b></div>`;
        $("dashboard-msg").textContent = "";
      } catch (e) {
        $("dashboard-msg").textContent = "Could not load profile: " + e.message;
      }
    },

    async enterGame(user) {
      VOIDORIA.user = user;
      $("game").style.display = "block";
      $("auth-screen").style.display = "none";
      $("customize-screen").style.display = "none";
      $("dashboard-screen").style.display = "none";
      $("connecting").style.display = "flex";
      await Game.start();
      $("connecting").style.display = "none";
    },

    async logout() {
      try { await API.auth.logout(); } catch (_) {}
      location.reload();
    },
  };

  function num(n) {
    n = Number(n || 0);
    return n.toLocaleString("en-US");
  }

  /* ================= 2D GAME ENGINE ================= */
  const Game = {
    canvas: null, ctx: null,
    state: {
      x: 0, y: 0, region: "Aurora", balance: 0, netWorth: 0, level: 1, xp: 0,
      inventory: [], crates: [], regions: [], bounds: { minX: -400, maxX: 400, minY: -400, maxY: 400 },
    },
    keys: {}, camera: { x: 0, y: 0 }, anim: 0,
    entries: {}, // other online players (socket)

    async start() {
      Game.canvas = $("game-canvas");
      Game.ctx = Game.canvas.getContext("2d");
      Game.resize();
      window.addEventListener("resize", Game.resize);

      const [snap, meta] = await Promise.all([API.profile.me(), API.meta()]);
      Game.state.inventory = snap.inventory || [];
      Game.state.crates = snap.crates || [];
      Game.state.balance = snap.balance;
      Game.state.netWorth = snap.netWorth;
      Game.state.level = snap.stats?.level || 1;
      Game.state.xp = snap.stats?.xp || 0;
      Game.state.x = snap.profile?.posX || 0;
      Game.state.y = snap.profile?.posY || 0;
      if (meta.world) Game.state.bounds = meta.world;

      try { const r = await API.world.regions(); Game.state.regions = r.regions || []; Game.state.spawn = r.spawn || { x: 0, y: 0 }; } catch (_) {}

      Game.bindKeys();
      Game.bindChat();
      Game.updateHud();
      Game.loop();
    },

    resize() {
      Game.canvas.width = window.innerWidth;
      Game.canvas.height = window.innerHeight;
    },

    bindKeys() {
      window.addEventListener("keydown", (e) => {
        Game.keys[e.key.toLowerCase()] = true;
        if (e.key === "t" || e.key === "T") {
          const ci = $("chat-input");
          ci.style.display = "block"; ci.focus();
        }
        if (e.key === "Escape") { Game.closeMenu(); $("chat-input").style.display = "none"; }
      });
      window.addEventListener("keyup", (e) => { Game.keys[e.key.toLowerCase()] = false; });
    },

    bindChat() {
      const input = $("chat-input");
      const box = $("chat-messages");
      const promote = () => { box.scrollTop = box.scrollHeight; };
      this.pushChat = (msg) => {
        const d = document.createElement("div");
        d.className = "cm"; d.textContent = msg;
        box.appendChild(d); while (box.children.length > 40) box.removeChild(box.firstChild);
        promote();
      };
      input.addEventListener("keydown", async (e) => {
        if (e.key === "Enter") {
          const text = input.value.trim();
          input.value = "";
          if (text) {
            if (text.startsWith("/")) Game.handleCommand(text);
            else Game.pushChat("You: " + text);
          }
          input.style.display = "none";
        }
        if (e.key === "Escape") input.style.display = "none";
      });
      $("chat-messages").addEventListener("click", () => { $("chat-input").style.display = "block"; $("chat-input").focus(); });
    },

    async handleCommand(text) {
      const [cmd, ...rest] = text.slice(1).split(" ");
      const r = rest.join(" ");
      try {
        switch (cmd) {
          case "help": Game.pushChat("Commands: /bal /networth /market /inventory /gather <nodeId> /find <name> /pay <name> <amt> /bounty <targetId> <amt>"); break;
          case "bal": { const b = await API.economy.balance(); Game.pushChat("Balance: $" + num(b.balance)); break; }
          case "networth": { const nw = await API.economy.networth(); Game.pushChat("Net worth: $" + num(nw.netWorth)); break; }
          case "inventory": Game.openPanel("inventory"); break;
          case "market": Game.openPanel("market"); break;
          case "gather": if (r) { await Game.gatherAt(Number(r)); } break;
          case "find": { const p = await API.social.find(r); Game.pushChat(r + " = " + p.id); break; }
          case "pay": {
            const [to, amt] = r.split(" ");
            await API.economy.pay({ toName: to, amount: Number(amt) });
            Game.notify("Paid $" + amt + " to " + to, true);
            break;
          }
          case "bounty": { const [targetId, amt] = r.split(" "); await API.pvp.bounty({ targetId, amount: Number(amt) }); Game.notify("Bounty placed", true); break; }
          default: Game.pushChat("Unknown command: /" + cmd);
        }
      } catch (err) {
        Game.pushChat("Error: " + err.message);
      }
    },

    notify(msg, ok) {
      const n = document.createElement("div");
      n.className = "toast" + (ok ? " ok" : " err");
      n.textContent = msg;
      $("notifications").appendChild(n);
      setTimeout(() => n.remove(), 4500);
    },

    // ---------- Movement ----------
    applyMove() {
      const speed = 4;
      let dx = 0, dy = 0;
      if (Game.keys["w"] || Game.keys["arrowup"]) dy -= 1;
      if (Game.keys["s"] || Game.keys["arrowdown"]) dy += 1;
      if (Game.keys["a"] || Game.keys["arrowleft"]) dx -= 1;
      if (Game.keys["d"] || Game.keys["arrowright"]) dx += 1;
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        const nx = Game.state.x + (dx / len) * speed;
        const ny = Game.state.y + (dy / len) * speed;
        const b = Game.state.bounds;
        const cx = Math.max(b.minX, Math.min(b.maxX, nx));
        const cy = Math.max(b.minY, Math.min(b.maxY, ny));
        API.world.move({ x: cx, y: cy }).then((r) => {
          Game.state.x = r.x; Game.state.y = r.y; Game.state.region = r.region;
          $("hud-coords").textContent = `${Math.round(r.x)},${Math.round(r.y)}`;
          $("hud-region").textContent = r.region;
        }).catch((e) => Game.notify(e.message));
      }
    },

    // ---------- Canvas render ----------
    loop() {
      Game.applyMove();
      Game.anim += 0.05;
      Game.render();
      requestAnimationFrame(Game.loop);
    },

    regionColor(r) {
      const map = {
        CITY: "#222a44", COMMERCIAL: "#2f2a52", INDUSTRIAL: "#2a2f3a",
        TOWN: "#26304a", FOREST: "#1f3a22", MOUNTAIN: "#3a352c",
        RESOURCE: "#3a3426", AGRI: "#2c3a20", LAKE: "#16304a",
        RIVER: "#1a3a52", WILDERNESS: "#2c2c30",
      };
      return map[r.kind] || "#2c2c30";
    },

    regionName(r) {
      const colors = { FOREST: "#6fd94a", MOUNTAIN: "#d9a25c", AGRI: "#d9c15c", LAKE: "#5a9fd6", RIVER: "#5a9fd6", RESOURCE: "#e0b64a", CITY: "#a78bfa", COMMERCIAL: "#a78bfa", INDUSTRIAL: "#90a0c0", TOWN: "#7bd0c0", WILDERNESS: "#9aa0a8" };
      return colors[r.kind] || "#ccc";
    },

    async render() {
      const ctx = Game.ctx;
      const W = Game.canvas.width, H = Game.canvas.height;
      const cx = Game.state.x, cy = Game.state.y;
      const scale = 40; // world-units -> tile mapping approx (1 unit ~ 1 tile)

      // background
      ctx.fillStyle = "#141824";
      ctx.fillRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = "rgba(255,255,255,0.04)";
      ctx.lineWidth = 1;
      for (let gx = Math.floor(cx - W / 2 / scale); gx <= cx + W / 2 / scale; gx++) {
        const sx = (gx - cx) * scale + W / 2;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke();
      }
      for (let gy = Math.floor(cy - H / 2 / scale); gy <= cy + H / 2 / scale; gy++) {
        const sy = (gy - cy) * scale + H / 2;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(W, sy); ctx.stroke();
      }

      // regions (draw all, subtle)
      for (const r of Game.state.regions) {
        const rx = (r.x - cx) * scale + W / 2;
        const ry = (r.y - cy) * scale + H / 2;
        if (Math.abs(rx) > W + r.radius * scale || Math.abs(ry) > H + r.radius * scale) continue;
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = Game.regionColor(r);
        ctx.beginPath(); ctx.arc(rx, ry, r.radius * scale, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = Game.regionName(r);
        ctx.font = "11px sans-serif";
        ctx.fillText(r.name, rx + 6, ry - 6);
      }

      // spawn marker
      if (Game.state.spawn) {
        const sx = (Game.state.spawn.x - cx) * scale + W / 2;
        const sy = (Game.state.spawn.y - cy) * scale + H / 2;
        ctx.fillStyle = "#7b5cf6";
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fill();
      }

      // resource nodes near player
      try {
        const nodes = await API.world.nodes(cx, cy, 30);
        for (const n of nodes) {
          const nx = (n.x - cx) * scale + W / 2;
          const ny = (n.y - cy) * scale + H / 2;
          if (nx < -20 || ny < -20 || nx > W + 20 || ny > H + 20) continue;
          const col = DECOR[n.itemDef] || "#888";
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(nx, ny + Math.sin(Game.anim + nx) * 3, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,255,255,0.25)";
          ctx.stroke();
          ctx.fillStyle = "#eee";
          ctx.font = "9px sans-serif";
          ctx.fillText(n.icon, nx + 11, ny + 4);
        }
        Game.state.nearbyNodes = (await API.world.nodes(cx, cy)).slice(0, 6);
      } catch (_) {}

      // other players (socket presence, simplified)
      for (const other of Object.values(Game.entries)) {
        const ox = (other.x - cx) * scale + W / 2;
        const oy = (other.y - cy) * scale + H / 2;
        ctx.fillStyle = "#e0a54a";
        ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "9px sans-serif"; ctx.fillText(other.name, ox + 8, oy + 4);
      }

      // player
      const px = W / 2, py = H / 2;
      ctx.fillStyle = "#7b5cf6";
      ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    },

    // ---------- Gathering ----------
    async gatherNear() {
      // gather the nearest node to the player (client side, server validates)
      const nodes = await API.world.nodes(Game.state.x, Game.state.y, 4).catch(() => []);
      if (!nodes.length) { Game.notify("No resources in reach"); return; }
      try {
        const r = await API.world.gather({ nodeId: nodes[0].id });
        Game.notify(`Gathered ${r.amount} x ${r.itemDef} (${r.remaining} left)`, true);
        Game.refreshInventory();
      } catch (e) { Game.notify(e.message); }
    },
    async gatherAt(nodeId) {
      try { const r = await API.world.gather({ nodeId }); Game.notify(`Gathered ${r.amount}`, true); Game.refreshInventory(); }
      catch (e) { Game.notify(e.message); }
    },

    async refreshInventory() {
      try {
        const snap = await API.profile.me();
        Game.state.inventory = snap.inventory;
        Game.state.crates = snap.crates;
        Game.state.balance = snap.balance;
        Game.state.netWorth = snap.netWorth;
        Game.updateHud();
        if ($("panel-inventory").style.display !== "none") Game.renderInventoryPanel();
      } catch (_) {}
    },

    updateHud() {
      $("hud-currency").textContent = "$" + num(Game.state.balance);
      $("hud-networth").textContent = "NW $" + num(Game.state.netWorth);
      $("hud-level").textContent = "Lv " + Game.state.level;
      const xpInLevel = Game.state.xp % 100;
      $("bar-xp").style.width = Math.min(100, xpInLevel) + "%";
    },

    // ---------- Menu ----------
    bindMenu() {
      Game.bindStaticUI();
    },

    bindStaticUI() {
      $("btn-menu").addEventListener("click", () => Game.openMenu());
      $("btn-close-menu").addEventListener("click", () => Game.closeMenu());
      $("btn-logout").addEventListener("click", () => VOIDORIA.logout());
      document.querySelectorAll(".mnav").forEach((b) => {
        b.addEventListener("click", () => {
          document.querySelectorAll(".mnav").forEach((x) => x.classList.toggle("active", x === b));
          Game.openPanel(b.dataset.panel);
        });
      });
      document.getElementById("customize-play").addEventListener("click", async () => {
        const appearance = window.Customize.getState();
        try {
          await API.profile.appearance({ appearance });
          VOIDORIA.enterGame(VOIDORIA.user);
        } catch (e) {
          $("customize-msg").textContent = e.message;
        }
      });
      $("dashboard-play").addEventListener("click", () => VOIDORIA.enterGame(VOIDORIA.user));
      $("dashboard-logout").addEventListener("click", () => VOIDORIA.logout());
      $("dashboard-customize").addEventListener("click", () => { window.Customize.show(); });
    },

    openMenu() { $("menu-overlay").style.display = "flex"; Game.openPanel(document.querySelector(".mnav.active")?.dataset.panel || "profile"); },
    closeMenu() { $("menu-overlay").style.display = "none"; },

    async openPanel(name) {
      const panel = $("panel-" + name);
      document.querySelectorAll(".panel").forEach((p) => (p.style.display = "none"));
      panel.style.display = "block";
      panel.innerHTML = "<div class='loading'>Loading...</div>";
      try {
        switch (name) {
          case "profile": await Game.renderProfilePanel(panel); break;
          case "inventory": await Game.renderInventoryPanel(panel); break;
          case "market": await Game.renderMarketPanel(panel); break;
          case "shop": await Game.renderShopPanel(panel); break;
          case "auction": await Game.renderAuctionPanel(panel); break;
          case "production": await Game.renderProductionPanel(panel); break;
          case "business": await Game.renderBusinessPanel(panel); break;
          case "construction": await Game.renderConstructionPanel(panel); break;
          case "transport": await Game.renderTransportPanel(panel); break;
          case "pvp": await Game.renderPvpPanel(panel); break;
          case "crates": await Game.renderCratesPanel(panel); break;
          case "social": await Game.renderSocialPanel(panel); break;
          case "leaderboards": await Game.renderLeaderboardsPanel(panel); break;
          case "transactions": await Game.renderTransactionsPanel(panel); break;
        }
      } catch (e) {
        panel.innerHTML = `<div class="panel-err">${e.message}</div>`;
      }
    },

    async renderProfilePanel(panel) {
      const nw = await API.economy.networth();
      const snap = Game.state;
      panel.innerHTML = `
        <h3>Profile</h3>
        <div class="kv">Balance <b>$${num(snap.balance)}</b></div>
        <div class="kv">Net Worth <b>$${num(nw.netWorth)}</b></div>
        <div class="kv">Cash <b>$${num(nw.cash)}</b></div>
        <div class="kv">Inventory Value <b>$${num(nw.inventoryWorth)}</b></div>
        <div class="kv">Property Value <b>$${num(nw.propertyWorth)}</b></div>
        <div class="kv">Market Locked <b>$${num(nw.lockedMarketWorth)}</b></div>
        <div class="kv">Level <b>${snap.level}</b> &middot; XP <b>${snap.xp}</b></div>
        <div class="kv">Position <b>${Math.round(snap.x)},${Math.round(snap.y)}</b></div>
        <div class="kv">Region <b>${snap.region}</b></div>
        <h4 style="margin-top:16px">Nearby Resources</h4>
        <div id="nearby-list">${(snap.nearbyNodes || []).map((n) => `<div class="kv small">${n.icon} ${n.name} <button class="btn tiny" data-gather="${n.id}">Gather</button></div>`).join("")}</div>`;
      panel.querySelectorAll("[data-gather]").forEach((b) => b.addEventListener("click", () => Game.gatherAt(b.dataset.gather)));
    },

    async renderInventoryPanel(panel = $("panel-inventory")) {
      const inv = Game.state.inventory || [];
      panel.innerHTML = `<h3>Inventory (${inv.length})</h3><div class="item-grid">${
        inv.map((i) => `<div class="item-card"><div class="ic">${iconSvg(DECOR[i.itemDef] ? "▪" : "▪", 22)}</div><div class="iname">${i.itemDef}</div><div class="inqty">x${i.amount}</div></div>`).join("")
      }</div>`;
    },

    async renderMarketPanel(panel = $("panel-market")) {
      const [items, overview, my] = await Promise.all([API.market.items(), API.market.overview(), API.market.my()]);
      const list = overview || [];
      panel.innerHTML = `<h3>Global Market</h3>
        <div class="table"><table><tr><th>Item</th><th>Base</th><th>Last</th><th>Best Buy</th><th>Best Sell</th><th>24h Vol</th></tr>${
          list.map((m) => `<tr><td>${m.icon} ${m.name}</td><td>$${num(m.baseValue)}</td><td>$${num(m.lastPrice)}</td><td>${m.bestBuy ? "$"+num(m.bestBuy) : "-"}</td><td>${m.bestSell ? "$"+num(m.bestSell) : "-"}</td><td>${m.volume24h}</td></tr>`).join("")
        }</table></div>
        <h4>Place Order</h4>
        <div class="form-row">
          <select id="mkt-item">${Object.keys(items.items||{}).map((id) => `<option value="${id}">${items.items[id].name}</option>`).join("")}</select>
          <input id="mkt-qty" type="number" placeholder="Qty" min="1" />
          <input id="mkt-price" type="number" placeholder="Unit price" min="1" />
          <button class="btn" id="mkt-sell">Sell</button>
          <button class="btn" id="mkt-buy">Buy</button>
        </div>
        <h4>My Orders</h4>
        <div class="table"><table><tr><th>Item</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th><th></th></tr>${
          (my||[]).map((o) => `<tr><td>${o.itemDef}</td><td>${o.side}</td><td>${o.filled}/${o.quantity}</td><td>$${num(o.unitPrice)}</td><td>${o.status}</td><td>${(o.status==="OPEN"||o.status==="PARTIAL")?`<button class="btn tiny" data-cancel="${o.id}">Cancel</button>`:""}</td></tr>`).join("")
        }</table></div>`;
      panel.querySelector("#mkt-sell").addEventListener("click", async () => {
        try {
          const r = await API.market.sell({ itemDef: panel.querySelector("#mkt-item").value, quantity: Number(panel.querySelector("#mkt-qty").value), unitPrice: Number(panel.querySelector("#mkt-price").value) });
          Game.notify(`Sold ${r.sold} for $${num(r.revenue)}` + (r.listed ? `, listed ${r.listed}` : ""), true);
          Game.refreshInventory(); await Game.renderMarketPanel(panel);
        } catch (e) { Game.notify(e.message); }
      });
      panel.querySelector("#mkt-buy").addEventListener("click", async () => {
        try {
          const r = await API.market.buy({ itemDef: panel.querySelector("#mkt-item").value, quantity: Number(panel.querySelector("#mkt-qty").value), unitPrice: Number(panel.querySelector("#mkt-price").value) });
          Game.notify(`Bought ${r.bought} for $${num(r.spent)}` + (r.remaining ? `, listed ${r.remaining}` : ""), true);
          Game.refreshInventory(); await Game.renderMarketPanel(panel);
        } catch (e) { Game.notify(e.message); }
      });
      panel.querySelectorAll("[data-cancel]").forEach((b) => b.addEventListener("click", async () => { try { await API.market.cancel(b.dataset.cancel); Game.notify("Order cancelled", true); Game.renderMarketPanel(panel); } catch (e) { Game.notify(e.message); } }));
    },

    async renderShopPanel(panel = $("panel-shop")) {
      const [my, plots, all] = await Promise.all([API.shop.my(), API.shop.plots(), API.shop.all()]);
      panel.innerHTML = `
        <h3>My Shop</h3>
        ${my && my.shop ? `
          <div class="kv">Plot: <b>${my.shop.plot.name}</b> &middot; ${my.shop.name}</div>
          <div class="kv">Sign: ${my.shop.sign || "—"}</div>
          <h4>Listings</h4>
          <div class="table"><table><tr><th>Item</th><th>Price</th><th>Qty</th><th></th></tr>${
            (my.shop.listings||[]).map((l) => `<tr><td>${l.itemDef}</td><td>$${num(l.price)}</td><td>${l.quantity-l.sold}-${l.quantity}</td><td><button class="btn tiny" data-rm="${l.id}">rm</button></td></tr>`).join("")
          }</table></div>
          <div class="form-row">
            <select id="sp-item">${Object.entries(DECOR).map(([k]) => `<option value="${k}">${k}</option>`).join("")}</select>
            <input id="sp-qty" type="number" placeholder="Qty" min="1" value="1"/>
            <input id="sp-price" type="number" placeholder="Price" min="1"/>
            <button class="btn" id="sp-add">Add Listing</button>
          </div>
          <div class="form-row">
            <input id="sp-name" type="text" placeholder="Shop name" value="${my.shop.name}"/>
            <button class="btn" id="sp-rename">Rename</button>
          </div>` : `
          <p>You have no shop. Purchase a plot to open your storefront.</p>
          <div class="table"><table><tr><th>Plot</th><th>Region</th><th>Cost</th><th></th></tr>${
            (plots||[]).map((p) => `<tr><td>${p.name}</td><td>${p.regionKey}</td><td>$${num(Math.round(Number(p.baseValue)*p.commercialPremium))}</td><td><button class="btn tiny" data-buy="${p.plotKey}">Buy</button></td></tr>`).join("")
          }</table></div>`}
        <h4 style="margin-top:18px">Open Player Shops</h4>
        <div class="table"><table><tr><th>Shop</th><th>Item</th><th>Price</th><th>Qty</th><th></th></tr>${
          (all||[]).flatMap((s) => (s.listings||[]).map((l) => `<tr><td>${s.name}</td><td>${l.name||l.itemDef}</td><td>$${num(l.price)}</td><td>${l.quantity}</td><td><button class="btn tiny" data-buyshop="${l.id}">Buy</button></td></tr>`)).join("")
        }</table></div>`;
      panel.querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", async () => { try { await API.shop.purchase({ plotKey: b.dataset.buy }); Game.notify("Plot purchased!", true); Game.renderShopPanel(panel); } catch (e) { Game.notify(e.message); } }));
      const add = panel.querySelector("#sp-add");
      if (add) add.addEventListener("click", async () => { try { await API.shop.listing({ itemDef: panel.querySelector("#sp-item").value, quantity: Number(panel.querySelector("#sp-qty").value), price: Number(panel.querySelector("#sp-price").value) }); Game.notify("Listed!", true); Game.refreshInventory(); Game.renderShopPanel(panel); } catch (e) { Game.notify(e.message); } });
      const ren = panel.querySelector("#sp-rename");
      if (ren) ren.addEventListener("click", async () => { try { await API.shop.customize({ name: panel.querySelector("#sp-name").value }); Game.notify("Renamed", true); } catch (e) { Game.notify(e.message); } });
      panel.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", async () => { try { await API.shop.removeListing(b.dataset.rm); Game.notify("Removed", true); Game.renderShopPanel(panel); } catch (e) { Game.notify(e.message); } }));
      panel.querySelectorAll("[data-buyshop]").forEach((b) => b.addEventListener("click", async () => { try { await API.shop.buy(b.dataset.buyshop, 1); Game.notify("Purchased", true); Game.refreshInventory(); } catch (e) { Game.notify(e.message); } }));
    },

    async renderAuctionPanel(panel = $("panel-auction")) {
      const active = await API.auction.active();
      panel.innerHTML = `
        <h3>Auction House</h3>
        <div class="table"><table><tr><th>Item</th><th>Qty</th><th>Current</th><th>Start</th><th>Buyout</th><th>Seller</th><th>Expires</th><th></th></tr>${
          (active||[]).map((a) => `<tr><td>${a.icon} ${a.name}</td><td>${a.quantity}</td><td>$${num(a.currentBid)}</td><td>$${num(a.startPrice)}</td><td>${a.buyoutPrice?"$"+num(a.buyoutPrice):"-"}</td><td>${a.seller}</td><td>${new Date(a.expiresAt).toLocaleString()}</td>
            <td>
              <input class="mini" id="bid-${a.id}" type="number" placeholder="bid" />
              <button class="btn tiny" data-bid="${a.id}" data-min="${a.currentBid}">Bid</button>
              ${a.buyoutPrice?`<button class="btn tiny" data-buyout="${a.id}">Buyout</button>`:""}
            </td></tr>`).join("")
        }</table></div>
        <h4>List Item</h4>
        <div class="form-row">
          <select id="aul-item">${Object.entries(DECOR).map(([k]) => `<option value="${k}">${k}</option>`).join("")}</select>
          <input id="aul-qty" type="number" placeholder="Qty" min="1" value="1"/>
          <input id="aul-start" type="number" placeholder="Start" min="1"/>
          <input id="aul-buyout" type="number" placeholder="Buyout"/><span>（optional）</span>
          <button class="btn" id="aul-create">List</button>
        </div>`;
      panel.querySelectorAll("[data-bid]").forEach((b) => b.addEventListener("click", async () => {
        const inp = panel.querySelector("#bid-" + b.dataset.bid);
        try { await API.auction.bid(b.dataset.bid, Number(inp.value)); Game.notify("Bid placed", true); Game.renderAuctionPanel(panel); } catch (e) { Game.notify(e.message); }
      }));
      panel.querySelectorAll("[data-buyout]").forEach((b) => b.addEventListener("click", async () => { try { await API.auction.buyout(b.dataset.buyout); Game.notify("Bought out!", true); Game.refreshInventory(); Game.renderAuctionPanel(panel); } catch (e) { Game.notify(e.message); } }));
      panel.querySelector("#aul-create").addEventListener("click", async () => {
        try {
          await API.auction.create({ itemDef: panel.querySelector("#aul-item").value, quantity: Number(panel.querySelector("#aul-qty").value), startPrice: Number(panel.querySelector("#aul-start").value), buyoutPrice: panel.querySelector("#aul-buyout").value ? Number(panel.querySelector("#aul-buyout").value) : null });
          Game.notify("Listed for auction", true); Game.refreshInventory(); Game.renderAuctionPanel(panel);
        } catch (e) { Game.notify(e.message); }
      });
    },

    async renderProductionPanel(panel = $("panel-production")) {
      const jobs = await API.production.jobs();
      const biz = await API.business.my().catch(() => []);
      const mine = biz.filter((b) => b.role === "OWNER");
      panel.innerHTML = `<h3>Production</h3>
        <p>Run recipes at a facility to convert raw materials into products. Zero-downtime: poll refreshes finished batches.</p>
        <input id="pd-fac-name" placeholder="Facility name" style="width:140px"/>
        <select id="pd-fac-kind"><option value="WORKSHOP">Workshop</option><option value="FACTORY">Factory</option><option value="MILL">Mill</option><option value="FARM">Farm</option><option value="WAREHOUSE">Warehouse</option></select>
        <button class="btn" id="pd-create-fac">Create Facility</button>
        ${jobs.jobs && jobs.jobs.length ? `
          <h4>My Jobs</h4>
          <div class="table"><table><tr><th>Recipe</th><th>Progress</th><th>Status</th></tr>${
            jobs.jobs.map((j) => `<tr><td>${j.recipeKey}</td><td>${j.produced}/${j.target}</td><td>${j.status}</td></tr>`).join("")
          }</table></div>
          ${jobs.completed.length?`<div class="note ok">Completed batches produced goods!</div>`:""}` : `<p>No active jobs.</p>`}`;
      panel.querySelector("#pd-create-fac").addEventListener("click", async () => {
        try { await API.production.facility({ kind: panel.querySelector("#pd-fac-kind").value, name: panel.querySelector("#pd-fac-name").value || "My Facility", x: Game.state.x, y: Game.state.y }); Game.notify("Facility created", true); Game.renderProductionPanel(panel); } catch (e) { Game.notify(e.message); }
      });
    },

    async renderBusinessPanel(panel = $("panel-business")) {
      const [types, my] = await Promise.all([API.business.types(), API.business.my()]);
      panel.innerHTML = `<h3>Businesses</h3>
        <div class="form-row">
          <input id="biz-name" placeholder="Business name"/>
          <select id="biz-type">${(types.types||[]).map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
          <button class="btn" id="biz-create">Found ($${num(2000)})</button>
        </div>
        ${(my||[]).length?`<h4>My Businesses</h4><div class="table"><table><tr><th>Name</th><th>Type</th><th>Role</th><th>Facilities</th></tr>${
          my.map((b) => `<tr><td>${b.name}</td><td>${b.type}</td><td>${b.role}</td><td>${(b.facilities||[]).map((f)=>`${f.kind}(${f.capacity})`).join(", ")}</td></tr>`).join("")
        }</table></div>`:`<p>No businesses yet. Found one to coordinate production among members.</p>`}`;
      panel.querySelector("#biz-create").addEventListener("click", async () => {
        try { await API.business.create({ name: panel.querySelector("#biz-name").value, type: panel.querySelector("#biz-type").value }); Game.notify("Business founded!", true); await Game.renderBusinessPanel(panel); } catch (e) { Game.notify(e.message); }
      });
    },

    async renderConstructionPanel(panel = $("panel-construction")) {
      const [kinds, myProps] = await Promise.all([API.building.kinds(), API.building.myProperties()]);
      panel.innerHTML = `<h3>Construction &amp; Property</h3>
        <p>Buy land in regions, then build on it to raise your net worth and house production.</p>
        <div class="form-row">
          <select id="co-kind">${(kinds.kinds||[]).map((k) => `<option value="${k}">${k}</option>`).join("")}</select>
          <input id="co-region" placeholder="regionKey (e.g. city)" />
          <input id="co-name" placeholder="Name" />
          <button class="btn" id="co-buy">Buy Property</button>
        </div>
        <h4>My Properties</h4>
        <div class="table"><table><tr><th>Name</th><th>Kind</th><th>Region</th><th>Value</th></tr>${
          (myProps||[]).map((p) => `<tr><td>${p.name}</td><td>${p.kind}</td><td>${p.regionKey}</td><td>$${num(p.value)}</td></tr>`).join("")
        }</table></div>`;
      panel.querySelector("#co-buy").addEventListener("click", async () => {
        try { await API.building.buyProperty({ regionKey: panel.querySelector("#co-region").value, kind: panel.querySelector("#co-kind").value, name: panel.querySelector("#co-name").value, x: Game.state.x, y: Game.state.y }); Game.notify("Property bought", true); Game.renderConstructionPanel(panel); } catch (e) { Game.notify(e.message); }
      });
    },

    async renderTransportPanel(panel = $("panel-transport")) {
      const contracts = await API.transport.contracts();
      panel.innerHTML = `<h3>Logistics &amp; Transport</h3>
        <p>Accept delivery of your goods between regions for a reward.</p>
        <div class="form-row">
          <select id="tr-item">${Object.entries(DECOR).map(([k]) => `<option value="${k}">${k}</option>`).join("")}</select>
          <input id="tr-qty" type="number" placeholder="Qty" min="1" value="1"/>
          <input id="tr-from" placeholder="from region"/>
          <input id="tr-to" placeholder="to region"/>
          <button class="btn" id="tr-new">Start Contract</button>
        </div>
        <h4>My Contracts</h4>
        <div class="table"><table><tr><th>Item</th><th>Route</th><th>Qty</th><th>Reward</th><th>Status</th><th></th></tr>${
          (contracts||[]).map((c) => `<tr><td>${c.itemDef}</td><td>${c.fromRegion} → ${c.toRegion}</td><td>${c.quantity}</td><td>$${num(c.reward)}</td><td>${c.status}</td><td>${c.status==="ACCEPTED"?`<button class="btn tiny" data-deliver="${c.id}" data-region="${c.toRegion}">Deliver</button>`:""}</td></tr>`).join("")
        }</table></div>`;
      panel.querySelector("#tr-new").addEventListener("click", async () => {
        try { await API.transport.contract({ itemDef: panel.querySelector("#tr-item").value, quantity: Number(panel.querySelector("#tr-qty").value), fromRegion: panel.querySelector("#tr-from").value, toRegion: panel.querySelector("#tr-to").value }); Game.notify("Contract started", true); Game.renderTransportPanel(panel); } catch (e) { Game.notify(e.message); }
      });
      panel.querySelectorAll("[data-deliver]").forEach((b) => b.addEventListener("click", async () => {
        try { const r = await API.transport.deliverContract(b.dataset.deliver, Game.state.region); Game.notify("Delivered! +$" + num(r.reward), true); Game.refreshInventory(); Game.renderTransportPanel(panel); } catch (e) { Game.notify(e.message); }
      }));
    },

    async renderPvpPanel(panel = $("panel-pvp")) {
      const [rating, bounties] = await Promise.all([API.pvp.rating().catch(()=>({})), API.pvp.bountiesOnMe().catch(()=>[])]);
      panel.innerHTML = `<h3>PvP &amp; Bounties</h3>
        <div class="kv">Rating <b>${rating.pvpRating || 1000}</b> &middot; Kills <b>${rating.kills||0}</b> &middot; Deaths <b>${rating.deaths||0}</b></div>
        <h4>Bounties on you</h4>
        ${(bounties||[]).length?`<div class="table"><table><tr><th>Placed by</th><th>Amount</th></tr>${bounties.map((b)=>`<tr><td>${b.creator?.displayName||"?"}</td><td>$${num(b.amount)}</td></tr>`).join("")}</table></div>`:`<p>No active bounties on you.</p>`}
        <h4>Place a Bounty</h4>
        <div class="form-row">
          <input id="pv-target" placeholder="target playerId"/>
          <input id="pv-amt" type="number" placeholder="min 100"/>
          <button class="btn" id="pv-place">Place Bounty</button>
        </div>`;
      panel.querySelector("#pv-place").addEventListener("click", async () => {
        try { await API.pvp.bounty({ targetId: panel.querySelector("#pv-target").value, amount: Number(panel.querySelector("#pv-amt").value) }); Game.notify("Bounty placed", true); Game.renderPvpPanel(panel); } catch (e) { Game.notify(e.message); }
      });
    },

    async renderCratesPanel(panel = $("panel-crates")) {
      const crates = Game.state.crates || [];
      panel.innerHTML = `<h3>Crates</h3>
        <p>Open crates earned from exploration, milestones, PvP and admin events.</p>
        <div class="table"><table><tr><th>Kind</th><th>Source</th><th></th></tr>${
          (crates||[]).map((c) => `<tr><td>${c.kind}</td><td>${c.source}</td><td><button class="btn tiny" data-open="${c.id}">Open</button></td></tr>`).join("") || `<tr><td colspan="3">No crates.</td></tr>`
        }</table></div>`;
      panel.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", async () => {
        try { const r = await API.crates.open(b.dataset.open); const msg = r.coins?`+$${r.coins}`:`+${r.item.qty} x ${r.item.itemDef}`; Game.notify(`Opened ${r.kind}: ${msg}`, true); Game.refreshInventory(); Game.renderCratesPanel(panel); } catch (e) { Game.notify(e.message); }
      }));
    },

    async renderSocialPanel(panel = $("panel-social")) {
      const [friends, offers] = await Promise.all([API.social.friends(), API.social.offers()]);
      panel.innerHTML = `<h3>Social &amp; Trade</h3>
        <div class="form-row">
          <input id="so-friend" placeholder="username"/>
          <button class="btn" id="so-addfriend">Add Friend</button>
          <input id="so-find" placeholder="display name to find id"/>
          <button class="btn" id="so-findbtn">Find</button>
        </div>
        <h4>Friends</h4>
        <div class="table"><table><tr><th>Name</th><th>Status</th><th></th></tr>${
          (friends||[]).map((f) => `<tr><td>${f.name}</td><td>${f.status}</td><td>${f.status==="PENDING"&&f.direction==="incoming"?`<button class="btn tiny" data-accept="${f.friendId}">Accept</button>`:""}</td></tr>`).join("") || `<tr><td colspan="3">No friends.</td></tr>`
        }</table></div>
        <h4>Incoming Trade Offers</h4>
        <div class="table"><table><tr><th>#</th><th>Status</th><th></th></tr>${
          (offers||[]).map((o) => `<tr><td>${o.id.slice(0,8)}</td><td>${o.status}</td><td>${o.status==="PENDING"?`<button class="btn tiny" data-acc="${o.id}">Accept</button><button class="btn tiny" data-dec="${o.id}">Decline</button>`:""}</td></tr>`).join("")
        }</table></div>`;
      panel.querySelector("#so-addfriend").addEventListener("click", async () => { try { await API.social.addFriend({ username: panel.querySelector("#so-friend").value }); Game.notify("Request sent", true); Game.renderSocialPanel(panel); } catch (e) { Game.notify(e.message); } });
      panel.querySelector("#so-findbtn").addEventListener("click", async () => { try { const p = await API.social.find(panel.querySelector("#so-find").value); Game.notify(`${p.displayName} = ${p.id}`); } catch (e) { Game.notify(e.message); } });
      panel.querySelectorAll("[data-accept]").forEach((b) => b.addEventListener("click", async () => { await API.social.acceptFriend({ userId: b.dataset.accept }); Game.renderSocialPanel(panel); }));
      panel.querySelectorAll("[data-acc]").forEach((b) => b.addEventListener("click", async () => { try { await API.social.acceptOffer(b.dataset.acc); Game.notify("Trade completed", true); Game.renderSocialPanel(panel); } catch (e) { Game.notify(e.message); } }));
      panel.querySelectorAll("[data-dec]").forEach((b) => b.addEventListener("click", async () => { await API.social.declineOffer(b.dataset.dec); Game.renderSocialPanel(panel); }));
    },

    async renderLeaderboardsPanel(panel = $("panel-leaderboards")) {
      const lb = await API.leaderboards();
      const row = (arr, key, money) => (arr||[]).map((e, i) => `<tr><td>${e.rank||i+1}</td><td>${e.name}</td><td>${money?"$"+num(e[key] || e.netWorth):e[key||"value"]}</td></tr>`).join("");
      panel.innerHTML = `<h3>Leaderboards</h3>
        <h4>Richest Players</h4>
        <div class="table"><table><tr><th>#</th><th>Name</th><th>Net Worth</th></tr>${row(lb.richest, "netWorth", true)}</table></div>
        <h4>Top Produces</h4>
        <div class="table"><table><tr><th>#</th><th>Name</th><th>Produced</th></tr>${row(lb.producers, "value")}</table></div>
        <h4>Top Traders (sold)</h4>
        <div class="table"><table><tr><th>#</th><th>Name</th><th>Sold</th></tr>${row(lb.traders, "value")}</table></div>
        <h4>Highest Level</h4>
        <div class="table"><table><tr><th>#</th><th>Name</th><th>Level</th></tr>${row(lb.grinders, "value")}</table></div>`;
    },

    async renderTransactionsPanel(panel = $("panel-transactions")) {
      const tx = await API.economy.transactions();
      panel.innerHTML = `<h3>Transactions</h3>
        <div class="table"><table><tr><th>Type</th><th>Amount</th><th>Ref</th><th>Time</th></tr>${
          (tx||[]).map((t) => `<tr><td>${t.type}</td><td>${t.senderId===VOIDORIA.player?.profile?.id?"-":"+"}$${num(t.amount)}</td><td>${t.reference||"•"}</td><td>${new Date(t.createdAt).toLocaleString()}</td></tr>`).join("")
        }</table></div>`;
    },
  };

  window.VOIDORIA = VOIDORIA;

  // Wire top-level flow controls at load (auth -> customize -> dashboard -> game).
  Game.bindStaticUI();

  // Boot: redirect to dashboard/game if already logged in.
  (async function boot() {
    try {
      const me = await API.auth.me();
      if (me.user) {
        window.VOIDORIA.user = me.user;
        VOIDORIA.showDashboard(me.user);
      }
    } catch (_) {
      window.Auth.show();
    }
  })();
})();
