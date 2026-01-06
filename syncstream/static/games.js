// Multiplayer Games functionality
let currentGame = null;
let gameState = {};
let mySocketId = null;
let isMyTurn = false;

console.log('Multiplayer Games.js loading...');

// Get socket from main app
setTimeout(() => {
  if (typeof socket !== 'undefined') {
    mySocketId = socket.id;
    setupGameSocketListeners();
  }
}, 1000);

function setupGameSocketListeners() {
  console.log('Setting up game socket listeners');
  
  // Listen for game started by another user
  socket.on('game-started', (data) => {
    console.log('Game started:', data);
    if (data.gameName && currentGame !== data.gameName) {
      loadGame(data.gameName);
    }
  });
  
  // Listen for game moves from other players
  socket.on('game-move-update', (data) => {
    console.log('Game move received:', data);
    if (data.playerId !== socket.id) {
      handleRemoteMove(data);
    }
  });
  
  // Listen for game reset
  socket.on('game-reset-update', (data) => {
    console.log('Game reset:', data);
    if (currentGame === data.gameName) {
      const container = document.getElementById('game-content');
      loadGameContent(data.gameName, container);
    }
  });
  
  // Listen for full game state updates
  socket.on('game-state-update', (data) => {
    console.log('Game state update:', data);
    if (data.playerId !== socket.id && currentGame === data.gameName) {
      gameState = data.gameState;
      updateGameUI(data.gameName);
    }
  });
}

function handleRemoteMove(data) {
  const { gameName, moveData } = data;
  
  switch(gameName) {
    case 'tictactoe':
      handleRemoteTicTacToeMove(moveData);
      break;
    case 'connect4':
      handleRemoteConnect4Move(moveData);
      break;
    case 'memory':
      handleRemoteMemoryMove(moveData);
      break;
  }
}

// Global function to load games
window.loadGameDirect = function(gameName) {
  console.log('Loading game directly:', gameName);
  loadGame(gameName);
  
  // Notify other users
  if (typeof socket !== 'undefined') {
    socket.emit('start-game', { gameName });
  }
};

function loadGame(gameName) {
  const gamesContainer = document.querySelector('.games-container');
  const gameArena = document.getElementById('game-arena');
  const gameContent = document.getElementById('game-content');
  const gameTitle = document.getElementById('current-game-title');
  
  if (!gameArena || !gameContent) {
    console.error('Game arena or content not found!');
    return;
  }
  
  gamesContainer.classList.add('hidden');
  gameArena.classList.remove('hidden');
  
  currentGame = gameName;
  
  const titles = {
    'tictactoe': 'Tic Tac Toe',
    'connect4': 'Connect Four',
    'rps': 'Rock Paper Scissors',
    'memory': 'Memory Match',
    'trivia': 'Trivia Quiz',
    'drawing': 'Draw & Guess'
  };
  
  gameTitle.textContent = titles[gameName] || 'Game';
  
  loadGameContent(gameName, gameContent);
}

function loadGameContent(gameName, container) {
  switch(gameName) {
    case 'tictactoe':
      loadTicTacToe(container);
      break;
    case 'connect4':
      loadConnectFour(container);
      break;
    case 'rps':
      loadRockPaperScissors(container);
      break;
    case 'memory':
      loadMemoryMatch(container);
      break;
    case 'trivia':
      loadTrivia(container);
      break;
    case 'drawing':
      loadDrawing(container);
      break;
    default:
      container.innerHTML = `
        <div class="game-status">Coming Soon!</div>
        <div class="game-info" style="text-align: center; padding: 3rem;">
          <p style="font-size: 3rem; margin-bottom: 1rem;">🎮</p>
          <p style="color: #9ca3af; font-size: 1.125rem;">This game is coming soon!</p>
        </div>
      `;
  }
}

// Back button handler
document.addEventListener('DOMContentLoaded', () => {
  const backBtn = document.getElementById('back-to-games');
  if (backBtn) {
    backBtn.onclick = function() {
      document.getElementById('game-arena').classList.add('hidden');
      document.querySelector('.games-container').classList.remove('hidden');
      currentGame = null;
    };
  }
});

// ===== MULTIPLAYER TIC TAC TOE =====
function loadTicTacToe(container) {
  console.log('Loading Multiplayer Tic Tac Toe');
  
  gameState.tictactoe = {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    gameOver: false,
    players: {}
  };
  
  container.innerHTML = `
    <div class="game-status">Player X's Turn</div>
    <div class="game-info">Multiplayer - Play with your friend!</div>
    <div class="tictactoe-board" id="tictactoe-board"></div>
    <button class="btn-reset" id="reset-ttt">Reset Game</button>
  `;
  
  const board = document.getElementById('tictactoe-board');
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'tictactoe-cell';
    cell.dataset.index = i;
    cell.onclick = function() {
      handleTicTacToeMove(i);
    };
    board.appendChild(cell);
  }
  
  document.getElementById('reset-ttt').onclick = function() {
    socket.emit('game-reset', { gameName: 'tictactoe' });
    loadTicTacToe(container);
  };
}

function handleTicTacToeMove(index) {
  if (gameState.tictactoe.gameOver || gameState.tictactoe.board[index]) return;
  
  gameState.tictactoe.board[index] = gameState.tictactoe.currentPlayer;
  
  // Update UI
  const cells = document.querySelectorAll('.tictactoe-cell');
  cells[index].textContent = gameState.tictactoe.currentPlayer;
  cells[index].classList.add('filled');
  
  // Broadcast move to other players
  socket.emit('game-move', {
    gameName: 'tictactoe',
    moveData: {
      index: index,
      player: gameState.tictactoe.currentPlayer
    }
  });
  
  if (checkTicTacToeWinner()) {
    document.querySelector('.game-status').textContent = `Player ${gameState.tictactoe.currentPlayer} Wins! 🎉`;
    gameState.tictactoe.gameOver = true;
    return;
  }
  
  if (gameState.tictactoe.board.every(cell => cell !== null)) {
    document.querySelector('.game-status').textContent = "It's a Draw! 🤝";
    gameState.tictactoe.gameOver = true;
    return;
  }
  
  gameState.tictactoe.currentPlayer = gameState.tictactoe.currentPlayer === 'X' ? 'O' : 'X';
  document.querySelector('.game-status').textContent = `Player ${gameState.tictactoe.currentPlayer}'s Turn`;
}

function handleRemoteTicTacToeMove(moveData) {
  const { index, player } = moveData;
  
  gameState.tictactoe.board[index] = player;
  
  const cells = document.querySelectorAll('.tictactoe-cell');
  cells[index].textContent = player;
  cells[index].classList.add('filled');
  
  if (checkTicTacToeWinner()) {
    document.querySelector('.game-status').textContent = `Player ${player} Wins! 🎉`;
    gameState.tictactoe.gameOver = true;
    return;
  }
  
  if (gameState.tictactoe.board.every(cell => cell !== null)) {
    document.querySelector('.game-status').textContent = "It's a Draw! 🤝";
    gameState.tictactoe.gameOver = true;
    return;
  }
  
  gameState.tictactoe.currentPlayer = player === 'X' ? 'O' : 'X';
  document.querySelector('.game-status').textContent = `Player ${gameState.tictactoe.currentPlayer}'s Turn`;
}

function checkTicTacToeWinner() {
  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  
  return winPatterns.some(pattern => {
    const [a, b, c] = pattern;
    return gameState.tictactoe.board[a] &&
           gameState.tictactoe.board[a] === gameState.tictactoe.board[b] &&
           gameState.tictactoe.board[a] === gameState.tictactoe.board[c];
  });
}

// ===== MULTIPLAYER CONNECT FOUR =====
function loadConnectFour(container) {
  console.log('Loading Multiplayer Connect Four');
  
  gameState.connect4 = {
    board: Array(6).fill(null).map(() => Array(7).fill(null)),
    currentPlayer: 'red',
    gameOver: false
  };
  
  container.innerHTML = `
    <div class="game-status">Red Player's Turn</div>
    <div class="game-info">Multiplayer - Connect 4 in a row!</div>
    <div class="connect4-board" id="connect4-board"></div>
    <button class="btn-reset" id="reset-c4">Reset Game</button>
  `;
  
  const board = document.getElementById('connect4-board');
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = document.createElement('div');
      cell.className = 'connect4-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.onclick = function() {
        handleConnect4Move(col);
      };
      board.appendChild(cell);
    }
  }
  
  document.getElementById('reset-c4').onclick = function() {
    socket.emit('game-reset', { gameName: 'connect4' });
    loadConnectFour(container);
  };
}

function handleConnect4Move(col) {
  if (gameState.connect4.gameOver) return;
  
  let row = -1;
  for (let r = 5; r >= 0; r--) {
    if (!gameState.connect4.board[r][col]) {
      row = r;
      break;
    }
  }
  
  if (row === -1) return;
  
  gameState.connect4.board[row][col] = gameState.connect4.currentPlayer;
  
  const cells = document.querySelectorAll('.connect4-cell');
  const cellIndex = row * 7 + col;
  cells[cellIndex].classList.add(gameState.connect4.currentPlayer);
  cells[cellIndex].classList.add('filled');
  
  // Broadcast move
  socket.emit('game-move', {
    gameName: 'connect4',
    moveData: {
      row: row,
      col: col,
      player: gameState.connect4.currentPlayer
    }
  });
  
  if (checkConnect4Winner(row, col)) {
    const playerName = gameState.connect4.currentPlayer === 'red' ? 'Red' : 'Yellow';
    document.querySelector('.game-status').textContent = `${playerName} Player Wins! 🎉`;
    gameState.connect4.gameOver = true;
    return;
  }
  
  if (gameState.connect4.board.every(row => row.every(cell => cell !== null))) {
    document.querySelector('.game-status').textContent = "It's a Draw! 🤝";
    gameState.connect4.gameOver = true;
    return;
  }
  
  gameState.connect4.currentPlayer = gameState.connect4.currentPlayer === 'red' ? 'yellow' : 'red';
  const playerName = gameState.connect4.currentPlayer === 'red' ? 'Red' : 'Yellow';
  document.querySelector('.game-status').textContent = `${playerName} Player's Turn`;
}

function handleRemoteConnect4Move(moveData) {
  const { row, col, player } = moveData;
  
  gameState.connect4.board[row][col] = player;
  
  const cells = document.querySelectorAll('.connect4-cell');
  const cellIndex = row * 7 + col;
  cells[cellIndex].classList.add(player);
  cells[cellIndex].classList.add('filled');
  
  if (checkConnect4Winner(row, col)) {
    const playerName = player === 'red' ? 'Red' : 'Yellow';
    document.querySelector('.game-status').textContent = `${playerName} Player Wins! 🎉`;
    gameState.connect4.gameOver = true;
    return;
  }
  
  if (gameState.connect4.board.every(row => row.every(cell => cell !== null))) {
    document.querySelector('.game-status').textContent = "It's a Draw! 🤝";
    gameState.connect4.gameOver = true;
    return;
  }
  
  gameState.connect4.currentPlayer = player === 'red' ? 'yellow' : 'red';
  const playerName = gameState.connect4.currentPlayer === 'red' ? 'Red' : 'Yellow';
  document.querySelector('.game-status').textContent = `${playerName} Player's Turn`;
}

function checkConnect4Winner(row, col) {
  const player = gameState.connect4.board[row][col];
  const directions = [
    [[0, 1], [0, -1]],
    [[1, 0], [-1, 0]],
    [[1, 1], [-1, -1]],
    [[1, -1], [-1, 1]]
  ];
  
  return directions.some(([dir1, dir2]) => {
    let count = 1;
    
    let [dr, dc] = dir1;
    let r = row + dr, c = col + dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && gameState.connect4.board[r][c] === player) {
      count++;
      r += dr;
      c += dc;
    }
    
    [dr, dc] = dir2;
    r = row + dr;
    c = col + dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && gameState.connect4.board[r][c] === player) {
      count++;
      r += dr;
      c += dc;
    }
    
    return count >= 4;
  });
}

// ===== ROCK PAPER SCISSORS (Single Player vs Computer) =====
function loadRockPaperScissors(container) {
  console.log('Loading Rock Paper Scissors');
  
  gameState.rps = {
    score: { player: 0, computer: 0 }
  };
  
  container.innerHTML = `
    <div class="game-status">Choose Your Move!</div>
    <div class="game-info">Play against the computer</div>
    <div class="rps-choices">
      <div class="rps-choice" id="rps-rock">✊</div>
      <div class="rps-choice" id="rps-paper">✋</div>
      <div class="rps-choice" id="rps-scissors">✌️</div>
    </div>
    <div class="rps-result" id="rps-result" style="display: none;">
      <h3 id="rps-winner"></h3>
      <p id="rps-details"></p>
    </div>
    <div class="trivia-score">
      You: <span id="player-score">0</span> | Computer: <span id="computer-score">0</span>
    </div>
  `;
  
  document.getElementById('rps-rock').onclick = function() { playRPS('rock'); };
  document.getElementById('rps-paper').onclick = function() { playRPS('paper'); };
  document.getElementById('rps-scissors').onclick = function() { playRPS('scissors'); };
}

function playRPS(playerChoice) {
  const choices = ['rock', 'paper', 'scissors'];
  const computerChoice = choices[Math.floor(Math.random() * 3)];
  const emojis = { rock: '✊', paper: '✋', scissors: '✌️' };
  
  let result = '';
  if (playerChoice === computerChoice) {
    result = "It's a Tie!";
  } else if (
    (playerChoice === 'rock' && computerChoice === 'scissors') ||
    (playerChoice === 'paper' && computerChoice === 'rock') ||
    (playerChoice === 'scissors' && computerChoice === 'paper')
  ) {
    result = 'You Win!';
    gameState.rps.score.player++;
  } else {
    result = 'Computer Wins!';
    gameState.rps.score.computer++;
  }
  
  document.getElementById('rps-result').style.display = 'block';
  document.getElementById('rps-winner').textContent = result;
  document.getElementById('rps-details').textContent = 
    `You chose ${emojis[playerChoice]} | Computer chose ${emojis[computerChoice]}`;
  
  document.getElementById('player-score').textContent = gameState.rps.score.player;
  document.getElementById('computer-score').textContent = gameState.rps.score.computer;
}

// ===== MULTIPLAYER MEMORY MATCH =====
function loadMemoryMatch(container) {
  console.log('Loading Multiplayer Memory Match');
  
  const emojis = ['🎮', '🎨', '🎭', '🎪', '🎯', '🎲', '🎸', '🎹'];
  const cards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  
  gameState.memory = {
    cards: cards,
    flipped: [],
    matched: [],
    moves: 0
  };
  
  container.innerHTML = `
    <div class="game-status">Find all matching pairs!</div>
    <div class="game-info">Multiplayer - Moves: <span id="memory-moves">0</span></div>
    <div class="memory-board" id="memory-board"></div>
    <button class="btn-reset" id="reset-memory">Reset Game</button>
  `;
  
  const board = document.getElementById('memory-board');
  cards.forEach((emoji, index) => {
    const card = document.createElement('div');
    card.className = 'memory-card';
    card.dataset.index = index;
    card.innerHTML = `<div class="memory-card-back">?</div>`;
    card.onclick = function() {
      handleMemoryClick(index);
    };
    board.appendChild(card);
  });
  
  document.getElementById('reset-memory').onclick = function() {
    socket.emit('game-reset', { gameName: 'memory' });
    loadMemoryMatch(container);
  };
}

function handleMemoryClick(index) {
  if (gameState.memory.flipped.length >= 2 || 
      gameState.memory.flipped.includes(index) ||
      gameState.memory.matched.includes(index)) return;
  
  const cards = document.querySelectorAll('.memory-card');
  const card = cards[index];
  card.classList.add('flipped');
  card.innerHTML = gameState.memory.cards[index];
  gameState.memory.flipped.push(index);
  
  // Broadcast move
  socket.emit('game-move', {
    gameName: 'memory',
    moveData: {
      index: index,
      flipped: gameState.memory.flipped
    }
  });
  
  if (gameState.memory.flipped.length === 2) {
    gameState.memory.moves++;
    document.getElementById('memory-moves').textContent = gameState.memory.moves;
    
    const [first, second] = gameState.memory.flipped;
    if (gameState.memory.cards[first] === gameState.memory.cards[second]) {
      gameState.memory.matched.push(first, second);
      setTimeout(() => {
        cards[first].classList.add('matched');
        cards[second].classList.add('matched');
        gameState.memory.flipped = [];
        
        if (gameState.memory.matched.length === gameState.memory.cards.length) {
          document.querySelector('.game-status').textContent = 
            `You Won in ${gameState.memory.moves} moves! 🎉`;
        }
      }, 500);
    } else {
      setTimeout(() => {
        cards[first].classList.remove('flipped');
        cards[first].innerHTML = '<div class="memory-card-back">?</div>';
        cards[second].classList.remove('flipped');
        cards[second].innerHTML = '<div class="memory-card-back">?</div>';
        gameState.memory.flipped = [];
      }, 1000);
    }
  }
}

function handleRemoteMemoryMove(moveData) {
  const { index } = moveData;
  
  const cards = document.querySelectorAll('.memory-card');
  const card = cards[index];
  
  if (!card.classList.contains('flipped') && !card.classList.contains('matched')) {
    card.classList.add('flipped');
    card.innerHTML = gameState.memory.cards[index];
  }
}

// ===== TRIVIA QUIZ (Single Player) =====
function loadTrivia(container) {
  console.log('Loading Trivia');
  
  const questions = [
    {
      question: "What is the capital of France?",
      options: ["London", "Berlin", "Paris", "Madrid"],
      correct: 2
    },
    {
      question: "Which planet is known as the Red Planet?",
      options: ["Venus", "Mars", "Jupiter", "Saturn"],
      correct: 1
    },
    {
      question: "Who painted the Mona Lisa?",
      options: ["Van Gogh", "Picasso", "Da Vinci", "Rembrandt"],
      correct: 2
    },
    {
      question: "What is the largest ocean on Earth?",
      options: ["Atlantic", "Indian", "Arctic", "Pacific"],
      correct: 3
    },
    {
      question: "In which year did World War II end?",
      options: ["1943", "1944", "1945", "1946"],
      correct: 2
    }
  ];
  
  gameState.trivia = {
    questions: questions,
    currentQuestion: 0,
    score: 0,
    answered: false
  };
  
  displayTriviaQuestion(container);
}

function displayTriviaQuestion(container) {
  const q = gameState.trivia.questions[gameState.trivia.currentQuestion];
  
  container.innerHTML = `
    <div class="trivia-question">
      <div class="game-info">Question ${gameState.trivia.currentQuestion + 1} of ${gameState.trivia.questions.length}</div>
      <h3>${q.question}</h3>
      <div class="trivia-options" id="trivia-options"></div>
    </div>
    <div class="trivia-score">Score: ${gameState.trivia.score} / ${gameState.trivia.questions.length}</div>
  `;
  
  const optionsContainer = document.getElementById('trivia-options');
  q.options.forEach((option, index) => {
    const btn = document.createElement('div');
    btn.className = 'trivia-option';
    btn.textContent = option;
    btn.onclick = function() {
      handleTriviaAnswer(index);
    };
    optionsContainer.appendChild(btn);
  });
}

function handleTriviaAnswer(selected) {
  if (gameState.trivia.answered) return;
  
  gameState.trivia.answered = true;
  const q = gameState.trivia.questions[gameState.trivia.currentQuestion];
  const options = document.querySelectorAll('.trivia-option');
  
  if (selected === q.correct) {
    options[selected].classList.add('correct');
    gameState.trivia.score++;
  } else {
    options[selected].classList.add('wrong');
    options[q.correct].classList.add('correct');
  }
  
  setTimeout(() => {
    gameState.trivia.currentQuestion++;
    gameState.trivia.answered = false;
    
    if (gameState.trivia.currentQuestion < gameState.trivia.questions.length) {
      displayTriviaQuestion(document.getElementById('game-content'));
    } else {
      document.getElementById('game-content').innerHTML = `
        <div class="game-status">Quiz Complete! 🎉</div>
        <div class="trivia-score" style="font-size: 1.5rem; margin-top: 2rem;">
          Final Score: ${gameState.trivia.score} / ${gameState.trivia.questions.length}
        </div>
        <button class="btn-reset" id="reset-trivia">Play Again</button>
      `;
      
      document.getElementById('reset-trivia').onclick = function() {
        loadTrivia(document.getElementById('game-content'));
      };
    }
  }, 2000);
}

// ===== DRAWING GAME (Shared Canvas) =====
function loadDrawing(container) {
  console.log('Loading Shared Drawing');
  
  container.innerHTML = `
    <div class="game-status">Draw Together!</div>
    <div class="game-info">Everyone can draw on the same canvas</div>
    <div class="drawing-canvas-container">
      <canvas id="drawing-canvas" width="600" height="400"></canvas>
    </div>
    <div class="drawing-controls">
      <div class="color-picker">
        <div class="color-btn active" style="background: #000;" id="color-black"></div>
        <div class="color-btn" style="background: #ef4444;" id="color-red"></div>
        <div class="color-btn" style="background: #3b82f6;" id="color-blue"></div>
        <div class="color-btn" style="background: #10b981;" id="color-green"></div>
        <div class="color-btn" style="background: #f59e0b;" id="color-orange"></div>
        <div class="color-btn" style="background: #a855f7;" id="color-purple"></div>
      </div>
      <button class="btn-clear" id="clear-canvas">Clear Canvas</button>
    </div>
  `;
  
  initDrawing();
}

function initDrawing() {
  const canvas = document.getElementById('drawing-canvas');
  const ctx = canvas.getContext('2d');
  let isDrawing = false;
  let currentColor = '#000';
  
  gameState.drawing = { ctx, currentColor };
  
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseout', stopDrawing);
  
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startDrawing(e.touches[0]);
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    draw(e.touches[0]);
  });
  canvas.addEventListener('touchend', stopDrawing);
  
  function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }
  
  function draw(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ctx.lineTo(x, y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Broadcast drawing to other players
    socket.emit('game-move', {
      gameName: 'drawing',
      moveData: {
        x: x,
        y: y,
        color: currentColor,
        drawing: true
      }
    });
  }
  
  function stopDrawing() {
    isDrawing = false;
  }
  
  // Color buttons
  document.getElementById('color-black').onclick = function() { setColor('#000', this); };
  document.getElementById('color-red').onclick = function() { setColor('#ef4444', this); };
  document.getElementById('color-blue').onclick = function() { setColor('#3b82f6', this); };
  document.getElementById('color-green').onclick = function() { setColor('#10b981', this); };
  document.getElementById('color-orange').onclick = function() { setColor('#f59e0b', this); };
  document.getElementById('color-purple').onclick = function() { setColor('#a855f7', this); };
  
  function setColor(color, btn) {
    currentColor = color;
    gameState.drawing.currentColor = color;
    document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  
  document.getElementById('clear-canvas').onclick = function() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit('game-reset', { gameName: 'drawing' });
  };
  
  // Listen for remote drawing
  socket.on('game-move-update', (data) => {
    if (data.gameName === 'drawing' && data.playerId !== socket.id) {
      const { x, y, color, drawing } = data.moveData;
      if (drawing) {
        ctx.lineTo(x, y);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
  });
}

function updateGameUI(gameName) {
  // Update UI based on received game state
  console.log('Updating UI for:', gameName);
}

console.log('Multiplayer Games.js loaded successfully!');