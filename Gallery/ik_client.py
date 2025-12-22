import os
from imagekitio import ImageKit
from django.conf import settings

# 1. Inyectamos las variables de entorno PRIMERO
# Esto es crucial. El SDK buscará estas variables automáticamente.
os.environ['IMAGEKIT_PRIVATE_KEY'] = settings.IMAGEKIT_PRIVATE_KEY
os.environ['IMAGEKIT_PUBLIC_KEY'] = settings.IMAGEKIT_PUBLIC_KEY
os.environ['IMAGEKIT_URL_ENDPOINT'] = settings.IMAGEKIT_URL_ENDPOINT

# Verificación de seguridad para no depurar errores vacíos después
if not settings.IMAGEKIT_PRIVATE_KEY or not settings.IMAGEKIT_URL_ENDPOINT:
    raise Exception("Faltan credenciales de ImageKit en settings.py")

# 2. Inicializamos SIN argumentos
# Al no pasar nada, el SDK se ve obligado a leer las variables de entorno que acabamos de definir.
# Esto evita el TypeError y asegura que se cargue la URL (evitando el error de 'método no encontrado').
try:
    imagekit = ImageKit()
except Exception as e:
    print(f"Error fatal iniciando ImageKit: {e}")
    imagekit = None