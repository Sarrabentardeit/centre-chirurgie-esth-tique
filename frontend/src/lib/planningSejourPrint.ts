import { PLANNING_DOC } from '@/lib/planningSejourBranding'

/** Styles impression / éditeur — fidèles au Word « Planning Séjour ». */
export function buildPlanningSejourPrintStyles(): string {
  const D = PLANNING_DOC
  return `
    *, *::before, *::after { box-sizing: border-box; }
    /* Marges identiques au Word : haut/bas/droite 2,5cm, gauche 2,0cm */
    @page { size: A4 portrait; margin: 25mm 25mm 25mm 20mm; }
    html, body { margin: 0; padding: 0; background: #ffffff; }

    .planning-doc {
      font-family: ${D.fontFamily};
      font-size: ${D.baseSize};
      line-height: 1.3;
      color: ${D.gray};
      width: 100%;
      max-width: 165mm;
      margin: 0;
      text-align: left;
    }
    .planning-doc p { margin: 0 0 2px; }
    .planning-doc strong { font-weight: 700; }
    .planning-doc u { text-decoration: underline; }
    .planning-doc mark {
      padding: 0 1px;
      border-radius: 1px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .planning-doc img { height: auto; }
    .planning-doc img[src*="planning-header-logo"] { width: 34mm; max-width: 40%; }
    .planning-doc img[src*="planning-bon-sejour"] {
      display: block;
      width: 40mm;
      max-width: 45%;
      margin: 18px auto 0;
      page-break-inside: avoid;
    }
    .planning-doc p:has(img[src*="planning-header-logo"]) { margin-bottom: 12px; }

    .ProseMirror.planning-editor {
      font-family: ${D.fontFamily};
      font-size: ${D.baseSize};
      line-height: 1.3;
      color: ${D.gray};
      outline: none;
      min-height: 460px;
      max-width: 165mm;
      text-align: left;
    }
    .ProseMirror.planning-editor p { margin: 0 0 2px; }
    .ProseMirror.planning-editor strong { font-weight: 700; }
    .ProseMirror.planning-editor u { text-decoration: underline; }
    .ProseMirror.planning-editor mark { padding: 0 1px; border-radius: 1px; }
    .ProseMirror.planning-editor img { height: auto; }
    .ProseMirror.planning-editor img[src*="planning-header-logo"] { width: 150px; max-width: 45%; }
    .ProseMirror.planning-editor img[src*="planning-bon-sejour"] {
      display: block;
      width: 170px;
      max-width: 50%;
      margin: 14px auto 0;
    }
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
