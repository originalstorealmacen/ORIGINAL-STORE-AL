# Pedidos y cotizaciones — entrega local de Original Store

Estado: cambios implementados y probados en local. No se publicaron cambios en GitHub ni se desplegó Supabase. Todas las solicitudes, cuentas, pagos y existencias utilizados en las pruebas fueron simulados.

## Qué cambia

- Mayoristas: **Añadir al pedido → Mi pedido → Enviar pedido mayorista**.
- Minoristas sin pago en línea, con precios ocultos o con precios pendientes: **Añadir a cotización → Mi cotización → Solicitar cotización**.
- Minoristas con precios completos y pago en línea habilitado: **Añadir al carrito → Mi carrito → Continuar al pago**. Se conserva la integración de Mercado Pago.
- Las cotizaciones muestran precios conocidos como estimados. Los importes faltantes son «Por cotizar», nunca productos gratis. Los totales parciales se identifican como tales.
- Solo nombre y celular son obligatorios; correo, dirección, ciudad y nota son opcionales.
- La solicitud se registra antes de confirmar o habilitar el enlace opcional de WhatsApp. Funciona en PC y en la vista móvil. No abre WhatsApp automáticamente.
- El reintento conserva la selección y reutiliza una clave de idempotencia; también recupera la referencia si el servidor registró la solicitud pero se perdió la respuesta. La huella local se almacena como hash, sin guardar credenciales ni datos de contacto en esa huella.
- En el administrador hay filtros de mayoristas, cotizaciones minoristas y pedidos minoristas. «Revisar cotización» abre un recuadro interno para editar cantidades y precios. Hay que guardar la revisión y marcar que el cliente aceptó antes de convertirla. La referencia se conserva.
- Registrar, revisar o convertir no genera factura, cobro ni descuento de inventario. El precio cotizado se considera confirmado únicamente al aceptar y convertir. Facturar sigue siendo una acción administrativa posterior; el servidor bloquea una factura vinculada a una cotización pendiente.

## Archivos modificados o nuevos para este ajuste

Página:

- `blyxu-app.js`: textos por recorrido, precios estimados, registro de solicitudes, idempotencia y WhatsApp opcional.
- `order-flow.js` (nuevo): vocabulario compartido y clasificación de recorridos.
- `admin-app.js`: lista, filtro, importes y bloqueo de la apertura de facturación de cotizaciones pendientes.
- `admin-order-workflow.js` y `admin-order-workflow.css` (nuevos): revisión interna, aceptación y manejo de conflictos.
- `order-summary.js`: comprobantes de pedido o cotización y precios pendientes/estimados.
- `orders-page.js`: seguimiento de referencias PED, DET, MAY, COT y FAC; importes pendientes y privacidad.
- `administrativo.html`, `carrito.html`, `producto.html`, `index.html`, `mayorista.html`, `contacto.html`, `pagos.html`, `facturas-pedidos.html`: carga de los componentes y versiones actualizadas. La ficha también reconsulta la referencia si la instantánea local antigua no incluye el producto.

Servidor, dentro de `supabase/functions/original-store-api/`:

- `order-workflow.js` (nuevo): registro idempotente, revisión y conversión con aceptación y versión esperada.
- `controller.js`: integración con autorización, datos, comprobantes privados y validación de precios/existencias.
- `server.js`: seguimiento público de los formatos de referencia del proyecto, con respuesta limitada a datos no personales.

Generación y pruebas:

- `tools/build-supabase-server.cjs` y `tools/order-workflow-patch.cjs` (nuevo): conservan el ajuste al regenerar el controlador.
- `tests/order-workflow.test.mjs` y `tests/order-workflow-browser.mjs` (nuevos).
- `tests/fixtures/order-lookup-api.mjs`: pasarela y persistencia simuladas para las pruebas.

Los cambios locales anteriores de precios, identidad, borradores, escáner y Caja rápida se conservan. El paquete contiene los archivos públicos de código actuales para no omitir sus dependencias; contiene además el directorio completo de la función del servidor. No contiene secretos, fotos o videos, ni la carpeta privada de trabajo.

## Cómo actualizar después

1. Haz una copia de la versión actual del código y conserva los respaldos de datos habituales. El paquete es una actualización para copiar sobre el proyecto existente; no borres los demás archivos ni los recursos de imágenes/video que ya usa la página.
2. Trabaja exclusivamente en el proyecto de **Original Store**, `zhtrwvbmkxxfxvdhgngs`, y en la función **original-store-api**. No uses el proyecto ni las cuentas de BLYXU.
3. **Actualiza primero el servidor:** copia el contenido de `supabase/functions/original-store-api/` del paquete al mismo directorio del proyecto y publica esa función mediante tu procedimiento habitual de Supabase. Incluye `order-workflow.js`, `retail-pricing.js` y los demás módulos importados, no solo `index.ts`. Conserva `supabase/config.toml` y los secretos existentes; no copies claves al navegador.
4. No hay una migración SQL nueva para este ajuste. Se reutilizan los datasets y la operación transaccional `store_commit_server` existentes. El controlador incorpora los nuevos encabezados de pedidos dentro de esa arquitectura. No vuelvas a importar los datasets ni reemplaces productos reales con datos de prueba.
5. **Actualiza después la página:** copia los archivos públicos de código de la raíz del paquete sobre los de la raíz de tu repositorio de Original Store y publica con el flujo actual de GitHub Pages. Copia también los nuevos JS/CSS: `order-flow.js` y `admin-order-workflow.js/.css`. Conserva las imágenes, fuentes y videos que ya tienes. Los HTML ya incluyen las versiones nuevas para la caché.
6. Las carpetas `supabase/`, `tools/` y `tests/` son código del servidor o desarrollo; no se deben servir como recursos públicos del sitio. El workflow actual de Pages ya publica solo los archivos públicos de la raíz y excluye archivos con `private` en su nombre. No publiques carpetas privadas ni archivos de credenciales.
7. Recarga el administrador y la página. La página nueva necesita el servidor nuevo: si se actualiza únicamente la página, el servidor anterior no reconocerá el registro de solicitudes y la selección se conservará con un error, sin confirmar un registro inexistente.

## Comprobaciones tras actualizar

- Mayorista: agrega una variante, abre Mi pedido y envía con nombre/celular. Debe devolver una referencia MAY. WhatsApp debe quedar como enlace opcional.
- Minorista con pago desactivado: debe pedir cotización y mostrar precios estimados o «Por cotizar». Debe devolver una referencia COT.
- Administrador: filtra cotizaciones, revisa y guarda; la conversión debe permanecer bloqueada hasta marcar la aceptación. Al convertir, la referencia debe ser exactamente la misma y no debe aparecer una factura nueva ni bajar el stock.
- Dos administradores: si uno guarda una revisión, el otro no puede sobrescribirla con la versión anterior. El recuadro conserva los datos que estaba editando.
- Minorista con precios y pago habilitados: debe conservar Añadir al carrito y Continuar al pago. Usa una transacción de prueba de la pasarela si deseas validar el entorno publicado, no un cobro real.
- Seguimiento: las referencias y QR de pedidos, cotizaciones y facturas deben funcionar; la consulta pública no muestra nombre, celular, dirección, correo ni acceso a comprobantes privados. Esos comprobantes mantienen el acceso temporal o la cuenta validada existentes.

## Verificación local realizada

Las pruebas de servidor cubren idempotencia, reintentos simultáneos, cantidades acumuladas, datos obligatorios, precios canónicos, precios pendientes, permisos administrativos, versiones, aceptación, cambios de precio/stock al convertir, bloqueo de facturas y privacidad del seguimiento. La pasarela de pago se simuló y se verificaron precio unitario, cantidad y redirección.

El navegador real ejecutó catálogo, ficha, resumen, registro, seguimiento y revisión administrativa, tanto en vista de escritorio como móvil. También se simularon respuesta perdida y dos administradores concurrentes. No se probó un cobro real ni una cámara física nueva; se reutiliza el escáner existente.

Pruebas reproducibles desde la carpeta del proyecto:

```
node --test tests/supabase-server.test.mjs tests/shared-scan.test.mjs tests/order-workflow.test.mjs tests/frontend-backend.test.mjs
node tests/order-workflow-browser.mjs
node tests/admin-identity-browser.mjs
node tests/retail-pricing-browser.mjs
node tests/order-lookup-browser.mjs
node tests/admin-quick-sale-section-browser.mjs
```

Las pruebas de navegador requieren Playwright y Edge, como el entorno local utilizado. En otra máquina hay que ajustar la ruta del runtime de Playwright en los archivos de pruebas. Todo el tráfico de esas pruebas se limita al servidor local o a respuestas simuladas.
