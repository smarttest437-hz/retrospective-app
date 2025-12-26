let isEditing = false; // Track if user is editing

// Show password modal and return promise with entered code
function showPasswordModal(title = 'Enter Admin Code') {
  return new Promise((resolve) => {
    const modal = document.getElementById('passwordModal');
    const modalTitle = document.getElementById('modalTitle');
    const passwordInput = document.getElementById('passwordInput');
    const submitBtn = document.getElementById('modalSubmit');
    const cancelBtn = document.getElementById('modalCancel');

    modalTitle.textContent = title;
    passwordInput.value = '';
    modal.style.display = 'flex';
    passwordInput.focus();

    function cleanup() {
      modal.style.display = 'none';
      submitBtn.removeEventListener('click', handleSubmit);
      cancelBtn.removeEventListener('click', handleCancel);
      passwordInput.removeEventListener('keypress', handleKeypress);
    }

    function handleSubmit() {
      const code = passwordInput.value;
      cleanup();
      resolve(code);
    }

    function handleCancel() {
      cleanup();
      resolve(null);
    }

    function handleKeypress(e) {
      if (e.key === 'Enter') {
        handleSubmit();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    }

    submitBtn.addEventListener('click', handleSubmit);
    cancelBtn.addEventListener('click', handleCancel);
    passwordInput.addEventListener('keypress', handleKeypress);
  });
}

// Timer state
let timerState = {
  duration: 0,
  startTime: null,
  pausedAt: null,
  remainingSeconds: null,
  state: 'stopped'
};
let timerInterval = null;
let audioAlertPlayed = false;

// Extract session ID from URL
const pathParts = window.location.pathname.split('/');
const sessionId = pathParts[pathParts.length - 1];

// Load session info and display
async function loadSessionInfo() {
  try {
    const res = await fetch(`/api/session/${sessionId}`);
    if (!res.ok) {
      alert('Session not found!');
      window.location.href = '/';
      return;
    }
    const session = await res.json();
    document.getElementById('sessionTitle').textContent = session.name || 'Sprint Retrospective';

    // Display just the session ID
    const idElement = document.getElementById('sessionIdDisplay');
    if (idElement) {
      idElement.textContent = sessionId;
    }

    // Sync timer state
    syncTimer(session.timer);

    // Show delete button if came from admin management page
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('from') === 'admin') {
      const deleteBtn = document.getElementById('deleteSessionBtn');
      if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
      }
    }
  } catch (err) {
    console.error('Error loading session:', err);
  }
}

// Copy session ID to clipboard
function setupCopySessionId() {
  const btn = document.getElementById('copyIdBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    } catch (err) {
      // Fallback method
      const tempInput = document.createElement('input');
      tempInput.value = sessionId;
      tempInput.style.position = 'fixed';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);

      const originalText = btn.textContent;
      btn.textContent = '✓ Copied!';
      setTimeout(() => {
        btn.textContent = originalText;
      }, 2000);
    }
  });
}


async function loadItems(force = false) {
  // Don't refresh if user is editing (unless forced)
  if (isEditing && !force) return;

  const res = await fetch(`/api/session/${sessionId}/feedback`);
  const data = await res.json();
  const voted = JSON.parse(localStorage.getItem('votedItems') || '[]');
  const owned = JSON.parse(localStorage.getItem('ownedItems') || '[]');

  const grouped = {
    'went-well': [],
    'didnt-go-well': [],
    'ideas': [],
    'action-items': []
  };

  data.forEach(item => grouped[item.category].push(item));

  Object.keys(grouped).forEach(cat => {
    const list = document.getElementById(`list-${cat}`);
    list.innerHTML = '';
    const items = grouped[cat]; // keep order as-is

    // const items = grouped[cat].sort((a, b) => (b.votes || 0) - (a.votes || 0)); // sort by votes

    items.forEach(item => {
      const li = document.createElement('li');
      li.dataset.id = item.id;
      const text = document.createElement('span');
      text.textContent = item.text;

      const voteBtn = document.createElement('button');
      const hasVoted = voted.includes(item.id);
      voteBtn.textContent = `👍 ${item.votes || 0}`;
      voteBtn.style.backgroundColor = hasVoted ? '#d4edda' : '';
      voteBtn.addEventListener('click', async () => {
        const action = hasVoted ? 'down' : 'up';
        const res = await fetch(`/api/session/${sessionId}/vote/${item.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        const result = await res.json();
        voteBtn.textContent = `👍 ${result.votes}`;
        if (action === 'up') voted.push(item.id);
        else voted.splice(voted.indexOf(item.id), 1);
        localStorage.setItem('votedItems', JSON.stringify(voted));
        voteBtn.style.backgroundColor = action === 'up' ? '#d4edda' : '';
        loadItems(true); // force refresh even if editing
      });

      li.appendChild(text);
      li.appendChild(voteBtn);

      if (owned.includes(item.id)) {
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.classList.add('edit-btn'); // Add class for tracking
        editBtn.addEventListener('click', () => {
          isEditing = true; // Pause auto-refresh

          // Disable all other edit buttons
          document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
          });

          const input = document.createElement('textarea');
          input.value = item.text;
          input.rows = 3;
          input.style.width = '100%';
          input.style.resize = 'vertical';
          input.style.fontFamily = 'sans-serif';
          const saveBtn = document.createElement('button');
          saveBtn.textContent = '💾';
          const cancelBtn = document.createElement('button');
          cancelBtn.textContent = '❌';
          li.innerHTML = '';
          li.style.flexDirection = 'column'; // Stack textarea and buttons vertically
          li.style.alignItems = 'stretch';
          const buttonContainer = document.createElement('div');
          buttonContainer.style.display = 'flex';
          buttonContainer.style.gap = '5px';
          buttonContainer.style.marginTop = '5px';
          buttonContainer.appendChild(saveBtn);
          buttonContainer.appendChild(cancelBtn);
          li.appendChild(input);
          li.appendChild(buttonContainer);

          saveBtn.addEventListener('click', async () => {
            const newText = input.value.trim();
            if (!newText) return;
            await fetch(`/api/session/${sessionId}/edit/${item.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newText })
            });
            isEditing = false; // Resume auto-refresh
            loadItems(true); // force refresh (will re-enable all buttons)
          });

          cancelBtn.addEventListener('click', () => {
            isEditing = false; // Resume auto-refresh
            loadItems(true); // force refresh (will re-enable all buttons)
          });
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.addEventListener('click', async () => {
          if (confirm('Delete this item?')) {
            await fetch(`/api/session/${sessionId}/feedback/${item.id}`, { method: 'DELETE' });
            loadItems(true); // force refresh even if editing
          }
        });

        li.appendChild(editBtn);
        li.appendChild(delBtn);
      }

      list.appendChild(li);
    });
  });

  ['went-well', 'didnt-go-well', 'ideas', 'action-items'].forEach(cat => {
    const list = document.getElementById(`list-${cat}`);
    new Sortable(list, {
      group: 'shared', // Enable dragging between all lists
      animation: 150,
      onEnd: (evt) => {
        const itemId = Number(evt.item.dataset.id);
        const newCategory = evt.to.id.replace('list-', '');
        const oldCategory = evt.from.id.replace('list-', '');
        
        // If item moved to a different category, update it
        if (newCategory !== oldCategory) {
          fetch(`/api/session/${sessionId}/move/${itemId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newCategory })
          }).then(() => {
            loadItems(true); // force refresh even if editing
          });
        } else {
          // Just reordering within same category
          const newOrder = Array.from(evt.to.children).map(li => Number(li.dataset.id));
          fetch(`/api/session/${sessionId}/reorder/${newCategory}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newOrder })
          });
          // No need to refresh for reordering as it's already visually updated
        }
      }
    });
  });

}

function setupFormSubmission() {
  const forms = document.querySelectorAll('form');
  console.log('Setting up form submission for', forms.length, 'forms');

  forms.forEach((form, index) => {
    console.log(`Attaching listener to form ${index + 1}`);
    form.addEventListener('submit', async (e) => {
      console.log('Form submitted!');
      e.preventDefault();
      e.stopPropagation();

      const input = form.querySelector('textarea');
      const text = input.value.trim();
      if (!text) {
        console.log('Empty text, skipping');
        return;
      }
      const category = form.getAttribute('data-category');
      console.log('Adding item to category:', category, 'text:', text);

      try {
        const res = await fetch(`/api/session/${sessionId}/feedback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, text })
        });
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const result = await res.json();
        console.log('Item added successfully:', result);
        const owned = JSON.parse(localStorage.getItem('ownedItems') || '[]');
        owned.push(result.id);
        localStorage.setItem('ownedItems', JSON.stringify(owned));
        input.value = '';
        loadItems(true); // force refresh even if editing another item
      } catch (err) {
        console.error('Error adding item:', err);
        alert('Failed to add item: ' + err.message);
      }

      return false; // Extra safety to prevent form submission
    }, false);
  });
}

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const res = await fetch(`/api/session/${sessionId}/export`);
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'retrospective.json';
  link.click();
});

document.getElementById('jiraBtn').addEventListener('click', async () => {
  const res = await fetch(`/api/session/${sessionId}/export/jira`);
  const jiraMarkup = await res.text();
  const blob = new Blob([jiraMarkup], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'retrospective-jira.txt';
  link.click();
});

// Delete session button (only visible if from admin page)
const deleteSessionBtn = document.getElementById('deleteSessionBtn');
if (deleteSessionBtn) {
  deleteSessionBtn.addEventListener('click', async () => {
    const sessionName = document.getElementById('sessionTitle').textContent;
    const adminCode = await showPasswordModal('Enter Admin Code to Delete Session');

    if (!adminCode) return;

    if (!confirm(`Are you sure you want to delete "${sessionName}"?\n\nThis action cannot be undone and you will be redirected to the home page.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/session/${sessionId}`, {
        method: 'DELETE',
        headers: {
          'x-admin-code': adminCode
        }
      });

      if (res.status === 401) {
        alert('Invalid admin code');
        return;
      }

      if (res.ok) {
        alert('Session deleted successfully');
        window.location.href = '/';
      } else {
        alert('Failed to delete session');
      }
    } catch (err) {
      console.error('Error deleting session:', err);
      alert('Error deleting session');
    }
  });
}

// Timer Functions

// Calculate remaining seconds from server state
function calculateRemainingSeconds(timer) {
  if (!timer) return 0;
  if (timer.state === 'stopped') return 0;
  if (timer.state === 'paused') return timer.remainingSeconds || 0;
  if (timer.state === 'expired') return 0;

  // For running state: calculate from startTime
  const now = Date.now();
  const startTime = new Date(timer.startTime).getTime();
  const elapsed = Math.floor((now - startTime) / 1000);
  const remaining = timer.duration - elapsed;

  return Math.max(0, remaining);
}

// Update timer display
function updateTimerDisplay(secondsRemaining, state) {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const displayElement = document.getElementById('timerDisplay');
  if (!displayElement) return;

  displayElement.textContent = display;

  // Color coding based on time remaining
  if (state === 'expired') {
    displayElement.style.color = '#ff0000';
    displayElement.style.animation = 'pulse 1s infinite';
  } else if (secondsRemaining <= 10 && state === 'running') {
    displayElement.style.color = '#ff4444'; // Critical red
    displayElement.style.animation = 'none';
  } else if (secondsRemaining <= 60 && state === 'running') {
    displayElement.style.color = '#ffaa00'; // Warning orange
    displayElement.style.animation = 'none';
  } else {
    displayElement.style.color = 'white';
    displayElement.style.animation = 'none';
  }
}

// Update control buttons visibility
function updateTimerControls(state) {
  const durationInput = document.getElementById('timerDurationInput');
  const startBtn = document.getElementById('startTimerBtn');
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const resetBtn = document.getElementById('resetTimerBtn');

  if (!durationInput || !startBtn || !pauseBtn || !resumeBtn || !resetBtn) return;

  durationInput.style.display = state === 'stopped' ? 'inline-block' : 'none';
  startBtn.style.display = state === 'stopped' ? 'inline-block' : 'none';
  pauseBtn.style.display = state === 'running' ? 'inline-block' : 'none';
  resumeBtn.style.display = state === 'paused' ? 'inline-block' : 'none';
  resetBtn.style.display = (state !== 'stopped') ? 'inline-block' : 'none';
}

// Start local countdown ticker (runs every second)
function startLocalCountdown() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (timerState.state !== 'running') {
      clearInterval(timerInterval);
      return;
    }

    const remaining = calculateRemainingSeconds(timerState);

    if (remaining <= 0) {
      // Timer expired
      timerState.state = 'expired';
      clearInterval(timerInterval);
      updateTimerDisplay(0, 'expired');
      updateTimerControls('expired');
      playExpiredAlert();
    } else {
      updateTimerDisplay(remaining, 'running');
    }
  }, 1000);
}

// Visual alert when expired (no popup)
function playExpiredAlert() {
  if (audioAlertPlayed) return;
  audioAlertPlayed = true;

  // Optional: Play system beep (browser-dependent)
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    gainNode.gain.value = 0.3;

    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.2);
  } catch (err) {
    // Ignore audio errors
    console.log('Audio alert not supported');
  }
}

// Sync timer from server (called from loadSessionInfo)
function syncTimer(timer) {
  if (!timer) {
    timer = {
      duration: 0,
      startTime: null,
      pausedAt: null,
      remainingSeconds: null,
      state: 'stopped'
    };
  }

  timerState = timer;
  audioAlertPlayed = timer.state === 'expired'; // Reset alert if coming from other state

  const remaining = calculateRemainingSeconds(timer);
  updateTimerDisplay(remaining, timer.state);
  updateTimerControls(timer.state);

  if (timer.state === 'running') {
    startLocalCountdown();
  } else {
    if (timerInterval) clearInterval(timerInterval);
  }
}

// Setup timer event handlers
function setupTimerHandlers() {
  // Start timer
  const startBtn = document.getElementById('startTimerBtn');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const input = document.getElementById('timerDurationInput');
      const minutes = parseInt(input.value);

      if (!minutes || minutes < 1 || minutes > 120) {
        alert('Please enter duration between 1-120 minutes');
        return;
      }

      const duration = minutes * 60;

      try {
        const res = await fetch(`/api/session/${sessionId}/timer/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duration })
        });

        if (!res.ok) throw new Error('Failed to start timer');

        const result = await res.json();
        syncTimer(result.timer);
      } catch (err) {
        alert('Error starting timer: ' + err.message);
      }
    });
  }

  // Pause timer
  const pauseBtn = document.getElementById('pauseTimerBtn');
  if (pauseBtn) {
    pauseBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/timer/pause`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed to pause timer');

        const result = await res.json();
        syncTimer(result.timer);
      } catch (err) {
        alert('Error pausing timer: ' + err.message);
      }
    });
  }

  // Resume timer
  const resumeBtn = document.getElementById('resumeTimerBtn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/timer/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed to resume timer');

        const result = await res.json();
        syncTimer(result.timer);
      } catch (err) {
        alert('Error resuming timer: ' + err.message);
      }
    });
  }

  // Reset timer
  const resetBtn = document.getElementById('resetTimerBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}/timer/reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed to reset timer');

        const result = await res.json();
        syncTimer(result.timer);
        const input = document.getElementById('timerDurationInput');
        if (input) input.value = '';
      } catch (err) {
        alert('Error resetting timer: ' + err.message);
      }
    });
  }
}

// Initialize - wrap in DOMContentLoaded to ensure forms are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  loadSessionInfo();
  setupCopySessionId();
  setupTimerHandlers();
  setupFormSubmission();
  loadItems();
  setInterval(loadItems, 10000); // auto-refresh every 10 seconds
}
