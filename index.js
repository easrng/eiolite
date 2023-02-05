const eio_open = "0"; // Used during the handshake.
const eio_close = "1"; // Used to indicate that a transport can be closed.
const eio_ping = "2"; // Used in the heartbeat mechanism.
const eio_pong = "3"; // Used in the heartbeat mechanism.
const eio_message = "4"; // Used to send a payload to the other side.
const eio_upgrade = "5"; // Used during the upgrade process.
const eio_noop = "6"; // Used during the upgrade process.
const internalWebsocket = Symbol();
const internalTimeout = Symbol();
const internalTimeoutHandle = Symbol();
export default class extends EventTarget {
  constructor(url = "/engine.io/", sid) {
    super();
    const setROProp = (prop, value, hidden) =>
      Object.defineProperty(this, prop, {
        value,
        configurable: true,
        enumerable: !hidden,
      });
    const u = new URL(url, location.href);
    u.hash = u.search = "";
    u.protocol = u.protocol.replace(/^http/, "ws");
    setROProp("url", u.href);
    const ws = new WebSocket(
      u + "?EIO=4&transport=websocket" + (sid ? "&sid=" + sid : "")
    );
    setROProp(internalWebsocket, ws, true);
    setROProp("readyState", 0);
    ws.binaryType = "arraybuffer";
    const newMessage = (d) => {
      const m = new MessageEvent("message", { data: d });
      this.dispatchEvent(m);
    };
    const heartbeat = () => {
      if (this[internalTimeoutHandle])
        clearTimeout(this[internalTimeoutHandle]);
      setROProp(
        internalTimeoutHandle,
        setTimeout(() => ws.close(), this[internalTimeout]),
        true
      );
    };
    const event = (e) => this.dispatchEvent(new Event(e));
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        let info,
          sliced = e.data.slice(1);
        switch (e.data[0]) {
          case eio_open:
            info = JSON.parse(sliced);
            setROProp(
              internalTimeout,
              info.pingInterval + info.pingTimeout,
              true
            );
            setROProp("sid", info.sid);
            setROProp("readyState", 1), event("open");
            heartbeat();
            break;
          case eio_ping:
            ws.send(eio_pong);
            heartbeat();
            break;
          case eio_message:
            newMessage(sliced);
            break;
        }
      } else {
        newMessage(e.data);
      }
    });
    ws.addEventListener(
      "close",
      () => (setROProp("readyState", 3), event("close"))
    );
    if (sid) ws.addEventListener("open", () => ws.send("2probe"));
  }
  close() {
    this[internalWebsocket].close();
  }
  send(data) {
    if (typeof data === "string") {
      this[internalWebsocket].send(eio_message + data);
    } else {
      this[internalWebsocket].send(data);
    }
  }
}
