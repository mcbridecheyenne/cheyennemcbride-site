const express = require('express');
const { ensureAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', { user: req.user || null });
});

router.get('/admin', ensureAdmin, (req, res) => {
  res.render('admin', { user: req.user });
});

module.exports = router;
