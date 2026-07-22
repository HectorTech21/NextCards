import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {
  DEFAULT_PHOTO_FRAME,
  PHOTO_FRAME_LIMITS,
  coverGeometry,
  dragPhotoFrame,
  isValidPhotoFrame,
  normalizeCardPhotoFrame,
  normalizePhotoFrame,
  photoFrameCss,
} from "../assets/js/photo-frame.js";

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.deepEqual(normalizePhotoFrame(), DEFAULT_PHOTO_FRAME);
assert.deepEqual(normalizePhotoFrame(null, "top"), {x: 50, y: 0, scale: 1});
assert.deepEqual(normalizePhotoFrame(undefined, "bottom"), {x: 50, y: 100, scale: 1});
assert.deepEqual(normalizePhotoFrame({x: Number.NaN, y: Number.POSITIVE_INFINITY, scale: "incorrecto"}), DEFAULT_PHOTO_FRAME);
assert.deepEqual(normalizePhotoFrame({x: -20, y: 140, scale: 8}), {x: 0, y: 100, scale: PHOTO_FRAME_LIMITS.scale.max});
assert.ok(isValidPhotoFrame({x: 22, y: 77, scale: 1.35}));
assert.ok(!isValidPhotoFrame({x: 22, y: 77, scale: Number.NaN}));

const migrated = normalizeCardPhotoFrame({id: "legacy", photoPosition: "top"});
assert.deepEqual(migrated.photoFrame, {x: 50, y: 0, scale: 1});
assert.ok(!("photoPosition" in migrated));
assert.deepEqual(photoFrameCss({x: 35, y: 62, scale: 1.4}), {
  objectPosition: "35% 62%",
  transform: "scale(1.4)",
  transformOrigin: "35% 62%",
});

const geometryCases = [
  {naturalWidth: 1600, naturalHeight: 900, frameWidth: 320, frameHeight: 320},
  {naturalWidth: 600, naturalHeight: 1200, frameWidth: 320, frameHeight: 320},
  {naturalWidth: 800, naturalHeight: 800, frameWidth: 320, frameHeight: 320},
  {naturalWidth: 2400, naturalHeight: 300, frameWidth: 320, frameHeight: 320},
  {naturalWidth: 80, naturalHeight: 110, frameWidth: 320, frameHeight: 180},
  {naturalWidth: 900, naturalHeight: 1200, frameWidth: 180, frameHeight: 320},
];

for (const dimensions of geometryCases) {
  for (const photoFrame of [{x: 0, y: 0, scale: 1}, {x: 50, y: 50, scale: 1.5}, {x: 100, y: 100, scale: 2.5}]) {
    const geometry = coverGeometry({...dimensions, photoFrame});
    assert.ok(geometry.left <= 0.0001, "La imagen no debe dejar hueco a la izquierda.");
    assert.ok(geometry.top <= 0.0001, "La imagen no debe dejar hueco arriba.");
    assert.ok(geometry.right + 0.0001 >= dimensions.frameWidth, "La imagen debe cubrir el borde derecho.");
    assert.ok(geometry.bottom + 0.0001 >= dimensions.frameHeight, "La imagen debe cubrir el borde inferior.");
    assert.ok(geometry.renderedWidth >= dimensions.frameWidth);
    assert.ok(geometry.renderedHeight >= dimensions.frameHeight);
  }
}

const dragged = dragPhotoFrame({x: 50, y: 50, scale: 1.6}, {
  deltaX: 80,
  deltaY: -45,
  naturalWidth: 562,
  naturalHeight: 800,
  frameWidth: 320,
  frameHeight: 320,
});
assert.ok(dragged.x >= 0 && dragged.x <= 100);
assert.ok(dragged.y >= 0 && dragged.y <= 100);
assert.notDeepEqual(dragged, {x: 50, y: 50, scale: 1.6});

const seed = JSON.parse(await read("assets/data/employees.json"));
const realPeople = [
  {firstName: "PATRICK", lastName: "ARI PARIENTE GARABLI", orientation: "square"},
  {firstName: "LORENA", lastName: "AYUSO RUANO", orientation: "portrait"},
  {firstName: "JULIÁN", lastName: "GARCÍA ASENSIO", orientation: "landscape"},
];
for (const expected of realPeople) {
  const card = seed.find(item => item.firstName === expected.firstName && item.lastName === expected.lastName);
  assert.ok(card?.photo, `Debe existir la fotografía real de ${expected.firstName} ${expected.lastName}.`);
  const metadata = await sharp(fileURLToPath(new URL(`../${card.photo}`, import.meta.url))).metadata();
  if (expected.orientation === "square") assert.equal(metadata.width, metadata.height);
  if (expected.orientation === "portrait") assert.ok(metadata.height > metadata.width);
  if (expected.orientation === "landscape") assert.ok(metadata.width > metadata.height);
}

const [app, editor, preview, quickView, templates, analytics, storage, settingsData, index, publicCard, cardHtml, css] = await Promise.all([
  read("assets/js/app.js"),
  read("assets/js/editor.js"),
  read("assets/js/preview.js"),
  read("assets/js/quick-view.js"),
  read("assets/js/templates-ui.js"),
  read("assets/js/analytics-ui.js"),
  read("assets/js/storage.js"),
  read("assets/js/settings-data.js"),
  read("index.html"),
  read("assets/js/public-card.js"),
  read("card.html"),
  read("assets/css/photo-frame.css"),
]);

for (const [surface, source] of Object.entries({dashboard: app, preview, quickView, templates, analytics})) {
  assert.match(source, /createPhotoFrameImage/, `${surface} debe usar el renderizador central.`);
}
assert.match(editor, /setupPhotoFrameEditor/);
assert.match(editor, /currentPhotoFrame/);
assert.match(editor, /Fotografía nueva · encuadre centrado/);
assert.match(editor, /isPhotoFrameEditorOpen/);
assert.doesNotMatch(index, /name="photoPosition"/);
assert.match(index, /id="photo-frame-modal"/);
assert.match(index, />Centrar</);
assert.match(index, />Restaurar</);
assert.match(index, />Aplicar</);
assert.match(index, />Cancelar</);
assert.match(index, /aria-keyshortcuts="ArrowLeft/);
assert.match(storage, /INITIAL_DATA_VERSION = 2/);
assert.match(storage, /normalizeCardPhotoFrame/);
assert.match(settingsData, /backup\.cards = backup\.cards\.map\(card => normalizeCardPhotoFrame\(card\)\)/);
assert.match(publicCard, /renderCardPreview/);
assert.match(cardHtml, /photo-frame\.css\?v=1\.4\.0/);
assert.match(css, /touch-action:none/);
assert.match(css, /@media\(max-width:360px\)/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(editor, /canvas|getContext\(/);

console.log("OK: photoFrame normalizado, geometría sin huecos, migración, editor accesible, persistencia y renderizado central en todas las vistas verificados.");
