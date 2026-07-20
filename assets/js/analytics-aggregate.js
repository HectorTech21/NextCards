export const CONTACT_EVENT_TYPES = Object.freeze(["phone_click", "email_click", "linkedin_click", "website_click"]);
export const ENGAGEMENT_EVENT_TYPES = Object.freeze([...CONTACT_EVENT_TYPES, "vcard_download", "share_click", "copy_link"]);
export const CHART_INTERACTION_TYPES = Object.freeze([...CONTACT_EVENT_TYPES, "share_click", "copy_link"]);
export const PREVIEW_SOURCES = Object.freeze(["admin_preview", "editor_preview"]);

export const EVENT_LABELS = Object.freeze({
  card_view: "Vista de tarjeta",
  qr_open: "Apertura desde QR",
  phone_click: "Teléfono",
  email_click: "Email",
  linkedin_click: "LinkedIn",
  website_click: "Web",
  vcard_download: "Descarga VCF",
  share_click: "Compartir",
  copy_link: "Copiar enlace",
  qr_download: "Descarga QR",
  background_download: "Fondo de videollamada",
  wallet_click: "Wallet",
});

export const SOURCE_LABELS = Object.freeze({
  qr: "QR",
  shared_link: "Enlace compartido",
  copied_link: "Enlace copiado",
  direct: "Directo",
  admin_preview: "Preview administrativa",
  editor_preview: "Preview del editor",
  unknown: "Otros",
});

export const DEVICE_LABELS = Object.freeze({mobile: "Móvil", tablet: "Tablet", desktop: "Escritorio", unknown: "Desconocido"});

const pad = value => String(value).padStart(2, "0");
const startOfDay = value => new Date(value.getFullYear(), value.getMonth(), value.getDate());
const endOfDay = value => new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
const dateOnly = value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
const hourKey = value => `${dateOnly(value)}T${pad(value.getHours())}`;
const monthKey = value => `${value.getFullYear()}-${pad(value.getMonth() + 1)}`;
const count = (events, predicate) => events.reduce((total, event) => total + (predicate(event) ? 1 : 0), 0);
const percentage = (value, total) => total > 0 ? Math.round((value / total) * 1000) / 10 : 0;

function parseDateInput(value, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return end ? endOfDay(parsed) : startOfDay(parsed);
}

export function resolveDateRange(period = "30d", {now = new Date(), from = "", to = ""} = {}) {
  const end = new Date(now);
  let start = null;
  if (period === "today") start = startOfDay(end);
  if (["7d", "30d", "90d"].includes(period)) {
    start = startOfDay(end);
    start.setDate(start.getDate() - (Number.parseInt(period, 10) - 1));
  }
  if (period === "custom") {
    start = parseDateInput(from);
    const customEnd = parseDateInput(to, true);
    if (!start || !customEnd || customEnd < start) return {current: null, previous: null, valid: false};
    const duration = customEnd.getTime() - start.getTime();
    const previousEnd = new Date(start.getTime() - 1);
    return {current: {start, end: customEnd}, previous: {start: new Date(previousEnd.getTime() - duration), end: previousEnd}, valid: true};
  }
  if (period === "all") return {current: null, previous: null, valid: true};
  if (!start) return resolveDateRange("30d", {now});
  const duration = end.getTime() - start.getTime();
  const previousEnd = new Date(start.getTime() - 1);
  return {current: {start, end}, previous: {start: new Date(previousEnd.getTime() - duration), end: previousEnd}, valid: true};
}

function matchesSource(event, sourceFilter, includePreviews) {
  const isPreview = PREVIEW_SOURCES.includes(event.source);
  if (sourceFilter === "preview") return isPreview;
  if (!includePreviews && isPreview) return false;
  if (!sourceFilter || sourceFilter === "all") return true;
  if (sourceFilter === "other") return event.source === "unknown";
  return event.source === sourceFilter;
}

export function filterAnalyticsEvents(events, filters = {}, cards = []) {
  const cardMap = new Map(cards.map(card => [card.id, card]));
  const range = filters.range || resolveDateRange(filters.period, {now: filters.now, from: filters.from, to: filters.to}).current;
  return (events || []).filter(event => {
    const timestamp = new Date(event.timestamp);
    const card = cardMap.get(event.cardId);
    const modeMatches = filters.dataMode === "demo" ? event.isDemo : filters.dataMode === "all" ? true : !event.isDemo;
    return modeMatches
      && (!range || (timestamp >= range.start && timestamp <= range.end))
      && (!filters.cardId || event.cardId === filters.cardId)
      && (!filters.department || card?.department === filters.department)
      && (!filters.eventType || filters.eventType === "all" || event.eventType === filters.eventType)
      && matchesSource(event, filters.source, Boolean(filters.includePreviews));
  });
}

export function getUniqueSessions(events) {
  return new Set(events.filter(event => event.eventType === "card_view").map(event => event.sessionId).filter(Boolean)).size;
}

function metricValue(events, key) {
  if (key === "views") return count(events, event => event.eventType === "card_view");
  if (key === "sessions") return getUniqueSessions(events);
  if (key === "qr") return count(events, event => event.eventType === "qr_open");
  if (key === "vcard") return count(events, event => event.eventType === "vcard_download");
  if (key === "contacts") return count(events, event => CONTACT_EVENT_TYPES.includes(event.eventType));
  if (key === "shares") return count(events, event => event.eventType === "share_click");
  return 0;
}

export function getAnalyticsMetrics(currentEvents, previousEvents = null) {
  return [
    {key: "views", label: "Vistas totales", description: "Cargas reales de tarjetas públicas dentro del periodo."},
    {key: "sessions", label: "Sesiones únicas", description: "Sesiones anónimas aproximadas con al menos una vista local."},
    {key: "qr", label: "Aperturas QR", description: "Aperturas cuya URL incluye source=qr."},
    {key: "vcard", label: "Descargas de contacto", description: "Descargas del archivo de contacto VCF."},
    {key: "contacts", label: "Clics de contacto", description: "Teléfono, email, LinkedIn y web agrupados."},
    {key: "shares", label: "Veces compartida", description: "Uso del botón Compartir tarjeta."},
  ].map(metric => {
    const value = metricValue(currentEvents, metric.key);
    const previousValue = previousEvents ? metricValue(previousEvents, metric.key) : null;
    const variation = previousValue && previousValue > 0 ? Math.round(((value - previousValue) / previousValue) * 1000) / 10 : null;
    return {...metric, value, previousValue, variation};
  });
}

function boundsForSeries(events, period, range, now) {
  if (range) return {start: new Date(range.start), end: new Date(range.end)};
  if (events.length) return {start: new Date(events[0].timestamp), end: new Date(events.at(-1).timestamp)};
  const end = new Date(now || Date.now());
  return {start: startOfDay(end), end};
}

function seriesGranularity(period, bounds) {
  if (period === "today") return "hour";
  const span = bounds.end.getTime() - bounds.start.getTime();
  return span > 120 * 86400000 ? "month" : "day";
}

function bucketKey(date, granularity) {
  if (granularity === "hour") return hourKey(date);
  if (granularity === "month") return monthKey(date);
  return dateOnly(date);
}

function bucketLabel(date, granularity) {
  if (granularity === "hour") return `${pad(date.getHours())}:00`;
  if (granularity === "month") return new Intl.DateTimeFormat("es-ES", {month: "short", year: "2-digit"}).format(date);
  return new Intl.DateTimeFormat("es-ES", {day: "2-digit", month: "short"}).format(date);
}

function increment(date, granularity) {
  const next = new Date(date);
  if (granularity === "hour") next.setHours(next.getHours() + 1, 0, 0, 0);
  else if (granularity === "month") next.setMonth(next.getMonth() + 1, 1);
  else next.setDate(next.getDate() + 1);
  return next;
}

export function buildTimeSeries(events, {period = "30d", range = null, now = new Date()} = {}) {
  const ordered = [...(events || [])].sort((first, second) => first.timestamp.localeCompare(second.timestamp));
  const bounds = boundsForSeries(ordered, period, range, now);
  const granularity = seriesGranularity(period, bounds);
  let cursor = granularity === "hour" ? new Date(bounds.start.getFullYear(), bounds.start.getMonth(), bounds.start.getDate(), bounds.start.getHours())
    : granularity === "month" ? new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1)
      : startOfDay(bounds.start);
  const end = new Date(bounds.end);
  const buckets = [];
  while (cursor <= end && buckets.length < 500) {
    buckets.push({key: bucketKey(cursor, granularity), label: bucketLabel(cursor, granularity), views: 0, qr: 0, interactions: 0, vcard: 0});
    cursor = increment(cursor, granularity);
  }
  const map = new Map(buckets.map(bucket => [bucket.key, bucket]));
  ordered.forEach(event => {
    const bucket = map.get(bucketKey(new Date(event.timestamp), granularity));
    if (!bucket) return;
    if (event.eventType === "card_view") bucket.views += 1;
    if (event.eventType === "qr_open") bucket.qr += 1;
    if (CHART_INTERACTION_TYPES.includes(event.eventType)) bucket.interactions += 1;
    if (event.eventType === "vcard_download") bucket.vcard += 1;
  });
  return {granularity, buckets};
}

function aggregateOneCard(cardId, events, cardMap) {
  const cardEvents = events.filter(event => event.cardId === cardId);
  const card = cardMap.get(cardId) || {id: cardId, firstName: "Tarjeta", lastName: "eliminada", jobTitle: "No disponible", department: "—", slug: "", status: "unknown", template: ""};
  const viewedSessions = new Set(cardEvents.filter(event => event.eventType === "card_view").map(event => event.sessionId));
  const interactionSessions = new Set(cardEvents.filter(event => ENGAGEMENT_EVENT_TYPES.includes(event.eventType)).map(event => event.sessionId));
  const engagedViewedSessions = [...interactionSessions].filter(sessionId => viewedSessions.has(sessionId)).length;
  const clicks = Object.fromEntries(CONTACT_EVENT_TYPES.map(type => [type, count(cardEvents, event => event.eventType === type)]));
  return {
    card,
    cardId,
    views: count(cardEvents, event => event.eventType === "card_view"),
    uniqueSessions: viewedSessions.size,
    qr: count(cardEvents, event => event.eventType === "qr_open"),
    interactions: count(cardEvents, event => ENGAGEMENT_EVENT_TYPES.includes(event.eventType)),
    vcard: count(cardEvents, event => event.eventType === "vcard_download"),
    shares: count(cardEvents, event => event.eventType === "share_click"),
    copyLinks: count(cardEvents, event => event.eventType === "copy_link"),
    interactionRate: viewedSessions.size ? Math.round((engagedViewedSessions / viewedSessions.size) * 1000) / 10 : 0,
    clicks,
    lastInteraction: cardEvents.filter(event => ENGAGEMENT_EVENT_TYPES.includes(event.eventType)).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp || null,
    events: cardEvents,
  };
}

export function buildCardRanking(events, cards, {sortBy = "views", limit = 10} = {}) {
  const cardMap = new Map(cards.map(card => [card.id, card]));
  const ids = [...new Set(events.map(event => event.cardId))];
  const allowedSort = new Set(["views", "qr", "interactions", "vcard", "interactionRate"]);
  const key = allowedSort.has(sortBy) ? sortBy : "views";
  const ranking = ids.map(id => aggregateOneCard(id, events, cardMap)).sort((first, second) => second[key] - first[key] || second.views - first.views || first.cardId.localeCompare(second.cardId));
  return limit ? ranking.slice(0, limit) : ranking;
}

export function getCardAnalytics(cardId, events, cards) {
  return aggregateOneCard(cardId, events, new Map(cards.map(card => [card.id, card])));
}

export function buildInteractionDistribution(events) {
  const definitions = [
    ["phone_click", "Teléfono"], ["email_click", "Email"], ["linkedin_click", "LinkedIn"], ["website_click", "Web"],
    ["vcard_download", "VCF"], ["share_click", "Compartir"], ["copy_link", "Copiar enlace"],
  ];
  const total = count(events, event => ENGAGEMENT_EVENT_TYPES.includes(event.eventType));
  return definitions.map(([key, label]) => {const value = count(events, event => event.eventType === key);return {key, label, value, percentage: percentage(value, total)}});
}

export function buildSourceDistribution(events) {
  const views = events.filter(event => event.eventType === "card_view");
  const definitions = [["qr", "QR"], ["shared_link", "Enlace compartido"], ["copied_link", "Copiado"], ["direct", "Directo"], ["other", "Otros"]];
  return definitions.map(([key, label]) => {
    const value = key === "other" ? count(views, event => !["qr", "shared_link", "copied_link", "direct"].includes(event.source)) : count(views, event => event.source === key);
    return {key, label, value, percentage: percentage(value, views.length)};
  });
}

export function buildDeviceDistribution(events) {
  const views = events.filter(event => event.eventType === "card_view");
  return ["mobile", "tablet", "desktop", "unknown"].map(key => {
    const value = count(views, event => event.deviceType === key);
    return {key, label: DEVICE_LABELS[key], value, percentage: percentage(value, views.length)};
  });
}

const csvCell = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

export function buildAnalyticsCsv(events, cards) {
  const rows = buildCardRanking(events, cards, {limit: 0});
  const headers = ["cardId", "employee", "jobTitle", "department", "views", "uniqueSessions", "qrOpens", "phoneClicks", "emailClicks", "linkedinClicks", "websiteClicks", "vcardDownloads", "shares", "copyLinks", "interactionRate"];
  return [headers, ...rows.map(row => [
    row.cardId,
    `${row.card.firstName || ""} ${row.card.lastName || ""}`.trim(),
    row.card.jobTitle || "",
    row.card.department || "",
    row.views,
    row.uniqueSessions,
    row.qr,
    row.clicks.phone_click,
    row.clicks.email_click,
    row.clicks.linkedin_click,
    row.clicks.website_click,
    row.vcard,
    row.shares,
    row.copyLinks,
    row.interactionRate,
  ])].map(row => row.map(csvCell).join(",")).join("\r\n");
}
