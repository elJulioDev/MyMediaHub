/* ══════════════════════════════════════════════════════════════════
   TOPBAR + SIDEBAR TOGGLE — MyMediaHub
   Maneja apertura/cierre del sidebar en mobile Y desktop.
   Persiste el estado en localStorage para desktop.
   ══════════════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    const STORAGE_KEY   = 'mmh_sidebar_open';
    const MOBILE_BP     = 768;

    const sidebar       = document.getElementById('appSidebar');
    const toggleBtn     = document.getElementById('sidebarToggleBtn');
    const backdrop      = document.getElementById('sidebarBackdrop')
                          || createBackdrop();

    if (!sidebar || !toggleBtn) return;

    /* ── Crear backdrop si no existe ─────────────────────────────── */
    function createBackdrop() {
        const el = document.createElement('div');
        el.id = 'sidebarBackdrop';
        el.className = 'sidebar-backdrop';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        return el;
    }

    /* ── Detectar mobile ─────────────────────────────────────────── */
    const isMobile = () => window.innerWidth <= MOBILE_BP;

    /* ── Estado actual ───────────────────────────────────────────── */
    function isSidebarOpen() {
        if (isMobile()) {
            return sidebar.classList.contains('is-open');
        }
        // Desktop: abierto = NO colapsado
        return !document.body.classList.contains('sidebar-is-collapsed');
    }

    /* ── Abrir sidebar ───────────────────────────────────────────── */
    function openSidebar() {
        if (isMobile()) {
            sidebar.classList.add('is-open');
            backdrop.classList.add('is-visible');
            document.body.style.overflow = 'hidden';
        } else {
            document.body.classList.remove('sidebar-is-collapsed');
            localStorage.setItem(STORAGE_KEY, 'true');
        }
        toggleBtn.setAttribute('aria-expanded', 'true');
    }

    /* ── Cerrar sidebar ──────────────────────────────────────────── */
    function closeSidebar() {
        if (isMobile()) {
            sidebar.classList.remove('is-open');
            backdrop.classList.remove('is-visible');
            document.body.style.overflow = '';
        } else {
            document.body.classList.add('sidebar-is-collapsed');
            localStorage.setItem(STORAGE_KEY, 'false');
        }
        toggleBtn.setAttribute('aria-expanded', 'false');
    }

    /* ── Toggle ──────────────────────────────────────────────────── */
    function toggleSidebar() {
        isSidebarOpen() ? closeSidebar() : openSidebar();
    }

    /* ── Restaurar estado guardado (solo desktop) ─────────────────── */
    function restoreDesktopState() {
        if (isMobile()) return;
        const saved = localStorage.getItem(STORAGE_KEY);
        // Por defecto abierto. Si el usuario lo cerró, respetar.
        if (saved === 'false') {
            document.body.classList.add('sidebar-is-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
    }

    /* ── Eventos ─────────────────────────────────────────────────── */
    toggleBtn.addEventListener('click', toggleSidebar);

    backdrop.addEventListener('click', closeSidebar);

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isSidebarOpen()) closeSidebar();
    });

    // Al redimensionar, limpiar estado mobile si se pasa a desktop
    window.addEventListener('resize', () => {
        if (!isMobile()) {
            sidebar.classList.remove('is-open');
            backdrop.classList.remove('is-visible');
            document.body.style.overflow = '';
        }
    }, { passive: true });

    /* ── Init ────────────────────────────────────────────────────── */
    restoreDesktopState();

})();