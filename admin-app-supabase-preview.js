const GOOGLE_SHEET_API = window.ORIGINAL_STORE_API_URL;

// Las credenciales administrativas se mantienen en memoria y se envían solo al servidor.
const adminNativeFetch = window.fetch.bind(window);
let secureAdminCredential = '';
let secureAdminExpiryTimer;
function revokeAdminSession() {
    const token=secureAdminCredential;secureAdminCredential='';clearTimeout(secureAdminExpiryTimer);
    if(token.startsWith('BLYXU-A3-'))adminNativeFetch(GOOGLE_SHEET_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'adminlogout',adminCredential:token}),keepalive:true}).catch(()=>{});
}
function logoutAdminSecurely(){revokeAdminSession();sessionStorage.removeItem('blyxu_admin_orders_invoices_cache_v2');location.href='index.html';}
let adminRefreshInProgress = false;
async function refreshAdministrator(button) {
    if (adminRefreshInProgress) return;
    if (!secureAdminCredential) { showToast('Inicia sesión para actualizar el administrador.', 'error'); return; }
    adminRefreshInProgress = true;
    const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'Actualizando…'; }
    try {
        siteConfigPromise = null;
        const jobs = [
            () => cargarInventario({force:true,silent:true,throwOnError:true}),
            () => cargarPedidos({force:true,throwOnError:true}),
            () => loadSiteConfigForAdmin({force:true,throwOnError:true}),
            () => window.refreshOrderNotifications?.({throwOnError:true}),
            () => typeof refreshCustomerAccessCount === 'function' ? refreshCustomerAccessCount({throwOnError:true}) : undefined
        ];
        if (document.getElementById('view-users')?.classList.contains('active')) jobs.push(() => loadCustomerUsers({throwOnError:true}));
        if (document.getElementById('pending-products-panel') && !document.getElementById('pending-products-panel').hidden) jobs.push(() => window.BlyxuPendingProducts?.refresh({throwOnError:true}));
        const names = ['inventario','pedidos y facturas','configuración','pedidos nuevos','solicitudes'];
        if(document.getElementById('view-users')?.classList.contains('active'))names.push('usuarios');
        if(document.getElementById('pending-products-panel') && !document.getElementById('pending-products-panel').hidden)names.push('pendientes');
        const results = await Promise.allSettled(jobs.map(job => Promise.resolve().then(job)));
        renderAdminDashboard();
        const failed = results.flatMap((result,index) => result.status === 'rejected' ? [names[index]] : []);
        showToast(failed.length ? 'No se pudo actualizar: '+failed.join(', ')+'. Revisa tu conexión e inténtalo de nuevo.' : 'Datos actualizados. Tu sesión sigue abierta.', failed.length ? 'error' : 'success');
    } finally {
        adminRefreshInProgress = false;
        if (button) { button.disabled = false; button.textContent = label; }
    }
}
window.logoutAdminSecurely=logoutAdminSecurely;
window.fetch = async function(input, options = {}) {
    const address = typeof input === 'string' ? input : input?.url;
    if (!address || address.split('?')[0] !== GOOGLE_SHEET_API || !secureAdminCredential) return adminNativeFetch(input, options);
    const url = new URL(address);
    let payload = Object.fromEntries(url.searchParams);
    if (options.body instanceof FormData || options.body instanceof URLSearchParams) payload = {...payload, ...Object.fromEntries(options.body)};
    else if (typeof options.body === 'string') payload = {...payload, ...JSON.parse(options.body)};
    if (!options.method || options.method.toUpperCase() === 'GET') payload.action = payload.action || 'get';
    payload.adminCredential = secureAdminCredential;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, {once:true});
    const timeout = setTimeout(abort, 25000);
    try {
        const response = await adminNativeFetch(GOOGLE_SHEET_API, {...options,cache:'no-store',signal:controller.signal,method:'POST',mode:'cors',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
        if (!response.ok) throw new Error('El servidor no respondió correctamente.');
        const result = await response.clone().json();
        if (result.ok === false || result.status === 'error') throw new Error(result.error || 'No se pudo completar la operación.');
        return response;
    } catch(error) {
        if(error.name === 'AbortError') throw new Error('La consulta tardó demasiado. Vuelve a actualizar los datos.');
        throw error;
    } finally {clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
};
const GOOGLE_SHEET_PRODUCTS_URL = `${GOOGLE_SHEET_API}?resource=productos`;
let inventario = [];
const RETAIL_PRICE_VISIBILITY_KEY = 'blyxu_show_retail_prices';
const RETAIL_PRICE_CONFIG_KEY = 'Mostrar_Precios_Minorista';
const MERCADO_PAGO_ENABLED_CONFIG_KEY = 'Mercado_Pago_Publico_Activo';
const CONTACT_CONFIG_FIELDS = [
    ['Contacto_Dias', 'contact-config-days'],
    ['Contacto_Horarios', 'contact-config-hours'],
    ['Contacto_WhatsApp', 'contact-config-whatsapp'],
    ['Contacto_Facebook', 'contact-config-facebook'],
    ['Contacto_TikTok', 'contact-config-tiktok'],
    ['Contacto_Instagram', 'contact-config-instagram']
];
const WHATSAPP_CONFIG_FIELDS = [
    ['WhatsApp_Comercial', 'whatsapp-config-commerce']
];
const INVOICE_CONFIG_FIELDS = [
    ['Factura_Logo', 'inv-config-logo'],
    ['Factura_Empresa', 'inv-config-empresa'],
    ['Factura_NIT', 'inv-config-nit'],
    ['Factura_Direccion', 'inv-config-direccion'],
    ['Factura_Telefono', 'inv-config-telefono'],
    ['Factura_Email', 'inv-config-email']
];
const INVENTORY_CACHE_KEY = `blyxu_admin_inventory_cache_v3:${GOOGLE_SHEET_API}`;
const PUBLIC_PRODUCTS_CACHE_KEY = `original_store_products_drive_v4:${GOOGLE_SHEET_API}`;
const SITE_CONFIG_CACHE_KEY = `blyxu_site_config_cache_v1:${GOOGLE_SHEET_API}`;
const INVENTORY_BATCH_SIZE = 25;
const MAX_CAROUSEL_IMAGE_SIZE = 5 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_EDGE = 1200;
const IMAGE_UPLOAD_QUALITY = 0.76;
const IMAGE_UPLOAD_FORMAT = 'image/webp';
const IMAGE_UPLOAD_EXTENSION = 'webp';
const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

let siteConfigPromise = null;
let inventoryRenderedRows = 0;
let inventoryRenderToken = 0;
let inventoryLoadMoreObserver = null;
let filteredInventario = [];
let adminInventorySearchQuery = '';
let adminInventoryCategoryFilter = 'todos';
let adminInventoryPdfSelectedCategoryKeys = null;
let isEditingProduct = false;
let inventoryFetchToken = 0;
let inventoryLoadingPromise = null;
const PRODUCT_CATEGORY_FIELD_KEYS = ['Categor\u00eda', 'Categoria', 'Categor\u00c3\u00ada', 'Categor\u00c3\u0192\u00c2\u00ada', 'categoria'];
const PRODUCT_PROMOTION_FIELD_KEYS = ['Promocion', 'Promoci\u00f3n', 'Promoci\u00c3\u00b3n', 'Promoci\u00c3\u0192\u00c2\u00b3n', 'promo', 'Promo'];
const PRODUCT_BARCODE_FIELD_KEYS = ['Codigo Barras', 'Codigo de Barras', 'C\u00f3digo de Barras', 'Codigo_Barras', 'codigoBarras', 'barcode', 'Barcode'];
const PRODUCT_COLOR_OPTIONS = [
    { name: 'Dorado', hex: '#d4a017' },
    { name: 'Plateado', hex: '#c0c0c0' },
    { name: 'Negro', hex: '#222222' },
    { name: 'Blanco', hex: '#ffffff', light: true },
    { name: 'Perla', hex: '#f5ead2', light: true },
    { name: 'Rosado', hex: '#f4a7b9' },
    { name: 'Fucsia', hex: '#ec4899' },
    { name: 'Rojo', hex: '#e53e3e' },
    { name: 'Azul', hex: '#38a7df' },
    { name: 'Turquesa', hex: '#45d3d0' },
    { name: 'Verde', hex: '#22c55e' },
    { name: 'Amarillo', hex: '#facc15' },
    { name: 'Morado', hex: '#9b2cfa' },
    { name: 'Cafe', hex: '#8b5e34' },
    { name: 'Multicolor', hex: 'linear-gradient(135deg,#e53e3e,#facc15,#22c55e,#38a7df,#9b2cfa)' }
];

function formatAdminMoney(value) {
    return '$' + (parseFloat(value) || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 });
}

function normalizeBarcodeValue(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '')
        .toUpperCase()
        .slice(0, 48);
}

function makeProductBarcode(idProducto, idVariacion) {
    const base = normalizeBarcodeValue(idVariacion || idProducto);
    return base ? `BLYXU-${base}` : '';
}

function getProductBarcode(product, fallback = '') {
    const stored = getProductField(product, PRODUCT_BARCODE_FIELD_KEYS, '');
    if (stored) return normalizeBarcodeValue(stored);
    const idProducto = getProductField(product, ['ID Producto', 'idProducto'], '');
    const idVariacion = getProductField(product, ['ID Variacion', 'ID Variación', 'idVariacion', 'ID', 'id'], '');
    return makeProductBarcode(idProducto, idVariacion) || fallback;
}

function setProductBarcodeAliases(payload, barcode) {
    const cleanBarcode = normalizeBarcodeValue(barcode || makeProductBarcode(
        payload?.['ID Producto'] || payload?.idProducto,
        payload?.['ID Variacion'] || payload?.['ID Variación'] || payload?.idVariacion || payload?.ID
    ));
    if (!cleanBarcode) return payload;
    payload['Codigo Barras'] = cleanBarcode;
    payload['Codigo de Barras'] = cleanBarcode;
    payload['Código de Barras'] = cleanBarcode;
    payload.Codigo_Barras = cleanBarcode;
    payload.codigoBarras = cleanBarcode;
    payload.Barcode = cleanBarcode;
    return payload;
}

function readAdminCachedSiteConfigValue(key, fallback = '') {
    if (window.storeConfig && window.storeConfig[key] !== undefined) return window.storeConfig[key];
    try {
        const cached = JSON.parse(localStorage.getItem(SITE_CONFIG_CACHE_KEY) || 'null');
        if (cached?.data && cached.data[key] !== undefined) return cached.data[key];
    } catch (error) {
        return fallback;
    }
    return fallback;
}

function getAdminPromotionDiscountPercent() {
    const titleInput = document.getElementById('promo-config-title');
    const promoTitle = titleInput?.value?.trim() || readAdminCachedSiteConfigValue('Promo_Title', '');
    const match = String(promoTitle || '').match(/(\d+)%/);
    if (match) {
        const percent = parseInt(match[1], 10);
        if (percent > 0 && percent < 100) return percent;
    }

    const promoDiscount = parseInt(readAdminCachedSiteConfigValue('Promo_Discount', ''), 10);
    if (promoDiscount > 0 && promoDiscount < 100) return promoDiscount;

    return 20;
}

function updateLivePreview() {
    const nombre = document.getElementById('prod-nombre')?.value || 'Nombre del Producto';
    const categoria = document.getElementById('prod-categoria')?.value || 'CATEGORÍA';
    const precio = document.getElementById('prod-precio')?.value || '0';
    const precioMayorista = document.getElementById('prod-precio-mayorista')?.value || '';
    const galleryUrls = getAdminGalleryUrls();
    const imagenUrl = document.getElementById('prod-imagen')?.value || galleryUrls[0] || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180';
    const estado = document.getElementById('prod-estado')?.value || 'Activo';
    const catalogo = document.getElementById('prod-catalogo')?.value || 'Ambos';
    const stock = Number(document.getElementById('prod-stock-inicial')?.value || 0);
    const descripcion = document.getElementById('prod-descripcion')?.value?.trim() || '';
    const color = document.getElementById('prod-color')?.value?.trim() || '';
    const estilo = document.getElementById('prod-estilo')?.value?.trim() || '';
    const medida = typeof getProductSizeValue === 'function' ? getProductSizeValue() : (document.getElementById('prod-tamano')?.value || '');
    if (typeof syncAllVariantAutoSizes === 'function') syncAllVariantAutoSizes();
    var idVar = document.getElementById('prod-id')?.value || '';
    var idProd = document.getElementById('prod-id-producto')?.value || '';
    const activeVariantPreviewRow = getActiveVariantPreviewRow();
    const previewImageUrl = activeVariantPreviewRow?.image || imagenUrl;

    var idBadge = document.getElementById('preview-id-badge');
    if (idBadge && (idProd || idVar)) {
        var idText = idProd ? 'ID: ' + idProd : '';
        if (idVar && idVar !== idProd) idText += ' | VAR: ' + idVar;
        if (idText) {
            idBadge.textContent = idText;
            idBadge.style.display = 'block';
            idBadge.style.background = 'rgba(0,0,0,0.6)';
            idBadge.style.fontSize = '9px';
            idBadge.style.right = '10px';
            idBadge.style.left = 'auto';
        }
    }

    const titleEl = document.getElementById('preview-title-el');
    const catEl = document.getElementById('preview-cat-el');
    if (titleEl) titleEl.textContent = nombre;
    if (catEl) catEl.textContent = categoria;

    const parsedPrecio = parseAmount(precio);
    const parsedMayorista = parseAmount(precioMayorista);

    const promoSelect = document.getElementById('prod-promocion');
    const promoScope = normalizePromotionValue(promoSelect?.value || 'FALSO');
    const discountPercent = promoScope !== 'FALSO' ? getAdminPromotionDiscountPercent() : 0;
    const discountFactor = discountPercent ? 1 - (discountPercent / 100) : 1;

    const retailApplies = discountPercent > 0 && (promoScope === 'Ambos' || promoScope === 'Minorista');
    const wholesaleApplies = discountPercent > 0 && (promoScope === 'Ambos' || promoScope === 'Mayorista');

    let priceHtml = '';
    if (parsedPrecio > 0) {
        if (retailApplies) {
            const promoPrice = Math.round(parsedPrecio * discountFactor);
            priceHtml = `<span style="color:#ffd969; text-shadow:0 0 12px rgba(255,217,105,.35);">${formatAdminMoney(promoPrice)}</span> <span style="font-size:12px; color:rgba(255,255,255,.38); text-decoration:line-through; margin-left:6px;">${formatAdminMoney(parsedPrecio)}</span> <span style="font-size:10px; color:#ffd969; border:1px solid rgba(255,217,105,.28); border-radius:4px; padding:2px 5px; margin-left:6px;">-${discountPercent}%</span>`;
        } else {
            priceHtml = formatAdminMoney(parsedPrecio);
        }
        if (parsedMayorista > 0) {
            const wholesaleText = wholesaleApplies
                ? `${formatAdminMoney(Math.round(parsedMayorista * discountFactor))} <span style="text-decoration:line-through; color:rgba(255,255,255,.35); margin-left:4px;">${formatAdminMoney(parsedMayorista)}</span> <span style="color:#ffd969; font-size:10px;">-${discountPercent}%</span>`
                : formatAdminMoney(parsedMayorista);
            priceHtml += ` <span style="font-size:11px; font-weight:600; color:var(--text-muted); margin-left:8px; border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius:4px;">Por mayor: ${wholesaleText}</span>`;
        }
    } else if (parsedMayorista > 0) {
        if (wholesaleApplies) {
            const promoWholesale = Math.round(parsedMayorista * discountFactor);
            priceHtml = `<span style="font-size:11px; font-weight:600; color:var(--text-muted); border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius:4px;">Por mayor: <span style="color:#ffd969;">${formatAdminMoney(promoWholesale)}</span> <span style="text-decoration:line-through; color:rgba(255,255,255,.35); margin-left:4px;">${formatAdminMoney(parsedMayorista)}</span> <span style="color:#ffd969; margin-left:4px;">-${discountPercent}%</span></span>`;
        } else {
            priceHtml = `<span style="font-size:11px; font-weight:600; color:var(--text-muted); border: 1px solid rgba(255,255,255,0.1); padding: 2px 6px; border-radius:4px;">Por mayor: ${formatAdminMoney(parsedMayorista)}</span>`;
        }
    } else {
        priceHtml = '$0';
    }
    const previewUsesWholesalePrice = catalogo === 'Mayorista' && parsedMayorista > 0;
    const previewBasePrice = previewUsesWholesalePrice ? parsedMayorista : (parsedPrecio || parsedMayorista);
    const previewPromoApplies = discountPercent > 0 && (
        previewUsesWholesalePrice
            ? (promoScope === 'Ambos' || promoScope === 'Mayorista')
            : (promoScope === 'Ambos' || promoScope === 'Minorista')
    );
    if (previewBasePrice > 0) {
        if (previewPromoApplies) {
            const promoPrice = Math.round(previewBasePrice * discountFactor);
            priceHtml = `${formatAdminMoney(promoPrice)} <span class="old">${formatAdminMoney(previewBasePrice)}</span>`;
        } else {
            priceHtml = formatAdminMoney(previewBasePrice);
        }
    } else {
        priceHtml = stock > 0 ? 'Precio por consultar' : 'Agotado por ahora';
    }
    const priceEl = document.getElementById('preview-price-el');
    if (priceEl) priceEl.innerHTML = priceHtml;
    const colorStrip = document.getElementById('preview-color-strip');
    const colorLabel = splitProductColorValues(color).map(getColorDisplayName).join(', ');
    if (colorStrip) {
        colorStrip.innerHTML = getPreviewColorDotsHtml(color);
        colorStrip.style.display = color ? 'flex' : 'none';
    }
    const colorText = document.getElementById('preview-color-text');
    if (colorText) colorText.textContent = colorLabel || 'Varios';
    const styleText = document.getElementById('preview-style-text');
    const styleRow = document.getElementById('preview-style-row');
    if (styleText) styleText.textContent = estilo || '';
    if (styleRow) styleRow.style.display = estilo ? 'flex' : 'none';
    const sizeRow = document.getElementById('preview-size-row');
    const stockValue = document.getElementById('preview-stock-value');
    if (stockValue) stockValue.textContent = stock > 0 ? 'Disponible' : 'Agotado por ahora';
    const stockAlert = document.getElementById('preview-stock-alert');
    if (stockAlert) {
        stockAlert.className = 'preview-stock-alert';
        if (stock <= 0) {
            stockAlert.textContent = 'Agotado';
            stockAlert.classList.add('is-out');
            stockAlert.style.display = 'inline-flex';
        } else if (stock <= 3) {
            stockAlert.textContent = 'Bajo stock';
            stockAlert.classList.add('is-low');
            stockAlert.style.display = 'inline-flex';
        } else {
            stockAlert.style.display = 'none';
        }
    }
    const measureLine = document.getElementById('preview-measure-line');
    if (measureLine) {
        measureLine.textContent = medida || '';
        if (sizeRow) sizeRow.style.display = medida ? 'flex' : 'none';
    }
    const descEl = document.getElementById('preview-product-desc');
    if (descEl) descEl.textContent = descripcion || 'Sin descripcion disponible.';
    const buyBtn = document.getElementById('preview-buy-btn');
    const consultBtn = document.getElementById('preview-consult-btn');
    const cartNote = document.getElementById('preview-cart-note');
    const hasVisiblePrice = previewBasePrice > 0;
    if (buyBtn) {
        buyBtn.disabled = stock <= 0;
        buyBtn.textContent = stock <= 0
            ? 'Agotado por ahora'
            : (hasVisiblePrice ? 'Añadir al Carrito' : 'Añadir a consulta general');
    }
    if (consultBtn) consultBtn.style.display = !hasVisiblePrice && stock > 0 ? 'inline-flex' : 'none';
    if (cartNote) cartNote.style.display = !hasVisiblePrice && stock > 0 ? 'block' : 'none';

    const imgEl = document.getElementById('preview-img-el');
    if (imgEl) {
        const currentSrc = imgEl.getAttribute('src');
        if (currentSrc !== previewImageUrl) {
            // Evitar parpadeo: solo actualizar si el origen realmente cambió
            imgEl.style.transition = 'opacity 0.2s';
            imgEl.style.opacity = '0.4';

            loadImageWithRetry(previewImageUrl, 3, 700).then(() => {
                const localPreviewSrc = imgEl.dataset.localPreviewSrc;
                imgEl.src = previewImageUrl;
                imgEl.style.opacity = '1';
                delete imgEl.dataset.localPreviewSrc;
                if (localPreviewSrc) URL.revokeObjectURL(localPreviewSrc);
            }).catch(() => {
                if (imgEl.dataset.localPreviewSrc) {
                    imgEl.src = imgEl.dataset.localPreviewSrc;
                    imgEl.style.opacity = '0.85';
                    return;
                }
                imgEl.src = 'https://lh3.googleusercontent.com/d/1tab2v6baqQeNF7qMPaXmevFX1Cfh063V=w900';
                imgEl.style.opacity = '0.3';
            });
        }
    }

    const badgeEl = document.getElementById('preview-badge-el');
    if (badgeEl) {
        if (estado === 'Agotado') {
            badgeEl.textContent = 'AGOTADO';
            badgeEl.style.display = 'block';
            badgeEl.style.background = 'rgba(239,68,68,0.85)';
        } else if (estado === 'Inactivo') {
            badgeEl.textContent = 'OCULTO';
            badgeEl.style.display = 'block';
            badgeEl.style.background = 'rgba(100,100,100,0.85)';
        } else {
            badgeEl.style.display = 'none';
        }
    }

    const setPreviewDetail = (id, value) => {
        const node = document.getElementById(id);
        if (node) node.textContent = value;
    };
    const galleryCount = (document.getElementById('prod-imagen')?.value ? 1 : 0) + galleryUrls.length;
    const variantParts = [colorLabel, estilo, medida].filter(Boolean);
    const promoText = promoScope === 'FALSO'
        ? 'No aplica'
        : `${promoScope} -${discountPercent || 0}%`;

    setPreviewDetail('preview-detail-state', estado);
    setPreviewDetail('preview-detail-id', idProd || 'Automatico');
    setPreviewDetail('preview-detail-catalog', catalogo);
    setPreviewDetail('preview-detail-stock', `${stock} ${stock === 1 ? 'unidad' : 'unidades'}`);
    setPreviewDetail('preview-detail-price', parsedPrecio > 0 ? formatAdminMoney(parsedPrecio) : '$0');
    setPreviewDetail('preview-detail-wholesale', parsedMayorista > 0 ? formatAdminMoney(parsedMayorista) : 'Sin precio');
    setPreviewDetail('preview-detail-variant', variantParts.length ? variantParts.join(' / ') : 'Sin color / talla');
    setPreviewDetail('preview-detail-gallery', galleryCount > 0 ? `${galleryCount} ${galleryCount === 1 ? 'imagen' : 'imagenes'}` : 'Sin imagen');
    setPreviewDetail('preview-detail-promo', promoText);
    setPreviewDetail('preview-detail-desc', descripcion || 'La descripcion aparecera aqui mientras escribes.');

    renderProductPreviewGallery(previewImageUrl);
    renderProductPreviewOptions(previewImageUrl);
    if (activeVariantPreviewRow) applyPreviewVariantRow(activeVariantPreviewRow);
}

function loadImageWithRetry(src, attempts = 2, delayMs = 500) {
    return new Promise((resolve, reject) => {
        if (!src) {
            reject(new Error('Imagen vacia'));
            return;
        }

        let attempt = 0;
        const tryLoad = () => {
            const tempImg = new Image();
            tempImg.onload = () => resolve(src);
            tempImg.onerror = () => {
                attempt += 1;
                if (attempt >= attempts) {
                    reject(new Error('No se pudo cargar la imagen'));
                    return;
                }
                setTimeout(tryLoad, delayMs);
            };
            tempImg.src = src;
        };

        tryLoad();
    });
}

function getProductField(product, fields, fallback = '') {
    const names = Array.isArray(fields) ? fields : [fields];

    // Exact match first
    for (const name of names) {
        if (product && product[name] !== undefined && product[name] !== null && product[name] !== '') {
            return product[name];
        }
    }

    // Fuzzy match for broken keys (spaces, accents, etc.)
    if (product) {
        for (const key in product) {
            const cleanKey = key.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
            for (const name of names) {
                const cleanName = name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                if (cleanKey === cleanName && product[key] !== undefined && product[key] !== null && product[key] !== '') {
                    return product[key];
                }
            }
        }
    }

    return fallback;
}

function getAdminImageTargetWidth(kindOrWidth = 'default') {
    if (typeof kindOrWidth === 'number') return Math.max(80, Math.min(kindOrWidth, 1800));
    const key = String(kindOrWidth || 'default');
    const widths = {
        thumb: 160,
        inventory: 220,
        card: 420,
        banner: 1400,
        default: 800
    };
    return widths[key] || widths.default;
}

function resizeAdminGoogleImageUrl(url, kindOrWidth = 'default') {
    const src = String(url || '').trim();
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src;
    const width = getAdminImageTargetWidth(kindOrWidth);

    if (/drive\.google\.com\/thumbnail/i.test(src)) {
        try {
            const parsed = new URL(src);
            parsed.searchParams.set('sz', `w${width}`);
            return parsed.toString();
        } catch (_) {
            return src.replace(/([?&]sz=)w\d+/i, `$1w${width}`);
        }
    }

    if (/lh3\.googleusercontent\.com\/d\//i.test(src)) {
        if (/=w\d+(?:-h\d+)?(?:-[a-z-]+)?(?=([?#]|$))/i.test(src)) {
            return src.replace(/=w\d+(?:-h\d+)?(?:-[a-z-]+)?(?=([?#]|$))/i, `=w${width}`);
        }
        const queryIndex = src.search(/[?#]/);
        if (queryIndex >= 0) return `${src.slice(0, queryIndex)}=w${width}${src.slice(queryIndex)}`;
        return `${src}=w${width}`;
    }

    return src;
}

function normalizeImageUrl(value, imageSize = 'default') {
    if (!value) return '';

    if (Array.isArray(value)) {
        return normalizeImageUrl(value[0], imageSize);
    }

    if (typeof value === 'object') {
        return normalizeImageUrl(value.url || value.src || value.imagen || value.image || '', imageSize);
    }

    const raw = String(value).split('\n')[0].trim();
    if (!raw) return '';

    const firstUrl = raw.includes(',http') ? raw.split(',http')[0].trim() : raw;
    const driveMatch =
        firstUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/) ||
        firstUrl.match(/drive\.google\.com\/thumbnail\?(?:[^&]+&)*id=([^&#]+)/) ||
        firstUrl.match(/[?&]id=([^&]+)/);

    if (firstUrl.includes('drive.google.com') && driveMatch && driveMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w${getAdminImageTargetWidth(imageSize)}`;
    }

    if (firstUrl.startsWith('//')) return `https:${firstUrl}`;

    return resizeAdminGoogleImageUrl(firstUrl, imageSize);
}

function parseAdminGalleryValue(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(normalizeImageUrl).filter(Boolean);
    if (typeof value === 'object') return [normalizeImageUrl(value)].filter(Boolean);

    const text = String(value || '').trim();
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        return parseAdminGalleryValue(parsed);
    } catch (error) {
        return text
            .split(/[\r\n]+|,\s*(?=https?:\/\/|\/\/|data:image\/)/i)
            .map(normalizeImageUrl)
            .filter(Boolean);
    }
}

function stringifyAdminGallery(urls) {
    const cleaned = [];
    const seen = new Set();
    parseAdminGalleryValue(urls).forEach(url => {
        const normalized = normalizeImageUrl(url);
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        cleaned.push(normalized);
    });
    return cleaned.length ? JSON.stringify(cleaned) : '';
}

function getIn…12152 tokens truncated…RL(blob);
        try {
            return await resizeImageForPdf(objectUrl, maxEdge);
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    } catch (error) {
        try {
            return await resizeImageForPdf(cleanUrl, maxEdge);
        } catch (directError) {
            try {
                return await resizeImageForPdf('https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180', maxEdge);
            } catch (fallbackError) {
                return '';
            }
        }
    }
}

function drawInventoryPdfHeader(doc, meta) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(18, 18, 24);
    doc.rect(0, 0, pageWidth, 27, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('Original Store - Inventario actual', 10, 10.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Categoría: ${meta.categoryTitle}`, 10, 16.5);
    doc.text(`Expedido: ${meta.fullDateString}`, 10, 22);
    doc.text(`Productos: ${meta.totalProducts}`, pageWidth - 10, 16.5, { align: 'right' });
    doc.text(meta.priceModeLabel, pageWidth - 10, 22, { align: 'right' });
}

function drawInventoryPdfFooter(doc, pageNumber) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(230, 230, 230);
    doc.line(10, pageHeight - 12, pageWidth - 10, pageHeight - 12);
    doc.setTextColor(120, 120, 120);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Original Store - Catálogo de inventario', 10, pageHeight - 7);
    doc.text(`Página ${pageNumber}`, pageWidth - 10, pageHeight - 7, { align: 'right' });
}

function drawInventoryPdfTableHeader(doc, columns, y) {
    const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(245, 242, 237);
    doc.rect(10, y, pageWidth - 20, 9, 'F');
    doc.setTextColor(65, 60, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    columns.forEach(col => doc.text(col.label, col.x, y + 5.8, col.align ? { align: col.align } : undefined));
}

async function buildInventoryPdfRows(products) {
    const rows = [];
    for (const product of products) {
        const priceDetal = Number(product.Precio || product.precio || 0) || 0;
        const priceMayor = Number(product.Precio_Mayorista || product.precio_mayorista || product.Mayorista || product['Precio Mayor'] || product['Precio_Mayor'] || 0) || 0;
        rows.push({
            image: await imageUrlToPdfDataUrl(getInventoryPdfProductImage(product), 260),
            name: String(product.Nombre || product.Producto || 'Producto Original Store').trim(),
            reference: String(getInventoryPdfReference(product) || '').trim(),
            sizes: Array.isArray(product._availableSizes) ? product._availableSizes.filter(Boolean).join(', ') : '',
            categoryKey: normalizeInventoryCategoryKey(product.Categoria || product.categoria || '-'),
            categoryLabel: formatInventoryCategoryLabel(product.Categoria || product.categoria || '-'),
            category: formatInventoryCategoryLabel(product.Categoria || product.categoria || '-'),
            detal: priceDetal > 0 ? formatAdminMoney(priceDetal) : '-',
            mayorista: priceMayor > 0 ? formatAdminMoney(priceMayor) : '-'
        });
    }
    return rows;
}

async function downloadInventoryCatalogPdf() {
    const selectedCategoryKeys = getSelectedInventoryPdfCategoryKeys();
    const pdfCategoryGroups = getInventoryPdfCategoryGroups();
    const allPdfCategoryKeys = pdfCategoryGroups.map(group => group.key);
    const selectedCategorySet = new Set(selectedCategoryKeys);
    const selectedCategoryLabels = pdfCategoryGroups
        .filter(group => selectedCategorySet.has(group.key))
        .map(group => group.label);
    const categoryText = selectedCategoryKeys.length === allPdfCategoryKeys.length
        ? 'Todas las categorías'
        : selectedCategoryLabels.length > 4
            ? `${selectedCategoryLabels.length} categorías: ${selectedCategoryLabels.slice(0, 4).join(', ')}...`
            : selectedCategoryLabels.join(', ');

    const showDetal = document.getElementById('inventory-pdf-show-detal')?.checked !== false;
    const showMayorista = document.getElementById('inventory-pdf-show-mayorista')?.checked !== false;
    const products = selectedCategoryKeys.length
        ? getInventoryProductsForCatalogPdf(selectedCategoryKeys)
        : [];

    if (!products.length) {
            showToast(selectedCategoryKeys.length ? 'No hay productos disponibles para exportar en estas categorías' : 'Selecciona al menos una categoría para el PDF', 'warning');
        return;
    }

    const btn = document.getElementById('btn-download-inventory-pdf');
    const originalText = btn?.textContent || 'Ver PDF';
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Generando PDF...';
    }

    try {
        if (!showDetal && !showMayorista) {
            showToast('Selecciona Detal, Mayorista o ambos para incluir precios en el PDF', 'warning');
            return;
        }

        showToast('Generando PDF de inventario...', 'info');
        const JsPDF = await loadJsPdfLibrary();
        const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
        const rows = await buildInventoryPdfRows(products);

        const now = new Date();
        const fullDateString = now.toLocaleString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        const dateSlug = now.toISOString().slice(0, 10);
        const priceModeLabel = [
            showDetal ? 'Detal' : '',
            showMayorista ? 'Mayorista' : ''
        ].filter(Boolean).join(' + ');
        const meta = {
            categoryTitle: categoryText,
            fullDateString,
            totalProducts: rows.length,
            priceModeLabel: `Precios: ${priceModeLabel}`
        };

        const bothPrices = showDetal && showMayorista;
        const columns = [
            { key: 'image', label: 'FOTO', x: 12, w: 34 },
            { key: 'product', label: 'PRODUCTO', x: 52, w: bothPrices ? 60 : 78 },
            { key: 'category', label: 'CATEGORÍA', x: bothPrices ? 116 : 136, w: bothPrices ? 30 : 34 },
            ...(showDetal ? [{ key: 'detal', label: 'DETAL', x: showMayorista ? 151 : 170, w: 20, align: 'right' }] : []),
            ...(showMayorista ? [{ key: 'mayorista', label: 'MAYORISTA', x: 176, w: 22, align: 'right' }] : [])
        ];

        let pageNumber = 1;
        let y = 36;
        const rowHeight = 38;
        const pageHeight = doc.internal.pageSize.getHeight();
        const bottomLimit = pageHeight - 17;
        let lastCategoryKey = '';

        drawInventoryPdfHeader(doc, meta);
        drawInventoryPdfTableHeader(doc, columns, y);
        y += 11;

        for (const row of rows) {
            const rowCategoryKey = row.categoryKey || normalizeInventoryCategoryKey(row.category || '');
            const isNewCategory = rowCategoryKey !== lastCategoryKey;
            const categoryBandHeight = isNewCategory ? 8 : 0;

            if (y + categoryBandHeight + rowHeight > bottomLimit) {
                drawInventoryPdfFooter(doc, pageNumber);
                doc.addPage();
                pageNumber += 1;
                drawInventoryPdfHeader(doc, meta);
                y = 36;
                drawInventoryPdfTableHeader(doc, columns, y);
                y += 11;
            }

            if (isNewCategory) {
                doc.setFillColor(248, 246, 252);
                doc.rect(10, y - 1, 190, 6, 'F');
                doc.setDrawColor(109, 40, 217);
                doc.line(10, y - 1, 200, y - 1);
                doc.setTextColor(85, 65, 135);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.text((row.categoryLabel || row.category || 'Categoría').toUpperCase(), 12, y + 3.4);
                y += 8;
                lastCategoryKey = rowCategoryKey;
            }

            doc.setDrawColor(232, 232, 232);
            doc.line(10, y - 2, 200, y - 2);

            if (row.image) {
                doc.addImage(row.image, 'JPEG', 12, y, 34, 34);
            } else {
                doc.setFillColor(245, 245, 245);
                doc.roundedRect(12, y, 34, 34, 2, 2, 'F');
            }

            const productCol = columns.find(item => item.key === 'product');
            const categoryCol = columns.find(item => item.key === 'category');

            doc.setTextColor(20, 20, 24);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.8);
            doc.text(doc.splitTextToSize(row.name, productCol.w).slice(0, 2), productCol.x, y + 5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(90, 90, 90);
            doc.setFontSize(6.2);
            doc.text(doc.splitTextToSize(`Ref: ${row.reference || '-'}`, productCol.w).slice(0, 1), productCol.x, y + 16);
            if (row.sizes) {
                doc.setTextColor(85, 65, 135);
                doc.setFont('helvetica', 'bold');
                doc.text(doc.splitTextToSize(`Tamaños: ${row.sizes}`, productCol.w).slice(0, 2), productCol.x, y + 22);
            }

            doc.setTextColor(45, 45, 45);
            doc.setFontSize(6.8);
            doc.text(doc.splitTextToSize(row.category || '-', categoryCol.w).slice(0, 2), categoryCol.x, y + 7);

            if (showDetal) {
                const col = columns.find(item => item.key === 'detal');
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(30, 30, 30);
                doc.setFontSize(7.2);
                doc.text(row.detal, col.x + col.w, y + 8, { align: 'right' });
            }
            if (showMayorista) {
                const col = columns.find(item => item.key === 'mayorista');
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(180, 128, 0);
                doc.setFontSize(7.2);
                doc.text(row.mayorista, col.x + col.w, y + 8, { align: 'right' });
            }

            y += rowHeight;
        }

        drawInventoryPdfFooter(doc, pageNumber);
        const cleanCategorySlug = String(categoryText || 'inventario')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'inventario';
        const fileName = `Inventario-BLYXU-${cleanCategorySlug}-${dateSlug}.pdf`;
        const blobUrl = URL.createObjectURL(doc.output('blob'));
        const previewWindow = window.open(blobUrl, '_blank');
        if (!previewWindow) {
            doc.save(fileName);
            URL.revokeObjectURL(blobUrl);
            showToast('No se pudo abrir la vista previa. PDF descargado directamente.', 'warning');
        } else {
            previewWindow.document.title = fileName;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
            showToast('Vista previa del PDF abierta. Puedes descargarlo desde el visor.', 'success');
        }
    } catch (error) {
        console.error('Error generando PDF de inventario:', error);
        showToast(error.message || 'No se pudo generar el PDF de inventario', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function initInventoryPdfExport() {
    initInventoryPdfCategoryPicker();
    const btn = document.getElementById('btn-download-inventory-pdf');
    if (!btn || btn.dataset.ready === 'true') return;
    btn.dataset.ready = 'true';
    btn.addEventListener('click', downloadInventoryCatalogPdf);
}

function buildVariantEditorCardHtml(v, idProducto) {
    var vid = getInventoryVariationId(v) || '-';
    var safeVid = escapeHtml(vid);
    var vEstilo = cleanProductStyleValue(getProductField(v, ['Estilo', 'estilo'], ''));
    var vTamano = getProductField(v, ['Tamano', 'Tamaño', 'Talla'], '');
    var vTipoMedida = normalizeSearchText(v.TipoMedida || v['Tipo Medida'] || '');
    var vUnidadMedida = v.UnidadMedida || v['Unidad Medida'] || 'cm';
    var vAncho = v.Ancho || '';
    var vLargo = v.Largo || '';
    var vFondo = v.Fondo || '';
    var vRadio = v.Radio || '';
    var vCapacidad = v.Capacidad || (vUnidadMedida === 'ml' ? vAncho : '');
    var vTallaTextil = v.TallaTextil || v['Talla Textil'] || '';
    var vColor = v.Color || '-';
    var vStock = v.Stock || v.Cantidad || 0;
    var vPrecio = Number(v.Precio || 0).toLocaleString('es-CO');
    var vSku = v.SKU || '-';
    var vBarcode = getProductBarcode(v);
    var vImage = normalizeImageUrl(v.Imagen || v['Imagen Principal'] || '') || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180';
    var barcodeInputId = 've-barcode-' + cleanInventoryId(vid);
    var html = '';

    html += '<article class="variant-edit-card" data-varid="' + safeVid + '">';
    html += '<div class="variant-edit-summary">';
    html += '<div class="variant-edit-thumb"><img src="' + escapeHtml(vImage) + '" alt="" onerror="handleInventoryImageError(this)"></div>';
    html += '<div><span>ID variante</span><strong>' + escapeHtml(vid) + '</strong></div>';
    html += '<div><span>Atributos</span><b>' + escapeHtml(getVariantAttributesLabel(v) || 'Sin atributos') + '</b>' + getColorSwatchesHtml(vColor !== '-' ? vColor : '') + '</div>';
    html += '<div><span>Stock</span><b style="color:' + (Number(vStock) > 0 ? '#10B981' : '#EF4444') + ';">' + escapeHtml(vStock) + '</b></div>';
    html += '<div><span>Precio</span><b>$' + escapeHtml(vPrecio) + '</b></div>';
    html += '<div><span>SKU</span><b>' + escapeHtml(vSku) + '</b></div>';
    html += '<button type="button" class="admin-btn secondary variant-edit-toggle" aria-expanded="false" onclick="expandirVarianteEdicion(\'' + vid + '\')">Editar</button>';
    html += '</div>';

    html += '<div class="variant-edit-panel var-edit-expanded" id="var-expand-' + safeVid + '" data-original-varid="' + safeVid + '">';
    html += '<section class="variant-edit-section"><h5><span>01</span> Identidad e imagen</h5><div class="variant-edit-grid">';
    html += '<div><label>ID</label><input class="form-control ve-id" value="' + escapeHtml(vid) + '"></div>';
    html += '<div><label>SKU</label><input class="form-control ve-sku" value="' + escapeHtml(v.SKU || '') + '"></div>';
    html += '<div><label>Codigo barras</label><div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;"><input class="form-control ve-barcode" id="' + barcodeInputId + '" value="' + escapeHtml(vBarcode) + '"><button type="button" class="admin-btn secondary" onclick="scanBarcodeToElement(\'' + barcodeInputId + '\')" style="width:auto;min-height:40px;padding:8px 12px;font-size:10px;">Scan</button></div></div>';
    html += '<div style="grid-column:1/-1;"><label>Imagen URL</label><input class="form-control ve-imagen" value="' + escapeHtml(v.Imagen || '') + '" placeholder="https://..."></div>';
    html += '</div></section>';

    html += '<section class="variant-edit-section"><h5><span>02</span> Atributos visibles</h5><div class="variant-edit-grid">';
    html += '<div><label>Estilo</label><input class="form-control ve-estilo" value="' + escapeHtml(vEstilo) + '"></div>';
    html += '<div><label>Tamano / medida</label><input class="form-control ve-tamano" value="' + escapeHtml(vTamano) + '"></div>';
    html += '<div><label>Color</label><input type="hidden" class="ve-color" value="' + escapeHtml(vColor !== '-' ? vColor : '') + '"><div class="color-picker" data-color-target=".ve-color" aria-label="Seleccionar color de variante"></div></div>';
    html += '</div></section>';

    html += '<section class="variant-edit-section"><h5><span>03</span> Precios e inventario</h5><div class="variant-edit-grid">';
    html += '<div><label>Stock</label><input type="number" class="form-control ve-stock" value="' + escapeHtml(vStock) + '"></div>';
    html += '<div><label>Precio detal</label><input class="form-control ve-precio" value="' + escapeHtml(v.Precio || '') + '"></div>';
    html += '<div><label>Precio mayorista</label><input class="form-control ve-precio-mayorista" value="' + escapeHtml(v.Precio_Mayorista || v.precio_mayorista || v.Mayorista || v['Precio Mayor'] || '') + '"></div>';
    html += '</div></section>';

    html += '<section class="variant-edit-section"><h5><span>04</span> Medidas opcionales</h5><div class="variant-edit-grid four">';
    html += '<div><label>Tipo tamano</label><select class="form-control ve-size-kind"><option value=""' + (!vTipoMedida ? ' selected' : '') + '>Normal</option><option value="textil"' + (vTipoMedida === 'textil' ? ' selected' : '') + '>Textil</option><option value="medidas"' + (vTipoMedida === 'medidas' ? ' selected' : '') + '>Medidas</option><option value="liquido"' + (vTipoMedida === 'liquido' ? ' selected' : '') + '>Liquidos / ml</option></select></div>';
    html += '<div><label>Unidad</label><select class="form-control ve-measure-unit"><option value="cm"' + (vUnidadMedida === 'cm' ? ' selected' : '') + '>cm</option><option value="m"' + (vUnidadMedida === 'm' ? ' selected' : '') + '>m</option><option value="m3"' + (vUnidadMedida === 'm3' ? ' selected' : '') + '>m3</option><option value="ml"' + (vUnidadMedida === 'ml' ? ' selected' : '') + '>ml</option></select></div>';
    html += '<div><label>Capacidad ml</label><input class="form-control ve-measure-capacity" value="' + escapeHtml(vCapacidad) + '" placeholder="500"></div>';
    html += '<div><label>Talla textil</label><input class="form-control ve-textile-size" value="' + escapeHtml(vTallaTextil) + '" placeholder="XS, S, M..."></div>';
    html += '<div><label>Ancho</label><input class="form-control ve-measure-width" value="' + escapeHtml(vAncho) + '"></div>';
    html += '<div><label>Largo</label><input class="form-control ve-measure-length" value="' + escapeHtml(vLargo) + '"></div>';
    html += '<div><label>Fondo</label><input class="form-control ve-measure-depth" value="' + escapeHtml(vFondo) + '"></div>';
    html += '<div><label>Radio</label><input class="form-control ve-measure-radius" value="' + escapeHtml(vRadio) + '"></div>';
    html += '</div></section>';

    html += '<div class="variant-edit-actions">';
    html += '<button type="button" class="admin-btn secondary" onclick="cerrarVarianteEdicion(\'' + vid + '\')" style="width:auto;padding:9px 16px;font-size:11px;">Cerrar editor</button>';
    html += '<button type="button" class="admin-btn" onclick="guardarVarianteEditada(\'' + vid + '\',\'' + idProducto + '\')" style="width:auto;padding:9px 18px;font-size:11px;">Guardar variante</button>';
    html += '</div></div></article>';
    return html;
}

function buildVariantEditorCardsHtml(variantes, idProducto) {
    return '<div class="variant-editor-shell"><div class="variant-editor-head"><div><h4>Variantes de este ID (' + variantes.length + ')</h4><span>Ordenadas igual que el alta de producto: identidad, atributos, precios y medidas.</span></div></div>'
        + variantes.map(function (variant) { return buildVariantEditorCardHtml(variant, idProducto); }).join('')
        + '</div>';
}

function syncEditModalProductNavigator(activeIndex) {
    var modal = document.getElementById('edit-product-modal');
    var select = document.getElementById('edit-modal-product-jump');
    var prevBtn = document.getElementById('edit-modal-prev-product');
    var nextBtn = document.getElementById('edit-modal-next-product');
    if (!modal || !select || !Array.isArray(inventario)) return;

    modal.dataset.activeProductIndex = String(activeIndex);
    var currentValue = String(activeIndex);
    select.innerHTML = inventario.map(function (product, index) {
        return '<option value="' + index + '">' + escapeHtml(getInventoryEditLabel(product, index)) + '</option>';
    }).join('');
    select.value = currentValue;
    select.disabled = inventario.length < 2;
    if (prevBtn) prevBtn.disabled = activeIndex <= 0;
    if (nextBtn) nextBtn.disabled = activeIndex >= inventario.length - 1;
}

function initEditModalProductNavigator() {
    var select = document.getElementById('edit-modal-product-jump');
    var prevBtn = document.getElementById('edit-modal-prev-product');
    var nextBtn = document.getElementById('edit-modal-next-product');
    if (!select || select.dataset.ready === 'true') return;
    select.dataset.ready = 'true';

    select.addEventListener('change', function () {
        var nextIndex = Number(select.value);
        if (Number.isInteger(nextIndex) && inventario[nextIndex]) editarProducto(nextIndex);
    });

    prevBtn?.addEventListener('click', function () {
        var current = Number(document.getElementById('edit-product-modal')?.dataset.activeProductIndex || 0);
        if (inventario[current - 1]) editarProducto(current - 1);
    });

    nextBtn?.addEventListener('click', function () {
        var current = Number(document.getElementById('edit-product-modal')?.dataset.activeProductIndex || 0);
        if (inventario[current + 1]) editarProducto(current + 1);
    });
}

function cargarVariantesAlFormulario(idProducto, idVariacionActual) {
    var container = document.getElementById('variants-container');
    if (!container) return;
    delete container.dataset.activePreviewVariantKey;
    container.innerHTML = '';
    if (!idProducto) return;

    var variantes = inventario.filter(function (prod) {
        var mid = getInventoryMotherId(prod);
        var vid = getInventoryVariationId(prod);
        return mid === idProducto && vid !== idVariacionActual;
    });

    if (!variantes.length) {
        container.innerHTML = '<div style="padding:16px;text-align:center;font-size:12px;color:rgba(255,255,255,0.3);border:1px dashed rgba(255,165,0,0.2);border-radius:12px;">Este producto no tiene variantes aún</div>';
        return;
    }

    var tableHtml = '<div style="margin-bottom:12px;"><h4 style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#FFA500;font-weight:800;margin:0;padding:0 4px 10px;">VARIANTES DE ESTE ID (' + variantes.length + ')</h4></div>';
    container.innerHTML = buildVariantEditorCardsHtml(variantes, idProducto);
    initColorPickers(container);
    return;

    tableHtml += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:separate;border-spacing:0 4px;font-size:11px;">';
    tableHtml += '<thead><tr style="color:rgba(255,255,255,0.25);font-size:9px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">';
    tableHtml += '<th style="padding:4px 8px;text-align:left;">ID Var</th><th style="padding:4px 8px;text-align:left;">Color</th><th style="padding:4px 8px;text-align:left;">Stock</th><th style="padding:4px 8px;text-align:left;">Precio</th><th style="padding:4px 8px;text-align:left;">SKU</th><th style="padding:4px 8px;text-align:center;">Acción</th>';
    tableHtml = tableHtml.replace('>Color</th>', '>Atributos</th>');
    tableHtml += '</tr></thead><tbody>';

    variantes.forEach(function (v) {
        var vid = getInventoryVariationId(v) || '-';
        var vEstilo = cleanProductStyleValue(getProductField(v, ['Estilo', 'estilo'], ''));
        var vTamano = getProductField(v, ['Tamano', 'Tamaño', 'Tamaño', 'Talla'], '');
        var vTipoMedida = normalizeSearchText(v.TipoMedida || v['Tipo Medida'] || '');
        var vUnidadMedida = v.UnidadMedida || v['Unidad Medida'] || 'cm';
        var vAncho = v.Ancho || '';
        var vLargo = v.Largo || '';
        var vFondo = v.Fondo || '';
        var vRadio = v.Radio || '';
        var vCapacidad = v.Capacidad || (vUnidadMedida === 'ml' ? vAncho : '');
        var vTallaTextil = v.TallaTextil || v['Talla Textil'] || '';
        var vColor = v.Color || '-';
        var vStock = v.Stock || v.Cantidad || 0;
        var vPrecio = Number(v.Precio || 0).toLocaleString('es-CO');
        var vSku = v.SKU || '-';
        var vBarcode = getProductBarcode(v);
        var barcodeInputId = 've-barcode-' + cleanInventoryId(vid);
        tableHtml += '<tr class="var-edit-row" data-varid="' + vid + '">';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:6px 0 0 6px;font-weight:700;color:#FFA500;white-space:nowrap;">' + vid + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:#fff;">' + escapeHtml(getVariantAttributesLabel(v)) + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);font-weight:700;color:' + (vStock > 0 ? '#10B981' : '#EF4444') + ';">' + vStock + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:#9B2CFA;font-weight:700;">$' + vPrecio + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);color:rgba(255,255,255,0.5);">' + vSku + '</td>';
        tableHtml += '<td style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:0 6px 6px 0;text-align:center;"><button class="admin-btn secondary" style="width:auto;padding:3px 10px;font-size:9px;border-radius:6px;" onclick="expandirVarianteEdicion(\'' + vid + '\')">Editar</button></td>';
        tableHtml += '</tr>';

        // Hidden expanded edit row
        tableHtml += '<tr class="var-edit-expanded" id="var-expand-' + vid + '" style="display:none;"><td colspan="6" style="padding:12px 16px;background:rgba(255,165,0,0.03);border-radius:8px;border-left:2px solid #FFA500;">';
        tableHtml += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px;">';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">ID</label><input class="form-control ve-id" value="' + vid + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Estilo</label><input class="form-control ve-estilo" value="' + escapeHtml(vEstilo) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Tamano</label><input class="form-control ve-tamano" value="' + escapeHtml(vTamano) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Color</label><input type="hidden" class="ve-color" value="' + escapeHtml(vColor !== '-' ? vColor : '') + '"><div class="color-picker" data-color-target=".ve-color" aria-label="Seleccionar color de variante"></div></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Stock</label><input type="number" class="form-control ve-stock" value="' + vStock + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Precio</label><input class="form-control ve-precio" value="' + (v.Precio || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Precio Mayor</label><input class="form-control ve-precio-mayorista" value="' + (v.Precio_Mayorista || v.precio_mayorista || v.Mayorista || v['Precio Mayor'] || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">SKU</label><input class="form-control ve-sku" value="' + (v.SKU || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Codigo barras</label><div style="display:flex;gap:6px;"><input class="form-control ve-barcode" id="' + barcodeInputId + '" value="' + escapeHtml(vBarcode) + '" style="padding:6px 10px;font-size:11px;"><button type="button" class="admin-btn secondary" onclick="scanBarcodeToElement(\'' + barcodeInputId + '\')" style="width:auto;min-height:30px;padding:5px 9px;font-size:9px;">Scan</button></div></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Imagen URL</label><input class="form-control ve-imagen" value="' + (v.Imagen || '') + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Tipo tama&ntilde;o</label><select class="form-control ve-size-kind" style="padding:6px 10px;font-size:11px;"><option value=""' + (!vTipoMedida ? ' selected' : '') + '>Normal</option><option value="textil"' + (vTipoMedida === 'textil' ? ' selected' : '') + '>Textil</option><option value="medidas"' + (vTipoMedida === 'medidas' ? ' selected' : '') + '>Medidas</option><option value="liquido"' + (vTipoMedida === 'liquido' ? ' selected' : '') + '>Liquidos / ml</option></select></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Unidad</label><select class="form-control ve-measure-unit" style="padding:6px 10px;font-size:11px;"><option value="cm"' + (vUnidadMedida === 'cm' ? ' selected' : '') + '>cm</option><option value="m"' + (vUnidadMedida === 'm' ? ' selected' : '') + '>m</option><option value="m3"' + (vUnidadMedida === 'm3' ? ' selected' : '') + '>m3</option><option value="ml"' + (vUnidadMedida === 'ml' ? ' selected' : '') + '>ml</option></select></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Capacidad ml</label><input class="form-control ve-measure-capacity" value="' + escapeHtml(vCapacidad) + '" placeholder="500" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Talla textil</label><input class="form-control ve-textile-size" value="' + escapeHtml(vTallaTextil) + '" placeholder="XS, S, M..." style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Ancho</label><input class="form-control ve-measure-width" value="' + escapeHtml(vAncho) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Largo</label><input class="form-control ve-measure-length" value="' + escapeHtml(vLargo) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Fondo</label><input class="form-control ve-measure-depth" value="' + escapeHtml(vFondo) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '<div><label style="font-size:9px;color:rgba(255,255,255,0.4);display:block;margin-bottom:2px;">Radio</label><input class="form-control ve-measure-radius" value="' + escapeHtml(vRadio) + '" style="padding:6px 10px;font-size:11px;"></div>';
        tableHtml += '</div>';
        tableHtml += '<div style="display:flex;gap:8px;"><button type="button" class="admin-btn" onclick="guardarVarianteEditada(\'' + vid + '\',\'' + idProducto + '\')" style="width:auto;padding:6px 16px;font-size:10px;background:linear-gradient(135deg,#FFA500,#FF6347);">Guardar cambios</button>';
        tableHtml += '<button type="button" class="admin-btn secondary" onclick="cerrarVarianteEdicion(\'' + vid + '\')" style="width:auto;padding:6px 16px;font-size:10px;">Cancelar</button></div>';
        tableHtml += '</td></tr>';
    });

    tableHtml += '</tbody></table></div>';
    container.innerHTML = tableHtml;
    initColorPickers(container);
}

function getVariantEditPanel(vid) {
    var direct = document.getElementById('var-expand-' + vid);
    if (direct) return direct;
    var panels = document.querySelectorAll('.var-edit-expanded');
    for (var i = 0; i < panels.length; i++) {
        if (panels[i].dataset.originalVarid === vid) return panels[i];
    }
    return null;
}

window.expandirVarianteEdicion = function (vid) {
    var row = getVariantEditPanel(vid);
    if (!row) return;
    var card = row.closest('.variant-edit-card');
    var isOpen = !row.classList.contains('is-open');
    row.style.display = '';
    row.classList.toggle('is-open', isOpen);
    card?.classList.toggle('is-editing', isOpen);
    if (isOpen && card) {
        setActiveVariantPreviewCard(card);
        updateLivePreview();
    }
    var button = card?.querySelector('.variant-edit-toggle');
    if (button) {
        button.textContent = isOpen ? 'Ocultar' : 'Editar';
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }
    if (isOpen) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
window.cerrarVarianteEdicion = function (vid) {
    var row = getVariantEditPanel(vid);
    if (!row) return;
    var card = row.closest('.variant-edit-card');
    var container = document.getElementById('variants-container');
    if (container && card && container.dataset.activePreviewVariantKey === getVariantPreviewCardKey(card)) {
        delete container.dataset.activePreviewVariantKey;
    }
    row.classList.remove('is-open');
    row.style.display = '';
    card?.classList.remove('is-editing');
    var button = card?.querySelector('.variant-edit-toggle');
    if (button) {
        button.textContent = 'Editar';
        button.setAttribute('aria-expanded', 'false');
    }
    updateLivePreview();
};

function getVariantEditMeasurementPayload(row, tamano = '') {
    const kind = row.querySelector('.ve-size-kind')?.value || '';
    const unit = kind === 'liquido' ? 'ml' : (row.querySelector('.ve-measure-unit')?.value || 'cm');
    const capacity = cleanMeasurementValue(row.querySelector('.ve-measure-capacity')?.value || '');
    const data = {
        kind,
        unit,
        capacity,
        width: unit === 'ml' ? capacity : cleanMeasurementValue(row.querySelector('.ve-measure-width')?.value || ''),
        length: cleanMeasurementValue(row.querySelector('.ve-measure-length')?.value || ''),
        depth: cleanMeasurementValue(row.querySelector('.ve-measure-depth')?.value || ''),
        radius: cleanMeasurementValue(row.querySelector('.ve-measure-radius')?.value || ''),
        textileSize: cleanMeasurementValue(row.querySelector('.ve-textile-size')?.value || (kind === 'textil' ? tamano : ''))
    };
    return buildProductMeasurementPayload(data);
}

window.guardarVarianteEditada = async function (vid, idProducto) {
    var row = document.getElementById('var-expand-' + vid);
    if (!row) return;
    var editedTamano = row.querySelector('.ve-tamano')?.value || '';
    var data = {
        __adminOriginalId: vid,
        'ID Variacion': row.querySelector('.ve-id').value,
        'ID Producto': idProducto,
        'Nombre del Producto': getInputValue('prod-nombre'),
        Nombre: getInputValue('prod-nombre'),
        Categoria: getInputValue('prod-categoria'),
        'Categoría': getInputValue('prod-categoria'),
        Precio: parseAmount(row.querySelector('.ve-precio').value || getInputValue('prod-precio')),
        'Precio Mayor': parseAmount(row.querySelector('.ve-precio-mayorista')?.value || getInputValue('prod-precio-mayorista')),
        Cantidad: Number(row.querySelector('.ve-stock').value || 0),
        'Stock Inicial': Number(row.querySelector('.ve-stock').value || 0),
        Descripcion: getInputValue('prod-descripcion'),
        Tamano: editedTamano,
        Talla: editedTamano,
        'Tamaño': row.querySelector('.ve-tamano')?.value || '',
        ...getVariantEditMeasurementPayload(row, editedTamano),
        Color: row.querySelector('.ve-color').value,
        Estilo: cleanProductStyleValue(row.querySelector('.ve-estilo')?.value || ''),
        'Codigo Barras': row.querySelector('.ve-barcode')?.value || makeProductBarcode(idProducto, row.querySelector('.ve-id').value),
        SKU: row.querySelector('.ve-sku').value,
        Imagen: row.querySelector('.ve-imagen').value || getInputValue('prod-imagen'),
        'Imagen Principal': row.querySelector('.ve-imagen').value || getInputValue('prod-imagen'),
        Catalogo: getInputValue('prod-catalogo') || 'Ambos',
        Estado: getInputValue('prod-estado') || 'Activo'
    };
    try {
        await postProductToGoogleSheets(data, true);
        clearPublicProductsCache();
        showToast('Variante actualizada', 'success');
        cerrarVarianteEdicion(vid);
        setTimeout(function () { cargarInventario({ silent: true }); }, 1000);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
};

window.guardarGrupoCompleto = async function (idProducto) {
    showToast('Guardando grupo completo...');

    const itemsToSave = [];
    
    // 1. Mother product
    var motherData = buildProductPayload();
    const originalVariationId = document.getElementById('product-form')?.dataset.originalVariationId || '';
    if (isEditingProduct && originalVariationId) motherData.__adminOriginalId = originalVariationId;
    itemsToSave.push(motherData);

    // 2. Save all variants in the group, including collapsed edit rows.
    var expandedRows = document.querySelectorAll('.var-edit-expanded');
    for (var i = 0; i < expandedRows.length; i++) {
        var row = expandedRows[i];
        var vid = row.querySelector('.ve-id')?.value || '';
        var editedTamano = row.querySelector('.ve-tamano')?.value || '';
        var vdata = {
            __adminOriginalId: row.getAttribute('id')?.replace('var-expand-', '') || vid,
            'ID Variacion': vid,
            'ID Producto': idProducto,
            'Nombre del Producto': getInputValue('prod-nombre'),
            Nombre: getInputValue('prod-nombre'),
            Categoria: getInputValue('prod-categoria'),
            'Categoría': getInputValue('prod-categoria'),
            Precio: parseAmount(row.querySelector('.ve-precio')?.value || getInputValue('prod-precio')),
            'Precio Mayor': parseAmount(row.querySelector('.ve-precio-mayorista')?.value || getInputValue('prod-precio-mayorista')),
            Cantidad: Number(row.querySelector('.ve-stock')?.value || 0),
            'Stock Inicial': Number(row.querySelector('.ve-stock')?.value || 0),
            Descripcion: getInputValue('prod-descripcion'),
            Tamano: editedTamano,
            Talla: editedTamano,
            'Tamaño': row.querySelector('.ve-tamano')?.value || '',
            ...getVariantEditMeasurementPayload(row, editedTamano),
            Color: row.querySelector('.ve-color')?.value || '',
            Estilo: cleanProductStyleValue(row.querySelector('.ve-estilo')?.value || ''),
            'Codigo Barras': row.querySelector('.ve-barcode')?.value || makeProductBarcode(idProducto, vid),
            SKU: row.querySelector('.ve-sku')?.value || '',
            Imagen: row.querySelector('.ve-imagen')?.value || getInputValue('prod-imagen'),
            'Imagen Principal': row.querySelector('.ve-imagen')?.value || getInputValue('prod-imagen'),
            Catalogo: getInputValue('prod-catalogo') || 'Ambos',
            Estado: getInputValue('prod-estado') || 'Activo'
        };
        itemsToSave.push(vdata);
    }

    try {
        const savedList = await saveProductListToGoogleSheets(itemsToSave, {
            fallbackEditOverride: true
        });
        clearPublicProductsCache();
        try {
            mergeSavedProductsIntoInventory(savedList);
        } catch (renderError) {
            console.warn('Grupo guardado, pero no se pudo refrescar el inventario local:', renderError);
        }
        showToast(`Grupo guardado exitosamente: ${savedList.length} producto(s)`, 'success');
        setTimeout(function () { cargarInventario({ silent: true }); }, 1500);
    } catch (err) {
        showToast('Error guardando el grupo: ' + err.message, 'error');
    }
};

function editarProducto(index) {
    var p = inventario[index];
    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var idProd = getInventoryMotherId(p);
    idVar = getInventoryVariationId(p);
    var isVariant = idProd && idVar && idProd !== idVar;
    var form = document.getElementById('product-form');
    if (form) form.dataset.originalVariationId = idVar;

    setInputValue('prod-id', idVar);
    setMotherProductId(idProd);
    document.getElementById('prod-nombre').value = p.Nombre || p.Producto || '';
    document.getElementById('prod-categoria').value = p.Categoria || '';
    document.getElementById('prod-precio').value = p.Precio || '';
    document.getElementById('prod-precio-mayorista').value = p.Precio_Mayorista || p.precio_mayorista || p.Mayorista || '';
    document.getElementById('prod-catalogo').value = p.Catalogo || p.catalogo || 'Ambos';
    var stockVal = [p.Stock, p.Cantidad, ''].find(v => v !== undefined && String(v).trim() !== '');
    if (stockVal === undefined) stockVal = '';
    var elStock = document.getElementById('prod-stock');
    if (elStock) elStock.value = stockVal;
    document.getElementById('prod-imagen').value = p.Imagen || '';
    updateProductImagePreviewBox(p.Imagen || '');
    setInputValue('prod-color', p.Color || '');
    var stockInicialVal = [p.Stock_Inicial, p['Stock Inicial'], p.Stock, p.Cantidad, ''].find(v => v !== undefined && String(v).trim() !== '');
    if (stockInicialVal === undefined) stockInicialVal = '';
    setInputValue('prod-stock-inicial', stockInicialVal);
    setInputValue('prod-descripcion', p.Descripcion || p['Caracteristicas del producto'] || '');
    setInputValue('prod-tamano', p.Tamano || p['Tamano'] || '');
    var storedSizeKind = normalizeSearchText(p.TipoMedida || p['Tipo Medida'] || '');
    var storedTextileSize = p.TallaTextil || p['Talla Textil'] || '';
    var legacyMeasures = parseProductMeasurementText(p.Tamano || p['Tamano'] || '');
    var editAncho = p.Ancho || legacyMeasures.width || '';
    var editLargo = p.Largo || legacyMeasures.length || '';
    var editFondo = p.Fondo || legacyMeasures.depth || '';
    var editRadio = p.Radio || legacyMeasures.radius || '';
    var editCapacidad = p.Capacidad || (normalizeSearchText(p.UnidadMedida || p['Unidad Medida'] || legacyMeasures.unit || '') === 'ml' ? editAncho : '');
    var hasPhysicalMeasure = [editAncho, editLargo, editFondo, editRadio].some(function (value) {
        return value !== undefined && String(value).trim() !== '';
    });
    if (!storedSizeKind && storedTextileSize) storedSizeKind = 'textil';
    if (!storedSizeKind && normalizeSearchText(p.UnidadMedida || p['Unidad Medida'] || legacyMeasures.unit || '') === 'ml') storedSizeKind = 'liquido';
    if (!storedSizeKind && hasPhysicalMeasure) storedSizeKind = 'medidas';
    if (!storedTextileSize && storedSizeKind === 'textil') storedTextileSize = p.Tamano || p['Tamano'] || '';
    setInputValue('prod-size-kind', storedSizeKind);
    setInputValue('prod-textile-size', storedTextileSize);
    setInputValue('prod-textile-custom', '');
    setInputValue('prod-measure-unit', p.UnidadMedida || p['Unidad Medida'] || legacyMeasures.unit || 'cm');
    setInputValue('prod-measure-capacity', editCapacidad);
    setInputValue('prod-measure-width', editAncho);
    setInputValue('prod-measure-length', editLargo);
    setInputValue('prod-measure-depth', editFondo);
    setInputValue('prod-measure-radius', editRadio);
    updateProductMeasurementFields();
    setInputValue('prod-estilo', cleanProductStyleValue(p.Estilo || ''));
    
    var promoScope = getProductPromotionValue(p, 'FALSO');
    var promoSelect = document.getElementById('prod-promocion');
    if (promoSelect) promoSelect.value = promoScope;

    setInputValue('prod-galeria', stringifyAdminGallery(p.Galeria || p['Galeria JSON'] || p['Galería JSON'] || ''));
    renderProductGalleryManager();
    setInputValue('prod-sku', p.SKU || '');
    const storedBarcode = getProductField(p, PRODUCT_BARCODE_FIELD_KEYS, '');
    const resolvedBarcode = getProductBarcode(p);
    setInputValue('prod-barcode', resolvedBarcode);
    const barcodeInput = document.getElementById('prod-barcode');
    const childIdInput = document.getElementById('prod-id');
    if (barcodeInput) {
        const generatedBarcode = makeProductBarcode(getInputValue('prod-id-producto'), getInputValue('prod-id'));
        const hasRealBarcode = Boolean(storedBarcode) && normalizeBarcodeValue(storedBarcode) !== normalizeBarcodeValue(generatedBarcode);
        if (childIdInput) {
            childIdInput.dataset.scannedReference = hasRealBarcode && normalizeBarcodeValue(idVar) === normalizeBarcodeValue(resolvedBarcode) ? '1' : '0';
        }
        barcodeInput.dataset.generatedBarcode = generatedBarcode;
        barcodeInput.dataset.autoBarcode = hasRealBarcode ? '0' : '1';
        setProductBarcodeScanMode(hasRealBarcode);
        if (!hasRealBarcode) {
            barcodeInput.value = resolvedBarcode || generatedBarcode;
            updateProductBarcodeField(true);
        }
    }
    setInputValue('prod-estado', p.Estado || 'Activo');
    setInputValue('prod-fecha-creacion', p.Fecha_Creacion || p['Fecha de Creacion'] || '');
    setProductFormMode(true);
    updateLivePreview();

    var variantBadge = document.getElementById('variant-editing-badge');
    if (!variantBadge) {
        var titleRow = document.querySelector('.admin-title-row');
        if (titleRow) {
            variantBadge = document.createElement('span');
            variantBadge.id = 'variant-editing-badge';
            variantBadge.style.cssText = 'font-size:10px;padding:4px 10px;border-radius:8px;font-weight:700;margin-left:8px;';
            titleRow.querySelector('h2')?.after(variantBadge);
        }
    }
    if (variantBadge) {
        if (isVariant) {
            variantBadge.textContent = 'VARIANTE (' + idVar + ')';
            variantBadge.style.background = 'rgba(255,165,0,0.2)';
            variantBadge.style.color = '#FFA500';
            variantBadge.style.display = 'inline';
        } else {
            variantBadge.textContent = 'PRODUCTO PRINCIPAL (' + idProd + ')';
            variantBadge.style.background = 'rgba(155,44,250,0.2)';
            variantBadge.style.color = '#9B2CFA';
            variantBadge.style.display = 'inline';
        }
    }

    if (idProd) {
        cargarVariantesAlFormulario(idProd, idVar);
        document.getElementById('btn-save-group')?.remove();
        // El guardado principal ya cubre el grupo completo.
        var saveGroupBtn = document.getElementById('btn-save-group');
        if (false && !saveGroupBtn) {
            var formFooter = document.querySelector('#product-form > div:last-child');
            if (formFooter) {
                var newBtn = document.createElement('button');
                newBtn.type = 'button';
                newBtn.className = 'admin-btn';
                newBtn.id = 'btn-save-group';
                newBtn.style.cssText = 'background:linear-gradient(135deg,#FFA500,#FF6347);margin-top:12px;';
                newBtn.textContent = 'Guardar grupo completo (madre + variantes)';
                newBtn.addEventListener('click', function () { guardarGrupoCompleto(idProd); });
                formFooter.parentNode.insertBefore(newBtn, formFooter.nextSibling);
            }
        }
    } else {
        var oldBtn = document.getElementById('btn-save-group');
        if (oldBtn) oldBtn.remove();
    }

    // MOVER EL FORMULARIO AL MODAL INDEPENDIENTE EN LUGAR DE CAMBIAR DE VISTA
    var modal = document.getElementById('edit-product-modal');
    var contentArea = document.getElementById('edit-modal-content-area');
    var viewProducts = document.getElementById('view-products');
    var gridSplit = contentArea?.querySelector('.grid-split') || viewProducts?.querySelector('.grid-split');

    if (modal && contentArea && gridSplit) {
        if (gridSplit.parentElement !== contentArea) contentArea.appendChild(gridSplit);
        modal.style.display = '';
        modal.classList.add('open');
        syncEditModalProductNavigator(index);
        modal.querySelector('.modal-card')?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // Fallback al comportamiento original si no hay modal
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (typeof switchDashboardView === 'function') {
            switchDashboardView('products', 'Gestión de Productos');
        }
    }
}

window.cerrarModalEdicion = function () {
    var modal = document.getElementById('edit-product-modal');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = '';
    }
    var contentArea = document.getElementById('edit-modal-content-area');
    var viewProducts = document.getElementById('view-products');
    if (contentArea && viewProducts && contentArea.firstElementChild) {
        viewProducts.appendChild(contentArea.firstElementChild);
    }
    resetProductForm();
};

document.addEventListener('DOMContentLoaded', function () {
    initEditModalProductNavigator();
    document.getElementById('edit-product-modal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            cerrarModalEdicion();
        }
    });
});

// Limpiar formato de dinero para que la DB no se corrompa entre Precio y Stock
function parseAmount(val) {
    if (!val) return 0;
    return parseInt(String(val).replace(/[^0-9]/g, ''), 10) || 0;
}


// Modal de confirmación
var modalConfirmCallback = null;
var modalCancelCallback = null;
function showModal(title, body, confirmText, onConfirm, onCancel) {
    var el = document.getElementById('confirm-modal');
    if (!el) return;
    document.getElementById('modal-title').textContent = title || 'Confirmar';
    document.getElementById('modal-body').textContent = body || '¿Estás seguro?';
    var btn = document.getElementById('modal-confirm-btn');
    btn.textContent = confirmText || 'Eliminar';
    modalConfirmCallback = onConfirm || null;
    modalCancelCallback = onCancel || null;
    el.style.display = 'flex';
}
function closeModal() {
    var el = document.getElementById('confirm-modal');
    if (el) el.style.display = 'none';
    modalConfirmCallback = null;
    modalCancelCallback = null;
}
document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('modal-confirm-btn')?.addEventListener('click', function () {
        var cb = modalConfirmCallback;
        closeModal();
        if (cb) cb();
    });
    document.getElementById('modal-cancel-btn')?.addEventListener('click', function () {
        if (modalCancelCallback) modalCancelCallback();
        closeModal();
    });
    document.getElementById('confirm-modal')?.addEventListener('click', function (e) {
        if (e.target === this) {
            if (modalCancelCallback) modalCancelCallback();
            closeModal();
        }
    });
});

async function delFromSheet(id, idProd, rowMeta) {
    var rowIndex = rowMeta && rowMeta.rowIndex ? rowMeta.rowIndex : 0;
    if (!id && !idProd && !rowIndex) throw new Error('No hay ID para eliminar');
    var lastError = 'Google Sheets no confirmo el borrado fisico';

    var deleteStrategies = [
        {
            resource: 'productos',
            action: 'delete_product',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        },
        {
            resource: 'productos',
            action: 'delete',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        },
        {
            resource: 'productos',
            action: 'eliminar',
            id: id,
            ID_Producto: idProd,
            'ID Variacion': id,
            'ID Variación': id
        }
    ];

    if (rowMeta) {
        deleteStrategies.forEach(function (p) {
            if (rowMeta.nombre) p.nombre = rowMeta.nombre;
            if (!id && rowMeta.rowIndex) p._rowIndex = rowMeta.rowIndex;
        });
    }

    for (var i = 0; i < deleteStrategies.length; i++) {
        try {
            var res = await fetch(GOOGLE_SHEET_API, {
                method: 'POST',
                body: JSON.stringify(deleteStrategies[i])
            });
            var result = await res.json();
            if (result && (result.deleted > 0 || result.status === 'success' || result.ok === true)) {
                console.log('Producto eliminado fisicamente de Google Sheets');
                return true;
            }
            lastError = result?.error || result?.message || lastError;
        } catch (e) {
            lastError = e.message || lastError;
            console.warn('Delete strategy ' + i + ' failed:', e.message);
        }
    }

    throw new Error('No se pudo borrar fisicamente de Google Sheets: ' + lastError);
}

async function eliminarProducto(index) {
    var p = inventario[index];
    if (!p) { showToast('Error: producto no encontrado en el índice ' + index, 'error'); return; }
    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var idProd = p.idProducto || p['ID Producto'] || idVar;
    var nombre = p.Nombre || p.Producto || 'este producto';
    var rowIndex = p._rowIndex || 0;

    if (!idVar && !nombre) { showToast('Error: producto sin ID ni Nombre', 'error'); return; }

    showModal(
        'Eliminar Producto',
        '¿Eliminar permanentemente "' + nombre + '"' + (idVar ? ' (ID: ' + idVar + ')' : '') + '?',
        'Sí, eliminar',
        async function () {
            showToast('Eliminando "' + nombre + '"...');
            try {
                await delFromSheet(idVar, idProd, { nombre: nombre, rowIndex: rowIndex });
                showToast('Producto "' + nombre + '" eliminado correctamente', 'success');
                // Remove the row visually immediately for better UX
                inventario.splice(index, 1);
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                // Reload from server to sync
                setTimeout(function () { cargarInventario({ silent: true }); }, 2000);
            } catch (err) {
                console.error('Error eliminando producto:', err);
                showToast('Error al eliminar: ' + err.message, 'error');
            }
        }
    );
}

async function eliminarProductoPorClave(key) {
    var p = getInventoryProductByKey(key);
    if (!p) {
        showToast('Error: producto no encontrado para borrar', 'error');
        return;
    }

    var idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || '';
    var idProd = p.idProducto || p['ID Producto'] || idVar;
    var nombre = p.Nombre || p.Producto || 'este producto';
    var rowIndex = p._rowIndex || 0;
    var productKey = getInventoryProductKey(p);

    if (!idVar && !rowIndex && !nombre) {
        showToast('Error: producto sin ID para eliminar', 'error');
        return;
    }

    showModal(
        'Eliminar Producto',
        'Eliminar permanentemente "' + nombre + '"' + (idVar ? ' (ID: ' + idVar + ')' : '') + '?',
        'Si, eliminar',
        async function () {
            showToast('Eliminando "' + nombre + '"...');
            try {
                await delFromSheet(idVar, idProd, { nombre: nombre, rowIndex: rowIndex });
                inventario = inventario.filter(function (item) {
                    return getInventoryProductKey(item) !== productKey;
                });
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                showToast('Producto "' + nombre + '" eliminado correctamente', 'success');
                setTimeout(function () { cargarInventario({ silent: true }); }, 1200);
            } catch (err) {
                console.error('Error eliminando producto:', err);
                showToast('Error al eliminar: ' + err.message, 'error');
            }
        }
    );
}

async function eliminarGrupo(motherIdClean) {
    showModal(
        'Eliminar Grupo Completo',
        '¿Eliminar TODAS las variantes de este grupo (ID: ' + motherIdClean + ')?',
        'Sí, eliminar grupo',
        async function () {
            showToast('Eliminando grupo...');
            var variants = inventario.filter(function (p) {
                var mid = getInventoryMotherId(p);
                var vid = getInventoryVariationId(p);
                return cleanInventoryId(mid) === motherIdClean || cleanInventoryId(vid) === motherIdClean;
            });
            if (variants.length === 0) { showToast('No se encontraron productos del grupo', 'error'); return; }
            var errors = 0;
            var lastErr = '';
            for (var i = 0; i < variants.length; i++) {
                try {
                    var v = variants[i];
                    var vId = getInventoryVariationId(v);
                    if (!vId) continue;
                    await delFromSheet(vId, motherIdClean, { nombre: v.Nombre || v.Producto || '', rowIndex: v._rowIndex || 0 });
                } catch (e) { errors++; lastErr = e.message; }
            }
            if (errors === 0) {
                showToast('Grupo eliminado (' + variants.length + ' productos)', 'success');
            } else if (errors === variants.length) {
                showToast('Error en todo el grupo: ' + lastErr, 'error');
            } else {
                showToast('Grupo: ' + (variants.length - errors) + ' ok, ' + errors + ' error(es)', 'warning');
            }
            if (errors < variants.length) {
                var deletedKeys = new Set(variants.map(function (item) { return getInventoryProductKey(item); }));
                inventario = inventario.filter(function (item) {
                    return !deletedKeys.has(getInventoryProductKey(item));
                });
                writeInventoryCache(inventario);
                renderInventoryInBatches();
                setTimeout(function () { cargarInventario({ silent: true }); }, 1000);
            }
        }
    );
}

function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast';
    if (type) t.classList.add(type);
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 3000);
}

function setDashboardText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function getDashboardMoney(value) {
    if (typeof formatAdminInvoiceMoney === 'function') return formatAdminInvoiceMoney(value);
    return '$' + (Number(value) || 0).toLocaleString('es-CO');
}

function getDashboardProductStock(product) {
    return Number(product?.Stock || product?.Cantidad || product?.['Stock Inicial'] || 0) || 0;
}

function getDashboardDateValue(row) {
    const raw = row?.Fecha || row?.fecha || row?.['Fecha Actualizacion'] || row?.['Fecha Actualización'] || '';
    if (!raw) return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDashboardTypeValue(row) {
    const raw = String(row?.['Tipo Cliente'] || row?.tipoCliente || row?.Tipo || row?.Catalogo || '').toLowerCase();
    if (raw.includes('mayor')) return 'mayor';
    if (raw.includes('consulta')) return 'consulta';
    const method = String(row?.['Metodo Contacto'] || row?.['Método Contacto'] || '').toLowerCase();
    if (method.includes('consulta')) return 'consulta';
    return 'detal';
}

function getDashboardStatusValue(row) {
    return String(row?.['Estado Pedido'] || row?.['Estado Factura'] || row?.Estado || 'Pendiente').trim() || 'Pendiente';
}

function getDashboardProductCategory(product) {
    if (typeof getProductField === 'function' && Array.isArray(PRODUCT_CATEGORY_FIELD_KEYS)) {
        return getProductField(product, PRODUCT_CATEGORY_FIELD_KEYS, '');
    }
    return product?.Categoria || product?.categoria || product?.CategoriaProducto || '';
}

function matchesDashboardDateRange(row, range) {
    if (!range || range === 'all') return true;
    const date = getDashboardDateValue(row);
    if (!date) return false;
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    if (range === 'today') return date >= start;
    const days = Number(range);
    if (!Number.isFinite(days)) return true;
    start.setDate(start.getDate() - Math.max(0, days - 1));
    return date >= start;
}

function getDashboardFilters() {
    return {
        range: document.getElementById('dashboard-range-filter')?.value || '30',
        type: document.getElementById('dashboard-type-filter')?.value || 'all',
        status: document.getElementById('dashboard-status-filter')?.value || 'all',
        category: document.getElementById('dashboard-category-filter')?.value || 'all',
        query: normalizeSearchText(document.getElementById('dashboard-query-filter')?.value || '')
    };
}

function filterDashboardRows(rows, filters) {
    return (rows || []).filter(row => {
        if (!matchesDashboardDateRange(row, filters.range)) return false;
        if (filters.type !== 'all' && getDashboardTypeValue(row) !== filters.type) return false;
        if (filters.status !== 'all' && normalizeSearchText(getDashboardStatusValue(row)) !== normalizeSearchText(filters.status)) return false;
        if (filters.query) {
            const blob = normalizeSearchText(JSON.stringify(row));
            if (!blob.includes(filters.query)) return false;
        }
        return true;
    });
}

function countByDashboardValue(rows, getValue) {
    return rows.reduce((acc, row) => {
        const key = String(getValue(row) || 'Sin dato').trim() || 'Sin dato';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

function getDashboardPercent(value, total) {
    if (!total) return '0%';
    return Math.round((Number(value || 0) / total) * 100) + '%';
}

function renderDashboardChartRows(targetId, rows, options = {}) {
    const box = document.getElementById(targetId);
    if (!box) return;
    if (!rows.length) {
        box.innerHTML = '<div class="dashboard-empty">Sin datos para este filtro</div>';
        return;
    }
    const max = Math.max(...rows.map(row => Number(row.value || 0)), 1);
    box.innerHTML = rows.map(row => {
        const percent = Math.max(4, Math.round((Number(row.value || 0) / max) * 100));
        const valueText = options.money ? getDashboardMoney(row.value) : String(row.value);
        return `
            <div class="dashboard-chart-row">
                <div><strong>${escapeHtml(row.label)}</strong><span>${escapeHtml(row.detail || '')}</span></div>
                <div class="dashboard-bar-track"><div class="dashboard-chart-fill" style="width:${percent}%"></div></div>
                <em>${escapeHtml(valueText)}</em>
            </div>
        `;
    }).join('');
}

function syncDashboardSelectOptions(selectId, values, fallbackLabel) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const current = select.value || 'all';
    const uniqueValues = Array.from(new Set((values || []).map(value => String(value || '').trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'es'));
    select.innerHTML = `<option value="all">${fallbackLabel}</option>` + uniqueValues.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    select.value = uniqueValues.includes(current) ? current : 'all';
}

function syncDashboardDynamicFilters() {
    const orderStatuses = (window.pedidosList || []).map(getDashboardStatusValue);
    const productCategories = (inventario || [])
        .map(getDashboardProductCategory)
        .filter(category => normalizeSearchText(category) !== 'banner');
    syncDashboardSelectOptions('dashboard-status-filter', orderStatuses, 'Todos');
    syncDashboardSelectOptions('dashboard-category-filter', productCategories, 'Todas');
}

function ensureDashboardEnhancements() {
    const shell = document.querySelector('#view-dashboard .admin-dashboard-shell');
    if (!shell || shell.dataset.enhanced === '1') return;
    shell.dataset.enhanced = '1';

    const hero = shell.querySelector('.admin-dashboard-hero');
    hero?.insertAdjacentHTML('afterend', `
        <div class="dashboard-filter-bar">
            <label>Periodo
                <select class="form-control" id="dashboard-range-filter">
                    <option value="today">Hoy</option>
                    <option value="7">7 dias</option>
                    <option value="30" selected>30 dias</option>
                    <option value="90">90 dias</option>
                    <option value="all">Todo</option>
                </select>
            </label>
            <label>Tipo
                <select class="form-control" id="dashboard-type-filter">
                    <option value="all">Todos</option>
                    <option value="detal">Detal</option>
                    <option value="mayor">Mayorista</option>
                    <option value="consulta">Consultas</option>
                </select>
            </label>
            <label>Estado
                <select class="form-control" id="dashboard-status-filter">
                    <option value="all">Todos</option>
                </select>
            </label>
            <label>Categoria
                <select class="form-control" id="dashboard-category-filter">
                    <option value="all">Todas</option>
                </select>
            </label>
            <label>Buscar
                <input class="form-control" id="dashboard-query-filter" placeholder="Cliente, pedido, estado...">
            </label>
            <button type="button" class="admin-btn secondary" id="dashboard-clear-filters">Limpiar</button>
        </div>
    `);

    const statGrid = shell.querySelector('.dashboard-stat-grid');
    statGrid?.insertAdjacentHTML('afterend', `
        <details class="dashboard-extra-metrics"><summary>Ver métricas adicionales</summary><div class="dashboard-mini-grid">
            <article class="dashboard-stat-card"><span>Conversion</span><strong id="dash-conversion-rate">0%</strong><small>Facturas / pedidos filtrados</small></article>
            <article class="dashboard-stat-card"><span>Ticket promedio</span><strong id="dash-average-ticket">$0</strong><small>Promedio facturado</small></article>
            <article class="dashboard-stat-card"><span>Consultas</span><strong id="dash-consult-orders">0</strong><small>Pedidos por WhatsApp</small></article>
            <article class="dashboard-stat-card"><span>Valor inventario</span><strong id="dash-inventory-value">$0</strong><small>Stock x precio detal</small></article>
        </div></details>
    `);

    // Collapsible toggle buttons
    shell.querySelectorAll('.dashboard-toggle-btn').forEach(btn => {
        if (btn.dataset.bound) return;
        btn.dataset.bound = '1';
        const initialTarget = document.getElementById(btn.dataset.target);
        btn.setAttribute('aria-controls', btn.dataset.target);
        btn.setAttribute('aria-expanded', String(!initialTarget?.classList.contains('collapsed')));
        btn.querySelector('span').textContent = initialTarget?.classList.contains('collapsed') ? 'Mostrar' : 'Ocultar';
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const target = document.getElementById(targetId);
            if (!target) return;
            const isCollapsed = target.classList.toggle('collapsed');
            btn.classList.toggle('collapsed', isCollapsed);
            btn.setAttribute('aria-expanded', String(!isCollapsed));
            btn.querySelector('span').textContent = isCollapsed ? 'Mostrar' : 'Ocultar';
        });
    });

    ['dashboard-range-filter', 'dashboard-type-filter', 'dashboard-status-filter', 'dashboard-category-filter', 'dashboard-query-filter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderAdminDashboard);
        document.getElementById(id)?.addEventListener('change', renderAdminDashboard);
    });
    document.getElementById('dashboard-clear-filters')?.addEventListener('click', () => {
        setInputValue('dashboard-range-filter', '30');
        setInputValue('dashboard-type-filter', 'all');
        setInputValue('dashboard-status-filter', 'all');
        setInputValue('dashboard-category-filter', 'all');
        setInputValue('dashboard-query-filter', '');
        renderAdminDashboard();
    });
}

function renderAdminDashboard() {
    if (!document.getElementById('view-dashboard')) return;
    ensureDashboardEnhancements();
    syncDashboardDynamicFilters();
    const filters = getDashboardFilters();

    const allProducts = (inventario || []).filter(product => {
        const category = String(getDashboardProductCategory(product)).toUpperCase();
        const status = String(product?.Estado || product?.estado || 'Activo').toLowerCase();
        return category !== 'BANNER' && status !== 'inactivo';
    });
    const products = allProducts.filter(product => {
        const category = getDashboardProductCategory(product);
        return filters.category === 'all' || normalizeSearchText(category) === normalizeSearchText(filters.category);
    });
    const totalStock = products.reduce((sum, product) => sum + getDashboardProductStock(product), 0);
    const lowStockAll = products.filter(product => getDashboardProductStock(product) <= 3);
    const inventoryValue = products.reduce((sum, product) => {
        const stock = getDashboardProductStock(product);
        const price = Number(product?.Precio || 0) || 0;
        return sum + (stock * price);
    }, 0);

    const facturedOrderIds = typeof getFacturedOrderIds === 'function' ? getFacturedOrderIds() : new Set();
    const filteredOrders = filterDashboardRows(window.pedidosList || [], filters);
    const filteredInvoices = filterDashboardRows(window.facturasList || [], filters);
    const pendingOrders = filteredOrders.filter(order => {
        const id = String(typeof getOrderIdValue === 'function' ? getOrderIdValue(order) : (order?.['ID Pedido'] || '')).trim();
        const status = String(order?.['Estado Pedido'] || order?.Estado || '').toLowerCase();
        return !(id && facturedOrderIds.has(id)) && !status.includes('factur');
    });
    const consultOrders = filteredOrders.filter(order => getDashboardTypeValue(order) === 'consulta' || getDashboardStatusValue(order).toLowerCase().includes('consulta'));
    const totalSales = filteredInvoices.reduce((sum, invoice) => {
        const value = typeof parseAdminInvoiceMoney === 'function'
            ? parseAdminInvoiceMoney(invoice?.Subtotal || invoice?.Total || 0)
            : Number(invoice?.Subtotal || invoice?.Total || 0) || 0;
        return sum + value;
    }, 0);
    const averageTicket = filteredInvoices.length ? Math.round(totalSales / filteredInvoices.length) : 0;
    const conversionRate = getDashboardPercent(filteredInvoices.length, filteredOrders.length);

    setDashboardText('dash-total-sales', getDashboardMoney(totalSales));
    setDashboardText('dash-pending-orders', String(pendingOrders.length));
    setDashboardText('dash-active-products', String(products.length));
    setDashboardText('dash-total-stock', String(totalStock.toLocaleString('es-CO')));
    const stockSmall = document.querySelector('#dash-total-stock')?.closest('.dashboard-stat-card')?.querySelector('small');
    if (stockSmall) stockSmall.textContent = `${lowStockAll.length} en alerta (${getDashboardPercent(lowStockAll.length, products.length)})`;
    setDashboardText('dash-conversion-rate', conversionRate);
    setDashboardText('dash-average-ticket', getDashboardMoney(averageTicket));
    setDashboardText('dash-consult-orders', String(consultOrders.length));
    setDashboardText('dash-inventory-value', getDashboardMoney(inventoryValue));

    // â•â•â• Enhanced Low Stock with badges â•â•â•
    const lowStock = products
        .filter(product => getDashboardProductStock(product) <= 3)
        .sort((a, b) => getDashboardProductStock(a) - getDashboardProductStock(b))
        .slice(0, 8);
    const lowStockBox = document.getElementById('dash-low-stock');
    if (lowStockBox) {
        lowStockBox.innerHTML = lowStock.length ? lowStock.map(product => {
            const stock = getDashboardProductStock(product);
            const badgeClass = stock <= 1 ? 'critical' : 'warning';
            return `
            <div class="dashboard-stock-card">
                <div>
                    <strong style="display:block;font-size:12px;color:#fff">${escapeHtml(product.Nombre || product['Nombre del Producto'] || 'Producto')}</strong>
                    <span style="font-size:10.5px;font-weight:700;color:rgba(248,244,255,.56)">${escapeHtml(getDashboardProductCategory(product) || 'Sin categoria')}</span>
                </div>
                <span class="stock-badge ${badgeClass}">${stock} und.</span>
            </div>
        `;
        }).join('') : '<div class="dashboard-empty">No hay productos con stock bajo</div>';
    }
    setDashboardText('dash-stock-count', String(lowStock.length));

    // â•â•â• Enhanced Recent Orders with status dots â•â•â•
    const recentOrdersBox = document.getElementById('dash-recent-orders');
    if (recentOrdersBox) {
        const recent = [...filteredOrders]
            .sort((a, b) => (getDashboardDateValue(b)?.getTime() || 0) - (getDashboardDateValue(a)?.getTime() || 0))
            .slice(0, 8);
        recentOrdersBox.innerHTML = recent.length ? recent.map(order => {
            const id = typeof getOrderIdValue === 'function' ? getOrderIdValue(order) : (order?.['ID Pedido'] || '-');
            const total = typeof parseAdminInvoiceMoney === 'function'
                ? parseAdminInvoiceMoney(order?.Subtotal || order?.Total || 0)
                : Number(order?.Subtotal || order?.Total || 0) || 0;
            const statusRaw = String(order?.['Estado Pedido'] || order?.Estado || 'Pendiente').trim();
            const statusLower = statusRaw.toLowerCase();
            let statusClass = 'pending';
            if (statusLower.includes('pag') || statusLower.includes('aprobad')) statusClass = 'paid';
            else if (statusLower.includes('factur')) statusClass = 'invoiced';
            else if (statusLower.includes('cancel') || statusLower.includes('rechaz')) statusClass = 'cancelled';
            const clientName = escapeHtml(order?.['Nombre Cliente'] || order?.Nombre || 'Cliente');
            const clientType = escapeHtml(order?.['Tipo Cliente'] || order?.tipoCliente || '');
            return `
                <div class="dashboard-order-card">
                    <div class="dashboard-order-status-dot ${statusClass}"></div>
                    <div class="dashboard-order-info">
                        <strong>${escapeHtml(id || 'Pedido')}</strong>
                        <div class="order-meta">
                            <span>${clientName}${clientType ? ' · ' + clientType : ''}</span>
                            <span class="order-status-pill ${statusClass}">${escapeHtml(statusRaw)}</span>
                        </div>
                    </div>
                    <div class="dashboard-order-amount">${getDashboardMoney(total)}</div>
                </div>
            `;
        }).join('') : '<div class="dashboard-empty">No hay pedidos cargados</div>';
        setDashboardText('dash-orders-count', String(recent.length));
    }

    // â•â•â• Status bars â•â•â•
    const statusBars = document.getElementById('dash-status-bars');
    if (statusBars) {
        const statusCounts = countByDashboardValue(filteredOrders, getDashboardStatusValue);
        const rows = Object.entries(statusCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);
        if (!rows.length) rows.push(['Sin pedidos', 0]);
        const max = Math.max(...rows.map(([, count]) => count), 1);
        statusBars.innerHTML = rows.map(([label, count]) => `
            <div class="dashboard-bar-row">
                <span>${escapeHtml(label)}</span>
                <div class="dashboard-bar-track"><div class="dashboard-bar-fill" style="width:${Math.max(8, Math.round((count / max) * 100))}%"></div></div>
                <strong>${count} (${getDashboardPercent(count, filteredOrders.length)})</strong>
            </div>
        `).join('');
    }

    // â•â•â• Canvas: Sales Line/Area Chart â•â•â•
    const salesByDay = {};
    filteredInvoices.forEach(invoice => {
        const date = getDashboardDateValue(invoice);
        const label = date ? date.toLocaleDateString('es-CO', { month: 'short', day: '2-digit' }) : 'Sin fecha';
        const value = typeof parseAdminInvoiceMoney === 'function'
            ? parseAdminInvoiceMoney(invoice?.Subtotal || invoice?.Total || 0)
            : Number(invoice?.Subtotal || invoice?.Total || 0) || 0;
        salesByDay[label] = (salesByDay[label] || 0) + value;
    });
    const salesEntries = Object.entries(salesByDay).slice(-12);
    drawDashboardAreaChart('dash-sales-canvas', 'dash-sales-legend', salesEntries, totalSales);

    // â•â•â• Canvas: Category Donut Chart â•â•â•
    const categoryCounts = countByDashboardValue(products, product => getDashboardProductCategory(product) || 'Sin categoria');
    const categoryEntries = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
    drawDashboardDonutChart('dash-category-canvas', 'dash-category-legend', categoryEntries, products.length);
}

// â•â•â• Canvas Drawing: Area Chart â•â•â•
function drawDashboardAreaChart(canvasId, legendId, entries, total) {
    const canvas = document.getElementById(canvasId);
    const legendBox = document.getElementById(legendId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width || 400;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!entries.length) {
        ctx.fillStyle = '#766771';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de ventas', w / 2, h / 2);
        if (legendBox) legendBox.innerHTML = '';
        return;
    }

    const values = entries.map(([, v]) => v);
    const labels = entries.map(([l]) => l);
    const maxVal = Math.max(...values, 1);
    const padL = 62, padR = 16, padT = 24, padB = 38;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    // Grid lines + Y-axis labels
    const gridSteps = 4;
    ctx.strokeStyle = '#eadfe5';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#766771';
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridSteps; i++) {
        const y = padT + (chartH / gridSteps) * i;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
        const val = maxVal - (maxVal / gridSteps) * i;
        ctx.fillText(getDashboardMoney(Math.round(val)), padL - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    ctx.fillStyle = '#766771';
    ctx.font = '700 9px Inter, sans-serif';
    const step = entries.length > 1 ? chartW / (entries.length - 1) : 0;
    const points = values.map((v, i) => ({
        x: padL + step * i,
        y: padT + chartH - (v / maxVal) * chartH
    }));
    labels.forEach((l, i) => {
        ctx.fillText(l, points[i].x, h - padB + 16);
    });

    // Area gradient
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, 'rgba(138,40,70,.18)');
    grad.addColorStop(1, 'rgba(138,40,70,.01)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    const lineGrad = ctx.createLinearGradient(padL, 0, w - padR, 0);
    lineGrad.addColorStop(0, '#8a2846');
    lineGrad.addColorStop(1, '#087e80');
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Dots
    points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = i === points.length - 1 ? '#087e80' : '#8a2846';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    if (legendBox) {
        const totalFormatted = getDashboardMoney(total);
        legendBox.innerHTML = `<div class="dashboard-chart-legend-item"><div class="dashboard-chart-legend-dot" style="background:linear-gradient(135deg,#8a2846,#087e80)"></div>Total: ${totalFormatted}</div><div class="dashboard-chart-legend-item"><div class="dashboard-chart-legend-dot" style="background:#087e80"></div>${entries.length} dias con ventas</div>`;
    }
}

// â•â•â• Canvas Drawing: Donut Chart â•â•â•
function drawDashboardDonutChart(canvasId, legendId, entries, total) {
    const canvas = document.getElementById(canvasId);
    const legendBox = document.getElementById(legendId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width || 300;
    const h = 220;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!entries.length) {
        ctx.fillStyle = '#766771';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Sin datos de categorias', w / 2, h / 2);
        if (legendBox) legendBox.innerHTML = '';
        return;
    }

    const donutColors = [
        '#8a2846', '#a55273', '#087e80', '#43aaa1',
        '#b9375e', '#ac7c55', '#746179', '#b52c46'
    ];

    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(cx, cy) - 12;
    const innerR = outerR * 0.58;
    const totalVal = entries.reduce((s, [, v]) => s + v, 0) || 1;

    let startAngle = -Math.PI / 2;
    entries.forEach(([label, value], i) => {
        const sliceAngle = (value / totalVal) * Math.PI * 2;
        const color = donutColors[i % donutColors.length];

        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // Slice separator
        ctx.beginPath();
        ctx.arc(cx, cy, outerR, startAngle, startAngle + sliceAngle);
        ctx.arc(cx, cy, innerR, startAngle + sliceAngle, startAngle, true);
        ctx.closePath();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        startAngle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#352a32';
    ctx.font = '950 22px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(total), cx, cy - 8);
    ctx.fillStyle = '#766771';
    ctx.font = '800 10px Inter, sans-serif';
    ctx.fillText('PRODUCTOS', cx, cy + 12);

    if (legendBox) {
        legendBox.innerHTML = entries.map(([label, value], i) => {
            const color = donutColors[i % donutColors.length];
            const pct = getDashboardPercent(value, totalVal);
            return `<div class="dashboard-chart-legend-item"><div class="dashboard-chart-legend-dot" style="background:${color}"></div>${escapeHtml(label)} (${pct})</div>`;
        }).join('');
    }
}


function switchDashboardView(viewId, title) {
    if (viewId === 'quick-sale') {
        openQuickSaleInOrders();
        return;
    }
    document.querySelectorAll('.dashboard-section').forEach(function (el) { el.classList.remove('active'); });
    document.querySelectorAll('.sidebar-btn').forEach(function (el) { el.classList.remove('active'); });
    var target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');
    var btn = document.querySelector('.sidebar-btn[data-view="' + viewId + '"]') || document.querySelector('.sidebar-btn[onclick*="' + viewId + '"]');
    if (btn) btn.classList.add('active');
    var titleEl = document.getElementById('current-section-title');
    if (titleEl) titleEl.textContent = title || 'Panel';
    var mobileSelect = document.getElementById('admin-mobile-view-select');
    if (mobileSelect && mobileSelect.value !== viewId) mobileSelect.value = viewId;
    var sectionDrawer = document.getElementById('admin-section-drawer');
    if (sectionDrawer) {
        sectionDrawer.classList.remove('open');
        document.getElementById('admin-section-toggle')?.setAttribute('aria-expanded', 'false');
    }
    var area = document.querySelector('.dashboard-content-area');
    if (area) {
        area.scrollTop = 0;
        area.scrollLeft = 0;
    }

    if (viewId === 'users' && typeof loadCustomerUsers === 'function')loadCustomerUsers();
    if (viewId === 'orders') {
        cargarPedidos();
    }
    if (viewId === 'china-orders') {
        fetchChinaOrdersFromServer();
    }
    if (viewId === 'dashboard') {
        renderAdminDashboard();
    }
    if (viewId === 'settings' && typeof window.activateSettingsTab === 'function') {
        window.activateSettingsTab('storefront');
    }
}

window.switchDashboardView = switchDashboardView;

function openQuickSaleInOrders() {
    switchDashboardView('orders', 'Ventas y Facturación');
    if (typeof window.switchOrdersAdminTab === 'function') {
        window.switchOrdersAdminTab('quick-sale');
    } else {
        window.activeOrdersAdminTab = 'quick-sale';
    }
    if (!Array.isArray(inventario) || !inventario.length) {
        cargarInventario({ silent: true }).then(renderQuickSaleResults).catch(() => {});
    } else {
        renderQuickSaleResults();
    }
    setTimeout(() => document.getElementById('quick-sale-search')?.focus(), 80);
}

// === LÃ“GICA DE PEDIDOS Y FACTURACIÃ“N DIGITAL ===
const CHINA_ORDER_DRAFT_KEY = 'blyxu_admin_china_order_draft_v1';
const CHINA_ORDER_SAVED_KEY = 'blyxu_admin_china_saved_orders_v1';
const CHINA_ORDER_DB_NAME = 'blyxu_admin_china_orders_db';
const CHINA_ORDER_DB_VERSION = 1;
const CHINA_ORDER_STORE_NAME = 'chinaOrders';
const CHINA_ORDER_SAVED_RECORD_KEY = 'savedOrders';
const CHINA_ORDER_DRAFT_RECORD_KEY = 'draft';
const ADMIN_COST_CALCULATOR_KEY = 'blyxu_admin_cost_calculator_v1';
const ADMIN_MARKET_RATES_CACHE_KEY = 'blyxu_admin_market_rates_cache_v1';
const ADMIN_MARKET_RATES_URL = 'https://open.er-api.com/v6/latest/USD';
let activeChinaOrderId = '';
let chinaOrdersDbPromise = null;
let savedChinaOrdersCache = [];
let chinaOrderDraftSaveTimer = null;
let isHydratingChinaOrder = false;

function openChinaOrdersDb() {
    if (!window.indexedDB) {
        return Promise.reject(new Error('IndexedDB no esta disponible'));
    }
    if (chinaOrdersDbPromise) return chinaOrdersDbPromise;

    chinaOrdersDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(CHINA_ORDER_DB_NAME, CHINA_ORDER_DB_VERSION);
        request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(CHINA_ORDER_STORE_NAME)) {
                db.createObjectStore(CHINA_ORDER_STORE_NAME, { keyPath: 'key' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('No se pudo abrir el almacen local'));
    });

    return chinaOrdersDbPromise;
}

function readChinaOrderStoreValue(key) {
    return openChinaOrdersDb().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(CHINA_ORDER_STORE_NAME, 'readonly');
        const request = transaction.objectStore(CHINA_ORDER_STORE_NAME).get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => reject(request.error || new Error('No se pudo leer el almacen local'));
    }));
}

function writeChinaOrderStoreValue(key, value) {
    return openChinaOrdersDb().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(CHINA_ORDER_STORE_NAME, 'readwrite');
        transaction.objectStore(CHINA_ORDER_STORE_NAME).put({
            key,
            value,
            updatedAt: Date.now()
        });
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo guardar en el almacen local'));
        transaction.onabort = () => reject(transaction.error || new Error('Guardado local cancelado'));
    }));
}

function deleteChinaOrderStoreValue(key) {
    return openChinaOrdersDb().then(db => new Promise((resolve, reject) => {
        const transaction = db.transaction(CHINA_ORDER_STORE_NAME, 'readwrite');
        transaction.objectStore(CHINA_ORDER_STORE_NAME).delete(key);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => reject(transaction.error || new Error('No se pudo borrar del almacen local'));
        transaction.onabort = () => reject(transaction.error || new Error('Borrado local cancelado'));
    }));
}

function formatChinaUsd(value) {
    return 'US$' + (Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatChinaCop(value) {
    return '$' + Math.round(Number(value) || 0).toLocaleString('es-CO');
}

function parseChinaNumber(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const normalized = raw.includes(',') && !raw.includes('.')
        ? raw.replace(',', '.')
        : raw.replace(/,/g, '');
    return parseFloat(normalized.replace(/[^0-9.-]/g, '')) || 0;
}

function formatCostCny(value) {
    return 'CNY ' + (Number(value) || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function convertAdminCostToCop(value, currency, rates) {
    const amount = Math.max(0, parseChinaNumber(value));
    const selectedCurrency = String(currency || 'COP').toUpperCase();
    if (selectedCurrency === 'USD') return amount * Math.max(0, rates.usdRate || 0);
    if (selectedCurrency === 'CNY') return amount * Math.max(0, rates.cnyRate || 0);
    return amount;
}

function formatAdminCostAlt(copValue, rates) {
    const cop = Math.max(0, Number(copValue) || 0);
    const usdRate = Math.max(0, rates.usdRate || 0);
    const cnyRate = Math.max(0, rates.cnyRate || 0);
    const usd = usdRate ? cop / usdRate : 0;
    const cny = cnyRate ? cop / cnyRate : 0;
    return `${formatChinaUsd(usd)} / ${formatCostCny(cny)}`;
}

function readAdminCostCalculatorState() {
    try {
        const state = JSON.parse(localStorage.getItem(ADMIN_COST_CALCULATOR_KEY) || 'null');
        return state && typeof state === 'object' ? state : {};
    } catch (error) {
        return {};
    }
}

function writeAdminCostCalculatorState(state) {
    try {
        localStorage.setItem(ADMIN_COST_CALCULATOR_KEY, JSON.stringify(state));
    } catch (error) {
        console.warn('No se pudo guardar calculadora de costos:', error);
    }
}

function setAdminMarketRateStatus(message, type = 'info') {
    const el = document.getElementById('calc-market-status');
    if (!el) return;
    const color = type === 'error'
        ? 'rgba(217,176,176,.88)'
        : type === 'success'
            ? 'rgba(186,208,194,.88)'
            : 'rgba(244,242,238,.54)';
    el.style.color = color;
    el.innerHTML = `${escapeHtml(message)} Tasas por <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">ExchangeRate-API</a>.`;
}

function readAdminMarketRatesCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(ADMIN_MARKET_RATES_CACHE_KEY) || 'null');
        return cached && typeof cached === 'object' ? cached : null;
    } catch (error) {
        return null;
    }
}

function writeAdminMarketRatesCache(payload) {
    try {
        localStorage.setItem(ADMIN_MARKET_RATES_CACHE_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('No se pudo guardar cache de tasas:', error);
    }
}

function isAdminMarketRatesCacheFresh(cached) {
    if (!cached?.usdRate || !cached?.cnyRate) return false;
    const now = Date.now();
    if (cached.nextUpdateUnix && now < (Number(cached.nextUpdateUnix) * 1000)) return true;
    return cached.savedAt && now - Number(cached.savedAt) < 6 * 60 * 60 * 1000;
}

function formatAdminMarketDate(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('es-CO', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

async function fetchAdminMarketRates(options = {}) {
    const cached = readAdminMarketRatesCache();
    if (!options.force && isAdminMarketRatesCacheFresh(cached)) return cached;

    const response = await fetch(ADMIN_MARKET_RATES_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo consultar la tasa de mercado');
    const data = await response.json();
    if (data?.result !== 'success' || !data?.rates?.COP || !data?.rates?.CNY) {
        throw new Error('La respuesta de mercado no trae COP o CNY');
    }

    const usdRate = Number(data.rates.COP) || 0;
    const usdToCny = Number(data.rates.CNY) || 0;
    const cnyRate = usdToCny ? usdRate / usdToCny : 0;
    if (!usdRate || !cnyRate) throw new Error('Tasa de mercado invalida');

    const payload = {
        usdRate,
        cnyRate,
        savedAt: Date.now(),
        lastUpdateUtc: data.time_last_update_utc || '',
        nextUpdateUnix: data.time_next_update_unix || 0
    };
    writeAdminMarketRatesCache(payload);
    return payload;
}

function applyAdminMarketRatesToCalculator(rates, target = 'all') {
    const usdInput = document.getElementById('calc-usd-rate');
    const cnyInput = document.getElementById('calc-cny-rate');
    if ((target === 'all' || target === 'USD') && usdInput) {
        usdInput.value = String(Math.round(Number(rates.usdRate) || 0));
    }
    if ((target === 'all' || target === 'CNY') && cnyInput) {
        cnyInput.value = String((Number(rates.cnyRate) || 0).toFixed(2));
    }
    calculateAdminCostCalculator({ save: true });
}

async function useAdminMarketRate(target = 'all') {
    const label = target === 'USD' ? 'TRM USD' : target === 'CNY' ? 'Yuan' : 'tasas';
    setAdminMarketRateStatus(`Actualizando ${label} de mercado...`);
    try {
        const rates = await fetchAdminMarketRates({ force: false });
        applyAdminMarketRatesToCalculator(rates, target);
        const updatedAt = formatAdminMarketDate(rates.lastUpdateUtc || rates.savedAt);
        setAdminMarketRateStatus(`Tasa de mercado aplicada${updatedAt ? ` (${updatedAt})` : ''}. Puedes editarla manualmente si necesitas otro TRM.`, 'success');
    } catch (error) {
        console.warn('No se pudo actualizar tasa de mercado:', error);
        const cached = readAdminMarketRatesCache();
        if (cached?.usdRate && cached?.cnyRate) {
            applyAdminMarketRatesToCalculator(cached, target);
            setAdminMarketRateStatus('No se pudo actualizar en vivo; use la ultima tasa guardada.', 'error');
            return;
        }
        setAdminMarketRateStatus('No se pudo consultar el mercado; conserva o escribe tu TRM manual.', 'error');
    }
}

function getAdminCostCalculatorState() {
    const usdRateFallback = document.getElementById('china-order-rate')?.value || '4000';
    return {
        quantity: document.getElementById('calc-quantity')?.value || '1',
        currency: document.getElementById('calc-currency')?.value || 'USD',
        unitCost: document.getElementById('calc-unit-cost')?.value || '',
        usdRate: document.getElementById('calc-usd-rate')?.value || usdRateFallback,
        cnyRate: document.getElementById('calc-cny-rate')?.value || '560',
        shipping: document.getElementById('calc-shipping')?.value || '',
        shippingCurrency: document.getElementById('calc-shipping-currency')?.value || 'COP',
        taxPercent: document.getElementById('calc-tax-percent')?.value || '',
        profitPercent: document.getElementById('calc-profit-percent')?.value || '50'
    };
}

function setAdminCostText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function calculateAdminCostCalculator(options = {}) {
    const state = getAdminCostCalculatorState();
    const quantity = Math.max(1, parseChinaNumber(state.quantity || 1));
    const rates = {
        usdRate: Math.max(0, parseChinaNumber(state.usdRate || 0)),
        cnyRate: Math.max(0, parseChinaNumber(state.cnyRate || 0))
    };
    const unitCostCop = convertAdminCostToCop(state.unitCost, state.currency, rates);
    const shippingCop = convertAdminCostToCop(state.shipping, state.shippingCurrency, rates);
    const productSubtotalCop = unitCostCop * quantity;
    const baseCostCop = productSubtotalCop + shippingCop;
    const taxPercent = Math.max(0, parseChinaNumber(state.taxPercent || 0));
    const profitPercent = Math.max(0, parseChinaNumber(state.profitPercent || 0));
    const taxCop = baseCostCop * (taxPercent / 100);
    const totalCostCop = baseCostCop + taxCop;
    const finalUnitCostCop = totalCostCop / quantity;
    const saleUnitCop = finalUnitCostCop * (1 + (profitPercent / 100));
    const saleTotalCop = saleUnitCop * quantity;
    const profitCop = Math.max(0, saleTotalCop - totalCostCop);

    setAdminCostText('calc-result-unit-cost', formatChinaCop(finalUnitCostCop));
    setAdminCostText('calc-result-unit-cost-alt', formatAdminCostAlt(finalUnitCostCop, rates));
    setAdminCostText('calc-result-total-cost', formatChinaCop(totalCostCop));
    setAdminCostText('calc-result-total-cost-alt', formatAdminCostAlt(totalCostCop, rates));
    setAdminCostText('calc-result-sale-unit', formatChinaCop(saleUnitCop));
    setAdminCostText('calc-result-sale-unit-alt', formatAdminCostAlt(saleUnitCop, rates));
    setAdminCostText('calc-result-profit', formatChinaCop(profitCop));
    setAdminCostText(
        'calc-result-breakdown',
        `Base ${formatChinaCop(productSubtotalCop)} + envio ${formatChinaCop(shippingCop)} + impuesto ${formatChinaCop(taxCop)} | Venta total ${formatChinaCop(saleTotalCop)}`
    );

    if (options.save !== false) writeAdminCostCalculatorState(state);
    return { state, rates, totalCostCop, finalUnitCostCop, saleUnitCop, saleTotalCop, profitCop, taxCop, shippingCop, productSubtotalCop };
}

function copyAdminCostCalculatorResult() {
    const result = calculateAdminCostCalculator({ save: true });
    const lines = [
        'Calculadora Original Store',
        `Cantidad: ${result.state.quantity || 1}`,
        `Costo unitario origen: ${result.state.unitCost || 0} ${result.state.currency}`,
        `Tasa USD: ${formatChinaCop(result.rates.usdRate)} | Tasa Yuan: ${formatChinaCop(result.rates.cnyRate)}`,
        `Costo unitario final: ${formatChinaCop(result.finalUnitCostCop)} (${formatAdminCostAlt(result.finalUnitCostCop, result.rates)})`,
        `Costo total final: ${formatChinaCop(result.totalCostCop)} (${formatAdminCostAlt(result.totalCostCop, result.rates)})`,
        `Precio sugerido unidad: ${formatChinaCop(result.saleUnitCop)} (${formatAdminCostAlt(result.saleUnitCop, result.rates)})`,
        `Venta total sugerida: ${formatChinaCop(result.saleTotalCop)}`,
        `Ganancia estimada: ${formatChinaCop(result.profitCop)}`
    ].join('\n');

    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(lines).then(() => {
            if (typeof showToast === 'function') showToast('Resultado copiado', 'success');
        }).catch(() => fallbackCopyChinaOrderSummary(lines));
        return;
    }
    fallbackCopyChinaOrderSummary(lines);
}

function clearAdminCostCalculator() {
    const usdRate = document.getElementById('china-order-rate')?.value || '4000';
    const defaults = {
        'calc-quantity': '1',
        'calc-currency': 'USD',
        'calc-unit-cost': '',
        'calc-usd-rate': usdRate,
        'calc-cny-rate': '560',
        'calc-shipping': '',
        'calc-shipping-currency': 'COP',
        'calc-tax-percent': '',
        'calc-profit-percent': '50'
    };
    Object.entries(defaults).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
    calculateAdminCostCalculator({ save: true });
}

function initAdminCostCalculator() {
    const drawer = document.getElementById('admin-cost-calculator');
    const toggle = document.getElementById('cost-calculator-toggle');
    if (!drawer || drawer.dataset.ready === 'true') return;
    drawer.dataset.ready = 'true';

    const saved = readAdminCostCalculatorState();
    const usdRateFallback = document.getElementById('china-order-rate')?.value || '4000';
    const values = {
        'calc-quantity': saved.quantity || '1',
        'calc-currency': saved.currency || 'USD',
        'calc-unit-cost': saved.unitCost || '',
        'calc-usd-rate': saved.usdRate || usdRateFallback,
        'calc-cny-rate': saved.cnyRate || '560',
        'calc-shipping': saved.shipping || '',
        'calc-shipping-currency': saved.shippingCurrency || 'COP',
        'calc-tax-percent': saved.taxPercent || '',
        'calc-profit-percent': saved.profitPercent || '50'
    };
    Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });

    const setOpen = open => {
        drawer.classList.toggle('open', Boolean(open));
        toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    };

    toggle?.addEventListener('click', () => setOpen(!drawer.classList.contains('open')));
    document.getElementById('cost-calculator-close')?.addEventListener('click', () => setOpen(false));
    document.querySelectorAll('[data-cost-calc]').forEach(input => {
        input.addEventListener('input', () => calculateAdminCostCalculator());
        input.addEventListener('change', () => calculateAdminCostCalculator());
    });
    document.getElementById('calc-usd-rate')?.addEventListener('input', () => {
        setAdminMarketRateStatus('TRM USD personalizado activo.');
    });
    document.getElementById('calc-cny-rate')?.addEventListener('input', () => {
        setAdminMarketRateStatus('Tasa Yuan personalizada activa.');
    });
    document.getElementById('calc-copy-result')?.addEventListener('click', copyAdminCostCalculatorResult);
    document.getElementById('calc-clear')?.addEventListener('click', clearAdminCostCalculator);
    document.getElementById('calc-usd-market-rate')?.addEventListener('click', () => useAdminMarketRate('USD'));
    document.getElementById('calc-cny-market-rate')?.addEventListener('click', () => useAdminMarketRate('CNY'));
    document.getElementById('china-order-rate')?.addEventListener('change', event => {
        const usdRateEl = document.getElementById('calc-usd-rate');
        const savedState = readAdminCostCalculatorState();
        if (usdRateEl && !savedState.usdRate) {
            usdRateEl.value = event.target.value || '4000';
            calculateAdminCostCalculator();
        }
    });

    calculateAdminCostCalculator({ save: false });
    const cachedRates = readAdminMarketRatesCache();
    if (cachedRates?.savedAt) {
        const cachedAt = formatAdminMarketDate(cachedRates.lastUpdateUtc || cachedRates.savedAt);
        setAdminMarketRateStatus(`Ultima tasa de mercado guardada${cachedAt ? `: ${cachedAt}` : ''}. Puedes usar Mercado o escribir tu TRM manual.`);
    }
}

function getChinaOrderRows() {
    return Array.from(document.querySelectorAll('#china-order-items tr[data-china-order-row]'));
}

function collectChinaOrderDraft() {
    const rows = getChinaOrderRows().map(row => ({
        product: row.querySelector('[data-china-field="product"]')?.value || '',
        reference: row.querySelector('[data-china-field="reference"]')?.value || '',
        quantity: row.querySelector('[data-china-field="quantity"]')?.value || '1',
        unitUsd: row.querySelector('[data-china-field="unitUsd"]')?.value || '',
        image: row.dataset.image || ''
    }));

    const showUsdEl = document.getElementById('china-show-usd');
    const showCopEl = document.getElementById('china-show-cop');
    const showRefEl = document.getElementById('china-show-ref');

    return {
        id: activeChinaOrderId || '',
        factory: document.getElementById('china-order-factory')?.value || '',
        rate: document.getElementById('china-order-rate')?.value || '4000',
        notes: document.getElementById('china-order-notes')?.value || '',
        showUsd: showUsdEl ? showUsdEl.checked : true,
        showCop: showCopEl ? showCopEl.checked : true,
        showRef: showRefEl ? showRefEl.checked : true,
        rows
    };
}

function getChinaOrderTotalsFromDraft(draft) {
    const rate = parseChinaNumber(draft?.rate || 0);
    const rows = Array.isArray(draft?.rows) ? draft.rows : [];
    const totalUsd = rows.reduce((sum, item) => {
        const quantity = Math.max(0, parseChinaNumber(item.quantity || 0));
        const unitUsd = Math.max(0, parseChinaNumber(item.unitUsd || 0));
        return sum + (quantity * unitUsd);
    }, 0);

    return {
        rate,
        totalUsd,
        totalCop: totalUsd * rate,
        itemCount: rows.length,
        totalQuantity: rows.reduce((sum, item) => sum + Math.max(0, parseChinaNumber(item.quantity || 0)), 0)
    };
}

function getSavedChinaOrders() {
    return savedChinaOrdersCache;
}

function readSavedChinaOrdersFromLocalStorage() {
    try {
        const list = JSON.parse(localStorage.getItem(CHINA_ORDER_SAVED_KEY) || '[]');
        return Array.isArray(list) ? list : [];
    } catch (error) {
        return [];
    }
}

function readChinaOrderDraftFromLocalStorage() {
    try {
        const draft = JSON.parse(localStorage.getItem(CHINA_ORDER_DRAFT_KEY) || 'null');
        return draft && Array.isArray(draft.rows) ? draft : null;
    } catch (error) {
        return null;
    }
}

async function readSavedChinaOrdersFromStorage() {
    try {
        const list = await readChinaOrderStoreValue(CHINA_ORDER_SAVED_RECORD_KEY);
        if (Array.isArray(list)) return list;
    } catch (error) {
        console.warn('No se pudo leer IndexedDB para pedidos a China:', error);
    }
    return readSavedChinaOrdersFromLocalStorage();
}

async function readChinaOrderDraftFromStorage() {
    try {
        const draft = await readChinaOrderStoreValue(CHINA_ORDER_DRAFT_RECORD_KEY);
        if (draft && Array.isArray(draft.rows)) return draft;
    } catch (error) {
        console.warn('No se pudo leer el borrador grande:', error);
    }
    return readChinaOrderDraftFromLocalStorage();
}

async function migrateLegacyChinaOrdersToIndexedDb() {
    if (!window.indexedDB) return;

    const legacySaved = readSavedChinaOrdersFromLocalStorage();
    const legacyDraft = readChinaOrderDraftFromLocalStorage();

    if (legacySaved.length) {
        const savedInDb = await readChinaOrderStoreValue(CHINA_ORDER_SAVED_RECORD_KEY);
        if (!Array.isArray(savedInDb) || !savedInDb.length) {
            await writeChinaOrderStoreValue(CHINA_ORDER_SAVED_RECORD_KEY, legacySaved);
        }
        localStorage.removeItem(CHINA_ORDER_SAVED_KEY);
    }

    if (legacyDraft) {
        const draftInDb = await readChinaOrderStoreValue(CHINA_ORDER_DRAFT_RECORD_KEY);
        if (!draftInDb || !Array.isArray(draftInDb.rows)) {
            await writeChinaOrderStoreValue(CHINA_ORDER_DRAFT_RECORD_KEY, legacyDraft);
        }
        localStorage.removeItem(CHINA_ORDER_DRAFT_KEY);
    }
}

async function writeSavedChinaOrders(list) {
    const rawList = Array.isArray(list) ? list : [];
    const seen = new Set();
    const normalizedList = [];
    for (const item of rawList) {
        const id = String(item?.id || '').trim();
        if (id) {
            if (seen.has(id)) continue;
            seen.add(id);
        }
        normalizedList.push(item);
    }
    try {
        await writeChinaOrderStoreValue(CHINA_ORDER_SAVED_RECORD_KEY, normalizedList);
        savedChinaOrdersCache = normalizedList;
        try {
            localStorage.removeItem(CHINA_ORDER_SAVED_KEY);
        } catch (error) {
            console.warn('No se pudo limpiar historial viejo:', error);
        }
        return true;
    } catch (error) {
        console.warn('IndexedDB fallo al guardar pedido a China. Intentando respaldo pequeno:', error);
    }

    try {
        localStorage.setItem(CHINA_ORDER_SAVED_KEY, JSON.stringify(normalizedList));
        savedChinaOrdersCache = normalizedList;
        return true;
    } catch (error) {
        showToast('No se pudo guardar: el navegador se quedo sin espacio. Quita fotos muy pesadas o libera almacenamiento del sitio.', 'error');
        return false;
    }
}

function makeChinaOrderId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return 'CHN-' + datePart + '-' + String(Date.now()).slice(-5);
}

function makeChinaOrderRecord(draft = collectChinaOrderDraft(), existing = null) {
    const totals = getChinaOrderTotalsFromDraft(draft);
    const now = new Date().toISOString();
    const orderId = existing?.id || draft?.id || activeChinaOrderId || makeChinaOrderId();
    activeChinaOrderId = orderId;
    return {
        id: orderId,
        createdAt: existing?.createdAt || draft?.createdAt || now,
        updatedAt: now,
        factory: draft.factory || '',
        rate: draft.rate || '4000',
        notes: draft.notes || '',
        showUsd: draft.showUsd !== false,
        showCop: draft.showCop !== false,
        showRef: draft.showRef !== false,
        rows: Array.isArray(draft.rows) ? draft.rows : [],
        totalUsd: totals.totalUsd,
        totalCop: totals.totalCop,
        totalQuantity: totals.totalQuantity
    };
}

function formatChinaOrderImageUrl(url) {
    if (!url) return '';
    if (typeof url !== 'string') return '';
    const raw = url.trim();
    if (!raw) return '';
    if (raw.startsWith('data:image/')) return raw;
    if (raw.startsWith('blob:')) return raw;

    const driveMatch = raw.match(/drive\.google\.com\/file\/d\/([^/?&#]+)/) ||
                       raw.match(/drive\.google\.com\/uc\?(?:[^&]+&)*id=([^&#]+)/) ||
                       raw.match(/drive\.google\.com\/open\?(?:[^&]+&)*id=([^&#]+)/) ||
                       raw.match(/drive\.google\.com\/thumbnail\?(?:[^&]+&)*id=([^&#]+)/) ||
                       raw.match(/lh3\.googleusercontent\.com\/d\/([^/?&#]+)/) ||
                       raw.match(/[?&]id=([^&#]+)/);

    if (driveMatch && driveMatch[1]) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveMatch[1])}&sz=w800`;
    }

    if (raw.startsWith('//')) return `https:${raw}`;
    return raw;
}

async function uploadChinaImageToDrive(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;
    try {
        const parts = dataUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const base64Data = parts[1];
        const fileName = 'china_' + Date.now() + '_' + Math.floor(Math.random() * 1000) + '.jpg';
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 14000);

        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadimage',
                mimeType,
                fileName,
                base64Data
            }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const json = await res.json();
        if (json && (json.ok || json.status === 'success') && (json.url || json.directUrl)) {
            return json.url || json.directUrl;
        }
    } catch (e) {
        console.warn('Error subiendo imagen de China a Drive:', e);
    }
    return dataUrl;
}

async function fetchChinaOrdersFromServer() {
    try {
        const res = await fetch(`${GOOGLE_SHEET_API}?resource=pedidoschina&t=${Date.now()}`);
        const result = await res.json();
        if (result && (result.ok || result.status === 'success') && Array.isArray(result.data)) {
            const seen = new Set();
            const mapped = [];
            for (const row of result.data) {
                const id = String(row['ID Pedido'] || row.id || '').trim();
                if (id && seen.has(id)) continue;
                if (id) seen.add(id);

                let rows = row['Productos JSON'] || row.productos || [];
                if (typeof rows === 'string') {
                    try { rows = JSON.parse(rows); } catch (e) { rows = []; }
                }
                mapped.push({
                    id: id || makeChinaOrderId(),
                    createdAt: row['Fecha'] || row.createdAt || new Date().toISOString(),
                    updatedAt: row['Fecha Actualización'] || row['Fecha'] || new Date().toISOString(),
                    factory: row['Fábrica'] || row.fabrica || '',
                    rate: row['TRM'] || '4000',
                    notes: row['Notas'] || '',
                    showUsd: String(row['Mostrar USD'] || '').toLowerCase() !== 'falso',
                    showCop: String(row['Mostrar COP'] || '').toLowerCase() !== 'falso',
                    showRef: String(row['Mostrar Ref'] || '').toLowerCase() !== 'falso' && row.showRef !== false,
                    rows: Array.isArray(rows) ? rows : [],
                    totalUsd: Number(row['Total USD']) || 0,
                    totalCop: Number(row['Total COP']) || 0,
                    totalQuantity: Number(row['Total Piezas']) || 0
                });
            }
            savedChinaOrdersCache = mapped;
            await writeSavedChinaOrders(mapped);
            renderSavedChinaOrders();
            return mapped;
        }
    } catch (err) {
        console.warn('Error cargando pedidos a China desde la nube:', err);
    }
    return savedChinaOrdersCache;
}

async function saveCurrentChinaOrder(options = {}) {
    const draft = collectChinaOrderDraft();
    const hasProduct = draft.rows.some(item => String(item.product || item.reference || item.unitUsd || '').trim());
    if (!hasProduct) {
        if (!options.silent) showToast('Agrega al menos un producto antes de guardar', 'warning');
        return null;
    }

    const saveButton = document.getElementById('btn-save-china-order');
    const previousButtonText = saveButton ? saveButton.textContent : '';
    if (saveButton && !options.silent) {
        saveButton.disabled = true;
        saveButton.textContent = 'Guardando pedido...';
    }

    // 1. Guardar primero en almacenamiento local / borrador para respuesta y seguridad inmediata
    const currentId = activeChinaOrderId || draft.id;
    const saved = getSavedChinaOrders().slice();
    const existingIndex = currentId
        ? saved.findIndex(order => String(order.id).trim() === String(currentId).trim())
        : -1;
    const existing = existingIndex >= 0 ? saved[existingIndex] : null;
    const record = makeChinaOrderRecord(draft, existing);

    activeChinaOrderId = record.id;
    if (existingIndex >= 0) saved[existingIndex] = record;
    else saved.unshift(record);

    await writeSavedChinaOrders(saved);
    renderSavedChinaOrders();
    await saveChinaOrderDraft({ immediate: true });

    // 2. Subir fotos locales a Drive en PARALELO para máxima velocidad
    const domRows = getChinaOrderRows();
    const imagesToUpload = [];
    draft.rows.forEach((item, idx) => {
        if (item.image && item.image.startsWith('data:image/')) {
            imagesToUpload.push({ index: idx, dataUrl: item.image });
        }
    });

    if (imagesToUpload.length > 0) {
        if (saveButton && !options.silent) {
            saveButton.textContent = `Subiendo ${imagesToUpload.length} foto(s)...`;
        }
        await Promise.all(imagesToUpload.map(async entry => {
            const uploadedUrl = await uploadChinaImageToDrive(entry.dataUrl);
            draft.rows[entry.index].image = uploadedUrl;
            record.rows[entry.index].image = uploadedUrl;
            if (domRows[entry.index]) {
                domRows[entry.index].dataset.image = uploadedUrl;
            }
        }));
        await writeSavedChinaOrders(saved);
    }

    try {
        // 3. Sincronizar con Google Sheets (Nube)
        if (saveButton && !options.silent) {
            saveButton.textContent = 'Sincronizando en la nube...';
        }
        try {
            await fetch(GOOGLE_SHEET_API, {
                method: 'POST',
                body: JSON.stringify({
                    action: existingIndex >= 0 ? 'actualizar' : 'crear',
                    resource: 'pedidoschina',
                    id: record.id,
                    data: {
                        'ID Pedido': record.id,
                        'Fecha': record.createdAt,
                        'Fábrica': record.factory,
                        'TRM': record.rate,
                        'Total USD': record.totalUsd,
                        'Total COP': record.totalCop,
                        'Total Productos': record.rows.length,
                        'Total Piezas': record.totalQuantity,
                        'Productos JSON': JSON.stringify(record.rows),
                        'Notas': record.notes,
                        'Mostrar USD': record.showUsd ? 'VERDADERO' : 'FALSO',
                        'Mostrar COP': record.showCop ? 'VERDADERO' : 'FALSO',
                        'Mostrar Ref': record.showRef ? 'VERDADERO' : 'FALSO'
                    }
                })
            });
        } catch (serverErr) {
            console.warn('Error guardando en Google Sheets:', serverErr);
        }

        if (!options.silent) showToast(`Pedido guardado en la nube (${record.rows.length} producto(s))`, 'success');
        return record;
    } finally {
        if (saveButton && !options.silent) {
            saveButton.disabled = false;
            saveButton.textContent = previousButtonText || 'Guardar pedido';
        }
    }
}

function hydrateChinaOrderForm(orderOrDraft) {
    const tbody = document.getElementById('china-order-items');
    const factory = document.getElementById('china-order-factory');
    const rate = document.getElementById('china-order-rate');
    const notes = document.getElementById('china-order-notes');
    const showUsdEl = document.getElementById('china-show-usd');
    const showCopEl = document.getElementById('china-show-cop');
    const showRefEl = document.getElementById('china-show-ref');
    if (!tbody) return;

    if (orderOrDraft?.id || orderOrDraft?.['ID Pedido']) {
        activeChinaOrderId = String(orderOrDraft.id || orderOrDraft['ID Pedido']).trim();
    }

    isHydratingChinaOrder = true;
    try {
        tbody.innerHTML = '';
        if (factory) factory.value = orderOrDraft?.factory || orderOrDraft?.['Fábrica'] || orderOrDraft?.fabrica || '';
        if (rate) rate.value = orderOrDraft?.rate || orderOrDraft?.['TRM'] || '4000';
        if (notes) notes.value = orderOrDraft?.notes || orderOrDraft?.['Notas'] || '';
        if (showUsdEl) showUsdEl.checked = String(orderOrDraft?.showUsd ?? orderOrDraft?.['Mostrar USD'] ?? '').toLowerCase() !== 'falso' && orderOrDraft?.showUsd !== false;
        if (showCopEl) showCopEl.checked = String(orderOrDraft?.showCop ?? orderOrDraft?.['Mostrar COP'] ?? '').toLowerCase() !== 'falso' && orderOrDraft?.showCop !== false;
        if (showRefEl) showRefEl.checked = String(orderOrDraft?.showRef ?? orderOrDraft?.['Mostrar Ref'] ?? '').toLowerCase() !== 'falso' && orderOrDraft?.showRef !== false;

        let rawRows = orderOrDraft?.rows || orderOrDraft?.['Productos JSON'] || orderOrDraft?.productos || [];
        if (typeof rawRows === 'string') {
            try { rawRows = JSON.parse(rawRows); } catch (e) { rawRows = []; }
        }
        const rows = Array.isArray(rawRows) && rawRows.length ? rawRows : [{}];
        rows.forEach(item => createChinaOrderRow(item, { append: true }));
    } finally {
        isHydratingChinaOrder = false;
    }
    calculateChinaOrderTotals();
}

async function loadSavedChinaOrder(id) {
    const saved = getSavedChinaOrders();
    const order = saved.find(item => String(item.id).trim() === String(id).trim());
    if (!order) {
        showToast('No se encontro el pedido guardado', 'error');
        return;
    }
    activeChinaOrderId = order.id;
    hydrateChinaOrderForm(order);
    await saveChinaOrderDraft({ immediate: true });
    showToast('Pedido cargado para editar', 'success');
}

async function deleteSavedChinaOrder(id) {
    showModal(
        'Eliminar Pedido a China',
        '¿Deseas eliminar permanentemente el pedido ' + id + ' de la base de datos?',
        'Sí, eliminar',
        async function () {
            showToast('Eliminando pedido...');
            try {
                await fetch(GOOGLE_SHEET_API, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'eliminar',
                        resource: 'pedidoschina',
                        id: id
                    })
                });
            } catch (err) {
                console.warn('Error eliminando pedido en el servidor:', err);
            }

            const next = getSavedChinaOrders().filter(item => item.id !== id);
            await writeSavedChinaOrders(next);
            if (activeChinaOrderId === id) activeChinaOrderId = '';
            renderSavedChinaOrders();
            showToast('Pedido eliminado', 'success');
        }
    );
}

function formatChinaOrderDate(value) {
    if (!value) return new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: '2-digit' });
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const day = date.getDate();
    const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
    const month = months[date.getMonth()] || date.toLocaleDateString('es-CO', { month: 'short' });
    const year = date.getFullYear();
    return `${day} de ${month} de ${year}`;
}

function renderSavedChinaOrders() {
    const container = document.getElementById('china-saved-orders-list');
    const badge = document.getElementById('china-saved-count');
    if (!container) return;

    const saved = getSavedChinaOrders();
    if (badge) badge.textContent = saved.length;
    if (!saved.length) {
        container.innerHTML = '<div class="china-saved-empty">No hay pedidos guardados todavia.</div>';
        return;
    }

    container.innerHTML = saved.map(order => `
        <div class="china-saved-row" data-china-saved-id="${escapeHtml(order.id)}">
            <div>
                <strong>${escapeHtml(order.id)}</strong>
                <span>${order.factory ? `Fábrica: <strong>${escapeHtml(order.factory)}</strong> · ` : ''}${formatChinaOrderDate(order.updatedAt || order.createdAt)} - ${Number(order.rows?.length || 0)} producto(s)</span>
            </div>
            <div>
                <strong>${formatChinaUsd(order.totalUsd || 0)}</strong>
                <span>Total USD</span>
            </div>
            <div>
                <strong>${formatChinaCop(order.totalCop || 0)}</strong>
                <span>Total COP</span>
            </div>
            <div class="china-saved-actions">
                <button type="button" class="china-mini-btn" data-china-saved-action="open">Abrir</button>
                <button type="button" class="china-mini-btn pdf" data-china-saved-action="pdf">PDF</button>
                <button type="button" class="china-mini-btn danger" data-china-saved-action="delete">Borrar</button>
            </div>
        </div>
    `).join('');
}

function getChinaOrderPrintStyles() {
    return `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        * {
            box-sizing: border-box !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }

        html, body {
            background: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 0;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 12px;
        }

        .china-print-toolbar {
            position: sticky;
            top: 0;
            left: 0;
            right: 0;
            z-index: 99999;
            background: #1e1b4b;
            padding: 12px 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        }

        .china-print-toolbar-title {
            color: #ffffff;
            font-weight: 700;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .china-print-toolbar-actions {
            display: flex;
            gap: 10px;
        }

        .china-print-btn {
            padding: 9px 18px;
            font-size: 13px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .china-print-btn.primary {
            background: #7c3aed;
            color: #ffffff;
        }
        .china-print-btn.primary:hover {
            background: #6d28d9;
            transform: translateY(-1px);
        }

        .china-print-btn.secondary {
            background: rgba(255,255,255,0.16);
            color: #ffffff;
        }
        .china-print-btn.secondary:hover {
            background: rgba(255,255,255,0.26);
        }

        #china-order-print-container {
            padding: 14px 0;
        }

        .china-print-page {
            box-sizing: border-box !important;
            width: 100% !important;
            max-width: 210mm !important;
            min-height: 270mm !important;
            margin: 0 auto 24px auto !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            background: #ffffff !important;
            padding: 12mm 13mm !important;
            border-radius: 4px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.07);
        }

        .china-print-page:last-child,
        .china-print-page.last {
            page-break-after: auto !important;
            break-after: auto !important;
            margin-bottom: 0 !important;
        }

        .china-print-page-content {
            flex: 1 0 auto !important;
            display: flex !important;
            flex-direction: column !important;
        }

        /* CABECERA PÁGINA 1 */
        .china-print-header {
            border: 2px solid #7c3aed !important;
            border-radius: 14px !important;
            padding: 12px 16px !important;
            margin-bottom: 12px !important;
            background: #ffffff !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            page-break-inside: avoid !important;
        }

        .china-print-brand {
            display: flex !important;
            align-items: center !important;
            gap: 16px !important;
        }

        .china-print-logo-box {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
        }

        .china-print-logo-img {
            height: 38px !important;
            width: auto !important;
            object-fit: contain !important;
        }

        .china-print-logo-title {
            margin: 0 !important;
            font-size: 26px !important;
            font-weight: 900 !important;
            color: #581c87 !important;
            letter-spacing: 0.5px !important;
            line-height: 1 !important;
        }

        .china-print-title-group {
            border-left: 2px solid #ddd6fe !important;
            padding-left: 14px !important;
        }

        .china-print-title-group h2 {
            margin: 0 !important;
            font-size: 15px !important;
            font-weight: 800 !important;
            color: #1e1b4b !important;
            line-height: 1.2 !important;
        }

        .china-print-title-group p {
            margin: 2px 0 0 0 !important;
            font-size: 11px !important;
            font-weight: 500 !important;
            color: #64748b !important;
        }

        .china-print-factory {
            margin: 3px 0 0 0 !important;
            font-size: 11px !important;
            color: #475569 !important;
        }

        .china-print-factory strong {
            color: #581c87 !important;
            font-weight: 700 !important;
        }

        .china-print-meta {
            text-align: right !important;
        }

        .china-print-order-id {
            font-size: 15.5px !important;
            font-weight: 900 !important;
            color: #581c87 !important;
            letter-spacing: 0.5px !important;
            margin-bottom: 3px !important;
        }

        .china-print-meta p {
            margin: 2px 0 0 0 !important;
            font-size: 11px !important;
            color: #475569 !important;
        }

        .china-print-meta strong {
            color: #0f172a !important;
        }

        /* CABECERA COMPACTA (PÁGINA 2+) */
        .china-print-header.compact {
            border: 1.5px solid #7c3aed !important;
            border-radius: 10px !important;
            padding: 8px 16px !important;
            margin-bottom: 12px !important;
            background: #ffffff !important;
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            page-break-inside: avoid !important;
        }

        .china-print-header.compact .china-print-brand {
            display: flex !important;
            align-items: center !important;
            gap: 12px !important;
        }

        .china-print-header.compact h2 {
            margin: 0 !important;
            font-size: 14px !important;
            font-weight: 900 !important;
            color: #581c87 !important;
        }

        .china-print-header.compact h2 span {
            font-weight: 600 !important;
            font-size: 12px !important;
            color: #7c3aed !important;
        }

        .china-print-factory-compact {
            font-size: 11px !important;
            color: #475569 !important;
        }

        .china-print-factory-compact strong {
            color: #581c87 !important;
            font-weight: 700 !important;
        }

        .china-print-order-id-compact {
            font-size: 14px !important;
            font-weight: 800 !important;
            color: #581c87 !important;
            letter-spacing: 0.5px !important;
        }

        /* TABLA PRINCIPAL */
        .china-print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1.5px solid #7c3aed !important;
            margin: 4px 0 9px 0 !important;
            table-layout: fixed !important;
        }

        .china-print-table thead th {
            border: 1px solid #c4b5fd !important;
            border-top: 1.5px solid #7c3aed !important;
            border-bottom: 1.5px solid #7c3aed !important;
            color: #581c87 !important;
            background: #ffffff !important;
            font-size: 10.5px !important;
            font-weight: 800 !important;
            letter-spacing: 0.5px !important;
            text-transform: uppercase !important;
            padding: 7px 5px !important;
        }

        .china-print-table tbody tr {
            border-bottom: 1px solid #ddd6fe !important;
            min-height: 76px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        .china-print-table td {
            padding: 5px 6px !important;
            vertical-align: middle !important;
            border: 1px solid #ddd6fe !important;
            overflow-wrap: anywhere !important;
            word-break: normal !important;
        }

        .china-print-img {
            width: 62px !important;
            height: 62px !important;
            max-width: 100% !important;
            object-fit: cover !important;
            background: #ffffff !important;
            border-radius: 6px !important;
            border: 1px solid #ddd6fe !important;
            display: block !important;
            margin: 0 auto !important;
            box-shadow: 0 1px 2px rgba(0,0,0,0.03) !important;
        }

        .china-print-no-photo {
            width: 62px !important;
            height: 62px !important;
            border-radius: 6px !important;
            border: 1px dashed #cbd5e1 !important;
            background: #f8fafc !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin: 0 auto !important;
            color: #94a3b8 !important;
            font-size: 9px !important;
            font-weight: 600 !important;
        }

        .china-print-prod-name {
            font-size: 12.5px !important;
            font-weight: 800 !important;
            line-height: 1.35 !important;
            color: #0f172a !important;
            margin-bottom: 3px !important;
            text-transform: uppercase !important;
        }

        .china-print-prod-ref {
            font-size: 10px !important;
            color: #64748b !important;
            font-weight: 600 !important;
        }

        .china-print-prod-ref strong {
            color: #334155 !important;
            font-weight: 700 !important;
        }

        /* RESUMEN Y TOTALES */
        .china-print-summary-wrap {
            display: flex !important;
            justify-content: flex-end !important;
            align-items: flex-start !important;
            gap: 16px !important;
            margin-top: 12px !important;
            margin-bottom: 6px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
        }

        .china-print-notes {
            flex: 1 !important;
            max-width: 55% !important;
            background: #fdf4ff !important;
            border: 1px solid #f0abfc !important;
            border-left: 3px solid #7c3aed !important;
            border-radius: 8px !important;
            padding: 8px 12px !important;
            font-size: 10.5px !important;
            color: #334155 !important;
            line-height: 1.4 !important;
        }

        .china-print-notes strong {
            display: block !important;
            color: #581c87 !important;
            font-size: 11px !important;
            margin-bottom: 2px !important;
        }

        .china-print-totals-box {
            border: 2px solid #7c3aed !important;
            border-radius: 12px !important;
            padding: 8px 18px !important;
            background: #ffffff !important;
            min-width: 210px !important;
        }

        .china-print-total-row {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            gap: 20px !important;
            padding: 3px 0 !important;
        }

        .china-print-total-row.main span {
            font-size: 12.5px !important;
            font-weight: 800 !important;
            color: #1e1b4b !important;
        }

        .china-print-total-row.main strong {
            font-size: 14px !important;
            font-weight: 900 !important;
            color: #581c87 !important;
        }

        /* PIE DE PÁGINA */
        .china-print-footer {
            margin-top: auto !important;
            padding-top: 6px !important;
            border-top: 1px solid #e2e8f0 !important;
            display: flex !important;
            justify-content: space-between !important;
            font-size: 9.5px !important;
            color: #64748b !important;
            font-weight: 500 !important;
            page-break-inside: avoid !important;
        }

        @media print {
            @page {
                size: A4 portrait;
                margin: 10mm;
            }

            html, body {
                background: #ffffff !important;
                color: #0f172a !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100% !important;
                height: auto !important;
            }

            .china-print-toolbar {
                display: none !important;
            }

            #china-order-print-container {
                padding: 0 !important;
                display: block !important;
            }

            .china-print-page {
                width: 100% !important;
                max-width: 100% !important;
                min-height: 274mm !important;
                max-height: none !important;
                margin: 0 !important;
                padding: 0 !important;
                box-shadow: none !important;
                border-radius: 0 !important;
            }

            body.printing-china-order > :not(#china-order-print-container) {
                display: none !important;
            }

            body.printing-china-order #china-order-print-container {
                display: block !important;
                visibility: visible !important;
                position: static !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
            }
        }
    `;
}

function ensureChinaPrintStyles() {
    let styleTag = document.getElementById('china-order-print-styles');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'china-order-print-styles';
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = getChinaOrderPrintStyles();
}

function buildChinaOrderPrintHtml(order) {
    const totals = getChinaOrderTotalsFromDraft(order);
    const showUsd = order.showUsd !== false;
    const showCop = order.showCop !== false;
    const showRef = order.showRef !== false;
    const rows = Array.isArray(order.rows) ? order.rows : [];
    const productColumnWidth = showUsd && showCop ? 31 : (showUsd || showCop ? 55 : 79);

    // Exactamente 6 items por página para mantener fotos grandes y esquema visual perfecto
    const rowsPerPage = 6;

    const headers = [
        '<th style="width:13%; text-align:center;">FOTO</th>',
        `<th style="width:${productColumnWidth}%; text-align:left; padding-left:12px;">${showRef ? 'PRODUCTO / REFERENCIA' : 'PRODUCTO'}</th>`,
        '<th style="width:8%; text-align:center;">PCS</th>',
        showUsd ? '<th style="width:11%; text-align:center;">UNIT. USD</th>' : '',
        showCop ? '<th style="width:11%; text-align:right;">UNIT. COP</th>' : '',
        showUsd ? '<th style="width:13%; text-align:center;">SUBTOTAL USD</th>' : '',
        showCop ? '<th style="width:13%; text-align:right;">SUBTOTAL COP</th>' : ''
    ].filter(Boolean).join('');

    const totalRowsHtml = `
        <div class="china-print-total-row main">
            <span>Total PCS</span>
            <strong>${Math.round(totals.totalQuantity || 0).toLocaleString('es-CO')}</strong>
        </div>
        ${showUsd ? `
            <div class="china-print-total-row" style="border-top:1px dashed #ddd6fe; padding-top:4px; margin-top:3px;">
                <span style="font-size:12px; color:#475569; font-weight:600;">Total USD</span>
                <strong style="color:#581c87; font-size:14px; font-weight:900;">${formatChinaUsd(totals.totalUsd)}</strong>
            </div>
        ` : ''}
        ${showCop ? `
            <div class="china-print-total-row" style="border-top:1px dashed #ddd6fe; padding-top:4px; margin-top:3px;">
                <span style="font-size:12px; color:#475569; font-weight:600;">Total COP</span>
                <strong style="color:#0f172a; font-size:13.5px; font-weight:800;">${formatChinaCop(totals.totalCop)}</strong>
            </div>
        ` : ''}
    `;

    function chunkRowsForPrint(items) {
        const pages = [];
        for (let index = 0; index < items.length; index += rowsPerPage) {
            pages.push(items.slice(index, index + rowsPerPage));
        }
        if (!pages.length) pages.push([]);
        return pages;
    }

    function buildPagedItemRows(pageRows, startIndex) {
        return pageRows.map((item, offset) => {
            const index = startIndex + offset;
            const quantity = Math.max(0, parseChinaNumber(item.quantity || 0));
            const unitUsd = Math.max(0, parseChinaNumber(item.unitUsd || 0));
            const subtotalUsd = quantity * unitUsd;
            const unitCop = unitUsd * (totals.rate || 0);
            const subtotalCop = subtotalUsd * (totals.rate || 0);
            const imageSrc = formatChinaOrderImageUrl(item.image);

            const imageHtml = imageSrc
                ? `<img src="${escapeHtml(imageSrc)}" alt="" loading="eager" crossorigin="anonymous" class="china-print-img" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';">
                   <div class="china-print-no-photo" style="display:none;"><span>Sin foto</span></div>`
                : `<div class="china-print-no-photo"><span>Sin foto</span></div>`;

            const refHtml = showRef
                ? (item.reference
                    ? `<div class="china-print-prod-ref">Ref: <strong>${escapeHtml(item.reference)}</strong></div>`
                    : '<div class="china-print-prod-ref" style="color:#94a3b8;">Ref: S/N</div>')
                : '';

            return `
                <tr>
                    <td style="text-align:center; padding:5px 5px; width:13%;">${imageHtml}</td>
                    <td style="padding:8px 12px; vertical-align:middle;">
                        <div class="china-print-prod-name">${index + 1}. ${escapeHtml(item.product || 'Producto sin nombre')}</div>
                        ${refHtml}
                    </td>
                    <td style="text-align:center; font-weight:800; font-size:14px; width:8%; color:#0f172a;">${quantity.toLocaleString('es-CO')}</td>
                    ${showUsd ? `<td style="text-align:center; font-size:12px; color:#334155; font-weight:600; font-variant-numeric:tabular-nums;">${formatChinaUsd(unitUsd)}</td>` : ''}
                    ${showCop ? `<td style="text-align:right; font-size:12px; color:#334155; font-weight:600; font-variant-numeric:tabular-nums;">${formatChinaCop(unitCop)}</td>` : ''}
                    ${showUsd ? `<td style="text-align:center; font-weight:800; color:#581c87; font-size:13px; font-variant-numeric:tabular-nums;">${formatChinaUsd(subtotalUsd)}</td>` : ''}
                    ${showCop ? `<td style="text-align:right; font-weight:800; color:#581c87; font-size:13px; font-variant-numeric:tabular-nums;">${formatChinaCop(subtotalCop)}</td>` : ''}
                </tr>
            `;
        }).join('');
    }

    const pages = chunkRowsForPrint(rows);
    let printedRows = 0;
    const totalPages = pages.length;

    return pages.map((pageRows, pageIndex) => {
        const isFirstPage = pageIndex === 0;
        const isLastPage = pageIndex === totalPages - 1;

        const headerHtml = isFirstPage ? `
            <div class="china-print-header">
                <div class="china-print-brand">
                    <div class="china-print-logo-box">
                        <img src="https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180" alt="Original Store" class="china-print-logo-img" onerror="this.style.display='none';">
                        <h1 class="china-print-logo-title">Original Store</h1>
                    </div>
                    <div class="china-print-title-group">
                        <h2>Pedido a China</h2>
                        <p>Orden de compra proveedor</p>
                        ${order.factory ? `<p class="china-print-factory">Fábrica: <strong>${escapeHtml(order.factory)}</strong></p>` : ''}
                    </div>
                </div>
                <div class="china-print-meta">
                    <div class="china-print-order-id">${escapeHtml(order.id || makeChinaOrderId())}</div>
                    <p>Fecha: <strong>${formatChinaOrderDate(order.updatedAt || order.createdAt || new Date().toISOString())}</strong></p>
                    ${showCop && totals.rate ? `<p>TRM: <strong>${formatChinaCop(totals.rate)}</strong> / USD</p>` : ''}
                </div>
            </div>
        ` : `
            <div class="china-print-header compact">
                <div class="china-print-brand">
                    <h2>Original Store <span>| Pedido a China</span></h2>
                    ${order.factory ? `<span class="china-print-factory-compact">Fábrica: <strong>${escapeHtml(order.factory)}</strong></span>` : ''}
                </div>
                <div class="china-print-meta compact">
                    <strong class="china-print-order-id-compact">${escapeHtml(order.id || makeChinaOrderId())}</strong>
                </div>
            </div>
        `;

        const pageHtml = `
            <div class="china-print-page${isLastPage ? ' last' : ''}">
                <div class="china-print-page-content">
                    ${headerHtml}
                    <table class="china-print-table">
                        <thead>
                            <tr>${headers}</tr>
                        </thead>
                        <tbody>${buildPagedItemRows(pageRows, printedRows)}</tbody>
                    </table>
                    ${isLastPage ? `
                        <div class="china-print-summary-wrap">
                            ${order.notes ? `<div class="china-print-notes"><strong>Notas del Pedido:</strong><p style="margin:0; white-space:pre-wrap;">${escapeHtml(order.notes)}</p></div>` : '<div style="flex:1;"></div>'}
                            <div class="china-print-totals-box">${totalRowsHtml}</div>
                        </div>
                    ` : ''}
                </div>
                <div class="china-print-footer">
                    <span>Original Store Promociones · Pedido a China ${escapeHtml(order.id || '')}</span>
                    <span>Página ${pageIndex + 1} de ${totalPages}</span>
                </div>
            </div>
        `;
        printedRows += pageRows.length;
        return pageHtml;
    }).join('');
}

async function waitForPrintImages(container) {
    const images = Array.from(container.querySelectorAll('img'));
    if (!images.length) return;

    const promises = images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            let settled = false;
            const finish = () => {
                if (!settled) {
                    settled = true;
                    resolve();
                }
            };
            const timer = setTimeout(finish, 3500);

            img.onload = () => {
                clearTimeout(timer);
                finish();
            };
            img.onerror = () => {
                clearTimeout(timer);
                const src = img.src || '';
                const driveMatch = src.match(/[?&]id=([^&#]+)/) || src.match(/lh3\.googleusercontent\.com\/d\/([^/?&#]+)/);
                if (driveMatch && driveMatch[1] && !img.dataset.retried) {
                    img.dataset.retried = '1';
                    img.src = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
                    img.onload = finish;
                    img.onerror = finish;
                } else {
                    finish();
                }
            };
        });
    });

    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 100));
}

function openChinaOrderPrintWindow(order) {
    if (!order) return false;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    const baseUrl = window.location.href.replace(/[^/]*$/, '');
    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base href="${escapeHtml(baseUrl)}">
    <title>Pedido-China-${escapeHtml(order.id || 'Original Store')}</title>
    <style>${getChinaOrderPrintStyles()}</style>
</head>
<body>
    <div class="china-print-toolbar">
        <div class="china-print-toolbar-title">
            <span style="font-size:16px;">CN</span>
            <span>Pedido a China: <strong>${escapeHtml(order.id || '')}</strong></span>
        </div>
        <div class="china-print-toolbar-actions">
            <button type="button" class="china-print-btn secondary" onclick="window.close()">Cerrar</button>
            <button type="button" class="china-print-btn primary" onclick="window.print()">Imprimir / Guardar PDF</button>
        </div>
    </div>
    <div id="china-order-print-container" style="display:block !important;">
        ${buildChinaOrderPrintHtml(order)}
    </div>
    <script>
        async function initPrint() {
            const images = Array.from(document.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete && img.naturalWidth > 0) return Promise.resolve();
                return new Promise(res => {
                    img.onload = res;
                    img.onerror = () => {
                        const src = img.src || '';
                        const driveMatch = src.match(/[?&]id=([^&#]+)/) || src.match(/lh3\\.googleusercontent\\.com\\/d\\/([^/?&#]+)/);
                        if (driveMatch && driveMatch[1] && !img.dataset.retried) {
                            img.dataset.retried = '1';
                            img.src = 'https://lh3.googleusercontent.com/d/' + driveMatch[1];
                            img.onload = res;
                            img.onerror = res;
                        } else {
                            res();
                        }
                    };
                    setTimeout(res, 3000);
                });
            }));
            setTimeout(() => {
                window.print();
            }, 350);
        }
        window.addEventListener('load', initPrint);
    <\/script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    return true;
}

async function printChinaOrderPdf(order) {
    if (!order) return;

    // Intentar abrir en ventana limpia independiente para PDF sin interferencia de estilos de panel
    const opened = openChinaOrderPrintWindow(order);
    if (opened) return;

    // Respaldo de impresión en misma ventana si los popups están bloqueados
    ensureChinaPrintStyles();

    let container = document.getElementById('china-order-print-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'china-order-print-container';
        document.body.appendChild(container);
    }
    container.innerHTML = buildChinaOrderPrintHtml(order);

    const parent = container.parentElement;
    const nextSib = container.nextSibling;
    if (container.parentElement !== document.body) {
        document.body.appendChild(container);
    }

    const previousTitle = document.title;
    document.title = 'Pedido-China-' + String(order.id || 'Original Store').replace(/[^a-z0-9_-]/gi, '');
    document.body.classList.add('printing-china-order');

    let cleanedUp = false;
    const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        document.body.classList.remove('printing-china-order');
        document.title = previousTitle;
        if (parent && parent !== document.body && container.parentElement === document.body) {
            if (nextSib && parent.contains(nextSib)) parent.insertBefore(container, nextSib);
            else parent.appendChild(container);
        }
        window.removeEventListener('afterprint', cleanup);
    };

    window.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 45000);

    await waitForPrintImages(container);
    await new Promise(resolve => setTimeout(resolve, 200));

    window.print();
}

async function downloadCurrentChinaOrderPdf() {
    const draft = collectChinaOrderDraft();
    const hasProduct = draft.rows.some(item => String(item.product || item.reference || item.unitUsd || item.quantity || '').trim());
    if (!hasProduct) {
        showToast('Agrega al menos un producto antes de descargar el PDF', 'warning');
        return;
    }
    const currentId = activeChinaOrderId || draft.id;
    const saved = getSavedChinaOrders();
    const existing = currentId ? saved.find(item => String(item.id).trim() === String(currentId).trim()) : null;
    const order = makeChinaOrderRecord(draft, existing);
    activeChinaOrderId = order.id;

    showToast('Preparando PDF de pedido a China...', 'info');
    await printChinaOrderPdf(order);
    saveCurrentChinaOrder({ silent: true }).catch(err => console.warn('Error en guardado segundo plano:', err));
}

async function persistChinaOrderDraft(draft) {
    try {
        await writeChinaOrderStoreValue(CHINA_ORDER_DRAFT_RECORD_KEY, draft);
        try {
            localStorage.removeItem(CHINA_ORDER_DRAFT_KEY);
        } catch (cleanupError) {
            console.warn('No se pudo limpiar borrador viejo:', cleanupError);
        }
        return true;
    } catch (error) {
        console.warn('No se pudo guardar el borrador grande en IndexedDB:', error);
    }

    try {
        localStorage.setItem(CHINA_ORDER_DRAFT_KEY, JSON.stringify(draft));
        return true;
    } catch (error) {
        console.warn('No se pudo guardar el borrador del pedido a China:', error);
        return false;
    }
}

function saveChinaOrderDraft(options = {}) {
    if (isHydratingChinaOrder) return Promise.resolve(false);

    const draft = collectChinaOrderDraft();
    if (options.immediate) {
        clearTimeout(chinaOrderDraftSaveTimer);
        return persistChinaOrderDraft(draft);
    }

    clearTimeout(chinaOrderDraftSaveTimer);
    chinaOrderDraftSaveTimer = setTimeout(() => {
        persistChinaOrderDraft(draft);
    }, 250);
    return Promise.resolve(true);
}

function calculateChinaOrderTotals() {
    const rate = parseChinaNumber(document.getElementById('china-order-rate')?.value || 0);
    let totalUsd = 0;
    let totalPieces = 0;
    const rows = getChinaOrderRows();

    rows.forEach(row => {
        const quantity = Math.max(0, parseChinaNumber(row.querySelector('[data-china-field="quantity"]')?.value || 0));
        const unitUsd = Math.max(0, parseChinaNumber(row.querySelector('[data-china-field="unitUsd"]')?.value || 0));
        const unitCop = unitUsd * rate;
        const subtotalUsd = quantity * unitUsd;
        const subtotalCop = subtotalUsd * rate;

        const unitCopEl = row.querySelector('[data-china-output="unitCop"]');
        const subtotalUsdEl = row.querySelector('[data-china-output="subtotalUsd"]');
        const subtotalCopEl = row.querySelector('[data-china-output="subtotalCop"]');
        if (unitCopEl) unitCopEl.textContent = formatChinaCop(unitCop);
        if (subtotalUsdEl) subtotalUsdEl.textContent = formatChinaUsd(subtotalUsd);
        if (subtotalCopEl) subtotalCopEl.textContent = formatChinaCop(subtotalCop);

        totalUsd += subtotalUsd;
        totalPieces += quantity;
    });

    const totalUsdEl = document.getElementById('china-order-total-usd');
    const totalCopEl = document.getElementById('china-order-total-cop');
    const totalProductsEl = document.getElementById('china-order-total-products');
    const totalPiecesEl = document.getElementById('china-order-total-pieces');
    if (totalUsdEl) totalUsdEl.textContent = formatChinaUsd(totalUsd);
    if (totalCopEl) totalCopEl.textContent = formatChinaCop(totalUsd * rate);
    if (totalProductsEl) totalProductsEl.textContent = rows.length.toLocaleString('es-CO');
    if (totalPiecesEl) totalPiecesEl.textContent = Math.round(totalPieces).toLocaleString('es-CO');
    saveChinaOrderDraft();
}

function openChinaPhotoModal(src, title = 'Foto del producto') {
    if (!src) return;
    let modal = document.getElementById('china-photo-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'china-photo-modal';
        modal.className = 'china-photo-modal';
        modal.innerHTML = `
            <div class="china-photo-modal-backdrop"></div>
            <div class="china-photo-modal-content">
                <button type="button" class="china-photo-modal-close" title="Cerrar">&times;</button>
                <div class="china-photo-modal-title"></div>
                <div class="china-photo-modal-img-wrap">
                    <img src="" alt="Foto ampliada">
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('.china-photo-modal-backdrop').addEventListener('click', () => modal.classList.remove('active'));
        modal.querySelector('.china-photo-modal-close').addEventListener('click', () => modal.classList.remove('active'));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                modal.classList.remove('active');
            }
        });
    }

    const img = modal.querySelector('img');
    const titleEl = modal.querySelector('.china-photo-modal-title');
    const formatted = formatChinaOrderImageUrl(src) || src;
    img.src = formatted;
    if (titleEl) titleEl.textContent = title || 'Foto del producto';
    modal.classList.add('active');
}

function setChinaOrderImage(row, src) {
    if (!row || !src) return;
    row.dataset.image = src;
    const formatted = formatChinaOrderImageUrl(src);
    const wrapper = row.querySelector('.china-order-photo-wrapper');
    const drop = row.querySelector('.china-order-photo-drop');
    const img = row.querySelector('.china-order-photo-drop img');
    if (wrapper) wrapper.classList.add('has-image');
    if (drop) drop.classList.add('has-image');
    if (img) {
        img.src = formatted || src;
        img.onerror = () => {
            const driveMatch = (formatted || src).match(/[?&]id=([^&#]+)/) || (formatted || src).match(/lh3\.googleusercontent\.com\/d\/([^/?&#]+)/);
            if (driveMatch && driveMatch[1] && !img.dataset.retried) {
                img.dataset.retried = '1';
                img.src = `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
            }
        };
    }
    saveChinaOrderDraft();
}

async function prepareChinaOrderImageDataUrl(file) {
    if (file.type === 'image/gif') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen'));
            reader.readAsDataURL(file);
        });
    }

    const img = await loadImageFile(file);
    const maxEdge = 600;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth || img.width || 1, img.naturalHeight || img.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((img.naturalWidth || img.width || 1) * scale));
    canvas.height = Math.max(1, Math.round((img.naturalHeight || img.height || 1) * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo preparar la imagen');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
}

async function readChinaOrderImageFile(row, file) {
    if (!file || !file.type || !file.type.startsWith('image/')) {
        showToast('Arrastra una imagen valida para el producto', 'warning');
        return;
    }
    try {
        const dataUrl = await prepareChinaOrderImageDataUrl(file);
        setChinaOrderImage(row, dataUrl);
    } catch (error) {
        showToast('No se pudo leer la imagen', 'error');
    }
}

function createChinaOrderRow(item = {}, options = {}) {
    const tbody = document.getElementById('china-order-items');
    if (!tbody) return null;

    const row = document.createElement('tr');
    row.dataset.chinaOrderRow = 'true';
    row.dataset.image = item.image || '';
    row.innerHTML = `
        <td>
            <div class="china-order-photo-wrapper${item.image ? ' has-image' : ''}">
                <label class="china-order-photo-drop" title="Arrastra una foto o haz clic para subir">
                    <input type="file" accept="image/*" data-china-field="imageFile">
                    <img alt="Foto del producto">
                    <span>Arrastra<br>foto</span>
                </label>
                <button type="button" class="china-photo-preview-btn" title="Ver foto ampliada">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </button>
            </div>
        </td>
        <td>
            <div class="china-order-product-fields">
                <input type="text" class="form-control" data-china-field="product" placeholder="Producto" value="${escapeHtml(item.product || '')}">
                <input type="text" class="form-control" data-china-field="reference" placeholder="Referencia opcional" value="${escapeHtml(item.reference || '')}">
            </div>
        </td>
        <td><input type="number" class="form-control" data-china-field="quantity" min="0" step="1" value="${escapeHtml(item.quantity || '1')}"></td>
        <td><input type="number" class="form-control" data-china-field="unitUsd" min="0" step="0.01" placeholder="0.00" value="${escapeHtml(item.unitUsd || '')}"></td>
        <td class="china-order-money muted" data-china-output="unitCop">$0</td>
        <td class="china-order-money" data-china-output="subtotalUsd">US$0.00</td>
        <td class="china-order-money" data-china-output="subtotalCop">$0</td>
        <td><button type="button" class="china-order-remove" title="Eliminar producto">x</button></td>
    `;
    if (options.append) tbody.appendChild(row);
    else tbody.prepend(row);

    const fileInput = row.querySelector('[data-china-field="imageFile"]');
    const drop = row.querySelector('.china-order-photo-drop');
    const previewBtn = row.querySelector('.china-photo-preview-btn');

    if (item.image) setChinaOrderImage(row, item.image);

    previewBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const imgSrc = row.dataset.image;
        if (!imgSrc) return;
        const prodName = row.querySelector('[data-china-field="product"]')?.value || 'Producto';
        openChinaPhotoModal(imgSrc, prodName);
    });

    row.querySelectorAll('input:not([type="file"])').forEach(input => {
        input.addEventListener('input', calculateChinaOrderTotals);
        input.addEventListener('change', calculateChinaOrderTotals);
    });
    fileInput?.addEventListener('change', event => readChinaOrderImageFile(row, event.target.files?.[0]));
    drop?.addEventListener('dragover', event => {
        event.preventDefault();
        drop.classList.add('drag-over');
    });
    drop?.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop?.addEventListener('drop', event => {
        event.preventDefault();
        drop.classList.remove('drag-over');
        readChinaOrderImageFile(row, event.dataTransfer.files?.[0]);
    });
    row.querySelector('.china-order-remove')?.addEventListener('click', () => {
        row.remove();
        if (!getChinaOrderRows().length) createChinaOrderRow();
        calculateChinaOrderTotals();
    });

    calculateChinaOrderTotals();
    return row;
}

function buildChinaOrderSummary() {
    const draft = collectChinaOrderDraft();
    const rate = parseChinaNumber(draft.rate || 0);
    let totalUsd = 0;
    let totalPieces = 0;
    const lines = draft.rows.map((item, index) => {
        const quantity = Math.max(0, parseChinaNumber(item.quantity || 0));
        const unitUsd = Math.max(0, parseChinaNumber(item.unitUsd || 0));
        const subtotalUsd = quantity * unitUsd;
        totalUsd += subtotalUsd;
        totalPieces += quantity;
        const reference = item.reference ? ` | Ref: ${item.reference}` : '';
        return `${index + 1}. ${item.product || 'Producto sin nombre'}${reference} | Cant: ${quantity} | Unit: ${formatChinaUsd(unitUsd)} / ${formatChinaCop(unitUsd * rate)} | Subtotal: ${formatChinaUsd(subtotalUsd)} / ${formatChinaCop(subtotalUsd * rate)}`;
    });

    return [
        'Pedido a China - Original Store',
        draft.factory ? `Fábrica: ${draft.factory}` : '',
        `TRM: ${formatChinaCop(rate)} por USD`,
        '',
        ...lines,
        '',
        `TOTAL PIEZAS: ${Math.round(totalPieces).toLocaleString('es-CO')}`,
        `TOTAL USD: ${formatChinaUsd(totalUsd)}`,
        `TOTAL COP: ${formatChinaCop(totalUsd * rate)}`,
        draft.notes ? `Notas: ${draft.notes}` : ''
    ].filter(line => line !== '').join('\n');
}

function fallbackCopyChinaOrderSummary(summary) {
    const textarea = document.createElement('textarea');
    textarea.value = summary;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Resumen del pedido copiado', 'success');
    } catch (error) {
        showToast('No se pudo copiar el resumen', 'error');
    }
    textarea.remove();
}

function copyChinaOrderSummary() {
    const summary = buildChinaOrderSummary();
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(summary)
            .then(() => showToast('Resumen del pedido copiado', 'success'))
            .catch(() => fallbackCopyChinaOrderSummary(summary));
        return;
    }
    fallbackCopyChinaOrderSummary(summary);
}

function clearChinaOrderDraft() {
    clearTimeout(chinaOrderDraftSaveTimer);
    try {
        localStorage.removeItem(CHINA_ORDER_DRAFT_KEY);
    } catch (error) {
        console.warn('No se pudo limpiar el borrador:', error);
    }
    deleteChinaOrderStoreValue(CHINA_ORDER_DRAFT_RECORD_KEY).catch(error => {
        console.warn('No se pudo limpiar el borrador grande:', error);
    });
    activeChinaOrderId = '';
    const tbody = document.getElementById('china-order-items');
    if (tbody) tbody.innerHTML = '';
    const factory = document.getElementById('china-order-factory');
    const rate = document.getElementById('china-order-rate');
    const notes = document.getElementById('china-order-notes');
    const showUsdEl = document.getElementById('china-show-usd');
    const showCopEl = document.getElementById('china-show-cop');
    const showRefEl = document.getElementById('china-show-ref');
    if (factory) factory.value = '';
    if (rate) rate.value = '4000';
    if (notes) notes.value = '';
    if (showUsdEl) showUsdEl.checked = true;
    if (showCopEl) showCopEl.checked = true;
    if (showRefEl) showRefEl.checked = true;
    createChinaOrderRow();
    calculateChinaOrderTotals();
}

async function initChinaOrdersBuilder() {
    const tbody = document.getElementById('china-order-items');
    if (!tbody || tbody.dataset.ready === 'true') return;
    tbody.dataset.ready = 'true';

    const factory = document.getElementById('china-order-factory');
    const rate = document.getElementById('china-order-rate');
    const notes = document.getElementById('china-order-notes');

    factory?.addEventListener('input', saveChinaOrderDraft);
    factory?.addEventListener('change', saveChinaOrderDraft);
    rate?.addEventListener('input', calculateChinaOrderTotals);
    rate?.addEventListener('change', calculateChinaOrderTotals);
    notes?.addEventListener('input', saveChinaOrderDraft);
    document.getElementById('china-show-usd')?.addEventListener('change', saveChinaOrderDraft);
    document.getElementById('china-show-cop')?.addEventListener('change', saveChinaOrderDraft);
    document.getElementById('china-show-ref')?.addEventListener('change', saveChinaOrderDraft);
    document.getElementById('btn-add-china-order-item')?.addEventListener('click', () => createChinaOrderRow());
    document.getElementById('btn-save-china-order')?.addEventListener('click', () => saveCurrentChinaOrder());
    document.getElementById('btn-print-china-order')?.addEventListener('click', downloadCurrentChinaOrderPdf);
    document.getElementById('btn-copy-china-order')?.addEventListener('click', copyChinaOrderSummary);
    document.getElementById('btn-clear-china-order')?.addEventListener('click', clearChinaOrderDraft);
    document.getElementById('china-saved-orders-list')?.addEventListener('click', event => {
        const button = event.target.closest('[data-china-saved-action]');
        const row = event.target.closest('[data-china-saved-id]');
        if (!button || !row) return;
        const id = row.dataset.chinaSavedId;
        const action = button.dataset.chinaSavedAction;
        if (action === 'open') loadSavedChinaOrder(id);
        if (action === 'pdf') {
            const order = getSavedChinaOrders().find(item => item.id === id);
            if (order) printChinaOrderPdf(order);
        }
        if (action === 'delete') deleteSavedChinaOrder(id);
    });

    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:22px; color:rgba(255,255,255,0.55);">Cargando pedidos guardados...</td></tr>';
    try {
        await migrateLegacyChinaOrdersToIndexedDb();
    } catch (error) {
        console.warn('No se pudo migrar el historial de pedidos a China:', error);
    }

    savedChinaOrdersCache = await readSavedChinaOrdersFromStorage();
    const draft = await readChinaOrderDraftFromStorage();

    if (draft) {
        hydrateChinaOrderForm(draft);
    } else {
        tbody.innerHTML = '';
        createChinaOrderRow();
    }

    renderSavedChinaOrders();
    calculateChinaOrderTotals();
    fetchChinaOrdersFromServer();
}

window.pedidosList = [];
window.facturasList = [];
window.activeOrdersAdminTab = 'quick-sale';
const ADMIN_ORDERS_CACHE_KEY = 'blyxu_admin_orders_invoices_cache_v2';
try { localStorage.removeItem(ADMIN_ORDERS_CACHE_KEY); } catch (_) {}
window.addEventListener('pagehide', () => {
    revokeAdminSession();
    sessionStorage.removeItem(ADMIN_ORDERS_CACHE_KEY);
    const screen = document.getElementById('admin-login-screen');
    const main = document.getElementById('admin-main-content');
    if (screen) screen.style.display = '';
    if (main) main.style.display = 'none';
});
const ADMIN_ORDERS_CACHE_TTL = 45 * 1000;
let adminOrdersLoadPromise = null;

function readAdminOrdersCache() {
    try {
        const cached = JSON.parse(sessionStorage.getItem(ADMIN_ORDERS_CACHE_KEY) || 'null');
        return cached && Array.isArray(cached.pedidos) && Array.isArray(cached.facturas) ? cached : null;
    } catch (error) {
        return null;
    }
}

function writeAdminOrdersCache() {
    try {
        sessionStorage.setItem(ADMIN_ORDERS_CACHE_KEY, JSON.stringify({
            savedAt: Date.now(),
            pedidos: window.pedidosList || [],
            facturas: window.facturasList || []
        }));
    } catch (error) {
        console.warn('No se pudo guardar cache de pedidos:', error);
    }
}

function isAdminOrdersCacheFresh(cached) {
    return Boolean(cached?.savedAt && Date.now() - Number(cached.savedAt) < ADMIN_ORDERS_CACHE_TTL);
}

async function cargarPedidos(options = {}) {
    const force = Boolean(options && options.force);
    const orderBodies = ['orders-mayor-tbody', 'orders-detal-tbody', 'orders-tbody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    const invoiceBodies = ['invoices-mayor-tbody', 'invoices-detal-tbody', 'invoices-tbody']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    const cached = readAdminOrdersCache();
    if (cached && !force) {
        window.pedidosList = cached.pedidos;
        window.facturasList = cached.facturas;
        renderPedidos();
        renderFacturas();
        renderAdminDashboard();
        if (!force && isAdminOrdersCacheFresh(cached)) return;
        if (!force && adminOrdersLoadPromise) return adminOrdersLoadPromise;
    } else if (!cached) {
        orderBodies.forEach(tbody => { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">Sincronizando pedidos...</td></tr>'; });
        invoiceBodies.forEach(tbody => { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px;">Sincronizando facturas...</td></tr>'; });
    }

    if (adminOrdersLoadPromise && !force) return adminOrdersLoadPromise;
    
    adminOrdersLoadPromise = (async () => {
    try {
        const [pedidosResponse, facturasResponse] = await Promise.all([
            fetch(GOOGLE_SHEET_API + "?resource=pedidos&action=get&_=" + Date.now(), { cache: 'no-store' }),
            fetch(GOOGLE_SHEET_API + "?resource=facturas&action=get&_=" + Date.now(), { cache: 'no-store' })
        ]);
        const [pedidosResult, facturasResult] = await Promise.all([
            pedidosResponse.json(),
            facturasResponse.json()
        ]);

        if (pedidosResult && pedidosResult.status === 'success' && Array.isArray(pedidosResult.data)) {
            // Validate both responses before replacing the displayed records.
        } else {
            throw new Error(pedidosResult.error || 'Error al cargar los pedidos');
        }

        if (facturasResult && facturasResult.status === 'success' && Array.isArray(facturasResult.data)) {
            window.facturasList = facturasResult.data.slice().reverse();
        } else {
            throw new Error(facturasResult?.error || 'No se pudieron cargar las facturas.');
        }

        window.pedidosList = pedidosResult.data.slice().reverse();
        writeAdminOrdersCache();
        renderPedidos();
        renderFacturas();
        renderAdminDashboard();
    } catch (err) {
        console.error(err);
        if (!cached) {
            orderBodies.forEach(tbody => { tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 40px; color: #ff4d4d;">Error conectando con la base de datos: ${escapeHtml(err.message)}</td></tr>`; });
            invoiceBodies.forEach(tbody => { tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 40px; color: #ff4d4d;">Error conectando con la base de datos: ${escapeHtml(err.message)}</td></tr>`; });
        }
        showToast(cached ? 'No se actualizaron los pedidos. Se conserva el listado anterior.' : 'Error cargando pedidos', cached ? 'warning' : 'error');
        if(options.throwOnError)throw err;
    } finally {
        adminOrdersLoadPromise = null;
    }
    })();

    return adminOrdersLoadPromise;
}

function getOrderIdValue(order) {
    return order && (order['ID Pedido'] || order.ID || order.id || '');
}

function getInvoiceIdValue(invoice) {
    return invoice && (invoice['ID Factura'] || invoice.ID || invoice.id || '');
}

function getInvoiceOrderIdValue(invoice) {
    return invoice && (invoice['ID Pedido'] || invoice['Pedido'] || '');
}

function getInvoiceCustomerName(invoice) {
    return invoice && (invoice.Nombre || invoice['Nombre Cliente'] || invoice.Cliente || '-');
}

function parseAdminInvoiceMoney(value) {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const cleaned = String(value)
        .replace(/[^\d,.-]/g, '')
        .replace(/\.(?=\d{3}(\D|$))/g, '')
        .replace(',', '.');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdminInvoiceMoney(value) {
    const number = Math.max(0, Math.round(Number(value) || 0));
    return '$' + number.toLocaleString('es-CO');
}

function getInvoiceTotalFromItems(items) {
    return (items || []).reduce((sum, item) => {
        const qty = Number(item.cantidad || item.Cantidad || item.qty || 1) || 1;
        const price = Number(item.precio || item.Precio || item.price || 0) || 0;
        return sum + (qty * price);
    }, 0);
}

function getInvoicePaidValue(invoice) {
    if (!invoice) return 0;
    return parseAdminInvoiceMoney(
        invoice['Valor Abonado'] ??
        invoice['Total Abonado'] ??
        invoice.Abonado ??
        invoice.abonado ??
        invoice['Pago Recibido'] ??
        invoice.Pagado ??
        0
    );
}

function getInvoiceBalanceInfo(invoice, totalOverride) {
    const total = Number(totalOverride) || parseAdminInvoiceMoney(invoice?.Subtotal || invoice?.Total || 0);
    let paid = Math.min(Math.max(0, getInvoicePaidValue(invoice)), Math.max(0, total));
    const storedBalance = parseAdminInvoiceMoney(invoice?.['Saldo Pendiente'] ?? invoice?.Saldo ?? invoice?.saldo ?? '');
    if (paid === 0 && storedBalance > 0 && total > storedBalance) {
        paid = total - storedBalance;
    }
    const balance = Math.max(0, total - paid);
    return { total, paid, balance };
}

function normalizeAdminCustomerType(value) {
    const clean = String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    if (clean.includes('mayor') || clean.includes('wholesale')) return 'mayor';
    if (clean.includes('detal') || clean.includes('minor') || clean.includes('retail')) return 'detal';
    return '';
}

function getInvoiceCustomerTypeLabel(value, fallback = 'Detal') {
    const raw = String(value || fallback || '').trim();
    const normalized = normalizeAdminCustomerType(raw);
    if (normalized === 'mayor') return 'Mayorista';
    if (normalized === 'detal') return 'Detal';
    return raw || 'Detal';
}

function inferAdminCustomerTypeFromId(value) {
    const id = String(value || '').toLowerCase().trim();
    if (id.startsWith('fac-may') || id.startsWith('may-') || id.includes('-may-')) return 'mayor';
    if (id.startsWith('fac-det') || id.startsWith('det-') || id.includes('-det-')) return 'detal';
    return '';
}

function setInvoiceCustomerTypeControl(value, fallback = 'Detal') {
    const control = document.getElementById('inv-edit-tipo');
    if (!control) return;
    const label = getInvoiceCustomerTypeLabel(value, fallback);
    if (control.tagName === 'SELECT' && !Array.from(control.options).some(option => option.value === label)) {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        control.appendChild(option);
    }
    control.value = label;
}

function inferOrderCustomerType(order) {
    if (!order) return 'detal';
    const idType = inferAdminCustomerTypeFromId(getOrderIdValue(order));
    if (idType) return idType;

    const explicit = normalizeAdminCustomerType(order['Tipo Cliente'] || order.Tipo || order.tipo || order.ClienteTipo);
    if (explicit) return explicit;

    const id = String(getOrderIdValue(order) || '').toLowerCase();
    if (id.startsWith('may-')) return 'mayor';
    if (id.startsWith('det-')) return 'detal';

    const method = String(order['Método Contacto'] || order['Metodo Contacto'] || order.Metodo || '').toLowerCase();
    const methodType = normalizeAdminCustomerType(method);
    if (methodType) return methodType;

    try {
        const jsonStr = order['Productos JSON'] || order.Productos;
        const items = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : (Array.isArray(jsonStr) ? jsonStr : []);
        if (items.some(item => normalizeAdminCustomerType(item.modo || item.mode || item.tipo) === 'mayor')) return 'mayor';
    } catch (error) {
        // Si no se puede leer el JSON, dejamos el pedido como detal por compatibilidad.
    }

    return 'detal';
}

function inferInvoiceCustomerType(invoice) {
    if (!invoice) return 'detal';
    const invoiceIdType = inferAdminCustomerTypeFromId(getInvoiceIdValue(invoice));
    if (invoiceIdType) return invoiceIdType;

    const orderIdType = inferAdminCustomerTypeFromId(getInvoiceOrderIdValue(invoice));
    if (orderIdType) return orderIdType;

    const explicit = normalizeAdminCustomerType(invoice['Tipo Cliente'] || invoice.Tipo || invoice.tipo || invoice.ClienteTipo);
    if (explicit) return explicit;

    const idPedido = String(getInvoiceOrderIdValue(invoice) || '').trim();
    if (idPedido) {
        const linkedOrder = (window.pedidosList || []).find(order => String(getOrderIdValue(order)).trim() === idPedido);
        if (linkedOrder) return inferOrderCustomerType(linkedOrder);
        const lowerId = idPedido.toLowerCase();
        if (lowerId.startsWith('may-')) return 'mayor';
        if (lowerId.startsWith('det-')) return 'detal';
    }

    try {
        const jsonStr = invoice['Productos JSON'] || invoice.Productos;
        const items = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : (Array.isArray(jsonStr) ? jsonStr : []);
        if (items.some(item => normalizeAdminCustomerType(item.modo || item.mode || item.tipo) === 'mayor')) return 'mayor';
    } catch (error) {
        // Mantener compatibilidad con facturas manuales.
    }

    return 'detal';
}

function getInvoiceStatusColor(estado) {
    const value = String(estado || '').toLowerCase();
    if (value.includes('final') || value.includes('complet') || value.includes('enviado') || value.includes('pagado') || value.includes('pago') || value.includes('abon')) return '#10B981';
    if (value.includes('cancel')) return '#EF4444';
    return '#9ca3af';
}

function buildInvoiceStatusSelect(idx, estado) {
    const options = ['Pendiente', 'Abonada', 'Pago', 'Enviado', 'Finalizada'];
    const current = String(estado || 'Pendiente').trim();
    const allOptions = options.includes(current) ? options : [current, ...options];
    return `<select class="invoice-status-select" onchange="updateAdminInvoiceStatus(${idx}, this.value, this)" aria-label="Cambiar estado de factura">
        ${allOptions.map(option => `<option value="${escapeHtml(option)}"${option === current ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}
    </select>`;
}

function getOrdersSearchQuery() {
    return String(document.getElementById('admin-orders-search')?.value || '').toLowerCase().trim();
}

function recordMatchesOrdersSearch(record, fields) {
    const query = getOrdersSearchQuery();
    if (!query) return true;
    return fields.map(value => String(value || '')).join(' ').toLowerCase().includes(query);
}

function getFacturedOrderIds() {
    return new Set((window.facturasList || [])
        .map(f => String(getInvoiceOrderIdValue(f)).trim())
        .filter(Boolean));
}

function formatInvoiceListDate(fecha) {
    if (!fecha) return '-';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return String(fecha);
    return date.toLocaleDateString();
}

function getOrderTableTargets() {
    const targets = [
        { type: 'mayor', tbodyId: 'orders-mayor-tbody', badgeId: 'orders-mayor-count-badge' },
        { type: 'detal', tbodyId: 'orders-detal-tbody', badgeId: 'orders-detal-count-badge' }
    ].filter(target => document.getElementById(target.tbodyId));

    if (!targets.length && document.getElementById('orders-tbody')) {
        targets.push({ type: 'all', tbodyId: 'orders-tbody', badgeId: 'orders-count-badge' });
    }

    return targets;
}

function getInvoiceTableTargets() {
    const targets = [
        { type: 'mayor', tbodyId: 'invoices-mayor-tbody', badgeId: 'invoices-mayor-count-badge' },
        { type: 'detal', tbodyId: 'invoices-detal-tbody', badgeId: 'invoices-detal-count-badge' }
    ].filter(target => document.getElementById(target.tbodyId));

    if (!targets.length && document.getElementById('invoices-tbody')) {
        targets.push({ type: 'all', tbodyId: 'invoices-tbody', badgeId: 'invoices-count-badge' });
    }

    return targets;
}

function buildOrderRowHtml(p, idx) {
    const id = getOrderIdValue(p) || '-';
    const fecha = p.Fecha || '-';
    const cliente = p['Nombre Cliente'] || p.Nombre || '-';
    const total = parseFloat(p.Subtotal || p.Total || 0);
    const estado = p['Estado Pedido'] || p.Estado || 'Pendiente';
    const colorEstado = getInvoiceStatusColor(estado);

    return `
        <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td data-label="Pedido" style="font-weight:700;">${escapeHtml(id)}</td>
            <td data-label="Fecha" style="font-size:12px; color:var(--text-muted);">${formatInvoiceListDate(fecha)}</td>
            <td data-label="Cliente" style="font-weight:600;">${escapeHtml(cliente)} <br><span style="font-size:10px; color:var(--primary);">${escapeHtml(p['Teléfono'] || p.Telefono || '')}</span></td>
            <td data-label="Total" style="font-weight:800; color:#fff;">$${total.toLocaleString('es-CO')}</td>
            <td data-label="Estado"><span style="background:rgba(255,255,255,0.1); color:${colorEstado}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${escapeHtml(estado)}</span></td>
            <td data-label="Accion" class="orders-actions-cell">
                <button class="orders-action-btn" onclick="abrirEditorFactura(${idx})" type="button" title="Ajustar factura">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                    Facturar
                </button>
            </td>
        </tr>
    `;
}

function buildInvoiceRowHtml(f, idx) {
    const idFactura = getInvoiceIdValue(f) || '-';
    const idPedido = getInvoiceOrderIdValue(f) || '-';
    const fecha = f.Fecha || '-';
    const cliente = getInvoiceCustomerName(f);
    const total = parseAdminInvoiceMoney(f.Subtotal || f.Total || 0);
    const balanceInfo = getInvoiceBalanceInfo(f, total);
    const estado = f['Estado Factura'] || f.Estado || 'Finalizada';
    const colorEstado = getInvoiceStatusColor(estado);

    return `
        <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td data-label="Factura" style="font-weight:700;">${escapeHtml(idFactura)}</td>
            <td data-label="Pedido" style="font-size:12px; color:var(--text-muted);">${escapeHtml(idPedido)}</td>
            <td data-label="Fecha" style="font-size:12px; color:var(--text-muted);">${formatInvoiceListDate(fecha)}</td>
            <td data-label="Cliente" style="font-weight:600;">${escapeHtml(cliente)} <br><span style="font-size:10px; color:var(--primary);">${escapeHtml(f['ID Cliente'] || '')}</span></td>
            <td data-label="Total" style="font-weight:800; color:#fff;">
                <div>${formatAdminInvoiceMoney(total)}</div>
                <div style="font-size:10px; color:#34d399; font-weight:800;">Abonado: ${formatAdminInvoiceMoney(balanceInfo.paid)}</div>
                <div style="font-size:10px; color:${balanceInfo.balance > 0 ? '#fbbf24' : '#34d399'}; font-weight:800;">Saldo: ${formatAdminInvoiceMoney(balanceInfo.balance)}</div>
            </td>
            <td data-label="Estado">${buildInvoiceStatusSelect(idx, estado)}<div style="margin-top:5px;"><span style="background:rgba(255,255,255,0.1); color:${colorEstado}; padding:4px 8px; border-radius:12px; font-size:10px; font-weight:800;">${escapeHtml(estado)}</span></div></td>
            <td data-label="Accion" class="orders-actions-cell" style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="orders-action-btn invoice-pay" onclick="openQuickInvoicePayment(${idx})" type="button" title="${balanceInfo.balance > 0 ? 'Registrar abono rapido' : 'Factura sin saldo pendiente'}" ${balanceInfo.balance > 0 ? '' : 'disabled'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="2" y="5" width="20" height="14" rx="2"></rect><path d="M2 10h20"></path><path d="M7 15h4"></path><path d="M17 13v4"></path><path d="M15 15h4"></path></svg>
                    Abonar
                </button>
                <button class="orders-action-btn invoice-done" onclick="abrirEditorFactura(${idx}, 'factura')" type="button" title="Ver / Editar factura">
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M9 15h6"></path><path d="M9 11h2"></path></svg>
                    Ver
                </button>
                <button class="orders-action-btn orders-whatsapp-btn" onclick="sendAdminInvoiceRowToWhatsApp(${idx})" type="button" title="Enviar PDF de factura a cliente por WhatsApp">
                    <svg viewBox="0 0 24 24" aria-hidden="true" width="14" height="14" fill="currentColor"><path d="M12.012 2c-5.506 0-9.989 4.478-9.99 9.984 0 1.758.459 3.474 1.33 4.982L2 22l5.176-1.348c1.45.791 3.097 1.207 4.832 1.208h.004c5.505 0 9.987-4.478 9.988-9.985 0-2.667-1.038-5.174-2.924-7.06A9.923 9.923 0 0 0 12.012 2zm5.666 14.155c-.234.66-1.164 1.213-1.61 1.264-.42.047-.962.217-3.237-.723-2.73-1.127-4.48-3.9-4.617-4.084-.136-.184-1.11-1.48-1.11-2.822 0-1.343.702-2.003.953-2.274.252-.27.548-.338.732-.338.183 0 .366.002.525.01.17.007.397-.064.62.47.234.56.797 1.946.866 2.086.069.14.115.303.023.486-.092.183-.138.297-.275.457-.137.16-.289.358-.413.481-.137.137-.28.287-.12.562.16.275.71 1.173 1.526 1.9 1.05.937 1.936 1.228 2.21 1.365.275.137.435.115.596-.068.16-.184.686-.8.869-1.075.183-.275.366-.229.617-.137.251.092 1.597.753 1.871.89.275.137.458.206.526.32.069.115.069.664-.165 1.324z"/></svg>
                    WhatsApp
                </button>
            </td>
        </tr>
    `;
}

function renderPedidos() {
    const tbody = document.getElementById('orders-tbody');
    const facturedOrderIds = getFacturedOrderIds();
    const pendingOrders = (window.pedidosList || [])
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => {
            const id = String(getOrderIdValue(p)).trim();
            if (id && facturedOrderIds.has(id)) return false;
            const estado = p['Estado Pedido'] || p.Estado || '';
            if (String(estado).toLowerCase().includes('factur')) return false;
            return recordMatchesOrdersSearch(p, [
                id,
                p.Fecha,
                p['Nombre Cliente'],
                p.Nombre,
                p['Teléfono'],
                p.Telefono,
                estado
            ]);
        });

    getOrderTableTargets().forEach(target => {
        const tbody = document.getElementById(target.tbodyId);
        const rows = target.type === 'all'
            ? pendingOrders
            : pendingOrders.filter(({ p }) => inferOrderCustomerType(p) === target.type);
        const badge = document.getElementById(target.badgeId);
        if (badge) badge.textContent = rows.length;

        if (!tbody) return;
        tbody.innerHTML = rows.length
            ? rows.map(({ p, idx }) => buildOrderRowHtml(p, idx)).join('')
            : '<tr><td colspan="6" style="text-align:center; padding: 40px;">No hay pedidos pendientes en esta vista.</td></tr>';
    });
    return;

    const badge = document.getElementById('orders-count-badge');
    if (badge) badge.textContent = pendingOrders.length;

    if (pendingOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 40px;">No hay pedidos pendientes en esta vista.</td></tr>';
        return;
    }

    const html = pendingOrders.map(({ p, idx }) => {
        const id = getOrderIdValue(p) || '-';
        const fecha = p.Fecha || '-';
        const cliente = p['Nombre Cliente'] || p.Nombre || '-';
        const total = parseFloat(p.Subtotal || p.Total || 0);
        const estado = p['Estado Pedido'] || p.Estado || 'Pendiente';
        
        const colorEstado = getInvoiceStatusColor(estado);

        return `
            <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="font-weight:700;">${escapeHtml(id)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${formatInvoiceListDate(fecha)}</td>
                <td style="font-weight:600;">${escapeHtml(cliente)} <br><span style="font-size:10px; color:var(--primary);">${escapeHtml(p['Teléfono'] || p.Telefono || '')}</span></td>
                <td style="font-weight:800; color:#fff;">$${total.toLocaleString('es-CO')}</td>
                <td><span style="background:rgba(255,255,255,0.1); color:${colorEstado}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${escapeHtml(estado)}</span></td>
                <td class="orders-actions-cell">
                    <button class="orders-action-btn" onclick="abrirEditorFactura(${idx})" type="button" title="Ajustar factura">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>
                        Facturar
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    tbody.innerHTML = html;
}

function renderFacturas() {
    const tbody = document.getElementById('invoices-tbody');
    if (!getInvoiceTableTargets().length) return;

    const invoices = (window.facturasList || [])
        .map((f, idx) => ({ f, idx }))
        .filter(({ f }) => recordMatchesOrdersSearch(f, [
            getInvoiceIdValue(f),
            getInvoiceOrderIdValue(f),
            f.Fecha,
            getInvoiceCustomerName(f),
            f['ID Cliente'],
            f['Estado Factura'],
            f.Estado,
            f.Subtotal,
            f['Valor Abonado'],
            f['Saldo Pendiente']
        ]));

    getInvoiceTableTargets().forEach(target => {
        const tbody = document.getElementById(target.tbodyId);
        const rows = target.type === 'all'
            ? invoices
            : invoices.filter(({ f }) => inferInvoiceCustomerType(f) === target.type);
        const badge = document.getElementById(target.badgeId);
        if (badge) badge.textContent = rows.length;

        if (!tbody) return;
        tbody.innerHTML = rows.length
            ? rows.map(({ f, idx }) => buildInvoiceRowHtml(f, idx)).join('')
            : '<tr><td colspan="7" style="text-align:center; padding: 40px;">No hay facturas finalizadas en esta vista.</td></tr>';
    });
    return;

    const badge = document.getElementById('invoices-count-badge');
    if (badge) badge.textContent = invoices.length;

    if (invoices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 40px;">No hay facturas finalizadas en esta vista.</td></tr>';
        return;
    }

    tbody.innerHTML = invoices.map(({ f, idx }) => {
        const idFactura = getInvoiceIdValue(f) || '-';
        const idPedido = getInvoiceOrderIdValue(f) || '-';
        const fecha = f.Fecha || '-';
        const cliente = getInvoiceCustomerName(f);
        const total = parseFloat(f.Subtotal || f.Total || 0);
        const estado = f['Estado Factura'] || f.Estado || 'Finalizada';
        const colorEstado = getInvoiceStatusColor(estado);

        return `
            <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="font-weight:700;">${escapeHtml(idFactura)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${escapeHtml(idPedido)}</td>
                <td style="font-size:12px; color:var(--text-muted);">${formatInvoiceListDate(fecha)}</td>
                <td style="font-weight:600;">${escapeHtml(cliente)} <br><span style="font-size:10px; color:var(--primary);">${escapeHtml(f['ID Cliente'] || '')}</span></td>
                <td style="font-weight:800; color:#fff;">$${total.toLocaleString('es-CO')}</td>
                <td><span style="background:rgba(255,255,255,0.1); color:${colorEstado}; padding:4px 8px; border-radius:12px; font-size:11px; font-weight:700;">${escapeHtml(estado)}</span></td>
                <td class="orders-actions-cell">
                    <button class="orders-action-btn invoice-done" onclick="abrirEditorFactura(${idx}, 'factura')" type="button" title="Ver factura">
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="M9 15h6"></path><path d="M9 11h2"></path></svg>
                        Ver factura
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function initOrdersAdminTabs() {
    const container = document.getElementById('view-orders');
    if (!container || container.dataset.ordersTabsReady === 'true') return;
    container.dataset.ordersTabsReady = 'true';

    const tabs = Array.from(container.querySelectorAll('[data-orders-tab-target]'));
    const panels = Array.from(container.querySelectorAll('[data-orders-tab]'));
    const searchInput = document.getElementById('admin-orders-search');

    function activate(tabId) {
        window.activeOrdersAdminTab = tabId;
        tabs.forEach(btn => {
            const active = btn.dataset.ordersTabTarget === tabId;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(panel => {
            const active = panel.dataset.ordersTab === tabId;
            panel.classList.toggle('active', active);
            panel.hidden = !active;
        });
        const ordersShell = container.querySelector('.orders-admin-shell');
        if (ordersShell) ordersShell.scrollLeft = 0;
        container.scrollLeft = 0;
        if (searchInput) {
            searchInput.style.display = tabId === 'quick-sale' ? 'none' : '';
        }
        if (tabId === 'quick-sale') {
            if (!Array.isArray(inventario) || !inventario.length) {
                cargarInventario({ silent: true }).then(renderQuickSaleResults).catch(() => {});
            } else {
                renderQuickSaleResults();
            }
            setTimeout(() => document.getElementById('quick-sale-search')?.focus(), 60);
        }
    }

    window.switchOrdersAdminTab = activate;
    tabs.forEach(btn => btn.addEventListener('click', () => activate(btn.dataset.ordersTabTarget)));
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            renderPedidos();
            renderFacturas();
        });
    }

    activate(window.activeOrdersAdminTab || 'quick-sale');
}

// === CREADOR Y EDITOR DE FACTURAS ===
window.invoiceItems = [];
window.invoiceEditIndex = null; // null si es nueva, o el index de la lista activa
window.invoiceEditSource = 'manual';
window.invoiceOriginalInvoiceId = '';
window.invoiceCustomerType = 'Detal';
window.invoiceSearchResults = [];
window.invoiceInventoryLoadingPromise = null;
window.invoiceInventoryLoadTried = false;
window.invoicePreviousPayment = 0;
window.quickSaleCart = [];
window.quickSaleResults = [];
window.quickSaleGroups = new Map();
window.quickSaleSelectedKey = '';
window.quickSaleCategory = 'all';
window.quickSaleMobilePane = 'client';
window.quickSaleHeldTicket = null;

function readInvoiceField(source, fields, fallback = '') {
    return getProductField(source || {}, fields, fallback);
}

function formatDateForInvoiceInput(value) {
    if (!value) return new Date().toISOString().slice(0, 10);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
}

function getInvoiceProductId(product) {
    return readInvoiceField(product, ['idVariacion', 'ID', 'ID Variacion', 'ID Variación', 'ID Variación', 'SKU'], '') || ('ITEM-' + Date.now());
}

function getInvoiceProductName(product) {
    return readInvoiceField(product, ['Nombre', 'Nombre del Producto', 'Producto'], 'Producto');
}

function getInvoiceProductSku(product) {
    return readInvoiceField(product, ['SKU', 'Referencia', 'ID Variacion', 'ID Variación', 'ID Variación'], '');
}

function getInvoiceProductPrice(product) {
    const wholesale = parseFloat(readInvoiceField(product, ['Precio Mayor', 'Precio Mayorista', 'precioMayorista'], 0));
    if (wholesale > 0) return wholesale;
    return parseFloat(readInvoiceField(product, ['Precio', 'Precio Unitario', 'price'], 0)) || 0;
}

async function ensureInvoiceInventoryLoaded() {
    if (Array.isArray(inventario) && inventario.length > 0) return;
    if (window.invoiceInventoryLoadingPromise) return window.invoiceInventoryLoadingPromise;
    if (window.invoiceInventoryLoadTried) return;
    window.invoiceInventoryLoadTried = true;

    const resultsContainer = document.getElementById('inv-search-results');
    const searchInput = document.getElementById('inv-product-search');
    if (resultsContainer && searchInput && searchInput.value.trim().length >= 2) {
        resultsContainer.innerHTML = '<div class="inv-search-empty">Cargando productos...</div>';
        resultsContainer.classList.add('active');
    }

    window.invoiceInventoryLoadingPromise = cargarInventario({ silent: true }).finally(() => {
        window.invoiceInventoryLoadingPromise = null;
        if (document.getElementById('invoice-editor-modal')?.classList.contains('open')) renderItemsFactura();
    });
    return window.invoiceInventoryLoadingPromise;
}

function getQuickSaleStock(product) {
    return Number(getProductField(product || {}, ['Cantidad', 'Stock', 'Stock Inicial'], 0)) || 0;
}

function getQuickSalePrice(product, customerType) {
    const type = normalizeAdminCustomerType(customerType || document.getElementById('quick-sale-customer-type')?.value || 'Detal');
    const retail = parseAdminInvoiceMoney(getProductField(product || {}, ['Precio'], 0));
    const wholesale = parseAdminInvoiceMoney(getProductField(product || {}, ['Precio Mayor', 'Precio Mayorista', 'Precio_Mayorista'], 0));
    return type === 'mayor' && wholesale > 0 ? wholesale : retail;
}

function getQuickSaleProductMeta(product) {
    const key = getInventoryProductKey(product);
    const name = getInvoiceProductName(product);
    const sku = getInvoiceProductSku(product) || getInvoiceProductId(product);
    const image = getInventoryProductImage(product, 'inventory') || normalizeImageUrl(product?.Imagen || product?.['Imagen Principal'] || '', 'inventory') || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180';
    const category = getProductField(product, PRODUCT_CATEGORY_FIELD_KEYS, '');
    const color = getProductField(product, ['Color', 'color'], '');
    const size = getProductField(product, ['Tamano', 'Tamaño', 'Talla', 'Talla Textil'], '');
    const style = cleanProductStyleValue(getProductField(product, ['Estilo', 'estilo'], ''));
    const description = getProductField(product, ['Caracteristicas del producto', 'Características del producto', 'Descripcion', 'Descripción'], '');
    return { key, name, sku, image, category, color, size, style, description, stock: getQuickSaleStock(product) };
}

function getQuickSaleSearchText(product) {
    return normalizeSearchText([
        getInvoiceProductName(product),
        getInvoiceProductSku(product),
        getInvoiceProductId(product),
        getProductBarcode(product),
        getProductField(product, PRODUCT_CATEGORY_FIELD_KEYS, ''),
        product?.Color,
        product?.Estilo,
        product?.Tamano,
        product?.Descripcion
    ].join(' '));
}

function getQuickSaleGroupKey(product) {
    const motherId = getInventoryMotherId(product);
    const variationId = getInventoryVariationId(product);
    if (motherId && normalizeSearchText(motherId) !== normalizeSearchText(variationId)) {
        return `mother:${motherId}`;
    }
    return `item:${getInventoryProductKey(product)}`;
}

function getQuickSaleVariantLabel(product) {
    const meta = getQuickSaleProductMeta(product);
    const attributes = [meta.color, meta.size, meta.style].filter(Boolean).join(' / ');
    return String(attributes || meta.sku || getInvoiceProductId(product) || 'Variante');
}

function groupQuickSaleProducts(products) {
    const groups = new Map();
    products.forEach(product => {
        const groupKey = getQuickSaleGroupKey(product);
        if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, variants: [] });
        groups.get(groupKey).variants.push(product);
    });

    return Array.from(groups.values()).map(group => {
        group.variants.sort((a, b) => {
            const stockOrder = Number(getQuickSaleStock(b) > 0) - Number(getQuickSaleStock(a) > 0);
            return stockOrder || getQuickSaleVariantLabel(a).localeCompare(getQuickSaleVariantLabel(b), 'es');
        });
        group.product = group.variants.find(product => getInventoryProductKey(product) === window.quickSaleSelectedKey)
            || group.variants[0];
        return group;
    });
}

function findQuickSaleProductByReference(rawCode) {
    const code = normalizeBarcodeValue(rawCode);
    if (!code || !Array.isArray(inventario)) return null;
    return inventario.find(product => {
        if (isBannerInventoryProduct(product)) return false;
        const references = [
            getProductBarcode(product),
            getInvoiceProductSku(product),
            getInvoiceProductId(product),
            getInventoryVariationId(product),
            getInventoryMotherId(product)
        ].map(normalizeBarcodeValue).filter(Boolean);
        return references.includes(code);
    }) || null;
}

async function handleQuickSaleScannedCode(rawCode, addToSale = true) {
    const code = normalizeBarcodeValue(rawCode);
    const input = document.getElementById('quick-sale-search');
    if (!code || !input) return false;

    input.value = code;
    if (!Array.isArray(inventario) || !inventario.length) {
        await cargarInventario({ silent: true });
    }
    renderQuickSaleResults();

    let product = findQuickSaleProductByReference(code);
    if (!product) {
        await cargarInventario({ silent: true });
        product = findQuickSaleProductByReference(code);
        renderQuickSaleResults();
    }
    if (!product) {
        showToast('No se encontro un producto con esa referencia', 'warning');
        input.focus();
        input.select();
        return false;
    }

    const key = getInventoryProductKey(product);
    selectQuickSaleProduct(key);
    if (addToSale && getQuickSaleStock(product) > 0) {
        addQuickSaleProduct(key, 1);
        showToast('Producto escaneado y agregado a la venta', 'success');
    } else if (getQuickSaleStock(product) <= 0) {
        showToast('Producto encontrado, pero esta agotado', 'warning');
    } else {
        showToast('Producto encontrado por referencia', 'success');
    }
    return true;
}

window.handleQuickSaleScannedCode = handleQuickSaleScannedCode;

function openQuickSaleScanner() {
    openBarcodeScanner({
        targetInputId: 'quick-sale-search',
        scannerMode: 'qr',
        onDetected: code => {
            handleQuickSaleScannedCode(code, true).catch(error => {
                console.error('No se pudo procesar el codigo escaneado:', error);
                showToast('No se pudo procesar el codigo escaneado', 'error');
            });
        }
    });
}

window.openQuickSaleScanner = openQuickSaleScanner;

function syncQuickSaleMobilePane(pane = window.quickSaleMobilePane) {
    const catalog = document.querySelector('.quick-sale-catalog-panel');
    const checkout = document.querySelector('.quick-sale-checkout-panel');
    const buttons = document.querySelectorAll('[data-quick-sale-pane]');
    if (!catalog || !checkout) return;

    window.quickSaleMobilePane = ['client', 'catalog', 'checkout'].includes(pane) ? pane : 'client';
    const layout = document.querySelector('.enterprise-pos-layout');
    if (layout) layout.dataset.activePane = window.quickSaleMobilePane;
    const client = document.querySelector('.quick-sale-client-panel');
    const compact = window.matchMedia('(max-width: 1024px)').matches;
    client?.classList.toggle('pos-mobile-hidden', compact && window.quickSaleMobilePane !== 'client');
    catalog.classList.toggle('pos-mobile-hidden', compact && window.quickSaleMobilePane !== 'catalog');
    checkout.classList.toggle('pos-mobile-hidden', compact && window.quickSaleMobilePane !== 'checkout');
    buttons.forEach(button => {
        const active = button.dataset.quickSalePane === window.quickSaleMobilePane;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

window.setQuickSaleMobilePane = function(pane) {
    syncQuickSaleMobilePane(pane);
    document.querySelector('.quick-sale-mobile-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function renderQuickSaleCategories() {
    const container = document.getElementById('quick-sale-categories');
    if (!container) return;
    const categories = Array.from(new Set((inventario || [])
        .filter(product => !isBannerInventoryProduct(product))
        .map(product => String(getProductField(product, PRODUCT_CATEGORY_FIELD_KEYS, '') || '').trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'es'));
    const activeCategory = window.quickSaleCategory || 'all';
    const buttons = [{ value: 'all', label: 'Todos' }, ...categories.map(category => ({ value: category, label: category }))];
    container.innerHTML = buttons.map(item => `
        <button class="quick-sale-category-btn${item.value === activeCategory ? ' active' : ''}" type="button" data-quick-sale-category="${escapeHtml(item.value)}">
            ${escapeHtml(item.label)}
        </button>
    `).join('');
}

window.setQuickSaleCategory = function(category) {
    window.quickSaleCategory = String(category || 'all');
    renderQuickSaleCategories();
    renderQuickSaleResults();
};

function renderQuickSaleResults() {
    const container = document.getElementById('quick-sale-results');
    const input = document.getElementById('quick-sale-search');
    if (!container || !input) return;

    if (!Array.isArray(inventario) || !inventario.length) {
        container.innerHTML = '<div class="quick-sale-empty">Cargando inventario...</div>';
        cargarInventario({ silent: true }).then(renderQuickSaleResults).catch(() => {});
        return;
    }

    renderQuickSaleCategories();
    const q = normalizeSearchText(input.value || '');
    const terms = q.split(/\s+/).filter(Boolean);
    const activeCategory = window.quickSaleCategory === 'all' ? '' : normalizeSearchText(window.quickSaleCategory);
    const matchingProducts = inventario
        .filter(product => !isBannerInventoryProduct(product))
        .filter(product => !activeCategory || normalizeSearchText(getProductField(product, PRODUCT_CATEGORY_FIELD_KEYS, '')) === activeCategory)
        .map(product => {
            const text = getQuickSaleSearchText(product);
            const matches = terms.every(term => text.includes(term));
            if (!matches) return null;
            let score = 0;
            terms.forEach(term => {
                if (normalizeSearchText(getInvoiceProductName(product)).startsWith(term)) score += 50;
                if (normalizeSearchText(getInvoiceProductSku(product)).includes(term)) score += 30;
                if (normalizeSearchText(getProductBarcode(product)).includes(term)) score += 35;
            });
            if (getQuickSaleStock(product) > 0) score += 5;
            return { product, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || getInvoiceProductName(a.product).localeCompare(getInvoiceProductName(b.product), 'es'))
        .map(entry => entry.product);
    const groups = groupQuickSaleProducts(matchingProducts).slice(0, 24);
    const toggle = document.getElementById('quick-sale-catalog-toggle');
    if (toggle) toggle.hidden = groups.length <= 2;
    const results = groups.map(group => group.product);

    window.quickSaleResults = results;
    window.quickSaleGroups = new Map(groups.map(group => [group.key, group]));

    if (!results.length) {
        const detail = q ? ` para "${escapeHtml(input.value)}"` : ' en esta categoria';
        container.innerHTML = `<div class="quick-sale-empty">Sin productos${detail}.</div>`;
        return;
    }

    container.innerHTML = groups.map(group => {
        const product = group.product;
        const meta = getQuickSaleProductMeta(product);
        const price = getQuickSalePrice(product);
        const stockClass = meta.stock <= 0 ? 'out' : (meta.stock <= 3 ? 'low' : '');
        const active = meta.key === window.quickSaleSelectedKey ? ' active' : '';
        const hasVariants = group.variants.length > 1;
        const variantControl = hasVariants ? `
            <label class="quick-sale-variant-field">
                <span>Elegir variante · ${group.variants.length} opciones</span>
                <select class="quick-sale-variant-select" data-quick-sale-group="${escapeHtml(group.key)}" aria-label="Elegir color o variante de ${escapeHtml(meta.name)}">
                    ${group.variants.map(variant => {
                        const variantMeta = getQuickSaleProductMeta(variant);
                        const variantPrice = getQuickSalePrice(variant);
                        const selected = variantMeta.key === meta.key ? ' selected' : '';
                        const availability = variantMeta.stock > 0 ? `${variantMeta.stock} und.` : 'Agotado';
                        return `<option value="${escapeHtml(variantMeta.key)}"${selected}>${escapeHtml(getQuickSaleVariantLabel(variant))} · ${availability} · ${formatAdminInvoiceMoney(variantPrice)}</option>`;
                    }).join('')}
                </select>
            </label>
        ` : `<small class="quick-sale-variant-current">${escapeHtml(getQuickSaleVariantLabel(product))}</small>`;
        return `
            <article class="quick-sale-product-tile${hasVariants ? ' has-variants' : ''}${active}" data-quick-sale-group="${escapeHtml(group.key)}" data-quick-sale-key="${escapeHtml(meta.key)}" tabindex="0">
                <div class="quick-sale-tile-image">
                    <img src="${escapeHtml(meta.image)}" alt="${escapeHtml(meta.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.src='https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180'">
                    <span class="quick-sale-stock-pill ${stockClass}">${meta.stock > 0 ? meta.stock + ' und.' : 'Agotado'}</span>
                </div>
                <div class="quick-sale-tile-copy">
                    <strong>${escapeHtml(meta.name)}</strong>
                    <span class="quick-sale-tile-meta">${escapeHtml(meta.category || 'Sin categoria')} · ${escapeHtml(meta.sku || 'S/N')}</span>
                    ${variantControl}
                </div>
                <div class="quick-sale-tile-bottom">
                    <b class="quick-sale-tile-price">${formatAdminInvoiceMoney(price)}</b>
                    <button class="quick-sale-info-card" type="button" data-quick-sale-info-group="${escapeHtml(group.key)}" aria-label="Información de ${escapeHtml(meta.name)}" title="Información del producto">ⓘ</button>
                    <button class="quick-sale-add-card" type="button" data-quick-sale-add-group="${escapeHtml(group.key)}" ${meta.stock <= 0 ? 'disabled' : ''} aria-label="Añadir ${escapeHtml(meta.name)}">+</button>
                </div>
            </article>
        `;
    }).join('');
}

function refreshQuickSaleTileForVariant(tile, product) {
    if (!tile || !product) return;
    const meta = getQuickSaleProductMeta(product);
    const image = tile.querySelector('.quick-sale-tile-image img');
    const stock = tile.querySelector('.quick-sale-stock-pill');
    const metaLine = tile.querySelector('.quick-sale-tile-meta');
    const variantLine = tile.querySelector('.quick-sale-variant-current');
    const price = tile.querySelector('.quick-sale-tile-price');
    const addButton = tile.querySelector('[data-quick-sale-add-group]');

    tile.dataset.quickSaleKey = meta.key;
    if (image) {
        image.src = meta.image;
        image.alt = meta.name;
    }
    if (stock) {
        stock.classList.remove('out', 'low');
        if (meta.stock <= 0) stock.classList.add('out');
        else if (meta.stock <= 3) stock.classList.add('low');
        stock.textContent = meta.stock > 0 ? `${meta.stock} und.` : 'Agotado';
    }
    if (metaLine) metaLine.textContent = `${meta.category || 'Sin categoria'} · ${meta.sku || 'S/N'}`;
    if (variantLine) variantLine.textContent = getQuickSaleVariantLabel(product);
    if (price) price.textContent = formatAdminInvoiceMoney(getQuickSalePrice(product));
    if (addButton) addButton.disabled = meta.stock <= 0;
}

function getQuickSaleGroupVariant(groupKey) {
    const group = window.quickSaleGroups.get(String(groupKey || ''));
    if (!group) return null;
    const tile = Array.from(document.querySelectorAll('.quick-sale-product-tile'))
        .find(item => item.dataset.quickSaleGroup === String(groupKey || ''));
    const selectedKey = tile?.querySelector('.quick-sale-variant-select')?.value
        || tile?.dataset.quickSaleKey
        || getInventoryProductKey(group.product);
    return getInventoryProductByKey(selectedKey) || group.product;
}

window.previewQuickSaleGroupVariant = function(groupKey, variantKey = '') {
    const tile = Array.from(document.querySelectorAll('.quick-sale-product-tile'))
        .find(item => item.dataset.quickSaleGroup === String(groupKey || ''));
    const group = window.quickSaleGroups.get(String(groupKey || ''));
    if (!tile || !group) return;

    const select = tile.querySelector('.quick-sale-variant-select');
    const key = String(variantKey || select?.value || tile.dataset.quickSaleKey || '');
    const product = group.variants.find(variant => getInventoryProductKey(variant) === key) || group.product;
    if (select) select.value = getInventoryProductKey(product);
    refreshQuickSaleTileForVariant(tile, product);
    selectQuickSaleProduct(getInventoryProductKey(product));
};

window.addQuickSaleGroupVariant = function(groupKey) {
    const product = getQuickSaleGroupVariant(groupKey);
    if (!product) return showToast('No se encontro la variante seleccionada', 'error');
    const key = getInventoryProductKey(product);
    selectQuickSaleProduct(key);
    addQuickSaleProduct(key, 1);
};

function renderQuickSaleDetail(product) {
    const detail = document.getElementById('quick-sale-product-detail');
    if (!detail) return;

    if (!product) {
        detail.innerHTML = '<div class="quick-sale-empty">Selecciona un producto para ver imagen, stock y características.</div>';
        return;
    }

    const meta = getQuickSaleProductMeta(product);
    const price = getQuickSalePrice(product);
    const stockClass = meta.stock <= 0 ? 'out' : (meta.stock <= 3 ? 'low' : '');
    detail.innerHTML = `
        <div class="quick-sale-product-card">
            <div class="quick-sale-detail-top">
                <div class="quick-sale-detail-image"><img src="${escapeHtml(meta.image)}" alt="${escapeHtml(meta.name)}" decoding="async" referrerpolicy="no-referrer" onerror="this.src='https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180'"></div>
                <div>
                <span class="quick-sale-stock-pill ${stockClass}">${meta.stock > 0 ? meta.stock + ' unidades disponibles' : 'Agotado'}</span>
                <h3 class="quick-sale-detail-title">${escapeHtml(meta.name)}</h3>
                <div class="quick-sale-detail-price">${formatAdminInvoiceMoney(price)}</div>
                </div>
            </div>
            <div class="quick-sale-detail-specs">
                <div><span>SKU / ID</span><strong>${escapeHtml(meta.sku || 'S/N')}</strong></div>
                <div><span>Categoria</span><strong>${escapeHtml(meta.category || '-')}</strong></div>
                <div><span>Color</span><strong>${escapeHtml(meta.color || '-')}</strong></div>
                <div><span>Talla / medida</span><strong>${escapeHtml(meta.size || '-')}</strong></div>
                <div><span>Estilo</span><strong>${escapeHtml(meta.style || '-')}</strong></div>
            </div>
            ${meta.description ? `<div class="quick-sale-empty" style="text-align:left;">${escapeHtml(meta.description)}</div>` : ''}
            <div class="quick-sale-add-row">
                <input class="form-control" id="quick-sale-add-qty" type="number" min="1" max="${Math.max(1, meta.stock)}" value="1" ${meta.stock <= 0 ? 'disabled' : ''}>
                <input class="form-control" id="quick-sale-add-price" type="number" min="0" value="${price}" ${meta.stock <= 0 ? 'disabled' : ''}>
                <button class="admin-btn" type="button" onclick="addQuickSaleProduct('${escapeHtml(meta.key)}')" ${meta.stock <= 0 ? 'disabled' : ''}>Añadir a caja</button>
            </div>
        </div>
    `;
}

window.selectQuickSaleProduct = function(key) {
    window.quickSaleSelectedKey = String(key || '');
    const product = getInventoryProductByKey(window.quickSaleSelectedKey);
    document.querySelectorAll('.quick-sale-product-tile').forEach(tile => {
        const select = tile.querySelector('.quick-sale-variant-select');
        const containsKey = select
            ? Array.from(select.options).some(option => option.value === window.quickSaleSelectedKey)
            : tile.dataset.quickSaleKey === window.quickSaleSelectedKey;
        if (containsKey && product) {
            if (select) select.value = window.quickSaleSelectedKey;
            refreshQuickSaleTileForVariant(tile, product);
        }
        tile.classList.toggle('active', containsKey);
    });
    renderQuickSaleDetail(product);
};

window.addQuickSaleProduct = function(key, qtyOverride = null, priceOverride = null) {
    const product = getInventoryProductByKey(key);
    if (!product) return showToast('No se encontro el producto seleccionado', 'error');

    const meta = getQuickSaleProductMeta(product);
    const qtyInput = document.getElementById('quick-sale-add-qty');
    const priceInput = document.getElementById('quick-sale-add-price');
    const detailMatches = window.quickSaleSelectedKey === String(key || '');
    const qtySource = qtyOverride !== null ? qtyOverride : (detailMatches ? qtyInput?.value : 1);
    const priceSource = priceOverride !== null ? priceOverride : (detailMatches ? priceInput?.value : getQuickSalePrice(product));
    const qty = Math.max(1, parseInt(qtySource || 1, 10));
    const price = Math.max(0, parseAdminInvoiceMoney(priceSource || getQuickSalePrice(product)));

    if (meta.stock <= 0) return showToast('Este producto esta agotado', 'warning');
    const existing = window.quickSaleCart.find(item => item.key === meta.key);
    const currentQty = existing ? Number(existing.cantidad || 0) : 0;
    if (currentQty + qty > meta.stock) {
        return showToast(`Stock insuficiente. Disponible: ${meta.stock}`, 'warning');
    }

    if (existing) {
        existing.cantidad += qty;
        existing.precio = price;
    } else {
        window.quickSaleCart.push({
            key: meta.key,
            idVariacion: getInvoiceProductId(product),
            nombre: meta.name,
            sku: meta.sku,
            cantidad: qty,
            precio: price,
            stock: meta.stock,
            image: meta.image
        });
    }

    renderQuickSaleCart();
    document.querySelectorAll('.quick-sale-product-tile').forEach(tile => {
        if (tile.dataset.quickSaleKey !== meta.key) return;
        const button = tile.querySelector('.quick-sale-add-card');
        if (!button) return;
        clearTimeout(button.quickSaleFeedbackTimer);
        button.classList.add('is-added');
        button.textContent = '✓';
        button.setAttribute('aria-label', 'Producto añadido');
        button.quickSaleFeedbackTimer = setTimeout(() => {
            button.classList.remove('is-added');
            button.textContent = '+';
            button.setAttribute('aria-label', 'Añadir ' + meta.name);
        }, 850);
    });
    const status = document.getElementById('quick-sale-add-status');
    if (status) {
        clearTimeout(status.quickSaleFeedbackTimer);
        status.textContent = 'Producto añadido';
        status.quickSaleFeedbackTimer = setTimeout(() => { status.textContent = ''; }, 1100);
    }
};

window.updateQuickSaleQty = function(key, value) {
    const item = window.quickSaleCart.find(row => row.key === key);
    if (!item) return;
    const requested = Math.max(1, parseInt(value || 1, 10));
    item.cantidad = Math.min(requested, Math.max(1, Number(item.stock || requested)));
    renderQuickSaleCart();
};

window.changeQuickSaleQty = function(key, change) {
    const item = window.quickSaleCart.find(row => row.key === key);
    if (!item) return;
    const next = (Number(item.cantidad) || 1) + Number(change || 0);
    if (next <= 0) {
        removeQuickSaleItem(key);
        return;
    }
    updateQuickSaleQty(key, next);
};

window.removeQuickSaleItem = function(key) {
    window.quickSaleCart = window.quickSaleCart.filter(item => item.key !== key);
    renderQuickSaleCart();
};

window.clearQuickSaleCart = function() {
    window.quickSaleCart = [];
    renderQuickSaleCart();
};

window.holdQuickSaleTicket = function() {
    const button = document.getElementById('quick-sale-hold-btn');
    if (window.quickSaleHeldTicket) {
        const held = window.quickSaleHeldTicket;
        window.quickSaleCart = held.items || [];
        ['quick-sale-customer', 'quick-sale-phone', 'quick-sale-address', 'quick-sale-advisor', 'quick-sale-note', 'quick-sale-cash-received'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = held.fields?.[id] || '';
        });
        const method = document.getElementById('quick-sale-method');
        if (method && held.fields?.method) method.value = held.fields.method;
        window.quickSaleHeldTicket = null;
        try { localStorage.removeItem('blyxu_quick_sale_held_ticket'); } catch (error) { console.warn(error); }
        if (button) button.textContent = 'Pausar';
        renderQuickSaleCart();
        showToast('Ticket reanudado', 'success');
        return;
    }

    if (!window.quickSaleCart.length) {
        showToast('Agrega productos antes de pausar el ticket', 'warning');
        return;
    }

    const fields = {};
    ['quick-sale-customer', 'quick-sale-phone', 'quick-sale-address', 'quick-sale-advisor', 'quick-sale-note', 'quick-sale-cash-received'].forEach(id => {
        fields[id] = document.getElementById(id)?.value || '';
    });
    fields.method = document.getElementById('quick-sale-method')?.value || 'Efectivo / Caja';
    window.quickSaleHeldTicket = { items: window.quickSaleCart, fields };
    try { localStorage.setItem('blyxu_quick_sale_held_ticket', JSON.stringify(window.quickSaleHeldTicket)); } catch (error) { console.warn(error); }
    window.quickSaleCart = [];
    if (button) button.textContent = 'Reanudar';
    renderQuickSaleCart();
    showToast('Ticket pausado para continuar después', 'success');
};

function getQuickSaleTotals() {
    return (window.quickSaleCart || []).reduce((acc, item) => {
        const qty = Number(item.cantidad) || 1;
        const price = Number(item.precio) || 0;
        acc.count += qty;
        acc.total += qty * price;
        return acc;
    }, { count: 0, total: 0 });
}

function updateQuickSaleCashChange() {
    const method = document.getElementById('quick-sale-method')?.value || '';
    const cashRow = document.getElementById('quick-sale-cash-row');
    const cashInput = document.getElementById('quick-sale-cash-received');
    const changeEl = document.getElementById('quick-sale-change');
    const usesCash = /Efectivo|Mixto/i.test(method);
    cashRow?.classList.toggle('is-hidden', !usesCash);
    if (!usesCash && cashInput) cashInput.value = '';
    const received = Number(cashInput?.value || 0);
    const change = Math.max(0, received - getQuickSaleTotals().total);
    if (changeEl) changeEl.textContent = formatAdminInvoiceMoney(change);
}

window.updateQuickSaleCashChange = updateQuickSaleCashChange;

function syncQuickSalePaymentMethods() {
    const method = document.getElementById('quick-sale-method')?.value || 'Efectivo / Caja';
    document.querySelectorAll('[data-quick-sale-method]').forEach(button => {
        button.classList.toggle('active', button.dataset.quickSaleMethod === method);
    });
}

window.selectQuickSalePaymentMethod = function(method) {
    const select = document.getElementById('quick-sale-method');
    if (!select || !method) return;
    select.value = method;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    syncQuickSalePaymentMethods();
};

function renderQuickSaleCart() {
    const cartEl = document.getElementById('quick-sale-cart');
    const totals = getQuickSaleTotals();

    ['quick-sale-count', 'quick-sale-summary-count'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(totals.count);
    });
    const ticketCount = document.getElementById('quick-sale-ticket-count');
    if (ticketCount) ticketCount.textContent = `${totals.count} ${totals.count === 1 ? 'ítem' : 'ítems'}`;
    const mobileCount = document.getElementById('quick-sale-mobile-count');
    if (mobileCount) mobileCount.textContent = String(totals.count);
    ['quick-sale-total', 'quick-sale-summary-total', 'quick-sale-subtotal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatAdminInvoiceMoney(totals.total);
    });
    const discount = document.getElementById('quick-sale-discount');
    const tax = document.getElementById('quick-sale-tax');
    if (discount) discount.textContent = '-$0';
    if (tax) tax.textContent = '$0';

    const saveButton = document.getElementById('quick-sale-save-btn');
    if (saveButton) saveButton.disabled = !window.quickSaleCart.length;
    updateQuickSaleCashChange();
    syncQuickSalePaymentMethods();

    if (!cartEl) return;
    if (!window.quickSaleCart.length) {
        cartEl.innerHTML = '<div class="quick-sale-empty">Escanea un producto o toca + para iniciar la venta.</div>';
        return;
    }

    cartEl.innerHTML = window.quickSaleCart.map(item => {
        const subtotal = (Number(item.precio) || 0) * (Number(item.cantidad) || 1);
        return `
            <div class="quick-sale-cart-item">
                <button type="button" class="quick-sale-cart-thumb" onclick="openQuickSaleImage(this)" aria-label="Ampliar imagen de ${escapeHtml(item.nombre)}"><img src="${escapeHtml(item.image || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180')}" alt="${escapeHtml(item.nombre)}" onerror="this.src='https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180'"></button>
                <div class="quick-sale-cart-copy">
                    <strong>${escapeHtml(item.nombre)}</strong>
                    <span>${escapeHtml(item.sku || item.idVariacion || 'S/N')} · ${formatAdminInvoiceMoney(item.precio)} · Subtotal ${formatAdminInvoiceMoney(subtotal)}</span>
                </div>
                <div class="quick-sale-qty-control">
                    <button type="button" onclick="changeQuickSaleQty('${escapeHtml(item.key)}', -1)" aria-label="Restar una unidad">−</button>
                    <input type="number" min="1" max="${Math.max(1, Number(item.stock || 1))}" value="${Number(item.cantidad) || 1}" onchange="updateQuickSaleQty('${escapeHtml(item.key)}', this.value)" aria-label="Cantidad de ${escapeHtml(item.nombre)}">
                    <button type="button" onclick="changeQuickSaleQty('${escapeHtml(item.key)}', 1)" aria-label="Sumar una unidad">+</button>
                </div>
                <button class="quick-sale-cart-remove" type="button" onclick="removeQuickSaleItem('${escapeHtml(item.key)}')" title="Quitar">x</button>
            </div>
        `;
    }).join('');
}

function applyQuickSaleLocalStockDiscount() {
    (window.quickSaleCart || []).forEach(item => {
        const product = getInventoryProductByKey(item.key);
        if (!product) return;
        const current = getQuickSaleStock(product);
        const next = Math.max(0, current - (Number(item.cantidad) || 1));
        product.Cantidad = next;
        product.Stock = next;
    });
    writeInventoryCache(inventario);
    clearPublicProductsCache();
}

function hydrateInvoiceEditorFromQuickSale(invoiceIdOverride = '') {
    const totals = getQuickSaleTotals();
    window.invoiceItems = (window.quickSaleCart || []).map(item => ({
        idVariacion: item.idVariacion,
        nombre: item.nombre,
        sku: item.sku || item.idVariacion,
        img: item.img || item.imagen || '',
        opcion: item.opcion || item.variantLabel || '',
        cantidad: Number(item.cantidad) || 1,
        precio: Number(item.precio) || 0
    }));
    window.invoiceEditIndex = null;
    window.invoiceEditSource = 'manual';
    window.invoiceOriginalInvoiceId = '';
    window.invoiceCustomerType = document.getElementById('quick-sale-customer-type')?.value || 'Detal';
    window.invoicePreviousPayment = 0;

    document.getElementById('inv-original-id').value = 'VENTA-CAJA';
    document.getElementById('inv-edit-id').value = invoiceIdOverride || `CAJA-${Date.now()}`;
    document.getElementById('inv-edit-nombre').value = document.getElementById('quick-sale-customer')?.value.trim() || 'Cliente mostrador';
    document.getElementById('inv-edit-tel').value = document.getElementById('quick-sale-phone')?.value.trim() || '';
    document.getElementById('inv-edit-dir').value = document.getElementById('quick-sale-address')?.value.trim() || 'Venta por caja';
    document.getElementById('inv-edit-ciudad').value = 'Mostrador';
    document.getElementById('inv-edit-fecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('inv-edit-estado').value = 'Pago';
    document.getElementById('inv-edit-metodo').value = document.getElementById('quick-sale-method')?.value || 'Efectivo / Caja';
    const advisor = document.getElementById('quick-sale-advisor')?.value.trim();
    const note = document.getElementById('quick-sale-note')?.value.trim();
    document.getElementById('inv-edit-nota').value = [advisor ? `Asesor: ${advisor}` : '', note || 'Venta realizada por caja / mostrador.'].filter(Boolean).join(' · ');
    document.getElementById('inv-edit-abono').value = String(totals.total);
    setInvoiceCustomerTypeControl(window.invoiceCustomerType, 'Detal');
    renderItemsFactura();
}

window.openQuickSaleInvoicePreview = function() {
    if (!window.quickSaleCart.length) {
        showToast('Agrega al menos un producto a la caja', 'warning');
        return;
    }
    if (typeof window.abrirEditorFactura === 'function') {
        window.abrirEditorFactura(null);
    }
    hydrateInvoiceEditorFromQuickSale();
    document.getElementById('inv-editor-title').textContent = 'Factura de venta por caja';
    document.getElementById('invoice-editor-modal').classList.add('open');
};

window.saveQuickSaleInvoice = async function() {
    if (!window.quickSaleCart.length) {
        showToast('Agrega al menos un producto a la caja', 'warning');
        return;
    }

    const totals = getQuickSaleTotals();
    const idFactura = `CAJA-${Date.now()}`;
    const customer = document.getElementById('quick-sale-customer')?.value.trim() || 'Cliente mostrador';
    const phone = document.getElementById('quick-sale-phone')?.value.trim() || '';
    const address = document.getElementById('quick-sale-address')?.value.trim() || '';
    const advisor = document.getElementById('quick-sale-advisor')?.value.trim() || '';
    const method = document.getElementById('quick-sale-method')?.value || 'Efectivo / Caja';
    const tipoCliente = getInvoiceCustomerTypeLabel(document.getElementById('quick-sale-customer-type')?.value, 'Detal');
    const note = document.getElementById('quick-sale-note')?.value.trim();
    const cashReceived = Number(document.getElementById('quick-sale-cash-received')?.value || 0);
    const change = Math.max(0, cashReceived - totals.total);
    if (/^Efectivo/i.test(method) && cashReceived < totals.total) {
        showToast('El efectivo recibido es menor al total de la venta', 'warning');
        document.getElementById('quick-sale-cash-received')?.focus();
        return;
    }
    const items = window.quickSaleCart.map(item => ({
        idVariacion: item.idVariacion,
        id: item.idVariacion,
        nombre: item.nombre,
        sku: item.sku || item.idVariacion,
        cantidad: Number(item.cantidad) || 1,
        precio: Number(item.precio) || 0,
        canal: 'Caja'
    }));

    const payload = {
        resource: 'facturas',
        action: 'crear',
        'ID Factura': idFactura,
        'ID Pedido': 'VENTA-CAJA',
        'ID Cliente': phone,
        'Tipo Cliente': tipoCliente,
        Fecha: new Date().toISOString().slice(0, 10),
        Nombre: customer,
        'Productos JSON': JSON.stringify(items),
        'Cantidad Total': totals.count,
        Subtotal: totals.total,
        'Valor Abonado': totals.total,
        'Saldo Pendiente': 0,
        'Ultimo Abono': totals.total,
        'Estado Factura': 'Pago',
        pago: method,
        entrega: address || 'Venta por caja / mostrador',
        'Canal Venta': 'Caja',
        Asesor: advisor,
        'Efectivo Recibido': cashReceived,
        Cambio: change,
        Observaciones: note || 'Venta realizada por caja / mostrador.'
    };

    const btn = document.getElementById('quick-sale-save-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Registrando...';
    }

    try {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result || result.status !== 'success') {
            throw new Error(result?.error || result?.message || 'No se pudo registrar la venta');
        }

        window.facturasList = [payload, ...(window.facturasList || [])];
        applyQuickSaleLocalStockDiscount();
        renderFacturas();
        renderQuickSaleResults();
        renderQuickSaleDetail(getInventoryProductByKey(window.quickSaleSelectedKey));
        renderAdminDashboard();
        hydrateInvoiceEditorFromQuickSale(idFactura);
        document.getElementById('inv-editor-title').textContent = 'Factura de venta por caja';
        if (typeof window.imprimirFacturaEditor === 'function') {
            window.imprimirFacturaEditor();
        }
        if (typeof window.switchOrdersAdminTab === 'function') {
            window.switchOrdersAdminTab('invoices-mayor');
        }
        clearQuickSaleCart();
        document.getElementById('quick-sale-customer').value = '';
        document.getElementById('quick-sale-phone').value = '';
        document.getElementById('quick-sale-address').value = '';
        document.getElementById('quick-sale-note').value = '';
        document.getElementById('quick-sale-cash-received').value = '';
        updateQuickSaleCashChange();
        showToast('Venta por caja registrada como factura', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error registrando venta: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = !window.quickSaleCart.length;
            btn.textContent = 'Cobrar y generar PDF';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const quickSearch = document.getElementById('quick-sale-search');
    const quickResults = document.getElementById('quick-sale-results');
    const quickScanButton = document.getElementById('btn-scan-quick-sale');
    const customerType = document.getElementById('quick-sale-customer-type');
    const categoryStrip = document.getElementById('quick-sale-categories');
    const clearClientButton = document.getElementById('quick-sale-clear-client');
    const paymentMethod = document.getElementById('quick-sale-method');
    const cashReceived = document.getElementById('quick-sale-cash-received');
    const mobilePaneTabs = document.querySelector('.quick-sale-mobile-tabs');
    const mobileViewSelect = document.getElementById('admin-mobile-view-select');

    quickSearch?.addEventListener('input', renderQuickSaleResults);
    quickSearch?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        handleQuickSaleScannedCode(quickSearch.value, true).catch(error => {
            console.error('No se pudo buscar la referencia ingresada:', error);
        });
    });
    quickSearch?.addEventListener('focus', () => {
        if (!Array.isArray(inventario) || !inventario.length) cargarInventario({ silent: true }).then(renderQuickSaleResults).catch(() => {});
    });
    quickScanButton?.addEventListener('click', openQuickSaleScanner);
    categoryStrip?.addEventListener('click', event => {
        const button = event.target.closest('[data-quick-sale-category]');
        if (button) setQuickSaleCategory(button.dataset.quickSaleCategory);
    });
    clearClientButton?.addEventListener('click', () => {
        ['quick-sale-customer', 'quick-sale-phone', 'quick-sale-address', 'quick-sale-advisor'].forEach(id => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });
    });
    paymentMethod?.addEventListener('change', updateQuickSaleCashChange);
    document.querySelectorAll('[data-quick-sale-method]').forEach(button => {
        button.addEventListener('click', () => selectQuickSalePaymentMethod(button.dataset.quickSaleMethod));
    });
    cashReceived?.addEventListener('input', updateQuickSaleCashChange);
    mobilePaneTabs?.addEventListener('click', event => {
        const button = event.target.closest('[data-quick-sale-pane]');
        if (button) setQuickSaleMobilePane(button.dataset.quickSalePane);
    });
    window.addEventListener('resize', () => syncQuickSaleMobilePane());
    quickResults?.addEventListener('click', event => {
        const infoBtn = event.target.closest('[data-quick-sale-info-group]');
        if (infoBtn) {
            event.stopPropagation();
            openQuickSaleProductInfo(infoBtn.dataset.quickSaleInfoGroup);
            return;
        }
        const addBtn = event.target.closest('[data-quick-sale-add-group]');
        if (addBtn) {
            event.stopPropagation();
            addQuickSaleGroupVariant(addBtn.dataset.quickSaleAddGroup);
            return;
        }
        if (event.target.closest('select, option, button, input')) return;
        const item = event.target.closest('[data-quick-sale-key]');
        if (!item) return;
        selectQuickSaleProduct(item.dataset.quickSaleKey);
    });
    quickResults?.addEventListener('change', event => {
        const select = event.target.closest('.quick-sale-variant-select');
        if (!select) return;
        previewQuickSaleGroupVariant(select.dataset.quickSaleGroup, select.value);
    });
    quickResults?.addEventListener('keydown', event => {
        if (event.key !== 'Enter') return;
        if (event.target.closest('select, button, input')) return;
        const item = event.target.closest('[data-quick-sale-key]');
        if (!item) return;
        selectQuickSaleProduct(item.dataset.quickSaleKey);
    });
    customerType?.addEventListener('change', () => {
        renderQuickSaleResults();
        renderQuickSaleDetail(getInventoryProductByKey(window.quickSaleSelectedKey));
    });
    mobileViewSelect?.addEventListener('change', event => {
        const value = event.target.value;
        if (value === 'logout') {
            revokeAdminSession();
            sessionStorage.removeItem(ADMIN_ORDERS_CACHE_KEY);
            window.location.href = 'index.html';
            return;
        }
        const label = event.target.options[event.target.selectedIndex]?.textContent || 'Panel';
        switchDashboardView(value, label);
    });
    const updateQuickSaleClock = () => {
        const clock = document.getElementById('quick-sale-clock');
        if (clock) clock.textContent = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
    };
    updateQuickSaleClock();
    setInterval(updateQuickSaleClock, 30000);
    syncQuickSaleMobilePane();
    renderQuickSaleCart();
    syncQuickSalePaymentMethods();
    try {
        const held = JSON.parse(localStorage.getItem('blyxu_quick_sale_held_ticket') || 'null');
        if (held?.items?.length) {
            window.quickSaleHeldTicket = held;
            const holdButton = document.getElementById('quick-sale-hold-btn');
            if (holdButton) holdButton.textContent = 'Reanudar';
        }
    } catch (error) {
        console.warn('No se pudo recuperar el ticket pausado:', error);
    }
});

window.abrirEditorFactura = function(idx = null, source = 'pedido') {
    window.invoiceItems = [];
    window.invoiceEditIndex = idx;
    window.invoiceEditSource = idx === null ? 'manual' : source;
    window.invoiceOriginalInvoiceId = '';
    window.invoiceCustomerType = 'Detal';
    window.invoicePreviousPayment = 0;
    
    document.getElementById('inv-original-id').value = '';
    document.getElementById('inv-edit-nombre').value = '';
    document.getElementById('inv-edit-tel').value = '';
    document.getElementById('inv-edit-dir').value = '';
    document.getElementById('inv-edit-ciudad').value = '';
    document.getElementById('inv-edit-fecha').value = new Date().toISOString().slice(0, 10);
    document.getElementById('inv-edit-estado').value = 'Pendiente';
    document.getElementById('inv-edit-metodo').value = 'Mostrador / Manual';
    document.getElementById('inv-edit-nota').value = '';
    setInvoiceCustomerTypeControl('Detal');
    document.getElementById('inv-product-search').value = '';
    document.getElementById('inv-search-results').classList.remove('active');
    document.getElementById('inv-custom-name').value = '';
    document.getElementById('inv-custom-sku').value = '';
    document.getElementById('inv-custom-price').value = '';
    if (document.getElementById('inv-edit-abono')) {
        document.getElementById('inv-edit-abono').value = '';
    }
    
    if (idx !== null) {
        const editingInvoice = source === 'factura';
        const p = editingInvoice ? window.facturasList[idx] : window.pedidosList[idx];
        if (!p) {
            showToast('No se encontro el registro seleccionado', 'error');
            return;
        }

        const orderId = editingInvoice ? getInvoiceOrderIdValue(p) : getOrderIdValue(p);
        const invoiceId = editingInvoice ? getInvoiceIdValue(p) : '';
        const linkedExistingInvoice = (!editingInvoice && orderId)
            ? (window.facturasList || []).find(f => String(getInvoiceOrderIdValue(f)).trim() === String(orderId).trim())
            : null;
        const linkedExistingInvoiceId = linkedExistingInvoice ? getInvoiceIdValue(linkedExistingInvoice) : '';
        window.invoiceOriginalInvoiceId = invoiceId || linkedExistingInvoiceId || '';
        window.invoicePreviousPayment = editingInvoice ? getInvoicePaidValue(p) : getInvoicePaidValue(linkedExistingInvoice);
        window.invoiceCustomerType = editingInvoice
            ? (inferInvoiceCustomerType(p) === 'mayor' ? 'Mayor' : 'Detal')
            : (inferOrderCustomerType(p) === 'mayor' ? 'Mayor' : 'Detal');

        document.getElementById('inv-editor-title').textContent = editingInvoice
            ? 'Editar Factura: ' + (invoiceId || orderId)
            : 'Ajustar Factura del Pedido: ' + orderId;
        document.getElementById('inv-original-id').value = orderId;
        document.getElementById('inv-edit-id').value = editingInvoice ? (invoiceId || orderId) : (linkedExistingInvoiceId || `FAC-${orderId}`);
        
        document.getElementById('inv-edit-nombre').value = editingInvoice ? getInvoiceCustomerName(p) : (p['Nombre Cliente'] || p.Nombre || '');
        document.getElementById('inv-edit-tel').value = editingInvoice ? (p['ID Cliente'] || '') : (p['Teléfono'] || p.Telefono || '');
        setInvoiceCustomerTypeControl(window.invoiceCustomerType, 'Detal');
        document.getElementById('inv-edit-dir').value = editingInvoice
            ? (p['Método Entrega'] || p['Metodo Entrega'] || p.entrega || p['Dirección'] || p.Direccion || '')
            : (p['Dirección'] || p.Direccion || '');
        document.getElementById('inv-edit-ciudad').value = p.Ciudad || '';
        document.getElementById('inv-edit-fecha').value = formatDateForInvoiceInput(p.Fecha);
        document.getElementById('inv-edit-estado').value = editingInvoice
            ? (p['Estado Factura'] || p.Estado || 'Pendiente')
            : (linkedExistingInvoice ? (linkedExistingInvoice['Estado Factura'] || linkedExistingInvoice.Estado || 'Pendiente') : 'Pendiente');
        document.getElementById('inv-edit-metodo').value = editingInvoice
            ? (p['Método Pago'] || p['Metodo Pago'] || p.pago || '')
            : (p['Método Contacto'] || p['Metodo Contacto'] || p.Metodo || '');
        document.getElementById('inv-edit-nota').value = editingInvoice ? (p.Observaciones || '') : (p['Nota Cliente'] || p.Nota || '');
        
        try {
            const jsonStr = p['Productos JSON'] || p.Productos;
            let items = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : (Array.isArray(jsonStr) ? jsonStr : []);
            window.invoiceItems = items.map((i, itemIndex) => ({
                idVariacion: i.idVariacion || i.id || i.sku || ('ITEM-' + Date.now() + '-' + itemIndex),
                nombre: i.nombre || i.Nombre || i.Producto || 'Producto',
                sku: i.sku || i.id || '',
                img: i.img || i.imagen || i.Imagen || '',
                opcion: i.opcion || i.variantLabel || '',
                color: i.color || i.Color || '',
                talla: i.talla || i.Talla || i.tamano || i['Tamaño'] || '',
                cantidad: parseInt(i.cantidad || i.Cantidad || i.qty || 1),
                precio: parseFloat(i.precio || i.Precio || 0)
            }));
        } catch(e) { console.error("Error cargando ítems", e); }
        if (editingInvoice || linkedExistingInvoice) {
            window.invoicePreviousPayment = getInvoiceBalanceInfo(
                editingInvoice ? p : linkedExistingInvoice,
                getInvoiceTotalFromItems(window.invoiceItems)
            ).paid;
        }
    } else {
        // Nueva
        window.invoiceEditSource = 'manual';
        document.getElementById('inv-editor-title').textContent = 'Nueva Factura';
        document.getElementById('inv-edit-id').value = `FAC-${Date.now()}`;
    }
    
    renderItemsFactura();
    document.getElementById('invoice-editor-modal').classList.add('open');
    if (!Array.isArray(inventario) || inventario.length === 0) {
        window.invoiceInventoryLoadTried = false;
    }
    ensureInvoiceInventoryLoaded();
};

if (typeof window.getProductPrice !== 'function') {
    window.getProductPrice = function(product) {
        return getInvoiceProductPrice(product);
    };
}

function renderInvoiceProductSearch(query) {
    const q = String(query || '').toLowerCase().trim();
    const resultsContainer = document.getElementById('inv-search-results');
    if (!resultsContainer) return;

    if (q.length < 2) {
        resultsContainer.classList.remove('active');
        return;
    }

    const source = Array.isArray(inventario) ? inventario : [];
    if (!source.length) {
        resultsContainer.innerHTML = (window.invoiceInventoryLoadingPromise || !window.invoiceInventoryLoadTried)
            ? '<div class="inv-search-empty">Cargando productos...</div>'
            : '<div class="inv-search-empty">No hay productos cargados. Puedes agregar una linea manual abajo.</div>';
        resultsContainer.classList.add('active');
        const loadPromise = ensureInvoiceInventoryLoaded();
        if (loadPromise && typeof loadPromise.then === 'function') {
            loadPromise.then(() => renderInvoiceProductSearch(q));
        }
        return;
    }

    const results = source.filter(p => {
        if (String(p.Categoria || '').toLowerCase() === 'banner') return false;
        const searchable = [
            getInvoiceProductName(p),
            getInvoiceProductSku(p),
            p.Categoria,
            p.Color,
            p.Estilo,
            getProductBarcode(p),
            getInvoiceProductId(p)
        ].join(' ').toLowerCase();
        return searchable.includes(q);
    }).slice(0, 15);

    window.invoiceSearchResults = results;

    if (results.length > 0) {
        resultsContainer.innerHTML = results.map((p, index) => {
            const img = normalizeImageUrl(p.Imagen || p['Imagen Principal'] || (p.Galeria && p.Galeria[0]));
            const price = getInvoiceProductPrice(p);
            const stock = readInvoiceField(p, ['Cantidad', 'Stock', 'Stock Inicial'], '');
            return `
                <button type="button" class="inv-search-item" data-invoice-product-result="${index}" style="width:100%; border:0; text-align:left; background:transparent;">
                    <img src="${escapeHtml(img || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180')}" alt="">
                    <div class="inv-search-item-info">
                        <div class="inv-search-item-title">${escapeHtml(getInvoiceProductName(p))}</div>
                        <div class="inv-search-item-sub">
                            <span style="background:rgba(168,85,247,0.15); color:var(--primary-light); padding:2px 6px; border-radius:4px; font-weight:600; margin-right:6px;">Ref: ${escapeHtml(getInvoiceProductSku(p) || 'S/N')}</span>
                            <span style="color:#10B981; font-weight:700;">$${price.toLocaleString('es-CO')}</span>
                            ${stock !== '' ? `<span style="color:rgba(255,255,255,0.45);">Stock: ${escapeHtml(stock)}</span>` : ''}
                        </div>
                    </div>
                </button>
            `;
        }).join('');
    } else {
        resultsContainer.innerHTML = `
            <div class="inv-search-empty">
                <div style="font-size:24px; margin-bottom:8px;">?</div>
                <div>No encontramos productos que coincidan con "${escapeHtml(q)}"</div>
            </div>`;
    }

    resultsContainer.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inv-product-search');
    const resultsContainer = document.getElementById('inv-search-results');
    if (!searchInput || !resultsContainer) return;

    searchInput.addEventListener('input', (e) => {
        setTimeout(() => renderInvoiceProductSearch(e.target.value), 0);
    });

    resultsContainer.addEventListener('click', (e) => {
        const item = e.target.closest('[data-invoice-product-result]');
        if (!item) return;
        const product = window.invoiceSearchResults[parseInt(item.dataset.invoiceProductResult, 10)];
        if (!product) return;
        agregarItemBusqueda(
            getInvoiceProductId(product),
            getInvoiceProductName(product),
            getInvoiceProductSku(product),
            getInvoiceProductPrice(product)
        );
    });
});

// Buscador Inteligente
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inv-product-search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('inv-search-results');
        
        if (q.length < 2) {
            resultsContainer.classList.remove('active');
            return;
        }
        
        const results = inventario.filter(p => {
            if (String(p.Categoria || '').toLowerCase() === 'banner') return false;
            const str = (p.Nombre + ' ' + (p.SKU || '') + ' ' + (p.Categoria || '')).toLowerCase();
            return str.includes(q);
        }).slice(0, 10);
        
        if (results.length > 0) {
            resultsContainer.innerHTML = results.map(p => {
                const img = normalizeImageUrl(p.Imagen || (p.Galeria && p.Galeria[0]));
                const price = getProductPrice(p, 'wholesale'); // Usa precio mayorista como default, ajustable después
                const idVar = p.idVariacion || p.ID || p['ID Variacion'] || p['ID Variación'] || p.Producto || '';
                // Escapando comillas simples en el nombre
                const safeName = (p.Nombre || '').replace(/'/g, "\\'");
                return `
                    <div class="inv-search-item" onclick="agregarItemBusqueda('${idVar}', '${safeName}', '${p.SKU || ''}', ${price})">
                        <img src="${img || 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180'}" alt="">
                        <div class="inv-search-item-info">
                            <div class="inv-search-item-title">${p.Nombre}</div>
                            <div class="inv-search-item-sub">
                                <span style="background:rgba(168,85,247,0.15); color:var(--primary-light); padding:2px 6px; border-radius:4px; font-weight:600; margin-right:6px;">Ref: ${p.SKU || 'S/N'}</span>
                                <span style="color:#10B981; font-weight:700;">$${price.toLocaleString('es-CO')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            resultsContainer.classList.add('active');
        } else {
            resultsContainer.innerHTML = `
                <div style="padding:32px 16px; color:rgba(255,255,255,0.4); text-align:center;">
                    <div style="font-size:13px; margin-bottom:8px;">Buscar</div>
                    <div>No encontramos productos que coincidan con "${q}"</div>
                </div>`;
            resultsContainer.classList.add('active');
        }
    });

    // Cerrar resultados si hace clic afuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.inv-search-container')) {
            const rc = document.getElementById('inv-search-results');
            if (rc) rc.classList.remove('active');
        }
    });
});

window.agregarItemBusqueda = function(idVar, nombre, sku, precio) {
    const product = findInvoiceItemProduct({idVariacion: idVar, sku});
    const existing = window.invoiceItems.find(i => i.idVariacion === idVar);
    if (existing) {
        existing.cantidad += 1;
    } else {
        window.invoiceItems.push({
            idVariacion: idVar,
            nombre: nombre,
            sku: sku,
            img: product ? getInventoryProductImage(product) : '',
            opcion: product ? [product.Estilo, product.Color, getInventoryPdfSizeValue(product)].filter(Boolean).join(' · ') : '',
            cantidad: 1,
            precio: parseFloat(precio)
        });
    }
    
    document.getElementById('inv-product-search').value = '';
    document.getElementById('inv-search-results').classList.remove('active');
    renderItemsFactura();
};

window.agregarItemManualFactura = function() {
    const nameInput = document.getElementById('inv-custom-name');
    const skuInput = document.getElementById('inv-custom-sku');
    const priceInput = document.getElementById('inv-custom-price');
    const nombre = nameInput.value.trim();
    const precio = parseFloat(priceInput.value);

    if (!nombre) {
        showToast('Escribe el nombre del producto manual', 'warning');
        nameInput.focus();
        return;
    }

    if (Number.isNaN(precio) || precio < 0) {
        showToast('Escribe un precio valido', 'warning');
        priceInput.focus();
        return;
    }

    window.invoiceItems.push({
        idVariacion: 'MANUAL-' + Date.now(),
        nombre,
        sku: skuInput.value.trim(),
        cantidad: 1,
        precio
    });

    nameInput.value = '';
    skuInput.value = '';
    priceInput.value = '';
    renderItemsFactura();
};

window.modificarNombreItemFactura = function(index, value) {
    if (!window.invoiceItems[index]) return;
    window.invoiceItems[index].nombre = String(value || '').trim() || 'Producto';
};

window.modificarSkuItemFactura = function(index, value) {
    if (!window.invoiceItems[index]) return;
    window.invoiceItems[index].sku = String(value || '').trim();
};

window.modificarCantidadFactura = function(index, qty) {
    const val = parseInt(qty);
    if (val > 0) {
        window.invoiceItems[index].cantidad = val;
    } else {
        window.invoiceItems[index].cantidad = 1;
    }
    renderItemsFactura();
};

window.modificarPrecioFactura = function(index, price) {
    const val = parseFloat(price);
    if (!isNaN(val)) {
        window.invoiceItems[index].precio = val;
    }
    renderItemsFactura();
};

window.eliminarItemFactura = function(index) {
    window.invoiceItems.splice(index, 1);
    renderItemsFactura();
};

function findInvoiceItemProduct(item) {
    const source = Array.isArray(inventario) ? inventario : [];
    const id = String(item.idVariacion || item.id || '').trim();
    const byId = id && source.find(product => [product.id, product.idVariacion, product.ID, product['ID Variacion'], product['ID Variación']].some(value => value != null && String(value).trim() === id));
    if (byId) return byId;
    const sku = String(item.sku || '').trim();
    const matches = sku ? source.filter(product => String(getInvoiceProductSku(product)).trim() === sku) : [];
    return matches.length === 1 ? matches[0] : null;
}

function getInvoiceItemVisual(item) {
    const product = findInvoiceItemProduct(item);
    const image = normalizeImageUrl(item.img || item.imagen || '') || (product ? getInventoryProductImage(product) : '');
    const optionParts = [item.opcion, item.color || product?.Color, item.talla || (product ? getInventoryPdfSizeValue(product) : '')].filter(Boolean);
    const option = optionParts.filter((part, index) => !optionParts.slice(0, index).some(previous => String(previous).includes(String(part)))).join(' · ') || product?.Estilo || '';
    // Guardar la imagen de la variante para conservarla al ajustar/guardar la factura.
    if (image && !item.img) item.img = image;
    if (option && !item.opcion) item.opcion = option;
    return {image, option};
}

function renderItemsFactura() {
    const tbody = document.getElementById('inv-edit-items');
    let total = 0;
    
    if (window.invoiceItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:rgba(248,244,255,0.45); padding:28px 16px; font-size:13px;">Busca productos arriba o agrega una línea manual para comenzar</td></tr>';
        document.getElementById('inv-edit-total').textContent = '$0';
        updateInvoicePaymentSummary();
        return;
    }
    
    tbody.innerHTML = window.invoiceItems.map((item, i) => {
        const visual = getInvoiceItemVisual(item);
        const subtotal = item.precio * item.cantidad;
        total += subtotal;
        return `
            <tr>
                <td data-label="Producto">
                    <div class="inv-item-visual">
                        ${visual.image ? `<img class="inv-item-photo" src="${escapeHtml(visual.image)}" alt="${escapeHtml(item.nombre)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="inv-item-photo-empty" hidden>Sin imagen</span>` : '<span class="inv-item-photo-empty">Sin imagen</span>'}
                        <div class="inv-item-fields">
                    <input type="text" class="inv-item-name-input" value="${escapeHtml(item.nombre)}" placeholder="Descripción del producto" onchange="modificarNombreItemFactura(${i}, this.value)">
                    <input type="text" class="inv-item-ref-input" value="${escapeHtml(item.sku || '')}" placeholder="Ref / SKU" onchange="modificarSkuItemFactura(${i}, this.value)">
                            ${visual.option ? `<span class="inv-item-option">${escapeHtml(visual.option)}</span>` : ''}
                        </div>
                    </div>
                </td>
                <td data-label="Cantidad" style="text-align:center;">
                    <input type="number" class="inv-qty-input" value="${item.cantidad}" min="1" onchange="modificarCantidadFactura(${i}, this.value)">
                </td>
                <td data-label="Precio unitario" style="text-align:right;">
                    <input type="number" class="inv-item-price-input" value="${item.precio}" onchange="modificarPrecioFactura(${i}, this.value)">
                </td>
                <td data-label="Subtotal" style="text-align:right; font-weight:900; color:#f4c441; font-size:14px; font-variant-numeric:tabular-nums;">$${subtotal.toLocaleString('es-CO')}</td>
                <td data-label="Acción" style="text-align:center;">
                    <button class="inv-remove-item-btn" type="button" onclick="eliminarItemFactura(${i})" title="Eliminar ítem">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    document.getElementById('inv-edit-total').textContent = formatAdminInvoiceMoney(total);
    updateInvoicePaymentSummary();
}

window.updateInvoicePaymentSummary = function() {
    const total = getInvoiceTotalFromItems(window.invoiceItems || []);
    const previousPaid = Math.min(Math.max(0, Number(window.invoicePreviousPayment) || 0), Math.max(0, total));
    const newPaymentInput = document.getElementById('inv-edit-abono');
    const newPayment = Math.max(0, parseAdminInvoiceMoney(newPaymentInput?.value || 0));
    const acceptedNewPayment = Math.min(newPayment, Math.max(0, total - previousPaid));
    const paidAfter = previousPaid + acceptedNewPayment;
    const balanceBefore = Math.max(0, total - previousPaid);
    const balanceAfter = Math.max(0, total - paidAfter);

    if (document.getElementById('inv-paid-before')) {
        document.getElementById('inv-paid-before').textContent = formatAdminInvoiceMoney(previousPaid);
    }
    if (document.getElementById('inv-balance-before')) {
        document.getElementById('inv-balance-before').textContent = formatAdminInvoiceMoney(balanceBefore);
    }
    const balanceAfterEl = document.getElementById('inv-balance-after');
    if (balanceAfterEl) {
        balanceAfterEl.textContent = formatAdminInvoiceMoney(balanceAfter);
        balanceAfterEl.style.color = balanceAfter > 0 ? '#fbbf24' : '#34d399';
    }
    const balanceCard = document.getElementById('inv-card-balance-box');
    if (balanceCard) {
        balanceCard.style.borderColor = balanceAfter > 0 ? 'rgba(251, 191, 36, 0.4)' : 'rgba(52, 211, 153, 0.4)';
    }
};

function isAdminInvoiceMobilePrint() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return isIOS || window.matchMedia('(max-width: 760px)').matches;
}

function getAdminInvoicePrintWindowStyles() {
    return `
        * { box-sizing: border-box; }
        :root {
            --invoice-purple: #6d28d9;
            --invoice-purple-soft: #ede9fe;
            --invoice-ink: #171717;
            --invoice-muted: #5f6470;
            --invoice-line: #d9d9e3;
            --invoice-soft-line: #ececf2;
        }
        html, body {
            margin: 0;
            background: #ffffff;
            color: var(--invoice-ink);
            font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body { padding: 22px; }
        .invoice-print-toolbar {
            position: sticky;
            top: 0;
            z-index: 20;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            max-width: 880px;
            margin: 0 auto 12px;
            padding: 8px 0;
            background: #ffffff;
            border-bottom: 1px solid var(--invoice-soft-line);
        }
        .invoice-print-button {
            min-height: 40px;
            border: 1px solid var(--invoice-purple);
            border-radius: 7px;
            padding: 0 18px;
            background: #ffffff;
            color: var(--invoice-purple);
            font: inherit;
            font-size: 11px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            cursor: pointer;
        }
        .invoice-print-button:hover { background: var(--invoice-purple-soft); }
        #invoice-print-container {
            display: block;
            max-width: 880px;
            margin: 0 auto;
            padding: 28px 34px 24px;
            background: #ffffff;
            border: 1px solid var(--invoice-line);
            border-radius: 4px;
            box-shadow: 0 8px 22px rgba(17, 17, 17, 0.06);
        }
        .admin-inv-top-banner {
            background: #ffffff;
            padding: 0 0 16px;
            border-bottom: 2px solid var(--invoice-purple);
            color: var(--invoice-ink);
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 24px;
            align-items: start;
            margin-bottom: 18px;
        }
        .admin-inv-brand-wrapper {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
        }
        .admin-inv-brand-wrapper img {
            height: 48px;
            width: auto;
            object-fit: contain;
        }
        .admin-inv-brand-wrapper h1 {
            margin: 0;
            font-size: 20px;
            font-weight: 900;
            letter-spacing: 0;
            color: var(--invoice-ink);
            text-transform: uppercase;
        }
        .admin-inv-brand-wrapper p {
            margin: 4px 0 0;
            font-size: 10.8px;
            color: var(--invoice-muted);
            font-weight: 500;
            line-height: 1.45;
        }
        .admin-inv-badge-box {
            background: #ffffff;
            border: 1px solid var(--invoice-line);
            border-top: 3px solid var(--invoice-purple);
            border-radius: 4px;
            padding: 10px 14px;
            text-align: right;
            min-width: 190px;
        }
        .admin-inv-badge-box h2 {
            margin: 0 0 3px;
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 1.2px;
            color: var(--invoice-purple);
            text-transform: uppercase;
        }
        .admin-inv-badge-box .inv-num {
            font-size: 18px;
            font-weight: 900;
            color: var(--invoice-ink);
            margin: 0 0 2px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            letter-spacing: 0.2px;
        }
        .admin-inv-badge-box .inv-date {
            font-size: 11px;
            color: var(--invoice-muted);
            font-weight: 650;
        }
        .admin-inv-badge-box .inv-status-chip {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            margin-top: 6px;
            background: #ffffff;
            border: 1px solid var(--invoice-line);
            color: var(--invoice-muted);
            padding: 2px 8px;
            border-radius: 999px;
            font-size: 8.8px;
            font-weight: 850;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .admin-inv-badge-box .status-dot {
            width: 5px;
            height: 5px;
            background: var(--invoice-purple);
            border-radius: 50%;
        }
        .invoice-details {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 18px;
        }
        .invoice-details-box {
            background: #ffffff;
            border: 1px solid var(--invoice-line);
            border-radius: 4px;
            padding: 12px 14px;
            min-height: 132px;
        }
        .invoice-details-box.inv-box-cliente,
        .invoice-details-box.inv-box-emisor { border-left: 3px solid var(--invoice-purple); }
        .invoice-details-box .box-header-title {
            display: flex;
            align-items: center;
            margin: 0 0 8px;
            font-size: 9.5px;
            font-weight: 900;
            letter-spacing: 0.9px;
            color: var(--invoice-purple);
            text-transform: uppercase;
            border-bottom: 1px solid var(--invoice-soft-line);
            padding-bottom: 6px;
        }
        .invoice-details-box .cliente-nombre-title,
        .invoice-details-box .emisor-nombre-title {
            font-size: 14px;
            font-weight: 850;
            color: var(--invoice-ink);
            display: block;
            margin-bottom: 6px;
        }
        .invoice-details-box p {
            margin: 3px 0;
            font-size: 11.2px;
            color: var(--invoice-muted);
            line-height: 1.45;
            font-weight: 500;
        }
        .invoice-details-box p strong { color: #2f3138; font-weight: 760; }
        .invoice-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 18px;
            border-top: 2px solid var(--invoice-purple);
            border-bottom: 1px solid var(--invoice-line);
        }
        .invoice-table th {
            background: #ffffff;
            color: var(--invoice-purple);
            font-size: 9.5px;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: 0.75px;
            padding: 8px 10px;
            border-bottom: 1px solid var(--invoice-line);
        }
        .invoice-table td {
            padding: 9px 10px;
            border-bottom: 1px solid var(--invoice-soft-line);
            font-size: 12px;
            color: var(--invoice-ink);
            background: #ffffff;
            font-weight: 500;
            vertical-align: top;
        }
        .invoice-table tr:last-child td { border-bottom: none; }
        .invoice-bottom-grid {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 300px;
            gap: 16px;
            align-items: start;
            margin-top: 14px;
        }
        .invoice-notes-box {
            background: #ffffff;
            border: 1px solid var(--invoice-line);
            border-left: 3px solid var(--invoice-purple);
            border-radius: 4px;
            padding: 11px 13px;
            font-size: 11px;
            color: var(--invoice-muted);
            line-height: 1.5;
        }
        .invoice-notes-box .notes-title {
            font-size: 9.5px;
            font-weight: 900;
            letter-spacing: 0.9px;
            color: var(--invoice-purple);
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        .invoice-total-container { display: flex; justify-content: flex-end; }
        .invoice-total-box {
            background: #ffffff;
            color: var(--invoice-ink);
            padding: 13px 16px;
            border-radius: 4px;
            width: 100%;
            border: 1px solid var(--invoice-line);
            border-top: 3px solid var(--invoice-purple);
        }
        .invoice-total-box .total-row-item,
        .invoice-total-box .payment-row-item {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 14px;
        }
        .invoice-total-box .payment-row-item {
            margin-top: 7px;
            padding-top: 7px;
            border-top: 1px solid var(--invoice-soft-line);
            font-size: 11px;
            font-weight: 700;
            color: var(--invoice-muted);
        }
        .invoice-total-box .payment-row-item.balance {
            color: var(--invoice-ink);
            font-weight: 900;
            font-size: 12px;
        }
        .invoice-total-box .total-label {
            font-size: 10px;
            font-weight: 900;
            letter-spacing: 0.9px;
            color: var(--invoice-purple);
            text-transform: uppercase;
        }
        .invoice-total-box .total-amount {
            font-size: 22px;
            font-weight: 900;
            color: var(--invoice-ink);
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .invoice-total-box .total-sub-info {
            margin-top: 8px;
            padding-top: 7px;
            border-top: 1px solid var(--invoice-soft-line);
            font-size: 9.8px;
            color: #777b85;
            text-align: right;
            font-weight: 600;
        }
        .invoice-footer-line {
            height: 1px;
            background: linear-gradient(90deg, transparent, var(--invoice-purple), var(--invoice-line), transparent);
            margin: 21px 0 9px;
        }
        .invoice-footer {
            text-align: center;
            font-size: 10.8px;
            color: var(--invoice-muted);
        }
        .invoice-footer .thank-you {
            font-size: 12px;
            font-weight: 850;
            color: var(--invoice-ink);
            margin-bottom: 2px;
            text-transform: uppercase;
            letter-spacing: 0.4px;
        }
        .invoice-footer .footer-subtext {
            margin: 0;
            font-size: 9.8px;
            color: #777b85;
            font-weight: 500;
        }
        @media (max-width: 640px) {
            body { padding: 0; background: #ffffff; }
            .invoice-print-toolbar { padding: 10px 12px; margin-bottom: 0; }
            .invoice-print-button { width: 100%; }
            #invoice-print-container { padding: 14px; box-shadow: none; border: none; }
            .admin-inv-top-banner,
            .admin-inv-brand-wrapper { grid-template-columns: 1fr; align-items: flex-start; flex-direction: column; }
            .admin-inv-badge-box { width: 100%; text-align: left; }
            .invoice-details,
            .invoice-bottom-grid { grid-template-columns: 1fr; }
            .invoice-table { display: block; overflow-x: auto; white-space: nowrap; }
        }
        @media print {
            @page { size: A4 portrait; margin: 9mm; }
            html, body { background: #ffffff !important; margin: 0 !important; padding: 0 !important; }
            body { padding: 0 !important; }
            .invoice-print-toolbar { display: none !important; }
            #invoice-print-container { max-width: none; padding: 0; border: none; box-shadow: none; }
            .admin-inv-top-banner,
            .invoice-details,
            .invoice-bottom-grid,
            .invoice-footer { page-break-inside: avoid; }
            .invoice-table tr { page-break-inside: avoid; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    `;
}
function openAdminInvoicePrintWindow(title) {
    const printContainer = document.getElementById('invoice-print-container');
    if (!printContainer) return false;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    const baseUrl = window.location.href.replace(/[^/]*$/, '');
    printWindow.document.open();
    printWindow.document.write(`<!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <base href="${escapeHtml(baseUrl)}">
            <title>${escapeHtml(title || 'Factura Original Store')}</title>
            <style>${getAdminInvoicePrintWindowStyles()}</style>
        </head>
        <body>
            <div class="invoice-print-toolbar">
                <button type="button" class="invoice-print-button" onclick="window.print()">Imprimir / guardar PDF</button>
            </div>
            ${printContainer.outerHTML}
        </body>
        </html>`);
    printWindow.document.close();
    return true;
}

window.imprimirFacturaEditor = function() {
    const origTitle = document.title;
    const pId = document.getElementById('inv-edit-id').value || `PED-${Date.now().toString().slice(-6)}`;
    const nombre = document.getElementById('inv-edit-nombre').value || 'Cliente Original Store';
    const tel = document.getElementById('inv-edit-tel').value || '-';
    const dir = document.getElementById('inv-edit-dir').value || '-';
    const ciudad = document.getElementById('inv-edit-ciudad').value || '-';
    const fecha = document.getElementById('inv-edit-fecha').value || new Date().toISOString().slice(0, 10);
    const estado = document.getElementById('inv-edit-estado')?.value || 'Finalizada';
    const metodo = document.getElementById('inv-edit-metodo')?.value || 'Digital / Directo';
    const nota = document.getElementById('inv-edit-nota')?.value || '';
    const tipoCliente = getInvoiceCustomerTypeLabel(document.getElementById('inv-edit-tipo')?.value, window.invoiceCustomerType || 'Detal');
    window.invoiceCustomerType = normalizeAdminCustomerType(tipoCliente) === 'mayor' ? 'Mayor' : 'Detal';

    // Rellenar campos en plantilla de impresión
    document.getElementById('inv-id').textContent = pId;
    const consultUrl = new URL('facturas-pedidos.html', window.location.href);
    consultUrl.searchParams.set('buscar', pId);
    const qrImage = document.getElementById('inv-consult-qr-image');
    const qrLink = document.getElementById('inv-consult-qr-link');
    if (qrImage) qrImage.src = getInventoryQrImageUrl(consultUrl.href, 240);
    if (qrLink) { qrLink.href = consultUrl.href; qrLink.textContent = 'Factura ' + pId; }
    
    try {
        const dateObj = new Date(fecha.includes('T') ? fecha : fecha + 'T00:00:00');
        document.getElementById('inv-date').textContent = isNaN(dateObj.getTime()) ? fecha : dateObj.toLocaleDateString('es-CO');
    } catch(e) {
        document.getElementById('inv-date').textContent = fecha;
    }

    document.getElementById('inv-cliente-nombre').textContent = nombre;
    document.getElementById('inv-cliente-tel').textContent = tel;
    document.getElementById('inv-cliente-dir').textContent = dir;
    document.getElementById('inv-cliente-ciudad').textContent = ciudad;
    if (document.getElementById('inv-cliente-tipo')) {
        document.getElementById('inv-cliente-tipo').textContent = tipoCliente || 'Detal';
    }

    if (document.getElementById('inv-print-status')) {
        document.getElementById('inv-status-text').textContent = (estado || 'COMPROBANTE OFICIAL').toUpperCase();
    }
    if (document.getElementById('inv-print-metodo')) {
        document.getElementById('inv-print-metodo').textContent = metodo || 'Digital / Directo';
    }

    // Configuración dinámicas de empresa Original Store
    const cfg = window.storeConfig || {};
    const logoImg = document.getElementById('inv-company-logo');
    if (logoImg) logoImg.src = 'https://lh3.googleusercontent.com/d/1OTHvWFph2u3qFQMQVhE5ghmSWjBSgBeW=w180';

    if (document.getElementById('inv-company-name')) {
        document.getElementById('inv-company-name').textContent = cfg['Factura_Empresa'] || 'Original Store Joyería & Accesorios';
    }
    if (document.getElementById('inv-emisor-nombre')) {
        document.getElementById('inv-emisor-nombre').textContent = cfg['Factura_Empresa'] || 'Original Store Joyería & Accesorios';
    }
    if (document.getElementById('inv-company-nit')) {
        document.getElementById('inv-company-nit').textContent = cfg['Factura_NIT'] || '000.000.000-0';
    }
    if (document.getElementById('inv-company-contact')) {
        document.getElementById('inv-company-contact').textContent = 'WhatsApp: ' + (cfg['Factura_Telefono'] || '+57 311 2368622');
    }
    if (document.getElementById('inv-company-email')) {
        document.getElementById('inv-company-email').textContent = 'Email: ' + (cfg['Factura_Email'] || 'originalstorealmacen@gmail.com');
    }

    // Sección de observaciones y notas
    const notesElem = document.getElementById('inv-print-notes');
    if (notesElem) {
        if (nota.trim()) {
            notesElem.textContent = nota;
        } else {
            notesElem.textContent = 'N/A';
        }
    }

    // Renderizado de ítems con fuente ampliada
    const itemsTbody = document.getElementById('inv-items');
    let total = 0;
    let totalQty = 0;
    
    itemsTbody.innerHTML = (window.invoiceItems || []).map(item => {
        const cant = Number(item.cantidad) || 1;
        const precio = Number(item.precio) || 0;
        const sub = cant * precio;
        total += sub;
        totalQty += cant;
        return `
            <tr>
                <td style="text-align:center;">
                    <span style="background:#ffffff; color:#6d28d9; font-weight:850; padding:2px 8px; border-radius:4px; font-size:12px; display:inline-block; border:1px solid #d9d9e3;">${cant}</span>
                </td>
                <td>
                    <strong style="font-size:13.2px; color:#171717; display:block; margin-bottom:3px; font-weight:760;">${escapeHtml(item.nombre)}</strong>
                    <span style="display:inline-block; background:#ffffff; color:#5f6470; font-size:10.5px; font-weight:650; padding:1px 6px; border-radius:4px; border:1px solid #ececf2; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;">Ref: ${escapeHtml(item.sku || item.idVariacion || '-')}</span>
                </td>
                <td style="text-align:right; font-variant-numeric: tabular-nums; font-weight:650; color:#3f4148; font-size:13px;">$${precio.toLocaleString('es-CO')}</td>
                <td style="text-align:right; font-variant-numeric: tabular-nums; font-weight:850; color:#171717; font-size:13.5px;">$${sub.toLocaleString('es-CO')}</td>
            </tr>
        `;
    }).join('');

    const previousPaid = Math.min(Math.max(0, Number(window.invoicePreviousPayment) || 0), Math.max(0, total));
    const requestedNewPayment = Math.max(0, parseAdminInvoiceMoney(document.getElementById('inv-edit-abono')?.value || 0));
    const acceptedNewPayment = Math.min(requestedNewPayment, Math.max(0, total - previousPaid));
    const paidAfter = previousPaid + acceptedNewPayment;
    const balanceAfter = Math.max(0, total - paidAfter);

    document.getElementById('inv-total').textContent = formatAdminInvoiceMoney(total);
    if (document.getElementById('inv-paid-total')) {
        document.getElementById('inv-paid-total').textContent = formatAdminInvoiceMoney(paidAfter);
    }
    if (document.getElementById('inv-balance-total')) {
        document.getElementById('inv-balance-total').textContent = formatAdminInvoiceMoney(balanceAfter);
    }
    if (document.getElementById('inv-total-items-count')) {
        document.getElementById('inv-total-items-count').textContent = totalQty + (totalQty === 1 ? ' Ítem' : ' Ítems');
    }

    // Nombre dinámico de archivo al imprimir/guardar PDF
    const safeName = nombre.replace(/[^a-zA-Z0-9]/g, '_');
    document.title = `Factura_${pId}_${safeName}`;

    if (openAdminInvoicePrintWindow(document.title)) {
        document.title = origTitle;
        return;
    }

    document.body.classList.add('invoice-print-mode');
    setTimeout(() => {
        window.print();
        setTimeout(() => {
            document.body.classList.remove('invoice-print-mode');
            document.title = origTitle;
        }, 1200);
    }, 200);
};

window.sendInvoiceWhatsAppEditor = function () {
    const telInput = document.getElementById('inv-edit-tel');
    let phone = telInput ? telInput.value.trim() : '';
    let cleanPhone = String(phone).replace(/\D/g, '');

    if (!cleanPhone || cleanPhone.length < 7) {
        const userPhone = prompt('Por favor ingresa o confirma el número de WhatsApp del cliente (ej: 3118527762):', phone || '');
        if (!userPhone) return;
        cleanPhone = String(userPhone).replace(/\D/g, '');
        if (telInput && cleanPhone) telInput.value = cleanPhone;
    }

    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
        cleanPhone = '57' + cleanPhone;
    }

    const id = document.getElementById('inv-edit-id').value || `FAC-${Date.now().toString().slice(-6)}`;
    const nombre = document.getElementById('inv-edit-nombre').value || 'Cliente Original Store';
    const fecha = document.getElementById('inv-edit-fecha').value || new Date().toISOString().slice(0, 10);
    const dir = document.getElementById('inv-edit-dir').value || '';
    const ciudad = document.getElementById('inv-edit-ciudad').value || '';

    let total = 0;
    const itemsText = (window.invoiceItems || []).length ? window.invoiceItems.map(item => {
        const sub = (Number(item.precio) || 0) * (Number(item.cantidad) || 1);
        total += sub;
        return `• *${item.cantidad}x* ${item.nombre} - $${sub.toLocaleString('es-CO')}`;
    }).join('\n') : '• Detalle de compra adjunto en la factura';

    const msg = `¡Hola, *${nombre}*!
¡Muchas gracias por tu preferencia y por elegir *Original Store Joyería & Accesorios*!

Aquí tienes el comprobante digital oficial de tu compra *#${id}*:

*RESUMEN DE TU COMPRA*
----------------------------------------
*Fecha:* ${fecha}
*Cliente:* ${nombre}
*Contacto:* ${phone || cleanPhone}
${ciudad ? `*Ciudad:* ${ciudad}\n` : ''}${dir ? `*Dirección de Envío:* ${dir}\n` : ''}
*Productos pedidos:*
${itemsText}

*TOTAL FACTURA:* $${total.toLocaleString('es-CO')}
----------------------------------------

*Adjunto encontrarás el documento PDF de tu factura listo para ver y guardar.*

¡Esperamos que disfrutes muchísimo tus accesorios! Cualquier duda estamos para ayudarte.
*Tienda web:* aloriginalstore.online
*Soporte Original Store:* +57 311 2368622`;

    // 1. Disparar el generador / diálogo de impresión PDF para que el usuario guarde o imprima el archivo PDF
    if (typeof window.imprimirFacturaEditor === 'function') {
        window.imprimirFacturaEditor();
    }

    // 2. Abrir la ventana de WhatsApp con el mensaje estructurado listo para enviar
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    setTimeout(() => {
        window.open(waUrl, '_blank');
    }, 400);
};

window.sendAdminInvoiceRowToWhatsApp = function (idx) {
    if (typeof window.abrirEditorFactura === 'function') {
        window.abrirEditorFactura(idx, 'factura');
        setTimeout(() => {
            if (typeof window.sendInvoiceWhatsAppEditor === 'function') {
                window.sendInvoiceWhatsAppEditor();
            }
        }, 350);
    }
};

window.openQuickInvoicePayment = function(idx) {
    const invoice = (window.facturasList || [])[idx];
    const modal = document.getElementById('quick-payment-modal');
    if (!invoice || !modal) {
        showToast('No se encontro la factura seleccionada', 'error');
        return;
    }

    const total = parseAdminInvoiceMoney(invoice.Subtotal || invoice.Total || 0);
    const balanceInfo = getInvoiceBalanceInfo(invoice, total);
    if (balanceInfo.balance <= 0) {
        showToast('Esta factura no tiene saldo pendiente', 'info');
        return;
    }

    modal.dataset.invoiceIndex = String(idx);
    const invoiceId = getInvoiceIdValue(invoice) || '-';
    const customer = getInvoiceCustomerName(invoice) || 'Cliente';
    const currentMethod = invoice['Método Pago'] || invoice['Metodo Pago'] || invoice.pago || '';

    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setText('quick-payment-invoice-id', invoiceId);
    setText('quick-payment-customer', customer);
    setText('quick-payment-total', formatAdminInvoiceMoney(balanceInfo.total));
    setText('quick-payment-paid', formatAdminInvoiceMoney(balanceInfo.paid));
    setText('quick-payment-balance', formatAdminInvoiceMoney(balanceInfo.balance));

    const amountInput = document.getElementById('quick-payment-amount');
    const methodInput = document.getElementById('quick-payment-method');
    if (amountInput) {
        amountInput.value = '';
        amountInput.placeholder = formatAdminInvoiceMoney(balanceInfo.balance);
        amountInput.dataset.maxAmount = String(balanceInfo.balance);
    }
    if (methodInput) methodInput.value = currentMethod || 'Abono';

    modal.classList.add('open');
    setTimeout(() => amountInput?.focus(), 80);
};

window.closeQuickInvoicePayment = function() {
    const modal = document.getElementById('quick-payment-modal');
    if (modal) modal.classList.remove('open');
};

window.updateAdminInvoiceStatus = async function(idx, nextStatus, selectEl) {
    const invoice = (window.facturasList || [])[idx];
    if (!invoice) {
        showToast('No se encontro la factura seleccionada', 'error');
        return;
    }

    const invoiceId = getInvoiceIdValue(invoice);
    if (!invoiceId) {
        showToast('La factura no tiene ID valido para actualizar', 'error');
        return;
    }

    const previousStatus = invoice['Estado Factura'] || invoice.Estado || 'Pendiente';
    const cleanStatus = String(nextStatus || '').trim() || previousStatus;
    if (cleanStatus === previousStatus) return;

    if (selectEl) selectEl.disabled = true;
    try {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify({
                resource: 'facturas',
                action: 'actualizar',
                id: invoiceId,
                'ID Factura': invoiceId,
                'Estado Factura': cleanStatus
            })
        });
        const result = await res.json();
        if (!result || result.status !== 'success') {
            throw new Error(result?.error || 'No se pudo actualizar el estado');
        }

        invoice['Estado Factura'] = cleanStatus;
        invoice.Estado = cleanStatus;
        renderFacturas();
        showToast(`Factura marcada como ${cleanStatus}`, 'success');
    } catch (error) {
        if (selectEl) selectEl.value = previousStatus;
        showToast('Error actualizando estado: ' + error.message, 'error');
        console.error(error);
    } finally {
        if (selectEl) selectEl.disabled = false;
    }
};

window.saveQuickInvoicePayment = async function() {
    const modal = document.getElementById('quick-payment-modal');
    const saveBtn = document.getElementById('quick-payment-save-btn');
    const amountInput = document.getElementById('quick-payment-amount');
    const methodInput = document.getElementById('quick-payment-method');
    if (!modal || !amountInput) return;

    const idx = Number(modal.dataset.invoiceIndex);
    const invoice = (window.facturasList || [])[idx];
    if (!invoice) {
        showToast('No se encontro la factura seleccionada', 'error');
        return;
    }

    const invoiceId = getInvoiceIdValue(invoice);
    if (!invoiceId) {
        showToast('La factura no tiene ID valido para actualizar', 'error');
        return;
    }

    const total = parseAdminInvoiceMoney(invoice.Subtotal || invoice.Total || 0);
    const balanceInfo = getInvoiceBalanceInfo(invoice, total);
    const requestedPayment = Math.max(0, parseAdminInvoiceMoney(amountInput.value || 0));
    if (requestedPayment <= 0) {
        showToast('Escribe un valor de abono mayor a cero', 'warning');
        amountInput.focus();
        return;
    }

    const acceptedPayment = Math.min(requestedPayment, balanceInfo.balance);
    const paidAfter = Math.min(balanceInfo.total, balanceInfo.paid + acceptedPayment);
    const balanceAfter = Math.max(0, balanceInfo.total - paidAfter);
    const currentStatus = invoice['Estado Factura'] || invoice.Estado || 'Pendiente';
    const nextStatus = balanceAfter === 0
        ? 'Pago'
        : (paidAfter > 0 ? 'Abonada' : currentStatus);
    const method = String(methodInput?.value || invoice['Método Pago'] || invoice['Metodo Pago'] || invoice.pago || 'Abono').trim() || 'Abono';

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
    }

    const payload = {
        resource: 'facturas',
        action: 'actualizar',
        id: invoiceId,
        'ID Factura': invoiceId,
        'Valor Abonado': paidAfter,
        'Saldo Pendiente': balanceAfter,
        'Ultimo Abono': acceptedPayment,
        'Estado Factura': nextStatus,
        pago: method
    };

    try {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!result || result.status !== 'success') {
            throw new Error(result?.error || 'No se pudo guardar el abono');
        }

        Object.assign(invoice, {
            'Valor Abonado': paidAfter,
            'Saldo Pendiente': balanceAfter,
            'Ultimo Abono': acceptedPayment,
            'Estado Factura': nextStatus,
            'Método Pago': method,
            pago: method
        });

        renderFacturas();
        closeQuickInvoicePayment();
        showToast(`Abono registrado: ${formatAdminInvoiceMoney(acceptedPayment)}`, 'success');
        cargarPedidos({ force: true });
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        console.error(err);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Registrar abono';
        }
    }
};

window.guardarFacturaDB = async function() {
    if (window.invoiceItems.length === 0) return alert("Añade al menos un producto a la factura.");
    
    const btn = document.getElementById('btn-save-invoice');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    
    const originalOrderId = document.getElementById('inv-original-id').value.trim();
    const visibleId = document.getElementById('inv-edit-id').value.trim();
    const editingExistingInvoice = window.invoiceEditSource === 'factura' && window.invoiceOriginalInvoiceId;
    const existingInvoiceForOrder = originalOrderId
        ? (window.facturasList || []).find(f => String(getInvoiceOrderIdValue(f)).trim() === originalOrderId)
        : null;
    const existingInvoiceId = existingInvoiceForOrder ? getInvoiceIdValue(existingInvoiceForOrder) : '';
    const idPedido = window.invoiceEditSource === 'pedido'
        ? originalOrderId
        : (originalOrderId || '');
    const idFactura = editingExistingInvoice
        ? (visibleId || window.invoiceOriginalInvoiceId)
        : (existingInvoiceId || (idPedido ? (visibleId || `FAC-${idPedido}`) : (visibleId || `FAC-${Date.now()}`)));
    const isUpdate = Boolean(editingExistingInvoice || existingInvoiceId);
    const total = window.invoiceItems.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const cantTotal = window.invoiceItems.reduce((sum, item) => sum + item.cantidad, 0);
    const existingPaymentInfo = existingInvoiceForOrder ? getInvoiceBalanceInfo(existingInvoiceForOrder, total) : null;
    const previousPaid = Math.min(
        Math.max(0, existingPaymentInfo ? existingPaymentInfo.paid : (Number(window.invoicePreviousPayment) || 0)),
        Math.max(0, total)
    );
    const requestedNewPayment = Math.max(0, parseAdminInvoiceMoney(document.getElementById('inv-edit-abono')?.value || 0));
    const acceptedNewPayment = Math.min(requestedNewPayment, Math.max(0, total - previousPaid));
    const paidAfter = previousPaid + acceptedNewPayment;
    const saldoPendiente = Math.max(0, total - paidAfter);
    const metodo = document.getElementById('inv-edit-metodo').value.trim() || 'Mostrador / Manual';
    let estadoFactura = document.getElementById('inv-edit-estado').value.trim() || 'Finalizada';
    const entrega = [document.getElementById('inv-edit-dir').value.trim(), document.getElementById('inv-edit-ciudad').value.trim()]
        .filter(Boolean)
        .join(' - ');
    const tipoCliente = getInvoiceCustomerTypeLabel(document.getElementById('inv-edit-tipo')?.value, window.invoiceCustomerType || 'Detal');
    const tipoClienteTab = normalizeAdminCustomerType(tipoCliente) === 'mayor' ? 'Mayor' : 'Detal';
    window.invoiceCustomerType = tipoClienteTab;
    const linkedOrderStatus = /final|complet|pagad|factur/i.test(estadoFactura) ? 'Facturado' : estadoFactura;
    
    const payload = {
        resource: 'facturas',
        action: isUpdate ? 'actualizar' : 'crear',
        id: window.invoiceOriginalInvoiceId || existingInvoiceId || idFactura,
        'ID Factura': idFactura,
        'ID Pedido': idPedido,
        'ID Cliente': document.getElementById('inv-edit-tel').value,
        'Tipo Cliente': tipoCliente,
        'Fecha': document.getElementById('inv-edit-fecha').value || new Date().toISOString().slice(0, 10),
        'Nombre': document.getElementById('inv-edit-nombre').value,
        'Productos JSON': JSON.stringify(window.invoiceItems),
        'Cantidad Total': cantTotal,
        'Subtotal': total,
        'Valor Abonado': paidAfter,
        'Saldo Pendiente': saldoPendiente,
        'Ultimo Abono': acceptedNewPayment,
        'Estado Factura': estadoFactura,
        pago: metodo,
        entrega,
        'Observaciones': document.getElementById('inv-edit-nota').value
    };
    
    try {
        const res = await fetch(GOOGLE_SHEET_API, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        
        if (result && result.status === 'success') {
            if (window.invoiceEditSource === 'pedido' && originalOrderId) {
                fetch(GOOGLE_SHEET_API, {
                    method: 'POST',
                    body: JSON.stringify({
                        resource: 'pedidos',
                        action: 'estado',
                        id: originalOrderId,
                        estado: linkedOrderStatus
                    })
                }).catch(error => console.warn('No se pudo marcar el pedido como facturado:', error));
            }
            showToast('Factura guardada exitosamente', 'success');
            document.getElementById('invoice-editor-modal').classList.remove('open');
            if (typeof window.switchOrdersAdminTab === 'function') {
                window.switchOrdersAdminTab(tipoClienteTab === 'Mayor' ? 'invoices-mayor' : 'invoices-detal');
            }
            cargarPedidos({ force: true });
        } else {
            throw new Error(result.error || 'Error al guardar');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
        console.error(err);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Guardar Factura</span>`;
    }
};


window.toggleVariants = function (motherIdClass, btnEl) {
    var rows = document.querySelectorAll('.variant-row.mother-' + motherIdClass);
    var total = rows.length;
    var anyVisible = false;
    rows.forEach(function (row) {
        if (row.style.display !== 'none') anyVisible = true;
    });
    rows.forEach(function (row) {
        row.style.display = anyVisible ? 'none' : 'table-row';
    });
    if (btnEl) {
        if (anyVisible) {
            btnEl.innerHTML = 'Ver ' + total + ' variantes';
            btnEl.style.background = 'rgba(155,44,250,0.1)';
        } else {
            btnEl.innerHTML = 'Ocultar';
            btnEl.style.background = 'rgba(155,44,250,0.25)';
        }
    }
};



function toggleQuickSaleCatalog() {
    const grid = document.getElementById('quick-sale-results');
    const button = document.getElementById('quick-sale-catalog-toggle');
    if (!grid || !button) return;
    const expanded = grid.classList.toggle('is-expanded');
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Ver menos productos' : 'Ver más productos';
}

function openQuickSaleImage(button) {
    const source = button.querySelector('img');
    if (!source) return;
    let dialog = document.getElementById('quick-sale-image-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'quick-sale-image-dialog';
        dialog.className = 'quick-sale-image-dialog';
        dialog.innerHTML = '<header><strong></strong><button type="button" class="quick-sale-refresh-btn" data-zoom>Ampliar</button><button type="button" class="quick-sale-refresh-btn" data-close aria-label="Cerrar imagen">Cerrar</button></header><div class="quick-sale-image-viewport"><img alt=""></div>';
        document.body.appendChild(dialog);
        dialog.querySelector('[data-close]').onclick = () => dialog.close();
        dialog.querySelector('[data-zoom]').onclick = () => {
            const zoomed = dialog.querySelector('.quick-sale-image-viewport').classList.toggle('is-zoomed');
            dialog.querySelector('[data-zoom]').textContent = zoomed ? 'Reducir' : 'Ampliar';
        };
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    }
    dialog.querySelector('strong').textContent = source.alt;
    dialog.querySelector('img').src = source.currentSrc || source.src;
    dialog.querySelector('img').alt = source.alt;
    dialog.querySelector('.quick-sale-image-viewport').classList.remove('is-zoomed');
    dialog.querySelector('[data-zoom]').textContent = 'Ampliar';
    dialog.showModal();
}

function toggleDesktopSidebar() {
    const layout = document.getElementById('admin-main-content');
    if (!layout) return;
    const compact = layout.classList.toggle('sidebar-compact');
    syncDesktopSidebarToggle(compact);
    try { localStorage.setItem('blyxu-admin-sidebar-compact', String(compact)); } catch (_) {}
}
function syncDesktopSidebarToggle(compact) {
    const button = document.getElementById('desktop-sidebar-toggle');
    if (!button) return;
    button.setAttribute('aria-expanded', String(!compact));
    button.setAttribute('aria-label', compact ? 'Desplegar menú de secciones' : 'Plegar menú de secciones');
    button.title = compact ? 'Desplegar menú' : 'Plegar menú';
    button.textContent = compact ? '☰' : '‹';
}
function initDesktopSidebar() {
    let compact = false;
    try { compact = localStorage.getItem('blyxu-admin-sidebar-compact') === 'true'; } catch (_) {}
    document.getElementById('admin-main-content')?.classList.toggle('sidebar-compact', compact);
    syncDesktopSidebarToggle(compact);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDesktopSidebar);
else initDesktopSidebar();

function openQuickSaleProductInfo(groupKey) {
    const product = getQuickSaleGroupVariant(groupKey);
    if (!product) return;
    const meta = getQuickSaleProductMeta(product);
    let dialog = document.getElementById('quick-sale-info-dialog');
    if (!dialog) {
        dialog = document.createElement('dialog');
        dialog.id = 'quick-sale-info-dialog';
        dialog.className = 'quick-sale-info-dialog';
        dialog.setAttribute('aria-labelledby', 'quick-sale-info-title');
        document.body.appendChild(dialog);
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    }
    const fields = [['Referencia', meta.sku], ['Categoría', meta.category], ['Color', meta.color], ['Tamaño / talla', meta.size], ['Estilo', meta.style], ['Disponibilidad', meta.stock + ' unidades'], ['Precio', formatAdminInvoiceMoney(getQuickSalePrice(product))]];
    dialog.innerHTML = '<header><h3 id="quick-sale-info-title">' + escapeHtml(meta.name) + '</h3><button type="button" class="quick-sale-refresh-btn" aria-label="Cerrar información">Cerrar</button></header><p>' + escapeHtml(meta.description || 'Sin descripción disponible.') + '</p><dl>' + fields.map(([label, value]) => '<div><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(String(value || 'No especificado')) + '</dd></div>').join('') + '</dl>';
    dialog.querySelector('button').onclick = () => dialog.close();
    dialog.showModal();
}
