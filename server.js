require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const { initDatabase, getDb } = require('./db/init');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
const db = initDatabase();
db.close();

// ─── View Engine ───
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ───
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ─── Sessions ───
const dataDir = path.join(__dirname, 'data');
app.use(session({
  store: new SQLiteStore({
    dir: dataDir,
    db: 'sessions.db'
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// ─── Passport ───
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    db.close();
    done(null, user || null);
  } catch (err) {
    done(err, null);
  }
});

// ─── Local Strategy ───
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
      db.close();

      if (!user) return done(null, false, { message: 'Invalid email or password.' });
      if (!user.password_hash) return done(null, false, { message: 'This account uses Google sign-in. Please use the Google button.' });

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) return done(null, false, { message: 'Invalid email or password.' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

// ─── Google Strategy ───
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: (process.env.BASE_URL || 'https://cheyennemcbride.com') + '/auth/google/callback'
  }, (accessToken, refreshToken, profile, done) => {
    try {
      const db = getDb();
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const googleId = profile.id;
      const name = profile.displayName;
      const avatar = profile.photos?.[0]?.value;

      if (!email) {
        db.close();
        return done(null, false, { message: 'No email returned from Google.' });
      }

      let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

      if (!user) {
        // Check if email exists (local account)
        user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (user) {
          // Link Google to existing account
          db.prepare('UPDATE users SET google_id = ?, avatar_url = ?, name = COALESCE(name, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(googleId, avatar, name, user.id);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        } else {
          // New user
          const adminEmail = 'mcbridecheyenne@gmail.com';
          const role = email === adminEmail ? 'admin' : 'user';
          const result = db.prepare(
            'INSERT INTO users (email, name, avatar_url, google_id, role) VALUES (?, ?, ?, ?, ?)'
          ).run(email, name, avatar, googleId, role);
          user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
        }
      } else {
        // Update avatar/name on each login
        db.prepare('UPDATE users SET avatar_url = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(avatar, name, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }

      db.close();
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));
} else {
  console.warn('[Auth] Google OAuth not configured — GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing.');
}

// ─── Routes ───
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const trainingRoutes = require('./routes/training');

app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/training', trainingRoutes);

// ─── 404 ───
app.use((req, res) => {
  res.status(404).render('index', { user: req.user || null });
});

// ─── Error Handler ───
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack || err);
  res.status(500).send('Internal Server Error');
});

// ─── Start ───
app.listen(PORT, () => {
  console.log(`[cheyennemcbride.com] Running on port ${PORT}`);
});
