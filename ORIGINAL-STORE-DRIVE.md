# Drive propio de Original Store

El manifiesto `appsscript.json` ya incluye los permisos necesarios y la zona horaria America/Bogota. El manifiesto autoriza el acceso: las carpetas se crean mediante `original-store-drive.gs`.

## Instalación en el Apps Script nuevo

1. Abre el editor del Apps Script con la cuenta de Google de Original Store.
2. Añade un archivo de tipo Script llamado `original-store-drive` y copia el contenido de `original-store-drive.gs`.
3. En el archivo que contiene `handleRequest_`, busca el bloque `if (method === 'POST' && action === 'uploadimage')`. Sustituye únicamente su contenido por:

```javascript
return json_(originalStoreUploadImage_(body));
```

Conserva la condición, sus llaves y las comprobaciones de acceso administrativo que tenga tu script. No pegues las distintas versiones completas del backend en un mismo proyecto: tienen funciones repetidas.

4. Comprueba que el manifiesto `appsscript.json` coincida con el de esta carpeta. Si no lo ves, activa «Mostrar el archivo de manifiesto appsscript.json en el editor» en Configuración del proyecto.
5. Selecciona `configurarDriveOriginalStore` y pulsa Ejecutar. Autoriza con la cuenta de Original Store. El registro de ejecución mostrará los enlaces de las carpetas creadas.
6. En Implementar → Gestionar implementaciones, edita la implementación utilizada por la página, elige Nueva versión y guarda. Configura la ejecución como tu cuenta de Original Store. Mantén la implementación actual para conservar el enlace `/exec` ya conectado a la tienda.
7. Sube una imagen desde el administrador y comprueba que aparezca dentro de Original Store → Imagenes de productos.

## Organización

La función crea `Original Store` en el Drive de la cuenta que la ejecuta, con estas subcarpetas: Imagenes de productos, Banners y anuncios, Logos y recursos, Facturas, Comprobantes y Respaldos. Guarda sus identificadores en las propiedades privadas del proyecto. Repetir la instalación reutiliza las mismas carpetas.

Las subidas actuales `uploadimage` van a Imagenes de productos. Opcionalmente pueden enviar `assetType: 'banners'` o `assetType: 'logos'`. Las imágenes nuevas se comparten mediante enlace para mostrarlas en la tienda; no se comparte la carpeta raíz ni las carpetas de documentos.

Facturas, Comprobantes y Respaldos quedan preparados para almacenamiento privado en el servidor mediante `originalStoreSavePrivateFile_`. Los PDF que la página descarga en el navegador no se archivan automáticamente en Drive con este cambio.

El 8 de octubre se migraron 1.152 fotos optimizadas al Drive propio. Se actualizaron únicamente las columnas de imagen y galería del inventario, conservando precios, cantidades y credenciales. El logo, Aliados y los banners también se sirven desde Drive. Las copias y el registro de enlaces anteriores permanecen en Respaldos.

## Instalación realizada

El 7 de octubre de 2026 se instaló el módulo y se ejecutó `configurarDriveOriginalStore` con originalstorealmacen@gmail.com. Tras una respuesta intermitente del enlace anterior, se publicó una implementación renovada (versión 3) del mismo proyecto y se actualizó la conexión de la tienda.

Enlace utilizado por Original Store: https://script.google.com/macros/s/AKfycbyJPGQXLqyFAlAtO7vEih7yZzRuevROj6dcb-AQF02PupM66BGeLbMULKV-bW5LrfoW/exec

Carpeta creada y verificada como privada: https://drive.google.com/drive/u/1/folders/16v-etcCrKbUSVD0ZNaTUzfDFjjrNFSv6

Editor del proyecto: https://script.google.com/u/1/home/projects/1LihBsn2bVYgPi51nd4BJU3432HVsisaxATFbSn6-vjSk814iq2pqhfv-/edit

## Carga y almacenamiento desde el 8 de octubre

Las nuevas fotos de productos se comprimen en WebP, hasta 1200 px, antes de subir a Imagenes de productos. Los banners usan hasta 1600 px y van a Banners y anuncios; otros recursos van a Logos y recursos. El catálogo solicita versiones pequeñas y carga las fotos restantes al acercarse a ellas. El archivo de arranque contiene datos y enlaces, sin fotografías. La publicación del sitio excluye las imágenes y el paquete anterior de fotos.

Backend verificado y publicado: versión 5, con la cuenta originalstorealmacen@gmail.com. La migración registró completa=true y el inventario público no conserva enlaces a las fotos anteriores incluidas en la migración.

