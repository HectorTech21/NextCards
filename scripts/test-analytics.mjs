import assert from "node:assert/strict";
import {
  ANALYTICS_EVENTS_KEY,
  ANALYTICS_SCHEMA_KEY,
  ANALYTICS_SCHEMA_VERSION,
  LocalAnalyticsRepository,
  normalizeAnalyticsEvent,
} from "../assets/js/analytics-store.js";
import {
  buildAnalyticsCsv,
  buildCardRanking,
  buildDeviceDistribution,
  buildInteractionDistribution,
  buildSourceDistribution,
  buildTimeSeries,
  filterAnalyticsEvents,
  getAnalyticsMetrics,
  getCardAnalytics,
  getUniqueSessions,
  resolveDateRange,
} from "../assets/js/analytics-aggregate.js";
import {buildAnalyticsDemoData, generateAnalyticsDemoData} from "../assets/js/analytics-demo.js";
import {
  createAnalyticsEvent,
  detectDeviceType,
  getAccessContext,
  resetPageTrackingForTests,
  safeTrackEvent,
  trackPublicCardView,
} from "../assets/js/analytics.js";
import {getSourcedPublicCardUrl} from "../assets/js/card-export.js";

class StorageMock {
  values = new Map();
  clearCalls = 0;
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
  clear() { this.clearCalls += 1; this.values.clear(); }
}

const cards = [
  {id: "card-cfo", slug: "francisco-javier-pedraza-calvo-cfo", cardName: "Francisco · CFO", firstName: "Francisco Javier", lastName: "Pedraza Calvo", jobTitle: "CFO", department: "STAFF", email: "francisco@lognext.com", phone: "+34 1", website: "https://lognext.com", linkedin: "https://linkedin.com/in/francisco", template: "corporate-navy", status: "active"},
  {id: "card-consejo", slug: "francisco-javier-pedraza-calvo-consejo-asesor", cardName: "Francisco · Consejo Asesor", firstName: "Francisco Javier", lastName: "Pedraza Calvo", jobTitle: "Consejo Asesor", department: "STAFF", email: "francisco@lognext.com", phone: "+34 1", website: "https://lognext.com", linkedin: "https://linkedin.com/in/francisco", template: "corporate-navy", status: "active"},
  {id: "card-people", slug: "irma-rivera", cardName: "Irma · People", firstName: "Irma", lastName: "Rivera", jobTitle: "People & Culture", department: "PEOPLE", email: "irma@lognext.com", template: "clean-light", status: "active"},
];

const event = (id, eventType, cardId, timestamp, options = {}) => ({
  id,
  eventType,
  cardId,
  employeeId: null,
  templateId: options.templateId || "corporate-navy",
  source: options.source || "direct",
  deviceType: options.deviceType || "desktop",
  referrerType: options.referrerType || "none",
  sessionId: options.sessionId || `session-${id}`,
  timestamp,
  isDemo: Boolean(options.isDemo),
  metadata: options.metadata || {},
});

const invalid = normalizeAnalyticsEvent({eventType: "card_view"});
assert.equal(invalid, null, "Los eventos incompletos deben rechazarse.");
const normalized = normalizeAnalyticsEvent(event("normal", "card_view", "card-cfo", "2026-07-17T10:00:00.000Z", {source: "not-allowed", deviceType: "console"}));
assert.equal(normalized.source, "unknown");
assert.equal(normalized.deviceType, "unknown");

const cappedStorage = new StorageMock();
const cappedRepository = new LocalAnalyticsRepository({storage: cappedStorage, maxEvents: 3});
const capped = cappedRepository.saveEvents([
  event("oldest", "card_view", "card-cfo", "2026-07-14T10:00:00.000Z"),
  event("middle", "card_view", "card-cfo", "2026-07-15T10:00:00.000Z"),
  event("newer", "card_view", "card-cfo", "2026-07-16T10:00:00.000Z"),
  event("newest", "card_view", "card-cfo", "2026-07-17T10:00:00.000Z"),
], {replace: true});
assert.equal(capped.count, 3);
assert.equal(capped.trimmed, 1);
assert.equal(capped.atCapacity, true);
assert.deepEqual(cappedRepository.getEvents().map(item => item.id), ["middle", "newer", "newest"], "Al superar el límite deben conservarse los eventos más recientes.");
assert.equal(cappedStorage.getItem(ANALYTICS_SCHEMA_KEY), String(ANALYTICS_SCHEMA_VERSION));

const storage = new StorageMock();
const repository = new LocalAnalyticsRepository({storage});
const data = [
  event("a-view-1", "card_view", "card-cfo", "2026-07-17T08:00:00.000Z", {sessionId: "session-a", source: "direct", deviceType: "desktop"}),
  event("a-view-2", "card_view", "card-cfo", "2026-07-17T08:05:00.000Z", {sessionId: "session-a", source: "direct", deviceType: "desktop"}),
  event("a-phone", "phone_click", "card-cfo", "2026-07-17T08:06:00.000Z", {sessionId: "session-a", source: "direct", deviceType: "desktop"}),
  event("a-view-qr", "card_view", "card-cfo", "2026-07-17T09:00:00.000Z", {sessionId: "session-b", source: "qr", deviceType: "mobile"}),
  event("a-qr", "qr_open", "card-cfo", "2026-07-17T09:00:01.000Z", {sessionId: "session-b", source: "qr", deviceType: "mobile"}),
  event("a-vcard", "vcard_download", "card-cfo", "2026-07-17T09:02:00.000Z", {sessionId: "session-b", source: "qr", deviceType: "mobile"}),
  event("b-view", "card_view", "card-consejo", "2026-07-17T10:00:00.000Z", {sessionId: "session-c", source: "shared_link", deviceType: "tablet"}),
  event("b-email", "email_click", "card-consejo", "2026-07-17T10:01:00.000Z", {sessionId: "session-c", source: "shared_link", deviceType: "tablet"}),
  event("b-share", "share_click", "card-consejo", "2026-07-17T10:02:00.000Z", {sessionId: "session-c", source: "shared_link", deviceType: "tablet"}),
  event("b-copy", "copy_link", "card-consejo", "2026-07-17T10:03:00.000Z", {sessionId: "session-c", source: "shared_link", deviceType: "tablet"}),
  event("preview-admin", "card_view", "card-consejo", "2026-07-17T11:00:00.000Z", {sessionId: "session-admin", source: "admin_preview"}),
  event("preview-editor", "card_view", "card-cfo", "2026-07-17T11:05:00.000Z", {sessionId: "session-editor", source: "editor_preview"}),
  event("other-department", "card_view", "card-people", "2026-07-17T12:00:00.000Z", {sessionId: "session-d", source: "copied_link"}),
];
assert.equal(repository.saveEvents(data, {replace: true}).saved, true);
assert.equal(repository.getEvents().length, data.length, "Los eventos deben persistir entre lecturas.");

const todayRange = resolveDateRange("today", {now: new Date("2026-07-17T14:00:00.000Z")});
assert.equal(todayRange.valid, true);
const mainEvents = filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "all", range: todayRange.current}, cards);
assert.equal(mainEvents.some(item => item.source === "admin_preview" || item.source === "editor_preview"), false, "Los previews deben quedar fuera de las métricas principales.");
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "preview", range: todayRange.current}, cards).length, 2, "El filtro de depuración debe poder mostrar ambos previews.");
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "qr", range: todayRange.current}, cards).every(item => item.source === "qr"), true);
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "direct", range: todayRange.current}, cards).some(item => item.eventType === "qr_open"), false, "Un enlace directo nunca debe clasificarse como QR.");
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "all", cardId: "card-consejo", range: todayRange.current}, cards).every(item => item.cardId === "card-consejo"), true);
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "all", department: "PEOPLE", range: todayRange.current}, cards).length, 1);
assert.equal(filterAnalyticsEvents(repository.getEvents(), {dataMode: "real", source: "all", eventType: "email_click", range: todayRange.current}, cards).length, 1);

const metrics = getAnalyticsMetrics(mainEvents, null);
const values = Object.fromEntries(metrics.map(item => [item.key, item.value]));
assert.deepEqual(values, {views: 5, sessions: 4, qr: 1, vcard: 1, contacts: 2, shares: 1}, "Las métricas deben coincidir con los eventos reales filtrados.");
assert.equal(metrics.every(item => item.variation === null), true, "No debe inventarse una comparación inexistente.");
assert.equal(getUniqueSessions(mainEvents), 4, "Dos recargas de la misma sesión cuentan como dos vistas y una sesión única.");

const ranking = buildCardRanking(mainEvents, cards, {limit: 0});
assert.equal(ranking.length, 3);
assert.equal(ranking.filter(item => item.card.email === "francisco@lognext.com").length, 2, "Dos tarjetas con el mismo email deben seguir separadas por cardId.");
assert.deepEqual(new Set(ranking.filter(item => item.card.email === "francisco@lognext.com").map(item => item.cardId)), new Set(["card-cfo", "card-consejo"]));
assert.equal(ranking.every(item => Number.isFinite(item.interactionRate)), true, "La tasa nunca puede ser NaN o infinita.");
const emptyRate = buildCardRanking([event("only-action", "phone_click", "card-cfo", "2026-07-17T13:00:00.000Z")], cards, {limit: 0})[0];
assert.equal(emptyRate.interactionRate, 0, "No se debe dividir entre cero cuando no hay vistas.");

const cfoDetail = getCardAnalytics("card-cfo", mainEvents, cards);
assert.equal(cfoDetail.events.every(item => item.cardId === "card-cfo"), true, "El detalle no debe incluir eventos de otras tarjetas.");
assert.equal(cfoDetail.views, 3);
assert.equal(cfoDetail.uniqueSessions, 2);
assert.equal(cfoDetail.clicks.phone_click, 1);
assert.equal(cfoDetail.clicks.email_click, 0);

const series = buildTimeSeries(mainEvents, {period: "today", range: todayRange.current});
assert.equal(series.granularity, "hour");
assert.ok(series.buckets.length >= 14);
assert.equal(series.buckets.reduce((total, bucket) => total + bucket.views, 0), 5);
for (const item of [...buildInteractionDistribution(mainEvents), ...buildSourceDistribution(mainEvents), ...buildDeviceDistribution(mainEvents)]) {
  assert.equal(Number.isFinite(item.percentage), true);
  assert.ok(item.percentage >= 0 && item.percentage <= 100);
}

const consejoEvents = filterAnalyticsEvents(mainEvents, {dataMode: "real", source: "all", cardId: "card-consejo", range: todayRange.current}, cards);
const csv = buildAnalyticsCsv(consejoEvents, cards);
assert.match(csv, /card-consejo/);
assert.doesNotMatch(csv, /card-cfo/, "El CSV debe respetar el filtro actual.");
assert.doesNotMatch(csv, /undefined|NaN/);

assert.equal(detectDeviceType(360), "mobile");
assert.equal(detectDeviceType(768), "tablet");
assert.equal(detectDeviceType(1366), "desktop");
assert.equal(getAccessContext("http://localhost/card.html?id=x&source=qr", "").source, "qr");
assert.equal(getAccessContext("http://localhost/card.html?id=x", "").source, "direct");
assert.match(getSourcedPublicCardUrl(cards[0], "qr", "http://127.0.0.1:8080/index.html"), /source=qr/);
assert.doesNotMatch(getSourcedPublicCardUrl(cards[0], "invalid", "http://127.0.0.1:8080/index.html"), /source=/);

const trackingStorage = new StorageMock();
const trackingRepository = new LocalAnalyticsRepository({storage: trackingStorage});
resetPageTrackingForTests();
const qrTracking = trackPublicCardView(cards[0], {source: "qr", deviceType: "mobile", referrerType: "none", sessionId: "tracking-session"}, trackingRepository);
assert.equal(qrTracking.tracked, true);
assert.deepEqual(trackingRepository.getEvents().map(item => item.eventType), ["card_view", "qr_open"]);
assert.equal(trackPublicCardView(cards[0], {source: "qr", deviceType: "mobile", referrerType: "none", sessionId: "tracking-session"}, trackingRepository).tracked, false, "Un rerender de la misma página no debe duplicar la vista.");
resetPageTrackingForTests();
trackPublicCardView(cards[0], {source: "direct", deviceType: "desktop", referrerType: "none", sessionId: "tracking-session"}, trackingRepository);
assert.equal(trackingRepository.getEvents().filter(item => item.eventType === "card_view").length, 2, "Una recarga real puede registrar una nueva vista.");
assert.equal(getUniqueSessions(trackingRepository.getEvents()), 1, "Las recargas dentro de la sesión deben deduplicarse en sesiones únicas.");

for (const type of ["phone_click", "email_click", "linkedin_click", "website_click", "vcard_download", "share_click", "copy_link"]) {
  const result = safeTrackEvent(type, {card: cards[0], source: "direct", sessionId: "tracking-session", timestamp: "2026-07-17T15:00:00.000Z"}, trackingRepository);
  assert.equal(result.saved, true, `${type} debe poder registrarse.`);
}
const failingRepository = {saveEvent() { throw new Error("quota"); }};
const originalWarn = console.warn;
console.warn = () => {};
assert.doesNotThrow(() => safeTrackEvent("phone_click", {card: cards[0]}, failingRepository), "Un fallo de tracking no debe interrumpir la acción principal.");
const created = createAnalyticsEvent("card_view", {card: cards[0], source: "direct", sessionId: "anonymous"});
assert.equal(created.employeeId, null);
assert.equal(Object.hasOwn(created, "userAgent"), false);
assert.equal(Object.hasOwn(created, "ip"), false);

const demoNow = new Date("2026-07-17T12:00:00.000Z");
const demoOne = buildAnalyticsDemoData(cards, {now: demoNow, days: 30, seed: 1234});
const demoTwo = buildAnalyticsDemoData(cards, {now: demoNow, days: 30, seed: 1234});
assert.deepEqual(demoOne, demoTwo, "El generador demo debe ser determinista con el mismo seed.");
assert.ok(demoOne.length > 50 && demoOne.length < 1000);
assert.equal(demoOne.every(item => item.isDemo), true);
assert.equal(new Set(demoOne.map(item => item.cardId)).size > 1, true);

const demoStorage = new StorageMock();
const demoRepository = new LocalAnalyticsRepository({storage: demoStorage});
demoRepository.saveEvent(event("real-kept", "card_view", "card-cfo", "2026-07-17T10:00:00.000Z"));
const generatedFirst = generateAnalyticsDemoData(cards, demoRepository, {now: demoNow, days: 30, seed: 1234});
const countAfterFirst = demoRepository.getEvents().length;
const generatedSecond = generateAnalyticsDemoData(cards, demoRepository, {now: demoNow, days: 30, seed: 1234});
assert.equal(generatedFirst.generated, generatedSecond.generated);
assert.equal(demoRepository.getEvents().length, countAfterFirst, "Recargar datos demo debe sustituirlos, no duplicarlos.");
assert.equal(demoRepository.getEvents().filter(item => !item.isDemo).length, 1, "Los eventos reales no deben mezclarse ni sobrescribirse.");
demoRepository.clearEvents({demoOnly: true});
assert.deepEqual(demoRepository.getEvents().map(item => item.id), ["real-kept"], "Eliminar demo debe conservar eventos reales.");
demoRepository.clearEvents();
assert.equal(demoStorage.getItem(ANALYTICS_EVENTS_KEY), null);
assert.equal(demoStorage.getItem(ANALYTICS_SCHEMA_KEY), null);
assert.equal(demoStorage.clearCalls, 0, "Nunca debe usarse localStorage.clear().");

const corruptStorage = new StorageMock();
corruptStorage.setItem(ANALYTICS_EVENTS_KEY, "{bad json");
const corruptRepository = new LocalAnalyticsRepository({storage: corruptStorage});
assert.ok(corruptRepository.read().error, "Un historial corrupto debe producir un estado de error recuperable.");
assert.doesNotThrow(() => corruptRepository.clearEvents());
console.warn = originalWarn;

console.log("OK: tracking, sesiones, fuentes, previews, filtros, métricas, ranking por cardId, detalle, exportación, demo, persistencia, límite y limpieza verificados.");
