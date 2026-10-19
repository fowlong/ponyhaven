import dgram from 'node:dgram';

/** WebRTC carries packets in the renderer; this narrowly scoped bridge only
 * talks to the engine on loopback. It cannot be used as a general UDP proxy. */
export class LocalRelay {
  sockets = new Map();
  constructor(onPacket) { this.onPacket = onPacket; }
  async open({ role, id, port }) {
    if (!['host','guest'].includes(role) || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
        (role === 'host' && (!Number.isInteger(port) || port < 1024 || port > 65535)))
      throw new Error('Invalid game connection.');
    if (this.sockets.size >= 8 && !this.sockets.has(id)) throw new Error('The party is full.');
    this.close(id);
    const socket = dgram.createSocket('udp4');
    const entry = { socket, remote: role === 'host' ? port : null, count: 0, second: 0 };
    this.sockets.set(id, entry);
    socket.on('message', (packet, info) => {
      if (info.address !== '127.0.0.1' || packet.length > 8192) return;
      if (entry.remote === null) entry.remote = info.port;
      if (info.port !== entry.remote) return;
      this.onPacket({ id, bytes: [...packet] });
    });
    socket.on('error', () => this.close(id));
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.bind(0, '127.0.0.1', resolve);
    });
    return socket.address().port;
  }
  send(id, bytes) {
    const entry = this.sockets.get(id);
    if (!entry || !Array.isArray(bytes) || !bytes.length || bytes.length > 8192 ||
        bytes.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return;
    const second = Math.floor(Date.now() / 1000);
    if (entry.second !== second) { entry.second = second; entry.count = 0; }
    if (++entry.count > 600 || !entry.remote) return;
    entry.socket.send(Buffer.from(bytes), entry.remote, '127.0.0.1');
  }
  close(id) {
    if (id === undefined) { for (const key of this.sockets.keys()) this.close(key); return; }
    const entry = this.sockets.get(id);
    this.sockets.delete(id);
    if (entry) { try { entry.socket.close(); } catch {} }
  }
}
