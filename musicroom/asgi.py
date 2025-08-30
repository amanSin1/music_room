# musicroom/asgi.py
import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator

# Set Django settings module FIRST
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'musicroom.settings')

# Initialize Django ASGI application early to ensure AppConfig is loaded
django_asgi_app = get_asgi_application()

# NOW import your routing after Django is configured
import rooms.routing

# Updated ASGI application configuration
application = ProtocolTypeRouter({
    # For standard HTTP requests
    "http": django_asgi_app,
    
    # For WebSocket requests
    "websocket": AllowedHostsOriginValidator(
        URLRouter(
            rooms.routing.websocket_urlpatterns
        )
    ),
})