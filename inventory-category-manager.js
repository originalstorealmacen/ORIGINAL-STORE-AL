/* Remove a category by moving its products or deleting its full inventory atomically. */
(() => {
    const configKey = 'Home_Removed_Category_Defaults_JSON';
    let removedDefaults = new Set();
    let busy = false;
    const categoryOf = product => normalizeInventoryCategoryKey(product.Categoria || product.categoria || '');
    const rowsFor = key => inventario.filter(product => categoryOf(product) === key);
    const destructive = () => document.getElementById('inventory-category-action')?.value === 'delete';
    const allowed = key => key && !['banner','todos'].includes(key) && (destructive() || key !== 'sin categoria');

    window.isInventoryDefaultCategoryRemoved = key => removedDefaults.has(key);
    window.renderInventoryCategoryManager = () => {
        const select = document.getElementById('inventory-manage-category');
        const target = document.getElementById('inventory-category-destination');
        if (!select || !target || busy) return;
        const selected = select.value;
        const groups = getInventoryCategoryGroups().filter(group => allowed(group.key));
        select.innerHTML = '<option value="">Selecciona una categoría</option>' + groups.map(group =>
            `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)} (${rowsFor(group.key).length} registros)</option>`).join('');
        select.value = groups.some(group => group.key === selected) ? selected : '';
        updateDestination();
    };
    function updateDestination() {
        const source = document.getElementById('inventory-manage-category');
        const destination = document.getElementById('inventory-category-destination');
        if (!source || !destination) return;
        destination.closest('label').hidden = destructive();
        destination.closest('label').style.display = destructive() ? 'none' : '';
        document.getElementById('inventory-delete-category').textContent = destructive() ? 'Eliminar categoría y productos' : 'Eliminar categoría';
        const selected = destination.value;
        const groups = getInventoryCategoryGroups().filter(group => allowed(group.key) && group.key !== source.value);
        destination.innerHTML = '<option value="">Sin categoría</option>' + groups.map(group =>
            `<option value="${escapeHtml(group.key)}">${escapeHtml(group.label)}</option>`).join('');
        destination.value = groups.some(group => group.key === selected) ? selected : '';
        const rows = rowsFor(source.value);
        const summary = document.getElementById('inventory-category-impact');
        summary.textContent = source.value ? (rows.length
            ? `${rows.length} registros de productos y variantes se moverán. Sus precios, fotos y existencias se conservarán.`
            : 'Esta categoría no tiene productos. Se quitará de las sugerencias.') : 'Elige la categoría que quieres quitar.';
        if(destructive() && source.value) summary.textContent = rows.length + ' registros de productos y variantes se eliminarán del inventario. Esta acción no se puede deshacer. Los pedidos y facturas anteriores se conservan.';
        destination.disabled = destructive() || !rows.length;
        document.getElementById('inventory-delete-category').disabled = !source.value;
    }
    async function saveRemovedDefaults(next) {
        const value = JSON.stringify([...next]);
        const response = await fetch(GOOGLE_SHEET_API, {method:'POST', body:JSON.stringify({action:'set_config',Clave:configKey,Valor:value})});
        const result = await response.json();
        if (!(result.ok || result.status === 'success')) throw new Error(result.error || 'No se pudo guardar la categoría.');
        removedDefaults = next;
        updateSiteConfigCacheForAdmin(configKey, value);
        siteConfigPromise = null;
    }
    function confirmCategoryChange({sourceLabel, sourceKey, products, records, destinationLabel}) {
        return new Promise(resolve => {
            const deleting = destinationLabel === undefined;
            const dialog = document.createElement('dialog');
            dialog.className = 'inventory-category-dialog';
            dialog.setAttribute('aria-labelledby', 'inventory-category-dialog-title');
            dialog.setAttribute('aria-describedby', 'inventory-category-dialog-description');
            dialog.innerHTML = `
                <form method="dialog" class="inventory-confirm-form">
                    <header><span class="inventory-confirm-kicker">Gestión del inventario</span>
                        <button type="button" class="inventory-confirm-close" aria-label="Cerrar confirmación">×</button>
                        <h2 id="inventory-category-dialog-title">${deleting ? 'Eliminar categoría y productos' : 'Quitar categoría'}</h2>
                    </header>
                    <div class="inventory-confirm-content">
                        <p id="inventory-category-dialog-description"></p>
                        <p class="inventory-confirm-note"></p>
                        ${deleting ? '<label for="inventory-category-confirmation">Escribe el nombre de la categoría para confirmar</label><strong class="inventory-confirm-category"></strong><input class="form-control" id="inventory-category-confirmation" autocomplete="off" spellcheck="false" required>' : ''}
                    </div>
                    <footer><button type="button" class="admin-btn secondary inventory-confirm-cancel">Cancelar</button>
                        <button type="submit" class="admin-btn danger inventory-confirm-submit">${deleting ? 'Eliminar categoría y productos' : 'Quitar categoría'}</button>
                    </footer>
                </form>`;
            dialog.querySelector('#inventory-category-dialog-description').textContent = deleting
                ? `Se eliminarán ${products} productos y ${records} registros de variantes de «${sourceLabel}».`
                : `${records} registros de «${sourceLabel}» pasarán a «${destinationLabel}».`;
            dialog.querySelector('.inventory-confirm-note').textContent = deleting
                ? 'Esta acción no se puede deshacer. Los pedidos y las facturas anteriores se conservan.'
                : 'No se eliminarán productos ni variantes. Sus precios, fotos y existencias se conservarán.';
            const input = dialog.querySelector('input');
            const submit = dialog.querySelector('.inventory-confirm-submit');
            if (input) {
                dialog.querySelector('.inventory-confirm-category').textContent = sourceLabel;
                submit.disabled = true;
                input.addEventListener('input', () => {
                    submit.disabled = normalizeInventoryCategoryKey(input.value) !== sourceKey;
                });
            }
            const previousFocus = document.activeElement;
            const previousOverflow = document.body.style.overflow;
            document.body.appendChild(dialog);
            document.body.style.overflow = 'hidden';
            let settled = false;
            function finish(value) {
                if (settled) return;
                settled = true;
                dialog.close();
                dialog.remove();
                document.body.style.overflow = previousOverflow;
                if (previousFocus?.isConnected) previousFocus.focus();
                resolve(value);
            }
            dialog.querySelector('form').addEventListener('submit', event => {
                event.preventDefault();
                if (input && normalizeInventoryCategoryKey(input.value) !== sourceKey) return;
                finish(input ? input.value.trim() : true);
            });
            dialog.querySelector('.inventory-confirm-cancel').addEventListener('click', () => finish(null));
            dialog.querySelector('.inventory-confirm-close').addEventListener('click', () => finish(null));
            dialog.addEventListener('cancel', event => {event.preventDefault();finish(null);});
            dialog.addEventListener('click', event => {
                const bounds = dialog.getBoundingClientRect();
                if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) finish(null);
            });
            dialog.showModal();
            (input || dialog.querySelector('.inventory-confirm-cancel')).focus();
        });
    }

    async function removeCategory(event) {
        event.preventDefault();
        if (busy) return;
        const source = document.getElementById('inventory-manage-category').value;
        const target = document.getElementById('inventory-category-destination').value;
        if (!allowed(source) || (!destructive() && source === target)) return;
        if (!secureAdminCredential) {showToast('Inicia sesión como administrador para gestionar categorías.', 'error'); return;}
        // Refresh before computing the impact so stale cached rows are not silently missed.
        busy = true;
        const form = event.currentTarget;
        const controls = [...form.querySelectorAll('button,input,select')];
        controls.forEach(control => {control.disabled = true;});
        const status = document.getElementById('inventory-category-status');
        let moved = 0;
        let deleted = null;
        try {
            status.textContent = 'Verificando inventario actualizado…';
            await cargarInventario({force:true,silent:true,throwOnError:true});
            const rows = rowsFor(source);
            const groups = getInventoryCategoryGroups();
            const sourceLabel = groups.find(group=>group.key===source)?.label || source;
            if(destructive()){
                const post=async body=>{const response=await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify(body)});const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'No se pudo confirmar la operación. Actualiza antes de repetirla.');return result;};
                const preview=await post({action:'categorydeletepreview',category:source});
                const confirmation=await confirmCategoryChange({sourceLabel,sourceKey:source,products:preview.products,records:preview.records});
                if(confirmation===null || normalizeInventoryCategoryKey(confirmation)!==source){status.textContent='Operación cancelada. No se eliminó ningún producto.';return;}
                status.textContent='Eliminando categoría y productos…';
                const result=await post({action:'categorydeleteproducts',category:source,signature:preview.signature,confirmation});
                deleted=result;
                removedDefaults=new Set(result.removedDefaults);updateSiteConfigCacheForAdmin(configKey,JSON.stringify(result.removedDefaults));siteConfigPromise=null;clearPublicProductsCache();
                await cargarInventario({force:true,silent:true,throwOnError:true});
                status.textContent='Categoría eliminada con '+result.deletedProducts+' productos y '+result.deletedRecords+' registros de variantes.';
                showToast('Categoría y productos eliminados.','success');return;
            }
            const destinationLabel = target ? groups.find(group=>group.key===target)?.label : 'Sin categoría';
            if (!destinationLabel) throw new Error('La categoría de destino cambió. Vuelve a seleccionarla.');
            const ids = rows.map(getInventoryVariationId);
            const allIds = inventario.map(getInventoryVariationId);
            if (ids.some(id=>!id || allIds.filter(value=>value===id).length!==1)) throw new Error('Hay referencias vacías o repetidas. Corrígelas antes de mover esta categoría.');
            if (!await confirmCategoryChange({sourceLabel,sourceKey:source,records:rows.length,destinationLabel})) {status.textContent = 'Operación cancelada.'; return;}
            for (let index=0;index<rows.length;index++) {
                status.textContent = `Moviendo registros: ${index+1} de ${rows.length}…`;
                const response = await fetch(GOOGLE_SHEET_API,{method:'POST',body:JSON.stringify({resource:'productos',action:'editar',id:ids[index],data:{Categoria:destinationLabel,'Categoría':destinationLabel}})});
                const result = await response.json();
                if (!(result.ok || result.status === 'success')) throw new Error(result.error || 'No se pudo mover un producto.');
                rows[index].Categoria = destinationLabel;
                rows[index].categoria = destinationLabel;
                moved++;
            }
            await saveRemovedDefaults(new Set([...removedDefaults,source]));
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true,throwOnError:true});
            if (rowsFor(source).length) throw new Error('La categoría recibió nuevos productos durante el cambio. Revisa los registros restantes.');
            status.textContent = `Categoría quitada. ${moved} registros movidos a ${destinationLabel}.`;
            showToast('Categoría quitada; productos conservados.', 'success');
        } catch(error) {
            status.textContent = deleted ? `Categoría eliminada con ${deleted.deletedProducts} productos y ${deleted.deletedRecords} registros. No se pudo actualizar la vista; recarga el inventario.` : `${moved ? `${moved} registros ya fueron movidos. ` : ''}${error.message} Puedes revisar el inventario y reintentar.`;
            clearPublicProductsCache();
            await cargarInventario({force:true,silent:true,throwOnError:true}).catch(()=>{});
        } finally {
            busy = false;
            controls.forEach(control=>{control.disabled=false;});
            updateCategoryOptions();
        }
    }
    document.addEventListener('DOMContentLoaded', async () => {
        document.getElementById('inventory-category-manager-form')?.addEventListener('submit', removeCategory);
        document.getElementById('inventory-manage-category')?.addEventListener('change', updateDestination);
        document.getElementById('inventory-category-action')?.addEventListener('change',()=>{renderInventoryCategoryManager();});
        const config = await loadSiteConfigForAdmin();
        try {const list=JSON.parse(config[configKey] || '[]'); if(Array.isArray(list)) removedDefaults=new Set(list.map(normalizeInventoryCategoryKey));} catch (_) {}
        updateCategoryOptions();
    });
})();
