import { Envelope, GameAction, LobbyAction } from '../websocket/gen/messages_pb';

const actions: Record<number, string> = Object.fromEntries(
  Envelope.fields
    .list()
    .filter(fi => fi.oneof?.localName === 'kind')
    .map(fi => [fi.no, fi.jsonName])
);
const lobbyActions: Record<number, string> = Object.fromEntries(
  LobbyAction.fields
    .list()
    .filter(fi => fi.oneof?.localName === 'action')
    .map(fi => [fi.no, fi.jsonName])
);
const gameActions: Record<number, string> = Object.fromEntries(
  GameAction.fields
    .list()
    .filter(fi => fi.oneof?.localName === 'action')
    .map(fi => [fi.no, fi.jsonName])
);

console.log(actions, lobbyActions, gameActions);
