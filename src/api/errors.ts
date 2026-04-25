export class InvalidRangeError extends Error {
  constructor(message = 'from must be strictly less than to') {
    super(message);
    this.name = 'InvalidRangeError';
  }
}

export class DataUnavailableError extends Error {
  constructor(message = 'Dataset is unavailable') {
    super(message);
    this.name = 'DataUnavailableError';
  }
}
