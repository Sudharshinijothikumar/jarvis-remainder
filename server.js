const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const fileMap = {
  view1: 'view1.json',
  view2: 'view2.json'
};

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'view1.html'));
});

app.post('/api/reminders/:view', (req, res) => {
  const view = req.params.view;
  const file = fileMap[view];
  if (!file) return res.status(400).send('Invalid view');

  let data = [];
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file));
  data.push(req.body);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  res.sendStatus(200);
});

app.delete('/api/reminders/:view/:title', (req, res) => {
  const view = req.params.view;
  const file = fileMap[view];
  if (!file) return res.status(400).send('Invalid view');

  let data = [];
  if (fs.existsSync(file)) data = JSON.parse(fs.readFileSync(file));
  data = data.filter(r => r.title.toLowerCase() !== decodeURIComponent(req.params.title).toLowerCase());
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));