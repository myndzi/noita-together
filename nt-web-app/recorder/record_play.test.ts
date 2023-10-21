import ws from 'ws';
import { Socket } from 'node:net';
import { EventEmitter } from 'node:events';
import { Writable, PassThrough } from 'node:stream';

import { Recorder } from './recorder';
import { FrameWriter } from './frame_writer';
import { FrameType as FT, PartialFrame, RecorderFrame, readFrom, readRecorderFrames } from './frame';
import { MakeFrame } from '../websocket/lobby/LobbyUtils';

const clock = (initial: number) => {
  let clocktime = initial;
  return () => clocktime++;
};

class TestRecorder extends Recorder {
  protected constructor(session: Writable) {
    const tick = clock(1337);
    const fwc = (stream: Writable, id: number) => new FrameWriter(stream, id, tick);
    super(session, fwc);
  }
}

describe('record playback', () => {
  it('test', () => {
    const tick = clock(1234);
    expect(tick()).toEqual(1234);
    expect(tick()).toEqual(1235);
    const tick2 = clock(333);
    expect(tick2()).toEqual(333);
    expect(tick2()).toEqual(334);
  });
  it("deals with User.Write's pre-framing behavior", () => {
    const passthrough = new PassThrough();
    const recorder = TestRecorder.to(passthrough);

    const frame1 = MakeFrame('foo');
    recorder.connected({} as any, 'hi')?.server_sent(frame1);

    let buf = passthrough.read();

    // discard the "connected" frame
    const connected_frame = readFrom(buf);
    buf = buf.subarray(connected_frame.size);

    const { size, ...frame } = readFrom(buf);

    if (frame.type !== FT.WS_S2C_BINARY) {
      fail('Incorrect frame type');
    }

    expect(frame.payload).toEqual(Buffer.from('foo'));

    passthrough.end();
  });
  it('reads back the same written sequence', async () => {
    const socket = {} as unknown as Socket;
    const ws = new EventEmitter() as unknown as ws.WebSocket;
    const passthrough = new PassThrough();
    const recorder = TestRecorder.to(passthrough);

    const expected: PartialFrame<'type' | 'payload' | 'cid' | 'ts_ms'>[] = [];

    const url = 'http://example.com/ws/token';
    let time = 1337;

    const fw1 = recorder.connected(socket, url);
    expected.push({ cid: 1, type: FT.WS_OPEN, payload: url, ts_ms: time++ });

    const fw2 = recorder.upgraded(socket, ws, 0);
    expected.push({ cid: 1, type: FT.WS_UPGRADED, payload: 0, ts_ms: time++ });

    expect(fw1).toBeDefined();
    expect(fw2).toBeDefined();
    expect(fw1).toBe(fw2);

    if (!fw1 || !fw2) throw new Error('impossible');

    const socket2 = {} as unknown as Socket;
    recorder.connected(socket2, 'foo');
    expected.push({ cid: 2, type: FT.WS_OPEN, payload: 'foo', ts_ms: time++ });

    recorder.failed(socket2, 'unauthorized');
    expected.push({ cid: 2, type: FT.WS_FAILED, payload: 'unauthorized', ts_ms: time++ });

    fw1.tap(ws);

    ws.emit('message', 'c2s_text', false);
    expected.push({ cid: 1, type: FT.WS_C2S_TEXT, payload: Buffer.from('c2s_text'), ts_ms: time++ });

    fw1.server_sent('s2c_text');
    expected.push({ cid: 1, type: FT.WS_S2C_TEXT, payload: Buffer.from('s2c_text'), ts_ms: time++ });

    ws.emit('message', 'c2s_buffer', true);
    expected.push({ cid: 1, type: FT.WS_C2S_BINARY, payload: Buffer.from('c2s_buffer'), ts_ms: time++ });

    fw1.server_sent(Buffer.from('s2c_buffer'));
    expected.push({ cid: 1, type: FT.WS_S2C_BINARY, payload: Buffer.from('s2c_buffer'), ts_ms: time++ });

    ws.emit('close', 1000);
    expected.push({ cid: 1, type: FT.WS_C_CLOSE, payload: 1000, ts_ms: time++ });

    // it's highly unlikely that this would be called while the socket is still valid
    // and concurrently with a client close event, but we're just exercising the method
    fw1.server_closed(1006);
    expected.push({ cid: 1, type: FT.WS_S_CLOSE, payload: 1006, ts_ms: time++ });

    // if we don't close the stream, the async iterator won't end, but node doesn't
    // actually have any socket handles to keep it running. this leads to really
    // confusing behavior where it seems like some lines of code don't even execute
    // in the debugger!
    passthrough.end();

    const actual: RecorderFrame[] = [];
    for await (const frame of readRecorderFrames(passthrough)) {
      actual.push(frame);
    }

    let last_timestamp = 0;
    for (const [idx, frame] of actual.entries()) {
      switch (frame.type) {
        case FT.IGNORE:
        case FT.ERROR:
          fail(`unexpectedly decoded a meta FrameType: ${FT[frame.type]}`);
      }

      expect(frame.ts_ms).toBeGreaterThanOrEqual(last_timestamp);
      last_timestamp = frame.ts_ms;

      expect(frame).toEqual(expected[idx]);
    }

    expect(actual.length).toBe(expected.length);
  });
});
