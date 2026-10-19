import { lineReward, shuffle } from './game';
export type Matrix = number[][];
export const SHAPES: Matrix[] = [
  [],
  [[1, 1, 1, 1]],
  [
    [2, 2],
    [2, 2],
  ],
  [
    [0, 3, 0],
    [3, 3, 3],
  ],
  [
    [0, 4, 4],
    [4, 4, 0],
  ],
  [
    [5, 5, 0],
    [0, 5, 5],
  ],
  [
    [6, 0, 0],
    [6, 6, 6],
  ],
  [
    [0, 0, 7],
    [7, 7, 7],
  ],
];
export const BLOCK_COLORS = ['', '#88cbd4', '#e4cb87', '#b29cda', '#91c7aa', '#eaa4b0', '#91a8d9', '#dfb18a'];
export interface Piece {
  type: number;
  matrix: Matrix;
  x: number;
  y: number;
}
export class Tetris {
  board: Matrix = Array.from({ length: 20 }, () => Array(10).fill(0));
  piece: Piece | null = null;
  queue: number[] = [];
  held: number | null = null;
  canHold = true;
  score = 0;
  lines = 0;
  coins = 0;
  combo = -1;
  backToBack = false;
  over = false;
  paused = true;
  started = false;
  onClear: (coins: number, lines: number) => void;
  constructor(
    onClear: (coins: number, lines: number) => void = () => {},
    private onLock: () => void = () => {},
  ) {
    this.onClear = onClear;
    this.refill();
    this.spawn();
  }
  get level() {
    return 1 + Math.floor(this.lines / 10);
  }
  get interval() {
    return Math.max(100, 850 - (this.level - 1) * 65);
  }
  refill() {
    while (this.queue.length < 7) this.queue.push(...shuffle([1, 2, 3, 4, 5, 6, 7]));
  }
  spawn(type?: number) {
    this.refill();
    const t = type || this.queue.shift()!;
    const matrix = SHAPES[t].map((r) => [...r]);
    this.piece = { type: t, matrix, x: Math.floor((10 - matrix[0].length) / 2), y: 0 };
    if (this.collides(this.piece)) {
      this.over = true;
      this.paused = true;
    }
  }
  collides(piece: Piece): boolean {
    return piece.matrix.some((row, y) =>
      row.some(
        (v, x) =>
          v &&
          (piece.x + x < 0 ||
            piece.x + x >= 10 ||
            piece.y + y >= 20 ||
            (piece.y + y >= 0 && this.board[piece.y + y][piece.x + x])),
      ),
    );
  }
  start() {
    this.started = true;
    this.paused = false;
  }
  move(dx: number, dy = 0): boolean {
    if (!this.piece || this.paused || this.over) return false;
    const next = { ...this.piece, x: this.piece.x + dx, y: this.piece.y + dy };
    if (this.collides(next)) return false;
    this.piece = next;
    return true;
  }
  rotate(direction = 1): boolean {
    if (!this.piece || this.paused || this.over) return false;
    const m = this.piece.matrix;
    const rotated = m[0].map((_, i) => m.map((r) => r[i]).reverse());
    const matrix = direction === 1 ? rotated : rotated.map((r) => r.reverse()).reverse();
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, -1],
      [0, -2],
    ]) {
      const p = { ...this.piece, matrix, x: this.piece.x + dx, y: this.piece.y + dy };
      if (!this.collides(p)) {
        this.piece = p;
        return true;
      }
    }
    return false;
  }
  ghostY() {
    if (!this.piece) return 0;
    let p = { ...this.piece };
    while (!this.collides({ ...p, y: p.y + 1 })) p.y++;
    return p.y;
  }
  softDrop() {
    if (this.move(0, 1)) this.score++;
    else if (!this.paused && !this.over) this.lock();
  }
  hardDrop() {
    if (!this.piece || this.paused || this.over) return;
    const y = this.ghostY();
    this.score += (y - this.piece.y) * 2;
    this.piece.y = y;
    this.lock();
  }
  tick() {
    if (!this.move(0, 1) && !this.paused && !this.over) this.lock();
  }
  hold() {
    if (!this.canHold || !this.piece || this.paused || this.over) return;
    const t = this.piece.type;
    this.spawn(this.held || undefined);
    this.held = t;
    this.canHold = false;
  }
  lock() {
    if (!this.piece) return;
    for (let y = 0; y < this.piece.matrix.length; y++)
      for (let x = 0; x < this.piece.matrix[y].length; x++)
        if (this.piece.matrix[y][x]) {
          const row = this.piece.y + y;
          if (row < 0) {
            this.over = true;
            this.paused = true;
            return;
          }
          this.board[row][this.piece.x + x] = this.piece.type;
        }
    const remaining = this.board.filter((row) => !row.every(Boolean));
    const count = 20 - remaining.length;
    if (count) {
      this.combo++;
      const reward = lineReward(count, this.combo, this.backToBack);
      this.lines += count;
      this.coins += reward;
      this.score += [0, 100, 300, 500, 800][count] * this.level + Math.max(0, this.combo) * 50;
      this.board = [...Array.from({ length: count }, () => Array(10).fill(0)), ...remaining];
      this.backToBack = count === 4;
      this.onClear(reward, count);
    } else this.combo = -1;
    this.onLock();
    this.canHold = true;
    this.spawn();
  }
}
export function drawGame(canvas: HTMLCanvasElement, game: Tetris, aura: string, reduced = false) {
  const w = canvas.clientWidth || 280,
    h = w * 2,
    ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const unit = w / 10;
  ctx.fillStyle = '#29263d';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff08';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 10; x++) {
    ctx.beginPath();
    ctx.moveTo(x * unit, 0);
    ctx.lineTo(x * unit, h);
    ctx.stroke();
  }
  for (let y = 0; y <= 20; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * unit);
    ctx.lineTo(w, y * unit);
    ctx.stroke();
  }
  const block = (x: number, y: number, t: number, ghost = false, active = false) => {
    ctx.save();
    ctx.globalAlpha = ghost ? 0.2 : 1;
    if (active) {
      ctx.shadowColor = aura;
      ctx.shadowBlur = reduced ? 9 : 18 + Math.sin(performance.now() / 480) * 5;
    }
    ctx.fillStyle = BLOCK_COLORS[t];
    ctx.beginPath();
    ctx.roundRect(x * unit + 1.5, y * unit + 1.5, unit - 3, unit - 3, 4);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = active ? aura : '#ffffff45';
    ctx.lineWidth = active ? 2.5 : 1;
    ctx.stroke();
    if (active && !reduced) {
      const phase = performance.now() / 650 + x + y;
      ctx.fillStyle = aura;
      ctx.globalAlpha = 0.8;
      for (let i = 0; i < 2; i++) {
        const angle = phase + i * Math.PI,
          px = (x + 0.5) * unit + Math.cos(angle) * unit * 0.62,
          py = (y + 0.5) * unit + Math.sin(angle) * unit * 0.62;
        ctx.fillRect(px, py, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
    }
    if (!ghost) {
      ctx.fillStyle = '#ffffff35';
      ctx.fillRect(x * unit + 5, y * unit + 4, unit - 10, 3);
    }
    ctx.restore();
  };
  game.board.forEach((r, y) =>
    r.forEach((t, x) => {
      if (t) block(x, y, t);
    }),
  );
  if (game.piece) {
    const p = game.piece;
    const gy = game.ghostY();
    p.matrix.forEach((r, y) =>
      r.forEach((t, x) => {
        if (t) {
          block(p.x + x, gy + y, t, true);
          block(p.x + x, p.y + y, t, false, true);
        }
      }),
    );
  }
}
