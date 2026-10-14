/* Keep this video independent of product/banner refreshes. */
(() => {
    const video = document.getElementById('original-store-hero-video');
    const toggle = document.getElementById('original-store-hero-toggle');
    if (!video || !toggle) return;
    let userPaused = false;
    let visible = true;
    video.muted = true;
    video.defaultMuted = true;
    function syncButton() {
        toggle.classList.toggle('is-paused', video.paused);
        toggle.setAttribute('aria-label', video.paused ? 'Reproducir video de bienvenida' : 'Pausar video de bienvenida');
    }
    function play() {
        if (userPaused || !visible || document.hidden) return;
        const result = video.play();
        if (result?.catch) result.catch(syncButton);
    }
    video.addEventListener('play', syncButton);
    video.addEventListener('pause', syncButton);
    toggle.addEventListener('click', () => {
        userPaused = !video.paused;
        if (userPaused) video.pause();
        else play();
    });
    const header = document.getElementById('navbar');
    function sizeHeader() {
        if (header) document.getElementById('inicio').style.setProperty('--original-store-header-height', Math.ceil(header.getBoundingClientRect().height) + 'px');
    }
    sizeHeader();
    if (header && 'ResizeObserver' in window) new ResizeObserver(sizeHeader).observe(header);
    else window.addEventListener('resize', sizeHeader, {passive:true});
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            if (visible) play();
            else video.pause();
        }, {threshold:0}).observe(video);
    }
    document.addEventListener('visibilitychange', () => {if (document.hidden) video.pause();else play();});
    window.addEventListener('pageshow', play);
    video.addEventListener('error', () => {
        // Keep the poster visible if a connection cannot load the video.
        video.pause();
        toggle.style.display = 'none';
    }, true);
    play();
    syncButton();
})();
