import {normalizeCardPhotoFrame} from "./photo-frame.js?v=1.6.0";
import {normalizeCardPhotoFields} from "./photo-storage.js?v=1.6.0";
import {normalizeCardQrStyle} from "./qr-premium-core.js?v=1.8.1";

export const STORAGE_KEY = "nextcards.cards.v1";
export const SEED_VERSION_KEY = "nextcards.seed.version";
export const DELETED_SEED_IDS_KEY = "nextcards.seed.deletedIds";
export const INITIAL_DATA_VERSION = 3;

const LEGACY_SEED_VERSION = 2;
const LEGACY_DEMO_SIGNATURES = [
  { id: "irma-rivera", slug: "irma-rivera-molins", email: "irma.rivera@lognext.com", jobTitle: "People & Culture", status: "active", template: "corporate-navy" },
  { id: "laura-cabrera", slug: "laura-cabrera", email: "laura.cabrera@lognext.com", jobTitle: "Administration", status: "draft", template: "clean-light" },
  { id: "miguel-saiz", slug: "miguel-angel-saiz", email: "miguel.saiz@lognext.com", jobTitle: "Director de Operaciones", status: "active", template: "meaningful-tech" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeCards(cards) {
  return cards.map(card => normalizeCardQrStyle(normalizeCardPhotoFields(normalizeCardPhotoFrame(card))));
}

function normalize(value = "") {
  return String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9@.+]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizedName(card) {
  return normalize(`${card.firstName || ""} ${card.lastName || ""}`);
}

function isUntouchedLegacyDemo(card) {
  return LEGACY_DEMO_SIGNATURES.some(signature => Object.entries(signature).every(([key, value]) => card[key] === value));
}

async function loadInitialCards() {
  const seedUrl = new URL("../data/employees.json", import.meta.url);
  seedUrl.searchParams.set("v", String(INITIAL_DATA_VERSION));
  const response = await fetch(seedUrl);
  if (!response.ok) throw new Error(`No se pudo cargar el seed inicial (${response.status}).`);
  const cards = await response.json();
  if (!Array.isArray(cards) || !cards.length) throw new Error("El seed inicial no contiene tarjetas válidas.");
  return cards;
}

const initialCards = normalizeCards(await loadInitialCards());
const initialSeedIds = new Set(initialCards.map(card => String(card.id)));
const seedEmailCount = new Map();
const seedNameCount = new Map();
for (const card of initialCards) {
  const email = normalize(card.email);
  const name = normalizedName(card);
  if (email) seedEmailCount.set(email, (seedEmailCount.get(email) || 0) + 1);
  if (name) seedNameCount.set(name, (seedNameCount.get(name) || 0) + 1);
}

let lastReadError = null;

function introducedVersion(card) {
  const version = Number(card.seedIntroducedVersion);
  return Number.isInteger(version) && version > 0 ? version : LEGACY_SEED_VERSION;
}

function readDeletedSeedIds() {
  const raw = localStorage.getItem(DELETED_SEED_IDS_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map(String).filter(id => initialSeedIds.has(id)));
  } catch {
    return new Set();
  }
}

function writeDeletedSeedIds(ids) {
  const normalized = [...new Set([...ids].map(String).filter(id => initialSeedIds.has(id)))].sort();
  if (normalized.length) localStorage.setItem(DELETED_SEED_IDS_KEY, JSON.stringify(normalized));
  else localStorage.removeItem(DELETED_SEED_IDS_KEY);
  return normalized;
}

function matchesExistingIdentity(seedCard, existingCards) {
  if (existingCards.some(card => String(card.id) === String(seedCard.id))) return true;

  const email = normalize(seedCard.email);
  if (email) {
    const sameEmail = existingCards.filter(card => normalize(card.email) === email);
    if (sameEmail.length) {
      if ((seedEmailCount.get(email) || 0) === 1) return true;
      if (sameEmail.some(card => normalize(card.jobTitle) === normalize(seedCard.jobTitle))) return true;
    }
  }

  const name = normalizedName(seedCard);
  if (name) {
    const sameName = existingCards.filter(card => normalizedName(card) === name);
    if (sameName.length) {
      if ((seedNameCount.get(name) || 0) === 1) return true;
      if (sameName.some(card => normalize(card.jobTitle) === normalize(seedCard.jobTitle))) return true;
    }
  }
  return false;
}

function missingSeedCards(existingCards, predicate = () => true) {
  const deletedIds = readDeletedSeedIds();
  return initialCards.filter(card => predicate(card) && !deletedIds.has(String(card.id)) && !matchesExistingIdentity(card, existingCards));
}

function migrateFirstSeed(existingCards) {
  const preserved = normalizeCards(existingCards.filter(card => !isUntouchedLegacyDemo(card)));
  return normalizeCards([...preserved, ...clone(missingSeedCards(preserved))]);
}

function migrateSeedVersion(existingCards, fromVersion) {
  const normalized = normalizeCards(existingCards);
  const additions = missingSeedCards(normalized, card => introducedVersion(card) > fromVersion);
  return normalizeCards([...normalized, ...clone(additions)]);
}

function initializeCards() {
  const rawCards = localStorage.getItem(STORAGE_KEY);
  const rawVersion = localStorage.getItem(SEED_VERSION_KEY);

  if (rawCards === null) {
    if (rawVersion !== null) {
      localStorage.setItem(STORAGE_KEY, "[]");
      if (Number(rawVersion) < INITIAL_DATA_VERSION) localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
      return [];
    }
    const seeded = normalizeCards(clone(initialCards));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
    return seeded;
  }

  const parsed = JSON.parse(rawCards);
  if (!Array.isArray(parsed)) throw new Error("Los datos locales de NextCards no tienen un formato válido.");

  if (rawVersion === null) {
    const migrated = migrateFirstSeed(parsed);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
    return migrated;
  }

  const version = Number.isFinite(Number(rawVersion)) ? Number(rawVersion) : 0;
  const normalized = version <= INITIAL_DATA_VERSION
    ? migrateSeedVersion(parsed, version < INITIAL_DATA_VERSION ? version : INITIAL_DATA_VERSION - 1)
    : normalizeCards(parsed);
  const serialized = JSON.stringify(normalized);
  if (serialized !== rawCards) localStorage.setItem(STORAGE_KEY, serialized);
  if (version < INITIAL_DATA_VERSION) localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
  return normalized;
}

export const storage = {
  getCards() {
    try {
      const cards = clone(initializeCards());
      lastReadError = null;
      return cards;
    } catch (error) {
      console.warn("No se pudieron leer las tarjetas.", error);
      lastReadError = error;
      return [];
    }
  },
  saveCards(cards) {
    const normalized = normalizeCards(cards);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    lastReadError = null;
    return normalized;
  },
  markSeedDeleted(id) {
    const normalizedId = String(id || "");
    if (!initialSeedIds.has(normalizedId)) return false;
    const deletedIds = readDeletedSeedIds();
    deletedIds.add(normalizedId);
    writeDeletedSeedIds(deletedIds);
    return true;
  },
  getDeletedSeedIds() {
    return [...readDeletedSeedIds()];
  },
  replaceDeletedSeedIds(ids = []) {
    return writeDeletedSeedIds(Array.isArray(ids) ? ids : []);
  },
  markAllSeedDeleted() {
    return writeDeletedSeedIds(initialSeedIds);
  },
  clearDeletedSeedIds() {
    localStorage.removeItem(DELETED_SEED_IDS_KEY);
  },
  consumeReadError() {
    const error = lastReadError;
    lastReadError = null;
    return error;
  },
  exportCards() {
    return JSON.stringify(this.getCards(), null, 2);
  },
  importCards(json) {
    let parsed;
    try { parsed = typeof json === "string" ? JSON.parse(json) : json; }
    catch { throw new Error("El archivo JSON no se puede leer. Revisa su formato e inténtalo de nuevo."); }
    if (!Array.isArray(parsed)) throw new Error("El archivo debe contener una lista de tarjetas.");
    if (!parsed.length) throw new Error("El archivo no contiene ninguna tarjeta.");
    const required = ["id", "slug", "firstName", "lastName", "jobTitle", "department", "email", "template"];
    const slugPattern = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const validUrl = value => { if (!value) return true; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };
    parsed.forEach((card, index) => {
      const row = `Tarjeta ${index + 1}`;
      if (!card || typeof card !== "object" || Array.isArray(card)) throw new Error(`${row}: la estructura no es válida.`);
      const missing = required.find(key => !String(card[key] ?? "").trim());
      if (missing) throw new Error(`${row}: falta el campo obligatorio ${missing}.`);
      if (!slugPattern.test(card.slug)) throw new Error(`${row}: el slug solo puede contener letras, números y guiones.`);
      if (!emailPattern.test(card.email)) throw new Error(`${row}: el email no es válido.`);
      if (!["active", "draft", "disabled"].includes(card.status)) throw new Error(`${row}: el estado debe ser active, draft o disabled.`);
      const invalidUrl = ["website", "linkedin", "customLink"].find(key => !validUrl(card[key]));
      if (invalidUrl) throw new Error(`${row}: ${invalidUrl} debe usar una URL http o https válida.`);
    });
    const duplicate = key => {
      const seen = new Set();
      return parsed.find(card => {
        const value = String(card[key]).trim().toLowerCase();
        if (seen.has(value)) return true;
        seen.add(value);
        return false;
      });
    };
    if (duplicate("id")) throw new Error("El archivo contiene IDs de tarjeta duplicados.");
    if (duplicate("slug")) throw new Error("El archivo contiene slugs duplicados.");
    const cards = normalizeCards(clone(parsed));
    this.saveCards(cards);
    return cards;
  },
  restoreInitialData() {
    this.clearDeletedSeedIds();
    const seeded = normalizeCards(clone(initialCards));
    this.saveCards(seeded);
    localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
    return seeded;
  },
};
