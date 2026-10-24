// Newline-framed messages from the child's inherited pipe, never from a file.
const prefix = 'PONYHAVEN_PROGRESS ';
export class NativeProgress {
  buffer = '';
  discarding = false;
  previous = '';
  constructor(session, receive) { this.session = session; this.receive = receive; }
  push(chunk) {
    this.buffer += chunk;
    let end;
    while ((end = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, end).replace(/\r$/, '');
      this.buffer = this.buffer.slice(end + 1);
      if (this.discarding) this.discarding = false;
      else this.line(line);
    }
    if (this.buffer.length > 4096) { this.buffer = ''; this.discarding = true; }
  }
  end() { this.push('\n'); }
  line(line) {
    if (!line.startsWith(prefix) || line.length > 2048) return;
    const text = line.slice(prefix.length);
    if (text === this.previous) return;
    let d;
    try { d = JSON.parse(text); } catch { return; }
    if (!d || d.session !== this.session || typeof d.finished !== 'boolean' ||
      !['rings','score','map','elapsed','laps','players'].every(k =>
        Number.isInteger(d[k]) && d[k] >= 0 && d[k] <= 1e9) ||
      d.map < 1 || d.map > 1035 || d.players < 1 || d.players > 64) return;
    this.previous = text;
    this.receive({
      session:d.session, rings:d.rings, score:d.score, map:d.map,
      elapsed:d.elapsed, laps:d.laps, players:d.players, finished:d.finished,
    });
  }
}
