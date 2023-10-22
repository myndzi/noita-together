import { formatUnits } from './util';

describe('formatUnits', () => {
  type spec = {
    units: string[];
    base?: number;
    precision?: number;
    suffix?: string;
    val: number;
    expected: string;
  };
  // prettier-ignore
  const tests: spec[] = [
    { units: [],                              val: 1,                                   expected:    '1'         },
    { units: [],                              val: 1.2,                                 expected:    '1'         },
    { units: [],                              val: 1.2,     precision: 1,               expected:  '1.2'         },
    { units: [],                              val: 1.2,     precision: 2,               expected: '1.20'         },
    { units: [],                              val: 1,                     suffix: '/s', expected:    '1/s'       },
    { units: ['count'],                       val: 1,                                   expected:    '1 count'   },
    { units: ['count'],                       val: 1.2,                                 expected:    '1 count'   },
    { units: ['count'],                       val: 1.2,     precision: 1,               expected:  '1.2 count'   },
    { units: ['count'],                       val: 1.2,     precision: 2,               expected: '1.20 count'   },
    { units: ['count'],                       val: 1,                     suffix: '/s', expected:    '1 count/s' },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 5,                                   expected:    '5   b'     },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 1023,                                expected: '1023   b'     },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 1024,                                expected:    '1 KiB'     },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 1024**2,                             expected:    '1 MiB'     },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 1024**3,                             expected: '1024 MiB'     },
    { units: ['b', 'KiB', 'MiB'], base: 1024, val: 2000,    precision: 2, suffix: '/s', expected: '1.95 KiB/s'   },
  ];
  it.each(tests)('$val -> "$expected"', spec => {
    const fu = formatUnits(spec.units, spec.base);
    expect(fu(spec.val, spec.precision, spec.suffix)).toEqual(spec.expected);
  });
});
