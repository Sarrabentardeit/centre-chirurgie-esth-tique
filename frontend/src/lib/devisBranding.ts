/** En-tête et signature des devis PDF / éditeur. */
export const DEVIS_SIGNATURE = {
  cabinet: 'Cabinet du Dr Mehdi CHENNOUFI',
  specialty: 'Chirurgie Esthétique, Plastique et Réparatrice',
  tagline: 'SCULPTURE, SMOOTH & SMILE',
} as const

export const DEVIS_HEADER_SUBTITLE = `${DEVIS_SIGNATURE.cabinet} — ${DEVIS_SIGNATURE.specialty}`

export function buildDevisSignatureHtml(sigImgUrl: string): string {
  const { cabinet, specialty, tagline } = DEVIS_SIGNATURE
  return `
        <div class="signature-block">
          <div class="sig-name">${cabinet}</div>
          <div class="sig-sub">${specialty}</div>
          <div class="sig-tagline">${tagline}</div>
          <img class="sig-img" src="${sigImgUrl}" alt="Signature" onerror="this.style.display='none'"/>
          <div class="sig-line"></div>
        </div>`
}
