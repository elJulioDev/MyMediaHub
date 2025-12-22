const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const mediaItems = Array.from(document.querySelectorAll('.open-media')); 

// Elementos de la barra
const modalLoader = document.getElementById('modalLoader');
const modalProgressBar = document.getElementById('modalProgressBar');
const modalProgressText = document.getElementById('modalProgressText');

let currentIndex = -1; 
let currentXhr = null; // Referencia para cancelar descargas

// 1. URL OPTIMIZADA
function getOptimizedUrl(fullUrl, isVideo = false) {
    if (isVideo) {
        const separator = fullUrl.includes('?') ? '&' : '?';
        return `${fullUrl}${separator}tr=orig-true`;
    }
    const width = window.innerWidth;
    const roundedWidth = Math.ceil(width / 200) * 200; 
    const transformations = `tr=w-${roundedWidth}`; 
    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}${transformations}`;
}

// 2. PRECARGA (Solo imágenes siguientes)
function preloadNextFiles(startIndex) {
    const prefetchCount = 2; 
    for (let i = 1; i <= prefetchCount; i++) {
        const nextIndex = startIndex + i;
        if (nextIndex >= mediaItems.length) break;

        const item = mediaItems[nextIndex];
        const rawUrl = item.getAttribute('data-full-url');
        if (item.querySelector('.fa-play-circle') === null) { 
            const img = new Image();
            img.src = getOptimizedUrl(rawUrl, false);
        }
    }
}

// 3. CARGA CON XHR (BARRA DE PROGRESO)
function loadImageWithXHR(url) {
    return new Promise((resolve, reject) => {
        if (currentXhr) { currentXhr.abort(); } // Cancelar anterior

        const xhr = new XMLHttpRequest();
        currentXhr = xhr;

        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
            if (event.lengthComputable) {
                // Si el servidor nos dice el tamaño total
                const percentComplete = (event.loaded / event.total) * 100;
                updateProgressBar(percentComplete, `Cargando... ${Math.round(percentComplete)}%`);
            } else {
                // Si el servidor NO dice el tamaño (Chunked encoding)
                // Ponemos la barra al 100% visualmente pero con texto de espera
                updateProgressBar(100, "Procesando imagen...");
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                updateProgressBar(100, "Completado");
                resolve(window.URL.createObjectURL(xhr.response));
            } else {
                reject(new Error(`Error HTTP: ${xhr.status}`));
            }
            currentXhr = null;
        };

        xhr.onerror = () => {
            // Esto suele saltar por CORS (Cross-Origin Resource Sharing)
            reject(new Error('Error de Red / CORS'));
            currentXhr = null;
        };
        
        xhr.send();
    });
}

function updateProgressBar(percent, text) {
    modalLoader.classList.remove('d-none');
    modalProgressBar.style.width = percent + '%';
    if (text) modalProgressText.innerText = text;
    
    // Si llega a 100, ocultar tras un breve delay (pero no si es "Procesando...")
    if (percent >= 100 && text === "Completado") {
        setTimeout(() => {
            modalLoader.classList.add('d-none');
            modalProgressBar.style.width = '0%'; // Reset visual
        }, 300);
    }
}

// 4. ABRIR MODAL
async function openModal(index) {
    if (index < 0 || index >= mediaItems.length) return;
    preloadNextFiles(index);

    currentIndex = index;
    const item = mediaItems[index];
    const rawUrl = item.getAttribute('data-full-url');
    const isVideo = item.querySelector('.fa-play-circle') !== null;
    
    modalContent.innerHTML = ''; 
    
    // Limpiar estado de carga
    if (currentXhr) { currentXhr.abort(); }
    modalLoader.classList.add('d-none');

    modal.classList.remove('d-none'); 
    document.body.style.overflow = 'hidden'; 
    modal.focus();

    const finalUrl = getOptimizedUrl(rawUrl, isVideo);

    if (isVideo) {
        // VIDEO: Carga nativa (streaming)
        const video = document.createElement('video');
        video.src = finalUrl;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '90vh';
        modalContent.appendChild(video);
    } else {
        // IMAGEN: Intentamos carga con barra, si falla, carga normal
        try {
            // Placeholder borroso (Miniatura inmediata)
            const thumbUrl = item.querySelector('img').src;
            const imgPlaceholder = document.createElement('img');
            imgPlaceholder.src = thumbUrl;
            Object.assign(imgPlaceholder.style, {
                maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
                filter: 'blur(10px)', position: 'absolute', zIndex: '1', opacity: '0.6'
            });
            modalContent.appendChild(imgPlaceholder);
            
            // 2. Mostrar explícitamente la barra al 0% antes de empezar
            updateProgressBar(0, "Iniciando descarga...");

            // Intentamos descargar el Blob (puede fallar por CORS)
            const blobUrl = await loadImageWithXHR(finalUrl);

            // ÉXITO: Creamos imagen desde el Blob local
            createFinalImage(blobUrl, imgPlaceholder, true);

        } catch (e) {
            console.warn("Fallo carga con barra (posible CORS), usando carga estándar.", e);
            // FALLBACK: Carga estándar sin XHR
            // Ocultamos barra de error
            modalLoader.classList.add('d-none');
            // Cargamos la imagen directamente de la URL
            createFinalImage(finalUrl, modalContent.querySelector('img'), false);
        }
    }
}

// Helper para insertar la imagen final
function createFinalImage(source, placeholder, isBlob) {
    const img = document.createElement('img');
    img.src = source;
    Object.assign(img.style, {
        maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
        zIndex: '2', position: 'relative', opacity: '0', transition: 'opacity 0.3s ease'
    });
    
    img.onload = () => {
        img.style.opacity = '1';
        // Eliminar placeholder
        if (placeholder) setTimeout(() => placeholder.remove(), 300);
        // Si era un blob, liberar memoria
        if (isBlob) window.URL.revokeObjectURL(source);
    };
    
    modalContent.appendChild(img);
}

function closeModal() {
    if (currentXhr) { currentXhr.abort(); currentXhr = null; }
    modal.classList.add('d-none');
    modalContent.innerHTML = '';
    modalLoader.classList.add('d-none'); 
    document.body.style.overflow = 'auto';
    const video = modalContent.querySelector('video');
    if (video) video.pause();
}

// --- EVENTOS ---
mediaItems.forEach((item, index) => {
    item.addEventListener('click', () => openModal(index));
});

function nextImage() { openModal(currentIndex + 1); }
function prevImage() { openModal(currentIndex - 1); }

document.getElementById('nextBtn').addEventListener('click', (e) => { e.stopPropagation(); nextImage(); });
document.getElementById('prevBtn').addEventListener('click', (e) => { e.stopPropagation(); prevImage(); });
document.getElementById('closeModal').addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
    if (modal.classList.contains('d-none')) return;
    switch(e.key) {
        case 'ArrowRight': nextImage(); break;
        case 'ArrowLeft': prevImage(); break;
        case 'Escape': closeModal(); break;
        case 'Delete': deleteCurrentFile(); break;
    }
});

// Lógica de borrado (sin cambios)
document.getElementById('btnDelete').addEventListener('click', deleteCurrentFile);
function deleteCurrentFile() {
    if (!confirm('¿Eliminar archivo permanentemente?')) return;
    const currentItem = mediaItems[currentIndex];
    const fileId = currentItem.getAttribute('data-id'); 
    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;

    fetch("{% url 'eliminar_archivo' %}", {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRFToken': csrfToken },
        body: `archivo_id=${fileId}`
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            closeModal();
            currentItem.style.transform = "scale(0)";
            setTimeout(() => { currentItem.remove(); window.location.reload(); }, 300);
        } else { alert('Error: ' + data.error); }
    });
}

// --- SERVICE WORKER Y CULLING ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

document.addEventListener("DOMContentLoaded", function() {
    const observerOptions = { root: null, rootMargin: '600px 0px', threshold: 0.01 };
    const imageObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const img = entry.target;
            if (entry.isIntersecting) {
                if (img.dataset.src) img.src = img.dataset.src;
            } else {
                if (img.src && img.src !== window.location.href) {
                    img.dataset.src = img.src;
                    img.removeAttribute('src');
                }
            }
        });
    }, observerOptions);

    document.querySelectorAll('.photo-item img').forEach(img => {
        if(img.src) img.dataset.src = img.src; 
        imageObserver.observe(img);
    });
});