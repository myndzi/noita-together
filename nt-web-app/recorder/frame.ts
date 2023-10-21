import type ws from 'ws';
import { Readable, Writable } from 'node:stream';

export enum FrameType {
  IGNORE,
  ERROR,
  WS_OPEN,
  WS_UPGRADED,
  WS_FAILED,
  WS_C_CLOSE,
  WS_S_CLOSE,
  WS_C2S_BINARY,
  WS_C2S_TEXT,
  WS_S2C_BINARY,
  WS_S2C_TEXT,
}

export type MetaPayloadTypes = FrameType.IGNORE | FrameType.ERROR;
export type StringPayloadTypes = FrameType.WS_OPEN | FrameType.WS_FAILED;
export type NumberPayloadTypes = FrameType.WS_UPGRADED | FrameType.WS_C_CLOSE | FrameType.WS_S_CLOSE;
export type BufferPayloadTypes =
  | FrameType.WS_C2S_BINARY
  | FrameType.WS_C2S_TEXT
  | FrameType.WS_S2C_BINARY
  | FrameType.WS_S2C_TEXT;

export type FramePayloadType<T extends FrameType> = T extends StringPayloadTypes
  ? string
  : T extends NumberPayloadTypes
  ? number
  : T extends BufferPayloadTypes
  ? Buffer
  : never;

export type RecorderFrame =
  | {
      type: StringPayloadTypes;
      cid: number;
      ts_ms: number;
      payload: string;
    }
  | {
      type: NumberPayloadTypes;
      cid: number;
      ts_ms: number;
      payload: number;
    }
  | {
      type: BufferPayloadTypes;
      cid: number;
      ts_ms: number;
      payload: Buffer;
    }
  | {
      type: FrameType.IGNORE;
    }
  | {
      type: FrameType.ERROR;
      error: string;
    };

type DistributivePick<T, K extends keyof T> = T extends unknown ? Pick<T, K> : never;
export type PartialFrame<K extends keyof Exclude<RecorderFrame, { type: MetaPayloadTypes }>> = DistributivePick<
  Exclude<RecorderFrame, { type: MetaPayloadTypes }>,
  K
>;

export const isMemberOf =
  <T extends {}>(e: T) =>
  (token: unknown): token is T[keyof T] =>
    Object.values(e).includes(token as T[keyof T]);

export const isFrameType = isMemberOf(FrameType);

export const writeTo = <T extends FrameType>(
  stream: Writable,
  type: T,
  id: number,
  now: number,
  _data: FramePayloadType<T>
) => {
  let data: Buffer;
  switch (type) {
    // string payloads
    case FrameType.WS_OPEN:
    case FrameType.WS_FAILED:
      data = Buffer.from(_data as string);
      break;
    // numeric payloads (0-65535)
    case FrameType.WS_UPGRADED:
    case FrameType.WS_C_CLOSE:
    case FrameType.WS_S_CLOSE:
      // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4
      // close codes are from 0-4999, but the most common are
      // 1006 (terminated abnormally) or 1000 (normal closure)
      data = Buffer.alloc(2);
      data.writeUInt16LE(_data as number);
      break;
    // buffer payloads
    case FrameType.WS_C2S_BINARY:
    case FrameType.WS_S2C_BINARY:
    case FrameType.WS_C2S_TEXT:
    case FrameType.WS_S2C_TEXT:
      // ws.send(data: number) calls data.toString(); see:
      // https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/websocket.js#L452
      data = typeof _data === 'number' ? Buffer.from(_data.toString()) : Buffer.from(_data);
      break;
    case FrameType.IGNORE:
      throw new Error('Cannot write FrameType.WS_IGNORE');
    case FrameType.ERROR:
      throw new Error('Cannot write FrameType.ERROR');
    default:
      throw new Error(`Unhandled FrameType: ${type}`);
  }

  // prettier-ignore
  {
    const header = Buffer.alloc(4 + 8 + 2 + 1);         let pos =  0;
    header.writeUInt32LE(header.length + data.length);      pos += 4; // frame size
    header.writeDoubleLE(now, pos);                         pos += 8; // timestamp
    header.writeUInt16LE(id, pos);                          pos += 2; // connection id
    header.writeUInt8(type, pos);                           pos += 1; // message type

    // avoid a buffer copy by writing two separate buffers
    // (most messages we receive here will already be a buffer)
    // this is also why we don't just return a Buffer
    stream.write(header);
    stream.write(data);
  }
};

type WithSize<T extends RecorderFrame> = T & { size: number };

// prettier-ignore
export const readFrom = (buf: Buffer): WithSize<RecorderFrame> => {
  const size = buf.readUInt32LE(0);
  if (buf.length < size) return {type: FrameType.IGNORE, size: 0};

  const frame = buf.subarray(0, size);

  /* skip frame size - already accounted for */  let pos =  4;
  const ts_ms = frame.readDoubleLE(pos);             pos += 8;
  const cid = frame.readUInt16LE(pos);               pos += 2;
  const type = frame.readUint8(pos);                 pos += 1;
  const data = frame.subarray(pos);

  if (!isFrameType(type)) return {type: FrameType.ERROR, error: `Invalid frame type: ${type}`, size};

  switch (type) {
    // string payloads
    case FrameType.WS_OPEN:
    case FrameType.WS_FAILED:
      return {
        size,
        type,
        ts_ms: ts_ms,
        cid: cid,
        payload: data.toString('utf-8'),
      };
    // numeric payloads (0-65536)
    case FrameType.WS_UPGRADED:
    case FrameType.WS_C_CLOSE:
    case FrameType.WS_S_CLOSE:
      return {
        size,
        type,
        ts_ms: ts_ms,
        cid: cid,
        payload: data.readUint16LE(0),
      };
    // buffer payloads
    case FrameType.WS_C2S_BINARY:
    case FrameType.WS_S2C_BINARY:
    case FrameType.WS_C2S_TEXT:
    case FrameType.WS_S2C_TEXT:
      return {
        size,
        type,
        ts_ms: ts_ms,
        cid: cid,
        payload: data,
      };
    default:
      return {
        type: FrameType.ERROR,
        size,
        error: `Invalid FrameType: ${type}`
      };
  }
};

export async function* readRecorderFrames(stream: Readable): AsyncGenerator<RecorderFrame, number> {
  let count = 0;
  let abspos = 0;

  let acc: Buffer = Buffer.of();

  for await (const chunk of stream) {
    acc = Buffer.concat([acc, chunk]);

    while (true) {
      // not long enough for the frame size
      if (acc.length < 4) break;

      try {
        const { size, ...frame } = readFrom(acc);
        if (size === 0) break;

        count++;
        abspos += size;

        acc = acc.subarray(size);
        yield frame as RecorderFrame;
      } catch (e) {
        throw new Error(`failed to decode frame=${count} at pos=${abspos}: ${e}`);
      }
    }
  }

  if (acc.length) {
    throw new Error('read stream ended with an incomplete frame');
  }

  return count;
}

// for best accuracy, we steal ws's `toBuffer`, which it calls internally for sender.send's arguments
const toBuffer: (data: any) => Buffer = require('ws/lib/buffer-util').toBuffer;

// nt websocket server only calls ws.send in User.js, with no opts.
// isBinary is thus inferred from the data type of the data, see
// https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/websocket.js#L460
type BufferLike = Parameters<ws.WebSocket['send']>[0];
export const wsData = (data: BufferLike): { isBinary: boolean; data: Buffer } => {
  // we unfortunately have to "reproduce" ws.send's behavior here, since we can't easily
  // tap into what it _actually_ did
  switch (typeof data) {
    case 'number':
      return { isBinary: false, data: toBuffer(data.toString()) };
    case 'string':
      return { isBinary: false, data: toBuffer(data) };
    default:
      return { isBinary: true, data: toBuffer(data) };
  }
};
