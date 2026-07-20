import {
  ANALYTICS_DEVICE_TYPES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_SOURCES,
  analyticsRepository,
} from "./analytics-store.js";
import {settingsService} from "./settings-store.js";

export const ANALYTICS_SESSION_KEY = "nextcards_analytics_session_id";
const pageViews = new Set();
let fallbackSessionId = "";

const uid = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export function getAnalyticsSessionId(sessionStore = globalThis.sessionStorage) {
  try {
    let value = sessionStore?.getItem(ANALYTICS_SESSION_KEY);
    if (!value) {
      value = uid("session");
      sessionStore?.setItem(ANALYTICS_SESSION_KEY, value);
    }
    return value;
  } catch {
    fallbackSessionId ||= uid("session-memory");
    return fallbackSessionId;
  }
}

export function detectDeviceType(width = globalThis.innerWidth) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth) || numericWidth <= 0) return "unknown";
  if (numericWidth <= 767) return "mobile";
  if (numericWidth <= 1024) return "tablet";
  return "desktop";
}

export function normalizeAnalyticsSource(value, {emptyAsDirect = true} = {}) {
  const source = String(value || "").trim().toLowerCase();
  if (!source) return emptyAsDirect ? "direct" : "unknown";
  return ANALYTICS_SOURCES.includes(source) ? source : "unknown";
}

export function detectReferrerType(referrer = globalThis.document?.referrer || "", currentUrl = globalThis.location?.href || "") {
  if (!referrer) return "none";
  try {
    return new URL(referrer).origin === new URL(currentUrl).origin ? "same_origin" : "external";
  } catch {
    return "unknown";
  }
}

export function getAccessContext(url = globalThis.location?.href || "", referrer = globalThis.document?.referrer || "") {
  let source = "direct";
  try { source = normalizeAnalyticsSource(new URL(url).searchParams.get("source")); } catch { source = "unknown"; }
  return {source, referrerType: detectReferrerType(referrer, url), deviceType: detectDeviceType()};
}

export function createAnalyticsEvent(eventType, context = {}) {
  if (!ANALYTICS_EVENT_TYPES.includes(eventType)) throw new Error(`Tipo de evento no permitido: ${eventType}`);
  const card = context.card || {};
  const source = normalizeAnalyticsSource(context.source, {emptyAsDirect: true});
  const deviceType = ANALYTICS_DEVICE_TYPES.includes(context.deviceType) ? context.deviceType : detectDeviceType();
  return {
    id: context.id || uid("event"),
    eventType,
    cardId: String(context.cardId || card.id || ""),
    employeeId: context.employeeId || null,
    templateId: String(context.templateId || card.template || ""),
    source,
    deviceType,
    referrerType: context.referrerType || detectReferrerType(),
    sessionId: context.sessionId || getAnalyticsSessionId(),
    timestamp: new Date(context.timestamp || Date.now()).toISOString(),
    isDemo: Boolean(context.isDemo),
    metadata: context.metadata || {},
  };
}

export function trackEvent(eventType, context = {}, repository = analyticsRepository) {
  if (!settingsService.getSettings().privacy.analyticsEnabled) return {saved: false, disabled: true};
  const event = createAnalyticsEvent(eventType, context);
  return {...repository.saveEvent(event), event};
}

export function safeTrackEvent(eventType, context = {}, repository = analyticsRepository) {
  try {
    return trackEvent(eventType, context, repository);
  } catch (error) {
    console.warn("La acción continuará aunque no se haya podido registrar la analítica.", error);
    return {saved: false, error};
  }
}

export function trackPublicCardView(card, accessContext = getAccessContext(), repository = analyticsRepository) {
  const key = `${card?.id || ""}|${globalThis.location?.href || accessContext.source}`;
  if (!card?.id || pageViews.has(key)) return {tracked: false, reason: "already-tracked"};
  pageViews.add(key);
  const baseContext = {...accessContext, card};
  const view = safeTrackEvent("card_view", baseContext, repository);
  const qr = accessContext.source === "qr" ? safeTrackEvent("qr_open", baseContext, repository) : null;
  return {tracked: Boolean(view.saved), view, qr};
}

export function resetPageTrackingForTests() {
  pageViews.clear();
  fallbackSessionId = "";
}
