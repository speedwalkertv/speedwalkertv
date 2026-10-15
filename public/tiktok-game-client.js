/** Cliente ESM reutilizavel em Phaser, Three.js, Godot Web (via JS bridge) ou HTML. */
export class TikTokGameClient {
  constructor({ url, onEvent = () => {}, onStatus = () => {} } = {}) {
    this.url = url || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.socket = null;
    this.closed = false;
    this.retry = null;
    this.heartbeat = null;
    this.state = null;
  }

  connect() {
    this.closed = false;
    clearTimeout(this.retry);
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) return;
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      clearInterval(this.heartbeat);
      this.heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) socket.send('{"kind":"heartbeat"}');
      }, 60_000);
    };
    socket.onmessage = ({ data }) => {
      let packet;
      try { packet = JSON.parse(data); } catch { return; }
      if (packet.kind === 'event') this.onEvent(packet.event);
      if (packet.kind === 'status') {
        this.state = packet;
        this.onStatus(packet);
      }
    };
    socket.onclose = () => {
      clearInterval(this.heartbeat);
      if (this.closed || this.socket !== socket) return;
      this.onStatus({ kind: 'status', state: 'disconnected', mode: this.state?.mode, message: 'Ponte local desconectada' });
      this.retry = setTimeout(() => this.connect(), 2000);
    };
    socket.onerror = () => {}; // onclose cuida da reconexao
  }

  sendDemo(type, options = {}) {
    if (this.state?.mode !== 'demo' || this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ kind: 'simulate', type, ...options }));
    return true;
  }

  close() {
    this.closed = true;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.socket?.close();
    this.socket = null;
  }
}
