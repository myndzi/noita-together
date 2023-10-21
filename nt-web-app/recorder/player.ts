import PATH from 'node:path';
import fs from 'node:fs';

import { FrameType, RecorderFrame, isFrameType } from './util';
import { Readable } from 'node:stream';

export async function* readRecorderFrames(stream: Readable): AsyncGenerator<RecorderFrame, number> {
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
            break;
          case FrameType.WS_CLOSE:
            yield {
              type,
              timestamp_ms,
              connection_id,
              payload: data.readUint16LE(0),
            } as RecorderFrame<FrameType.WS_CLOSE>;
            break;
          case FrameType.WS_C2S_BINARY:
          case FrameType.WS_S2C_BINARY:
          case FrameType.WS_C2S_TEXT:
          case FrameType.WS_S2C_TEXT:
            yield {
              type,
              timestamp_ms,
              connection_id,
              payload: data
            } as RecorderFrame<FrameType.WS_C2S_BINARY|FrameType.WS_S2C_BINARY|FrameType.WS_C2S_TEXT|FrameType.WS_S2C_TEXT>;
            break;
        }
      } catch (e) {
        throw new Error(`failed to decode frame=${count} at pos=${abspos}: ${e}`);
      }

      count++;
      abspos += frameSize;
    }
  }

  if (acc.length) {
    throw new Error('read stream ended with an incomplete frame');
  }

  return count;
}

export abstract class Player {
  private readonly absdir: string;

  constructor(path: string) {
    const stat = fs.statSync(path);
    if (!stat.isDirectory()) throw new Error(`Path ${path} is not a directory`);

    try {
      fs.accessSync(path, fs.constants.R_OK | fs.constants.X_OK);
    } catch (e) {
      throw new Error(`Cannot read from ${path}`);
    }

    this.absdir = PATH.resolve(path);
  }

  abstract tick(_frame: RecorderFrame<FrameType>): Promise<void>;
  abstract done(): void;

  async play(filename: string) {
    const abspath = PATH.resolve(this.absdir, filename);

    const stat = fs.statSync(abspath);
    if (!stat.isFile()) throw new Error(`${abspath} is not a file`);

    try {
      fs.accessSync(abspath, fs.constants.R_OK);
    } catch (e) {
      throw new Error(`Cannot read from ${abspath}`);
    }

    const stream = fs.createReadStream(abspath);

    for await (const frame of readRecorderFrames(stream)) {
      this.tick(frame);
    }

    this.done();
  }
}
