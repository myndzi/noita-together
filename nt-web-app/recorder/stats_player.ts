import PATH from 'node:path';

import { Envelope } from '../websocket/gen/messages_pb';

import { Player } from './player';
import { BufferPayloadTypes, FrameType, RecorderFrame } from './frame';
import { WindowedStats } from './windowed_stats';
import { formatUnits } from './util';

const SECRET_ACCESS = process.env.SECRET_JWT_ACCESS;
const WINDOW_SIZE_MS = 5 * 60 * 1_000; // 5 minutes

const formatMsg = formatUnits(['', 'K', 'M'], 1000);
const formatBytesSI = formatUnits(['B', 'KiB', 'MiB', 'GiB'], 1024);

const minutes = (val: number) => (val / (60 * 1000)).toString() + ' mins';

type MessageStat = {
  count: WindowedStats;
  bytes: WindowedStats;
};
type GameInfo = {
  start: number;
  end: number;
};

const table = <T extends number>(header: string, rows: (string[] & { length: T })[]) => {
  if (rows.length === 0) return;

  const sizes = rows.reduce(
    (acc, cur) => (acc ? cur.map((str, idx) => Math.max(str.length, acc[idx])) : cur.map(str => str.length)),
    undefined as any as number[]
  );
  const width = sizes.reduce((a, b) => a + b) + (sizes.length - 1) * 3;

  console.log(header);
  console.log('-'.repeat(width));
  for (const row of rows) {
    const padded = row.map((cell, idx) => cell.padStart(sizes[idx]));
    console.log(padded.join(' | '));
  }
  console.log();
};

const isMessage = (frame: RecorderFrame): frame is Extract<RecorderFrame, { type: BufferPayloadTypes }> =>
  frame.type === FrameType.WS_S2C_BINARY ||
  frame.type == FrameType.WS_S2C_TEXT ||
  frame.type === FrameType.WS_C2S_BINARY ||
  frame.type == FrameType.WS_C2S_TEXT;

export class StatsPlayer extends Player {
  private gameInfos = new Map<number, GameInfo>();
  private stats = new Map<number, Map<string, MessageStat>>();

  async tick(frame: RecorderFrame) {
    if (!isMessage(frame)) return;

    const cid = 0; // frame.cid;

    const msg = Envelope.fromBinary(frame.payload);

    const actionType = msg.kind.case;
    const actionName = msg.kind.value?.action.case;
    if (!actionType) return;

    // if (actionType === 'lobbyAction' && actionName === 'sRoomDeleted') {
    //   this.printStats(cid, this.gameInfos.get(cid), this.stats.get(cid));
    //   this.gameInfos.delete(cid);
    //   this.stats.delete(cid);
    //   return;
    // }

    // if (actionType !== 'gameAction' || !actionName?.startsWith('s')) return;

    const gameInfo = this.gameInfos.get(cid) ?? { start: 0, end: 0 };
    this.gameInfos.set(cid, gameInfo);

    const ts_ms = frame.ts_ms;

    if (gameInfo.start === 0) gameInfo.start = ts_ms;

    const gameStats = this.stats.get(cid) ?? new Map<string, MessageStat>();

    // if (gameInfo.end > 0 && frame.ts_ms - gameInfo.end > 60_000) {
    //   // while a game is active, we expect movement updates every 500ms or so,
    //   // so if we have a long gap in messages we can guess that it's a new game
    //   // print the previous stats then reset
    //   this.printStats(cid, gameInfo, gameStats);

    //   gameInfo.start = frame.ts_ms;
    //   this.stats.set(cid, new Map());
    // }
    gameInfo.end = ts_ms;

    const _actionName = actionName ? actionName.slice(1) + ':' + actionName.slice(0, 1) : '<undefined>';
    const key = `${_actionName}:${actionType.padEnd(11)}`;
    const messageStats: MessageStat = gameStats.get(key) ?? {
      count: new WindowedStats(WINDOW_SIZE_MS, 1000),
      bytes: new WindowedStats(WINDOW_SIZE_MS, 1000),
    };
    messageStats.count.push(ts_ms, 1);
    messageStats.bytes.push(ts_ms, frame.payload.length);
    gameStats.set(key, messageStats);
    this.stats.set(cid, gameStats);
  }

  async done() {
    for (const [cid, stats] of this.stats.entries()) {
      this.printStats(cid, this.gameInfos.get(cid), stats);
    }
  }

  printStats(cid: number, gameInfo: GameInfo | undefined, stats: Map<string, MessageStat> | undefined) {
    if (!gameInfo || !stats) return;
    const { start, end } = gameInfo;

    if (start === 0 || end === 0) return;

    const duration_s = (end - start) / 1000;
    if (duration_s === 0) return;

    // filter out chat-only groups
    if (stats.size === 1 && stats.has('sChat')) return;

    const rows: [type: string, count: string, rate: string, bytes: string, byteRate: string][] = [];

    for (const [type, { count, bytes }] of stats.entries()) {
      rows.push([
        type,
        formatMsg(count.total(), 1, ' msg'),
        formatMsg(count.peakRate(), 3, ' msg/s'),
        formatBytesSI(bytes.total(), 3),
        (bytes.maxSamples() <= 1 ? '<= ' : '') + formatBytesSI(bytes.peakRate(), 3, '/s'),
      ]);
    }

    rows.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    table(
      `Session lasting ${((end - start) / 1000 / 60).toFixed(1)} minutes; window size=${minutes(WINDOW_SIZE_MS)}`,
      // `Game host=${cid} lasting ${((end - start) / 1000 / 60).toFixed(1)} minutes`,
      rows
    );
  }
}

// PROGRESS=1 node --nolazy -r ts-node/register/transpile-only nt-web-app/recorder/stats_player.ts <path-to-file>
if (require.main === module) {
  if (process.argv.length < 3) {
    const relpath = PATH.relative(__dirname, process.argv[1]);
    console.error(`Usage: npx ts-node ${relpath} <session file>`);
    process.exit(1);
  }
  const filepath = PATH.resolve(process.argv[2]);
  const player = new StatsPlayer(PATH.dirname(filepath));
  player.play(PATH.basename(filepath));
}
