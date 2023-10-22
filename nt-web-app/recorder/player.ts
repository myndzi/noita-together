import fs from 'node:fs';
import PATH from 'node:path';
import jwt from 'jsonwebtoken';

import { RecorderFrame, StringPayloadTypes, readRecorderFrames } from './frame';

const SECRET_ACCESS = process.env.SECRET_JWT_ACCESS;

export abstract class Player {
  private readonly absdir: string;

  protected lastTimestamp = 0;
  protected usernames = new Map<number, string>();

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

  protected jwtUsername(frame: Extract<RecorderFrame, { type: StringPayloadTypes }>): string {
    if (!SECRET_ACCESS) return '';
    const token = decodeURIComponent(PATH.basename(frame.payload));

    try {
      const data = jwt.verify(token, SECRET_ACCESS, { ignoreExpiration: true, ignoreNotBefore: true }) as any;
      return data.preferred_username ?? data.sub ?? frame.cid.toString();
    } catch (e) {
      return `<${e instanceof Error ? e.message : String(e)}>`;
    }
  }

  protected waitTime(timestamp: number) {
    const diff = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;
    return diff;
  }

  abstract tick(_frame: RecorderFrame): Promise<void>;
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

    for await (const frame of readRecorderFrames(stream, process.env.PROGRESS ? stat.size : undefined)) {
      this.tick(frame);
    }

    this.done();
  }
}
