from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import sqlite3
import string
import random
from datetime import datetime

app = Flask(__name__)
app.config['SECRET_KEY'] = 'syncstream-secret-key'
socketio = SocketIO(app, cors_allowed_origins='*')

# Initialize Database
def init_db():
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS rooms
                 (id TEXT PRIMARY KEY,
                  host_socket_id TEXT,
                  video_id TEXT,
                  current_time REAL DEFAULT 0,
                  is_playing INTEGER DEFAULT 0,
                  background_play INTEGER DEFAULT 0,
                  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    c.execute('''CREATE TABLE IF NOT EXISTS room_users
                 (socket_id TEXT PRIMARY KEY,
                  room_id TEXT,
                  username TEXT,
                  is_host INTEGER DEFAULT 0,
                  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(room_id) REFERENCES rooms(id))''')
    c.execute('''CREATE TABLE IF NOT EXISTS queue
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  room_id TEXT,
                  video_id TEXT,
                  video_title TEXT,
                  position INTEGER,
                  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  FOREIGN KEY(room_id) REFERENCES rooms(id))''')
    conn.commit()
    conn.close()

init_db()

# In-memory room state
rooms = {}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create-room')
def handle_create_room(data):
    room_id = generate_room_code()
    username = data.get('username', 'Anonymous')
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('INSERT INTO rooms (id, host_socket_id) VALUES (?, ?)', (room_id, request.sid))
    c.execute('INSERT INTO room_users (socket_id, room_id, username, is_host) VALUES (?, ?, ?, 1)', 
              (request.sid, room_id, username))
    conn.commit()
    conn.close()
    
    rooms[room_id] = {
        'host_socket_id': request.sid,
        'video_id': '',
        'current_time': 0,
        'is_playing': False,
        'background_play': False,
        'queue': [],
        'users': {request.sid: {'username': username, 'is_host': True}}
    }
    
    join_room(room_id)
    emit('room-created', {'success': True, 'roomId': room_id, 'isHost': True})
    emit('user-list', list(rooms[room_id]['users'].values()), room=room_id)
    emit('queue-update', rooms[room_id]['queue'], room=room_id)

@socketio.on('join-room')
def handle_join_room(data):
    room_id = data['roomId']
    username = data.get('username', 'Anonymous')
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('SELECT * FROM rooms WHERE id = ?', (room_id,))
    room = c.fetchone()
    
    if not room:
        emit('join-error', {'error': 'Room not found'})
        conn.close()
        return
    
    c.execute('INSERT INTO room_users (socket_id, room_id, username, is_host) VALUES (?, ?, ?, 0)', 
              (request.sid, room_id, username))
    conn.commit()
    
    # Get queue
    c.execute('SELECT video_id, video_title, position FROM queue WHERE room_id = ? ORDER BY position', (room_id,))
    queue_items = c.fetchall()
    conn.close()
    
    join_room(room_id)
    
    if room_id not in rooms:
        rooms[room_id] = {
            'host_socket_id': room[1],
            'video_id': room[2] or '',
            'current_time': room[3] or 0,
            'is_playing': bool(room[4]),
            'background_play': bool(room[5]),
            'queue': [{'videoId': q[0], 'title': q[1], 'position': q[2]} for q in queue_items],
            'users': {}
        }
    
    rooms[room_id]['users'][request.sid] = {'username': username, 'is_host': False}
    
    room_state = rooms[room_id]
    
    emit('room-joined', {
        'success': True,
        'roomId': room_id,
        'isHost': False,
        'state': {
            'videoId': room_state['video_id'],
            'currentTime': room_state['current_time'],
            'isPlaying': room_state['is_playing'],
            'backgroundPlay': room_state['background_play'],
            'timestamp': datetime.now().timestamp() * 1000
        }
    })
    
    emit('user-list', list(rooms[room_id]['users'].values()), room=room_id)
    emit('queue-update', rooms[room_id]['queue'], room=room_id)
    
    # Send system message
    emit('new-message', {
        'username': 'System',
        'message': f'{username} joined the room',
        'timestamp': datetime.now().timestamp() * 1000,
        'isSystem': True
    }, room=room_id)

@socketio.on('load-video')
def handle_load_video(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    video_id = data['videoId']
    current_time = data.get('currentTime', 0)
    
    rooms[room_id]['video_id'] = video_id
    rooms[room_id]['current_time'] = current_time
    rooms[room_id]['is_playing'] = False
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('UPDATE rooms SET video_id = ?, current_time = ?, is_playing = 0 WHERE id = ?',
              (video_id, current_time, room_id))
    conn.commit()
    conn.close()
    
    emit('video-loaded', {
        'videoId': video_id,
        'currentTime': current_time,
        'isPlaying': False,
        'timestamp': datetime.now().timestamp() * 1000
    }, room=room_id)

@socketio.on('add-to-queue')
def handle_add_to_queue(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    video_id = data['videoId']
    title = data['title']
    position = len(rooms[room_id]['queue'])
    
    rooms[room_id]['queue'].append({
        'videoId': video_id,
        'title': title,
        'position': position
    })
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('INSERT INTO queue (room_id, video_id, video_title, position) VALUES (?, ?, ?, ?)',
              (room_id, video_id, title, position))
    conn.commit()
    conn.close()
    
    emit('queue-update', rooms[room_id]['queue'], room=room_id)

@socketio.on('remove-from-queue')
def handle_remove_from_queue(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    position = data['position']
    rooms[room_id]['queue'] = [q for q in rooms[room_id]['queue'] if q['position'] != position]
    
    # Reorder positions
    for i, item in enumerate(rooms[room_id]['queue']):
        item['position'] = i
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('DELETE FROM queue WHERE room_id = ?', (room_id,))
    for item in rooms[room_id]['queue']:
        c.execute('INSERT INTO queue (room_id, video_id, video_title, position) VALUES (?, ?, ?, ?)',
                  (room_id, item['videoId'], item['title'], item['position']))
    conn.commit()
    conn.close()
    
    emit('queue-update', rooms[room_id]['queue'], room=room_id)

@socketio.on('play-next')
def handle_play_next():
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id or len(rooms[room_id]['queue']) == 0:
        return
    
    next_video = rooms[room_id]['queue'].pop(0)
    
    # Reorder positions
    for i, item in enumerate(rooms[room_id]['queue']):
        item['position'] = i
    
    rooms[room_id]['video_id'] = next_video['videoId']
    rooms[room_id]['current_time'] = 0
    rooms[room_id]['is_playing'] = True
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('UPDATE rooms SET video_id = ?, current_time = 0, is_playing = 1 WHERE id = ?',
              (next_video['videoId'], room_id))
    c.execute('DELETE FROM queue WHERE room_id = ?', (room_id,))
    for item in rooms[room_id]['queue']:
        c.execute('INSERT INTO queue (room_id, video_id, video_title, position) VALUES (?, ?, ?, ?)',
                  (room_id, item['videoId'], item['title'], item['position']))
    conn.commit()
    conn.close()
    
    emit('video-loaded', {
        'videoId': next_video['videoId'],
        'currentTime': 0,
        'isPlaying': True,
        'timestamp': datetime.now().timestamp() * 1000
    }, room=room_id)
    emit('queue-update', rooms[room_id]['queue'], room=room_id)

@socketio.on('toggle-background-play')
def handle_toggle_background_play(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    enabled = data['enabled']
    rooms[room_id]['background_play'] = enabled
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('UPDATE rooms SET background_play = ? WHERE id = ?', (1 if enabled else 0, room_id))
    conn.commit()
    conn.close()
    
    emit('background-play-update', {'enabled': enabled}, room=room_id)

@socketio.on('video-ended')
def handle_video_ended():
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    # Auto-play next video from queue
    if len(rooms[room_id]['queue']) > 0:
        next_video = rooms[room_id]['queue'].pop(0)
        
        # Reorder positions
        for i, item in enumerate(rooms[room_id]['queue']):
            item['position'] = i
        
        rooms[room_id]['video_id'] = next_video['videoId']
        rooms[room_id]['current_time'] = 0
        rooms[room_id]['is_playing'] = True
        
        conn = sqlite3.connect('syncstream.db')
        c = conn.cursor()
        c.execute('UPDATE rooms SET video_id = ?, current_time = 0, is_playing = 1 WHERE id = ?',
                  (next_video['videoId'], room_id))
        c.execute('DELETE FROM queue WHERE room_id = ?', (room_id,))
        for item in rooms[room_id]['queue']:
            c.execute('INSERT INTO queue (room_id, video_id, video_title, position) VALUES (?, ?, ?, ?)',
                      (room_id, item['videoId'], item['title'], item['position']))
        conn.commit()
        conn.close()
        
        emit('video-loaded', {
            'videoId': next_video['videoId'],
            'currentTime': 0,
            'isPlaying': True,
            'timestamp': datetime.now().timestamp() * 1000
        }, room=room_id)
        emit('queue-update', rooms[room_id]['queue'], room=room_id)

@socketio.on('play')
def handle_play(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    current_time = data['currentTime']
    rooms[room_id]['current_time'] = current_time
    rooms[room_id]['is_playing'] = True
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('UPDATE rooms SET current_time = ?, is_playing = 1 WHERE id = ?',
              (current_time, room_id))
    conn.commit()
    conn.close()
    
    emit('play', {
        'currentTime': current_time,
        'timestamp': datetime.now().timestamp() * 1000
    }, room=room_id)

@socketio.on('pause')
def handle_pause(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    current_time = data['currentTime']
    rooms[room_id]['current_time'] = current_time
    rooms[room_id]['is_playing'] = False
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('UPDATE rooms SET current_time = ?, is_playing = 0 WHERE id = ?',
              (current_time, room_id))
    conn.commit()
    conn.close()
    
    emit('pause', {
        'currentTime': current_time,
        'timestamp': datetime.now().timestamp() * 1000
    }, room=room_id)

@socketio.on('heartbeat')
def handle_heartbeat(data):
    room_id = None
    for rid, room in rooms.items():
        if request.sid in room['users'] and room['host_socket_id'] == request.sid:
            room_id = rid
            break
    
    if not room_id:
        return
    
    current_time = data['currentTime']
    rooms[room_id]['current_time'] = current_time
    
    emit('sync-check', {
        'currentTime': current_time,
        'isPlaying': rooms[room_id]['is_playing'],
        'timestamp': datetime.now().timestamp() * 1000
    }, room=room_id, skip_sid=request.sid)

@socketio.on('send-message')
def handle_send_message(data):
    room_id = None
    sender_username = 'Anonymous'
    
    for rid, room in rooms.items():
        if request.sid in room['users']:
            room_id = rid
            sender_username = room['users'][request.sid]['username']
            break
    
    if not room_id:
        return
    
    message = data.get('message', '').strip()
    
    if not message:
        return
    
    # Broadcast message to all users in the room
    emit('new-message', {
        'username': sender_username,
        'message': message,
        'timestamp': datetime.now().timestamp() * 1000,
        'senderId': request.sid
    }, room=room_id)

@socketio.on('disconnect')
def handle_disconnect():
    room_id = None
    username = 'Anonymous'
    
    for rid, room in rooms.items():
        if request.sid in room['users']:
            room_id = rid
            username = room['users'][request.sid]['username']
            break
    
    if not room_id:
        return
    
    del rooms[room_id]['users'][request.sid]
    
    # Send system message
    emit('new-message', {
        'username': 'System',
        'message': f'{username} left the room',
        'timestamp': datetime.now().timestamp() * 1000,
        'isSystem': True
    }, room=room_id)
    
    # If host left, promote new host
    if rooms[room_id]['host_socket_id'] == request.sid and len(rooms[room_id]['users']) > 0:
        new_host_id = next(iter(rooms[room_id]['users']))
        rooms[room_id]['host_socket_id'] = new_host_id
        rooms[room_id]['users'][new_host_id]['is_host'] = True
        
        conn = sqlite3.connect('syncstream.db')
        c = conn.cursor()
        c.execute('UPDATE rooms SET host_socket_id = ? WHERE id = ?', (new_host_id, room_id))
        c.execute('UPDATE room_users SET is_host = 1 WHERE socket_id = ?', (new_host_id,))
        conn.commit()
        conn.close()
        
        emit('promoted-to-host', room=new_host_id)
    
    emit('user-list', list(rooms[room_id]['users'].values()), room=room_id)
    
    # Clean up empty rooms
    if len(rooms[room_id]['users']) == 0:
        conn = sqlite3.connect('syncstream.db')
        c = conn.cursor()
        c.execute('DELETE FROM rooms WHERE id = ?', (room_id,))
        c.execute('DELETE FROM queue WHERE room_id = ?', (room_id,))
        conn.commit()
        conn.close()
        del rooms[room_id]
    
    conn = sqlite3.connect('syncstream.db')
    c = conn.cursor()
    c.execute('DELETE FROM room_users WHERE socket_id = ?', (request.sid,))
    conn.commit()
    conn.close()

    @socketio.on('start-game')
    def handle_start_game(data):
        room_id = None
        for rid, room in rooms.items():
            if request.sid in room['users']:
                room_id = rid
                break
        
        if not room_id:
            return
        
        game_name = data.get('gameName')
        
        # Broadcast to all users in the room
        emit('game-started', {
            'gameName': game_name,
            'startedBy': rooms[room_id]['users'][request.sid]['username']
        }, room=room_id)

    @socketio.on('game-move')
    def handle_game_move(data):
        room_id = None
        for rid, room in rooms.items():
            if request.sid in room['users']:
                room_id = rid
                break
        
        if not room_id:
            return
        
        # Broadcast move to all users in the room
        emit('game-move-update', {
            'gameName': data.get('gameName'),
            'moveData': data.get('moveData'),
            'playerId': request.sid,
            'playerName': rooms[room_id]['users'][request.sid]['username']
        }, room=room_id)

    @socketio.on('game-reset')
    def handle_game_reset(data):
        room_id = None
        for rid, room in rooms.items():
            if request.sid in room['users']:
                room_id = rid
                break
        
        if not room_id:
            return
        
        # Broadcast reset to all users in the room
        emit('game-reset-update', {
            'gameName': data.get('gameName')
        }, room=room_id)

    @socketio.on('game-state-sync')
    def handle_game_state_sync(data):
        room_id = None
        for rid, room in rooms.items():
            if request.sid in room['users']:
                room_id = rid
                break
        
        if not room_id:
            return
        
        # Broadcast full game state to all users
        emit('game-state-update', {
            'gameName': data.get('gameName'),
            'gameState': data.get('gameState')
        }, room=room_id)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=9000)