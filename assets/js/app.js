import {storage} from "./storage.js";
import {cardService} from "./cards.js";
import {setupEditor,openEditor,deleteFromDashboard} from "./editor.js";
import {getSourcedPublicCardUrl} from "./card-export.js";
import {setupTemplatesUI,renderTemplatesSection} from "./templates-ui.js";
import {templateService} from "./templates-store.js";
import {setupAnalyticsUI,renderAnalyticsSection} from "./analytics-ui.js";
import {applySettingsToDocument,formatPersonName,getDefaultSettings,settingsService} from "./settings-store.js";
import {isSettingsDirty,renderSettingsSection,requestSettingsLeave,setupSettingsUI} from "./settings-ui.js";

const iconPaths={
  cards:"M4 4h16v16H4z M8 8h8 M8 12h6",people:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  layout:"M3 3h18v18H3z M3 9h18 M9 21V9",chart:"M3 3v18h18 M7 16l4-5 4 3 5-7",settings:"M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7 M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06-2 3.46-.08-.03a1.65 1.65 0 0 0-1.88.24 1.65 1.65 0 0 0-.5 1.25V22h-4v-.1a1.65 1.65 0 0 0-.5-1.25 1.65 1.65 0 0 0-1.88-.24l-.08.03-2-3.46.06-.06A1.65 1.65 0 0 0 7.2 15a1.65 1.65 0 0 0-1.2-.72H6v-4h.1A1.65 1.65 0 0 0 7.2 9a1.65 1.65 0 0 0-.27-1.82l-.06-.06 2-3.46.08.03a1.65 1.65 0 0 0 1.88-.24 1.65 1.65 0 0 0 .5-1.25V2h4v.1a1.65 1.65 0 0 0 .5 1.25 1.65 1.65 0 0 0 1.88.24l.08-.03 2 3.46-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.2.72h.1v4h-.1a1.65 1.65 0 0 0-1.2.72z",
  menu:"M4 6h16 M4 12h16 M4 18h16",search:"M21 21l-4.35-4.35 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0",plus:"M12 5v14 M5 12h14",check:"M20 6 9 17l-5-5",edit:"M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z",users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  database:"M12 2c5 0 9 1.8 9 4s-4 4-9 4-9-1.8-9-4 4-4 9-4z M3 6v6c0 2.2 4 4 9 4s9-1.8 9-4V6 M3 12v6c0 2.2 4 4 9 4s9-1.8 9-4v-6",chevron:"M6 9l6 6 6-6",download:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",upload:"M17 8l-5-5-5 5 M12 3v12 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",refresh:"M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0 1 14.9-3.36L23 10 M1 14l4.6 4.36A9 9 0 0 0 20.5 15",
  copy:"M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1",more:"M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2 M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2",external:"M14 3h7v7 M10 14 21 3 M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5",
  arrowLeft:"M19 12H5 M12 19l-7-7 7-7",save:"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",image:"M3 3h18v18H3z M8.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21",user:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",close:"M18 6 6 18 M6 6l12 12",
  eye:"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12 M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",qr:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M19 14h2v7h-4v-2h-3 M19 19h2",phone:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z",share:"M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98",filter:"M22 3H2l8 9.46V19l4 2v-8.54z",lock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4"
};
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

function applyAppSettings(settings=readSettings()){
  applySettingsToDocument(settings);
  document.title=`${settings.general.appName} · ${settings.general.appSubtitle}`;
}

export function showToast(message,type="success"){
  const toast=node("div",`toast ${type}`);toast.append(makeIcon(type==="error"?"bell":"check"),document.createTextNode(message));document.querySelector("#toast-region").append(toast);
  setTimeout(()=>toast.remove(),3200);
}

function createButton(label,className,action,id,icon){
  const button=node("button",className);button.type="button";button.dataset.action=action;if(id)button.dataset.id=id;if(icon)button.append(makeIcon(icon));if(label)button.append(document.createTextNode(label));return button;
}

function createCard(card){
  const settings=readSettings();
  const displayName=formatPersonName(card,settings);
  const article=node("article","employee-card"),cover=node("div","employee-cover");
  const logo=node("img","employee-logo");logo.src="assets/img/logos/lognext-negative.svg";logo.alt="";
  const menuButton=createButton("","card-menu-button","toggle-menu",card.id,"more");menuButton.setAttribute("aria-label",`Más acciones para ${displayName}`);menuButton.setAttribute("aria-expanded","false");
  const menu=node("div","card-menu");menu.hidden=true;
  [["Cambiar plantilla","template"],["Duplicar","duplicate"],[card.status==="disabled"?"Reactivar":"Desactivar","disable"],["Eliminar","delete"]].forEach(([label,action])=>{const b=createButton(label,action==="delete"?"danger":"",action,card.id);menu.append(b)});
  cover.append(logo,menuButton,menu);
  if(card.photo&&card.visibleFields?.photo!==false){const img=node("img","employee-photo");img.src=card.photo;img.alt=`Foto de ${displayName}`;cover.append(img)}else cover.append(node("div","employee-initials",initials(card)));
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

function refreshDepartments(){
  const selected=department.value;const departments=[...new Set(cardService.all().map(card=>card.department).filter(Boolean))].sort();
  department.replaceChildren();const all=node("option","","Todos los departamentos");all.value="";department.append(all);
  departments.forEach(value=>{const option=node("option","",value);option.value=value;department.append(option)});department.value=departments.includes(selected)?selected:"";
}

function renderDashboard(){
  const cards=cardService.query({search:search.value,department:department.value,status:statusFilter.value});
  const all=cardService.all();document.querySelector("#active-count").textContent=all.filter(c=>c.status==="active").length;document.querySelector("#draft-count").textContent=all.filter(c=>c.status==="draft").length;document.querySelector("#total-count").textContent=all.length;
  document.querySelector("#results-label").textContent=`${cards.length} de ${all.length} tarjetas`;
  grid.replaceChildren();if(!search.value&&!department.value&&!statusFilter.value)grid.append(createNewTile());
  cards.forEach(card=>grid.append(createCard(card)));empty.hidden=Boolean(cards.length||grid.children.length);grid.hidden=!empty.hidden;renderIcons(grid);
}

function download(content,filename,type){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement("a");a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
}
async function copyCardLink(id){
  const card=cardService.get(id);const url=getSourcedPublicCardUrl(card,"copied_link");
  if(readSettings().privacy.confirmBeforeCopy&&!window.confirm(`¿Copiar el enlace de ${formatPersonName(card,readSettings())}?`))return;
  await navigator.clipboard.writeText(url);showToast("Enlace copiado.");
}

function handleAction(action,id,target){
  if(action==="new-card")openEditor();
  if(action==="edit")openEditor(id);
  if(action==="template"){openEditor(id,{focusTemplate:true});showToast("Selecciona una plantilla y guarda los cambios.")}
  if(action==="view"){const card=cardService.get(id);window.open(getSourcedPublicCardUrl(card,"admin_preview"),"_blank","noopener,noreferrer")}
  if(action==="copy")copyCardLink(id).catch(()=>showToast("No se pudo copiar el enlace.","error"));
  if(action==="duplicate"){cardService.duplicate(id);showToast("Tarjeta duplicada como borrador.");refreshDepartments();renderDashboard()}
  if(action==="disable"){cardService.toggleDisabled(id);showToast("Estado de la tarjeta actualizado.");renderDashboard()}
  if(action==="delete")deleteFromDashboard(id);
  if(action==="toggle-menu"){
    const menu=target.closest(".employee-cover").querySelector(".card-menu");const open=menu.hidden;
    document.querySelectorAll(".card-menu").forEach(item=>item.hidden=true);menu.hidden=!open;target.setAttribute("aria-expanded",open);
  }
  if(action==="export"){download(storage.exportCards(),`nextcards-${new Date().toISOString().slice(0,10)}.json`,"application/json");showToast("Datos exportados.")}
  if(action==="import")document.querySelector("#import-file").click();
  if(action==="restore"&&confirm("¿Restaurar las tarjetas iniciales? Se reemplazarán los cambios locales actuales.")){storage.restoreInitialData();refreshDepartments();renderDashboard();showToast("Datos iniciales restaurados.")}
  if(["export","import","restore"].includes(action)){document.querySelector("#data-menu").hidden=true}
}

setupEditor({onChange:()=>{refreshDepartments();renderDashboard()},showToast});
setupTemplatesUI({showToast,onCardsUpdate:()=>{refreshDepartments();renderDashboard()},renderIconElements:renderIcons});
setupAnalyticsUI({showToast,renderIconElements:renderIcons,openCardEditor:openEditor});
setupSettingsUI({showToast,renderIconElements:renderIcons,onSettingsApplied:()=>{applyAppSettings();refreshDepartments();renderDashboard();renderTemplatesSection();renderAnalyticsSection()},onDataChanged:()=>{refreshDepartments();renderDashboard();renderTemplatesSection();renderAnalyticsSection()}});
applyAppSettings();renderIcons();refreshDepartments();renderDashboard();
document.addEventListener("click",event=>{
  const trigger=event.target.closest("[data-action]");if(trigger)handleAction(trigger.dataset.action,trigger.dataset.id,trigger);
  if(!event.target.closest(".card-menu-button")&&!event.target.closest(".card-menu"))document.querySelectorAll(".card-menu").forEach(menu=>menu.hidden=true);
});
[search,department,statusFilter].forEach(control=>control.addEventListener(control===search?"input":"change",renderDashboard));
document.querySelector("#menu-toggle").addEventListener("click",event=>{const open=sidebar.classList.toggle("open");event.currentTarget.setAttribute("aria-expanded",open)});
function activateSection(section,item=document.querySelector(`.nav-item[data-section="${section}"]`)){
  document.querySelector("#cards-view").hidden=section!=="cards";
  document.querySelector("#templates-view").hidden=section!=="templates";
  document.querySelector("#stats-view").hidden=section!=="stats";
  document.querySelector("#settings-view").hidden=section!=="settings";
  document.querySelectorAll(".nav-item").forEach(nav=>nav.classList.toggle("active",nav===item));
  document.body.dataset.section=section;
  currentSection=section;
  if(section==="templates")renderTemplatesSection();
  if(section==="stats")renderAnalyticsSection();
  if(section==="settings")renderSettingsSection();
  sidebar.classList.remove("open");
}
document.querySelectorAll(".nav-item").forEach(item=>item.addEventListener("click",()=>{
  const section=item.dataset.section;
  if(!["cards","templates","stats","settings"].includes(section)){showToast("Esta sección estará disponible en una siguiente fase.","error");sidebar.classList.remove("open");return}
  const navigate=()=>activateSection(section,item);
  if(currentSection==="settings"&&section!=="settings"&&isSettingsDirty())requestSettingsLeave(navigate);else navigate();
}));
document.querySelector("#data-menu-button").addEventListener("click",event=>{const menu=document.querySelector("#data-menu");menu.hidden=!menu.hidden;event.currentTarget.setAttribute("aria-expanded",!menu.hidden)});
document.querySelector("#import-file").addEventListener("change",async event=>{
  const file=event.target.files[0];if(!file)return;
  try{storage.importCards(await file.text());refreshDepartments();renderDashboard();showToast("Datos importados correctamente.")}catch(error){showToast(error.message,"error")}event.target.value="";
});
document.addEventListener("keydown",event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();const focusSearch=()=>{if(currentSection!=="cards")activateSection("cards");search.focus()};if(currentSection==="settings"&&isSettingsDirty())requestSettingsLeave(focusSearch);else focusSearch()}});
