const express = require('express');
const { ensureAdmin, ensureAuthenticated } = require('../middleware/auth');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { user: req.user || null });
});

router.get('/field-cheatsheet', (req, res) => {
  res.render('field-cheatsheet', { user: req.user || null });
});

router.get('/admin', ensureAdmin, (req, res) => {
  res.render('admin', { user: req.user });
});

router.get('/admin/calendar', ensureAdmin, (req, res) => {
  res.render('admin-calendar', { user: req.user });
});

router.get('/training', ensureAuthenticated, (req, res) => {
  res.render('training', { user: req.user });
});

module.exports = router;
