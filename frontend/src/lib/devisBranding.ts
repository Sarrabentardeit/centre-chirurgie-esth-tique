/** En-tête, signature et pied de page des devis PDF / éditeur. */

export const DEVIS_SIGNATURE = {
  cabinet: 'Cabinet du Dr Mehdi CHENNOUFI',
  specialty: 'Chirurgie Esthétique, Plastique et Réparatrice',
  tagline: 'SCULPTURE, SMOOTH & SMILE',
} as const

export const DEVIS_CONTACT = {
  phone: '+216 27 626 300',
  email: 'plastic.surgery.drchennoufi1@gmail.com',
  address: '01 bis rue OMAR EL KHAYEM LA MARSA 2070',
} as const

export const DEVIS_HEADER_SUBTITLE = `${DEVIS_SIGNATURE.cabinet} — ${DEVIS_SIGNATURE.specialty}`

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

const ICON_PHONE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`

const ICON_MAIL = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`

const ICON_MAP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`

function contactLine(icon: string, text: string, href?: string): string {
  const inner = `${icon}<span>${text}</span>`
  if (href) {
    return `<a class="contact-line" href="${href}">${inner}</a>`
  }
  return `<div class="contact-line">${inner}</div>`
}

/** Bandeau coordonnées (pied de page) — fond sombre, texte blanc, icônes. */
export function buildDevisContactFooterHtml(): string {
  const { phone, email, address } = DEVIS_CONTACT
  return `
<div class="devis-contact-footer">
  ${contactLine(ICON_PHONE, phone, `tel:${phone.replace(/\s/g, '')}`)}
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
  return `${buildDevisSignatureHtml(sigImgUrl)}${buildDevisContactFooterHtml()}`
}
