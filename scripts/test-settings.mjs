import assert from "node:assert/strict";
import fs from "node:fs/promises";

const seed = JSON.parse(await fs.readFile(new URL("../assets/data/employees.json", import.meta.url), "utf8"));

class StorageMock {
  values = new Map();
  clearCalls = 0;
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.clearCalls += 1; this.values.clear(); }
}

globalThis.localStorage = new StorageMock();
globalThis.sessionStorage = new StorageMock();
globalThis.fetch = async () => ({ok: true, json: async () => structuredClone(seed)});
globalThis.location = {href: "http://127.0.0.1:8080/index.html"};

const settingsModule = await import("../assets/js/settings-store.js");
const {
  NEXTCARDS_VERSION,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE_KEY,
  colorContrast,
  formatPersonName,
  getDefaultSettings,
  migrateSettings,
  settingsService,
  validateSettings,
} = settingsModule;
const {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  NEXTCARDS_LOCAL_STORAGE_KEYS,
  buildBackup,
  buildCardsCsv,
  buildTechnicalSummary,
  checkDataIntegrity,
  eraseAllNextCardsData,
  getSystemInformation,
  importBackup,
  restoreInitialNextCardsData,
  serializeBackup,
  validateBackup,
} = await import("../assets/js/settings-data.js");
const {templateService} = await import("../assets/js/templates-store.js");
const {emptyCard} = await import("../assets/js/cards.js");
const {storage, STORAGE_KEY} = await import("../assets/js/storage.js");
const {buildVcard} = await import("../assets/js/card-export.js");
const {buildQrSvg} = await import("../assets/js/qr-code.js");
const {trackEvent} = await import("../assets/js/analytics.js");

const defaults = settingsService.getSettings();
assert.equal(defaults.version, SETTINGS_SCHEMA_VERSION);
assert.equal(defaults.general.appName, "NextCards");
assert.equal(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)).version, SETTINGS_SCHEMA_VERSION, "Los valores iniciales deben persistirse con versión.");
assert.deepEqual(defaults.cards.actionOrder, ["save", "phone", "email", "linkedin", "website", "share"]);

localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
  version: 0,
  general: {appName: "Cards de equipo"},
  appearance: {accentColor: "#3791f5"},
  privacy: {hideEmailsInDashboard: true},
}));
const migrated = settingsService.getSettings();
assert.equal(migrated.version, SETTINGS_SCHEMA_VERSION);
assert.equal(migrated.general.appName, "Cards de equipo");
assert.equal(migrated.general.language, "es");
assert.equal(migrated.appearance.accentColor, "#3791F5");
assert.equal(migrated.cards.qr.errorCorrection, "M", "La migración debe completar grupos anidados nuevos.");
assert.equal(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)).version, SETTINGS_SCHEMA_VERSION, "La migración debe escribirse una sola vez en el esquema actual.");

const invalid = getDefaultSettings();
invalid.general.appName = "";
invalid.appearance.primaryColor = "navy";
invalid.publicCard.companyUrl = "javascript:alert(1)";
invalid.cards.qr.darkColor = "#FFFFFF";
invalid.cards.qr.lightColor = "#FFFFFF";
invalid.cards.slug.autoGenerate = false;
invalid.cards.slug.allowManualEdit = false;
const invalidResult = validateSettings(invalid);
assert.ok(invalidResult.errors.some(item => item.field === "general.appName"));
assert.ok(invalidResult.errors.some(item => item.field === "appearance.primaryColor"));
assert.ok(invalidResult.errors.some(item => item.field === "publicCard.companyUrl"));
assert.ok(invalidResult.errors.some(item => item.field === "cards.qr.darkColor"));
assert.ok(invalidResult.errors.some(item => item.field === "cards.slug.autoGenerate"));
assert.ok(colorContrast("#000029", "#FFFFFF") > 15);
const poorInterfaceContrast = getDefaultSettings();
poorInterfaceContrast.appearance.primaryColor = "#FFFFFF";
poorInterfaceContrast.appearance.darkBackground = "#FFFFFF";
assert.ok(validateSettings(poorInterfaceContrast).errors.some(item => item.field === "appearance.primaryColor"), "La marca no debe guardar texto blanco ilegible sobre el color principal.");
assert.ok(validateSettings(poorInterfaceContrast).errors.some(item => item.field === "appearance.darkBackground"));

const customized = getDefaultSettings();
customized.general.appName = "NextCards Equipo";
customized.general.nameFormat = "last-first";
customized.general.timezone = "Europe/Madrid";
customized.cards.defaultTemplateId = "clean-light";
customized.cards.defaultStatus = "draft";
customized.cards.defaultVisibleFields.photo = false;
customized.cards.qr = {size: "large", errorCorrection: "Q", darkColor: "#000029", lightColor: "#FFFA96"};
customized.cards.vcf = {
  includeJobTitle: false,
  includeCompany: false,
  includeWebsite: false,
  includeLinkedin: false,
  includeCity: false,
  includeCorporateNote: true,
};
customized.privacy.analyticsEnabled = false;
customized.publicCard.companyName = "Lognext Test";
customized.publicCard.tagline = "Tecnología con propósito";
settingsService.saveSettings(customized);
templateService.setDefaultTemplate("clean-light");
const saved = settingsService.getSettings();
assert.equal(saved.general.appName, "NextCards Equipo");
assert.equal(saved.cards.defaultTemplateId, "clean-light");
assert.equal(formatPersonName({firstName: "Ana", lastName: "García"}, saved), "García, Ana");

const cardsBeforeNew = storage.getCards();
const firstTemplate = cardsBeforeNew[0].template;
const fresh = emptyCard();
assert.equal(fresh.template, "clean-light", "Una tarjeta nueva debe usar la plantilla predeterminada configurada.");
assert.equal(fresh.status, "draft");
assert.equal(fresh.visibleFields.photo, false);
assert.equal(storage.getCards()[0].template, firstTemplate, "Cambiar valores por defecto no debe alterar tarjetas existentes.");

const sample = {
  slug: "ana-garcia",
  firstName: "Ana",
  lastName: "García",
  jobTitle: "Directora",
  department: "Dirección",
  email: "ana@example.com",
  phone: "+34 600 000 000",
  mobile: "+34 611 000 000",
  website: "https://example.com",
  linkedin: "https://linkedin.com/in/ana",
  location: "Gran Vía 1",
  city: "Madrid",
  bio: "Perfil profesional",
};
const vcf = buildVcard(sample, saved);
assert.ok(vcf.includes("FN:García\\, Ana"));
assert.doesNotMatch(vcf, /\r\nTITLE:/);
assert.doesNotMatch(vcf, /\r\nORG:/);
assert.doesNotMatch(vcf, /\r\nURL:/);
assert.doesNotMatch(vcf, /X-SOCIALPROFILE/);
assert.doesNotMatch(vcf, /\r\nADR/);
assert.match(vcf, /X-NEXTCARDS-NOTE:Tecnología con propósito/);

let qrLevel = "";
const qrFactory = (_type, level) => {
  qrLevel = level;
  return {addData() {}, make() {}, createSvgTag() { return '<svg><rect fill="#000000"/><rect fill="#ffffff"/></svg>'; }};
};
const qr = buildQrSvg("https://example.com/card", qrFactory, saved.cards.qr);
assert.equal(qrLevel, "Q");
assert.match(qr, /#000029/);
assert.match(qr, /#FFFA96/);
const namedQr = buildQrSvg("https://example.com/card", () => ({addData() {}, make() {}, createSvgTag() { return '<svg><rect fill="white"/><path fill="black"/></svg>'; }}), saved.cards.qr);
assert.match(namedQr, /fill="#000029"/);
assert.match(namedQr, /fill="#FFFA96"/);

let analyticsWrites = 0;
const disabledTracking = trackEvent("card_view", {cardId: "card-test"}, {saveEvent() { analyticsWrites += 1; }});
assert.deepEqual(disabledTracking, {saved: false, disabled: true});
assert.equal(analyticsWrites, 0, "Desactivar analítica debe impedir nuevas escrituras.");

const customTemplate = templateService.createVariant("clean-light", {name: "Clean de respaldo"});
const backup = buildBackup();
assert.equal(backup.format, BACKUP_FORMAT);
assert.equal(backup.backupVersion, BACKUP_VERSION);
assert.equal(backup.appVersion, NEXTCARDS_VERSION);
assert.equal(backup.customTemplates.length, 1);
assert.ok(Array.isArray(backup.cards) && backup.cards.length === seed.length);
assert.ok(backup.settings.general.appName === "NextCards Equipo");
assert.equal(backup.photoStorage.included, false, "La copia debe declarar expresamente que no contiene los blobs de IndexedDB.");
assert.equal(backup.photoStorage.database, "nextcards-photos");
assert.equal("analytics" in backup, false, "La copia administrativa no debe mezclar el historial analítico.");
assert.doesNotMatch(serializeBackup(), /[A-Z]:\\Users\\/i, "La copia no debe incluir rutas temporales absolutas.");
const validated = validateBackup(backup);
assert.equal(validated.summary.cards, seed.length);
assert.equal(validated.summary.customTemplates, 1);
assert.throws(() => validateBackup({...backup, format: "otra-app"}), error => error.code === "INVALID_BACKUP_FORMAT");
assert.throws(() => validateBackup({...backup, backupVersion: BACKUP_VERSION + 1}), error => error.code === "INCOMPATIBLE_BACKUP");
assert.throws(() => validateBackup({...backup, cards: [...backup.cards, {...backup.cards[0]}]}), error => error.code === "DUPLICATE_CARDS");

const replaceBackup = structuredClone(backup);
replaceBackup.cards[0].firstName = "Nombre importado";
const replaced = importBackup(replaceBackup, {mode: "replace"});
assert.equal(replaced.resultingCards, seed.length);
assert.equal(storage.getCards()[0].firstName, "Nombre importado");
assert.ok(templateService.getTemplateById(customTemplate.id));

const extra = {...seed[0], id: "local-extra", slug: "local-extra", firstName: "Local", email: "local@example.com"};
storage.saveCards([...storage.getCards(), extra]);
const mergeBackup = structuredClone(backup);
mergeBackup.cards = [structuredClone(backup.cards[1])];
const mergedImport = importBackup(mergeBackup, {mode: "merge"});
assert.equal(mergedImport.resultingCards, seed.length + 1, "La fusión debe conservar tarjetas locales no incluidas en la copia.");
assert.ok(storage.getCards().some(card => card.id === "local-extra"));

const beforeConflict = localStorage.getItem(STORAGE_KEY);
const conflictBackup = structuredClone(backup);
conflictBackup.cards = [{...backup.cards[0], id: "conflicting-id", slug: "local-extra"}];
assert.throws(() => importBackup(conflictBackup, {mode: "merge"}), error => error.code === "IMPORT_ROLLED_BACK");
assert.equal(localStorage.getItem(STORAGE_KEY), beforeConflict, "Una importación fallida debe restaurar el estado exacto anterior.");

const csv = buildCardsCsv(seed);
assert.ok(csv.startsWith("\uFEFFnombre,apellidos"));
assert.match(csv, /francisco-javier-pedraza-calvo-cfo/);
assert.match(csv, /francisco-javier-pedraza-calvo-consejo-asesor/);

localStorage.setItem("otra-app.preferencia", "conservar");
sessionStorage.setItem("nextcards_analytics_session_id", "session-old");
storage.saveCards([extra]);
const restored = await restoreInitialNextCardsData();
assert.equal(restored.cards, seed.length);
assert.equal(storage.getCards().length, seed.length);
assert.equal(localStorage.getItem("otra-app.preferencia"), "conservar");
assert.equal(sessionStorage.getItem("nextcards_analytics_session_id"), null);
assert.ok(localStorage.getItem(SETTINGS_STORAGE_KEY), "Restaurar debe recrear una configuración versionada.");

const erased = await eraseAllNextCardsData();
assert.equal(erased.cards, 0);
assert.equal(storage.getCards().length, 0);
assert.equal(localStorage.getItem("otra-app.preferencia"), "conservar");
assert.equal(localStorage.clearCalls, 0, "Las operaciones fuertes no deben usar localStorage.clear().");
assert.ok(NEXTCARDS_LOCAL_STORAGE_KEYS.every(key => key.startsWith("nextcards")));

await restoreInitialNextCardsData();
const multiRole = seed.filter(card => card.email === "javier.pedraza@lognext.com");
assert.equal(multiRole.length, 2);
const validVariants = await checkDataIntegrity({cards: multiRole, templates: templateService.getTemplates(), checkPhotos: false});
assert.equal(validVariants.issues.some(issue => issue.code === "DUPLICATE_ID" || issue.code === "DUPLICATE_SLUG"), false, "Compartir email con cargos distintos no es un duplicado.");
const broken = await checkDataIntegrity({
  cards: [
    multiRole[0],
    {...multiRole[1], id: multiRole[0].id, slug: multiRole[0].slug, website: "no-es-url", template: "missing-template", email: "email-invalido", status: "misterio"},
    {...multiRole[0], id: "invalid-fields", slug: "slug no valido"},
  ],
  templates: [...templateService.getTemplates(), {...templateService.getTemplates()[0], status: "misterio"}],
  checkPhotos: false,
});
assert.equal(broken.status, "error");
assert.ok(broken.issues.some(issue => issue.code === "DUPLICATE_ID"));
assert.ok(broken.issues.some(issue => issue.code === "DUPLICATE_SLUG"));
assert.ok(broken.issues.some(issue => issue.code === "INVALID_URL"));
assert.ok(broken.issues.some(issue => issue.code === "MISSING_TEMPLATE"));
assert.ok(broken.issues.some(issue => issue.code === "INVALID_EMAIL"));
assert.ok(broken.issues.some(issue => issue.code === "INVALID_SLUG"));
assert.ok(broken.issues.some(issue => issue.code === "UNKNOWN_STATUS"));
assert.ok(broken.issues.some(issue => issue.code === "DUPLICATE_TEMPLATE_ID"));
assert.ok(broken.issues.some(issue => issue.code === "UNKNOWN_TEMPLATE_STATUS"));

const systemInfo = getSystemInformation();
assert.equal(systemInfo.cards, seed.length);
assert.match(buildTechnicalSummary(systemInfo), /NextCards/);
assert.doesNotMatch(buildTechnicalSummary(systemInfo), /@lognext\.com/, "El resumen técnico no debe incluir datos personales.");

localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({...getDefaultSettings(), version: SETTINGS_SCHEMA_VERSION + 1}));
assert.throws(() => migrateSettings({...getDefaultSettings(), version: SETTINGS_SCHEMA_VERSION + 1}), error => error.code === "SETTINGS_VERSION_INCOMPATIBLE");
const originalWarn = console.warn;
let incompatibleWarning = "";
console.warn = message => { incompatibleWarning = String(message); };
assert.equal(settingsService.getSettings().version, SETTINGS_SCHEMA_VERSION, "La aplicación debe seguir operativa con defaults seguros ante datos locales futuros.");
console.warn = originalWarn;
assert.match(incompatibleWarning, /versión más reciente/);
assert.equal(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)).version, SETTINGS_SCHEMA_VERSION + 1, "La lectura segura no debe sobrescribir datos de una versión futura.");
settingsService.resetSettings();

console.log("OK: configuración versionada, migración, defaults, marca, QR, VCF, privacidad, copias con rollback, CSV, restauración selectiva e integridad verificados.");
