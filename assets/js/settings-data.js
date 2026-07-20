import {INITIAL_DATA_VERSION, SEED_VERSION_KEY, STORAGE_KEY, storage} from "./storage.js";
import {TEMPLATES_DATA_VERSION, TEMPLATES_STORAGE_KEY, TEMPLATES_VERSION_KEY, templateService} from "./templates-store.js";
import {ANALYTICS_EVENTS_KEY, ANALYTICS_SCHEMA_KEY, ANALYTICS_SCHEMA_VERSION} from "./analytics-store.js";
import {
  NEXTCARDS_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  settingsService,
  validateSettings,
} from "./settings-store.js";

export const BACKUP_FORMAT = "nextcards-backup";
export const BACKUP_VERSION = 1;
export const NEXTCARDS_LOCAL_STORAGE_KEYS = Object.freeze([
  STORAGE_KEY,
  SEED_VERSION_KEY,
  TEMPLATES_STORAGE_KEY,
  TEMPLATES_VERSION_KEY,
  SETTINGS_STORAGE_KEY,
  ANALYTICS_EVENTS_KEY,
  ANALYTICS_SCHEMA_KEY,
]);

const clone = value => JSON.parse(JSON.stringify(value));
const stamp = () => new Date().toISOString();

function problem(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function parseJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); }
  catch { throw problem("El archivo no contiene JSON válido.", "INVALID_JSON"); }
}

function validCard(card) {
  return card && typeof card === "object" && !Array.isArray(card)
    && ["id", "slug", "firstName", "lastName", "jobTitle", "department", "email", "template"].every(key => String(card[key] || "").trim())
    && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(card.slug)
    && ["active", "draft", "disabled"].includes(card.status)
    && ["website", "linkedin", "customLink"].every(key => isValidHttpUrl(card[key]));
}

function duplicateValues(items, key) {
  const seen = new Set();
  const duplicates = new Set();
  items.forEach(item => {
    const value = String(item?.[key] || "").trim().toLowerCase();
    if (!value) return;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

export function buildBackup() {
  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    appVersion: NEXTCARDS_VERSION,
    exportedAt: stamp(),
    dataVersions: {
      cards: INITIAL_DATA_VERSION,
      templates: TEMPLATES_DATA_VERSION,
      settings: SETTINGS_SCHEMA_VERSION,
    },
    cards: storage.getCards(),
    customTemplates: templateService.getTemplates().filter(item => item.type === "custom"),
    settings: settingsService.getSettings(),
  };
}

export function serializeBackup() {
  return JSON.stringify(buildBackup(), null, 2);
}

export function validateBackup(value) {
  const backup = parseJson(value);
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) throw problem("La copia no tiene una estructura válida.", "INVALID_BACKUP");
  if (backup.format !== BACKUP_FORMAT) throw problem("El archivo no es una copia de seguridad de NextCards.", "INVALID_BACKUP_FORMAT");
  if (!Number.isInteger(backup.backupVersion) || backup.backupVersion < 1 || backup.backupVersion > BACKUP_VERSION) throw problem("La versión de la copia no es compatible con esta versión de NextCards.", "INCOMPATIBLE_BACKUP");
  if (Number(backup.dataVersions?.settings || 0) > SETTINGS_SCHEMA_VERSION || Number(backup.dataVersions?.templates || 0) > TEMPLATES_DATA_VERSION || Number(backup.dataVersions?.cards || 0) > INITIAL_DATA_VERSION) {
    throw problem("La copia contiene una versión de datos más reciente y no puede importarse de forma segura.", "INCOMPATIBLE_DATA_VERSION");
  }
  if (Number(backup.settings?.version || 0) > SETTINGS_SCHEMA_VERSION) throw problem("La configuración incluida pertenece a una versión más reciente.", "INCOMPATIBLE_DATA_VERSION");
  if (!Array.isArray(backup.cards) || !backup.cards.every(validCard)) throw problem("La copia contiene tarjetas incompletas o no válidas.", "INVALID_CARDS");
  if (!Array.isArray(backup.customTemplates) || !backup.customTemplates.every(template => template && template.type === "custom" && template.id && template.name)) {
    throw problem("La lista de plantillas personalizadas no es válida.", "INVALID_TEMPLATES");
  }
  if (!backup.settings || typeof backup.settings !== "object" || Array.isArray(backup.settings)) throw problem("La copia no contiene una configuración válida.", "INVALID_SETTINGS");
  const settingsValidation = validateSettings(backup.settings);
  if (settingsValidation.errors.length) throw problem(`La configuración importada no es válida: ${settingsValidation.errors[0].message}`, "INVALID_SETTINGS", {validation: settingsValidation});
  const duplicateIds = duplicateValues(backup.cards, "id");
  const duplicateSlugs = duplicateValues(backup.cards, "slug");
  if (duplicateIds.length || duplicateSlugs.length) throw problem("La copia contiene IDs o slugs de tarjeta duplicados.", "DUPLICATE_CARDS", {duplicateIds, duplicateSlugs});
  const duplicateTemplateIds = duplicateValues(backup.customTemplates, "id");
  const duplicateTemplateNames = duplicateValues(backup.customTemplates, "name");
  if (duplicateTemplateIds.length || duplicateTemplateNames.length) throw problem("La copia contiene IDs o nombres de plantilla duplicados.", "DUPLICATE_TEMPLATES", {duplicateTemplateIds, duplicateTemplateNames});
  const systemIds = new Set(templateService.getSystemTemplates().map(template => template.id));
  if (backup.customTemplates.some(template => systemIds.has(template.id))) throw problem("Una plantilla personalizada usa un ID reservado por el sistema.", "RESERVED_TEMPLATE_ID");
  const importedTemplates = new Map([
    ...templateService.getSystemTemplates().map(template => [template.id, template]),
    ...backup.customTemplates.map(template => [template.id, template]),
  ]);
  const missingTemplate = backup.cards.find(card => !importedTemplates.has(card.template));
  if (missingTemplate) throw problem(`La tarjeta ${missingTemplate.id} referencia una plantilla inexistente.`, "MISSING_TEMPLATE_REFERENCE");
  const requestedDefault = importedTemplates.get(settingsValidation.settings.cards.defaultTemplateId);
  if (!requestedDefault || requestedDefault.status !== "active") throw problem("La plantilla predeterminada de la copia no existe o está archivada.", "INVALID_DEFAULT_TEMPLATE");
  return {
    backup: clone(backup),
    summary: {
      cards: backup.cards.length,
      customTemplates: backup.customTemplates.length,
      appName: String(backup.settings.general?.appName || "NextCards"),
      exportedAt: backup.exportedAt || "",
      sourceVersion: backup.appVersion || "desconocida",
    },
  };
}

function snapshot(keys = NEXTCARDS_LOCAL_STORAGE_KEYS) {
  return new Map(keys.map(key => [key, globalThis.localStorage?.getItem(key) ?? null]));
}

function rollback(values) {
  values.forEach((value, key) => {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, value);
  });
}

function mergedCards(current, imported) {
  const map = new Map(current.map(card => [card.id, card]));
  imported.forEach(card => map.set(card.id, clone(card)));
  const cards = [...map.values()];
  const duplicateSlugs = duplicateValues(cards, "slug");
  if (duplicateSlugs.length) throw problem(`La fusión produciría slugs duplicados: ${duplicateSlugs.join(", ")}.`, "MERGE_SLUG_CONFLICT", {duplicateSlugs});
  return cards;
}

export function importBackup(value, {mode = "replace"} = {}) {
  if (!["replace", "merge"].includes(mode)) throw problem("Selecciona reemplazar o fusionar.", "INVALID_IMPORT_MODE");
  const {backup, summary} = validateBackup(value);
  const before = snapshot();
  try {
    const cards = mode === "replace" ? clone(backup.cards) : mergedCards(storage.getCards(), backup.cards);
    templateService.importCustomTemplates(backup.customTemplates, {mode});
    storage.saveCards(cards);
    globalThis.localStorage?.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
    const savedSettings = settingsService.saveSettings(backup.settings);
    const requestedDefault = templateService.getTemplateById(savedSettings.cards.defaultTemplateId);
    if (requestedDefault?.status === "active") templateService.setDefaultTemplate(requestedDefault.id);
    else {
      const fallback = templateService.getDefaultTemplate();
      settingsService.syncDefaultTemplate(fallback.id);
    }
    return {...summary, mode, resultingCards: cards.length, importedAt: stamp()};
  } catch (error) {
    rollback(before);
    throw problem(`No se pudo importar la copia. No se ha aplicado ningún cambio. ${error.message}`, "IMPORT_ROLLED_BACK", {cause: error});
  }
}

function csvValue(value) {
  const string = String(value ?? "");
  return /[",\r\n;]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function buildCardsCsv(cards = storage.getCards(), templates = templateService.getTemplates()) {
  const names = new Map(templates.map(template => [template.id, template.name]));
  const columns = ["nombre", "apellidos", "cargo", "departamento", "email", "telefono", "linkedin", "web", "estado", "plantilla", "slug"];
  const rows = cards.map(card => [
    card.firstName,
    card.lastName,
    card.jobTitle,
    card.department,
    card.email,
    card.phone,
    card.linkedin,
    card.website,
    card.status,
    names.get(card.template) || card.template,
    card.slug,
  ].map(csvValue).join(","));
  return `\uFEFF${columns.join(",")}\r\n${rows.join("\r\n")}`;
}

function clearKnownKeys() {
  NEXTCARDS_LOCAL_STORAGE_KEYS.forEach(key => globalThis.localStorage?.removeItem(key));
  globalThis.sessionStorage?.removeItem("nextcards_analytics_session_id");
}

export function restoreInitialNextCardsData() {
  clearKnownKeys();
  const cards = storage.restoreInitialData();
  const templates = templateService.resetForTests();
  const settings = settingsService.resetSettings();
  return {cards: cards.length, templates: templates.length, settings};
}

export function eraseAllNextCardsData() {
  clearKnownKeys();
  globalThis.localStorage?.setItem(STORAGE_KEY, "[]");
  globalThis.localStorage?.setItem(SEED_VERSION_KEY, String(INITIAL_DATA_VERSION));
  const templates = templateService.resetForTests();
  const settings = settingsService.resetSettings();
  return {cards: 0, templates: templates.length, settings};
}

function storageBytes(storageRef = globalThis.localStorage) {
  let total = 0;
  if (!storageRef) return total;
  for (let index = 0; index < storageRef.length; index += 1) {
    const key = storageRef.key(index);
    if (!key || !key.startsWith("nextcards")) continue;
    const value = storageRef.getItem(key) || "";
    total += new TextEncoder().encode(key + value).length;
  }
  return total;
}

function latestTimestamp(cards, templates, settings) {
  const values = [settings.updatedAt, ...cards.map(card => card.updatedAt || card.createdAt), ...templates.map(template => template.updatedAt || template.createdAt)]
    .map(value => new Date(value).getTime()).filter(Number.isFinite);
  return values.length ? new Date(Math.max(...values)).toISOString() : "";
}

export function getSystemInformation() {
  const cards = storage.getCards();
  const templates = templateService.getTemplates();
  const settings = settingsService.getSettings();
  let storedSettingsVersion = SETTINGS_SCHEMA_VERSION;
  try { storedSettingsVersion = Number(JSON.parse(globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY) || "{}").version || SETTINGS_SCHEMA_VERSION); }
  catch { storedSettingsVersion = 0; }
  return {
    appVersion: NEXTCARDS_VERSION,
    settingsVersion: SETTINGS_SCHEMA_VERSION,
    storedSettingsVersion,
    cardsVersion: Number(globalThis.localStorage?.getItem(SEED_VERSION_KEY) || INITIAL_DATA_VERSION),
    templatesVersion: Number(globalThis.localStorage?.getItem(TEMPLATES_VERSION_KEY) || TEMPLATES_DATA_VERSION),
    analyticsVersion: Number(globalThis.localStorage?.getItem(ANALYTICS_SCHEMA_KEY) || ANALYTICS_SCHEMA_VERSION),
    cards: cards.length,
    templates: templates.length,
    activeCards: cards.filter(card => card.status === "active").length,
    draftCards: cards.filter(card => card.status === "draft").length,
    storageBytes: storageBytes(),
    browser: globalThis.navigator?.userAgent || "No disponible",
    lastLocalUpdate: latestTimestamp(cards, templates, settings),
  };
}

export function buildTechnicalSummary(info = getSystemInformation()) {
  return [
    `NextCards ${info.appVersion}`,
    `Esquemas: settings ${info.storedSettingsVersion}/${info.settingsVersion} compatible, tarjetas ${info.cardsVersion}, plantillas ${info.templatesVersion}, analítica ${info.analyticsVersion}`,
    `Volumen: ${info.cards} tarjetas (${info.activeCards} activas, ${info.draftCards} borradores), ${info.templates} plantillas`,
    `Almacenamiento aproximado: ${info.storageBytes} bytes`,
    `Última actualización local: ${info.lastLocalUpdate || "sin fecha"}`,
    `Navegador: ${info.browser}`,
  ].join("\n");
}

function isValidHttpUrl(value) {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
}

function structuralPhotoIssue(photo) {
  if (!photo) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,/i.test(photo)) return photo.length > 1_400_000 ? "La fotografía embebida supera aproximadamente 1 MB." : "";
  if (/^assets\/img\/employees\/[a-z0-9-]+\.(?:jpe?g|png|webp)$/i.test(photo)) return "";
  return "La ruta de fotografía no es relativa, compatible o reconocible.";
}

async function canLoadPhoto(photo) {
  if (!photo || typeof Image === "undefined") return true;
  return new Promise(resolve => {
    const image = new Image();
    const timeout = setTimeout(() => resolve(false), 2500);
    image.onload = () => { clearTimeout(timeout); resolve(true); };
    image.onerror = () => { clearTimeout(timeout); resolve(false); };
    image.src = photo;
  });
}

export async function checkDataIntegrity({cards = storage.getCards(), templates = templateService.getTemplates(), checkPhotos = true} = {}) {
  const issues = [];
  const add = (level, code, message, reference = "") => issues.push({level, code, message, reference});
  duplicateValues(cards, "id").forEach(value => add("error", "DUPLICATE_ID", `ID de tarjeta duplicado: ${value}.`, value));
  duplicateValues(cards, "slug").forEach(value => add("error", "DUPLICATE_SLUG", `Slug duplicado: ${value}.`, value));
  const templateIds = new Set(templates.map(template => template.id));
  const required = ["id", "slug", "firstName", "lastName", "jobTitle", "department", "email"];
  for (const card of cards) {
    required.forEach(key => { if (!String(card?.[key] || "").trim()) add("error", "REQUIRED_FIELD", `Falta el campo obligatorio ${key}.`, card?.id || card?.slug || "sin-id"); });
    if (card.template && !templateIds.has(card.template)) add("warning", "MISSING_TEMPLATE", `La plantilla ${card.template} no existe; se usará el fallback.`, card.id);
    ["website", "linkedin", "customLink"].forEach(key => { if (!isValidHttpUrl(card[key])) add("warning", "INVALID_URL", `${key} no contiene una URL válida.`, card.id); });
    const structuralIssue = structuralPhotoIssue(card.photo);
    if (structuralIssue) add("warning", "PHOTO_PATH", structuralIssue, card.id);
    else if (checkPhotos && card.photo && !(await canLoadPhoto(card.photo))) add("warning", "BROKEN_PHOTO", "No se ha podido cargar la fotografía.", card.id);
  }
  const versions = [
    ["tarjetas", Number(globalThis.localStorage?.getItem(SEED_VERSION_KEY) || INITIAL_DATA_VERSION), INITIAL_DATA_VERSION],
    ["plantillas", Number(globalThis.localStorage?.getItem(TEMPLATES_VERSION_KEY) || TEMPLATES_DATA_VERSION), TEMPLATES_DATA_VERSION],
    ["configuración", (() => { try { return Number(JSON.parse(globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY) || "{}").version || SETTINGS_SCHEMA_VERSION); } catch { return 0; } })(), SETTINGS_SCHEMA_VERSION],
  ];
  versions.forEach(([label, current, supported]) => { if (current > supported) add("error", "INCOMPATIBLE_VERSION", `La versión de ${label} (${current}) supera la compatible (${supported}).`); });
  const status = issues.some(issue => issue.level === "error") ? "error" : issues.length ? "warning" : "correct";
  return {status, issues, checkedCards: cards.length, checkedTemplates: templates.length, checkedAt: stamp()};
}
