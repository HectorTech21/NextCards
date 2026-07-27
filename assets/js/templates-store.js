import {storage} from "./storage.js?v=1.9.0";
import {settingsService} from "./settings-store.js?v=1.9.0";

export const TEMPLATES_STORAGE_KEY = "nextcards.templates.v1";
export const TEMPLATES_VERSION_KEY = "nextcards.templates.seed.version";
export const TEMPLATES_DATA_VERSION = 3;

const SYSTEM_TIMESTAMP = "2026-07-17T00:00:00.000Z";
const HEX_COLOR = /^#[0-9A-F]{6}$/i;

export const TEMPLATE_OPTIONS = Object.freeze({
  buttonStyles: ["solid", "outline", "minimal"],
  photoShapes: ["circle", "rounded"],
  photoSizes: ["small", "medium", "large"],
  backgroundPatterns: ["none", "diagonal-lines", "soft-lines", "geometric-block", "corporate-gradient", "executive-lines", "pulse-blocks", "blue-grid", "focus-frame", "premium-lines"],
  logoVariants: ["white", "blue", "symbol"],
  logoPositions: ["left", "center", "right"],
  contentOrders: ["identity-contact-social", "identity-social-contact", "contact-identity-social"],
});

export const CORPORATE_PRESETS = Object.freeze([
  {name: "Corporate Navy", backgroundColor: "#000029", accentColor: "#FA3C0F", textColor: "#FFFFFF", secondaryColor: "#E1E1E8"},
  {name: "Clean Light", backgroundColor: "#F8F8FA", accentColor: "#FA3C0F", textColor: "#000029", secondaryColor: "#000029"},
  {name: "Turquoise Tech", backgroundColor: "#000029", accentColor: "#3CE6E6", textColor: "#FFFFFF", secondaryColor: "#3791F5"},
  {name: "Violet Signal", backgroundColor: "#000029", accentColor: "#C896FF", textColor: "#FFFFFF", secondaryColor: "#3CE6E6"},
]);

const SYSTEM_TEMPLATES = [
  {
    id: "corporate-navy",
    name: "Corporate Navy",
    description: "Diseño corporativo principal de Lognext.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: true,
    theme: {
      backgroundColor: "#000029", accentColor: "#FA3C0F", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#FFFFFF",
      buttonStyle: "solid", photoShape: "circle", photoSize: "medium", backgroundPattern: "diagonal-lines",
      logoVariant: "white", logoPosition: "center", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "corporate-solid-navy",
    name: "Corporate Solid Navy",
    description: "Diseño clásico corporativo con fondo azul marino sólido y composición centrada.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#000029", accentColor: "#FA3C0F", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#E1E1E8",
      buttonStyle: "minimal", photoShape: "circle", photoSize: "large", backgroundPattern: "none",
      logoVariant: "white", logoPosition: "center", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "clean-light",
    name: "Clean Light",
    description: "Diseño luminoso, limpio y de alto contraste.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#F8F8FA", accentColor: "#FA3C0F", textColor: "#000029", mutedTextColor: "#686878", secondaryColor: "#000029",
      buttonStyle: "outline", photoShape: "circle", photoSize: "medium", backgroundPattern: "none",
      logoVariant: "white", logoPosition: "center", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "meaningful-tech",
    name: "Meaningful Tech",
    description: "Composición tecnológica basada en el lenguaje gráfico de Lognext.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#000029", accentColor: "#3CE6E6", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#3791F5",
      buttonStyle: "minimal", photoShape: "circle", photoSize: "small", backgroundPattern: "soft-lines",
      logoVariant: "white", logoPosition: "left", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "executive-lines",
    name: "Executive Lines",
    description: "Líneas diagonales y jerarquía ejecutiva sobre azul marino.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#000029", accentColor: "#FA3C0F", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#E1E1E8",
      buttonStyle: "solid", photoShape: "circle", photoSize: "medium", backgroundPattern: "executive-lines",
      logoVariant: "white", logoPosition: "left", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "orange-pulse",
    name: "Orange Pulse",
    description: "Composición luminosa con cabecera marino y pulso naranja.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#FFFFFF", accentColor: "#FA3C0F", textColor: "#000029", mutedTextColor: "#000029", secondaryColor: "#000029",
      buttonStyle: "solid", photoShape: "rounded", photoSize: "medium", backgroundPattern: "pulse-blocks",
      logoVariant: "white", logoPosition: "center", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "blue-grid",
    name: "Blue Grid",
    description: "Retícula azul sutil para perfiles tecnológicos y digitales.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#000029", accentColor: "#3791F5", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#3CE6E6",
      buttonStyle: "outline", photoShape: "rounded", photoSize: "small", backgroundPattern: "blue-grid",
      logoVariant: "white", logoPosition: "left", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-social-contact",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "talent-focus",
    name: "Talent Focus",
    description: "Retrato protagonista y llamadas de contacto muy visibles.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#FFFFFF", accentColor: "#FA3C0F", textColor: "#000029", mutedTextColor: "#000029", secondaryColor: "#000029",
      buttonStyle: "solid", photoShape: "circle", photoSize: "large", backgroundPattern: "focus-frame",
      logoVariant: "white", logoPosition: "center", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-contact-social",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "minimal-corporate",
    name: "Minimal Corporate",
    description: "Máxima claridad, espacio en blanco y acentos naranjas discretos.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#FFFFFF", accentColor: "#FA3C0F", textColor: "#000029", mutedTextColor: "#000029", secondaryColor: "#E1E1E8",
      buttonStyle: "minimal", photoShape: "rounded", photoSize: "small", backgroundPattern: "none",
      logoVariant: "blue", logoPosition: "left", showTagline: false, showDepartment: true, showCity: true,
      contentOrder: "identity-social-contact",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
  {
    id: "premium-dark",
    name: "Premium Dark",
    description: "Diseño oscuro, sobrio y premium para dirección y perfiles ejecutivos.",
    type: "system",
    baseTemplateId: null,
    status: "active",
    isDefault: false,
    theme: {
      backgroundColor: "#000029", accentColor: "#FA3C0F", textColor: "#FFFFFF", mutedTextColor: "#E1E1E8", secondaryColor: "#E1E1E8",
      buttonStyle: "outline", photoShape: "rounded", photoSize: "medium", backgroundPattern: "premium-lines",
      logoVariant: "white", logoPosition: "right", showTagline: true, showDepartment: true, showCity: true,
      contentOrder: "identity-social-contact",
    },
    createdAt: SYSTEM_TIMESTAMP,
    updatedAt: SYSTEM_TIMESTAMP,
  },
];

const clone = value => JSON.parse(JSON.stringify(value));
const stamp = () => new Date().toISOString();
const normalizeName = value => String(value || "").trim().replace(/\s+/g, " ");
const normalizeId = value => normalizeName(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54);

function error(message, code, details = {}) {
  const problem = new Error(message);
  problem.code = code;
  Object.assign(problem, details);
  return problem;
}

function normalizeColor(value, fallback) {
  const color = String(value || "").trim().toUpperCase();
  return HEX_COLOR.test(color) ? color : fallback;
}

function allowed(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function normalizeTheme(theme = {}, fallback = SYSTEM_TEMPLATES[0].theme) {
  return {
    backgroundColor: normalizeColor(theme.backgroundColor, fallback.backgroundColor),
    accentColor: normalizeColor(theme.accentColor, fallback.accentColor),
    textColor: normalizeColor(theme.textColor, fallback.textColor),
    mutedTextColor: normalizeColor(theme.mutedTextColor, fallback.mutedTextColor),
    secondaryColor: normalizeColor(theme.secondaryColor, fallback.secondaryColor),
    buttonStyle: allowed(theme.buttonStyle, TEMPLATE_OPTIONS.buttonStyles, fallback.buttonStyle),
    photoShape: allowed(theme.photoShape, TEMPLATE_OPTIONS.photoShapes, fallback.photoShape),
    photoSize: allowed(theme.photoSize, TEMPLATE_OPTIONS.photoSizes, fallback.photoSize),
    backgroundPattern: allowed(theme.backgroundPattern, TEMPLATE_OPTIONS.backgroundPatterns, fallback.backgroundPattern),
    logoVariant: allowed(theme.logoVariant, TEMPLATE_OPTIONS.logoVariants, fallback.logoVariant),
    logoPosition: allowed(theme.logoPosition, TEMPLATE_OPTIONS.logoPositions, fallback.logoPosition),
    showTagline: typeof theme.showTagline === "boolean" ? theme.showTagline : fallback.showTagline,
    showDepartment: typeof theme.showDepartment === "boolean" ? theme.showDepartment : fallback.showDepartment,
    showCity: typeof theme.showCity === "boolean" ? theme.showCity : fallback.showCity,
    contentOrder: allowed(theme.contentOrder, TEMPLATE_OPTIONS.contentOrders, fallback.contentOrder),
  };
}

function completeSystemTemplate(seed, existing = {}) {
  return {
    ...clone(seed),
    ...existing,
    id: seed.id,
    type: "system",
    baseTemplateId: null,
    status: existing.status === "archived" ? "active" : (existing.status || "active"),
    theme: normalizeTheme(existing.theme, seed.theme),
    createdAt: existing.createdAt || seed.createdAt,
    updatedAt: existing.updatedAt || seed.updatedAt,
  };
}

function completeCustomTemplate(template) {
  const base = SYSTEM_TEMPLATES.find(item => item.id === template.baseTemplateId) || SYSTEM_TEMPLATES[0];
  return {
    id: normalizeName(template.id),
    name: normalizeName(template.name) || "Variante sin nombre",
    description: normalizeName(template.description),
    type: "custom",
    baseTemplateId: base.id,
    status: template.status === "archived" ? "archived" : "active",
    isDefault: Boolean(template.isDefault),
    theme: normalizeTheme(template.theme, base.theme),
    createdAt: template.createdAt || stamp(),
    updatedAt: template.updatedAt || template.createdAt || stamp(),
  };
}

function normalizeCollection(input) {
  const existing = Array.isArray(input) ? input.filter(item => item && typeof item === "object") : [];
  const systems = SYSTEM_TEMPLATES.map(seed => completeSystemTemplate(seed, existing.find(item => item.id === seed.id)));
  const customs = existing.filter(item => item.type === "custom" && item.id && !systems.some(system => system.id === item.id)).map(completeCustomTemplate);
  const templates = [...systems, ...customs];
  const currentDefault = templates.find(item => item.isDefault && item.status === "active");
  const defaultId = currentDefault?.id || "corporate-navy";
  return templates.map(item => ({...item, isDefault: item.id === defaultId}));
}

function saveCollection(templates) {
  const normalized = normalizeCollection(templates);
  localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(normalized));
  localStorage.setItem(TEMPLATES_VERSION_KEY, String(TEMPLATES_DATA_VERSION));
  return clone(normalized);
}

function initializeTemplates() {
  const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
  if (raw === null) return saveCollection(SYSTEM_TEMPLATES);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Formato no válido");
    const normalized = normalizeCollection(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized) || localStorage.getItem(TEMPLATES_VERSION_KEY) !== String(TEMPLATES_DATA_VERSION)) saveCollection(normalized);
    return normalized;
  } catch (cause) {
    console.warn("No se pudieron leer las plantillas; se usarán las del sistema.", cause);
    return clone(SYSTEM_TEMPLATES);
  }
}

function colorChannels(color) {
  return [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16) / 255);
}

function luminance(color) {
  const channels = colorChannels(color).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}

export function contrastRatio(first, second) {
  if (!HEX_COLOR.test(first) || !HEX_COLOR.test(second)) return 1;
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

export function readableTextColor(backgroundColor) {
  return contrastRatio(backgroundColor, "#FFFFFF") >= contrastRatio(backgroundColor, "#000029") ? "#FFFFFF" : "#000029";
}

export function validateTemplateDraft(data, {exceptId = ""} = {}) {
  const errors = [];
  const warnings = [];
  const name = normalizeName(data.name);
  const base = SYSTEM_TEMPLATES.find(item => item.id === data.baseTemplateId) || SYSTEM_TEMPLATES[0];
  const rawTheme = data.theme || {};
  if (!name) errors.push("El nombre de la plantilla es obligatorio.");
  const duplicated = initializeTemplates().some(item => item.id !== exceptId && item.name.localeCompare(name, "es", {sensitivity: "accent"}) === 0);
  if (duplicated) errors.push("Ya existe una plantilla con ese nombre.");
  ["backgroundColor", "accentColor", "textColor", "mutedTextColor", "secondaryColor"].forEach(key => {
    if (!HEX_COLOR.test(String(rawTheme[key] || ""))) errors.push(`${key} debe ser un color hexadecimal válido.`);
  });
  const theme = normalizeTheme(rawTheme, base.theme);
  const textContrast = contrastRatio(theme.backgroundColor, theme.textColor);
  if (textContrast < 2.5) errors.push("El contraste entre texto y fondo es insuficiente.");
  else if (textContrast < 4.5) warnings.push("El contraste del texto no alcanza WCAG AA para texto normal.");
  if (contrastRatio(theme.backgroundColor, theme.accentColor) < 1.2) errors.push("El color de los botones no puede ser indistinguible del fondo.");
  if (contrastRatio(theme.backgroundColor, theme.mutedTextColor) < 2.5) warnings.push("El texto secundario tendrá poco contraste con el fondo.");
  if (theme.logoVariant === "white" && contrastRatio(theme.backgroundColor, "#FFFFFF") < 3) warnings.push("El logo blanco tendrá poco contraste con este fondo.");
  if (theme.logoVariant === "blue" && contrastRatio(theme.backgroundColor, "#000029") < 3) warnings.push("El logo azul tendrá poco contraste con este fondo.");
  return {errors, warnings, theme, name, description: normalizeName(data.description), baseTemplateId: base.id};
}

function uniqueCustomId(name, templates) {
  const base = `custom-${normalizeId(name) || "variante"}`;
  let id = base;
  let suffix = 2;
  while (templates.some(item => item.id === id)) id = `${base}-${suffix++}`;
  return id;
}

function uniqueCopyName(name, templates) {
  const base = `${name} · Copia`;
  let candidate = base;
  let suffix = 2;
  while (templates.some(item => item.name.localeCompare(candidate, "es", {sensitivity: "accent"}) === 0)) candidate = `${base} ${suffix++}`;
  return candidate;
}

function uniqueVariantName(name, templates) {
  const base = `${name} · Variante`;
  let candidate = base;
  let suffix = 2;
  while (templates.some(item => item.name.localeCompare(candidate, "es", {sensitivity: "accent"}) === 0)) candidate = `${base} ${suffix++}`;
  return candidate;
}

export const templateService = {
  getTemplates({includeArchived = true} = {}) {
    const templates = initializeTemplates();
    return clone(includeArchived ? templates : templates.filter(item => item.status === "active"));
  },
  getTemplateById(id) {
    return this.getTemplates().find(item => item.id === id) || null;
  },
  getSystemTemplates() {
    return this.getTemplates().filter(item => item.type === "system");
  },
  getDefaultTemplate() {
    return this.getTemplates().find(item => item.isDefault && item.status === "active") || this.getTemplateById("corporate-navy") || clone(SYSTEM_TEMPLATES[0]);
  },
  resolveTemplate(id, {warn = true} = {}) {
    const template = this.getTemplateById(id);
    if (template) return template;
    const fallback = this.getDefaultTemplate();
    if (warn) console.warn(`La plantilla "${id || "sin identificar"}" no existe; se usa "${fallback.id}".`);
    return fallback;
  },
  createTemplate(data) {
    const templates = this.getTemplates();
    const validation = validateTemplateDraft(data);
    if (validation.errors.length) throw error(validation.errors[0], "VALIDATION_ERROR", {validation});
    const now = stamp();
    const created = {
      id: uniqueCustomId(validation.name, templates),
      name: validation.name,
      description: validation.description,
      type: "custom",
      baseTemplateId: validation.baseTemplateId,
      status: "active",
      isDefault: false,
      theme: validation.theme,
      createdAt: now,
      updatedAt: now,
    };
    saveCollection([...templates, created]);
    return clone(created);
  },
  createVariant(sourceId, overrides = {}) {
    const source = this.getTemplateById(sourceId);
    if (!source) throw error("No se ha encontrado la plantilla base.", "NOT_FOUND");
    const name = overrides.name || uniqueVariantName(source.name, this.getTemplates());
    return this.createTemplate({
      name,
      description: overrides.description ?? `Variante basada en ${source.name}.`,
      baseTemplateId: source.type === "system" ? source.id : source.baseTemplateId,
      theme: {...source.theme, ...(overrides.theme || {})},
    });
  },
  updateTemplate(id, data) {
    const templates = this.getTemplates();
    const index = templates.findIndex(item => item.id === id);
    if (index < 0) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (templates[index].type === "system") throw error("Las plantillas del sistema no se editan directamente.", "SYSTEM_TEMPLATE");
    const validation = validateTemplateDraft({...templates[index], ...data, theme: {...templates[index].theme, ...(data.theme || {})}}, {exceptId: id});
    if (validation.errors.length) throw error(validation.errors[0], "VALIDATION_ERROR", {validation});
    const updated = {
      ...templates[index],
      name: validation.name,
      description: validation.description,
      baseTemplateId: validation.baseTemplateId,
      theme: validation.theme,
      updatedAt: stamp(),
    };
    templates[index] = updated;
    saveCollection(templates);
    return clone(updated);
  },
  duplicateTemplate(id) {
    const source = this.getTemplateById(id);
    if (!source) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (source.type === "system") throw error("Crea una variante basada en esta plantilla del sistema.", "SYSTEM_TEMPLATE");
    return this.createTemplate({
      name: uniqueCopyName(source.name, this.getTemplates()),
      description: source.description,
      baseTemplateId: source.baseTemplateId,
      theme: source.theme,
    });
  },
  archiveTemplate(id) {
    const templates = this.getTemplates();
    const index = templates.findIndex(item => item.id === id);
    if (index < 0) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (templates[index].type === "system") throw error("Las plantillas del sistema no se pueden archivar.", "SYSTEM_TEMPLATE");
    if (templates[index].isDefault) throw error("Cambia primero la plantilla predeterminada.", "DEFAULT_TEMPLATE");
    templates[index] = {...templates[index], status: "archived", updatedAt: stamp()};
    saveCollection(templates);
    return clone(templates[index]);
  },
  restoreTemplate(id) {
    const templates = this.getTemplates();
    const index = templates.findIndex(item => item.id === id);
    if (index < 0) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (templates[index].type === "system") throw error("La plantilla del sistema ya está activa.", "SYSTEM_TEMPLATE");
    templates[index] = {...templates[index], status: "active", updatedAt: stamp()};
    saveCollection(templates);
    return clone(templates[index]);
  },
  deleteTemplate(id) {
    const templates = this.getTemplates();
    const template = templates.find(item => item.id === id);
    if (!template) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (template.type === "system") throw error("Las plantillas del sistema no se pueden eliminar.", "SYSTEM_TEMPLATE");
    if (template.isDefault) throw error("La plantilla predeterminada no se puede eliminar.", "DEFAULT_TEMPLATE");
    const usage = this.getTemplateUsageCount(id);
    if (usage) throw error(`Esta plantilla está siendo utilizada por ${usage} tarjeta${usage === 1 ? "" : "s"}.`, "TEMPLATE_IN_USE", {usage});
    saveCollection(templates.filter(item => item.id !== id));
    return true;
  },
  setDefaultTemplate(id) {
    const templates = this.getTemplates();
    const target = templates.find(item => item.id === id);
    if (!target) throw error("No se ha encontrado la plantilla.", "NOT_FOUND");
    if (target.status !== "active") throw error("Una plantilla archivada no puede ser predeterminada.", "ARCHIVED_TEMPLATE");
    saveCollection(templates.map(item => ({...item, isDefault: item.id === id, updatedAt: item.id === id ? stamp() : item.updatedAt})));
    try { settingsService.syncDefaultTemplate(id); }
    catch (cause) { console.warn("La plantilla se actualizó, pero no se pudo sincronizar la preferencia general.", cause); }
    return this.getTemplateById(id);
  },
  getCardsUsingTemplate(id) {
    return storage.getCards().filter(card => this.resolveTemplate(card.template, {warn: false}).id === id);
  },
  getTemplateUsageCount(id) {
    return this.getCardsUsingTemplate(id).length;
  },
  applyTemplateToCards(templateId, cardIds, {useTemplateAccent = false} = {}) {
    const template = this.getTemplateById(templateId);
    if (!template) throw error("No se ha encontrado la plantilla de destino.", "NOT_FOUND");
    if (template.status !== "active") throw error("No se puede aplicar una plantilla archivada.", "ARCHIVED_TEMPLATE");
    const selected = new Set((cardIds || []).filter(Boolean));
    const cards = storage.getCards();
    let updated = 0;
    const now = stamp();
    const nextCards = cards.map(card => {
      if (!selected.has(card.id)) return card;
      updated += 1;
      return {
        ...card,
        template: template.id,
        ...(useTemplateAccent ? {accentColor: template.theme.accentColor} : {}),
        updatedAt: now,
      };
    });
    storage.saveCards(nextCards);
    return {updated, skipped: Math.max(0, selected.size - updated), errors: []};
  },
  importCustomTemplates(input, {mode = "replace"} = {}) {
    if (!Array.isArray(input)) throw error("La copia no contiene una lista válida de plantillas personalizadas.", "INVALID_IMPORT");
    if (!["replace", "merge"].includes(mode)) throw error("Modo de importación no válido.", "INVALID_IMPORT_MODE");
    const current = this.getTemplates();
    const systems = current.filter(item => item.type === "system");
    const customs = mode === "merge" ? current.filter(item => item.type === "custom") : [];
    const byId = new Map(customs.map(item => [item.id, item]));
    for (const raw of input) {
      if (!raw || raw.type !== "custom" || !raw.id || !raw.name) throw error("Hay una plantilla personalizada incompleta.", "INVALID_IMPORT");
      if (systems.some(item => item.id === raw.id)) throw error(`El ID ${raw.id} está reservado por una plantilla del sistema.`, "INVALID_IMPORT");
      const normalized = completeCustomTemplate(raw);
      byId.set(normalized.id, normalized);
    }
    const imported = [...byId.values()];
    const duplicateName = imported.find((item, index) => imported.some((candidate, candidateIndex) => candidateIndex !== index && candidate.name.localeCompare(item.name, "es", {sensitivity: "accent"}) === 0));
    if (duplicateName) throw error(`El nombre de plantilla "${duplicateName.name}" está duplicado.`, "INVALID_IMPORT");
    saveCollection([...systems, ...imported]);
    return {imported: input.length, totalCustom: imported.length};
  },
  resetForTests() {
    localStorage.removeItem(TEMPLATES_STORAGE_KEY);
    localStorage.removeItem(TEMPLATES_VERSION_KEY);
    return this.getTemplates();
  },
};

export function getSystemTemplateSeeds() {
  return clone(SYSTEM_TEMPLATES);
}
