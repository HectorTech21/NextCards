import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = path => readFile(new URL(path, root), "utf8");
const [index, app, quickView, quickCss, qrCode, sharing] = await Promise.all([
  read("index.html"),
  read("assets/js/app.js"),
  read("assets/js/quick-view.js"),
  read("assets/css/quick-view.css"),
  read("assets/js/qr-code.js"),
  read("assets/js/card-sharing.js"),
]);

assert.equal((index.match(/id="quick-view-overlay"/g) || []).length, 1, "Debe existir un único drawer reutilizable.");
assert.match(index, /role="dialog"[^>]+aria-modal="true"[^>]+aria-labelledby="quick-view-title"[^>]+aria-describedby="quick-view-description"/);
assert.ok(index.indexOf("qrcode-generator.js") < index.indexOf("assets/js/app.js"), "El generador QR debe cargarse antes de la aplicación.");
const drawerMarkup = index.slice(index.indexOf('id="quick-view-overlay"'), index.indexOf('id="editor-overlay"'));
assert.doesNotMatch(drawerMarkup, /<(input|select|textarea)\b/i, "La vista rápida no debe permitir edición inline.");

assert.match(app, /\[\["Vista rápida","quick-view"\]/, "El menú contextual debe incluir Vista rápida.");
assert.match(app, /quick-view-trigger/, "La cabecera visual debe ofrecer un disparador accesible.");
assert.match(app, /openQuickView\(id,opener\)/, "La tarjeta debe abrirse por ID, no por posición.");
assert.match(quickView, /renderCardPreview\(byId\("quick-view-card-preview"\), card\)/, "Debe reutilizarse el renderizador real.");
assert.match(quickView, /buildQrSvg\(/);
assert.match(quickView, /renderQrSvg\(/);
assert.match(index, /data-quick-view-action="qr-premium"/);
assert.match(quickView, /callbacks\.openPremiumQr\(card,/);
assert.match(quickView, /copyText\(/);
assert.match(quickView, /shareCard\(/);
assert.match(quickView, /callbacks\.openEditor\(id\)/);
assert.match(quickView, /event\.target === overlay/);
assert.match(quickView, /event\.key === "Escape"/);
assert.match(quickView, /previousFocus\?\.isConnected/);
assert.match(quickView, /nextcards\.cards\.v1/);

assert.match(quickCss, /width:clamp\(420px,38vw,520px\)/, "El drawer de escritorio debe conservar el ancho pedido.");
assert.match(quickCss, /@media\(max-width:700px\)/);
assert.match(quickCss, /transform:translateY\(100%\)/, "En móvil debe comportarse como bottom sheet.");
assert.match(quickCss, /@media\(prefers-reduced-motion:reduce\)/);
assert.match(quickCss, /body\.quick-view-open\{overflow:hidden\}/);

assert.match(qrCode, /export function renderQrSvg/);
assert.match(qrCode, /export async function downloadQrPng/);
assert.match(sharing, /export async function copyText/);
assert.match(sharing, /export async function shareCard/);

console.log("OK: drawer único, activación por ID, preview, QR, acciones, foco, cierre, responsive y reduced motion verificados.");
