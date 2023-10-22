const sum = (a: number, b: number) => a + b;

export class WindowedStats {
  private timestamps: number[] = [];
  private values: number[] = [];

  private _total: number = 0;
  private _peakRate: number = 0;
  private _maxSamples: number = 0;
  private factor: number;

  constructor(
    private window_size_ms: number,
    per: number = window_size_ms
  ) {
    this.factor = window_size_ms / per;
  }

  push(ts_ms: number, value: number) {
    const cutoff = ts_ms - this.window_size_ms;

    const numValues = this.values.length;
    if (numValues > 0) {
      const pos = this.timestamps.findIndex(v => v >= cutoff);
      if (pos === -1) {
        this.timestamps.length = 0;
        this.values.length = 0;
      } else if (pos > 0) {
        // [a, b, c]
        // found = b (idx=1)
        // delete (idx=1) elements starting at 0
        // [a, b, c].splice(0, 1) -> [b, c]
        this.timestamps.splice(0, pos);
        this.values.splice(0, pos);
      }
    }

    this.timestamps.push(ts_ms);
    this.values.push(value);

    this._maxSamples = Math.max(this._maxSamples, numValues);

    this._total += value;

    // (Ns / window_size) / divisor -> (Ns / window_size) * (1 / divisor)
    const rate = this.values.reduce(sum, 0) / this.factor;
    this._peakRate = Math.max(this._peakRate, rate);
  }

  total(): number {
    return this._total;
  }

  peakRate(): number {
    return this._peakRate;
  }

  maxSamples(): number {
    return this._maxSamples;
  }
}
