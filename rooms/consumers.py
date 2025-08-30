# rooms/consumers.py

import json
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import UntypedToken  # Fixed: was UntokenedToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.contrib.auth import get_user_model
from .models import Room, RoomParticipant
from urllib.parse import parse_qs

User = get_user_model()

class RoomConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer for room real-time communication.
    Handles user authentication via JWT token in query parameters.
    """

    async def connect(self):
        print("--- WebSocket connect() called. ---")
        
        # 1. Get the room code from the URL
        self.room_code = self.scope['url_route']['kwargs']['code']
        self.room_group_name = f'room_{self.room_code}'
        
        print(f"Attempting to connect to room: {self.room_code}")
        
        # 2. Extract JWT token from query string
        query_string = self.scope.get('query_string', b'').decode()
        print(f"Query string: {query_string}")
        
        if not query_string:
            print("No query string found, rejecting connection")
            await self.close(code=4001)
            return
        
        # Parse query parameters
        query_params = parse_qs(query_string)
        token = query_params.get('token', [None])[0]
        
        if not token:
            print("No token found in query parameters, rejecting connection")
            await self.close(code=4001)
            return
        
        print(f"Token found: {token[:20]}...")
        
        # 3. Authenticate user using JWT token
        try:
            # Decode the JWT token
            untyped_token = UntypedToken(token)  # Fixed: was UntokenedToken
            user_id = untyped_token['user_id']
            print(f"Token decoded successfully, user_id: {user_id}")
            
            # Get the user from database
            self.user = await self.get_user(user_id)
            
            if not self.user:
                print(f"User with ID {user_id} not found, rejecting connection")
                await self.close(code=4001)
                return
                
            print(f"User authenticated: {self.user.name}")
            
        except (InvalidToken, TokenError) as e:
            print(f"Invalid token, rejecting connection: {e}")
            await self.close(code=4001)
            return
        except Exception as e:
            print(f"Error during authentication: {e}")
            await self.close(code=4001)
            return
        
        # 4. Check if room exists and is active
        room = await self.get_room()
        if not room:
            print(f"Room {self.room_code} not found or inactive, rejecting connection")
            await self.close(code=4004)
            return
        
        # 5. Check if user is a participant in this room
        is_participant = await self.is_user_participant(room)
        if not is_participant:
            print(f"User {self.user.name} is not a participant in room {self.room_code}")
            await self.close(code=4003)
            return
        
        print(f"User {self.user.name} is authorized for room {self.room_code}")
        
        # 6. Add user to the room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        # 7. Accept the connection
        await self.accept()
        print(f"WebSocket connection accepted for user {self.user.name}")
        
        # 8. Announce that user has joined
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user.join',
                'payload': {
                    'user_id': self.user.id,
                    'name': self.user.name,
                }
            }
        )

    async def disconnect(self, close_code):
        """
        Called when the WebSocket connection is closed.
        """
        print(f"--- WebSocket disconnect() called. Close code: {close_code} ---")
        
        # Only proceed if user was successfully authenticated
        if hasattr(self, 'user') and self.user and hasattr(self.user, 'name'):
            print(f"User {self.user.name} disconnecting from room {self.room_code}")
            
            # Announce that user has left
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'user.leave',
                    'payload': {
                        'user_id': self.user.id,
                        'name': self.user.name,
                    }
                }
            )
        else:
            print("User was not authenticated, skipping user.leave announcement")
        
        # Remove user from the room group
        if hasattr(self, 'room_group_name') and hasattr(self, 'channel_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive_json(self, content):
        """Enhanced to handle music control messages"""
        print(f"Received message from {self.user.name}: {content}")
        
        message_type = content.get('type')
        
        if message_type == 'ping':
            await self.send_json({
                'type': 'pong',
                'timestamp': content.get('timestamp')
            })
        elif message_type == 'chat_message':
            await self.handle_chat_message(content)
        elif message_type == 'toggle_playback':
            await self.handle_toggle_playback(content)
        elif message_type == 'next_song':
            await self.handle_next_song(content)
        elif message_type == 'previous_song':
            await self.handle_previous_song(content)
        elif message_type == 'add_song':
            await self.handle_add_song(content)
        elif message_type == 'sync_playback':
            await self.handle_sync_playback(content)
        else:
            print(f"Unknown message type: {message_type}")
            await self.send_json({
                'type': 'error',
                'message': f'Unknown message type: {message_type}'
            })

    async def handle_toggle_playback(self, content):
        """Handle play/pause toggle - host only"""
        room = await self.get_room()
        if not room or not await self.is_user_host(room):
            await self.send_json({'type': 'error', 'message': 'Only host can control playback'})
            return
        
        # Toggle the playback state
        new_state = not room.is_playing
        await self.update_room_playback(room, new_state)
        
        # Get updated room data
        updated_room = await self.get_room()
        
        # Broadcast to all participants
        message_type = 'song_resumed' if new_state else 'song_paused'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'playback.changed',
                'payload': {
                    'type': message_type,
                    'is_playing': new_state,
                    'current_song': updated_room.current_song,
                    'current_artist': updated_room.current_artist,
                    'current_time': updated_room.current_position,
                    'timestamp': content.get('timestamp')
                }
            }
        )

    async def handle_next_song(self, content):
        """Handle next song - host only"""
        room = await self.get_room()
        if not room or not await self.is_user_host(room):
            await self.send_json({'type': 'error', 'message': 'Only host can control playback'})
            return
        
        # Get next song from queue or simulate
        next_song_data = await self.get_next_song(room)
        
        if next_song_data:
            await self.start_song(room, next_song_data['title'], next_song_data['artist'], next_song_data.get('url'))
            
            # Broadcast the change
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'song.started',
                    'payload': {
                        'type': 'song_started',
                        'current_song': next_song_data['title'],
                        'current_artist': next_song_data['artist'],
                        'song_url': next_song_data.get('url'),
                        'is_playing': True,
                        'current_time': 0
                    }
                }
            )
        else:
            await self.send_json({'type': 'error', 'message': 'No songs in queue'})

    async def handle_previous_song(self, content):
        """Handle previous song - host only"""
        room = await self.get_room()
        if not room or not await self.is_user_host(room):
            await self.send_json({'type': 'error', 'message': 'Only host can control playback'})
            return
        
        # For now, just simulate changing song
        await self.simulate_next_song(room)
        
        # Broadcast the change
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'song.changed',
                'payload': {
                    'current_song': room.current_song,
                    'current_artist': room.current_artist,
                    'is_playing': room.is_playing,
                    'current_position': 0
                }
            }
        )

    async def handle_add_song(self, content):
        """Handle adding song to queue"""
        song_title = content.get('song_title', '').strip()
        artist = content.get('artist', '').strip() or 'Unknown Artist'
        song_url = content.get('song_url', '').strip()
        
        if not song_title or not song_url:
            await self.send_json({'type': 'error', 'message': 'Song title and URL are required'})
            return
        
        room = await self.get_room()
        if not room:
            return
        
        # Add to queue or start playing if nothing is playing
        if not room.current_song:
            # Start playing immediately
            await self.start_song(room, song_title, artist, song_url)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'song.started',
                    'payload': {
                        'type': 'song_started',
                        'current_song': song_title,
                        'current_artist': artist,
                        'song_url': song_url,
                        'is_playing': True,
                        'current_time': 0
                    }
                }
            )
            await self.send_json({'type': 'success', 'message': f'Now playing "{song_title}"'})
        else:
            # Add to queue
            await self.add_to_queue(room, song_title, artist, song_url)
            await self.send_json({'type': 'success', 'message': f'Added "{song_title}" to queue'})

    async def handle_sync_playback(self, content):
        """Handle playback synchronization from host"""
        room = await self.get_room()
        if not room or not await self.is_user_host(room):
            return
        
        current_time = content.get('current_time', 0)
        is_playing = content.get('is_playing', False)
        
        # Update room state
        await self.update_room_position(room, current_time, is_playing)
        
        # Sync with other participants (excluding host)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'playback.sync',
                'payload': {
                    'type': 'playback_synced',
                    'current_time': current_time,
                    'is_playing': is_playing,
                    'sync_from_host': True
                }
            }
        )

    async def handle_chat_message(self, content):
        """
        Handle chat messages from users.
        """
        message = content.get('message', '').strip()
        if not message:
            return
        
        # Broadcast the chat message to all room members
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat.message',
                'payload': {
                    'user_id': self.user.id,
                    'name': self.user.name,
                    'message': message,
                    'timestamp': content.get('timestamp')
                }
            }
        )

    # --- Event handlers called by channel_layer.group_send ---
    
    async def user_join(self, event):
        """Handle user join events."""
        print(f"Broadcasting user_join: {event['payload']}")
        await self.send_json({
            'type': 'user_joined',
            **event['payload']
        })

    async def user_leave(self, event):
        """Handle user leave events."""
        print(f"Broadcasting user_leave: {event['payload']}")
        await self.send_json({
            'type': 'user_left',
            **event['payload']
        })

    async def chat_message(self, event):
        """Handle chat message events."""
        await self.send_json({
            'type': 'chat_message',
            **event['payload']
        })

    async def playback_changed(self, event):
        """Handle playback state changes"""
        await self.send_json(event['payload'])

    async def song_changed(self, event):
        await self.send_json({
            'type': 'song_started',
            **event['payload']
        })

    async def song_started(self, event):
        """Handle new song starting"""
        await self.send_json(event['payload'])

    async def playback_sync(self, event):
        """Handle playback synchronization"""
        # Don't send sync messages back to the host
        if not event['payload'].get('sync_from_host') or not await self.is_user_host(await self.get_room()):
            await self.send_json(event['payload'])

    # --- Database operations ---
    
    @database_sync_to_async
    def get_user(self, user_id):
        """Get user by ID from database."""
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    @database_sync_to_async
    def get_room(self):
        """Get room by code from database."""
        try:
            return Room.objects.get(code=self.room_code, status='active')
        except Room.DoesNotExist:
            return None

    @database_sync_to_async
    def is_user_participant(self, room):
        """Check if user is a participant in the room."""
        try:
            RoomParticipant.objects.get(room=room, user=self.user)
            return True
        except RoomParticipant.DoesNotExist:
            return False

    @database_sync_to_async
    def is_user_host(self, room):
        """Check if user is the host of the room."""
        try:
            participant = RoomParticipant.objects.get(room=room, user=self.user)
            return participant.role == 'host'
        except RoomParticipant.DoesNotExist:
            return False

    @database_sync_to_async
    def update_room_playback(self, room, is_playing):
        """Update room playback state"""
        from django.utils import timezone
        room.is_playing = is_playing
        if is_playing and not room.current_song:
            return  # Can't play if no song is set
        if is_playing:
            room.playback_started_at = timezone.now()
        room.save()

    @database_sync_to_async
    def update_room_position(self, room, current_time, is_playing):
        """Update room playback position and state"""
        room.current_position = int(current_time)
        room.is_playing = is_playing
        room.save()

    @database_sync_to_async
    def start_song(self, room, title, artist, url=None):
        """Start playing a new song"""
        from django.utils import timezone
        room.current_song = title
        room.current_artist = artist
        room.is_playing = True
        room.current_position = 0
        room.playback_started_at = timezone.now()
        
        # Store URL in queue_data for now (you can improve this later)
        if url:
            queue_data = room.queue_data or []
            # Remove the current song from queue if it exists
            queue_data = [song for song in queue_data if song.get('title') != title]
            room.queue_data = queue_data
        
        room.save()

    @database_sync_to_async
    def add_to_queue(self, room, title, artist, url):
        """Add song to the room's queue"""
        from django.utils import timezone
        queue_data = room.queue_data or []
        queue_data.append({
            'title': title,
            'artist': artist,
            'url': url,
            'added_by': self.user.id,
            'added_at': str(timezone.now())
        })
        room.queue_data = queue_data
        room.save()

    @database_sync_to_async
    def get_next_song(self, room):
        """Get the next song from queue"""
        queue_data = room.queue_data or []
        if queue_data:
            next_song = queue_data.pop(0)  # Get first song and remove it
            room.queue_data = queue_data
            room.save()
            return next_song
        
        # If no queue, return a sample song for testing
        sample_songs = [
            {
                'title': 'Sample Song 1',
                'artist': 'Test Artist',
                'url': 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3'
            },
            {
                'title': 'Sample Song 2', 
                'artist': 'Demo Artist',
                'url': 'https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3'
            }
        ]
        
        import random
        return random.choice(sample_songs)

    @database_sync_to_async
    def simulate_next_song(self, room):
        """Simulate changing to next song (replace with actual queue logic)"""
        # This is a placeholder - you can implement actual queue logic
        sample_songs = [
            ("Song A", "Artist A"),
            ("Song B", "Artist B"), 
            ("Song C", "Artist C")
        ]
        
        import random
        song, artist = random.choice(sample_songs)
        
        from django.utils import timezone
        room.current_song = song
        room.current_artist = artist
        room.current_position = 0
        room.playback_started_at = timezone.now()
        room.save()