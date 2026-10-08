/* Drive propio de Original Store. Ejecutar configurarDriveOriginalStore desde el editor. */
const ORIGINAL_STORE_DRIVE_FOLDERS_ = { imagenes:'Imagenes de productos', banners:'Banners y anuncios', logos:'Logos y recursos', facturas:'Facturas', comprobantes:'Comprobantes', respaldos:'Respaldos' };
function configurarDriveOriginalStore() {
 const lock=LockService.getScriptLock();lock.waitLock(10000);
 try {
  const props=PropertiesService.getScriptProperties();let rootId=props.getProperty('ORIGINAL_STORE_DRIVE_ROOT_ID');let root;
  if(rootId){root=DriveApp.getFolderById(rootId);if(root.isTrashed())throw new Error('La carpeta Original Store esta en la papelera. Restaurala.');}
  else {root=DriveApp.createFolder('Original Store');rootId=root.getId();props.setProperty('ORIGINAL_STORE_DRIVE_ROOT_ID',rootId);}
  const result={carpeta:root.getUrl(),subcarpetas:{}};
  Object.keys(ORIGINAL_STORE_DRIVE_FOLDERS_).forEach(function(type){
   const key='ORIGINAL_STORE_DRIVE_'+type.toUpperCase()+'_ID';let id=props.getProperty(key);
   if(!id){const existing=root.getFoldersByName(ORIGINAL_STORE_DRIVE_FOLDERS_[type]);const folder=existing.hasNext()?existing.next():root.createFolder(ORIGINAL_STORE_DRIVE_FOLDERS_[type]);id=folder.getId();props.setProperty(key,id);}
   result.subcarpetas[type]=originalStoreDriveFolder_(type).getUrl();
  });console.log(JSON.stringify(result,null,2));return result;
 }finally{lock.releaseLock();}
}
function originalStoreDriveFolder_(type){
 if(!Object.prototype.hasOwnProperty.call(ORIGINAL_STORE_DRIVE_FOLDERS_,type))throw new Error('Tipo de carpeta no permitido.');
 const props=PropertiesService.getScriptProperties(),id=props.getProperty('ORIGINAL_STORE_DRIVE_'+type.toUpperCase()+'_ID'),rootId=props.getProperty('ORIGINAL_STORE_DRIVE_ROOT_ID');
 if(!id||!rootId)throw new Error('Ejecuta configurarDriveOriginalStore desde el editor con la cuenta de Original Store.');
 const root=DriveApp.getFolderById(rootId),folder=DriveApp.getFolderById(id);
 if(root.isTrashed()||folder.isTrashed())throw new Error('La carpeta de Original Store esta en la papelera.');
 const parents=folder.getParents();let belongs=false;while(parents.hasNext()){if(parents.next().getId()===rootId)belongs=true;}
 if(!belongs)throw new Error('La subcarpeta no pertenece a Original Store.');return folder;
}
function originalStoreUploadImage_(body){
 const mimeType=String(body.mimeType||'').toLowerCase();if(!/^image\/(jpeg|png|webp|gif)$/.test(mimeType))throw new Error('Utiliza una imagen JPG, PNG, WEBP o GIF.');
 const base64=String(body.base64Data||'');if(!base64||base64.length>14*1024*1024)throw new Error('La imagen esta vacia o supera 10 MB.');
 const bytes=Utilities.base64Decode(base64);if(!bytes.length||bytes.length>10*1024*1024)throw new Error('La imagen esta vacia o supera 10 MB.');
 const type=String(body.assetType||'imagenes').toLowerCase();if(['imagenes','banners','logos'].indexOf(type)<0)throw new Error('Destino de imagen no permitido.');
 const file=originalStoreDriveFolder_(type).createFile(Utilities.newBlob(bytes,mimeType,originalStoreFileName_(body.fileName)));
 try{file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);}catch(error){file.setTrashed(true);throw new Error('La cuenta no permite compartir imagenes mediante enlace. Revisa Drive.');}
 const id=file.getId();return {ok:true,status:'success',url:'https://lh3.googleusercontent.com/d/'+id+'=w1200',directUrl:'https://lh3.googleusercontent.com/d/'+id,id:id};
}
// Solo para documentos generados por el servidor; no publicar como accion publica.
function originalStoreSavePrivateFile_(type,blob,fileName){
 if(['facturas','comprobantes','respaldos'].indexOf(type)<0)throw new Error('Destino de documento no permitido.');
 const file=originalStoreDriveFolder_(type).createFile(blob.copyBlob().setName(originalStoreFileName_(fileName)));return {id:file.getId(),url:file.getUrl()};
}
function originalStoreFileName_(value){const name=String(value||'archivo').replace(/[\\/\x00-\x1f]/g,'-').slice(0,140);return Date.now()+'-'+Utilities.getUuid().slice(0,8)+'-'+name;}

// Ejecutar solo desde el editor de la cuenta propietaria de Original Store.
function conectarAccesoOriginalStore() {
 const expectedEmail='originalstorealmacen@gmail.com';
 const ss=getSpreadsheet_();
 if(String(DriveApp.getFileById(ss.getId()).getOwner().getEmail()).toLowerCase()!==expectedEmail)throw new Error('El inventario no pertenece a Original Store.');
 if(ss.getId()!=='16o9R0delJsi9smXekxk4KJ9ev7nDJ6_2XQPYG1yc6s0')throw new Error('El inventario no es el de Original Store.');
 const clientId='843506922292-95hnsm3vsj4ookvjhoopaj07tk8s2usr.apps.googleusercontent.com';
 upsertConfig_('Google_Client_ID',clientId);
 upsertConfig_('Factura_Empresa','Original Store');
 upsertConfig_('Factura_Email',expectedEmail);
 PropertiesService.getScriptProperties().setProperty('BLYXU_ADMIN_EMAILS',expectedEmail);
 SpreadsheetApp.flush();
 if(getConfigValue_('Google_Client_ID')!==clientId)throw new Error('No se guardo el cliente propio.');
 console.log('Original Store: cliente propio conectado; inventario verificado; cuenta administradora '+expectedEmail);
}
