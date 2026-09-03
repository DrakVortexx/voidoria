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

  profile: {
    me: () => API.json("/api/profile/me"),
    appearance: (body) => API.json("/api/profile/appearance", { method: "POST", body }),
    displayName: (body) => API.json("/api/profile/display-name", { method: "POST", body }),
    inventory: () => API.json("/api/profile/inventory"),
  },

  world: {
    regions: () => API.json("/api/world/regions"),
    nodes: (x, y) => API.json(`/api/world/nodes?x=${x}&y=${y}`),
    move: (body) => API.json("/api/world/move", { method: "POST", body }),
    gather: (body) => API.json("/api/world/gather", { method: "POST", body }),
  },

  economy: {
    balance: () => API.json("/api/economy/balance"),
    transactions: () => API.json("/api/economy/transactions"),
    networth: () => API.json("/api/economy/networth"),
    pay: (body) => API.json("/api/economy/pay", { method: "POST", body }),
  },

  market: {
    items: () => API.json("/api/market/items"),
    overview: () => API.json("/api/market/overview"),
    item: (id) => API.json(`/api/market/item/${id}`),
    sell: (body) => API.json("/api/market/sell", { method: "POST", body }),
    buy: (body) => API.json("/api/market/buy", { method: "POST", body }),
    cancel: (id) => API.json(`/api/market/cancel/${id}`, { method: "POST" }),
    my: () => API.json("/api/market/my"),
  },

  shop: {
    plots: () => API.json("/api/shop/plots"),
    purchase: (body) => API.json("/api/shop/purchase", { method: "POST", body }),
    my: () => API.json("/api/shop/my"),
    customize: (body) => API.json("/api/shop/customize", { method: "POST", body }),
    listing: (body) => API.json("/api/shop/listing", { method: "POST", body }),
    removeListing: (id) => API.json(`/api/shop/listing/${id}`, { method: "DELETE" }),
    buy: (listingId, qty) => API.json(`/api/shop/buy/${listingId}`, { method: "POST", body: { quantity: qty } }),
    all: () => API.json("/api/shop/all"),
  },

  auction: {
    active: () => API.json("/api/auction/active"),
    create: (body) => API.json("/api/auction/create", { method: "POST", body }),
    bid: (id, amount) => API.json(`/api/auction/bid/${id}`, { method: "POST", body: { amount } }),
    buyout: (id) => API.json(`/api/auction/buyout/${id}`, { method: "POST" }),
  },

  business: {
    types: () => API.json("/api/business/types"),
    create: (body) => API.json("/api/business/create", { method: "POST", body }),
    my: () => API.json("/api/business/my"),
  },

  production: {
    recipes: (kind) => API.json(`/api/production/recipes/${kind}`),
    facility: (body) => API.json("/api/production/facility", { method: "POST", body }),
    start: (body) => API.json("/api/production/start", { method: "POST", body }),
    jobs: () => API.json("/api/production/jobs"),
  },

  building: {
    kinds: () => API.json("/api/building/kinds"),
    buyProperty: (body) => API.json("/api/building/buy-property", { method: "POST", body }),
    myProperties: () => API.json("/api/building/my-properties"),
    build: (body) => API.json("/api/building/build", { method: "POST", body }),
  },

  transport: {
    contract: (body) => API.json("/api/transport/contract", { method: "POST", body }),
    deliverContract: (id, region) => API.json(`/api/transport/contract/${id}/deliver`, { method: "POST", body: { region } }),
    contracts: () => API.json("/api/transport/contracts"),
  },

  pvp: {
    rating: () => API.json("/api/pvp/rating"),
    bounty: (body) => API.json("/api/pvp/bounty", { method: "POST", body }),
    bountiesOnMe: () => API.json("/api/pvp/bounties/on-me"),
    claimBounty: (body) => API.json("/api/pvp/bounty/claim", { method: "POST", body }),
  },

  social: {
    friends: () => API.json("/api/social/friends"),
    addFriend: (body) => API.json("/api/social/friends/add", { method: "POST", body }),
    acceptFriend: (body) => API.json("/api/social/friends/accept", { method: "POST", body }),
    find: (name) => API.json(`/api/social/find/${encodeURIComponent(name)}`),
    offers: () => API.json("/api/social/offers"),
    postOffer: (body) => API.json("/api/social/offer", { method: "POST", body }),
    acceptOffer: (id) => API.json(`/api/social/offer/${id}/accept`, { method: "POST" }),
    declineOffer: (id) => API.json(`/api/social/offer/${id}/decline`, { method: "POST" }),
  },

  leaderboards: () => API.json("/api/leaderboards/"),
  crates: {
    my: () => API.json("/api/crates/my"),
    open: (id) => API.json("/api/crates/open", { method: "POST", body: { crateId: id } }),
  },

  meta: () => API.json("/api/meta"),
};
