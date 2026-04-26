// Stock Price Analyzer — Alpine.js component.
// All values are UTC throughout: the API timestamps are UTC ('Z' suffix), and the
// page labels every time as "UTC" so the user can't mistake the picker's local
// rendering for a different timezone interpretation. See analyse() for the
// minute-UI / second-API conversion.

document.addEventListener('alpine:init', () => {
  Alpine.data('analyzer', () => ({
    header: { coverage: 'Loading coverage period…' },
    form: { from: '', to: '', funds: '', minLocal: '', maxLocal: '', lastEdited: null },
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
        // Eyebrow line: "<name> • <from> UTC → <time-of-to> UTC".
        // formatTimeOnly drops the date for the second timestamp because the
        // dataset is a single trading day. If a future dataset spans multiple
        // days, render the full date on both sides via formatPickerTime.
        this.header.coverage = `${data.name} • ${formatPickerTime(data.from)} UTC → ${formatTimeOnly(data.to)} UTC`;
        this.form.minLocal = isoToPickerValue(data.from);
        this.form.maxLocal = isoToPickerValue(data.to);
        // Pre-populate the form with the full coverage window. Brief: "Defaults
        // to the full window on first load." The :min/:max bindings on the two
        // inputs depend on form.from / form.to (each picker constrains the
        // other), so a profitable submit is one click away on page load.
        this.form.from = this.form.minLocal;
        this.form.to = this.form.maxLocal;
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

    // Per-field client-side range checks. Two flavours of error per field:
    //  (1) Dataset-bounds violation — the value is outside the dataset's
    //      coverage period. Always flag on whichever field is at fault.
    //  (2) Inversion violation — From > To. The pair is wrong, but only
    //      one field is "the one the user just changed" and should carry
    //      the message. We gate inversion errors on form.lastEdited so
    //      the unchanged field stays quiet.
    get fromError() {
      if (!this.form.from || !this.dataset) return null;
      // Dataset-bounds — always flag.
      if (this.form.from < this.form.minLocal)
        return `Must be ${formatPickerBound(this.form.minLocal)} or later.`;
      if (this.form.from > this.form.maxLocal)
        return `Must be ${formatPickerBound(this.form.maxLocal)} or earlier.`;
      // Inversion (from > to) — flag only if From was the last edited.
      if (
        this.form.to &&
        this.form.from > this.form.to &&
        this.form.lastEdited === 'from'
      )
        return `Must be ${formatPickerBound(this.form.to)} or earlier.`;
      return null;
    },
    get toError() {
      if (!this.form.to || !this.dataset) return null;
      // Dataset-bounds — always flag.
      if (this.form.to < this.form.minLocal)
        return `Must be ${formatPickerBound(this.form.minLocal)} or later.`;
      if (this.form.to > this.form.maxLocal)
        return `Must be ${formatPickerBound(this.form.maxLocal)} or earlier.`;
      // Inversion (to < from) — flag only if To was the last edited.
      if (
        this.form.from &&
        this.form.to < this.form.from &&
        this.form.lastEdited === 'to'
      )
        return `Must be ${formatPickerBound(this.form.from)} or later.`;
      return null;
    },

    // For OUT_OF_BOUNDS only, append the dataset's available range to the
    // API's message so the user has the valid window right next to the
    // error — they don't have to scroll back up to the eyebrow line.
    // Other error codes get the unmodified API message.
    get displayedError() {
      if (!this.state.error) return null;
      if (this.state.errorCode !== 'OUT_OF_BOUNDS') return this.state.error;
      if (!this.dataset) return this.state.error;
      const fromShort = formatPickerTime(this.dataset.from);
      const toShort = formatPickerTime(this.dataset.to);
      return `${this.state.error} Available range: ${fromShort} UTC → ${toShort} UTC.`;
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
  // Display formatting only. Intl.NumberFormat with en-US locale gives us
  // accounting notation: comma thousands separators, period decimals,
  // exactly two fraction digits, USD currency symbol — e.g.
  // 1000000000 -> "$1,000,000,000.00", 21.54 -> "$21.54". The API already
  // rounded to two decimals via Math.round(x*100)/100; the CLAUDE.md
  // "never toFixed" rule applies to API serialisation, not client display.
  // en-US is hardcoded (rather than runtime locale) because the dataset
  // currency is USD; for non-USD datasets we'd derive locale from the
  // dataset.currency code instead.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPickerTime(iso) {
  // Locale-aware human-readable display of an ISO 8601 UTC timestamp.
  // Uses the runtime locale (navigator.language) so the output format
  // matches the datetime-local picker UI exactly:
  //   en-US: '04/22/2026, 09:30:13 AM'
  //   en-GB: '22/04/2026, 09:30:13'
  // timeZone: 'UTC' preserves the UTC interpretation; the caller adds
  // a ' UTC' suffix at the call site so the timezone is unambiguous.
  return new Date(iso).toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
}

function formatInteger(value) {
  // Display formatting for whole-number counts (e.g. share count). Same
  // accounting notation as formatCurrency — comma thousands separators —
  // so adjacent currency and count values read consistently.
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US').format(Math.floor(value));
}

function formatTimeOnly(iso) {
  // Just the time portion of an ISO 8601 UTC timestamp, locale-formatted.
  // Used for the eyebrow's second timestamp (same-day datasets — see init()
  // for the multi-day caveat).
  return new Date(iso).toLocaleString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
  });
}

function isoToPickerValue(iso) {
  // 'YYYY-MM-DDTHH:MM:SSZ' → 'YYYY-MM-DDTHH:MM' (the format
  // <input type="datetime-local"> expects).
  return iso.replace(/:\d{2}Z$/, '');
}

function formatPickerBound(pickerValue) {
  // 'YYYY-MM-DDTHH:MM' → locale-formatted string for inline error messages.
  // Uses the runtime locale (navigator.language) so the format matches the
  // datetime-local picker's UI exactly: en-US shows "04/22/2026, 08:00 PM",
  // en-GB shows "22/04/2026, 20:00", etc. timeZone: 'UTC' preserves the
  // UTC interpretation (the app treats all picker values as UTC); the
  // " UTC" suffix makes the timezone unambiguous to the reader.
  const date = new Date(pickerValue + ':00Z');
  const localised = date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
  return `${localised} UTC`;
}
