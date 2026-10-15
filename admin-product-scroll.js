/* Keep the independent columns fitted below the actual header, including edit dialogs. */
(() => {
 const desktop=matchMedia('(min-width:1301px)');let scheduled=false;
 function fit(){
  scheduled=false;const grid=document.getElementById('products-form-pane');if(!grid)return;
  if(!desktop.matches){grid.style.removeProperty('--product-scroll-height');return;}
  if(!grid.getClientRects().length)return;
  const rect=grid.getBoundingClientRect(),card=grid.closest('#edit-product-modal')?.querySelector(':scope > .modal-card');
  const bottom=card?Math.min(window.innerHeight-20,card.getBoundingClientRect().bottom-(parseFloat(getComputedStyle(card).paddingBottom)||0)-2):window.innerHeight-20;
  const height=Math.max(220,Math.floor(bottom-rect.top));
  const next=height+'px';if(grid.style.getPropertyValue('--product-scroll-height')!==next)grid.style.setProperty('--product-scroll-height',next);
 }
 function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(fit);}}
 function initialize(){
  const grid=document.getElementById('products-form-pane');if(!grid)return;
  const observer=new ResizeObserver(schedule);
  for(const node of [grid.parentElement,document.querySelector('.dashboard-header'),document.querySelector('.product-work-tabs'),document.querySelector('.edit-modal-header'),document.querySelector('#edit-product-modal > .modal-card')])if(node)observer.observe(node);
  const modal=document.getElementById('edit-product-modal');if(modal)new MutationObserver(schedule).observe(modal,{attributes:true,attributeFilter:['class','style']});
  window.addEventListener('resize',schedule,{passive:true});window.addEventListener('scroll',schedule,{passive:true,capture:true});desktop.addEventListener('change',schedule);schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();
