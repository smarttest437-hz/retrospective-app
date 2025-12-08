async function loadItems() {
  const res = await fetch('/feedback');
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
        const res = await fetch(`/vote/${item.id}`, {
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
        loadItems(); // refresh sorted list
      });

      li.appendChild(text);
      li.appendChild(voteBtn);

      if (owned.includes(item.id)) {
        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', () => {
          const input = document.createElement('textarea');
          input.value = item.text;
          input.rows = 3;
          input.style.width = '100%';
          input.style.resize = 'vertical';
          const saveBtn = document.createElement('button');
          saveBtn.textContent = '💾';
          li.innerHTML = '';
          li.appendChild(input);
          li.appendChild(saveBtn);
          saveBtn.addEventListener('click', async () => {
            const newText = input.value.trim();
            if (!newText) return;
            await fetch(`/edit/${item.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newText })
            });
            loadItems();
          });
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '🗑️';
        delBtn.addEventListener('click', async () => {
          if (confirm('Delete this item?')) {
            await fetch(`/feedback/${item.id}`, { method: 'DELETE' });
            loadItems();
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
          fetch(`/move/${itemId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newCategory })
          }).then(() => {
            loadItems(); // Refresh to ensure consistency
          });
        } else {
          // Just reordering within same category
          const newOrder = Array.from(evt.to.children).map(li => Number(li.dataset.id));
          fetch(`/reorder/${newCategory}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ newOrder })
          });
        }
      }
    });
  });

}

document.querySelectorAll('form').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const input = form.querySelector('textarea');
    const text = input.value.trim();
    if (!text) return;
    const category = form.getAttribute('data-category');
    const res = await fetch('/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, text })
    });
    const result = await res.json();
    const owned = JSON.parse(localStorage.getItem('ownedItems') || '[]');
    owned.push(result.id);
    localStorage.setItem('ownedItems', JSON.stringify(owned));
    input.value = '';
    loadItems();
  });
});

document.getElementById('downloadBtn').addEventListener('click', async () => {
  const res = await fetch('/export');
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'retrospective.json';
  link.click();
});

document.getElementById('jiraBtn').addEventListener('click', async () => {
  const res = await fetch('/export/jira');
  const jiraMarkup = await res.text();
  const blob = new Blob([jiraMarkup], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'retrospective-jira.txt';
  link.click();
});

loadItems();
setInterval(loadItems, 10000); // auto-refresh every 10 seconds
