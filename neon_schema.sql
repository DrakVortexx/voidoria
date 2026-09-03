-- ============================================================================
-- VOIDORIA — Neon PostgreSQL schema (mirror of prisma/schema.prisma)
-- Generated via `prisma migrate diff --from-empty`.
-- Applying this file to a NON-empty database will DROP all game tables first.
-- ============================================================================
DROP TABLE IF EXISTS "resource_nodes" CASCADE;
DROP TABLE IF EXISTS "world_regions" CASCADE;
DROP TABLE IF EXISTS "crates" CASCADE;
DROP TABLE IF EXISTS "player_stats" CASCADE;
DROP TABLE IF EXISTS "bounties" CASCADE;
DROP TABLE IF EXISTS "trades" CASCADE;
DROP TABLE IF EXISTS "trade_offers" CASCADE;
DROP TABLE IF EXISTS "delivery_jobs" CASCADE;
DROP TABLE IF EXISTS "transport_contracts" CASCADE;
DROP TABLE IF EXISTS "buildings" CASCADE;
DROP TABLE IF EXISTS "properties" CASCADE;
DROP TABLE IF EXISTS "production_jobs" CASCADE;
DROP TABLE IF EXISTS "production_facilities" CASCADE;
DROP TABLE IF EXISTS "business_members" CASCADE;
DROP TABLE IF EXISTS "businesses" CASCADE;
DROP TABLE IF EXISTS "auction_bids" CASCADE;
DROP TABLE IF EXISTS "auctions" CASCADE;
DROP TABLE IF EXISTS "shop_listings" CASCADE;
DROP TABLE IF EXISTS "shops" CASCADE;
DROP TABLE IF EXISTS "shop_plots" CASCADE;
DROP TABLE IF EXISTS "price_points" CASCADE;
DROP TABLE IF EXISTS "market_orders" CASCADE;
DROP TABLE IF EXISTS "transactions" CASCADE;
DROP TABLE IF EXISTS "inventory_stacks" CASCADE;
DROP TABLE IF EXISTS "friendships" CASCADE;
DROP TABLE IF EXISTS "player_settings" CASCADE;
DROP TABLE IF EXISTS "player_profiles" CASCADE;
DROP TABLE IF EXISTS "sessions" CASCADE;
DROP TABLE IF EXISTS "users" CASCADE;
-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "appearance" JSONB NOT NULL DEFAULT '{}',
    "pos_x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pos_y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "currency" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "player_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_visible" BOOLEAN NOT NULL DEFAULT true,
    "chat_notifications" BOOLEAN NOT NULL DEFAULT true,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "pvp_opt_out" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "player_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "friendships" (
    "id" TEXT NOT NULL,
    "user_a_id" TEXT NOT NULL,
    "user_b_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "friendships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_stacks" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 1,
    "quality" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "durability" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_stacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "sender_id" TEXT,
    "receiver_id" TEXT,
    "amount" BIGINT NOT NULL,
    "type" TEXT NOT NULL,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_orders" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "filled" INTEGER NOT NULL DEFAULT 0,
    "unit_price" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_points" (
    "id" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "volume" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_plots" (
    "id" TEXT NOT NULL,
    "plot_key" TEXT NOT NULL,
    "region_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size_w" INTEGER NOT NULL,
    "size_h" INTEGER NOT NULL,
    "base_value" BIGINT NOT NULL,
    "commercial_premium" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "shop_plots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" TEXT NOT NULL,
    "player_id" TEXT,
    "plot_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled Shop',
    "sign" TEXT NOT NULL DEFAULT '',
    "shopkeeper" TEXT NOT NULL DEFAULT 'default',
    "interior" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_listings" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auctions" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quality" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "start_price" BIGINT NOT NULL,
    "buyout_price" BIGINT,
    "currentBid" BIGINT NOT NULL DEFAULT 0,
    "bidder_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "sold_at" TIMESTAMP(3),

    CONSTRAINT "auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" TEXT NOT NULL,
    "auction_id" TEXT NOT NULL,
    "bidder_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "name" TEXT NOT NULL,
    "business_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_members" (
    "id" TEXT NOT NULL,
    "business_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_facilities" (
    "id" TEXT NOT NULL,
    "business_id" TEXT,
    "owner_id" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_jobs" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "recipe_key" TEXT NOT NULL,
    "produced" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',

    CONSTRAINT "production_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "region_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Property',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "sizeW" INTEGER NOT NULL DEFAULT 2,
    "sizeH" INTEGER NOT NULL DEFAULT 2,
    "value" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "property_id" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Building',
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_contracts" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "from_region" TEXT NOT NULL,
    "to_region" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reward" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACCEPTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transport_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_jobs" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "from_x" DOUBLE PRECISION NOT NULL,
    "from_y" DOUBLE PRECISION NOT NULL,
    "to_x" DOUBLE PRECISION NOT NULL,
    "to_y" DOUBLE PRECISION NOT NULL,
    "reward" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_offers" (
    "id" TEXT NOT NULL,
    "from_id" TEXT NOT NULL,
    "to_id" TEXT NOT NULL,
    "offer" JSONB NOT NULL DEFAULT '{}',
    "request" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "player_a_id" TEXT NOT NULL,
    "player_b_id" TEXT NOT NULL,
    "offerA" JSONB NOT NULL DEFAULT '{}',
    "offerB" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bounties" (
    "id" TEXT NOT NULL,
    "creator_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "claimed_by" TEXT,

    CONSTRAINT "bounties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_stats" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "pvpRating" INTEGER NOT NULL DEFAULT 1000,
    "items_produced" INTEGER NOT NULL DEFAULT 0,
    "items_sold" INTEGER NOT NULL DEFAULT 0,
    "items_bought" INTEGER NOT NULL DEFAULT 0,
    "trades_completed" INTEGER NOT NULL DEFAULT 0,
    "distance_walked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nodes_gathered" INTEGER NOT NULL DEFAULT 0,
    "auctions_won" INTEGER NOT NULL DEFAULT 0,
    "buildings_built" INTEGER NOT NULL DEFAULT 0,
    "crates_opened" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crates" (
    "id" TEXT NOT NULL,
    "player_id" TEXT,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNOPENED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "world_regions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "radius" DOUBLE PRECISION NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "world_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_nodes" (
    "id" TEXT NOT NULL,
    "region_key" TEXT NOT NULL,
    "item_def" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 100,
    "max_amount" INTEGER NOT NULL DEFAULT 100,
    "respawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_profiles_user_id_key" ON "player_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_settings_user_id_key" ON "player_settings"("user_id");

-- CreateIndex
CREATE INDEX "friendships_user_a_id_idx" ON "friendships"("user_a_id");

-- CreateIndex
CREATE INDEX "friendships_user_b_id_idx" ON "friendships"("user_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "friendships_user_a_id_user_b_id_key" ON "friendships"("user_a_id", "user_b_id");

-- CreateIndex
CREATE INDEX "inventory_stacks_player_id_idx" ON "inventory_stacks"("player_id");

-- CreateIndex
CREATE INDEX "inventory_stacks_player_id_item_def_idx" ON "inventory_stacks"("player_id", "item_def");

-- CreateIndex
CREATE INDEX "transactions_sender_id_idx" ON "transactions"("sender_id");

-- CreateIndex
CREATE INDEX "transactions_receiver_id_idx" ON "transactions"("receiver_id");

-- CreateIndex
CREATE INDEX "transactions_created_at_idx" ON "transactions"("created_at");

-- CreateIndex
CREATE INDEX "market_orders_item_def_side_status_idx" ON "market_orders"("item_def", "side", "status");

-- CreateIndex
CREATE INDEX "market_orders_player_id_idx" ON "market_orders"("player_id");

-- CreateIndex
CREATE INDEX "price_points_item_def_created_at_idx" ON "price_points"("item_def", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shop_plots_plot_key_key" ON "shop_plots"("plot_key");

-- CreateIndex
CREATE UNIQUE INDEX "shops_player_id_key" ON "shops"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "shops_plot_id_key" ON "shops"("plot_id");

-- CreateIndex
CREATE INDEX "shop_listings_shop_id_idx" ON "shop_listings"("shop_id");

-- CreateIndex
CREATE INDEX "auctions_status_idx" ON "auctions"("status");

-- CreateIndex
CREATE INDEX "auctions_expires_at_idx" ON "auctions"("expires_at");

-- CreateIndex
CREATE INDEX "auctions_seller_id_idx" ON "auctions"("seller_id");

-- CreateIndex
CREATE INDEX "auction_bids_auction_id_idx" ON "auction_bids"("auction_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_members_business_id_player_id_key" ON "business_members"("business_id", "player_id");

-- CreateIndex
CREATE INDEX "production_jobs_player_id_status_idx" ON "production_jobs"("player_id", "status");

-- CreateIndex
CREATE INDEX "buildings_kind_idx" ON "buildings"("kind");

-- CreateIndex
CREATE INDEX "trade_offers_to_id_status_idx" ON "trade_offers"("to_id", "status");

-- CreateIndex
CREATE INDEX "bounties_target_id_idx" ON "bounties"("target_id");

-- CreateIndex
CREATE INDEX "bounties_status_idx" ON "bounties"("status");

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_player_id_key" ON "player_stats"("player_id");

-- CreateIndex
CREATE INDEX "crates_player_id_status_idx" ON "crates"("player_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "world_regions_key_key" ON "world_regions"("key");

-- CreateIndex
CREATE INDEX "world_regions_kind_idx" ON "world_regions"("kind");

-- CreateIndex
CREATE INDEX "resource_nodes_region_key_idx" ON "resource_nodes"("region_key");

-- CreateIndex
CREATE INDEX "resource_nodes_item_def_idx" ON "resource_nodes"("item_def");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_profiles" ADD CONSTRAINT "player_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_settings" ADD CONSTRAINT "player_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_a_id_fkey" FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_user_b_id_fkey" FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_stacks" ADD CONSTRAINT "inventory_stacks_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_orders" ADD CONSTRAINT "market_orders_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "shop_plots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_listings" ADD CONSTRAINT "shop_listings_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auctions" ADD CONSTRAINT "auctions_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auction_id_fkey" FOREIGN KEY ("auction_id") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidder_id_fkey" FOREIGN KEY ("bidder_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_members" ADD CONSTRAINT "business_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_facilities" ADD CONSTRAINT "production_facilities_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_facilities" ADD CONSTRAINT "production_facilities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "production_facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_jobs" ADD CONSTRAINT "production_jobs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_contracts" ADD CONSTRAINT "transport_contracts_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_offers" ADD CONSTRAINT "trade_offers_from_id_fkey" FOREIGN KEY ("from_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trade_offers" ADD CONSTRAINT "trade_offers_to_id_fkey" FOREIGN KEY ("to_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_player_a_id_fkey" FOREIGN KEY ("player_a_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_player_b_id_fkey" FOREIGN KEY ("player_b_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bounties" ADD CONSTRAINT "bounties_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crates" ADD CONSTRAINT "crates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "player_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;


