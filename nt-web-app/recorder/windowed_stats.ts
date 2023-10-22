import Deque from 'double-ended-queue';

export class WindowedStats {
  private timestamps = new Deque<number>();
  private values = new Deque<number>();
  private windowTotal = 0;

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
    var cutoff = ts_ms - this.window_size_ms;

    for (var front = this.timestamps.peekFront(); front && front < cutoff; front = this.timestamps.peekFront()) {
      this.windowTotal -= this.values.shift()!;
      this.timestamps.shift();
    }

    this.timestamps.push(ts_ms);
    this.values.push(value);
    this.windowTotal += value;

    this._total += value;
    this._maxSamples = Math.max(this._maxSamples, this.values.length);
    this._peakRate = Math.max(this._peakRate, this.windowTotal / this.factor);
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
