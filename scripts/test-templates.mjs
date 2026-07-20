import assert from "node:assert/strict";
import fs from "node:fs/promises";

const seed = JSON.parse(await fs.readFile(new URL("../assets/data/employees.json", import.meta.url), "utf8"));

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

const systems = templateService.getSystemTemplates();
assert.deepEqual(systems.map(item => item.id), ["corporate-navy", "clean-light", "meaningful-tech"], "Deben existir las tres plantillas del sistema con IDs estables.");
assert.equal(templateService.getTemplates().length, 3, "La inicialización debe crear solo las tres plantillas del sistema.");
assert.equal(templateService.getDefaultTemplate().id, "corporate-navy", "Corporate Navy debe ser la predeterminada inicial.");
assert.equal(templateService.getTemplates().filter(item => item.isDefault).length, 1, "Debe existir una única plantilla predeterminada.");
assert.equal(localStorage.getItem(TEMPLATES_VERSION_KEY), String(TEMPLATES_DATA_VERSION), "Debe persistirse la versión del catálogo.");

const automaticVariant = templateService.createVariant("corporate-navy");
const secondAutomaticVariant = templateService.createVariant("corporate-navy");
assert.notEqual(automaticVariant.name, secondAutomaticVariant.name, "Las variantes automáticas sucesivas deben recibir nombres únicos.");
templateService.deleteTemplate(automaticVariant.id);
templateService.deleteTemplate(secondAutomaticVariant.id);

const persistedReload = await import(`../assets/js/templates-store.js?reload=${Date.now()}`);
assert.equal(persistedReload.templateService.getTemplates().length, 3, "Una segunda carga no debe duplicar las plantillas del sistema.");

const variant = templateService.createVariant("clean-light", {
  name: "Clean Light · Dirección",
  description: "Variante corporativa para perfiles de dirección.",
  theme: {accentColor: "#3791F5", buttonStyle: "solid", photoShape: "rounded"},
});
assert.match(variant.id, /^custom-clean-light-direccion/, "Las variantes deben recibir un ID propio y semántico.");
assert.equal(variant.type, "custom");
assert.equal(variant.baseTemplateId, "clean-light");
assert.equal(variant.theme.accentColor, "#3791F5");
assert.equal(templateService.getTemplates().length, 4);
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
const {storage} = await import("../assets/js/storage.js");
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
assert.throws(() => templateService.archiveTemplate(defaultVariant.id), problem => problem.code === "DEFAULT_TEMPLATE");
assert.equal(templateService.resolveTemplate("plantilla-inexistente", {warn: false}).id, defaultVariant.id, "Una referencia inexistente debe usar la predeterminada como fallback.");

templateService.setDefaultTemplate("corporate-navy");
templateService.archiveTemplate(defaultVariant.id);
assert.equal(templateService.getTemplateById(defaultVariant.id).status, "archived");
assert.equal(templateService.getTemplates({includeArchived: false}).some(item => item.id === defaultVariant.id), false);
templateService.restoreTemplate(defaultVariant.id);
templateService.deleteTemplate(defaultVariant.id);

const finalCatalog = templateService.getTemplates();
assert.equal(finalCatalog.length, 3, "El catálogo final de prueba debe volver a sus tres diseños del sistema.");
assert.equal(new Set(finalCatalog.map(item => item.id)).size, finalCatalog.length, "Los IDs de plantilla deben ser únicos.");
assert.equal(finalCatalog.filter(item => item.isDefault).length, 1);

console.log("OK: catálogo, persistencia, variantes, edición, duplicado, archivo, borrado, predeterminada, fallback y aplicación segura verificados.");
