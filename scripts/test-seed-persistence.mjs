import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import qrcode from "qrcode-generator";
import { buildVcard, canDisplayPublicCard, getPublicCardUrl, getVcardFilename } from "../assets/js/card-export.js";
import { buildQrSvg } from "../assets/js/qr-code.js";

const seed = JSON.parse(await fs.readFile(new URL("../assets/data/employees.json", import.meta.url), "utf8"));
const legacySeed = seed.filter(card => Number(card.seedIntroducedVersion || 2) <= 2);
const versionThreeSeed = seed.filter(card => Number(card.seedIntroducedVersion || 2) === 3);
const serializedSeed = JSON.stringify(seed);
const privatePathPattern = new RegExp([
  `[A-Za-z]${String.fromCharCode(58, 92, 92)}`,
  ["hector", "plaza"].join(`${String.fromCharCode(92)}.`),
  ["One", "Drive"].join(""),
  ["Imagenes", "Corporativas"].join(""),
  ["Departamento", "IT"].join(" "),
].join("|"), "i");

assert.equal(seed.length, 31, "El seed ampliado debe contener 31 tarjetas.");
assert.equal(legacySeed.length, 16, "Las 16 tarjetas anteriores deben conservarse sin regenerar.");
assert.equal(versionThreeSeed.length, 15, "La versión 3 debe introducir exactamente 15 tarjetas.");
assert.equal(new Set(seed.map(card => card.id)).size, seed.length, "Todos los IDs del seed deben ser únicos.");
assert.equal(new Set(seed.map(card => card.slug)).size, seed.length, "Todos los slugs del seed deben ser únicos.");
assert.equal(new Set(seed.map(card => `${card.firstName} ${card.lastName}`)).size, 30, "El seed debe representar 30 personas y una variante de cargo.");
assert.ok(seed.filter(card => !card.photo).every(card => card.visibleFields?.photo !== false), "Las personas sin fotografía deben conservar visible el fallback de iniciales.");
assert.doesNotMatch(serializedSeed, privatePathPattern, "El seed no puede contener rutas personales.");
assert.doesNotMatch(serializedSeed, /data:image|base64/i, "El seed no puede contener imágenes base64.");
assert.doesNotMatch(serializedSeed, /(?:^|:)null|undefined/i, "El seed no debe serializar valores nulos o indefinidos.");

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
  get length() { return this.#values.size; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
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
assert.equal(first.storage.getCards().length, 31, "La primera apertura debe cargar las 31 tarjetas.");
assert.equal(localStorage.getItem(first.SEED_VERSION_KEY), "3", "Debe registrarse la versión 3 del seed.");
assert.ok(first.storage.getCards().every(card => card.photoFrame?.x === 50 && card.photoFrame?.y === 50 && card.photoFrame?.scale === 1), "Todas las tarjetas deben recibir un encuadre compatible.");

const firstReload = await loadStorage();
assert.equal(firstReload.storage.getCards().length, 31, "La primera recarga no debe duplicar tarjetas.");

const edited = firstReload.storage.getCards();
edited[0].cardName = "Cambio persistente de prueba";
edited[0].status = "draft";
edited[0].template = "clean-light";
edited[0].photoFrame = {x: 37, y: 68, scale: 1.4};
firstReload.storage.saveCards(edited);
const persistedEdit = (await loadStorage()).storage.getCards().find(card => card.id === edited[0].id);
assert.equal(persistedEdit.cardName, "Cambio persistente de prueba", "La edición debe persistir.");
assert.equal(persistedEdit.status, "draft");
assert.equal(persistedEdit.template, "clean-light");
assert.deepEqual(persistedEdit.photoFrame, {x: 37, y: 68, scale: 1.4});

firstReload.storage.restoreInitialData();
const resetCards = firstReload.storage.getCards();
assert.equal(resetCards.length, 31, "Restaurar debe cargar de nuevo el seed completo.");
assert.equal(new Set(resetCards.map(card => card.id)).size, 31, "Los IDs deben seguir siendo únicos.");
assert.equal(new Set(resetCards.map(card => card.slug)).size, 31, "Los slugs deben seguir siendo únicos.");

const francisco = resetCards.filter(card => card.firstName === "FRANCISCO JAVIER" && card.lastName === "PEDRAZA CALVO");
assert.equal(francisco.length, 2, "Francisco Javier debe tener exactamente dos tarjetas.");
assert.deepEqual(new Set(francisco.map(card => card.slug)), new Set([
  "francisco-javier-pedraza-calvo-cfo",
  "francisco-javier-pedraza-calvo-consejo-asesor",
]));
assert.equal(new Set(francisco.map(card => card.id)).size, 2, "Los IDs de Francisco Javier deben ser distintos.");
assert.equal(new Set(francisco.map(card => card.photo)).size, 1, "Las dos tarjetas deben reutilizar la misma foto.");

const urls = francisco.map(card => getPublicCardUrl(card, "http://127.0.0.1:8765/index.html"));
assert.equal(new Set(urls).size, 2, "Cada variante debe generar una URL pública propia.");
const qrCodes = urls.map(url => buildQrSvg(url, qrcode));
assert.equal(new Set(qrCodes).size, 2, "Cada variante debe generar un QR propio.");
assert.ok(qrCodes.every(value => value.startsWith("<svg")), "Los QR deben generarse localmente como SVG.");
const vcards = francisco.map(buildVcard);
assert.ok(vcards.some(value => value.includes("TITLE:CFO")), "El VCF de CFO debe contener su cargo.");
assert.ok(vcards.some(value => value.includes("TITLE:Consejo Asesor")), "El VCF de Consejo Asesor debe contener su cargo.");
assert.equal(new Set(francisco.map(getVcardFilename)).size, 2, "Cada variante debe generar un archivo VCF propio.");

const { cardService } = await import(`../assets/js/cards.js?test=${importSequence++}`);
assert.equal(cardService.query({ search: "javier.pedraza@lognext.com" }).length, 2, "La búsqueda por email debe devolver ambas variantes.");
assert.equal(cardService.query({ search: "CFO" }).length, 1, "La búsqueda por cargo debe encontrar la variante CFO.");
assert.equal(cardService.query({ search: "MARIEMMA" }).length, 1, "La búsqueda debe localizar una nueva tarjeta por nombre.");
assert.equal(cardService.query({ department: "STAFF" }).length, 31, "El filtro de departamento debe conservar todas las tarjetas STAFF.");
assert.equal(cardService.query({ status: "active" }).length, 31, "El filtro de estado debe devolver las 31 tarjetas activas.");

const statusTarget=francisco[0];
assert.equal(cardService.toggleDisabled(statusTarget.id).status,"disabled","Desactivar debe retirar la tarjeta de publicación.");
assert.equal(canDisplayPublicCard(cardService.get(statusTarget.id),"admin_preview"),false,"Una tarjeta desactivada no debe abrirse ni como preview.");
assert.equal(cardService.toggleDisabled(statusTarget.id).status,"active","Reactivar debe devolver directamente la tarjeta a estado activo.");
assert.equal(canDisplayPublicCard(cardService.get(statusTarget.id),"direct"),true);
assert.equal(canDisplayPublicCard({...statusTarget,status:"draft"},"direct"),false,"Un borrador no debe ser público por enlace directo.");
assert.equal(canDisplayPublicCard({...statusTarget,status:"draft"},"admin_preview"),true,"Un borrador debe admitir la revisión administrativa controlada.");

const framedSource = cardService.update(francisco[0].id, {photoFrame: {x: 38, y: 64, scale: 1.35}});
const duplicated = cardService.duplicate(framedSource.id);
assert.equal(cardService.all().length, 32, "Duplicar debe crear una tarjeta adicional.");
assert.notEqual(duplicated.id, francisco[0].id, "La tarjeta duplicada debe recibir otro ID.");
assert.deepEqual(duplicated.photoFrame, framedSource.photoFrame, "La tarjeta duplicada debe conservar el encuadre inicial.");
cardService.remove(duplicated.id);
assert.equal(cardService.all().length, 31, "Eliminar una tarjeta manual debe retirar únicamente esa tarjeta.");
assert.ok(!firstReload.storage.getDeletedSeedIds().includes(duplicated.id), "Una copia manual no debe crear un tombstone de seed.");

// Migración realista: navegador v2 con una edición, una alta manual y una tarjeta antigua eliminada.
localStorage.clear();
const editedLegacy = {...legacySeed[0], cardName: "Edición local preservada", status: "draft", template: "clean-light", photoFrame: {x: 23, y: 71, scale: 1.6}};
const deletedLegacy = legacySeed[1];
const manualCard = {...legacySeed[0], id: "manual-preserved", slug: "manual-preserved", cardName: "Tarjeta manual preservada", firstName: "PERSONA", lastName: "MANUAL", email: "manual@lognext.com", jobTitle: "Rol manual"};
const browserV2Cards = legacySeed.filter(card => card.id !== deletedLegacy.id).map(card => card.id === editedLegacy.id ? editedLegacy : card);
browserV2Cards.push(manualCard);
localStorage.setItem(first.STORAGE_KEY, JSON.stringify(browserV2Cards));
localStorage.setItem(first.SEED_VERSION_KEY, "2");

const migratedV3 = await loadStorage();
const migratedCards = migratedV3.storage.getCards();
assert.equal(migratedCards.length, 31, "La migración debe añadir 15 nuevas, conservar una manual y respetar una antigua eliminada.");
assert.equal(localStorage.getItem(first.SEED_VERSION_KEY), "3", "La migración debe actualizar la versión a 3.");
assert.equal(migratedCards.filter(card => versionThreeSeed.some(seedCard => seedCard.id === card.id)).length, 15, "Deben añadirse solo las 15 tarjetas introducidas en v3.");
assert.ok(migratedCards.some(card => card.id === manualCard.id), "La tarjeta manual debe conservarse.");
assert.ok(!migratedCards.some(card => card.id === deletedLegacy.id), "Una tarjeta antigua eliminada no debe reaparecer.");
const migratedEdited = migratedCards.find(card => card.id === editedLegacy.id);
assert.equal(migratedEdited.cardName, "Edición local preservada");
assert.equal(migratedEdited.status, "draft");
assert.equal(migratedEdited.template, "clean-light");
assert.deepEqual(migratedEdited.photoFrame, {x: 23, y: 71, scale: 1.6});
const migratedIds = migratedCards.map(card => card.id).sort();
assert.deepEqual((await loadStorage()).storage.getCards().map(card => card.id).sort(), migratedIds, "Una segunda recarga debe ser idempotente.");

// Una tarjeta v3 eliminada queda registrada y no reaparece aunque se vuelva a evaluar la migración.
const { cardService: migratedCardService } = await import(`../assets/js/cards.js?migration=${importSequence++}`);
const deletedV3 = versionThreeSeed[0];
migratedCardService.remove(deletedV3.id);
assert.ok(migratedV3.storage.getDeletedSeedIds().includes(deletedV3.id), "Eliminar una tarjeta del seed debe registrar su ID.");
localStorage.setItem(first.SEED_VERSION_KEY, "2");
const replayedMigration = await loadStorage();
assert.ok(!replayedMigration.storage.getCards().some(card => card.id === deletedV3.id), "El tombstone debe impedir que una tarjeta v3 eliminada reaparezca.");
replayedMigration.storage.restoreInitialData();
assert.equal(replayedMigration.storage.getCards().length, 31, "Restaurar explícitamente debe recuperar todas las tarjetas.");
assert.deepEqual(replayedMigration.storage.getDeletedSeedIds(), [], "Restaurar explícitamente debe limpiar los tombstones.");

// Recuperación ante una respuesta antigua de employees.json que ya hubiera marcado v3.
localStorage.clear();
localStorage.setItem(first.STORAGE_KEY, JSON.stringify(legacySeed));
localStorage.setItem(first.SEED_VERSION_KEY, "3");
const reconciledCurrentVersion = await loadStorage();
assert.equal(reconciledCurrentVersion.storage.getCards().length, 31, "La versión actual debe reconciliar las altas v3 ausentes sin duplicar las antiguas.");
assert.equal(reconciledCurrentVersion.storage.getCards().filter(card => versionThreeSeed.some(item => item.id === card.id)).length, 15);
reconciledCurrentVersion.storage.restoreInitialData();

const legacyDemoCards = [
  { id: "irma-rivera", slug: "irma-rivera-molins", email: "irma.rivera@lognext.com", jobTitle: "People & Culture", status: "active", template: "corporate-navy" },
  { id: "laura-cabrera", slug: "laura-cabrera", email: "laura.cabrera@lognext.com", jobTitle: "Administration", status: "draft", template: "clean-light" },
  { id: "miguel-saiz", slug: "miguel-angel-saiz", email: "miguel.saiz@lognext.com", jobTitle: "Director de Operaciones", status: "active", template: "meaningful-tech" },
];
localStorage.setItem(first.STORAGE_KEY, JSON.stringify([...legacyDemoCards, manualCard]));
localStorage.removeItem(first.SEED_VERSION_KEY);
const migratedLegacyDemo = (await loadStorage()).storage.getCards();
assert.equal(migratedLegacyDemo.length, 32, "La primera migración debe sustituir demos intactos, cargar el seed y conservar tarjetas manuales.");
assert.ok(migratedLegacyDemo.some(card => card.id === manualCard.id), "La tarjeta manual debe conservarse.");
assert.ok(legacyDemoCards.every(demo => !migratedLegacyDemo.some(card => card.id === demo.id)), "Los demos intactos deben eliminarse.");

localStorage.setItem(first.STORAGE_KEY, JSON.stringify([{...seed[0], photoPosition: "top"}]));
localStorage.setItem(first.SEED_VERSION_KEY, "1");
const frameMigration = await loadStorage();
const migratedFrameCard = frameMigration.storage.getCards().find(card => card.id === seed[0].id);
assert.deepEqual(migratedFrameCard.photoFrame, {x: 50, y: 0, scale: 1}, "La migración debe convertir el encuadre superior antiguo.");
assert.ok(!("photoPosition" in migratedFrameCard), "La migración debe retirar el campo antiguo.");
assert.equal(frameMigration.storage.getCards().length, 31, "La migración desde v1 debe completar el seed sin duplicar la tarjeta existente.");
assert.equal(localStorage.getItem(first.SEED_VERSION_KEY), "3", "La migración debe actualizar la versión de tarjetas.");
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

console.log("OK: seed v3, 31 tarjetas, imágenes, migración incremental, tombstones, persistencia, CRUD, búsqueda, filtros, variantes, importación, URLs, QR y VCF verificados.");
