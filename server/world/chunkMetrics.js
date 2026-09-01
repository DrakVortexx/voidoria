// Development-only chunk pipeline diagnostics. Silence everything by default;
// set VOIDORIA_DEBUG_CHUNKS=1 to enable a 5-second aggregate log.
const ENABLED = process.env.VOIDORIA_DEBUG_CHUNKS === "1";
const INTERVAL_MS = 5000;

const counter = {
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  inFlightJoins: 0,
  generated: 0,
  dbReads: 0,
  dbWrites: 0,
  socketSends: 0,
};

const gauge = {
  inFlight: 0,
  queued: 0,
  active: 0,
  cacheEntries: 0,
};

let timer = null;

function init() {
  if (!ENABLED || timer) return;
  timer = setInterval(() => {
    const req = counter.requests || 1;
    const hitRate = ((counter.cacheHits / req) * 100).toFixed(1);
    const perSec = (counter.requests / (INTERVAL_MS / 1000)).toFixed(1);
    console.log(
      `[chunk] req/s=${perSec} unique=${counter.requests} hitRate=${hitRate}% ` +
      `hits=${counter.cacheHits} misses=${counter.cacheMisses} joins=${counter.inFlightJoins} ` +
      `gen=${counter.generated} dbR=${counter.dbReads} dbW=${counter.dbWrites} ` +
      `sends=${counter.socketSends} active=${gauge.active} queued=${gauge.queued} ` +
      `inFlight=${gauge.inFlight} cache=${gauge.cacheEntries}`
    );
    for (const k of Object.keys(counter)) counter[k] = 0;
  }, INTERVAL_MS);
  timer.unref?.();
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { init, stop, counter, gauge, enabled: ENABLED };
