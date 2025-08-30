from django.urls import path
from . import views

urlpatterns = [
    # Template URLs
    path('', views.rooms_home, name='rooms_home'),
    path('room/<str:code>/', views.room_detail, name='room_detail'),
    
    # API URLs
    path('api/rooms/', views.RoomListCreateView.as_view(), name='api_rooms'),
    path('api/rooms/<str:code>/', views.RoomDetailView.as_view(), name='api_room_detail'),
    path('api/rooms/<str:code>/join/', views.JoinRoomView.as_view(), name='api_join_room'),
    path('api/rooms/<str:code>/leave/', views.LeaveRoomView.as_view(), name='api_leave_room'),
    path('api/join/', views.JoinRoomView.as_view(), name='api_join_room_by_code'),
]