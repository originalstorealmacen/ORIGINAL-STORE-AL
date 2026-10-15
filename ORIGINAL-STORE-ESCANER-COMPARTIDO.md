# Escáner compartido de Original Store

1. Abre el formulario de producto en el computador e inicia sesión.
2. En **Escáner compartido**, elige el campo y pulsa **Vincular desde este PC**.
3. En el celular abre el mismo administrador con la misma cuenta. Pulsa **Vincular celular** y escanea el QR temporal del computador con el lector existente. También puedes abrir el enlace temporal después de iniciar sesión.
4. Pulsa **Abrir escáner del celular**. Cada lectura confirmada se coloca en el campo seleccionado del computador.
5. Continúa con el registro en el computador. Los productos se guardan únicamente cuando pulses tu botón habitual de guardar.

Puedes elegir el código del producto o el de una variante. Al abrir otro producto o restablecer el formulario se cambia el destino y se rechazan las lecturas pendientes del formulario anterior. Una pestaña distinta no recibe lecturas de esta sesión.

La sesión vence a los 30 minutos. Para cambiar de teléfono o de pestaña, desvincula y crea otra. Si falla la conexión, espera la confirmación o usa **Reintentar envío**; no es necesario volver a guardar el producto.

## Implementación y verificación

- Proyecto exclusivo: `zhtrwvbmkxxfxvdhgngs`, función `original-store-api`.
- Reutiliza `openBarcodeScanner`, con un modo continuo opcional; el uso habitual mantiene la confirmación y el cierre de cámara existentes.
- Realtime Broadcast privado a través de un flujo autenticado del servidor. La cuenta administradora se valida en cada solicitud y al reconectar el flujo cada 30 segundos.
- Sesiones y confirmaciones temporales en el caché privado existente; no se crean productos ni tablas públicas. Código de vinculación de un solo uso; credenciales de dispositivos aleatorias almacenadas como hashes. Ninguna clave de servidor se envía al navegador.
- Confirmación por identificador de lectura y destino compuesto de sesión, pestaña, formulario, versión y campo. Recuperación de lecturas pendientes después de una reconexión.
- Dependencia fijada: `@supabase/realtime-js@2.117.3`.
- Pruebas: `node --test tests/shared-scan.test.mjs tests/supabase-server.test.mjs` y `node tests/shared-scan-browser.mjs` (requiere Playwright y Edge). La integración usa dos contextos de navegador y una tercera pestaña aislada; valida el QR generado con el decodificador incluido y comprueba que no se guardan productos.
- Las pruebas locales simulan la entrega de Realtime; la lectura con cámara física y el flujo autenticado en producción se comprueban al vincular los dispositivos reales.

## Corrección local de IDs y sesión (14 de octubre de 2026)

Los cambios de esta revisión quedan solo en la carpeta local. No se han publicado en GitHub ni desplegado.

- Un ID madre escrito genera el principal `MADRE-V01` y referencias libres `V02`, `V03`… para variantes automáticas, incluidas las ya abiertas. Se comprueban tanto IDs como códigos de barras para impedir referencias ambiguas o duplicadas.
- Un código físico principal escrito o leído por el escáner existente, local o vinculado, sustituye la madre y actualiza las referencias y QR. Un código de variante solo cambia esa variante. Los códigos propios de las demás se conservan.
- El celular recibe la madre y la referencia real del campo elegido en el PC. Se conserva la vinculación y no se guardan productos al leer códigos.
- Se elimina el cierre absoluto del administrador a los 30 minutos. Se bloquea tras 30 minutos sin interacción real, al vencer la credencial o cuando el servidor rechaza la sesión. Los sondeos automáticos no prolongan la actividad. El vencimiento temporal de la vinculación del escáner se mantiene independiente.
- El borrador de producto y variantes se conserva en `sessionStorage`, dentro de la misma pestaña y asociado a la cuenta autenticada. Incluye las identidades originales necesarias para continuar una edición; excluye contraseñas, credenciales, tokens y archivos sin subir. Al salir se elimina la credencial de memoria. El borrador nunca implica un guardado de inventario.

Archivos de la interfaz que deben acompañarse cuando el propietario decida publicar: `administrativo.html`, `admin-app.js`, `admin-shared-scan.js`, `admin-password-access.js` y los nuevos `admin-product-identity.js` y `admin-session-draft.js`. Esta revisión no cambia el servidor ni requiere migraciones.

Prueba adicional: `node tests/admin-identity-browser.mjs`. Usa el HTML, los formularios y el lector existentes en dos navegadores, con datos y acceso de prueba. Toda conexión externa se intercepta y se impide guardar productos. Comprueba IDs escritos y escaneados, variantes nuevas y guardadas, QR, duplicados, conservación de campos, borradores, actividad durante 35 minutos, bloqueo por inactividad y vencimiento de credenciales.
