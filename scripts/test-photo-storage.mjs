import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {
  MAX_ORIGINAL_PHOTO_BYTES,
  MAX_PHOTO_DIMENSION,
  PHOTO_DB_NAME,
  PHOTO_REFERENCE_PREFIX,
  PHOTO_SCHEMA_VERSION,
  TARGET_MAX_PHOTO_BYTES,
  formatPhotoBytes,
  getPhotoErrorMessage,
  getPhotoId,
  isIndexedDbPhoto,
  makePhotoReference,
  normalizeCardPhotoFields,
  photoOptimizationSummary,
  savePhoto,
  validatePhotoFile,
} from "../assets/js/photo-storage.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(PHOTO_DB_NAME, "nextcards-photos");
assert.equal(PHOTO_SCHEMA_VERSION, 1);
assert.equal(PHOTO_REFERENCE_PREFIX, "indexeddb:");
assert.equal(MAX_ORIGINAL_PHOTO_BYTES, 10 * 1024 * 1024);
assert.equal(MAX_PHOTO_DIMENSION, 800);
assert.equal(TARGET_MAX_PHOTO_BYTES, 400 * 1024);

const reference = makePhotoReference("photo-card one");
assert.equal(reference, "indexeddb:photo-card%20one");
assert.equal(getPhotoId(reference), "photo-card one");
assert.equal(getPhotoId({photoStorage: "indexeddb", photoId: "photo-direct"}), "photo-direct");
assert.equal(isIndexedDbPhoto({photo: reference}), true);
assert.equal(isIndexedDbPhoto("assets/img/employees/persona.jpg"), false);

const normalizedReference = normalizeCardPhotoFields({photoStorage: "indexeddb", photoId: "photo-1"});
assert.deepEqual(normalizedReference, {
  photo: "indexeddb:photo-1",
  photoStorage: "indexeddb",
  photoId: "photo-1",
  photoSchemaVersion: 1,
});
assert.deepEqual(normalizeCardPhotoFields({photo: "assets/img/employees/persona.jpg", photoStorage: "", photoId: ""}), {photo: "assets/img/employees/persona.jpg"});
assert.equal(normalizeCardPhotoFields({photo: "data:image/png;base64,AAAA"}).photo, "data:image/png;base64,AAAA");

for (const [name, type] of [["foto.jpg", "image/jpeg"], ["foto.jpeg", "image/jpg"], ["foto.png", "image/png"], ["foto.webp", "image/webp"]]) {
  assert.doesNotThrow(() => validatePhotoFile({name, type, size: 1024}));
}
assert.doesNotThrow(() => validatePhotoFile({name: "foto.jpg", type: "image/jpeg", size: MAX_ORIGINAL_PHOTO_BYTES}));
assert.throws(() => validatePhotoFile({name: "foto.jpg", type: "image/jpeg", size: MAX_ORIGINAL_PHOTO_BYTES + 1}), error => error.code === "PHOTO_TOO_LARGE");
assert.throws(() => validatePhotoFile({name: "foto.jpg", type: "image/jpeg", size: 0}), error => error.code === "PHOTO_EMPTY");
assert.throws(() => validatePhotoFile({name: "foto.jpg", type: "text/plain", size: 50}), error => error.code === "PHOTO_FORMAT_UNSUPPORTED");
assert.throws(() => validatePhotoFile({name: "foto.gif", type: "image/png", size: 50}), error => error.code === "PHOTO_FORMAT_UNSUPPORTED");
assert.match(getPhotoErrorMessage({name: "QuotaExceededError"}), /No hay espacio suficiente/);
assert.equal(getPhotoErrorMessage({code: "PHOTO_FORMAT_UNSUPPORTED"}), "Formato de imagen no compatible");
assert.equal(formatPhotoBytes(1478492), "1,41 MB");
assert.match(photoOptimizationSummary({original:{bytes:1478492,width:1600,height:1600},final:{bytes:190464,width:800,height:800,type:"image/webp"}}), /1,41 MB → 186 KB · 1600×1600 → 800×800 · WEBP/);

const [storageSource, editorSource, frameSource, cardsSource, settingsSource, indexSource] = await Promise.all([
  read("assets/js/photo-storage.js"),
  read("assets/js/editor.js"),
  read("assets/js/photo-frame.js"),
  read("assets/js/cards.js"),
  read("assets/js/settings-data.js"),
  read("index.html"),
]);

assert.match(storageSource, /indexedDB\.open\(PHOTO_DB_NAME, PHOTO_DB_VERSION\)/);
assert.match(storageSource, /createObjectStore\(PHOTO_STORE_NAME/);
assert.match(storageSource, /imageOrientation: "from-image"/);
assert.match(storageSource, /canvasBlob\(canvas, "image\/webp"/);
assert.match(storageSource, /canvasBlob\(jpegCanvas, "image\/jpeg"/);
assert.match(storageSource, /URL\.revokeObjectURL/);
assert.match(storageSource, /deletePhotoIfUnused/);
assert.match(storageSource, /pruneUnusedPhotos/);
assert.doesNotMatch(editorSource, /readAsDataURL|La imagen supera 1 MB/);
assert.match(editorSource, /Procesando imagen…/);
assert.match(editorSource, /Imagen actualizada/);
assert.match(editorSource, /await canRenderPhoto\(saved\)/);
assert.match(editorSource, /storage\.saveCards\(cardsBefore\)/);
assert.match(frameSource, /setPhotoImageSource/);
assert.match(cardsSource, /deletePhotoIfUnused\(current,remaining\)/);
assert.match(cardsSource, /return this\.create\(\{\.\.\.source/);
assert.match(settingsSource, /included: false/);
assert.match(indexSource, /Hasta 10 MB; se optimiza antes de guardar/);
assert.match(indexSource, /aria-live="polite"/);
assert.match(indexSource, /role="alert"/);

const quotaTransaction = {
  error: null,
  objectStore() {
    return {
      put() {
        queueMicrotask(() => {
          quotaTransaction.error = new DOMException("Test quota exhausted", "QuotaExceededError");
          quotaTransaction.onerror?.();
        });
      },
    };
  },
};
const quotaDatabase = {
  close() {},
  transaction() { return quotaTransaction; },
};
globalThis.indexedDB = {
  open() {
    const request = {result: quotaDatabase};
    queueMicrotask(() => request.onsuccess?.());
    return request;
  },
};
await assert.rejects(
  savePhoto("quota-card", new Blob(["x"], {type: "image/webp"})),
  error => error.code === "PHOTO_STORAGE_QUOTA" && /espacio suficiente/.test(getPhotoErrorMessage(error)),
);
delete globalThis.indexedDB;

const persistenceIndex = editorSource.indexOf("cardService.update(existingId,data)");
const renderCheckIndex = editorSource.indexOf("await canRenderPhoto(saved)");
const successIndex = editorSource.indexOf('setPhotoStatus("Imagen actualizada","success")');
const rollbackIndex = editorSource.indexOf("storage.saveCards(cardsBefore)");
const errorIndex = editorSource.lastIndexOf('setPhotoStatus(message,"error")');
assert.ok(persistenceIndex >= 0 && renderCheckIndex > persistenceIndex && successIndex > renderCheckIndex, "Photo success must follow persistence and a render check.");
assert.ok(rollbackIndex >= 0 && errorIndex > rollbackIndex, "A late photo failure must roll the card back before reporting the error.");

console.log("OK: validación 10 MB, formatos, referencias IndexedDB, compatibilidad heredada, procesamiento, rollback, limpieza, accesibilidad y resolución central verificadas.");
