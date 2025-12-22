const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const mediaItems = Array.from(document.querySelectorAll('.open-media')); 

// Elementos de la barra
const modalLoader = document.getElementById('modalLoader');
const modalProgressBar = document.getElementById('modalProgressBar');
const modalProgressText = document.getElementById('modalProgressText');

let currentIndex = -1; 
let currentXhr = null; 

// --- OPTIMIZACIÓN 1: URLs INTELIGENTES ---
function getOptimizedUrl(fullUrl, isVideo = false) {
    const separator = fullUrl.includes('?') ? '&' : '?';

    if (isVideo) {
        // Mantenemos orig-true para videos para evitar gastar VPUs en transcoding
        return `${fullUrl}${separator}tr=orig-true`;
    }
    
    // Para IMÁGENES:
    const width = window.innerWidth;
    // Redondeamos a múltiplos de 200px para aumentar el "Cache Hit Ratio"
    // (Si la pantalla es 1366 o 1400, ambos usarán la versión de 1400px cacheada)
    const roundedWidth = Math.ceil(width / 200) * 200; 
    
    // AGREGAMOS: f-auto (WebP/AVIF) y q-auto (Calidad inteligente)
    // Esto reduce el peso un 30-50% extra comparado con solo redimensionar
    const transformations = `tr=w-${roundedWidth},f-auto,q-auto`; 
    
    return `${fullUrl}${separator}${transformations}`;
}

// 2. PRECARGA (Reducida a 1 para ahorrar ancho de banda si el usuario cierra rápido)
function preloadNextFiles(startIndex) {
    const prefetchCount = 1; // Bajamos de 2 a 1 para ser más conservadores
    for (let i = 1; i <= prefetchCount; i++) {
        const nextIndex = startIndex + i;
        if (nextIndex >= mediaItems.length) break;

        const item = mediaItems[nextIndex];
        const rawUrl = item.getAttribute('data-full-url');
        // Solo precargamos si es imagen
        if (item.querySelector('.fa-play-circle') === null) { 
            const img = new Image();
            img.src = getOptimizedUrl(rawUrl, false);
        }
    }
}

// 3. CARGA CON XHR (Sin cambios, funciona bien)
function loadImageWithXHR(url) {
    return new Promise((resolve, reject) => {
        if (currentXhr) { currentXhr.abort(); } 

        const xhr = new XMLHttpRequest();
        currentXhr = xhr;

        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
            if (event.lengthComputable) {
                const percentComplete = (event.loaded / event.total) * 100;
                updateProgressBar(percentComplete, `Cargando... ${Math.round(percentComplete)}%`);
            } else {
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
    
    if (percent >= 100 && text === "Completado") {
        setTimeout(() => {
            modalLoader.classList.add('d-none');
            modalProgressBar.style.width = '0%'; 
        }, 300);
    }
}

// 4. ABRIR MODAL (Optimizado)
async function openModal(index) {
    if (index < 0 || index >= mediaItems.length) return;
    preloadNextFiles(index);

    currentIndex = index;
    const item = mediaItems[index];
    const rawUrl = item.getAttribute('data-full-url');
    const isVideo = item.querySelector('.fa-play-circle') !== null;
    
    modalContent.innerHTML = ''; 
    
    if (currentXhr) { currentXhr.abort(); }
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
        video.style.maxWidth = '100%';
        video.style.maxHeight = '90vh';
        modalContent.appendChild(video);
    } else {
        try {
            // Placeholder: Usamos la miniatura que YA está en el DOM (caché instantánea)
            const thumbImg = item.querySelector('img');
            if (thumbImg) {
                const imgPlaceholder = document.createElement('img');
                imgPlaceholder.src = thumbImg.src; // URL ya cacheada
                Object.assign(imgPlaceholder.style, {
                    maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
                    filter: 'blur(10px)', position: 'absolute', zIndex: '1', opacity: '0.6'
                });
                modalContent.appendChild(imgPlaceholder);
            }
            
            updateProgressBar(0, "Iniciando descarga...");
            const blobUrl = await loadImageWithXHR(finalUrl);
            // Pasamos el placeholder para que createFinalImage lo borre al terminar
            const placeholderRef = modalContent.querySelector('img[style*="blur"]');
            createFinalImage(blobUrl, placeholderRef, true);

        } catch (e) {
            console.warn("Fallback carga estándar.", e);
            modalLoader.classList.add('d-none');
            createFinalImage(finalUrl, modalContent.querySelector('img'), false);
        }
    }
}

function createFinalImage(source, placeholder, isBlob) {
    const img = document.createElement('img');
    img.src = source;
    Object.assign(img.style, {
        maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
        zIndex: '2', position: 'relative', opacity: '0', transition: 'opacity 0.3s ease'
    });
    
    img.onload = () => {
        img.style.opacity = '1';
        if (placeholder) placeholder.remove();
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

    fetch(URLS.eliminar, { 
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

// --- SERVICE WORKER Y CULLING OPTIMIZADO ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(console.error));
}

// NOTA: Hemos ELIMINADO el IntersectionObserver que borraba el src.
// Dejamos que el navegador use loading="lazy" nativo (ya presente en tu HTML).
// Esto es mucho más eficiente y evita parpadeos o re-descargas innecesarias.