const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const mediaItems = Array.from(document.querySelectorAll('.open-media')); 
const appContainer = document.querySelector('.app-container'); // Referencia al fondo

// Elementos de la barra
const modalLoader = document.getElementById('modalLoader');
const modalProgressBar = document.getElementById('modalProgressBar');
const modalProgressText = document.getElementById('modalProgressText');

let currentIndex = -1; 
let currentXhr = null; 

// --- NUEVAS REFERENCIAS ---
const btnMoreOptions = document.getElementById('btnMoreOptions');
const modalDropdown = document.getElementById('modalDropdown');
const btnDownload = document.getElementById('btnDownload');
const btnAddToAlbum = document.getElementById('btnAddToAlbum');

// 1. Lógica para abrir/cerrar el menú
btnMoreOptions.addEventListener('click', (e) => {
    e.stopPropagation(); 
    modalDropdown.classList.toggle('d-none');
});

// 2. Cerrar el menú si hacemos click fuera
document.addEventListener('click', (e) => {
    if (!modalDropdown.classList.contains('d-none') && 
        !modalDropdown.contains(e.target) && 
        !btnMoreOptions.contains(e.target)) {
        modalDropdown.classList.add('d-none');
    }
});

btnAddToAlbum.addEventListener('click', () => {
    alert('Funcionalidad "Añadir a álbum" próximamente.');
    modalDropdown.classList.add('d-none');
});

// --- OPTIMIZACIÓN 1: URLs INTELIGENTES ---
function getOptimizedUrl(fullUrl, isVideo = false) {
    const separator = fullUrl.includes('?') ? '&' : '?';
    if (isVideo) return `${fullUrl}${separator}tr=orig-true`;
    
    // Optimización de imágenes
    const width = window.innerWidth;
    const roundedWidth = Math.ceil(width / 200) * 200; 
    return `${fullUrl}${separator}tr=w-${roundedWidth},f-auto,q-auto`; 
}

// --- FUNCIÓN PRINCIPAL: ABRIR MODAL ---
async function openModal(index) {
    if (index < 0 || index >= mediaItems.length) return;

    // A. LIMPIEZA DE MEMORIA
    if (modalContent.firstChild) {
        if (modalContent.firstChild.tagName === 'IMG') {
            modalContent.firstChild.src = ''; 
            modalContent.firstChild.removeAttribute('src');
        } else if (modalContent.firstChild.tagName === 'VIDEO') {
            modalContent.firstChild.pause();
            modalContent.firstChild.src = '';
            modalContent.firstChild.load();
        }
    }
    modalContent.innerHTML = ''; 

    // B. OPTIMIZACIÓN DE RENDIMIENTO (LA SOLUCIÓN AL LAG)
    // "Congelamos" el fondo. visibility:hidden mantiene el scroll pero detiene el "paint" del navegador.
    if (appContainer) {
        appContainer.style.visibility = 'hidden'; 
    }
    document.body.style.backgroundColor = '#131314'; // Aseguramos fondo negro puro

    currentIndex = index;
    const item = mediaItems[index];
    const rawUrl = item.getAttribute('data-full-url');

    // Configurar descarga
    if (btnDownload) {
        btnDownload.removeAttribute('href');
        btnDownload.style.cursor = 'pointer';
        const filename = decodeURIComponent(rawUrl.split('/').pop().split('?')[0]);
        btnDownload.onclick = (e) => {
            e.preventDefault();
            modalDropdown.classList.add('d-none');
            forceDownload(rawUrl, filename);
        };
    }
    modalDropdown.classList.add('d-none');

    const isVideo = item.querySelector('.fa-play-circle') !== null;
    
    // UI Inicial
    modalLoader.classList.add('d-none'); 
    modal.classList.remove('d-none'); 
    document.body.style.overflow = 'hidden'; 
    modal.focus();

    const finalUrl = getOptimizedUrl(rawUrl, isVideo);

    if (isVideo) {
        const video = document.createElement('video');
        video.src = finalUrl;
        video.controls = true;
        video.autoplay = true;
        // GPU Acceleration para video
        video.style.transform = "translateZ(0)";
        video.style.willChange = "transform";
        Object.assign(video.style, { maxWidth: '100%', maxHeight: '90vh' });
        modalContent.appendChild(video);
    } else {
        // 1. Miniatura Blur-up
        const thumbImg = item.querySelector('img');
        let placeholder = null;
        if (thumbImg) {
            placeholder = document.createElement('img');
            placeholder.src = thumbImg.src;
            Object.assign(placeholder.style, {
                maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
                filter: 'blur(10px)', position: 'absolute', zIndex: '1', opacity: '0.6'
            });
            modalContent.appendChild(placeholder);
        }

        // 2. Spinner
        modalProgressText.innerText = "Cargando HD...";
        modalLoader.classList.remove('d-none');
        modalProgressBar.style.width = '100%'; 

        // 3. IMAGEN OPTIMIZADA (GIF/JPG)
        const img = document.createElement('img');
        
        img.fetchPriority = "high"; // Prioridad de Red
        img.decoding = "async";     // Prioridad de CPU (Decodificación)

        // >>> OPTIMIZACIÓN CLAVE GPU <<<
        // Mueve la imagen a su propia capa compositora. Evita repintados al mover el mouse.
        img.style.transform = "translateZ(0)";
        img.style.willChange = "transform, opacity";
        img.style.backfaceVisibility = "hidden";

        img.onload = () => {
            img.style.opacity = '1';     
            if (placeholder) placeholder.remove(); 
            modalLoader.classList.add('d-none');   
        };

        img.onerror = () => {
            modalProgressText.innerText = "Error al cargar";
        };

        Object.assign(img.style, {
            maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
            zIndex: '2', position: 'relative', opacity: '0', transition: 'opacity 0.3s ease'
        });

        img.src = finalUrl;
        modalContent.appendChild(img);
    }
}

function closeModal() {
    // 1. Limpieza de memoria
    if (modalContent.firstChild) {
         modalContent.firstChild.src = ''; 
    }
    modalContent.innerHTML = ''; 
    
    // 2. Restaurar interfaz
    modal.classList.add('d-none');
    modalLoader.classList.add('d-none'); 
    document.body.style.overflow = 'auto';

    // 3. RESTAURAR FONDO (Vuelve a pintar la grilla)
    if (appContainer) {
        appContainer.style.visibility = 'visible';
    }
}

// --- UTILIDADES ---
function forceDownload(url, filename) {
    updateProgressBar(10, "Iniciando...");
    fetch(url)
        .then(r => {
            if (!r.ok) throw new Error('Network error');
            const total = parseInt(r.headers.get('content-length') || 0, 10);
            let loaded = 0;
            const reader = r.body.getReader();
            return new ReadableStream({
                start(controller) {
                    function push() {
                        reader.read().then(({ done, value }) => {
                            if (done) { controller.close(); return; }
                            loaded += value.byteLength;
                            if (total) updateProgressBar((loaded/total)*100, "Descargando...");
                            controller.enqueue(value);
                            push();
                        });
                    }
                    push();
                }
            });
        })
        .then(stream => new Response(stream))
        .then(r => r.blob())
        .then(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none'; a.href = blobUrl; a.download = filename;
            document.body.appendChild(a); a.click();
            window.URL.revokeObjectURL(blobUrl); document.body.removeChild(a);
            updateProgressBar(100, "Completado");
        })
        .catch(err => {
            console.error(err);
            window.open(url, '_blank');
            modalLoader.classList.add('d-none');
        });
}

function updateProgressBar(percent, text) {
    modalLoader.classList.remove('d-none');
    modalProgressBar.style.width = percent + '%';
    if (text) modalProgressText.innerText = text;
    if (percent >= 100 && text === "Completado") {
        setTimeout(() => { modalLoader.classList.add('d-none'); modalProgressBar.style.width = '0%'; }, 300);
    }
}

// --- EVENTOS DE NAVEGACIÓN ---
mediaItems.forEach((item, index) => {
    item.addEventListener('click', () => openModal(index));
});

function nextImage() { openModal(currentIndex + 1); }
function prevImage() { openModal(currentIndex - 1); }

document.getElementById('nextBtn').addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });
document.getElementById('prevBtn').addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
document.getElementById('closeModal').addEventListener('click', closeModal);

// --- MODAL DE BORRADO ---
const deleteModalEl = document.getElementById('deleteConfirmModal');
const deleteModalBootstrap = new bootstrap.Modal(deleteModalEl);
const btnConfirmDeleteAction = document.getElementById('btnConfirmDeleteAction');

function promptDeleteFile() {
    // Cerramos el menú dropdown
    if (!modalDropdown.classList.contains('d-none')) {
        modalDropdown.classList.add('d-none');
    }
    
    // TRUCO DE RENDIMIENTO:
    // Si hay un GIF pesado, le bajamos la opacidad para que el navegador
    // no se mate intentando renderizar cada frame con alta fidelidad detrás del modal.
    const img = modalContent.querySelector('img');
    if (img) {
        img.style.opacity = '0.3'; // Atenuar visualmente
        img.style.willChange = 'auto'; // Liberar GPU momentáneamente
    }
    
    deleteModalBootstrap.show();
}

// Y restauramos la opacidad si el usuario CANCELA el borrado
deleteModalEl.addEventListener('hidden.bs.modal', function () {
    const img = modalContent.querySelector('img');
    if (img) {
        img.style.opacity = '1';
        img.style.willChange = 'transform, opacity'; // Reactivar GPU
    }
});

function executeDeletion() {
    const currentItem = mediaItems[currentIndex];
    const fileId = currentItem.getAttribute('data-id'); 
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    const originalBtnText = btnConfirmDeleteAction.innerHTML;
    
    btnConfirmDeleteAction.disabled = true;
    btnConfirmDeleteAction.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Borrando...';

    fetch(URLS.eliminar, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken },
        body: `archivo_id=${fileId}`
    })
    .then(r => r.json())
    .then(data => {
        btnConfirmDeleteAction.disabled = false;
        btnConfirmDeleteAction.innerHTML = originalBtnText;
        deleteModalBootstrap.hide();

        if (data.success) {
            closeModal();
            // Animación y eliminación del DOM
            currentItem.style.transition = "transform 0.3s ease, opacity 0.3s ease";
            currentItem.style.transform = "scale(0)";
            currentItem.style.opacity = "0";
            setTimeout(() => { 
                currentItem.remove(); 
                const indexToRemove = mediaItems.indexOf(currentItem);
                if (indexToRemove > -1) mediaItems.splice(indexToRemove, 1);
            }, 300);
        } else { alert('Error: ' + data.error); }
    })
    .catch(err => {
        btnConfirmDeleteAction.disabled = false;
        btnConfirmDeleteAction.innerHTML = originalBtnText;
        deleteModalBootstrap.hide();
        alert('Error de conexión.');
    });
}

document.getElementById('btnDelete').addEventListener('click', promptDeleteFile);
btnConfirmDeleteAction.addEventListener('click', executeDeletion);

// CONTROL DE TECLADO
document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('d-none')) return;
    if (deleteModalEl.classList.contains('show')) {
        if (e.key === 'Enter') executeDeletion();
        return;
    }
    switch(e.key) {
        case 'ArrowRight': nextImage(); break;
        case 'ArrowLeft': prevImage(); break;
        case 'Escape': closeModal(); break;
        case 'Delete': promptDeleteFile(); break;
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}