import {storage} from "./storage.js?v=1.9.0";
import {templateService} from "./templates-store.js?v=1.7.0";
import {settingsService} from "./settings-store.js?v=1.10.1";
import {DEFAULT_PHOTO_FRAME,normalizeCardPhotoFrame} from "./photo-frame.js?v=1.6.0";
import {deletePhotoIfUnused,normalizeCardPhotoFields} from "./photo-storage.js?v=1.6.0";
import {normalizeCardQrStyle} from "./qr-premium-core.js?v=1.8.1";

const uid=()=>globalThis.crypto?.randomUUID?.()||`card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const stamp=()=>new Date().toISOString();
const normalizeCard=card=>{
  const normalized=normalizeCardQrStyle(normalizeCardPhotoFields(normalizeCardPhotoFrame(card)));
  ["score","completion","completionScore","completeness","completenessScore","qualityScore","cardHealth"].forEach(key=>delete normalized[key]);
  return normalized;
};

export const createCardId=()=>uid();

export function normalizeSlug(value="",options={}){
  const lowercase=options.lowercase!==false,spacesToHyphens=options.spacesToHyphens!==false;
  let normalized=String(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  if(lowercase)normalized=normalized.toLowerCase();
  normalized=normalized.replace(/\s+/g,spacesToHyphens?"-":"");
  return normalized.replace(lowercase?/[^a-z0-9-]+/g:/[^A-Za-z0-9-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").slice(0,70);
}

export function sanitizePhone(value=""){ return value.replace(/[^\d+()\s-]/g,"").trim(); }

export function isValidHttpUrl(value=""){
  if(!value) return true;
  try{ const url=new URL(value); return ["http:","https:"].includes(url.protocol); }catch{ return false; }
}

export const cardService = {
  all(){ return storage.getCards(); },
  get(identifier){ return this.all().find(card=>card.id===identifier||card.slug===identifier); },
  create(data){
    const cards=this.all();
    const card=normalizeCard({...data,id:String(data.id||"").trim()||uid(),createdAt:stamp(),updatedAt:stamp()});
    cards.unshift(card); storage.saveCards(cards); return card;
  },
  update(id,data){
    const cards=this.all(); const index=cards.findIndex(card=>card.id===id);
    if(index<0) throw new Error("No se ha encontrado la tarjeta.");
    cards[index]=normalizeCard({...cards[index],...data,id,updatedAt:stamp()}); storage.saveCards(cards); return cards[index];
  },
  async remove(id){
    const current=this.get(id);if(!current)return false;
    const remaining=this.all().filter(card=>card.id!==id);
    storage.markSeedDeleted(id);storage.saveCards(remaining);
    await deletePhotoIfUnused(current,remaining);
    return true;
  },
  duplicate(id){
    const source=this.get(id); if(!source) throw new Error("No se ha encontrado la tarjeta.");
    const cards=this.all(); let suffix=2; let slug=`${source.slug}-copia`;
    while(cards.some(card=>card.slug===slug)) slug=`${source.slug}-copia-${suffix++}`;
    return this.create({...source,id:undefined,slug,cardName:`${source.cardName} (copia)`,status:"draft"});
  },
  toggleDisabled(id){
    const card=this.get(id); if(!card) return;
    return this.update(id,{status:card.status==="disabled"?"active":"disabled"});
  },
  slugExists(slug,exceptId=""){ const normalized=String(slug).toLowerCase();return this.all().some(card=>String(card.slug).toLowerCase()===normalized&&card.id!==exceptId); },
  query({search="",department="",status=""}={}){
    const needle=search.trim().toLowerCase();
    return this.all().filter(card=>{
      const haystack=[card.firstName,card.lastName,card.jobTitle,card.department,card.email].join(" ").toLowerCase();
      return (!needle||haystack.includes(needle))&&(!department||card.department===department)&&(!status||card.status===status);
    });
  }
};

export function emptyCard(){
  const settings=settingsService.getSettings();
  const defaultTemplate=templateService.getDefaultTemplate();
  return {
    id:"",slug:"",cardName:"",firstName:"",lastName:"",jobTitle:"",department:"",city:"Madrid",pronouns:"",
    email:"",phone:"",mobile:"",website:settings.publicCard.companyUrl,linkedin:"",location:"Madrid",customLink:"",bio:"",
    photo:"",photoFrame:{...DEFAULT_PHOTO_FRAME},template:defaultTemplate.id,accentColor:defaultTemplate.theme.accentColor,status:settings.cards.defaultStatus,language:"es",
    visibleFields:{...settings.cards.defaultVisibleFields},qrStyle:null
  };
}
