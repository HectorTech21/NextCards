import {cardService,emptyCard,normalizeSlug,sanitizePhone,isValidHttpUrl} from "./cards.js?v=1.2.0";
import {renderCardPreview} from "./preview.js?v=1.2.0";
import {templateService} from "./templates-store.js";
import {getSourcedPublicCardUrl} from "./card-export.js";
import {formatPersonName,settingsService} from "./settings-store.js?v=1.2.0";

const overlay=document.querySelector("#editor-overlay");
const dialog=document.querySelector(".editor-dialog");
const form=document.querySelector("#card-form");
const preview=document.querySelector("#live-preview");
const title=document.querySelector("#editor-title");
const indicator=document.querySelector("#save-indicator");
const dangerZone=document.querySelector("#danger-zone");
const photoPreview=document.querySelector("#photo-preview");
const removePhotoButton=document.querySelector("#remove-photo-button");
const photoPositionControl=document.querySelector("#photo-position-control");
const focusableSelector='button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let currentPhoto="";
let autoSlug=true;
let autoCardName=true;
let editorDirty=false;
let editorSettings=settingsService.getSettings();
let previousEditorFocus=null;
let onSaved=()=>{};
let toast=()=>{};

const node=(tag,className,text)=>{const element=document.createElement(tag);if(className)element.className=className;if(text!==undefined)element.textContent=text;return element};

function swatchClass(template){
  const baseId=template.type==="system"?template.id:template.baseTemplateId;
  if(["clean-light","orange-pulse","talent-focus","minimal-corporate"].includes(baseId))return baseId==="orange-pulse"?"light pulse":baseId==="talent-focus"?"light focus":"light";
  if(["meaningful-tech","blue-grid"].includes(baseId))return baseId==="blue-grid"?"tech grid":"tech";
  if(baseId==="executive-lines")return "executive";
  if(baseId==="premium-dark")return "premium";
  return "navy";
}

function addTemplateGroup(picker,label,templates,selectedId){
  if(!templates.length)return;
  picker.append(node("span","template-picker-group",label));
  templates.forEach(template=>{
    const item=node("label",template.status==="archived"?"archived":"");
    const input=document.createElement("input");input.type="radio";input.name="template";input.value=template.id;input.checked=template.id===selectedId;
    const swatch=node("span",`template-swatch ${swatchClass(template)}`);swatch.style.setProperty("--swatch-bg",template.theme.backgroundColor);swatch.style.setProperty("--swatch-accent",template.theme.accentColor);
    const name=node("strong","",template.name),meta=node("small","",`${template.type==="system"?"Sistema":"Personalizada"}${template.isDefault?" · Predeterminada":""}${template.status==="archived"?" · Archivada":""}`);
    item.append(input,swatch,name,meta);picker.append(item);
  });
}

function renderTemplatePicker(requestedId){
  const picker=document.querySelector("#card-template-picker");
  const legend=node("legend","","Plantilla visual");picker.replaceChildren(legend);
  const resolved=templateService.resolveTemplate(requestedId,{warn:false});
  const all=templateService.getTemplates();
  const active=all.filter(template=>template.status==="active");
  const selectedArchived=all.find(template=>template.id===requestedId&&template.status==="archived");
  addTemplateGroup(picker,"Plantillas del sistema",active.filter(template=>template.type==="system"),resolved.id);
  addTemplateGroup(picker,"Plantillas personalizadas",active.filter(template=>template.type==="custom"),resolved.id);
  if(selectedArchived)addTemplateGroup(picker,"Plantilla archivada de esta tarjeta",[selectedArchived],selectedArchived.id);
  return selectedArchived||resolved;
}

function ensureAccentOption(value){
  const picker=form.querySelector(".color-picker");
  picker.querySelector("[data-generated-accent]")?.remove();
  const existing=[...picker.querySelectorAll('input[name="accentColor"]')].find(input=>input.value.toLowerCase()===String(value||"").toLowerCase());
  if(existing)return existing;
  const label=node("label");label.dataset.generatedAccent="true";label.title="Color de la plantilla";
  const input=document.createElement("input");input.type="radio";input.name="accentColor";input.value=value;
  const dot=node("span");dot.style.setProperty("--color",value);
  label.append(input,dot,node("span","sr-only","Color de la plantilla"));picker.append(label);return input;
}

function assign(name,value){
  const field=form.elements.namedItem(name);if(!field)return;
  if(field instanceof RadioNodeList){[...field].forEach(input=>input.checked=input.value===value)}
  else if(field.type==="checkbox")field.checked=Boolean(value);
  else field.value=value??"";
}

function formData(){
  const data=Object.fromEntries(new FormData(form).entries());
  data.photo=currentPhoto;
  data.photoPosition=data.photoPosition||"center";
  data.phone=sanitizePhone(data.phone);data.mobile=sanitizePhone(data.mobile);
  data.visibleFields={
    photo:form.elements.visible_photo.checked,jobTitle:form.elements.visible_jobTitle.checked,
    department:form.elements.visible_department.checked,
    phone:form.elements.visible_phone.checked,email:form.elements.visible_email.checked,
    city:form.elements.visible_city.checked,bio:form.elements.visible_bio.checked,
    linkedin:form.elements.visible_linkedin.checked,website:form.elements.visible_website.checked
  };
  delete data.photoFile;
  Object.keys(data).filter(key=>key.startsWith("visible_")).forEach(key=>delete data[key]);
  return data;
}

function renderPhotoPlaceholder(){
  photoPreview.replaceChildren();
  const span=document.createElement("span");span.dataset.icon="user";photoPreview.append(span);window.NextCardsIcons?.render(photoPreview);
}

function updatePhoto(){
  photoPreview.replaceChildren();
  if(currentPhoto){
    const img=document.createElement("img");img.src=currentPhoto;img.alt="Vista previa de la fotografía";img.style.objectPosition=form.elements.photoPosition.value||"center";img.addEventListener("error",renderPhotoPlaceholder,{once:true});photoPreview.append(img);
  }else renderPhotoPlaceholder();
  removePhotoButton.hidden=!currentPhoto;
  photoPositionControl.hidden=!currentPhoto;
}

function updateCharacterCounts(){
  form.querySelectorAll("[data-character-count]").forEach(counter=>{
    const field=form.elements.namedItem(counter.dataset.characterCount);if(!field)return;
    counter.textContent=`${field.value.length}/${field.maxLength}`;
  });
}

function setDirty(value,message="Cambios sin guardar"){
  editorDirty=value;
  indicator.textContent=value?message:"Todos los cambios guardados";
  indicator.classList.toggle("saved",!value);
}

function refreshPreview({markDirty=true,message}={}){
  renderCardPreview(preview,formData());
  updateCharacterCounts();
  if(markDirty)setDirty(true,message);
}

function errorHolder(field){return field.closest(".form-field")||field.closest("label")}
function errorId(name){return `card-error-${name}`}

function clearFieldError(name){
  const field=form.elements.namedItem(name);if(!field)return;
  field.classList?.remove("invalid");field.removeAttribute?.("aria-invalid");
  const error=errorHolder(field)?.querySelector(".field-error");if(error)error.textContent="";
  const described=(field.getAttribute?.("aria-describedby")||"").split(/\s+/).filter(value=>value&&value!==errorId(name));
  if(described.length)field.setAttribute("aria-describedby",described.join(" "));else field.removeAttribute("aria-describedby");
}

function clearErrors(){
  ["firstName","lastName","jobTitle","department","cardName","slug","email","website","linkedin","customLink"].forEach(clearFieldError);
}

function fieldError(name,message){
  const field=form.elements.namedItem(name);if(!field)return;
  field.classList?.add("invalid");field.setAttribute?.("aria-invalid","true");
  const error=errorHolder(field)?.querySelector(".field-error");
  if(error){error.id=errorId(name);error.textContent=message;const described=new Set((field.getAttribute("aria-describedby")||"").split(/\s+/).filter(Boolean));described.add(error.id);field.setAttribute("aria-describedby",[...described].join(" "))}
}

function validationMessage(name,data=formData()){
  const required={firstName:"Indica el nombre.",lastName:"Indica los apellidos.",jobTitle:"Indica el puesto.",department:"Indica el departamento.",cardName:"Indica un nombre interno.",slug:"Indica una URL pública.",email:"Indica un email válido."};
  const field=form.elements.namedItem(name);
  if(required[name]&&(!String(data[name]||"").trim()||!field.checkValidity()))return required[name];
  if(name==="slug"&&data.slug!==normalizeSlug(data.slug,editorSettings.cards.slug))return editorSettings.cards.slug.lowercase?"Usa sólo minúsculas, números y guiones.":"Usa sólo letras, números y guiones.";
  if(name==="slug"&&cardService.slugExists(data.slug,data.id))return "Esta URL ya está en uso.";
  if(["website","linkedin","customLink"].includes(name)&&!isValidHttpUrl(data[name]))return "Introduce una URL que empiece por https://";
  return "";
}

function validateField(name){
  const message=validationMessage(name);clearFieldError(name);if(message)fieldError(name,message);return !message;
}

function validate(data){
  clearErrors();let valid=true;
  ["firstName","lastName","jobTitle","department","cardName","slug","email","website","linkedin","customLink"].forEach(name=>{const message=validationMessage(name,data);if(message){fieldError(name,message);valid=false}});
  return valid;
}

function suggestedSlug(){
  const full=`${form.elements.firstName.value} ${form.elements.lastName.value}`.trim();
  let candidate=normalizeSlug(full,editorSettings.cards.slug);if(!candidate)return "";
  const id=form.elements.id.value;
  if(cardService.slugExists(candidate,id))candidate=normalizeSlug(`${full} ${form.elements.jobTitle.value}`.trim(),editorSettings.cards.slug);
  if(!candidate)return "";
  const base=candidate;let suffix=2;
  while(cardService.slugExists(candidate,id))candidate=`${base}-${suffix++}`.slice(0,70);
  return candidate;
}

function suggestedCardName(){
  const firstName=form.elements.firstName.value,lastName=form.elements.lastName.value,jobTitle=form.elements.jobTitle.value.trim();
  const displayName=formatPersonName({firstName,lastName},editorSettings);
  const normalized=value=>String(value||"").trim().toLocaleLowerCase("es");
  const samePerson=cardService.all().some(card=>card.id!==form.elements.id.value&&normalized(card.firstName)===normalized(firstName)&&normalized(card.lastName)===normalized(lastName));
  return samePerson&&jobTitle?`${displayName} · ${jobTitle}`:displayName;
}

function populate(card){
  editorSettings=settingsService.getSettings();form.reset();clearErrors();const merged={...emptyCard(),...card,photoPosition:card?.photoPosition||"center"};
  const selectedTemplate=renderTemplatePicker(merged.template);merged.template=selectedTemplate.id;merged.accentColor=merged.accentColor||selectedTemplate.theme.accentColor;
  ensureAccentOption(merged.accentColor);
  Object.entries(merged).forEach(([key,value])=>{if(key!=="visibleFields"&&key!=="photo")assign(key,value)});
  Object.entries(merged.visibleFields||{}).forEach(([key,value])=>assign(`visible_${key}`,value));
  currentPhoto=merged.photo||"";autoSlug=!merged.id&&editorSettings.cards.slug.autoGenerate;autoCardName=!merged.id;
  form.elements.slug.readOnly=!editorSettings.cards.slug.allowManualEdit;form.elements.slug.setAttribute("aria-readonly",String(form.elements.slug.readOnly));
  form.elements.slug.pattern=editorSettings.cards.slug.lowercase?"[a-z0-9]+(?:-[a-z0-9]+)*":"[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*";
  updatePhoto();refreshPreview({markDirty:false});
  title.textContent=merged.id?`Editar · ${formatPersonName(merged,editorSettings)}`:"Nueva tarjeta";
  dangerZone.hidden=!merged.id;setDirty(false);indicator.textContent=merged.id?"Todos los cambios guardados":"Nueva tarjeta";indicator.classList.toggle("saved",Boolean(merged.id));
  document.querySelector(".editor-body").classList.remove("show-preview");
  document.querySelectorAll("[data-editor-tab]").forEach(tab=>tab.setAttribute("aria-selected",String(tab.dataset.editorTab==="form")));
}

function trapEditorFocus(event){
  if(event.key!=="Tab"||overlay.hidden)return;
  const focusable=[...dialog.querySelectorAll(focusableSelector)].filter(element=>element.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
}

export function setupEditor({onChange,showToast}={}){
  onSaved=onChange||onSaved;toast=showToast||toast;
  form.addEventListener("input",event=>{
    if(["firstName","lastName","jobTitle"].includes(event.target.name)&&autoCardName)form.elements.cardName.value=suggestedCardName();
    if(["firstName","lastName","jobTitle"].includes(event.target.name)&&autoSlug)form.elements.slug.value=suggestedSlug();
    if(event.target.name==="cardName")autoCardName=false;
    if(event.target.name==="slug")autoSlug=false;
    if(event.target.classList?.contains("invalid"))validateField(event.target.name);
    refreshPreview();
  });
  form.addEventListener("change",event=>{
    if(event.target.name==="template"){
      const template=templateService.getTemplateById(event.target.value);
      if(template){const accent=ensureAccentOption(template.theme.accentColor);accent.checked=true}
      refreshPreview({message:"Plantilla actualizada · sin guardar"});return;
    }
    if(event.target.name==="photoPosition")updatePhoto();
    refreshPreview();
  });
  form.addEventListener("focusout",event=>{
    const name=event.target.name;if(!name||!["firstName","lastName","jobTitle","department","cardName","slug","email","website","linkedin","customLink"].includes(name))return;
    if(event.target.value||event.target.required)validateField(name);
  });
  form.addEventListener("submit",event=>{event.preventDefault();save("active")});
  form.elements.photoFile.addEventListener("change",event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>1024*1024){toast("La imagen supera 1 MB.","error");event.target.value="";return}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("Formato de imagen no permitido. Usa PNG, JPG o WebP.","error");event.target.value="";return}
    const reader=new FileReader();reader.onload=()=>{currentPhoto=reader.result;updatePhoto();refreshPreview()};reader.onerror=()=>toast("No se ha podido leer la imagen.","error");reader.readAsDataURL(file);
  });
  dialog.addEventListener("click",event=>{
    const action=event.target.closest("[data-action]")?.dataset.action;
    if(action==="close-editor")closeEditor();
    if(action==="save-draft")save("draft");
    if(action==="remove-photo"){currentPhoto="";form.elements.photoFile.value="";updatePhoto();refreshPreview()}
    if(action==="regenerate-slug"){autoSlug=true;form.elements.slug.value=suggestedSlug();clearFieldError("slug");refreshPreview({message:"Slug regenerado · sin guardar"});form.elements.slug.focus()}
    if(action==="delete-current")removeCurrent();
    if(action==="open-current-public")openPublic();
  });
  document.querySelectorAll("[data-editor-tab]").forEach(button=>button.addEventListener("click",()=>{
    document.querySelectorAll("[data-editor-tab]").forEach(tab=>tab.setAttribute("aria-selected",String(tab===button)));
    document.querySelector(".editor-body").classList.toggle("show-preview",button.dataset.editorTab==="preview");
  }));
  document.addEventListener("keydown",event=>{
    if(overlay.hidden)return;
    if(event.key==="Escape"){event.preventDefault();closeEditor();return}
    trapEditorFocus(event);
  });
  window.addEventListener("beforeunload",event=>{if(editorDirty&&!overlay.hidden){event.preventDefault();event.returnValue=""}});
}

function save(forcedStatus){
  const data=formData();if(forcedStatus==="draft")data.status="draft";
  if(!validate(data)){toast("Revisa los campos marcados.","error");form.querySelector(".invalid")?.focus();return}
  try{
    const saved=data.id?cardService.update(data.id,data):cardService.create(data);
    assign("id",saved.id);dangerZone.hidden=false;setDirty(false);indicator.textContent="Guardado ahora";autoSlug=false;autoCardName=false;
    title.textContent=`Editar · ${formatPersonName(saved,editorSettings)}`;
    toast(forcedStatus==="draft"?"Borrador guardado.":"Tarjeta guardada.","success");onSaved(saved);
  }catch(error){toast("No se ha podido guardar la tarjeta. Revisa los datos e inténtalo de nuevo.","error");console.error("Error al guardar la tarjeta",error)}
}

function removeCurrent(){
  const id=form.elements.id.value;if(!id)return;
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){cardService.remove(id);setDirty(false);toast("Tarjeta eliminada.","success");onSaved();closeEditor(true)}
}

function openPublic(){
  const id=form.elements.id.value;
  if(!id){toast("Guarda primero la tarjeta para abrir su enlace público.","error");return}
  if(editorDirty){toast("Guarda los cambios antes de abrir la tarjeta pública.","error");return}
  const card=cardService.get(id);if(!card){toast("No se ha encontrado la tarjeta guardada.","error");return}
  window.open(getSourcedPublicCardUrl(card,"editor_preview"),"_blank","noopener,noreferrer");
}

export function openEditor(id="",{focusTemplate=false}={}){
  const card=id?cardService.get(id):emptyCard();if(!card){toast("No se ha encontrado la tarjeta.","error");return}
  previousEditorFocus=document.activeElement;populate(card);overlay.hidden=false;document.body.style.overflow="hidden";
  setTimeout(()=>{
    if(!focusTemplate){form.elements.firstName.focus();return}
    const picker=document.querySelector("#card-template-picker");picker.classList.add("template-picker-highlight");picker.scrollIntoView({block:"center",behavior:"smooth"});picker.querySelector('input[name="template"]:checked')?.focus();setTimeout(()=>picker.classList.remove("template-picker-highlight"),1800);
  },50);
}

export function closeEditor(force=false){
  if(!force&&editorDirty&&!confirm("Hay cambios sin guardar. ¿Quieres salir y descartarlos?"))return false;
  overlay.hidden=true;document.body.style.overflow="";editorDirty=false;
  if(previousEditorFocus?.isConnected)previousEditorFocus.focus();previousEditorFocus=null;return true;
}

export function deleteFromDashboard(id){
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){cardService.remove(id);toast("Tarjeta eliminada.","success");onSaved()}
}
