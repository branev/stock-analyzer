import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilePriceRepository } from './file-price.repository';
import { OutOfBoundsError } from './price.repository';

describe('FilePriceRepository', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'price-repo-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFixture(content: unknown): string {
    const filePath = path.join(tmpDir, 'data.json');
    const body =
      typeof content === 'string' ? content : JSON.stringify(content);
    fs.writeFileSync(filePath, body);
    return filePath;
  }

  function validBody(overrides: Record<string, unknown> = {}): unknown {
    return {
      symbol: 'ACME',
      name: 'Acme Corporation',
      currency: 'USD',
      startTime: '2026-04-22T09:30:00Z',
      intervalSeconds: 1,
      prices: [100, 101, 102],
      ...overrides,
    };
  }

  describe('integrity check on init', () => {
    it('throws when the data file does not exist', () => {
      // Arrange
      const missingPath = path.join(tmpDir, 'missing.json');
      const repo = new FilePriceRepository(missingPath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/missing\.json/);
    });

    it('throws when the file contains unparseable JSON', () => {
      // Arrange
      const filePath = writeFixture('{not valid json');
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/data\.json/);
    });

    it('throws when intervalSeconds is missing', () => {
      // Arrange
      const filePath = writeFixture(validBody({ intervalSeconds: undefined }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/intervalSeconds/);
    });

    it('throws when intervalSeconds is zero', () => {
      // Arrange
      const filePath = writeFixture(validBody({ intervalSeconds: 0 }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/intervalSeconds/);
    });

    it('throws when intervalSeconds is negative', () => {
      // Arrange
      const filePath = writeFixture(validBody({ intervalSeconds: -1 }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/intervalSeconds/);
    });

    it('throws when intervalSeconds is fractional', () => {
      // Arrange
      const filePath = writeFixture(validBody({ intervalSeconds: 0.5 }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/intervalSeconds/);
    });

    it('throws when intervalSeconds is non-numeric', () => {
      // Arrange
      const filePath = writeFixture(validBody({ intervalSeconds: '1' }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/intervalSeconds/);
    });

    it('throws when prices is missing', () => {
      // Arrange
      const filePath = writeFixture(validBody({ prices: undefined }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/prices/);
    });

    it('throws when prices is an empty array', () => {
      // Arrange
      const filePath = writeFixture(validBody({ prices: [] }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/prices/);
    });

    it('throws when prices contains a non-numeric entry', () => {
      // Arrange
      const filePath = writeFixture(validBody({ prices: [100, 'abc', 102] }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/prices/);
    });

    it('throws when prices contains null', () => {
      // Arrange
      const filePath = writeFixture(validBody({ prices: [100, null, 102] }));
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/prices/);
    });

    it('throws when prices contains NaN', () => {
      // Arrange — NaN does not survive JSON.stringify (becomes null), so write
      // the file body directly with the literal "NaN" token.
      const body = `{"symbol":"ACME","name":"Acme Corporation","currency":"USD","startTime":"2026-04-22T09:30:00Z","intervalSeconds":1,"prices":[100,NaN,102]}`;
      const filePath = path.join(tmpDir, 'data.json');
      fs.writeFileSync(filePath, body);
      const repo = new FilePriceRepository(filePath);

      // Act + Assert — JSON.parse will reject the literal NaN, surfacing as
      // an unparseable-JSON error. Either rejection path is acceptable; the
      // contract is "loading must fail with the file path named".
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/data\.json/);
    });

    it('throws when prices contains Infinity', () => {
      // Arrange — same JSON-literal trick as the NaN test.
      const body = `{"symbol":"ACME","name":"Acme Corporation","currency":"USD","startTime":"2026-04-22T09:30:00Z","intervalSeconds":1,"prices":[100,Infinity,102]}`;
      const filePath = path.join(tmpDir, 'data.json');
      fs.writeFileSync(filePath, body);
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).toThrow(/data\.json/);
    });

    it('initialises cleanly when the file is well-formed', () => {
      // Arrange
      const filePath = writeFixture(validBody());
      const repo = new FilePriceRepository(filePath);

      // Act + Assert
      expect(() => {
        repo.onModuleInit();
      }).not.toThrow();
    });
  });

  describe('getPriceSeries', () => {
    function smallRepo(): FilePriceRepository {
      const filePath = writeFixture(
        validBody({
          prices: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109],
        }),
      );
      const repo = new FilePriceRepository(filePath);
      repo.onModuleInit();
      return repo;
    }

    it('returns the full series when from is startTime and to is the last tick time', () => {
      // Arrange
      const repo = smallRepo();

      // Act
      const series = repo.getPriceSeries(
        new Date('2026-04-22T09:30:00Z'),
        new Date('2026-04-22T09:30:09Z'),
      );

      // Assert
      expect(Array.from(series)).toEqual([
        100, 101, 102, 103, 104, 105, 106, 107, 108, 109,
      ]);
    });

    it('returns a single tick when from equals to', () => {
      // Arrange
      const repo = smallRepo();

      // Act
      const series = repo.getPriceSeries(
        new Date('2026-04-22T09:30:03Z'),
        new Date('2026-04-22T09:30:03Z'),
      );

      // Assert
      expect(Array.from(series)).toEqual([103]);
    });

    it('returns an interior slice from index 3 to index 7', () => {
      // Arrange
      const repo = smallRepo();

      // Act
      const series = repo.getPriceSeries(
        new Date('2026-04-22T09:30:03Z'),
        new Date('2026-04-22T09:30:07Z'),
      );

      // Assert
      expect(Array.from(series)).toEqual([103, 104, 105, 106, 107]);
    });

    it('includes both boundary timestamps in the returned slice', () => {
      // Arrange
      const repo = smallRepo();

      // Act
      const series = repo.getPriceSeries(
        new Date('2026-04-22T09:30:02Z'),
        new Date('2026-04-22T09:30:05Z'),
      );

      // Assert — both endpoints' values are present (102 and 105).
      expect(Array.from(series)).toEqual([102, 103, 104, 105]);
    });

    it('throws OutOfBoundsError when from is before startTime', () => {
      // Arrange
      const repo = smallRepo();

      // Act + Assert
      expect(() =>
        repo.getPriceSeries(
          new Date('2026-04-22T09:29:59Z'),
          new Date('2026-04-22T09:30:05Z'),
        ),
      ).toThrow(OutOfBoundsError);
    });

    it('throws OutOfBoundsError when to is after the last tick time', () => {
      // Arrange
      const repo = smallRepo();

      // Act + Assert
      expect(() =>
        repo.getPriceSeries(
          new Date('2026-04-22T09:30:00Z'),
          new Date('2026-04-22T09:30:10Z'),
        ),
      ).toThrow(OutOfBoundsError);
    });

    it('throws OutOfBoundsError when both endpoints are out of bounds', () => {
      // Arrange
      const repo = smallRepo();

      // Act + Assert
      expect(() =>
        repo.getPriceSeries(
          new Date('2026-04-22T09:00:00Z'),
          new Date('2026-04-22T10:00:00Z'),
        ),
      ).toThrow(OutOfBoundsError);
    });

    it('throws OutOfBoundsError when from is misaligned to the tick grid', () => {
      // Arrange — tick grid is whole seconds; 3.5s offset is misaligned.
      const repo = smallRepo();

      // Act + Assert
      expect(() =>
        repo.getPriceSeries(
          new Date('2026-04-22T09:30:03.500Z'),
          new Date('2026-04-22T09:30:05Z'),
        ),
      ).toThrow(OutOfBoundsError);
    });
  });

  describe('getDataset', () => {
    it('returns metadata with from = startTime and to = startTime + (prices.length - 1) * intervalSeconds', () => {
      // Arrange
      const filePath = writeFixture(
        validBody({
          prices: [100, 101, 102, 103, 104, 105, 106, 107, 108, 109],
        }),
      );
      const repo = new FilePriceRepository(filePath);
      repo.onModuleInit();

      // Act
      const dataset = repo.getDataset();

      // Assert
      expect(dataset).toEqual({
        symbol: 'ACME',
        name: 'Acme Corporation',
        currency: 'USD',
        from: new Date('2026-04-22T09:30:00Z'),
        to: new Date('2026-04-22T09:30:09Z'),
        intervalSeconds: 1,
      });
    });
  });
});
