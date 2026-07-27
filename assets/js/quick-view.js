import {cardService,isValidHttpUrl} from "./cards.js?v=1.9.0";
import {getPublicCardUrl,getSourcedPublicCardUrl} from "./card-export.js";
import {copyText,shareCard} from "./card-sharing.js?v=1.3.1";
import {renderCardPreview} from "./preview.js?v=1.7.0";
import {buildQrSvg,renderQrSvg} from "./qr-code.js?v=1.3.1";
import {formatPersonName,settingsService} from "./settings-store.js?v=1.9.0";
import {templateService} from "./templates-store.js?v=1.7.0";
import {createPhotoFrameImage} from "./photo-frame.js?v=1.6.0";
import {createCompletenessContext,evaluateCardCompleteness} from "./card-completeness.js?v=1.9.0";
import {getPhotoVerificationStatuses,renderCompletenessDetails,reportPhotoVerification} from "./card-completeness-ui.js?v=1.9.0";

const statusLabels = {active: "Activa", draft: "Borrador", disabled: "Desactivada"};
const focusableSelector = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const qrCache = new Map();
let activeCardId = "";
let previousFocus = null;
let closeTimer = 0;
let initialized = false;
let callbacks = {showToast: () => {}, renderIcons: () => {}, openEditor: () => {}, openPremiumQr: () => {}};

const byId = id => document.getElementById(id);
const node = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

function initials(card) {
  return `${card.firstName?.[0] || ""}${card.lastName?.[0] || ""}`.toUpperCase() || "LN";
}

function validPublicUrl(card, source = "") {
  if (!card?.slug) return "";
  try {
    return source ? getSourcedPublicCardUrl(card, source) : getPublicCardUrl(card);
  } catch {
    return "";
  }
}

function formatDate(value) {
  if (!value) return "Sin registrar";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registrar";
  return new Intl.DateTimeFormat("es-ES", {dateStyle: "medium", timeStyle: "short"}).format(date);
}

function renderQuickViewCompleteness(card) {
  const cards = cardService.all();
  const settings = settingsService.getSettings();
  const context = createCompletenessContext({
    cards,
    templates: templateService.getTemplates(),
    settings,
    photoStatuses: getPhotoVerificationStatuses(),
  });
  renderCompletenessDetails(byId("quick-view-completeness"), evaluateCardCompleteness(card, context), {interactive: true});
  callbacks.renderIcons(byId("quick-view-completeness"));
}

function setAvatar(card, displayName) {
  const holder = byId("quick-view-avatar");
  const fallback = () => holder.replaceChildren(node("span", "quick-view-initials", initials(card)));
  holder.replaceChildren();
  if (!card.photo) { fallback(); return; }
  const updateQuality = valid => {
    if (reportPhotoVerification(card.photo, valid) && activeCardId === card.id) renderQuickViewCompleteness(card);
  };
  const image = createPhotoFrameImage(card.photo, {alt: `Foto de ${displayName}`, frame: card.photoFrame, legacyPosition: card.photoPosition, onLoad: () => updateQuality(true), onError: () => {updateQuality(false); fallback();}});
  holder.append(image);
}

function icon(name) {
  const wrapper = node("span", "quick-view-row-icon");
  const slot = node("span");
  slot.dataset.icon = name;
  wrapper.append(slot);
  return wrapper;
}

function contactRow({iconName, label, value, href, external = false}) {
  const row = href ? node("a", "quick-view-contact-row") : node("div", "quick-view-contact-row");
  if (href) {
    row.href = href;
    row.title = `${label}: ${value}`;
    if (external) { row.target = "_blank"; row.rel = "noopener noreferrer"; }
  }
  const copy = node("span", "quick-view-contact-copy");
  copy.append(node("small", "", label), node("strong", "", value));
  row.append(icon(iconName), copy);
  if (external) {
    const externalIcon = node("span", "quick-view-row-external");
    externalIcon.dataset.icon = "external";
    row.append(externalIcon);
  }
  return row;
}

function renderContacts(card) {
  const holder = byId("quick-view-contact-list");
  const rows = [];
  if (card.email) rows.push(contactRow({iconName: "mail", label: "Email", value: card.email, href: `mailto:${card.email}`}));
  if (card.phone) rows.push(contactRow({iconName: "phone", label: "Teléfono", value: card.phone, href: `tel:${String(card.phone).replace(/[^\d+]/g, "")}`}));
  if (card.mobile) rows.push(contactRow({iconName: "phone", label: "Móvil", value: card.mobile, href: `tel:${String(card.mobile).replace(/[^\d+]/g, "")}`}));
  if (card.linkedin && isValidHttpUrl(card.linkedin)) rows.push(contactRow({iconName: "linkedin", label: "LinkedIn", value: card.linkedin, href: card.linkedin, external: true}));
  if (card.website && isValidHttpUrl(card.website)) rows.push(contactRow({iconName: "globe", label: "Website", value: card.website, href: card.website, external: true}));
  holder.replaceChildren(...rows);
  byId("quick-view-contact-section").hidden = !rows.length;
}

function detail(label, value, className = "") {
  const wrapper = node("div", `quick-view-detail ${className}`.trim());
  wrapper.append(node("dt", "", label), node("dd", "", value));
  return wrapper;
}

function renderDetails(card, templateName, publicUrl) {
  const holder = byId("quick-view-details");
  holder.replaceChildren(
    detail("Plantilla", templateName),
    detail("Estado", statusLabels[card.status] || card.status || "Sin estado"),
    detail("Slug", card.slug || "No disponible", "is-code"),
    detail("URL pública", publicUrl || "No disponible", "is-code"),
    detail("Última modificación", formatDate(card.updatedAt)),
  );
}

function setUrlAvailability(available) {
  ["quick-view-open", "quick-view-copy", "quick-view-share", "quick-view-download-qr"].forEach(id => {
    const button = byId(id);
    button.disabled = !available;
    button.title = available ? "" : "La URL pública no está disponible.";
  });
  byId("quick-view-url-unavailable").hidden = available;
}

function renderQr(card, settings, qrUrl, displayName) {
  const holder = byId("quick-view-qr");
  const message = byId("quick-view-qr-message");
  const download = byId("quick-view-download-qr");
  holder.replaceChildren();
  message.hidden = true;
  download.disabled = true;
  if (!qrUrl) { message.hidden = false; return; }
  try {
    const options = settings.cards.qr;
    const key = `${qrUrl}|${options.errorCorrection}|${options.darkColor}|${options.lightColor}`;
    if (!qrCache.has(key)) qrCache.set(key, buildQrSvg(qrUrl, globalThis.qrcode, options));
    renderQrSvg(holder, qrCache.get(key), {ariaLabel: `Código QR para abrir la tarjeta de ${displayName}`});
    download.disabled = false;
  } catch {
    message.hidden = false;
  }
}

function populate(card) {
  const settings = settingsService.getSettings();
  const displayName = formatPersonName(card, settings);
  const exactTemplate = templateService.getTemplateById(card.template);
  const templateName = exactTemplate?.name || "Plantilla predeterminada";
  const publicUrl = validPublicUrl(card);
  const qrUrl = validPublicUrl(card, "qr");

  byId("quick-view-description").textContent = `Resumen administrativo de la tarjeta de ${displayName}.`;
  byId("quick-view-person-name").textContent = displayName;
  byId("quick-view-name").textContent = displayName;
  byId("quick-view-role").textContent = card.jobTitle || "Sin cargo";
  byId("quick-view-meta").textContent = [card.department, card.city].filter(Boolean).join(" · ") || "Sin departamento ni ciudad";
  const status = byId("quick-view-status");
  status.className = `status status-${card.status || "draft"}`;
  status.textContent = statusLabels[card.status] || card.status || "Sin estado";
  byId("quick-view-public-url").textContent = publicUrl || "URL pública no disponible";

  setAvatar(card, displayName);
  renderContacts(card);
  renderDetails(card, templateName, publicUrl);
  renderQuickViewCompleteness(card);
  renderCardPreview(byId("quick-view-card-preview"), card);
  renderQr(card, settings, qrUrl, displayName);
  setUrlAvailability(Boolean(publicUrl));
  callbacks.renderIcons(byId("quick-view-overlay"));
}

function currentCard() {
  const card = cardService.get(activeCardId);
  if (card) return card;
  closeQuickView({immediate: true});
  callbacks.showToast("La tarjeta ya no está disponible.", "error");
  return null;
}

function reducedMotion() {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

export function openQuickView(id, opener = document.activeElement) {
  const card = cardService.get(id);
  if (!card) { callbacks.showToast("No se ha encontrado la tarjeta.", "error"); return false; }
  const overlay = byId("quick-view-overlay");
  clearTimeout(closeTimer);
  if (overlay.hidden || !overlay.classList.contains("is-open")) previousFocus = opener instanceof HTMLElement ? opener : document.activeElement;
  activeCardId = card.id;
  populate(card);
  overlay.hidden = false;
  document.body.classList.add("quick-view-open");
  requestAnimationFrame(() => {
    overlay.classList.add("is-open");
    setTimeout(() => byId("quick-view-drawer").focus(), reducedMotion() ? 0 : 40);
  });
  return true;
}

export function closeQuickView({restoreFocus = true, immediate = false} = {}) {
  const overlay = byId("quick-view-overlay");
  if (!overlay || overlay.hidden) return;
  clearTimeout(closeTimer);
  overlay.classList.remove("is-open");
  const finish = () => {
    overlay.hidden = true;
    document.body.classList.remove("quick-view-open");
    activeCardId = "";
    if (restoreFocus && previousFocus?.isConnected) previousFocus.focus();
    previousFocus = null;
  };
  if (immediate || reducedMotion()) finish();
  else closeTimer = setTimeout(finish, 230);
}

export function refreshQuickView() {
  const overlay = byId("quick-view-overlay");
  if (!overlay || overlay.hidden || !activeCardId) return;
  const card = cardService.get(activeCardId);
  if (!card) { closeQuickView({immediate: true}); callbacks.showToast("La tarjeta abierta se ha eliminado.", "error"); return; }
  populate(card);
}

function trapFocus(event) {
  if (event.key !== "Tab") return;
  const drawer = byId("quick-view-drawer");
  const controls = [...drawer.querySelectorAll(focusableSelector)].filter(item => item.offsetParent !== null);
  if (!controls.length) { event.preventDefault(); drawer.focus(); return; }
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer)) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function handleAction(action) {
  if (action === "close") { closeQuickView(); return; }
  const card = currentCard();
  if (!card) return;
  const settings = settingsService.getSettings();
  if (action === "edit") {
    const id = card.id;
    closeQuickView({restoreFocus: false, immediate: true});
    callbacks.openEditor(id);
    return;
  }
  if (action === "open") {
    const url = validPublicUrl(card, "admin_preview");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  if (action === "copy") {
    const url = validPublicUrl(card, "copied_link");
    if (settings.privacy.confirmBeforeCopy && !confirm("¿Copiar el enlace público de esta tarjeta?")) return;
    try { await copyText(url); callbacks.showToast("Enlace copiado."); }
    catch (error) { callbacks.showToast(error.message, "error"); }
    return;
  }
  if (action === "share") {
    try {
      const result = await shareCard(card, validPublicUrl(card, "shared_link"), settings, {onFallbackCopy: async value => {
        if (settings.privacy.confirmBeforeCopy && !confirm("¿Copiar el enlace público para compartirlo?")) return false;
        await copyText(value);
        return true;
      }});
      if (result.status === "copied") callbacks.showToast("Enlace copiado para compartir.");
    } catch (error) { callbacks.showToast(error.message, "error"); }
    return;
  }
  if (action === "qr-premium") {
    callbacks.openPremiumQr(card, byId("quick-view-download-qr"));
  }
}

function openCompletenessTarget(target) {
  const card = currentCard();
  if (!card || !target) return;
  const id = card.id;
  closeQuickView({restoreFocus: false, immediate: true});
  callbacks.openEditor(id, {focusField: target});
}

export function setupQuickView({showToast, renderIconElements, openCardEditor, openPremiumQr} = {}) {
  callbacks = {
    showToast: showToast || callbacks.showToast,
    renderIcons: renderIconElements || callbacks.renderIcons,
    openEditor: openCardEditor || callbacks.openEditor,
    openPremiumQr: openPremiumQr || callbacks.openPremiumQr,
  };
  if (initialized) return;
  initialized = true;
  const overlay = byId("quick-view-overlay");
  overlay.addEventListener("click", event => {
    const qualityTarget = event.target.closest("[data-completeness-target]");
    if (qualityTarget) { openCompletenessTarget(qualityTarget.dataset.completenessTarget); return; }
    const trigger = event.target.closest("[data-quick-view-action]");
    if (trigger) { handleAction(trigger.dataset.quickViewAction); return; }
    if (event.target === overlay) closeQuickView();
  });
  document.addEventListener("keydown", event => {
    if (overlay.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeQuickView(); return; }
    trapFocus(event);
  });
  globalThis.addEventListener?.("storage", event => {
    if (event.key === "nextcards.cards.v1") refreshQuickView();
  });
  globalThis.addEventListener?.("focus", refreshQuickView);
  callbacks.renderIcons(overlay);
}
