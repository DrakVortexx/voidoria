const API = {
  async json(url, options = {}) {
    const opts = { ...options, headers: { ...(options.headers || {}) } };
    if (opts.body && typeof opts.body !== "string") {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(url, opts);
    let data = null;
    try { data = await res.json(); } catch (_) { data = {}; }
    if (!res.ok) {
      const err = new Error(data.error || "Request failed");
      err.status = res.status;
      throw err;
    }
    return data;
  },

  auth: {
    register: (body) => API.json("/api/auth/register", { method: "POST", body }),
    login: (body) => API.json("/api/auth/login", { method: "POST", body }),
    logout: () => API.json("/api/auth/logout", { method: "POST" }),
    me: () => API.json("/api/auth/me"),
    changePassword: (body) => API.json("/api/auth/change-password", { method: "POST", body }),
  },

  player: {
    me: () => API.json("/api/player/me"),
    appearance: (body) => API.json("/api/player/appearance", { method: "PUT", body }),
    displayName: (body) => API.json("/api/player/display-name", { method: "PUT", body }),
    stats: () => API.json("/api/player/stats"),
    leaderboard: () => API.json("/api/player/leaderboard"),
    inventory: () => API.json("/api/player/inventory"),
    settings: () => API.json("/api/player/settings"),
    updateSettings: (body) => API.json("/api/player/settings", { method: "PUT", body }),
    homes: () => API.json("/api/player/homes"),
    sethome: (body) => API.json("/api/player/sethome", { method: "POST", body }),
    delhome: (body) => API.json("/api/player/delhome", { method: "POST", body }),
    bounties: () => API.json("/api/player/bounties"),
    placeBounty: (body) => API.json("/api/player/bounties", { method: "POST", body }),
    friends: () => API.json("/api/player/friends"),
    friendRequest: (body) => API.json("/api/player/friends/request", { method: "POST", body }),
    friendRespond: (body) => API.json("/api/player/friends/respond", { method: "POST", body }),
  },

  economy: {
    bal: () => API.json("/api/economy/bal"),
    pay: (body) => API.json("/api/economy/pay", { method: "POST", body }),
    baltop: () => API.json("/api/economy/baltop"),
  },

  shop: {
    all: () => API.json("/api/shop"),
    buy: (body) => API.json("/api/shop/buy", { method: "POST", body }),
    sell: (body) => API.json("/api/shop/sell", { method: "POST", body }),
    sellall: (body) => API.json("/api/shop/sellall", { method: "POST", body }),
  },

  auction: {
    all: (query = "") => API.json(`/api/ah${query}`),
    categories: () => API.json("/api/ah/categories"),
    list: (body) => API.json("/api/ah/list", { method: "POST", body }),
    buy: (body) => API.json("/api/ah/buy", { method: "POST", body }),
    cancel: (body) => API.json("/api/ah/cancel", { method: "POST", body }),
  },

  teleport: {
    spawn: () => API.json("/api/teleport/spawn", { method: "POST" }),
    rtp: () => API.json("/api/teleport/rtp", { method: "POST" }),
    home: (body) => API.json("/api/teleport/home", { method: "POST", body }),
    tpa: (body) => API.json("/api/teleport/tpa", { method: "POST", body }),
    tpahere: (body) => API.json("/api/teleport/tpahere", { method: "POST", body }),
    tpaccept: (body) => API.json("/api/teleport/tpaccept", { method: "POST", body }),
    tpdeny: (body) => API.json("/api/teleport/tpdeny", { method: "POST", body }),
  },

  stasis: {
    all: () => API.json("/api/stasis"),
    place: (body) => API.json("/api/stasis/place", { method: "POST", body }),
    toggle: (body) => API.json("/api/stasis/toggle", { method: "POST", body }),
    pull: (body) => API.json("/api/stasis/pull", { method: "POST", body }),
    remove: (id) => API.json(`/api/stasis/${id}`, { method: "DELETE" }),
  },

  world: {
    catalog: () => API.json("/api/world/catalog"),
    travel: (body) => API.json("/api/world/travel", { method: "POST", body }),
    craft: (body) => API.json("/api/world/craft", { method: "POST", body }),
  },

  meta: () => API.json("/api/meta"),
};
