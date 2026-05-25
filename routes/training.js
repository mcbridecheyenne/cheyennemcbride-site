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

// ─── Arrow Counter / Session Endpoints ───

// GET /api/training/session?date=YYYY-MM-DD
router.get('/session', ensureAuthenticated, (req, res) => {
  const { date } = req.query;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date' });
  }
  const db = getDb();
  try {
    const row = db.prepare(
      'SELECT arrow_count, notes, finished FROM training_sessions WHERE user_id = ? AND date = ?'
    ).get(req.user.id, date);
    res.json({ date, arrow_count: row ? row.arrow_count : 0, notes: row ? row.notes : '', finished: row ? row.finished === 1 : false });
  } finally {
    db.close();
  }
});

// GET /api/training/sessions/range?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/sessions/range', ensureAuthenticated, (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'Need start and end' });
  const db = getDb();
  try {
    const rows = db.prepare(
      'SELECT date, arrow_count, notes, finished FROM training_sessions WHERE user_id = ? AND date >= ? AND date <= ?'
    ).all(req.user.id, start, end);
    const byDate = {};
    rows.forEach(r => {
      byDate[r.date] = { arrow_count: r.arrow_count, notes: r.notes, finished: r.finished === 1 };
    });
    res.json({ start, end, sessions: byDate });
  } finally {
    db.close();
  }
});

// POST /api/training/session/arrows  { date, arrow_count }
router.post('/session/arrows', ensureAuthenticated, (req, res) => {
  const { date, arrow_count } = req.body;
  if (!date || arrow_count === undefined) {
    return res.status(400).json({ error: 'Missing date or arrow_count' });
  }
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO training_sessions (user_id, date, arrow_count, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, date)
      DO UPDATE SET arrow_count = excluded.arrow_count, updated_at = CURRENT_TIMESTAMP
    `).run(req.user.id, date, Math.max(0, parseInt(arrow_count) || 0));
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// POST /api/training/session/finish  { date, notes }
router.post('/session/finish', ensureAuthenticated, (req, res) => {
  const { date, notes } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO training_sessions (user_id, date, finished, notes, updated_at)
      VALUES (?, ?, 1, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, date)
      DO UPDATE SET finished = 1, notes = COALESCE(excluded.notes, training_sessions.notes), updated_at = CURRENT_TIMESTAMP
    `).run(req.user.id, date, notes || null);
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// POST /api/training/session/reopen  { date }
router.post('/session/reopen', ensureAuthenticated, (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'Missing date' });
  const db = getDb();
  try {
    db.prepare(
      'UPDATE training_sessions SET finished = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND date = ?'
    ).run(req.user.id, date);
    res.json({ ok: true });
  } finally {
    db.close();
  }
});

// GET /api/training/arrow-stats  (all-time arrow stats for the user)
router.get('/arrow-stats', ensureAuthenticated, (req, res) => {
  const db = getDb();
  try {
    const allTime = db.prepare(
      'SELECT COALESCE(SUM(arrow_count), 0) as total, COUNT(*) as sessions FROM training_sessions WHERE user_id = ? AND arrow_count > 0'
    ).get(req.user.id);

    const last28 = db.prepare(
      `SELECT COALESCE(SUM(arrow_count), 0) as total, COUNT(*) as sessions 
       FROM training_sessions WHERE user_id = ? AND arrow_count > 0 AND date >= date('now', '-28 days')`
    ).get(req.user.id);

    const thisWeek = db.prepare(
      `SELECT COALESCE(SUM(arrow_count), 0) as total, COUNT(*) as sessions 
       FROM training_sessions WHERE user_id = ? AND arrow_count > 0 AND date >= date('now', 'weekday 0', '-7 days')`
    ).get(req.user.id);

    const best = db.prepare(
      'SELECT COALESCE(MAX(arrow_count), 0) as max_arrows, date FROM training_sessions WHERE user_id = ? AND arrow_count > 0'
    ).get(req.user.id);

    res.json({
      all_time: { total: allTime.total, sessions: allTime.sessions },
      last_28: { total: last28.total, sessions: last28.sessions, avg: last28.sessions > 0 ? Math.round(last28.total / last28.sessions) : 0 },
      this_week: { total: thisWeek.total, sessions: thisWeek.sessions },
      best_session: { arrows: best.max_arrows, date: best.date }
    });
  } finally {
    db.close();
  }
});

module.exports = router;
