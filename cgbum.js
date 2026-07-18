import * as cheerio from 'cheerio';

const BASE_URL = 'https://cgbum.com';

/**
 * Mengambil data pembaruan terbaru berdasarkan halaman.
 * @param {number} page - Halaman yang ingin diambil.
 */
async function getLatest(page = 1) {
  try {
    const url = `${BASE_URL}/last-update?page=${page}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    
    // Inisialisasi Cheerio
    const $ = cheerio.load(html);
    const results = [];

    // Melakukan iterasi pada setiap card komik
    $('.comic-grid .comic-card').each((i, el) => {
      const element = $(el);
      
      results.push({
        title: element.find('.comic-card-title a').text().trim(),
        url: element.find('.comic-card-title a').attr('href'),
        image: element.find('.comic-card-cover img').attr('src'),
        latest_chapter: {
          title: element.find('.comic-card-chapter a').text().trim(),
          url: element.find('.comic-card-chapter a').attr('href'),
          time: element.find('.ch-time').text().trim()
        },
        status: element.find('.badge-status').text().trim(),
        type: element.find('.badge-type-text').text().trim(),
        is_adult: element.attr('data-adult') === '1' // Mengambil status 18+
      });
    });

    return results;
  } catch (error) {
    console.error('Gagal mengambil data:', error.message);
    throw error;
  }
}


async function filterKomik(type = '', status = '', genres = []) {
  try {
    // Membangun query string secara manual agar sesuai dengan format array (%5B%5D)
    let url = `${BASE_URL}/daftar-komik?type=${type}&status=${status}`;
    genres.forEach(genre => {
      url += `&genres%5B%5D=${genre}`;
    });

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

    const html = await response.text();
    const $ = cheerio.load(html);
    const results = [];

    // Menggunakan selektor yang sama dengan fungsi getLatest
    $('.comic-grid .comic-card').each((i, el) => {
      const element = $(el);
      
      results.push({
        title: element.find('.comic-card-title a').text().trim(),
        url: element.find('.comic-card-title a').attr('href'),
        image: element.find('.comic-card-cover img').attr('src'),
        latest_chapter: {
          title: element.find('.comic-card-chapter a').text().trim(),
          url: element.find('.comic-card-chapter a').attr('href'),
          time: element.find('.ch-time').text().trim()
        },
        status: element.find('.badge-status').text().trim(),
        type: element.find('.badge-type-text').text().trim(),
        is_adult: element.attr('data-adult') === '1'
      });
    });

    return results;
  } catch (error) {
    console.error('Gagal memfilter data:', error.message);
    throw error;
  }
}

/**
 * Mencari komik berdasarkan kata kunci.
 * @param {string} query - Kata kunci pencarian.
 * @returns {Promise<Array>} - Array objek komik.
 */
async function searchKomik(query) {
  try {
    const url = `${BASE_URL}/search-suggest.php?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Mengambil data JSON langsung dari respons API
    const data = await response.json();
    
    return data;
  } catch (error) {
    console.error('Gagal mencari data:', error.message);
    throw error;
  }
}

/**
 * Mengambil detail informasi komik berdasarkan slug.
 * @param {string} slug - Slug komik (contoh: 'the-golden-haired-elementalistcgbum').
 */
async function getDetailKomik(slug) {
  try {
    const url = `${BASE_URL}/komik/${slug}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const container = $('.comic-detail');

    // Mengambil genre
    const genres = [];
    container.find('.comic-genres .genre-pill').each((i, el) => {
      genres.push($(el).text().trim());
    });

    // Mengambil metadata simple
    const meta = {};
    container.find('.comic-meta-simple .meta-row').each((i, el) => {
      const label = $(el).find('.meta-label').text().trim();
      const value = $(el).find('.meta-value').text().trim();
      meta[label.toLowerCase()] = value;
    });

    // Struktur data detail
    const detail = {
      title: container.find('.comic-info h1').text().trim(),
      alt_title: container.find('.comic-alt-title').text().trim(),
      image: container.find('.comic-cover img').attr('src'),
      status: container.find('.badge-status').text().trim(),
      type: container.find('.badge-type-text').text().trim(),
      genres: genres,
      author: meta['author'] || null,
      year: meta['tahun'] || null,
      synopsis: container.find('.synopsis-content').text().trim(),
      chapter_info: {
        total: container.find('.chapter-list').attr('data-ch-total'),
        latest: container.find('.chapter-last-info').text().trim()
      }
    };

    return detail;
  } catch (error) {
    console.error('Gagal mengambil detail komik:', error.message);
    throw error;
  }
}

/**
 * Mengambil daftar chapter komik.
 * @param {string} slug - Slug komik (contoh: 'the-golden-haired-elementalistcgbum').
 * @param {number} batch - Jumlah chapter per batch (default 60).
 * @param {number} offset - Offset untuk pagination chapter.
 */
async function getChapterList(slug) {
  try {
    // Endpoint sesuai dengan data atribut di HTML
    const url = `${BASE_URL}/komik/${slug}`;
    
    // Membangun URL dengan query parameters
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const chapters = [];

    // Iterasi setiap item chapter dalam grid
    $('.chapter-grid .ch-grid-item').each((i, el) => {
      const element = $(el);
      
      chapters.push({
        title: element.attr('title'),
        url: element.attr('href'),
        chapter_number: element.attr('data-chapter')
      });
    });

    return chapters;
  } catch (error) {
    console.error('Gagal mengambil daftar chapter:', error.message);
    throw error;
  }
}

/**
 * Mengambil daftar URL gambar dari halaman baca chapter.
 * @param {string} chapterUrl - URL lengkap atau path chapter (contoh: '/baca/the-golden-haired-elementalistcgbum/chapter/85').
 */
async function getChapterImages(chapterUrl) {
  try {
    // Memastikan URL lengkap
    const url = chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const images = [];

    // Mengambil data dari setiap page-container
    $('.reader-images .page-container').each((i, el) => {
      const element = $(el);
      
      images.push({
        page: element.attr('data-page'),
        index: element.attr('data-index'),
        url: element.attr('data-url')
      });
    });

    return images;
  } catch (error) {
    console.error('Gagal mengambil gambar chapter:', error.message);
    throw error;
  }
}

async function getChapterName(chapterUrl) {
    const url = chapterUrl.startsWith('http') ? chapterUrl : `${BASE_URL}${chapterUrl}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

   const html = await response.text();

  const $ = cheerio.load(html);

  let result = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());

      if (json["@type"] === "Chapter") {
        result = json;
        return false; // berhenti looping
      }
    } catch {
      // Skip kalau bukan JSON valid
    }
  });

  return result;
}

getChapterName('/baca/the-golden-haired-elementalistcgbum/chapter/85')
  .then(data => {
    console.log(`Ditemukan ${data.length} gambar:`);
    console.log(data);
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /* RESPONNYA 
  {
  '@context': 'https://schema.org',
  '@type': 'Chapter',
  name: 'The golden haired elementalist - Chapter 85',
  isPartOf: {
    '@type': 'ComicSeries',
    name: 'The golden haired elementalist',
    url: 'https://cgbum.com/komik/the-golden-haired-elementalistcgbum'
  },
  position: 85,
  url: 'https://cgbum.com/baca/the-golden-haired-elementalistcgbum/chapter/85',
  inLanguage: 'id'
  }
  */
  
// Contoh Penggunaan:
/*
getChapterImages('/baca/the-golden-haired-elementalistcgbum/chapter/85')
  .then(data => {
    console.log(`Ditemukan ${data.length} gambar:`);
    console.log(data);
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /* RESPONNYA 
  [
  {
    page: '1',                                             index: '0',
    url: 'https://cdn9.cgbum.com/img/v1821131e2ba4bNa_qsOLe5RDakZrTWx5KgGJfPRueoCFmo-dlJSQ6PRc87qz1odb-Dt3Y1pUATx7QOw5pVMise3yosDwkc1c5Gm3vqKGl1awPjdjS2RlJF9AiTzlXjQ.webp'
  },                                                     {
    page: '2',
    index: '1',
    */

/*

// Contoh Penggunaan:

getChapterList('the-golden-haired-elementalistcgbum')
  .then(data => {
    console.log(`Berhasil mengambil ${data.length} chapter:`);
    console.log(data);
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /* RESPONNYA 
  [
  {
    title: 'Ch. 108',
    url: 'https://cgbum.com/baca/the-golden-haired-elementalistcgbum/chapter/108',
    chapter_number: '108'
  },
  {
    title: 'Ch. 107',
    */


// Contoh Penggunaan:
/*
getDetailKomik('the-golden-haired-elementalistcgbum')
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /* RESPONNYA 
  {
  "title": "The golden haired elementalist Bahasa Indonesia",                                                   "alt_title": "金发精灵师之天才的烦恼",
  "image": "https://img.cgbum.com/covers/the-golden-haired-elementalist/a4c858fd6aed20c7033114acea410de054a6f0aa_720_972_172670.jpeg",
  "status": "Tamat",
  "type": "Manhwa",                                      "genres": [
    "Animals",                                             "Comedy",
    "Fantasy",
    "Full Color",
    "Historical",
    "Magical Girls",                                       "Reincarnation",
    "Shoujo(G)",                                           "Slice of Life",
    "adventure"
  ],
  "author": "-",
  "year": "-",
  "synopsis": "[The golden haired elementalist] Saya pikir saya sudah mati, tetapi ketika saya bangun, saya bereinkarnasi sebagai putri bangsawan ?! Satu-satunya hal yang saya lakukan dalam tujuh belas tahun kehidupan pertama saya adalah belajar. Sekarang saya hidup kembali, saya tidak akan hidup hanya untuk belajar! Kehidupan kedua seorang gadis sekolah menengah biasa dengan kepribadian yang agak aneh, Jean, memulai perjalanan yang tak terhentikan di benua ini! ~ CGBUM",
  "chapter_info": {
    "total": "108",
    "latest": "Terbaru Ch. 108 (2 bulan lalu)"
  }
}*/



/*
// Contoh Penggunaan:
searchKomik('Mission save')
  .then(data => {
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /* RESPONNYA 
  [
  {
    "title": "Mission: Save the Hunter",
    "slug": "mission-save-the-huntercgbum",
    "type": "manhwa",
    "chapter": "86",
    "is_adult": 1,
    "cover": "https://img.cgbum.com/covers/mission-save-the-hunter/mission-save-the-hunter-72807826a7.jpg",
    "url": "https://cgbum.com/komik/mission-save-the-huntercgbum"
  },
  {
    "title": "I Will Try to Save My Dad",
    "slug": "i-wil
    */
    
/*

// Contoh Penggunaan:
// URL: /daftar-komik?type=&status=tamat&genres%5B%5D=adventure
filterKomik('', 'tamat', ['adventure'])
  .then(data => {
    console.log(`Ditemukan ${data.length} komik:`);
    console.log(data);
  })
  .catch(err => console.error(err));

/* RESPONNYA 
[
  {
    title: "Girl's School",
    url: 'https://cgbum.com/komik/girl-s-schoolcgbum',
    image: 'https://img.cgbum.com/covers/girl-s-school/girl-s-school-eb895d358a.webp',
    latest_chapter: {
      title: 'Ch. 1',
      url: 'https://cgbum.com/baca/girl-s-schoolcgbum/chapter/1',
      time: '1 bulan lalu'
    },
    status: 'Tamat',
    type: 'Manga',
    is_adult: false
  },
  {
    title: 'Gouman Reijou
    */

/*
// Contoh Penggunaan:
const pageNumber = 1;
getLatest(pageNumber)
  .then(data => {
    console.log(`Berhasil mengambil ${data.length} komik dari halaman ${pageNumber}:`);
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => {
    console.error('Terjadi kesalahan:', err);
  });
  
  /*responnya 
  [
  {
    "title": "GREEDY",
    "url": "https://cgbum.com/komik/greedycgbum",
    "image": "https://img.cgbum.com/covers/greedy/048b38a7b3600b629778b0da18feaf4864100372_1080_1350_238502-350x476-1.jpeg",                                             "latest_chapter": {                                      "title": "Ch. 35",
      "url": "https://cgbum.com/baca/greedycgbum/chapter/35",
      "time": "21 menit lalu"                              },
    "status": "Ongoing",
    "type": "Manhwa",
    "is_adult": true
  },
  {
  */
