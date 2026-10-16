# Variantes, fotos, registro por etapas y QR — Original Store

Estado: implementación y pruebas locales. No se publicó en GitHub, no se desplegó Supabase y no se modificaron productos reales.

## Funcionamiento

- Cada variante nueva permite usar las medidas actuales del principal o elegir «Ajustar manual». El ajuste manual tiene tipo Normal, Medidas, Textil o Líquidos/ml; unidad; ancho, largo, fondo y radio; capacidad y talla textil. Las casillas se muestran según el tipo elegido. Al guardar se envían las medidas propias, no las del principal. Los valores se conservan al alternar los modos en el borrador.
- «Usar foto del producto general» funciona como interruptor. Activado usa la foto actual del principal; desactivado permite cargar un archivo o pegar una URL propia. Alternarlo conserva la URL propia durante la edición. La preferencia se almacena como Modo Imagen (general/propia). Las variantes anteriores sin preferencia conservan su foto. Las fichas del catálogo resuelven la foto del principal actual para las variantes guardadas como general, sin sustituir fotos independientes.
- El formulario avanza por Información general, Producto principal y Variantes. Abrir una etapa recoge la anterior sin borrar campos. Hay botones para continuar y al añadir una variante se abre su etapa. Al agregar otra tarjeta, la anterior se recoge.
- El QR general y el ticket del formulario contienen el ID madre, sin V01. El QR de inventario del principal V01 también identifica la madre. Las referencias V01/V02 y los códigos físicos de cada variante se conservan. Los QR específicos de otras variantes siguen identificando esa variante.
- La foto independiente actualiza la vista previa. Una carga pendiente o fallida impide guardar esa foto como si estuviera lista; se puede reintentar, pegar una URL o usar la foto general. Una respuesta atrasada no sustituye una selección posterior.
- Nada se guarda automáticamente al cambiar de etapa, medidas o foto. Se conservan los botones explícitos de guardado existentes.

## Archivos principales

Página:
- admin-app.js: medidas, fotos, plegables y QR madre.
- administrativo.html: etapas y carga del estilo nuevo.
- admin-variant-workflow.css: medidas adaptadas a celular e interruptor de marca.
- blyxu-app.js: resolver fotos heredadas del principal al cargar datos frescos o desde la caché.
- HTML públicos: versiones de caché para cargar el programa actual.

Servidor y generación:
- supabase/functions/original-store-api/controller.js: encabezado Modo Imagen y validación de valores; se mantienen los permisos administrativos y las operaciones existentes.
- tools/variant-workflow-patch.cjs: conserva el campo y su validación al regenerar el controlador.
- tools/build-supabase-server.cjs: aplica ese ajuste después de los anteriores.

Pruebas:
- tests/admin-variant-workflow-browser.mjs: PC y móvil, todos los tipos de medida, independencia respecto al principal, interruptor de foto, recarga/login, fotos pendientes/fallidas y lectura del QR generado.
- tests/variant-image-mode.test.mjs: persistencia con el controlador real y datos simulados, permisos, validación y resolución de fotos por familia.
- tests/admin-identity-browser.mjs: expectativas del QR madre y navegación por etapas; conserva la comprobación del escáner vinculado, códigos físicos e inactividad.

## Cómo actualizar

1. Conserva un respaldo del código actual. El ZIP es una actualización para copiar sobre el proyecto existente de Original Store; conserva sus fotos, videos, fuentes y configuración.
2. Actualiza primero la función original-store-api del proyecto Original Store (zhtrwvbmkxxfxvdhgngs) con el directorio completo supabase/functions/original-store-api del paquete. Conserva los secretos existentes. No uses cuentas ni proyectos de BLYXU.
3. No hay una migración SQL para este cambio. Se reutiliza el registro de productos existente; el controlador incorpora el encabezado Modo Imagen. No importes datos ni sustituyas productos con los de las pruebas.
4. Copia los archivos públicos de la raíz del paquete sobre tu página, incluido admin-variant-workflow.css, y publica con tu procedimiento habitual. Los HTML deben actualizarse junto con los programas para que se descarguen las versiones nuevas.
5. No publiques las carpetas supabase, tools o tests como contenido de la página. Tampoco publiques carpetas privadas o credenciales. El paquete no contiene fotos reales ni datos de las pruebas públicas previas. La instantánea de catálogo original-store-catalog-bootstrap.js existente no se reemplaza con este paquete.
6. Recarga el administrador. Prueba un producto de prueba sin guardarlo: medidas en la variante, interruptor de foto, cambio de etapa y QR madre. Para probar la persistencia en producción, utiliza únicamente un registro de prueba que tú decidas guardar.

Actualizar solo la página permite enviar la foto elegida, pero el servidor anterior no conserva Modo Imagen. Actualiza ambos para conservar el interruptor al volver a editar y seguir la foto general después de cambiarla.

## Verificación

Se probaron escritorio amplio y vista móvil. El QR generado se decodificó desde su imagen y devolvió el ID madre. Pasaron también las pruebas de códigos físicos, escáner celular-PC, borradores, sesiones, precios minoristas manuales/por porcentaje, imágenes y apertura correcta de fichas. Las pruebas de servidor comprobaron permisos y persistencia con almacenamiento simulado, sin pedidos ni facturas reales. La vista móvil fue simulada en navegador, no en un teléfono físico.
