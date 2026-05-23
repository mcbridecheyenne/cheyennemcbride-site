const express = require('express');
const passport = require('passport');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { getDb } = require('../db/init');
const router = express.Router();

// ─── Login Page ───
router.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  const error = req.query.error || null;
  res.render('login', { user: null, error });
});

// ─── Register Page ───
router.get('/register', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/');
  res.render('register', { user: null, error: null });
});

// ─── Register POST ───
router.post('/register', async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

  if (!name || !email || !password) {
    return res.render('register', { user: null, error: 'All fields are required.' });
  }

  if (password.length < 8) {
    return res.render('register', { user: null, error: 'Password must be at least 8 characters.' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { user: null, error: 'Passwords do not match.' });
  }

  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      db.close();
      return res.render('register', { user: null, error: 'An account with that email already exists.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const adminEmail = 'mcbridecheyenne@gmail.com';
    const role = email.toLowerCase() === adminEmail ? 'admin' : 'user';

    const result = db.prepare(
      'INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), hash, name, role);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    db.close();

    req.login(user, (err) => {
      if (err) return res.render('register', { user: null, error: 'Registration succeeded but login failed.' });
      res.redirect('/');
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { user: null, error: 'Something went wrong. Please try again.' });
  }
});

// ─── Local Login POST ───
router.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) {
      return res.render('login', { user: null, error: info?.message || 'Invalid credentials.' });
    }
    req.login(user, (err) => {
      if (err) return next(err);
      res.redirect('/');
    });
  })(req, res, next);
});

// ─── Google OAuth ───
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login?error=google-failed' }),
  (req, res) => {
    res.redirect('/');
  }
);

// ─── Forgot Password ───
router.get('/forgot-password', (req, res) => {
  res.render('forgot-password', { user: null, error: null, success: null });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.toLowerCase());

    if (!user || !user.password_hash) {
      // Don't reveal whether user exists
      db.close();
      return res.render('forgot-password', {
        user: null, error: null,
        success: 'If an account with that email exists, a reset link has been sent.'
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour

    db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, expiresAt);
    db.close();

    // Send email via Resend
    const baseUrl = process.env.BASE_URL || 'https://cheyennemcbride.com';
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;

    try {
      const { Resend } = require('resend');
      if (process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'your-resend-api-key') {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'noreply@cheyennemcbride.com',
          to: user.email,
          subject: 'Password Reset - cheyennemcbride.com',
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <h2>Password Reset</h2>
              <p>You requested a password reset. Click the link below to set a new password:</p>
              <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#5c6b4f;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
              <p style="color:#888;font-size:13px;">This link expires in 1 hour. If you didn't request this, ignore this email.</p>
            </div>
          `
        });
      } else {
        console.log('[Password Reset] Email would be sent to:', user.email);
        console.log('[Password Reset] Reset URL:', resetUrl);
      }
    } catch (emailErr) {
      console.error('Error sending reset email:', emailErr);
    }

    res.render('forgot-password', {
      user: null, error: null,
      success: 'If an account with that email exists, a reset link has been sent.'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('forgot-password', { user: null, error: 'Something went wrong.', success: null });
  }
});

// ─── Reset Password ───
router.get('/reset-password', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/auth/forgot-password');
  res.render('reset-password', { user: null, token, error: null, success: null });
});

router.post('/reset-password', async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token) return res.redirect('/auth/forgot-password');

  if (!password || password.length < 8) {
    return res.render('reset-password', { user: null, token, error: 'Password must be at least 8 characters.', success: null });
  }

  if (password !== confirmPassword) {
    return res.render('reset-password', { user: null, token, error: 'Passwords do not match.', success: null });
  }

  try {
    const db = getDb();
    const reset = db.prepare(
      'SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime(\'now\')'
    ).get(token);

    if (!reset) {
      db.close();
      return res.render('reset-password', { user: null, token, error: 'Invalid or expired reset link.', success: null });
    }

    const hash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(hash, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(reset.id);
    db.close();

    res.render('reset-password', { user: null, token: null, error: null, success: 'Password reset successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.render('reset-password', { user: null, token, error: 'Something went wrong.', success: null });
  }
});

// ─── Logout ───
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) console.error('Logout error:', err);
    res.redirect('/');
  });
});

module.exports = router;
