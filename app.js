'use strict';

/**
 * MEMORY MASTER - Memory Card Game
 * A fully-featured memory matching game with authentication,
 * leaderboards, themes, sound effects and user profiles.
 */

// ============================================================================
// STORAGE KEYS
// ============================================================================
const KEYS = {
  USERS: 'mmv2_users',      // Stores all registered users
  CURRENT: 'mmv2_current',   // Currently logged in user
  SCORES: 'mmv2_scores',     // Game scores leaderboard
  THEME: 'mmv2_theme',       // User theme preference
};

// ============================================================================
// LOCAL STORAGE WRAPPER
// ============================================================================
const Store = {
  // Get item from localStorage with fallback
  get(key, fallback = null) {
    try {
      const value = localStorage.getItem(key);
      return value !== null ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },

  // Set item in localStorage
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  // Remove item from localStorage
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Silently fail
    }
  },
};

// ============================================================================
// AUTHENTICATION SYSTEM
// ============================================================================
const Auth = {
  // Simple hash function (not cryptographically secure but fine for this demo)
  _hash(password) {
    return btoa(unescape(encodeURIComponent(password)));
  },

  // Get all users from storage
  getUsers() {
    return Store.get(KEYS.USERS, []);
  },

  // Save users array to storage
  saveUsers(users) {
    Store.set(KEYS.USERS, users);
  },

  // Get currently logged in user object
  getCurrentUser() {
    const username = Store.get(KEYS.CURRENT, null);
    if (!username) return null;
    
    const users = this.getUsers();
    return users.find(user => user.username === username) || null;
  },

  // Get current username only
  getCurrentUsername() {
    return Store.get(KEYS.CURRENT, null);
  },

  // Check if user is logged in
  isLoggedIn() {
    return !!this.getCurrentUsername();
  },

  // Redirect if not authenticated
  requireAuth(redirect = 'index.html') {
    if (!this.isLoggedIn()) {
      window.location.href = redirect;
      return false;
    }
    return true;
  },

  // Register a new user
  register(username, password) {
    const cleanUsername = username.trim();
    const cleanPassword = (password || '').trim();

    // Validation
    if (!cleanUsername) {
      return { ok: false, msg: 'Username cannot be empty.' };
    }
    
    if (!/^[a-zA-Z0-9_\-]{3,20}$/.test(cleanUsername)) {
      return { 
        ok: false, 
        msg: 'Username must be 3–20 characters and can only contain letters, numbers, underscores, and hyphens.' 
      };
    }
    
    if (!cleanPassword || cleanPassword.length < 4) {
      return { ok: false, msg: 'Password must be at least 4 characters.' };
    }

    // Check if username exists
    const users = this.getUsers();
    const usernameExists = users.some(
      user => user.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    
    if (usernameExists) {
      return { ok: false, msg: 'That username is already taken.' };
    }

    // Create new user
    const newUser = {
      username: cleanUsername,
      password: this._hash(cleanPassword),
      joinDate: new Date().toISOString()
    };
    
    users.push(newUser);
    this.saveUsers(users);
    
    // Auto login after registration
    Store.set(KEYS.CURRENT, cleanUsername);
    
    return { ok: true };
  },

  // Login existing user
  login(username, password) {
    const cleanUsername = username.trim();
    const cleanPassword = (password || '').trim();

    if (!cleanUsername) {
      return { ok: false, msg: 'Please enter your username.' };
    }
    
    if (!cleanPassword) {
      return { ok: false, msg: 'Please enter your password.' };
    }

    const users = this.getUsers();
    const user = users.find(
      u => u.username.toLowerCase() === cleanUsername.toLowerCase()
    );

    if (!user) {
      return { ok: false, msg: 'Username not found. Please register first.' };
    }

    if (user.password && user.password !== this._hash(cleanPassword)) {
      return { ok: false, msg: 'Incorrect password. Please try again.' };
    }

    Store.set(KEYS.CURRENT, user.username);
    return { ok: true };
  },

  // Logout current user
  logout() {
    Store.del(KEYS.CURRENT);
    window.location.href = 'index.html';
  },
};

// ============================================================================
// LEADERBOARD & SCORES
// ============================================================================
const Leaderboard = {
  // Get all scores
  getAll() {
    return Store.get(KEYS.SCORES, []);
  },

  // Save a new score entry
  save(entry) {
    const scores = this.getAll();
    
    // Create new score entry with unique ID
    const newEntry = {
      id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      username: entry.username,
      difficulty: entry.difficulty,
      score: entry.score,
      moves: entry.moves,
      timeLeft: entry.timeLeft,
      totalTime: entry.totalTime,
      date: new Date().toISOString(),
    };
    
    scores.push(newEntry);
    
    // Sort by score (highest first) and keep only top 300
    scores.sort((a, b) => b.score - a.score);
    Store.set(KEYS.SCORES, scores.slice(0, 300));
  },

  // Get scores filtered by difficulty
  getFiltered(difficulty = 'all') {
    const scores = this.getAll();
    return difficulty === 'all' 
      ? scores 
      : scores.filter(score => score.difficulty === difficulty);
  },

  // Get all scores for a specific user
  getUserScores(username) {
    return this.getAll()
      .filter(score => score.username === username)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  },

  // Get user's best score
  getUserBest(username) {
    const scores = this.getUserScores(username);
    if (!scores.length) return null;
    
    return scores.reduce((best, current) => 
      current.score > best.score ? current : best, scores[0]
    );
  },

  // Get user statistics
  getUserStats(username) {
    const scores = this.getUserScores(username);
    
    if (!scores.length) {
      return { games: 0, best: 0, bestDiff: '—' };
    }
    
    const best = scores.reduce((best, current) => 
      current.score > best.score ? current : best, scores[0]
    );
    
    return {
      games: scores.length,
      best: best.score,
      bestDiff: best.difficulty
    };
  },

  // Delete all scores for a user
  clearUser(username) {
    const remaining = this.getAll().filter(score => score.username !== username);
    Store.set(KEYS.SCORES, remaining);
  },
};

// ============================================================================
// SCORE CALCULATION ENGINE
// ============================================================================
const ScoreCalc = {
  // Calculate final score based on game parameters
  calculate(difficulty, timeLeft, moves, totalTime) {
    // Difficulty multipliers
    const difficultyMultiplier = {
      easy: 1,
      medium: 1.6,
      hard: 2.4,
      extreme: 3.5
    }[difficulty] || 1;
    
    // Time bonus (more time left = higher bonus)
    const timeBonus = Math.max(0, timeLeft) * 12;
    
    // Move efficiency (fewer moves = higher bonus)
    const moveBonus = Math.max(0, 800 - moves * 14);
    
    return Math.round((timeBonus + moveBonus) * difficultyMultiplier);
  },
};

// ============================================================================
// THEME MANAGER (Light/Dark mode)
// ============================================================================
const Theme = {
  // Get current theme preference
  get() {
    return Store.get(KEYS.THEME, 'light');
  },

  // Apply theme to document
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Store.set(KEYS.THEME, theme);
    
    // Update all theme toggle buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    });
  },

  // Toggle between light and dark
  toggle() {
    const current = this.get();
    this.apply(current === 'dark' ? 'light' : 'dark');
  },

  // Initialize theme system
  init() {
    this.apply(this.get());
    
    // Handle theme toggle clicks (event delegation)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.theme-btn')) {
        this.toggle();
      }
    });
  },
};

// ============================================================================
// NAVIGATION BAR
// ============================================================================
const Navbar = {
  // Render the navigation bar
  render(options = {}) {
    const navbar = document.querySelector('.navbar');
    if (!navbar) return;
    
    const user = Auth.getCurrentUser();
    const username = user ? user.username : '';
    const initial = username ? username[0].toUpperCase() : '?';
    const currentTheme = Theme.get();
    
    navbar.innerHTML = `
      <div class="nav-logo" id="nav-logo-btn" title="About & How to Play">
        <div class="nav-logo-mark">🧠</div>
        <span>Memory Master</span>
      </div>
      
      <div class="nav-actions">
        ${options.showLeaderboard ? 
          `<a href="leaderboard.html" class="btn btn-ghost btn-sm">🏆 Board</a>` : 
          ''}
        
        ${options.showUser && username ? `
          <div class="nav-user-btn" id="nav-profile-btn" title="View Profile">
            <div class="nav-avatar">${initial}</div>
            <span class="nav-username">${username}</span>
          </div>
        ` : ''}
        
        ${options.backBtn ? 
          `<a href="${options.backBtn}" class="btn btn-ghost btn-sm">← Back</a>` : 
          ''}
        
        <button class="theme-btn" title="Toggle theme">
          ${currentTheme === 'dark' ? '☀️' : '🌙'}
        </button>
        
        ${options.showLogout ? 
          `<button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Sign Out</button>` : 
          ''}
      </div>
    `;
  },
};

// ============================================================================
// SOUND EFFECTS ENGINE
// ============================================================================
const Sound = {
  on: true,            // Sound enabled by default
  _audioContext: null, // Audio context (created on first use)

  // Get or create audio context
  _getContext() {
    if (!this._audioContext) {
      try {
        this._audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        // Web Audio API not supported
      }
    }
    return this._audioContext;
  },

  // Play a beep sound
  _beep(frequency, volume, duration, type = 'sine', delay = 0) {
    const context = this._getContext();
    if (!context || !this.on) return;
    
    try {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);
      
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      
      const startTime = context.currentTime + delay;
      
      // Volume envelope
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.01);
    } catch {
      // Silently fail if audio fails
    }
  },

  // Play different sound types
  play(type) {
    if (!this.on) return;
    
    const beep = this._beep.bind(this);
    
    const sounds = {
      // Card flip sound
      flip: () => beep(420, 0.07, 0.09),
      
      // Match found (happy little melody)
      match: () => {
        beep(520, 0.1, 0.2);
        beep(660, 0.1, 0.2, undefined, 0.1);
        beep(790, 0.1, 0.25, undefined, 0.2);
      },
      
      // Mismatch (sad trombone-ish)
      miss: () => {
        beep(260, 0.09, 0.15, 'sawtooth', 0);
        beep(200, 0.07, 0.2, 'sawtooth', 0.12);
      },
      
      // Game win (ascending scale)
      win: () => {
        [523, 587, 659, 698, 784, 880, 988].forEach((freq, i) => {
          beep(freq, 0.12, 0.3, undefined, i * 0.07);
        });
      },
      
      // Game lose (descending notes)
      lose: () => {
        [380, 320, 260, 200].forEach((freq, i) => {
          beep(freq, 0.09, 0.28, 'sawtooth', i * 0.16);
        });
      },
      
      // Timer tick
      tick: () => beep(900, 0.035, 0.045, 'square'),
    };
    
    if (sounds[type]) {
      sounds[type]();
    }
  },

  // Toggle sound on/off
  toggle() {
    this.on = !this.on;
    return this.on;
  },
};

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================
const Toast = {
  _element: null,
  _timeout: null,

  // Show a toast message
  show(message, type = 'info', duration = 2600) {
    // Create toast element if it doesn't exist
    if (!this._element) {
      this._element = document.createElement('div');
      this._element.className = 'toast';
      document.body.appendChild(this._element);
    }
    
    // Clear any existing timeout
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    
    // Set icon based on type
    const icons = {
      success: '✅',
      error: '❌',
      info: '💡'
    };
    const icon = icons[type] || '💡';
    
    // Update content
    this._element.className = `toast ${type}`;
    this._element.innerHTML = `${icon} ${message}`;
    
    // Show with animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._element.classList.add('show');
      });
    });
    
    // Auto hide after duration
    this._timeout = setTimeout(() => {
      this._element.classList.remove('show');
    }, duration);
  },
};

// ============================================================================
// CONFETTI CELEBRATION
// ============================================================================
function launchConfetti(count = 70) {
  const colors = [
    '#5b6af0', '#9c6ef0', '#22c55e', 
    '#f0c060', '#ef4444', '#f9a8d4', '#60a5fa'
  ];
  
  for (let i = 0; i < count; i++) {
    const confetti = document.createElement('div');
    confetti.className = 'confetti-p';
    
    // Random styles for each piece
    confetti.style.cssText = `
      left: ${Math.random() * 100}vw;
      top: ${Math.random() * -8 - 2}vh;
      background: ${colors[i % colors.length]};
      width: ${5 + Math.random() * 9}px;
      height: ${5 + Math.random() * 9}px;
      animation-delay: ${Math.random() * 0.9}s;
      animation-duration: ${1.6 + Math.random() * 1.4}s;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;
    
    document.body.appendChild(confetti);
    
    // Clean up after animation
    confetti.addEventListener('animationend', () => confetti.remove());
  }
}

// ============================================================================
// USER PROFILE MODAL
// ============================================================================
const ProfileModal = {
  _activeHistoryId: null,

  // Open the profile modal
  open() {
    const user = Auth.getCurrentUser();
    if (!user) return;
    
    const overlay = document.getElementById('profile-overlay');
    if (!overlay) return;
    
    this._render(user);
    overlay.classList.add('show');
  },

  // Close the profile modal
  close() {
    const overlay = document.getElementById('profile-overlay');
    if (overlay) {
      overlay.classList.remove('show');
    }
    this._activeHistoryId = null;
  },

  // Render the modal content
  _render(user) {
    const modal = document.getElementById('profile-modal');
    if (!modal) return;
    
    const stats = Leaderboard.getUserStats(user.username);
    const best = Leaderboard.getUserBest(user.username);
    const scores = Leaderboard.getUserScores(user.username);
    
    const initial = user.username[0].toUpperCase();
    const joinDate = new Date(user.joinDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
    
    const difficultyLabels = {
      easy: '🌿 Easy',
      medium: '⚡ Medium',
      hard: '🔥 Hard',
      extreme: '☠️ Extreme'
    };

    modal.innerHTML = `
      <div class="profile-header">
        <div class="profile-avatar-lg">${initial}</div>
        <div>
          <div class="profile-name">${user.username}</div>
          <div class="profile-join">Joined ${joinDate}</div>
        </div>
        <button class="profile-close" onclick="ProfileModal.close()">✕</button>
      </div>

      <div class="profile-stats-row">
        <div class="profile-stat">
          <div class="profile-stat-val">${stats.games}</div>
          <div class="profile-stat-lbl">Games</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-val">${stats.best > 0 ? stats.best.toLocaleString() : '—'}</div>
          <div class="profile-stat-lbl">Best Score</div>
        </div>
        <div class="profile-stat">
          <div class="profile-stat-val">${stats.bestDiff !== '—' ? stats.bestDiff.charAt(0).toUpperCase() + stats.bestDiff.slice(1) : '—'}</div>
          <div class="profile-stat-lbl">Best Level</div>
        </div>
      </div>

      <div class="profile-tabs">
        <button class="profile-tab active" data-tab="history" onclick="ProfileModal._switchTab('history')">📜 History</button>
        <button class="profile-tab" data-tab="best" onclick="ProfileModal._switchTab('best')">🏅 Best Score</button>
      </div>

      <div class="profile-tab-body" id="profile-tab-body">
        ${this._historyHTML(scores)}
      </div>
    `;
  },

  // Switch between tabs
  _switchTab(tab) {
    // Update tab buttons
    document.querySelectorAll('.profile-tab').forEach(tabButton => {
      tabButton.classList.toggle('active', tabButton.dataset.tab === tab);
    });
    
    const user = Auth.getCurrentUser();
    const scores = Leaderboard.getUserScores(user.username);
    const body = document.getElementById('profile-tab-body');
    
    body.innerHTML = tab === 'history' 
      ? this._historyHTML(scores) 
      : this._bestHTML(scores);
  },

  // Generate HTML for history tab
  _historyHTML(scores) {
    if (!scores.length) {
      return `<div class="hist-empty">
        🎮 No games played yet!<br>
        <small>Play your first game to see history here.</small>
      </div>`;
    }
    
    const difficultyIcons = {
      easy: '🌿',
      medium: '⚡',
      hard: '🔥',
      extreme: '☠️'
    };
    
    return scores.slice(0, 30).map(score => `
      <div class="hist-item" onclick="ProfileModal._toggleDetail('${score.id}')" id="hi_${score.id}">
        <div class="hist-left">
          <span class="hist-icon">${difficultyIcons[score.difficulty] || '🎮'}</span>
          <div>
            <div class="hist-name">${score.difficulty.charAt(0).toUpperCase() + score.difficulty.slice(1)} Mode</div>
            <div class="hist-date">${timeAgo(score.date)} · ${new Date(score.date).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="hist-right">
          <div class="hist-score">${score.score.toLocaleString()}</div>
          <div class="hist-meta">${score.moves} moves</div>
        </div>
      </div>
      <div id="hd_${score.id}" style="display:none"></div>
    `).join('');
  },

  // Generate HTML for best score tab
  _bestHTML(scores) {
    if (!scores.length) {
      return `<div class="hist-empty">No scores yet.</div>`;
    }
    
    const best = scores.reduce((best, current) => 
      current.score > best.score ? current : best, scores[0]
    );
    
    const difficultyIcons = {
      easy: '🌿',
      medium: '⚡',
      hard: '🔥',
      extreme: '☠️'
    };
    
    return `
      <div style="text-align:center;padding:12px 0 8px">
        <div style="font-size:3rem;margin-bottom:8px">🏅</div>
        <div class="profile-stat-val" style="font-size:2.2rem">${best.score.toLocaleString()}</div>
        <div class="profile-stat-lbl">Personal Best Score</div>
      </div>
      
      <div class="hist-detail-grid" style="margin-top:16px">
        <div class="hist-detail-stat">
          <div class="hist-detail-val">${difficultyIcons[best.difficulty] || ''} ${best.difficulty.charAt(0).toUpperCase() + best.difficulty.slice(1)}</div>
          <div class="hist-detail-lbl">Difficulty</div>
        </div>
        <div class="hist-detail-stat">
          <div class="hist-detail-val">${best.moves}</div>
          <div class="hist-detail-lbl">Moves</div>
        </div>
        <div class="hist-detail-stat">
          <div class="hist-detail-val">${formatTime(best.timeLeft)}</div>
          <div class="hist-detail-lbl">Time Left</div>
        </div>
        <div class="hist-detail-stat">
          <div class="hist-detail-val">${new Date(best.date).toLocaleDateString()}</div>
          <div class="hist-detail-lbl">Date</div>
        </div>
      </div>
    `;
  },

  // Toggle detailed view for a score
  _toggleDetail(id) {
    const detailElement = document.getElementById('hd_' + id);
    if (!detailElement) return;
    
    // Close previously open detail
    if (this._activeHistoryId && this._activeHistoryId !== id) {
      const prevDetail = document.getElementById('hd_' + this._activeHistoryId);
      if (prevDetail) {
        prevDetail.style.display = 'none';
      }
    }
    
    // Toggle current detail
    if (detailElement.style.display === 'block') {
      detailElement.style.display = 'none';
      this._activeHistoryId = null;
      return;
    }
    
    // Show detail with score information
    const scoreData = Leaderboard.getAll().find(score => score.id === id);
    if (!scoreData) {
      detailElement.style.display = 'none';
      return;
    }
    
    detailElement.style.display = 'block';
    detailElement.innerHTML = `
      <div class="hist-detail">
        <div style="font-weight:700;margin-bottom:10px;font-size:.9rem">Game Details</div>
        <div class="hist-detail-grid">
          <div class="hist-detail-stat">
            <div class="hist-detail-val">${scoreData.score.toLocaleString()}</div>
            <div class="hist-detail-lbl">Score</div>
          </div>
          <div class="hist-detail-stat">
            <div class="hist-detail-val">${scoreData.moves}</div>
            <div class="hist-detail-lbl">Moves</div>
          </div>
          <div class="hist-detail-stat">
            <div class="hist-detail-val">${formatTime(scoreData.timeLeft)}</div>
            <div class="hist-detail-lbl">Time Left</div>
          </div>
          <div class="hist-detail-stat">
            <div class="hist-detail-val">${formatTime(scoreData.totalTime)}</div>
            <div class="hist-detail-lbl">Time Limit</div>
          </div>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:.78rem;color:var(--text3)">
          ${new Date(scoreData.date).toLocaleString()}
        </div>
      </div>
    `;
    
    this._activeHistoryId = id;
  },
};

// ============================================================================
// SIDEBAR (How to Play / About)
// ============================================================================
const Sidebar = {
  // Open sidebar with specific section
  open(section = 'howto') {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('show');
    
    this.showSection(section);
  },

  // Close sidebar
  close() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  },

  // Show specific section
  showSection(section) {
    // Hide all sections
    document.querySelectorAll('.sidebar-section').forEach(el => {
      el.classList.remove('visible');
    });
    
    // Update navigation buttons
    document.querySelectorAll('.sidebar-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.sec === section);
    });
    
    // Show selected section
    const target = document.getElementById('sec-' + section);
    if (target) {
      target.classList.add('visible');
    }
  },
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format seconds as MM:SS
function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

// Format date as relative time (e.g., "2h ago")
function timeAgo(isoDateString) {
  const now = Date.now();
  const then = new Date(isoDateString).getTime();
  const diffMinutes = Math.floor((now - then) / 60000);
  
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

// Get URL parameter
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

// Sleep / delay function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}