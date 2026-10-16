# Corrección local de fichas y catálogo — Original Store

El catálogo vinculaba las tarjetas por la posición del producto dentro de una lista que se renueva en segundo plano. Esa posición podía corresponder después a otro producto. Ahora los enlaces, la vista previa y los botones de las tarjetas identifican el destino por su referencia estable.

La ficha resuelve la referencia antes de mostrar los datos y mantiene esa identidad al actualizar el catálogo. La imagen, nombre, precio y descripción corresponden al mismo registro. Una vista previa de otra referencia se descarta. Las cargas de imágenes atrasadas ya no pueden sustituir la selección actual. Si falla la carga, hay un mensaje con Reintentar; una referencia inexistente nunca abre otro producto. Se eliminaron la imagen ajena de respaldo y los textos iniciales de producto/$0.

También se redujo la palabra «estimado» y se ajustó el espacio de precio y botones en celular. La carga de una foto principal bloquea el guardado mientras está pendiente o falla, y descarta respuestas de cargas anteriores.

## Archivos

- blyxu-app.js: referencias estables, vistas previas, imágenes y precios del catálogo.
- producto.html: identidad de la ficha, descripción, carga inicial, errores y actualización de imágenes.
- original-store-boutique.css: tamaño de «estimado» y ajuste móvil.
- product-image-placeholder.svg: respaldo neutro, sin foto de otro producto.
- admin-app.js y admin-session-draft.js: control de cargas de la imagen principal.
- HTML públicos incluidos: versiones de caché actualizadas.
- tests/product-detail-reference-browser.mjs y tests/catalog-image-browser.mjs: pruebas locales con datos simulados.

## Cómo actualizar

1. Copia los archivos públicos incluidos en CORRECCION-FICHA-CATALOGO-LOCAL.zip sobre la carpeta existente de Original Store. Conserva los demás archivos de la página, sus imágenes, videos y configuración.
2. Publica tú la página con tu procedimiento habitual. Este ajuste de fichas y fotos no necesita cambios en Supabase ni modificaciones de productos. Si además vas a publicar el sistema anterior de pedidos y cotizaciones, sigue ACTUALIZAR-PEDIDOS-Y-COTIZACIONES.md para ese servidor.
3. Después de publicar, recarga la página y prueba abriendo Hello Kitty desde el catálogo. Deben coincidir título, imagen, precio y descripción. Prueba también desde el celular.

Las pruebas locales verificaron el cambio de orden del catálogo antes del clic, añadir la referencia correcta a la selección, vista previa de otro producto, referencia inexistente, caché antigua y descripción actualizada. Se probaron PC y vista móvil. El catálogo se verificó a 360, 390 y 768 px. También pasaron los recorridos existentes de cotización, mayoristas y pago en línea simulado.

No se publicaron archivos, no se desplegó el servidor y no se modificaron productos reales. La prueba móvil se realizó en navegador con vista móvil; no equivale a una prueba física en tu iPhone.
