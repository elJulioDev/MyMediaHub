from django.shortcuts import render, get_object_or_404, redirect
from django.db.models import Count, Sum
from django.contrib import messages
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from django.conf import settings
from .models import Album, MediaFile

# --- NUEVOS IMPORTS PARA API DIRECTA ---
import requests
from requests.auth import HTTPBasicAuth

# --- HELPERS ROBUSTOS (API DIRECTA) ---
def safe_list_files(options):
    """
    Lista archivos conectando directamente a la API de ImageKit.
    Documentación: https://imagekit.io/docs/api-reference
    """
    url = "https://api.imagekit.io/v1/files"
    
    # ImageKit usa Basic Auth: Usuario=PrivateKey, Password=""
    auth = HTTPBasicAuth(settings.IMAGEKIT_PRIVATE_KEY, '')
    
    try:
        response = requests.get(url, params=options, auth=auth, timeout=10)
        response.raise_for_status() # Lanza error si hay 400/500
        return response.json()      # Devuelve la lista de archivos
    except requests.exceptions.RequestException as e:
        raise Exception(f"Error de conexión con ImageKit: {e}")

def safe_delete_file(file_id):
    """
    Borra un archivo usando la API directa.
    """
    url = f"https://api.imagekit.io/v1/files/{file_id}"
    auth = HTTPBasicAuth(settings.IMAGEKIT_PRIVATE_KEY, '')
    
    try:
        response = requests.delete(url, auth=auth, timeout=10)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        raise Exception(f"Error borrando en ImageKit: {e}")

def index(request):
    """
    Vista principal.
    Calcula el almacenamiento usando la base de datos local.
    """
    media_files = MediaFile.objects.all().order_by('-creado_en')

    # --- INICIO MODIFICACIÓN: Cálculo detallado ---
    total_bytes = MediaFile.objects.aggregate(Sum('tamano'))['tamano__sum'] or 0
    
    # Calcular bytes por tipo
    image_bytes = MediaFile.objects.filter(tipo__in=['imagen', 'gif']).aggregate(Sum('tamano'))['tamano__sum'] or 0
    video_bytes = MediaFile.objects.filter(tipo='video').aggregate(Sum('tamano'))['tamano__sum'] or 0

    limit_gb = 20 # Límite gratuito
    limit_bytes = limit_gb * (1024**3)
    
    percent_total = 0
    percent_image = 0
    percent_video = 0
    
    if limit_bytes > 0:
        percent_total = (total_bytes / limit_bytes) * 100
        percent_image = (image_bytes / limit_bytes) * 100
        percent_video = (video_bytes / limit_bytes) * 100
    # --- FIN MODIFICACIÓN ---

    def format_bytes(size):
        power = 2**10
        n = 0
        power_labels = {0 : '', 1: 'KB', 2: 'MB', 3: 'GB', 4: 'TB'}
        while size > power:
            size /= power
            n += 1
        return f"{size:.2f} {power_labels[n]}"

    storage_data = {
        'used_str': format_bytes(total_bytes),
        'limit_str': f"{limit_gb} GB",
        'percent': min(100, percent_total),
        # Agregamos los porcentajes individuales al contexto
        'percent_image': percent_image,
        'percent_video': percent_video,
        'file_count': media_files.count()
    }

    context = {
        'media_files': media_files,
        'title': 'Galería',
        'active_tab': 'general',
        'storage': storage_data
    }
    return render(request, 'index.html', context)


def lista_albumes(request):
    albumes = (
        Album.objects.filter(album_padre__isnull=True)
        .annotate(
            cantidad_archivos=Count('archivos', distinct=True),
            cantidad_subalbumes=Count('subalbumes_directos', distinct=True)
        )
        .order_by('-creado_en')
    )
    return render(request, 'lista_albumes.html', {
        'albumes': albumes,
        'active_tab': 'albumes',
        'title': 'Álbumes'
    })


def detalle_album(request, album_id):
    album = get_object_or_404(
        Album.objects.annotate(
            cantidad_archivos=Count('archivos', distinct=True),
            cantidad_subalbumes=Count('subalbumes_directos', distinct=True)
        ),
        id=album_id
    )
    archivos = album.archivos.all().order_by('-creado_en')
    subalbumes = (
        album.subalbumes_directos
        .annotate(cantidad_archivos=Count('archivos', distinct=True))
        .order_by('-creado_en')
    )
    context = {'album': album, 'archivos': archivos, 'subalbumes': subalbumes}
    return render(request, 'detalle_album.html', context)


def ver_video(request, archivo_id):
    archivo = get_object_or_404(MediaFile, id=archivo_id)
    if not archivo.is_video():
         if archivo.albumes.exists():
             return redirect('ver_archivo', album_id=archivo.albumes.first().id, archivo_id=archivo.id)
         else:
             return redirect('index')
    return render(request, 'ver_video.html', {'archivo': archivo})


def ver_archivo(request, album_id, archivo_id):
    album = get_object_or_404(Album, id=album_id)
    archivos = list(album.archivos.all().order_by('creado_en'))
    archivo = get_object_or_404(MediaFile, id=archivo_id)
    
    prev_id, next_id = None, None
    try:
        index = archivos.index(archivo)
        if index > 0: prev_id = archivos[index - 1].id
        if index < len(archivos) - 1: next_id = archivos[index + 1].id
    except ValueError: pass 

    context = {'album': album, 'archivo': archivo, 'prev_id': prev_id, 'next_id': next_id}
    return render(request, 'ver_archivo.html', context)


def sincronizar_galeria(request):
    """
    Sincronización Bidireccional:
    1. Descarga/Actualiza archivos desde ImageKit hacia local.
    2. Elimina archivos locales si ya no existen en ImageKit (fueron borrados manualmente en la nube).
    """
    if not request.user.is_staff:
        return redirect('index')

    try:
        # --- PASO 1: OBTENER LISTA COMPLETA DE LA NUBE (CON PAGINACIÓN) ---
        all_cloud_files = []
        skip = 0
        limit = 100
        
        while True:
            options = {"limit": limit, "skip": skip}
            batch = safe_list_files(options)
            
            if not batch:
                break
                
            all_cloud_files.extend(batch)
            skip += limit
            
            # Si el lote es menor al límite, ya no hay más archivos
            if len(batch) < limit:
                break

        # Crear un conjunto (Set) de IDs de la nube para búsqueda rápida
        cloud_ids = {f['fileId'] for f in all_cloud_files if 'fileId' in f}

        created_count = 0
        updated_count = 0
        deleted_local_count = 0
        
        # --- PASO 2: DESCARGAR Y ACTUALIZAR (Cloud -> Local) ---
        for file_data in all_cloud_files:
            file_id = file_data.get('fileId')
            name = file_data.get('name')
            size = file_data.get('size', 0)
            file_type = file_data.get('fileType', 'image')
            
            if not file_id: continue

            # A. ¿Ya tenemos este ID?
            if MediaFile.objects.filter(file_id=file_id).exists():
                continue 

            # B. ¿Existe por nombre (subido manual)? Enlazamos.
            existing_file = MediaFile.objects.filter(archivo=name).first() or \
                            MediaFile.objects.filter(archivo__endswith=name).first()

            if existing_file:
                existing_file.file_id = file_id
                existing_file.tamano = size
                if file_type == 'image':
                    existing_file.tipo = 'gif' if name.lower().endswith('.gif') else 'imagen'
                else:
                    existing_file.tipo = 'video'
                existing_file.save()
                updated_count += 1
            else:
                # C. Crear nuevo
                mf = MediaFile(
                    nombre=name,
                    archivo=name, 
                    file_id=file_id,
                    tamano=size
                )
                if file_type == 'image':
                    mf.tipo = 'gif' if name.lower().endswith('.gif') else 'imagen'
                else:
                    mf.tipo = 'video'
                mf.save()
                created_count += 1

        # --- PASO 3: LIMPIEZA INVERSA (Si no está en Cloud -> Borrar Local) ---
        # Obtenemos todos los archivos locales que tienen un ID de nube (están vinculados)
        local_files_linked = MediaFile.objects.exclude(file_id__isnull=True).exclude(file_id='')

        for local_file in local_files_linked:
            # Si el ID local NO está en el set de IDs que acabamos de bajar de la nube...
            if local_file.file_id not in cloud_ids:
                # ...significa que se borró en ImageKit. Lo borramos localmente.
                local_file.delete()
                deleted_local_count += 1
        
        # Mensajes de feedback
        parts = []
        if created_count: parts.append(f"{created_count} nuevos")
        if updated_count: parts.append(f"{updated_count} enlazados")
        if deleted_local_count: parts.append(f"{deleted_local_count} eliminados localmente")

        if parts:
            msg = "Sincronización: " + ", ".join(parts) + "."
            messages.success(request, msg)
        else:
            messages.info(request, "La galería está perfectamente sincronizada.")

    except Exception as e:
        messages.error(request, f"Error de sincronización: {str(e)}")
        print(f"Error Sync: {e}")

    return redirect('index')


@require_POST
def eliminar_archivo(request):
    """
    Elimina archivo de DB y Nube.
    """
    #if not request.user.is_staff:
    #    return JsonResponse({'error': 'No autorizado'}, status=403)

    archivo_id = request.POST.get('archivo_id')
    if not archivo_id:
        return JsonResponse({'error': 'ID faltante'}, status=400)

    try:
        archivo = MediaFile.objects.get(id=archivo_id)
        
        if archivo.file_id:
            try:
                # USAMOS LA FUNCIÓN SEGURA
                safe_delete_file(archivo.file_id)
            except Exception as e:
                print(f"Advertencia borrado nube: {e}")

        archivo.delete()
        return JsonResponse({'success': True})
        
    except MediaFile.DoesNotExist:
        return JsonResponse({'error': 'No encontrado'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

def ver_perfil(request):
    """
    Vista de perfil de usuario.
    Muestra datos del usuario, claves de API y almacenamiento detallado.
    """
    # 1. Calculamos almacenamiento (reutilizando lógica de index)
    media_files = MediaFile.objects.all()
    total_bytes = MediaFile.objects.aggregate(Sum('tamano'))['tamano__sum'] or 0
    image_bytes = MediaFile.objects.filter(tipo__in=['imagen', 'gif']).aggregate(Sum('tamano'))['tamano__sum'] or 0
    video_bytes = MediaFile.objects.filter(tipo='video').aggregate(Sum('tamano'))['tamano__sum'] or 0

    limit_gb = 20
    limit_bytes = limit_gb * (1024**3)
    
    percent_total = (total_bytes / limit_bytes) * 100 if limit_bytes > 0 else 0
    percent_image = (image_bytes / limit_bytes) * 100 if limit_bytes > 0 else 0
    percent_video = (video_bytes / limit_bytes) * 100 if limit_bytes > 0 else 0

    def format_bytes(size):
        power = 2**10
        n = 0
        power_labels = {0 : '', 1: 'KB', 2: 'MB', 3: 'GB', 4: 'TB'}
        while size > power:
            size /= power
            n += 1
        return f"{size:.2f} {power_labels[n]}"

    storage_data = {
        'used_str': format_bytes(total_bytes),
        'limit_str': f"{limit_gb} GB",
        'percent': min(100, percent_total),
        'percent_image': percent_image,
        'percent_video': percent_video,
        'image_str': format_bytes(image_bytes),
        'video_str': format_bytes(video_bytes),
        'file_count': media_files.count()
    }

    # 2. Preparamos contexto con API Keys (Ocultamos parte de la privada por seguridad visual)
    private_key = getattr(settings, 'IMAGEKIT_PRIVATE_KEY', '')
    masked_key = f"{private_key[:10]}...{private_key[-5:]}" if private_key else "No configurada"

    context = {
        'title': 'Mi Perfil',
        'active_tab': 'perfil', # Para marcar activo en sidebar si quieres agregarlo
        'storage': storage_data,
        'api_conf': {
            'public_key': getattr(settings, 'IMAGEKIT_PUBLIC_KEY', 'No configurada'),
            'url_endpoint': getattr(settings, 'IMAGEKIT_URL_ENDPOINT', 'No configurada'),
            'private_key_full': private_key, # Para copiar/pegar
            'private_key_masked': masked_key
        }
    }
    return render(request, 'perfil.html', context)