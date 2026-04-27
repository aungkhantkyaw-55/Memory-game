'use strict';

/**
 * MEMORY MASTER (game.js)
 */

// ============================================================================
// GAME CONFIGURATIONS
// ============================================================================
const CONFIGS = {
  easy: {
    cols: 3,
    rows: 4,
    pairs: 6,
    timeLimit: 150,
    flips: 3,
    label: 'Easy',
    icon: '🌿',
    theme: 'theme-easy'
  },
  
  medium: {
    cols: 4,
    rows: 4,
    pairs: 8,
    timeLimit: 120,
    flips: 3,
    label: 'Medium',
    icon: '⚡',
    theme: 'theme-medium'
  },
  
  hard: {
    cols: 5,
    rows: 4,
    pairs: 10,
    timeLimit: 90,
    flips: 3,
    label: 'Hard',
    icon: '🔥',
    theme: 'theme-hard'
  },
  
  extreme: {
    cols: 6,
    rows: 6,
    pairs: 18,
    timeLimit: 120,
    flips: 2,
    label: 'Extremely Hard',
    icon: '☠️',
    theme: 'theme-extreme'
  },
};

// ============================================================================
// EMOJI POOL — All possible card faces
// ============================================================================
const EMOJI_POOL = [
  '🌸', '🌈', '⭐', '🎈', '🦋', '🌻', '🍀', '🐝',
  '🎯', '🏆', '⚡', '🔥', '💎', '🎮', '🚀', '🎸',
  '🦁', '🐉', '🌙', '⚔️', '🔮', '💀', '🎭', '🌊',
  '🍕', '🎨', '🦜', '🐬', '🌺', '🎪', '🦄', '🏔️',
  '🎃', '🍄', '🌴', '🔑', '🎵', '🍩', '🌹', '🐸',
];

// ============================================================================
// GAME STATE
// ============================================================================
let state = {
  difficulty: null,     // Current difficulty (easy, medium, hard, extreme)
  config: null,         // Config object from CONFIGS
  cards: [],            // Array of card objects
  flipped: [],          // Currently flipped cards (max 2 or 3 depending on mode)
  matched: [],          // Indices of matched cards
  moves: 0,             // Number of turns taken
  timeLeft: 0,          // Seconds remaining
  timerID: null,        // Timer interval ID
  running: false,       // Whether game timer is running
  locked: false,        // Prevent clicks during animations
  paused: false,        // Game paused (mode overlay open)
};

// Shortcut for document.getElementById
const $ = (id) => document.getElementById(id);

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize a new game with the selected difficulty
 * @param {string} difficulty - easy, medium, hard, or extreme
 */
function initGame(difficulty) {
  // Validate difficulty
  if (!CONFIGS[difficulty]) {
    console.error('Invalid difficulty:', difficulty);
    return;
  }
  
  // Clear any existing timer
  clearTimer();

  const config = CONFIGS[difficulty];
  
  // Reset game state
  state = {
    difficulty: difficulty,
    config: config,
    cards: [],
    flipped: [],
    matched: [],
    moves: 0,
    timeLeft: config.timeLimit,
    timerID: null,
    running: false,
    locked: false,
    paused: false,
  };

  // Switch UI from difficulty select to game board
  const selectScreen = $('diff-select-screen');
  const boardArea = $('board-area');
  
  if (selectScreen) {
    selectScreen.style.display = 'none';
  }
  
  if (boardArea) {
    boardArea.style.display = 'flex';
  }

  // Save last difficulty for leaderboard back-link
  try {
    sessionStorage.setItem('mm_last_diff', difficulty);
  } catch (error) {
    // Silently fail if sessionStorage is unavailable
  }

  // Build the deck and render
  buildDeck();
  renderGrid();
  updateHUD();
  updateFlipDots();
}

// ============================================================================
// DECK BUILDING
// ============================================================================

/**
 * Create and shuffle the card deck
 */
function buildDeck() {
  // Take required number of emojis from pool
  const emojis = EMOJI_POOL.slice(0, state.config.pairs);
  
  // Double them for pairs
  const doubled = [...emojis, ...emojis];
  
  // Fisher-Yates shuffle
  for (let i = doubled.length - 1; i > 0; i--) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [doubled[i], doubled[randomIndex]] = [doubled[randomIndex], doubled[i]];
  }
  
  // Create card objects
  state.cards = doubled.map((emoji, index) => ({
    idx: index,
    emoji: emoji,
    key: emoji  // Used for matching
  }));
}

// ============================================================================
// GRID RENDERING
// ============================================================================

/**
 * Render the card grid
 */
function renderGrid() {
  const grid = $('card-grid');
  if (!grid) return;

  // Apply theme class
  grid.className = `card-grid ${state.config.theme}`;
  grid.innerHTML = '';

  // Step 1: Append all cards (needed before resizeCards reads them)
  state.cards.forEach((card, index) => {
    const cardElement = document.createElement('div');
    cardElement.className = 'mem-card';
    cardElement.dataset.idx = index;
    
    cardElement.innerHTML = `
      <div class="mem-card-inner">
        <div class="mem-card-face mem-card-back"></div>
        <div class="mem-card-face mem-card-front">${card.emoji}</div>
      </div>
    `;
    
    // Start invisible and scaled down for entrance animation
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'scale(.6)';
    
    // Add click handler
    cardElement.addEventListener('click', () => onCardClick(index, cardElement));
    
    grid.appendChild(cardElement);
  });

  // Step 2: Size cards now that they're in the DOM
  resizeCards(grid);

  // Step 3: Stagger entrance animation
  document.querySelectorAll('.mem-card').forEach((element, i) => {
    setTimeout(() => {
      element.style.transition = 'opacity .25s ease, transform .25s ease';
      element.style.opacity = '1';
      element.style.transform = 'scale(1)';
    }, i * 14 + 30);
  });

  // Handle window resize
  window.onresize = () => resizeCards(grid);
}

/**
 * Calculate and apply card sizes based on viewport
 * @param {HTMLElement} grid - The grid container
 */
function resizeCards(grid) {
  if (!grid || !state.config) return;
  
  const { cols, rows } = state.config;
  const isMobile = window.innerWidth <= 720;
  
  // Account for sidebar on desktop, top bar on mobile
  const sidebarWidth = isMobile ? 0 : 204;
  const topBarHeight = isMobile ? 105 : 0;
  const navHeight = 58;
  const padding = isMobile ? 8 : 16;
  const gap = isMobile ? 5 : 8;

  // Calculate available space
  const availableWidth = window.innerWidth - sidebarWidth - (padding * 2);
  const availableHeight = window.innerHeight - navHeight - topBarHeight - (padding * 2);

  // Calculate card size (with aspect ratio 1:1.35)
  const widthBasedSize = (availableWidth - (gap * (cols - 1))) / cols;
  const heightBasedSize = (availableHeight - (gap * (rows - 1))) / rows / 1.35;
  const cardSize = Math.max(30, Math.min(widthBasedSize, heightBasedSize, 115));

  // Apply grid template
  grid.style.gridTemplateColumns = `repeat(${cols}, ${cardSize}px)`;
  grid.style.gap = gap + 'px';

  // Apply card dimensions
  document.querySelectorAll('.mem-card').forEach(element => {
    element.style.width = cardSize + 'px';
    element.style.height = (cardSize * 1.35) + 'px';
  });

  // Adjust font size
  const fontSize = Math.max(10, Math.min(cardSize * 0.38, 40));
  document.querySelectorAll('.mem-card-front').forEach(element => {
    element.style.fontSize = fontSize + 'px';
  });
}

// ============================================================================
// CARD CLICK HANDLER
// ============================================================================

/**
 * Handle card click events
 * @param {number} index - Card index in state.cards
 * @param {HTMLElement} element - The card DOM element
 */
async function onCardClick(index, element) {
  // Various checks to prevent invalid clicks
  if (state.locked) return;
  if (state.paused) return;
  if (element.classList.contains('flipped')) return;
  if (element.classList.contains('matched')) return;
  if (state.flipped.some(flipped => flipped.idx === index)) return;

  // Start timer on first flip
  if (!state.running) {
    startTimer();
  }

  // Play flip sound
  Sound.play('flip');
  
  // Flip the card
  element.classList.add('flipped');
  state.flipped.push({ idx: index, el: element });
  updateFlipDots();

  const flippedCount = state.flipped.length;
  const maxFlips = state.config.flips;

  // First card flipped - wait for more
  if (flippedCount === 1) return;

  // Second card flipped
  if (flippedCount === 2) {
    const [firstCard, secondCard] = state.flipped;
    const isMatch = state.cards[firstCard.idx].key === state.cards[secondCard.idx].key;

    if (isMatch) {
      // ✅ First 2 cards already match → resolve RIGHT NOW, no 3rd flip needed
      await resolveTurn(true);
    } else if (maxFlips <= 2) {
      // Extreme mode (2-flip limit), no match → flip both back
      await resolveTurn(false);
    }
    // else: 3-flip mode, no match yet → wait for 3rd flip
    return;
  }

  // Third flip reached (only in 3-flip modes after 2-card mismatch)
  if (flippedCount >= 3) {
    await resolveTurn(false);
  }
}

// ============================================================================
// TURN RESOLUTION
// ============================================================================

/**
 * Resolve a turn - check for matches and update UI
 * @param {boolean} immediateMatch - Whether a match was already found
 */
async function resolveTurn(immediateMatch) {
  // Lock the board during animation
  state.locked = true;
  state.moves++;
  updateHUD();

  // Brief pause so player can see the cards
  await sleep(immediateMatch ? 280 : 480);

  const flippedCards = [...state.flipped];

  // Find any matching pair among the flipped cards
  let matchIndexA = -1;
  let matchIndexB = -1;
  
  outerLoop:
  for (let i = 0; i < flippedCards.length; i++) {
    for (let j = i + 1; j < flippedCards.length; j++) {
      const cardAKey = state.cards[flippedCards[i].idx].key;
      const cardBKey = state.cards[flippedCards[j].idx].key;
      
      if (cardAKey === cardBKey) {
        matchIndexA = i;
        matchIndexB = j;
        break outerLoop;
      }
    }
  }

  // Handle MATCH case
  if (matchIndexA !== -1) {
    const matchedCardA = flippedCards[matchIndexA];
    const matchedCardB = flippedCards[matchIndexB];

    // Mark as matched
    matchedCardA.el.classList.add('matched');
    matchedCardB.el.classList.add('matched');
    state.matched.push(matchedCardA.idx, matchedCardB.idx);

    // Play match sound
    Sound.play('match');

    // Flip back any extra non-matched card (only possible in 3-flip turns)
    const extraCards = flippedCards.filter((_, i) => i !== matchIndexA && i !== matchIndexB);
    
    if (extraCards.length > 0) {
      extraCards.forEach(card => card.el.classList.add('wrong'));
      await sleep(400);
      extraCards.forEach(card => card.el.classList.remove('flipped', 'wrong'));
    }

    // Update UI
    updateHUD();
    updateProgress();
    state.flipped = [];
    state.locked = false;
    updateFlipDots();

    // Check for win
    if (state.matched.length === state.cards.length) {
      // All pairs matched — stop timer and show win after matched animation settles
      clearTimer();
      state.running = false;
      await sleep(500); // Let the matched glow animation finish
      showWin();
    }
  } 
  // Handle NO MATCH case
  else {
    // Show wrong animation
    flippedCards.forEach(card => card.el.classList.add('wrong'));
    Sound.play('miss');
    
    await sleep(500);
    
    // Flip all cards back
    flippedCards.forEach(card => card.el.classList.remove('flipped', 'wrong'));
    state.flipped = [];
    state.locked = false;
    updateFlipDots();
  }
}

// ============================================================================
// TIMER MANAGEMENT
// ============================================================================

/**
 * Start the game timer
 */
function startTimer() {
  state.running = true;
  
  state.timerID = setInterval(() => {
    // Don't count down if paused
    if (state.paused) return;
    
    state.timeLeft--;
    
    // Play tick sound when time is running low
    if (state.timeLeft <= 10 && state.timeLeft > 0) {
      Sound.play('tick');
    }
    
    updateHUD();
    
    // Time's up!
    if (state.timeLeft <= 0) {
      clearTimer();
      state.running = false;
      Sound.play('lose');
      setTimeout(showLose, 350);
    }
  }, 1000);
}

/**
 * Clear the game timer
 */
function clearTimer() {
  if (state.timerID) {
    clearInterval(state.timerID);
    state.timerID = null;
  }
}

// ============================================================================
// HUD UPDATES
// ============================================================================

/**
 * Update all HUD elements
 */
function updateHUD() {
  // Time display
  const timeElement = $('g-time');
  if (timeElement) {
    timeElement.textContent = formatTime(state.timeLeft);
    timeElement.className = 'g-stat-val';
    
    // Add warning classes based on time remaining
    if (state.timeLeft <= 10) {
      timeElement.className += ' t-danger';
    } else if (state.timeLeft <= 30) {
      timeElement.className += ' t-warn';
    }
  }

  // Moves display
  const movesElement = $('g-moves');
  if (movesElement) {
    movesElement.textContent = state.moves;
  }

  // Score display
  const scoreElement = $('g-score');
  if (scoreElement && state.config) {
    const score = ScoreCalc.calculate(
      state.difficulty,
      state.timeLeft,
      state.moves,
      state.config.timeLimit
    );
    scoreElement.textContent = score;
  }

  // Pairs display
  const pairsElement = $('g-pairs');
  if (pairsElement && state.config) {
    const matchedPairs = state.matched.length / 2;
    pairsElement.textContent = `${matchedPairs}/${state.config.pairs}`;
  }
}

/**
 * Update progress bar
 */
function updateProgress() {
  const progressFill = $('progress-fill');
  const percentElement = $('g-pct');
  
  if (!state.cards.length) return;
  
  const percentComplete = (state.matched.length / state.cards.length) * 100;
  
  if (progressFill) {
    progressFill.style.width = percentComplete + '%';
  }
  
  if (percentElement) {
    percentElement.textContent = Math.round(percentComplete) + '%';
  }
}

/**
 * Update flip dots indicator
 */
function updateFlipDots() {
  const dotsContainer = $('flip-dots');
  if (!dotsContainer) return;
  
  const maxFlips = state.config ? state.config.flips : 3;
  const currentFlips = state.flipped.length;
  
  // Generate dot HTML
  const dotsHtml = Array.from({ length: maxFlips }, (_, i) => {
    const isActive = i < currentFlips;
    return `<div class="g-flip-dot ${isActive ? 'active' : ''}"></div>`;
  }).join('');
  
  dotsContainer.innerHTML = dotsHtml;
}

// ============================================================================
// WIN / LOSE HANDLERS
// ============================================================================

/**
 * Show win modal and save score
 */
function showWin() {
  // Calculate final score
  const finalScore = ScoreCalc.calculate(
    state.difficulty,
    state.timeLeft,
    state.moves,
    state.config.timeLimit
  );

  // Save to leaderboard if user is logged in
  const username = Auth.getCurrentUsername();
  if (username) {
    Leaderboard.save({
      username: username,
      difficulty: state.difficulty,
      score: finalScore,
      moves: state.moves,
      timeLeft: state.timeLeft,
      totalTime: state.config.timeLimit,
    });
  }

  // Play win sound and launch confetti
  Sound.play('win');
  launchConfetti(80);

  // Helper for getting win modal elements
  const winElement = (suffix) => document.getElementById('w-' + suffix);
  
  // Update win modal content
  if (winElement('moves')) {
    winElement('moves').textContent = state.moves;
  }
  
  if (winElement('time')) {
    winElement('time').textContent = formatTime(state.timeLeft);
  }
  
  if (winElement('score')) {
    winElement('score').textContent = finalScore.toLocaleString();
  }
  
  if (winElement('rating')) {
    winElement('rating').textContent = getRating(state.moves, state.difficulty);
  }

  // Show the modal
  const winModal = $('modal-win');
  if (winModal) {
    winModal.classList.add('show');
  }
}

/**
 * Show lose modal
 */
function showLose() {
  const pairsElement = $('lose-pairs');
  
  if (pairsElement && state.config) {
    const matchedPairs = state.matched.length / 2;
    pairsElement.textContent = `${matchedPairs} / ${state.config.pairs}`;
  }
  
  const loseModal = $('modal-lose');
  if (loseModal) {
    loseModal.classList.add('show');
  }
}

/**
 * Get rating based on moves and difficulty
 * @param {number} moves - Number of moves made
 * @param {string} difficulty - Game difficulty
 * @returns {string} Rating text with emoji
 */
function getRating(moves, difficulty) {
  const thresholds = {
    easy: [10, 16, 22],
    medium: [14, 22, 34],
    hard: [18, 28, 44],
    extreme: [30, 50, 75]
  }[difficulty] || [20, 30, 45];
  
  if (moves <= thresholds[0]) return '⭐⭐⭐  Perfect!';
  if (moves <= thresholds[1]) return '⭐⭐  Great!';
  if (moves <= thresholds[2]) return '⭐  Good Job';
  return '🔄  Keep Going!';
}

// ============================================================================
// MODE OVERLAY (Pause / Switch Mode)
// ============================================================================

/**
 * Open the mode overlay (pauses game)
 */
function openModeOverlay() {
  state.paused = true;
  
  const overlay = $('mode-overlay');
  if (overlay) {
    overlay.classList.add('show');
  }
}

/**
 * Close the mode overlay (resumes game)
 */
function closeModeOverlay() {
  state.paused = false;
  
  const overlay = $('mode-overlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
}

/**
 * Pick a new mode from the overlay
 * @param {string} difficulty - New difficulty to switch to
 */
function pickNewMode(difficulty) {
  closeModeOverlay();
  
  // Update sidebar label immediately for better UX
  const icons = {
    easy: '🌿',
    medium: '⚡',
    hard: '🔥',
    extreme: '☠️'
  };
  
  const names = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    extreme: 'Extremely Hard'
  };
  
  const iconElement = $('g-diff-icon');
  const nameElement = $('g-diff-name');
  
  if (iconElement) {
    iconElement.textContent = icons[difficulty] || '🎮';
  }
  
  if (nameElement) {
    nameElement.textContent = names[difficulty] || difficulty;
  }
  
  // Small delay before initializing new game (for smoother transition)
  setTimeout(() => initGame(difficulty), 180);
}

// ============================================================================
// GAME CONTROLS
// ============================================================================

/**
 * Restart the current game
 */
function restartGame() {
  // Close any open modals
  const winModal = $('modal-win');
  const loseModal = $('modal-lose');
  
  if (winModal) winModal.classList.remove('show');
  if (loseModal) loseModal.classList.remove('show');
  
  // Small delay before restart
  setTimeout(() => initGame(state.difficulty), 260);
}

/**
 * Toggle sound on/off
 */
function toggleSound() {
  const isSoundOn = Sound.toggle();
  const soundButton = $('snd-btn');
  
  if (soundButton) {
    soundButton.textContent = isSoundOn ? '🔊' : '🔇';
  }
  
  Toast.show(isSoundOn ? 'Sound on' : 'Sound muted', 'info', 1300);
}