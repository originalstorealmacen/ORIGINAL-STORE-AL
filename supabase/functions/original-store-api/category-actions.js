import {createHash} from 'node:crypto';
function normalizeSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function normalizeInventoryCategoryWord(word) {
    const singularMap = {
        anillos: 'anillo',
        aretes: 'arete',
        collares: 'collar',
        pulseras: 'pulsera',
        dijes: 'dije',
        billeteras: 'billetera',
        monederos: 'monedero',
        bolsos: 'bolso',
        maletas: 'maleta',
        botillos: 'botillo',
        termos: 'termo',
        cepillos: 'cepillo',
        espejos: 'espejo',
        cosmetiqueras: 'cosmetiquera',
        maquillajes: 'maquillaje',
        caimanes: 'caiman',
        cadenas: 'cadena',
        escolares: 'escolar',
        juegos: 'juego',
        estuches: 'estuche',
        joyeros: 'joyero',
        llaveros: 'llavero',
        lamparas: 'lampara',
        relojes: 'reloj',
        peluches: 'peluche'
    };
    const cleanWord = normalizeSearchText(word).replace(/[^a-z0-9]+/g, '');
    if (!cleanWord) return '';
    if (singularMap[cleanWord]) return singularMap[cleanWord];
    if (cleanWord.length > 4 && cleanWord.endsWith('s')) return cleanWord.slice(0, -1);
    return cleanWord;
}

function normalizeInventoryCategoryKey(value) {
    const base = normalizeSearchText(value);
    if (base === 'todos' || base === 'all') return 'todos';
    return base
        .replace(/\s*\/\s*/g, '/')
        .split('/')
        .map(part => part
            .split(/\s+/)
            .map(normalizeInventoryCategoryWord)
            .filter(Boolean)
            .join(' '))
        .filter(Boolean)
        .join('/');
}


export async function categoryAction({body,authorize,getDataset,controller,checkpoint}) {
 if(!await authorize())return {ok:false,error:'Inicia sesión como administrador.'};
 const category=normalizeInventoryCategoryKey(body.category);
 if(!category||category.length>100||['banner','todos'].includes(category))return {ok:false,error:'Selecciona una categoría válida del inventario.'};
 const dataset=getDataset('Productos');
 const rows=dataset.rows.filter(row=>normalizeInventoryCategoryKey(row.record['Categoría']||row.record.Categoria||row.record.categoria||'Sin categoría')===category);
 const signature=createHash('sha256').update(JSON.stringify([category,rows.map(r=>[r.id,r.record])])).digest('hex');
 const products=new Set(rows.map(r=>String(r.record['ID Producto']||r.id))).size;
 if(body.action==='categorydeletepreview')return {ok:true,category,records:rows.length,products,signature};
 if(normalizeInventoryCategoryKey(body.confirmation)!==category)return {ok:false,error:'Escribe el nombre de la categoría para confirmar la eliminación.'};
 if(body.signature!==signature)return {ok:false,error:'Los productos de esta categoría cambiaron. Vuelve a revisar y confirmar; no se eliminó ningún producto.'};
 const config=getDataset('Configuracion');
 const prior=config.rows.find(r=>r.record.Clave==='Home_Removed_Category_Defaults_JSON')?.record.Valor||'[]';
 let removed;try{removed=JSON.parse(prior);if(!Array.isArray(removed))throw Error();}catch{return {ok:false,error:'La configuración de categorías no es válida. No se eliminó ningún producto.'};}
 const value=JSON.stringify([...new Set([...removed,category])]);
 const saved=JSON.parse((await controller.handle({parameter:{},postData:{contents:JSON.stringify({action:'set_config',Clave:'Home_Removed_Category_Defaults_JSON',Valor:value,adminCredential:body.adminCredential})}},'POST')).getContent());
 if(!saved.ok)return {ok:false,error:'No se pudo actualizar la categoría. No se eliminó ningún producto.'};
 await checkpoint([{name:'Productos',revision:dataset.revision,headers:dataset.headers,headersChanged:false,mutations:rows.map(r=>({op:'delete',id:r.id}))},...controller.changes().filter(c=>c.name!=='Productos')]);
 return {ok:true,deletedRecords:rows.length,deletedProducts:products,removedDefaults:JSON.parse(value)};
}
