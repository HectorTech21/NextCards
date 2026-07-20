export const ANALYTICS_EVENTS_KEY = "nextcards_analytics_events";
export const ANALYTICS_SCHEMA_KEY = "nextcards_analytics_schema_version";
export const ANALYTICS_SCHEMA_VERSION = 1;
export const ANALYTICS_MAX_EVENTS = 10000;

export const ANALYTICS_EVENT_TYPES = Object.freeze([
  "card_view",
  "qr_open",
  "phone_click",
  "email_click",
  "linkedin_click",
  "website_click",
  "vcard_download",
  "share_click",
  "copy_link",
  "qr_download",
  "background_download",
  "wallet_click",
]);

export const ANALYTICS_SOURCES = Object.freeze([
  "qr",
  "shared_link",
  "copied_link",
  "direct",
  "admin_preview",
  "editor_preview",
  "unknown",
]);

export const ANALYTICS_DEVICE_TYPES = Object.freeze(["mobile", "tablet", "desktop", "unknown"]);
const REFERRER_TYPES = new Set(["none", "same_origin", "external", "unknown"]);

const clone = value => JSON.parse(JSON.stringify(value));
const allowed = (value, values, fallback) => values.includes(value) ? value : fallback;

function cleanMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > 2048) return {};
    return JSON.parse(serialized);
  } catch {
    return {};
  }
}

export function normalizeAnalyticsEvent(event) {
  if (!event || typeof event !== "object") return null;
  const timestamp = new Date(event.timestamp);
  const eventType = String(event.eventType || "");
  const id = String(event.id || "").trim();
  const cardId = String(event.cardId || "").trim();
  const sessionId = String(event.sessionId || "").trim();
  if (!id || !cardId || !sessionId || !ANALYTICS_EVENT_TYPES.includes(eventType) || Number.isNaN(timestamp.getTime())) return null;
  return {
    id,
    eventType,
    cardId,
    employeeId: event.employeeId ? String(event.employeeId) : null,
    templateId: String(event.templateId || ""),
    source: allowed(String(event.source || ""), ANALYTICS_SOURCES, "unknown"),
    deviceType: allowed(String(event.deviceType || ""), ANALYTICS_DEVICE_TYPES, "unknown"),
    referrerType: REFERRER_TYPES.has(event.referrerType) ? event.referrerType : "unknown",
    sessionId,
    timestamp: timestamp.toISOString(),
    isDemo: Boolean(event.isDemo),
    metadata: cleanMetadata(event.metadata),
  };
}

function orderAndLimit(events, maxEvents) {
  const unique = new Map();
  events.map(normalizeAnalyticsEvent).filter(Boolean).forEach(event => unique.set(event.id, event));
  const ordered = [...unique.values()].sort((first, second) => first.timestamp.localeCompare(second.timestamp));
  const trimmed = Math.max(0, ordered.length - maxEvents);
  return {events: trimmed ? ordered.slice(trimmed) : ordered, trimmed};
}

export class LocalAnalyticsRepository {
  constructor({storage = globalThis.localStorage, maxEvents = ANALYTICS_MAX_EVENTS} = {}) {
    this.storage = storage;
    this.maxEvents = maxEvents;
    this.lastError = null;
  }

  read() {
    this.lastError = null;
    try {
      const raw = this.storage?.getItem(ANALYTICS_EVENTS_KEY);
      if (raw === null) return {events: [], error: null};
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("El historial local de analítica no tiene un formato válido.");
      const normalized = orderAndLimit(parsed, this.maxEvents).events;
      return {events: clone(normalized), error: null};
    } catch (error) {
      this.lastError = error;
      console.warn("No se pudo leer la analítica local.", error);
      return {events: [], error};
    }
  }

  getEvents() {
    return this.read().events;
  }

  write(events) {
    const result = orderAndLimit(events, this.maxEvents);
    try {
      this.storage?.setItem(ANALYTICS_EVENTS_KEY, JSON.stringify(result.events));
      this.storage?.setItem(ANALYTICS_SCHEMA_KEY, String(ANALYTICS_SCHEMA_VERSION));
      this.lastError = null;
      return {saved: true, count: result.events.length, trimmed: result.trimmed, atCapacity: result.events.length >= this.maxEvents};
    } catch (error) {
      this.lastError = error;
      console.warn("No se pudo guardar la analítica local.", error);
      return {saved: false, count: this.getEvents().length, trimmed: 0, atCapacity: false, error};
    }
  }

  saveEvent(event) {
    const normalized = normalizeAnalyticsEvent(event);
    if (!normalized) return {saved: false, count: this.getEvents().length, trimmed: 0, atCapacity: false, error: new Error("Evento de analítica no válido.")};
    return this.write([...this.getEvents(), normalized]);
  }

  saveEvents(events, {replace = false} = {}) {
    return this.write(replace ? events : [...this.getEvents(), ...(events || [])]);
  }

  queryEvents(predicate = () => true) {
    return this.getEvents().filter(predicate);
  }

  replaceDemoEvents(events) {
    const realEvents = this.getEvents().filter(event => !event.isDemo);
    return this.write([...realEvents, ...(events || []).map(event => ({...event, isDemo: true}))]);
  }

  clearEvents({demoOnly = false, realOnly = false} = {}) {
    const current = this.getEvents();
    if (!demoOnly && !realOnly) {
      try {
        this.storage?.removeItem(ANALYTICS_EVENTS_KEY);
        this.storage?.removeItem(ANALYTICS_SCHEMA_KEY);
        this.lastError = null;
        return {saved: true, count: 0, trimmed: 0, atCapacity: false, removed: current.length};
      } catch (error) {
        this.lastError = error;
        console.warn("No se pudo limpiar la analítica local.", error);
        return {saved: false, count: current.length, trimmed: 0, atCapacity: false, removed: 0, error};
      }
    }
    const retained = demoOnly ? current.filter(event => !event.isDemo) : realOnly ? current.filter(event => event.isDemo) : [];
    const result = this.write(retained);
    return {...result, removed: current.length - retained.length};
  }

  exportEvents(predicate = () => true) {
    return this.queryEvents(predicate);
  }

  getStatus() {
    const {events, error} = this.read();
    return {count: events.length, demoCount: events.filter(event => event.isDemo).length, realCount: events.filter(event => !event.isDemo).length, error, atCapacity: events.length >= this.maxEvents};
  }
}

export const analyticsRepository = new LocalAnalyticsRepository();
