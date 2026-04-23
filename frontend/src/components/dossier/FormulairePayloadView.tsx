import { useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, FileText, ImageOff } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'

function PhotoThumb({ url, fileName }: { url: string; fileName: string }) {
  const [error, setError] = useState(false)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative aspect-square rounded-lg border overflow-hidden bg-muted/30"
      title={fileName}
    >
      {error ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400 p-2">
          <ImageOff className="h-6 w-6 shrink-0" />
          <span className="text-[10px] text-center leading-tight truncate w-full">{fileName}</span>
        </div>
      ) : (
        <img
          src={url}
          alt={fileName}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={() => setError(true)}
        />
      )}
      {!error && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ExternalLink className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </a>
  )
}

export function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/50 last:border-0">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-muted-foreground text-sm min-w-[130px] shrink-0">{label}</span>
      <span className="text-sm font-medium ml-auto text-right">
        {value || <span className="text-muted-foreground/70">-</span>}
      </span>
    </div>
  )
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s.length > 0 ? s : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

export function resolveFormulaireFileUrl(value: string): string {
  if (!value?.trim()) return ''

  const apiBase = ((import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:4000/api')
    .replace(/\/api\/?$/, '')

  // URL complète (http:// ou https://) — on extrait le pathname pour le rebaser
  // sur le VITE_API_URL courant (corrige les URLs Docker internes comme http://backend:4000).
  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const { pathname } = new URL(value)
      if (pathname.startsWith('/uploads/')) return `${apiBase}${pathname}`
    } catch {
      // URL malformée — on la retourne telle quelle
    }
    return value
  }

  // Chemin absolu
  if (value.startsWith('/uploads/')) return `${apiBase}${value}`
  if (value.startsWith('/'))        return `${apiBase}${value}`

  // Chemin relatif commençant par uploads/
  if (value.startsWith('uploads/')) return `${apiBase}/${value}`

  // Nom de fichier seul
  return `${apiBase}/uploads/${value}`
}

export interface FormulairePayloadViewProps {
  status: string
  submittedAt: string | null
  createdAt?: string | null
  payload: Record<string, unknown>
  /** Sous-titre optionnel (ex. numéro de version) */
  subtitle?: string
  /** Afficher la ligne brouillon / soumis (désactiver si un titre parent existe déjà) */
  showStatusBanner?: boolean
}

export function FormulairePayloadView({
  status,
  submittedAt,
  createdAt,
  payload,
  subtitle,
  showStatusBanner = true,
}: FormulairePayloadViewProps) {
  const p = payload

  return (
    <div className="space-y-4">
      {showStatusBanner && (
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 px-4 py-2.5 text-sm">
        {status === 'submitted'
          ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          : <Clock className="h-4 w-4 text-amber-600 shrink-0" />}
        <span className="font-medium">
          {status === 'submitted' ? 'Formulaire soumis' : 'Brouillon'}
        </span>
        {submittedAt && (
          <span className="text-muted-foreground">le {formatDate(submittedAt)}</span>
        )}
        {createdAt && !submittedAt && (
          <span className="text-muted-foreground text-xs">Créé le {formatDate(createdAt)}</span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground ml-auto">{subtitle}</span>}
      </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Données personnelles</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Date de naissance" value={asString(p.dateNaissance)} />
            <InfoRow label="Poids" value={asString(p.poids) ? `${String(p.poids)} kg` : null} />
            <InfoRow label="Taille" value={asString(p.taille) ? `${String(p.taille)} cm` : null} />
            <InfoRow label="Groupe sanguin" value={asString(p.groupeSanguin)} />
            <InfoRow
              label="Connaissance Dr Chennoufi"
              value={
                asString(p.sourceContact)
                  ? formatSourceConnaissanceLabel(String(p.sourceContact))
                  : null
              }
            />
            <InfoRow label="Période souhaitée" value={asString(p.periodeSouhaitee)} />
            <InfoRow
              label="Accompagnant (séjour)"
              value={
                p.accompagnant === true
                  ? 'Oui'
                  : p.accompagnant === false
                    ? 'Non'
                    : null
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Données médicales</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Antécédents médicaux" value={asStringArray(p.antecedentsMedicaux).join(', ') || null} />
            <InfoRow label="Traitement en cours" value={p.traitementEnCours === true ? 'Oui' : p.traitementEnCours === false ? 'Non' : null} />
            <InfoRow label="Détails traitement" value={asString(p.traitementDetails)} />
            <InfoRow label="Allergies" value={asStringArray(p.allergies).join(', ') || null} />
            <InfoRow label="Fumeuse" value={p.fumeur === true ? 'Oui' : p.fumeur === false ? 'Non' : null} />
            <InfoRow label="Détails tabac" value={asString(p.detailsTabac)} />
            <InfoRow label="Alcool" value={p.alcool === true ? 'Oui' : p.alcool === false ? 'Non' : null} />
            <InfoRow label="Détails alcool" value={asString(p.detailsAlcool)} />
            <InfoRow label="Drogue" value={p.drogue === true ? 'Oui' : p.drogue === false ? 'Non' : null} />
            <InfoRow label="Détails drogue" value={asString(p.detailsDrogue)} />
            <InfoRow label="Autres maladies" value={asString(p.autresMaladiesChroniques)} />
            <InfoRow label="Chirurgies antérieures" value={p.chirurgiesAnterieures === true ? 'Oui' : p.chirurgiesAnterieures === false ? 'Non' : null} />
            <InfoRow label="Détails chirurgies" value={asString(p.chirurgiesDetails)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Demande du patient</CardTitle></CardHeader>
          <CardContent>
            <InfoRow label="Interventions souhaitées" value={asStringArray(p.typeIntervention).join(', ') || null} />
            <InfoRow label="Description demande" value={asString(p.descriptionDemande)} />
            <InfoRow label="Attentes" value={asString(p.attentes)} />
            <InfoRow label="Date souhaitée" value={asString(p.dateSouhaitee)} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Documents et photos</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Photos</p>
              {asStringArray(p.photos).length === 0 ? (
                <p className="text-sm text-muted-foreground">-</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {asStringArray(p.photos).map((photo, idx) => {
                    const url = resolveFormulaireFileUrl(photo)
                    const fileName = decodeURIComponent(url.split('/').pop() ?? `photo-${idx + 1}`)
                    return (
                      <PhotoThumb key={`${photo}-${idx}`} url={url} fileName={fileName} />
                    )
                  })}
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Documents</p>
              {asStringArray(p.documentsPDF).length === 0 ? (
                <p className="text-sm text-muted-foreground">-</p>
              ) : (
                <div className="space-y-2">
                  {asStringArray(p.documentsPDF).map((doc, idx) => {
                    const url = resolveFormulaireFileUrl(doc)
                    const fileName = decodeURIComponent(url.split('/').pop() ?? `document-${idx + 1}`)
                    return (
                      <a
                        key={`${doc}-${idx}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-muted/30 transition-colors"
                      >
                        <FileText className="h-4 w-4 text-rose-500 shrink-0" />
                        <span className="text-sm truncate flex-1">{fileName}</span>
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
