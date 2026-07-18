// scraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import archiver from 'archiver';
import { config } from './config.js';

const VYMANGA_URL = "https://vymanga.com";
const BBATO_URL = "https://bbato.com";
const CORS_PROXY = "https://cors-proxy1.rockyyrec.workers.dev/?url=";

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function detectProvider(url) {
  if (url.toLowerCase().includes("bbato")) return "bbato";
  return "vymanga";
}

async function fetchWithFallback(url, customHeaders = {}, isArrayBuffer = false) {
  const mergedHeaders = { ...HEADERS, ...customHeaders };
  const options = {
    headers: mergedHeaders,
    timeout: 15000,
    responseType: isArrayBuffer ? 'arraybuffer' : 'text'
  };

  try {
    return await axios.get(url, options);
  } catch (error) {
    console.log(`[Info] Request ke ${url} gagal. Beralih ke CORS proxy...`);
    const targetUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
    return await axios.get(targetUrl, options);
  }
}

export async function getChapterList(mangaUrl) {
  try {
    const provider = detectProvider(mangaUrl);
    if (provider === "vymanga") {
      const res = await fetchWithFallback(mangaUrl);
      const $ = cheerio.load(res.data);
      const chapters = [];
      $('.list-group > a').each((_, element) => {
        const href = $(element).attr('href');
        const span = $(element).find('span');
        const name = span.length ? span.text().trim() : "Unknown_Chapter";
        if (href) {
          chapters.push({ url: new URL(href, VYMANGA_URL).href, name });
        }
      });
      return chapters.reverse(); // Balik urutan agar chapter awal di-download duluan
    } else {
      const slug = mangaUrl.replace(/\/$/, "").split("/").pop();
      const bbatoHeaders = {
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': mangaUrl
      };
      const apiUrl = `${BBATO_URL}/get-chapter-list?slug=${slug}`;
      const res = await fetchWithFallback(apiUrl, bbatoHeaders);
      const resJson = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;

      if (!resJson.data || !Array.isArray(resJson.data)) return [];
      
      const chapters = resJson.data.map(ch => ({
        url: `${BBATO_URL}/read/${slug}/${ch.chapter_slug}`,
        name: ch.chapter_name || 'Unknown_Chapter'
      }));
      return chapters.reverse();
    }
  } catch (error) {
    console.error(`[Error] Gagal mengambil detail manga: ${error.message}`);
    return [];
  }
}

export async function fetchChapterSoup(chapterUrl) {
  try {
    const provider = detectProvider(chapterUrl);
    let customHeaders = {};
    if (provider === "bbato") customHeaders['Referer'] = `${BBATO_URL}/`;
    const res = await fetchWithFallback(chapterUrl, customHeaders);
    return cheerio.load(res.data);
  } catch (error) {
    console.error(`[Error] Gagal mengambil URL chapter: ${error.message}`);
    return null;
  }
}

export function getPageList($, chapterUrl = "") {
  if (!$) return [];
  const pages = [];
  try {
    const provider = detectProvider(chapterUrl);
    if (provider === "vymanga") {
      $('img.d-block').each((idx, element) => {
        const imgUrl = $(element).attr('data-src') || $(element).attr('src');
        if (imgUrl) pages.push({ index: idx, imageUrl: new URL(imgUrl, VYMANGA_URL).href });
      });
    } else {
      $('.pages .page:not(.notice-page) img').each((idx, element) => {
        let imgUrl = $(element).attr('data-src') || $(element).attr('src');
        if (imgUrl) {
          if (!imgUrl.startsWith('http')) imgUrl = new URL(imgUrl, BBATO_URL).href;
          pages.push({ index: idx, imageUrl: imgUrl });
        }
      });
    }
    return pages;
  } catch (error) {
    console.error(`[Error] Gagal memproses halaman: ${error.message}`);
    return [];
  }
}

export function getChapterName($, chapterUrl = "") {
  const fallbackData = { title: "Unknown Title", chapter_name: "Unknown Chapter" };
  if (!$) return fallbackData;
  try {
    const provider = chapterUrl ? detectProvider(chapterUrl) : null;
    const parseBbatoJsonLd = () => {
      let result = null;
      $('script[type="application/ld+json"]').each((_, element) => {
        try {
          const content = $(element).html();
          if (!content) return;
          const data = JSON.parse(content);
          if (data['@type'] === "BreadcrumbList") {
            const items = data.itemListElement || [];
            if (items.length >= 2) {
              result = { title: items[items.length - 2].name, chapter_name: items[items.length - 1].name };
            }
          }
        } catch (e) {}
      });
      return result;
    };
    const parseVymangaDiv = () => {
      const infoDiv = $('#chapter-info');
      if (infoDiv.length) {
        const text = infoDiv.text().trim();
        if (text.includes(":")) {
          const parts = text.split(":");
          return { title: parts.shift().trim(), chapter_name: parts.join(":").trim() };
        }
        return { title: text, chapter_name: "Unknown Chapter" };
      }
      return null;
    };

    if (provider === "bbato") return parseBbatoJsonLd() || fallbackData;
    if (provider === "vymanga") return parseVymangaDiv() || fallbackData;
    return parseVymangaDiv() || parseBbatoJsonLd() || fallbackData;
  } catch (error) {
    return fallbackData;
  }
}

/**
 * Mendownload seluruh gambar chapter secara paralel (Concurrency), mengompres, dan membungkusnya langsung ke file .cbz
 */
export async function downloadAndCompressToZip(pages, mangaTitle, chapterName, quality, format, chapterUrl) {
  // Membersihkan nama folder & file dari karakter terlarang Windows/Linux
  const cleanMangaTitle = mangaTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
  const cleanChapterName = chapterName.replace(/[\\/:*?"<>|]/g, "_").trim();

  const mangaFolderPath = path.join(config.outputFolder, cleanMangaTitle);
  if (!fs.existsSync(mangaFolderPath)) {
    fs.mkdirSync(mangaFolderPath, { recursive: true });
  }

  const cbzFilePath = path.join(mangaFolderPath, `${cleanChapterName}.cbz`);
  
  // Setup stream untuk menulis file zip/cbz
  const output = fs.createWriteStream(cbzFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  const provider = detectProvider(chapterUrl);
  let customHeaders = {};
  if (provider === "bbato") customHeaders['Referer'] = `${BBATO_URL}/`;

  console.log(`[Proses] Mengunduh ${pages.length} gambar secara paralel...`);

  // Logika Concurrency: Mengunduh dan mengompres seluruh halaman secara bersamaan
  const downloadPromises = pages.map(async (page) => {
    try {
      const response = await fetchWithFallback(page.imageUrl, customHeaders, true);
      const inputBuffer = Buffer.from(response.data);

      // Kompres buffer gambar dengan Sharp
      const compressedBuffer = await sharp(inputBuffer)
        .toFormat(format, { quality: quality })
        .toBuffer();

      // Masukkan hasil kompresi ke file zip (format penamaan: 001.jpeg, 002.jpeg, dst)
      const pageIndexString = String(page.index + 1).padStart(3, '0');
      archive.append(compressedBuffer, { name: `${pageIndexString}.${format}` });
    } catch (err) {
      console.error(`[Gagal] Halaman ${page.index + 1}: ${err.message}`);
    }
  });

  // Tunggu hingga semua proses download & kompresi selesai
  await Promise.all(downloadPromises);

  // Finalisasi file arsip CBZ
  await archive.finalize();

  return new Promise((resolve) => {
    output.on('close', () => {
      console.log(`[Sukses] Berhasil dibuat -> ${cbzFilePath} (${archive.pointer()} bytes)`);
      resolve();
    });
  });
}
