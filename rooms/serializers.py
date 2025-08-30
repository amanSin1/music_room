from rest_framework import serializers
from .models import Room, RoomParticipant
from django.contrib.auth import get_user_model

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'name', 'email']

class RoomParticipantSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)

    class Meta:
        model = RoomParticipant
        fields = ['user', 'role', 'joined_at', 'is_active']

class RoomSerializer(serializers.ModelSerializer):
    host = UserSerializer(read_only=True)
    participant_count = serializers.ReadOnlyField()
    participants_detail = serializers.SerializerMethodField() 
    is_user_host = serializers.SerializerMethodField()
    is_user_participant = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            'id', 'code', 'name', 'description', 'host',
            'is_public', 'max_participants', 'allow_guest_control',
            'status', 'created_at', 'participant_count',
            'current_song', 'current_artist', 'current_duration','is_playing', 'current_position',
            'participants_detail', 'is_user_host', 'is_user_participant'
        ]
        read_only_fields = ['id', 'code', 'created_at', 'host']
    def get_participants_detail(self, obj):
        """
        This method now manually fetches only the active participants for the room.
        'obj' here is the Room instance.
        """
        active_participants = RoomParticipant.objects.filter(room=obj, is_active=True)
        # We then serialize this filtered list using the RoomParticipantSerializer.
        return RoomParticipantSerializer(active_participants, many=True).data
    
    def get_is_user_host(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.is_host(request.user)
        return False

    def get_is_user_participant(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.participants.filter(id=request.user.id).exists()
        return False

# rooms/serializers.py

class CreateRoomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        # Add 'code' to the fields list
        fields = [
            'code', 'name', 'description', 'is_public', 
            'max_participants', 'allow_guest_control'
        ]
        # Mark 'code' as read_only so it can't be set by the user, only returned
        read_only_fields = ['code']

    def validate_max_participants(self, value):
        if value < 2 or value > 50:
            raise serializers.ValidationError("Max participants must be between 2 and 50")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            raise serializers.ValidationError("Authentication required to create a room.")

        validated_data['host'] = request.user
        room = Room.objects.create(**validated_data)

        RoomParticipant.objects.create(
            room=room,
            user=request.user,
            role='host'
        )
        return room

class JoinRoomSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=6, min_length=6)

    def validate_code(self, value):
        try:
            room = Room.objects.get(code=value.upper())
            if not room.can_join():
                raise serializers.ValidationError("Cannot join this room (e.g., room is full or ended).")
            return value.upper()
        except Room.DoesNotExist:
            raise serializers.ValidationError("Room with this code does not exist.")
