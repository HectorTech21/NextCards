const NS = "http://www.w3.org/2000/svg";

export const ACTION_TYPES = Object.freeze(["contact", "linkedin", "website", "email", "phone", "share", "copy"]);

const TYPE_ALIASES = Object.freeze({save: "contact", mail: "email", web: "website", link: "copy"});
const DEFAULT_LABELS = Object.freeze({
  contact: "Guardar contacto",
  linkedin: "LinkedIn",
  website: "Website",
  email: "Email",
  phone: "Teléfono",
  share: "Compartir",
  copy: "Copiar enlace",
});

const ICONS = Object.freeze({
  contact: {
    paths: ["M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M19 8v6", "M22 11h-6"],
  },
  phone: {
    paths: ["M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z"],
  },
  email: {
    paths: ["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6l-10 7L2 6"],
  },
  share: {
    paths: ["M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6", "M8.6 10.5l6.8-4", "M8.6 13.5l6.8 4"],
  },
  copy: {
    paths: ["M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"],
  },
  linkedin: {
    fill: true,
    paths: ["M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.063 2.063 0 1 1 0-4.126 2.063 2.063 0 0 1 0 4.126zM7.119 20.452H3.554V9h3.565v11.452z"],
  },
  link: {
    paths: ["M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15", "M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15"],
  },
  lock: {paths: ["M5 11h14v10H5z", "M8 11V7a4 4 0 0 1 8 0v4"]},
  check: {paths: ["M20 6 9 17l-5-5"]},
});

const feedbackTimers = new WeakMap();

function visualType(type) {
  const normalized = TYPE_ALIASES[type] || type;
  return ACTION_TYPES.includes(normalized) ? normalized : "copy";
}

function createSvgIcon(name) {
  const definition = ICONS[name] || ICONS.link;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  if (definition.fill) {
    svg.setAttribute("fill", "currentColor");
  } else {
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
  }
  definition.paths.forEach(d => {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  });
  return svg;
}

export function createActionIcon(name) {
  const type = TYPE_ALIASES[name] || name;
  if (type === "website") {
    const image = document.createElement("img");
    image.src = "assets/img/logos/lognext-symbol-positive.svg";
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    return image;
  }
  return createSvgIcon(ICONS[type] ? type : "link");
}

function decorativeMotion(type) {
  const motion = document.createElement("span");
  motion.className = "card-action__motion";
  motion.setAttribute("aria-hidden", "true");
  if (type === "contact" || type === "share") {
    for (let index = 0; index < 3; index += 1) motion.append(document.createElement("i"));
  }
  return motion;
}

export function createActionButton({
  type,
  label,
  href = "",
  target = "",
  ariaLabel = "",
  eventType = "",
  id = "",
  icon = "",
  interactive = true,
  onClick = null,
  disabled = false,
} = {}) {
  const normalizedType = visualType(type);
  const visibleLabel = String(label || DEFAULT_LABELS[normalizedType]);
  const isLink = interactive && Boolean(href);
  const element = document.createElement(isLink ? "a" : "button");
  element.className = `card-action card-action--${normalizedType}`;
  element.dataset.actionType = normalizedType;
  if (id) element.id = id;
  if (isLink) {
    element.href = href;
    const resolvedTarget = target || (["linkedin", "website"].includes(normalizedType) ? "_blank" : "");
    if (resolvedTarget) {
      element.target = resolvedTarget;
      if (resolvedTarget === "_blank") element.rel = "noopener noreferrer";
    }
  } else {
    element.type = "button";
  }
  element.setAttribute("aria-label", ariaLabel || visibleLabel);
  if (eventType) element.dataset.analyticsEvent = eventType;
  if (!interactive) {
    element.dataset.previewAction = normalizedType;
    element.title = `Vista previa: ${visibleLabel}`;
  }
  if (disabled) {
    element.classList.add("is-disabled");
    if (element.tagName === "BUTTON") element.disabled = true;
    else {
      element.setAttribute("aria-disabled", "true");
      element.tabIndex = -1;
      element.addEventListener("click", event => event.preventDefault());
    }
  }

  const shell = document.createElement("span");
  shell.className = "card-action__shell";
  const iconHolder = document.createElement("span");
  iconHolder.className = "card-action__icon";
  iconHolder.append(createActionIcon(icon || normalizedType));
  shell.append(decorativeMotion(normalizedType), iconHolder);

  const labelNode = document.createElement("span");
  labelNode.className = "card-action__label";
  labelNode.textContent = visibleLabel;
  labelNode.dataset.defaultLabel = visibleLabel;
  if (normalizedType === "copy") labelNode.setAttribute("aria-live", "polite");
  element.append(shell, labelNode);

  if (interactive && typeof onClick === "function" && !disabled) {
    element.addEventListener("click", event => onClick(event, element));
  }
  return element;
}

export function renderActionGrid(container, actions = [], {tone = "light", interactive = true} = {}) {
  const fragment = document.createDocumentFragment();
  const rendered = new Map();
  actions.forEach(action => {
    if (!action || action.visible === false) return;
    if (interactive && !action.href && typeof action.onClick !== "function") return;
    const element = createActionButton({...action, interactive});
    fragment.append(element);
    rendered.set(action.id || action.type, element);
  });
  container.classList.add("card-action-grid");
  container.dataset.actionTone = tone === "dark" ? "dark" : "light";
  container.replaceChildren(fragment);
  return rendered;
}

export function setActionFeedback(element, label = "Copiado", duration = 1600) {
  if (!element) return;
  const labelNode = element.querySelector(".card-action__label");
  if (!labelNode) return;
  const previousTimer = feedbackTimers.get(element);
  if (previousTimer) clearTimeout(previousTimer);
  labelNode.textContent = label;
  element.classList.add("is-confirmed");
  const timer = setTimeout(() => {
    labelNode.textContent = labelNode.dataset.defaultLabel || "Copiar enlace";
    element.classList.remove("is-confirmed");
    feedbackTimers.delete(element);
  }, duration);
  feedbackTimers.set(element, timer);
}
