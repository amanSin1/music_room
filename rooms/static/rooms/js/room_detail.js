// Enhanced rooms\static\rooms\js\room_detail.js with audio functionality
const ROOM_CODE = window.ROOM_CODE;
let roomData = null;
let isHost = false;
let roomSocket = null;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let audioPlayer = null;
let isUpdatingFromRemote = false;

// Token management
const TokenManager = {
    getAccessToken() {
        return localStorage.getItem('access_token');
    },
    
    clearTokens() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
    },
    
    isAuthenticated() {
        return !!this.getAccessToken();
    }
};

// API helper
async function apiCall(endpoint, method = 'GET', data = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TokenManager.getAccessToken()}`
    };
    
    const config = { method, headers };
    if (data) config.body = JSON.stringify(data);
    
    const response = await fetch(endpoint, config);
    
    if (response.status === 401) {
        TokenManager.clearTokens();
        window.location.href = '/login/';
        return;
    }
    
    return response;
}

// Show alert
function showAlert(message, type = 'error') {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => alertDiv.style.display = 'none', 4000);
    }
}

// Update connection status
function updateConnectionStatus(status, message) {
    const statusEl = document.getElementById('connectionStatus');
    statusEl.className = `connection-status connection-${status}`;
    statusEl.textContent = message;
    
    if (status === 'connected') {
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    } else {
        statusEl.style.display = 'block';
    }
}

// Audio Player Manager
const AudioPlayerManager = {
    init() {
        audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
            // Audio event listeners
            audioPlayer.addEventListener('loadedmetadata', this.onLoadedMetadata.bind(this));
            audioPlayer.addEventListener('timeupdate', this.onTimeUpdate.bind(this));
            audioPlayer.addEventListener('ended', this.onEnded.bind(this));
            audioPlayer.addEventListener('error', this.onError.bind(this));
            audioPlayer.addEventListener('play', this.onPlay.bind(this));
            audioPlayer.addEventListener('pause', this.onPause.bind(this));
        }
        
        // Progress bar click handler
        const progressContainer = document.getElementById('progressContainer');
        if (progressContainer) {
            progressContainer.addEventListener('click', this.onProgressClick.bind(this));
        }
    },
    
    onLoadedMetadata() {
        const duration = audioPlayer.duration;
        document.getElementById('totalTime').textContent = this.formatTime(duration);
    },
    
    onTimeUpdate() {
        if (isUpdatingFromRemote) return;
        
        const current = audioPlayer.currentTime;
        const duration = audioPlayer.duration;
        
        document.getElementById('currentTime').textContent = this.formatTime(current);
        
        if (duration && !isNaN(duration)) {
            const progress = (current / duration) * 100;
            document.getElementById('progressFill').style.width = progress + '%';
        }
    },
    
    onPlay() {
        if (!isUpdatingFromRemote && isHost) {
            this.syncPlaybackState();
        }
    },
    
    onPause() {
        if (!isUpdatingFromRemote && isHost) {
            this.syncPlaybackState();
        }
    },
    
    onEnded() {
        if (isHost) {
            // Automatically go to next song
            RoomSocket.send({
                type: 'next_song',
                room_code: ROOM_CODE
            });
        }
    },
    
    onError(e) {
        console.error('Audio error:', e);
        
        // Provide more specific error messages
        const error = e.target.error;
        let errorMessage = 'Error playing audio';
        
        if (error) {
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    errorMessage = 'Audio playback was aborted';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    errorMessage = 'Network error while loading audio';
                    break;
                case error.MEDIA_ERR_DECODE:
                    errorMessage = 'Audio file format not supported or corrupted';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    errorMessage = 'Audio source not supported. Please use direct MP3 links.';
                    break;
                default:
                    errorMessage = 'Unknown audio error';
            }
        }
        
        showAlert(errorMessage, 'error');
    },
    
    onProgressClick(e) {
        if (!isHost) return;
        
        const rect = e.currentTarget.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const newTime = percent * audioPlayer.duration;
        
        audioPlayer.currentTime = newTime;
        this.syncPlaybackState();
    },
    
    syncPlaybackState() {
        // Send current playback state to other participants
        RoomSocket.send({
            type: 'sync_playback',
            room_code: ROOM_CODE,
            current_time: audioPlayer.currentTime,
            is_playing: !audioPlayer.paused
        });
    },
    
    loadSong(songUrl, title, artist) {
        if (!audioPlayer) return;
        
        audioPlayer.src = songUrl;
        document.getElementById('songTitle').textContent = title;
        document.getElementById('songArtist').textContent = artist;
        
        // Show playing section, hide no song
        document.getElementById('noSong').style.display = 'none';
        document.getElementById('songPlaying').style.display = 'block';
    },
    
    play() {
        if (audioPlayer) {
            isUpdatingFromRemote = true;
            audioPlayer.play().finally(() => {
                isUpdatingFromRemote = false;
            });
        }
    },
    
    pause() {
        if (audioPlayer) {
            isUpdatingFromRemote = true;
            audioPlayer.pause();
            setTimeout(() => {
                isUpdatingFromRemote = false;
            }, 100);
        }
    },
    
    setTime(time) {
        if (audioPlayer && !isNaN(time)) {
            isUpdatingFromRemote = true;
            audioPlayer.currentTime = time;
            setTimeout(() => {
                isUpdatingFromRemote = false;
            }, 100);
        }
    },
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return mins + ':' + (secs < 10 ? '0' : '') + secs;
    }
};

// WebSocket Connection Manager
const RoomSocket = {
    connect: function() {
        console.log("--- Attempting WebSocket connection ---");
        updateConnectionStatus('connecting', 'Connecting...');
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const token = TokenManager.getAccessToken();
        
        if (!token) {
            console.error("No access token found!");
            updateConnectionStatus('disconnected', 'No Token');
            showAlert('Authentication required. Please log in again.', 'error');
            setTimeout(() => {
                window.location.href = '/login/';
            }, 2000);
            return;
        }
        
        const socketUrl = `${protocol}//${window.location.host}/ws/rooms/${ROOM_CODE}/?token=${token}`;
        
        try {
            roomSocket = new WebSocket(socketUrl);
            
            roomSocket.onopen = function(e) {
                console.log("WebSocket connected successfully", e);
                updateConnectionStatus('connected', 'Connected');
                reconnectAttempts = 0;
                
                RoomSocket.send({
                    'type': 'ping',
                    'timestamp': Date.now()
                });
            };
            
            roomSocket.onmessage = function(e) {
                console.log("WebSocket message received:", e.data);
                try {
                    const data = JSON.parse(e.data);
                    handleWebSocketMessage(data);
                } catch (error) {
                    console.error("Error parsing WebSocket message:", error);
                }
            };
            
            roomSocket.onclose = function(e) {
                console.log("WebSocket connection closed. Code:", e.code, "Reason:", e.reason);
                
                let statusMessage = 'Disconnected';
                let shouldReconnect = false;
                
                switch (e.code) {
                    case 1000:
                        statusMessage = 'Disconnected';
                        break;
                    case 4001:
                        statusMessage = 'Auth Failed';
                        showAlert('Authentication failed. Please log in again.', 'error');
                        setTimeout(() => {
                            TokenManager.clearTokens();
                            window.location.href = '/login/';
                        }, 2000);
                        break;
                    case 4003:
                        statusMessage = 'Access Denied';
                        showAlert('You are not a participant in this room.', 'error');
                        break;
                    case 4004:
                        statusMessage = 'Room Not Found';
                        showAlert('This room does not exist or is no longer active.', 'error');
                        break;
                    default:
                        statusMessage = 'Connection Lost';
                        shouldReconnect = true;
                }
                
                updateConnectionStatus('disconnected', statusMessage);
                
                if (shouldReconnect && reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`Attempting to reconnect... (${reconnectAttempts}/${maxReconnectAttempts})`);
                    setTimeout(() => {
                        this.connect();
                    }, 2000 * reconnectAttempts);
                }
            };
            
            roomSocket.onerror = function(e) {
                console.error("WebSocket error:", e);
                updateConnectionStatus('disconnected', 'Connection Error');
            };
            
        } catch (error) {
            console.error("Failed to create WebSocket:", error);
            updateConnectionStatus('disconnected', 'Failed to Connect');
        }
    },
    
    disconnect: function() {
        if (roomSocket) {
            console.log("Disconnecting WebSocket");
            roomSocket.close(1000);
            roomSocket = null;
        }
    },
    
    send: function(data) {
        if (roomSocket && roomSocket.readyState === WebSocket.OPEN) {
            roomSocket.send(JSON.stringify(data));
        } else {
            console.warn("WebSocket not ready, cannot send message:", data);
        }
    }
};

// Handle WebSocket messages
function handleWebSocketMessage(data) {
    console.log("Handling message type:", data.type, data);
    
    switch (data.type) {
        case 'user_joined':
            handleUserJoin(data);
            break;
        case 'user_left':
            handleUserLeave(data);
            break;
        case 'chat_message':
            handleChatMessage(data);
            break;
        case 'pong':
            console.log("Received pong response");
            break;
        case 'song_started':
            handleSongStarted(data);
            break;
        case 'song_paused':
            handleSongPaused(data);
            break;
        case 'song_resumed':
            handleSongResumed(data);
            break;
        case 'playback_synced':
            handlePlaybackSync(data);
            break;
        case 'room_updated':
            handleRoomUpdate(data);
            break;
        case 'success':
            showAlert(data.message, 'success');
            break;
        case 'error':
            console.error("WebSocket error:", data.message);
            showAlert(data.message || 'WebSocket error occurred', 'error');
            break;
        default:
            console.log("Unhandled message type:", data.type);
    }
}

// WebSocket Message Handlers
function handleUserJoin(data) {
    console.log("User joined:", data);
    
    const existingParticipant = document.getElementById(`participant-${data.user_id}`);
    if (existingParticipant) {
        return;
    }
    
    const container = document.getElementById('participantsList');
    const participantHtml = createParticipantHtml(data.user_id, data.name, 'Guest');
    container.insertAdjacentHTML('beforeend', participantHtml);
    updateParticipantCount(1);
    
    showAlert(`${data.name} joined the room`, 'success');
}

function handleUserLeave(data) {
    console.log("User left:", data);
    
    const participantElement = document.getElementById(`participant-${data.user_id}`);
    if (participantElement) {
        participantElement.remove();
        updateParticipantCount(-1);
        showAlert(`${data.name} left the room`, 'success');
    }
}

function handleSongStarted(data) {
    console.log("Song started:", data);
    if (data.song_url) {
        AudioPlayerManager.loadSong(data.song_url, data.current_song, data.current_artist);
        if (data.is_playing) {
            setTimeout(() => AudioPlayerManager.play(), 500);
        }
    }
    updatePlaybackUI(data);
}

function handleSongPaused(data) {
    console.log("Song paused:", data);
    AudioPlayerManager.pause();
    updatePlaybackUI(data);
}

function handleSongResumed(data) {
    console.log("Song resumed:", data);
    if (data.current_time !== undefined) {
        AudioPlayerManager.setTime(data.current_time);
    }
    AudioPlayerManager.play();
    updatePlaybackUI(data);
}

function handlePlaybackSync(data) {
    console.log("Playback sync:", data);
    if (data.current_time !== undefined) {
        AudioPlayerManager.setTime(data.current_time);
    }
    if (data.is_playing) {
        AudioPlayerManager.play();
    } else {
        AudioPlayerManager.pause();
    }
}

function handleChatMessage(data) {
    console.log("Chat message received:", data);
    showAlert(`${data.name}: ${data.message}`, 'success');
}

function handleRoomUpdate(data) {
    console.log("Room updated:", data);
    if (data.room) {
        displayRoom(data.room);
    }
}

// Load room data
async function loadRoom() {
    try {
        const response = await apiCall(`/rooms/api/rooms/${ROOM_CODE}/`);
        
        if (response.ok) {
            roomData = await response.json();
            displayRoom(roomData);
            document.getElementById('loading').style.display = 'none';
            document.getElementById('roomContent').style.display = 'block';
            
            RoomSocket.connect();
        } else {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('errorState').style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading room:', error);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('errorState').style.display = 'block';
    }
}

// Display room data
function displayRoom(room) {
    isHost = room.is_user_host;
    
    document.getElementById('roomName').textContent = room.name;
    document.getElementById('roomDescription').textContent = room.description || '';
    document.getElementById('participantCount').textContent = room.participant_count;
    document.getElementById('roomStatus').textContent = room.status.charAt(0).toUpperCase() + room.status.slice(1);
    document.getElementById('yourRole').textContent = isHost ? 'Host' : 'Guest';
    
    displayParticipants(room.participants_detail);
    updatePlaybackState(room);
}

function createParticipantHtml(userId, name, role) {
    const initial = name.charAt(0).toUpperCase();
    const isHostUser = role.toLowerCase() === 'host';
    return `
        <div class="participant" id="participant-${userId}">
            <div class="participant-avatar">${initial}</div>
            <div class="participant-info">
                <div class="participant-name">${name}</div>
                <div class="participant-role">
                    ${role}
                    ${isHostUser ? '<span class="host-badge">HOST</span>' : ''}
                </div>
            </div>
        </div>
    `;
}

function displayParticipants(participants) {
    const container = document.getElementById('participantsList');
    container.innerHTML = participants.map(p => createParticipantHtml(p.user.id, p.user.name, p.role)).join('');
}

function updateParticipantCount(change) {
    const countElement = document.getElementById('participantCount');
    let currentCount = parseInt(countElement.textContent);
    countElement.textContent = currentCount + change;
}

function updatePlaybackState(room) {
    const noSong = document.getElementById('noSong');
    const songPlaying = document.getElementById('songPlaying');
    
    if (room.current_song) {
        noSong.style.display = 'none';
        songPlaying.style.display = 'block';
        
        document.getElementById('songTitle').textContent = room.current_song;
        document.getElementById('songArtist').textContent = room.current_artist || 'Unknown Artist';
        
        updatePlaybackUI(room);
    } else {
        noSong.style.display = 'block';
        songPlaying.style.display = 'none';
    }
}

function updatePlaybackUI(data) {
    const playPauseBtn = document.getElementById('playPauseBtn');
    if (playPauseBtn) {
        playPauseBtn.textContent = data.is_playing ? '⏸️' : '▶️';
    }
    
    // Enable/disable controls based on host status
    const controls = ['prevBtn', 'playPauseBtn', 'nextBtn'];
    controls.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !isHost;
        }
    });
}

// Modal functions
function showAddSong() {
    const modal = document.getElementById('addSongModal');
    if (modal) {
        modal.style.display = 'block';
    } else {
        console.error('Add song modal element not found');
        showAlert('Modal not found. Please refresh the page.', 'error');
    }
}

function closeAddSongModal() {
    const modal = document.getElementById('addSongModal');
    if (modal) {
        modal.style.display = 'none';
        // Clear form
        const titleInput = document.getElementById('songTitleInput');
        const artistInput = document.getElementById('artistInput');
        const urlInput = document.getElementById('songUrlInput');
        
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
        if (urlInput) urlInput.value = '';
    }
}

function addSongToQueue() {
    const titleInput = document.getElementById('songTitleInput');
    const artistInput = document.getElementById('artistInput');
    const urlInput = document.getElementById('songUrlInput');
    
    if (!titleInput || !artistInput || !urlInput) {
        showAlert('Form elements not found. Please refresh the page.', 'error');
        return;
    }
    
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim() || 'Unknown Artist';
    const url = urlInput.value.trim();
    
    if (!title) {
        showAlert('Song title is required', 'error');
        return;
    }
    
    if (!url) {
        showAlert('Song URL is required', 'error');
        return;
    }
    
    // Validate URL format
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        showAlert('YouTube URLs are not supported yet. Please use direct MP3 links for now.', 'error');
        return;
    }
    
    // Check if it's likely a direct audio file
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const hasAudioExtension = audioExtensions.some(ext => url.toLowerCase().includes(ext));
    
    if (!hasAudioExtension) {
        if (!confirm('This doesn\'t appear to be a direct audio file link. It may not play correctly. Continue anyway?')) {
            return;
        }
    }
    
    if (roomSocket && roomSocket.readyState === WebSocket.OPEN) {
        RoomSocket.send({
            type: 'add_song',
            song_title: title,
            artist: artist,
            song_url: url,
            room_code: ROOM_CODE
        });
        
        closeAddSongModal();
    } else {
        showAlert('Not connected to room', 'error');
    }
}

// Room actions
function copyRoomLink() {
    const link = window.location.href;
    navigator.clipboard.writeText(link).then(() => {
        showAlert('Room link copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy link', 'error');
    });
}

async function leaveRoom() {
    if (!confirm('Are you sure you want to leave this room?')) return;
    
    RoomSocket.disconnect();
    
    try {
        const response = await apiCall(`/rooms/api/rooms/${ROOM_CODE}/leave/`, 'POST');
        
        if (response.ok) {
            showAlert('Left room successfully', 'success');
            setTimeout(() => {
                window.location.href = '/rooms/';
            }, 1000);
        } else {
            showAlert('Failed to leave room', 'error');
        }
    } catch (error) {
        showAlert('Network error', 'error');
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    if (!TokenManager.isAuthenticated()) {
        window.location.href = '/login/';
        return;
    }
    
    // Initialize audio player
    AudioPlayerManager.init();
    
    // Control button handlers
    document.getElementById('playPauseBtn').addEventListener('click', function() {
        if (roomSocket && isHost) {
            RoomSocket.send({
                type: 'toggle_playback',
                room_code: ROOM_CODE
            });
        }
    });
    
    document.getElementById('prevBtn').addEventListener('click', function() {
        if (roomSocket && isHost) {
            RoomSocket.send({
                type: 'previous_song',
                room_code: ROOM_CODE
            });
        }
    });
    
    document.getElementById('nextBtn').addEventListener('click', function() {
        if (roomSocket && isHost) {
            RoomSocket.send({
                type: 'next_song',
                room_code: ROOM_CODE
            });
        }
    });
    
    // Logout
    document.getElementById('logoutLink').addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            RoomSocket.disconnect();
            TokenManager.clearTokens();
            window.location.href = '/';
        }
    });
    
    // Handle page unload
    window.addEventListener('beforeunload', function() {
        RoomSocket.disconnect();
    });
    
    // Modal click outside to close
    window.addEventListener('click', function(e) {
        const modal = document.getElementById('addSongModal');
        if (e.target === modal) {
            closeAddSongModal();
        }
    });
    
    // Load room data
    loadRoom();
});