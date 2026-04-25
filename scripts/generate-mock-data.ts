import * as fs from 'node:fs';
import * as path from 'node:path';

const SEED = 0xace;
const INTERVAL_SECONDS = 1;
const START_TIME = '2026-04-22T09:30:00Z';
const TICKS_PER_PHASE = {
  trendingAM: 5400, // 09:30 - 11:00
  choppyMid: 5400, // 11:00 - 12:30
  lunchLull: 5400, // 12:30 - 14:00
  sellOff: 7200, // 14:00 - 16:00
} as const;
const STARTING_PRICE = 108.0;
const OUTPUT_PATH = path.resolve('data', 'acme.json');

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

function roundCent(x: number): number {
  return Math.round(x * 100) / 100;
}

function generatePrices(): number[] {
  const rand = mulberry32(SEED);
  const noise = (amplitude: number): number => (rand() * 2 - 1) * amplitude;
  const prices: number[] = [];
  let price = STARTING_PRICE;
  prices.push(roundCent(price));

  // Phase 1 — trending AM. Steady upward drift with low noise.
  for (let i = 1; i < TICKS_PER_PHASE.trendingAM; i++) {
    price += 0.0022 + noise(0.05);
    prices.push(roundCent(price));
  }

  // Phase 2 — choppy mid. Mean-reverting around the AM close, higher noise.
  const choppyAnchor = price;
  for (let i = 0; i < TICKS_PER_PHASE.choppyMid; i++) {
    price += 0.002 * (choppyAnchor - price) + noise(0.35);
    prices.push(roundCent(price));
  }

  // Phase 3 — lunch lull. Tight range, very low noise.
  for (let i = 0; i < TICKS_PER_PHASE.lunchLull; i++) {
    price += noise(0.02);
    prices.push(roundCent(price));
  }

  // Phase 4 — sell-off into close. Steady downward drift with moderate noise.
  for (let i = 0; i < TICKS_PER_PHASE.sellOff; i++) {
    price += -0.0017 + noise(0.1);
    prices.push(roundCent(price));
  }

  return prices;
}

function main(): void {
  const prices = generatePrices();
  const data = {
    symbol: 'ACME',
    name: 'Acme Corporation',
    currency: 'USD',
    startTime: START_TIME,
    intervalSeconds: INTERVAL_SECONDS,
    prices,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data) + '\n');

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  process.stdout.write(
    `Wrote ${prices.length.toString()} ticks to ${OUTPUT_PATH}\n` +
      `  range: $${min.toFixed(2)} - $${max.toFixed(2)}\n` +
      `  start: $${prices[0]?.toFixed(2) ?? 'n/a'}, end: $${prices[prices.length - 1]?.toFixed(2) ?? 'n/a'}\n`,
  );
}

main();
