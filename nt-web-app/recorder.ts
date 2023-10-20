import fs from 'node:fs';
import PATH from 'node:path';

enum FrameType {
  WS_OPEN,
  WS_CLOSE,
  WS_BINARY,
  WS_TEXT,
}
import WebSocket from 'ws';
var test = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
test.on('connection', (socket, req) => {
  socket.on('message', (data, isBinary) => {
    data;
  });
});

class Recorder {
  private session: fs.WriteStream;
  private lastWarnId = -1;
  private waitUntil = 0;
  private id = 0;
  private ids = new WeakMap<WebSocket, number>();

  constructor(path: string) {
    const timestamp = new Date().toISOString();
    const filename = PATH.resolve(path, `session-${timestamp}`);
    this.session = fs.createWriteStream(filename);
  }

  private warn(warnId: number, msg: string) {
    const now = Date.now();
    if (warnId === this.lastWarnId && now < this.waitUntil) return;

    this.lastWarnId = warnId;
    this.waitUntil = now + 5_000; // wait 5 seconds before printing the same message again

    console.log('[recorder]', msg);
  }

  private writeFrame(type: FrameType, id: number, _data: Buffer | number | string): void {
    if (!this.session.writable) {
      this.warn(0, 'not writable');
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
      const header = Buffer.alloc(8 + 1 + 2 + 4);  let pos = 0;
      header.writeDoubleLE(Date.now(), pos);           pos += 8; // timestamp
      header.writeUInt8(type, pos);                    pos += 1; // message type
      header.writeUInt16LE(id, pos);                   pos += 2; // connection id
      header.writeUInt32LE(data.length);               pos += 4; // payload size

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
}

export const recorder = ((): Recorder => {
  try {
    const path = process.env.RECORD_PATH;
    if (!path) throw 'Recording disabled';

    const stat = fs.statSync(path);
    if (!stat.isDirectory()) throw `Path ${path} is not a directory`;

    try {
      fs.accessSync(path, fs.constants.W_OK);
    } catch (e) {
      throw `Cannot write to ${path}`;
    }

    return new Recorder(path);
  } catch (e) {
    console.log(`[recorder]: ${e}`);

    const noop = () => {};
    return {
      tap: noop as Recorder['tap'],
    } as Recorder;
  }
})();
