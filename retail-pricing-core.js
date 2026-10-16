// COP prices: markup over wholesale, rounded once to the nearest peso.
export const RETAIL_PERCENT_KEY = 'Minorista_Ganancia_Porcentaje';
export const RETAIL_MODE_KEY = 'Modo Precio Minorista';
export function percentage(value) {
  const raw=String(value ?? '').trim().replace(',', '.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Escribe un porcentaje válido entre 0 y 1000, con hasta dos decimales.');
  const n=Number(raw);if(n>1000)throw new Error('El porcentaje máximo es 1000.');return n;
}
export function retailMode(product) {
  const value=product?.[RETAIL_MODE_KEY];
  if(value==='manual'||value==='porcentaje')return value;
  return Number(product?.Precio)>0?'manual':'porcentaje';
}
export function retailPrice(wholesale, percent) {
  const base=Number(wholesale);if(!Number.isFinite(base)||base<=0)return 0;
  return Math.round(base*(1+percentage(percent)/100));
}
export function applyRetailPricing(product,percent) {
  const mode=retailMode(product);product[RETAIL_MODE_KEY]=mode;
  if(mode==='porcentaje')product.Precio=retailPrice(product['Precio Mayor']??product.Precio_Mayorista??0,percent);
  return product;
}
