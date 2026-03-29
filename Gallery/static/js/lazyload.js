'use strict';

(function () {

    // Margen previo al viewport: precarga 400px antes de que el elemento sea visible
    const ROOT_MARGIN = '400px 0px';

    /**
     * Intercambia el LQIP (src actual) por la imagen de alta calidad (data-src).
     * Usa un Image() auxiliar para esperar a que la HQ esté lista antes de mostrarla,
     * evitando el parpadeo del placeholder al swappear.
     */
    function loadImage(img) {
        const hqSrc = img.dataset.src;
        if (!hqSrc) return;

        const loader = new Image();

        loader.onload = function () {
            img.src = hqSrc;
            // Transición suave: quitar blur
            img.classList.add('loaded');
            img.classList.remove('blur-up');
            delete img.dataset.src;
        };

        loader.onerror = function () {
            // Fallback: mostrar sin blur si la HQ falla
            img.classList.remove('blur-up');
            delete img.dataset.src;
        };

        loader.src = hqSrc;
    }

    function init() {
        const targets = Array.from(document.querySelectorAll('img.blur-up[data-src]'));
        if (!targets.length) return;

        if ('IntersectionObserver' in window) {
            const io = new IntersectionObserver(function (entries, observer) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        loadImage(entry.target);
                        observer.unobserve(entry.target);
                    }
                });
            }, { rootMargin: ROOT_MARGIN });

            targets.forEach(function (img) { io.observe(img); });

        } else {
            // Fallback para navegadores sin IntersectionObserver
            targets.forEach(loadImage);
        }
    }

    // Ejecutar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();