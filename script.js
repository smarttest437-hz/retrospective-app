let isEditing = false; // Track if user is editing

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

// Initialize - wrap in DOMContentLoaded to ensure forms are loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  loadSessionInfo();
  setupCopySessionId();
  setupFormSubmission();
  loadItems();
  setInterval(loadItems, 10000); // auto-refresh every 10 seconds
}
