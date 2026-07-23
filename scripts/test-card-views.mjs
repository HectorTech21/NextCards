import assert from "node:assert/strict";
import fs from "node:fs";

const memory = new Map();
const localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
};

const {
  CARDS_VIEW_STORAGE_KEY,
  DEFAULT_LIST_SORT,
  normalizeCardsViewMode,
  normalizeListSort,
  readCardsViewMode,
  sortCardsForList,
  writeCardsViewMode,
} = await import("../assets/js/cards-view.js");

assert.equal(normalizeCardsViewMode("grid"), "grid");
assert.equal(normalizeCardsViewMode("list"), "list");
assert.equal(normalizeCardsViewMode("cards"), "grid");
assert.equal(readCardsViewMode(localStorage), "grid");
assert.equal(writeCardsViewMode("list", localStorage), "list");
assert.equal(memory.get(CARDS_VIEW_STORAGE_KEY), "list");
assert.equal(readCardsViewMode(localStorage), "list");
memory.set(CARDS_VIEW_STORAGE_KEY, "invalid");
assert.equal(readCardsViewMode(localStorage), "grid");
assert.equal(memory.get(CARDS_VIEW_STORAGE_KEY), "grid");

assert.deepEqual(normalizeListSort({key: "department", direction: "desc"}), {key: "department", direction: "desc"});
assert.deepEqual(normalizeListSort({key: "email", direction: "sideways"}), DEFAULT_LIST_SORT);

const cards = [
  {id: "3", firstName: "Álvaro", lastName: "Zuluaga", jobTitle: "CEO", department: "Dirección", status: "active", updatedAt: "2026-07-22T09:00:00Z"},
  {id: "2", firstName: "Beatriz", lastName: "Alonso", jobTitle: "Analista", department: "IT", status: "disabled", updatedAt: ""},
  {id: "1", firstName: "Ana", lastName: "Martín", jobTitle: "CFO", department: "Finanzas", status: "draft", updatedAt: "2026-07-20T09:00:00Z"},
];
const names = card => `${card.firstName} ${card.lastName}`;
assert.deepEqual(sortCardsForList(cards, {key: "name", direction: "asc"}, {getName: names}).map(card => card.id), ["3", "1", "2"]);
assert.deepEqual(sortCardsForList(cards, {key: "jobTitle", direction: "desc"}, {getName: names}).map(card => card.id), ["1", "3", "2"]);
assert.deepEqual(sortCardsForList(cards, {key: "department", direction: "asc"}, {getName: names}).map(card => card.id), ["3", "1", "2"]);
assert.deepEqual(sortCardsForList(cards, {key: "status", direction: "asc"}, {getName: names}).map(card => card.id), ["3", "1", "2"]);
assert.deepEqual(sortCardsForList(cards, {key: "updatedAt", direction: "desc"}, {getName: names}).map(card => card.id), ["3", "1", "2"]);
assert.deepEqual(cards.map(card => card.id), ["3", "2", "1"], "La ordenación no debe mutar la fuente de datos.");

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../assets/js/app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../assets/css/dashboard.css", import.meta.url), "utf8");

assert.match(index, /id="cards-view-grid"[\s\S]*aria-pressed="true"/);
assert.match(index, /id="cards-view-list"[\s\S]*aria-pressed="false"/);
assert.match(index, /role="group"[^>]*aria-label="Modo de visualización"/);
assert.match(app, /cardService\.query\(\{search:search\.value,department:department\.value,status:statusFilter\.value\}\)/);
assert.match(app, /createCardsList/);
assert.match(app, /createPhotoFrameImage\(card\.photo/);
assert.match(app, /aria-sort/);
assert.match(css, /\.cards-list-table/);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(css, /td\.cards-list-department,[\s\S]*td\.cards-list-updated\{display:none\}/);
assert.match(css, /body\[data-density=compact\] \.cards-list-table/);
assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);

console.log("OK: selector cuadrícula/lista, persistencia segura, ordenación no destructiva, semántica y responsive verificados.");
