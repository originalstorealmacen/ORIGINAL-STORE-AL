/* Business contact only. Customer and recipient phone numbers are never rewritten. */
(()=>{
 const phone='573223774422',display='+57 322 3774422';
 const legacy=new Set(['573112368622','3112368622','573222431225','3222431225']);
 const keys=new Set(['WhatsApp_Comercial','Contacto_WhatsApp','Factura_Telefono']);
 function value(key,input){
  if(!keys.has(key))return input;
  const digits=String(input??'').replace(/\D/g,'');
  return !digits||legacy.has(digits)?(key==='Factura_Telefono'?display:phone):input;
 }
 function config(source){const out={...source};for(const key of keys)out[key]=value(key,out[key]);return out;}
 window.OriginalStoreBrand={phone,display,value,config};
})();
