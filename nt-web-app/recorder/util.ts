export enum FrameType {
  WS_OPEN,
  WS_CLOSE,
  WS_C2S_BINARY,
  WS_C2S_TEXT,
  WS_S2C_BINARY,
  WS_S2C_TEXT,
}

export const isMemberOf =
  <T extends {}>(e: T) =>
  (token: unknown): token is T[keyof T] =>
    Object.values(e).includes(token as T[keyof T]);

export const isFrameType = isMemberOf(FrameType);
export const isFrame = <T extends FrameType, RF extends RecorderFrame<T>>(
  type: T,
  v: RecorderFrame<FrameType>
): v is RF => isFrameType(type) && v.type === type;

export type RecorderFrame<T extends FrameType = FrameType> = {
  type: T;
  connection_id: number;
  timestamp_ms: number;
  payload: T extends FrameType.WS_OPEN ? string : T extends FrameType.WS_CLOSE ? number : Buffer;
};

export interface IRecorderPlayer {
  tick(_frame: RecorderFrame<FrameType>): Promise<void>;
  destroy(): Promise<void>;
}
