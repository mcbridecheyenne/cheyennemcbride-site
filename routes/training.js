const express = require('express');
const { ensureAuthenticated } = require('../middleware/auth');
const { getDb } = require('../db/init');
const router = express.Router();

// GET /api/training/checks?date=YYYY-MM-DD
router.get('/checks', ensureAuthenticated, (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT task_index, checked FROM training_checks WHERE user_id = ? AND date = ?'
    ).all(req.user.id, date);
    const checks = {};
    rows.forEach(r => { checks[r.task_index] = r.checked === 1; });
    res.json({ date, checks });
  } finally {
    db.close();
  }
});

// GET /api/training/checks/range?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/checks/range', ensureAuthenticated, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Need start and end' });
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT date, task_index, checked FROM training_checks WHERE user_id = ? AND date >= ? AND date <= ?'
    ).all(req.user.id, start, end);
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.task_index] = r.checked === 1;
    });
    res.json({ start, end, days: byDate });
  } finally {
    db.close();
  }
});

// POST /api/training/check  { date, taskIndex, checked }
router.post('/check', ensureAuthenticated, (req, res) => {
  const { date, taskIndex, checked } = req.body;
  if (!date || taskIndex === undefined) {
    return res.status(400).json({ error: 'Missing date or taskIndex' });
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO training_checks (user_id, date, task_index, checked, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, date, task_index)
      DO UPDATE SET checked = excluded.checked, updated_at = CURRENT_TIMESTAMP
    `).run(req.user.id, date, taskIndex, checked ? 1 : 0);
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

module.exports = router;
