from django.db import models
from .storage import ImageKitStorage
import os

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

    class Meta:
        verbose_name = "Archivo Multimedia"
        verbose_name_plural = "Archivos Multimedia"
        ordering = ['-creado_en']

    def __str__(self):
        return self.nombre or str(self.archivo.name)

    def save(self, *args, **kwargs):
        if self.archivo and not self.tipo:
            name = str(self.archivo.name).lower()
            if name.endswith(('.mp4', '.mov', '.avi', '.webm', '.mkv')):
                self.tipo = 'video'
            elif name.endswith('.gif'):
                self.tipo = 'gif'
            else:
                self.tipo = 'imagen'
        
        if self.archivo and self.tamano == 0:
            try:
                self.tamano = self.archivo.size
            except: pass

        super().save(*args, **kwargs)

    def is_image(self): return self.tipo == 'imagen'
    def is_video(self): return self.tipo == 'video'
    def is_gif(self): return self.tipo == 'gif'

    @property
    def miniatura_url(self):
        """
        Genera URL optimizada de 300px para el grid.
        Ahorra ancho de banda y Video Processing Units.
        """
        if not self.archivo:
            return ""
        
        url_original = self.archivo.url
        # Limpiamos query params previos
        url_base = url_original.split("?")[0]

        # Parámetros de transformación:
        # w-300: Ancho 300px (suficiente para el grid)
        # f-auto: Formato automático (WebP/AVIF si el navegador lo soporta)
        # q-80: Calidad 80% (imperceptible en miniaturas, ahorra 30% peso)
        # fo-auto: Enfoque inteligente
        params = "?tr=w-300,f-auto,q-80,fo-auto"

        if self.is_video():
            # Para videos, añade ik-thumbnail.jpg Y los parámetros
            return f"{url_base}/ik-thumbnail.jpg"
            
        elif self.is_gif():
            # GIFs: Usamos ik-thumbnail.jpg para traer solo el primer frame (estático)
            return f"{url_original}/ik-thumbnail.jpg{params}"
            
        else:
            # Imágenes normales
            return f"{url_base}{params}"