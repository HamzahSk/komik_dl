// config.js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  // Lokasi folder utama untuk menyimpan hasil arsip CBZ manga
  outputFolder: path.join(__dirname, 'manga_downloads'),
  
  // Daftar URL target (Bisa diisi salah satu atau keduanya)
  chapterUrls: [
    "https://vymanga.com/read/senza-replica/3250494"
    // 'https://bbato.com/read/slug/chapter_slug'
  ], 
  mangaUrls: [
    // 'https://vymanga.com/manga/slug-manga'
  ]
};
