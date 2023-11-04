import PATH from 'node:path';

import { Envelope } from '../websocket/gen/messages_pb';

import { Player } from './player';
import { FrameType, RecorderFrame, StringPayloadTypes } from './frame';

const SECRET_ACCESS = process.env.SECRET_JWT_ACCESS;

export class ConsolePlayer extends Player {
  async tick(frame: RecorderFrame) {
    let msg: any;
    let name: string | undefined = undefined;
    let s2c: string | undefined = undefined;
    switch (frame.type) {
      case FrameType.IGNORE:
        return;
      case FrameType.ERROR:
        console.log(`[error frame]: ${frame.error}`);
        return;
      case FrameType.WS_OPEN:
        name = this.jwtUsername(frame);
        this.usernames.set(frame.cid, name);
        msg = 'connected';
        break;
      case FrameType.WS_FAILED:
        msg = `upgrade failed: reason=${frame.payload}`;
        break;
      case FrameType.WS_UPGRADED:
        msg = `upgrade succeeded: uaccess=${frame.payload}`;
        break;
      case FrameType.WS_C_CLOSE:
        msg = `client closed: payload=${frame.payload}`;
        break;
      case FrameType.WS_S_CLOSE:
        msg = `server closed: payload=${frame.payload}`;
        break;
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_C2S_TEXT:
        s2c = s2c ?? 's <- c';
      case FrameType.WS_S2C_BINARY:
      case FrameType.WS_S2C_TEXT:
        s2c = s2c ?? 's -> c';
        try {
          const decoded = Envelope.fromBinary(frame.payload);
          msg = `${s2c} ${decoded.kind.case}=${decoded.kind.value?.action.case ?? 'unknown'}`;
        } catch (e) {
          msg = `decode failure: ${frame.payload.toString('hex')}: ${e instanceof Error ? e.message : String(e)}`;
        }
        break;
    }

    name = name ?? this.usernames.get(frame.cid) ?? '';

    const namePrefix = name !== '' ? ` ${name} :` : '';
    const conn_id = frame.cid.toString().padEnd(3);
    const time_since = (this.waitTime(frame.ts_ms) / 1000).toString().padEnd(10);
    const frame_type = FrameType[frame.type].padEnd(14);

    console.log(`[${frame_type}: ${conn_id} @ +${time_since}]${namePrefix}`, msg);
  }

  async done() {
    if (!SECRET_ACCESS)
      console.error('Userdata decoding was not performed because SECRET_ACCESS env variable was unset');
  }
}

//node --nolazy -r ts-node/register/transpile-only nt-web-app/recorder/websocket_player.ts <path-to-file>
if (require.main === module) {
  if (process.argv.length < 2) {
    const relpath = PATH.relative(__dirname, process.argv[1]);
    console.error(`Usage: npx ts-node ${relpath} <session file>`);
    process.exit(1);
  }
  const filepath = PATH.resolve(process.argv[2]);
  const player = new ConsolePlayer(PATH.dirname(filepath));
  player.play(PATH.basename(filepath));
}
