// scraper.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import archiver from 'archiver';
import { config } from './config.js';
import { fetch } from "./wreq.js";

const VYMANGA_URL = "https://vymanga.com";
const BBATO_URL = "https://bbato.com";
const CGBUM_URL = "https://cgbum.com";
const CORS_PROXY = "https://cors-proxy1.rockyyrec.workers.dev/?url=";

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

function detectProvider(url) {
  if (url.toLowerCase().includes("bbato")) return "bbato";
  if (url.toLowerCase().includes("cgbum")) return "cgbum";
  return "vymanga";
}

async function fetchWithFallback(url, customHeaders = {}, isArrayBuffer = false) {
  const mergedHeaders = { ...HEADERS, ...customHeaders };
  
  // Menggunakan fetch untuk provider cgbum
  if (detectProvider(url) === "cgbum") {
    try {
      const res = await fetch(url, { headers: mergedHeaders, signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return { data: isArrayBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text() };
    } catch (error) {
      console.log(`[Info] Request fetch ke ${url} gagal. Beralih ke CORS proxy...`);
      const targetUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
      const res = await fetch(targetUrl, { headers: mergedHeaders, signal: AbortSignal.timeout(15000) });
      return { data: isArrayBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text() };
    }
  }

  // Tetap menggunakan axios untuk vymanga dan bbato agar kompatibilitas lama terjaga
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
      return chapters.reverse();
    } else if (provider === "bbato") {
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
    } else if (provider === "cgbum") {
      const res = await fetchWithFallback(mangaUrl);
      const $ = cheerio.load(res.data);
      const chapters = [];
      
      $('.chapter-grid .ch-grid-item').each((_, el) => {
        const element = $(el);
        let href = element.attr('href');
        if (href && !href.startsWith('http')) href = `${CGBUM_URL}${href}`;
        
        chapters.push({
          url: href,
          name: element.attr('title') || `Chapter ${element.attr('data-chapter')}`
        });
      });
      return chapters.reverse(); // Memastikan urutan dari chapter terlama ke terbaru
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
    if (provider === "cgbum") customHeaders['Referer'] = `${CGBUM_URL}/`;
    
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
    } else if (provider === "bbato") {
      $('.pages .page:not(.notice-page) img').each((idx, element) => {
        let imgUrl = $(element).attr('data-src') || $(element).attr('src');
        if (imgUrl) {
          if (!imgUrl.startsWith('http')) imgUrl = new URL(imgUrl, BBATO_URL).href;
          pages.push({ index: idx, imageUrl: imgUrl });
        }
      });
    } else if (provider === "cgbum") {
      $('.reader-images .page-container').each((_, el) => {
        const element = $(el);
        const imgUrl = element.attr('data-url');
        const idx = parseInt(element.attr('data-index')) || pages.length;
        if (imgUrl) pages.push({ index: idx, imageUrl: imgUrl });
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

    const parseCgbumJsonLd = () => {
      let result = null;
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html());
          if (json["@type"] === "Chapter") {
            result = {
              title: json.isPartOf?.name || "Unknown Title",
              chapter_name: json.name || "Unknown Chapter"
            };
            return false;
          }
        } catch (e) {}
      });
      return result;
    };

    if (provider === "bbato") return parseBbatoJsonLd() || fallbackData;
    if (provider === "vymanga") return parseVymangaDiv() || fallbackData;
    if (provider === "cgbum") return parseCgbumJsonLd() || fallbackData;
    
    return parseVymangaDiv() || parseBbatoJsonLd() || parseCgbumJsonLd() || fallbackData;
  } catch (error) {
    return fallbackData;
  }
}

/**
 * Mendownload seluruh gambar chapter secara paralel (Concurrency), mengompres, dan membungkusnya langsung ke file .cbz
 */
export async function downloadAndCompressToZip(pages, mangaTitle, chapterName, quality, format, chapterUrl) {
  const cleanMangaTitle = mangaTitle.replace(/[\\/:*?"<>|]/g, "_").trim();
  const cleanChapterName = chapterName.replace(/[\\/:*?"<>|]/g, "_").trim();

  const mangaFolderPath = path.join(config.outputFolder, cleanMangaTitle);
  if (!fs.existsSync(mangaFolderPath)) {
    fs.mkdirSync(mangaFolderPath, { recursive: true });
  }

  const cbzFilePath = path.join(mangaFolderPath, `${cleanChapterName}.cbz`);
  
  const output = fs.createWriteStream(cbzFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  archive.pipe(output);

  const provider = detectProvider(chapterUrl);
  let customHeaders = {};
  if (provider === "bbato") {
    customHeaders['Referer'] = `${BBATO_URL}/`;
  } else if (provider === "cgbum") {
    customHeaders = {
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'DNT': '1',
      'Referer': `${CGBUM_URL}/`,
      'sec-fetch-dest': 'empty',
      'Sec-GPC': '1'
    };
  }

  console.log(`[Proses] Mengunduh ${pages.length} gambar secara paralel...`);

  const downloadPromises = pages.map(async (page) => {
    try {
      const response = await fetchWithFallback(page.imageUrl, customHeaders, true);
      // fetch membalas berupa Buffer langsung dari helper jika provider-nya cgbum
      const inputBuffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);

      const compressedBuffer = await sharp(inputBuffer)
        .toFormat(format, { quality: quality })
        .toBuffer();

      const pageIndexString = String(page.index + 1).padStart(3, '0');
      archive.append(compressedBuffer, { name: `${pageIndexString}.${format}` });
    } catch (err) {
      console.error(`[Gagal] Halaman ${page.index + 1}: ${err.message}`);
    }
  });

  await Promise.all(downloadPromises);
  await archive.finalize();

  return new Promise((resolve) => {
    output.on('close', () => {
      console.log(`[Sukses] Berhasil dibuat -> ${cbzFilePath} (${archive.pointer()} bytes)`);
      resolve();
    });
  });
}
