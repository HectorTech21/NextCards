import {cardService,createCardId,emptyCard,normalizeSlug,sanitizePhone,isValidHttpUrl} from "./cards.js?v=1.9.0";
import {storage} from "./storage.js?v=1.9.0";
import {renderCardPreview} from "./preview.js?v=1.7.0";
import {templateService} from "./templates-store.js?v=1.7.0";
import {getSourcedPublicCardUrl} from "./card-export.js";
import {formatPersonName,settingsService} from "./settings-store.js?v=1.9.0";
import {DEFAULT_PHOTO_FRAME,createPhotoFrameImage,normalizePhotoFrame} from "./photo-frame.js?v=1.6.0";
import {closePhotoFrameEditor,isPhotoFrameEditorOpen,openPhotoFrameEditor,setupPhotoFrameEditor} from "./photo-frame-editor.js?v=1.6.0";
import {
  canRenderPhoto,
  deletePhoto,
  deletePhotoIfUnused,
  getPhoto,
  getPhotoErrorMessage,
  getPhotoId,
  isPhotoStorageQuotaError,
  photoOptimizationSummary,
  processPhotoFile,
  savePhoto,
  verifyPhotoBlob,
} from "./photo-storage.js?v=1.6.0";
import {openQrPremium} from "./qr-premium.js?v=1.8.4";
import {createCompletenessContext,evaluateCardCompleteness} from "./card-completeness.js?v=1.9.0";
import {getPhotoVerificationStatuses,renderCompletenessDetails,reportPhotoVerification} from "./card-completeness-ui.js?v=1.9.0";

const overlay=document.querySelector("#editor-overlay");
const dialog=document.querySelector(".editor-dialog");
const form=document.querySelector("#card-form");
const preview=document.querySelector("#live-preview");
const title=document.querySelector("#editor-title");
const indicator=document.querySelector("#save-indicator");
const dangerZone=document.querySelector("#danger-zone");
const photoPreview=document.querySelector("#photo-preview");
const removePhotoButton=document.querySelector("#remove-photo-button");
const adjustPhotoFrameButton=document.querySelector("#adjust-photo-frame-button");
const photoEditorWarning=document.querySelector("#photo-editor-warning");
const photoEditorStatus=document.querySelector("#photo-editor-status");
const photoEditorInfo=document.querySelector("#photo-editor-info");
const photoUploadLabel=document.querySelector("#photo-upload-label");
const focusableSelector='button:not([disabled]),[href],input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let currentPhoto="";
let currentPhotoStorage="";
let currentPhotoId="";
let currentPhotoSchemaVersion=null;
let currentPhotoFrame={...DEFAULT_PHOTO_FRAME};
let temporaryPhotoFrame=null;
let pendingPhoto=null;
let photoProcessing=false;
let saveInProgress=false;
let photoProcessToken=0;
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
  if(baseId==="corporate-solid-navy")return "solid";
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

function previewPhotoSource(){return pendingPhoto?.previewUrl||currentPhoto}

function formData({photoFrame=temporaryPhotoFrame||currentPhotoFrame,forPersistence=false}={}){
  const data=Object.fromEntries(new FormData(form).entries());
  data.photo=forPersistence?currentPhoto:previewPhotoSource();
  data.photoStorage=forPersistence?currentPhotoStorage:"";
  data.photoId=forPersistence?currentPhotoId:"";
  data.photoSchemaVersion=forPersistence?currentPhotoSchemaVersion:null;
  data.photoFrame=normalizePhotoFrame(photoFrame);
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

function setPhotoWarning(message=""){
  photoEditorWarning.textContent=message;photoEditorWarning.hidden=!message;
  form.elements.photoFile.setAttribute("aria-invalid",String(Boolean(message)));
}

function setPhotoStatus(message="",tone="neutral"){
  photoEditorStatus.textContent=message;photoEditorStatus.hidden=!message;photoEditorStatus.dataset.tone=tone;
}

function setPhotoInfo(message=""){
  photoEditorInfo.textContent=message;photoEditorInfo.hidden=!message;
}

function releasePendingPhoto(){
  if(!pendingPhoto)return;
  if(pendingPhoto.previewUrl)URL.revokeObjectURL(pendingPhoto.previewUrl);
  pendingPhoto=null;
}

function setEditorBusy(value,{processing=false}={}){
  saveInProgress=value&&!processing;
  photoProcessing=value&&processing;
  form.elements.photoFile.disabled=value;
  photoUploadLabel.classList.toggle("is-disabled",value);photoUploadLabel.setAttribute("aria-disabled",String(value));
  dialog.querySelectorAll('[data-action="save-draft"],button[type="submit"][form="card-form"]').forEach(button=>button.disabled=value);
  overlay.setAttribute("aria-busy",String(value));
}

function updatePhoto({photoFrame=temporaryPhotoFrame||currentPhotoFrame}={}){
  photoPreview.replaceChildren();
  const source=previewPhotoSource();
  if(source){
    const updateQuality=valid=>{if(reportPhotoVerification(source,valid))renderEditorCompleteness()};
    const img=createPhotoFrameImage(source,{alt:"Vista previa de la fotografía",frame:photoFrame,onLoad:()=>{setPhotoWarning();updateQuality(true)},onError:()=>{updateQuality(false);renderPhotoPlaceholder();setPhotoWarning("No se ha podido cargar la fotografía. Puedes eliminarla o seleccionar otro archivo.")}});photoPreview.append(img);
  }else{renderPhotoPlaceholder();setPhotoWarning()}
  removePhotoButton.hidden=!source;
  adjustPhotoFrameButton.hidden=!source;
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

function renderEditorCompleteness(){
  const data=formData();
  const existingId=form.elements.id.value;
  const draftCard={...data,id:existingId};
  const cards=cardService.all();
  const contextualCards=existingId
    ? cards.map(card=>card.id===existingId?draftCard:card)
    : [...cards,{...draftCard,id:"__editor-draft__"}];
  const context=createCompletenessContext({
    cards:contextualCards,
    templates:templateService.getTemplates(),
    settings:editorSettings,
    photoStatuses:getPhotoVerificationStatuses(),
    allowGeneratedId:!existingId,
  });
  renderCompletenessDetails(document.querySelector("#editor-completeness"),evaluateCardCompleteness(draftCard,context),{interactive:true,showCompleted:false});
  window.NextCardsIcons?.render(document.querySelector("#editor-completeness"));
}

function refreshPreview({markDirty=true,message,photoFrame=temporaryPhotoFrame||currentPhotoFrame}={}){
  renderCardPreview(preview,formData({photoFrame}));
  renderEditorCompleteness();
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
  const required={firstName:"Indica el nombre.",lastName:"Indica los apellidos.",jobTitle:"Indica el puesto.",cardName:"Indica un nombre interno.",slug:"Indica una URL pública.",email:"Indica un email válido."};
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
  photoProcessToken+=1;releasePendingPhoto();setEditorBusy(false);editorSettings=settingsService.getSettings();form.reset();clearErrors();const merged={...emptyCard(),...card};merged.photoFrame=normalizePhotoFrame(card?.photoFrame,card?.photoPosition);
  const selectedTemplate=renderTemplatePicker(merged.template);merged.template=selectedTemplate.id;merged.accentColor=merged.accentColor||selectedTemplate.theme.accentColor;
  ensureAccentOption(merged.accentColor);
  Object.entries(merged).forEach(([key,value])=>{if(!["visibleFields","photo","photoFrame","photoPosition"].includes(key))assign(key,value)});
  Object.entries(merged.visibleFields||{}).forEach(([key,value])=>assign(`visible_${key}`,value));
  currentPhoto=merged.photo||"";currentPhotoId=getPhotoId(merged);currentPhotoStorage=currentPhotoId?"indexeddb":"";currentPhotoSchemaVersion=currentPhotoId?Number(merged.photoSchemaVersion||1):null;
  currentPhotoFrame=normalizePhotoFrame(merged.photoFrame);temporaryPhotoFrame=null;autoSlug=!merged.id&&editorSettings.cards.slug.autoGenerate;autoCardName=!merged.id;
  form.elements.photoFile.value="";setPhotoWarning();setPhotoStatus();setPhotoInfo();
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

function focusCompletenessTarget(target){
  const special={
    photo:photoUploadLabel,
    template:document.querySelector('#card-template-picker input[name="template"]:checked')||document.querySelector('#card-template-picker input[name="template"]'),
    visibleFields:document.querySelector(".visibility-list input"),
    actions:document.querySelector(".visibility-list input"),
    id:form.elements.slug,
  };
  const field=special[target]||form.elements.namedItem(target);
  if(!field)return false;
  document.querySelectorAll("[data-editor-tab]").forEach(tab=>tab.setAttribute("aria-selected",String(tab.dataset.editorTab==="form")));
  document.querySelector(".editor-body").classList.remove("show-preview");
  const highlight=field.closest(".photo-field,.form-field,label,fieldset")||field;
  highlight.classList.remove("completeness-target-highlight");
  field.scrollIntoView({block:"center",behavior:globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches?"auto":"smooth"});
  requestAnimationFrame(()=>{highlight.classList.add("completeness-target-highlight");field.focus({preventScroll:true});setTimeout(()=>highlight.classList.remove("completeness-target-highlight"),1900)});
  return true;
}

async function handlePhotoSelection(file,input){
  if(!file||photoProcessing)return;
  const token=++photoProcessToken;setPhotoWarning();setPhotoStatus("Procesando imagen…","processing");setEditorBusy(true,{processing:true});
  try{
    const processed=await processPhotoFile(file);if(token!==photoProcessToken)return;
    const previewUrl=URL.createObjectURL(processed.blob);releasePendingPhoto();pendingPhoto={...processed,previewUrl,fileName:file.name};
    currentPhotoFrame={...DEFAULT_PHOTO_FRAME};temporaryPhotoFrame=null;setPhotoWarning();setPhotoStatus("Imagen procesada · pendiente de guardar","success");setPhotoInfo(photoOptimizationSummary(processed.info));
    updatePhoto();refreshPreview({message:"Fotografía preparada · sin guardar"});
  }catch(error){
    if(token!==photoProcessToken)return;
    const message=getPhotoErrorMessage(error);setPhotoWarning(message);setPhotoStatus(message,"error");toast(message,"error");input.value="";
  }finally{
    if(token===photoProcessToken)setEditorBusy(false);
  }
}

export function setupEditor({onChange,showToast}={}){
  onSaved=onChange||onSaved;toast=showToast||toast;
  setupPhotoFrameEditor({
    editorOverlay:overlay,
    onPreview:frame=>{temporaryPhotoFrame=normalizePhotoFrame(frame);updatePhoto({photoFrame:temporaryPhotoFrame});refreshPreview({markDirty:false,photoFrame:temporaryPhotoFrame})},
    onApply:frame=>{currentPhotoFrame=normalizePhotoFrame(frame);temporaryPhotoFrame=null;updatePhoto();refreshPreview({message:"Encuadre actualizado · sin guardar"})},
    onCancel:()=>{temporaryPhotoFrame=null;updatePhoto();refreshPreview({markDirty:false,photoFrame:currentPhotoFrame})},
  });
  form.addEventListener("input",event=>{
    if(["firstName","lastName","jobTitle"].includes(event.target.name)&&autoCardName)form.elements.cardName.value=suggestedCardName();
    if(["firstName","lastName","jobTitle"].includes(event.target.name)&&autoSlug)form.elements.slug.value=suggestedSlug();
    if(event.target.name==="cardName")autoCardName=false;
    if(event.target.name==="slug")autoSlug=false;
    if(event.target.classList?.contains("invalid"))validateField(event.target.name);
    refreshPreview();
  });
  form.addEventListener("change",event=>{
    if(event.target===form.elements.photoFile)return;
    if(event.target.name==="template"){
      const template=templateService.getTemplateById(event.target.value);
      if(template){const accent=ensureAccentOption(template.theme.accentColor);accent.checked=true}
      refreshPreview({message:"Plantilla actualizada · sin guardar"});return;
    }
    refreshPreview();
  });
  form.addEventListener("focusout",event=>{
    const name=event.target.name;if(!name||!["firstName","lastName","jobTitle","department","cardName","slug","email","website","linkedin","customLink"].includes(name))return;
    if(event.target.value||event.target.required)validateField(name);
  });
  form.addEventListener("submit",event=>{event.preventDefault();void save("active")});
  form.elements.photoFile.addEventListener("change",event=>{const file=event.target.files[0];if(file)void handlePhotoSelection(file,event.target)});
  photoUploadLabel.addEventListener("keydown",event=>{if(!photoProcessing&&!saveInProgress&&["Enter"," "].includes(event.key)){event.preventDefault();form.elements.photoFile.click()}});
  dialog.addEventListener("click",event=>{
    const qualityTarget=event.target.closest("[data-completeness-target]");
    if(qualityTarget){focusCompletenessTarget(qualityTarget.dataset.completenessTarget);return}
    const action=event.target.closest("[data-action]")?.dataset.action;
    if(action==="close-editor")closeEditor();
    if(action==="save-draft")void save("draft");
    if(action==="adjust-photo-frame"){
      const template=templateService.resolveTemplate(form.elements.template.value,{warn:false});
      openPhotoFrameEditor({src:previewPhotoSource(),frame:currentPhotoFrame,shape:template.theme.photoShape,opener:adjustPhotoFrameButton});
    }
    if(action==="remove-photo"){photoProcessToken+=1;releasePendingPhoto();currentPhoto="";currentPhotoStorage="";currentPhotoId="";currentPhotoSchemaVersion=null;currentPhotoFrame={...DEFAULT_PHOTO_FRAME};temporaryPhotoFrame=null;form.elements.photoFile.value="";setPhotoWarning();setPhotoInfo();setPhotoStatus("Fotografía eliminada · pendiente de guardar","neutral");updatePhoto();refreshPreview()}
    if(action==="regenerate-slug"){autoSlug=true;form.elements.slug.value=suggestedSlug();clearFieldError("slug");refreshPreview({message:"Slug regenerado · sin guardar"});form.elements.slug.focus()}
    if(action==="delete-current")void removeCurrent();
    if(action==="open-current-public")openPublic();
    if(action==="open-current-qr")openPremiumQr(event.target.closest("[data-action]"));
  });
  document.querySelectorAll("[data-editor-tab]").forEach(button=>button.addEventListener("click",()=>{
    document.querySelectorAll("[data-editor-tab]").forEach(tab=>tab.setAttribute("aria-selected",String(tab===button)));
    document.querySelector(".editor-body").classList.toggle("show-preview",button.dataset.editorTab==="preview");
  }));
  document.addEventListener("keydown",event=>{
    if(overlay.hidden)return;
    if(isPhotoFrameEditorOpen())return;
    if(event.key==="Escape"){event.preventDefault();closeEditor();return}
    trapEditorFocus(event);
  });
  window.addEventListener("beforeunload",event=>{if(editorDirty&&!overlay.hidden){event.preventDefault();event.returnValue=""}});
}

async function save(forcedStatus){
  if(photoProcessing){toast("Espera a que termine el procesamiento de la imagen.","error");return}
  if(saveInProgress)return;
  const data=formData({forPersistence:true});if(forcedStatus==="draft")data.status="draft";
  if(!validate(data)){toast("Revisa los campos marcados.","error");form.querySelector(".invalid")?.focus();return}
  const existingId=form.elements.id.value;const isExisting=Boolean(existingId);const cardsBefore=cardService.all();const beforeCard=isExisting?cardService.get(existingId):null;
  const hadPendingPhoto=Boolean(pendingPhoto);let storedPhoto=null;let cardWasSaved=false;setEditorBusy(true);indicator.textContent=hadPendingPhoto?"Guardando imagen…":"Guardando…";
  try{
    if(hadPendingPhoto){
      setPhotoStatus("Guardando imagen…","processing");const cardId=existingId||createCardId();
      storedPhoto=await savePhoto(cardId,pendingPhoto.blob,{metadata:pendingPhoto.info});const storedRecord=await getPhoto(storedPhoto.photoId);
      if(!storedRecord?.blob)throw Object.assign(new Error("No se pudo confirmar la fotografía guardada."),{code:"PHOTO_STORAGE_FAILED"});
      await verifyPhotoBlob(storedRecord.blob);Object.assign(data,storedPhoto,{id:cardId});
    }
    const saved=isExisting?cardService.update(existingId,data):cardService.create(data);cardWasSaved=true;
    if(hadPendingPhoto&&!(await canRenderPhoto(saved)))throw Object.assign(new Error("No se pudo guardar la imagen"),{code:"PHOTO_RENDER_FAILED"});

    currentPhoto=saved.photo||"";currentPhotoId=getPhotoId(saved);currentPhotoStorage=currentPhotoId?"indexeddb":"";currentPhotoSchemaVersion=currentPhotoId?Number(saved.photoSchemaVersion||1):null;
    currentPhotoFrame=normalizePhotoFrame(saved.photoFrame);temporaryPhotoFrame=null;assign("id",saved.id);dangerZone.hidden=false;setDirty(false);indicator.textContent="Guardado ahora";autoSlug=false;autoCardName=false;
    title.textContent=`Editar · ${formatPersonName(saved,editorSettings)}`;
    const optimization=pendingPhoto?.info;releasePendingPhoto();updatePhoto();refreshPreview({markDirty:false});onSaved(saved);

    const previousPhotoId=getPhotoId(beforeCard);if(previousPhotoId&&previousPhotoId!==currentPhotoId){
      try{await deletePhotoIfUnused(beforeCard,cardService.all())}catch(error){console.warn("No se pudo limpiar la fotografía reemplazada.",error)}
    }
    if(hadPendingPhoto){setPhotoStatus("Imagen actualizada","success");setPhotoInfo(photoOptimizationSummary(optimization));toast("Imagen actualizada","success")}
    else if(beforeCard?.photo&&!saved.photo){setPhotoStatus("Fotografía eliminada","success");setPhotoInfo();toast("Fotografía eliminada y tarjeta guardada.","success")}
    else toast(forcedStatus==="draft"?"Borrador guardado.":"Tarjeta guardada.","success");
  }catch(error){
    if(cardWasSaved){try{storage.saveCards(cardsBefore)}catch(rollbackError){console.error("No se pudo revertir la tarjeta tras el fallo de imagen.",rollbackError)}}
    if(storedPhoto){try{await deletePhoto(storedPhoto.photoId)}catch(cleanupError){console.warn("No se pudo limpiar una fotografía no confirmada.",cleanupError)}}
    const message=hadPendingPhoto||isPhotoStorageQuotaError(error)?getPhotoErrorMessage(error):"No se pudo guardar la tarjeta. Revisa los datos e inténtalo de nuevo.";
    setPhotoStatus(message,"error");setPhotoWarning(message);indicator.textContent="Cambios sin guardar";toast(message,"error");console.error("Error al guardar la tarjeta",error);
  }finally{setEditorBusy(false)}
}

async function removeCurrent(){
  const id=form.elements.id.value;if(!id)return;
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){try{await cardService.remove(id);setDirty(false);toast("Tarjeta eliminada.","success");onSaved();closeEditor(true)}catch(error){toast("No se pudo eliminar la tarjeta y su fotografía.","error");console.error("Error al eliminar la tarjeta",error)}}
}

function openPublic(){
  const id=form.elements.id.value;
  if(!id){toast("Guarda primero la tarjeta para abrir su enlace público.","error");return}
  if(editorDirty){toast("Guarda los cambios antes de abrir la tarjeta pública.","error");return}
  const card=cardService.get(id);if(!card){toast("No se ha encontrado la tarjeta guardada.","error");return}
  window.open(getSourcedPublicCardUrl(card,"editor_preview"),"_blank","noopener,noreferrer");
}

function openPremiumQr(opener){
  const id=form.elements.id.value;
  if(!id){toast("Guarda primero la tarjeta para crear su QR premium.","error");return}
  if(editorDirty){toast("Guarda los cambios antes de crear el QR premium.","error");return}
  const card=cardService.get(id);if(!card){toast("No se ha encontrado la tarjeta guardada.","error");return}
  openQrPremium({
    card,
    url:getSourcedPublicCardUrl(card,"qr"),
    settings:settingsService.getSettings(),
    opener,
    allowSave:true,
  });
}

export function openEditor(id="",{focusTemplate=false,focusField=""}={}){
  if(isPhotoFrameEditorOpen())closePhotoFrameEditor();
  const card=id?cardService.get(id):emptyCard();if(!card){toast("No se ha encontrado la tarjeta.","error");return}
  previousEditorFocus=document.activeElement;populate(card);overlay.hidden=false;document.body.style.overflow="hidden";
  setTimeout(()=>{
    if(focusField){focusCompletenessTarget(focusField);return}
    if(!focusTemplate){form.elements.firstName.focus();return}
    const picker=document.querySelector("#card-template-picker");picker.classList.add("template-picker-highlight");picker.scrollIntoView({block:"center",behavior:"smooth"});picker.querySelector('input[name="template"]:checked')?.focus();setTimeout(()=>picker.classList.remove("template-picker-highlight"),1800);
  },50);
}

export function closeEditor(force=false){
  if(isPhotoFrameEditorOpen())closePhotoFrameEditor();
  if(saveInProgress){toast("Espera a que termine el guardado.","error");return false}
  if(!force&&editorDirty&&!confirm("Hay cambios sin guardar. ¿Quieres salir y descartarlos?"))return false;
  photoProcessToken+=1;releasePendingPhoto();setEditorBusy(false);form.elements.photoFile.value="";overlay.hidden=true;document.body.style.overflow="";editorDirty=false;
  if(previousEditorFocus?.isConnected)previousEditorFocus.focus();previousEditorFocus=null;return true;
}

export async function deleteFromDashboard(id){
  if(confirm("¿Eliminar esta tarjeta definitivamente?")){try{await cardService.remove(id);toast("Tarjeta eliminada.","success");onSaved()}catch(error){toast("No se pudo eliminar la tarjeta y su fotografía.","error");console.error("Error al eliminar la tarjeta",error)}}
}
