export const PHOTO_FRAME_LIMITS = Object.freeze({
  x: Object.freeze({min: 0, max: 100}),
  y: Object.freeze({min: 0, max: 100}),
  scale: Object.freeze({min: 1, max: 2.5}),
});

export const DEFAULT_PHOTO_FRAME = Object.freeze({x: 50, y: 50, scale: 1});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finiteNumber = (value, fallback) => {
  const number = typeof value === "string" && value.trim() === "" ? Number.NaN : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function legacyFrame(position = "center") {
  if (position === "top") return {x: 50, y: 0, scale: 1};
  if (position === "bottom") return {x: 50, y: 100, scale: 1};
  return {...DEFAULT_PHOTO_FRAME};
}

export function normalizePhotoFrame(value, legacyPosition = "center") {
  const fallback = legacyFrame(legacyPosition);
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  return {
    x: clamp(finiteNumber(value.x, fallback.x), PHOTO_FRAME_LIMITS.x.min, PHOTO_FRAME_LIMITS.x.max),
    y: clamp(finiteNumber(value.y, fallback.y), PHOTO_FRAME_LIMITS.y.min, PHOTO_FRAME_LIMITS.y.max),
    scale: clamp(finiteNumber(value.scale, fallback.scale), PHOTO_FRAME_LIMITS.scale.min, PHOTO_FRAME_LIMITS.scale.max),
  };
}

export function normalizeCardPhotoFrame(card = {}) {
  const normalized = {
    ...card,
    photoFrame: normalizePhotoFrame(card.photoFrame, card.photoPosition),
  };
  delete normalized.photoPosition;
  return normalized;
}

export function isValidPhotoFrame(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Number.isFinite(value.x) && value.x >= PHOTO_FRAME_LIMITS.x.min && value.x <= PHOTO_FRAME_LIMITS.x.max
    && Number.isFinite(value.y) && value.y >= PHOTO_FRAME_LIMITS.y.min && value.y <= PHOTO_FRAME_LIMITS.y.max
    && Number.isFinite(value.scale) && value.scale >= PHOTO_FRAME_LIMITS.scale.min && value.scale <= PHOTO_FRAME_LIMITS.scale.max;
}

export function photoFrameCss(value, legacyPosition = "center") {
  const frame = normalizePhotoFrame(value, legacyPosition);
  return {
    objectPosition: `${frame.x}% ${frame.y}%`,
    transform: `scale(${frame.scale})`,
    transformOrigin: `${frame.x}% ${frame.y}%`,
  };
}

export function applyPhotoFrame(image, value, legacyPosition = "center") {
  if (!image) return normalizePhotoFrame(value, legacyPosition);
  const frame = normalizePhotoFrame(value, legacyPosition);
  image.classList.add("photo-frame-image");
  image.style.setProperty("--photo-frame-x", `${frame.x}%`);
  image.style.setProperty("--photo-frame-y", `${frame.y}%`);
  image.style.setProperty("--photo-frame-scale", String(frame.scale));
  image.dataset.photoFrameX = String(frame.x);
  image.dataset.photoFrameY = String(frame.y);
  image.dataset.photoFrameScale = String(frame.scale);
  return frame;
}

export function createPhotoFrameImage(src, {
  alt = "",
  frame = DEFAULT_PHOTO_FRAME,
  legacyPosition = "center",
  loading = "",
  decoding = "async",
  className = "",
  onLoad,
  onError,
} = {}) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = alt;
  image.decoding = decoding;
  if (loading) image.loading = loading;
  if (className) image.className = className;
  applyPhotoFrame(image, frame, legacyPosition);
  if (onLoad) image.addEventListener("load", onLoad, {once: true});
  if (onError) image.addEventListener("error", onError, {once: true});
  return image;
}

export function coverGeometry({
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
  photoFrame = DEFAULT_PHOTO_FRAME,
} = {}) {
  const sourceWidth = Math.max(1, finiteNumber(naturalWidth, 1));
  const sourceHeight = Math.max(1, finiteNumber(naturalHeight, 1));
  const viewportWidth = Math.max(1, finiteNumber(frameWidth, 1));
  const viewportHeight = Math.max(1, finiteNumber(frameHeight, 1));
  const frame = normalizePhotoFrame(photoFrame);
  const coverScale = Math.max(viewportWidth / sourceWidth, viewportHeight / sourceHeight);
  const baseWidth = sourceWidth * coverScale;
  const baseHeight = sourceHeight * coverScale;
  const renderedWidth = baseWidth * frame.scale;
  const renderedHeight = baseHeight * frame.scale;
  const overflowX = Math.max(0, renderedWidth - viewportWidth);
  const overflowY = Math.max(0, renderedHeight - viewportHeight);
  const left = -overflowX * frame.x / 100;
  const top = -overflowY * frame.y / 100;
  return {
    frame,
    coverScale,
    baseWidth,
    baseHeight,
    renderedWidth,
    renderedHeight,
    overflowX,
    overflowY,
    left,
    top,
    right: left + renderedWidth,
    bottom: top + renderedHeight,
  };
}

export function dragPhotoFrame(value, {
  deltaX = 0,
  deltaY = 0,
  naturalWidth,
  naturalHeight,
  frameWidth,
  frameHeight,
} = {}) {
  const geometry = coverGeometry({naturalWidth, naturalHeight, frameWidth, frameHeight, photoFrame: value});
  const frame = geometry.frame;
  return normalizePhotoFrame({
    ...frame,
    x: geometry.overflowX > 0 ? frame.x - finiteNumber(deltaX, 0) / geometry.overflowX * 100 : frame.x,
    y: geometry.overflowY > 0 ? frame.y - finiteNumber(deltaY, 0) / geometry.overflowY * 100 : frame.y,
  });
}
