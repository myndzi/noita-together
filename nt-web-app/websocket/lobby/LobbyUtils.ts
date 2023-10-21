import type ws from 'ws';

const Sender: any = require('ws/lib/sender');

type BufferLike = Parameters<ws.WebSocket['send']>[0];

function noop() {}

/**
 * Create a WebSocket frame from the given data
 */
function MakeFrame(data: BufferLike): Buffer[] {
  let readOnly = true;
  let buf = null;
  if (data instanceof ArrayBuffer) {
    buf = Buffer.from(data);
  } else if (ArrayBuffer.isView(data)) {
    buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  } else {
    buf = Buffer.from(data as any);
    readOnly = false;
  }

  // opcode 2 = binary
  // see https://www.rfc-editor.org/rfc/rfc6455.html#page-65
  const frame = Sender.frame(buf, {
    readOnly,
    mask: false,
    rsv1: false,
    opcode: 2,
    fin: true,
  });
  return frame;
}

export { noop, MakeFrame };
