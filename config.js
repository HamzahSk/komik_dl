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
    "https://cgbum.com/baca/high-school-salty-heartcgbum/chapter/1" 
    // 'https://bbato.com/read/slug/chapter_slug'
  ], 
  mangaUrls: [
<<<<<<< HEAD
   // "https://cgbum.com/komik/creating-hidden-endingscgbum"
=======
    "https://cgbum.com/komik/high-school-salty-heartcgbum", "https://cgbum.com/komik/a-lovely-mealcgbum"
>>>>>>> FETCH_HEAD
  ]
};
