import type { BestTrade } from '../analysis/best-trade';

export interface AnalyzePoint {
  time: string;
  price: number;
}

export interface AnalyzeResponse {
  window: { from: string; to: string };
  buy: AnalyzePoint | null;
  sell: AnalyzePoint | null;
  profitPerShare: number | null;
}

export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function mapAnalyzeResponse(
  windowFrom: Date,
  windowTo: Date,
  intervalSeconds: number,
  prices: readonly number[],
  trade: BestTrade | null,
): AnalyzeResponse {
  const window = {
    from: windowFrom.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    to: windowTo.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };

  if (trade === null) {
    return { window, buy: null, sell: null, profitPerShare: null };
  }

  const intervalMs = intervalSeconds * 1000;
  const buyTimeMs = windowFrom.getTime() + trade.buyIndex * intervalMs;
  const sellTimeMs = windowFrom.getTime() + trade.sellIndex * intervalMs;

  return {
    window,
    buy: {
      time: new Date(buyTimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      price: roundCurrency(prices[trade.buyIndex]),
    },
    sell: {
      time: new Date(sellTimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      price: roundCurrency(prices[trade.sellIndex]),
    },
    profitPerShare: roundCurrency(trade.profit),
  };
}
