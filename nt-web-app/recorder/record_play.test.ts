import assert from 'node:assert';
import EventEmitter from 'node:events';
import { PassThrough, Readable } from 'node:stream';

import type { WebSocket } from 'ws';

import { Recorder } from './recorder';
import { FrameType, RecorderFrame, isFrame, isFrameType } from './util';
import { readRecorderFrames } from './player';

const ws = new EventEmitter() as unknown as WebSocket;

const recorder = new Recorder('/tmp');
const passthrough = new PassThrough();
recorder.open(passthrough);

const url = 'http://example.com/ws/token';

const server_sent = recorder.tap(ws, url);
recorder.tap(ws, 'ignored'); // should only hook events once

ws.emit('message', 'c2s_string', false);
server_sent('s2c_string');

ws.emit('message', Buffer.from('c2s_buffer'), true);
server_sent(Buffer.from('s2c_buffer'));

ws.emit('close', 1006);
passthrough.end();

function assertFrame(idx: number, last_timestamp: number, actual: RecorderFrame, expected: RecorderFrame): number {
  assert.strictEqual(actual.type, expected.type, `${idx} type: actual=${actual.type} expected=${expected.type}`);
  if (isFrame(FrameType.WS_OPEN, actual) && isFrame(FrameType.WS_OPEN, expected)) {
    assert.strictEqual(
      actual.payload,
      expected.payload,
      `${idx} payload: actual=${actual.payload} expected=${expected.payload}`
    );
  } else if (
    (isFrame(FrameType.WS_C2S_BINARY, actual) && isFrame(FrameType.WS_C2S_BINARY, expected)) ||
    (isFrame(FrameType.WS_C2S_TEXT, actual) && isFrame(FrameType.WS_C2S_TEXT, expected)) ||
    (isFrame(FrameType.WS_S2C_BINARY, actual) && isFrame(FrameType.WS_S2C_BINARY, expected)) ||
    (isFrame(FrameType.WS_S2C_TEXT, actual) && isFrame(FrameType.WS_S2C_TEXT, expected))
  ) {
    assert(actual.payload);
  } else if (isFrame(FrameType.WS_CLOSE, actual) && isFrame(FrameType.WS_CLOSE, expected)) {
    assert.strictEqual(
      actual.payload,
      expected.payload,
      `${idx} payload: actual=${actual.payload} expected=${expected.payload}`
    );
  } else {
    assert(isFrameType(actual.type), `${idx} type: actual=${actual.type} (not an enum member)`);
  }
  assert(actual.timestamp_ms >= last_timestamp, `${idx} timestamp_ms: not monotonically increasing`);
  return actual.timestamp_ms;
}

async function test(rs: Readable, expected: Omit<RecorderFrame, 'connection_id' | 'timestamp_ms'>[]) {
  let ts = 0;
  let i = 0;

  for await (const actual of readRecorderFrames(rs)) {
    ts = assertFrame(i++, ts, actual, expected.shift() as RecorderFrame);
    console.log(`frame ${i}: OK`);
  }

  assert.equal(expected.length, 0, `${expected.length} Unconsumed expectations remain`);
}

// prettier-ignore
test(passthrough, [
  { type: FrameType.WS_OPEN,       payload: url                       },
  { type: FrameType.WS_C2S_TEXT,   payload: Buffer.from('c2s_string') },
  { type: FrameType.WS_S2C_TEXT,   payload: Buffer.from('s2c_string') },
  { type: FrameType.WS_C2S_BINARY, payload: Buffer.from('c2s_buffer') },
  { type: FrameType.WS_S2C_BINARY, payload: Buffer.from('s2c_buffer') },
  { type: FrameType.WS_CLOSE,      payload: 1006                      },
]).then(() => {
  console.log('PASSED');
});
