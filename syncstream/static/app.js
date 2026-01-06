const socket = io();

let player;
let roomId = null;
let isHost = false;
let isSyncing = false;
let heartbeatInterval = null;
let username = '';
let currentTab = 'video';
let unreadMessages = 0;
let mySocketId = null;

const landingPage = document.getElementById('landing-page');
const roomPage = document.getElementById('room-page');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinModal = document.getElementById('join-modal');
const roomCodeInput = document.getElementById('room-code-input');
const joinSubmitBtn = document.getElementById('join-submit-btn');
const usernameInput = document.getElementById('username-input');
const roomIdDisplay = document.getElementById('room-id-display');
const adminControls = document.getElementById('admin-controls');
const youtubeUrlInput = document.getElementById('youtube-url-input');
const loadVideoBtn = document.getElementById('load-video-btn');
const addToQueueBtn = document.getElementById('add-to-queue-btn');
const backgroundPlayToggle = document.getElementById('background-play-toggle');
const userCountEl = document.getElementById('user-count');
const syncIndicator = document.getElementById('sync-indicator');
const syncStatus = document.getElementById('sync-status');
const playerOverlay = document.getElementById('player-overlay');
const noVideo = document.getElementById('no-video');
const usersList = document.getElementById('users-list');
const queueList = document.getElementById('queue-list');

// Chat elements
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const unreadBadge = document.getElementById('unread-badge');

// Tab switching
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.getAttribute('data-tab');
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  currentTab = tabName;
  
  // Update tab buttons
  tabBtns.forEach(btn => {
    if (btn.getAttribute('data-tab') === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update tab contents
  tabContents.forEach(content => {
    if (content.id === `${tabName}-tab`) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
  
  // Reset unread messages when switching to chat
  if (tabName === 'chat') {
    unreadMessages = 0;
    unreadBadge.classList.add('hidden');
    scrollChatToBottom();
  }
}

function extractVideoId(url) {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function getVideoTitle(videoId, callback) {
  // Simple title extraction - in production, use YouTube Data API
  callback(`Video ${videoId.substring(0, 8)}`);
}

function createPlayer(videoId) {
  if (player) {
    player.loadVideoById(videoId);
    return;
  }
  
  player = new YT.Player('player', {
    videoId: videoId,
    playerVars: {
      controls: isHost ? 1 : 0,
      disablekb: !isHost ? 1 : 0,
      modestbranding: 1,
      rel: 0,
      enablejsapi: 1
    },
    events: {
      onReady: onPlayerReady,
      onStateChange: onPlayerStateChange,
      onError: onPlayerError
    }
  });
}

function onPlayerReady(event) {
  console.log('Player ready');
  noVideo.classList.add('hidden');
  
  if (!isHost) {
    playerOverlay.classList.remove('hidden');
  }
  
  if (isHost) {
    startHeartbeat();
  }
}

function onPlayerStateChange(event) {
  if (!isHost || isSyncing) return;
  
  const currentTime = player.getCurrentTime();
  
  if (event.data === YT.PlayerState.PLAYING) {
    socket.emit('play', { currentTime });
  } else if (event.data === YT.PlayerState.PAUSED) {
    socket.emit('pause', { currentTime });
  } else if (event.data === YT.PlayerState.ENDED) {
    console.log('Video ended - playing next from queue');
    socket.emit('video-ended');
  }
}

function onPlayerError(event) {
  alert('Video error: Video not found or unavailable');
}

function setSyncStatus(synced) {
  if (synced) {
    syncIndicator.className = 'sync-indicator synced';
    syncStatus.textContent = 'Synced';
  } else {
    syncIndicator.className = 'sync-indicator syncing';
    syncStatus.textContent = 'Syncing...';
  }
}

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(() => {
    if (player && player.getCurrentTime) {
      socket.emit('heartbeat', { currentTime: player.getCurrentTime() });
    }
  }, 5000);
}

function showRoom() {
  landingPage.classList.add('hidden');
  roomPage.classList.remove('hidden');
  roomIdDisplay.textContent = roomId;
  
  if (isHost) {
    adminControls.classList.remove('hidden');
  } else {
    adminControls.classList.add('hidden');
  }
}

function updateUsersList(users) {
  usersList.innerHTML = '';
  userCountEl.textContent = users.length;
  
  users.forEach(user => {
    const userItem = document.createElement('div');
    userItem.className = 'user-item';
    
    const avatar = document.createElement('div');
    avatar.className = 'user-avatar';
    avatar.textContent = user.username.charAt(0).toUpperCase();
    
    const userName = document.createElement('div');
    userName.className = 'user-name';
    userName.textContent = user.username;
    
    userItem.appendChild(avatar);
    userItem.appendChild(userName);
    
    if (user.is_host) {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = 'HOST';
      userItem.appendChild(badge);
    }
    
    usersList.appendChild(userItem);
  });
}

function updateQueue(queue) {
  if (queue.length === 0) {
    queueList.innerHTML = '<p class="empty-message">No videos in queue</p>';
    return;
  }
  
  queueList.innerHTML = '';
  
  queue.forEach((item, index) => {
    const queueItem = document.createElement('div');
    queueItem.className = 'queue-item';
    
    const queueNumber = document.createElement('div');
    queueNumber.className = 'queue-number';
    queueNumber.textContent = index + 1;
    
    const queueInfo = document.createElement('div');
    queueInfo.className = 'queue-info';
    
    const queueTitle = document.createElement('div');
    queueTitle.className = 'queue-title';
    queueTitle.textContent = item.title;
    
    queueInfo.appendChild(queueTitle);
    queueItem.appendChild(queueNumber);
    queueItem.appendChild(queueInfo);
    
    if (isHost) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'queue-remove';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => {
        socket.emit('remove-from-queue', { position: item.position });
      };
      queueItem.appendChild(removeBtn);
    }
    
    queueList.appendChild(queueItem);
  });
}

// Chat functions
function addChatMessage(data) {
  // Remove welcome message if it exists
  const welcomeMsg = chatMessages.querySelector('.chat-welcome');
  if (welcomeMsg) {
    welcomeMsg.remove();
  }
  
  if (data.isSystem) {
    // System message
    const systemMsg = document.createElement('div');
    systemMsg.className = 'chat-system-message';
    systemMsg.innerHTML = `<span class="chat-system-text">${data.message}</span>`;
    chatMessages.appendChild(systemMsg);
  } else {
    // User message
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    // Check if it's own message
    if (data.senderId === mySocketId) {
      messageDiv.classList.add('own-message');
    }
    
    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = data.username.charAt(0).toUpperCase();
    
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    
    const usernameEl = document.createElement('div');
    usernameEl.className = 'chat-username';
    usernameEl.textContent = data.username;
    
    const textEl = document.createElement('div');
    textEl.className = 'chat-text';
    textEl.textContent = data.message;
    
    const timestamp = document.createElement('div');
    timestamp.className = 'chat-timestamp';
    const date = new Date(data.timestamp);
    timestamp.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    bubble.appendChild(usernameEl);
    bubble.appendChild(textEl);
    bubble.appendChild(timestamp);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(bubble);
    
    chatMessages.appendChild(messageDiv);
  }
  
  scrollChatToBottom();
  
  // Update unread badge if not on chat tab
  if (currentTab !== 'chat' && !data.isSystem && data.senderId !== mySocketId) {
    unreadMessages++;
    unreadBadge.textContent = unreadMessages;
    unreadBadge.classList.remove('hidden');
  }
}

function scrollChatToBottom() {
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 100);
}

function sendMessage() {
  const message = chatInput.value.trim();
  
  if (message) {
    socket.emit('send-message', { message });
    chatInput.value = '';
  }
}

// Event Listeners
createRoomBtn.addEventListener('click', () => {
  username = usernameInput.value.trim() || 'Anonymous';
  socket.emit('create-room', { username });
});

joinRoomBtn.addEventListener('click', () => {
  joinModal.classList.toggle('hidden');
});

joinSubmitBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  username = usernameInput.value.trim() || 'Anonymous';
  
  if (code.length === 6) {
    socket.emit('join-room', { roomId: code, username });
  }
});

loadVideoBtn.addEventListener('click', () => {
  const url = youtubeUrlInput.value.trim();
  const videoId = extractVideoId(url);
  
  if (videoId) {
    createPlayer(videoId);
    socket.emit('load-video', { videoId, currentTime: 0 });
    youtubeUrlInput.value = '';
  } else {
    alert('Invalid YouTube URL');
  }
});

addToQueueBtn.addEventListener('click', () => {
  const url = youtubeUrlInput.value.trim();
  const videoId = extractVideoId(url);
  
  if (videoId) {
    getVideoTitle(videoId, (title) => {
      socket.emit('add-to-queue', { videoId, title });
      youtubeUrlInput.value = '';
    });
  } else {
    alert('Invalid YouTube URL');
  }
});

backgroundPlayToggle.addEventListener('change', (e) => {
  socket.emit('toggle-background-play', { enabled: e.target.checked });
});

// Chat event listeners
sendMessageBtn.addEventListener('click', sendMessage);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Socket Events
socket.on('connect', () => {
  console.log('Connected to server');
  mySocketId = socket.id;
  
  if (roomId) {
    socket.emit('join-room', { roomId, username });
  }
});

socket.on('room-created', (data) => {
  if (data.success) {
    roomId = data.roomId;
    isHost = data.isHost;
    showRoom();
  }
});

socket.on('room-joined', (data) => {
  if (data.success) {
    roomId = data.roomId;
    isHost = data.isHost;
    showRoom();
    
    if (data.state.videoId) {
      createPlayer(data.state.videoId);
      setTimeout(() => {
        if (player && player.seekTo) {
          player.seekTo(data.state.currentTime, true);
          if (data.state.isPlaying) {
            player.playVideo();
          } else {
            player.pauseVideo();
          }
        }
      }, 1000);
    }
    
    if (data.state.backgroundPlay) {
      backgroundPlayToggle.checked = true;
    }
  }
});

socket.on('join-error', (data) => {
  alert(data.error);
});

socket.on('user-list', (users) => {
  updateUsersList(users);
});

socket.on('queue-update', (queue) => {
  updateQueue(queue);
});

socket.on('video-loaded', (data) => {
  isSyncing = true;
  setSyncStatus(false);
  
  if (player) {
    player.loadVideoById(data.videoId);
    setTimeout(() => {
      if (player && player.seekTo) {
        player.seekTo(data.currentTime, true);
        if (data.isPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
        isSyncing = false;
        setSyncStatus(true);
      }
    }, 1000);
  } else {
    createPlayer(data.videoId);
    setTimeout(() => {
      if (player && player.seekTo) {
        player.seekTo(data.currentTime, true);
        if (data.isPlaying) {
          player.playVideo();
        } else {
          player.pauseVideo();
        }
        isSyncing = false;
        setSyncStatus(true);
      }
    }, 1000);
  }
});

socket.on('play', (data) => {
  if (isHost || !player) return;
  
  isSyncing = true;
  const latency = Date.now() - data.timestamp;
  const adjustedTime = data.currentTime + (latency / 1000);
  
  player.seekTo(adjustedTime, true);
  player.playVideo();
  
  setTimeout(() => {
    isSyncing = false;
    setSyncStatus(true);
  }, 500);
});

socket.on('pause', (data) => {
  if (isHost || !player) return;
  
  isSyncing = true;
  player.seekTo(data.currentTime, true);
  player.pauseVideo();
  
  setTimeout(() => {
    isSyncing = false;
    setSyncStatus(true);
  }, 500);
});

socket.on('sync-check', (data) => {
  if (isHost || !player || !player.getCurrentTime) return;
  
  const latency = Date.now() - data.timestamp;
  const expectedTime = data.currentTime + (latency / 1000);
  const actualTime = player.getCurrentTime();
  const drift = Math.abs(expectedTime - actualTime);
  
  if (drift > 2) {
    console.log(`Drift detected: ${drift.toFixed(2)}s - Correcting...`);
    isSyncing = true;
    setSyncStatus(false);
    player.seekTo(expectedTime, true);
    
    setTimeout(() => {
      isSyncing = false;
      setSyncStatus(true);
    }, 500);
  }
});

socket.on('background-play-update', (data) => {
  backgroundPlayToggle.checked = data.enabled;
  
  if (data.enabled && player) {
    player.setOption('playerVars', { 'playsinline': 1 });
  }
});

socket.on('new-message', (data) => {
  addChatMessage(data);
});

socket.on('promoted-to-host', () => {
  isHost = true;
  adminControls.classList.remove('hidden');
  playerOverlay.classList.add('hidden');
  
  if (player) {
    player.setOption('controls', 1);
    player.setOption('disablekb', 0);
  }
  
  startHeartbeat();
  alert('You are now the host!');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
  setSyncStatus(false);
});

// Handle page visibility for background play
document.addEventListener('visibilitychange', () => {
  if (backgroundPlayToggle.checked && player && player.getPlayerState) {
    const state = player.getPlayerState();
    
    if (document.hidden) {
      if (state === YT.PlayerState.PLAYING) {
        console.log('Background play: Keeping audio active');
      }
    } else {
      console.log('Page visible again');
    }
  }
});