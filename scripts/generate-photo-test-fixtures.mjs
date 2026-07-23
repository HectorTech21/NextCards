import sharp from "sharp";
import {randomFillSync} from "node:crypto";
import {appendFile, mkdir, stat, writeFile} from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const directory = path.join(os.tmpdir(), "nextcards-photo-qa");
await mkdir(directory, {recursive: true});

async function exactSizeJpeg({name, width, height, quality, targetBytes, orientation = 1}) {
  const raw = Buffer.alloc(width * height * 3);
  randomFillSync(raw);
  const file = path.join(directory, name);
  await sharp(raw, {raw: {width, height, channels: 3}}).jpeg({quality}).withMetadata({orientation}).toFile(file);
  const current = (await stat(file)).size;
  if (current > targetBytes) throw new Error(`${name} supera el objetivo: ${current} > ${targetBytes}`);
  if (current < targetBytes) await appendFile(file, Buffer.alloc(targetBytes - current));
  return file;
}

const files = {};
files.jpg141 = await exactSizeJpeg({name: "jpg-1.41mb.jpg", width: 1600, height: 1600, quality: 74, targetBytes: Math.round(1.41 * 1024 * 1024)});
files.jpgLarge = await exactSizeJpeg({name: "jpg-5.50mb.jpg", width: 3000, height: 3000, quality: 70, targetBytes: Math.round(5.5 * 1024 * 1024)});

const orientedRaw = Buffer.alloc(1200 * 800 * 3);
for (let y = 0; y < 800; y += 1) for (let x = 0; x < 1200; x += 1) {
  const offset = (y * 1200 + x) * 3;
  orientedRaw[offset] = x < 600 ? 245 : 30;
  orientedRaw[offset + 1] = y < 400 ? 90 : 190;
  orientedRaw[offset + 2] = x < 600 ? 40 : 230;
}
files.exif = path.join(directory, "jpeg-exif-orientation-6.jpg");
await sharp(orientedRaw, {raw: {width: 1200, height: 800, channels: 3}}).jpeg({quality: 88}).withMetadata({orientation: 6}).toFile(files.exif);

const transparentSvg = Buffer.from('<svg width="900" height="700" xmlns="http://www.w3.org/2000/svg"><rect width="900" height="700" fill="none"/><circle cx="450" cy="350" r="270" fill="#FA3C0F" fill-opacity=".66"/><rect x="300" y="190" width="300" height="320" rx="60" fill="#000029" fill-opacity=".78"/></svg>');
files.png = path.join(directory, "transparent.png");
await sharp(transparentSvg).png().toFile(files.png);
files.webp = path.join(directory, "sample.webp");
await sharp(transparentSvg).webp({quality: 82}).toFile(files.webp);

async function solid(name, width, height, color) {
  const file = path.join(directory, name);
  await sharp({create: {width, height, channels: 3, background: color}}).jpeg({quality: 88}).toFile(file);
  return file;
}
files.vertical = await solid("vertical.jpg", 600, 1200, "#3791F5");
files.horizontal = await solid("horizontal.jpg", 1200, 600, "#64F07D");
files.square = await solid("square.jpg", 900, 900, "#C896FF");
files.fake = path.join(directory, "not-an-image.jpg");
await writeFile(files.fake, "Esto no es una imagen aunque tenga extensión JPG.", "utf8");
files.corrupt = path.join(directory, "corrupt.jpg");
const corrupt = Buffer.alloc(4096);randomFillSync(corrupt);corrupt[0]=0xff;corrupt[1]=0xd8;await writeFile(files.corrupt,corrupt);

const report = {};
for (const [key, file] of Object.entries(files)) {
  const details = await stat(file);
  report[key] = {file, bytes: details.size, mib: Number((details.size / 1024 / 1024).toFixed(3))};
}
console.log(JSON.stringify({directory, files: report}, null, 2));
