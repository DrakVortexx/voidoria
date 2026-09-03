# VOIDORIA

**Voidoria** is an open-world multiplayer **economy MMO**. Explore a persistent 2D top-down world, gather raw resources, run production chains, trade on a live global market, and build your empire through shops, auctions, businesses, and property. It is an original game — not affiliated with any existing title.

---

## Tech Stack

- **Backend:** Node.js + Express (REST) + Socket.IO (real-time presence & chat)
- **Database:** PostgreSQL on Neon (via Prisma ORM)
- **Client:** 2D top-down Canvas renderer (no voxel engine)
- **Auth:** bcrypt password hashing + database-backed sessions (httpOnly cookies)
- **Trust model:** the server is authoritative for all money movement, items, trades, and auctions (no client trust, no double-spend).

---

## Features

- Full account system (register / login / change password / logout)
- Character customization (skin, hair, face, outfit, accessories) — new accounts go straight here, then to **PLAY**
- Persistent 2D world with named **regions** (cities, towns, forests, mountains, farmlands, lakes, wilderness), each with deterministic **resource nodes**
- **Gathering** — harvest wood, stone, ore, crops, sand, clay, water and more
- **Production chains** — convert raw resources → processed → components → products at facilities (Mill / Factory / Workshop / Farm / Warehouse)
- **Global market** — buy/sell orders with automatic matching, price history, 24h volume and trends
- **Player shops** — purchase predefined, immutable **shop plots** (customize interior, not boundaries), restock with your inventory, and sell to other players
- **Auction house** — list items, place bids, buyouts, expiration handling, automatic refunds
- **Businesses** — found a company, manage members/roles, and own shared production facilities
- **Property & construction** — buy land in regions and build to increase net worth
- **Logistics / transport** — accept contracts to move goods between regions for rewards
- **PvP & bounties** — place bounties on players, arena rating, kill/death tracking
- **Crates** — earn loot boxes from exploration, milestones and events
- **Social** — friends, trade offers, chat
- **Leaderboards** — Richest Players (net worth = cash + inventory + property + market), top producers, top traders, highest level, PvP rating
- **Opportunity system** — one-time exploration/milestone rewards (coins + XP + crates)

---

## Architecture Overview

```
Browser (2D Canvas)
   │  REST (/api/*) for auth, world, market, shops, auctions, production,
   │              business, construction, transport, pvp, social, leaderboards
   │  Socket.IO for presence, live movement relay, chat
   ▼
Express + Socket.IO (server/index.js)
   ▼
Server-authoritative services (server/services/*)
   │  economy.inventory.market.shop.auction.world.production...
   ▼
Neon PostgreSQL (all persistence via Prisma)
```

**Economy integrity:**
- All balance changes occur inside Prisma database transactions with conditional updates (no double-spend, no negative balances).
- Items are locked/reserved when listed for market sale, shop listing, or auction — refunded on cancel/expiry.
- Auction bid funds are locked up-front and refunded to outbid players atomically.
- Net worth uses conservative market values to avoid inflation exploits.

---

## 1. Prerequisites

- Node.js **18+**
- A free [Neon](https://neon.tech) PostgreSQL database

## 2. Install

```bash
npm install
```

## 3. Configure Neon

1. Create a Neon project and grab your connection string.

   **Option A — Prisma (dev):**
   ```bash
   cp .env.example .env        # then edit .env with your DATABASE_URL
   npx prisma db push          # creates tables
   npm run db:seed             # seeds admin, world regions, resource nodes, shop plots
   ```

   **Option B — Manual SQL (Neon SQL Editor):**
   Paste the contents of `neon_schema.sql` into the Neon SQL Editor on a fresh DB and run it.

   Keep `neon_schema.sql` and `prisma/schema.prisma` in sync if you modify either (regenerate with `prisma migrate diff --from-empty`).

## 4. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `PORT` | | HTTP port (default `3000`) |
| `NODE_ENV` | | `development` or `production` |
| `WORLD_SEED` | | Deterministic world seed (default `20260831`) |
| `ADMIN_USERNAME` | | Admin username (default `admin`) |
| `ADMIN_PASSWORD` | | Admin password (auto-generated & logged if unset) |
| `AUTO_PUSH_SCHEMA` | | `true` to auto-run `prisma db push` on dev startup |

> **Never commit your real `.env`.**

## 5. Run Locally

```bash
npm run dev        # development (auto-restarts, auto-pushes schema in dev)
# or
npm start          # production-style start
```

Then open **http://localhost:3000**

On startup the server seeds the admin user, world regions + resource nodes, and the predefined shop plots.

## 6. How the Client Connects

- The browser loads the SPA from `/`.
- REST calls go to `/api/*` using the same-origin httpOnly `session_token` cookie.
- Socket.IO authenticates with the same cookie for presence/chat. **All economy actions still go through REST** so the server stays authoritative.

## 7. Testing

```bash
npm test           # game-definition integrity tests (no DB required)
```

## 8. Admin

Log in as the admin username. Admin-only routes:

- `GET /api/admin/players`
- `POST /api/admin/give` (`{ name, amount }`)
- `POST /api/admin/item` (`{ name, itemType, amount }`)
- `POST /api/admin/crate` (`{ name, kind }`)

## 9. Production Deployment (Render)

Use `render.yaml` as a blueprint (Build: `npm install && npx prisma generate`, Start: `npm start`). Apply `neon_schema.sql` once before first deploy (or set `AUTO_PUSH_SCHEMA=true` once).

---

## Notes on Fairness & Security

- All money, items, trades, market fills, shop purchases, and auction outcomes are validated **server-side**; the client only sends intent.
- Economy actions use database transactions with conditional updates and reserved funds — no double-spend, no negative balances, no fake purchases.
- Movement is speed-checked server-side to deter teleport/cheat clients.
- Shop plot properties (size, position) are immutable and server-defined.
