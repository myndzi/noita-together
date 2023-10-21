import fs from 'node:fs';
import PATH from 'node:path';
import { Writable } from 'node:stream';

import WebSocket from 'ws';

import { FrameType } from './util';

export class Recorder {
  private readonly path: string;
  private session?: Writable;

  private lastWarnId = -1;
  private waitUntil = 0;
  private id = 1;

  private sockets = new WeakMap<WebSocket, number>();

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
    if (!(this.session instanceof Writable)) {
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
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_S2C_BINARY:
      case FrameType.WS_C2S_TEXT:
      case FrameType.WS_S2C_TEXT:
        // ws.send(data: number) calls data.toString(); see:
        // https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/websocket.js#L452
        data = typeof _data === 'number' ? Buffer.from(_data.toString()) : Buffer.from(_data);
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

  private server_sent(id: number): WebSocket['send'] {
    // for best accuracy, we steal ws's `toBuffer`, which it calls internally for sender.send's arguments
    const toBuffer: (data: any) => Buffer = require('ws/lib/buffer-util').toBuffer;

    // nt websocket server only calls ws.send in User.js, with no opts.
    // isBinary is thus inferred from the data type of the data, see
    // https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/websocket.js#L460
    return _data => {
      // we unfortunately have to "reproduce" ws.send's behavior here, since we can't easily
      // tap into what it _actually_ did
      let data: Buffer;
      let isBinary: boolean;

      switch (typeof _data) {
        case 'number':
          data = toBuffer(_data.toString());
          isBinary = false;
          break;
        case 'string':
          data = toBuffer(_data);
          isBinary = false;
          break;
        default:
          data = toBuffer(_data);
          isBinary = true;
          break;
      }

      this.writeFrame(isBinary ? FrameType.WS_S2C_BINARY : FrameType.WS_S2C_TEXT, id, data);
    };
  }

  tap(socket: WebSocket, url: string): WebSocket['send'] {
    const old_id = this.sockets.get(socket);
    if (old_id) return this.server_sent(old_id);

    const id = this.id++;
    this.sockets.set(socket, id);

    this.writeFrame(FrameType.WS_OPEN, id, url);

    socket.once('close', (code: number) =>
      // type RawData = Buffer | ArrayBuffer | Buffer[];
      // https://github.com/websockets/ws/blob/7f4e1a75afbcee162cff0d44000b4fda82008d05/lib/receiver.js#L537-L543
      // binarytype is 'nodebuffer' by default, so data should reliably be a Buffer instance

      this.writeFrame(FrameType.WS_CLOSE, id, code)
    );
    socket.on('message', (data: WebSocket.RawData, isBinary: boolean) =>
      this.writeFrame(isBinary ? FrameType.WS_C2S_BINARY : FrameType.WS_C2S_TEXT, id, <Buffer>data)
    );

    return this.server_sent(id);
  }

  open(target?: Writable) {
    if (this.session instanceof Writable) {
      this.session.end();
    }

    if (!target) {
      const timestamp = new Date().toISOString();
      const filename = PATH.resolve(this.path, `session-${timestamp}`);
      this.session = fs.createWriteStream(filename);
    } else {
      this.session = target;
    }
  }
}
