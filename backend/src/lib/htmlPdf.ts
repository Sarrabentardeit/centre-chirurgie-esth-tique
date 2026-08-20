import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer'
import { AppError } from '../middleware/errorHandler.js'

/** Hauteur d'une page A4 en px CSS @96dpi, marges 0 (cohérent avec @page + page.pdf() ci-dessous). */
const PAGE_HEIGHT_PX = 1123

/**
 * Corps des scripts navigateur.
 * On utilise `new Function(...)` (pas une arrow TS/tsx) pour éviter :
 * 1) le helper `__name` injecté par tsx/esbuild dans le contexte Chromium
 * 2) l'évaluation string Puppeteer qui retourne la fonction au lieu de l'exécuter
 */
const WAIT_IMAGES_BODY = `
  const imgs = Array.from(document.images);
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = () => res();
            img.onerror = () => res();
          }),
    ),
  );
`

const LAYOUT_PAGES_BODY = `
  if (document.body.querySelector('.devis-sheet')) return;

  var top = document.querySelector('.devis-top');
  var closing = document.querySelector('.devis-closing');
  var footer = document.querySelector('.devis-footer-group');
  var headerCell = document.querySelector('.page-table > thead > tr > td');
  if (!top || !closing || !headerCell) return;

  var headerHtml = headerCell.innerHTML;
  var topChildren = Array.from(top.children);
  if (footer) footer.remove();
  var closingChildren = Array.from(closing.children);

  var host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:794px;';
  document.body.appendChild(host);

  function makeSheet(isLast) {
    var sheet = document.createElement('div');
    sheet.className = isLast ? 'devis-sheet devis-sheet-last' : 'devis-sheet';
    sheet.setAttribute(
      'style',
      'display:block;width:210mm;height:297mm;min-height:297mm;max-height:297mm;' +
        'position:relative;overflow:hidden;box-sizing:border-box;background:#ffffff;' +
        'page-break-after:' + (isLast ? 'auto' : 'always') + ';' +
        'break-after:' + (isLast ? 'auto' : 'page') + ';' +
        'page-break-inside:avoid;break-inside:avoid;',
    );
    var header = document.createElement('div');
    header.className = 'devis-sheet-header';
    header.innerHTML = headerHtml;
    var body = document.createElement('div');
    body.className = 'devis-sheet-body';
    body.style.overflow = 'hidden';
    sheet.appendChild(header);
    sheet.appendChild(body);
    return { sheet: sheet, header: header, body: body };
  }

  function collectSpacingTargets(root) {
    return Array.from(root.querySelectorAll('p, ul, ol, hr, .devis-heading, .section-hr, h1, h2, h3, h4'));
  }

  function adjustVerticalRhythm(root, deltaPx) {
    var els = collectSpacingTargets(root);
    if (!els.length || !Number.isFinite(deltaPx) || deltaPx <= 0) return;
    var per = deltaPx / els.length;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var current = parseFloat(getComputedStyle(el).marginBottom || '0') || 0;
      el.style.marginBottom = current + per + 'px';
    }
  }

  var probe = makeSheet(false);
  host.appendChild(probe.sheet);
  var headerH = probe.header.getBoundingClientRect().height;
  probe.sheet.remove();

  var available = Math.max(360, pageHeight - headerH - 24);

  var measureBox = document.createElement('div');
  measureBox.style.cssText = 'width:688px;';
  host.appendChild(measureBox);

  function measureHeight(nodes) {
    measureBox.innerHTML = '';
    for (var i = 0; i < nodes.length; i++) measureBox.appendChild(nodes[i].cloneNode(true));
    return measureBox.getBoundingClientRect().height;
  }

  function cloneListWith(list, items) {
    var wrap = list.cloneNode(false);
    for (var i = 0; i < items.length; i++) wrap.appendChild(items[i].cloneNode(true));
    return wrap;
  }

  function explodeNode(node) {
    var h = measureHeight([node]);
    if (h <= available) return [node];
    var tag = (node.tagName || '').toLowerCase();
    var kids = Array.from(node.children);
    if ((tag === 'ul' || tag === 'ol') && kids.length > 1) {
      var parts = [];
      var batch = [];
      for (var i = 0; i < kids.length; i++) {
        var trial = batch.concat([kids[i]]);
        if (batch.length && measureHeight([cloneListWith(node, trial)]) > available) {
          parts.push(cloneListWith(node, batch));
          batch = [kids[i]];
        } else {
          batch.push(kids[i]);
        }
      }
      if (batch.length) parts.push(cloneListWith(node, batch));
      return parts.length ? parts : [node];
    }
    if (kids.length > 1) {
      var out = [];
      for (var j = 0; j < kids.length; j++) out = out.concat(explodeNode(kids[j]));
      return out;
    }
    return [node];
  }

  function pack(nodes, pageAvail) {
    var pages = [];
    var cur = [];

    function textOf(el) {
      return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
    }
    function isTitleLike(el) {
      if (!el) return false;
      var tag = (el.tagName || '').toLowerCase();
      if (tag === 'hr' || /^h[1-6]$/.test(tag)) return true;
      var cls = String(el.className || '');
      if (/\b(devis-heading|diagnostic-op-title|section-title|devis-ref-title|section-hr)\b/.test(cls)) return true;
      var text = textOf(el);
      if (!text) return true;
      if (text.length <= 96 && /:\s*$/.test(text)) return true;
      return false;
    }
    function gatherGroup(start) {
      var group = [nodes[start]];
      var j = start + 1;
      while (j < nodes.length && isTitleLike(nodes[j])) {
        group.push(nodes[j]);
        j += 1;
      }
      if (j < nodes.length && !isTitleLike(nodes[j])) group.push(nodes[j]);
      return group;
    }
    function peelTrailingTitles(page) {
      var moved = [];
      while (page.length && isTitleLike(page[page.length - 1])) {
        moved.unshift(page.pop());
      }
      return moved;
    }

    var i = 0;
    while (i < nodes.length) {
      var group = isTitleLike(nodes[i]) ? gatherGroup(i) : [nodes[i]];
      if (cur.length && measureHeight(cur.concat(group)) > pageAvail) {
        var moved = peelTrailingTitles(cur);
        if (cur.length) pages.push(cur);
        cur = moved.concat(group);
      } else {
        cur = cur.concat(group);
      }
      i += group.length;
    }
    if (cur.length) pages.push(cur);
    return pages;
  }

  var topNodes = [];
  for (var t = 0; t < topChildren.length; t++) topNodes = topNodes.concat(explodeNode(topChildren[t]));
  var closingNodes = [];
  for (var c = 0; c < closingChildren.length; c++) closingNodes = closingNodes.concat(explodeNode(closingChildren[c]));

  var pages = pack(topNodes, available);

  var footerReserve = 36;
  if (footer) {
    host.appendChild(footer);
    footerReserve = Math.ceil(footer.getBoundingClientRect().height || 140) + 28;
    footer.remove();
  }
  var lastAvail = Math.max(280, available - footerReserve);

  if (closingNodes.length) {
    var last = pages.length ? pages[pages.length - 1] : null;
    if (last && measureHeight(last.concat(closingNodes)) <= lastAvail) {
      pages[pages.length - 1] = last.concat(closingNodes);
    } else {
      pages = pages.concat(pack(closingNodes, lastAvail));
    }
  }
  if (!pages.length) pages = [[]];

  var sheets = [];
  for (var p = 0; p < pages.length; p++) {
    var isLast = p === pages.length - 1;
    var made = makeSheet(isLast);
    host.appendChild(made.sheet);
    for (var n = 0; n < pages[p].length; n++) made.body.appendChild(pages[p][n]);
    if (isLast && footer) {
      made.sheet.appendChild(footer);
      footer.setAttribute(
        'style',
        'position:absolute;left:14mm;right:14mm;bottom:8mm;margin-top:0 !important;',
      );
      made.body.style.paddingBottom = footerReserve + 'px';
      var leftover = lastAvail - made.body.getBoundingClientRect().height;
      if (leftover > 48) adjustVerticalRhythm(made.body, leftover * 0.35);
    }
    sheets.push(made.sheet);
  }

  var style = document.createElement('style');
  style.textContent =
    '@media print{' +
    '.devis-sheet{page-break-after:always;break-after:page;page-break-inside:avoid;height:297mm;min-height:297mm;overflow:hidden;}' +
    '.devis-sheet:last-child{page-break-after:auto;break-after:auto;}' +
    '.devis-sheet-last .devis-footer-group{position:absolute;left:14mm;right:14mm;bottom:8mm;margin-top:0!important;}' +
    '}';
  document.head.appendChild(style);

  document.body.innerHTML = '';
  for (var s = 0; s < sheets.length; s++) document.body.appendChild(sheets[s]);
`

const waitImagesFn = new Function('return (async () => {' + WAIT_IMAGES_BODY + '})()') as () => Promise<void>
const layoutPagesFn = new Function('pageHeight', LAYOUT_PAGES_BODY) as (pageHeight: number) => void

/** Chrome / Edge système (dev Windows) si le binaire Puppeteer n’est pas installé. */
async function resolveChromeExecutable(): Promise<string | undefined> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (envPath) return envPath

  try {
    const bundled = await Promise.resolve(puppeteer.executablePath())
    if (bundled && fs.existsSync(bundled)) return bundled
  } catch {
    /* Chrome Puppeteer non installé — fallback système */
  }

  const candidates =
    os.platform() === 'win32'
      ? [
          path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(process.env['PROGRAMFILES'] ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
          path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        ]
      : os.platform() === 'darwin'
        ? [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          ]
        : [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/usr/bin/microsoft-edge',
          ]

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return undefined
}

/**
 * Rend un HTML complet en PDF A4 via Chromium.
 * Autant de pages que nécessaire (diagnostic long compris).
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const executablePath = await resolveChromeExecutable()

  let browser
  try {
    browser = await puppeteer.launch({
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--font-render-hinting=none',
      ],
    })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new AppError(
      503,
      'PDF_ENGINE_UNAVAILABLE',
      `Génération PDF indisponible (Chrome introuvable). Installez Chrome ou définissez PUPPETEER_EXECUTABLE_PATH. (${detail.slice(0, 180)})`,
    )
  }

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: PAGE_HEIGHT_PX, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load', timeout: 45_000 })

    await page.evaluate(waitImagesFn)
    await page.evaluate(layoutPagesFn, PAGE_HEIGHT_PX)

    const pdf = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    })

    return Buffer.from(pdf)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new AppError(500, 'PDF_RENDER_FAILED', `Échec génération PDF : ${detail.slice(0, 200)}`)
  } finally {
    await browser.close().catch(() => undefined)
  }
}
