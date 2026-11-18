import { PLANNING_DOC } from '@/lib/planningSejourBranding'

/** Styles impression / éditeur — métriques Word « Planning Séjour Type séjour ». */
export function buildPlanningSejourPrintStyles(): string {
  const D = PLANNING_DOC
  return `
    *, *::before, *::after { box-sizing: border-box; }
    /* Marges Word : haut/bas/droite 25mm, gauche 20mm */
    @page { size: A4 portrait; margin: 25mm 25mm 25mm 20mm; }
    html, body { margin: 0; padding: 0; background: #ffffff; }

    .planning-doc {
      font-family: ${D.fontFamily};
      font-size: ${D.baseSize};
      line-height: ${D.lineHeight};
      color: ${D.gray};
      width: 100%;
      max-width: 170mm;
      margin: 0;
      text-align: left;
      -webkit-font-smoothing: antialiased;
    }
    /* Word Normal : after=10pt, line=1.15 — fallback si pas de style inline */
    .planning-doc p {
      margin: 0 0 ${D.paraAfter};
      line-height: ${D.lineHeight};
      font-size: inherit;
    }
    .planning-doc strong { font-weight: 700; }
    .planning-doc u { text-decoration: underline; }
    .planning-doc mark {
      padding: 0 1px;
      border-radius: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    .planning-doc img { height: auto; vertical-align: middle; }
    /* Logo ~34mm (extent Word 1.33") */
    .planning-doc img[src*="planning-header-logo"] { width: 34mm; max-width: 40%; }
    .planning-doc img[src*="planning-bon-sejour"] {
      display: block;
      width: 42mm;
      max-width: 50%;
      margin: 0 auto;
      page-break-inside: avoid;
    }
    .planning-doc p:has(img[src*="planning-header-logo"]) {
      margin: 0 0 12pt;
      line-height: 1;
    }
    .planning-doc p:has(img[src*="planning-bon-sejour"]) {
      margin: 14pt 0 8pt;
      line-height: 1;
    }

    /* Dernière page seule (PDF) : consignes + Bon séjour */
    .planning-doc .planning-last-page {
      break-before: page;
      page-break-before: always;
      break-inside: avoid;
      page-break-inside: avoid;
      margin-top: 0;
      padding-top: 0;
    }
    .planning-doc .planning-last-page > p:has(img[src*="planning-header-logo"]) {
      margin: 0 0 28pt;
    }
    .planning-doc .planning-last-page > p:has(img[src*="planning-bon-sejour"]) {
      margin: 22pt auto 0;
    }

    /* Cadre noir « CONSIGNES POSTOPÉRATOIRES » */
    .planning-doc .planning-consignes-box {
      border: 0.5pt solid #000000;
      padding: 8pt 12pt 10pt;
      margin: 0;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .planning-doc .planning-consignes-box > p {
      margin: 0 0 ${D.paraAfter};
      line-height: ${D.lineHeight};
    }
    .planning-doc .planning-consignes-box > p:last-child { margin-bottom: 0; }

    .ProseMirror.planning-editor {
      font-family: ${D.fontFamily};
      font-size: ${D.baseSize};
      line-height: ${D.lineHeight};
      color: ${D.gray};
      outline: none;
      min-height: 460px;
      max-width: 170mm;
      text-align: left;
      -webkit-font-smoothing: antialiased;
    }
    .ProseMirror.planning-editor p {
      margin: 0 0 ${D.paraAfter};
      line-height: ${D.lineHeight};
    }
    .ProseMirror.planning-editor strong { font-weight: 700; }
    .ProseMirror.planning-editor u { text-decoration: underline; }
    .ProseMirror.planning-editor mark {
      padding: 0 1px;
      border-radius: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ProseMirror.planning-editor img { height: auto; vertical-align: middle; }
    .ProseMirror.planning-editor img[src*="planning-header-logo"] { width: 128px; max-width: 40%; }
    .ProseMirror.planning-editor img[src*="planning-bon-sejour"] {
      display: block;
      width: 160px;
      max-width: 50%;
      margin: 0 auto;
    }
    .ProseMirror.planning-editor p:has(img[src*="planning-header-logo"]) {
      margin: 0 0 12pt;
      line-height: 1;
    }
    .ProseMirror.planning-editor p:has(img[src*="planning-bon-sejour"]) {
      margin: 14pt 0 8pt;
      line-height: 1;
    }
    .ProseMirror.planning-editor .planning-last-page {
      margin-top: 28px;
      padding-top: 20px;
      border-top: 1px dashed ${D.hiDark};
    }
    .ProseMirror.planning-editor .planning-consignes-box {
      border: 0.5pt solid #000000;
      padding: 8pt 12pt 10pt;
      margin: 0;
    }
    .ProseMirror.planning-editor .planning-consignes-box > p {
      margin: 0 0 ${D.paraAfter};
      line-height: ${D.lineHeight};
    }
    .ProseMirror.planning-editor .planning-consignes-box > p:last-child { margin-bottom: 0; }
    .ProseMirror.planning-editor img.ProseMirror-selectednode { outline: 2px solid ${D.salmon}; }
  `
}

export function buildPlanningSejourPrintPage(bodyHtml: string, pageTitle: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>${pageTitle.replace(/</g, '')}</title>
  <style>${buildPlanningSejourPrintStyles()}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}
