from django.core.files.storage import Storage
from django.conf import settings
from django.utils.deconstruct import deconstructible
from imagekitio import ImageKit
import os
import io
from PIL import Image, ImageSequence

@deconstructible
class ImageKitStorage(Storage):
    def __init__(self):
        # Configuración por entorno
        os.environ['IMAGEKIT_PUBLIC_KEY'] = settings.IMAGEKIT_PUBLIC_KEY
        os.environ['IMAGEKIT_PRIVATE_KEY'] = settings.IMAGEKIT_PRIVATE_KEY
        os.environ['IMAGEKIT_URL_ENDPOINT'] = settings.IMAGEKIT_URL_ENDPOINT
        
        self.imagekit = ImageKit()

    def _open(self, name, mode='rb'):
        return None 

    def _save(self, name, content):
        try:
            # 1. Leemos el contenido original en bytes
            file_content = content.read()
            original_size = len(file_content)
            
            # --- LÓGICA DE COMPRESIÓN / OPTIMIZACIÓN ---
            try:
                ext = os.path.splitext(name)[1].lower()
                
                # AHORA INCLUIMOS .gif EN LA LISTA
                valid_extensions = ['.jpg', '.jpeg', '.png', '.webp', '.jfif', '.gif']
                
                if ext in valid_extensions:
                    # Cargar imagen desde memoria
                    image = Image.open(io.BytesIO(file_content))
                    
                    output_buffer = io.BytesIO()
                    
                    # Detectar formato (Pillow a veces pierde el formato al abrir desde bytes)
                    img_format = image.format
                    if not img_format:
                         if 'jpg' in ext or 'jpeg' in ext: img_format = 'JPEG'
                         elif 'png' in ext: img_format = 'PNG'
                         elif 'webp' in ext: img_format = 'WEBP'
                         elif 'gif' in ext: img_format = 'GIF'

                    # Configuración de optimización base
                    save_kwargs = {
                        'format': img_format,
                        'optimize': True,
                        'quality': 85
                    }

                    # MANEJO ESPECIAL PARA ANIMACIONES (GIF / WEBP)
                    if getattr(image, 'is_animated', False):
                        save_kwargs['save_all'] = True
                        # loop=0 asegura que el GIF se repita infinitamente como el original
                        save_kwargs['loop'] = 0 
                    
                    # Caso especial: JPG no soporta transparencia (RGBA), convertir a RGB
                    if img_format == 'JPEG' and image.mode != 'RGB':
                        image = image.convert('RGB')
                    
                    # INTENTAR COMPRIMIR
                    image.save(output_buffer, **save_kwargs)
                    
                    compressed_content = output_buffer.getvalue()
                    new_size = len(compressed_content)
                    
                    # SOLO usamos la versión comprimida si realmente pesa menos
                    if new_size < original_size:
                        file_content = compressed_content
                        # print(f"Optimizado {name}: {original_size/1024:.1f}KB -> {new_size/1024:.1f}KB")
                    else:
                        pass
                        # print(f"Compresión inefectiva para {name}, usando original.")

            except Exception as e:
                # Si falla la compresión (ej: archivo corrupto), usamos el original
                print(f"Advertencia optimización {name}: {e}")

            # --- FIN LÓGICA DE COMPRESIÓN ---

            # Configuración de subida a ImageKit
            upload_params = {
                "use_unique_file_name": True,
                "tags": ["gallery-django"]
            }

            # Selección del método de carga (Compatibilidad versiones SDK)
            upload_method = None
            if hasattr(self.imagekit, 'files') and hasattr(self.imagekit.files, 'upload'):
                upload_method = self.imagekit.files.upload
            elif hasattr(self.imagekit, 'upload_file'):
                upload_method = self.imagekit.upload_file
            elif hasattr(self.imagekit, 'upload'):
                upload_method = self.imagekit.upload
            
            if not upload_method:
                raise Exception("No se encontró método upload compatible en SDK ImageKit.")

            # EJECUTAR CARGA
            try:
                upload = upload_method(
                    file=file_content, 
                    file_name=name,
                    **upload_params 
                )
            except TypeError:
                # Reintento simple si fallan los parámetros extra
                upload = upload_method(file=file_content, file_name=name)

            # PROCESAR RESPUESTA
            if isinstance(upload, dict):
                if 'error' in upload and upload['error']:
                    raise Exception(upload['error']['message'])
                return upload.get('name', name)
            
            if hasattr(upload, 'error') and upload.error:
                msg = getattr(upload.error, 'message', str(upload.error))
                raise Exception(msg)
            
            return getattr(upload, 'name', name)
            
        except Exception as e:
            print(f"!!! ERROR IMAGEKIT !!!: {str(e)}")
            raise Exception(f"Error subiendo a ImageKit: {str(e)}")

    def url(self, name):
        endpoint = settings.IMAGEKIT_URL_ENDPOINT.rstrip('/')
        return f"{endpoint}/{name}"

    def exists(self, name):
        return False