# Servidor de Original Store en Supabase

Estado: Supabase seleccionado para la tienda principal; Drive conectado y comprobado con una subida real; pedido técnico, precio del servidor, stock pendiente y comprobantes verificados. Apps Script se conserva únicamente para reversión deliberada.

Proyecto exclusivo: `zhtrwvbmkxxfxvdhgngs`. Función: `original-store-api`. Dominio: https://aloriginalstore.online. Propietario: originalstorealmacen@gmail.com. Google Cloud: `circular-answer-511000-k3`. BLYXU no participa en las operaciones ni en las credenciales de este servidor. Los nombres internos históricos BLYXU de sesiones y propiedades se conservan para compatibilidad con Original Store.

## Preparación

1. Confirmar permiso de la conexión de Supabase para el proyecto indicado. Leer metadatos y revisar las firmas y permisos de `store_read_dataset` y `store_commit_datasets` antes de ejecutar `supabase/server-state.sql`. El SQL añade estado privado y tres funciones; no importa, borra ni reemplaza catálogos, clientes, pedidos ni facturas existentes.
2. Guardar un respaldo privado actual de datos y propiedades del servidor existente. Aplicar el SQL aditivo. `ON CONFLICT DO NOTHING` conserva cualquier estado existente. Verificar permisos y asesores de seguridad.
3. Transferir una sola vez las propiedades administrativas con `tools/transfer-original-server-state.gs`, ejecutado exclusivamente en el editor privado del servidor correcto por su propietario. No publicar una ruta para esta función. Conserva contraseña cifrada mediante hash, segundo factor y claves históricas de clientes. No transferir credenciales de otro proyecto. La caché efímera del servidor anterior no es exportable; esperar a que venzan comprobantes y retos temporales antes del cambio. Las sesiones almacenadas en registros se conservan.
4. Configurar secretos de Edge Functions exclusivamente en Supabase: `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_ENCRYPTION_KEY` (aleatorio, estable y respaldado de forma privada). Si se utiliza Mercado Pago, configurar su `MERCADO_PAGO_ACCESS_TOKEN` propio. La función usa `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` del entorno de Supabase. `ORIGINAL_STORE_DB_SECRET` es una alternativa privada, nunca una variable de navegador. No incluir secretos en commits, capturas, registros ni mensajes.
5. Crear o utilizar un cliente Google OAuth de tipo Aplicación web exclusivo de Original Store, en su proyecto de Google Cloud. Retorno exacto: `https://aloriginalstore.online/drive-callback.html`. Origen del sitio: `https://aloriginalstore.online`. Habilitar Drive API y el permiso `drive.file`. Revisar publicación/audiencia: una aplicación externa en pruebas puede emitir refresh tokens que caducan en siete días; comprobar su configuración antes de declarar lista la conexión permanente.
6. Después de transferir el estado y configurar secretos, mantener `ORIGINAL_STORE_API_MODE=preview` durante las pruebas de lectura; establecer `ORIGINAL_STORE_API_ENABLED=true` solo al autorizar las pruebas completas y la activación. Alternativamente el modo privado `ORIGINAL_STORE_API_MODE` admite `preview` (lectura y conexión de Drive, sin pedidos ni cambios de inventario) y `active`. Por defecto está apagado; `ORIGINAL_STORE_API_ENABLED=false` lo apaga de forma explícita.
7. Desplegar `supabase/functions/original-store-api/index.ts` con sus tres módulos vecinos y `verify_jwt=false`. El catálogo es público; el controlador verifica Google o la sesión administrativa en operaciones privadas, y las cuentas verifican sus propias sesiones. La función no recibe claves privilegiadas del navegador.

## Verificación y activación

Ejecutar `node --test tests/supabase-server.test.mjs tests/frontend-backend.test.mjs`. El controlador generado incorpora las reglas de Original Store, un adaptador sobre sus datasets y operaciones con revisiones transaccionales. No utiliza servicios de Sheets ni Apps Script para almacenamiento o imágenes. Los conflictos devuelven error; no se confirma una venta cuyo inventario no se haya guardado.

Preparar un preview con el endpoint de Supabase, preservando el endpoint productivo. Comprobar catálogo, configuración, acceso Google propio, acceso con contraseña y segundo factor si está activo, cuentas, pedidos, facturas, solicitudes, favoritos y comprobantes. La consulta pública debe aceptar únicamente el ID completo PED/DET/FAC y no revelar teléfono, correo, dirección, nombre del cliente ni notas privadas. Verificar las firmas RPC con la base real y ejecutar pruebas de concurrencia reales; los mocks locales no sustituyen esa comprobación.

Publicar primero los archivos de retorno OAuth con el servidor seleccionado correctamente en el preview. En el administrador, Conectar Drive abre Google en la misma pestaña. El servidor utiliza PKCE y estado aleatorio válido una sola vez durante diez minutos; cifra el refresh token con AES-GCM y crea/reutiliza una carpeta de imágenes de esta aplicación. No cambia enlaces históricos ni presume acceso a una carpeta creada por otro cliente OAuth. Probar una subida real y su visualización; registrar el archivo de prueba para retirar solo ese archivo al concluir.

Crear un pedido técnico claramente marcado `PRUEBA — NO DESPACHAR`, sin cobrar ni enviar mensajes. Confirmar precios del servidor, inventario, comprobante limitado a ese pedido y caducidad. Validar conflictos y ausencia de duplicados. Revisar permisos de Google y cualquier integración de pagos sin cobros reales.

Solo tras superar esas verificaciones, cambiar `provider` a `supabase` en `backend-config.js`, actualizar la versión de ese archivo y publicar en el repositorio `originalstorealmacen/ORIGINAL-STORE-AL`. Comprobar en el dominio real que las operaciones apuntan al endpoint Supabase. Drive sigue reservado para imágenes. Mantener el servidor anterior y respaldos durante el periodo de reversión.

## Reversión y límites

Para volver temporalmente al servidor anterior, cambiar únicamente `provider` a `apps-script` y renovar la versión del archivo en las páginas. Ambos servidores apuntan a la misma base de Original Store; no reimportar Sheets ni restaurar un respaldo encima de ventas posteriores. Las propiedades y cachés de los dos servidores divergen después de la activación: revisar segundo factor, claves de acceso y sesiones antes de una reversión prolongada. No ejecutar de nuevo la transferencia de estado.

La compilación parte de `.supabase-server-private/controller-source.gs`, conservado localmente. `controller.js` es la fuente desplegable sin secretos. `tools/dataset-adapter.js` contiene el adaptador independiente. No ejecutar los preparadores sobre otra tienda ni publicar la carpeta privada. Este documento describe trabajo pendiente además de lo preparado; no certifica despliegue, conexión Drive ni pruebas en producción.

## Comprobación realizada el 13 de octubre de 2026

Se aplicó la migración aditiva con respaldo privado de los diez datasets y se desplegó la versión 4 de `original-store-api` en modo `preview`. El endpoint real devolvió 1.216 productos y la configuración Google de Original Store. Se verificó un conflicto PT409 en la base real, con reversión completa de la prueba. Se revocó la ejecución pública del helper `rls_auto_enable`; la revisión posterior no mostró advertencias de seguridad, solo avisos informativos de tablas RLS sin políticas (acceso reservado al servidor). Pasaron 28 pruebas locales.

La transferencia administrativa se confirmó en la base privada. Pendiente: configurar y autorizar Drive, habilitar las pruebas de negocio y completar el pedido técnico y subida real, publicar el preview y finalmente activar las páginas. La conexión de GitHub ya identifica al propietario originalstorealmacen y reconoce su instalación con permiso administrativo. Esta publicación añade fuentes y un administrador de prueba; no cambia el endpoint de las páginas productivas.

La versión 8 del servidor distingue errores de Drive API deshabilitada, permisos, capacidad y límites temporales. Guarda únicamente un código fijo y estado HTTP en ORIGINAL_STORE_DRIVE_LAST_ERROR; no guarda respuestas de Google ni tokens en el diagnóstico. La reconexión no crea otra carpeta si la consulta de la carpeta existente falla por motivos distintos de 404. Pasaron 30 pruebas locales. Un intento real falló al crear la carpeta; la conexión todavía está pendiente de una comprobación de Drive API y un nuevo intento autorizado.


Actualización visual: Drive conectado confirmado. Se publicó el diseño de confirmación y la tarjeta multimedia en el administrador de prueba (commit 017e7035965852208e4e3e64fc1c1dcb3d3b817b). Se verificaron cinco archivos en el dominio y el diseño en computador y celular con respuestas simuladas. Quedan pendientes la subida real, revisión de audiencia OAuth y pruebas completas de negocio antes de activar el sitio. Los párrafos anteriores registran comprobaciones históricas.


## Activación autorizada el 13 de octubre de 2026

El propietario autorizó explícitamente una imagen y un pedido técnico sin cobro ni mensajes, su eliminación y la activación. Se verificaron subida real a Drive, respuesta pública de imagen, lecturas privadas con sesión temporal, rechazo de clientes anónimos, precio calculado por el servidor, stock pendiente sin reducción, duplicado de ID y límites del comprobante. La imagen y los registros del pedido y comprobante se eliminaron. Se guardó el respaldo privado original_store_cutover_20261013 y se seleccionó provider=supabase en las páginas. La comprobación visual aislada cargó el catálogo y administrador con cero llamadas a Apps Script y cero errores JavaScript. El estado privado ORIGINAL_STORE_API_MODE es active.

La sesión de mantenimiento se revoca al terminar; no reemplaza contraseñas ni segundo factor. Pendiente independiente: confirmar que el cliente OAuth de Drive está en Producción en Google Cloud para evitar la caducidad de siete días propia de aplicaciones externas en pruebas. No se verificaron cobros reales ni se enviaron notificaciones.
