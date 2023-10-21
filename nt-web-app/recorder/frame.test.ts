import { PassThrough } from 'node:stream';

import { FrameType as FT, PartialFrame, readFrom, writeTo } from './frame';

describe('frames', () => {
  const cases: PartialFrame<'type' | 'payload'>[] = [
    { type: FT.WS_OPEN, payload: 'https://example.com/ws/token' },
    { type: FT.WS_FAILED, payload: 'oh noes' },
    { type: FT.WS_UPGRADED, payload: 0 },
    { type: FT.WS_UPGRADED, payload: 1 },
    { type: FT.WS_C2S_BINARY, payload: Buffer.from('buffer') },
    { type: FT.WS_C2S_TEXT, payload: Buffer.from('text') },
    { type: FT.WS_S2C_BINARY, payload: Buffer.from('buffer') },
    { type: FT.WS_S2C_TEXT, payload: Buffer.from('text') },
    { type: FT.WS_C_CLOSE, payload: 1006 },
    { type: FT.WS_S_CLOSE, payload: 1006 },
  ];

  it('tests every (non-meta) frame type', () => {
    const availableTypes = new Set<number>([...Object.values(FT)].filter((v): v is number => typeof v === 'number'));
    availableTypes.delete(FT.IGNORE);
    availableTypes.delete(FT.ERROR);
    for (const test of cases) {
      availableTypes.delete(test.type);
    }
    expect(availableTypes.size).toBe(0);
  });

  it.each(cases.map(test => [FT[test.type], test] as [string, PartialFrame<'type' | 'payload'>]))(
    '%p round-trip',
    (_, { type, payload }) => {
      const pt = new PassThrough();

      writeTo(pt, type, 0, 0, payload);
      writeTo(pt, type, 1, 0, payload);

      const buf = pt.read();

      const f1 = readFrom(buf);
      if (f1.type === FT.IGNORE || f1.type === FT.ERROR) {
        fail(`unexpected frame type: ${FT[f1.type]}`);
      }
      expect({
        connection_id: f1.cid,
        type: f1.type,
        payload: f1.payload,
      }).toEqual({
        connection_id: 0,
        type,
        payload,
      });

      const f2 = readFrom(buf.subarray(f1.size));
      if (f2.type === FT.IGNORE || f2.type === FT.ERROR) {
        fail(`unexpected frame type: ${FT[f2.type]}`);
      }
      expect({
        connection_id: f2.cid,
        type: f2.type,
        payload: f2.payload,
      }).toEqual({
        connection_id: 1,
        type,
        payload,
      });

      pt.end();
    }
  );
});
