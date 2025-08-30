# MusicRoom 🎵

A real-time collaborative music listening platform where users can create rooms, join via unique codes, and listen to music together in perfect synchronization.

## Overview

MusicRoom allows users to create virtual music rooms where one host controls the playback and all participants hear the same music at the same time. Perfect for listening parties, remote hangouts, or synchronized music experiences.

## Features

### Core Functionality
- **Room Creation & Management**: Create rooms with unique 6-character codes
- **Real-time Synchronization**: All participants hear music in perfect sync
- **Host Controls**: Room host can play, pause, skip, and control playback
- **Live Participant Updates**: See who joins and leaves the room instantly
- **Queue Management**: Add songs to a shared queue
- **Cross-platform Audio**: Works on desktop and mobile browsers

### User Experience
- **Secure Authentication**: JWT-based user authentication
- **Responsive Design**: Works seamlessly across devices
- **Real-time Connection Status**: Live connection indicators
- **Interactive UI**: Modern, intuitive interface with visual feedback
- **Room Sharing**: Easy room link copying and sharing

## Tech Stack

### Backend
- **Django 4.x** - Web framework
- **Django Channels** - WebSocket support for real-time features
- **Django REST Framework** - API development
- **PostgreSQL/SQLite** - Database
- **Redis** - Channel layer backend for WebSocket scaling
- **JWT Authentication** - Secure token-based auth

### Frontend
- **Vanilla JavaScript** - Client-side logic
- **HTML5 Audio API** - Audio playback and synchronization
- **WebSocket API** - Real-time communication
- **CSS3** - Modern styling with gradients and animations
- **Responsive Design** - Mobile-first approach

### Real-time Infrastructure
- **WebSocket Connections** - Bi-directional real-time communication
- **Channel Groups** - Room-based message broadcasting
- **Event-driven Architecture** - Asynchronous message handling

## Architecture

### Database Schema
```
Users ←→ Rooms (Many-to-Many through RoomParticipant)
- Room: id, code, name, host, current_song, is_playing, etc.
- RoomParticipant: user, room, role, is_active, joined_at
- User: Custom user model with name, email
```

### WebSocket Message Types
```javascript
// Client → Server
{
  "type": "toggle_playback",
  "type": "add_song", 
  "type": "next_song",
  "type": "sync_playback"
}

// Server → Client  
{
  "type": "song_started",
  "type": "user_joined",
  "type": "playback_synced",
  "type": "song_paused"
}
```

### API Endpoints
```
GET  /rooms/api/rooms/           # List user's rooms
POST /rooms/api/rooms/           # Create new room  
GET  /rooms/api/rooms/{code}/    # Get room details
POST /rooms/api/rooms/join/      # Join room by code
POST /rooms/api/rooms/{code}/leave/ # Leave room
```

## Installation & Setup

### Prerequisites
- Python 3.8+
- Redis server
- Node.js (for any future frontend tooling)

### Backend Setup
```bash
# Clone repository
git clone <your-repo-url>
cd musicroom

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install django djangorestframework channels channels-redis
pip install djangorestframework-simplejwt

# Database setup
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser

# Start Redis (required for channels)
redis-server

# Run development server
python manage.py runserver
```

### Environment Configuration
```python
# settings.py additions
INSTALLED_APPS = [
    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'rooms',
    'users',
]

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [('127.0.0.1', 6379)],
        },
    },
}
```

## Usage

### Creating a Room
1. Register/login to the platform
2. Click "Create Room" 
3. Fill in room details (name, description, settings)
4. Share the 6-character room code with friends

### Joining a Room
1. Enter the room code on the join page
2. Get instantly connected via WebSocket
3. See live participant list and current playback state

### Music Playback (Host)
1. Click "Add Song to Queue"
2. Provide song title, artist, and MP3 URL
3. Use playback controls (play/pause/next/previous)
4. All participants hear changes instantly

### Music Playback (Participants)
1. See real-time playback updates
2. View current song information
3. See progress bar and time updates
4. Receive notifications for song changes

## File Structure

```
musicroom/
├── musicroom/
│   ├── settings.py
│   ├── asgi.py          # ASGI config for channels
│   └── urls.py
├── rooms/
│   ├── models.py        # Room, RoomParticipant models
│   ├── consumers.py     # WebSocket consumer
│   ├── serializers.py   # DRF serializers
│   ├── views.py         # API views
│   ├── routing.py       # WebSocket URL routing
│   ├── static/rooms/
│   │   ├── css/room_detail.css
│   │   └── js/room_detail.js
│   └── templates/rooms/
│       └── room_detail.html
└── users/
    ├── models.py        # Custom user model
    └── ...
```

## Key Technical Decisions

### WebSocket Authentication
- JWT tokens passed via query parameters
- Token validation on WebSocket connection
- Automatic disconnection for invalid/expired tokens

### Audio Synchronization Strategy
- Host-controlled playback state
- Real-time position broadcasting
- Client-side audio element synchronization
- Buffering and latency handling

### Scalability Considerations
- Redis channel layers for horizontal scaling
- Room-based message groups to limit broadcast scope
- Efficient participant tracking with active/inactive states

## Current Limitations

### Audio Sources
- Currently supports direct MP3 URLs only
- No integration with Spotify/YouTube/Apple Music APIs
- Limited to browser-supported audio formats

### Scalability
- Single Redis instance (not clustered)
- No CDN for audio content
- Basic queue management (no persistence)

## Future Enhancements

### Music Service Integration
- Spotify Web Playback SDK integration
- YouTube API for video/audio streaming
- Apple Music API support
- SoundCloud integration

### Advanced Features
- Vote-to-skip functionality
- DJ queue management
- Room themes and customization
- Chat functionality
- User profiles and history

### Technical Improvements
- Audio CDN integration
- Advanced caching strategies
- Mobile app development
- Offline queue support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or support, please open an issue on the GitHub repository.

---

**Note**: This application is designed for educational and personal use. For production deployment with commercial music services, ensure proper licensing and API agreements are in place.
