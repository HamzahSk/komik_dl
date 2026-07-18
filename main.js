// main.js
import { config } from './config.js';
import { 
  getChapterList, 
  fetchChapterSoup, 
  getPageList, 
  getChapterName, 
  downloadAndCompressToZip 
} from './scraper.js';

async function processSingleChapter(chapterUrl, imageQuality, outputFormat) {
  console.log(`\n---------------------------------------------------`);
  console.log(`[Scrape Chapter] Membuka URL: ${chapterUrl}`);
  
  const $ = await fetchChapterSoup(chapterUrl);
  if (!$) {
    console.log(`[Batal] Gagal mengambil halaman utama chapter.`);
    return;
  }

  const info = getChapterName($, chapterUrl);
  const pages = getPageList($, chapterUrl);

  if (pages.length === 0) {
    console.log(`[Batal] Halaman gambar tidak ditemukan pada chapter ini.`);
    return;
  }

  console.log(`Manga       : ${info.title}`);
  console.log(`Chapter     : ${info.chapter_name}`);
  console.log(`Total Image : ${pages.length} Halaman`);

  await downloadAndCompressToZip(pages, info.title, info.chapter_name, imageQuality, outputFormat, chapterUrl);
}

async function main() {
  // PENGATURAN KOMPRESI DI SINI
  const imageQuality = 80;     // Kualitas gambar (1-100)
  const outputFormat = 'webp';  // Format target ('jpeg', 'png', 'webp' -> disarankan webp agar ukuran cbz jauh lebih kecil)

  console.log('--- Memulai Proses Scraper & Kompresi Gambar ke CBZ ---');
  console.log(`Pengaturan Aktif -> Format: ${outputFormat}, Kualitas: ${imageQuality}%`);

  const hasChapters = config.chapterUrls && config.chapterUrls.length > 0;
  const hasManga = config.mangaUrls && config.mangaUrls.length > 0;

  if (!hasChapters && !hasManga) {
    console.log('[Peringatan] Tidak ada URL ditemukan di config.js (chapterUrls / mangaUrls kosong).');
    return;
  }

  // 1. PROSES URL CHAPTER LANGSUNG
  if (hasChapters) {
    console.log(`\n[Info] Ditemukan ${config.chapterUrls.length} target Chapter langsung.`);
    for (const chUrl of config.chapterUrls) {
      await processSingleChapter(chUrl, imageQuality, outputFormat);
    }
  }

  // 2. PROSES URL MANGA UTAMA (Mengambil seluruh chapter di dalamnya)
  if (hasManga) {
    console.log(`\n[Info] Ditemukan ${config.mangaUrls.length} target Manga utama.`);
    for (const mangaUrl of config.mangaUrls) {
      console.log(`[Scrape Manga] Mengambil list chapter dari: ${mangaUrl}`);
      const chapters = await getChapterList(mangaUrl);

      if (chapters.length === 0) {
        console.log(`[Batal] Daftar chapter kosong atau gagal discrape.`);
        continue;
      }

      console.log(`[Sukses] Menemukan ${chapters.length} chapter untuk didownload.`);
      for (const ch of chapters) {
        await processSingleChapter(ch.url, imageQuality, outputFormat);
      }
    }
  }

  console.log('\n--- Semua proses scraper telah selesai! ---');
}

main();
