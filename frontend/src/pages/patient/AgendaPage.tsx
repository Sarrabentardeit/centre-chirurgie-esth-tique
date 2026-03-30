import { Calendar, Clock, MapPin, CheckCircle2, AlertCircle, Download, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { formatDate } from '@/lib/utils'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useMemo } from 'react'

const AVAILABLE_SLOTS = [
  { date: '2026-04-20', slots: ['09:00', '10:30', '14:00', '15:30'] },
  { date: '2026-04-21', slots: ['09:00', '11:00', '14:30'] },
  { date: '2026-04-22', slots: ['10:00', '14:00', '16:00'] },
  { date: '2026-04-28', slots: ['09:00', '10:00', '14:00', '15:00'] },
  { date: '2026-04-29', slots: ['09:30', '11:00', '15:00'] },
]

function formatICSDateUTC(d: Date) {
  // YYYYMMDDTHHMMSSZ
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function parseRdvStartUTC(dateStr: string, timeStr: string) {
  const [yyyy, mm, dd] = dateStr.split('-').map((x) => Number(x))
  const [HH, MM] = timeStr.split(':').map((x) => Number(x))
  // Interprétation en UTC pour éviter les décalages de fuseau dans la démo.
  return new Date(Date.UTC(yyyy, mm - 1, dd, HH, MM, 0))
}

function buildGoogleCalendarUrl(params: {
  text: string
  details: string
  location: string
  startUTC: Date
  endUTC: Date
}) {
  const dates = `${formatICSDateUTC(params.startUTC)}/${formatICSDateUTC(params.endUTC)}`
  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.text,
    dates,
    details: params.details,
    location: params.location,
    sf: 'true',
    output: 'xml',
  })
  return `https://calendar.google.com/calendar/render?${query.toString()}`
}

function buildICS(params: {
  uid: string
  summary: string
  description: string
  location: string
  startUTC: Date
  endUTC: Date
}) {
  const dtStamp = formatICSDateUTC(new Date())
  const dtStart = formatICSDateUTC(params.startUTC)
  const dtEnd = formatICSDateUTC(params.endUTC)

  // ICS RFC 5545 simple. (Pour la démo, pas de gestion du multi-ligne/escaping complexe.)
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CentreEst//FR
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${params.uid}
DTSTAMP:${dtStamp}
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${params.summary}
DESCRIPTION:${params.description}
LOCATION:${params.location}
END:VEVENT
END:VCALENDAR
`
}

export default function AgendaPage() {
  const { user } = useAuthStore()
  const patients = useDemoStore((s) => s.patients)
  const rdvStore = useDemoStore((s) => s.rdv)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const patientConfirmRdv = useDemoStore((s) => s.patientConfirmRdv)

  const patient = useMemo(() => {
    if (!user) return undefined
    return patients.find((p) => p.userId === user.id)
  }, [patients, user?.id])

  const rdvs = useMemo(() => {
    if (!patient) return []
    return rdvStore.filter((r) => r.patientId === patient.id)
  }, [rdvStore, patient?.id])

  const canBook = patient?.status === 'devis_accepte'

  const selectedDaySlots = AVAILABLE_SLOTS.find((d) => d.date === selectedDate)?.slots ?? []

  const handleConfirm = () => {
    if (selectedDate && selectedSlot) {
      if (patient) {
        patientConfirmRdv(patient.id, {
          date: selectedDate,
          heure: selectedSlot,
          type: 'intervention',
          notes: 'Réservation via démo frontend',
        })
      }
      setConfirmed(true)
    }
  }

  const downloadICSFor = (rdv: { id: string; date: string; heure: string; type: string }, overrideText?: string) => {
    const patientLabel = patient ? `${patient.prenom} ${patient.nom}` : 'Patient'
    const startUTC = parseRdvStartUTC(rdv.date, rdv.heure)
    const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000) // 60min démo

    const summary = overrideText ?? `Rendez-vous (${rdv.type}) — ${patientLabel}`
    const description = `Clinique Alger Centre. Patient: ${patientLabel}.`
    const location = 'Clinique Alger Centre'

    const ics = buildICS({
      uid: `${rdv.id}@centre-est`,
      summary,
      description,
      location,
      startUTC,
      endUTC,
    })

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `rdv-${rdv.date}-${rdv.heure}.ics`
    a.click()
    URL.revokeObjectURL(url)
  }

  const googleUrlFor = (rdv: { date: string; heure: string; type: string }) => {
    const patientLabel = patient ? `${patient.prenom} ${patient.nom}` : 'Patient'
    const startUTC = parseRdvStartUTC(rdv.date, rdv.heure)
    const endUTC = new Date(startUTC.getTime() + 60 * 60 * 1000)
    return buildGoogleCalendarUrl({
      text: `Rendez-vous (${rdv.type})`,
      details: `Clinique Alger Centre. Patient: ${patientLabel}.`,
      location: 'Clinique Alger Centre',
      startUTC,
      endUTC,
    })
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Existing appointments */}
      {rdvs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Rendez-vous programmés
          </h3>
          {rdvs.map((rdv) => (
            <Card key={rdv.id} className="border-l-4 border-l-brand-500">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-brand-600" />
                      <p className="font-semibold">{formatDate(rdv.date)}</p>
                      <span className="text-muted-foreground">à {rdv.heure}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>Clinique — Alger Centre</span>
                    </div>
                    {rdv.notes && (
                      <p className="text-xs text-muted-foreground mt-1">{rdv.notes}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={rdv.statut === 'confirme' ? 'success' : 'warning'}
                      className="gap-1"
                    >
                      {rdv.statut === 'confirme' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <Clock className="h-3 w-3" />
                      )}
                      {rdv.statut === 'confirme' ? 'Confirmé' : 'En attente'}
                    </Badge>
                    <Badge variant="outline" className="capitalize">{rdv.type}</Badge>
                  </div>
                    <div className="flex items-center gap-2 mt-2 sm:mt-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={!patient}
                        onClick={() => downloadICSFor(rdv)}
                      >
                        <Download className="h-4 w-4" />
                        ICS
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        disabled={!patient}
                        asChild={false}
                        onClick={() => {
                          if (!patient) return
                          const url = googleUrlFor(rdv)
                          window.open(url, '_blank', 'noopener,noreferrer')
                        }}
                      >
                        <ExternalLink className="h-4 w-4" />
                        Google
                      </Button>
                    </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New appointment booking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-5 w-5 text-brand-600" />
            Réserver une date
          </CardTitle>
        </CardHeader>
        <CardContent>
          {confirmed ? (
            <div className="text-center py-6 animate-fade-in">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 mx-auto mb-4">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-lg mb-1">Demande envoyée !</h3>
              <p className="text-sm text-muted-foreground">
                Votre demande de rendez-vous pour le{' '}
                <strong>{selectedDate && formatDate(selectedDate)}</strong> à{' '}
                <strong>{selectedSlot}</strong> a été transmise à l'équipe.
                Vous recevrez une confirmation par notification.
              </p>
              {selectedDate && selectedSlot && patient && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    variant="brand"
                    className="gap-2"
                    onClick={() => {
                      const url = googleUrlFor({ date: selectedDate, heure: selectedSlot, type: 'intervention' })
                      window.open(url, '_blank', 'noopener,noreferrer')
                    }}
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ajouter à Google
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => downloadICSFor({ id: 'new', date: selectedDate, heure: selectedSlot, type: 'intervention' })}
                  >
                    <Download className="h-4 w-4" />
                    Télécharger ICS
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Date selection */}
              <div>
                <p className="text-sm font-medium mb-3">Choisissez une date disponible</p>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_SLOTS.map(({ date }) => (
                    <button
                      key={date}
                      onClick={() => {
                        setSelectedDate(date)
                        setSelectedSlot(null)
                      }}
                      className={cn(
                        'rounded-xl border px-4 py-3 text-sm font-medium transition-all',
                        selectedDate === date
                          ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-sm'
                          : 'border-border hover:border-brand-300 hover:bg-brand-50/50'
                      )}
                    >
                      <div className="font-semibold">{formatDate(date)}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {AVAILABLE_SLOTS.find((d) => d.date === date)?.slots.length} créneaux
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Slot selection */}
              {selectedDate && (
                <div className="animate-fade-in">
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
                            : 'border-border hover:border-brand-300'
                        )}
                      >
                        <Clock className="h-3.5 w-3.5" />
                        {slot}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Alert */}
              {selectedDate && selectedSlot && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Récapitulatif</p>
                    <p>
                      Consultation le <strong>{formatDate(selectedDate)}</strong> à{' '}
                      <strong>{selectedSlot}</strong> — Clinique Alger Centre
                    </p>
                  </div>
                </div>
              )}

              <Button
                variant="brand"
                size="lg"
                className="w-full"
                disabled={!selectedDate || !selectedSlot || !canBook}
                onClick={handleConfirm}
              >
                Confirmer la réservation
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
