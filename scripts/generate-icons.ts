/**
 * Regenerates the raster icon set from public/alon-icon.svg.
 *
 * Run with: npx tsx scripts/generate-icons.ts
 *
 * sharp rasterises the SVG to PNG, but it cannot write ICO — so the .ico files
 * are assembled here. A modern ICO is just a small directory header followed by
 * the image payloads, and Windows (Vista+), Electron and every current browser
 * accept PNG payloads inside it, so each entry embeds the PNG verbatim.
 */
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const PUBLIC = path.join(process.cwd(), 'public');
const SOURCE = path.join(PUBLIC, 'alon-icon.svg');

/** Sizes Windows and browsers actually pick from. 256 must be present for installers. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function renderPng(svg: Buffer, size: number): Promise<Buffer> {
  // density scales the SVG rasterisation so small sizes stay crisp rather than
  // being downsampled from a fixed-density render.
  return sharp(svg, { density: Math.max(72, Math.ceil((size / 512) * 72 * 8)) })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function buildIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const HEADER = 6;
  const ENTRY = 16;

  const header = Buffer.alloc(HEADER);
  header.writeUInt16LE(0, 0);            // reserved
  header.writeUInt16LE(1, 2);            // type 1 = icon
  header.writeUInt16LE(pngs.length, 4);  // image count

  const entries: Buffer[] = [];
  let offset = HEADER + ENTRY * pngs.length;

  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(ENTRY);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);              // palette colours (0 = truecolour)
    entry.writeUInt8(0, 3);              // reserved
    entry.writeUInt16LE(1, 4);           // colour planes
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map(p => p.data)]);
}

async function main() {
  const svg = await readFile(SOURCE);

  const pngs: { size: number; data: Buffer }[] = [];
  for (const size of ICO_SIZES) {
    pngs.push({ size, data: await renderPng(svg, size) });
  }

  const logoPng = await renderPng(svg, 512);
  await writeFile(path.join(PUBLIC, 'alon_logo.png'), logoPng);
  console.log('✅ alon_logo.png (512×512)');

  const ico = buildIco(pngs);
  for (const name of ['favicon.ico', 'alon_logo.ico']) {
    await writeFile(path.join(PUBLIC, name), ico);
    console.log(`✅ ${name} (${ICO_SIZES.join(', ')})`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
