from django.contrib import admin
from django.urls import path
from Gallery import views
from django.views.generic import TemplateView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', views.index, name='index'),
    path('albumes/', views.lista_albumes, name='lista_albumes'),
    path('album/<int:album_id>/', views.detalle_album, name='detalle_album'),
    path('all', views.index),
    path('ver-video/<int:archivo_id>/', views.ver_video, name='ver_video'),
    path('album/<int:album_id>/archivo/<int:archivo_id>/', views.ver_archivo, name='ver_archivo'),
    path('sincronizar/', views.sincronizar_galeria, name='sincronizar'),
    path('eliminar/', views.eliminar_archivo, name='eliminar_archivo'),
    path('sw.js', TemplateView.as_view(template_name='sw.js', content_type='application/javascript'), name='sw'),

]