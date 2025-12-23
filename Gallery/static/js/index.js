const modal = document.getElementById('modal');
const modalContent = document.getElementById('modalContent');
const mediaItems = Array.from(document.querySelectorAll('.open-media')); 

// Elementos de la barra
const modalLoader = document.getElementById('modalLoader');
const modalProgressBar = document.getElementById('modalProgressBar');
const modalProgressText = document.getElementById('modalProgressText');

let currentIndex = -1; 
let currentXhr = null; 
let preloadController = null;

// --- NUEVAS REFERENCIAS ---
const btnMoreOptions = document.getElementById('btnMoreOptions');
const modalDropdown = document.getElementById('modalDropdown');
const btnDownload = document.getElementById('btnDownload');
const btnAddToAlbum = document.getElementById('btnAddToAlbum');

// 1. Lógica para abrir/cerrar el menú
btnMoreOptions.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que el click cierre el modal
    modalDropdown.classList.toggle('d-none');
});

// 2. Cerrar el menú si hacemos click fuera de él
document.addEventListener('click', (e) => {
    // Si el menú está abierto y el click NO fue en el botón ni en el menú...
    if (!modalDropdown.classList.contains('d-none') && 
        !modalDropdown.contains(e.target) && 
        !btnMoreOptions.contains(e.target)) {
        modalDropdown.classList.add('d-none');
    }
});

// 3. Placeholder para la opción de álbum (por ahora)
btnAddToAlbum.addEventListener('click', () => {
    alert('Funcionalidad "Añadir a álbum" próximamente.');
    modalDropdown.classList.add('d-none');
});

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
    // 1. MATAR PROCESOS ZOMBIE:
    // Si había una precarga en curso, la cancelamos inmediatamente para liberar red y CPU.
    if (preloadController) {
        preloadController.abort();
    }
    
    // Nuevo controlador para la solicitud actual
    preloadController = new AbortController();
    const signal = preloadController.signal;

    const prefetchCount = 1; 
    for (let i = 1; i <= prefetchCount; i++) {
        const nextIndex = startIndex + i;
        if (nextIndex >= mediaItems.length) break;

        const item = mediaItems[nextIndex];
        const rawUrl = item.getAttribute('data-full-url');
        
        // Solo precargamos si no es video
        if (item.querySelector('.fa-play-circle') === null) { 
            const url = getOptimizedUrl(rawUrl, false);
            
            // 2. PRECARGA PASIVA (Lightweight):
            // Usamos fetch en lugar de new Image().
            // 'fetch' guarda el archivo en el caché de disco (Disk Cache) pero NO lo decodifica.
            // Esto evita que la interfaz se congele (lag) mientras ves la foto actual.
            fetch(url, { signal, mode: 'cors' })
                .then(response => {
                    // Forzamos la lectura del stream para asegurar que se guarde en caché
                    if(response.ok) return response.blob(); 
                })
                .catch(err => {
                    // Si se cancela (AbortError), no hacemos nada (es lo esperado)
                });
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

    currentIndex = index;
    const item = mediaItems[index];
    const rawUrl = item.getAttribute('data-full-url');

    // Configuración del botón de descarga (igual que antes)
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
    
    // Limpieza
    modalContent.innerHTML = ''; 
    modalLoader.classList.add('d-none'); // Ocultamos la barra de carga compleja
    modal.classList.remove('d-none'); 
    document.body.style.overflow = 'hidden'; 
    modal.focus();

    const finalUrl = getOptimizedUrl(rawUrl, isVideo);

    if (isVideo) {
        // Lógica de video (igual que antes, usa tr=orig-true)
        const video = document.createElement('video');
        video.src = finalUrl;
        video.controls = true;
        video.autoplay = true;
        video.style.maxWidth = '100%';
        video.style.maxHeight = '90vh';
        modalContent.appendChild(video);
    } else {
        // --- AQUÍ ESTÁ EL CAMBIO IMPORTANTE ---
        
        // 1. Mostrar miniatura borrosa (efecto "blur-up") inmediatamente
        // Usamos la que ya tiene el navegador en caché del index
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

        // 2. Mostrar spinner simple (sin porcentaje)
        modalProgressText.innerText = "Cargando...";
        modalLoader.classList.remove('d-none');
        modalProgressBar.style.width = '100%'; // Barra llena animada o estática

        // 3. Crear imagen final NATIVA
        const img = document.createElement('img');
        
        img.onload = () => {
            // Cuando el navegador termine de bajarla:
            img.style.opacity = '1';     // La mostramos suavemente
            if (placeholder) placeholder.remove(); // Quitamos la borrosa
            modalLoader.classList.add('d-none');   // Quitamos el loader
        };

        img.onerror = () => {
            modalProgressText.innerText = "Error al cargar";
        };

        // Estilos para la transición
        Object.assign(img.style, {
            maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain',
            zIndex: '2', position: 'relative', opacity: '0', transition: 'opacity 0.3s ease'
        });

        // Asignar SRC al final dispara la carga usando la caché del navegador/ServiceWorker
        img.src = finalUrl;
        
        modalContent.appendChild(img);
        
        // NO llamamos a preloadNextFiles(index); AHORRO DE REQUESTS
    }
}

// --- FUNCIÓN PARA FORZAR DESCARGA ---
function forceDownload(url, filename) {
    // Mostramos feedback visual (opcional, reutilizando tu loader)
    updateProgressBar(10, "Preparando descarga...");
    
    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error('Network error');
            // Leemos el tamaño para la barra de progreso (si el servidor lo envía)
            const contentLength = response.headers.get('content-length');
            const total = parseInt(contentLength, 10);
            let loaded = 0;

            const reader = response.body.getReader();
            return new ReadableStream({
                start(controller) {
                    function push() {
                        reader.read().then(({ done, value }) => {
                            if (done) {
                                controller.close();
                                return;
                            }
                            loaded += value.byteLength;
                            if (total) {
                                updateProgressBar((loaded/total)*100, "Descargando...");
                            }
                            controller.enqueue(value);
                            push();
                        });
                    }
                    push();
                }
            });
        })
        .then(stream => new Response(stream))
        .then(response => response.blob())
        .then(blob => {
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = blobUrl;
            a.download = filename; // Nombre forzado
            document.body.appendChild(a);
            a.click();
            
            // Limpieza
            window.URL.revokeObjectURL(blobUrl);
            document.body.removeChild(a);
            updateProgressBar(100, "Completado");
        })
        .catch(err => {
            console.error(err);
            alert("No se pudo descargar el archivo. Intentando abrir en pestaña nueva.");
            window.open(url, '_blank'); // Fallback
            modalLoader.classList.add('d-none');
        });
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