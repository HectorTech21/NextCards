import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import qrcode from "qrcode-generator";
import { buildVcard, getPublicCardUrl, getVcardFilename } from "../assets/js/card-export.js";
import { buildQrSvg } from "../assets/js/qr-code.js";

const seed = JSON.parse(await fs.readFile(new URL("../assets/data/employees.json", import.meta.url), "utf8"));
const serializedSeed = JSON.stringify(seed);
const privatePathPattern = new RegExp([
  `[A-Za-z]${String.fromCharCode(58, 92, 92)}`,
  ["hector", "plaza"].join(`${String.fromCharCode(92)}.`),
  ["One", "Drive"].join(""),
  ["Imagenes", "Corporativas"].join(""),
  ["Departamento", "IT"].join(" "),
].join("|"), "i");
assert.doesNotMatch(serializedSeed, privatePathPattern, "El seed no puede contener rutas personales.");
assert.doesNotMatch(serializedSeed, /data:image|base64/i, "El seed no puede contener imágenes base64.");
for (const photo of new Set(seed.map(card => card.photo).filter(Boolean))) {
  assert.match(photo, /^assets\/img\/employees\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/i, `Ruta relativa no válida: ${photo}`);
  const photoUrl = new URL(`../${photo}`, import.meta.url);
  await fs.access(photoUrl);
  const file = await fs.stat(photoUrl);
  assert.ok(file.size <= 500_000, `Imagen demasiado pesada para el dashboard: ${photo}`);
  const metadata = await sharp(fileURLToPath(photoUrl)).metadata();
  assert.ok((metadata.width ?? 0) <= 800 && (metadata.height ?? 0) <= 800, `Imagen sin optimizar: ${photo}`);
}

class LocalStorageMock {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
}

globalThis.localStorage = new LocalStorageMock();
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(seed) });

let importSequence = 0;
async function loadStorage() {
  const url = new URL("../assets/js/storage.js", import.meta.url);
  url.searchParams.set("test", String(importSequence++));
  return import(url.href);
}

const first = await loadStorage();
assert.equal(first.storage.getCards().length, 16, "La primera apertura debe cargar 16 tarjetas.");
assert.equal(localStorage.getItem(first.SEED_VERSION_KEY), "2", "Debe registrarse la versión del seed.");
assert.ok(first.storage.getCards().every(card => card.photoFrame?.x === 50 && card.photoFrame?.y === 50 && card.photoFrame?.scale === 1), "El seed debe recibir un encuadre compatible por defecto.");

const firstReload = await loadStorage();
assert.equal(firstReload.storage.getCards().length, 16, "La primera recarga no debe duplicar tarjetas.");

const edited = firstReload.storage.getCards();
edited[0].cardName = "Cambio persistente de prueba";
firstReload.storage.saveCards(edited);
assert.equal((await loadStorage()).storage.getCards()[0].cardName, "Cambio persistente de prueba", "La edición debe persistir.");

const afterEdit = (await loadStorage()).storage.getCards();
afterEdit.splice(1, 1);
firstReload.storage.saveCards(afterEdit);
assert.equal((await loadStorage()).storage.getCards().length, 15, "Una tarjeta eliminada no debe reaparecer.");

const afterDelete = (await loadStorage()).storage.getCards();
afterDelete.push({ ...seed[0], id: "manual-test-card", slug: "manual-test-card", cardName: "Tarjeta manual de prueba" });
firstReload.storage.saveCards(afterDelete);
assert.equal((await loadStorage()).storage.getCards().length, 16, "Una tarjeta nueva debe persistir.");

const afterCreate = (await loadStorage()).storage.getCards();
afterCreate[0].status = "disabled";
firstReload.storage.saveCards(afterCreate);
assert.equal((await loadStorage()).storage.getCards()[0].status, "disabled", "El estado desactivado debe persistir.");

localStorage.removeItem(first.STORAGE_KEY);
localStorage.removeItem(first.SEED_VERSION_KEY);
const reset = await loadStorage();
const resetCards = reset.storage.getCards();
assert.equal(resetCards.length, 16, "Al eliminar ambas claves debe cargarse de nuevo el seed completo.");
assert.equal(new Set(resetCards.map(card => card.id)).size, 16, "Los IDs deben ser únicos.");
assert.equal(new Set(resetCards.map(card => card.slug)).size, 16, "Los slugs deben ser únicos.");

const francisco = resetCards.filter(card => card.firstName === "FRANCISCO JAVIER" && card.lastName === "PEDRAZA CALVO");
assert.equal(francisco.length, 2, "Francisco Javier debe tener exactamente dos tarjetas.");
assert.deepEqual(new Set(francisco.map(card => card.slug)), new Set([
  "francisco-javier-pedraza-calvo-cfo",
  "francisco-javier-pedraza-calvo-consejo-asesor",
]));
assert.equal(new Set(francisco.map(card => card.id)).size, 2, "Los IDs de Francisco Javier deben ser distintos.");
assert.equal(new Set(francisco.map(card => card.photo)).size, 1, "Las dos tarjetas deben reutilizar la misma foto.");

const urls = francisco.map(card => getPublicCardUrl(card, "http://127.0.0.1:8080/index.html"));
assert.equal(new Set(urls).size, 2, "Cada variante debe generar una URL pública propia.");
const qrCodes = urls.map(url => buildQrSvg(url, qrcode));
assert.equal(new Set(qrCodes).size, 2, "Cada variante debe generar un QR propio.");
assert.ok(qrCodes.every(value => value.startsWith("<svg")), "Los QR deben generarse localmente como SVG.");
const vcards = francisco.map(buildVcard);
assert.ok(vcards.some(value => value.includes("TITLE:CFO")), "El VCF de CFO debe contener su cargo.");
assert.ok(vcards.some(value => value.includes("TITLE:Consejo Asesor")), "El VCF de Consejo Asesor debe contener su cargo.");
assert.equal(new Set(francisco.map(getVcardFilename)).size, 2, "Cada variante debe generar un archivo VCF propio.");

const secondReload = await loadStorage();
assert.equal(secondReload.storage.getCards().length, 16, "La segunda recarga tras reinicializar no debe duplicar datos.");

const { cardService } = await import(`../assets/js/cards.js?test=${importSequence++}`);
assert.equal(cardService.query({ search: "javier.pedraza@lognext.com" }).length, 2, "La búsqueda por email debe devolver ambas variantes.");
assert.equal(cardService.query({ search: "CFO" }).length, 1, "La búsqueda por cargo debe encontrar la variante CFO.");
assert.equal(cardService.query({ department: "STAFF" }).length, 16, "El filtro de departamento debe conservar todas las tarjetas STAFF.");
assert.equal(cardService.query({ status: "active" }).length, 16, "El filtro de estado debe devolver las 16 tarjetas activas.");
const framedSource = cardService.update(francisco[0].id, {photoFrame: {x: 38, y: 64, scale: 1.35}});
const duplicated = cardService.duplicate(framedSource.id);
assert.equal(cardService.all().length, 17, "Duplicar debe crear una tarjeta adicional.");
assert.notEqual(duplicated.id, francisco[0].id, "La tarjeta duplicada debe recibir otro ID.");
assert.deepEqual(duplicated.photoFrame, framedSource.photoFrame, "La tarjeta duplicada debe conservar el encuadre inicial.");
cardService.remove(duplicated.id);
assert.equal(cardService.all().length, 16, "Eliminar debe retirar únicamente la tarjeta indicada.");
cardService.toggleDisabled(francisco[0].id);
assert.equal(cardService.get(francisco[0].id).status, "disabled", "Desactivar debe cambiar el estado por ID.");
cardService.toggleDisabled(francisco[0].id);

const legacyDemoCards = [
  { id: "irma-rivera", slug: "irma-rivera-molins", email: "irma.rivera@lognext.com", jobTitle: "People & Culture", status: "active", template: "corporate-navy" },
  { id: "laura-cabrera", slug: "laura-cabrera", email: "laura.cabrera@lognext.com", jobTitle: "Administration", status: "draft", template: "clean-light" },
  { id: "miguel-saiz", slug: "miguel-angel-saiz", email: "miguel.saiz@lognext.com", jobTitle: "Director de Operaciones", status: "active", template: "meaningful-tech" },
];
localStorage.setItem(first.STORAGE_KEY, JSON.stringify([...legacyDemoCards, { ...seed[0], id: "manual-preserved", slug: "manual-preserved", email: "manual@lognext.com", jobTitle: "Manual" }]));
localStorage.removeItem(first.SEED_VERSION_KEY);
const migrated = (await loadStorage()).storage.getCards();
assert.equal(migrated.length, 17, "La migración debe sustituir demos intactos y conservar tarjetas manuales.");
assert.ok(migrated.some(card => card.id === "manual-preserved"), "La tarjeta manual debe conservarse.");
assert.ok(legacyDemoCards.every(demo => !migrated.some(card => card.id === demo.id)), "Los demos intactos deben eliminarse.");

localStorage.setItem(first.STORAGE_KEY, JSON.stringify([{...seed[0], photoPosition: "top"}]));
localStorage.setItem(first.SEED_VERSION_KEY, "1");
const frameMigration = await loadStorage();
const migratedFrameCard = frameMigration.storage.getCards()[0];
assert.deepEqual(migratedFrameCard.photoFrame, {x: 50, y: 0, scale: 1}, "La migración debe convertir el encuadre superior antiguo.");
assert.ok(!("photoPosition" in migratedFrameCard), "La migración debe retirar el campo antiguo.");
assert.equal(localStorage.getItem(first.SEED_VERSION_KEY), "2", "La migración debe actualizar la versión de tarjetas.");
frameMigration.storage.restoreInitialData();

const importStorage = await loadStorage();
const beforeInvalidImport = localStorage.getItem(importStorage.STORAGE_KEY);
assert.throws(() => importStorage.storage.importCards("{json roto"), /JSON no se puede leer/);
assert.equal(localStorage.getItem(importStorage.STORAGE_KEY), beforeInvalidImport, "Un JSON inválido no debe modificar los datos actuales.");
assert.throws(() => importStorage.storage.importCards([{...seed[0], status: "desconocido"}]), /estado debe ser/);
assert.throws(() => importStorage.storage.importCards([{...seed[0], email: "email-invalido"}]), /email no es válido/);
assert.throws(() => importStorage.storage.importCards([seed[0], {...seed[1], id: seed[0].id}]), /IDs de tarjeta duplicados/);
const importedVariants = importStorage.storage.importCards(seed);
assert.equal(importedVariants.filter(card => card.email === "javier.pedraza@lognext.com").length, 2, "La importación debe permitir el mismo email en tarjetas con cargos distintos.");

localStorage.setItem(importStorage.STORAGE_KEY, "{contenido-corrupto");
const originalWarn = console.warn;
console.warn = () => {};
const corruptedStorage = await loadStorage();
assert.deepEqual(corruptedStorage.storage.getCards(), [], "Los datos corruptos deben activar un fallback seguro sin romper la aplicación.");
assert.ok(corruptedStorage.storage.consumeReadError(), "El error de lectura debe poder comunicarse una sola vez a la interfaz.");
assert.equal(corruptedStorage.storage.consumeReadError(), null);
console.warn = originalWarn;
corruptedStorage.storage.restoreInitialData();

console.log("OK: seed, imágenes, persistencia, migración, CRUD, búsqueda, filtros, variantes, importación segura, fallback, URLs, QR locales y VCF verificados.");
