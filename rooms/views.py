from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import Room, RoomParticipant
from .serializers import (
    RoomSerializer, 
    CreateRoomSerializer, 
    JoinRoomSerializer
)

# API Views
class RoomListCreateView(generics.ListCreateAPIView):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        # Show user's hosted rooms and participated rooms
        user = self.request.user
        return Room.objects.filter(
            models.Q(host=user) | models.Q(participants=user)
        ).distinct()
    
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CreateRoomSerializer
        return RoomSerializer

class RoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = RoomSerializer
    permission_classes = [IsAuthenticated]
    lookup_field = 'code'
    
    def get_queryset(self):
        return Room.objects.all()
    
    def get_object(self):
        code = self.kwargs['code'].upper()
        return get_object_or_404(Room, code=code)
    
    def perform_update(self, serializer):
        room = self.get_object()
        if not room.is_host(self.request.user):
            raise PermissionError("Only the host can update the room")
        serializer.save()
    
    def perform_destroy(self, instance):
        if not instance.is_host(self.request.user):
            raise PermissionError("Only the host can delete the room")
        instance.delete()

class JoinRoomView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        serializer = JoinRoomSerializer(data=request.data)
        if serializer.is_valid():
            code = serializer.validated_data['code']
            room = Room.objects.get(code=code)
            
            # Check if user is already in the room
            participant, created = RoomParticipant.objects.get_or_create(
                room=room,
                user=request.user,
                defaults={'role': 'guest', 'is_active': True}
            )
            
            if not created:
                # User was already in room, just activate them
                participant.is_active = True
                participant.save()
            
            room_data = RoomSerializer(room, context={'request': request}).data
            return Response({
                'message': 'Successfully joined room',
                'room': room_data
            })
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class LeaveRoomView(APIView):
    permission_classes = [IsAuthenticated]
    
    def post(self, request, code):
        room = get_object_or_404(Room, code=code.upper())
        
        try:
            participant = RoomParticipant.objects.get(room=room, user=request.user)
            participant.is_active = False
            participant.save()
            
            return Response({'message': 'Successfully left room'})
        except RoomParticipant.DoesNotExist:
            return Response(
                {'error': 'You are not in this room'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

# Template Views
def rooms_home(request):
    """Main rooms page - shows user's rooms and join form"""
    return render(request, 'rooms/rooms_home.html')

def room_detail(request, code):
    """Individual room page"""
    room = get_object_or_404(Room, code=code.upper())
    return render(request, 'rooms/room_detail.html', {'room_code': code.upper()})

# Import Django's Q for queryset filtering
from django.db import models