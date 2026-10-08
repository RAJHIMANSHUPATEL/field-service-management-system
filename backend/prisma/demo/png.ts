import { crc32, deflateSync } from "node:zlib";

// Minimal PNG encoder for the demo's site photos and signatures (no image dependency).
function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // truecolour
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// A soft "equipment" photo: a tinted gradient with a darker unit silhouette.
export function sitePhoto(seed: number) {
  const hue = [
    [70, 110, 150],
    [90, 130, 100],
    [150, 120, 80],
    [110, 100, 140],
  ][seed % 4]!;
  return encodePng(320, 240, (x, y) => {
    const inUnit = x > 80 && x < 240 && y > 60 && y < 190;
    const grille = inUnit && y > 150 && (x + y) % 9 < 2;
    const shade = 1 - y / 480;
    const base = inUnit ? [225, 228, 230] : hue.map((c) => Math.round(c * shade + 40));
    return (grille ? [120, 125, 130] : base) as [number, number, number];
  });
}

// A handwritten-looking signature stroke on white.
export function signaturePng(seed: number) {
  const width = 300;
  const height = 100;
  const amp = 18 + (seed % 7) * 2;
  const freq = 0.045 + (seed % 5) * 0.006;
  const curve = (x: number) => 50 + amp * Math.sin(x * freq + seed) * Math.cos(x * 0.013 + seed / 3);
  return encodePng(width, height, (x, y) => {
    if (x < 25 || x > 275) return [255, 255, 255];
    const distance = Math.abs(y - curve(x));
    return distance < 1.6 ? [20, 40, 110] : [255, 255, 255];
  });
}
