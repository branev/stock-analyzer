import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  describe('with valid input', () => {
    it('applies defaults when env is empty', () => {
      // Arrange
      const input = {};

      // Act
      const result = validateEnv(input);

      // Assert
      expect(result).toEqual({
        PORT: 3000,
        NODE_ENV: 'development',
        DATA_FILE_PATH: './data/acme.json',
        LOG_LEVEL: 'info',
      });
    });

    it('coerces numeric strings for PORT (process.env values arrive as strings)', () => {
      // Arrange
      const input = { PORT: '8080' };

      // Act
      const result = validateEnv(input);

      // Assert
      expect(result.PORT).toBe(8080);
    });

    it('strips unknown env variables silently', () => {
      // Arrange
      const input = { PORT: '3000', UNRELATED_VAR: 'noise' };

      // Act
      const result = validateEnv(input);

      // Assert
      expect(result).not.toHaveProperty('UNRELATED_VAR');
    });
  });

  describe('with invalid input', () => {
    it('rejects negative PORT', () => {
      // Arrange
      const input = { PORT: '-1' };

      // Act + Assert
      expect(() => validateEnv(input)).toThrow(/Environment validation failed/);
    });

    it('rejects non-integer PORT', () => {
      // Arrange
      const input = { PORT: '3000.5' };

      // Act + Assert
      expect(() => validateEnv(input)).toThrow(/Environment validation failed/);
    });

    it('rejects unknown NODE_ENV', () => {
      // Arrange
      const input = { NODE_ENV: 'staging' };

      // Act + Assert
      expect(() => validateEnv(input)).toThrow(/Environment validation failed/);
    });

    it('rejects empty DATA_FILE_PATH', () => {
      // Arrange
      const input = { DATA_FILE_PATH: '' };

      // Act + Assert
      expect(() => validateEnv(input)).toThrow(/Environment validation failed/);
    });

    it('rejects unknown LOG_LEVEL', () => {
      // Arrange
      const input = { LOG_LEVEL: 'verbose' };

      // Act + Assert
      expect(() => validateEnv(input)).toThrow(/Environment validation failed/);
    });
  });
});
