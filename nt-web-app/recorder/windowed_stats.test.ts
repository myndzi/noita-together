import { WindowedStats } from './windowed_stats';

describe('WindowedStats', () => {
  it('behaves sanely with no data', () => {
    const ws = new WindowedStats(1000);
    expect(ws.total()).toBe(0);
    expect(ws.peakRate()).toBe(0);
  });

  it('behaves sanely with one sample', () => {
    const ws = new WindowedStats(1000);
    ws.push(100, 100);
    expect(ws.total()).toBe(100);
    expect(ws.peakRate()).toBe(100);
  });

  it('returns the average for all samples when none are too old', () => {
    const ws = new WindowedStats(1000);
    ws.push(100, 100);
    ws.push(200, 300);
    expect(ws.total()).toBe(400);
    expect(ws.peakRate()).toBe(400);
  });

  it('returns the average for only the most recent samples', () => {
    const ws = new WindowedStats(1000);
    ws.push(100, 100);
    ws.push(1100, 100);
    ws.push(1200, 300);
    expect(ws.total()).toBe(500);
    expect(ws.peakRate()).toBe(400);
  });

  it('returns the peak average from data that has expired from the window', () => {
    const ws = new WindowedStats(1000);
    ws.push(100, 100);
    ws.push(200, 300);
    ws.push(9000, 100);
    expect(ws.total()).toBe(500);
    expect(ws.peakRate()).toBe(400);
  });

  it('scales the rate to the requested ratio', () => {
    const ws = new WindowedStats(60_000, 1000);
    ws.push(100, 60);
    expect(ws.peakRate()).toBe(1);
  });

  it('scales the rate to the requested ratio', () => {
    const ws = new WindowedStats(1000, 60_000);
    ws.push(100, 1);
    expect(ws.peakRate()).toBe(60);
  });
});
