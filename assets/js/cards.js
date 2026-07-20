import {storage} from "./storage.js";
import {templateService} from "./templates-store.js";

const uid=()=>globalThis.crypto?.randomUUID?.()||`card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const stamp=()=>new Date().toISOString();

export function normalizeSlug(value=""){
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70);
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
  slugExists(slug,exceptId=""){ return this.all().some(card=>card.slug===slug&&card.id!==exceptId); },
  query({search="",department="",status=""}={}){
    const needle=search.trim().toLowerCase();
    return this.all().filter(card=>{
      const haystack=[card.firstName,card.lastName,card.jobTitle,card.department,card.email].join(" ").toLowerCase();
      return (!needle||haystack.includes(needle))&&(!department||card.department===department)&&(!status||card.status===status);
    });
  }
};

export function emptyCard(){
  const defaultTemplate=templateService.getDefaultTemplate();
  return {
    id:"",slug:"",cardName:"",firstName:"",lastName:"",jobTitle:"",department:"",city:"Madrid",pronouns:"",
    email:"",phone:"",mobile:"",website:"https://lognext.com",linkedin:"",location:"Madrid",customLink:"",bio:"",
    photo:"",template:defaultTemplate.id,accentColor:defaultTemplate.theme.accentColor,status:"active",language:"es",
    visibleFields:{phone:true,email:true,city:true,bio:true,linkedin:true,website:true}
  };
}
