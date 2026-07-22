export const SETTINGS_STORAGE_KEY = "nextcards.settings.v1";
export const SETTINGS_SCHEMA_VERSION = 1;
export const NEXTCARDS_VERSION = "1.4.0";

export const LOGO_RESOURCES = Object.freeze({
  "symbol-negative": {label: "Símbolo", path: "assets/img/logos/lognext-symbol-negative.svg"},
  "logo-positive": {label: "Logo principal", path: "assets/img/logos/lognext-positive.svg"},
  "logo-negative": {label: "Logo negativo", path: "assets/img/logos/lognext-negative.svg"},
});

export const OFFICIAL_COLORS = Object.freeze({
  primaryColor: "#000029",
  accentColor: "#FA3C0F",
  lightBackground: "#F6F6F9",
  darkBackground: "#000029",
  neutralColor: "#E1E1E8",
});

export const CARD_ACTIONS = Object.freeze([
  {id: "save", label: "Guardar contacto"},
  {id: "phone", label: "Llamar"},
  {id: "email", label: "Email"},
  {id: "linkedin", label: "LinkedIn"},
  {id: "website", label: "Web"},
  {id: "share", label: "Compartir"},
]);

const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const clone = value => JSON.parse(JSON.stringify(value));
const browserTimezone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid"; }
  catch { return "Europe/Madrid"; }
};

function createDefaults() {
  return {
    version: SETTINGS_SCHEMA_VERSION,
    general: {
      appName: "NextCards",
      appSubtitle: "Digital cards by Lognext",
      language: "es",
      nameFormat: "first-last",
      timezone: browserTimezone(),
    },
    appearance: {
      density: "comfortable",
      borderRadius: "medium",
      shadowLevel: "subtle",
      logoResource: "symbol-negative",
      ...OFFICIAL_COLORS,
    },
    cards: {
      defaultTemplateId: "corporate-navy",
      defaultStatus: "active",
      defaultVisibleFields: {
        photo: true,
        jobTitle: true,
        department: true,
        city: true,
        email: true,
        phone: true,
        linkedin: true,
        website: true,
        bio: true,
      },
      actionOrder: CARD_ACTIONS.map(item => item.id),
      qr: {
        size: "medium",
        errorCorrection: "M",
        darkColor: "#000029",
        lightColor: "#FFFFFF",
      },
      vcf: {
        includeJobTitle: true,
        includeCompany: true,
        includeWebsite: true,
        includeLinkedin: true,
        includeCity: true,
        includeCorporateNote: false,
      },
      slug: {
        autoGenerate: true,
        allowManualEdit: true,
        lowercase: true,
        spacesToHyphens: true,
      },
    },
    publicCard: {
      companyName: "Lognext",
      companyUrl: "https://lognext.com",
      tagline: "Your Meaningful Tech Partner.",
      showPoweredBy: true,
      showCompanyLogo: true,
      showCompanyLink: true,
      titleSource: "app",
      buttons: {
        saveContact: true,
        share: true,
        copyLink: true,
        showQr: true,
      },
    },
    privacy: {
      hideEmailsInDashboard: false,
      hidePhonesInDashboard: false,
      confirmBeforeCopy: false,
      showPersonalDataNotice: true,
      analyticsEnabled: true,
    },
    updatedAt: "",
  };
}

export function getDefaultSettings() {
  return clone(createDefaults());
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, input) {
  if (!isObject(base)) return input === undefined ? clone(base) : clone(input);
  const output = clone(base);
  if (!isObject(input)) return output;
  Object.entries(input).forEach(([key, value]) => {
    if (!(key in base)) return;
    output[key] = isObject(base[key]) ? deepMerge(base[key], value) : value === undefined ? output[key] : clone(value);
  });
  return output;
}

const allowed = (value, options, fallback) => options.includes(value) ? value : fallback;
const color = (value, fallback) => HEX_COLOR.test(String(value || "")) ? String(value).toUpperCase() : fallback;
const text = (value, fallback, max = 100) => String(value ?? fallback).trim().replace(/\s+/g, " ").slice(0, max) || fallback;
const flag = (value, fallback) => typeof value === "boolean" ? value : fallback;

function validTimezone(value, fallback) {
  try { new Intl.DateTimeFormat("es-ES", {timeZone: value}).format(); return value; }
  catch { return fallback; }
}

function normalizeOrder(value) {
  const valid = new Set(CARD_ACTIONS.map(item => item.id));
  const requested = Array.isArray(value) ? value.filter((item, index, list) => valid.has(item) && list.indexOf(item) === index) : [];
  return [...requested, ...CARD_ACTIONS.map(item => item.id).filter(item => !requested.includes(item))];
}

export function mergeWithDefaults(input = {}) {
  const defaults = createDefaults();
  const merged = deepMerge(defaults, input);
  const normalized = clone(defaults);
  normalized.version = SETTINGS_SCHEMA_VERSION;
  normalized.general = {
    appName: text(merged.general.appName, defaults.general.appName, 50),
    appSubtitle: text(merged.general.appSubtitle, defaults.general.appSubtitle, 90),
    language: "es",
    nameFormat: allowed(merged.general.nameFormat, ["first-last", "last-first"], defaults.general.nameFormat),
    timezone: validTimezone(merged.general.timezone, defaults.general.timezone),
  };
  normalized.appearance = {
    density: allowed(merged.appearance.density, ["comfortable", "compact"], defaults.appearance.density),
    borderRadius: allowed(merged.appearance.borderRadius, ["soft", "medium", "straight"], defaults.appearance.borderRadius),
    shadowLevel: allowed(merged.appearance.shadowLevel, ["none", "subtle", "elevated"], defaults.appearance.shadowLevel),
    logoResource: allowed(merged.appearance.logoResource, Object.keys(LOGO_RESOURCES), defaults.appearance.logoResource),
    primaryColor: color(merged.appearance.primaryColor, defaults.appearance.primaryColor),
    accentColor: color(merged.appearance.accentColor, defaults.appearance.accentColor),
    lightBackground: color(merged.appearance.lightBackground, defaults.appearance.lightBackground),
    darkBackground: color(merged.appearance.darkBackground, defaults.appearance.darkBackground),
    neutralColor: color(merged.appearance.neutralColor, defaults.appearance.neutralColor),
  };
  normalized.cards.defaultTemplateId = text(merged.cards.defaultTemplateId, defaults.cards.defaultTemplateId, 80);
  normalized.cards.defaultStatus = allowed(merged.cards.defaultStatus, ["active", "draft"], defaults.cards.defaultStatus);
  Object.keys(defaults.cards.defaultVisibleFields).forEach(key => {
    normalized.cards.defaultVisibleFields[key] = flag(merged.cards.defaultVisibleFields[key], defaults.cards.defaultVisibleFields[key]);
  });
  normalized.cards.actionOrder = normalizeOrder(merged.cards.actionOrder);
  normalized.cards.qr = {
    size: allowed(merged.cards.qr.size, ["small", "medium", "large"], defaults.cards.qr.size),
    errorCorrection: allowed(merged.cards.qr.errorCorrection, ["L", "M", "Q", "H"], defaults.cards.qr.errorCorrection),
    darkColor: color(merged.cards.qr.darkColor, defaults.cards.qr.darkColor),
    lightColor: color(merged.cards.qr.lightColor, defaults.cards.qr.lightColor),
  };
  Object.keys(defaults.cards.vcf).forEach(key => normalized.cards.vcf[key] = flag(merged.cards.vcf[key], defaults.cards.vcf[key]));
  Object.keys(defaults.cards.slug).forEach(key => normalized.cards.slug[key] = flag(merged.cards.slug[key], defaults.cards.slug[key]));
  normalized.publicCard = {
    companyName: text(merged.publicCard.companyName, defaults.publicCard.companyName, 70),
    companyUrl: text(merged.publicCard.companyUrl, defaults.publicCard.companyUrl, 220),
    tagline: text(merged.publicCard.tagline, defaults.publicCard.tagline, 140),
    showPoweredBy: flag(merged.publicCard.showPoweredBy, defaults.publicCard.showPoweredBy),
    showCompanyLogo: flag(merged.publicCard.showCompanyLogo, defaults.publicCard.showCompanyLogo),
    showCompanyLink: flag(merged.publicCard.showCompanyLink, defaults.publicCard.showCompanyLink),
    titleSource: allowed(merged.publicCard.titleSource, ["app", "company"], defaults.publicCard.titleSource),
    buttons: {},
  };
  Object.keys(defaults.publicCard.buttons).forEach(key => normalized.publicCard.buttons[key] = flag(merged.publicCard.buttons[key], defaults.publicCard.buttons[key]));
  Object.keys(defaults.privacy).forEach(key => normalized.privacy[key] = flag(merged.privacy[key], defaults.privacy[key]));
  normalized.updatedAt = Number.isNaN(new Date(merged.updatedAt).getTime()) ? "" : new Date(merged.updatedAt).toISOString();
  return normalized;
}

export function migrateSettings(input) {
  if (!isObject(input)) return getDefaultSettings();
  const version = Number(input.version || 0);
  if (version > SETTINGS_SCHEMA_VERSION) {
    const problem = new Error(`La configuración usa la versión ${version}, superior a la compatible (${SETTINGS_SCHEMA_VERSION}).`);
    problem.code = "SETTINGS_VERSION_INCOMPATIBLE";
    throw problem;
  }
  return mergeWithDefaults(input);
}

function channels(hex) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  return channels(hex).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}

export function colorContrast(first, second) {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) return 1;
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

export function validateSettings(input) {
  const settings = mergeWithDefaults(input);
  const errors = [];
  if (!String(input?.general?.appName || "").trim()) errors.push({field: "general.appName", message: "El nombre de la aplicación es obligatorio."});
  if (!String(input?.general?.appSubtitle || "").trim()) errors.push({field: "general.appSubtitle", message: "El subtítulo es obligatorio."});
  ["primaryColor", "accentColor", "lightBackground", "darkBackground", "neutralColor"].forEach(key => {
    if (!HEX_COLOR.test(String(input?.appearance?.[key] || ""))) errors.push({field: `appearance.${key}`, message: "Introduce un color hexadecimal válido."});
  });
  ["darkColor", "lightColor"].forEach(key => {
    if (!HEX_COLOR.test(String(input?.cards?.qr?.[key] || ""))) errors.push({field: `cards.qr.${key}`, message: "Introduce un color hexadecimal válido."});
  });
  if (HEX_COLOR.test(String(input?.appearance?.primaryColor || "")) && colorContrast(settings.appearance.primaryColor, "#FFFFFF") < 4.5) {
    errors.push({field: "appearance.primaryColor", message: "El color principal necesita contraste suficiente con texto blanco."});
  }
  if (HEX_COLOR.test(String(input?.appearance?.darkBackground || "")) && colorContrast(settings.appearance.darkBackground, "#FFFFFF") < 4.5) {
    errors.push({field: "appearance.darkBackground", message: "El fondo oscuro necesita contraste suficiente con texto blanco."});
  }
  if (HEX_COLOR.test(String(input?.appearance?.lightBackground || "")) && colorContrast(settings.appearance.lightBackground, "#11111F") < 4.5) {
    errors.push({field: "appearance.lightBackground", message: "El fondo claro necesita contraste suficiente con el texto de la interfaz."});
  }
  if (HEX_COLOR.test(String(input?.appearance?.accentColor || "")) && Math.max(colorContrast(settings.appearance.accentColor, "#FFFFFF"), colorContrast(settings.appearance.accentColor, settings.appearance.primaryColor), colorContrast(settings.appearance.accentColor, "#11111F")) < 4.5) {
    errors.push({field: "appearance.accentColor", message: "El color de acento necesita contraste suficiente para botones y controles."});
  }
  try {
    const url = new URL(settings.publicCard.companyUrl);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
  } catch { errors.push({field: "publicCard.companyUrl", message: "La web corporativa debe ser una URL http o https válida."}); }
  if (colorContrast(settings.cards.qr.darkColor, settings.cards.qr.lightColor) < 4.5) {
    errors.push({field: "cards.qr.darkColor", message: "Los colores del QR necesitan un contraste mínimo de 4,5:1."});
  }
  if (!settings.cards.slug.autoGenerate && !settings.cards.slug.allowManualEdit) {
    errors.push({field: "cards.slug.autoGenerate", message: "Activa la generación automática o permite editar el slug manualmente."});
  }
  return {settings, errors};
}

function notify(settings) {
  try { globalThis.dispatchEvent?.(new CustomEvent("nextcards:settings-changed", {detail: clone(settings)})); }
  catch { /* No existe DOM durante las pruebas. */ }
}

export const settingsService = {
  getSettings() {
    const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null || raw === undefined) {
      const defaults = getDefaultSettings();
      globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    try {
      const parsed = JSON.parse(raw);
      const migrated = migrateSettings(parsed);
      if (JSON.stringify(parsed) !== JSON.stringify(migrated)) globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    catch (error) {
      if (error.code === "SETTINGS_VERSION_INCOMPATIBLE") {
        console.warn(`La configuración local pertenece a una versión más reciente; se usarán valores seguros sin sobrescribirla. ${error.message}`);
        return getDefaultSettings();
      }
      console.warn("No se pudo leer la configuración; se usarán valores seguros.", error);
      const defaults = getDefaultSettings();
      globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
  },
  saveSettings(input) {
    const validation = validateSettings(input);
    if (validation.errors.length) {
      const problem = new Error(validation.errors[0].message);
      problem.code = "SETTINGS_VALIDATION";
      problem.validation = validation;
      throw problem;
    }
    const saved = {...validation.settings, version: SETTINGS_SCHEMA_VERSION, updatedAt: new Date().toISOString()};
    globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(saved));
    notify(saved);
    return clone(saved);
  },
  resetSettings() {
    const settings = getDefaultSettings();
    globalThis.localStorage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    notify(settings);
    return settings;
  },
  syncDefaultTemplate(templateId) {
    const settings = this.getSettings();
    if (settings.cards.defaultTemplateId === templateId) return settings;
    settings.cards.defaultTemplateId = templateId;
    return this.saveSettings(settings);
  },
};

export function formatPersonName(card, settings = settingsService.getSettings()) {
  const first = String(card?.firstName || "").trim();
  const last = String(card?.lastName || "").trim();
  return settings.general.nameFormat === "last-first" && last ? `${last}, ${first}`.trim() : `${first} ${last}`.trim();
}

export function formatSettingsDate(value, settings = settingsService.getSettings()) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {dateStyle: "medium", timeStyle: "short", timeZone: settings.general.timezone}).format(new Date(value));
}

export function applySettingsToDocument(settings = settingsService.getSettings(), documentRef = globalThis.document) {
  if (!documentRef?.documentElement) return settings;
  const root = documentRef.documentElement;
  const radius = {
    soft: ["14px", "22px", "30px"],
    medium: ["10px", "16px", "24px"],
    straight: ["3px", "5px", "7px"],
  }[settings.appearance.borderRadius];
  const shadows = {
    none: ["none", "none"],
    subtle: ["0 4px 16px rgba(0,0,41,.07)", "0 18px 48px rgba(0,0,41,.13)"],
    elevated: ["0 8px 24px rgba(0,0,41,.14)", "0 28px 70px rgba(0,0,41,.22)"],
  }[settings.appearance.shadowLevel];
  root.style.setProperty("--navy", settings.appearance.primaryColor);
  root.style.setProperty("--orange", settings.appearance.accentColor);
  const accentInk = colorContrast(settings.appearance.accentColor, "#FFFFFF") >= 4.5 ? "#FFFFFF"
    : colorContrast(settings.appearance.accentColor, settings.appearance.primaryColor) >= 4.5 ? settings.appearance.primaryColor : "#11111F";
  root.style.setProperty("--accent-ink", accentInk);
  root.style.setProperty("--surface", settings.appearance.lightBackground);
  root.style.setProperty("--dark-surface", settings.appearance.darkBackground);
  root.style.setProperty("--neutral", settings.appearance.neutralColor);
  root.style.setProperty("--border", settings.appearance.neutralColor);
  root.style.setProperty("--radius-sm", radius[0]);
  root.style.setProperty("--radius", radius[1]);
  root.style.setProperty("--radius-lg", radius[2]);
  root.style.setProperty("--shadow-sm", shadows[0]);
  root.style.setProperty("--shadow-md", shadows[1]);
  root.lang = settings.general.language;
  if (documentRef.body) documentRef.body.dataset.density = settings.appearance.density;
  documentRef.querySelectorAll("[data-app-name]").forEach(node => { node.textContent = settings.general.appName; });
  documentRef.querySelectorAll("[data-app-subtitle]").forEach(node => { node.textContent = settings.general.appSubtitle; });
  const logo = LOGO_RESOURCES[settings.appearance.logoResource] || LOGO_RESOURCES["symbol-negative"];
  root.dataset.logoResource = settings.appearance.logoResource;
  documentRef.querySelectorAll("img[data-app-logo]").forEach(node => { node.src = logo.path; });
  const themeMeta = documentRef.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = settings.appearance.primaryColor;
  return settings;
}
