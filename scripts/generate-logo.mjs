// Generates Alon POS System raster/ICO assets from public/alon-icon.png
// Usage: node scripts/generate-logo.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcPath = path.join(root, 'public', 'alon-icon.png');

const pngFromSrc = async (src, size) =>
  sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: 'lanczos3' })
    .png()
    .toBuffer();

// Build an .ico that embeds PNG-encoded images (supported on Windows Vista+)
const buildIco = (pngs) => {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type: icon
  header.writeUInt16LE(count, 4);   // image count

  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  for (let i = 0; i < count; i++) {
    const { size, data } = pngs[i];
    const e = i * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, e + 0);     // width  (0 => 256)
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1);     // height (0 => 256)
    entries.writeUInt8(0, e + 2);                          // palette
    entries.writeUInt8(0, e + 3);                          // reserved
    entries.writeUInt16LE(1, e + 4);                       // color planes
    entries.writeUInt16LE(32, e + 6);                      // bits per pixel
    entries.writeUInt32LE(data.length, e + 8);             // image size
    entries.writeUInt32LE(offset, e + 12);                 // image offset
    offset += data.length;
  }
  return Buffer.concat([header, entries, ...pngs.map((p) => p.data)]);
};

const main = async () => {
  const src = await readFile(srcPath);

  // App-loaded PNGs
  await writeFile(path.join(root, 'public', 'alon-logo.png'), await pngFromSrc(src, 512));
  await writeFile(path.join(root, 'app', 'icon.png'), await pngFromSrc(src, 512));

  // ICO sizes
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngs = await Promise.all(
    sizes.map(async (size) => ({ size, data: await pngFromSrc(src, size) }))
  );

  await writeFile(path.join(root, 'public', 'alon-logo.ico'), buildIco(pngs));
  await writeFile(path.join(root, 'public', 'favicon.ico'), buildIco(pngs.filter((p) => p.size <= 64)));

  console.log('Generated: public/alon-logo.png, app/icon.png, public/alon-logo.ico, public/favicon.ico');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
