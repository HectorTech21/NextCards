import {cardService} from "./cards.js?v=1.8.0";
import {settingsService} from "./settings-store.js?v=1.8.0";
import {
  DEFAULT_QR_STYLE,
  QR_PRESETS,
  autoCorrectQrStyle,
  getCompositionDimensions,
  qrStyleFromSettings,
  resolveQrStyle,
  sanitizeQrStyle,
  validateQrDesign,
} from "./qr-premium-core.js?v=1.8.4";
import {
  copyPremiumQrImage,
  createPremiumQrAsset,
  downloadPremiumQr,
  sharePremiumQrFile,
} from "./qr-premium-export.js?v=1.8.4";

const FOCUSABLE = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const callbacks = {
  showToast: () => {},
  renderIcons: () => {},
  onCardUpdated: () => {},
};

let initialized = false;
let currentContext = null;
let currentStyle = {...DEFAULT_QR_STYLE};
let currentAsset = null;
let previousFocus = null;
let previousFocusIdentity = null;
let renderTimer = 0;
let renderToken = 0;
let busy = false;

const byId = id => globalThis.document?.getElementById(id);

function focusIdentity(element) {
  if (!(element instanceof HTMLElement)) return null;
  return {
    id: element.id || "",
    action: element.dataset?.action || "",
    cardId: element.dataset?.id || "",
    quickViewAction: element.dataset?.quickViewAction || "",
    qrAction: element.dataset?.qrAction || "",
  };
}

function resolveFocusTarget() {
  if (previousFocus?.isConnected) return previousFocus;
  const identity = previousFocusIdentity;
  if (!identity) return null;
  if (identity.id) {
    const match = byId(identity.id);
    if (match) return match;
  }
  return [...globalThis.document.querySelectorAll("button,a[href],[tabindex]")].find(element => {
    if (identity.action && element.dataset?.action !== identity.action) return false;
    if (identity.cardId && element.dataset?.id !== identity.cardId) return false;
    if (identity.quickViewAction && element.dataset?.quickViewAction !== identity.quickViewAction) return false;
    if (identity.qrAction && element.dataset?.qrAction !== identity.qrAction) return false;
    return Boolean(identity.action || identity.cardId || identity.quickViewAction || identity.qrAction);
  }) || null;
}

function presetButtons() {
  return Object.values(QR_PRESETS).map(preset => `
    <button class="qrp-preset" type="button" data-qr-preset="${preset.id}" aria-pressed="false">
      <span class="qrp-preset-swatch" style="--qrp-fg:${preset.foregroundColor};--qrp-bg:${preset.backgroundColor};--qrp-accent:${preset.accentColor}"></span>
      <span><strong>${preset.label}</strong><small>${preset.description}</small></span>
    </button>`).join("");
}

function dialogMarkup() {
  return `
    <div class="qr-premium-overlay" id="qr-premium-overlay" hidden>
      <section class="qr-premium-dialog" id="qr-premium-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-premium-title" aria-describedby="qr-premium-description" tabindex="-1">
        <header class="qr-premium-header">
          <div>
            <span class="eyebrow">Identidad digital Lognext</span>
            <h2 id="qr-premium-title">QR premium</h2>
            <p id="qr-premium-description">Diseña, valida y exporta un QR profesional sin modificar su enlace.</p>
          </div>
          <button class="icon-button" type="button" data-qr-action="close" aria-label="Cerrar QR premium"><span data-icon="close"></span></button>
        </header>
        <div class="qr-premium-body">
          <section class="qrp-preview-column" aria-labelledby="qrp-preview-title">
            <div class="qrp-preview-heading">
              <div><span class="eyebrow">Vista previa en directo</span><h3 id="qrp-preview-title">Resultado final</h3></div>
              <span class="qrp-quality-badge" id="qrp-quality-badge" data-status="pending">Preparando</span>
            </div>
            <div class="qrp-preview-stage" id="qrp-preview-stage" aria-live="polite" aria-busy="true">
              <div class="qrp-preview-placeholder"><span></span><span></span><span></span><p>Generando vista previa segura…</p></div>
            </div>
            <div class="qrp-preview-meta">
              <strong id="qrp-card-name">Tarjeta digital</strong>
              <span id="qrp-card-role">Cargo</span>
              <code id="qrp-public-url">URL pública</code>
              <p class="qrp-local-warning" id="qrp-local-warning" hidden>La URL apunta a este entorno local. El archivo funcionará en este equipo; para compartir externamente, abre NextCards desde su dominio publicado.</p>
            </div>
            <div class="qrp-validation" id="qrp-validation" data-status="pending" role="status" aria-live="polite">
              <div><strong id="qrp-validation-title">Comprobando legibilidad</strong><span id="qrp-score"></span></div>
              <ul id="qrp-validation-messages"></ul>
              <button class="button button-secondary" id="qrp-auto-fix" type="button" data-qr-action="auto-fix" hidden>Corregir automáticamente</button>
            </div>
            <p class="qrp-export-summary" id="qrp-export-summary"></p>
          </section>

          <form class="qrp-controls" id="qrp-controls">
            <fieldset class="qrp-fieldset qrp-preset-fieldset">
              <legend>1. Estilo base</legend>
              <p>Presets aprobados para conservar marca y legibilidad.</p>
              <div class="qrp-presets">${presetButtons()}</div>
            </fieldset>

            <fieldset class="qrp-fieldset">
              <legend>2. Personalización segura</legend>
              <div class="qrp-control-grid">
                <label>Forma de módulos
                  <select id="qrp-dots-style">
                    <option value="square">Cuadrados</option>
                    <option value="rounded">Redondeados</option>
                    <option value="dots">Circulares</option>
                  </select>
                </label>
                <label>Esquinas de lectura
                  <select id="qrp-corners-style">
                    <option value="square">Cuadradas</option>
                    <option value="rounded">Redondeadas</option>
                  </select>
                </label>
                <label>Símbolo central
                  <select id="qrp-logo">
                    <option value="lognext-symbol">Símbolo Lognext</option>
                    <option value="none">Sin símbolo</option>
                  </select>
                </label>
                <label>Corrección de errores
                  <select id="qrp-error-correction">
                    <option value="M">Estándar · M</option>
                    <option value="Q">Alta resistencia · Q</option>
                    <option value="H">Máxima resistencia · H</option>
                  </select>
                  <small id="qrp-error-help">Una mayor resistencia permite que el QR siga funcionando aunque incluya un logo o sufra pequeñas imperfecciones.</small>
                </label>
                <label>Margen exterior
                  <select id="qrp-margin">
                    <option value="16">16 px</option>
                    <option value="20">20 px</option>
                    <option value="24">24 px</option>
                    <option value="30">30 px</option>
                    <option value="36">36 px</option>
                    <option value="48">48 px</option>
                  </select>
                </label>
                <label class="qrp-checkbox-control">
                  <input id="qrp-transparent" type="checkbox"><span><strong>Fondo transparente</strong><small>Solo para superficies claras y controladas.</small></span>
                </label>
              </div>
              <div class="qrp-colors">
                <label><span>Primer plano</span><input id="qrp-foreground" type="color" value="#000029"></label>
                <label><span>Fondo</span><input id="qrp-background" type="color" value="#FFFFFF"></label>
                <label><span>Acento</span><input id="qrp-accent" type="color" value="#FA3C0F"></label>
              </div>
              <label class="qrp-full-control">Texto inferior opcional
                <input id="qrp-footer-text" type="text" maxlength="80" autocomplete="off" placeholder="Your Meaningful Tech Partner.">
                <small>Se sanea y se limita a 80 caracteres. Aparece en las composiciones con texto.</small>
              </label>
            </fieldset>

            <fieldset class="qrp-fieldset">
              <legend>3. Composición</legend>
              <div class="qrp-choice-grid qrp-composition-grid">
                <label><input type="radio" name="qrp-composition" value="solo" checked><span><strong>Solo QR</strong><small>Uso universal</small></span></label>
                <label><input type="radio" name="qrp-composition" value="name"><span><strong>QR + nombre</strong><small>Compartir y señalética</small></span></label>
                <label><input type="radio" name="qrp-composition" value="print"><span><strong>Tarjeta impresión</strong><small>Formato vertical</small></span></label>
                <label><input type="radio" name="qrp-composition" value="email"><span><strong>Firma email</strong><small>Formato horizontal</small></span></label>
              </div>
            </fieldset>

            <fieldset class="qrp-fieldset">
              <legend>4. Archivo</legend>
              <div class="qrp-output-row">
                <div>
                  <span class="qrp-label">Formato</span>
                  <div class="qrp-segmented">
                    <label><input type="radio" name="qrp-format" value="png" checked><span>PNG</span></label>
                    <label><input type="radio" name="qrp-format" value="svg"><span>SVG</span></label>
                  </div>
                </div>
                <label>Ancho de exportación
                  <select id="qrp-size">
                    <option value="512">512 px</option>
                    <option value="1024" selected>1024 px</option>
                    <option value="2048">2048 px</option>
                  </select>
                </label>
              </div>
            </fieldset>

            <section class="qrp-persistence" id="qrp-persistence" aria-labelledby="qrp-persistence-title">
              <div><h3 id="qrp-persistence-title">Estilo de esta tarjeta</h3><p>Solo se guarda la configuración; nunca la imagen generada.</p></div>
              <div>
                <button class="button button-secondary" type="button" data-qr-action="use-global">Cargar valores globales</button>
                <button class="button button-secondary" id="qrp-reset-style" type="button" data-qr-action="reset-style" hidden>Quitar ajuste individual</button>
                <button class="button button-primary" type="button" data-qr-action="save-style">Guardar estilo</button>
              </div>
            </section>
          </form>
        </div>
        <footer class="qr-premium-footer">
          <p id="qrp-action-status" role="status" aria-live="polite"></p>
          <div>
            <button class="button button-secondary" type="button" data-qr-action="copy">Copiar imagen</button>
            <button class="button button-secondary" type="button" data-qr-action="share">Compartir archivo</button>
            <button class="button button-primary" type="button" data-qr-action="download">Descargar <span id="qrp-download-format">PNG</span></button>
          </div>
        </footer>
      </section>
    </div>`;
}

function ensureDialog() {
  const documentRef = globalThis.document;
  if (!documentRef) return null;
  let overlay = byId("qr-premium-overlay");
  if (overlay) return overlay;
  const template = documentRef.createElement("template");
  template.innerHTML = dialogMarkup().trim();
  overlay = template.content.firstElementChild;
  documentRef.body.append(overlay);
  callbacks.renderIcons(overlay);
  return overlay;
}

function selectedValue(name, fallback) {
  return globalThis.document?.querySelector(`input[name="${name}"]:checked`)?.value || fallback;
}

function setSelectedValue(name, value) {
  const field = globalThis.document?.querySelector(`input[name="${name}"][value="${value}"]`);
  if (field) field.checked = true;
}

function setControls(style = currentStyle) {
  const safe = sanitizeQrStyle(style);
  byId("qrp-dots-style").value = safe.dotsStyle;
  byId("qrp-corners-style").value = safe.cornersStyle;
  byId("qrp-logo").value = safe.logo;
  byId("qrp-error-correction").value = safe.errorCorrection;
  byId("qrp-error-correction").disabled = safe.logo === "lognext-symbol";
  byId("qrp-error-help").textContent = safe.logo === "lognext-symbol"
    ? "H se aplica automáticamente para proteger el símbolo central."
    : "Q ofrece un equilibrio sólido; H añade tolerancia.";
  byId("qrp-margin").value = String(safe.margin);
  byId("qrp-transparent").checked = safe.transparent;
  byId("qrp-foreground").value = safe.foregroundColor;
  byId("qrp-background").value = safe.backgroundColor;
  byId("qrp-background").disabled = safe.transparent;
  byId("qrp-accent").value = safe.accentColor;
  byId("qrp-footer-text").value = safe.footerText;
  globalThis.document?.querySelectorAll("[data-qr-preset]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.qrPreset === safe.preset));
  });
}

function readControls() {
  const logo = byId("qrp-logo").value;
  return sanitizeQrStyle({
    ...currentStyle,
    preset: "custom",
    dotsStyle: byId("qrp-dots-style").value,
    cornersStyle: byId("qrp-corners-style").value,
    logo,
    errorCorrection: logo === "lognext-symbol" ? "H" : byId("qrp-error-correction").value,
    margin: Number(byId("qrp-margin").value),
    transparent: byId("qrp-transparent").checked,
    foregroundColor: byId("qrp-foreground").value,
    backgroundColor: byId("qrp-background").value,
    accentColor: byId("qrp-accent").value,
    footerText: byId("qrp-footer-text").value,
  });
}

function setBusy(value, message = "") {
  busy = Boolean(value);
  const overlay = byId("qr-premium-overlay");
  overlay?.querySelectorAll("[data-qr-action='download'],[data-qr-action='copy'],[data-qr-action='share']").forEach(button => {
    button.disabled = busy || !currentAsset;
    button.setAttribute("aria-busy", String(busy));
  });
  if (message) byId("qrp-action-status").textContent = message;
}

function parseSvg(markup) {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  if (parsed.querySelector("parsererror,script,foreignObject") || parsed.documentElement.localName !== "svg") {
    throw new Error("La vista previa SVG no es válida.");
  }
  return globalThis.document.importNode(parsed.documentElement, true);
}

function updateValidation(validation) {
  const badge = byId("qrp-quality-badge");
  const holder = byId("qrp-validation");
  badge.dataset.status = validation.status;
  badge.textContent = validation.label;
  holder.dataset.status = validation.status;
  byId("qrp-validation-title").textContent = validation.status === "not-recommended"
    ? "Diseño bloqueado por seguridad"
    : `Legibilidad ${validation.label.toLowerCase()}`;
  byId("qrp-score").textContent = `${validation.score}/100`;
  const list = byId("qrp-validation-messages");
  list.replaceChildren(...validation.messages.map(message => {
    const item = globalThis.document.createElement("li");
    item.textContent = message;
    return item;
  }));
  byId("qrp-auto-fix").hidden = validation.status !== "not-recommended";
}

function renderError(error) {
  currentAsset = null;
  const stage = byId("qrp-preview-stage");
  const message = globalThis.document.createElement("div");
  message.className = "qrp-preview-error";
  const strong = globalThis.document.createElement("strong");
  strong.textContent = "No se puede generar esta combinación";
  const paragraph = globalThis.document.createElement("p");
  paragraph.textContent = error?.message || "Revisa los ajustes del QR.";
  message.append(strong, paragraph);
  stage.replaceChildren(message);
  stage.setAttribute("aria-busy", "false");
  byId("qrp-export-summary").textContent = "";
  setBusy(false);
}

function scheduleRender(delay = 90) {
  currentAsset = null;
  clearTimeout(renderTimer);
  renderTimer = globalThis.setTimeout(() => void renderNow(), delay);
  setBusy(false);
}

async function renderNow() {
  if (!currentContext || !isQrPremiumOpen()) return null;
  const token = ++renderToken;
  clearTimeout(renderTimer);
  const validation = validateQrDesign({url: currentContext.url, style: currentStyle});
  updateValidation(validation);
  const stage = byId("qrp-preview-stage");
  stage.setAttribute("aria-busy", "true");
  currentAsset = null;
  setBusy(true, "Preparando vista previa…");
  if (!validation.canExport) {
    renderError(new Error(validation.messages[0]));
    byId("qrp-action-status").textContent = "Corrige los avisos para habilitar la exportación.";
    return null;
  }
  try {
    const composition = selectedValue("qrp-composition", "solo");
    const size = Number(byId("qrp-size").value);
    const asset = await createPremiumQrAsset({
      url: currentContext.url,
      card: currentContext.card,
      style: currentStyle,
      composition,
      size,
      factory: currentContext.factory || globalThis.qrcode,
      settings: currentContext.settings,
      fetchImpl: currentContext.assetOptions?.fetchImpl,
      DOMParserCtor: currentContext.assetOptions?.DOMParserCtor,
      assetTimeoutMs: currentContext.assetOptions?.assetTimeoutMs,
    });
    if (token !== renderToken || !isQrPremiumOpen()) return null;
    const effectiveValidation = asset.warnings?.length
      ? {
          ...validation,
          status: validation.status === "optimal" ? "acceptable" : validation.status,
          label: validation.status === "optimal" ? "Aceptable" : validation.label,
          score: Math.min(validation.score, 82),
          messages: [...validation.messages, ...asset.warnings],
        }
      : validation;
    updateValidation(effectiveValidation);
    const svg = parseSvg(asset.markup);
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    stage.replaceChildren(svg);
    stage.dataset.composition = composition;
    stage.dataset.logoFallback = String(!asset.logoAvailable);
    stage.setAttribute("aria-busy", "false");
    currentAsset = asset;
    const dimensions = getCompositionDimensions(composition, size);
    const format = selectedValue("qrp-format", "png").toUpperCase();
    byId("qrp-export-summary").textContent = `${format} · ${dimensions.width} × ${dimensions.height} px · matriz ${asset.matrixSize} × ${asset.matrixSize} · margen ${asset.quietModules} módulos`;
    byId("qrp-action-status").textContent = asset.warnings?.[0] || "Vista previa lista para exportar.";
    setBusy(false);
    return asset;
  } catch (error) {
    if (token !== renderToken) return null;
    renderError(error);
    byId("qrp-action-status").textContent = error.message;
    return null;
  }
}

async function requireAsset() {
  if (currentAsset) return currentAsset;
  const asset = await renderNow();
  if (!asset) throw new Error("El QR no está listo para exportar.");
  return asset;
}

function announce(message, type = "success") {
  byId("qrp-action-status").textContent = message;
  callbacks.showToast(message, type);
}

async function runExportAction(action, trigger) {
  if (busy) return;
  setBusy(true, action === "download" ? "Generando archivo…" : action === "copy" ? "Preparando imagen…" : "Preparando archivo para compartir…");
  trigger?.setAttribute("aria-busy", "true");
  try {
    const asset = await requireAsset();
    if (action === "download") {
      const format = selectedValue("qrp-format", "png");
      const result = await downloadPremiumQr(asset, {card: currentContext.card, format});
      announce(`${result.filename} descargado.`);
      return;
    }
    if (action === "copy") {
      try {
        await copyPremiumQrImage(asset);
        announce("QR copiado al portapapeles.");
      } catch (error) {
        await downloadPremiumQr(asset, {card: currentContext.card, format: "png"});
        announce("El navegador no permitió copiar la imagen; se ha descargado el PNG.", "error");
      }
      return;
    }
    const result = await sharePremiumQrFile(asset, {card: currentContext.card});
    if (result.status === "shared") announce("Archivo QR compartido.");
    else if (result.status === "cancelled") byId("qrp-action-status").textContent = "Compartir cancelado.";
    else {
      await downloadPremiumQr(asset, {card: currentContext.card, format: "png"});
      announce("Compartir archivos no está disponible; se ha descargado el PNG.", "error");
    }
  } catch (error) {
    announce(error?.message || "No se pudo completar la acción.", "error");
  } finally {
    trigger?.removeAttribute("aria-busy");
    setBusy(false);
  }
}

function applyPreset(id) {
  const footerText = currentStyle.footerText;
  currentStyle = sanitizeQrStyle({...QR_PRESETS[id], preset:id, footerText});
  setControls();
  scheduleRender(0);
}

function useGlobalSettings() {
  currentStyle = qrStyleFromSettings(currentContext?.settings?.cards?.qr || {});
  setControls();
  scheduleRender(0);
  byId("qrp-action-status").textContent = "Valores globales cargados. Guarda si quieres fijarlos en esta tarjeta.";
}

function saveStyle() {
  if (!currentContext?.allowSave) return;
  try {
    const saved = currentContext.persistStyle
      ? currentContext.persistStyle(sanitizeQrStyle(currentStyle))
      : cardService.update(currentContext.card.id, {qrStyle: sanitizeQrStyle(currentStyle)});
    currentContext.card = saved || {...currentContext.card, qrStyle: sanitizeQrStyle(currentStyle)};
    byId("qrp-reset-style").hidden = false;
    callbacks.onCardUpdated(currentContext.card);
    currentContext.onCardUpdated?.(currentContext.card);
    announce("Estilo QR guardado para esta tarjeta.");
  } catch (error) {
    announce(error?.message || "No se pudo guardar el estilo QR.", "error");
  }
}

function resetStyle() {
  if (!currentContext?.allowSave) return;
  try {
    const saved = currentContext.clearStyle
      ? currentContext.clearStyle()
      : cardService.update(currentContext.card.id, {qrStyle: null});
    currentContext.card = saved || {...currentContext.card, qrStyle: null};
    currentStyle = qrStyleFromSettings(currentContext.settings?.cards?.qr || {});
    byId("qrp-reset-style").hidden = true;
    setControls();
    scheduleRender(0);
    callbacks.onCardUpdated(currentContext.card);
    currentContext.onCardUpdated?.(currentContext.card);
    announce("La tarjeta vuelve a heredar la configuración QR global.");
  } catch (error) {
    announce(error?.message || "No se pudo restablecer el estilo QR.", "error");
  }
}

function handleControlInput(event) {
  if (event.target.matches("[name='qrp-composition'],#qrp-size")) {
    scheduleRender();
    return;
  }
  if (event.target.matches("[name='qrp-format']")) {
    const format = selectedValue("qrp-format", "png").toUpperCase();
    byId("qrp-download-format").textContent = format;
    scheduleRender(0);
    return;
  }
  if (!event.target.closest("#qrp-controls")) return;
  currentStyle = readControls();
  setControls();
  scheduleRender();
}

function trapFocus(event) {
  if (event.key !== "Tab") return;
  const dialog = byId("qr-premium-dialog");
  const controls = [...dialog.querySelectorAll(FOCUSABLE)].filter(item => item.offsetParent !== null);
  if (!controls.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && (globalThis.document.activeElement === first || globalThis.document.activeElement === dialog)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && globalThis.document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function setupEvents(overlay) {
  overlay.addEventListener("input", handleControlInput);
  overlay.addEventListener("change", handleControlInput);
  overlay.addEventListener("click", event => {
    const preset = event.target.closest("[data-qr-preset]");
    if (preset) {
      applyPreset(preset.dataset.qrPreset);
      return;
    }
    const trigger = event.target.closest("[data-qr-action]");
    if (!trigger) {
      if (event.target === overlay) closeQrPremium();
      return;
    }
    const action = trigger.dataset.qrAction;
    if (action === "close") closeQrPremium();
    if (action === "auto-fix") {
      currentStyle = autoCorrectQrStyle(currentStyle);
      setControls();
      scheduleRender(0);
    }
    if (action === "use-global") useGlobalSettings();
    if (action === "save-style") saveStyle();
    if (action === "reset-style") resetStyle();
    if (["download", "copy", "share"].includes(action)) void runExportAction(action, trigger);
  });
  globalThis.document.addEventListener("keydown", event => {
    if (!isQrPremiumOpen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeQrPremium();
      return;
    }
    if (event.key === "Tab") {
      event.stopImmediatePropagation();
      trapFocus(event);
    }
  }, true);
}

export function setupQrPremium({showToast, renderIconElements, onCardUpdated} = {}) {
  callbacks.showToast = showToast || callbacks.showToast;
  callbacks.renderIcons = renderIconElements || callbacks.renderIcons;
  callbacks.onCardUpdated = onCardUpdated || callbacks.onCardUpdated;
  const overlay = ensureDialog();
  if (!overlay || initialized) return overlay;
  initialized = true;
  setupEvents(overlay);
  callbacks.renderIcons(overlay);
  return overlay;
}

function localUrl(url) {
  try {
    return new Set(["localhost", "127.0.0.1", "::1"]).has(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function openQrPremium({
  card,
  url,
  settings = settingsService.getSettings(),
  allowSave = true,
  opener = globalThis.document?.activeElement,
  factory = globalThis.qrcode,
  persistStyle,
  clearStyle,
  onCardUpdated,
  assetOptions,
} = {}) {
  if (!card?.id || !String(url || "").trim()) {
    callbacks.showToast("La tarjeta necesita estar guardada y tener una URL pública válida.", "error");
    return false;
  }
  const overlay = setupQrPremium();
  if (!overlay) return false;
  previousFocus = opener instanceof HTMLElement ? opener : globalThis.document.activeElement;
  previousFocusIdentity = focusIdentity(previousFocus);
  currentContext = {
    card,
    url,
    settings,
    allowSave,
    factory,
    persistStyle,
    clearStyle,
    onCardUpdated,
    assetOptions: assetOptions && typeof assetOptions === "object" ? assetOptions : null,
  };
  currentStyle = resolveQrStyle(card, settings);
  currentAsset = null;
  setControls();
  setSelectedValue("qrp-composition", "solo");
  setSelectedValue("qrp-format", "png");
  byId("qrp-size").value = "1024";
  byId("qrp-download-format").textContent = "PNG";
  byId("qrp-card-name").textContent = [card.firstName, card.lastName].filter(Boolean).join(" ") || card.cardName || "Tarjeta digital";
  byId("qrp-card-role").textContent = card.jobTitle || "Sin cargo";
  byId("qrp-public-url").textContent = url;
  byId("qrp-local-warning").hidden = !localUrl(url);
  byId("qrp-persistence").hidden = !allowSave;
  byId("qrp-reset-style").hidden = !allowSave || !card.qrStyle;
  byId("qrp-action-status").textContent = "Preparando QR…";
  overlay.hidden = false;
  globalThis.document.body.classList.add("qr-premium-open");
  scheduleRender(0);
  globalThis.requestAnimationFrame?.(() => byId("qr-premium-dialog").focus());
  return true;
}

export function closeQrPremium({restoreFocus = true} = {}) {
  const overlay = byId("qr-premium-overlay");
  if (!overlay || overlay.hidden) return;
  clearTimeout(renderTimer);
  renderToken += 1;
  overlay.hidden = true;
  globalThis.document.body.classList.remove("qr-premium-open");
  currentAsset = null;
  currentContext = null;
  if (restoreFocus) resolveFocusTarget()?.focus();
  previousFocus = null;
  previousFocusIdentity = null;
}

export function isQrPremiumOpen() {
  const overlay = byId("qr-premium-overlay");
  return Boolean(overlay && !overlay.hidden);
}

export function refreshOpenQrPremium(card) {
  if (!currentContext || !isQrPremiumOpen() || currentContext.card.id !== card?.id) return false;
  currentContext.card = card;
  currentStyle = resolveQrStyle(card, currentContext.settings);
  setControls();
  scheduleRender(0);
  return true;
}
