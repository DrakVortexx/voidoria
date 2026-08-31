-- ============================================================================
-- VOIDORIA — Neon PostgreSQL schema
-- Safe to paste into the Neon SQL Editor on a fresh database.
-- This schema is idempotent (DROP ... IF EXISTS then CREATE).
-- It contains NO fake data, NO passwords, and NO secrets.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "users" CASCADE;
CREATE TABLE "users" (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login    TIMESTAMPTZ
);

-- ----------------------------------------------------------------------------
-- sessions
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "sessions" CASCADE;
CREATE TABLE "sessions" (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_token_idx ON "sessions"(token);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON "sessions"(user_id);

-- ----------------------------------------------------------------------------
-- player_profiles
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "player_profiles" CASCADE;
CREATE TABLE "player_profiles" (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL UNIQUE REFERENCES "users"(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  appearance   JSONB NOT NULL DEFAULT '{}'::jsonb,
  pos_x        DOUBLE PRECISION NOT NULL DEFAULT 8,
  pos_y        DOUBLE PRECISION NOT NULL DEFAULT 70,
  pos_z        DOUBLE PRECISION NOT NULL DEFAULT 8,
  rotation_y   DOUBLE PRECISION NOT NULL DEFAULT 0,
  dimension    TEXT NOT NULL DEFAULT 'overworld',
  health       DOUBLE PRECISION NOT NULL DEFAULT 20,
  max_health   DOUBLE PRECISION NOT NULL DEFAULT 20,
  hunger       DOUBLE PRECISION NOT NULL DEFAULT 20,
  xp           DOUBLE PRECISION NOT NULL DEFAULT 0,
  level        INTEGER NOT NULL DEFAULT 1,
  kills        INTEGER NOT NULL DEFAULT 0,
  deaths       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  CONSTRAINT player_profiles_health_check CHECK (health >= 0),
  CONSTRAINT player_profiles_level_check CHECK (level >= 1),
  CONSTRAINT player_profiles_dimension_check CHECK (dimension IN ('overworld','void'))
);

-- ----------------------------------------------------------------------------
-- player_items
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "player_items" CASCADE;
CREATE TABLE "player_items" (
  id        TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  durability DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata  JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- inventory_slots
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "inventory_slots" CASCADE;
CREATE TABLE "inventory_slots" (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  slot       INTEGER NOT NULL,
  item_type  TEXT NOT NULL,
  amount     INTEGER NOT NULL DEFAULT 1,
  durability DOUBLE PRECISION NOT NULL DEFAULT 0,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT inventory_slots_amount_check CHECK (amount >= 0),
  CONSTRAINT inventory_slots_slot_check CHECK (slot >= 0 AND slot < 36),
  UNIQUE (player_id, slot)
);
CREATE INDEX IF NOT EXISTS inventory_slots_player_idx ON "inventory_slots"(player_id);

-- ----------------------------------------------------------------------------
-- balances  (money stored as BIGINT to avoid float drift; NOT currency)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "balances" CASCADE;
CREATE TABLE "balances" (
  id        TEXT PRIMARY KEY,
  player_id TEXT NOT NULL UNIQUE REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  amount    BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT balances_amount_check CHECK (amount >= 0)
);

-- ----------------------------------------------------------------------------
-- transactions
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "transactions" CASCADE;
CREATE TABLE "transactions" (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT REFERENCES "player_profiles"(id) ON DELETE SET NULL,
  receiver_id TEXT REFERENCES "player_profiles"(id) ON DELETE SET NULL,
  amount      BIGINT NOT NULL,
  type        TEXT NOT NULL,
  reference   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT transactions_amount_check CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS transactions_sender_idx ON "transactions"(sender_id);
CREATE INDEX IF NOT EXISTS transactions_receiver_idx ON "transactions"(receiver_id);

-- ----------------------------------------------------------------------------
-- auction_listings
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "auction_listings" CASCADE;
CREATE TABLE "auction_listings" (
  id         TEXT PRIMARY KEY,
  seller_id  TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  item_type  TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  price      BIGINT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  sold_at    TIMESTAMPTZ,
  metadata   JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT auction_status_check CHECK (status IN ('ACTIVE','SOLD','CANCELLED','EXPIRED')),
  CONSTRAINT auction_quantity_check CHECK (quantity > 0),
  CONSTRAINT auction_price_check CHECK (price > 0)
);
CREATE INDEX IF NOT EXISTS auction_seller_idx ON "auction_listings"(seller_id);
CREATE INDEX IF NOT EXISTS auction_status_idx ON "auction_listings"(status);
CREATE INDEX IF NOT EXISTS auction_expires_idx ON "auction_listings"(expires_at);

-- ----------------------------------------------------------------------------
-- player_homes
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "player_homes" CASCADE;
CREATE TABLE "player_homes" (
  id         TEXT PRIMARY KEY,
  player_id  TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'home',
  x          DOUBLE PRECISION NOT NULL,
  y          DOUBLE PRECISION NOT NULL,
  z          DOUBLE PRECISION NOT NULL,
  dimension  TEXT NOT NULL DEFAULT 'overworld',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (player_id, name)
);

-- ----------------------------------------------------------------------------
-- bounties
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "bounties" CASCADE;
CREATE TABLE "bounties" (
  id         TEXT PRIMARY KEY,
  creator_id TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  target_id  TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  amount     BIGINT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  claimed_by TEXT,
  CONSTRAINT bounty_status_check CHECK (status IN ('ACTIVE','CLAIMED','CANCELLED','EXPIRED')),
  CONSTRAINT bounty_amount_check CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS bounty_target_idx ON "bounties"(target_id);
CREATE INDEX IF NOT EXISTS bounty_status_idx ON "bounties"(status);

-- ----------------------------------------------------------------------------
-- friendships
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "friendships" CASCADE;
CREATE TABLE "friendships" (
  id         TEXT PRIMARY KEY,
  user_a_id  TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  user_b_id  TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT friendship_status_check CHECK (status IN ('PENDING','ACCEPTED','CANCELLED')),
  UNIQUE (user_a_id, user_b_id)
);
CREATE INDEX IF NOT EXISTS friendship_a_idx ON "friendships"(user_a_id);
CREATE INDEX IF NOT EXISTS friendship_b_idx ON "friendships"(user_b_id);

-- ----------------------------------------------------------------------------
-- player_settings
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "player_settings" CASCADE;
CREATE TABLE "player_settings" (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL UNIQUE REFERENCES "users"(id) ON DELETE CASCADE,
  allow_tpa             BOOLEAN NOT NULL DEFAULT true,
  allow_tpa_here        BOOLEAN NOT NULL DEFAULT true,
  auto_accept_tpa       BOOLEAN NOT NULL DEFAULT false,
  auto_accept_tpa_here  BOOLEAN NOT NULL DEFAULT false,
  chat_visible          BOOLEAN NOT NULL DEFAULT true,
  chat_notifications    BOOLEAN NOT NULL DEFAULT true,
  allow_pvp             BOOLEAN NOT NULL DEFAULT true,
  show_scoreboard       BOOLEAN NOT NULL DEFAULT true,
  notifications         BOOLEAN NOT NULL DEFAULT true
);

-- ----------------------------------------------------------------------------
-- world_chunks  (compressed base terrain + compressed modification list)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "world_chunks" CASCADE;
CREATE TABLE "world_chunks" (
  dimension     TEXT NOT NULL,
  chunk_x       INTEGER NOT NULL,
  chunk_z       INTEGER NOT NULL,
  world_version INTEGER NOT NULL DEFAULT 1,
  generated     BOOLEAN NOT NULL DEFAULT false,
  terrain       TEXT NOT NULL DEFAULT '',
  modifications TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (dimension, chunk_x, chunk_z)
);
CREATE INDEX IF NOT EXISTS world_chunks_dim_idx ON "world_chunks"(dimension, chunk_x, chunk_z);

-- ----------------------------------------------------------------------------
-- shop_categories
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "shop_categories" CASCADE;
CREATE TABLE "shop_categories" (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

-- ----------------------------------------------------------------------------
-- shop_listings
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "shop_listings" CASCADE;
CREATE TABLE "shop_listings" (
  id          TEXT PRIMARY KEY,
  item_type   TEXT NOT NULL,
  buy_price   BIGINT NOT NULL DEFAULT -1,
  sell_price  BIGINT NOT NULL DEFAULT -1,
  available   BOOLEAN NOT NULL DEFAULT true,
  category_id TEXT NOT NULL REFERENCES "shop_categories"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS shop_listings_cat_idx ON "shop_listings"(category_id);

-- ----------------------------------------------------------------------------
-- pending_teleports
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "pending_teleports" CASCADE;
CREATE TABLE "pending_teleports" (
  id          TEXT PRIMARY KEY,
  sender_id   TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES "player_profiles"(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'PENDING',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  CONSTRAINT tp_kind_check CHECK (kind IN ('tpa','tpahere')),
  CONSTRAINT tp_status_check CHECK (status IN ('PENDING','ACCEPTED','DECLINED'))
);
CREATE INDEX IF NOT EXISTS pending_tp_receiver_idx ON "pending_teleports"(receiver_id);
CREATE INDEX IF NOT EXISTS pending_tp_status_idx ON "pending_teleports"(status);

-- ----------------------------------------------------------------------------
-- stasis_chambers
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "stasis_chambers" CASCADE;
CREATE TABLE "stasis_chambers" (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Chamber',
  x           DOUBLE PRECISION NOT NULL,
  y           DOUBLE PRECISION NOT NULL,
  z           DOUBLE PRECISION NOT NULL,
  dimension   TEXT NOT NULL DEFAULT 'overworld',
  active      BOOLEAN NOT NULL DEFAULT true,
  last_pull_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stasis_owner_idx ON "stasis_chambers"(owner_id);

-- ----------------------------------------------------------------------------
-- cooldowns
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS "cooldowns" CASCADE;
CREATE TABLE "cooldowns" (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "users"(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, kind)
);

COMMIT;
