import {storage} from "./storage.js?v=1.2.0";
import {templateService} from "./templates-store.js";
import {settingsService} from "./settings-store.js?v=1.2.0";

const uid=()=>globalThis.crypto?.randomUUID?.()||`card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const stamp=()=>new Date().toISOString();

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
    const card={...data,id:uid(),createdAt:stamp(),updatedAt:stamp()};
    cards.unshift(card); storage.saveCards(cards); return card;
  },
  update(id,data){
    const cards=this.all(); const index=cards.findIndex(card=>card.id===id);
    if(index<0) throw new Error("No se ha encontrado la tarjeta.");
    cards[index]={...cards[index],...data,id,updatedAt:stamp()}; storage.saveCards(cards); return cards[index];
  },
  remove(id){ storage.saveCards(this.all().filter(card=>card.id!==id)); },
  duplicate(id){
    const source=this.get(id); if(!source) throw new Error("No se ha encontrado la tarjeta.");
    const cards=this.all(); let suffix=2; let slug=`${source.slug}-copia`;
    while(cards.some(card=>card.slug===slug)) slug=`${source.slug}-copia-${suffix++}`;
    return this.create({...source,id:undefined,slug,cardName:`${source.cardName} (copia)`,status:"draft"});
  },
  toggleDisabled(id){
    const card=this.get(id); if(!card) return;
    return this.update(id,{status:card.status==="disabled"?"draft":"disabled"});
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
    photo:"",photoPosition:"center",template:defaultTemplate.id,accentColor:defaultTemplate.theme.accentColor,status:settings.cards.defaultStatus,language:"es",
    visibleFields:{...settings.cards.defaultVisibleFields}
  };
}
