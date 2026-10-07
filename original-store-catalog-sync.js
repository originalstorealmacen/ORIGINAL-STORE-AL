/* Keep open catalogs in sync with inventory changes without resetting filters. */
(() => {
    const revisionKey = 'original_store_catalog_revision:' + GOOGLE_SHEET_API;
    let busy = false, dirty = false, lastCheck = Date.now();

    async function refresh(force = false) {
        if (force) dirty = true;
        if (busy || document.hidden || !document.getElementById('coleccion')) return;
        if (document.body.dataset.catalogMode === 'wholesale' && !document.body.classList.contains('wholesale-unlocked')) return;
        if (!dirty && Date.now() - lastCheck < 45000) return;
        busy = true;
        try {
            do {
                dirty = false;
                // A request already running may contain the product just deleted.
                if (productsLoadPromise) await productsLoadPromise;
                const previous = JSON.stringify(allProducts);
                await requestFreshProducts({ showLoading: false });
                lastCheck = Date.now();
                applyPromotionsToProducts();
                if (JSON.stringify(allProducts) !== previous) {
                    if (document.body.dataset.catalogMode === 'wholesale') renderCatalogProducts();
                    else await renderHomeSectionsStaggered({ renderCatalog: true });
                    updateCartUI();
                }
            } while (dirty && !document.hidden);
        } catch (error) {
            console.warn('No se pudo sincronizar el catálogo:', error);
        } finally {
            busy = false;
        }
    }

    window.addEventListener('storage', event => {
        if (event.key === revisionKey || (event.key === PRODUCTS_CACHE_KEY && !event.newValue) || event.key === null) refresh(true);
    });
    window.addEventListener('pageshow', event => { if (event.persisted) refresh(true); });
    window.addEventListener('focus', () => refresh());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    const timer = setInterval(() => refresh(), 60000);
    window.addEventListener('pagehide', event => { if (!event.persisted) clearInterval(timer); });
})();
