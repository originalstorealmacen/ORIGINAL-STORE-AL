function sbCell_(value){return value instanceof Date?value.toISOString():value===undefined?'':value;}
function sbDiscountStock_(raw){
 const items=parseMaybeJson_(raw);if(!Array.isArray(items))throw new Error('Productos inválidos.');
 const sheet=sbSheet_('Productos'),quantities=new Map();
 for(const item of items){const id=item['ID Variación']||item['ID Variacion']||item.idVariacion||item.id||item.variationId||item.sku;const qty=Number(item.cantidad??item.Cantidad??item.qty??item.quantity??1);if(!id||!Number.isFinite(qty)||qty<=0)throw new Error('Cantidad inválida.');quantities.set(String(id),(quantities.get(String(id))||0)+qty);}
 const column=sheet.headers.indexOf('Cantidad')+1;if(!column)throw new Error('Falta la cantidad de inventario.');
 const updates=[];for(const [id,qty]of quantities){const index=sheet.rows.findIndex(r=>String(r.record['ID Variación'])===id);if(index<0)throw new Error('Producto no encontrado.');const stock=Number(sheet.rows[index].record.Cantidad);if(!Number.isFinite(stock)||stock<qty)throw new Error('No hay stock suficiente.');updates.push([index+2,stock-qty]);}
 for(const [row,value]of updates)sheet.getRange(row,column).setValue(value);
}
class SbSheet_{
 constructor(data){this.name=data.name;this.revision=data.revision;this.headers=data.headers.slice();this.originalHeaders=JSON.stringify(data.headers);this.rows=data.rows.map(r=>({id:r.id,position:r.position,record:r.record,original:JSON.stringify(r.record)}));this.deleted=[];this.nextPosition=Math.max(1,...this.rows.map(r=>r.position))+1;}
 getName(){return this.name;}getLastRow(){return this.rows.length+1;}getLastColumn(){return this.headers.length;}setFrozenRows(){return this;}
 getRange(row,col,nrows=1,ncols=1){return new SbRange_(this,row,col,nrows,ncols);}getDataRange(){return this.getRange(1,1,this.getLastRow(),this.getLastColumn());}
 appendRow(values){this.getRange(this.getLastRow()+1,1,1,values.length).setValues([values]);return this;}
 deleteRow(row){if(!Number.isInteger(row)||row<2||row>this.getLastRow())throw new Error('Fila inválida.');const removed=this.rows.splice(row-2,1)[0];if(removed.id)this.deleted.push(removed.id);return this;}
 cell(row,col){if(row===1)return this.headers[col-1]??'';const entry=this.rows[row-2],header=this.headers[col-1];return entry&&header?entry.record[header]??'':'';}
 setCell(row,col,value){value=sbCell_(value);if(row===1){if(typeof value!=='string'||!value)throw new Error('Encabezado inválido.');if(this.headers[col-1]&&this.headers[col-1]!==value)throw new Error('No se puede renombrar una columna durante una venta.');if(this.headers.includes(value)&&this.headers[col-1]!==value)throw new Error('Encabezado repetido.');this.headers[col-1]=value;return;}const header=this.headers[col-1];if(!header)throw new Error('Columna inválida.');while(this.rows.length<row-1)this.rows.push({id:null,position:this.nextPosition++,record:{},original:null});this.rows[row-2].record[header]=value;}
 changes(){const mutations=this.deleted.map(id=>({op:'delete',id}));for(const row of this.rows){if(!row.id){const record={};for(const header of this.headers)record[header]=row.record[header]??'';mutations.push({op:'insert',position:row.position,record});}else if(JSON.stringify(row.record)!==row.original)mutations.push({op:'update',id:row.id,record:row.record});}return {name:this.name,revision:this.revision,headers:this.headers,headersChanged:JSON.stringify(this.headers)!==this.originalHeaders,mutations};}
}
class SbRange_{
 constructor(sheet,row,col,nrows,ncols){if(![row,col,nrows,ncols].every(v=>Number.isInteger(v)&&v>0))throw new Error('Rango inválido.');Object.assign(this,{sheet,row,col,nrows,ncols});}
 getValues(){return Array.from({length:this.nrows},(_,i)=>Array.from({length:this.ncols},(_,j)=>this.sheet.cell(this.row+i,this.col+j)));}
 setValues(values){if(values.length!==this.nrows||values.some(r=>r.length!==this.ncols))throw new Error('Dimensiones inválidas.');values.forEach((r,i)=>r.forEach((v,j)=>this.sheet.setCell(this.row+i,this.col+j,v)));return this;}
 setValue(value){if(this.nrows!==1||this.ncols!==1)throw new Error('Se esperaba una sola celda.');return this.setValues([[value]]);}
}
