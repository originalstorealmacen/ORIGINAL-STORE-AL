# Añadir nuevo producto simplificado — Original Store

Trabajo local. No se publicó en GitHub, no se desplegó Supabase y no se modificaron productos reales.

## Cambios solicitados

1. En Añadir nuevo producto, los precios pueden estar vacíos o en cero. El botón de guardado real se probó con ambos campos vacíos: se guardan como cero. El catálogo los presenta como Por cotizar, sin convertirlos en productos gratis. Se conserva la elección existente de precio manual o porcentaje general.
2. Añadir variante crea directamente la siguiente referencia V02, V03, etc. No se muestra la elección de crear manualmente o generar combinaciones. Los IDs se muestran como automáticos y de solo lectura en el alta; el escáner y los códigos físicos conservan su funcionamiento. Los ajustes de precio, foto y atributos siguen disponibles.
3. Color, Estilo y Tamaño/medidas se muestran mediante interruptores. Solo se abre el campo activado. Al apagar y volver a activar se recuperan los valores del borrador. Las medidas de una variante pueden seguir las de V01 hasta activar su ajuste propio.
4. La sección del principal se llama Variable inicial V01 durante el alta.
5. Los estilos de productos nuevos se guardan por defecto como botones de texto. Mostrar imagen en el botón de estilo permite optar por una imagen. Esa preferencia se conserva por referencia como Vista Variante (texto/imagen). Se conserva el comportamiento previo de productos existentes sin esa preferencia. Los colores solos siguen mostrando círculos y las combinaciones con talla/color se mantienen distinguibles.
6. Fotos de ángulos tiene su propio interruptor. Se reutiliza la subida actual a Drive y su preparación de imágenes. Se procesan hasta dos archivos simultáneamente, se mantiene el orden de los archivos que sí suben y se conservan esos resultados si otro falla. Se informa qué archivo falló. Una carga que termina después de limpiar no añade fotos al siguiente producto.
7. La ficha muestra las fotos de ángulos en cuadros pequeños. Al elegir uno cambia únicamente la foto; la referencia elegida y el carrito se conservan.
8. Añadir variante tiene apariencia secundaria. Guardar producto y variantes conserva el énfasis principal. Los botones de generación se ocultan solo en el alta nueva.
9. Se corrigió el observador de precios que reaccionaba a cambios de texto internos; ahora sincroniza los nodos de variantes añadidos. La vista previa agrupa los eventos de escritura por cuadro y evita reconstruir la galería cuando no cambió. El QR no se vuelve a generar si el código es el mismo.

La simplificación se activa solo al crear un producto. Se comprobó que al abrir un producto existente sus atributos, controles de edición y precios se conservan. La ficha del cliente recibe únicamente los cambios de estilos y ángulos pedidos.

## Archivos principales

- admin-product-entry.js y admin-product-entry.css (nuevos): controles progresivos del alta.
- admin-app.js: integración del alta, precios opcionales, cargas de ángulos, estado de borrador, actualizaciones de vista previa y caché del QR.
- administrativo.html: nombre de V01 y carga de los archivos actuales.
- admin-retail-pricing.js: observador acotado para evitar recálculos continuos.
- admin-session-draft.js: conserva los valores de campos apagados sin guardar credenciales.
- producto.html y original-store-product-studio.css: estilos compactos y miniaturas de ángulos.
- blyxu-app.js: detecta también cambios de la preferencia de presentación al refrescar datos.
- supabase/functions/original-store-api/controller.js: campo Vista Variante y validación de sus valores con los permisos administrativos existentes.
- tools/variant-workflow-patch.cjs: conserva ese campo al regenerar el controlador.
- HTML públicos: direcciones de caché actualizadas para los archivos modificados.

## Cómo actualizar

1. Conserva un respaldo de tu código actual. Copia los archivos públicos de la raíz del paquete ALTA-SIMPLIFICADA-ORIGINAL-STORE.zip sobre la carpeta existente de Original Store. Conserva el resto de archivos de la página, sus imágenes, videos y configuración.
2. Para conservar la preferencia texto/imagen, actualiza primero la función original-store-api del proyecto Original Store (zhtrwvbmkxxfxvdhgngs), con el directorio completo supabase/functions/original-store-api incluido. El controlador ya está preparado; no necesitas regenerarlo. Conserva los secretos existentes. No utilices cuentas ni proyectos de BLYXU.
3. No hay una migración SQL nueva. El campo Vista Variante se incorpora al registro existente de productos. No importes productos ni datos de las pruebas.
4. Publica después la página con tu procedimiento habitual, incluyendo admin-product-entry.js y admin-product-entry.css. Actualiza juntos el HTML y los programas. Sin el servidor nuevo, la preferencia del botón de estilo no se conserva al volver a consultar el producto.
5. Las carpetas supabase, tools y tests son para servidor/desarrollo; no se deben servir como recursos públicos. No publiques carpetas privadas ni credenciales.
6. Después de publicar, recarga el administrador con Ctrl + F5 y comprueba el alta. Las nuevas direcciones de caché ayudan a descargar la versión actual.

El paquete actualiza el proyecto existente; no contiene fotos reales, credenciales, datos de productos ni la instantánea original-store-catalog-bootstrap.js. No borres esa instantánea ni otros recursos que tu página ya utiliza.

## Pruebas locales realizadas

- PC y vista móvil: guardado mediante el botón real con precios vacíos, registro con precios cero y variantes automáticas; activación/apagado de atributos; recuperación de valores y borradores al volver a iniciar sesión.
- Subida simulada de tres ángulos: dos trabajos simultáneos, archivo fallido, conservación del orden y resultados correctos, bloqueo mientras hay carga y descarte de un resultado tardío tras limpiar.
- Como cliente: dos estilos de texto y otro con imagen, miniaturas que cambian la foto sin alterar la referencia, selección de variantes y cotización de precios pendientes; sin desbordamiento en móvil.
- Escritura rápida: 50 eventos de entrada se agrupan; el observador se estabiliza en vez de seguir recalculando. Esto verifica el trabajo de la interfaz en el navegador de prueba, no una medición del equipo físico del usuario.
- Se conservaron en pruebas el editor de productos existentes, el porcentaje y precio manual de Inventario, el escáner celular-PC, las referencias físicas y el borrador de sesión.
- Pasaron 57 pruebas de servidor/integración existentes y nuevas, incluidas persistencia de preferencias, autorización, precios, pedidos y ausencia de facturación automática.

Pruebas reproducibles: tests/new-product-entry-browser.mjs, tests/style-angle-browser.mjs, tests/admin-variant-workflow-browser.mjs, tests/admin-identity-browser.mjs, tests/retail-pricing-browser.mjs y tests/variant-image-mode.test.mjs. Las pruebas móviles utilizaron vista móvil de navegador, no un teléfono físico.
