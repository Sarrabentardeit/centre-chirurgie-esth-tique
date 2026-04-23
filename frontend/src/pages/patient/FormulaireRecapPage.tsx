import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText, CheckCircle2, Clock, AlertCircle, ChevronRight,
  User, Heart, Stethoscope, Camera, Calendar, MessageSquare,
  Edit3, RefreshCw, X, ZoomIn, ExternalLink, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { authApi, formulaireApi } from '@/lib/api'
import { formatSourceConnaissanceLabel } from '@/lib/sourceConnaissance'
import type { MeResponse } from '@/lib/api'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormulairePayload {
  dateNaissance?: string
  poids?: number
  taille?: number
  groupeSanguin?: string
  sourceContact?: string
  periodeSouhaitee?: string
  antecedentsMedicaux?: string[]
  traitementEnCours?: boolean
  traitementDetails?: string
  allergies?: string[]
  fumeur?: boolean
  detailsTabac?: string
  alcool?: boolean
  detailsAlcool?: string
  drogue?: boolean
  detailsDrogue?: string
  autresMaladiesChroniques?: string
  chirurgiesAnterieures?: boolean
  chirurgiesDetails?: string
  typeIntervention?: string[]
  descriptionDemande?: string
  attentes?: string
  accompagnant?: boolean
  photos?: string[]
  documentsPDF?: string[]
}

interface Formulaire {
  id: string
  status: 'draft' | 'submitted'
  submittedAt: string | null
  payload: FormulairePayload
}

// ─── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ src, name, onClose }: { src: string; name: string; onClose: () => void }) {
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-white text-sm font-medium truncate max-w-xs">{name}</span>
          <div className="flex items-center gap-2">
            <a
              href={src}
              download={name}
              className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-4 w-4" /> Télécharger
            </a>
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors ml-2">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {imageFailed ? (
          <div className="max-h-[80vh] w-full rounded-xl border border-white/20 bg-black/20 p-6 text-center text-white/90">
            <p className="text-sm mb-3">Impossible de prévisualiser cette image dans la lightbox.</p>
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline"
            >
              <ExternalLink className="h-4 w-4" />
              Ouvrir l'image dans un nouvel onglet
            </a>
          </div>
        ) : (
          <img
            src={src}
            alt={name}
            onError={() => setImageFailed(true)}
            className="max-h-[80vh] w-full object-contain rounded-xl shadow-2xl"
          />
        )}
      </div>
    </div>
  )
}

// ─── URL resolver ────────────────────────────────────────────────────────────
// Retourne null si le fichier n'a pas d'URL serveur (ancien format : juste nom)

function resolveFileUrl(p: string): string | null {
  if (p.startsWith('blob:')) return null
  if (p.startsWith('http://') || p.startsWith('https://')) return p
  if (p.startsWith('/')) {
    const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ?? 'http://localhost:4000'
    return `${base}${p}`
  }
  // Compat ancien format: nom de fichier nu -> /uploads/<filename>
  // Permet d'ouvrir les fichiers déjà stockés avant la migration d'URL.
  const base = (import.meta.env.VITE_API_URL as string | undefined)?.replace('/api', '') ?? 'http://localhost:4000'
  const cleanName = p.trim()
  if (!cleanName) return null
  return `${base}/uploads/${encodeURIComponent(cleanName)}`
}

// ─── Photo Grid ───────────────────────────────────────────────────────────────

function PhotoGrid({ photos }: { photos: string[] }) {
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({})

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
        {photos.map((p, i) => {
          const url = resolveFileUrl(p)
          const name = p.split('/').pop() ?? `photo-${i + 1}`

          if (!url) {
            return (
              <div
                key={i}
                className="aspect-square rounded-lg border border-dashed border-border bg-muted/40 flex flex-col items-center justify-center gap-1"
                title={name}
              >
                <Camera className="h-5 w-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground text-center px-1 truncate w-full text-center">{name}</span>
                <span className="text-[9px] text-muted-foreground/60">non disponible</span>
              </div>
            )
          }

          const failed = failedUrls[url] === true
          return (
            <div key={i} className="aspect-square rounded-lg overflow-hidden border border-border bg-muted">
              {failed ? (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 p-2 text-center">
                  <Camera className="h-5 w-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate w-full">{name}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ouvrir
                  </a>
                </div>
              ) : (
                <button
                  className="group relative h-full w-full"
                  onClick={() => setLightbox({ url, name })}
                >
                  <img
                    src={url}
                    alt={name}
                    onError={() => setFailedUrls((prev) => ({ ...prev, [url]: true }))}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                    <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )}
            </div>
          )
        })}
      </div>
      {lightbox && <Lightbox src={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}
    </>
  )
}

// ─── PDF List ─────────────────────────────────────────────────────────────────

function PdfList({ docs }: { docs: string[] }) {
  return (
    <div className="space-y-2 mt-2">
      {docs.map((p, i) => {
        const url = resolveFileUrl(p)
        const name = p.split('/').pop() ?? `document-${i + 1}`

        return (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <FileText className="h-5 w-5 text-rose-500 shrink-0" />
            <span className="flex-1 text-sm text-foreground truncate">{name}</span>
            {url ? (
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Voir
                </a>
                <span className="text-muted-foreground">·</span>
                <a
                  href={url}
                  download={name}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> DL
                </a>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground shrink-0 italic">non disponible</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
  } catch {
    return iso
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value || value === '—') return null
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide sm:w-44 shrink-0">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function Pill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-xs font-medium text-foreground">
      {label}
    </span>
  )
}

function SectionCard({
  icon: Icon,
  title,
  color,
  children,
}: {
  icon: React.ElementType
  title: string
  color: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FormulaireRecapPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [meData, setMeData] = useState<MeResponse | null>(null)
  const [formulaire, setFormulaire] = useState<Formulaire | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [me, latest] = await Promise.all([
        authApi.me(),
        formulaireApi.getLatest(),
      ])
      setMeData(me)
      setFormulaire((latest.formulaire as Formulaire) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="p-6"><PageSkeleton /></div>

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground text-sm">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4 mr-2" /> Réessayer
        </Button>
      </div>
    )
  }

  const patient = meData?.patient
  const user = meData?.user
  const p = formulaire?.payload ?? {}

  // ── Status ─────────────────────────────────────────────────────────────────

  const isSubmitted = formulaire?.status === 'submitted'
  const isDraft = formulaire?.status === 'draft'
  const isEmpty = !formulaire

  return (
    <div className="space-y-6 p-6">

      {/* ── Bannière de statut ── */}
      {isSubmitted && (
        <div
          className="rounded-2xl p-5 shadow-sm relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 60%, #1a4a3a 100%)' }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 border border-emerald-400/30">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold" style={{ color: '#fdeada' }}>Formulaire soumis avec succès</p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(228,200,189,0.6)' }}>
                  Soumis le {formatDate(formulaire?.submittedAt)} · En cours d'examen par l'équipe médicale
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-white/20 text-white hover:bg-white/10 shrink-0"
              style={{ color: '#fdeada' }}
              onClick={() => navigate('/formulaire')}
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          </div>
        </div>
      )}

      {isDraft && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4">
          <Clock className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Formulaire en cours de remplissage</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Vous avez un brouillon enregistré. Finalisez-le pour que votre dossier soit traité.
            </p>
          </div>
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            onClick={() => navigate('/formulaire')}
          >
            Continuer <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 py-16 gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <FileText className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground">Aucun formulaire soumis</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Remplissez votre formulaire médical pour que l'équipe puisse étudier votre demande et vous envoyer un devis personnalisé.
            </p>
          </div>
          <Button onClick={() => navigate('/formulaire')}>
            <FileText className="h-4 w-4 mr-2" />
            Remplir le formulaire médical
          </Button>
        </div>
      )}

      {/* ── Contenu du formulaire soumis ── */}
      {formulaire && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Section 1 — Coordonnées */}
          <SectionCard icon={User} title="Vos coordonnées" color="bg-blue-500">
            <Row label="Nom complet" value={user?.name} />
            <Row label="Email" value={user?.email} />
            <Row label="Téléphone" value={patient?.phone} />
            <Row label="Ville" value={patient?.ville} />
            <Row label="Pays" value={patient?.pays} />
          </SectionCard>

          {/* Section 2 — Données personnelles */}
          <SectionCard icon={Calendar} title="Données personnelles" color="bg-violet-500">
            <Row label="Date de naissance" value={formatDate(p.dateNaissance ?? patient?.dateNaissance)} />
            <Row label="Poids" value={p.poids ? `${p.poids} kg` : undefined} />
            <Row label="Taille" value={p.taille ? `${p.taille} cm` : undefined} />
            <Row label="Groupe sanguin" value={p.groupeSanguin} />
            <Row
              label="Connaissance du Dr Chennoufi"
              value={p.sourceContact ? formatSourceConnaissanceLabel(p.sourceContact) : undefined}
            />
          </SectionCard>

          {/* Section 3 — Données médicales */}
          <SectionCard icon={Heart} title="Données médicales" color="bg-rose-500">
            {p.antecedentsMedicaux && p.antecedentsMedicaux.length > 0 && (
              <div className="py-2.5 border-b border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Antécédents médicaux</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.antecedentsMedicaux.map((a) => <Pill key={a} label={a} />)}
                </div>
              </div>
            )}
            <Row
              label="Traitement en cours"
              value={p.traitementEnCours
                ? (p.traitementDetails ? `Oui — ${p.traitementDetails}` : 'Oui')
                : 'Non'}
            />
            <Row
              label="Allergies"
              value={p.allergies && p.allergies.length > 0
                ? <div className="flex flex-wrap gap-1.5">{p.allergies.map((a) => <Pill key={a} label={a} />)}</div>
                : 'Aucune'}
            />
            <Row label="Tabac" value={p.fumeur ? (p.detailsTabac ? `Oui — ${p.detailsTabac}` : 'Oui') : 'Non'} />
            <Row label="Alcool" value={p.alcool ? (p.detailsAlcool ? `Oui — ${p.detailsAlcool}` : 'Oui') : 'Non'} />
            {p.autresMaladiesChroniques && (
              <Row label="Autres maladies" value={p.autresMaladiesChroniques} />
            )}
            {p.chirurgiesAnterieures && (
              <Row
                label="Chirurgies antérieures"
                value={p.chirurgiesDetails ? <span className="whitespace-pre-line">{p.chirurgiesDetails}</span> : 'Oui'}
              />
            )}
          </SectionCard>

          {/* Section 4 — Votre demande */}
          <SectionCard icon={Stethoscope} title="Votre demande" color="bg-teal-600">
            {p.typeIntervention && p.typeIntervention.length > 0 && (
              <div className="py-2.5 border-b border-border/50">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Interventions souhaitées
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {p.typeIntervention.map((i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ background: 'rgba(6,42,48,0.08)', color: '#062a30', border: '1px solid rgba(6,42,48,0.15)' }}
                    >
                      {i}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <Row label="Période souhaitée" value={p.periodeSouhaitee} />
            <Row
              label="Accompagnant (séjour)"
              value={
                p.accompagnant === true
                  ? 'Oui'
                  : p.accompagnant === false
                    ? 'Non'
                    : undefined
              }
            />
            <Row label="Description" value={p.descriptionDemande} />
            <Row label="Attentes" value={p.attentes !== p.descriptionDemande ? p.attentes : undefined} />
          </SectionCard>

          {/* Section 5 — Documents */}
          <SectionCard icon={Camera} title="Documents & Photos" color="bg-orange-500">
            {(!p.photos?.length && !p.documentsPDF?.length) ? (
              <p className="text-sm text-muted-foreground py-2">Aucun fichier joint</p>
            ) : (
              <>
                {p.photos && p.photos.length > 0 && (
                  <div className="pb-4 border-b border-border/50">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Photos ({p.photos.length}) — cliquez pour agrandir
                    </p>
                    <PhotoGrid photos={p.photos} />
                  </div>
                )}
                {p.documentsPDF && p.documentsPDF.length > 0 && (
                  <div className="pt-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Documents ({p.documentsPDF.length})
                    </p>
                    <PdfList docs={p.documentsPDF} />
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* Actions rapides */}
          <Card className="lg:col-span-2">
            <CardContent className="pt-5">
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => navigate('/formulaire')}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Modifier le formulaire
                </Button>
                <Button variant="outline" onClick={() => navigate('/patient/chat')}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Contacter l'équipe
                </Button>
                <Button variant="outline" onClick={() => navigate('/patient/dossier')}>
                  <FileText className="h-4 w-4 mr-2" />
                  Voir mon dossier
                </Button>
              </div>
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  )
}
