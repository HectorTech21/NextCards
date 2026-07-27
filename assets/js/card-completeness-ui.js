import {COMPLETENESS_LEVELS} from "./card-completeness.js?v=1.9.0";

const photoVerificationCache = new Map();

const node = (tag, className = "", text = "") => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== "") element.textContent = text;
  return element;
};

function icon(name, className = "") {
  const holder = node("span", className);
  const slot = node("span");
  slot.dataset.icon = name;
  holder.append(slot);
  return holder;
}

export function getPhotoVerificationStatuses() {
  return photoVerificationCache;
}

export function reportPhotoVerification(reference, valid) {
  const key = String(reference || "").trim();
  if (!key) return false;
  const status = valid === true || valid === "valid" ? "valid" : "broken";
  if (photoVerificationCache.get(key) === status) return false;
  photoVerificationCache.set(key, status);
  return true;
}

export function completenessAriaLabel(result) {
  return `Completitud de la tarjeta: ${result.score} %, ${result.label.toLocaleLowerCase("es")}`;
}

export function createCompletenessProgress(result, {compact = false} = {}) {
  const track = node("span", `completeness-progress${compact ? " is-compact" : ""}`);
  const fill = node("span", "completeness-progress-fill");
  fill.style.width = `${result.score}%`;
  track.dataset.level = result.level;
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", completenessAriaLabel(result));
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(result.score));
  track.append(fill);
  return track;
}

export function createCompletenessIndicator(result, {
  cardId = "",
  interactive = false,
  compact = false,
  showLabel = true,
} = {}) {
  const indicator = node(interactive ? "button" : "div", `completeness-indicator${compact ? " is-compact" : ""}`);
  if (interactive) {
    indicator.type = "button";
    indicator.dataset.action = "quick-view";
    indicator.dataset.id = cardId;
  }
  indicator.dataset.level = result.level;
  indicator.setAttribute("aria-label", `${completenessAriaLabel(result)}. ${result.description}`);
  indicator.title = `${result.score} % · ${result.label}. ${result.description}`;
  const heading = node("span", "completeness-indicator-heading");
  heading.append(icon(COMPLETENESS_LEVELS[result.level]?.icon || "chart", "completeness-indicator-icon"), node("strong", "", `${result.score} %`));
  if (showLabel) heading.append(node("span", "completeness-indicator-label", result.label));
  indicator.append(heading, createCompletenessProgress(result, {compact: true}));
  return indicator;
}

function issueIcon(issue, kind) {
  if (kind === "completed") return "check";
  if (issue.blocking || issue.severity === "error") return "bell";
  if (issue.severity === "required") return "lock";
  if (kind === "warning") return "bell";
  return "plus";
}

function createIssue(issue, kind, {interactive = false} = {}) {
  const item = node("li", `completeness-issue is-${kind}${issue.blocking ? " is-blocking" : ""}`);
  item.append(icon(issueIcon(issue, kind), "completeness-issue-icon"));
  const copy = node("span", "completeness-issue-copy");
  copy.append(node("strong", "", issue.label));
  copy.append(node("small", "", issue.message || (kind === "completed" ? "Completado." : "Pendiente de completar.")));
  item.append(copy);
  if (interactive && issue.target && kind !== "completed") {
    const action = node("button", "completeness-issue-action", issue.action || "Revisar");
    action.type = "button";
    action.dataset.completenessTarget = issue.target;
    action.setAttribute("aria-label", `${issue.action || "Revisar"}: ${issue.label}`);
    item.append(action);
  }
  return item;
}

function createIssueGroup(title, issues, kind, options) {
  if (!issues.length) return null;
  const section = node("section", `completeness-issue-group is-${kind}`);
  section.append(node("h4", "", `${title} · ${issues.length}`));
  const list = node("ul");
  issues.forEach(issue => list.append(createIssue(issue, kind, options)));
  section.append(list);
  return section;
}

export function renderCompletenessDetails(container, result, {
  interactive = false,
  showCompleted = true,
  heading = "Completitud de la tarjeta",
} = {}) {
  if (!container) return;
  const header = node("div", "completeness-detail-header");
  const score = node("div", "completeness-detail-score");
  score.dataset.level = result.level;
  score.append(icon(COMPLETENESS_LEVELS[result.level]?.icon || "chart"), node("strong", "", `${result.score} %`));
  const copy = node("div", "completeness-detail-copy");
  copy.append(node("h3", "", heading), node("strong", "completeness-detail-level", result.label), node("p", "", result.description));
  header.append(score, copy);

  const progress = createCompletenessProgress(result);
  const progressCopy = node("div", "completeness-progress-copy");
  progressCopy.append(node("span", "", "Progreso"), node("strong", "", `${result.completed.length} criterios completados`));

  const content = node("div", "completeness-detail-content");
  const blockingErrors = result.errors.filter(issue => issue.blocking);
  const otherErrors = result.errors.filter(issue => !issue.blocking);
  const requiredMissing = result.missing.filter(issue => issue.severity === "required");
  const recommendedMissing = result.missing.filter(issue => issue.severity !== "required");
  [
    createIssueGroup("Errores bloqueantes", blockingErrors, "error", {interactive}),
    createIssueGroup("Campos obligatorios pendientes", requiredMissing, "required", {interactive}),
    createIssueGroup("Errores de calidad", otherErrors, "error", {interactive}),
    createIssueGroup("Campos recomendados pendientes", recommendedMissing, "missing", {interactive}),
    createIssueGroup("Advertencias", result.warnings, "warning", {interactive}),
  ].filter(Boolean).forEach(section => content.append(section));

  if (!content.children.length) {
    const complete = node("div", "completeness-all-complete");
    complete.append(icon("check"), node("span", "", "No hay campos pendientes ni errores de calidad."));
    content.append(complete);
  }

  if (showCompleted && result.completed.length) {
    const completed = node("details", "completeness-completed");
    const summary = node("summary", "", `Campos completados · ${result.completed.length}`);
    const list = node("ul");
    result.completed.forEach(issue => list.append(createIssue(issue, "completed")));
    completed.append(summary, list);
    content.append(completed);
  }

  container.dataset.level = result.level;
  container.setAttribute("aria-label", completenessAriaLabel(result));
  container.replaceChildren(header, progressCopy, progress, content);
}

function summaryItem(value, label, level, filter = "") {
  const item = node(filter ? "button" : "div", "completeness-summary-item");
  if (filter) {
    item.type = "button";
    item.dataset.qualitySummaryFilter = filter;
    item.setAttribute("aria-label", `Filtrar: ${label}, ${value}`);
  }
  item.dataset.level = level;
  item.append(node("strong", "", String(value)), node("span", "", label));
  return item;
}

export function renderCompletenessSummary(container, summary) {
  if (!container) return;
  const copy = node("div", "completeness-summary-copy");
  copy.append(node("span", "eyebrow", "Calidad del directorio"), node("h2", "", `${summary.average} % de media`), node("p", "", "Selecciona un estado para filtrar las tarjetas."));
  const items = node("div", "completeness-summary-items");
  items.append(
    summaryItem(summary.levels.complete, "Completas", "complete", "complete"),
    summaryItem(summary.levels["almost-complete"], "Casi completas", "almost-complete", "almost-complete"),
    summaryItem(summary.levels.incomplete + summary.levels["very-incomplete"], "Incompletas", "incomplete", "incomplete"),
    summaryItem(summary.needsReview, "Necesitan revisión", "needs-review", "needs-review"),
  );
  container.replaceChildren(copy, items);
}

function analyticsMetric(value, label, suffix = "") {
  const item = node("div", "completeness-analytics-metric");
  item.append(node("strong", "", `${value}${suffix}`), node("span", "", label));
  return item;
}

export function renderCompletenessAnalytics(container, summary) {
  if (!container) return;
  const heading = node("header", "completeness-analytics-heading");
  const copy = node("div");
  copy.append(node("span", "eyebrow", "Calidad de las tarjetas"), node("h2", "", "Completitud del directorio"), node("p", "", "Indicadores administrativos calculados sobre los datos actuales."));
  const average = node("div", "completeness-analytics-average");
  average.append(node("strong", "", `${summary.average} %`), node("span", "", "Completitud media"));
  heading.append(copy, average);

  const metrics = node("div", "completeness-analytics-metrics");
  metrics.append(
    analyticsMetric(summary.complete, "Tarjetas completas"),
    analyticsMetric(summary.incomplete, "Tarjetas incompletas"),
    analyticsMetric(summary.needsReview, "Necesitan revisión"),
    analyticsMetric(summary.withPhoto, "Con fotografía", " %"),
    analyticsMetric(summary.withLinkedIn, "Con LinkedIn", " %"),
    analyticsMetric(summary.withPhone, "Con teléfono", " %"),
  );

  const missing = node("div", "completeness-analytics-missing");
  missing.append(node("h3", "", "Principales campos ausentes"));
  if (!summary.topMissing.length) missing.append(node("p", "completeness-empty-copy", "No hay campos pendientes con los criterios actuales."));
  else {
    const list = node("ol");
    summary.topMissing.slice(0, 5).forEach(item => {
      const row = node("li");
      row.append(node("span", "", item.label), node("strong", "", String(item.count)));
      list.append(row);
    });
    missing.append(list);
  }
  container.replaceChildren(heading, metrics, missing);
}
