import {renderCardPreview} from "./preview.js";
import {templateService} from "./templates-store.js";
import {
  CARD_ACTIONS,
  LOGO_RESOURCES,
  OFFICIAL_COLORS,
  applySettingsToDocument,
  formatSettingsDate,
  getDefaultSettings,
  settingsService,
  validateSettings,
} from "./settings-store.js";
import {
  buildCardsCsv,
  buildTechnicalSummary,
  checkDataIntegrity,
  eraseAllNextCardsData,
  getSystemInformation,
  importBackup,
  restoreInitialNextCardsData,
  serializeBackup,
  validateBackup,
} from "./settings-data.js";

const SAMPLE_CARD = Object.freeze({
  id: "settings-preview-sample",
  slug: "alex-martinez",
  cardName: "Alex Martínez · Vista previa",
  firstName: "Alex",
  lastName: "Martínez",
  jobTitle: "Digital Strategy Lead",
  department: "Innovación",
  city: "Madrid",
  email: "alex.martinez@lognext.com",
  phone: "+34 910 000 000",
  website: "https://lognext.com",
  linkedin: "https://linkedin.com/company/lognext",
  bio: "Tecnología con propósito para transformar organizaciones.",
  accentColor: "#FA3C0F",
  status: "active",
  visibleFields: {},
});

const clone = value => JSON.parse(JSON.stringify(value));
const node = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
};

let persisted = null;
let draft = null;
let activeTab = "general";
let pendingImport = null;
let pendingDanger = null;
let leaveCallback = null;
let previousFocus = null;
let callbacks = {};
let initialized = false;

function safeSettings() {
  try { return settingsService.getSettings(); }
  catch (error) {
    console.warn("La configuración local no es compatible; se muestran valores seguros.", error);
    return getDefaultSettings();
  }
}

function getPath(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((value, key) => value[key], object);
  target[last] = value;
}

function comparable(settings) {
  const value = clone(settings);
  value.updatedAt = "";
  return JSON.stringify(value);
}

export function isSettingsDirty() {
  return Boolean(draft && persisted && comparable(draft) !== comparable(persisted));
}

function setDirtyState() {
  const dirty = isSettingsDirty();
  const state = document.querySelector("#settings-save-state");
  const save = document.querySelector("#settings-save");
  const discard = document.querySelector("#settings-discard");
  if (!state || !save || !discard) return;
  state.textContent = dirty ? "Cambios sin guardar" : "Todos los cambios guardados";
  state.classList.toggle("dirty", dirty);
  state.classList.remove("error");
  save.disabled = !dirty;
  discard.disabled = !dirty;
  document.querySelector(".settings-preview>header small").textContent = dirty ? "Cambios en directo" : "Configuración guardada";
}

function populateTimezones() {
  const select = document.querySelector("#settings-timezone");
  if (select.options.length) return;
  let zones = ["Europe/Madrid", "Atlantic/Canary", "UTC"];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch { /* Navegadores sin supportedValuesOf. */ }
  zones.forEach(zone => {
    const option = node("option", "", zone);
    option.value = zone;
    select.append(option);
  });
}

function renderLogoOptions() {
  const container = document.querySelector("#settings-logo-options");
  container.replaceChildren();
  Object.entries(LOGO_RESOURCES).forEach(([id, resource]) => {
    const label = node("label", "settings-logo-option");
    const input = node("input");
    input.type = "radio";
    input.name = "settingsLogoResource";
    input.value = id;
    input.dataset.setting = "appearance.logoResource";
    const content = node("span");
    const image = node("img");
    image.src = resource.path;
    image.alt = "";
    content.append(image, document.createTextNode(resource.label));
    label.append(input, content);
    container.append(label);
  });
}

function renderTemplateOptions() {
  const select = document.querySelector("#settings-default-template");
  const selected = draft?.cards.defaultTemplateId || "";
  select.replaceChildren();
  templateService.getTemplates({includeArchived: false}).filter(item => item.status === "active").forEach(template => {
    const option = node("option", "", `${template.name}${template.type === "custom" ? " · Personalizada" : ""}`);
    option.value = template.id;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function renderActionOrder() {
  const list = document.querySelector("#settings-action-order");
  const labels = new Map(CARD_ACTIONS.map(item => [item.id, item.label]));
  list.replaceChildren();
  draft.cards.actionOrder.forEach((id, index, order) => {
    const item = node("li");
    item.dataset.actionId = id;
    item.append(node("strong", "", labels.get(id) || id));
    const actions = node("div", "settings-order-actions");
    const up = node("button", "", "↑");
    up.type = "button";
    up.dataset.settingsOrder = "up";
    up.dataset.id = id;
    up.disabled = index === 0;
    up.setAttribute("aria-label", `Subir ${labels.get(id) || id}`);
    const down = node("button", "", "↓");
    down.type = "button";
    down.dataset.settingsOrder = "down";
    down.dataset.id = id;
    down.disabled = index === order.length - 1;
    down.setAttribute("aria-label", `Bajar ${labels.get(id) || id}`);
    actions.append(up, down);
    item.append(actions);
    list.append(item);
  });
}

function renderPreview() {
  if (!draft) return;
  const logo = LOGO_RESOURCES[draft.appearance.logoResource] || Object.values(LOGO_RESOURCES)[0];
  const previewLogo = document.querySelector("#settings-preview-logo");
  previewLogo.src = logo.path;
  document.querySelector("#settings-preview-app").textContent = draft.general.appName || "NextCards";
  document.querySelector("#settings-preview-subtitle").textContent = draft.general.appSubtitle || "Digital cards by Lognext";
  const previewPanel = document.querySelector(".settings-preview");
  previewPanel.dataset.logoResource = draft.appearance.logoResource;
  previewPanel.dataset.density = draft.appearance.density;
  previewPanel.style.background = draft.appearance.darkBackground;
  previewPanel.style.borderRadius = {soft: "30px", medium: "24px", straight: "7px"}[draft.appearance.borderRadius];
  previewPanel.style.boxShadow = {none: "none", subtle: "0 18px 48px rgba(0,0,41,.13)", elevated: "0 28px 70px rgba(0,0,41,.22)"}[draft.appearance.shadowLevel];
  const template = templateService.resolveTemplate(draft.cards.defaultTemplateId, {warn: false});
  const card = {
    ...SAMPLE_CARD,
    template: template.id,
    accentColor: draft.appearance.accentColor,
    visibleFields: clone(draft.cards.defaultVisibleFields),
  };
  renderCardPreview(document.querySelector("#settings-live-preview"), card, template, draft);
  const actionHolder = document.querySelector("#settings-preview-actions");
  const visibility = {
    save: draft.publicCard.buttons.saveContact,
    phone: draft.cards.defaultVisibleFields.phone && Boolean(SAMPLE_CARD.phone),
    email: draft.cards.defaultVisibleFields.email && Boolean(SAMPLE_CARD.email),
    linkedin: draft.cards.defaultVisibleFields.linkedin && Boolean(SAMPLE_CARD.linkedin),
    website: draft.cards.defaultVisibleFields.website && Boolean(SAMPLE_CARD.website),
    share: draft.publicCard.buttons.share,
  };
  const labels = new Map(CARD_ACTIONS.map(item => [item.id, item.label]));
  actionHolder.replaceChildren();
  draft.cards.actionOrder.filter(id => visibility[id]).forEach(id => actionHolder.append(node("span", "", labels.get(id) || id)));
  if (draft.publicCard.buttons.copyLink) actionHolder.append(node("span", "", "Copiar enlace"));
  if (draft.publicCard.buttons.showQr) actionHolder.append(node("span", "", "QR"));
}

function showSaveError() {
  const state = document.querySelector("#settings-save-state");
  state.textContent = "Error al guardar";
  state.classList.remove("dirty");
  state.classList.add("error");
}

function clearValidation() {
  document.querySelectorAll("[data-settings-error]").forEach(item => { item.textContent = ""; });
  document.querySelectorAll("#settings-form [aria-invalid=true]").forEach(item => item.removeAttribute("aria-invalid"));
}

function showValidation(errors) {
  clearValidation();
  errors.forEach(error => {
    const message = document.querySelector(`[data-settings-error="${error.field}"]`);
    const control = document.querySelector(`[data-setting="${error.field}"]`);
    if (message) message.textContent = error.message;
    if (control) control.setAttribute("aria-invalid", "true");
  });
  const first = errors[0];
  if (!first) return;
  const section = first.field.startsWith("appearance.") ? "appearance" : first.field.startsWith("privacy.") ? "privacy" : first.field.startsWith("general.") ? "general" : "cards";
  selectTab(section, {focus: false});
  document.querySelector(`[data-setting="${first.field}"]`)?.focus();
}

function hydrateForm() {
  if (!draft) return;
  document.querySelectorAll("#settings-form [data-setting]").forEach(control => {
    const value = getPath(draft, control.dataset.setting);
    if (control.type === "checkbox" || control.type === "radio") control.checked = control.type === "radio" ? control.value === value : Boolean(value);
    else control.value = value ?? "";
  });
  document.querySelectorAll("[data-color-for]").forEach(picker => {
    picker.value = getPath(draft, picker.dataset.colorFor) || "#000000";
  });
  renderActionOrder();
  renderPreview();
  setDirtyState();
  clearValidation();
}

function selectTab(tab, {focus = true} = {}) {
  activeTab = tab;
  document.querySelectorAll("[data-settings-tab]").forEach(button => {
    const selected = button.dataset.settingsTab === tab;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
    if (selected && focus) button.focus();
  });
  document.querySelectorAll("[data-settings-panel]").forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== tab; });
  if (tab === "system") renderSystemInformation();
}

function controlValue(control) {
  if (control.type === "checkbox") return control.checked;
  return control.value;
}

function changeDraft(control) {
  setPath(draft, control.dataset.setting, controlValue(control));
  if (control.dataset.setting.endsWith("Color")) {
    const normalized = String(control.value).toUpperCase();
    control.value = normalized;
    const picker = document.querySelector(`[data-color-for="${control.dataset.setting}"]`);
    if (picker && /^#[0-9A-F]{6}$/.test(normalized)) picker.value = normalized;
  }
  renderPreview();
  setDirtyState();
}

function moveAction(id, direction) {
  const index = draft.cards.actionOrder.indexOf(id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= draft.cards.actionOrder.length) return;
  [draft.cards.actionOrder[index], draft.cards.actionOrder[target]] = [draft.cards.actionOrder[target], draft.cards.actionOrder[index]];
  renderActionOrder();
  renderPreview();
  setDirtyState();
  document.querySelector(`[data-settings-order="${direction}"][data-id="${id}"]`)?.focus();
}

function resetBlock(block) {
  const defaults = getDefaultSettings();
  if (block === "cards") {
    draft.cards = clone(defaults.cards);
    draft.publicCard = clone(defaults.publicCard);
  } else draft[block] = clone(defaults[block]);
  renderTemplateOptions();
  hydrateForm();
  callbacks.showToast?.("Bloque restablecido. Guarda para aplicar los cambios.");
}

function resetCorporateColors() {
  Object.assign(draft.appearance, clone(OFFICIAL_COLORS));
  hydrateForm();
  callbacks.showToast?.("Colores corporativos restaurados. Guarda para aplicarlos.");
}

async function saveDraft({silent = false} = {}) {
  const validation = validateSettings(draft);
  const selectedTemplate = templateService.getTemplateById(validation.settings.cards.defaultTemplateId);
  if (!selectedTemplate || selectedTemplate.status !== "active") validation.errors.push({field: "cards.defaultTemplateId", message: "Selecciona una plantilla activa."});
  if (validation.errors.length) {
    showValidation(validation.errors);
    showSaveError();
    callbacks.showToast?.("Revisa los campos marcados antes de guardar.", "error");
    return false;
  }
  try {
    templateService.setDefaultTemplate(validation.settings.cards.defaultTemplateId);
    persisted = settingsService.saveSettings(validation.settings);
    draft = clone(persisted);
    applySettingsToDocument(persisted);
    hydrateForm();
    callbacks.onSettingsApplied?.(persisted);
    if (!silent) callbacks.showToast?.("Configuración guardada.");
    return true;
  } catch (error) {
    showSaveError();
    callbacks.showToast?.(error.message, "error");
    return false;
  }
}

function discardDraft({notify = true} = {}) {
  draft = clone(persisted);
  renderTemplateOptions();
  hydrateForm();
  if (notify) callbacks.showToast?.("Cambios descartados.");
}

function download(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openModal(id) {
  const modal = document.querySelector(id);
  previousFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("settings-modal-open");
  requestAnimationFrame(() => modal.querySelector("[autofocus],input:not([type=radio]),button:not([disabled])")?.focus());
}

function closeModal(id) {
  const modal = document.querySelector(id);
  modal.hidden = true;
  if (![...document.querySelectorAll(".settings-modal")].some(item => !item.hidden)) document.body.classList.remove("settings-modal-open");
  previousFocus?.focus?.();
  previousFocus = null;
}

function trapFocus(event) {
  const modal = event.target.closest?.(".settings-modal:not([hidden])");
  if (!modal || event.key !== "Tab") return;
  const controls = [...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex="0"]')].filter(item => item.offsetParent !== null);
  if (!controls.length) return;
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function importSummaryMarkup(summary) {
  const wrapper = node("div", "settings-import-summary");
  [
    ["Tarjetas", summary.cards],
    ["Plantillas personalizadas", summary.customTemplates],
    ["Aplicación", summary.appName],
    ["Versión de origen", summary.sourceVersion],
    ["Exportada", formatSettingsDate(summary.exportedAt, draft)],
  ].forEach(([label, value]) => {
    const item = node("div");
    item.append(node("span", "", label), node("strong", "", String(value || "—")));
    wrapper.append(item);
  });
  return wrapper;
}

async function chooseBackup(file) {
  if (!file) return;
  try {
    const raw = await file.text();
    const validated = validateBackup(raw);
    pendingImport = {raw, ...validated};
    const summary = document.querySelector("#settings-import-summary");
    summary.replaceChildren(importSummaryMarkup(validated.summary));
    openModal("#settings-import-modal");
  } catch (error) {
    pendingImport = null;
    callbacks.showToast?.(error.message, "error");
  }
}

function reloadState() {
  persisted = safeSettings();
  draft = clone(persisted);
  populateTimezones();
  renderTemplateOptions();
  hydrateForm();
  applySettingsToDocument(persisted);
  callbacks.onDataChanged?.();
  renderSystemInformation();
}

function confirmImport() {
  if (!pendingImport) return;
  const mode = document.querySelector('input[name="settingsImportMode"]:checked')?.value || "replace";
  try {
    const result = importBackup(pendingImport.raw, {mode});
    closeModal("#settings-import-modal");
    pendingImport = null;
    reloadState();
    callbacks.showToast?.(`Copia importada: ${result.resultingCards} tarjetas disponibles.`);
  } catch (error) {
    callbacks.showToast?.(error.message, "error");
  }
}

function openDanger(action) {
  const definitions = {
    restore: {
      word: "RESTAURAR",
      title: "Restaurar datos iniciales",
      description: "Se sustituirán las tarjetas, plantillas, preferencias y analítica de NextCards por su estado inicial.",
    },
    erase: {
      word: "BORRAR",
      title: "Borrar datos de NextCards",
      description: "Se eliminarán las tarjetas y preferencias locales de NextCards. Las claves ajenas a la aplicación no se modificarán.",
    },
  };
  pendingDanger = {action, ...definitions[action]};
  document.querySelector("#settings-confirm-title").textContent = pendingDanger.title;
  document.querySelector("#settings-confirm-description").textContent = pendingDanger.description;
  document.querySelector("#settings-confirm-word").textContent = pendingDanger.word;
  const input = document.querySelector("#settings-confirm-input");
  input.value = "";
  document.querySelector("#settings-confirm-error").textContent = "";
  document.querySelector("#settings-confirm-submit").disabled = true;
  openModal("#settings-confirm-modal");
}

function runDanger() {
  if (!pendingDanger) return;
  const input = document.querySelector("#settings-confirm-input");
  if (input.value.trim() !== pendingDanger.word) {
    document.querySelector("#settings-confirm-error").textContent = `Escribe exactamente ${pendingDanger.word}.`;
    input.focus();
    return;
  }
  const result = pendingDanger.action === "restore" ? restoreInitialNextCardsData() : eraseAllNextCardsData();
  const label = pendingDanger.action === "restore" ? "Datos iniciales restaurados" : "Datos de NextCards borrados";
  pendingDanger = null;
  closeModal("#settings-confirm-modal");
  reloadState();
  callbacks.showToast?.(`${label}. ${result.cards} tarjetas disponibles.`);
}

function bytes(value) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function renderSystemInformation() {
  const list = document.querySelector("#settings-system-list");
  if (!list || !draft) return;
  let info;
  try { info = getSystemInformation(); }
  catch (error) {
    list.replaceChildren(node("div", "", `No se pudo leer la información: ${error.message}`));
    return;
  }
  const rows = [
    ["Versión de NextCards", info.appVersion],
    ["Esquema de configuración", info.settingsVersion],
    ["Configuración almacenada", info.storedSettingsVersion],
    ["Datos de tarjetas", info.cardsVersion],
    ["Catálogo de plantillas", info.templatesVersion],
    ["Esquema de analítica", info.analyticsVersion],
    ["Tarjetas", `${info.cards} · ${info.activeCards} activas · ${info.draftCards} borradores`],
    ["Plantillas", info.templates],
    ["Almacenamiento aproximado", bytes(info.storageBytes)],
    ["Última actualización", formatSettingsDate(info.lastLocalUpdate, draft)],
    ["Navegador", info.browser],
  ];
  list.replaceChildren();
  rows.forEach(([label, value]) => {
    const item = node("div");
    item.append(node("dt", "", String(label)), node("dd", "", String(value)));
    list.append(item);
  });
}

async function runIntegrity() {
  const button = document.querySelector('[data-settings-action="check-integrity"]');
  const resultNode = document.querySelector("#settings-integrity-result");
  button.disabled = true;
  button.textContent = "Comprobando…";
  resultNode.hidden = false;
  resultNode.className = "settings-integrity-result";
  resultNode.textContent = "Revisando tarjetas, plantillas, URLs y fotografías…";
  try {
    const result = await checkDataIntegrity();
    resultNode.classList.add(result.status === "correct" ? "success" : result.status === "error" ? "error" : "warning");
    resultNode.replaceChildren(node("strong", "", result.status === "correct" ? `Integridad correcta · ${result.checkedCards} tarjetas revisadas.` : `${result.issues.length} incidencias encontradas.`));
    if (result.issues.length) {
      const list = node("ul");
      result.issues.forEach(issue => list.append(node("li", "", `${issue.message}${issue.reference ? ` · ${issue.reference}` : ""}`)));
      resultNode.append(list);
    }
  } catch (error) {
    resultNode.classList.add("error");
    resultNode.textContent = `No se pudo completar la comprobación: ${error.message}`;
  } finally {
    button.disabled = false;
    button.textContent = "Ejecutar comprobación";
  }
}

async function writeClipboard(value) {
  if (!navigator.clipboard?.writeText) throw new Error("El portapapeles no está disponible en este contexto.");
  await navigator.clipboard.writeText(value);
}

function handleSettingsAction(action) {
  if (action === "export-backup") {
    download(serializeBackup(), `nextcards-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
    callbacks.showToast?.("Copia de seguridad exportada.");
  }
  if (action === "choose-backup") document.querySelector("#settings-import-file").click();
  if (action === "export-csv") {
    download(buildCardsCsv(), `nextcards-tarjetas-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
    callbacks.showToast?.("Listado CSV exportado.");
  }
  if (action === "confirm-import") confirmImport();
  if (action === "check-integrity") runIntegrity();
  if (action === "copy-technical") {
    writeClipboard(buildTechnicalSummary()).then(() => callbacks.showToast?.("Resumen técnico copiado.")).catch(error => callbacks.showToast?.(error.message, "error"));
  }
}

function closeLeaveModal() {
  closeModal("#settings-leave-modal");
  leaveCallback = null;
}

async function handleLeave(action) {
  if (action === "cancel") { closeLeaveModal(); return; }
  const next = leaveCallback;
  if (action === "save") {
    closeLeaveModal();
    if (await saveDraft({silent: true})) next?.();
    return;
  }
  if (action === "discard") discardDraft({notify: false});
  closeLeaveModal();
  next?.();
}

export function requestSettingsLeave(callback) {
  if (!isSettingsDirty()) { callback?.(); return true; }
  leaveCallback = callback;
  openModal("#settings-leave-modal");
  return false;
}

export function renderSettingsSection({resetDraft = false} = {}) {
  if (!initialized) return;
  if (resetDraft || !draft) {
    persisted = safeSettings();
    draft = clone(persisted);
  }
  renderTemplateOptions();
  hydrateForm();
  if (activeTab === "system") renderSystemInformation();
}

export function setupSettingsUI(options = {}) {
  callbacks = options;
  persisted = safeSettings();
  draft = clone(persisted);
  populateTimezones();
  renderLogoOptions();
  document.querySelectorAll("#settings-form label").forEach((label, index) => {
    const control = label.querySelector("input,select,textarea");
    const help = [...label.querySelectorAll("small")].find(item => !item.classList.contains("field-error"));
    if (!control || !help) return;
    help.id ||= `settings-help-${index + 1}`;
    control.setAttribute("aria-describedby", help.id);
  });
  document.querySelectorAll("[data-settings-error]").forEach((error, index) => {
    error.id ||= `settings-error-${index + 1}`;
    error.setAttribute("role", "alert");
    const control = document.querySelector(`[data-setting="${error.dataset.settingsError}"]`);
    if (!control) return;
    control.setAttribute("aria-describedby", [control.getAttribute("aria-describedby"), error.id].filter(Boolean).join(" "));
  });
  renderTemplateOptions();
  hydrateForm();
  selectTab(activeTab, {focus: false});
  callbacks.renderIconElements?.(document.querySelector("#settings-view"));
  callbacks.renderIconElements?.(document.querySelector("#settings-import-modal"));
  callbacks.renderIconElements?.(document.querySelector("#settings-confirm-modal"));
  callbacks.renderIconElements?.(document.querySelector("#settings-leave-modal"));
  initialized = true;

  document.querySelector("#settings-form").addEventListener("input", event => {
    const control = event.target.closest("[data-setting]");
    if (control) changeDraft(control);
    const picker = event.target.closest("[data-color-for]");
    if (picker) {
      const path = picker.dataset.colorFor;
      const value = picker.value.toUpperCase();
      setPath(draft, path, value);
      const textControl = document.querySelector(`[data-setting="${path}"]`);
      if (textControl) textControl.value = value;
      renderPreview();
      setDirtyState();
    }
  });
  document.querySelector("#settings-form").addEventListener("change", event => {
    const control = event.target.closest("[data-setting]");
    if (control) changeDraft(control);
  });
  document.querySelector("#settings-form").addEventListener("submit", event => { event.preventDefault(); saveDraft(); });
  document.querySelector("#settings-discard").addEventListener("click", () => discardDraft());
  document.querySelector("#settings-import-file").addEventListener("change", event => {
    chooseBackup(event.target.files?.[0]);
    event.target.value = "";
  });
  document.querySelector("#settings-confirm-input").addEventListener("input", event => {
    document.querySelector("#settings-confirm-submit").disabled = event.target.value.trim() !== pendingDanger?.word;
    document.querySelector("#settings-confirm-error").textContent = "";
  });
  document.querySelector("#settings-confirm-submit").addEventListener("click", runDanger);
  document.querySelectorAll("[data-settings-tab]").forEach(button => button.addEventListener("click", () => selectTab(button.dataset.settingsTab, {focus: false})));
  document.querySelector(".settings-nav").addEventListener("keydown", event => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...document.querySelectorAll("[data-settings-tab]")];
    let index = tabs.findIndex(item => item.dataset.settingsTab === activeTab);
    if (["ArrowDown", "ArrowRight"].includes(event.key)) index = (index + 1) % tabs.length;
    if (["ArrowUp", "ArrowLeft"].includes(event.key)) index = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = tabs.length - 1;
    event.preventDefault();
    selectTab(tabs[index].dataset.settingsTab);
  });
  document.addEventListener("click", event => {
    const reset = event.target.closest("[data-settings-reset]");
    if (reset) resetBlock(reset.dataset.settingsReset);
    if (event.target.closest("[data-settings-reset-colors]")) resetCorporateColors();
    const order = event.target.closest("[data-settings-order]");
    if (order) moveAction(order.dataset.id, order.dataset.settingsOrder);
    const action = event.target.closest("[data-settings-action]");
    if (action) handleSettingsAction(action.dataset.settingsAction);
    const danger = event.target.closest("[data-settings-danger]");
    if (danger) openDanger(danger.dataset.settingsDanger);
    const close = event.target.closest("[data-settings-modal-close]");
    if (close) closeModal(`#settings-${close.dataset.settingsModalClose}-modal`);
    const leave = event.target.closest("[data-settings-leave]");
    if (leave) handleLeave(leave.dataset.settingsLeave);
  });
  document.addEventListener("keydown", event => {
    trapFocus(event);
    if (event.key === "Escape") {
      if (!document.querySelector("#settings-leave-modal").hidden) handleLeave("cancel");
      else if (!document.querySelector("#settings-confirm-modal").hidden) closeModal("#settings-confirm-modal");
      else if (!document.querySelector("#settings-import-modal").hidden) closeModal("#settings-import-modal");
    }
  });
  globalThis.addEventListener?.("beforeunload", event => {
    if (!isSettingsDirty()) return;
    event.preventDefault();
    event.returnValue = "";
  });
}
