from django.db import models
from .storage import ImageKitStorage
import base64
import io
from PIL import Image

class Album(models.Model):
    nombre = models.CharField(max_length=100, help_text="Nombre del álbum.")
    descripcion = models.TextField(blank=True, help_text="Descripción opcional del álbum.")
    creado_en = models.DateTimeField(auto_now_add=True)
    
    imagen_preview = models.ForeignKey(
        'MediaFile', on_delete=models.SET_NULL, null=True, blank=True, related_name='albums_destacados'
    )

    album_padre = models.ForeignKey(
        'self', 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='subalbumes_directos',
        help_text="Si se especifica, este álbum se convierte en un subálbum del padre."
    )

    subalbumes = models.ManyToManyField(
        'self',
        symmetrical=False,
        blank=True,
        related_name='contenedor_de',
        help_text="Álbumes incluidos dentro de este álbum."
    )

    class Meta:
        verbose_name = "Álbum"
        verbose_name_plural = "Álbumes"
        ordering = ['-creado_en']

    def __str__(self):
        return self.nombre

    def cantidad_archivos(self):
        return self.archivos.count()

    def cantidad_subalbumes(self):
        return self.subalbumes_directos.count()

    @property
    def preview_url(self):
        if self.imagen_preview:
            return self.imagen_preview.miniatura_url
        return None

class MediaFile(models.Model):
    archivo = models.FileField(storage=ImageKitStorage())
    
    nombre = models.CharField(max_length=255, blank=True, null=True)
    tipo = models.CharField(max_length=20, blank=True, editable=False)
    file_id = models.CharField(max_length=100, blank=True, null=True)
    tamano = models.BigIntegerField(default=0, editable=False)
    
    creado_en = models.DateTimeField(auto_now_add=True)
    albumes = models.ManyToManyField(Album, related_name='archivos', blank=True)

    # --- NUEVO CAMPO PARA LQIP ---
    thumbnail_base64 = models.TextField(blank=True, null=True, editable=False)
    
    class Meta:
        verbose_name = "Archivo Multimedia"
        verbose_name_plural = "Archivos Multimedia"
        ordering = ['-creado_en']

    def __str__(self):
        return self.nombre or str(self.archivo.name)

    def save(self, *args, **kwargs):
        # 1. DETECCIÓN DE TIPO CORREGIDA
        if self.archivo and not self.tipo:
            name = str(self.archivo.name).lower()
            if name.endswith(('.mp4', '.mov', '.avi', '.webm', '.mkv')):
                self.tipo = 'video'
            # AQUI EL CAMBIO: Agregamos .webp a la detección de "animaciones"
            # Esto ayuda a que lógica interna considere que puede moverse
            elif name.endswith(('.gif', '.webp')):
                self.tipo = 'gif' 
            else:
                self.tipo = 'imagen'
        
        if self.archivo and self.tamano == 0:
            try:
                self.tamano = self.archivo.size
            except: pass

        super().save(*args, **kwargs)

        # 2. GENERACIÓN DE LQIP (Base64 borroso)
        # La lógica de Pillow seek(0) funciona para WebP animados también
        if self.archivo and (self.tipo == 'imagen' or self.tipo == 'gif') and not self.thumbnail_base64:
            try:
                if hasattr(self.archivo, 'seek'):
                    self.archivo.seek(0)
                
                img = Image.open(self.archivo)
                
                # Aseguramos el primer frame si es animado
                try:
                    img.seek(0)
                except:
                    pass

                # Convertimos a RGB
                if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                    img = img.convert('RGB')
                
                img.thumbnail((20, 20))
                
                buffer = io.BytesIO()
                img.save(buffer, format='JPEG', quality=60)
                
                img_str = base64.b64encode(buffer.getvalue()).decode('utf-8')
                self.thumbnail_base64 = f"data:image/jpeg;base64,{img_str}"
                
                if hasattr(self.archivo, 'seek'):
                    self.archivo.seek(0)
                    
            except Exception as e:
                print(f"Error generando LQIP para {self.nombre}: {e}")
                # Si falla, guardar cambio de tipo al menos
                pass

        # Guardamos de nuevo para persistir el thumbnail_base64
        super().save(*args, **kwargs)

    def is_image(self): return self.tipo == 'imagen'
    def is_video(self): return self.tipo == 'video'
    def is_gif(self): return self.tipo == 'gif'
    def is_webp(self):
        """Devuelve True si la extensión del archivo es .webp"""
        if self.archivo:
             return self.archivo.name.lower().endswith('.webp')
        return False

    @property
    def miniatura_url(self):
        """
        Genera URL optimizada de 200px ESTÁTICA.
        """
        if not self.archivo:
            return ""
        
        url_original = self.archivo.url
        url_base = url_original.split("?")[0]
        
        es_webp_animado = str(self.archivo.name).lower().endswith('.webp')

        if self.is_video():
            # CORRECTO: ik-thumbnail.jpg es válido SÓLO para extraer frames de video
            return f"{url_base}/ik-thumbnail.jpg?tr=w-200,h-200,c-at_max,f-auto,q-70"
        elif self.is_gif() or es_webp_animado:
            # CORRECCIÓN: Forzar formato a jpg para obtener el 1er frame del GIF (estático)
            return f"{url_base}?tr=w-200,h-200,c-at_max,f-jpg,q-70"
        else:
            # Imágenes normales
            return f"{url_base}?tr=w-200,h-200,c-at_max,f-auto,q-70"