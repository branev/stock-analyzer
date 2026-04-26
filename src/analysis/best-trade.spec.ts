import * as fs from 'node:fs';
import * as path from 'node:path';
import { BestTrade, bestTrade } from './best-trade';

// Brute-force O(n^2) reference. Test-only oracle. The strict `>` plus the
// natural iteration order (i ascending, j ascending within i) reproduce the
// same earliest-buy / earliest-sell tiebreaker semantics as the optimised
// version under test.
function bruteForce(prices: readonly number[]): BestTrade | null {
  let best: BestTrade | null = null;
  for (let i = 0; i < prices.length; i++) {
    for (let j = i + 1; j < prices.length; j++) {
      const profit = prices[j] - prices[i];
      if (profit > 0 && (best === null || profit > best.profit)) {
        best = { buyIndex: i, sellIndex: j, profit };
      }
    }
  }
  return best;
}

// Seeded RNG (test-only). Fixed seed makes the property test deterministic
// across runs.
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

function generateRandomArrays(count: number, length: number): number[][] {
  const rand = mulberry32(0xbeef);
  const arrays: number[][] = [];
  for (let i = 0; i < count; i++) {
    const arr: number[] = [];
    for (let j = 0; j < length; j++) {
      arr.push(Math.floor(rand() * 51));
    }
    arrays.push(arr);
  }
  return arrays;
}

describe('bestTrade', () => {
  it('returns null for an empty array', () => {
    // Arrange + Act + Assert
    expect(bestTrade([])).toBeNull();
  });

  it('returns null for a single-point array', () => {
    // Arrange + Act + Assert
    expect(bestTrade([42])).toBeNull();
  });

  it('returns the only profitable trade for a two-point ascending array', () => {
    // Arrange + Act
    const result = bestTrade([10, 20]);

    // Assert
    expect(result).toEqual({ buyIndex: 0, sellIndex: 1, profit: 10 });
  });

  it('returns null for a two-point descending array', () => {
    expect(bestTrade([20, 10])).toBeNull();
  });

  it('returns the buy/sell pair around the peak', () => {
    // Arrange + Act
    const result = bestTrade([10, 30, 20]);

    // Assert
    expect(result).toEqual({ buyIndex: 0, sellIndex: 1, profit: 20 });
  });

  it('returns null for a flat array', () => {
    expect(bestTrade([10, 10, 10])).toBeNull();
  });

  it('returns null for a monotonically decreasing array', () => {
    expect(bestTrade([30, 20, 10])).toBeNull();
  });

  it('handles boundary indices (lowest price mid-scan, peak at the end)', () => {
    // Arrange — fixture forces minPriceIndex to update past index 0 and the
    // sell to be the last index. A monotone ascending fixture would not
    // exercise the running-minimum update path.
    const result = bestTrade([10, 5, 8, 3, 12]);

    // Assert
    expect(result).toEqual({ buyIndex: 3, sellIndex: 4, profit: 9 });
  });

  describe('tiebreaker (vs brute-force)', () => {
    it('[5,6,5,6] picks the earliest buy when two pairs share max profit', () => {
      // Arrange
      const input = [5, 6, 5, 6];

      // Act
      const optimised = bestTrade(input);

      // Assert — equality on indices AND profit, against the oracle.
      expect(optimised).toEqual(bruteForce(input));
      expect(optimised).toEqual({ buyIndex: 0, sellIndex: 1, profit: 1 });
    });

    it('[5,5,5,5] returns null when all values are equal (zero profit is not a trade)', () => {
      // Arrange
      const input = [5, 5, 5, 5];

      // Act
      const optimised = bestTrade(input);

      // Assert
      expect(optimised).toEqual(bruteForce(input));
      expect(optimised).toBeNull();
    });

    it('[5,6,6,5] picks the earliest sell among pairs from the same buy', () => {
      // Arrange
      const input = [5, 6, 6, 5];

      // Act
      const optimised = bestTrade(input);

      // Assert
      expect(optimised).toEqual(bruteForce(input));
      expect(optimised).toEqual({ buyIndex: 0, sellIndex: 1, profit: 1 });
    });

    // Distinguishes the two documented interpretations of "earliest and
    // shortest". Optimal pairs at profit 3 are (0,3), (0,4), (2,3), (2,4).
    // Earliest-buy primary picks (0,3); shortest-duration primary would pick
    // (2,3). The other tiebreaker fixtures land on the same answer under
    // both readings, so this is the only test that would catch a regression
    // to the alternative interpretation.
    it('[1,2,1,4,4] earliest-buy primary picks (0,3) over the shorter (2,3)', () => {
      const input = [1, 2, 1, 4, 4];
      const optimised = bestTrade(input);
      expect(optimised).toEqual(bruteForce(input));
      expect(optimised).toEqual({ buyIndex: 0, sellIndex: 3, profit: 3 });
    });
  });

  describe('property: matches brute-force on random inputs', () => {
    // Each test row is wrapped so it.each treats the whole array as a single
    // argument (rather than spreading 20 numeric args into the test fn).
    const cases: Array<[number[]]> = generateRandomArrays(100, 20).map(
      (arr): [number[]] => [arr],
    );

    it.each(cases)('matches brute-force on %j', (arr) => {
      expect(bestTrade(arr)).toEqual(bruteForce(arr));
    });
  });

  describe('complexity', () => {
    it('analyses the full committed dataset (~23,400 ticks) in under 500ms', () => {
      // Arrange — load the committed Phase 2 dataset (relative to repo root,
      // which is Jest's working directory).
      const datasetPath = path.resolve('data/acme.json');
      const raw = fs.readFileSync(datasetPath, 'utf-8');
      const dataset = JSON.parse(raw) as { prices: number[] };
      expect(dataset.prices.length).toBe(23400);

      // Act — single call, wall-clock measured around it.
      const startMs = performance.now();
      const result = bestTrade(dataset.prices);
      const elapsedMs = performance.now() - startMs;

      // Assert — sanity (a 6.5h session has profitable trades), performance
      // (catches O(n^2) regressions on a 23,400-element dataset, which would
      // be multiple seconds; 500ms is generous headroom over an O(n) scan
      // and stops false-failing on slower or contended CI runners), and a
      // spot-check against the Phase 2 variety-verification result so we
      // know the algorithm produces the expected answer on the committed
      // dataset.
      expect(result).not.toBeNull();
      expect(elapsedMs).toBeLessThan(500);
      expect(result?.buyIndex).toBe(13);
      expect(result?.sellIndex).toBe(7762);
      expect(result?.profit).toBeCloseTo(21.54, 2);
    });
  });
});
