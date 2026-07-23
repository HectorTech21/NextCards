export const CARDS_VIEW_STORAGE_KEY = "nextcards.cardsViewMode";
export const DEFAULT_CARDS_VIEW_MODE = "grid";
export const DEFAULT_LIST_SORT = Object.freeze({key: "name", direction: "asc"});

const VIEW_MODES = new Set(["grid", "list"]);
const SORT_KEYS = new Set(["name", "jobTitle", "department", "status", "updatedAt"]);
const DIRECTIONS = new Set(["asc", "desc"]);
const STATUS_ORDER = {active: 0, draft: 1, disabled: 2};
const collator = new Intl.Collator("es", {sensitivity: "base", numeric: true});

export function normalizeCardsViewMode(value) {
  return VIEW_MODES.has(value) ? value : DEFAULT_CARDS_VIEW_MODE;
}

export function readCardsViewMode(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(CARDS_VIEW_STORAGE_KEY);
    const normalized = normalizeCardsViewMode(stored);
    if (stored !== null && stored !== normalized) storage?.setItem(CARDS_VIEW_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return DEFAULT_CARDS_VIEW_MODE;
  }
}

export function writeCardsViewMode(value, storage = globalThis.localStorage) {
  const normalized = normalizeCardsViewMode(value);
  try { storage?.setItem(CARDS_VIEW_STORAGE_KEY, normalized); }
  catch { /* La preferencia no debe bloquear el directorio. */ }
  return normalized;
}

export function normalizeListSort(value = DEFAULT_LIST_SORT) {
  return {
    key: SORT_KEYS.has(value?.key) ? value.key : DEFAULT_LIST_SORT.key,
    direction: DIRECTIONS.has(value?.direction) ? value.direction : DEFAULT_LIST_SORT.direction,
  };
}

function text(value) {
  return String(value ?? "").trim();
}

function dateValue(value) {
  const timestamp = new Date(value || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function valueFor(card, key, getName) {
  if (key === "name") return text(getName(card));
  if (key === "status") return STATUS_ORDER[card?.status] ?? 99;
  if (key === "updatedAt") return dateValue(card?.updatedAt);
  return text(card?.[key]);
}

function compareValues(first, second, direction) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  const comparison = typeof first === "number" && typeof second === "number"
    ? first - second
    : collator.compare(first, second);
  return direction === "desc" ? -comparison : comparison;
}

export function sortCardsForList(cards = [], value = DEFAULT_LIST_SORT, {getName = card => `${text(card?.firstName)} ${text(card?.lastName)}`.trim()} = {}) {
  const sort = normalizeListSort(value);
  return [...cards].sort((first, second) => {
    const primary = compareValues(valueFor(first, sort.key, getName), valueFor(second, sort.key, getName), sort.direction);
    if (primary) return primary;
    const byName = collator.compare(text(getName(first)), text(getName(second)));
    return byName || collator.compare(text(first?.id), text(second?.id));
  });
}
