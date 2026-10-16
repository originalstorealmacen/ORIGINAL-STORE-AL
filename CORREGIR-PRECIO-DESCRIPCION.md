# Precio y descripción de la ficha — Original Store

## Fallo confirmado

Se reprodujo en la página pública: al abrir una ficha, el navegador daba «OriginalStoreOrderFlow is not defined». El HTML publicado de producto.html no cargaba order-flow.js, pero el programa del catálogo ya utilizaba ese componente. La inicialización se interrumpía en updateCartUI, antes de colocar nombre, precio y descripción. La imagen podía aparecer porque la vista previa se ejecuta antes, de forma independiente.

## Corrección

El programa principal incluye ahora el componente de textos y clasificación de pedidos cuando el HTML no lo ha cargado. Es exactamente la misma definición de order-flow.js, y una prueba comprueba que ambas copias coincidan. También se conserva la corrección previa de referencias estables, recuperación de productos que faltan en la caché inicial y mensajes de carga/error de la ficha.

## Actualización de la página

1. Copia TODOS los archivos públicos de CORRECCION-PRECIO-DESCRIPCION-LOCAL.zip sobre tu proyecto de Original Store. Incluye juntos blyxu-app.js y producto.html, además de los HTML con las nuevas versiones de caché. No uses únicamente el programa con la ficha antigua: esa ficha también carece de la recuperación de referencias que no están en su instantánea inicial.
2. Conserva las imágenes, videos y demás archivos que ya usa la página. El paquete es una actualización de la página existente.
3. Publica tú la página y recarga el navegador. Este ajuste no necesita desplegar Supabase, ejecutar SQL ni modificar productos.
4. Abre Hello Kitty, Spider Man y Cinnamoroll desde el catálogo y despliega la descripción. Comprueba también el celular. Cuando un producto no tiene descripción registrada, la ficha lo indica sin quedarse cargando.

El archivo order-flow.js se incluye para los demás componentes que ya lo utilizan. El paquete no contiene secretos, datos de productos, fotos reales ni credenciales. Las carpetas tests y tools son de desarrollo; no se deben servir como contenido público.

## Pruebas realizadas

- Navegación de cliente con una copia de los datos públicos actuales: 40 tarjetas de catálogo, todas con precio conocido; 38 con descripción registrada y 2 sin texto de origen. Se verificaron las 40 fichas tanto en PC como en vista móvil, con el HTML publicado que omitía el componente y con el HTML actual: 160 aperturas comprobadas.
- Prueba sin internet reproducible con datos ficticios: precio normal, producto por cotizar y descripción ausente, también en PC y vista móvil.
- Lectura de la página pública con los archivos corregidos sustituidos solo dentro del navegador de prueba: Hello Kitty $22.000, llaveros Snoopy $7.000, Spider Man $18.000 y Cinnamoroll $48.000. Sin errores de JavaScript. No se cambió la web publicada.
- Se verificó que siguen funcionando cotizaciones, mayoristas, reintentos, revisión administrativa, aceptación y pago en línea simulado.
- La prueba de interfaz móvil se hizo con navegador en vista móvil, no con un iPhone físico.

Ninguna prueba creó pedidos ni modificó productos reales. No se publicaron cambios en GitHub ni se desplegó el servidor.

## Archivos principales de este arreglo

- blyxu-app.js: inicialización autónoma del componente de pedidos y precios.
- order-flow.js: definición compartida, incluida en el paquete.
- producto.html: ficha corregida y versión nueva del programa.
- HTML públicos: referencias de caché del programa actualizadas.
- tests/catalog-customer-browser.mjs: prueba de cliente para todas las tarjetas visibles. Por defecto utiliza productos ficticios y un servidor local que rechaza escrituras.
- tests/frontend-backend.test.mjs: comprueba que la definición incorporada coincide con order-flow.js y no reemplaza una instancia ya cargada.

El paquete incluye además los arreglos anteriores de imagen, referencia y presentación móvil para mantenerlos juntos.
