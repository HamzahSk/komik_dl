import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DefaultArtifactClient } from '@actions/artifact';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOWNLOAD_DIR = path.join(__dirname, 'manga_downloads');
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // Batas 50 MB

// Fungsi baru untuk mencari file sampai ke dalam sub-folder (rekursif)
function getAllFilesRecursive(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllFilesRecursive(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

async function splitAndUpload() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    console.log('Folder manga_downloads tidak ditemukan.');
    return;
  }

  // 1. Ambil SEMUA file dari folder dan sub-foldernya
  const allFiles = getAllFilesRecursive(DOWNLOAD_DIR);

  // 2. Filter hanya .cbz dan ambil metadatanya
  const files = allFiles
    .filter(filePath => filePath.endsWith('.cbz'))
    .map(filePath => {
      const stats = fs.statSync(filePath);
      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        mtime: stats.mtimeMs // Timestamp untuk mengurutkan
      };
    });

  if (files.length === 0) {
    console.log('Tidak ada file .cbz untuk di-upload di dalam folder maupun sub-folder.');
    return;
  }

  // 3. Urutkan file berdasarkan waktu (terlama ke terbaru)
  files.sort((a, b) => a.mtime - b.mtime);

  // 4. Bagi file ke dalam batch maksimal 50 MB
  const batches = [];
  let currentBatch = [];
  let currentSize = 0;

  for (const file of files) {
    if (currentBatch.length > 0 && (currentSize + file.size > MAX_SIZE_BYTES)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(file);
    currentSize += file.size;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  console.log(`Total file .cbz ditemukan: ${files.length}`);
  console.log(`Akan di-upload ke dalam ${batches.length} bagian artifact (maksimal 50MB).`);

  // 5. Upload Artifact
  const artifactClient = new DefaultArtifactClient();

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const artifactName = `manga-cbz-part-${i + 1}`;
    // Ambil path lengkap (absolute path) dari masing-masing file
    const filePaths = batch.map(f => f.path);
    const totalMB = (batch.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2);

    console.log(`\nMengunggah ${artifactName} (${batch.length} file, total ${totalMB} MB)...`);

    await artifactClient.uploadArtifact(
      artifactName,
      filePaths,
      DOWNLOAD_DIR, // Root directory agar struktur folder di artifact tetap rapi
      { retentionDays: 7 }
    );

    console.log(`✅ Berhasil mengunggah ${artifactName}`);
  }
}

splitAndUpload().catch(err => {
  console.error('❌ Gagal membagi dan mengunggah artifact:', err);
  process.exit(1);
});
