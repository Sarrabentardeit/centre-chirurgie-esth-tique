/** En-tête, signature et pied de page des devis PDF / éditeur. */

export const DEVIS_SIGNATURE = {
  cabinet: 'Cabinet du Dr Mehdi CHENNOUFI',
  specialty: 'Chirurgie Esthétique, Plastique et Réparatrice',
  tagline: 'SCULPTURE, SMOOTH & SMILE',
} as const

export const DEVIS_CONTACT = {
  phone: '54 776 796',
  email: 'plastic.surgery.drchennoufi1@gmail.com',
  address: '01 bis rue OMAR EL KHAYEM LA MARSA 2070',
} as const

/** Lien WhatsApp (indicatif Tunisie + numéro sans espaces). */
const DEVIS_WHATSAPP_HREF = 'https://wa.me/21654776796'

/** Sous-titre long (rétrocompat / affichages secondaires). */
export const DEVIS_HEADER_SUBTITLE = `${DEVIS_SIGNATURE.cabinet} — ${DEVIS_SIGNATURE.specialty}`

/** Sous-titre court pour l’en-tête PDF / aperçu (en-tête allégé). */
export const DEVIS_HEADER_SUBTITLE_SHORT = 'Dr Mehdi CHENNOUFI'

export const DEVIS_LOGO_SRC = '/devis-logo-chennoufi.png'

/** Logo + slogan sous le logo (en-tête devis). */
export function buildDevisHeaderLogoHtml(logoUrl = DEVIS_LOGO_SRC): string {
  const { tagline } = DEVIS_SIGNATURE
  return `
<div class="devis-logo-block">
  <img class="logo-img" src="${logoUrl}" alt="Dr Mehdi Chennoufi" onerror="this.style.display='none'"/>
  <p class="logo-slogan">${tagline}</p>
</div>`
}

/** Bloc droite de l’en-tête : référence + sous-titre court. */
export function buildDevisHeaderRightHtml(ref: string): string {
  return `
<div class="header-right">
  <div class="header-ref">${ref}</div>
  <div class="header-sub">${DEVIS_HEADER_SUBTITLE_SHORT}</div>
</div>`
}

const ICON_WHATSAPP = `<svg class="icon-whatsapp" viewBox="0 0 24 24" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`

const ICON_MAIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`

const ICON_MAP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`

function contactLine(icon: string, text: string, href?: string): string {
  const inner = `${icon}<span>${text}</span>`
  if (href) {
    return `<a class="contact-line" href="${href}" target="_blank" rel="noopener noreferrer">${inner}</a>`
  }
  return `<div class="contact-line">${inner}</div>`
}

/** Bandeau coordonnées (pied de page). */
export function buildDevisContactFooterHtml(): string {
  const { phone, email, address } = DEVIS_CONTACT
  return `
<div class="devis-contact-footer">
  ${contactLine(ICON_WHATSAPP, phone, DEVIS_WHATSAPP_HREF)}
  ${contactLine(ICON_MAIL, email, `mailto:${email}`)}
  ${contactLine(ICON_MAP, address)}
</div>`
}

export function buildDevisSignatureHtml(sigImgUrl: string): string {
  const { cabinet, specialty } = DEVIS_SIGNATURE
  return `
        <div class="signature-block">
          <div class="sig-name">${cabinet}</div>
          <div class="sig-sub">${specialty}</div>
          <img class="sig-img" src="${sigImgUrl}" alt="Signature" onerror="this.style.display='none'"/>
          <div class="sig-line"></div>
        </div>`
}

/** Fin de document : signature + coordonnées. */
export function buildDevisDocumentEndHtml(sigImgUrl: string): string {
  return `<div class="devis-footer-group">${buildDevisSignatureHtml(sigImgUrl)}${buildDevisContactFooterHtml()}</div>`
}

/** Hauteur d'une page A4 en px CSS @96dpi (marges 0) — cohérent avec htmlPdf.ts. */
export const DEVIS_PAGE_HEIGHT_PX = 1123

function collectSpacingTargets(root: Element): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('p, ul, ol, hr, .devis-heading, .section-hr, h1, h2, h3, h4'),
  )
}

function adjustVerticalRhythm(root: Element, deltaPx: number): void {
  const els = collectSpacingTargets(root)
  if (!els.length || !Number.isFinite(deltaPx) || deltaPx <= 0) return
  const per = deltaPx / els.length
  for (const el of els) {
    const current = parseFloat(getComputedStyle(el).marginBottom || '0') || 0
    el.style.marginBottom = `${current + per}px`
  }
}

/**
 * Découpe le devis en autant de feuilles A4 que nécessaire.
 * Le diagnostic long continue page après page ; l’offre et la signature
 * restent groupées en fin de document, sans masquer de contenu.
 */
export function layoutDevisForPrint(doc: Document, pageHeight = DEVIS_PAGE_HEIGHT_PX): void {
  if (doc.body.querySelector('.devis-sheet')) return

  const top = doc.querySelector<HTMLElement>('.devis-top')
  const closing = doc.querySelector<HTMLElement>('.devis-closing')
  const footer = doc.querySelector<HTMLElement>('.devis-footer-group')
  const headerCell = doc.querySelector<HTMLElement>('.page-table > thead > tr > td')
  if (!top || !closing || !headerCell) return

  const headerHtml = headerCell.innerHTML
  const topChildren = Array.from(top.children) as HTMLElement[]
  if (footer) footer.remove()
  const closingChildren = Array.from(closing.children) as HTMLElement[]

  const host = doc.createElement('div')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:794px;'
  doc.body.appendChild(host)

  const makeSheet = (isLast: boolean) => {
    const sheet = doc.createElement('div')
    sheet.className = isLast ? 'devis-sheet devis-sheet-last' : 'devis-sheet'
    sheet.style.cssText = `display:block;width:210mm;height:297mm;min-height:297mm;max-height:297mm;position:relative;overflow:hidden;box-sizing:border-box;background:#fff;page-break-after:${isLast ? 'auto' : 'always'};break-after:${isLast ? 'auto' : 'page'};page-break-inside:avoid;break-inside:avoid;`
    const header = doc.createElement('div')
    header.className = 'devis-sheet-header'
    header.innerHTML = headerHtml
    const body = doc.createElement('div')
    body.className = 'devis-sheet-body'
    body.style.overflow = 'hidden'
    sheet.appendChild(header)
    sheet.appendChild(body)
    return { sheet, header, body }
  }

  const probe = makeSheet(false)
  host.appendChild(probe.sheet)
  const headerH = probe.header.getBoundingClientRect().height
  probe.sheet.remove()

  const available = Math.max(360, pageHeight - headerH - 24)

  const measureBox = doc.createElement('div')
  measureBox.style.cssText = 'width:688px;'
  host.appendChild(measureBox)

  const measureHeight = (nodes: HTMLElement[]) => {
    measureBox.innerHTML = ''
    for (const n of nodes) measureBox.appendChild(n.cloneNode(true) as HTMLElement)
    return measureBox.getBoundingClientRect().height
  }

  const cloneListWith = (list: HTMLElement, items: Element[]) => {
    const wrap = list.cloneNode(false) as HTMLElement
    for (const item of items) wrap.appendChild(item.cloneNode(true))
    return wrap
  }

  const explodeNode = (node: HTMLElement): HTMLElement[] => {
    const h = measureHeight([node])
    if (h <= available) return [node]
    const tag = node.tagName.toLowerCase()
    const kids = Array.from(node.children) as HTMLElement[]
    if ((tag === 'ul' || tag === 'ol') && kids.length > 1) {
      const parts: HTMLElement[] = []
      let batch: HTMLElement[] = []
      for (const li of kids) {
        const trial = [...batch, li]
        if (batch.length && measureHeight([cloneListWith(node, trial)]) > available) {
          parts.push(cloneListWith(node, batch))
          batch = [li]
        } else {
          batch.push(li)
        }
      }
      if (batch.length) parts.push(cloneListWith(node, batch))
      return parts.length ? parts : [node]
    }
    if (kids.length > 1) {
      return kids.flatMap((k) => explodeNode(k))
    }
    return [node]
  }

  const pack = (nodes: HTMLElement[], pageAvail: number) => {
    const pages: HTMLElement[][] = []
    let cur: HTMLElement[] = []

    const textOf = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    const isTitleLike = (el: HTMLElement | undefined) => {
      if (!el) return false
      const tag = el.tagName.toLowerCase()
      if (tag === 'hr' || /^h[1-6]$/.test(tag)) return true
      const cls = String(el.className || '')
      if (/\b(devis-heading|diagnostic-op-title|section-title|devis-ref-title|section-hr)\b/.test(cls)) {
        return true
      }
      const text = textOf(el)
      if (!text) return true
      if (text.length <= 96 && /:\s*$/.test(text)) return true
      return false
    }
    const gatherGroup = (start: number) => {
      const group = [nodes[start]]
      let j = start + 1
      while (j < nodes.length && isTitleLike(nodes[j])) {
        group.push(nodes[j])
        j += 1
      }
      if (j < nodes.length && !isTitleLike(nodes[j])) group.push(nodes[j])
      return group
    }
    const peelTrailingTitles = (page: HTMLElement[]) => {
      const moved: HTMLElement[] = []
      while (page.length && isTitleLike(page[page.length - 1])) {
        moved.unshift(page.pop() as HTMLElement)
      }
      return moved
    }

    let i = 0
    while (i < nodes.length) {
      const group = isTitleLike(nodes[i]) ? gatherGroup(i) : [nodes[i]]
      if (cur.length && measureHeight([...cur, ...group]) > pageAvail) {
        const moved = peelTrailingTitles(cur)
        if (cur.length) pages.push(cur)
        cur = [...moved, ...group]
      } else {
        cur.push(...group)
      }
      i += group.length
    }
    if (cur.length) pages.push(cur)
    return pages
  }

  const topNodes = topChildren.flatMap((n) => explodeNode(n))
  const closingNodes = closingChildren.flatMap((n) => explodeNode(n))
  let pages = pack(topNodes, available)

  let footerReserve = 36
  if (footer) {
    host.appendChild(footer)
    footerReserve = Math.ceil(footer.getBoundingClientRect().height || 140) + 28
    footer.remove()
  }
  const lastAvail = Math.max(280, available - footerReserve)

  if (closingNodes.length) {
    const last = pages[pages.length - 1]
    if (last && measureHeight([...last, ...closingNodes]) <= lastAvail) {
      pages[pages.length - 1] = [...last, ...closingNodes]
    } else {
      pages = pages.concat(pack(closingNodes, lastAvail))
    }
  }
  if (!pages.length) pages = [[]]

  const sheets: HTMLElement[] = []
  for (let p = 0; p < pages.length; p++) {
    const isLast = p === pages.length - 1
    const made = makeSheet(isLast)
    host.appendChild(made.sheet)
    for (const n of pages[p]) made.body.appendChild(n)
    if (isLast && footer) {
      made.sheet.appendChild(footer)
      footer.style.position = 'absolute'
      footer.style.left = '14mm'
      footer.style.right = '14mm'
      footer.style.bottom = '8mm'
      footer.style.marginTop = '0'
      made.body.style.paddingBottom = `${footerReserve}px`
      const leftover = lastAvail - made.body.getBoundingClientRect().height
      if (leftover > 48) adjustVerticalRhythm(made.body, leftover * 0.35)
    }
    sheets.push(made.sheet)
  }

  doc.body.innerHTML = ''
  for (const s of sheets) doc.body.appendChild(s)
}

/** @deprecated Utiliser `layoutDevisForPrint`. */
export function pinDevisFooterBeforePrint(doc: Document): void {
  layoutDevisForPrint(doc)
}
