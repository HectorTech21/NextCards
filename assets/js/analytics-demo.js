import {analyticsRepository} from "./analytics-store.js";

const DEMO_SEED = 20260717;
const pad = value => String(value).padStart(2, "0");
const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function chooseSource(random) {
  const value = random();
  if (value < .29) return "qr";
  if (value < .5) return "shared_link";
  if (value < .63) return "copied_link";
  if (value < .96) return "direct";
  return "unknown";
}

function chooseDevice(random) {
  const value = random();
  if (value < .58) return "mobile";
  if (value < .72) return "tablet";
  if (value < .97) return "desktop";
  return "unknown";
}

export function buildAnalyticsDemoData(cards, {now = new Date(), days = 90, seed = DEMO_SEED} = {}) {
  const availableCards = (cards || []).filter(card => card?.id);
  if (!availableCards.length) return [];
  const random = randomGenerator(seed);
  const events = [];
  let eventIndex = 0;
  const pushEvent = (eventType, card, context, timestamp) => events.push({
    id: `demo-${seed}-${eventIndex++}`,
    eventType,
    cardId: card.id,
    employeeId: null,
    templateId: card.template || "corporate-navy",
    source: context.source,
    deviceType: context.deviceType,
    referrerType: context.source === "shared_link" ? "external" : "none",
    sessionId: context.sessionId,
    timestamp: new Date(timestamp).toISOString(),
    isDemo: true,
    metadata: {demoSeed: `nextcards-demo-${seed}`},
  });

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let daysAgo = days - 1; daysAgo >= 0; daysAgo -= 1) {
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    const weekdayFactor = [0, 6].includes(day.getDay()) ? .55 : 1;
    const visits = Math.max(1, Math.round((2 + Math.floor(random() * 4)) * weekdayFactor));
    const sessionPool = [];
    for (let visit = 0; visit < visits; visit += 1) {
      const cardIndex = Math.min(availableCards.length - 1, Math.floor(Math.pow(random(), 1.42) * availableCards.length));
      const card = availableCards[cardIndex];
      const source = chooseSource(random);
      const deviceType = chooseDevice(random);
      const useExistingSession = sessionPool.length && random() < .17;
      const sessionId = useExistingSession ? sessionPool[Math.floor(random() * sessionPool.length)] : `demo-session-${dateKey(day)}-${visit}-${Math.floor(random() * 10000)}`;
      if (!useExistingSession) sessionPool.push(sessionId);
      const timestamp = new Date(day);
      timestamp.setHours(8 + Math.floor(random() * 14), Math.floor(random() * 60), Math.floor(random() * 60), 0);
      const context = {source, deviceType, sessionId};
      pushEvent("card_view", card, context, timestamp);
      if (source === "qr") pushEvent("qr_open", card, context, timestamp.getTime() + 120);

      const interactionPool = ["vcard_download", "share_click", "copy_link"];
      if (card.phone) interactionPool.push("phone_click");
      if (card.email) interactionPool.push("email_click");
      if (card.linkedin) interactionPool.push("linkedin_click");
      if (card.website) interactionPool.push("website_click");
      const interactionCount = random() < .48 ? 1 + (random() < .18 ? 1 : 0) : 0;
      for (let interaction = 0; interaction < interactionCount; interaction += 1) {
        const type = interactionPool[Math.floor(random() * interactionPool.length)];
        pushEvent(type, card, context, timestamp.getTime() + 20000 + interaction * 17000 + Math.floor(random() * 8000));
      }
    }
  }
  return events.sort((first, second) => first.timestamp.localeCompare(second.timestamp));
}

export function generateAnalyticsDemoData(cards, repository = analyticsRepository, options = {}) {
  const events = buildAnalyticsDemoData(cards, options);
  const result = repository.replaceDemoEvents(events);
  return {...result, generated: events.length, events};
}
