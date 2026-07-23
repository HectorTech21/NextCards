import {storage} from "./storage.js?v=1.6.0";
import {cardService} from "./cards.js?v=1.7.0";
import {setupEditor,openEditor,deleteFromDashboard} from "./editor.js?v=1.7.0";
import {getSourcedPublicCardUrl} from "./card-export.js";
import {copyText} from "./card-sharing.js?v=1.3.1";
import {openQuickView,refreshQuickView,setupQuickView} from "./quick-view.js?v=1.7.0";
import {setupTemplatesUI,renderTemplatesSection} from "./templates-ui.js?v=1.7.0";
import {templateService} from "./templates-store.js?v=1.7.0";
import {setupAnalyticsUI,renderAnalyticsSection} from "./analytics-ui.js?v=1.7.0";
import {applySettingsToDocument,formatPersonName,getDefaultSettings,settingsService} from "./settings-store.js?v=1.6.0";
import {isSettingsDirty,renderSettingsSection,requestSettingsLeave,setupSettingsUI} from "./settings-ui.js?v=1.7.0";
import {createPhotoFrameImage} from "./photo-frame.js?v=1.6.0";
import {clearAllPhotos,pruneUnusedPhotos} from "./photo-storage.js?v=1.6.0";
import {CARDS_VIEW_STORAGE_KEY,DEFAULT_LIST_SORT,readCardsViewMode,sortCardsForList,writeCardsViewMode} from "./cards-view.js?v=1.5.0";

const iconPaths={
  cards:"M4 4h16v16H4z M8 8h8 M8 12h6",people:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  layout:"M3 3h18v18H3z M3 9h18 M9 21V9",chart:"M3 3v18h18 M7 16l4-5 4 3 5-7",settings:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 3.46-.08-.03a1.65 1.65 0 0 0-1.88.24 1.65 1.65 0 0 0-.5 1.25V22h-4v-.1a1.65 1.65 0 0 0-.5-1.25 1.65 1.65 0 0 0-1.88-.24l-.08.03-2-3.46.06-.06A1.65 1.65 0 0 0 7.2 15a1.65 1.65 0 0 0-1.2-.72H6v-4h.1A1.65 1.65 0 0 0 7.2 9a1.65 1.65 0 0 0-.27-1.82l-.06-.06 2-3.46.08.03a1.65 1.65 0 0 0 1.88-.24 1.65 1.65 0 0 0 .5-1.25V2h4v.1a1.65 1.65 0 0 0 .5 1.25 1.65 1.65 0 0 0 1.88.24l.08-.03 2 3.46-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.2.72h.1v4h-.1a1.65 1.65 0 0 0-1.2.72z",
  menu:"M4 6h16 M4 12h16 M4 18h16",search:"M21 21l-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",plus:"M12 5v14 M5 12h14",check:"M20 6 9 17l-5-5",edit:"M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  database:"M12 2c5 0 9 1.8 9 4s-4 4-9 4-9-1.8-9-4 4-4 9-4z M3 6v6c0 2.2 4 4 9 4s9-1.8 9-4V6 M3 12v6c0 2.2 4 4 9 4s9-1.8 9-4v-6",chevron:"M6 9l6 6 6-6",download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",upload:"M17 8l-5-5-5 5 M12 3v12 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",refresh:"M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0 1 14.9-3.36L23 10 M1 14l4.6 4.36A9 9 0 0 0 20.5 15",
  copy:"M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1",more:"M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2",external:"M14 3h7v7 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5",
  arrowLeft:"M19 12H5 M12 19l-7-7 7-7",save:"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",image:"M3 3h18v18H3z M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",user:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",close:"M18 6 6 18 M6 6l12 12",
  eye:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",qr:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M19 14h2v7h-4v-2h-3 M19 19h2",phone:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z",share:"M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98",filter:"M22 3H2l8 9.46V19l4 2v-8.54z",lock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4"
};
Object.assign(iconPaths,{
  gridView:"M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  listView:"M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  sort:"M8 9l4-4 4 4 M12 5v14 M16 15l-4 4-4-4",
  mail:"M4 4h16v16H4z M4 6l8 7 8-7",
  map:"M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  linkedin:"M6 9v12 M6 5v.01 M10 21V9h4v2a4 4 0 0 1 7 3v7 M10 14a5 5 0 0 1 5-5",
  globe:"M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20",
  calendar:"M3 5h18v16H3z M16 3v4 M8 3v4 M3 10h18",
  link:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
});
const aliases={"arrow-left":"arrowLeft"};
function makeIcon(name){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","2");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
  const pathData=iconPaths[aliases[name]||name]||iconPaths.cards;
  pathData.split(" M").forEach((d,i)=>{const path=document.createElementNS(svg.namespaceURI,"path");path.setAttribute("d",i?`M${d}`:d);svg.append(path)});return svg;
}
function renderIcons(root=document){root.querySelectorAll("[data-icon]").forEach(slot=>{if(slot.dataset.rendered)return;slot.append(makeIcon(slot.dataset.icon));slot.dataset.rendered="true"})}
window.NextCardsIcons={render:renderIcons,make:makeIcon};

const grid=document.querySelector("#card-grid"),empty=document.querySelector("#empty-state"),search=document.querySelector("#global-search");
const department=document.querySelector("#department-filter"),statusFilter=document.querySelector("#status-filter"),sidebar=document.querySelector("#sidebar");
const statusLabels={active:"Activa",draft:"Borrador",disabled:"Desactivada"};
const initials=card=>`${card.firstName?.[0]||""}${card.lastName?.[0]||""}`.toUpperCase();
const node=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el};
const readSettings=()=>{try{return settingsService.getSettings()}catch(error){console.warn("Se aplicará una configuración segura.",error);return getDefaultSettings()}};
let currentSection="cards";
let cardsViewMode=readCardsViewMode();
let listSort={...DEFAULT_LIST_SORT};

function applyAppSettings(settings=readSettings()){
  applySettingsToDocument(settings);
  document.title=`${settings.general.appName} · ${settings.general.appSubtitle}`;
}

export function showToast(message,type="success"){
  const toast=node("div",`toast ${type}`);toast.setAttribute("role",type==="error"?"alert":"status");toast.append(makeIcon(type==="error"?"bell":"check"),document.createTextNode(message));document.querySelector("#toast-region").append(toast);
  setTimeout(()=>toast.remove(),3200);
}

function createButton(label,className,action,id,icon){
  const button=node("button",className);button.type="button";button.dataset.action=action;if(id)button.dataset.id=id;if(icon)button.append(makeIcon(icon));if(label)button.append(document.createTextNode(label));return button;
}

function createCardMenu(card,displayName,entries,context){
  const menuButton=createButton("","card-menu-button","toggle-menu",card.id,"more");
  const menu=node("div","card-menu");
  const menuId=`card-menu-${context}-${card.id}`;
  menu.id=menuId;menu.hidden=true;menu.setAttribute("role","menu");
  menuButton.setAttribute("aria-label",`Más acciones para ${displayName}`);
  menuButton.setAttribute("aria-expanded","false");
  menuButton.setAttribute("aria-haspopup","menu");
  menuButton.setAttribute("aria-controls",menuId);
  entries.forEach(([label,action])=>{
    const button=createButton(label,action==="delete"?"danger":"",action,card.id);
    button.setAttribute("role","menuitem");menu.append(button);
  });
  return {menuButton,menu};
}

function createCard(card,settings){
  const displayName=formatPersonName(card,settings);
  const article=node("article","employee-card"),cover=node("div","employee-cover");
  cover.dataset.cardMenuHost="";
  const quickTrigger=createButton("","quick-view-trigger","quick-view",card.id);quickTrigger.setAttribute("aria-label",`Abrir vista rápida de ${displayName}`);quickTrigger.title="Vista rápida";
  const logo=node("img","employee-logo");logo.src="assets/img/logos/lognext-negative.svg";logo.alt="";logo.decoding="async";logo.addEventListener("error",()=>logo.remove(),{once:true});
  const {menuButton,menu}=createCardMenu(card,displayName,[["Vista rápida","quick-view"],["Cambiar plantilla","template"],["Duplicar","duplicate"],[card.status==="disabled"?"Reactivar":"Desactivar","disable"],["Eliminar","delete"]],"grid");
  cover.append(quickTrigger,logo,menuButton,menu);
  if(card.photo&&card.visibleFields?.photo!==false){const frame=node("div","employee-photo");const img=createPhotoFrameImage(card.photo,{alt:`Foto de ${displayName}`,frame:card.photoFrame,legacyPosition:card.photoPosition,loading:"lazy",onError:()=>frame.replaceWith(node("div","employee-initials",initials(card)))});frame.append(img);cover.append(frame)}else cover.append(node("div","employee-initials",initials(card)));
  const info=node("div","employee-info"),top=node("div","employee-info-top");
  top.append(node("span",`status status-${card.status}`,statusLabels[card.status]||card.status));
  const template=templateService.resolveTemplate(card.template,{warn:false});
  info.append(top,node("h3","",displayName),node("p","role",card.jobTitle),node("p","department",card.department),node("p","card-template-name",`Plantilla · ${template.name}`));
  const contacts=node("div","card-contact-preview");
  if(!settings.privacy.hideEmailsInDashboard&&card.email){const email=node("a","email",card.email);email.href=`mailto:${card.email}`;contacts.append(email)}
  if(!settings.privacy.hidePhonesInDashboard&&card.phone){const phone=node("a","phone",card.phone);phone.href=`tel:${card.phone.replace(/[^\d+]/g,"")}`;contacts.append(phone)}
  if(!contacts.children.length)contacts.append(node("span","contact-hidden","Datos de contacto ocultos"));
  info.append(contacts);
  const actions=node("div","card-actions");
  actions.append(createButton("Editar","button button-primary","edit",card.id),createButton("Ver tarjeta","button button-secondary","view",card.id),createButton("","icon-button","copy",card.id,"copy"));
  actions.lastChild.setAttribute("aria-label",`Copiar enlace de ${displayName}`);
  info.append(actions);article.append(cover,info);return article;
}

function createNewTile(){
  const button=node("button","new-card-tile");button.type="button";button.dataset.action="new-card";
  const wrap=node("div");const plus=node("span","plus");plus.append(makeIcon("plus"));wrap.append(plus,node("h3","","Crear nueva tarjeta"),node("p","","Añade un empleado y personaliza su identidad digital."));button.append(wrap);return button;
}

function valueOrFallback(value,fallback){return String(value||"").trim()||fallback}

function formatListDate(value,settings){
  const date=new Date(value||"");
  if(Number.isNaN(date.getTime()))return "Sin fecha";
  return new Intl.DateTimeFormat("es-ES",{dateStyle:"medium",timeZone:settings.general.timezone}).format(date);
}

function createListAvatar(card,displayName){
  const holder=node("span","cards-list-avatar");
  const fallback=()=>holder.replaceChildren(node("span","cards-list-initials",initials(card)||"LN"));
  if(!card.photo||card.visibleFields?.photo===false){fallback();return holder}
  const image=createPhotoFrameImage(card.photo,{alt:`Foto de ${displayName}`,frame:card.photoFrame,legacyPosition:card.photoPosition,loading:"lazy",onError:fallback});
  holder.append(image);return holder;
}

function createListCell(className,label){const cell=node("td",className);cell.dataset.label=label;return cell}

function createListRow(card,settings){
  const displayName=formatPersonName(card,settings)||"Persona sin nombre";
  const row=node("tr","cards-list-row");row.dataset.cardId=card.id;row.tabIndex=0;row.setAttribute("aria-label",`Tarjeta de ${displayName}. Pulsa Intro para abrir la vista rápida.`);

  const person=createListCell("cards-list-person-cell","Persona"),personWrap=node("span","cards-list-person");
  const personCopy=node("span","cards-list-person-copy");personCopy.append(node("strong","",displayName));
  if(card.city)personCopy.append(node("small","",card.city));
  personWrap.append(createListAvatar(card,displayName),personCopy);person.append(personWrap);

  const role=createListCell("cards-list-role","Cargo");role.append(node("span","cards-list-ellipsis",valueOrFallback(card.jobTitle,"Sin cargo")));
  const team=createListCell("cards-list-department","Departamento");team.append(node("span","cards-list-ellipsis",valueOrFallback(card.department,"Sin departamento")));
  const email=createListCell("cards-list-email","Email");
  if(!settings.privacy.hideEmailsInDashboard&&card.email){const link=node("a","cards-list-ellipsis",card.email);link.href=`mailto:${card.email}`;link.title=card.email;email.append(link)}
  else email.append(node("span","cards-list-muted",settings.privacy.hideEmailsInDashboard?"Oculto":"Sin email"));

  const status=createListCell("cards-list-status","Estado"),knownStatus=Boolean(statusLabels[card.status]);
  status.append(node("span",`status status-${knownStatus?card.status:"unknown"}`,knownStatus?statusLabels[card.status]:"Sin estado"));
  const template=createListCell("cards-list-template","Plantilla");
  template.append(node("span","cards-list-template-badge",templateService.getTemplateById(card.template)?.name||"Predeterminada"));
  const updated=createListCell("cards-list-updated","Última actualización");updated.append(node("time","",formatListDate(card.updatedAt,settings)));
  if(card.updatedAt&&!Number.isNaN(new Date(card.updatedAt).getTime()))updated.firstChild.dateTime=new Date(card.updatedAt).toISOString();

  const actionCell=createListCell("cards-list-actions-cell","Acciones"),actions=node("div","cards-list-actions");actions.dataset.cardMenuHost="";
  const quick=createButton("","button button-secondary list-primary-action","quick-view",card.id,"eye");quick.title="Vista rápida";quick.setAttribute("aria-label",`Vista rápida de ${displayName}`);quick.append(node("span","list-action-label","Vista rápida"));
  const edit=createButton("","button button-primary list-primary-action","edit",card.id,"edit");edit.title="Editar";edit.setAttribute("aria-label",`Editar tarjeta de ${displayName}`);edit.append(node("span","list-action-label","Editar"));
  const {menuButton,menu}=createCardMenu(card,displayName,[["Ver tarjeta","view"],["Copiar enlace","copy"],["Cambiar plantilla","template"],["Duplicar","duplicate"],[card.status==="disabled"?"Reactivar":"Desactivar","disable"],["Eliminar","delete"]],"list");
  menuButton.classList.add("list-card-menu-button");actions.append(quick,edit,menuButton,menu);actionCell.append(actions);
  row.append(person,role,team,email,status,template,updated,actionCell);return row;
}

function createSortableHeader(label,key,className){
  const header=node("th",className);header.scope="col";
  const active=listSort.key===key;header.setAttribute("aria-sort",active?(listSort.direction==="asc"?"ascending":"descending"):"none");
  const button=createButton("","cards-list-sort","sort-cards");button.dataset.sortKey=key;button.setAttribute("aria-label",`Ordenar por ${label}`);
  button.append(document.createTextNode(label),makeIcon("sort"));header.append(button);return header;
}

function createCardsList(cards,settings){
  const table=node("table","cards-list-table");table.append(node("caption","sr-only",`Directorio de ${cards.length} tarjetas`));
  const head=node("thead"),headRow=node("tr");
  headRow.append(
    createSortableHeader("Persona","name","cards-list-person-cell"),
    createSortableHeader("Cargo","jobTitle","cards-list-role"),
    createSortableHeader("Departamento","department","cards-list-department"),
  );
  const email=node("th","cards-list-email","Email");email.scope="col";headRow.append(email);
  headRow.append(createSortableHeader("Estado","status","cards-list-status"));
  const template=node("th","cards-list-template","Plantilla");template.scope="col";headRow.append(template);
  headRow.append(createSortableHeader("Última actualización","updatedAt","cards-list-updated"));
  const actions=node("th","cards-list-actions-cell","Acciones");actions.scope="col";headRow.append(actions);head.append(headRow);
  const body=node("tbody");cards.forEach(card=>body.append(createListRow(card,settings)));table.append(head,body);return table;
}

function refreshDepartments(){
  const selected=department.value;const departments=[...new Set(cardService.all().map(card=>card.department).filter(Boolean))].sort();
  department.replaceChildren();const all=node("option","","Todos los departamentos");all.value="";department.append(all);
  departments.forEach(value=>{const option=node("option","",value);option.value=value;department.append(option)});department.value=departments.includes(selected)?selected:"";
}

function renderDashboard(){
  const settings=readSettings();
  const filteredCards=cardService.query({search:search.value,department:department.value,status:statusFilter.value});
  const cards=cardsViewMode==="list"?sortCardsForList(filteredCards,listSort,{getName:card=>formatPersonName(card,settings)}):filteredCards;
  const all=cardService.all();document.querySelector("#active-count").textContent=all.filter(c=>c.status==="active").length;document.querySelector("#draft-count").textContent=all.filter(c=>c.status==="draft").length;document.querySelector("#total-count").textContent=all.length;
  document.querySelector("#results-label").textContent=`${cards.length} de ${all.length} tarjetas`;
  document.querySelectorAll("[data-view-mode]").forEach(button=>{const selected=button.dataset.viewMode===cardsViewMode;button.setAttribute("aria-pressed",String(selected));button.classList.toggle("is-active",selected)});
  grid.className=`cards-directory ${cardsViewMode==="grid"?"card-grid":"cards-list"}`;grid.dataset.viewMode=cardsViewMode;grid.setAttribute("aria-label",`Tarjetas en vista ${cardsViewMode==="grid"?"cuadrícula":"lista"}`);grid.replaceChildren();
  if(cardsViewMode==="grid"){
    if(!search.value&&!department.value&&!statusFilter.value)grid.append(createNewTile());
    cards.forEach(card=>grid.append(createCard(card,settings)));
  }else if(cards.length)grid.append(createCardsList(cards,settings));
  const hasContent=cardsViewMode==="grid"?Boolean(cards.length||grid.children.length):Boolean(cards.length);
  const hasFilters=Boolean(search.value||department.value||statusFilter.value);
  empty.querySelector("h3").textContent=!all.length?"Todavía no hay tarjetas":"No hay tarjetas que coincidan";
  empty.querySelector("p").textContent=!all.length?"Crea la primera tarjeta para empezar el directorio.":hasFilters?"Prueba otra búsqueda o ajusta los filtros.":"Crea una nueva tarjeta para empezar.";
  empty.hidden=hasContent;grid.hidden=!hasContent;renderIcons(grid);
}

function setCardsViewMode(mode){
  const next=writeCardsViewMode(mode);if(next===cardsViewMode){renderDashboard();return}
  closeCardMenus();cardsViewMode=next;renderDashboard();
}

function updateListSort(key){
  const direction=listSort.key===key&&listSort.direction==="asc"?"desc":"asc";
  listSort={key,direction};renderDashboard();
  requestAnimationFrame(()=>grid.querySelector(`[data-sort-key="${key}"]`)?.focus());
}

function download(content,filename,type){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function copyCardLink(id){
  const card=cardService.get(id);const settings=readSettings();const url=getSourcedPublicCardUrl(card,"copied_link");
  if(settings.privacy.confirmBeforeCopy&&!window.confirm(`¿Copiar el enlace de ${formatPersonName(card,settings)}?`))return;
  await copyText(url);showToast("Enlace copiado.");
}

function closeCardMenus(){
  document.querySelectorAll(".card-menu").forEach(menu=>{menu.hidden=true;menu.parentElement?.querySelector(".card-menu-button")?.setAttribute("aria-expanded","false")});
}

async function handleAction(action,id,target){
  if(action==="set-cards-view"){setCardsViewMode(target.dataset.viewMode);return}
  if(action==="sort-cards"){updateListSort(target.dataset.sortKey);return}
  if(action==="new-card")openEditor();
  if(action==="quick-view"){
    const opener=target.closest(".card-menu")?.parentElement?.querySelector(".card-menu-button")||target;
    closeCardMenus();
    openQuickView(id,opener);
  }
  if(action==="edit")openEditor(id);
  if(action==="template"){openEditor(id,{focusTemplate:true});showToast("Selecciona una plantilla y guarda los cambios.")}
  if(action==="view"){const card=cardService.get(id);window.open(getSourcedPublicCardUrl(card,"admin_preview"),"_blank","noopener,noreferrer")}
  if(action==="copy")copyCardLink(id).catch(()=>showToast("No se pudo copiar el enlace.","error"));
  if(action==="duplicate"){cardService.duplicate(id);showToast("Tarjeta duplicada como borrador.");refreshDepartments();renderDashboard()}
  if(action==="disable"){cardService.toggleDisabled(id);showToast("Estado de la tarjeta actualizado.");renderDashboard()}
  if(action==="delete")await deleteFromDashboard(id);
  if(action==="toggle-menu"){
    const menu=target.closest("[data-card-menu-host]")?.querySelector(".card-menu");if(!menu)return;const open=menu.hidden;
    closeCardMenus();menu.hidden=!open;target.setAttribute("aria-expanded",String(open));if(open)menu.querySelector("button")?.focus();
  }
  if(action==="notifications")showToast("No hay notificaciones nuevas.");
  if(action==="admin-info")showToast("Sesión local · Héctor Plaza · Administrador.");
  if(action==="export"){download(storage.exportCards(),`nextcards-${new Date().toISOString().slice(0,10)}.json`,"application/json");showToast("Datos exportados. Las fotografías manuales de IndexedDB no están incluidas.")}
  if(action==="import")document.querySelector("#import-file").click();
  if(action==="restore"&&confirm("¿Restaurar las tarjetas iniciales? Se reemplazarán los cambios locales actuales.")){await clearAllPhotos();storage.restoreInitialData();refreshDepartments();renderDashboard();showToast("Datos iniciales restaurados.")}
  if(["export","import","restore"].includes(action)){document.querySelector("#data-menu").hidden=true}
}

setupQuickView({showToast,renderIconElements:renderIcons,openCardEditor:openEditor});
setupEditor({onChange:()=>{refreshDepartments();renderDashboard();refreshQuickView()},showToast});
setupTemplatesUI({showToast,onCardsUpdate:()=>{refreshDepartments();renderDashboard()},renderIconElements:renderIcons});
setupAnalyticsUI({showToast,renderIconElements:renderIcons,openCardEditor:openEditor});
setupSettingsUI({showToast,renderIconElements:renderIcons,onSettingsApplied:()=>{applyAppSettings();refreshDepartments();renderDashboard();renderTemplatesSection();renderAnalyticsSection()},onDataChanged:()=>{refreshDepartments();renderDashboard();renderTemplatesSection();renderAnalyticsSection()}});
applyAppSettings();renderIcons();refreshDepartments();renderDashboard();
if(storage.consumeReadError?.())showToast("No se han podido leer los datos locales. Importa una copia o restaura los datos iniciales.","error");
document.addEventListener("click",event=>{
  const trigger=event.target.closest("[data-action]");if(trigger)void handleAction(trigger.dataset.action,trigger.dataset.id,trigger);
  if(!event.target.closest(".card-menu-button")&&!event.target.closest(".card-menu"))closeCardMenus();
  if(!event.target.closest("#data-menu-button")&&!event.target.closest("#data-menu")){document.querySelector("#data-menu").hidden=true;document.querySelector("#data-menu-button").setAttribute("aria-expanded","false")}
});
[search,department,statusFilter].forEach(control=>control.addEventListener(control===search?"input":"change",renderDashboard));
grid.addEventListener("keydown",event=>{
  const row=event.target.closest(".cards-list-row");if(!row||event.target!==row||!["Enter"," "].includes(event.key))return;
  event.preventDefault();void handleAction("quick-view",row.dataset.cardId,row);
});
globalThis.addEventListener?.("storage",event=>{
  if(event.key!==CARDS_VIEW_STORAGE_KEY)return;
  const next=readCardsViewMode();if(next!==cardsViewMode){cardsViewMode=next;renderDashboard()}
});
document.querySelector("#menu-toggle").addEventListener("click",event=>{const open=sidebar.classList.toggle("open");event.currentTarget.setAttribute("aria-expanded",open)});
function activateSection(section,item=document.querySelector(`.nav-item[data-section="${section}"]`)){
  document.querySelector("#cards-view").hidden=section!=="cards";
  document.querySelector("#templates-view").hidden=section!=="templates";
  document.querySelector("#stats-view").hidden=section!=="stats";
  document.querySelector("#settings-view").hidden=section!=="settings";
  document.querySelectorAll(".nav-item").forEach(nav=>{const active=nav===item;nav.classList.toggle("active",active);if(active)nav.setAttribute("aria-current","page");else nav.removeAttribute("aria-current")});
  document.body.dataset.section=section;
  currentSection=section;
  if(section==="templates")renderTemplatesSection();
  if(section==="stats")renderAnalyticsSection();
  if(section==="settings")renderSettingsSection();
  sidebar.classList.remove("open");
}
document.querySelectorAll(".nav-item").forEach(item=>item.addEventListener("click",()=>{
  let section=item.dataset.section;
  if(section==="employees"){section="cards";item=document.querySelector('.nav-item[data-section="cards"]');showToast("El directorio de empleados está integrado en Tarjetas.")}
  const navigate=()=>activateSection(section,item);
  if(currentSection==="settings"&&section!=="settings"&&isSettingsDirty())requestSettingsLeave(navigate);else navigate();
}));
document.querySelector("#data-menu-button").addEventListener("click",event=>{const menu=document.querySelector("#data-menu");menu.hidden=!menu.hidden;event.currentTarget.setAttribute("aria-expanded",!menu.hidden)});
document.querySelector("#import-file").addEventListener("change",async event=>{
  const file=event.target.files[0];if(!file)return;
  try{const cards=storage.importCards(await file.text());await pruneUnusedPhotos(cards);refreshDepartments();renderDashboard();showToast("Datos importados correctamente. Las fotos manuales solo se conservan si ya existen en este navegador.")}catch(error){showToast(error.message,"error")}event.target.value="";
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"){
    if(sidebar.classList.contains("open")){sidebar.classList.remove("open");document.querySelector("#menu-toggle").setAttribute("aria-expanded","false");document.querySelector("#menu-toggle").focus()}
    closeCardMenus();document.querySelector("#data-menu").hidden=true;document.querySelector("#data-menu-button").setAttribute("aria-expanded","false");
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();const focusSearch=()=>{if(currentSection!=="cards")activateSection("cards");search.focus()};if(currentSection==="settings"&&isSettingsDirty())requestSettingsLeave(focusSearch);else focusSearch()}
});
