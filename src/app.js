const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const firebaseAdmin = require('firebase-admin');
const multer = require('multer');
const path = require('path');
const { Storage } = require('@google-cloud/storage');
const bodyParser = require('body-parser');

// Inisialisasi Firebase Admin SDK
firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(path.join(__dirname, 'firebase-key.json')),
});

// Inisialisasi Google Cloud Storage
const storage = new Storage({
  keyFilename: path.join(__dirname, 'gcp-key.json'),
  projectId: process.env.GCP_PROJECT_ID,
});
const bucket = storage.bucket(process.env.GCP_BUCKET_NAME);

// Setup Express.js
const app = express();
app.use(bodyParser.json());

// Inisialisasi Sequelize (sesuaikan dengan database Anda)
const sequelize = new Sequelize('mysql://user:password@localhost:3306/database_name');

// Definisikan Model
const User = sequelize.define('User', {
  userId: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

const HealthHistory = sequelize.define('HealthHistory', {
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  symptoms: {
    type: DataTypes.JSONB,
    allowNull: false,
  },
  diagnosis: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
  },
});

// Setup Multer untuk upload file
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('File harus berupa gambar.'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

// Memastikan koneksi ke database
sequelize.authenticate()
  .then(() => console.log('Connection to the database has been established successfully.'))
  .catch((error) => console.error('Unable to connect to the database:', error));

// API Registrasi Pengguna
app.post('/auth/register', async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  try {
    const userRecord = await firebaseAdmin.auth().createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await User.create({
      userId: userRecord.uid,
      email,
      firstName,
      lastName,
    });

    res.status(200).json({
      success: true,
      message: 'Registration successful',
      data: { userId: userRecord.uid },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Login Pengguna
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const userRecord = await firebaseAdmin.auth().getUserByEmail(email);
    const customToken = await firebaseAdmin.auth().createCustomToken(userRecord.uid);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { userId: userRecord.uid, token: customToken },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Menyimpan Data Pengguna
app.post('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, email } = req.body;

  try {
    await User.update(
      { firstName, lastName, email },
      { where: { userId } }
    );
    res.status(200).json({ success: true, message: 'User data saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const fetch = require('node-fetch');

// API Pendeteksi Kesehatan dengan Gejala
app.post('/health/diagnose', async (req, res) => {
  const { symptoms } = req.body;

  try {
    // URL endpoint model yang sudah dideploy di GCP (misalnya Vertex AI)
    const modelEndpoint = 'https://your-gcp-model-endpoint-url'; // Gantilah dengan URL endpoint model GCP Anda
    
    // Mengirimkan data gejala ke model GCP untuk diagnosis menggunakan fetch
    const response = await fetch(modelEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: symptoms }),  // Kirimkan gejala ke model untuk analisis
    });

    const result = await response.json();

    // Mengambil hasil diagnosis dan confidence dari response model
    const diagnosis = result.diagnosis;  // Misalnya, response dari model berisi diagnosis
    const confidence = result.confidence;  // Misalnya, response dari model berisi tingkat confidence

    // Mengirimkan hasil diagnosis ke klien
    res.status(200).json({
      success: true,
      message: 'Diagnosis successful',
      data: { diagnosis, confidence },
    });

  } catch (error) {
    console.error('Error connecting to model:', error);
    res.status(500).json({
      success: false,
      message: 'Error while connecting to the model',
    });
  }
});

// API Menyimpan Riwayat Kesehatan
app.post('/history', async (req, res) => {
  const { userId, symptoms, diagnosis, timestamp } = req.body;

  try {
    await HealthHistory.create({
      userId,
      symptoms,
      diagnosis,
      timestamp: timestamp || new Date(), // Gunakan tanggal sekarang jika tidak diberikan
    });

    res.status(200).json({ success: true, message: 'Health history saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Mendapatkan Riwayat Kesehatan
app.get('/history/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const history = await HealthHistory.findAll({ 
      where: { userId },
      order: [['timestamp', 'DESC']], // Urutkan berdasarkan tanggal terbaru
    });

    // Formatkan data dengan tanggal yang lebih ramah pengguna
    const formattedHistory = history.map(item => ({
      id: item.id,
      userId: item.userId,
      symptoms: item.symptoms,
      diagnosis: item.diagnosis,
      timestamp: item.timestamp.toLocaleString('en-US', { 
        timeZone: 'Asia/Jakarta', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
    }));

    res.status(200).json({
      success: true,
      message: 'Health history fetched successfully',
      data: formattedHistory,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Mengedit Data Pengguna
app.put('/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { firstName, lastName, email } = req.body;

  try {
    await User.update(
      { firstName, lastName, email },
      { where: { userId } }
    );
    res.status(200).json({ success: true, message: 'User data updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// API Rekomendasi Kesehatan
app.post('/health/recommendation', async (req, res) => {
  const { contents } = req.body;

  res.status(200).json({
    success: true,
    message: 'Health recommendation generated successfully',
    data: { recommendations: contents },
  });
});

// Menjalankan Server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});


