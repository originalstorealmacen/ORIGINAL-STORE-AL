/* Presentation helpers: existing inventory filtering remains the source of truth. */
(() => {
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('admin-inventory-search');
        const clear = document.getElementById('inventory-search-clear');
        const summary = document.getElementById('inventory-search-summary');
        const table = document.getElementById('inventory-tbody');
        if (!input || !clear || !summary || !table) return;
        function updateSummary() {
            clear.hidden = !input.value;
            if (typeof getFilteredInventory !== 'function') return;
            const count = getFilteredInventory().filter(item => !item.isChild).length;
            const category = document.getElementById('admin-inventory-category-filter');
            const filtered = input.value.trim() || (category?.value && category.value !== 'todos');
            summary.textContent = filtered
                ? `${count} producto${count === 1 ? '' : 's'} encontrado${count === 1 ? '' : 's'}`
                : 'Busca por nombre, categoría, referencia, SKU o ID.';
        }
        function resetSearch() {
            input.value = '';
            input.dispatchEvent(new Event('input', {bubbles: true}));
            input.focus();
        }
        clear.addEventListener('click', resetSearch);
        input.addEventListener('keydown', event => {
            if (event.key === 'Escape' && input.value) {event.preventDefault();resetSearch();}
        });
        input.addEventListener('input', () => {clear.hidden = !input.value;});
        input.addEventListener('search', () => input.dispatchEvent(new Event('input', {bubbles: true})));
        new MutationObserver(updateSummary).observe(table, {childList: true});
        updateSummary();
    });
})();
