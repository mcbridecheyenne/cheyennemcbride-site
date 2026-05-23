const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const { getDb } = require('../db/init');
const router = express.Router();

// Get all events (public)
router.get('/', (req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events ORDER BY date ASC').all();
  db.close();
  res.json(events);
});

// Create event (admin only)
router.post('/', ensureAdmin, (req, res) => {
  const { title, date, end_date, location, description, event_type } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO events (title, date, end_date, location, description, event_type) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(title, date, end_date || null, location || null, description || null, event_type || 'tournament');
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid);
  db.close();
  res.json(event);
});

// Update event (admin only)
router.put('/:id', ensureAdmin, (req, res) => {
  const { title, date, end_date, location, description, event_type } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'Title and date are required.' });
  }
  const db = getDb();
  db.prepare(
    'UPDATE events SET title = ?, date = ?, end_date = ?, location = ?, description = ?, event_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(title, date, end_date || null, location || null, description || null, event_type || 'tournament', req.params.id);
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  db.close();
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  res.json(event);
});

// Delete event (admin only)
router.delete('/:id', ensureAdmin, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  db.close();
  if (result.changes === 0) return res.status(404).json({ error: 'Event not found.' });
  res.json({ success: true });
});

module.exports = router;
