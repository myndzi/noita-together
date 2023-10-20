import PATH from 'node:path';
import { verifyToken } from '../utils/jwtUtils';
import { Envelope } from '../websocket/gen/messages_pb';
import { FrameType, RecorderFrame } from './util';
import { Player } from './player';

const SECRET_ACCESS = process.env.SECRET_JWT_ACCESS;

export class ConsolePlayer extends Player {
  private lastTimestamp = 0;
  private usernames = new Map<number, string>();

  private async jwtUsername(frame: RecorderFrame<FrameType.WS_OPEN>): Promise<string> {
    if (!SECRET_ACCESS) return '';
    const url = frame.payload.substring(1);
    const token = decodeURIComponent(PATH.basename(url));
    try {
      return verifyToken(token, SECRET_ACCESS).preferred_username;
    } catch (e) {
      return '';
    }
  }

  private waitTime(timestamp: number) {
    const diff = timestamp-this.lastTimestamp;
    this.lastTimestamp = timestamp;
    return diff;
  }

  async tick(_frame: RecorderFrame<FrameType>) {
    const frame = _frame.type === FrameType.WS_OPEN ? _frame as RecorderFrame<FrameType.WS_OPEN> : _frame.type === FrameType.WS_CLOSE ? _frame as RecorderFrame<FrameType.WS_CLOSE> :
    _frame as RecorderFrame<FrameType.WS_C2S_BINARY|FrameType.WS_C2S_TEXT|FrameType.WS_S2C_BINARY|FrameType.WS_S2C_TEXT>;

    let msg: any;
    let name: string|undefined = undefined;
    switch (frame.type) {
      case FrameType.WS_OPEN:
        name = await this.jwtUsername(frame);
        this.usernames.set(frame.connection_id, name);
        msg = 'connected';
        break;
      case FrameType.WS_CLOSE:
        msg = `closed: ${frame.payload}`;
        break;
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_C2S_TEXT:
      case FrameType.WS_S2C_BINARY:
      case FrameType.WS_S2C_TEXT:
        try {
          const decoded = Envelope.fromBinary(frame.payload);
          msg = `${decoded.kind.case}=${decoded.kind.value?.action.case ?? 'unknown'}`;
        } catch (e) {
          msg = `decode failure: ${e instanceof Error ? e.message : String(e)}: ${frame.payload.toString('hex')}`;
        }
        break;
    }

    name = name ?? this.usernames.get(frame.connection_id) ?? '';

    const namePrefix = name !== '' ? `: ${name}` : '';
    const conn_id = (frame.connection_id.toString().padEnd(3));
    const time_since = (this.waitTime(frame.timestamp_ms)/1000).toString().padEnd(8);

    console.log(`[${conn_id} +${time_since}] : ${FrameType[frame.type]}${namePrefix} :`, msg);
  }

  done() {
    if (!SECRET_ACCESS) console.error('Userdata decoding was not performed because SECRET_ACCESS env variable was unset');
  }
}
