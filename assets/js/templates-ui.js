import {cardService} from "./cards.js?v=1.7.0";
import {renderCardPreview} from "./preview.js?v=1.7.0";
import {CORPORATE_PRESETS,templateService,validateTemplateDraft} from "./templates-store.js?v=1.7.0";
import {formatPersonName,formatSettingsDate} from "./settings-store.js";
import {createPhotoFrameImage} from "./photo-frame.js?v=1.6.0";

export const TEMPLATE_SAMPLE_CARD = Object.freeze({
  id: "template-preview-sample",
  slug: "alex-martinez",
  cardName: "Alex Martínez",
  firstName: "Alex",
  lastName: "Martínez",
  jobTitle: "Digital Transformation Manager",
  department: "Technology",
  city: "Madrid",
  email: "alex.martinez@example.com",
  phone: "+34 600 123 456",
  mobile: "",
  website: "https://lognext.com",
  linkedin: "https://www.linkedin.com/company/lognext/",
  location: "",
  customLink: "",
  bio: "Impulsando transformaciones tecnológicas con impacto real.",
  photo: "",
  status: "active",
  language: "es",
  visibleFields: {phone: true, email: true, city: true, bio: true, linkedin: true, website: true},
});

const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element};
const option=(value,text)=>{const element=node("option","",text);element.value=value;return element};
const initials=card=>`${card.firstName?.[0]||""}${card.lastName?.[0]||""}`.toUpperCase();
const formatDate=value=>formatSettingsDate(value).replace(/,? \d{1,2}:\d{2}$/,"");

let initialized=false;
let toast=()=>{};
let onCardsChanged=()=>{};
let renderIcons=()=>{};
let currentPreviewTemplateId="";
let editingTemplateId="";
let editorDirty=false;
let draftMutedTextColor="#E1E1E8";
let activeModal=null;
let previousFocus=null;
let applySourceTemplateId="";
let selectedCardIds=new Set();

const templatesView=()=>document.querySelector("#templates-view");
const previewModal=()=>document.querySelector("#template-preview-modal");
const editorModal=()=>document.querySelector("#template-editor-modal");
const applyModal=()=>document.querySelector("#template-apply-modal");
const templateForm=()=>document.querySelector("#template-form");
const applyForm=()=>document.querySelector("#template-apply-form");

function createAction(label,action,id,className="button button-secondary"){
  const button=node("button",className,label);button.type="button";button.dataset.templateAction=action;if(id)button.dataset.templateId=id;return button;
}

function sampleFor(template){return {...TEMPLATE_SAMPLE_CARD,template:template.id,accentColor:template.theme.accentColor}}

function badge(text,className){return node("span",`template-badge ${className}`,text)}

function renderTemplateTile(template){
  const usage=templateService.getTemplateUsageCount(template.id);
  const article=node("article",`template-tile${template.status==="archived"?" archived":""}`);article.dataset.templateId=template.id;
  const preview=node("div","template-tile-preview"),card=node("div","digital-card");preview.append(card);renderCardPreview(card,sampleFor(template));
  const content=node("div","template-tile-content"),top=node("div","template-tile-top"),heading=node("div"),badges=node("div","template-badges");
  heading.append(node("h3","",template.name));
  badges.append(badge(template.type==="system"?"Sistema":"Personalizada",template.type));
  badges.append(badge(template.status==="active"?"Activa":"Archivada",template.status));
  if(template.isDefault)badges.append(badge("Predeterminada","default"));
  top.append(heading,badges);
  const description=node("p","template-tile-description",template.description||"Sin descripción.");
  const usageLine=node("div","template-usage");usageLine.append(node("span","",usage?`${usage} tarjeta${usage===1?"":"s"}`:"Ninguna tarjeta la utiliza"),node("strong","",template.type==="custom"?`Actualizada ${formatDate(template.updatedAt)}`:"Incluida con NextCards"));
  const actions=node("div","template-actions");
  actions.append(createAction("Previsualizar","preview",template.id),createAction("Crear variante","variant",template.id));
  if(template.status==="active"){
    actions.append(createAction("Aplicar","apply",template.id,"button button-primary"));
    if(!template.isDefault)actions.append(createAction("Establecer predeterminada","default",template.id));
  }
  if(template.type==="custom"){
    actions.append(createAction("Editar","edit",template.id),createAction("Duplicar","duplicate",template.id));
    if(template.status==="archived")actions.append(createAction("Restaurar","restore",template.id,"button button-primary full"));
    else if(!template.isDefault)actions.append(createAction("Archivar","archive",template.id));
    if(usage)actions.append(createAction(`Reasignar ${usage} tarjeta${usage===1?"":"s"}`,"reassign",template.id,"button button-secondary full"));
    else if(!template.isDefault)actions.append(createAction("Eliminar","delete",template.id,"button button-secondary danger"));
  }
  content.append(top,description,usageLine,actions);article.append(preview,content);return article;
}

export function renderTemplatesSection(){
  if(!templatesView())return;
  const templates=templateService.getTemplates();
  const search=document.querySelector("#template-search").value.trim().toLowerCase();
  const filter=document.querySelector("#template-filter").value;
  const customIds=new Set(templates.filter(item=>item.type==="custom").map(item=>item.id));
  const visible=templates.filter(template=>{
    const matchesSearch=!search||`${template.name} ${template.description}`.toLowerCase().includes(search);
    const matchesFilter=filter==="all"||(filter==="system"&&template.type==="system")||(filter==="custom"&&template.type==="custom"&&template.status==="active")||(filter==="archived"&&template.status==="archived");
    return matchesSearch&&matchesFilter;
  });
  document.querySelector("#template-total-count").textContent=templates.length;
  document.querySelector("#template-default-name").textContent=templateService.getDefaultTemplate().name;
  document.querySelector("#template-custom-count").textContent=templates.filter(item=>item.type==="custom").length;
  document.querySelector("#template-custom-card-count").textContent=cardService.all().filter(card=>customIds.has(card.template)).length;
  document.querySelector("#no-custom-templates").hidden=Boolean(customIds.size)||search||filter==="archived";
  document.querySelector("#template-results-label").textContent=`${visible.length} de ${templates.length} plantillas`;
  const grid=document.querySelector("#templates-grid");grid.replaceChildren();visible.forEach(template=>grid.append(renderTemplateTile(template)));
  const empty=document.querySelector("#templates-empty");empty.hidden=Boolean(visible.length);grid.hidden=!visible.length;
  renderIcons(templatesView());
}

function openModal(modal){
  if(activeModal&&activeModal!==modal)closeModal(activeModal,false);
  previousFocus=document.activeElement;activeModal=modal;modal.hidden=false;document.body.style.overflow="hidden";renderIcons(modal);
  setTimeout(()=>modal.querySelector("[role=dialog]")?.focus(),20);
}

function closeModal(modal,restoreFocus=true){
  modal.hidden=true;if(activeModal===modal)activeModal=null;document.body.style.overflow="";
  if(restoreFocus&&previousFocus instanceof HTMLElement)previousFocus.focus();
}

function populatePreviewCards(){
  const select=document.querySelector("#template-preview-card"),selected=select.value;select.replaceChildren(option("","Alex Martínez · Ejemplo"));
  cardService.all().forEach(card=>select.append(option(card.id,`${formatPersonName(card)} · ${card.jobTitle}`)));select.value=cardService.get(selected)?selected:"";
}

function refreshFullPreview(){
  const template=templateService.getTemplateById(currentPreviewTemplateId);if(!template)return;
  const selectedId=document.querySelector("#template-preview-card").value;
  const selected=selectedId?cardService.get(selectedId):null;
  renderCardPreview(document.querySelector("#template-full-preview"),{...(selected||TEMPLATE_SAMPLE_CARD),template:template.id,accentColor:selected?.accentColor||template.theme.accentColor});
}

function openTemplatePreview(id){
  const template=templateService.getTemplateById(id);if(!template){toast("Plantilla no encontrada.","error");return}
  currentPreviewTemplateId=id;document.querySelector("#template-preview-title").textContent=template.name;populatePreviewCards();
  document.querySelectorAll("[data-preview-device]").forEach(button=>button.classList.toggle("active",button.dataset.previewDevice==="mobile"));
  document.querySelector("#template-preview-stage").className="template-preview-stage device-mobile";refreshFullPreview();openModal(previewModal());
}

function setField(name,value){
  const field=templateForm().elements.namedItem(name);if(!field)return;
  if(field.type==="checkbox")field.checked=Boolean(value);else field.value=value??"";
}

function populateBaseTemplates(selectedId){
  const select=templateForm().elements.baseTemplateId;select.replaceChildren();templateService.getSystemTemplates().forEach(template=>select.append(option(template.id,template.name)));select.value=selectedId||templateService.getDefaultTemplate().id;
}

function uniqueVariantName(base){
  const templates=templateService.getTemplates();let name=`${base} · Variante`,suffix=2;
  while(templates.some(item=>item.name.toLowerCase()===name.toLowerCase()))name=`${base} · Variante ${suffix++}`;
  return name;
}

function setThemeFields(theme){
  ["backgroundColor","accentColor","textColor","secondaryColor","buttonStyle","photoShape","photoSize","backgroundPattern","logoVariant","logoPosition","contentOrder"].forEach(key=>setField(key,theme[key]));
  ["backgroundColor","accentColor","textColor","secondaryColor"].forEach(key=>{const picker=templateForm().querySelector(`[data-color-picker="${key}"]`);if(picker)picker.value=theme[key]});
  ["showTagline","showDepartment","showCity"].forEach(key=>setField(key,theme[key]));draftMutedTextColor=theme.mutedTextColor;
}

function editorFormData(){
  const values=Object.fromEntries(new FormData(templateForm()).entries());
  return {
    name:values.name,
    description:values.description,
    baseTemplateId:values.baseTemplateId,
    theme:{
      backgroundColor:values.backgroundColor,accentColor:values.accentColor,textColor:values.textColor,mutedTextColor:draftMutedTextColor,secondaryColor:values.secondaryColor,
      buttonStyle:values.buttonStyle,photoShape:values.photoShape,photoSize:values.photoSize,backgroundPattern:values.backgroundPattern,
      logoVariant:values.logoVariant,logoPosition:values.logoPosition,contentOrder:values.contentOrder,
      showTagline:templateForm().elements.showTagline.checked,showDepartment:templateForm().elements.showDepartment.checked,showCity:templateForm().elements.showCity.checked,
    },
  };
}

function renderEditorValidation(validation){
  const box=document.querySelector("#template-validation");box.replaceChildren();
  const messages=[...validation.errors.map(message=>({message,type:"error"})),...validation.warnings.map(message=>({message,type:"warning"}))];
  box.hidden=!messages.length;box.className=`template-validation ${validation.errors.length?"error":"warning"}`;messages.forEach(item=>box.append(node("p","",`${item.type==="error"?"Error":"Aviso"}: ${item.message}`)));
  templateForm().querySelectorAll(".invalid").forEach(field=>field.classList.remove("invalid"));
  if(validation.errors.some(message=>message.includes("nombre")||message.includes("Nombre")))templateForm().elements.name.classList.add("invalid");
  if(validation.errors.some(message=>message.includes("hexadecimal")))templateForm().querySelectorAll("[name$=Color]").forEach(field=>{if(!field.checkValidity())field.classList.add("invalid")});
}

function refreshTemplateEditor(){
  const data=editorFormData();const validation=validateTemplateDraft(data,{exceptId:editingTemplateId});renderEditorValidation(validation);
  const previewTemplate={id:editingTemplateId||"template-draft",name:data.name||"Variante",description:data.description,type:"custom",baseTemplateId:validation.baseTemplateId,status:"active",isDefault:false,theme:validation.theme};
  renderCardPreview(document.querySelector("#template-live-preview"),{...TEMPLATE_SAMPLE_CARD,template:previewTemplate.id,accentColor:previewTemplate.theme.accentColor},previewTemplate);
  if(editorDirty)document.querySelector("#template-save-state").textContent="Cambios sin guardar";
  return validation;
}

function openTemplateEditor({sourceId="",editId=""}={}){
  templateForm().reset();editingTemplateId=editId;const editing=editId?templateService.getTemplateById(editId):null;
  if(editing&&editing.type!=="custom"){toast("Las plantillas del sistema se utilizan como base para variantes.","error");return}
  const source=editing||templateService.getTemplateById(sourceId)||templateService.getDefaultTemplate();
  populateBaseTemplates(source.type==="system"?source.id:source.baseTemplateId);
  setField("templateId",editing?.id||"");setField("name",editing?.name||uniqueVariantName(source.name));setField("description",editing?.description||`Variante basada en ${source.name}.`);setThemeFields(source.theme);
  document.querySelector("#template-editor-title").textContent=editing?`Editar · ${editing.name}`:"Crear variante";document.querySelector("#template-save-copy").hidden=!editing;
  document.querySelector("#template-save-state").textContent=editing?"Todos los cambios guardados":"Nueva variante";editorDirty=false;refreshTemplateEditor();
  document.querySelector(".template-editor-body").classList.remove("show-preview");document.querySelectorAll("[data-template-editor-tab]").forEach(button=>button.setAttribute("aria-selected",button.dataset.templateEditorTab==="form"));
  openModal(editorModal());setTimeout(()=>templateForm().elements.name.focus(),40);
}

function closeTemplateEditor(force=false){
  if(!force&&editorDirty&&!confirm("Hay cambios sin guardar. ¿Cerrar el editor y descartarlos?"))return false;
  editorDirty=false;closeModal(editorModal());return true;
}

function saveTemplate(asCopy=false){
  const data=editorFormData();const validation=validateTemplateDraft(data,{exceptId:asCopy?"":editingTemplateId});
  if(validation.errors.length){renderEditorValidation(validation);toast("Revisa los errores de la plantilla.","error");templateForm().querySelector(".invalid")?.focus();return}
  try{
    let saved;
    if(asCopy){data.name=uniqueVariantName(data.name);saved=templateService.createTemplate(data)}
    else if(editingTemplateId){const usage=templateService.getTemplateUsageCount(editingTemplateId);if(usage&&!confirm(`Esta edición actualizará el diseño de ${usage} tarjeta${usage===1?"":"s"}. ¿Continuar?`))return;saved=templateService.updateTemplate(editingTemplateId,data)}
    else saved=templateService.createTemplate(data);
    editorDirty=false;toast(asCopy?"Nueva variante guardada.":"Plantilla guardada.");closeTemplateEditor(true);renderTemplatesSection();return saved;
  }catch(problem){if(problem.validation)renderEditorValidation(problem.validation);toast(problem.message,"error")}
}

function renderPresets(){
  const holder=document.querySelector("#corporate-presets");holder.replaceChildren();CORPORATE_PRESETS.forEach((preset,index)=>{
    const button=node("button","",preset.name);button.type="button";button.dataset.templatePreset=String(index);const colors=node("span","preset-colors");[preset.backgroundColor,preset.accentColor,preset.textColor,preset.secondaryColor].forEach(color=>{const dot=node("i");dot.style.backgroundColor=color;colors.append(dot)});button.prepend(colors);holder.append(button);
  });
}

function activeTemplateOptions(excludedId=""){
  return templateService.getTemplates({includeArchived:false}).filter(template=>template.id!==excludedId);
}

function populateApplyOptions(preferredId,excludedId=""){
  const select=document.querySelector("#apply-target-template");select.replaceChildren();const templates=activeTemplateOptions(excludedId);templates.forEach(template=>select.append(option(template.id,template.name)));select.value=templates.some(item=>item.id===preferredId)?preferredId:(templates.find(item=>item.isDefault)?.id||templates[0]?.id||"");
}

function populateApplyDepartments(){
  const select=document.querySelector("#apply-department"),selected=select.value;select.replaceChildren(option("","Todos los departamentos"));const values=[...new Set(cardService.all().map(card=>card.department).filter(Boolean))].sort();values.forEach(value=>select.append(option(value,value)));select.value=values.includes(selected)?selected:"";
}

function filteredApplyCards(){
  return cardService.query({search:document.querySelector("#apply-search").value,department:document.querySelector("#apply-department").value,status:document.querySelector("#apply-status").value});
}

function renderApplySummary(){
  const target=templateService.getTemplateById(document.querySelector("#apply-target-template").value);
  const currentNames=[...new Set([...selectedCardIds].map(id=>templateService.resolveTemplate(cardService.get(id)?.template,{warn:false}).name))];
  document.querySelector("#apply-current-name").textContent=!currentNames.length?"—":currentNames.length===1?currentNames[0]:`${currentNames.length} plantillas distintas`;
  document.querySelector("#apply-template-name").textContent=target?.name||"—";document.querySelector("#apply-count").textContent=selectedCardIds.size;
}

function renderApplyCards(){
  const cards=filteredApplyCards(),templates=new Map(templateService.getTemplates().map(item=>[item.id,item.name])),list=document.querySelector("#apply-card-list");list.replaceChildren();
  cards.forEach(card=>{
    const row=node("label","apply-card-row"),checkbox=node("input");checkbox.type="checkbox";checkbox.dataset.cardId=card.id;checkbox.checked=selectedCardIds.has(card.id);
    let avatar;if(card.photo){avatar=node("span","apply-card-photo");const image=createPhotoFrameImage(card.photo,{alt:"",frame:card.photoFrame,legacyPosition:card.photoPosition,loading:"lazy",onError:()=>avatar.replaceWith(node("span","apply-card-avatar",initials(card)))});avatar.append(image)}else avatar=node("span","apply-card-avatar",initials(card));
    const identity=node("span");identity.append(node("strong","",formatPersonName(card)),node("small","",`${card.jobTitle} · ${card.department}`));
    row.append(checkbox,avatar,identity,node("span","apply-card-current",templates.get(card.template)||"Plantilla no disponible"));list.append(row);
  });
  const empty=document.querySelector("#apply-empty");empty.hidden=Boolean(cards.length);list.hidden=!cards.length;
  const selectAll=document.querySelector("#apply-select-all"),multiple=applyForm().elements.applyMode.value==="multiple";selectAll.disabled=!multiple;selectAll.checked=Boolean(cards.length&&cards.every(card=>selectedCardIds.has(card.id)));
  renderApplySummary();
}

function openApplyTemplate(templateId,{sourceTemplateId=""}={}){
  applySourceTemplateId=sourceTemplateId;selectedCardIds=new Set(sourceTemplateId?templateService.getCardsUsingTemplate(sourceTemplateId).map(card=>card.id):[]);
  const fallback=templateService.getDefaultTemplate().id===sourceTemplateId?activeTemplateOptions(sourceTemplateId)[0]?.id:templateService.getDefaultTemplate().id;
  populateApplyOptions(templateId||fallback,sourceTemplateId);populateApplyDepartments();document.querySelector("#apply-search").value="";document.querySelector("#apply-department").value="";document.querySelector("#apply-status").value="";
  applyForm().elements.applyMode.value="multiple";applyForm().elements.accentMode.value="preserve";document.querySelector("#template-apply-title").textContent=sourceTemplateId?"Reasignar tarjetas antes de eliminar":"Aplicar plantilla";renderApplyCards();openModal(applyModal());
}

function applySelectedTemplate(){
  const targetId=document.querySelector("#apply-target-template").value,target=templateService.getTemplateById(targetId);if(!target){toast("Selecciona una plantilla activa.","error");return}
  if(!selectedCardIds.size){toast("Selecciona al menos una tarjeta.","error");return}
  const currentNames=[...new Set([...selectedCardIds].map(id=>templateService.resolveTemplate(cardService.get(id)?.template,{warn:false}).name))].join(", ");
  if(!confirm(`Plantilla actual: ${currentNames}.\nPlantilla nueva: ${target.name}.\nTarjetas afectadas: ${selectedCardIds.size}.\n\n¿Aplicar el cambio de diseño?`))return;
  try{
    const result=templateService.applyTemplateToCards(target.id,[...selectedCardIds],{useTemplateAccent:applyForm().elements.accentMode.value==="template"});
    closeModal(applyModal());toast(`${result.updated} tarjeta${result.updated===1?" actualizada":"s actualizadas"}; ${result.skipped} omitida${result.skipped===1?"":"s"}.`);onCardsChanged();renderTemplatesSection();
  }catch(problem){toast(problem.message,"error")}
}

function setDefault(id){
  const template=templateService.getTemplateById(id);if(!template)return;
  if(confirm(`¿Usar "${template.name}" como plantilla predeterminada para las nuevas tarjetas? Las existentes no cambiarán.`)){templateService.setDefaultTemplate(id);toast("Plantilla predeterminada actualizada.");renderTemplatesSection()}
}

function duplicateTemplate(id){try{const copy=templateService.duplicateTemplate(id);toast(`Se ha creado "${copy.name}".`);renderTemplatesSection()}catch(problem){toast(problem.message,"error")}}
function archiveTemplate(id){const template=templateService.getTemplateById(id),usage=templateService.getTemplateUsageCount(id);if(template&&confirm(`¿Archivar "${template.name}"? ${usage?`Seguirá funcionando en ${usage} tarjeta${usage===1?"":"s"}.`:"Podrás restaurarla después."}`)){try{templateService.archiveTemplate(id);toast("Plantilla archivada.");renderTemplatesSection()}catch(problem){toast(problem.message,"error")}}}
function restoreTemplate(id){try{templateService.restoreTemplate(id);toast("Plantilla restaurada.");renderTemplatesSection()}catch(problem){toast(problem.message,"error")}}
function deleteTemplate(id){const template=templateService.getTemplateById(id);if(!template)return;const usage=templateService.getTemplateUsageCount(id);if(usage){toast(`No se puede eliminar: ${usage} tarjeta${usage===1?" usa":"s usan"} esta plantilla. Reasígnalas primero.`,"error");openApplyTemplate("",{sourceTemplateId:id});return}if(confirm(`¿Eliminar definitivamente la plantilla personalizada "${template.name}"? Esta acción no se puede deshacer.`)){try{templateService.deleteTemplate(id);toast("Plantilla eliminada.");renderTemplatesSection()}catch(problem){toast(problem.message,"error")}}}

function handleTemplateAction(action,id){
  if(action==="clear-filters"){document.querySelector("#template-search").value="";document.querySelector("#template-filter").value="all";renderTemplatesSection()}
  if(action==="create-variant")openTemplateEditor();
  if(action==="preview")openTemplatePreview(id);
  if(action==="variant")openTemplateEditor({sourceId:id});
  if(action==="apply")openApplyTemplate(id);
  if(action==="default")setDefault(id);
  if(action==="edit")openTemplateEditor({editId:id});
  if(action==="duplicate")duplicateTemplate(id);
  if(action==="archive")archiveTemplate(id);
  if(action==="restore")restoreTemplate(id);
  if(action==="reassign")openApplyTemplate("",{sourceTemplateId:id});
  if(action==="delete")deleteTemplate(id);
  if(action==="close-preview")closeModal(previewModal());
  if(action==="preview-variant"){const source=currentPreviewTemplateId,returnFocus=previousFocus;closeModal(previewModal(),false);openTemplateEditor({sourceId:source});previousFocus=returnFocus}
  if(action==="preview-apply"){const target=currentPreviewTemplateId,returnFocus=previousFocus;closeModal(previewModal(),false);openApplyTemplate(target);previousFocus=returnFocus}
  if(action==="close-editor")closeTemplateEditor();
  if(action==="save-copy")saveTemplate(true);
  if(action==="close-apply")closeModal(applyModal());
}

function handleModalKeys(event){
  if(!activeModal)return;
  if(event.key==="Escape"){event.preventDefault();if(activeModal===editorModal())closeTemplateEditor();else closeModal(activeModal);return}
  if(event.key!=="Tab")return;
  const focusable=[...activeModal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(element=>element.offsetParent!==null);
  if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}

export function setupTemplatesUI({showToast,onCardsUpdate,renderIconElements}={}){
  toast=showToast||toast;onCardsChanged=onCardsUpdate||onCardsChanged;renderIcons=renderIconElements||renderIcons;if(initialized)return;initialized=true;
  renderPresets();
  document.querySelector("#template-search").addEventListener("input",renderTemplatesSection);document.querySelector("#template-filter").addEventListener("change",renderTemplatesSection);
  document.addEventListener("click",event=>{const trigger=event.target.closest("[data-template-action]");if(trigger)handleTemplateAction(trigger.dataset.templateAction,trigger.dataset.templateId);if(event.target.classList.contains("template-modal")){if(event.target===editorModal())closeTemplateEditor();else closeModal(event.target)}});
  document.querySelectorAll("[data-preview-device]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-preview-device]").forEach(item=>item.classList.toggle("active",item===button));document.querySelector("#template-preview-stage").className=`template-preview-stage device-${button.dataset.previewDevice}`}));
  document.querySelector("#template-preview-card").addEventListener("change",refreshFullPreview);
  document.querySelector("#corporate-presets").addEventListener("click",event=>{const button=event.target.closest("[data-template-preset]");if(!button)return;const preset=CORPORATE_PRESETS[Number(button.dataset.templatePreset)];setThemeFields({...editorFormData().theme,...preset,mutedTextColor:preset.textColor==="#FFFFFF"?"#E1E1E8":"#686878"});editorDirty=true;refreshTemplateEditor()});
  templateForm().addEventListener("input",event=>{const pickerName=event.target.dataset.colorPicker;if(pickerName){setField(pickerName,event.target.value.toUpperCase());if(pickerName==="textColor")draftMutedTextColor=event.target.value.toUpperCase()}if(event.target.name&&event.target.name.endsWith("Color")&&/^#[0-9A-F]{6}$/i.test(event.target.value)){event.target.value=event.target.value.toUpperCase();const picker=templateForm().querySelector(`[data-color-picker="${event.target.name}"]`);if(picker)picker.value=event.target.value;if(event.target.name==="textColor")draftMutedTextColor=event.target.value}editorDirty=true;refreshTemplateEditor()});
  templateForm().addEventListener("change",event=>{if(event.target.name==="baseTemplateId"){const base=templateService.getTemplateById(event.target.value);if(base)setThemeFields(base.theme)}editorDirty=true;refreshTemplateEditor()});
  templateForm().addEventListener("submit",event=>{event.preventDefault();saveTemplate(false)});
  document.querySelectorAll("[data-template-editor-tab]").forEach(button=>button.addEventListener("click",()=>{document.querySelectorAll("[data-template-editor-tab]").forEach(item=>item.setAttribute("aria-selected",item===button));document.querySelector(".template-editor-body").classList.toggle("show-preview",button.dataset.templateEditorTab==="preview")}));
  ["apply-search","apply-department","apply-status"].forEach(id=>document.querySelector(`#${id}`).addEventListener(id==="apply-search"?"input":"change",renderApplyCards));
  document.querySelector("#apply-target-template").addEventListener("change",renderApplySummary);
  applyForm().addEventListener("change",event=>{if(event.target.name==="applyMode"&&event.target.value==="single"&&selectedCardIds.size>1)selectedCardIds=new Set([[...selectedCardIds][0]]);const cardId=event.target.dataset.cardId;if(cardId){if(event.target.checked){if(applyForm().elements.applyMode.value==="single")selectedCardIds.clear();selectedCardIds.add(cardId)}else selectedCardIds.delete(cardId)}renderApplyCards()});
  document.querySelector("#apply-select-all").addEventListener("change",event=>{filteredApplyCards().forEach(card=>event.target.checked?selectedCardIds.add(card.id):selectedCardIds.delete(card.id));renderApplyCards()});
  applyForm().addEventListener("submit",event=>{event.preventDefault();applySelectedTemplate()});
  document.addEventListener("keydown",handleModalKeys);
  renderTemplatesSection();
}
