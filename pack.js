// pack.js
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

async function packageCBZs() {
  const inputDir = 'manga_downloads';
  const outputDir = 'split_packages';
  const MAX_SIZE = 48 * 1024 * 1024; // Batas aman 48 MB per file ZIP

  if (!fs.existsSync(inputDir)) {
    console.log('[Packer] Folder manga_downloads tidak ditemukan.');
    return;
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. Ambil daftar folder manga (Setiap manga punya folder sendiri)
  const mangaFolders = fs.readdirSync(inputDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  if (mangaFolders.length === 0) {
    console.log('[Packer] Tidak ada folder manga yang ditemukan.');
    return;
  }

  console.log(`\n--- Memulai Pengelompokan CBZ ke File ZIP (< 50MB) ---`);
  console.log(`Ditemukan ${mangaFolders.length} judul manga.`);

  // 2. Proses SETIAP MANGA secara terpisah agar tidak bercampur
  for (const mangaTitle of mangaFolders) {
    const mangaPath = path.join(inputDir, mangaTitle);
    
    // Ambil file .cbz dan urutkan secara natural (Chapter 1 -> Chapter 2 -> Chapter 10)
    const files = fs.readdirSync(mangaPath)
      .filter(file => file.endsWith('.cbz'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
      .map(file => {
        const fullPath = path.join(mangaPath, file);
        const stat = fs.statSync(fullPath);
        return { fullPath, name: file, size: stat.size };
      });

    if (files.length === 0) continue;

    console.log(`\n[Manga] Memproses: ${mangaTitle} (${files.length} chapter)`);

    let pkgIndex = 1;
    let currentGroup = [];
    let currentSize = 0;

    // 3. Bungkus per <= 48MB untuk Masing-Masing Manga
    for (const file of files) {
      if (currentGroup.length > 0 && (currentSize + file.size) > MAX_SIZE) {
        const zipName = `${mangaTitle}_Part_${pkgIndex}.zip`;
        await createZipPackage(currentGroup, path.join(outputDir, zipName));
        console.log(`  -> Berhasil dibuat: ${zipName} (${(currentSize / (1024 * 1024)).toFixed(2)} MB - ${currentGroup.length} chapter)`);
        pkgIndex++;
        currentGroup = [];
        currentSize = 0;
      }
      currentGroup.push(file);
      currentSize += file.size;
    }

    // Simpan sisa chapter terakhir untuk manga ini
    if (currentGroup.length > 0) {
      const zipName = `${mangaTitle}_Part_${pkgIndex}.zip`;
      await createZipPackage(currentGroup, path.join(outputDir, zipName));
      console.log(`  -> Berhasil dibuat: ${zipName} (${(currentSize / (1024 * 1024)).toFixed(2)} MB - ${currentGroup.length} chapter)`);
    }
  }

  console.log('\n--- Pembungkusan Selesai! ---');
}

function createZipPackage(files, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { store: true }); // store: true agar cepat (karena CBZ sudah terkompresi)

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const f of files) {
      archive.file(f.fullPath, { name: f.name });
    }

    archive.finalize();
  });
}

packageCBZs();
