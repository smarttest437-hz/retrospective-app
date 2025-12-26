const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = "./db.json";

app.use(express.json());

function readDB() {
  if (!fs.existsSync(DB_FILE)) return { sessions: {} };
  const data = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  // Migrate old format to new format if needed
  if (Array.isArray(data)) {
    return { sessions: {} };
  }
  return data;
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 8);
}

// Admin code from environment variable (default: admin437)
const ADMIN_CODE = process.env.ADMIN_CODE || "admin437";

// Session management routes

// Verify admin code
app.post("/api/admin/verify", (req, res) => {
  const { code } = req.body;
  if (code === ADMIN_CODE) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: "Invalid admin code" });
  }
});

// Get all sessions (requires admin code)
app.post("/api/sessions", (req, res) => {
  const { adminCode } = req.body;

  if (adminCode !== ADMIN_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = readDB();
  const sessions = Object.values(db.sessions || {}).map(session => ({
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    itemCount: (session.items || []).length
  }));
  // Sort by creation date, newest first
  sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(sessions);
});

// Delete a session (requires admin code)
app.delete("/api/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const adminCode = req.headers['x-admin-code'];

  if (adminCode !== ADMIN_CODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = readDB();
  if (!db.sessions[sessionId]) {
    return res.status(404).json({ error: "Session not found" });
  }
  delete db.sessions[sessionId];
  writeDB(db);
  res.json({ success: true });
});

app.post("/api/session/create", (req, res) => {
  const { name } = req.body;
  const sessionId = generateSessionId();
  const db = readDB();
  db.sessions[sessionId] = {
    id: sessionId,
    name: name || `Retrospective ${sessionId}`,
    createdAt: new Date().toISOString(),
    items: [],
    timer: {
      duration: 0,
      startTime: null,
      pausedAt: null,
      remainingSeconds: null,
      state: 'stopped'
    }
  };
  writeDB(db);
  res.json({ success: true, sessionId });
});

app.get("/api/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session);
});

// Get all feedback for a session
app.get("/api/session/:sessionId/feedback", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  res.json(session.items || []);
});

// Add feedback to a session
app.post("/api/session/:sessionId/feedback", (req, res) => {
  const { sessionId } = req.params;
  const { category, text } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }
  const newItem = {
    id: Date.now(),
    category,
    text,
    votes: 0,
    createdAt: new Date().toISOString(),
  };
  session.items.push(newItem);
  writeDB(db);
  res.json({ success: true, id: newItem.id });
});

// Vote on an item in a session
app.post("/api/session/:sessionId/vote/:id", (req, res) => {
  const { sessionId } = req.params;
  const id = Number(req.params.id);
  const { action } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  const index = session.items.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  if (action === "up") session.items[index].votes += 1;
  if (action === "down" && session.items[index].votes > 0) session.items[index].votes -= 1;
  writeDB(db);
  res.json({ success: true, votes: session.items[index].votes });
});

// Edit an item in a session
app.post("/api/session/:sessionId/edit/:id", (req, res) => {
  const { sessionId } = req.params;
  const id = Number(req.params.id);
  const { newText } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  const index = session.items.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  session.items[index].text = newText;
  writeDB(db);
  res.json({ success: true });
});

// Delete an item from a session
app.delete("/api/session/:sessionId/feedback/:id", (req, res) => {
  const { sessionId } = req.params;
  const id = Number(req.params.id);
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  session.items = session.items.filter((i) => i.id !== id);
  writeDB(db);
  res.json({ success: true });
});

// Export session data
app.get("/api/session/:sessionId/export", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session.items || []);
});

// Export session to JIRA markup
app.get("/api/session/:sessionId/export/jira", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  const data = session.items || [];

  const grouped = {
    'went-well': [],
    'didnt-go-well': [],
    'ideas': [],
    'action-items': []
  };

  data.forEach(item => {
    if (grouped[item.category]) {
      grouped[item.category].push(item);
    }
  });

  let jiraMarkup = "h1. Sprint Retrospective\n\n";

  // Create three-column table with bullet lists in each cell
  jiraMarkup += "||Went Well||Didn't Go Well||Ideas||\n";

  // Build bullet lists for each column
  const wentWellList = grouped['went-well'].map(item => `* ${item.text}`).join('\n');
  const didntGoWellList = grouped['didnt-go-well'].map(item => `* ${item.text}`).join('\n');
  const ideasList = grouped['ideas'].map(item => `* ${item.text}`).join('\n');

  // Create single row with all items as bullets in each cell
  jiraMarkup += `|${wentWellList || ' '}|${didntGoWellList || ' '}|${ideasList || ' '}|\n`;

  // Add action items as bullet list below the table
  if (grouped['action-items'].length > 0) {
    jiraMarkup += "\nh2. Action Items\n\n";
    grouped['action-items'].forEach(item => {
      jiraMarkup += `* ${item.text}\n`;
    });
  }

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', 'attachment; filename="retrospective-jira.txt"');
  res.send(jiraMarkup);
});

// Move item to different category in a session
app.post("/api/session/:sessionId/move/:id", (req, res) => {
  const { sessionId } = req.params;
  const id = Number(req.params.id);
  const { newCategory } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });
  const index = session.items.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  session.items[index].category = newCategory;
  writeDB(db);
  res.json({ success: true });
});

// Reorder items within a category in a session
app.post("/api/session/:sessionId/reorder/:category", (req, res) => {
  const { sessionId, category } = req.params;
  const { newOrder } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  const unchanged = session.items.filter((item) => item.category !== category);
  const reordered = newOrder.map((id) => session.items.find((item) => item.id === id));
  session.items = [...unchanged, ...reordered];
  writeDB(db);
  res.json({ success: true });
});

// Timer endpoints

// Start timer
app.post("/api/session/:sessionId/timer/start", (req, res) => {
  const { sessionId } = req.params;
  const { duration } = req.body;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  // Validate duration (1 second to 2 hours)
  if (!duration || duration < 1 || duration > 7200) {
    return res.status(400).json({ error: "Duration must be between 1 and 7200 seconds" });
  }

  session.timer = {
    duration: duration,
    startTime: new Date().toISOString(),
    pausedAt: null,
    remainingSeconds: null,
    state: 'running'
  };

  writeDB(db);
  res.json({ success: true, timer: session.timer });
});

// Pause timer
app.post("/api/session/:sessionId/timer/pause", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  const timer = session.timer;
  if (!timer || timer.state !== 'running') {
    return res.status(400).json({ error: "Timer is not running" });
  }

  // Calculate remaining seconds
  const now = Date.now();
  const startTime = new Date(timer.startTime).getTime();
  const elapsed = Math.floor((now - startTime) / 1000);
  const remaining = Math.max(0, timer.duration - elapsed);

  // If already expired, set state to expired instead
  if (remaining <= 0) {
    timer.state = 'expired';
    timer.remainingSeconds = 0;
  } else {
    timer.state = 'paused';
    timer.remainingSeconds = remaining;
  }

  timer.pausedAt = new Date().toISOString();

  writeDB(db);
  res.json({ success: true, timer: session.timer });
});

// Resume timer
app.post("/api/session/:sessionId/timer/resume", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  const timer = session.timer;
  if (!timer || timer.state !== 'paused') {
    return res.status(400).json({ error: "Timer is not paused" });
  }

  // Use remaining seconds as new duration
  timer.duration = timer.remainingSeconds;
  timer.startTime = new Date().toISOString();
  timer.pausedAt = null;
  timer.remainingSeconds = null;
  timer.state = 'running';

  writeDB(db);
  res.json({ success: true, timer: session.timer });
});

// Reset timer
app.post("/api/session/:sessionId/timer/reset", (req, res) => {
  const { sessionId } = req.params;
  const db = readDB();
  const session = db.sessions[sessionId];
  if (!session) return res.status(404).json({ error: "Session not found" });

  session.timer = {
    duration: 0,
    startTime: null,
    pausedAt: null,
    remainingSeconds: null,
    state: 'stopped'
  };

  writeDB(db);
  res.json({ success: true, timer: session.timer });
});

// Serve board.html for session URLs
app.get("/session/:sessionId", (req, res) => {
  res.sendFile(path.join(__dirname, "board.html"));
});

// Serve static files
app.use(express.static("."));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
