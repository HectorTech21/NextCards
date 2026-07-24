import assert from "node:assert/strict";
import fs from "node:fs/promises";
import qrcode from "qrcode-generator";
import jsQR from "jsqr";
import sharp from "sharp";
import {
  DEFAULT_QR_STYLE,
  QR_COMPOSITIONS,
  QR_EXPORT_SIZES,
  QR_PRESETS,
  autoCorrectQrStyle,
  buildPremiumQrSvg,
  normalizeCardQrStyle,
  qrPreset,
  resolveQrStyle,
  safeQrFilename,
  sanitizeQrStyle,
  validateQrDesign,
} from "../assets/js/qr-premium-core.js";

const PUBLIC_URL = "https://cards.lognext.com/card.html?id=francisco-javier-pedraza-calvo-cfo&source=qr";
const card = {
  id: "francisco-javier-pedraza-calvo-cfo",
  slug: "francisco-javier-pedraza-calvo-cfo",
  firstName: "Francisco Javier",
  lastName: "Pedraza Calvo",
  jobTitle: "CFO & Digital Strategy",
};

function trustedTestVector(source) {
  const viewBox = source.match(/\bviewBox="([^"]+)"/)?.[1];
  const markup = source.match(/<svg[^>]*>([\s\S]*)<\/svg>/i)?.[1]?.trim();
  assert(viewBox && markup, "El asset QR de prueba debe ser un SVG autocontenido.");
  return {validated: true, viewBox, markup};
}

const symbolPositiveSource = await fs.readFile(new URL("../assets/img/logos/lognext-symbol-qr-dark.svg", import.meta.url), "utf8");
const symbolNegativeSource = await fs.readFile(new URL("../assets/img/logos/lognext-symbol-qr-light.svg", import.meta.url), "utf8");
const logoPositiveSource = await fs.readFile(new URL("../assets/img/logos/lognext-logo-qr-dark.svg", import.meta.url), "utf8");
const logoNegativeSource = await fs.readFile(new URL("../assets/img/logos/lognext-logo-qr-light.svg", import.meta.url), "utf8");
const symbolPositive = trustedTestVector(symbolPositiveSource);
const symbolNegative = trustedTestVector(symbolNegativeSource);
const logoPositive = trustedTestVector(logoPositiveSource);
const logoNegative = trustedTestVector(logoNegativeSource);

for (const source of [symbolPositiveSource, symbolNegativeSource, logoPositiveSource, logoNegativeSource]) {
  assert.doesNotMatch(source, /<script|<style|<image|<use|<foreignObject|<iframe|\son[a-z]+\s*=|javascript:|(?:href|src)=["'](?:https?:|file:|data:)|class=|\sid=/i);
}

function assetsFor(style) {
  const dark = !style.transparent && style.backgroundColor === "#000029";
  return {
    logoSvg: style.logo === "none" ? null : dark ? symbolNegative : symbolPositive,
    brandLogoSvg: dark ? logoNegative : logoPositive,
  };
}

async function raster(markup, width, {flatten = false} = {}) {
  let pipeline = sharp(Buffer.from(markup)).resize({width});
  if (flatten) pipeline = pipeline.flatten({background: "#FFFFFF"});
  return pipeline.ensureAlpha().raw().toBuffer({resolveWithObject: true});
}

async function decode(asset) {
  const {data, info} = await raster(asset.markup, Math.max(1024, asset.width), {flatten: asset.style.transparent});
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  return jsQR(pixels, info.width, info.height, {inversionAttempts: "attemptBoth"});
}

for (const [id, preset] of Object.entries(QR_PRESETS)) {
  const style = sanitizeQrStyle({...preset, preset: id});
  assert.equal(style.preset, id, `${id} debe conservar su identificador de preset.`);
  const validation = validateQrDesign({url: PUBLIC_URL, style});
  assert.equal(validation.canExport, true, `${id} debe poder exportarse.`);
  const asset = buildPremiumQrSvg({
    url: PUBLIC_URL,
    card,
    style,
    composition: "solo",
    size: 1024,
    factory: qrcode,
    ...assetsFor(style),
  });
  assert.match(asset.markup, /^<svg /);
  assert.doesNotMatch(asset.markup, /<script|javascript:|<foreignObject/i);
  if (style.logo !== "none") {
    assert.equal(asset.logoEmbedded, true, `${id} debe incrustar la marca.`);
    assert.ok(asset.markup.includes('aria-label="Símbolo Lognext"'), `${id} debe incluir el vector oficial.`);
  }
  assert.doesNotMatch(asset.markup, /<image|data:image|href=["'](?:https?:|file:|assets\/)/i);
  assert.doesNotMatch(asset.markup, /localhost|127\.0\.0\.1|[a-z]:\\|assets\/img\//i);
  const decoded = await decode(asset);
  assert.equal(decoded?.data, PUBLIC_URL, `${id} debe decodificar la URL exacta.`);
}

const noLogoStyle = sanitizeQrStyle({...qrPreset("corporate-navy"), logo: "none", errorCorrection: "Q"});
const noLogoAsset = buildPremiumQrSvg({
  url: PUBLIC_URL,
  card,
  style: noLogoStyle,
  factory: qrcode,
  logoSvg: null,
  brandLogoSvg: logoPositive,
});
assert.equal((await decode(noLogoAsset))?.data, PUBLIC_URL, "El QR sin logo debe decodificar.");
assert.equal(noLogoAsset.logoEmbedded, false);
assert.doesNotMatch(noLogoAsset.markup, /aria-label="Símbolo Lognext"|<image/i);

const missingLogoStyle = sanitizeQrStyle(qrPreset("corporate-navy"));
const missingLogoAsset = buildPremiumQrSvg({
  url: PUBLIC_URL,
  card,
  style: missingLogoStyle,
  factory: qrcode,
  logoSvg: null,
  brandLogoSvg: logoPositive,
});
assert.equal(missingLogoAsset.logoEmbedded, false, "Si falta el símbolo debe generarse el QR sin parche central.");
assert.equal((await decode(missingLogoAsset))?.data, PUBLIC_URL, "El fallback sin símbolo debe conservar la URL.");

for (const composition of QR_COMPOSITIONS) {
  const style = sanitizeQrStyle(qrPreset("corporate-navy"));
  const asset = buildPremiumQrSvg({
    url: PUBLIC_URL,
    card: {...card, firstName: "<Francisco>", jobTitle: "CFO & Consejo"},
    style: {...style, footerText: "<script>alert(1)</script>"},
    composition,
    size: 1024,
    factory: qrcode,
    ...assetsFor(style),
  });
  assert.equal(asset.composition, composition);
  assert.doesNotMatch(asset.markup, /<script>|alert\(1\)<\/script>/i);
  assert.ok(asset.markup.includes("&lt;Francisco&gt;"));
  assert.equal((await decode(asset))?.data, PUBLIC_URL, `${composition} debe conservar un QR decodificable.`);
}

for (const size of QR_EXPORT_SIZES) {
  const style = sanitizeQrStyle(qrPreset("corporate-orange"));
  const asset = buildPremiumQrSvg({
    url: PUBLIC_URL,
    card,
    style,
    size,
    factory: qrcode,
    ...assetsFor(style),
  });
  const png = await sharp(Buffer.from(asset.markup)).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, size);
  assert.equal(metadata.height, size);
  if (size !== 512) assert.equal((await decode(asset))?.data, PUBLIC_URL);
}

const longUrl = `https://cards.lognext.com/card.html?id=${"persona-con-cargo-largo-".repeat(14)}&source=qr&campaign=${encodeURIComponent("Consejo Asesor / Madrid")}`;
const longStyle = sanitizeQrStyle({...qrPreset("monochrome"), errorCorrection: "H"});
const longAsset = buildPremiumQrSvg({
  url: longUrl,
  card,
  style: longStyle,
  size: 2048,
  factory: qrcode,
  ...assetsFor(longStyle),
});
assert.equal((await decode(longAsset))?.data, longUrl, "Una URL larga debe decodificar sin cambios.");

const unsafe = sanitizeQrStyle({
  preset: "inventado",
  foregroundColor: "red",
  backgroundColor: "#FFFFFF",
  accentColor: "javascript:alert(1)",
  dotsStyle: "triangle",
  cornersStyle: "broken",
  logo: "https://example.com/logo.svg",
  margin: -100,
  errorCorrection: "L",
  footerText: "A\u0000".repeat(200),
});
assert.deepEqual(unsafe, {
  ...DEFAULT_QR_STYLE,
  margin: 16,
  footerText: "A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A A",
});

const normalizedWithoutStyle = normalizeCardQrStyle({...card});
assert.equal(normalizedWithoutStyle.qrStyle, null);
const normalizedWithStyle = normalizeCardQrStyle({...card, qrStyle: {preset: "dark-card", logo: "none", errorCorrection: "M"}});
assert.equal(normalizedWithStyle.qrStyle.preset, "dark-card");
assert.equal(normalizedWithStyle.qrStyle.logo, "none");
assert.equal(normalizedWithStyle.qrStyle.errorCorrection, "M");

const inherited = resolveQrStyle({id: "one", qrStyle: null}, {cards: {qr: {
  preset: "monochrome",
  foregroundColor: "#222222",
  backgroundColor: "#FFFFFF",
  accentColor: "#222222",
  logo: "none",
  errorCorrection: "Q",
}}});
assert.equal(inherited.preset, "monochrome");
assert.equal(inherited.foregroundColor, "#222222");

const blocked = validateQrDesign({url: PUBLIC_URL, style: {
  ...DEFAULT_QR_STYLE,
  logo: "none",
  foregroundColor: "#FFFFFF",
  backgroundColor: "#FFFFFF",
}});
assert.equal(blocked.status, "not-recommended");
assert.equal(blocked.canExport, false);
const corrected = autoCorrectQrStyle({...DEFAULT_QR_STYLE, foregroundColor: "#FFFFFF", backgroundColor: "#FFFFFF"});
assert.equal(validateQrDesign({url: PUBLIC_URL, style: corrected}).canExport, true);
assert.ok(corrected.margin >= 24);

assert.equal(safeQrFilename(card), "qr-francisco-javier-pedraza-calvo.png");
assert.equal(safeQrFilename(card, "email", "svg"), "qr-francisco-javier-pedraza-calvo-email-signature.svg");
assert.doesNotMatch(safeQrFilename({firstName: "../../<script>", lastName: "Álvarez"}, "solo", "exe"), /[<>/\\]|\.exe$/);

console.log(`OK: ${Object.keys(QR_PRESETS).length} presets, símbolo vectorial/fallback sin logo, ${QR_COMPOSITIONS.length} composiciones, PNG 512/1024/2048, SVG seguro, URL larga, saneado, herencia y decodificación QR real verificados.`);
