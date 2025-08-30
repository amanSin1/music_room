// Token management
const TokenManager = {
    setTokens(accessToken, refreshToken) {
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
    },
    
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

// Show/hide alerts
function showAlert(message, type = 'error') {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert alert-${type}`;
    alertDiv.style.display = 'block';
    
    if (type === 'success') {
        setTimeout(() => alertDiv.style.display = 'none', 4000);
    }
}

// Create room functions
function showCreateForm() {
    document.getElementById('createRoomSection').style.display = 'block';
    document.getElementById('roomName').focus();
}

function hideCreateForm() {
    document.getElementById('createRoomSection').style.display = 'none';
    document.getElementById('createRoomForm').reset();
}

// Join room
async function joinRoom() {
    const code = document.getElementById('roomCode').value.trim().toUpperCase();
    if (!code || code.length !== 6) {
        showAlert('Please enter a valid 6-character room code', 'error');
        return;
    }
    
    try {
        const response = await apiCall('/rooms/api/join/', 'POST', { code });
        const data = await response.json();
        
        if (response.ok) {
            showAlert('Successfully joined room! Redirecting...', 'success');
            setTimeout(() => {
                window.location.href = `/rooms/room/${code}/`;
            }, 1000);
        } else {
            showAlert(data.code ? data.code[0] : 'Failed to join room', 'error');
        }
    } catch (error) {
        showAlert('Network error. Please try again.', 'error');
    }
}

// Load user's rooms
async function loadRooms() {
    const loading = document.getElementById('roomsLoading');
    const container = document.getElementById('roomsContainer');
    const empty = document.getElementById('roomsEmpty');
    
    try {
        const response = await apiCall('/rooms/api/rooms/');
        const rooms = await response.json();
        
        loading.style.display = 'none';
        
        if (rooms.length === 0) {
            empty.style.display = 'block';
        } else {
            container.style.display = 'grid';
            container.innerHTML = rooms.map(room => createRoomCard(room)).join('');
        }
    } catch (error) {
        loading.style.display = 'none';
        showAlert('Failed to load rooms', 'error');
    }
}

// Create room card HTML
function createRoomCard(room) {
    const statusColor = room.status === 'active' ? '#28a745' : '#6c757d';
    const isHost = room.is_user_host;
    
    return `
        <div class="room-card">
            <div class="room-header">
                <div class="room-info">
                    <h4>${room.name}</h4>
                    <div class="room-code">${room.code}</div>
                </div>
                <div style="color: ${statusColor}; font-weight: bold; font-size: 12px;">
                    ${room.status.toUpperCase()}
                </div>
            </div>
            
            ${room.description ? `<p style="color: #666; margin-bottom: 10px;">${room.description}</p>` : ''}
            
            <div class="room-stats">
                <span>👥 ${room.participant_count}/${room.max_participants}</span>
                <span>🎵 ${room.current_song || 'No song playing'}</span>
                <span>${isHost ? '👑 Host' : '👤 Guest'}</span>
            </div>
            
            <div style="margin-top: 15px; text-align: center;">
                ${room.status === 'active' ? 
                    `<a href="/rooms/room/${room.code}/" class="btn btn-primary" style="text-decoration: none;">
                        ${room.is_playing ? '🎵 Join Session' : '▶️ Enter Room'}
                    </a>` :
                    `<button class="btn btn-primary" disabled>Room Ended</button>`
                }
            </div>
        </div>
    `;
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (!TokenManager.isAuthenticated()) {
        window.location.href = '/login/';
        return;
    }
    
    // Create room form submission
    document.getElementById('createRoomForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('roomName').value,
            description: document.getElementById('roomDescription').value,
            max_participants: parseInt(document.getElementById('maxParticipants').value),
            is_public: document.getElementById('isPublic').checked,
            allow_guest_control: document.getElementById('allowGuestControl').checked
        };
        
        try {
            const response = await apiCall('/rooms/api/rooms/', 'POST', formData);
            const data = await response.json();
            
            if (response.status === 201) {
                showAlert('Room created successfully! Redirecting...', 'success');
                hideCreateForm();
                setTimeout(() => {
                    window.location.href = `/rooms/room/${data.code}/`;
                }, 1000);
            } else {
                let errorMessage = 'Failed to create room';
                if (data.name) errorMessage = `Name: ${data.name[0]}`;
                else if (data.max_participants) errorMessage = `Max participants: ${data.max_participants[0]}`;
                showAlert(errorMessage, 'error');
            }
        } catch (error) {
            showAlert('Network error. Please try again.', 'error');
        }
    });
    
    // Logout functionality
    document.getElementById('logoutLink').addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            TokenManager.clearTokens();
            window.location.href = '/';
        }
    });
    
    // Enter key for room code input
    document.getElementById('roomCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinRoom();
        }
    });
    
    // Auto-uppercase room code input
    document.getElementById('roomCode').addEventListener('input', function(e) {
        e.target.value = e.target.value.toUpperCase();
    });
    
    // Load user's rooms
    loadRooms();
});