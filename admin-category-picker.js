/* In-page category picker: one registered option per normalized category. */
(() => {
    function initCategoryPicker() {
        const input = document.getElementById('prod-categoria');
        const trigger = document.getElementById('admin-category-picker-toggle');
        if (!input || !trigger) return;
        const popup = document.createElement('div');
        popup.id = 'admin-category-picker-list';
        popup.className = 'admin-category-picker-popup';
        popup.setAttribute('role', 'listbox');
        popup.setAttribute('aria-label', 'Categorías registradas');
        popup.hidden = true;
        document.body.appendChild(popup);
        let open = false, active = -1, options = [];
        const groups = () => getInventoryCategoryGroups({includeDefaults:false});
        function canonical(value) {
            const key = normalizeInventoryCategoryKey(value);
            return groups().find(group => group.key === key)?.label || formatInventoryCategoryLabel(value);
        }
        function normalizeInput() {
            const value = canonical(input.value);
            if (input.value !== value) {
                input.value = value;
                input.dispatchEvent(new Event('input', {bubbles:true}));
            }
        }
        function position() {
            if (!open) return;
            const rect = input.parentElement.getBoundingClientRect();
            const view = window.visualViewport;
            const top = view?.offsetTop || 0;
            const bottom = top + (view?.height || innerHeight);
            const below = bottom - rect.bottom - 10;
            const above = rect.top - top - 10;
            const showAbove = below < 170 && above > below;
            const available = Math.max(80, showAbove ? above : below);
            popup.style.width = Math.min(rect.width, innerWidth - 20) + 'px';
            popup.style.left = Math.max(10, Math.min(rect.left, innerWidth - rect.width - 10)) + 'px';
            popup.style.maxHeight = Math.min(300, available) + 'px';
            popup.style.top = '';
            popup.style.bottom = '';
            if (showAbove) popup.style.bottom = Math.max(10, innerHeight - rect.top + 6) + 'px';
            else popup.style.top = Math.max(top + 8, rect.bottom + 6) + 'px';
        }
        function close() {
            open = false;
            popup.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            trigger.setAttribute('aria-expanded', 'false');
            input.removeAttribute('aria-activedescendant');
        }
        function highlight(index) {
            active = index;
            const buttons = popup.querySelectorAll('[role="option"]');
            buttons.forEach((button, i) => {
                button.classList.toggle('is-active', i === active);
                button.setAttribute('aria-selected', String(i === active));
            });
            if (buttons[active]) {
                input.setAttribute('aria-activedescendant', buttons[active].id);
                buttons[active].scrollIntoView({block:'nearest'});
            } else input.removeAttribute('aria-activedescendant');
        }
        function render(filter = true) {
            const all = groups();
            const query = normalizeSearchText(input.value);
            const key = normalizeInventoryCategoryKey(input.value);
            const matches = filter && query
                ? all.filter(group => normalizeSearchText(group.label).includes(query) || group.key.includes(key))
                : all;
            options = matches.map(group => ({value:group.label, label:group.label}));
            if (input.value.trim() && !all.some(group => group.key === key)) {
                const value = canonical(input.value);
                options.push({value, label:'Crear categoría: ' + value});
            }
            popup.replaceChildren();
            if (!options.length) {
                const empty = document.createElement('p');
                empty.className = 'admin-category-picker-empty';
                empty.textContent = all.length ? 'No hay coincidencias. Puedes escribir una categoría nueva.' : 'Aún no hay categorías registradas. Puedes escribir una nueva.';
                popup.appendChild(empty);
            }
            options.forEach((option, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.id = 'admin-category-option-' + index;
                button.className = 'admin-category-picker-option';
                button.setAttribute('role', 'option');
                button.setAttribute('tabindex', '-1');
                button.dataset.index = String(index);
                button.textContent = option.label;
                popup.appendChild(button);
            });
            position();
            const selected = options.findIndex(option => normalizeInventoryCategoryKey(option.value) === key);
            highlight(selected >= 0 ? selected : (options.length ? 0 : -1));
        }
        function show(filter = false) {
            open = true;
            popup.hidden = false;
            input.setAttribute('aria-expanded', 'true');
            trigger.setAttribute('aria-expanded', 'true');
            render(filter);
        }
        function choose(index) {
            if (!options[index]) return;
            input.value = options[index].value;
            close();
            input.dispatchEvent(new Event('input', {bubbles:true}));
            input.dispatchEvent(new Event('change', {bubbles:true}));
            trigger.focus({preventScroll:true});
        }
        trigger.addEventListener('click', () => open ? close() : show(false));
        input.addEventListener('focus', () => show(false));
        input.addEventListener('input', event => {if (!event.isTrusted) return;if (!open) show(true);else render(true);});
        input.addEventListener('change', normalizeInput);
        input.addEventListener('blur', () => setTimeout(() => {
            if (popup.contains(document.activeElement) || document.activeElement === trigger) return;
            normalizeInput();
            close();
        }, 150));
        input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (!open) {show(false);return;}
                if (options.length) highlight((active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
            } else if (event.key === 'Enter' && open && active >= 0) {
                event.preventDefault();
                choose(active);
            } else if (event.key === 'Escape' && open) {
                event.preventDefault();
                close();
            } else if (event.key === 'Tab') close();
        });
        popup.addEventListener('mousedown', event => event.preventDefault());
        popup.addEventListener('click', event => {
            const button = event.target.closest('[data-index]');
            if (button) choose(Number(button.dataset.index));
        });
        document.addEventListener('pointerdown', event => {
            if (open && !popup.contains(event.target) && !input.parentElement.contains(event.target)) close();
        });
        input.form?.addEventListener('submit', normalizeInput, true);
        input.form?.addEventListener('reset', close);
        const inventoryFilter = document.getElementById('admin-inventory-category-filter');
        if (inventoryFilter) new MutationObserver(() => {if (open) render(false);}).observe(inventoryFilter, {childList:true});
        window.addEventListener('resize', position, {passive:true});
        window.addEventListener('scroll', position, {capture:true,passive:true});
        window.visualViewport?.addEventListener('resize', position, {passive:true});
        window.visualViewport?.addEventListener('scroll', position, {passive:true});
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCategoryPicker);
    else initCategoryPicker();
})();
