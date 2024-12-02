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
// Fungsi untuk memproses gejala menjadi array 1 dan 0
function preprocessSymptoms(symptoms, allFeatures) {
  return allFeatures.map((feature) => (symptoms.includes(feature) ? 1 : 0));
}

app.post('/health/diagnose', async (req, res) => {
  const { symptoms } = req.body;

  try {

    // Daftar semua gejala (urutan harus sesuai model Anda)
    const allFeatures = [
      'gatal', 'ruam kulit', 'erupsi kulit nodal', 'bersin terus menerus', 'menggigil', 'kedinginan', 'nyeri sendi', 'nyeri perut', 'asam lambung', 'luka di lidah', 'penyusutan otot', 'muntah', 'sensasi terbakar saat buang air kecil', 'bercak saat buang air kecil', 'kelelahan', 'penambahan berat badan', 'kecemasan', 'tangan dan kaki dingin', 'perubahan mood', 'penurunan berat badan', 'gelisah', 'lesu', 'bercak di tenggorokan', 'gula darah tidak teratur', 'batuk', 'demam tinggi', 'mata cekung', 'sesak napas', 'berkeringat', 'dehidrasi', 'gangguan pencernaan', 'sakit kepala', 'kulit kekuningan', 'urine gelap', 'mual', 'hilang nafsu makan', 'nyeri di belakang mata', 'sakit punggung', 'sembelit', 'sakit perut', 'diare', 'demam ringan', 'urine kuning', 'mata kuning', 'gagal hati akut', 'pembengkakan perut', 'kelenjar getah bening bengkak', 'kelelahan', 'penglihatan buram', 'dahak', 'iritasi tenggorokan', 'mata merah', 'tekanan sinus', 'pilek', 'hidung tersumbat', 'nyeri dada', 'kelemahan di anggota tubuh', 'detak jantung cepat', 'nyeri saat buang air besar', 'nyeri di area anus', 'tinja berdarah', 'iritasi di anus', 'nyeri leher', 'pusing', 'kram', 'memar', 'obesitas', 'kaki bengkak', 'pembuluh darah bengkak', 'wajah dan mata bengkak', 'tiroid membesar', 'kuku rapuh', 'pembengkakan ekstremitas', 'rasa lapar berlebihan', 'kontak di luar nikah', 'bibir kering dan bertingling', 'bicara cadel', 'nyeri lutut', 'nyeri sendi pinggul', 'kelemahan otot', 'leher kaku', 'sendi bengkak', 'kekakuan pergerakan', 'gerakan berputar', 'kehilangan keseimbangan', 'ketidakstabilan', 'kelemahan satu sisi tubuh', 'hilang indra penciuman', 'ketidaknyamanan kandung kemih', 'bau urine menyengat', 'rasa ingin buang air kecil terus', 'gas keluar', 'gatal dalam', 'penampilan toksik', 'depresi', 'iritabilitas', 'nyeri otot', 'altered sensorium', 'bintik merah di tubuh', 'nyeri perut', 'menstruasi tidak normal', 'bercak dischromic', 'mata berair', 'nafsu makan meningkat', 'poliuria', 'riwayat keluarga', 'dahak lendir', 'dahak berkarat', 'kurang konsentrasi', 'gangguan penglihatan', 'menerima transfusi darah', 'menerima suntikan tidak steril', 'koma', 'pendarahan lambung', 'pembesaran perut', 'riwayat konsumsi alkohol', 'kelebihan cairan', 'darah di dahak', 'vena menonjol di betis', 'palpitasi', 'nyeri saat berjalan', 'jerawat bernanah', 'komedo', 'bekas luka', 'kulit mengelupas', 'debu seperti perak', 'lekukan kecil di kuku', 'kuku meradang', 'lepuh', 'luka merah di hidung', 'kerak kuning mengalir', 'diagnosa'
    ];

    // Proses gejala menjadi array 1 dan 0
    const processedSymptoms = preprocessSymptoms(symptoms, allFeatures);

    // URL endpoint model yang sudah dideploy di GCP (misalnya Vertex AI)
    const modelEndpoint = 'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/capstone-project-442701/locations/us-central1/endpoints/7712564994964979712:predict'; // Gantilah dengan URL endpoint model GCP Anda
    
    // Mengirimkan data gejala ke model GCP untuk diagnosis menggunakan fetch
    const response = await fetch(modelEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: processedSymptoms }),  // Kirimkan gejala ke model untuk analisis
    });

    const result = await response.json();

    // Nama kelas penyakit, urutannya harus sesuai dengan urutan output model
    const diseaseClasses = [
      'AIDS', 'Alergi', 'Artritis', 'Asma Bronkial', 'Cacar Air', 'Cholestasis Kronis', 'Dengue', 'Diabetes ' 'Flu Biasa', 'Gastroenteritis', 'Hepatitis A', 'Hepatitis Alkoholik', 'Hepatitis B', 'Hepatitis C', 'Hepatitis D', 'Hepatitis E', 'Hipertiroidisme', 'Hipoglikemia', 'Hipotiroidisme', 'Hypertension ', 'Impetigo', 'Infeksi Jamur', 'Infeksi Saluran Kemih', 'Jerawat', 'Malaria', 'Migrain', 'Osteoartritis', 'Paralisia (perdarahan otak)', 'Penyakit Kuning', 'Penyakit Refluks Gastroesofagus (GERD)', 'Penyakit Tukak Lambung', 'Pneumonia', 'Psoriasis', 'Reaksi Obat', 'Serangan Jantung', 'Spondilosis Servikal', 'Tifus', 'Tuberkulosis', 'Varises', 'Vertigo', 'Wasir Dimorfik'
    ];
    // Mengambil probabilitas dan kelas tertinggi
    const probabilities = result.probabilities; // Array probabilitas dari model
    const highestIndex = probabilities.indexOf(Math.max(...probabilities)); // Indeks prediksi tertinggi
    const diagnosis = diseaseClasses[highestIndex]; // Nama penyakit berdasarkan indeks

    // Menggabungkan nama penyakit dan probabilitas dalam array
    const detailedProbabilities = diseaseClasses.map((disease, index) => ({
      disease,
      probability: probabilities[index]
    }));

    // Mengirimkan hasil diagnosis ke klien
    res.status(200).json({
      success: true,
      message: 'Diagnosis successful',
      data: { diagnosis, confidence: probabilities[highestIndex] },
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
  const { symptoms } = req.body;

  // Format kustom untuk teks gejala
    const symptomsText = `Saya mengalami (${symptoms.slice(0, -1).join(', ')}, dan ${symptoms[symptoms.length - 1]}). Apa rekomendasi kesehatan agar saya cepat pulih?`;

    // Membuat body request sesuai format Vertex AI
    const requestBody = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: symptomsText
            }
          ]
        }
      ]
    };

  // Mengirimkan request ke Vertex AI endpoint
  const vertexEndpoint = 'https://us-central1-aiplatform.googleapis.com/v1beta1/projects/capstone-project-442701/locations/us-central1/endpoints/5435573170864128000:predict'; // Gantilah dengan URL endpoint model GCP Anda; // Gantilah dengan endpoint model Anda
  const response = await fetch(vertexEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
  const result = await response.json();

    // Mengambil rekomendasi kesehatan dari respons model
  const recommendation = result.contents[0].parts[0].text;

  res.status(200).json({
    success: true,
    message: 'Health recommendation generated successfully',
    data: { recommendation },
  });
});

// Menjalankan Server
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});


