import { Recorder } from './recorder';
import { ConsolePlayer } from './console_player';

const RECORD_PATH = process.env.RECORD_PATH;

export const recorder = ((): Recorder => {
  const path = RECORD_PATH;
  let recorder: Recorder | undefined = undefined;
  try {
    if (path) recorder = Recorder.to(path);
  } catch (e) {
    console.error(`[recorder]: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!recorder) {
    console.error(`[recorder]: disabled`);
  }

  const noop = (): undefined => {};
  type mock = { [K in keyof Recorder]: Recorder[K] } & unknown;
  const noopRecorder: mock = {
    close: noop,
    connected: noop,
    failed: noop,
    frameWriter: noop,
    upgraded: noop,
  };
  return noopRecorder as Recorder;
})();

// playback
if (require.main === module) {
  if (!RECORD_PATH) throw new Error('RECORD_PATH must be set in the environment');
  const player = new ConsolePlayer(RECORD_PATH);
  player.play(process.argv[2]);
}
