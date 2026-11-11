// Preload (`node --import ./perf/fixed-clock.mjs`) that freezes the wall clock
// of the fixture processes at CLIO_PERF_FIXED_CLOCK so every timestamp the
// screenshot pipeline renders is the same on every run. Timers still run.
const fixed = process.env['CLIO_PERF_FIXED_CLOCK'];

if (fixed) {
  const RealDate = Date;
  const frozen = RealDate.parse(fixed);
  if (Number.isNaN(frozen)) throw new Error(`CLIO_PERF_FIXED_CLOCK is not a date: ${fixed}`);
  class FrozenDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(frozen);
      else super(...args);
    }
    static now() {
      return frozen;
    }
  }
  globalThis.Date = FrozenDate;
}
