import PATH from 'node:path';

import WebSocket from 'ws';
import * as jwt from 'jsonwebtoken';
import Deque from 'double-ended-queue';

import { ClientJoinRoom, Envelope, GameAction, LobbyAction, ServerRoomCreated } from '../websocket/gen/messages_pb';

import { BufferPayloadTypes, FrameType, NumberPayloadTypes, RecorderFrame, readFrom } from './frame';
import { Player } from './player';
import { EMPTY_BUFFER, ProtoHax } from './protohax';
import assert from 'node:assert';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const DEBUGGING = !!process.env.DEBUG;

const dotenv = require('dotenv');
dotenv.config();

const SECRET_ACCESS = process.env.SECRET_JWT_ACCESS as string;

type expectation = {
  buffer: Buffer;
  isBinary: boolean;
};

let countdown = -1;

const lobbyAction = Envelope.fields.findJsonName('lobbyAction')!.no;
assert.ok(lobbyAction);

const sRoomCreated = LobbyAction.fields.findJsonName('sRoomCreated')!.no;
assert.ok(sRoomCreated);

const sRoomCreatedId = ServerRoomCreated.fields.findJsonName('id')!.no;
assert.ok(sRoomCreatedId);

const cJoinRoom = LobbyAction.fields.findJsonName('cJoinRoom')!.no;
assert.ok(cJoinRoom);

const cJoinRoomId = ClientJoinRoom.fields.findJsonName('id')!.no;
assert.ok(cJoinRoomId);

// const actions: Record<number, string> = Object.fromEntries(
//   Envelope.fields
//     .list()
//     .filter(fi => fi.oneof?.localName === 'kind')
//     .map(fi => [fi.no, fi.jsonName])
// );

// const lobbyActions: Record<number, string> = Object.fromEntries(
//   LobbyAction.fields
//     .list()
//     .filter(fi => fi.oneof?.localName === 'action')
//     .map(fi => [fi.no, fi.jsonName])
// );
// const gameActions: Record<number, string> = Object.fromEntries(
//   GameAction.fields
//     .list()
//     .filter(fi => fi.oneof?.localName === 'action')
//     .map(fi => [fi.no, fi.jsonName])
// );

const { addRoom, mungeUUID } = (() => {
  const rooms = new Map<string, Buffer>();
  // const hdr = Buffer.from('92032862260a24', 'hex');

  // const iscJoinRoom = (buf: Buffer) => buf.subarray(0, hdr.length).equals(hdr);
  // const getUUID = (buf: Buffer) => buf.subarray(hdr.length).toString('utf-8');
  // const putUUID = (buf: Buffer, uuid: Buffer) => uuid.copy(buf, hdr.length);

  return {
    addRoom: (recordedUUID: string, nowUUID: Buffer) => {
      rooms.set(recordedUUID, nowUUID);
    },
    mungeUUID: (buf: Buffer) => {
      var roomIdBuf = new ProtoHax(buf).with(lobbyAction).with(cJoinRoom).with(cJoinRoomId).Bytes();

      if (roomIdBuf === EMPTY_BUFFER) return;

      var recordedUUID = roomIdBuf.toString('utf-8');
      var nowUUID = rooms.get(recordedUUID);
      if (nowUUID) nowUUID.copy(roomIdBuf);
    },
  };
})();

class Client {
  // private expectations = new Deque<expectation>();
  private expectRooms = new Deque<string>();
  private expectCount: number = 0;

  private constructor(
    readonly cid: number,
    private socket: WebSocket,
    private recvCallback: () => void,
    closeCallback: (pendingExpectations: number) => void
  ) {
    socket.on('message', data => this.onMessage(data as Buffer, typeof data !== 'string'));
    socket.on('close', () => closeCallback(this.expectCount) /*closeCallback(this.expectations.length*/);
  }

  private static devnum = 0;
  static create(
    cid: number,
    url: string,
    uaccess: number,
    recvCallback: () => void,
    closeCallback: (pendingExpectations: number) => void
  ): Promise<Client> {
    const token = jwt.sign(
      {
        preferred_username: uaccess > 0 ? `Dev${++this.devnum}` : `User${cid}`,
        sub: String(cid),
        profile_image_url: '',
        provider: 'twitch',
      },
      SECRET_ACCESS,
      {
        expiresIn: '8h',
      }
    );

    const tokenUrl = url.endsWith('/') ? `${url}${token}` : `${url}/${token}`;
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(tokenUrl);
      socket.once('error', reject);
      socket.once('close', reject);
      socket.once('open', () => {
        resolve(new Client(cid, socket, recvCallback, closeCallback));
      });
    });
  }

  send(buf: Buffer, isBinary: boolean) {
    // for cJoinRoom requests, the body of the request will be asking to join
    // the uuid of a room that doesn't exist (because we created it with a random
    // uuid and now it's different). to solve this, we track successful room
    // creation requests and map the uuid we recorded in the past to the uuid
    // we received from the lobby server. then, when sending messages, we
    // overwrite the uuid that was recorded with its equivalent
    mungeUUID(buf);

    this.socket.send(buf, { binary: isBinary }, err => {
      if (err) console.error(`Client ${this.cid} send error: ${err.message}`);
    });
  }

  async end(): Promise<void> {
    return new Promise(resolve => {
      this.socket.once('close', resolve);
      this.socket.close();
    });
  }

  // TODO: stop decoding, just pick out the room messages and store the uuid where
  // applicable
  expect(buf: Buffer, isBinary: boolean) {
    const expectedRoomId: string = new ProtoHax(buf).with(lobbyAction).with(sRoomCreated).with(sRoomCreatedId).String();

    if (expectedRoomId) this.expectRooms.push(expectedRoomId);

    // const envelope = Envelope.fromBinary(buf);
    // this.expectations.push({ buffer: buf, isBinary });
    this.expectCount++;
  }

  onMessage(data: Buffer, actualIsBinary: boolean) {
    const actualRoomId: Buffer = new ProtoHax(data).with(lobbyAction).with(sRoomCreated).with(sRoomCreatedId).Bytes();

    if (actualRoomId) {
      const expectedRoomId = this.expectRooms.shift();
      if (expectedRoomId) {
        addRoom(expectedRoomId, actualRoomId);
      }
    }
    // const actual = Envelope.fromBinary(data);
    // const actualActionType = actual.kind.case;
    // const actualAction = actual.kind.value?.action.case;

    // if (DEBUGGING) console.log(`< ${this.cid} type=${actualActionType} action=${actualAction}`);

    // const expected = this.expectations.shift();
    this.expectCount--;
    this.recvCallback();

    // if (!expected) {
    //   // console.error(`Client ${this.cid}: received message, but was not expecting any`, {
    //   //   type: actualActionType,
    //   //   action: actualAction,
    //   // });
    //   return;
    // } else {
    //   // if (DEBUGGING) {
    //   //   console.error(`Client ${this.cid}: type=${actualActionType} action=${actualAction} 👍`, {
    //   //     payload: actual.kind.value?.action.value,
    //   //   });
    //   // }
    // }

    // // const expectedRoomId: string = new ProtoHax(expected.buffer)
    // //   .with(lobbyAction)
    // //   .with(sRoomCreated)
    // //   .with(sRoomCreatedId)
    // //   .String();

    // if (actualRoomId.length > 0 && expectedRoomId.length > 0) {
    //   addRoom(expectedRoomId, actualRoomId);
    // }
    // // const { envelope, isBinary: expectedIsBinary } = expected;
    // // const expectedActionType = envelope.kind?.case;
    // // const expectedAction = envelope.kind.value?.action.case;

    // // if (actualAction === 'sRoomCreated' && expectedAction === 'sRoomCreated') {
    // //   const actualId = actual.kind.value!.action.value.id;
    // //   const expectedId = envelope.kind.value!.action.value.id;
    // //   if (actualId && expectedId) {
    // //     addRoom(expectedId, actualId);
    // //   }
    // // }

    // // if (
    // //   actualActionType !== expectedActionType ||
    // //   actualAction !== expectedAction ||
    // //   actualIsBinary !== expectedIsBinary
    // // ) {
    // //   console.error(`Client ${this.cid}: received message, but doesn't match expected message`, {
    // //     expected: {
    // //       type: expectedActionType,
    // //       action: expectedAction,
    // //       isBinary: expectedIsBinary,
    // //       ...(DEBUGGING ? { payload: expected.envelope.kind.value?.action.value } : {}),
    // //     },
    // //     actual: {
    // //       type: actualActionType,
    // //       action: actualAction,
    // //       isBinary: actualIsBinary,
    // //       ...(DEBUGGING ? { payload: actual.kind.value?.action.value } : {}),
    // //     },
    // //   });
    // //   // countdown = 3;
    // //   return;
    // // }
  }
}

export class WebsocketPlayer extends Player {
  private clients = new Map<number, Client>();
  private waitClose = new WeakSet<Client>();

  private pendingFrame: Extract<RecorderFrame, { type: BufferPayloadTypes | NumberPayloadTypes }> | null = null;
  private c2sWait: Promise<void> = Promise.resolve();
  private c2sResolve: () => void = () => {};
  private numExpected = 0;

  // private expected = new Deque<Extract<RecorderFrame, { type: BufferPayloadTypes }>>();

  constructor(
    replayDir: string,
    private lobbyServerUrl: string
  ) {
    super(replayDir);
  }

  private onReceived() {
    this.numExpected--;
    if (this.numExpected === 0) this.c2sResolve();
    // this.expected.shift();
    // if (this.expected.length === 0) this.c2sResolve();
  }

  private async openSocket({ cid, payload: uaccess }: Extract<RecorderFrame, { type: NumberPayloadTypes }>) {
    const client = await Client.create(
      cid,
      this.lobbyServerUrl,
      uaccess,
      () => this.onReceived(),
      (pendingExpectations: number) => this.onClientClosed(client, pendingExpectations)
    );
    this.clients.set(cid, client);
  }

  private closeSocket({ cid, payload }: Extract<RecorderFrame, { type: NumberPayloadTypes }>) {
    const client = this.clients.get(cid);
    if (!client) return;

    this.waitClose.add(client);
    this.clients.delete(cid);
    return client.end(/*payload*/);
  }

  private sendData(frame: Extract<RecorderFrame, { type: BufferPayloadTypes }>) {
    const client = this.clients.get(frame.cid);
    if (!client) {
      // console.error(`Failed to send data from nonexistent client ${frame.cid}`);
      return;
    }

    client.send(frame.payload, true); //frame.type === FrameType.WS_C2S_BINARY);
  }

  private expectData(frame: Extract<RecorderFrame, { type: BufferPayloadTypes }>) {
    const client = this.clients.get(frame.cid);
    if (!client) {
      // console.error(`Failed to expect data for nonexistent client ${frame.cid}`);
      return;
    }

    // count how many messages we are waiting to receive
    this.numExpected++;
    // this.expected.push(frame);
    client.expect(frame.payload, frame.type === FrameType.WS_S2C_BINARY);
  }

  private onClientClosed(client: Client, pendingExpectations: number) {
    if (pendingExpectations > 0) {
      // console.log('?');
      // process.exit(1);
      this.numExpected -= pendingExpectations;
    }

    if (!this.waitClose.has(client)) {
      // console.error(`Client ${client.cid} closed unexpectedly with ${pendingExpectations} pending expectations`);
    }
    this.clients.delete(client.cid);
  }

  private logFrameTick(frame: RecorderFrame) {
    switch (frame.type) {
      case FrameType.IGNORE:
      case FrameType.ERROR:
      case FrameType.WS_OPEN:
      case FrameType.WS_FAILED:
        return;
    }

    let isBinary: boolean | undefined = undefined;
    let msg = '';
    let payload: any = undefined;
    switch (frame.type) {
      case FrameType.WS_UPGRADED:
      case FrameType.WS_C_CLOSE:
      case FrameType.WS_S_CLOSE:
        break;
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_S2C_BINARY:
        isBinary = true;
      case FrameType.WS_C2S_TEXT:
      case FrameType.WS_S2C_TEXT:
        isBinary = isBinary ?? false;
        const env = Envelope.fromBinary(frame.payload);
        const actionType = env.kind.case;
        const action = env.kind.value?.action.case;
        msg = ` type=${actionType} action=${action}`;
      //payload = env.kind.value?.action.value;
    }
    // if (DEBUGGING) console.log(`> ${frame.cid} ${FrameType[frame.type]}${msg}` /*, payload*/);
  }

  private async waitForExpectations() {
    if (!this.pendingFrame) return;
    switch (this.pendingFrame.type) {
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_C2S_TEXT:
        this.sendData(this.pendingFrame);
        break;
      case FrameType.WS_C_CLOSE:
      case FrameType.WS_S_CLOSE:
        await this.closeSocket(this.pendingFrame);
        break;
    }

    // wait for all our sockets to receive their messages,
    // but only if we have messages to wait for
    if (this.numExpected > 0) await this.c2sWait;
    // if (this.expected.length > 0) await this.c2sWait;

    this.c2sResolve();
  }

  private deferFrame(frame: Extract<RecorderFrame, { type: BufferPayloadTypes | NumberPayloadTypes }>) {
    // store this c2s message and continue
    // if (this.expected.length) {
    if (this.numExpected > 0) {
      // const pending = this.expected
      //   .toArray()
      //   .map(frame => ({ ...frame, envelope: Envelope.fromBinary(frame.payload) }));
      // console.log('woops?');
      // process.exit(1);
    }
    this.numExpected = 0;
    this.pendingFrame = frame;
    this.c2sWait = new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        // const pending = this.expected.toArray().map(frame => ({
        //   ...frame,
        //   env: Envelope.fromBinary(frame.payload),
        // }));

        console.error(`WebsocketPlayer: gave up waiting to receive ${this.numExpected} messages`);
        // process.exit(1);
        resolve();
      }, 1000);
      this.c2sResolve = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }
  async tick(frame: RecorderFrame) {
    if (countdown > -1) {
      if (--countdown === 0) process.exit(1);
    }
    switch (frame.type) {
      case FrameType.IGNORE:
      case FrameType.ERROR:
      case FrameType.WS_OPEN:
      case FrameType.WS_FAILED:
        return;
    }

    // this.logFrameTick(frame);

    switch (frame.type) {
      case FrameType.WS_UPGRADED:
        // client made it through handshaking and is actually connected,
        // will start receiving and sending messages after this
        await this.openSocket(frame);
        // no messages are generated - return and don't wait for the next time
        return;
      case FrameType.WS_C_CLOSE:
      case FrameType.WS_S_CLOSE:
        // we don't care who closed or why, we'll just clean up
        await this.waitForExpectations();
        this.deferFrame(frame);
        return;
      case FrameType.WS_C2S_BINARY:
      case FrameType.WS_C2S_TEXT:
        await this.waitForExpectations();
        this.deferFrame(frame);
        return;
      case FrameType.WS_S2C_BINARY:
      case FrameType.WS_S2C_TEXT:
        // client received data from server (in the recording)
        this.expectData(frame);
        return;
    }
  }

  async done() {
    await this.waitForExpectations();

    await Promise.all([...this.clients.values()].map(c => c.end()));
    console.log('done');
  }
}

function play(player: WebsocketPlayer, stream: Readable) {
  let buf: Buffer = Buffer.of();

  let reading = false;

  const read = async () => {
    if (reading === true) return;
    const chunk = stream.read();
    if (chunk === null) {
      reading = false;
      return;
    }

    buf = Buffer.concat([buf, chunk]);
    reading = true;

    while (buf.length >= 4) {
      const frame = readFrom(buf);
      buf = buf.subarray(frame.size);
      if (frame.type === FrameType.IGNORE || frame.type === FrameType.ERROR) break;
      await player.tick(frame);
    }
    reading = false;
    process.nextTick(read);
  };
  stream.on('readable', read);
  read();
}

//node --nolazy -r ts-node/register/transpile-only nt-web-app/recorder/websocket_player.ts <lobby server url> <path-to-file>
if (require.main === module) {
  if (process.argv.length < 3) {
    const relpath = PATH.relative(__dirname, process.argv[1]);
    console.error(`Usage: npx ts-node ${relpath} <lobby server url> <session file>`);
    process.exit(1);
  }
  const lobbyServerUrl = process.argv[2];
  const filepath = PATH.resolve(process.argv[3]);
  const player = new WebsocketPlayer(PATH.dirname(filepath), lobbyServerUrl);

  // play(player, createReadStream(filepath, { highWaterMark: 8 * 1024 * 1024 }));

  player.play(PATH.basename(filepath));
}
