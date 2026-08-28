var App = {
  user: null,
  player: null,
  jobInterval: null,

  async init() {
    Auth.init();
    var self = this;
    document.addEventListener("click", function(e) {
      if (e.target.classList && e.target.classList.contains("modal-overlay")) {
        e.target.classList.add("hidden");
      }
    });
    await this.loadGame();
  },

  async loadGame() {
    try {
      var me = await API.me();
      this.user = me.user;
      this.player = me.player;
    } catch {
      UI.showAuth();
      return;
    }

    UI.showGame();
    this.updateHeader();
    this.showAdminTab();
    UI.showTab("dashboard");
    this.loadDashboard();
    this.bindTabs();
  },

  updateHeader() {
    document.getElementById("header-username").textContent = this.user.username;
    document.getElementById("header-coins").textContent = this.player.coins.toLocaleString();
    document.getElementById("header-level").textContent = "Lv." + this.player.level;
  },

  handleLevelUp(data) {
    if (data.levelUp) {
      UI.levelUpToast(data.newLevel, data.coinBonus || 0);
    }
  },

  showAdminTab() {
    var adminTab = document.querySelector(".tab-admin");
    if (this.user && this.user.isAdmin) {
      adminTab.classList.remove("hidden");
    } else {
      adminTab.classList.add("hidden");
    }
  },

  bindTabs() {
    if (this._tabsBound) return;
    this._tabsBound = true;

    var self = this;
    document.querySelectorAll(".tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var tab = btn.dataset.tab;
        UI.showTab(tab);
        self.loadTab(tab);
      });
    });

    document.getElementById("logout-btn").addEventListener("click", async function() {
      await API.logout();
      self.user = null;
      self.player = null;
      if (self.jobInterval) { clearInterval(self.jobInterval); self.jobInterval = null; }
      UI.showAuth();
      UI.toast("Logged out", "info");
    });
  },

  async loadTab(tab) {
    switch (tab) {
      case "dashboard": return this.loadDashboard();
      case "shop": return this.loadShop();
      case "auction": return this.loadAuction();
      case "jobs": return this.loadJobs();
      case "inventory": return this.loadInventory();
      case "trades": return this.loadTrades();
      case "leaderboard": return this.loadLeaderboard();
      case "admin": return this.loadAdmin();
    }
  },

  async loadDashboard() {
    var self = this;
    var content = document.getElementById("dashboard-tab");
    var xpNeeded = this.player.level * 100;
    var xpPct = Math.min((this.player.xp / xpNeeded) * 100, 100);

    content.innerHTML =
      '<div class="dash-grid">' +
        '<div class="card">' +
          '<h3>Your Stats</h3>' +
          '<div class="stat-line"><span>Level</span><span>' + this.player.level + '</span></div>' +
          '<div class="stat-line"><span>XP</span><span>' + this.player.xp + ' / ' + xpNeeded + '</span></div>' +
          '<div class="stat-line"><span>Coins</span><span style="color:var(--yellow)">$ ' + this.player.coins.toLocaleString() + '</span></div>' +
          '<div class="stat-line"><span>Daily Streak</span><span>' + (this.player.dailyStreak || 0) + ' days</span></div>' +
          '<div class="xp-track"><div class="xp-fill" style="width:' + xpPct + '%"></div></div>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Daily Reward</h3>' +
          '<p style="color:var(--muted);font-size:.85rem;margin-bottom:14px">Every 20 hours. Streak bonus up to +105 coins.</p>' +
          '<button id="daily-btn" class="btn btn-primary">Claim</button>' +
        '</div>' +
        '<div class="card">' +
          '<h3>Quick Links</h3>' +
          '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' +
            '<button id="goto-shop" class="btn btn-secondary">Shop</button>' +
            '<button id="goto-auction" class="btn btn-secondary">Auction</button>' +
            '<button id="goto-jobs" class="btn btn-secondary">Jobs</button>' +
            '<button id="goto-inv" class="btn btn-secondary">Inventory</button>' +
            '<button id="goto-trade" class="btn btn-secondary">Trades</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById("daily-btn").addEventListener("click", async function() {
      try {
        var res = await API.claimDaily();
        self.player.coins = res.coins;
        self.player.level = res.newLevel || self.player.level;
        self.updateHeader();
        var msg = res.message;
        if (res.streak > 1) msg += " (Streak x" + res.streak + ")";
        UI.toast(msg, "success");
        self.handleLevelUp(res);
        self.loadDashboard();
      } catch (err) {
        UI.toast(err.message, "error");
      }
    });

    document.getElementById("goto-shop").addEventListener("click", function() {
      UI.showTab("shop");
      self.loadShop();
    });

    document.getElementById("goto-auction").addEventListener("click", function() {
      UI.showTab("auction");
      self.loadAuction();
    });

    document.getElementById("goto-jobs").addEventListener("click", function() {
      UI.showTab("jobs");
      self.loadJobs();
    });

    document.getElementById("goto-inv").addEventListener("click", function() {
      UI.showTab("inventory");
      self.loadInventory();
    });

    document.getElementById("goto-trade").addEventListener("click", function() {
      UI.showTab("trades");
      self.loadTrades();
    });
  },

  async loadShop() {
    var self = this;
    var content = document.getElementById("shop-tab");
    content.innerHTML = '<div class="loading">Loading shop...</div>';

    try {
      var res = await API.getShop();
      var listings = res.listings;
      var rarityOrder = { COMMON: 0, RARE: 1, EPIC: 2, LEGENDARY: 3, MYTHIC: 4, SECRET: 5, TRANSCENDENTAL: 6, OMNIVERSAL: 7 };
      listings.sort(function(a, b) { return rarityOrder[a.item.rarity] - rarityOrder[b.item.rarity]; });

      var allRarities = ["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "SECRET", "TRANSCENDENTAL", "OMNIVERSAL"];
      var filterHTML = '<button class="filter-pill on" data-filter="all">All</button>';
      allRarities.forEach(function(r) {
        filterHTML += '<button class="filter-pill" data-filter="' + r + '">' + r.charAt(0) + r.slice(1).toLowerCase() + '</button>';
      });

      content.innerHTML =
        '<div class="filter-row">' + filterHTML + '</div>' +
        '<div class="shop-grid" id="shop-grid"></div>';

      var renderListings = function(filter) {
        var grid = document.getElementById("shop-grid");
        var filtered = filter === "all" ? listings : listings.filter(function(l) { return l.item.rarity === filter; });
        grid.innerHTML = filtered.map(function(l) {
          return '<div class="card shop-card border-' + l.item.rarity.toLowerCase() + '">' +
            '<div class="item-icon">' + UI.renderItemIcon(l.item.type) + '</div>' +
            '<h4>' + l.item.name + '</h4>' +
            '<p class="item-desc">' + l.item.description + '</p>' +
            '<span class="rarity-tag ' + l.item.rarity.toLowerCase() + '">' + l.item.rarity + '</span>' +
            '<div class="shop-price">$ ' + l.price.toLocaleString() + ' each</div>' +
            '<div class="stock">' + (l.stock === -1 ? "Unlimited" : "Stock: " + l.stock) + '</div>' +
            '<div class="buy-row">' +
              '<input type="number" min="1" max="99" value="1" class="sell-input buy-qty" data-lid="' + l.id + '">' +
              '<button class="btn btn-primary btn-sm buy-btn" data-lid="' + l.id + '" data-price="' + l.price + '">Buy</button>' +
            '</div>' +
            '<div class="buy-total" id="total-' + l.id + '">$ ' + l.price.toLocaleString() + '</div>' +
          '</div>';
        }).join("");

        grid.querySelectorAll(".buy-qty").forEach(function(input) {
          input.addEventListener("input", function() {
            var qty = parseInt(input.value) || 1;
            var price = parseInt(input.dataset.price);
            var totalEl = document.getElementById("total-" + input.dataset.lid);
            if (totalEl) totalEl.textContent = "$ " + (qty * price).toLocaleString();
          });
        });

        grid.querySelectorAll(".buy-btn").forEach(function(btn) {
          btn.addEventListener("click", async function() {
            var qty = parseInt(grid.querySelector('.buy-qty[data-lid="' + btn.dataset.lid + '"]').value) || 1;
            try {
              var r = await API.buyItem(btn.dataset.lid, qty);
              self.player.coins = r.coins;
              self.player.level = r.newLevel || self.player.level;
              self.updateHeader();
              UI.toast(r.message, "success");
              self.handleLevelUp(r);
              self.loadShop();
            } catch (err) {
              UI.toast(err.message, "error");
            }
          });
        });
      };

      renderListings("all");

      content.querySelectorAll(".filter-pill").forEach(function(btn) {
        btn.addEventListener("click", function() {
          content.querySelectorAll(".filter-pill").forEach(function(b) { b.classList.remove("on"); });
          btn.classList.add("on");
          renderListings(btn.dataset.filter);
        });
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load shop: ' + err.message + '</div>';
    }
  },

  async loadAuction() {
    var self = this;
    var content = document.getElementById("auction-tab");
    content.innerHTML = '<div class="loading">Loading auction house...</div>';

    try {
      var res = await API.getAuctionListings();
      var listings = res.listings;
      var invRes = await API.getInventory();
      var myInventory = invRes.inventory;

      var allRarities = ["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "SECRET", "TRANSCENDENTAL", "OMNIVERSAL"];
      var filterHTML = '<button class="filter-pill on" data-filter="all">All</button>';
      allRarities.forEach(function(r) {
        filterHTML += '<button class="filter-pill" data-filter="' + r + '">' + r.charAt(0) + r.slice(1).toLowerCase() + '</button>';
      });

      content.innerHTML =
        '<div class="auction-header">' +
          '<div class="filter-row">' + filterHTML + '</div>' +
          '<button id="sell-item-btn" class="btn btn-primary">Sell Item</button>' +
        '</div>' +
        '<div class="shop-grid" id="auction-grid"></div>' +
        '<div class="modal-overlay hidden" id="sell-modal">' +
          '<div class="modal-box">' +
            '<h3>Sell Item on Auction</h3>' +
            '<form id="sell-form">' +
              '<label>Item</label>' +
              '<select id="sell-item-select" required></select>' +
              '<label>Quantity</label>' +
              '<input type="number" id="sell-qty" min="1" value="1" required>' +
              '<label>Price per unit ($)</label>' +
              '<input type="number" id="sell-price" min="1" required>' +
              '<div style="display:flex;gap:8px;margin-top:14px">' +
                '<button type="submit" class="btn btn-primary">List</button>' +
                '<button type="button" class="btn btn-secondary" id="close-sell-modal">Cancel</button>' +
              '</div>' +
            '</form>' +
          '</div>' +
        '</div>';

      var renderAuction = function(filter) {
        var grid = document.getElementById("auction-grid");
        var filtered = filter === "all" ? listings : listings.filter(function(l) { return l.item.rarity === filter; });
        if (filtered.length === 0) {
          grid.innerHTML = '<div class="empty-state">No listings found.</div>';
          return;
        }
        grid.innerHTML = filtered.map(function(l) {
          var isMine = l.sellerId === self.player.id;
          return '<div class="card shop-card border-' + l.item.rarity.toLowerCase() + '">' +
            '<div class="item-icon">' + UI.renderItemIcon(l.item.type) + '</div>' +
            '<h4>' + l.item.name + '</h4>' +
            '<p class="item-desc">' + l.item.description + '</p>' +
            '<span class="rarity-tag ' + l.item.rarity.toLowerCase() + '">' + l.item.rarity + '</span>' +
            '<div class="shop-price">$ ' + l.price.toLocaleString() + ' each</div>' +
            '<div class="stock">Qty: ' + l.quantity + ' &middot; by ' + l.seller.user.username + '</div>' +
            (isMine
              ? '<button class="btn btn-danger btn-sm cancel-auction-btn" data-lid="' + l.id + '">Cancel</button>'
              : '<button class="btn btn-primary btn-sm buy-auction-btn" data-lid="' + l.id + '">Buy</button>'
            ) +
          '</div>';
        }).join("");

        grid.querySelectorAll(".buy-auction-btn").forEach(function(btn) {
          btn.addEventListener("click", async function() {
            try {
              var r = await API.buyAuction(btn.dataset.lid);
              self.player.coins = r.coins;
              self.player.level = r.newLevel || self.player.level;
              self.updateHeader();
              UI.toast(r.message, "success");
              self.handleLevelUp(r);
              self.loadAuction();
            } catch (err) {
              UI.toast(err.message, "error");
            }
          });
        });

        grid.querySelectorAll(".cancel-auction-btn").forEach(function(btn) {
          btn.addEventListener("click", async function() {
            try {
              var r = await API.cancelAuction(btn.dataset.lid);
              UI.toast(r.message, "info");
              self.loadAuction();
            } catch (err) {
              UI.toast(err.message, "error");
            }
          });
        });
      };

      renderAuction("all");

      content.querySelectorAll(".filter-pill").forEach(function(btn) {
        btn.addEventListener("click", function() {
          content.querySelectorAll(".filter-pill").forEach(function(b) { b.classList.remove("on"); });
          btn.classList.add("on");
          renderAuction(btn.dataset.filter);
        });
      });

      document.getElementById("sell-item-btn").addEventListener("click", function() {
        var select = document.getElementById("sell-item-select");
        select.innerHTML = myInventory.length === 0
          ? '<option value="">No items in inventory</option>'
          : myInventory.map(function(inv) {
              return '<option value="' + inv.id + '">' + inv.item.name + ' (x' + inv.quantity + ')</option>';
            }).join("");
        document.getElementById("sell-modal").classList.remove("hidden");
      });

      document.getElementById("close-sell-modal").addEventListener("click", function() {
        document.getElementById("sell-modal").classList.add("hidden");
      });

      document.getElementById("sell-form").addEventListener("submit", async function(e) {
        e.preventDefault();
        var inventoryId = document.getElementById("sell-item-select").value;
        var quantity = parseInt(document.getElementById("sell-qty").value) || 1;
        var price = parseInt(document.getElementById("sell-price").value) || 0;
        if (!inventoryId || price < 1) {
          UI.toast("Fill in all fields", "error");
          return;
        }
        try {
          var r = await API.listAuction({ inventoryId: inventoryId, quantity: quantity, price: price });
          UI.toast(r.message, "success");
          document.getElementById("sell-modal").classList.add("hidden");
          self.loadAuction();
        } catch (err) {
          UI.toast(err.message, "error");
        }
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load auction: ' + err.message + '</div>';
    }
  },

  async loadJobs() {
    var self = this;
    var content = document.getElementById("jobs-tab");
    content.innerHTML = '<div class="loading">Loading jobs...</div>';

    if (this.jobInterval) { clearInterval(this.jobInterval); this.jobInterval = null; }

    try {
      var res = await API.getJobs();
      var jobs = res.jobs;
      var activeJob = res.activeJob;
      var daily = res.daily || { cap: 0, remaining: 0 };
      var maxSession = 8 * 3600;

      var fullHTML = '';

      if (activeJob && res.earnings) {
        var e = res.earnings;
        fullHTML +=
          '<div class="job-status">' +
            '<h3>Working: ' + self.titleCase(e.jobName || activeJob) + '</h3>' +
            '<div class="job-earnings">+$' + e.rate.toLocaleString() + '/sec &middot; +' + e.xpRate.toFixed(1) + ' XP/sec</div>' +
            '<div class="job-timer" id="job-timer">' + self.formatTime(e.elapsed) + '</div>' +
            (e.capped ? '<div class="job-note">Session capped (8h) &middot; collect earnings to make room for more.</div>' : '') +
            '<div class="job-earnings" id="job-earned">Earned: $' + e.coinsEarned.toLocaleString() + ' &middot; ' + e.xpEarned + ' XP</div>' +
            '<div class="job-actions">' +
              '<button id="collect-btn" class="btn btn-primary">Collect Earnings</button>' +
              '<button id="stop-job-btn" class="btn btn-danger">Stop Job</button>' +
            '</div>' +
          '</div>';
      }

      fullHTML +=
        '<div class="job-daily">Daily cap remaining: <strong>$' + daily.remaining.toLocaleString() + '</strong> <span class="job-daily-sub">of $' + daily.cap.toLocaleString() + '/day</span></div>' +
        '<h3 style="margin:16px 0 12px;font-size:.95rem">' + (activeJob ? 'Available Jobs' : 'Choose a Job') + '</h3><div class="job-grid">';

      jobs.forEach(function(j) {
        var isActive = activeJob === j.id;
        var card = '<div class="card job-card">' +
          '<h4>' + j.name + '</h4>' +
          '<p class="job-desc">' + j.description + '</p>' +
          '<div class="job-rt">$' + j.coinsPerSec.toLocaleString() + '/sec &middot; ' + j.xpPerSec.toFixed(1) + ' XP/sec</div>' +
          '<span class="job-req ' + (j.unlocked ? "unlocked" : "") + '">' +
            (j.unlocked ? "Unlocked" : "Requires Lv." + j.levelReq) +
          '</span>';
        if (!activeJob && j.unlocked && daily.remaining > 0) {
          card += '<button class="btn btn-primary btn-sm start-job-btn" data-job="' + j.id + '">Start</button>';
        }
        if (isActive) {
          card += '<span style="color:var(--green);font-size:.82rem;font-weight:600">Active</span>';
        }
        card += '</div>';
        fullHTML += card;
      });
      fullHTML += '</div>';

      content.innerHTML = fullHTML;

      if (activeJob && res.earnings) {
        var rate = res.earnings.rate;
        var xpRate = res.earnings.xpRate;
        var elapsed = Math.min(res.earnings.elapsed, maxSession);
        var capped = res.earnings.capped;

        self.jobInterval = setInterval(function() {
          if (!capped) {
            elapsed++;
            if (elapsed >= maxSession) capped = true;
          }
          var coins = elapsed * rate;
          var xp = Math.floor(elapsed * xpRate);
          var timerEl = document.getElementById("job-timer");
          var earnedEl = document.getElementById("job-earned");
          if (timerEl) timerEl.textContent = self.formatTime(elapsed);
          if (earnedEl) earnedEl.textContent = 'Earned: $' + coins.toLocaleString() + ' &middot; ' + xp + ' XP';
        }, 1000);

        document.getElementById("collect-btn").addEventListener("click", async function() {
          try {
            var r = await API.collectJob();
            self.player.coins = r.coins;
            self.player.level = r.newLevel || self.player.level;
            self.updateHeader();
            UI.toast(r.message, "success");
            if (r.cappedByDaily) UI.toast("Daily job cap reached — come back tomorrow.", "info");
            self.handleLevelUp(r);
            self.loadJobs();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });

        document.getElementById("stop-job-btn").addEventListener("click", async function() {
          try {
            var r = await API.stopJob();
            self.player.coins = r.coins;
            self.player.level = r.newLevel || self.player.level;
            self.updateHeader();
            UI.toast(r.message, "success");
            if (r.cappedByDaily) UI.toast("Daily job cap reached — come back tomorrow.", "info");
            self.handleLevelUp(r);
            self.loadJobs();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      }

      content.querySelectorAll(".start-job-btn").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          try {
            await API.startJob(btn.dataset.job);
            UI.toast("Job started!", "success");
            self.loadJobs();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load jobs: ' + err.message + '</div>';
    }
  },

  titleCase(str) {
    return String(str || "").replace(/_/g, " ").replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  },

  formatTime(seconds) {
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = seconds % 60;
    var parts = [];
    if (h > 0) parts.push(h + "h");
    if (m > 0) parts.push(m + "m");
    parts.push(s + "s");
    return parts.join(" ");
  },

  async loadInventory() {
    var self = this;
    var content = document.getElementById("inventory-tab");
    content.innerHTML = '<div class="loading">Loading inventory...</div>';

    try {
      var invRes = await API.getInventory();
      var statsRes = await API.getInventoryStats();
      var stats = statsRes.stats;

      var rarityStatsHTML = '';
      var rarityList = ["COMMON", "RARE", "EPIC", "LEGENDARY", "MYTHIC", "SECRET", "TRANSCENDENTAL", "OMNIVERSAL"];
      rarityList.forEach(function(r) {
        if (stats.byRarity[r] > 0) {
          rarityStatsHTML += '<div class="inv-pill" style="color:var(--' + r.toLowerCase() + ')">' + stats.byRarity[r] + ' ' + r.charAt(0) + r.slice(1).toLowerCase() + '</div>';
        }
      });

      content.innerHTML =
        '<div class="inv-stats">' +
          '<div class="inv-pill">Total: ' + stats.totalItems + '</div>' +
          '<div class="inv-pill">Unique: ' + stats.uniqueItems + '</div>' +
          '<div class="inv-pill">Value: $ ' + stats.totalValue.toLocaleString() + '</div>' +
          rarityStatsHTML +
        '</div>' +
        '<div class="inv-grid" id="inv-grid"></div>';

      var grid = document.getElementById("inv-grid");
      if (invRes.inventory.length === 0) {
        grid.innerHTML = '<div class="empty-state">Inventory is empty. Visit the shop.</div>';
        return;
      }

      var sellPrice = function(base) { return Math.floor(base * 0.6); };

      grid.innerHTML = invRes.inventory.map(function(inv) {
        return '<div class="card inv-card border-' + inv.item.rarity.toLowerCase() + '">' +
          '<div class="item-icon">' + UI.renderItemIcon(inv.item.type) + '</div>' +
          '<h4 style="font-size:.9rem">' + inv.item.name + '</h4>' +
          '<p class="item-desc">' + inv.item.description + '</p>' +
          '<span class="rarity-tag ' + inv.item.rarity.toLowerCase() + '">' + inv.item.rarity + '</span>' +
          '<div class="inv-qty">x' + inv.quantity + '</div>' +
          '<div class="inv-val">Sell: $ ' + sellPrice(inv.item.basePrice).toLocaleString() + ' each</div>' +
          '<div class="sell-row">' +
            '<input type="number" min="1" max="' + inv.quantity + '" value="1" class="sell-input" data-iid="' + inv.id + '">' +
            '<button class="btn btn-danger btn-sm sell-btn" data-iid="' + inv.id + '">Sell</button>' +
          '</div>' +
        '</div>';
      }).join("");

      grid.querySelectorAll(".sell-btn").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          var iid = btn.dataset.iid;
          var qtyEl = grid.querySelector('.sell-input[data-iid="' + iid + '"]');
          var qty = parseInt(qtyEl.value) || 1;
          try {
            var r = await API.sellItem(iid, qty);
            self.player.coins = r.coins;
            self.player.level = r.newLevel || self.player.level;
            self.updateHeader();
            UI.toast(r.message, "success");
            self.handleLevelUp(r);
            self.loadInventory();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load inventory: ' + err.message + '</div>';
    }
  },

  async loadTrades() {
    var self = this;
    var content = document.getElementById("trades-tab");
    content.innerHTML = '<div class="loading">Loading trades...</div>';

    try {
      var res = await API.getPendingTrades();
      var trades = res.trades;

      content.innerHTML =
        '<div style="margin-bottom:16px"><button id="new-trade-btn" class="btn btn-primary">New Trade</button></div>' +
        '<div class="trade-list" id="trade-list"></div>' +
        '<div class="modal-overlay hidden" id="trade-modal">' +
          '<div class="modal-box">' +
            '<h3>New Trade</h3>' +
            '<form id="create-trade-form">' +
              '<label>Trade with (username)</label>' +
              '<input type="text" id="trade-recv" required>' +
              '<label>Offer coins</label>' +
              '<input type="number" id="trade-ocoins" min="0" value="0">' +
              '<label>Request coins</label>' +
              '<input type="number" id="trade-rcoins" min="0" value="0">' +
              '<button type="submit" class="btn btn-primary">Send</button>' +
              '<button type="button" class="btn btn-secondary" id="close-modal">Cancel</button>' +
            '</form>' +
          '</div>' +
        '</div>';

      var list = document.getElementById("trade-list");
      if (trades.length === 0) {
        list.innerHTML = '<div class="empty-state">No pending trades.</div>';
      } else {
        list.innerHTML = trades.map(function(t) {
          var isSender = t.senderId === self.player.id;
          var otherName = isSender ? t.receiver.user.username : t.sender.user.username;
          var dir = isSender ? "To" : "From";
          var offerItems = t.items.filter(function(i) { return i.direction === "OFFER"; });
          var requestItems = t.items.filter(function(i) { return i.direction === "REQUEST"; });
          var details = "";
          if (t.offerCoins > 0) details += "<p>Offering: $ " + t.offerCoins.toLocaleString() + "</p>";
          offerItems.forEach(function(i) { details += "<p>Offering: " + i.quantity + "x " + i.item.name + "</p>"; });
          if (t.requestCoins > 0) details += "<p>Requesting: $ " + t.requestCoins.toLocaleString() + "</p>";
          requestItems.forEach(function(i) { details += "<p>Requesting: " + i.quantity + "x " + i.item.name + "</p>"; });

          return '<div class="card trade-card">' +
            '<h4>' + dir + ' ' + otherName + '</h4>' + details +
            '<div class="trade-btns">' +
              (!isSender ? '<button class="btn btn-primary btn-sm accept-btn" data-tid="' + t.id + '">Accept</button>' : "") +
              '<button class="btn btn-danger btn-sm dec-btn" data-tid="' + t.id + '">' + (isSender ? "Cancel" : "Decline") + '</button>' +
            '</div>' +
          '</div>';
        }).join("");
      }

      document.getElementById("new-trade-btn").addEventListener("click", function() {
        document.getElementById("trade-modal").classList.remove("hidden");
      });

      document.getElementById("close-modal").addEventListener("click", function() {
        document.getElementById("trade-modal").classList.add("hidden");
      });

      document.getElementById("create-trade-form").addEventListener("submit", async function(e) {
        e.preventDefault();
        try {
          await API.createTrade({
            receiverUsername: document.getElementById("trade-recv").value,
            offerCoins: parseInt(document.getElementById("trade-ocoins").value) || 0,
            requestCoins: parseInt(document.getElementById("trade-rcoins").value) || 0,
          });
          UI.toast("Trade created", "success");
          document.getElementById("trade-modal").classList.add("hidden");
          self.loadTrades();
        } catch (err) {
          UI.toast(err.message, "error");
        }
      });

      list.querySelectorAll(".accept-btn").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          try {
            await API.acceptTrade(btn.dataset.tid);
            UI.toast("Trade accepted", "success");
            var me = await API.me();
            self.player = me.player;
            self.updateHeader();
            self.loadTrades();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      });

      list.querySelectorAll(".dec-btn").forEach(function(btn) {
        btn.addEventListener("click", async function() {
          try {
            var fn = btn.textContent === "Cancel" ? API.cancelTrade : API.declineTrade;
            await fn(btn.dataset.tid);
            UI.toast("Done", "info");
            self.loadTrades();
          } catch (err) {
            UI.toast(err.message, "error");
          }
        });
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load trades: ' + err.message + '</div>';
    }
  },

  async loadLeaderboard() {
    var content = document.getElementById("leaderboard-tab");
    content.innerHTML = '<div class="loading">Loading leaderboard...</div>';

    try {
      var res = await API.getLeaderboard();
      var lb = res.leaderboard;
      var medals = ["1st", "2nd", "3rd"];

      content.innerHTML =
        '<p style="color:var(--muted);font-size:.85rem;margin-bottom:12px">' + (res.totalPlayers || 0) + ' players</p>' +
        '<div class="lb-table">' +
          '<div class="lb-head"><span></span><span>Player</span><span>Level</span><span>XP</span><span>Coins</span></div>' +
          lb.map(function(p) {
            var rankLabel = p.rank <= 3 ? medals[p.rank - 1] : "#" + p.rank;
            var selfClass = p.username === App.user.username ? " lb-self" : "";
            return '<div class="lb-row' + selfClass + '">' +
              '<span class="lb-rank">' + rankLabel + '</span>' +
              '<span class="lb-name">' + p.username + '</span>' +
              '<span class="lb-lv">Lv.' + p.level + '</span>' +
              '<span class="lb-xp">' + p.xp + '</span>' +
              '<span style="color:var(--yellow);font-family:var(--mono)">$ ' + p.coins.toLocaleString() + '</span>' +
            '</div>';
          }).join("") +
        '</div>';
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load leaderboard: ' + err.message + '</div>';
    }
  },

  async loadAdmin() {
    var self = this;
    var content = document.getElementById("admin-tab");

    if (!this.user || !this.user.isAdmin) {
      content.innerHTML = '<div class="error-msg">Admin access denied</div>';
      return;
    }

    content.innerHTML = '<div class="loading">Loading admin panel...</div>';

    try {
      var res = await API.adminPlayers();
      var players = res.players;

      content.innerHTML =
        '<div class="admin-grid">' +
          '<div class="card admin-card">' +
            '<h3>Give Coins</h3>' +
            '<label>Username</label>' +
            '<input type="text" id="admin-coin-user" placeholder="username">' +
            '<label>Amount</label>' +
            '<input type="number" id="admin-coin-amount" min="1" value="1000">' +
            '<button class="btn btn-primary" id="admin-give-coins">Give</button>' +
          '</div>' +
          '<div class="card admin-card">' +
            '<h3>Give Item</h3>' +
            '<label>Username</label>' +
            '<input type="text" id="admin-item-user" placeholder="username">' +
            '<label>Item Name</label>' +
            '<input type="text" id="admin-item-name" placeholder="Item Name">' +
            '<label>Quantity</label>' +
            '<input type="number" id="admin-item-qty" min="1" value="1">' +
            '<button class="btn btn-primary" id="admin-give-item">Give</button>' +
          '</div>' +
          '<div class="card admin-card">' +
            '<h3>Set Level</h3>' +
            '<label>Username</label>' +
            '<input type="text" id="admin-level-user" placeholder="username">' +
            '<label>Level</label>' +
            '<input type="number" id="admin-level-val" min="1" value="1">' +
            '<button class="btn btn-primary" id="admin-set-level">Set</button>' +
          '</div>' +
          '<div class="card admin-card">' +
            '<h3>All Players (' + players.length + ')</h3>' +
            '<div class="admin-players" id="admin-players-list">' +
              players.map(function(p) {
                return '<div class="admin-player-row">' +
                  '<span>' + p.user.username + '</span>' +
                  '<span>Lv.' + p.level + '</span>' +
                  '<span style="color:var(--yellow)">$' + p.coins.toLocaleString() + '</span>' +
                '</div>';
              }).join("") +
            '</div>' +
          '</div>' +
        '</div>';

      document.getElementById("admin-give-coins").addEventListener("click", async function() {
        var username = document.getElementById("admin-coin-user").value.trim();
        var amount = parseInt(document.getElementById("admin-coin-amount").value) || 0;
        if (!username || amount < 1) { UI.toast("Enter username and amount", "error"); return; }
        try {
          var r = await API.adminGiveCoins(username, amount);
          UI.toast(r.message, "success");
          self.loadAdmin();
        } catch (err) {
          UI.toast(err.message, "error");
        }
      });

      document.getElementById("admin-give-item").addEventListener("click", async function() {
        var username = document.getElementById("admin-item-user").value.trim();
        var itemName = document.getElementById("admin-item-name").value.trim();
        var qty = parseInt(document.getElementById("admin-item-qty").value) || 1;
        if (!username || !itemName) { UI.toast("Enter username and item name", "error"); return; }
        try {
          var r = await API.adminGiveItem(username, itemName, qty);
          UI.toast(r.message, "success");
        } catch (err) {
          UI.toast(err.message, "error");
        }
      });

      document.getElementById("admin-set-level").addEventListener("click", async function() {
        var username = document.getElementById("admin-level-user").value.trim();
        var level = parseInt(document.getElementById("admin-level-val").value) || 1;
        if (!username) { UI.toast("Enter username", "error"); return; }
        try {
          var r = await API.adminSetLevel(username, level);
          UI.toast(r.message, "success");
          self.loadAdmin();
        } catch (err) {
          UI.toast(err.message, "error");
        }
      });
    } catch (err) {
      content.innerHTML = '<div class="error-msg">Failed to load admin: ' + err.message + '</div>';
    }
  },
};

document.addEventListener("DOMContentLoaded", function() { App.init(); });
