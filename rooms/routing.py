# rooms/routing.py
from django.urls import path
from . import consumers

websocket_urlpatterns = [
    # WebSocket URL pattern for room connections
    path('ws/rooms/<str:code>/', consumers.RoomConsumer.as_asgi()),
]