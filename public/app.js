// Stock Price Analyzer — Alpine.js component.
// All values are UTC throughout: the API timestamps are UTC ('Z' suffix), and the
// page labels every time as "UTC" so the user can't mistake the picker's local
// rendering for a different timezone interpretation. See analyse() for the
// minute-UI / second-API conversion.

document.addEventListener('alpine:init', () => {
  Alpine.data('analyzer', () => ({
    header: { title: 'Loading…', coverage: 'Loading coverage period…' },
    form: { from: '', to: '', funds: '', minLocal: '', maxLocal: '' },
    state: {
      loading: false,
      result: null,
      nullResult: false,
      error: null,
      errorCode: null,
    },
    dataset: null,

    async init() {
      try {
        const res = await fetch('/api/dataset');
        if (!res.ok) {
          throw new Error('Failed to load dataset metadata.');
        }
        const data = await res.json();
        this.dataset = data;
        this.header.title = `${data.symbol} — ${data.name}`;
        this.header.coverage = `Available data for the period between ${formatPickerTime(data.from)} UTC and ${formatPickerTime(data.to)} UTC.`;
        this.form.minLocal = isoToPickerValue(data.from);
        this.form.maxLocal = isoToPickerValue(data.to);
      } catch (err) {
        this.state.error = err?.message ?? 'Failed to initialise.';
      }
    },

    get canAnalyse() {
      if (!this.form.from || !this.form.to) return false;
      if (new Date(this.form.from) >= new Date(this.form.to)) return false;
      if (this.state.loading) return false;
      return true;
    },

    // funds is bound via x-model.number, so it's a number when the user
    // has typed something and an empty string when they haven't (parseFloat
    // of '' is NaN under x-model.number, which we exclude via the > 0 check).
    // The HTML5 min="0" attribute prevents most negative input via the
    // browser's spinner; the > 0 check here also excludes any negative that
    // sneaks through (e.g. via paste).
    get hasFunds() {
      const f = this.form.funds;
      return (
        typeof f === 'number' &&
        f > 0 &&
        this.state.result !== null &&
        this.state.result.profitPerShare > 0
      );
    },

    get sharesAffordable() {
      if (!this.hasFunds) return 0;
      return Math.floor(this.form.funds / this.state.result.buy.price);
    },

    get totalProfit() {
      if (!this.hasFunds) return 0;
      return this.sharesAffordable * this.state.result.profitPerShare;
    },

    // True when the error specifically implicates the date fields (range or
    // bounds). The API doesn't tell us which of the two fields is at fault,
    // so the visual cue applies to both — the user knows the pair is wrong.
    get invalidDateError() {
      return (
        this.state.errorCode === 'INVALID_RANGE' ||
        this.state.errorCode === 'OUT_OF_BOUNDS'
      );
    },

    async analyse() {
      this.state.loading = true;
      this.state.result = null;
      this.state.nullResult = false;
      this.state.error = null;
      this.state.errorCode = null;
      try {
        // <input type="datetime-local"> gives minute precision in the browser
        // UI: 'YYYY-MM-DDTHH:MM'. The API requires second precision UTC:
        // 'YYYY-MM-DDTHH:MM:SSZ'. We append ':00Z' (treating the picker's
        // literal value as UTC). The page labels times as "UTC" everywhere so
        // the user's local-time interpretation never enters the API payload.
        const fromIso = `${this.form.from}:00Z`;
        const toIso = `${this.form.to}:00Z`;
        const url = `/api/analyze?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;

        const res = await fetch(url);
        const body = await res.json();

        if (!res.ok) {
          this.state.error = body?.message ?? 'Request failed.';
          this.state.errorCode = body?.code ?? null;
          return;
        }

        if (body.buy === null) {
          this.state.nullResult = true;
        } else {
          this.state.result = body;
        }
      } catch (err) {
        this.state.error = err?.message ?? 'Network error.';
      } finally {
        this.state.loading = false;
      }
    },
  }));
});

function formatCurrency(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  // Display formatting only — toFixed(2) returns a string here for *rendering*.
  // The API already rounded to two decimals via Math.round(x*100)/100; the
  // CLAUDE.md "never toFixed" rule applies to API serialisation, not client
  // display.
  return `$${value.toFixed(2)}`;
}

function formatPickerTime(iso) {
  // 'YYYY-MM-DDTHH:MM:SSZ' → 'YYYY-MM-DD HH:MM:SS' for human-readable display.
  return iso.replace('T', ' ').replace('Z', '');
}

function isoToPickerValue(iso) {
  // 'YYYY-MM-DDTHH:MM:SSZ' → 'YYYY-MM-DDTHH:MM' (the format
  // <input type="datetime-local"> expects).
  return iso.replace(/:\d{2}Z$/, '');
}
