type formatter = (val: number, precision?: number, suffix?: string) => string;
export const formatUnits = (units: string[], base: number = Infinity): formatter => {
  if (base < 2) throw new RangeError('Base must be >= 2');
  if (!units.length) return (val, precision = 0, suffix = '') => val.toFixed(precision) + suffix;

  const maxLength = units.reduce((acc, cur) => Math.max(acc, cur.length), 0);
  const padded = units.map(unit => unit.padStart(maxLength + 1));
  const biggestUnit = units.length - 1;

  return (val, precision = 0, suffix = '') => {
    const idx = val < base ? 0 : Math.min(biggestUnit, Math.floor(Math.log(val) / Math.log(base)));
    const res = val / base ** idx;

    return res.toFixed(precision) + padded[idx] + suffix;
  };
};
