const express = require("express");
const fs = require("fs");
const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = "./db.json";

app.use(express.static("."));
app.use(express.json());

function readDB() {
  if (!fs.existsSync(DB_FILE)) return [];
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

app.get("/feedback", (req, res) => {
  res.json(readDB());
});

app.post("/feedback", (req, res) => {
  const { category, text } = req.body;
  const newItem = {
    id: Date.now(),
    category,
    text,
    votes: 0,
    createdAt: new Date().toISOString(),
  };
  const data = readDB();
  data.push(newItem);
  writeDB(data);
  res.json({ success: true, id: newItem.id });
});

app.post("/vote/:id", (req, res) => {
  const id = Number(req.params.id);
  const { action } = req.body;
  const data = readDB();
  const index = data.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  if (action === "up") data[index].votes += 1;
  if (action === "down" && data[index].votes > 0) data[index].votes -= 1;
  writeDB(data);
  res.json({ success: true, votes: data[index].votes });
});

app.post("/edit/:id", (req, res) => {
  const id = Number(req.params.id);
  const { newText } = req.body;
  const data = readDB();
  const index = data.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  data[index].text = newText;
  writeDB(data);
  res.json({ success: true });
});

app.delete("/feedback/:id", (req, res) => {
  const id = Number(req.params.id);
  const data = readDB();
  const newData = data.filter((i) => i.id !== id);
  writeDB(newData);
  res.json({ success: true });
});

app.get("/export", (req, res) => {
  const data = readDB();
  res.json(data);
});

app.get("/export/jira", (req, res) => {
  const data = readDB();

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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

app.post("/move/:id", (req, res) => {
  const id = Number(req.params.id);
  const { newCategory } = req.body;
  const data = readDB();
  const index = data.findIndex((i) => i.id === id);
  if (index === -1) return res.status(404).json({ error: "Not found" });
  data[index].category = newCategory;
  writeDB(data);
  res.json({ success: true });
});

app.post("/reorder/:category", (req, res) => {
  const { category } = req.params;
  const { newOrder } = req.body;
  const data = readDB();

  const unchanged = data.filter((item) => item.category !== category);
  const reordered = newOrder.map((id) => data.find((item) => item.id === id));
  const updated = [...unchanged, ...reordered];
  writeDB(updated);
  res.json({ success: true });
});
