from django.contrib import admin
from .models import Album, MediaFile
from django.utils.html import format_html

@admin.register(Album)
class AlbumAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'creado_en', 'cantidad_archivos', 'cantidad_subalbumes', 'album_padre')
    search_fields = ('nombre', 'descripcion')
    list_filter = ('creado_en', 'album_padre',)
    date_hierarchy = 'creado_en'
    
    class MediaFileInline(admin.TabularInline):
        model = MediaFile.albumes.through
        extra = 1
        verbose_name = "Archivo"
        verbose_name_plural = "Archivos"

    inlines = [MediaFileInline]

    def cantidad_archivos(self, obj):
        return obj.archivos.count()
    cantidad_archivos.short_description = "Archivos"

    def cantidad_subalbumes(self, obj):
        return obj.subalbumes_directos.count()
    cantidad_subalbumes.short_description = "Subálbumes"

    def preview_list(self, obj):
        if obj.preview_url:
            return format_html(
                '<img src="{}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 4px;" />',
                obj.preview_url
            )
        return "N/A"
    preview_list.short_description = "Miniatura"


@admin.register(MediaFile)
class MediaFileAdmin(admin.ModelAdmin):
    # Mostramos el tamaño formateado y el tipo
    readonly_fields = ('tipo', 'tamano_legible', 'preview_detail', 'file_id')
    list_display = ('nombre_archivo', 'tipo', 'tamano_legible', 'creado_en', 'display_albums', 'preview_list')
    list_filter = ('tipo', 'albumes')
    search_fields = ('nombre', 'file_id')
    filter_horizontal = ('albumes',)

    def nombre_archivo(self, obj):
        return obj.nombre or "Sin Título"
    nombre_archivo.short_description = "Nombre"

    def tamano_legible(self, obj):
        if not obj.tamano: return "0 B"
        size = obj.tamano
        power = 2**10
        n = 0
        power_labels = {0 : '', 1: 'K', 2: 'M', 3: 'G', 4: 'T'}
        while size > power:
            size /= power
            n += 1
        return f"{size:.2f} {power_labels[n]}B"
    tamano_legible.short_description = "Tamaño"

    def display_albums(self, obj):
        return ", ".join(a.nombre for a in obj.albumes.all())
    display_albums.short_description = "Álbumes"

    def preview_detail(self, obj):
        if not obj.archivo:
            return "Sin archivo"
            
        url = obj.archivo.url
        
        if obj.is_video():
            return format_html(
                '<video width="320" controls><source src="{}" type="video/mp4"></video>', 
                url
            )
        else:
            # Pedimos una versión mediana para la vista de detalle del admin
            thumb_url = f"{url}?tr=w-300,h-300,fo-auto"
            return format_html(
                '<img src="{}" style="max-width: 300px; max-height: 300px;" />', 
                thumb_url
            )
    preview_detail.short_description = "Vista previa completa"

    def preview_list(self, obj):
        if not obj.archivo:
            return "❌"
        
        # Pedimos miniatura muy pequeña (50px) para la tabla
        thumb_url = f"{obj.archivo.url}?tr=w-50,h-50,fo-auto"
        
        if obj.is_video():
            # ImageKit no genera posters de video automáticamente en la URL estándar sin configuración extra,
            # así que mostramos icono de video por seguridad.
            return "🎥" 
        else:
            return format_html(
                '<img src="{}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px;" />', 
                thumb_url
            )
    preview_list.short_description = "Vista"