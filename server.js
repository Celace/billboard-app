const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const axios = require('axios');
const nodemailer = require('nodemailer');
require('dotenv').config();

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
  limits: { fileSize: 10000000 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) cb(null, true);
    else cb(new Error('Not a video file'), false);
  },
});

// Paystack Secret Key from .env
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

// Email setup with nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Routes
app.get('/paystack-key', (req, res) => {
  res.json({ publicKey: process.env.PAYSTACK_PUBLIC_KEY });
});

app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file)
    return res
      .status(400)
      .json({ success: false, message: 'No file uploaded' });
  res.json({ success: true, filename: req.file.filename });
});

app.post('/verify-payment', async (req, res) => {
  const { reference, billboard, videoPath, email, amount } = req.body; // Add amount here
  console.log('Received /verify-payment request:', {
    reference,
    billboard,
    videoPath,
    email,
    amount,
  });

  try {
    console.log('Verifying with Paystack...');
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${paystackSecretKey}` },
      }
    );
    console.log('Paystack response:', response.data);

    if (response.data.status && response.data.data.status === 'success') {
      console.log('Payment successful, inserting into DB...');
      db.run(
        'INSERT INTO ads (billboard, videoPath, paid) VALUES (?, ?, ?)',
        [billboard.name, videoPath, 1],
        async (err) => {
          if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ success: false });
          }

          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Payment Confirmation - Billboard Ads',
            html: `
                          <h2>Payment Successful!</h2>
                          <p>Thank you for your payment. Your advertisement is now live.</p>
                          <p><strong>Details:</strong></p>
                          <ul>
                              <li><strong>Billboard Location:</strong> ${
                                billboard.name
                              }</li>
                              <li><strong>Amount:</strong> ${(
                                amount / 100
                              ).toFixed(2)} GHS</li>
                              <li><strong>Transaction Reference:</strong> ${reference}</li>
                              <li><strong>Video File:</strong> ${videoPath}</li>
                          </ul>
                          <p>Contact us if you have any questions!</p>
                      `,
          };

          try {
            console.log('Sending email to:', email);
            await transporter.sendMail(mailOptions);
            console.log(`Email sent to ${email}`);
            res.json({ success: true });
          } catch (emailError) {
            console.error('Email error:', emailError);
            res.json({ success: true });
          }
        }
      );
    } else {
      console.log('Payment not successful');
      res
        .status(400)
        .json({ success: false, message: 'Payment not successful' });
    }
  } catch (error) {
    console.error('Verification error:', error.message);
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
