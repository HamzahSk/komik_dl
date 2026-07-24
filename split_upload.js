import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DefaultArtifactClient } from '@actions/artifact';

// Membuat ulang __dirname karena tidak ada secara bawaan di ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_DIR = path.join(__dirname, 'manga_downloads');
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // Batas maksimal 50 MB per artifact

async function splitAndUpload() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.log('Folder manga_downloads tidak ditemukan.');
    return;
  }

  // 1. Ambil semua file .cbz beserta metadatanya
  const files = fs.readdirSync(DOWNLOAD_DIR)
    .filter(file => file.endsWith('.cbz'))
    .map(file => {
      const filePath = path.join(DOWNLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        path: filePath,
        size: stats.size,
        mtime: stats.mtimeMs // Timestamp waktu pembuatan/modifikasi file
      };
    });

  if (files.length === 0) {
    console.log('Tidak ada file .cbz untuk di-upload.');
    return;
  }

  // 2. Urutkan file berdasarkan waktu pembuatan (terlama ke terbaru)
  files.sort((a, b) => a.mtime - b.mtime);

  // 3. Bagi file ke dalam kelompok (batch) maksimal 50 MB
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const file of files) {
    // Jika batch saat ini tidak kosong DAN menambah file ini melebihi 50 MB, buat batch baru
    if (currentBatch.length > 0 && (currentSize + file.size > MAX_SIZE_BYTES)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(file);
    currentSize += file.size;
  }

  // Masukkan sisa file ke batch terakhir
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`Total file .cbz: ${files.length}`);
  console.log(`Akan di-upload ke dalam ${batches.length} bagian artifact (maksimal 50MB per zip).`);

  // 4. Upload setiap kelompok sebagai artifact terpisah
  const artifactClient = new DefaultArtifactClient();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const artifactName = `manga-cbz-part-${i + 1}`;
    const filePaths = batch.map(f => f.path);
    const totalMB = (batch.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2);

    console.log(`Mengunggah ${artifactName} (${batch.length} file, total ${totalMB} MB)...`);

    await artifactClient.uploadArtifact(
      artifactName,
      filePaths,
      DOWNLOAD_DIR,
      { retentionDays: 7 }
    );

    console.log(`✅ Berhasil mengunggah ${artifactName}`);
  }
}

splitAndUpload().catch(err => {
  console.error('❌ Gagal membagi dan mengunggah artifact:', err);
  process.exit(1);
});
