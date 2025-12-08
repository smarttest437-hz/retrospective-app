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

// Session management routes
app.post("/api/session/create", (req, res) => {
  const { name } = req.body;
  const sessionId = generateSessionId();
  const db = readDB();
  db.sessions[sessionId] = {
    id: sessionId,
    name: name || `Retrospective ${sessionId}`,
    createdAt: new Date().toISOString(),
    items: []
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

// Serve board.html for session URLs
app.get("/session/:sessionId", (req, res) => {
  res.sendFile(path.join(__dirname, "board.html"));
});

// Serve static files
app.use(express.static("."));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
