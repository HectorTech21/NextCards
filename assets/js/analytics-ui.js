import {cardService} from "./cards.js?v=1.2.0";
import {
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_MAX_EVENTS,
  ANALYTICS_SCHEMA_VERSION,
  analyticsRepository,
} from "./analytics-store.js";
import {
  EVENT_LABELS,
  buildAnalyticsCsv,
  buildCardRanking,
  buildDeviceDistribution,
  buildInteractionDistribution,
  buildSourceDistribution,
  buildTimeSeries,
  filterAnalyticsEvents,
  getAnalyticsMetrics,
  getCardAnalytics,
  resolveDateRange,
} from "./analytics-aggregate.js";
import {generateAnalyticsDemoData} from "./analytics-demo.js";
import {getSourcedPublicCardUrl} from "./card-export.js";
import {templateService} from "./templates-store.js";
import {formatPersonName,settingsService} from "./settings-store.js?v=1.2.0";

const SVG_NS = "http://www.w3.org/2000/svg";
const SERIES = Object.freeze({
  views: {label: "Vistas", color: "#000029", dash: ""},
  qr: {label: "QR", color: "#fa3c0f", dash: "8 5"},
  interactions: {label: "Interacciones", color: "#3791f5", dash: "3 5"},
  vcard: {label: "VCF", color: "#8e5bc7", dash: "12 5 3 5"},
});
const METRIC_ICONS = Object.freeze({views: "eye", sessions: "users", qr: "qr", vcard: "download", contacts: "phone", shares: "share"});
const STATUS_LABELS = Object.freeze({active: "Activa", draft: "Borrador", disabled: "Desactivada", unknown: "No disponible"});

const state = {
  initialized: false,
  showToast: () => {},
  renderIcons: () => {},
  openCardEditor: () => {},
  showAllRanking: false,
  activeSeries: new Set(Object.keys(SERIES)),
  cards: [],
  rawEvents: [],
  filteredEvents: [],
  filters: null,
  range: null,
  detailCardId: "",
  previousFocus: null,
};

const byId = id => document.getElementById(id);
const create = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
};
const svgElement = (tag, attributes = {}) => {
  const element = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
  return element;
};
const fullName = card => formatPersonName(card, settingsService.getSettings()) || "Tarjeta eliminada";
const initials = card => `${card?.firstName?.[0] || ""}${card?.lastName?.[0] || ""}`.toUpperCase() || "?";
const number = value => new Intl.NumberFormat("es-ES").format(value || 0);
const dateTime = value => value ? new Intl.DateTimeFormat("es-ES", {dateStyle: "medium", timeStyle: "short", timeZone: settingsService.getSettings().general.timezone}).format(new Date(value)) : "Sin interacciones";
const todayKey = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: settingsService.getSettings().general.timezone, year: "numeric", month: "2-digit", day: "2-digit"}).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

function downloadFile(content, filename, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const textarea = create("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("No se pudo copiar el enlace.");
}

function setSelectOptions(select, options, defaultLabel) {
  const selected = select.value;
  select.replaceChildren();
  if (defaultLabel) {
    const option = create("option", "", defaultLabel);
    option.value = "";
    select.append(option);
  }
  options.forEach(({value, label}) => {
    const option = create("option", "", label);
    option.value = value;
    select.append(option);
  });
  if ([...select.options].some(option => option.value === selected)) select.value = selected;
}

function refreshFilterOptions() {
  const cards = cardService.all();
  const cardOptions = [...cards]
    .sort((first, second) => fullName(first).localeCompare(fullName(second), "es") || (first.jobTitle || "").localeCompare(second.jobTitle || "", "es"))
    .map(card => ({value: card.id, label: `${fullName(card)} — ${card.jobTitle || card.cardName || "Sin cargo"}`}));
  setSelectOptions(byId("analytics-card-filter"), cardOptions, "Todas las tarjetas");
  const departments = [...new Set(cards.map(card => card.department).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  setSelectOptions(byId("analytics-department-filter"), departments.map(value => ({value, label: value})), "Todos los departamentos");

  const eventSelect = byId("analytics-event-filter");
  if (eventSelect.options.length <= 1) {
    ANALYTICS_EVENT_TYPES.forEach(value => {
      const option = create("option", "", EVENT_LABELS[value] || value);
      option.value = value;
      eventSelect.append(option);
    });
  }
}

function getFilters() {
  const period = byId("analytics-period").value;
  const from = byId("analytics-date-from").value;
  const to = byId("analytics-date-to").value;
  const resolved = resolveDateRange(period, {from, to});
  return {
    period,
    from,
    to,
    resolved,
    cardId: byId("analytics-card-filter").value,
    department: byId("analytics-department-filter").value,
    eventType: byId("analytics-event-filter").value,
    source: byId("analytics-source-filter").value,
    dataMode: byId("analytics-data-mode").value,
    includePreviews: byId("analytics-source-filter").value === "preview",
  };
}

function setModeBadge(status, mode, error) {
  const badge = byId("analytics-mode-badge");
  badge.className = "analytics-mode-badge";
  if (error) {
    badge.classList.add("error");
    badge.textContent = "Error de lectura local";
    return;
  }
  const count = mode === "demo" ? status.demoCount : status.realCount;
  if (!count) {
    badge.classList.add("empty");
    badge.textContent = mode === "demo" ? "Modo demostración · sin datos" : "Datos locales de este navegador · sin datos";
    return;
  }
  if (mode === "demo") badge.classList.add("demo");
  badge.textContent = `${mode === "demo" ? "Modo demostración" : "Datos locales de este navegador"} · ${number(count)} eventos`;
}

function renderMetrics(currentEvents, previousEvents) {
  const root = byId("analytics-metrics");
  root.replaceChildren();
  getAnalyticsMetrics(currentEvents, previousEvents).forEach(metric => {
    const article = create("article", "analytics-metric");
    const icon = create("span", "analytics-metric-icon");
    const iconSlot = create("span");
    iconSlot.dataset.icon = METRIC_ICONS[metric.key];
    icon.append(iconSlot);
    const main = create("div", "analytics-metric-main");
    main.append(create("strong", "analytics-metric-value", number(metric.value)));
    const label = create("span", "analytics-metric-label", metric.label);
    const help = create("button", "analytics-metric-help", "?");
    help.type = "button";
    help.title = metric.description;
    help.setAttribute("aria-label", `${metric.label}: ${metric.description}`);
    label.append(help);
    main.append(label);
    const trend = create("span", "analytics-metric-trend");
    if (metric.variation === null) trend.textContent = "Sin datos comparables";
    else {
      trend.classList.add(metric.variation > 0 ? "positive" : metric.variation < 0 ? "negative" : "neutral");
      const sign = metric.variation > 0 ? "+" : "";
      trend.textContent = `${sign}${metric.variation.toLocaleString("es-ES")}% frente al periodo anterior`;
    }
    article.append(icon, main, trend);
    root.append(article);
  });
  state.renderIcons(root);
}

function renderChartTable(buckets) {
  const body = byId("analytics-chart-table");
  body.replaceChildren();
  buckets.forEach(bucket => {
    const row = create("tr");
    [bucket.label, bucket.views, bucket.qr, bucket.interactions, bucket.vcard].forEach(value => row.append(create("td", "", String(value))));
    body.append(row);
  });
}

function renderChart(events, filters) {
  const {granularity, buckets} = buildTimeSeries(events, {period: filters.period, range: filters.resolved.current});
  const chart = byId("analytics-chart");
  const tooltip = byId("analytics-chart-tooltip");
  const subtitle = byId("analytics-chart-subtitle");
  const granularityLabels = {hour: "horaria", day: "diaria", month: "mensual"};
  subtitle.textContent = `Agrupación ${granularityLabels[granularity]} para el periodo seleccionado.`;
  renderChartTable(buckets);

  const width = 900;
  const height = 320;
  const plot = {left: 54, right: 22, top: 20, bottom: 43};
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const keys = [...state.activeSeries];
  const highest = Math.max(1, ...buckets.flatMap(bucket => keys.map(key => bucket[key] || 0)));
  const svg = svgElement("svg", {viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: "none", "aria-hidden": "true"});

  for (let step = 0; step <= 4; step += 1) {
    const y = plot.top + (plotHeight * step / 4);
    svg.append(svgElement("line", {x1: plot.left, y1: y, x2: width - plot.right, y2: y, class: "grid-line"}));
    const label = svgElement("text", {x: plot.left - 10, y: y + 4, class: "axis-label", "text-anchor": "end"});
    label.textContent = String(Math.round(highest * (1 - step / 4)));
    svg.append(label);
  }

  if (!keys.length) {
    const message = svgElement("text", {x: width / 2, y: height / 2, class: "axis-label", "text-anchor": "middle"});
    message.textContent = "Selecciona al menos una serie";
    svg.append(message);
  }

  const point = (bucket, index, key) => ({
    x: plot.left + (buckets.length <= 1 ? plotWidth / 2 : plotWidth * index / (buckets.length - 1)),
    y: plot.top + plotHeight - ((bucket[key] || 0) / highest) * plotHeight,
  });
  keys.forEach(key => {
    const definition = SERIES[key];
    if (!definition) return;
    const points = buckets.map((bucket, index) => point(bucket, index, key));
    if (points.length > 1) {
      const path = svgElement("path", {d: points.map((item, index) => `${index ? "L" : "M"}${item.x},${item.y}`).join(" "), class: "series-line", stroke: definition.color});
      if (definition.dash) path.setAttribute("stroke-dasharray", definition.dash);
      svg.append(path);
    }
    if (points.length <= 45) points.forEach(item => svg.append(svgElement("circle", {cx: item.x, cy: item.y, r: 3.5, fill: definition.color, class: "series-dot"})));
  });

  const labelCount = Math.min(6, buckets.length);
  const labelIndexes = new Set();
  for (let index = 0; index < labelCount; index += 1) labelIndexes.add(Math.round(index * (buckets.length - 1) / Math.max(1, labelCount - 1)));
  labelIndexes.forEach(index => {
    const item = point(buckets[index], index, "views");
    const label = svgElement("text", {x: item.x, y: height - 15, class: "axis-label", "text-anchor": "middle"});
    label.textContent = buckets[index].label;
    svg.append(label);
  });

  const summary = keys.map(key => `${SERIES[key].label}: ${buckets.reduce((total, bucket) => total + bucket[key], 0)}`).join("; ");
  chart.setAttribute("aria-label", `Gráfico de evolución. ${summary || "Sin series visibles"}.`);
  chart.replaceChildren(svg);

  svg.addEventListener("pointermove", event => {
    if (!buckets.length || !keys.length) return;
    const bounds = svg.getBoundingClientRect();
    const relativeX = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const chartX = relativeX * width;
    const index = Math.max(0, Math.min(buckets.length - 1, Math.round((chartX - plot.left) / plotWidth * Math.max(1, buckets.length - 1))));
    const bucket = buckets[index];
    tooltip.replaceChildren(create("strong", "", bucket.label));
    keys.forEach(key => tooltip.append(create("span", "", `${SERIES[key].label}: ${number(bucket[key])}`)));
    tooltip.hidden = false;
    const localX = event.clientX - chart.getBoundingClientRect().left;
    tooltip.style.left = `${Math.max(8, Math.min(chart.clientWidth - 165, localX + 12))}px`;
    tooltip.style.top = `${Math.max(8, event.clientY - chart.getBoundingClientRect().top - 35)}px`;
  });
  svg.addEventListener("pointerleave", () => { tooltip.hidden = true; });
}

function makePerson(card, cardId) {
  const person = create("div", "analytics-rank-person");
  if (card.photo) {
    const photo = create("img");
    photo.src = card.photo;
    photo.alt = "";
    photo.loading = "lazy";
    photo.decoding = "async";
    photo.style.objectPosition = card.photoPosition || "center";
    photo.addEventListener("error", () => photo.replaceWith(create("span", "analytics-rank-avatar", initials(card))), {once: true});
    person.append(photo);
  } else person.append(create("span", "analytics-rank-avatar", initials(card)));
  const button = create("button");
  button.type = "button";
  button.dataset.statsCard = cardId;
  button.setAttribute("aria-label", `Ver estadísticas de ${fullName(card)}, ${card.jobTitle || "sin cargo"}`);
  button.append(create("strong", "", fullName(card)), create("small", "", `${card.jobTitle || "Sin cargo"}${card.cardName ? ` · ${card.cardName}` : ""}`));
  person.append(button);
  return person;
}

function renderRanking(events, cards) {
  const sortBy = byId("analytics-ranking-sort").value;
  const fullRanking = buildCardRanking(events, cards, {sortBy, limit: 0});
  const ranking = state.showAllRanking ? fullRanking : fullRanking.slice(0, 10);
  const body = byId("analytics-ranking-body");
  const mobile = byId("analytics-ranking-cards");
  const empty = byId("analytics-ranking-empty");
  const allButton = byId("analytics-ranking-all");
  body.replaceChildren();
  mobile.replaceChildren();
  empty.hidden = Boolean(ranking.length);
  allButton.hidden = fullRanking.length <= 10;
  allButton.textContent = state.showAllRanking ? "Ver las 10 primeras" : `Ver todas (${fullRanking.length})`;

  ranking.forEach((entry, index) => {
    const position = index + 1;
    const row = create("tr");
    row.append(create("td", "rank-position", String(position)));
    const personCell = create("td");
    personCell.append(makePerson(entry.card, entry.cardId));
    row.append(personCell, create("td", "", entry.card.department || "—"));
    [entry.views, entry.qr, entry.interactions, entry.vcard].forEach(value => row.append(create("td", "", number(value))));
    row.append(create("td", "analytics-rate", `${entry.interactionRate.toLocaleString("es-ES")}%`));
    body.append(row);

    const card = create("article", "analytics-ranking-card");
    const top = create("div", "analytics-ranking-card-top");
    top.append(create("span", "rank-position", `#${position}`), makePerson(entry.card, entry.cardId));
    const metrics = create("div", "analytics-ranking-card-metrics");
    [["Vistas", entry.views], ["QR", entry.qr], ["Acciones", entry.interactions], ["Tasa", `${entry.interactionRate.toLocaleString("es-ES")}%`]].forEach(([label, value]) => {
      const metric = create("span", "", label);
      metric.prepend(create("strong", "", String(value)));
      metrics.append(metric);
    });
    card.append(top, metrics);
    mobile.append(card);
  });
}

function renderBars(rootId, items) {
  const root = byId(rootId);
  root.replaceChildren();
  items.forEach(item => {
    const bar = create("div", "analytics-bar");
    const heading = create("div", "analytics-bar-heading");
    heading.append(create("strong", "", item.label), create("span", "", `${number(item.value)} · ${item.percentage.toLocaleString("es-ES")}%`));
    const track = create("div", "analytics-bar-track");
    const fill = create("span", "analytics-bar-fill");
    fill.style.width = `${Math.max(0, Math.min(100, item.percentage))}%`;
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", item.label);
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", String(item.percentage));
    track.append(fill);
    bar.append(heading, track);
    root.append(bar);
  });
}

function setContentVisibility(visible) {
  byId("analytics-metrics").hidden = false;
  document.querySelector("#stats-view .analytics-chart-panel").hidden = !visible;
  document.querySelector("#stats-view .analytics-ranking-panel").hidden = !visible;
  document.querySelector("#stats-view .analytics-distribution-grid").hidden = !visible;
}

export function renderAnalyticsSection() {
  if (!state.initialized) return;
  refreshFilterOptions();
  state.cards = cardService.all();
  const read = analyticsRepository.read();
  state.rawEvents = read.events;
  const status = analyticsRepository.getStatus();
  const filters = getFilters();
  state.filters = filters;
  state.range = filters.resolved.current;
  const error = read.error || status.error;
  byId("analytics-error").hidden = !error;
  byId("analytics-capacity").hidden = !status.atCapacity;
  setModeBadge(status, filters.dataMode, error);

  const demoOption = [...byId("analytics-data-mode").options].find(option => option.value === "demo");
  if (demoOption) demoOption.textContent = status.demoCount ? `Demostración (${number(status.demoCount)} eventos)` : "Demostración (sin cargar)";
  byId("analytics-custom-dates").hidden = filters.period !== "custom";

  if (!filters.resolved.valid) {
    state.filteredEvents = [];
    byId("analytics-empty").hidden = true;
    byId("analytics-no-results").hidden = false;
    byId("analytics-no-results").querySelector("p").textContent = "El rango personalizado no es válido. Revisa las fechas de inicio y fin.";
    renderMetrics([], null);
    setContentVisibility(false);
    return;
  }

  const baseFilters = {...filters, range: filters.resolved.current};
  const currentEvents = filterAnalyticsEvents(state.rawEvents, baseFilters, state.cards);
  const previousEvents = filters.resolved.previous
    ? filterAnalyticsEvents(state.rawEvents, {...baseFilters, range: filters.resolved.previous}, state.cards)
    : null;
  const modeEvents = state.rawEvents.filter(event => filters.dataMode === "demo" ? event.isDemo : !event.isDemo);
  state.filteredEvents = currentEvents;

  const emptyMode = !modeEvents.length || Boolean(error);
  const noResults = !emptyMode && !currentEvents.length;
  byId("analytics-empty").hidden = !emptyMode;
  byId("analytics-no-results").hidden = !noResults;
  byId("analytics-no-results").querySelector("p").textContent = "Prueba otro periodo, tarjeta o tipo de evento.";
  setContentVisibility(!emptyMode && !noResults);
  if (emptyMode || noResults) {
    renderMetrics([], null);
    return;
  }

  renderMetrics(currentEvents, previousEvents);
  renderChart(currentEvents, filters);
  renderRanking(currentEvents, state.cards);
  renderBars("analytics-interaction-bars", buildInteractionDistribution(currentEvents));
  renderBars("analytics-source-bars", buildSourceDistribution(currentEvents));
  renderBars("analytics-device-bars", buildDeviceDistribution(currentEvents));
}

function metricBlock(value, label) {
  const block = create("div", "analytics-detail-stat");
  block.append(create("strong", "", typeof value === "number" ? number(value) : String(value)), create("span", "", label));
  return block;
}

function renderDetail(cardId) {
  const detail = getCardAnalytics(cardId, state.filteredEvents, state.cards);
  const card = detail.card;
  const template = templateService.resolveTemplate(card.template, {warn: false});
  const root = byId("analytics-detail-body");
  root.replaceChildren();

  const profile = create("section", "analytics-detail-profile");
  if (card.photo) {
    const photo = create("img");
    photo.src = card.photo;
    photo.alt = `Foto de ${fullName(card)}`;
    photo.decoding = "async";
    photo.style.objectPosition = card.photoPosition || "center";
    photo.addEventListener("error", () => photo.replaceWith(create("span", "analytics-detail-avatar", initials(card))), {once: true});
    profile.append(photo);
  } else profile.append(create("span", "analytics-detail-avatar", initials(card)));
  const profileText = create("div");
  profileText.append(
    create("h3", "", fullName(card)),
    create("p", "", card.jobTitle || "Sin cargo"),
    create("p", "", `${card.department || "Sin departamento"} · Estado: ${STATUS_LABELS[card.status] || card.status || "No disponible"}`),
    create("p", "", `Tarjeta: ${card.cardName || cardId}`),
    create("p", "", `Slug: ${card.slug || "No disponible"}`),
    create("p", "", `Plantilla: ${template?.name || card.template || "No disponible"}`),
  );
  profile.append(profileText);

  const metrics = create("section", "analytics-detail-grid");
  metrics.append(
    metricBlock(detail.views, "Vistas"),
    metricBlock(detail.uniqueSessions, "Sesiones"),
    metricBlock(detail.qr, "QR"),
    metricBlock(detail.interactions, "Interacciones"),
    metricBlock(detail.vcard, "VCF"),
    metricBlock(detail.shares, "Compartidas"),
    metricBlock(detail.copyLinks, "Copias"),
    metricBlock(`${detail.interactionRate.toLocaleString("es-ES")}%`, "Tasa"),
  );

  const clicks = create("section", "analytics-detail-section");
  clicks.append(create("h3", "", "Clics por canal"));
  const clickGrid = create("div", "analytics-detail-clicks");
  [["Teléfono", detail.clicks.phone_click], ["Email", detail.clicks.email_click], ["LinkedIn", detail.clicks.linkedin_click], ["Web", detail.clicks.website_click]].forEach(([label, value]) => {
    const item = create("div");
    item.append(create("strong", "", number(value)), create("span", "", label));
    clickGrid.append(item);
  });
  clicks.append(clickGrid, create("p", "analytics-detail-note", `Última interacción: ${dateTime(detail.lastInteraction)}`));

  const timelineSection = create("section", "analytics-detail-section");
  timelineSection.append(create("h3", "", "Evolución de vistas"));
  const series = buildTimeSeries(detail.events, {period: state.filters.period, range: state.filters.resolved.current});
  const buckets = series.buckets.slice(-31);
  const highest = Math.max(1, ...buckets.map(bucket => bucket.views));
  const timeline = create("div", "analytics-detail-timeline");
  buckets.forEach(bucket => {
    const bar = create("i");
    bar.style.setProperty("--height", `${Math.max(2, bucket.views / highest * 100)}%`);
    bar.title = `${bucket.label}: ${bucket.views} vistas`;
    timeline.append(bar);
  });
  timelineSection.append(timeline, create("p", "analytics-detail-note", `ID de tarjeta: ${cardId}. El detalle respeta los filtros activos.`));
  root.append(profile, metrics, clicks, timelineSection);
}

function focusableElements(container) {
  return [...container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.offsetParent !== null);
}

function openDetail(cardId) {
  if (!cardId) return;
  state.detailCardId = cardId;
  state.previousFocus = document.activeElement;
  renderDetail(cardId);
  const modal = byId("analytics-detail-modal");
  modal.hidden = false;
  document.body.classList.add("modal-open");
  modal.querySelector(".analytics-detail-dialog").focus();
}

function closeDetail() {
  const modal = byId("analytics-detail-modal");
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  state.detailCardId = "";
  state.previousFocus?.focus?.();
}

function closeMenus(except = null) {
  [["analytics-export-menu", "analytics-export-button"], ["analytics-options-menu", "analytics-options-button"]].forEach(([menuId, buttonId]) => {
    if (menuId === except) return;
    byId(menuId).hidden = true;
    byId(buttonId).setAttribute("aria-expanded", "false");
  });
}

function toggleMenu(menuId, buttonId) {
  const menu = byId(menuId);
  const willOpen = menu.hidden;
  closeMenus(menuId);
  menu.hidden = !willOpen;
  byId(buttonId).setAttribute("aria-expanded", String(willOpen));
}

function resetFilters() {
  byId("analytics-period").value = "30d";
  byId("analytics-date-from").value = "";
  byId("analytics-date-to").value = "";
  byId("analytics-card-filter").value = "";
  byId("analytics-department-filter").value = "";
  byId("analytics-event-filter").value = "all";
  byId("analytics-source-filter").value = "all";
  state.showAllRanking = false;
  renderAnalyticsSection();
}

function exportEventsJson(events, suffix = "estadisticas") {
  const payload = {
    product: "NextCards",
    schemaVersion: ANALYTICS_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    dataMode: state.filters.dataMode,
    period: state.filters.period,
    filters: {
      from: state.filters.from || null,
      to: state.filters.to || null,
      cardId: state.filters.cardId || null,
      department: state.filters.department || null,
      eventType: state.filters.eventType,
      source: state.filters.source,
    },
    events,
  };
  downloadFile(JSON.stringify(payload, null, 2), `nextcards-${suffix}-${todayKey()}.json`, "application/json;charset=utf-8");
}

function handleStatsAction(action) {
  closeMenus();
  if (action === "reset-filters") resetFilters();
  if (action === "export-csv") {
    downloadFile(`\uFEFF${buildAnalyticsCsv(state.filteredEvents, state.cards)}`, `nextcards-estadisticas-${todayKey()}.csv`, "text/csv;charset=utf-8");
    state.showToast("Resumen de estadísticas exportado.");
  }
  if (action === "export-json") {
    exportEventsJson(state.filteredEvents);
    state.showToast("Eventos de estadísticas exportados.");
  }
  if (action === "load-demo") {
    const result = generateAnalyticsDemoData(cardService.all());
    if (!result.saved) return state.showToast("No se pudieron guardar los datos de demostración.", "error");
    byId("analytics-data-mode").value = "demo";
    state.showAllRanking = false;
    renderAnalyticsSection();
    state.showToast(`${number(result.generated)} eventos de demostración cargados.`);
  }
  if (action === "delete-demo") {
    const count = analyticsRepository.getStatus().demoCount;
    if (!count) return state.showToast("No hay datos de demostración que eliminar.", "error");
    if (!confirm(`¿Eliminar ${number(count)} eventos de demostración? La actividad local real se conservará.`)) return;
    analyticsRepository.clearEvents({demoOnly: true});
    if (byId("analytics-data-mode").value === "demo") byId("analytics-data-mode").value = "real";
    renderAnalyticsSection();
    state.showToast("Datos de demostración eliminados.");
  }
  if (action === "clear-analytics") {
    const count = analyticsRepository.getStatus().count;
    if (!count) return state.showToast("No hay actividad local que limpiar.", "error");
    if (!confirm(`¿Limpiar ${number(count)} eventos de analítica de este navegador? Las tarjetas y plantillas no se modificarán.`)) return;
    analyticsRepository.clearEvents();
    byId("analytics-data-mode").value = "real";
    renderAnalyticsSection();
    state.showToast("Analítica local eliminada. Tarjetas y plantillas se han conservado.");
  }
  if (action === "open-first-card") {
    const card = cardService.all().find(item => item.status === "active") || cardService.all()[0];
    if (!card) return state.showToast("No hay ninguna tarjeta disponible.", "error");
    window.open(getSourcedPublicCardUrl(card, "admin_preview"), "_blank", "noopener,noreferrer");
  }
  if (action === "close-detail") closeDetail();
}

async function handleDetailAction(action) {
  const card = cardService.get(state.detailCardId);
  if (!card) return state.showToast("La tarjeta ya no está disponible.", "error");
  if (action === "view") window.open(getSourcedPublicCardUrl(card, "admin_preview"), "_blank", "noopener,noreferrer");
  if (action === "copy") {
    try {
      await copyText(getSourcedPublicCardUrl(card, "copied_link"));
      state.showToast("Enlace de tarjeta copiado.");
    } catch {
      state.showToast("No se pudo copiar el enlace.", "error");
    }
  }
  if (action === "edit") {
    const id = card.id;
    closeDetail();
    state.openCardEditor(id);
  }
  if (action === "export") {
    exportEventsJson(state.filteredEvents.filter(event => event.cardId === card.id), `estadisticas-${card.slug || card.id}`);
    state.showToast("Actividad de la tarjeta exportada.");
  }
}

function handleKeydown(event) {
  const modal = byId("analytics-detail-modal");
  if (event.key === "Escape") {
    closeMenus();
    if (!modal.hidden) closeDetail();
    return;
  }
  if (event.key !== "Tab" || modal.hidden) return;
  const elements = focusableElements(modal);
  if (!elements.length) return;
  const first = elements[0];
  const last = elements.at(-1);
  const dialog = modal.querySelector(".analytics-detail-dialog");
  if (!modal.contains(document.activeElement) || document.activeElement === dialog) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function setupAnalyticsUI({showToast, renderIconElements, openCardEditor} = {}) {
  if (state.initialized) return;
  state.initialized = true;
  state.showToast = showToast || state.showToast;
  state.renderIcons = renderIconElements || state.renderIcons;
  state.openCardEditor = openCardEditor || state.openCardEditor;
  refreshFilterOptions();
  const status = analyticsRepository.getStatus();
  byId("analytics-data-mode").value = !status.realCount && status.demoCount ? "demo" : "real";

  byId("analytics-filters").addEventListener("submit", event => event.preventDefault());
  byId("analytics-filters").addEventListener("change", event => {
    state.showAllRanking = false;
    renderAnalyticsSection();
    if (event.target.id === "analytics-card-filter" && event.target.value) openDetail(event.target.value);
  });
  byId("analytics-ranking-sort").addEventListener("change", () => renderRanking(state.filteredEvents, state.cards));
  byId("analytics-ranking-all").addEventListener("click", () => {
    state.showAllRanking = !state.showAllRanking;
    renderRanking(state.filteredEvents, state.cards);
  });
  byId("analytics-series").addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    if (event.target.checked) state.activeSeries.add(event.target.value);
    else state.activeSeries.delete(event.target.value);
    renderChart(state.filteredEvents, state.filters);
  });
  byId("analytics-filter-toggle").addEventListener("click", event => {
    const open = byId("analytics-filters").classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  byId("analytics-export-button").addEventListener("click", () => toggleMenu("analytics-export-menu", "analytics-export-button"));
  byId("analytics-options-button").addEventListener("click", () => toggleMenu("analytics-options-menu", "analytics-options-button"));

  document.addEventListener("click", event => {
    const cardTrigger = event.target.closest("[data-stats-card]");
    if (cardTrigger) openDetail(cardTrigger.dataset.statsCard);
    const actionTrigger = event.target.closest("[data-stats-action]");
    if (actionTrigger) handleStatsAction(actionTrigger.dataset.statsAction);
    const detailTrigger = event.target.closest("[data-stats-detail-action]");
    if (detailTrigger) handleDetailAction(detailTrigger.dataset.statsDetailAction);
    if (event.target === byId("analytics-detail-modal")) closeDetail();
    if (!event.target.closest(".analytics-menu-wrap")) closeMenus();
  });
  document.addEventListener("keydown", handleKeydown);
  renderAnalyticsSection();
}

export const analyticsUIInternals = Object.freeze({
  SERIES,
  getFilters,
  renderChart,
  renderRanking,
});
