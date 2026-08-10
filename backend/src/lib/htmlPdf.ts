import puppeteer from 'puppeteer'

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

const LAYOUT_3_PAGES_BODY = `
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
        'position:relative;overflow:visible;box-sizing:border-box;background:#ffffff;' +
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
    if (!els.length || !Number.isFinite(deltaPx) || deltaPx === 0) return;
    var per = deltaPx / els.length;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var current = parseFloat(getComputedStyle(el).marginBottom || '0') || 0;
      el.style.marginBottom = Math.max(0, current + per) + 'px';
    }
  }

  var probe = makeSheet(false);
  host.appendChild(probe.sheet);
  var headerH = probe.header.getBoundingClientRect().height;
  probe.sheet.remove();

  var bottomSafe = 30;
  var available = Math.max(360, pageHeight - headerH - bottomSafe);

  var measureBox = document.createElement('div');
  measureBox.style.cssText = 'width:688px;';
  host.appendChild(measureBox);

  function measureHeight(nodes) {
    measureBox.innerHTML = '';
    for (var i = 0; i < nodes.length; i++) measureBox.appendChild(nodes[i].cloneNode(true));
    return measureBox.getBoundingClientRect().height;
  }

  var page1Items = [];
  var page2Items = [];
  for (var c = 0; c < topChildren.length; c++) {
    var child = topChildren[c];
    if (page2Items.length === 0 && measureHeight(page1Items.concat([child])) <= available) {
      page1Items.push(child);
    } else {
      page2Items.push(child);
    }
  }

  var sheet1 = makeSheet(false);
  var sheet2 = makeSheet(false);
  var sheet3 = makeSheet(true);
  host.appendChild(sheet1.sheet);
  host.appendChild(sheet2.sheet);
  host.appendChild(sheet3.sheet);

  for (var i1 = 0; i1 < page1Items.length; i1++) sheet1.body.appendChild(page1Items[i1]);
  for (var i2 = 0; i2 < page2Items.length; i2++) sheet2.body.appendChild(page2Items[i2]);
  for (var i3 = 0; i3 < closingChildren.length; i3++) sheet3.body.appendChild(closingChildren[i3]);

  adjustVerticalRhythm(sheet1.body, available - sheet1.body.getBoundingClientRect().height);
  if (page2Items.length) {
    adjustVerticalRhythm(sheet2.body, available - sheet2.body.getBoundingClientRect().height);
  }

  if (footer) {
    sheet3.sheet.appendChild(footer);
    footer.setAttribute(
      'style',
      'position:absolute;left:14mm;right:14mm;bottom:8mm;margin-top:0 !important;',
    );
    var fh = footer.getBoundingClientRect().height || 140;
    sheet3.body.style.paddingBottom = Math.ceil(fh + 20) + 'px';
    sheet3.body.style.maxHeight = Math.floor(available) + 'px';
  }

  var style = document.createElement('style');
  style.textContent =
    '@media print{' +
    '.devis-sheet{page-break-after:always;break-after:page;page-break-inside:avoid;height:297mm;min-height:297mm;}' +
    '.devis-sheet:last-child{page-break-after:auto;break-after:auto;}' +
    '.devis-sheet-last .devis-footer-group{position:absolute;left:14mm;right:14mm;bottom:8mm;margin-top:0!important;}' +
    '}';
  document.head.appendChild(style);

  var sheets = [sheet1.sheet, sheet2.sheet, sheet3.sheet];
  document.body.innerHTML = '';
  for (var s = 0; s < sheets.length; s++) document.body.appendChild(sheets[s]);
`

const waitImagesFn = new Function('return (async () => {' + WAIT_IMAGES_BODY + '})()') as () => Promise<void>
const layout3PagesFn = new Function('pageHeight', LAYOUT_3_PAGES_BODY) as (pageHeight: number) => void

/**
 * Rend un HTML complet en PDF A4 via Chromium.
 * Force 3 pages : corps 1–2, offre page 3 avec footer fixé en bas.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined

  const browser = await puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: PAGE_HEIGHT_PX, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: ['load', 'networkidle0'], timeout: 45_000 })

    await page.evaluate(waitImagesFn)
    await page.evaluate(layout3PagesFn, PAGE_HEIGHT_PX)

    const pdf = await page.pdf({
      width: '210mm',
      height: '297mm',
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    })

    return Buffer.from(pdf)
  } finally {
    await browser.close().catch(() => undefined)
  }
}
