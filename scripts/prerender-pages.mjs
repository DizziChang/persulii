#!/usr/bin/env node
/* ============================================================
   prerender-pages.mjs — 把原本靠 js/main.js 事後填入的內文寫進 HTML

   首頁產品列、產品總覽卡片、關於、FAQ 的文字原本是頁面載入後才由
   JS 抓 content/*.json 渲染，不跑 JS 的爬蟲（以及 Google 第一輪抓取）
   只看得到空殼。這裡在建置時把同一份內容直接寫進 HTML。

   做法：HTML 裡以 <!--prerender:名稱-->…<!--/prerender:名稱--> 標出位置，
   腳本只取代標記之間的內容，可重複執行。js/main.js 的渲染邏輯保留，
   載入後會用同樣的內容覆蓋一次（首頁／產品列表若已有內容則略過，
   避免影片被重設），所以 CMS 與這裡的版型必須維持一致。

   由 build-pages.mjs 結尾呼叫，Build command 不必更動。
   ============================================================ */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://persulii.com.tw';
const SITE_NAME = 'per-sulii 沛素';

const json = (f) => JSON.parse(readFileSync(join(ROOT, 'content', f), 'utf8'));
const asset = (p) => (!p ? p : /^(https?:)?\/\//.test(p) ? p : '/' + String(p).replace(/^\/+/, ''));
const nl2br = (s) => (s || '').split('\n').join('<br>');
const paragraphs = (s, first, rest) => (s || '').split(/\n{2,}/)
  .map((p, i) => '<p class="body ' + (i === 0 ? first : rest) + '">' + nl2br(p) + '</p>').join('');
const ldScript = (id, data) => '<script type="application/ld+json" id="' + id + '">'
  + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>';

/* ---- 產品卡（與 js/main.js 的 productCardHTML／homeProductRowHTML 同版型） ---- */
const productPath = (p) => '/products/' + String(p.id).toLowerCase();
const HOME_CTA = { 'V-essence': '我要淡化細紋 →', 'S-essence': '我要細緻肌膚 →' };
const ROW_CLASS = { 'V-essence': 'pfeature-row-v', 'S-essence': 'pfeature-row-s' };

function cardHTML(p, img, cta) {
  const alt = p.en + ' ' + p.name;
  return '<a href="' + productPath(p) + '" class="pcard">'
    + '<div class="media product"' + (img ? '' : ' data-mono="' + p.code + '"') + '>'
    + (img ? '<img class="media-img" src="' + asset(img) + '" alt="' + alt + '" loading="lazy">' : '')
    + (p.hoverImg ? '<div class="media-hover"><img src="' + asset(p.hoverImg) + '" alt="' + alt + ' 特寫" loading="lazy"></div>' : '')
    + (p.hoverTitle ? '<div class="media-cap"><span class="media-cap-t">' + p.hoverTitle + '</span><span class="media-cap-d">' + p.hoverDesc + '</span></div>' : '')
    + '</div>'
    + '<h3 class="h3 mt24">' + p.en + ' ' + p.name + '</h3>'
    + '<p class="body mt8">' + p.tagline + '</p>'
    + '<div class="mt16">' + (cta ? '<span class="btn ghost">' + cta + '</span>' : '<span class="tlink">了解更多 →</span>') + '</div>'
    + '</a>';
}

function videoHTML(p) {
  if (!p.videoId) return '';
  const code = String(p.code).toLowerCase();
  return '<div class="media pfeature-video">'
    + '<video class="video-el" src="/video/persulii-' + code + '-intro.mp4" poster="/images/' + code + '-video-cover.webp" muted loop playsinline preload="auto"></video>'
    + '<div class="play-hit-area" aria-hidden="true"></div>'
    + '<button type="button" class="play-toggle" aria-label="暫停" aria-pressed="false">'
    + '<svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    + '<svg class="icon-play" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>'
    + '<button type="button" class="share-toggle share-btn" aria-label="分享" data-share-url="https://youtu.be/' + p.videoId + '" data-share-title="' + p.en + ' ' + p.name + ' 短影片">'
    + '<img src="/images/icon/social-media-w.webp" alt=""></button>'
    + '</div>';
}

function homeRowHTML(p) {
  return '<div class="pfeature-row' + (ROW_CLASS[p.id] ? ' ' + ROW_CLASS[p.id] : '') + '">'
    + videoHTML(p) + cardHTML(p, p.homeImg || p.img, HOME_CTA[p.id]) + '</div>';
}

/* ---- 取代標記區塊 ---- */
function fill(html, name, content, file) {
  const re = new RegExp('(<!--prerender:' + name + '-->)[\\s\\S]*?(<!--/prerender:' + name + '-->)');
  if (!re.test(html)) throw new Error(file + ' 找不到標記 prerender:' + name);
  return html.replace(re, (_, a, b) => a + content + b);
}
function edit(file, fn) {
  const path = join(ROOT, file);
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(path, after);
  console.log('  ✓ ' + file + ' 預渲染');
}

const products = json('products.json').items || [];

/* 首頁：產品列＋Organization／WebSite 結構化資料 */
const footer = json('settings-footer.json').footer || {};
const contact = json('settings-contact.json').contact_page || {};
const social = footer.social || {};
const address = contact.address || footer.address;
const org = {
  '@type': 'Organization',
  '@id': SITE_URL + '/#org',
  name: SITE_NAME,
  alternateName: ['沛素', 'per-sulii'],
  legalName: footer.company || contact.company,
  url: SITE_URL + '/',
  logo: SITE_URL + '/images/per-sulii-logo-grayscale.webp',
  email: footer.email,
  telephone: footer.phone || contact.phone,
  address: address ? { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'TW' } : undefined,
  sameAs: [social.line, social.facebook, social.instagram].filter(Boolean)
};
const website = {
  '@type': 'WebSite',
  '@id': SITE_URL + '/#website',
  name: SITE_NAME,
  url: SITE_URL + '/',
  inLanguage: 'zh-Hant-TW',
  publisher: { '@id': SITE_URL + '/#org' }
};
edit('index.html', (h) => {
  const v = products.find((p) => p.id === 'V-essence');
  const s = products.find((p) => p.id === 'S-essence');
  h = fill(h, 'home-products', [v, s].filter(Boolean).map(homeRowHTML).join(''), 'index.html');
  return fill(h, 'home-ld', ldScript('ld-org', { '@context': 'https://schema.org', '@graph': [org, website] }), 'index.html');
});

/* 產品總覽：卡片 */
edit('products.html', (h) => fill(h, 'product-list',
  products.map((p) => cardHTML(p, p.img, HOME_CTA[p.id])).join(''), 'products.html'));

/* 關於 */
const about = json('about-sections.json');
edit('about.html', (h) => {
  h = fill(h, 'about-title', nl2br(about.h1), 'about.html');
  about.sections.slice(0, 4).forEach((s, i) => {
    h = fill(h, 'about-heading-' + (i + 1), nl2br(s.heading), 'about.html');
    h = fill(h, 'about-body-' + (i + 1), paragraphs(s.body, 'mt16', 'mt16'), 'about.html');
  });
  return h;
});

/* FAQ：問答文字＋FAQPage 結構化資料 */
const faq = json('faq.json').faq || [];
edit('faq.html', (h) => {
  h = fill(h, 'faq-list', faq.map((it) => '<div class="faq-entry"><h2 class="h3">' + it.q + '</h2>'
    + paragraphs(it.a, 'mt16', 'mt16') + '</div>').join(''), 'faq.html');
  return fill(h, 'faq-ld', ldScript('ld-faq', {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((it) => ({
      '@type': 'Question', name: it.q,
      acceptedAnswer: { '@type': 'Answer', text: String(it.a || '').replace(/<[^>]+>/g, '') }
    }))
  }), 'faq.html');
});
