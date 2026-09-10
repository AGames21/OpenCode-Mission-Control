// Generates assets/icon-512.png (Tauri source icon) with zero dependencies.
// Run: node scripts/icon.mjs   (then: npx @tauri-apps/cli icon assets/icon-512.png)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const S = 512;
const px = Buffer.alloc(S * S * 4);

function set(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
}
function dot(cx, cy, rad, r, g, b, glow) {
  for (let y = Math.floor(cy - rad * 3); y <= cy + rad * 3; y++) {
    for (let x = Math.floor(cx - rad * 3); x <= cx + rad * 3; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rad) set(x, y, r, g, b);
      else if (glow && d <= rad * 3) {
        const t = 1 - (d - rad) / (rad * 2);
        const i = (y * S + x) * 4;
        if (x >= 0 && y >= 0 && x < S && y < S) {
          px[i] = Math.min(255, px[i] + r * t * 0.35);
          px[i + 1] = Math.min(255, px[i + 1] + g * t * 0.35);
          px[i + 2] = Math.min(255, px[i + 2] + b * t * 0.35);
        }
      }
    }
  }
}
function line(x0, y0, x1, y1, r, g, b) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    set(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), r, g, b, 140);
  }
}

// Deep-navy rounded background with vertical gradient.
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = Math.min(x, S - 1 - x, 90);
    const dy = Math.min(y, S - 1 - y, 90);
    const corner = Math.min(dx, dy);
    const rr = corner < 90 ? Math.hypot(90 - dx, 90 - dy) : 0;
    if (rr > 90) { set(x, y, 0, 0, 0, 0); continue; }
    const t = y / S;
    set(x, y, Math.round(10 + 12 * t), Math.round(15 + 20 * t), Math.round(28 + 26 * t));
  }
}
const C = S / 2;
line(C, C, C - 150, C - 110, 122, 162, 255);
line(C, C, C + 150, C - 110, 122, 162, 255);
line(C, C, C - 170, C + 120, 122, 162, 255);
line(C, C, C + 170, C + 120, 122, 162, 255);
line(C - 150, C - 110, C - 60, C - 170, 111, 211, 199);
line(C + 150, C - 110, C + 60, C - 170, 111, 211, 199);
dot(C - 150, C - 110, 26, 122, 162, 255, true);
dot(C + 150, C - 110, 26, 122, 162, 255, true);
dot(C - 170, C + 120, 26, 111, 211, 199, true);
dot(C + 170, C + 120, 26, 111, 211, 199, true);
dot(C - 60, C - 170, 18, 201, 163, 232, true);
dot(C + 60, C - 170, 18, 201, 163, 232, true);
dot(C, C, 44, 215, 224, 242, true);
dot(C, C, 16, 122, 162, 255, false);

const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
function crc(buf) {
  let t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  let c = 0xffffffff;
  for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8);
  return Buffer.from([(c ^ 0xffffffff) >>> 24, ((c ^ 0xffffffff) >>> 16) & 255, ((c ^ 0xffffffff) >>> 8) & 255, (c ^ 0xffffffff) & 255]);
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  return Buffer.concat([len, td, crc(td)]);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', (() => { const b = Buffer.alloc(13); b.writeUInt32BE(S, 0); b.writeUInt32BE(S, 4); b[8] = 8; b[9] = 6; return b; })()),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('assets/icon-512.png', png);
console.log('wrote assets/icon-512.png', png.length, 'bytes');
