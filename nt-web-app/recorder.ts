import fs from 'node:fs';
import PATH from 'node:path';
import { Stream } from 'node:stream';
import WebSocket from 'ws';

enum FrameType {
  WS_OPEN,
  WS_CLOSE,
  WS_BINARY,
  WS_TEXT,
}

const isMemberOf =
  <T extends {}>(e: T) =>
  (token: unknown): token is T[keyof T] =>
    Object.values(e).includes(token as T[keyof T]);

const isFrameType = isMemberOf(FrameType);

type RecorderFrame<T = FrameType> = {
  type: T;
  connection_id: number;
  timestamp_ms: number;
  payload: T extends FrameType.WS_OPEN ? string : T extends FrameType.WS_CLOSE ? number : Buffer;
};

async function* readRecorderFrames(stream: fs.ReadStream): AsyncGenerator<RecorderFrame> {
  let count = 0;
  let abspos = 0;

  let acc: Buffer = Buffer.of();

  for await (const chunk of stream) {
    acc = Buffer.concat([acc, chunk]);

    while (true) {
      // ensure we have all the data
      if (acc.length < 4) break;
      const frameSize = acc.readUInt32LE(0);
      if (acc.length < frameSize) break;

      // shift a frame from the accumulator buffer
      const frame = acc.subarray(0, frameSize);
      acc = acc.subarray(frameSize);

      // prettier-ignore
      try {
        // decode the frame
        /* skip frame size - already accounted for */  let pos =  4;
        const timestamp_ms = frame.readDoubleLE(pos);      pos += 8;
        const connection_id = frame.readUInt16LE(pos);     pos += 2;
        const type = frame.readUint8(pos);                 pos += 1;
        const data = frame.subarray(pos);
        
        if (!isFrameType(type)) {
          throw new Error('Decoded invalid frame type: '+type);
        }
        switch (type) {
          case FrameType.WS_OPEN:
            yield {
              type,
              timestamp_ms,
              connection_id,
              payload: data.toString('utf-8')
            } as RecorderFrame<FrameType.WS_OPEN>;
          case FrameType.WS_CLOSE:
            yield {
              type,
              timestamp_ms,
              connection_id,
              payload: data.readUint16LE(0),
            } as RecorderFrame<FrameType.WS_CLOSE>;
          case FrameType.WS_BINARY:
          case FrameType.WS_TEXT:
            yield {
              type,
              timestamp_ms,
              connection_id,
              payload: data
            } as RecorderFrame<FrameType.WS_TEXT|FrameType.WS_BINARY>;
        }
      } catch (e) {
        throw new Error(`failed to decode frame=${count} at pos=${abspos}: ${e}`);
      }

      count++;
      abspos += frameSize;
    }

    if (acc.length) {
      throw new Error('read stream ended with an incomplete frame');
    }
  }
}

class Recorder {
  private readonly path: string;
  private session?: fs.WriteStream;

  private lastWarnId = -1;
  private waitUntil = 0;
  private id = 0;

  constructor(path: string) {
    this.path = path;
  }

  private warn(warnId: number, msg: string) {
    const now = Date.now();
    if (warnId === this.lastWarnId && now < this.waitUntil) return;

    this.lastWarnId = warnId;
    this.waitUntil = now + 5_000; // wait 5 seconds before printing the same message again

    console.log('[recorder]', msg);
  }

  private writeFrame(type: FrameType, id: number, _data: Buffer | number | string): void {
    if (!(this.session instanceof fs.WriteStream)) {
      this.warn(0, 'incorrect usage: session not open');
      return;
    }
    if (!this.session.writable) {
      this.warn(1, 'session not writable');
      return;
    }

    let data: Buffer;
    switch (type) {
      case FrameType.WS_OPEN:
        data = Buffer.from(_data as string);
        break;
      case FrameType.WS_CLOSE:
        // https://www.rfc-editor.org/rfc/rfc6455.html#section-7.4
        // close codes are from 0-4999, but the most common are
        // 1006 (terminated abnormally) or 1000 (normal closure)
        data = Buffer.alloc(2);
        data.writeUInt16LE(_data as number);
        break;
      case FrameType.WS_BINARY:
      case FrameType.WS_TEXT:
        data = _data as Buffer;
        break;
    }

    // prettier-ignore
    {
      const header = Buffer.alloc(4 + 8 + 2 + 1);         let pos =  0;
      header.writeUInt32LE(header.length + data.length);      pos += 4; // frame size
      header.writeDoubleLE(Date.now(), pos);                  pos += 8; // timestamp
      header.writeUInt16LE(id, pos);                          pos += 2; // connection id
      header.writeUInt8(type, pos);                           pos += 1; // message type

      this.session.write(header);
      this.session.write(data);
    }
  }

  tap(socket: WebSocket, url: string) {
    const id = this.id++;

    this.writeFrame(FrameType.WS_OPEN, id, url);

    socket.once('close', (code: number) =>
      // type RawData = Buffer | ArrayBuffer | Buffer[];
      // https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/receiver.js#L537-L543
      // binarytype is 'nodebuffer' by default, so data should reliably be a Buffer instance
      this.writeFrame(FrameType.WS_CLOSE, id, code),
    );
    socket.on('message', (data: WebSocket.RawData, isBinary: boolean) =>
      this.writeFrame(isBinary ? FrameType.WS_BINARY : FrameType.WS_TEXT, id, <Buffer>data),
    );
  }

  open() {
    if (this.session instanceof fs.WriteStream) {
      this.session.end();
    }

    const timestamp = new Date().toISOString();
    const filename = PATH.resolve(this.path, `session-${timestamp}`);
    this.session = fs.createWriteStream(filename);
  }

  async play(filename: string) {
    const abspath = PATH.resolve(this.path, filename);
    const stat = fs.statSync(abspath);
    if (!stat.isFile()) {
      this.warn(2, `Not a file: ${filename}`);
      return;
    }

    try {
      fs.accessSync(abspath, fs.constants.R_OK);
    } catch (e) {
      this.warn(3, `Cannot read: ${filename}`);
      return;
    }

    const stream = fs.createReadStream(abspath);
    for await (const frame of readRecorderFrames(stream)) {
      console.log(frame);
    }
  }
}

export const recorder = ((): Recorder => {
  try {
    const path = process.env.RECORD_PATH;
    if (!path) throw 'Recording disabled';

    const stat = fs.statSync(path);
    if (!stat.isDirectory()) throw `Path ${path} is not a directory`;

    try {
      fs.accessSync(path, fs.constants.R_OK | fs.constants.W_OK);
    } catch (e) {
      throw `Cannot write to ${path}`;
    }

    return new Recorder(path);
  } catch (e) {
    console.log(`[recorder]: ${e}`);

    const noop = () => {};
    return {
      open: noop,
      tap: noop,
      play: () => {
        console.error('Cannot play: set RECORD_PATH to a valid readable/writable directory');
      },
    } as any;
  }
})();

// playback
if (require.main === module) {
  recorder.play(process.argv[2]);
}
