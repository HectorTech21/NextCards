export const STORAGE_KEY = "nextcards.cards.v1";
export const SEED_VERSION_KEY = "nextcards.seed.version";
export const INITIAL_DATA_VERSION = 1;

const LEGACY_DEMO_SIGNATURES = [
  { id: "irma-rivera", slug: "irma-rivera-molins", email: "irma.rivera@lognext.com", jobTitle: "People & Culture", status: "active", template: "corporate-navy" },
  { id: "laura-cabrera", slug: "laura-cabrera", email: "laura.cabrera@lognext.com", jobTitle: "Administration", status: "draft", template: "clean-light" },
  { id: "miguel-saiz", slug: "miguel-angel-saiz", email: "miguel.saiz@lognext.com", jobTitle: "Director de Operaciones", status: "active", template: "meaningful-tech" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalize(value = "") {
  return String(value).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function cardIdentity(card) {
  return `${normalize(card.email)}|${normalize(card.jobTitle)}`;
}

function isUntouchedLegacyDemo(card) {
  return LEGACY_DEMO_SIGNATURES.some(signature => Object.entries(signature).every(([key, value]) => card[key] === value));
}

async function loadInitialCards() {
  const response = await fetch(new URL("../data/employees.json", import.meta.url));
  if (!response.ok) throw new Error(`No se pudo cargar el seed inicial (${response.status}).`);
  const cards = await response.json();
  if (!Array.isArray(cards) || !cards.length) throw new Error("El seed inicial no contiene tarjetas válidas.");
  return cards;
}

const initialCards = await loadInitialCards();

function migrateFirstSeed(existingCards) {
  const preserved = existingCards.filter(card => !isUntouchedLegacyDemo(card));
  const preservedIdentities = new Set(preserved.map(cardIdentity));
  const missingInitialCards = initialCards.filter(card => !preservedIdentities.has(cardIdentity(card)));
  return [...clone(missingInitialCards), ...preserved];
}

function initializeCards() {
  const rawCards = localStorage.getItem(STORAGE_KEY);
  const rawVersion = localStorage.getItem(SEED_VERSION_KEY);

  if (rawCards === null) {
    if (rawVersion !== null) {
      localStorage.setItem(STORAGE_KEY, "[]");
      return [];
    }
    const seeded = clone(initialCards);
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

  return parsed;
}

export const storage = {
  getCards() {
    try {
      return clone(initializeCards());
    } catch (error) {
      console.warn("No se pudieron leer las tarjetas.", error);
      return [];
    }
  },
  saveCards(cards) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    return cards;
  },
  exportCards() {
    return JSON.stringify(this.getCards(), null, 2);
  },
  importCards(json) {
    const parsed = typeof json === "string" ? JSON.parse(json) : json;
    if (!Array.isArray(parsed)) throw new Error("El archivo debe contener una lista de tarjetas.");
    const valid = parsed.filter(card => card && typeof card === "object" && card.id && card.slug && card.firstName && card.email);
    if (!valid.length) throw new Error("No se encontraron tarjetas válidas.");
    this.saveCards(valid);
    return valid;
  },
  restoreInitialData() {
    const seeded = clone(initialCards);
    this.saveCards(seeded);
    localStorage.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
    return seeded;
  },
};
