export interface BestTrade {
  buyIndex: number;
  sellIndex: number;
  profit: number;
}

export function bestTrade(prices: readonly number[]): BestTrade | null {
  if (prices.length < 2) return null;

  let minPrice = prices[0];
  let minPriceIndex = 0;
  let best: BestTrade | null = null;

  for (let i = 1; i < prices.length; i++) {
    const price = prices[i];
    const profit = price - minPrice;

    if (profit > 0 && (best === null || profit > best.profit)) {
      best = { buyIndex: minPriceIndex, sellIndex: i, profit };
    }

    if (price < minPrice) {
      minPrice = price;
      minPriceIndex = i;
    }
  }

  return best;
}
