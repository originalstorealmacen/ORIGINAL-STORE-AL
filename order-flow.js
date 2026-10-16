/* Shared vocabulary for requests, quotes and online purchases. */
(()=>{
 const labels={wholesale:{add:'Añadir al pedido',title:'Mi pedido',submit:'Enviar pedido mayorista',document:'Pedido mayorista'},quote:{add:'Añadir a cotización',title:'Mi cotización',submit:'Solicitar cotización',document:'Cotización minorista'},retail:{add:'Añadir al carrito',title:'Mi carrito',submit:'Continuar al pago',document:'Pedido minorista'}};
 function kindOf(record={}){if(labels[record['Tipo Solicitud']])return record['Tipo Solicitud'];if(/consulta|cotiza/i.test([record['Estado Pedido'],record['Método Contacto'],record['Metodo Contacto']].join(' ')))return 'quote';return /mayor|wholesale/i.test(record['Tipo Cliente']||'')?'wholesale':'retail';}
 function kind({mode,items=[],visible=true,payments=true}){return mode==='wholesale'?'wholesale':(!visible||!payments||items.some(p=>!Number.isFinite(Number(p.price??p.precio))||Number(p.price??p.precio)<=0)?'quote':'retail');}
 window.OriginalStoreOrderFlow={labels,kind,kindOf};
})();
