import { useEffect, useState } from 'react'
import {
  Calendar, Clock, MapPin, CheckCircle2, AlertCircle,
  Download, ExternalLink, Lock, RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { patientApi, authApi } from '@/lib/api'
import type { RendezVous } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ─── Helpers ICS / Google ─────────────────────────────────────────────────────

function formatICSDateUTC(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function parseRdvStartUTC(dateStr: string, timeStr: string) {
  const [yyyy, mm, dd] = dateStr.split('-').map(Number)
  const [HH, MM] = timeStr.split(':').map(Number)
  return new Date(Date.UTC(yyyy, mm - 1, dd, HH, MM, 0))
}

function buildGoogleCalendarUrl(text: string, startUTC: Date, endUTC: Date) {
  const dates = `${formatICSDateUTC(startUTC)}/${formatICSDateUTC(endUTC)}`
  return `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE', text, dates,
    details: 'Cabinet Dr. Mehdi Chennoufi — Chirurgie Esthétique',
    location: 'Cabinet Dr. Mehdi Chennoufi',
    sf: 'true', output: 'xml',
  }).toString()}`
}

function buildICS(uid: string, summary: string, startUTC: Date, endUTC: Date) {
  const dtStamp = formatICSDateUTC(new Date())
  return `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//CentreEst//FR\nBEGIN:VEVENT\nUID:${uid}@centre-est\nDTSTAMP:${dtStamp}\nDTSTART:${formatICSDateUTC(startUTC)}\nDTEND:${formatICSDateUTC(endUTC)}\nSUMMARY:${summary}\nLOCATION:Cabinet Dr. Mehdi Chennoufi\nEND:VEVENT\nEND:VCALENDAR\n`
}

function downloadICS(rdv: { id: string; date: string; heure: string; type: string }) {
  const start = parseRdvStartUTC(rdv.date, rdv.heure)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  const ics = buildICS(rdv.id, `Rendez-vous ${rdv.type}`, start, end)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  a.download = `rdv-${rdv.date}.ics`
  a.click()
}

// ─── Status labels ────────────────────────────────────────────────────────────

const STATUS_STEPS: Record<string, string> = {
  nouveau:              "Soumettez d'abord votre formulaire médical.",
  formulaire_en_cours:  'Complétez votre formulaire médical.',
  formulaire_complete:  'Votre dossier est en cours d\'analyse par le médecin.',
  en_analyse:           'Votre dossier est en cours d\'analyse par le médecin.',
  rapport_genere:       'Le médecin a analysé votre dossier. Le devis est en cours de préparation.',
  devis_preparation:    'Le devis est en cours de préparation par l\'équipe.',
  devis_envoye:         'Veuillez accepter votre devis pour pouvoir réserver une date.',
}

const RDV_STATUT = {
  planifie:  { label: 'En attente',  variant: 'warning'  as const },
  confirme:  { label: 'Confirmé',    variant: 'success'  as const },
  annule:    { label: 'Annulé',      variant: 'destructive' as const },
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-4 p-6">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [rdvs, setRdvs]               = useState<RendezVous[]>([])
  const [patientStatus, setPatientStatus] = useState<string>('nouveau')
  const [availableSlots, setAvailableSlots] = useState<Array<{ date: string; slots: string[] }>>([])
  const [canBook, setCanBook]               = useState(false)
  const [bookingPolicyMessage, setBookingPolicyMessage] = useState<string>('')

  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [confirmed, setConfirmed]       = useState(false)
  const [booking, setBooking]           = useState(false)
  const [decisionLoadingId, setDecisionLoadingId] = useState<string | null>(null)
  const [rescheduleForId, setRescheduleForId] = useState<string | null>(null)
  const [rescheduleMessage, setRescheduleMessage] = useState('')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [rdvRes, meRes, slotsRes] = await Promise.all([
        patientApi.getRendezVous(),
        authApi.me(),
        patientApi.getAvailableRendezVousSlots(),
      ])
      setRdvs(rdvRes.rendezvous)
      setPatientStatus(meRes.patient?.status ?? 'nouveau')
      setAvailableSlots(slotsRes.slots ?? [])
      setCanBook(Boolean(slotsRes.canBook))
      setBookingPolicyMessage(
        slotsRes.reason ??
        "La prise de rendez-vous chirurgie est planifiée par la clinique. Notre gestionnaire vous contactera."
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const selectedDaySlots = availableSlots.find((d) => d.date === selectedDate)?.slots ?? []

  const handleReserve = async () => {
    if (!selectedDate || !selectedSlot || !canBook) return
    setBooking(true)
    setError(null)
    try {
      const res = await patientApi.reserveRendezVous({ date: selectedDate, heure: selectedSlot })
      setRdvs((prev) => [res.rdv, ...prev].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()))
      setPatientStatus('date_reservee')
      setConfirmed(true)
      // refresh dispo après réservation
      const slotsRes = await patientApi.getAvailableRendezVousSlots()
      setAvailableSlots(slotsRes.slots ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de réserver ce créneau.')
    } finally {
      setBooking(false)
    }
  }

  const handleAcceptDate = async (rdvId: string) => {
    setDecisionLoadingId(rdvId)
    setError(null)
    try {
      const res = await patientApi.respondRendezVous(rdvId, { decision: 'accepter' })
      setRdvs((prev) => prev.map((r) => (r.id === rdvId ? res.rdv : r)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de confirmer votre décision.')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  const handleAskAnotherDate = async (rdvId: string) => {
    setDecisionLoadingId(rdvId)
    setError(null)
    try {
      const res = await patientApi.respondRendezVous(rdvId, {
        decision: 'autre_date',
        message: rescheduleMessage.trim() || undefined,
      })
      setRdvs((prev) => prev.map((r) => (r.id === rdvId ? res.rdv : r)))
      setRescheduleForId(null)
      setRescheduleMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible d\'envoyer votre demande.')
    } finally {
      setDecisionLoadingId(null)
    }
  }

  if (loading) return <PageSkeleton />

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

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-6">

      {/* ── Bannière blocage ── */}
      {!canBook && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 flex items-start gap-3">
          <Lock className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-800">Réservation non disponible pour l'instant</p>
            <p className="text-sm text-blue-700 mt-0.5">
              {bookingPolicyMessage || STATUS_STEPS[patientStatus] || 'Veuillez compléter les étapes précédentes.'}
            </p>
            <p className="text-xs text-blue-600 mt-1.5">
              Votre rendez-vous sera confirmé directement par la gestionnaire ou le médecin.
            </p>
          </div>
        </div>
      )}

      {/* ── Rendez-vous existants ── */}
      {rdvs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Rendez-vous programmés
          </h3>
          {rdvs.map((rdv) => {
            const info = RDV_STATUT[rdv.statut] ?? RDV_STATUT.planifie
            const start = parseRdvStartUTC(rdv.date.slice(0, 10), rdv.heure)
            const end   = new Date(start.getTime() + 60 * 60 * 1000)
            const needsPatientDecision = rdv.statut === 'planifie' && !rdv.patientDecision
            const acceptedByPatient = rdv.statut === 'planifie' && rdv.patientDecision === 'accepte'
            const requestedReschedule = rdv.statut === 'planifie' && rdv.patientDecision === 'autre_date'
            return (
              <Card key={rdv.id} className="border-l-4 border-l-brand-500">
                <CardContent className="pt-4 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-brand-600" />
                        <p className="font-semibold">{formatDate(rdv.date.slice(0, 10))}</p>
                        <span className="text-muted-foreground">à {rdv.heure}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>Cabinet Dr. Mehdi Chennoufi</span>
                      </div>
                      {rdv.motif && (
                        <p className="text-xs text-muted-foreground">{rdv.motif}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={info.variant} className="gap-1">
                        {rdv.statut === 'confirme'
                          ? <CheckCircle2 className="h-3 w-3" />
                          : <Clock className="h-3 w-3" />}
                        {info.label}
                      </Badge>
                      <Badge variant="outline" className="capitalize">{rdv.type}</Badge>
                      <Button
                        variant="outline" size="sm" className="gap-1.5"
                        onClick={() => downloadICS({ id: rdv.id, date: rdv.date.slice(0, 10), heure: rdv.heure, type: rdv.type })}
                      >
                        <Download className="h-3.5 w-3.5" /> ICS
                      </Button>
                      <Button
                        variant="outline" size="sm" className="gap-1.5"
                        onClick={() => window.open(buildGoogleCalendarUrl(`Rendez-vous ${rdv.type}`, start, end), '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Google
                      </Button>
                    </div>
                  </div>

                  {acceptedByPatient && (
                    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                      Date acceptée. La gestionnaire confirmera le rendez-vous dans l'agenda.
                    </div>
                  )}

                  {requestedReschedule && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                      Votre demande d'une autre date a été envoyée à la gestionnaire.
                      {rdv.patientDecisionMessage ? ` Motif: ${rdv.patientDecisionMessage}` : ''}
                    </div>
                  )}

                  {needsPatientDecision && (
                    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-sm font-medium">Souhaitez-vous valider cette date ?</p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="brand"
                          size="sm"
                          disabled={decisionLoadingId === rdv.id}
                          onClick={() => void handleAcceptDate(rdv.id)}
                        >
                          Accepter la date
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={decisionLoadingId === rdv.id}
                          onClick={() => {
                            setRescheduleForId((prev) => (prev === rdv.id ? null : rdv.id))
                            setRescheduleMessage('')
                          }}
                        >
                          Demander une autre date
                        </Button>
                      </div>

                      {rescheduleForId === rdv.id && (
                        <div className="space-y-2">
                          <Textarea
                            rows={2}
                            value={rescheduleMessage}
                            onChange={(e) => setRescheduleMessage(e.target.value)}
                            placeholder="Précisez vos disponibilités (facultatif)..."
                          />
                          <Button
                            variant="brand-outline"
                            size="sm"
                            disabled={decisionLoadingId === rdv.id}
                            onClick={() => void handleAskAnotherDate(rdv.id)}
                          >
                            Envoyer la demande
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── Réservation (uniquement si libre-réservation active) ── */}
      {(canBook || availableSlots.length > 0) && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-600" />
            Prise de rendez-vous
          </CardTitle>
        </CardHeader>
        <CardContent>
          {confirmed ? (
            <div className="text-center py-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Demande envoyée !</h3>
              <p className="text-sm text-muted-foreground">
                Votre demande pour le <strong>{selectedDate && formatDate(selectedDate)}</strong> à{' '}
                <strong>{selectedSlot}</strong> a été transmise.
                Vous recevrez une confirmation.
              </p>
              {selectedDate && selectedSlot && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    variant="brand" className="gap-2"
                    onClick={() => {
                      const s = parseRdvStartUTC(selectedDate, selectedSlot!)
                      const e = new Date(s.getTime() + 60 * 60 * 1000)
                      window.open(buildGoogleCalendarUrl('Rendez-vous', s, e), '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <ExternalLink className="h-4 w-4" /> Ajouter à Google
                  </Button>
                  <Button
                    variant="outline" className="gap-2"
                    onClick={() => downloadICS({ id: 'new', date: selectedDate, heure: selectedSlot!, type: 'consultation' })}
                  >
                    <Download className="h-4 w-4" /> Télécharger ICS
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {!canBook && (
                <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  La planification de votre rendez-vous est réalisée par la clinique. Vous serez contactée avec une proposition de date.
                </div>
              )}
              <div>
                <p className="text-sm font-medium mb-3">Choisissez une date disponible</p>
                {availableSlots.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    Aucun créneau patient en libre-réservation.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSlots.map(({ date, slots: s }) => (
                      <button
                        key={date}
                        disabled={!canBook}
                        onClick={() => { setSelectedDate(date); setSelectedSlot(null) }}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                          !canBook && 'opacity-40 cursor-not-allowed',
                          selectedDate === date
                            ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                            : 'border-border hover:border-brand-300 hover:bg-brand-50/50',
                        )}
                      >
                        <div className="font-semibold">{formatDate(date)}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{s.length} créneaux</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedDate && (
                <div>
                  <p className="text-sm font-medium mb-3">Choisissez un créneau horaire</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedDaySlots.map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
                          selectedSlot === slot
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-border hover:border-brand-300',
                        )}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedDate && selectedSlot && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Récapitulatif</p>
                    <p>Le <strong>{formatDate(selectedDate)}</strong> à <strong>{selectedSlot}</strong> — Cabinet Dr. Mehdi Chennoufi</p>
                  </div>
                </div>
              )}

              <Button
                variant="brand" size="lg" className="w-full"
                disabled={!selectedDate || !selectedSlot || !canBook || booking}
                onClick={() => void handleReserve()}
              >
                {booking ? 'Confirmation...' : 'Confirmer la réservation'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  )
}
