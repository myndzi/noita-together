import fs from 'node:fs';
import { Recorder } from './recorder';
import { ConsolePlayer } from './console_player';

const RECORD_PATH = process.env.RECORD_PATH;

export const recorder = ((): Recorder => {
  try {
    const path = RECORD_PATH;
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
      tap: () => noop,
    } as any;
  }
})();

// playback
if (require.main === module) {
  if (!RECORD_PATH) throw new Error('RECORD_PATH must be set in the environment');
  const player = new ConsolePlayer(RECORD_PATH);
  player.play(process.argv[2]);
}
