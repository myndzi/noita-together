import fs from 'node:fs';
import PATH from 'node:path';

import { RecorderFrame, readRecorderFrames } from './frame';

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

    for await (const frame of readRecorderFrames(stream)) {
      this.tick(frame);
    }

    this.done();
  }
}
