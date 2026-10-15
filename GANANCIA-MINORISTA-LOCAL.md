# Ganancia minorista — implementación local

En Inventario aparece «Porcentaje de ganancia · producto a minorista». El botón «Aplicar porcentaje» guarda la regla general. Ejemplo: mayorista $10.000 + 30 % = minorista $13.000. Es un recargo sobre el mayorista, con redondeo al peso más cercano; admite 0–1000 % y hasta dos decimales.

Cada referencia tiene un plegable «Precio minorista»: permite elegir porcentaje general o precio manual y guardar únicamente ese precio. Los productos nuevos y sus variantes también tienen selector de modo. Cambiar de modo en el formulario no guarda productos automáticamente.

Compatibilidad: las referencias anteriores con precio minorista positivo se consideran manuales; las que carecen de precio usan el porcentaje. Cada variante mantiene su elección independiente. Sin mayorista positivo, el cálculo devuelve cero (se conserva el comportamiento de precio por consultar). Las ventas y facturas históricas conservan sus importes.

La regla se resuelve en el servidor para el catálogo, la ficha, los pedidos y las lecturas del administrador. Cambiar el porcentaje no reescribe masivamente los productos. Los guardados conservan el campo «Modo Precio Minorista» y usan los mecanismos existentes de autorización y control de revisiones. No hay tablas ni migraciones nuevas.

Archivos principales: administrativo.html, admin-app.js, admin-retail-pricing.js, admin-retail-pricing.css, retail-pricing-core.js, admin-session-draft.js; en el servidor, controller.js y retail-pricing.js. La herramienta tools/build-supabase-server.cjs incluye tools/retail-controller-patch.cjs para conservar la integración al regenerar.

Publicación pendiente: requiere publicar tanto los archivos del sitio como el servidor original-store-api. Subir solo la página no activa la regla en el servidor. No se ha publicado nada ni se han modificado datos reales.

Verificación: 36 pruebas del servidor; prueba de navegador del administrador real con servidor y productos simulados (porcentaje, formulario, variantes, precio manual por referencia y celular); pruebas de identidad, escáner vinculado y recuperación del borrador. Las pruebas del servidor verifican también el total del pedido frente a precios enviados por el cliente.
