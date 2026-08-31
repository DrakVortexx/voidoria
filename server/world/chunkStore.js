const zlib = require("zlib");
const prisma = require("../db");

const BASE64_BLOCKS = Buffer.alloc(0);

function compressBlocks(u8) {
  return zlib.gzipSync(Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength)).toString("base64");
}
function decompressBlocks(b64, length) {
  const buf = zlib.gunzipSync(Buffer.from(b64, "base64"));
  return new Uint8Array(buf.buffer, buf.byteOffset, length);
}
function compressIntMap(map) {
  // map: Array of [index, blockId]
  const entries = Buffer.alloc(map.length * 4);
  for (let i = 0; i < map.length; i++) {
    entries.writeInt16BE(map[i][0], i * 4);
    entries.writeInt16BE(map[i][1], i * 4 + 2);
  }
  return zlib.gzipSync(entries).toString("base64");
}
function decompressIntMap(b64) {
  if (!b64) return [];
  const buf = zlib.gunzipSync(Buffer.from(b64, "base64"));
  const out = [];
  const count = buf.length / 4;
  for (let i = 0; i < count; i++) {
    out.push([buf.readInt16BE(i * 4), buf.readInt16BE(i * 4 + 2)]);
  }
  return out;
}

async function loadChunk(dimension, cx, cz, { blocks, worldVersion } = {}) {
  const row = await prisma.worldChunk.findUnique({
    where: { dimension_cx_cz: { dimension, cx, cz } },
  });

  if (!row || !row.generated) {
    // generate fresh
    const base = compressBlocks(blocks);
    return { terrain: base, modifications: [], generated: false };
  }

  let terrain = row.terrain;
  if (row.worldVersion !== worldVersion) {
    terrain = compressBlocks(blocks); // regenerate with new version
  }
  return {
    terrain,
    terrainData: decompressBlocks(terrain, blocks ? blocks.length : 0),
    modifications: decompressIntMap(row.modifications),
    row,
    generated: true,
  };
}

async function createChunk(dimension, cx, cz, blocks, worldVersion) {
  const terrain = compressBlocks(blocks);
  return prisma.worldChunk.upsert({
    where: { dimension_cx_cz: { dimension, cx, cz } },
    update: { terrain, generated: true, worldVersion, updatedAt: new Date() },
    create: { dimension, cx, cz, terrain, generated: true, worldVersion },
  });
}

async function saveModifications(dimension, cx, cz, mods, worldVersion) {
  const blob = compressIntMap(mods);
  await prisma.worldChunk.upsert({
    where: { dimension_cx_cz: { dimension, cx, cz } },
    update: { modifications: blob, worldVersion, updatedAt: new Date() },
    create: { dimension, cx, cz, terrain: BASE64_BLOCKS, generated: false, modifications: blob, worldVersion },
  });
}

module.exports = {
  loadChunk,
  createChunk,
  saveModifications,
  compressBlocks,
  decompressBlocks,
  compressIntMap,
  decompressIntMap,
};
