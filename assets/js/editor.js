import {cardService,emptyCard,normalizeSlug,sanitizePhone,isValidHttpUrl} from "./cards.js";
import {renderCardPreview} from "./preview.js";
import {templateService} from "./templates-store.js";
import {getSourcedPublicCardUrl} from "./card-export.js";

const overlay=document.querySelector("#editor-overlay");
const dialog=document.querySelector(".editor-dialog");
const form=document.querySelector("#card-form");
const preview=document.querySelector("#live-preview");
const title=document.querySelector("#editor-title");
const indicator=document.querySelector("#save-indicator");
const dangerZone=document.querySelector("#danger-zone");
const photoPreview=document.querySelector("#photo-preview");
let currentPhoto="";
let autoSlug=true;
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
  const field=form.elements.namedItem(name); if(!field)return;
  if(field instanceof RadioNodeList){[...field].forEach(input=>input.checked=input.value===value)}
  else if(field.type==="checkbox")field.checked=Boolean(value);
  else field.value=value??"";
}

function formData(){
  const data=Object.fromEntries(new FormData(form).entries());
  data.photo=currentPhoto;
  data.phone=sanitizePhone(data.phone);data.mobile=sanitizePhone(data.mobile);
  data.visibleFields={
    phone:form.elements.visible_phone.checked,email:form.elements.visible_email.checked,
    city:form.elements.visible_city.checked,bio:form.elements.visible_bio.checked,
    linkedin:form.elements.visible_linkedin.checked,website:form.elements.visible_website.checked
  };
  delete data.photoFile;
  Object.keys(data).filter(key=>key.startsWith("visible_")).forEach(key=>delete data[key]);
  return data;
}

function updatePhoto(){
  photoPreview.replaceChildren();
  if(currentPhoto){const img=document.createElement("img");img.src=currentPhoto;img.alt="Vista previa de la fotografía";photoPreview.append(img)}
  else{const span=document.createElement("span");span.dataset.icon="user";photoPreview.append(span);window.NextCardsIcons?.render(photoPreview)}
}

function refreshPreview(){ renderCardPreview(preview,formData());indicator.textContent="Cambios sin guardar"; }

function clearErrors(){
  form.querySelectorAll(".field-error").forEach(node=>node.textContent="");
  form.querySelectorAll(".invalid").forEach(node=>node.classList.remove("invalid"));
}

function fieldError(name,message){
  const field=form.elements.namedItem(name); if(!field)return;
  field.classList?.add("invalid");
  const label=field.closest("label");const error=label?.querySelector(".field-error");if(error)error.textContent=message;
}

function validate(data){
  clearErrors();let valid=true;
  [["firstName","Indica el nombre."],["lastName","Indica los apellidos."],["jobTitle","Indica el puesto."],["department","Indica el departamento."],["cardName","Indica un nombre interno."],["slug","Indica una URL pública."],["email","Indica un email válido."]].forEach(([name,message])=>{
    const field=form.elements.namedItem(name);if(!field.value.trim()||!field.checkValidity()){fieldError(name,message);valid=false}
  });
  if(data.slug!==normalizeSlug(data.slug)){fieldError("slug","Usa sólo minúsculas, números y guiones.");valid=false}
  if(cardService.slugExists(data.slug,data.id)){fieldError("slug","Esta URL ya está en uso.");valid=false}
  ["website","linkedin","customLink"].forEach(name=>{if(!isValidHttpUrl(data[name])){fieldError(name,"Introduce una URL que empiece por https://");valid=false}});
  return valid;
}

function populate(card){
  form.reset();clearErrors();const merged={...emptyCard(),...card};
  const selectedTemplate=renderTemplatePicker(merged.template);
  merged.template=selectedTemplate.id;
  merged.accentColor=merged.accentColor||selectedTemplate.theme.accentColor;
  ensureAccentOption(merged.accentColor);
  Object.entries(merged).forEach(([key,value])=>{if(key!=="visibleFields"&&key!=="photo")assign(key,value)});
  Object.entries(merged.visibleFields||{}).forEach(([key,value])=>assign(`visible_${key}`,value));
  currentPhoto=merged.photo||"";autoSlug=!merged.slug;updatePhoto();refreshPreview();
  title.textContent=merged.id?`Editar · ${merged.firstName} ${merged.lastName}`:"Nueva tarjeta";
  dangerZone.hidden=!merged.id;indicator.textContent=merged.id?"Todos los cambios guardados":"Nueva tarjeta";
}

export function setupEditor({onChange,showToast}={}){
  onSaved=onChange||onSaved;toast=showToast||toast;
  form.addEventListener("input",event=>{
    if(event.target.name==="firstName"||event.target.name==="lastName"){
      const full=`${form.elements.firstName.value} ${form.elements.lastName.value}`.trim();
      if(!form.elements.cardName.value||autoSlug)form.elements.cardName.value=full;
      if(autoSlug)form.elements.slug.value=normalizeSlug(full);
    }
    if(event.target.name==="slug")autoSlug=false;
    refreshPreview();
  });
  form.addEventListener("change",event=>{
    if(event.target.name==="template"){
      const template=templateService.getTemplateById(event.target.value);
      if(template){const accent=ensureAccentOption(template.theme.accentColor);accent.checked=true}
    }
    refreshPreview();
  });
  form.addEventListener("submit",event=>{event.preventDefault();save("active")});
  form.elements.photoFile.addEventListener("change",event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>1024*1024){toast("La imagen supera 1 MB.","error");event.target.value="";return}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){toast("Formato de imagen no permitido.","error");return}
    const reader=new FileReader();reader.onload=()=>{currentPhoto=reader.result;updatePhoto();refreshPreview()};reader.readAsDataURL(file);
  });
  dialog.addEventListener("click",event=>{
    const action=event.target.closest("[data-action]")?.dataset.action;
    if(action==="close-editor")closeEditor();
    if(action==="save-draft")save("draft");
    if(action==="remove-photo"){currentPhoto="";form.elements.photoFile.value="";updatePhoto();refreshPreview()}
    if(action==="delete-current")removeCurrent();
    if(action==="open-current-public")openPublic();
  });
  document.querySelectorAll("[data-editor-tab]").forEach(button=>button.addEventListener("click",()=>{
    document.querySelectorAll("[data-editor-tab]").forEach(tab=>{const selected=tab===button;tab.setAttribute("aria-selected",selected)});
    document.querySelector(".editor-body").classList.toggle("show-preview",button.dataset.editorTab==="preview");
  }));
  document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!overlay.hidden)closeEditor()});
}

function save(forcedStatus){
  const data=formData();if(forcedStatus==="draft")data.status="draft";
  if(!validate(data)){toast("Revisa los campos marcados.","error");form.querySelector(".invalid")?.focus();return}
  try{
    const saved=data.id?cardService.update(data.id,data):cardService.create(data);
    assign("id",saved.id);dangerZone.hidden=false;indicator.textContent="Guardado ahora";
    title.textContent=`Editar · ${saved.firstName} ${saved.lastName}`;
    toast(forcedStatus==="draft"?"Borrador guardado.":"Tarjeta guardada.","success");onSaved(saved);
  }catch(error){toast(error.message,"error")}
}

function removeCurrent(){
  const id=form.elements.id.value;if(!id)return;
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){cardService.remove(id);toast("Tarjeta eliminada.","success");onSaved();closeEditor()}
}
function openPublic(){
  const slug=form.elements.slug.value;if(!slug){toast("Define primero la URL pública.","error");return}
  window.open(getSourcedPublicCardUrl({slug},"editor_preview"),"_blank","noopener,noreferrer");
}
export function openEditor(id="",{focusTemplate=false}={}){
  autoSlug=!id;populate(id?cardService.get(id):emptyCard());overlay.hidden=false;document.body.style.overflow="hidden";
  setTimeout(()=>{
    if(!focusTemplate){form.elements.firstName.focus();return}
    const picker=document.querySelector("#card-template-picker");
    picker.classList.add("template-picker-highlight");
    picker.scrollIntoView({block:"center",behavior:"smooth"});
    picker.querySelector('input[name="template"]:checked')?.focus();
    setTimeout(()=>picker.classList.remove("template-picker-highlight"),1800);
  },50);
}
export function closeEditor(){overlay.hidden=true;document.body.style.overflow=""}
export function deleteFromDashboard(id){
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){cardService.remove(id);toast("Tarjeta eliminada.","success");onSaved()}
}
