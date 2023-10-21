import ws from 'ws';
import { Writable } from 'node:stream';

import { FrameType, writeTo, wsData } from './frame';

export class FrameWriter {
  private lastWarnId = -1;
  private waitUntil = 0;

  constructor(
    private stream: Writable,
    private id: number,
    private now: () => number = () => Date.now()
  ) {}

  private warn(warnId: number, msg: string) {
    const now = this.now();
    if (warnId === this.lastWarnId && now < this.waitUntil) return;

    this.lastWarnId = warnId;
    this.waitUntil = now + 5_000; // wait 5 seconds before printing the same message again

    console.log('[recorder]', msg);
  }

  private writeFrame(type: FrameType, id: number, _data: Buffer | number | string): void {
    if (!(this.stream instanceof Writable) || !this.stream.writable) {
      this.warn(0, "FrameWriter: stream doesn't exist or is not writable");
      return;
    }

    writeTo(this.stream, type, id, this.now(), _data);
  }

  connected(url: string) {
    this.writeFrame(FrameType.WS_OPEN, this.id, url);
  }

  upgraded(uaccess: number) {
    this.writeFrame(FrameType.WS_UPGRADED, this.id, uaccess);
  }

  failed(reason: string) {
    this.writeFrame(FrameType.WS_FAILED, this.id, reason);
  }

  private client_sent(data: Buffer, isBinary: boolean) {
    this.writeFrame(isBinary ? FrameType.WS_C2S_BINARY : FrameType.WS_C2S_TEXT, this.id, data);
  }

  server_sent: ws.WebSocket['send'] = _data => {
    const { isBinary, data } = wsData(_data);
    this.writeFrame(isBinary ? FrameType.WS_S2C_BINARY : FrameType.WS_S2C_TEXT, this.id, data);
  };

  private client_closed(code: number) {
    this.writeFrame(FrameType.WS_C_CLOSE, this.id, code);
  }

  server_closed(code: number) {
    this.writeFrame(FrameType.WS_S_CLOSE, this.id, code);
  }

  tap(ws: ws.WebSocket) {
    // TODO: if the server closes the socket, does this event get emitted?
    ws.on('close', code => {
      this.client_closed(code);
    });
    ws.on('message', (data, isBinary) => {
      // what we receive here depends on websocket.binaryType; the default
      // for `ws` library is 'nodebuffer', and we don't change it. so this
      // is a safe cast as long as we don't mess with that
      this.client_sent(data as Buffer, isBinary);
    });
  }
}
