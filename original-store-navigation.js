/* Keep navigation close at hand without covering the page while reading. */
(() => {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;
  const menu = document.getElementById('nav-links');
  let referenceY = Math.max(0, window.scrollY);
  let scheduled = false;

  function reveal() {
    navbar.classList.remove('navigation-is-hidden');
    referenceY = Math.max(0, window.scrollY);
  }

  function update() {
    scheduled = false;
    const currentY = Math.max(0, window.scrollY);
    const delta = currentY - referenceY;
    const keyboardFocus = navbar.contains(document.activeElement) &&
      document.activeElement.matches(':focus-visible');
    if (currentY < navbar.offsetHeight + 40 || menu?.classList.contains('open') || keyboardFocus) {
      reveal();
    } else if (Math.abs(delta) >= 6) {
      navbar.classList.toggle('navigation-is-hidden', delta > 0);
      referenceY = currentY;
    }
  }

  window.addEventListener('scroll', () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  navbar.addEventListener('focusin', reveal);
  window.addEventListener('pageshow', reveal);
})();
