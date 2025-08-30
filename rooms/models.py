from django.db import models
from django.contrib.auth import get_user_model
import uuid
import string
import random

User = get_user_model()

def generate_room_code():
    """Generate a unique 6-character room code"""
    length = 6
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))
        if not Room.objects.filter(code=code).exists():
            return code

class Room(models.Model):
    ROOM_STATUS_CHOICES = [
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('ended', 'Ended'),
    ]
    
    # Basic room info
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=6, unique=True, default=generate_room_code)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    
    # Host and participants
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hosted_rooms')
    participants = models.ManyToManyField(User, through='RoomParticipant', related_name='joined_rooms')
    
    # Room settings
    is_public = models.BooleanField(default=True)  # Can anyone join with code?
    max_participants = models.IntegerField(default=10)
    allow_guest_control = models.BooleanField(default=True)  # Can guests add songs?
    
    # Room status
    status = models.CharField(max_length=20, choices=ROOM_STATUS_CHOICES, default='active')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    # Current playback state (we'll expand this later)
    current_song = models.CharField(max_length=200, blank=True, null=True)
    is_playing = models.BooleanField(default=False)
    current_position = models.IntegerField(default=0)  # in seconds
    # Add these fields to your existing Room model
    current_artist = models.CharField(max_length=200, blank=True, null=True)
    current_duration = models.IntegerField(default=0)  # song duration in seconds
    playback_started_at = models.DateTimeField(blank=True, null=True)  # when current song started
    queue_data = models.JSONField(default=list)  # simple queue for now
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.name} ({self.code})"
    
    @property
    def participant_count(self):
        """A convenient way to get the number of *active* participants."""
        # This now filters the intermediate RoomParticipant table to only
        # count users where the 'is_active' flag on that table is True.
        return self.participants.filter(roomparticipant__is_active=True).count()
    
    def is_host(self, user):
        return self.host == user
    
    def can_join(self, user=None):
        if self.status != 'active':
            return False
        if self.participant_count >= self.max_participants:
            return False
        return True

class RoomParticipant(models.Model):
    ROLE_CHOICES = [
        ('host', 'Host'),
        ('guest', 'Guest'),
    ]
    
    room = models.ForeignKey(Room, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='guest')
    joined_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)  # Still in the room?
    
    class Meta:
        unique_together = ['room', 'user']
    
    def __str__(self):
        return f"{self.user.name} in {self.room.name} ({self.role})"