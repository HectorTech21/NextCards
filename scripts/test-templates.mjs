import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [seedSource, globalCss, editorSource, editorCss] = await Promise.all([
  fs.readFile(new URL("../assets/data/employees.json", import.meta.url), "utf8"),
  fs.readFile(new URL("../assets/css/global.css", import.meta.url), "utf8"),
  fs.readFile(new URL("../assets/js/editor.js", import.meta.url), "utf8"),
  fs.readFile(new URL("../assets/css/editor.css", import.meta.url), "utf8"),
]);
const seed = JSON.parse(seedSource);

class LocalStorageMock {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new LocalStorageMock();
globalThis.fetch = async () => ({ok: true, json: async () => structuredClone(seed)});

const {
  TEMPLATES_DATA_VERSION,
  TEMPLATES_STORAGE_KEY,
  TEMPLATES_VERSION_KEY,
  TEMPLATE_OPTIONS,
  templateService,
  validateTemplateDraft,
} = await import("../assets/js/templates-store.js");
const {emptyCard} = await import("../assets/js/cards.js");
const {storage} = await import("../assets/js/storage.js");

const systems = templateService.getSystemTemplates();
const expectedSystemIds = [
  "corporate-navy",
  "corporate-solid-navy",
  "clean-light",
  "meaningful-tech",
  "executive-lines",
  "orange-pulse",
  "blue-grid",
  "talent-focus",
  "minimal-corporate",
  "premium-dark",
];
const legacySystemIds = ["corporate-navy", "clean-light", "meaningful-tech"];
const newSystemIds = expectedSystemIds.filter(id => !legacySystemIds.includes(id));
const brandColors = new Set(["#000029", "#FA3C0F", "#FFFFFF", "#E1E1E8", "#FFFA96", "#64F07D", "#3CE6E6", "#3791F5", "#C896FF"]);
assert.deepEqual(systems.map(item => item.id), expectedSystemIds, "Deben existir las diez plantillas del sistema con IDs estables.");
assert.equal(templateService.getTemplates().length, 10, "La inicialización debe crear las diez plantillas del sistema.");
assert.equal(TEMPLATES_DATA_VERSION, 3, "La nueva plantilla debe activar la migración no destructiva del catálogo.");
assert.equal(templateService.getDefaultTemplate().id, "corporate-navy", "Corporate Navy debe ser la predeterminada inicial.");
assert.equal(templateService.getTemplates().filter(item => item.isDefault).length, 1, "Debe existir una única plantilla predeterminada.");
assert.equal(localStorage.getItem(TEMPLATES_VERSION_KEY), String(TEMPLATES_DATA_VERSION), "Debe persistirse la versión del catálogo.");
for (const id of newSystemIds) {
  const template = templateService.getTemplateById(id);
  assert.equal(template.type, "system", `${id} debe ser una plantilla de sistema.`);
  assert.equal(template.status, "active", `${id} debe estar activa.`);
  assert.ok(template.description, `${id} debe tener una descripción.`);
  assert.ok(TEMPLATE_OPTIONS.backgroundPatterns.includes(template.theme.backgroundPattern), `${id} debe usar un patrón controlado.`);
  for (const key of ["backgroundColor", "accentColor", "textColor", "mutedTextColor", "secondaryColor"]) {
    assert.ok(brandColors.has(template.theme[key]), `${id} debe limitar ${key} a la paleta de marca.`);
  }
}

const solidNavy = templateService.getTemplateById("corporate-solid-navy");
assert.equal(solidNavy.name, "Corporate Solid Navy");
assert.equal(solidNavy.description, "Diseño clásico corporativo con fondo azul marino sólido y composición centrada.");
assert.deepEqual(
  {
    backgroundColor: solidNavy.theme.backgroundColor,
    backgroundPattern: solidNavy.theme.backgroundPattern,
    logoPosition: solidNavy.theme.logoPosition,
    photoShape: solidNavy.theme.photoShape,
    photoSize: solidNavy.theme.photoSize,
    contentOrder: solidNavy.theme.contentOrder,
  },
  {
    backgroundColor: "#000029",
    backgroundPattern: "none",
    logoPosition: "center",
    photoShape: "circle",
    photoSize: "large",
    contentOrder: "identity-contact-social",
  },
  "Corporate Solid Navy debe conservar la composición centrada y el fondo sólido.",
);
const solidNavyCss = globalCss
  .split(/\r?\n/)
  .filter(line => line.includes("template-corporate-solid-navy"))
  .join("\n");
assert.match(solidNavyCss, /\.card-pattern\{display:none\}/, "La plantilla debe ocultar cualquier patrón decorativo.");
assert.match(solidNavyCss, /align-items:center;text-align:center/, "La composición debe permanecer centrada.");
assert.doesNotMatch(solidNavyCss, /gradient|background-image|repeating-/i, "La variante no debe introducir degradados ni tramas.");
assert.match(editorSource, /baseId==="corporate-solid-navy"\)return "solid"/, "El selector del editor debe representar la variante sólida.");
assert.match(editorCss, /\.template-swatch\.solid::after\{display:none\}/, "La miniatura del editor no debe dibujar diagonales.");

const legacyCustom = {
  id: "custom-legado",
  name: "Plantilla legada",
  description: "Personalización creada antes de ampliar el catálogo.",
  type: "custom",
  baseTemplateId: "clean-light",
  status: "active",
  isDefault: true,
  theme: {...templateService.getTemplateById("clean-light").theme, accentColor: "#C896FF"},
  createdAt: "2026-07-16T00:00:00.000Z",
  updatedAt: "2026-07-16T00:00:00.000Z",
};
localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify([
  ...legacySystemIds.map(id => ({...templateService.getTemplateById(id), isDefault: false})),
  legacyCustom,
]));
localStorage.setItem(TEMPLATES_VERSION_KEY, "1");
const migratedCatalog = templateService.getTemplates();
assert.equal(migratedCatalog.length, 11, "La migración debe añadir siete sistemas sin perder la variante legada.");
assert.ok(newSystemIds.every(id => migratedCatalog.some(item => item.id === id)), "La migración debe incorporar todas las plantillas nuevas.");
assert.equal(templateService.getTemplateById(legacyCustom.id).theme.accentColor, "#C896FF", "La migración debe conservar las personalizaciones.");
assert.equal(templateService.getDefaultTemplate().id, legacyCustom.id, "La migración debe conservar la predeterminada elegida por el usuario.");
assert.equal(localStorage.getItem(TEMPLATES_VERSION_KEY), String(TEMPLATES_DATA_VERSION));
localStorage.removeItem(TEMPLATES_STORAGE_KEY);
localStorage.removeItem(TEMPLATES_VERSION_KEY);
assert.equal(templateService.getTemplates().length, 10, "La reinicialización limpia debe recuperar los diez diseños del sistema.");

templateService.setDefaultTemplate("corporate-solid-navy");
assert.equal(templateService.getDefaultTemplate().id, "corporate-solid-navy", "Corporate Solid Navy debe poder ser predeterminada.");
assert.equal(emptyCard().template, "corporate-solid-navy", "Una tarjeta nueva debe heredar la nueva predeterminada.");
templateService.setDefaultTemplate("corporate-navy");

const automaticVariant = templateService.createVariant("corporate-navy");
const secondAutomaticVariant = templateService.createVariant("corporate-navy");
assert.notEqual(automaticVariant.name, secondAutomaticVariant.name, "Las variantes automáticas sucesivas deben recibir nombres únicos.");
templateService.deleteTemplate(automaticVariant.id);
templateService.deleteTemplate(secondAutomaticVariant.id);

const persistedReload = await import(`../assets/js/templates-store.js?reload=${Date.now()}`);
assert.equal(persistedReload.templateService.getTemplates().length, 10, "Una segunda carga no debe duplicar las plantillas del sistema.");

const variant = templateService.createVariant("clean-light", {
  name: "Clean Light · Dirección",
  description: "Variante corporativa para perfiles de dirección.",
  theme: {accentColor: "#3791F5", buttonStyle: "solid", photoShape: "rounded"},
});
assert.match(variant.id, /^custom-clean-light-direccion/, "Las variantes deben recibir un ID propio y semántico.");
assert.equal(variant.type, "custom");
assert.equal(variant.baseTemplateId, "clean-light");
assert.equal(variant.theme.accentColor, "#3791F5");
assert.equal(templateService.getTemplates().length, 11);
assert.ok(JSON.parse(localStorage.getItem(TEMPLATES_STORAGE_KEY)).some(item => item.id === variant.id), "La variante debe persistir en localStorage.");
assert.doesNotMatch(localStorage.getItem(TEMPLATES_STORAGE_KEY), /undefined|<style|javascript:/i, "El catálogo serializado no debe aceptar CSS o código arbitrario.");
localStorage.setItem(TEMPLATES_VERSION_KEY, "0");
assert.ok(templateService.getTemplates().some(item => item.id === variant.id), "Actualizar la versión del catálogo no debe sobrescribir variantes del usuario.");
assert.equal(localStorage.getItem(TEMPLATES_VERSION_KEY), String(TEMPLATES_DATA_VERSION));

const invalid = validateTemplateDraft({
  name: "Variante inválida",
  baseTemplateId: "corporate-navy",
  theme: {...systems[0].theme, backgroundColor: "red", textColor: "#000029"},
});
assert.ok(invalid.errors.length, "Los colores no hexadecimales deben bloquearse.");
const invisibleButtons = validateTemplateDraft({
  name: "Botones invisibles",
  baseTemplateId: "corporate-navy",
  theme: {...systems[0].theme, accentColor: systems[0].theme.backgroundColor},
});
assert.ok(invisibleButtons.errors.some(message => message.includes("botones")), "El editor debe bloquear botones indistinguibles del fondo.");
assert.ok(TEMPLATE_OPTIONS.buttonStyles.includes(variant.theme.buttonStyle), "El estilo de botón debe pertenecer al catálogo controlado.");

const updated = templateService.updateTemplate(variant.id, {description: "Descripción actualizada.", theme: {backgroundPattern: "soft-lines"}});
assert.equal(updated.description, "Descripción actualizada.");
assert.equal(updated.theme.backgroundPattern, "soft-lines");
assert.equal(updated.theme.accentColor, "#3791F5", "Una edición parcial debe conservar el resto del tema.");

const duplicate = templateService.duplicateTemplate(variant.id);
assert.notEqual(duplicate.id, variant.id);
assert.notEqual(duplicate.name, variant.name);
assert.equal(duplicate.baseTemplateId, variant.baseTemplateId);
assert.equal(templateService.archiveTemplate(duplicate.id).status, "archived");
assert.equal(templateService.resolveTemplate(duplicate.id).id, duplicate.id, "Las tarjetas existentes deben poder resolver una plantilla archivada.");
assert.throws(() => templateService.applyTemplateToCards(duplicate.id, [seed[0].id]), problem => problem.code === "ARCHIVED_TEMPLATE");
assert.equal(templateService.restoreTemplate(duplicate.id).status, "active");
assert.equal(templateService.deleteTemplate(duplicate.id), true, "Una variante sin uso debe poder eliminarse.");
assert.equal(templateService.getTemplateById(duplicate.id), null);

assert.throws(() => templateService.updateTemplate("corporate-navy", {name: "Cambio"}), problem => problem.code === "SYSTEM_TEMPLATE");
assert.throws(() => templateService.deleteTemplate("corporate-navy"), problem => problem.code === "SYSTEM_TEMPLATE");
assert.throws(() => templateService.duplicateTemplate("corporate-navy"), problem => problem.code === "SYSTEM_TEMPLATE");

const franciscoCards = seed.filter(card => card.email === "javier.pedraza@lognext.com");
assert.equal(franciscoCards.length, 2, "La misma persona puede conservar dos tarjetas diferenciadas por ID.");
assert.notEqual(franciscoCards[0].id, franciscoCards[1].id);
const individualTemplateResult = templateService.applyTemplateToCards("corporate-solid-navy", [franciscoCards[0].id]);
assert.deepEqual(individualTemplateResult, {updated: 1, skipped: 0, errors: []});
const cardsAfterIndividualApply = storage.getCards();
assert.equal(cardsAfterIndividualApply.find(card => card.id === franciscoCards[0].id).template, "corporate-solid-navy", "El cambio individual debe persistir por ID de tarjeta.");
assert.equal(cardsAfterIndividualApply.find(card => card.id === franciscoCards[1].id).template, "corporate-navy", "Compartir email no puede aplicar la plantilla a otra tarjeta.");
assert.deepEqual(templateService.getCardsUsingTemplate("corporate-solid-navy").map(card => card.id), [franciscoCards[0].id]);
templateService.applyTemplateToCards("corporate-navy", [franciscoCards[0].id]);

const beforeApply = seed.slice(0, 2).map(card => structuredClone(card));
const firstResult = templateService.applyTemplateToCards(variant.id, beforeApply.map(card => card.id));
assert.deepEqual(firstResult, {updated: 2, skipped: 0, errors: []});
const appliedCards = templateService.getCardsUsingTemplate(variant.id);
assert.equal(appliedCards.length, 2);
for (const original of beforeApply) {
  const applied = appliedCards.find(card => card.id === original.id);
  assert.ok(applied, `Debe conservarse la tarjeta ${original.id}.`);
  for (const [key, value] of Object.entries(original)) {
    if (["template", "updatedAt"].includes(key)) continue;
    assert.deepEqual(applied[key], value, `Aplicar una plantilla no puede alterar ${key}.`);
  }
  assert.equal(applied.accentColor, original.accentColor, "Por defecto debe conservarse el color propio de cada tarjeta.");
}

const accentResult = templateService.applyTemplateToCards("meaningful-tech", [beforeApply[0].id], {useTemplateAccent: true});
assert.equal(accentResult.updated, 1);
assert.equal(storage.getCards().find(card => card.id === beforeApply[0].id).accentColor, templateService.getTemplateById("meaningful-tech").theme.accentColor, "La aplicación explícita del color debe usar el acento de la plantilla.");

assert.throws(() => templateService.deleteTemplate(variant.id), problem => problem.code === "TEMPLATE_IN_USE" && problem.usage === 1, "No se puede eliminar una plantilla que sigue en uso.");
templateService.applyTemplateToCards("corporate-navy", [beforeApply[1].id]);
assert.equal(templateService.deleteTemplate(variant.id), true, "Tras reasignar sus tarjetas la variante sí puede eliminarse.");

const defaultVariant = templateService.createVariant("meaningful-tech", {name: "Tech predeterminada"});
templateService.setDefaultTemplate(defaultVariant.id);
assert.equal(templateService.getTemplates().filter(item => item.isDefault).length, 1);
assert.equal(templateService.getDefaultTemplate().id, defaultVariant.id);
assert.equal(persistedReload.templateService.getDefaultTemplate().id, defaultVariant.id, "La predeterminada debe conservarse al recargar el módulo.");
assert.equal(emptyCard().template, defaultVariant.id, "Las tarjetas nuevas deben usar la plantilla predeterminada actual.");
assert.equal(emptyCard().accentColor, defaultVariant.theme.accentColor);
assert.equal(storage.getCards().find(card => card.id === beforeApply[0].id).template, "meaningful-tech", "Cambiar la predeterminada no debe alterar tarjetas con asignación explícita.");
assert.throws(() => templateService.archiveTemplate(defaultVariant.id), problem => problem.code === "DEFAULT_TEMPLATE");
assert.equal(templateService.resolveTemplate("plantilla-inexistente", {warn: false}).id, defaultVariant.id, "Una referencia inexistente debe usar la predeterminada como fallback.");
assert.equal(templateService.resolveTemplate("", {warn: false}).id, defaultVariant.id, "Una tarjeta sin plantilla debe usar la predeterminada como fallback.");

templateService.setDefaultTemplate("corporate-navy");
templateService.archiveTemplate(defaultVariant.id);
assert.equal(templateService.getTemplateById(defaultVariant.id).status, "archived");
assert.equal(templateService.getTemplates({includeArchived: false}).some(item => item.id === defaultVariant.id), false);
templateService.restoreTemplate(defaultVariant.id);
templateService.deleteTemplate(defaultVariant.id);

const finalCatalog = templateService.getTemplates();
assert.equal(finalCatalog.length, 10, "El catálogo final de prueba debe volver a sus diez diseños del sistema.");
assert.equal(new Set(finalCatalog.map(item => item.id)).size, finalCatalog.length, "Los IDs de plantilla deben ser únicos.");
assert.equal(finalCatalog.filter(item => item.isDefault).length, 1);

console.log("OK: diez sistemas, Corporate Solid Navy, migración, persistencia, variantes, edición, duplicado, archivo, borrado, predeterminada, fallback y aplicación individual segura verificados.");
