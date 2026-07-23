export const PHOTO_DB_NAME = "nextcards-photos";
export const PHOTO_DB_VERSION = 1;
export const PHOTO_STORE_NAME = "photos";
export const PHOTO_SCHEMA_VERSION = 1;
export const PHOTO_REFERENCE_PREFIX = "indexeddb:";
export const MAX_ORIGINAL_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_DIMENSION = 800;
export const TARGET_MAX_PHOTO_BYTES = 400 * 1024;

const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const IMAGE_HANDLE = Symbol("nextcardsPhotoHandle");
let databasePromise = null;

function photoError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

export function isPhotoStorageQuotaError(error) {
  return error?.name === "QuotaExceededError" || error?.code === "PHOTO_STORAGE_QUOTA";
}

export function getPhotoErrorMessage(error) {
  if (isPhotoStorageQuotaError(error)) return "No hay espacio suficiente para guardar la fotografía. Prueba con otra imagen o elimina fotografías locales que ya no necesites.";
  if (error?.code === "PHOTO_FORMAT_UNSUPPORTED") return "Formato de imagen no compatible";
  if (error?.code === "PHOTO_TOO_LARGE") return "La imagen supera el máximo permitido de 10 MB";
  if (["PHOTO_EMPTY", "PHOTO_DECODE_FAILED", "PHOTO_READ_FAILED"].includes(error?.code)) return "El archivo está dañado o no puede leerse";
  if (["PHOTO_STORAGE_UNAVAILABLE", "PHOTO_STORAGE_FAILED", "PHOTO_NOT_FOUND"].includes(error?.code)) return "No se pudo guardar la imagen";
  return error?.message || "No se pudo guardar la imagen";
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || photoError("PHOTO_STORAGE_FAILED", "La operación de fotografías se canceló."));
    transaction.onerror = () => reject(transaction.error || photoError("PHOTO_STORAGE_FAILED", "No se pudo completar la operación de fotografías."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || photoError("PHOTO_STORAGE_FAILED", "No se pudo acceder a la fotografía."));
  });
}

export function openPhotoDatabase() {
  if (databasePromise) return databasePromise;
  if (!globalThis.indexedDB) return Promise.reject(photoError("PHOTO_STORAGE_UNAVAILABLE", "IndexedDB no está disponible en este navegador."));
  databasePromise = new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PHOTO_STORE_NAME)) {
        const store = database.createObjectStore(PHOTO_STORE_NAME, {keyPath: "id"});
        store.createIndex("cardId", "cardId", {unique: false});
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(photoError("PHOTO_STORAGE_UNAVAILABLE", "No se pudo abrir el almacenamiento de fotografías.", request.error));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(photoError("PHOTO_STORAGE_UNAVAILABLE", "Otra pestaña está bloqueando el almacenamiento de fotografías."));
    };
  });
  return databasePromise;
}

const normalizedPhotoId = value => String(value || "").trim();

export function makePhotoReference(photoId) {
  const id = normalizedPhotoId(photoId);
  return id ? `${PHOTO_REFERENCE_PREFIX}${encodeURIComponent(id)}` : "";
}

export function getPhotoId(value) {
  if (value && typeof value === "object") {
    if (value.photoStorage === "indexeddb" && value.photoId) return normalizedPhotoId(value.photoId);
    return getPhotoId(value.photo);
  }
  const source = String(value || "");
  if (!source.startsWith(PHOTO_REFERENCE_PREFIX)) return "";
  try { return decodeURIComponent(source.slice(PHOTO_REFERENCE_PREFIX.length)); }
  catch { return source.slice(PHOTO_REFERENCE_PREFIX.length); }
}

export function isIndexedDbPhoto(value) {
  return Boolean(getPhotoId(value));
}

export function normalizeCardPhotoFields(card = {}) {
  const normalized = {...card};
  const photoId = getPhotoId(normalized);
  if (photoId) {
    normalized.photo = makePhotoReference(photoId);
    normalized.photoStorage = "indexeddb";
    normalized.photoId = photoId;
    normalized.photoSchemaVersion = PHOTO_SCHEMA_VERSION;
  } else {
    if (normalized.photoStorage === "indexeddb") normalized.photo = "";
    delete normalized.photoStorage;
    delete normalized.photoId;
    delete normalized.photoSchemaVersion;
  }
  return normalized;
}

function createPhotoId(cardId) {
  const stableCardId = String(cardId || "card").replace(/[^a-z0-9-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 80) || "card";
  const unique = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `photo-${stableCardId}-${unique}`;
}

function validateStoredBlob(blob) {
  if (!(blob instanceof Blob) || !blob.size) throw photoError("PHOTO_EMPTY", "La fotografía procesada está vacía.");
  const type = String(blob.type || "").toLowerCase();
  if (!ACCEPTED_MIME_TYPES.has(type)) throw photoError("PHOTO_FORMAT_UNSUPPORTED", "El formato procesado no es compatible.");
}

export async function savePhoto(cardId, blob, {photoId = createPhotoId(cardId), metadata = {}} = {}) {
  validateStoredBlob(blob);
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  const record = {
    id: normalizedPhotoId(photoId),
    cardId: String(cardId || ""),
    blob,
    metadata: {...metadata},
    schemaVersion: PHOTO_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
  };
  try {
    transaction.objectStore(PHOTO_STORE_NAME).put(record);
    await completed;
  } catch (error) {
    if (error?.name === "QuotaExceededError") throw photoError("PHOTO_STORAGE_QUOTA", "No hay espacio suficiente para guardar la fotografía.", error);
    if (error?.name === "TransactionInactiveError") throw photoError("PHOTO_STORAGE_FAILED", "La operación de guardado de la fotografía caducó.", error);
    throw photoError("PHOTO_STORAGE_FAILED", "No se pudo guardar la fotografía en el navegador.", error);
  }
  return {
    photo: makePhotoReference(record.id),
    photoStorage: "indexeddb",
    photoId: record.id,
    photoSchemaVersion: PHOTO_SCHEMA_VERSION,
  };
}

export async function getPhoto(value) {
  const photoId = getPhotoId(value) || normalizedPhotoId(value);
  if (!photoId) return null;
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readonly");
  const completed = transactionComplete(transaction);
  const result = await requestResult(transaction.objectStore(PHOTO_STORE_NAME).get(photoId));
  await completed;
  return result || null;
}

export async function deletePhoto(value) {
  const photoId = getPhotoId(value) || normalizedPhotoId(value);
  if (!photoId || !globalThis.indexedDB) return false;
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  transaction.objectStore(PHOTO_STORE_NAME).delete(photoId);
  await completed;
  return true;
}

export async function replacePhoto(cardId, previousPhoto, blob, options = {}) {
  const next = await savePhoto(cardId, blob, options);
  return {
    ...next,
    finalize: cards => deletePhotoIfUnused(previousPhoto, cards),
    rollback: () => deletePhoto(next.photoId),
  };
}

export async function deletePhotoIfUnused(value, cards = []) {
  const photoId = getPhotoId(value);
  if (!photoId) return false;
  const stillUsed = cards.some(card => getPhotoId(card) === photoId);
  if (stillUsed) return false;
  return deletePhoto(photoId);
}

export async function clearAllPhotos() {
  if (!globalThis.indexedDB) return 0;
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore(PHOTO_STORE_NAME);
  const count = await requestResult(store.count());
  store.clear();
  await completed;
  return Number(count || 0);
}

export async function pruneUnusedPhotos(cards = []) {
  if (!globalThis.indexedDB) return 0;
  const referenced = new Set(cards.map(getPhotoId).filter(Boolean));
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readwrite");
  const completed = transactionComplete(transaction);
  const store = transaction.objectStore(PHOTO_STORE_NAME);
  const records = await requestResult(store.getAll());
  const unused = records.filter(record => !referenced.has(record.id));
  unused.forEach(record => store.delete(record.id));
  await completed;
  return unused.length;
}

export async function getPhotoStorageUsage() {
  if (!globalThis.indexedDB) return {count: 0, bytes: 0, database: PHOTO_DB_NAME};
  const database = await openPhotoDatabase();
  const transaction = database.transaction(PHOTO_STORE_NAME, "readonly");
  const completed = transactionComplete(transaction);
  const records = await requestResult(transaction.objectStore(PHOTO_STORE_NAME).getAll());
  await completed;
  return {
    count: records.length,
    bytes: records.reduce((total, record) => total + Number(record?.blob?.size || 0), 0),
    database: PHOTO_DB_NAME,
  };
}

function sourceKind(source) {
  if (/^data:image\//i.test(source)) return "data-url";
  if (/^blob:/i.test(source)) return "object-url";
  if (/^https?:/i.test(source)) return "remote-url";
  return "relative-path";
}

export async function resolvePhotoSource(value) {
  const photoId = getPhotoId(value);
  if (photoId) {
    const record = await getPhoto(photoId);
    if (!record?.blob) throw photoError("PHOTO_NOT_FOUND", "No se encontró la fotografía guardada.");
    const src = URL.createObjectURL(record.blob);
    let active = true;
    return {
      src,
      kind: "indexeddb",
      photoId,
      blob: record.blob,
      revoke() {
        if (!active) return;
        active = false;
        URL.revokeObjectURL(src);
      },
    };
  }
  const source = typeof value === "object" ? String(value?.photo || "") : String(value || "");
  if (!source) throw photoError("PHOTO_NOT_FOUND", "La tarjeta no tiene fotografía.");
  return {src: source, kind: sourceKind(source), photoId: "", blob: null, revoke() {}};
}

export function releasePhotoImage(image) {
  image?.[IMAGE_HANDLE]?.revoke?.();
  if (image) delete image[IMAGE_HANDLE];
}

export async function setPhotoImageSource(image, value, {onLoad, onError} = {}) {
  if (!image) throw photoError("PHOTO_RENDER_FAILED", "No existe un elemento donde mostrar la fotografía.");
  releasePhotoImage(image);
  const token = {};
  image[IMAGE_HANDLE] = {token, revoke() {}};
  try {
    const handle = await resolvePhotoSource(value);
    if (image[IMAGE_HANDLE]?.token !== token) { handle.revoke(); return false; }
    image[IMAGE_HANDLE] = {token, revoke: handle.revoke};
    image.dataset.photoSourceKind = handle.kind;
    await new Promise((resolve, reject) => {
      let settled = false;
      const loaded = () => { if (settled) return; settled = true; cleanup(); handle.revoke(); if (image[IMAGE_HANDLE]?.token === token) delete image[IMAGE_HANDLE]; onLoad?.(); resolve(); };
      const failed = () => { if (settled) return; settled = true; cleanup(); handle.revoke(); if (image[IMAGE_HANDLE]?.token === token) delete image[IMAGE_HANDLE]; reject(photoError("PHOTO_RENDER_FAILED", "No se pudo renderizar la fotografía.")); };
      const cleanup = () => {
        image.removeEventListener("load", loaded);
        image.removeEventListener("error", failed);
      };
      image.addEventListener("load", loaded, {once: true});
      image.addEventListener("error", failed, {once: true});
      image.src = handle.src;
      if (image.complete && image.naturalWidth) queueMicrotask(loaded);
    });
    return true;
  } catch (error) {
    if (image[IMAGE_HANDLE]?.token === token) delete image[IMAGE_HANDLE];
    onError?.(error);
    return false;
  }
}

export async function canRenderPhoto(value) {
  if (!value) return true;
  if (typeof Image === "undefined") {
    if (isIndexedDbPhoto(value)) return Boolean(await getPhoto(value));
    return true;
  }
  const image = new Image();
  return setPhotoImageSource(image, value);
}

function extensionOf(name = "") {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function validatePhotoFile(file) {
  if (!file || typeof file.size !== "number") throw photoError("PHOTO_READ_FAILED", "No se pudo leer el archivo seleccionado.");
  if (file.size <= 0) throw photoError("PHOTO_EMPTY", "El archivo seleccionado está vacío.");
  if (file.size > MAX_ORIGINAL_PHOTO_BYTES) throw photoError("PHOTO_TOO_LARGE", "La imagen supera el máximo permitido de 10 MB.");
  const mime = String(file.type || "").toLowerCase();
  const extension = extensionOf(file.name);
  if (!ACCEPTED_MIME_TYPES.has(mime)) throw photoError("PHOTO_FORMAT_UNSUPPORTED", "El MIME de la imagen no es compatible.");
  if (extension && !ACCEPTED_EXTENSIONS.has(extension)) throw photoError("PHOTO_FORMAT_UNSUPPORTED", "La extensión de la imagen no es compatible.");
  return {mime, extension, bytes: file.size};
}

function canvasBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

async function decodePhoto(blob) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, {imageOrientation: "from-image"});
      if (!bitmap.width || !bitmap.height) throw new Error("Dimensiones no válidas");
      return {drawable: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.()};
    } catch (error) {
      if (typeof Image === "undefined") throw photoError("PHOTO_DECODE_FAILED", "La imagen no puede decodificarse.", error);
    }
  }
  if (typeof Image === "undefined") throw photoError("PHOTO_DECODE_FAILED", "El navegador no puede decodificar la imagen.");
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = source;
    if (image.decode) await image.decode();
    else await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Dimensiones no válidas");
    return {drawable: image, width: image.naturalWidth, height: image.naturalHeight, close() {}};
  } catch (error) {
    throw photoError("PHOTO_DECODE_FAILED", "La imagen está dañada o no puede leerse.", error);
  } finally {
    URL.revokeObjectURL(source);
  }
}

function dimensionsWithin(width, height, maximum) {
  const ratio = Math.min(1, maximum / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio))};
}

async function encodeCanvas(canvas, drawable) {
  const preferred = await canvasBlob(canvas, "image/webp", 0.76);
  if (preferred?.type === "image/webp") {
    if (preferred.size <= TARGET_MAX_PHOTO_BYTES) return preferred;
    return await canvasBlob(canvas, "image/webp", 0.58) || preferred;
  }

  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = canvas.width;
  jpegCanvas.height = canvas.height;
  const context = jpegCanvas.getContext("2d", {alpha: false});
  if (!context) throw photoError("PHOTO_PROCESS_FAILED", "No se pudo preparar el procesador de imagen.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  context.drawImage(drawable, 0, 0, jpegCanvas.width, jpegCanvas.height);
  const jpeg = await canvasBlob(jpegCanvas, "image/jpeg", 0.78);
  if (!jpeg) throw photoError("PHOTO_PROCESS_FAILED", "No se pudo codificar la fotografía.");
  if (jpeg.size <= TARGET_MAX_PHOTO_BYTES) return jpeg;
  return await canvasBlob(jpegCanvas, "image/jpeg", 0.58) || jpeg;
}

export async function verifyPhotoBlob(blob) {
  validateStoredBlob(blob);
  const decoded = await decodePhoto(blob);
  decoded.close();
  return {width: decoded.width, height: decoded.height};
}

export async function processPhotoFile(file) {
  const source = validatePhotoFile(file);
  let decoded;
  try { decoded = await decodePhoto(file); }
  catch (error) {
    if (error?.code) throw error;
    throw photoError("PHOTO_READ_FAILED", "El archivo está dañado o no puede leerse.", error);
  }
  const original = {width: decoded.width, height: decoded.height};
  try {
    const finalDimensions = dimensionsWithin(original.width, original.height, MAX_PHOTO_DIMENSION);
    const canvas = document.createElement("canvas");
    canvas.width = finalDimensions.width;
    canvas.height = finalDimensions.height;
    const context = canvas.getContext("2d", {alpha: true});
    if (!context) throw photoError("PHOTO_PROCESS_FAILED", "No se pudo preparar el procesador de imagen.");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.drawable, 0, 0, canvas.width, canvas.height);
    const finalBlob = await encodeCanvas(canvas, decoded.drawable);
    const verified = await verifyPhotoBlob(finalBlob);
    return {
      blob: finalBlob,
      info: {
        original: {type: source.mime, bytes: source.bytes, width: original.width, height: original.height},
        final: {type: finalBlob.type, bytes: finalBlob.size, width: verified.width, height: verified.height},
        orientationApplied: true,
      },
    };
  } catch (error) {
    if (error?.code) throw error;
    throw photoError("PHOTO_PROCESS_FAILED", "No se pudo procesar la fotografía.", error);
  } finally {
    decoded.close();
  }
}

export function formatPhotoBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("es-ES", {minimumFractionDigits: 2, maximumFractionDigits: 2})} MB`;
}

export function photoOptimizationSummary(info) {
  if (!info?.original || !info?.final) return "";
  return `Imagen optimizada: ${formatPhotoBytes(info.original.bytes)} → ${formatPhotoBytes(info.final.bytes)} · ${info.original.width}×${info.original.height} → ${info.final.width}×${info.final.height} · ${info.final.type.replace("image/", "").toUpperCase()}`;
}
