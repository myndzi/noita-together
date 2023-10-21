import ws from 'ws';
import fs from 'node:fs';
import PATH from 'node:path';
import { Socket } from 'node:net';
import { Writable } from 'node:stream';

import { FrameWriter } from './frame_writer';

type CtorType<T extends new (...args: any) => any> = T extends new (...args: infer As) => infer T
  ? (...args: As) => T
  : never;
type FrameWriterCreator = CtorType<typeof FrameWriter>;
const defaultFrameWriterCreator = (stream: Writable, id: number) => new FrameWriter(stream, id);

export class Recorder {
  private id = 1;

  private bySocket = new WeakMap<Socket, FrameWriter>();
  private byWebSocket = new WeakMap<ws.WebSocket, FrameWriter>();

  protected constructor(
    private readonly session: Writable,
    private readonly fwc: FrameWriterCreator = defaultFrameWriterCreator
  ) {}

  static to<T extends typeof Recorder>(this: T, path: string): Recorder;
  static to<T extends typeof Recorder>(this: T, stream: Writable): Recorder;
  static to<T extends typeof Recorder>(this: T, dest: string | Writable): Recorder {
    if (dest instanceof Writable) {
      return new this(dest);
    }

    const stat = fs.statSync(dest);
    if (!stat.isDirectory()) throw new Error(`Path ${dest} is not a directory`);

    try {
      fs.accessSync(dest, fs.constants.W_OK);
    } catch (e) {
      throw new Error(`Cannot write to ${dest}`);
    }

    const timestamp = new Date().toISOString();
    const filename = PATH.resolve(dest, `session-${timestamp}`);
    const stream = fs.createWriteStream(filename);
    return new Recorder(stream);
  }

  upgraded(socket: Socket, ws: ws.WebSocket, uaccess: number): FrameWriter | undefined {
    const fw = this.bySocket.get(socket);
    if (!fw) return undefined;

    this.byWebSocket.set(ws, fw);
    this.bySocket.delete(socket);

    fw.upgraded(uaccess);

    return fw;
  }

  failed(socket: Socket, reason: string): void {
    const fw = this.bySocket.get(socket);
    if (!fw) return;

    fw.failed(reason);

    this.bySocket.delete(socket);
  }

  connected(socket: Socket, url: string): FrameWriter | undefined {
    if (!this.session) return undefined;

    const fw = this.bySocket.get(socket) ?? this.fwc(this.session, this.id++);
    this.bySocket.set(socket, fw);

    fw.connected(url);

    return fw;
  }

  frameWriter(ws: ws.WebSocket): FrameWriter | undefined {
    return this.byWebSocket.get(ws);
  }

  close(): void {
    this.session.end();
  }
}
