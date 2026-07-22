import {
  DEFAULT_PHOTO_FRAME,
  PHOTO_FRAME_LIMITS,
  applyPhotoFrame,
  coverGeometry,
  dragPhotoFrame,
  normalizePhotoFrame,
} from "./photo-frame.js?v=1.4.0";

const focusableSelector = 'button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';
const byId = id => document.getElementById(id);
let initialized = false;
let modal;
let dialog;
let stage;
let image;
let zoom;
let horizontal;
let vertical;
let applyButton;
let status;
let previousFocus = null;
let editorOverlay = null;
let savedFrame = {...DEFAULT_PHOTO_FRAME};
let draftFrame = {...DEFAULT_PHOTO_FRAME};
let naturalWidth = 0;
let naturalHeight = 0;
let pointerState = null;
let imageReady = false;
let callbacks = {onPreview: () => {}, onApply: () => {}, onCancel: () => {}};

const outputFor = control => byId(`${control.id}-value`);
const frameRect = () => stage.getBoundingClientRect();

function geometry(frame = draftFrame) {
  const bounds = frameRect();
  return coverGeometry({
    naturalWidth,
    naturalHeight,
    frameWidth: bounds.width,
    frameHeight: bounds.height,
    photoFrame: frame,
  });
}

function syncControl(control, value, suffix = "%") {
  const rounded = Math.round(value);
  control.value = String(rounded);
  control.setAttribute("aria-valuenow", String(rounded));
  control.setAttribute("aria-valuetext", `${rounded}${suffix}`);
  outputFor(control).textContent = `${rounded}${suffix}`;
}

function renderDraft({emit = true} = {}) {
  draftFrame = normalizePhotoFrame(draftFrame);
  applyPhotoFrame(image, draftFrame);
  syncControl(zoom, draftFrame.scale * 100);
  syncControl(horizontal, draftFrame.x);
  syncControl(vertical, draftFrame.y);
  const limits = geometry();
  stage.dataset.canMoveX = String(limits.overflowX > 0.5);
  stage.dataset.canMoveY = String(limits.overflowY > 0.5);
  if (emit) callbacks.onPreview({...draftFrame});
}

function setFrame(next, options) {
  draftFrame = normalizePhotoFrame(next);
  renderDraft(options);
}

function announceImageQuality() {
  const bounds = frameRect();
  if (naturalWidth < bounds.width || naturalHeight < bounds.height) {
    status.textContent = "La fotografía es pequeña y puede perder nitidez al ampliar el zoom.";
    status.dataset.tone = "warning";
  } else {
    status.textContent = "Fotografía preparada. El original se conservará sin modificaciones.";
    status.dataset.tone = "success";
  }
}

function onImageLoad() {
  naturalWidth = image.naturalWidth;
  naturalHeight = image.naturalHeight;
  imageReady = Boolean(naturalWidth && naturalHeight);
  stage.classList.toggle("is-broken", !imageReady);
  applyButton.disabled = !imageReady;
  announceImageQuality();
  renderDraft();
}

function onImageError() {
  imageReady = false;
  naturalWidth = 0;
  naturalHeight = 0;
  stage.classList.add("is-broken");
  applyButton.disabled = true;
  status.textContent = "No se ha podido cargar la fotografía. Se mantendrá el encuadre anterior.";
  status.dataset.tone = "error";
}

function stopPointer() {
  if (!pointerState) return;
  if (stage.hasPointerCapture?.(pointerState.pointerId)) stage.releasePointerCapture(pointerState.pointerId);
  pointerState = null;
  stage.classList.remove("is-dragging");
}

function onPointerDown(event) {
  if (!imageReady || event.button > 0) return;
  pointerState = {pointerId: event.pointerId, x: event.clientX, y: event.clientY, frame: {...draftFrame}};
  stage.setPointerCapture?.(event.pointerId);
  stage.classList.add("is-dragging");
  event.preventDefault();
}

function onPointerMove(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return;
  const bounds = frameRect();
  setFrame(dragPhotoFrame(pointerState.frame, {
    deltaX: event.clientX - pointerState.x,
    deltaY: event.clientY - pointerState.y,
    naturalWidth,
    naturalHeight,
    frameWidth: bounds.width,
    frameHeight: bounds.height,
  }));
  event.preventDefault();
}

function nudge(direction, amount = 1) {
  const next = {...draftFrame};
  if (direction === "left") next.x -= amount;
  if (direction === "right") next.x += amount;
  if (direction === "up") next.y -= amount;
  if (direction === "down") next.y += amount;
  setFrame(next);
}

function trapFocus(event) {
  if (event.key !== "Tab") return;
  const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(element => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function close({applied = false} = {}) {
  if (modal.hidden) return;
  stopPointer();
  modal.hidden = true;
  editorOverlay?.removeAttribute("inert");
  if (!applied) {
    draftFrame = {...savedFrame};
    callbacks.onPreview({...savedFrame});
    callbacks.onCancel({...savedFrame});
  }
  image.removeAttribute("src");
  if (previousFocus?.isConnected) previousFocus.focus();
  previousFocus = null;
}

function handleAction(action) {
  if (action === "cancel" || action === "close") close();
  if (action === "center") setFrame({...draftFrame, x: 50, y: 50});
  if (action === "restore") setFrame({...DEFAULT_PHOTO_FRAME});
  if (action === "apply" && imageReady) {
    const applied = normalizePhotoFrame(draftFrame);
    callbacks.onApply(applied);
    close({applied: true});
  }
}

export function setupPhotoFrameEditor(options = {}) {
  callbacks = {...callbacks, ...options};
  editorOverlay = options.editorOverlay || byId("editor-overlay");
  if (initialized) return;
  initialized = true;
  modal = byId("photo-frame-modal");
  dialog = byId("photo-frame-dialog");
  stage = byId("photo-frame-stage");
  image = byId("photo-frame-image");
  zoom = byId("photo-frame-zoom");
  horizontal = byId("photo-frame-x");
  vertical = byId("photo-frame-y");
  applyButton = byId("photo-frame-apply");
  status = byId("photo-frame-status");

  zoom.min = String(PHOTO_FRAME_LIMITS.scale.min * 100);
  zoom.max = String(PHOTO_FRAME_LIMITS.scale.max * 100);
  horizontal.min = String(PHOTO_FRAME_LIMITS.x.min);
  horizontal.max = String(PHOTO_FRAME_LIMITS.x.max);
  vertical.min = String(PHOTO_FRAME_LIMITS.y.min);
  vertical.max = String(PHOTO_FRAME_LIMITS.y.max);

  image.addEventListener("load", onImageLoad);
  image.addEventListener("error", onImageError);
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", stopPointer);
  stage.addEventListener("pointercancel", stopPointer);
  stage.addEventListener("keydown", event => {
    if (!imageReady || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    nudge(event.key.replace("Arrow", "").toLowerCase(), event.shiftKey ? 5 : 1);
  });
  zoom.addEventListener("input", () => setFrame({...draftFrame, scale: Number(zoom.value) / 100}));
  horizontal.addEventListener("input", () => setFrame({...draftFrame, x: Number(horizontal.value)}));
  vertical.addEventListener("input", () => setFrame({...draftFrame, y: Number(vertical.value)}));
  modal.addEventListener("click", event => {
    const action = event.target.closest("[data-photo-frame-action]")?.dataset.photoFrameAction;
    if (action) handleAction(action);
    const direction = event.target.closest("[data-photo-nudge]")?.dataset.photoNudge;
    if (direction) nudge(direction, event.shiftKey ? 5 : 1);
    if (event.target === modal) close();
  });
  modal.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
    trapFocus(event);
  });
}

export function openPhotoFrameEditor({src, frame, shape = "circle", opener = document.activeElement} = {}) {
  if (!initialized) throw new Error("El editor de encuadre no está inicializado.");
  if (!src) return false;
  savedFrame = normalizePhotoFrame(frame);
  draftFrame = {...savedFrame};
  previousFocus = opener;
  naturalWidth = 0;
  naturalHeight = 0;
  imageReady = false;
  applyButton.disabled = true;
  status.textContent = "Cargando fotografía…";
  status.dataset.tone = "neutral";
  stage.classList.remove("shape-circle", "shape-rounded", "is-broken", "is-dragging");
  stage.classList.add(shape === "rounded" ? "shape-rounded" : "shape-circle");
  image.alt = "Previsualización de la fotografía durante el ajuste de encuadre";
  applyPhotoFrame(image, draftFrame);
  modal.hidden = false;
  editorOverlay?.setAttribute("inert", "");
  image.src = src;
  renderDraft({emit: false});
  requestAnimationFrame(() => dialog.focus());
  return true;
}

export function closePhotoFrameEditor() {
  close();
}

export function isPhotoFrameEditorOpen() {
  return initialized && !modal.hidden;
}
