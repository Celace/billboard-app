const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const app = express();
const port = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Setup SQLite database
const db = new sqlite3.Database('database.sqlite', (err) => {
  if (err) console.error(err);
  db.run(`CREATE TABLE IF NOT EXISTS ads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billboard TEXT,
        videoPath TEXT,
        paid BOOLEAN DEFAULT 0
    )`);
});

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: './public/uploads/',
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10000000 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Not a video file'), false);
  },
});

// Paystack Secret Key (replace with your own from Paystack dashboard)
const paystackSecretKey = 'sk_test_YOUR_SECRET_KEY';

// Routes
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: 'No file uploaded' });
  res.json({ success: true, filename: req.file.filename });
});

app.post('/verify-payment', async (req, res) => {
  const { reference, billboard, videoPath } = req.body;

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${paystackSecretKey}` },
      }
    );

    if (response.data.status && response.data.data.status === 'success') {
      // Store in database
      db.run(
        'INSERT INTO ads (billboard, videoPath, paid) VALUES (?, ?, ?)',
        [billboard.name, videoPath, 1],
        (err) => {
          if (err) return res.status(500).json({ success: false });
          res.json({ success: true });
        }
      );
    } else {
      res
        .status(400)
        .json({ success: false, message: 'Payment not successful' });
    }
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: 'Payment verification failed' });
  }
});

app.get('/ads', (req, res) => {
  db.all('SELECT * FROM ads WHERE paid = 1', (err, rows) => {
    if (err) return res.status(500).send('Database error');
    res.json(rows);
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
