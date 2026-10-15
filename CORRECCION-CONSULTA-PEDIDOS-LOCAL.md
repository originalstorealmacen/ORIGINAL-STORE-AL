# Corrección local de consulta de pedidos y facturas

El buscador aceptaba únicamente referencias con fecha de 14 dígitos y sufijo de 4 dígitos. El administrador también genera facturas `FAC-<número>` y `FAC-PED-<referencia>`, pedidos antiguos y referencias personalizadas con prefijo; esos IDs se rechazaban antes de buscarlos.

Se corrigen la validación de la página y del servidor para admitir referencias completas `PED-`, `DET-` y `FAC-`, con letras, números y guiones, y comparar el ID exacto. Se normalizan mayúsculas, espacios al copiar y guiones tipográficos. El servidor reconoce también encabezados antiguos equivalentes como `ID_Factura`. No se aceptan consultas por teléfono ni búsquedas parciales.

El lector utiliza la misma validación que el campo escrito. Acepta los enlaces de consulta de Original Store con y sin `www`, además de IDs directos. Rechaza enlaces de otras páginas o dominios. El resultado público conserva exclusivamente el resumen permitido; no devuelve nombres de clientes, teléfonos, direcciones ni correos.

Archivos para publicar cuando el propietario lo decida:

- `facturas-pedidos.html`
- `orders-page.js`
- `supabase/functions/original-store-api/server.js` (actualizar la función existente `original-store-api`; no basta con subir los archivos de la página a GitHub).

No se ha publicado ni desplegado esta corrección. No requiere migraciones ni cambiar registros existentes.

Verificación local: `node --test tests/supabase-server.test.mjs` (33 pruebas) y `node tests/order-lookup-browser.mjs`. La prueba del navegador carga la página real y ejecuta el servidor con registros ficticios; comprueba IDs escritos, QR, facturas vinculadas, referencias inexistentes, privacidad y ausencia de escrituras. Toda conexión externa del navegador se bloquea.
