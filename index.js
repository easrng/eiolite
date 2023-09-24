const readyState_CONNECTING = 0;
const readyState_OPEN = 1;
const readyState_CLOSING = 2;
const readyState_CLOSED = 3;

const eio_open = "0"; // Used during the handshake.
const eio_close = "1"; // Used to indicate that a transport can be closed.
const eio_ping = "2"; // Used in the heartbeat mechanism.
const eio_pong = "3"; // Used in the heartbeat mechanism.
const eio_message = "4"; // Used to send a payload to the other side.
const eio_upgrade = "5"; // Used during the upgrade process.
const eio_noop = "6"; // Used during the upgrade process.
const internals = new WeakMap();
const internal = (obj) => {
  const ret = internals.get(obj) || {};
  internals.set(obj, ret);
  return ret;
};
const event = (obj, e) => obj.dispatchEvent(new Event(e));
const newMessage = (obj, d) =>
  obj.dispatchEvent(new MessageEvent("message", { data: d }));
class eiolite extends EventTarget {
  constructor(url = "/engine.io/") {
    super();
    const u = new URL(url, location.href);
    u.hash = u.search = "";
    u.protocol = u.protocol.replace(/^http/, "ws");
    internal(this).url = u.href;
    const ws = new WebSocket(u + "?EIO=4&transport=websocket");
    internal(this).webSocket = ws;
    internal(this).readyState = readyState_CONNECTING;
    ws.binaryType = "arraybuffer";
    let timeout;
    let timeoutHandle;
    const heartbeat = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      timeoutHandle = setTimeout(() => ws.close(), timeout);
    };
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        let info,
          sliced = e.data.slice(1);
        switch (e.data[0]) {
          case eio_open:
            info = JSON.parse(sliced);
            timeout = info.pingInterval + info.pingTimeout;
            internal(this).readyState = readyState_OPEN;
            event(this, "open");
            heartbeat();
            break;
          case eio_ping:
            ws.send(eio_pong);
            heartbeat();
            break;
          case eio_message:
            newMessage(this, sliced);
            break;
        }
      } else {
        newMessage(this, e.data);
      }
    });
    ws.addEventListener("close", () => {
      internal(this).readyState = readyState_CLOSED;
      event(this, "close");
    });
  }
  close() {
    internal(this).webSocket.close();
  }
  send(data) {
    if (typeof data === "string") {
      internal(this).webSocket.send(eio_message + data);
    } else {
      internal(this).webSocket.send(data);
    }
  }
  get url() {
    return internal(this).url;
  }
  get readyState() {
    return internal(this).readyState;
  }
}
export default eiolite;
export class reconnecting extends EventTarget {
  constructor(url = "/engine.io/") {
    super();
    let eio;
    internal(this).url = url;
    const queue = [];
    const send = (packet) => {
      if (internal(this).readyState === readyState_CONNECTING) {
        queue.push(packet);
      } else {
        eio.send(packet);
      }
    };
    internal(this).send = send;
    internal(this).readyState = readyState_CONNECTING;
    let retryDelay = 100;
    const maxRetryDelay = 30000;
    const retryFactor = 2;
    const jitterFactor = 0.2;
    const connect = () => {
      eio = new eiolite(url);
      internal(this).close = () => eio.close();
      eio.addEventListener("message", (e) => {
        newMessage(this, e.data);
      });
      eio.addEventListener("open", () => {
        internal(this).readyState = readyState_OPEN;
        let message;
        while ((message = queue.pop())) {
          send(message);
        }
        event(this, "open");
      });
      eio.addEventListener("close", () => {
        if (internal(this).readyState < readyState_CLOSING) {
          scheduleRetry();
        } else {
          internal(this).readyState = readyState_CLOSED;
          event(this, "close");
        }
      });
    };
    const scheduleRetry = () => {
      internal(this).readyState = readyState_CONNECTING;
      retryDelay = Math.min(retryDelay * retryFactor, maxRetryDelay);
      const retryTimeout = setTimeout(
        connect,
        retryDelay + (Math.random() * 2 - 1) * jitterFactor * retryDelay,
      );
      internal(this).close = () => {
        clearTimeout(retryTimeout);
        internal(this).readyState = readyState_CLOSED;
        event(this, "close");
      };
      event(this, "reconnecting");
    };
    connect();
  }
  close() {
    internal(this).readyState = readyState_CLOSING;
    internal(this).close();
  }
  get url() {
    return internal(this).url;
  }
  get send() {
    return internal(this).send;
  }
  get readyState() {
    return internal(this).readyState;
  }
}
