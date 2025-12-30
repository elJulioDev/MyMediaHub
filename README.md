# MyMediaHub - Galería Multimedia Inteligente
Este proyecto es una plataforma web robusta desarrollada en Django para la gestión, almacenamiento y visualización de contenido multimedia (imágenes y videos). Inspirada en la experiencia de usuario de Google Photos, MyMediaHub integra almacenamiento en la nube mediante ImageKit.io para optimizar la entrega de contenido, reducir el consumo de ancho de banda y gestionar transformaciones de imágenes en tiempo real.

Está diseñado para ser una solución híbrida que mantiene una base de datos local para la organización lógica (álbumes, usuarios) mientras delega el almacenamiento pesado y el procesamiento de imágenes a la nube.

## Características Principales
* **Gestión de Medios Híbrida:**
    * **Cloud Storage (ImageKit):** Subida, almacenamiento y CDN global para archivos.
    * **Sincronización Bidireccional:** Sistema capaz de detectar archivos en la nube y enlazarlos localmente, o eliminar registros locales si se borran en la nube.
* **Optimización Inteligente:**
    * **Smart Cropping & Resizing:** Las imágenes se sirven redimensionadas y comprimidas automáticamente según el dispositivo (WebP/AVIF automáticos).
    * **Video Streaming:** Reproducción optimizada de videos MP4/WebM.
    * **Lazy Loading & Blur-up:** Carga progresiva de imágenes con placeholders borrosos para una experiencia fluida.
* **Organización Avanzada:**
    * **Álbumes Anidados:** Soporte para álbumes dentro de álbumes (subálbumes) infinitos.
    * **Búsqueda y Filtrado:** Organización cronológica automática y filtrado por tipo de archivo.
* **Interfaz Moderna (Dark Mode):** Diseño responsivo basado en Bootstrap 5 con estética "Google Material Dark", incluyendo sidebar fijo y transiciones suaves.
* **Dashboard de Almacenamiento:** Visualización gráfica del consumo de espacio (Imágenes vs Videos) y límites de la cuenta.
* **PWA Ready:** Implementación de Service Workers (`sw.js`) para caché de recursos estáticos y assets de CDN.

## Tecnologías Utilizadas
El proyecto utiliza un stack moderno enfocado en rendimiento y escalabilidad:
* **Backend:** Python 3, Django 5.2.8
* **Base de Datos:** MySQL (conector `pymysql`).
* **Cloud & Media API:** ImageKit.io (SDK `imagekitio`) para almacenamiento y procesamiento.
* **Frontend:** HTML5, CSS3 (Diseño personalizado + Bootstrap 5), JavaScript Vanilla.
* **Utilidades:**
    * `Pillow`: Procesamiento de imágenes local previo a la subida.
    * `python-dotenv`: Gestión de variables de entorno.
    * `requests`: Comunicación directa con APIs externas.

## 📋 Pre-requisitos
Asegúrate de tener instalado y configurado lo siguiente:
* Python 3.10 o superior
* MySQL Server (o MariaDB)
* Una cuenta activa en ImageKit.io (necesitarás las API Keys).
* Git
* Virtualenv (recomendado)

## Instalación y Configuración
Sigue estos pasos para levantar el proyecto en tu entorno local:

1. **Clonar el repositorio:**
```bash
git clone https://github.com/eljuliodev/mymediahub.git
cd MyMediaHub
```

2. **Crear y activar un entorno virtual:**

```bash
python -m venv venv
# En Windows:
venv\Scripts\activate
# En macOS/Linux:
source venv/bin/activate
```

3. **Instalar dependencias:**

```bash
pip install -r requirements.txt
```

4. **Configurar Variables de Entorno (.env):** El sistema requiere credenciales de ImageKit para funcionar. Crea un archivo `.env` en la raíz del proyecto (al mismo nivel que `manage.py`) y añade lo siguiente:

```bash
# Django Security
SECRET_KEY=tu_secret_key_django_aqui

# ImageKit.io Credentials (Obtenlas en tu panel de desarrollador)
IMAGEKIT_PUBLIC_KEY=public_xxxxxxxxxxxxxxxxxxxx
IMAGEKIT_PRIVATE_KEY=private_xxxxxxxxxxxxxxxxxxxx
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/tu_id_unico
```

5. **Configurar Base de Datos:** Asegúrate de tener MySQL corriendo y crea una base de datos llamada `gallerydb` (o cambia el nombre en `MyMediaHub/settings.py`).

```bash
CREATE DATABASE gallerydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

6. **Aplicar migraciones:** Genera las tablas necesarias en la base de datos.

```bash
python manage.py makemigrations
python manage.py migrate
```

7. **Crear Superusuario:** Para acceder al panel de administración y subir los primeros archivos.

```bash
python manage.py createsuperuser
```

8. **Ejecutar el servidor:**

```bash
python manage.py runserver
```

## Uso del Sistema
**1. Panel de Administración (Subida de Archivos)**
Accede a `/admin/` con tu superusuario.

* Desde aquí puedes subir imágenes/videos masivamente.
* El sistema personalizado `Storage` se encargará de enviarlos a ImageKit automáticamente.

**2. Galería Principal (Frontend)**
Accede a `http://localhost:8000/`

* **Timeline:** Verás tus fotos organizadas por fecha.
* **Sincronización:** Si subiste archivos directamente a la consola de ImageKit, ve a la sección "Utilidades" -> "Sincronizar Nube" para importarlos a tu galería local.

## Estructura del Proyecto

```text
MyMediaHub/
├── Gallery/                        # Aplicación principal
│   ├── migrations/                 # Historial de cambios de BD
│   ├── static/                     # Archivos estáticos (CSS, JS, Img)
│   │   ├── css/                    # Estilos (index.css, video.css, profile.css)
│   │   ├── img/                    # Iconos SVG
│   │   └── js/                     # Lógica frontend (Lazy loading, Modal)
│   ├── templates/                  # Plantillas HTML
│   │   ├── detalle_album.html      # Vista de álbum específico
│   │   ├── index.html              # Timeline principal
│   │   ├── perfil.html             # Dashboard de usuario
│   │   ├── ver_video.html          # Reproductor de video
│   │   └── sw.js                   # Service Worker para PWA
│   ├── admin.py                    # Configuración del admin (Vistas previas)
│   ├── apps.py                     # Config App
│   ├── ik_client.py                # Cliente API manual para ImageKit
│   ├── models.py                   # Modelos (Album, MediaFile)
│   ├── storage.py                  # Motor de almacenamiento personalizado (Override)
│   ├── tests.py                    # Tests unitarios
│   └── views.py                    # Lógica de vistas y sincronización
├── MyMediaHub/                     # Configuración del Proyecto Django
│   ├── asgi.py
│   ├── settings.py                 # Configuración global (DB, Apps, Keys)
│   ├── urls.py                     # Enrutador principal
│   └── wsgi.py
├── manage.py                       # CLI de gestión de Django
├── requirements.txt                # Dependencias (Django, ImageKit, Pillow)
└── .gitignore                      # Archivos ignorados (venv, db, .env)
```

## Licencia
Este proyecto es de uso personal y educativo.
