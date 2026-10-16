# Ficha en PC: actualización de caché

Se comprobó la página pública en navegador nuevo de escritorio y móvil. En ambas se cargaron precios y descripciones. La página publicada todavía contiene el HTML anterior y solicita blyxu-app.js con la versión original-store-cutover-20261013. El servidor permite conservar esa dirección en caché durante 600 segundos. Por eso un PC que conserva el programa defectuoso puede seguir mostrando el título de ejemplo, $0 y la descripción cargando, mientras otro dispositivo ya recibió el programa corregido.

## Comprobación inmediata

Abre la ficha en el PC y pulsa Ctrl + F5 para volver a descargar la página y sus archivos. Esto no elimina productos, pedidos ni configuraciones de la tienda.

## Corrección preparada

Los HTML locales ahora solicitan blyxu-app.js?v=detail-pc-cache-20261016. Es una dirección distinta de las versiones anteriores; el navegador descarga el programa corregido. El programa incorpora además el componente de pedidos cuando la ficha antigua no lo carga.

Copia los archivos públicos del paquete CORRECCION-CACHE-PC-LOCAL.zip sobre la carpeta existente de Original Store y publica la página mediante tu procedimiento habitual. Actualiza juntos los HTML, blyxu-app.js y order-flow.js. Conserva los demás archivos, fotos y videos de la página. Las pruebas dentro de tests son de desarrollo, no archivos públicos del sitio. No necesitas modificar Supabase ni productos para este ajuste.

## Pruebas

Se guardó realmente en la caché de Edge una versión defectuosa del programa. Se abrió dos veces y se verificó que la segunda apertura reutilizaba esa copia. Al abrir la ficha con el HTML actualizado se descargó la dirección nueva y aparecieron nombre, precio y descripción correctos, sin borrar almacenamiento local. Pasó tanto en escritorio como en vista móvil. Prueba: tests/product-detail-cache-browser.mjs.

La comprobación corresponde al navegador de prueba. No se inspeccionó la caché del PC del usuario: esa explicación se apoya en el HTML publicado, la captura y la reproducción local.

No se publicó nada ni se modificaron datos reales.
