import { useEffect, useMemo, useState } from 'react'
import { Search, Plus, Ban, Plane, ChevronLeft, ChevronRight, X, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { medecinApi, gestionnaireApi } from '@/lib/api'
import type { PatientListItem, RdvMedecin, AgendaEvent } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

type AgendaEventType = 'rdv' | 'blocked' | 'vacation'

const MOTIF_OPTIONS = [
  'Consultation initiale',
  'Bilan pré-opératoire',
  'Consultation post-opératoire',
  'Rhinoplastie',
  'Blépharoplastie',
  'Liposuccion',
  'Augmentation mammaire',
  'Lifting visage',
  'Abdominoplastie',
  'Autre',
]

type LocalAgendaEvent = {
  id: string
  medecinId: string
  date: string
  start: string
  end: string
  type: AgendaEventType
  title: string
  patientId?: string
  motif?: string
  notes?: string
  statut?: 'planifie' | 'confirme' | 'annule'
  _apiId?: string
}

const HOURS = Array.from({ length: 13 }, (_, i) => 8 + i) // 08:00 -> 20:00
type MoveProposal = {
  eventId: string
  targetDate: string
  targetStart: string
}

type RdnOverride = {
  date: string
  start: string
  end: string
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getWeekStart(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00`)
  const day = d.getDay() // 0 sunday
  const mondayOffset = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + mondayOffset)
  return d.toISOString().slice(0, 10)
}

function getHourFromTime(time: string): number {
  return Number((time || '00:00').split(':')[0] ?? 0)
}

function toMinutes(time: string): number {
  const [h, m] = (time || '00:00').split(':')
  return Number(h) * 60 + Number(m)
}

function toTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

interface AgendaMedecinPageProps {
  mode?: 'medecin' | 'gestionnaire'
}

export default function AgendaMedecinPage({ mode = 'medecin' }: AgendaMedecinPageProps) {
  const { user } = useAuthStore()
  const today = new Date().toISOString().slice(0, 10)
  const agendaApi = mode === 'gestionnaire' ? gestionnaireApi : medecinApi
  const normalizeRdvStatut = (s?: string): 'planifie' | 'confirme' | 'annule' =>
    s === 'confirme' || s === 'annule' ? s : 'planifie'

  // Real data from API
  const [apiPatients, setApiPatients] = useState<PatientListItem[]>([])
  const [apiRdv, setApiRdv]           = useState<RdvMedecin[]>([])
  const [apiMedecins, setApiMedecins] = useState<{ id: string; label: string }[]>([])

  // UI state (declared before useEffects to be available in closures)
  const [selectedMedecin, setSelectedMedecin] = useState<string>('')
  const [search, setSearch] = useState('')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const [viewMode, setViewMode] = useState<'week' | 'day'>(isMobile ? 'day' : 'week')
  const [anchorDate, setAnchorDate] = useState(today)
  const [localEvents, setLocalEvents] = useState<LocalAgendaEvent[]>([])
  const [quickType, setQuickType] = useState<'none' | 'rdv' | 'blocked' | 'vacation'>('none')
  const [cellPicker, setCellPicker] = useState<{ date: string; start: string; end: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [moveProposal, setMoveProposal] = useState<MoveProposal | null>(null)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [rdvOverrides, setRdvOverrides] = useState<Record<string, RdnOverride>>({})
  const [rdvStatusOverrides, setRdvStatusOverrides] = useState<Record<string, 'planifie' | 'confirme' | 'annule'>>({})
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [quickForm, setQuickForm] = useState({
    medecinId: '',
    patientId: '',
    date: today,
    start: '09:00',
    end: '10:00',
    motif: '',
    notes: '',
    confirmer: false,
  })
  const [currentAgendaMedecinId, setCurrentAgendaMedecinId] = useState<string>('')

  // Chargement initial : patients + liste des médecins (gestionnaire uniquement)
  useEffect(() => {
    void agendaApi.getPatients().then((r) => setApiPatients(r.patients)).catch(() => {})
    if (mode === 'gestionnaire') {
      void gestionnaireApi.getUsers({ role: 'medecin', pageSize: 100 })
        .then((r) => {
          const list = r.users.map((u) => ({ id: u.id, label: u.fullName }))
          setApiMedecins(list)
          // Auto-sélectionner le premier médecin
          if (list.length > 0) {
            setSelectedMedecin(list[0].id)
          }
        })
        .catch(() => {})
    }
  }, [mode])  // eslint-disable-line react-hooks/exhaustive-deps

  // Rechargement de l'agenda à chaque changement de médecin sélectionné
  useEffect(() => {
    if (mode === 'gestionnaire' && !selectedMedecin) return
    const targetMedecinId = mode === 'gestionnaire' ? selectedMedecin : undefined
    const mapEvents = (events: AgendaEvent[]) => {
      const mapped: LocalAgendaEvent[] = events.map((ev) => {
        const dateDebut = new Date(ev.dateDebut)
        const dateFin   = new Date(ev.dateFin)
        const date  = dateDebut.toISOString().slice(0, 10)
        const start = `${dateDebut.getHours().toString().padStart(2, '0')}:${dateDebut.getMinutes().toString().padStart(2, '0')}`
        const end   = `${dateFin.getHours().toString().padStart(2, '0')}:${dateFin.getMinutes().toString().padStart(2, '0')}`
        return {
          id: ev.id,
          medecinId: targetMedecinId ?? user?.id ?? '',
          date,
          start: ev.allDay ? '00:00' : start,
          end: ev.allDay ? '23:59' : end,
          type: ev.type === 'blocage' ? 'blocked' : ev.type === 'vacances' ? 'vacation' : 'rdv',
          title: ev.title ?? '',
          patientId: ev.patientId ?? undefined,
          motif: ev.motif ?? undefined,
          notes: ev.notes ?? undefined,
          statut: ev.statut ?? undefined,
          _apiId: ev.id,
        }
      })
      setLocalEvents(mapped.filter((e) => e.type !== 'rdv'))
    }

    if (mode === 'gestionnaire') {
      void gestionnaireApi.getAgenda({ medecinId: targetMedecinId }).then((r) => {
        setCurrentAgendaMedecinId(r.medecinId ?? targetMedecinId ?? '')
        setApiRdv(r.rdvs ?? [])
        mapEvents(r.events ?? [])
      }).catch(() => {})
    } else {
      void medecinApi.getAgenda().then((r) => {
        setCurrentAgendaMedecinId(user?.id ?? '')
        setApiRdv(r.rdvs ?? [])
        mapEvents(r.events ?? [])
      }).catch(() => {})
    }
  }, [user?.id, mode, selectedMedecin])  // eslint-disable-line react-hooks/exhaustive-deps

  const patients = apiPatients
  const rdv = apiRdv

  const medecins = useMemo(() => {
    if (mode === 'gestionnaire') return apiMedecins
    return user ? [{ id: user.id, label: user.name }] : []
  }, [mode, apiMedecins, user])

  const medecinDefault = selectedMedecin || medecins[0]?.id || ''

  const planned = useMemo(
    () =>
      rdv
        .filter((item) => {
          if (!search.trim()) return true
          const q = search.toLowerCase()
          return (item.patient?.user.fullName ?? '').toLowerCase().includes(q)
        })
        .slice()
        .sort((a, b) => {
          const da = `${a.date}T${a.heure}:00`
          const db = `${b.date}T${b.heure}:00`
          return new Date(da).getTime() - new Date(db).getTime()
        }),
    [rdv, search]
  )

  const events = useMemo(() => {
    // RDV réels depuis le backend (modifiables via rdvOverrides)
    const rdvEvents: LocalAgendaEvent[] = planned.map((item) => {
      const override = rdvOverrides[item.id]
      return {
        id: item.id,
        medecinId: currentAgendaMedecinId || user?.id || '',
        date: override?.date ?? item.date,
        start: override?.start ?? item.heure,
        end: override?.end ?? item.heure,
        type: 'rdv' as const,
        patientId: item.patient?.id,
        title: item.patient?.user.fullName ?? item.type,
        motif: item.motif ?? undefined,
        statut: rdvStatusOverrides[item.id] ?? normalizeRdvStatut(item.statut),
        _apiId: item.id,
      }
    })

    // Les localEvents ne contiennent que les événements de type blocage/vacances/nouveaux RDV
    // (les RDV API sont déjà dans rdvEvents, ne pas les dupliquer)
    const filteredLocal = localEvents.filter(
      (e) => !e._apiId || !planned.some((p) => p.id === e._apiId)
    )
    const scopedLocal = mode === 'gestionnaire'
      ? filteredLocal.filter((e) => !selectedMedecin || e.medecinId === selectedMedecin)
      : filteredLocal
    return [...rdvEvents, ...scopedLocal].sort((a, b) => {
      const da = `${a.date}T${a.start || '00:00'}:00`
      const db = `${b.date}T${b.start || '00:00'}:00`
      return new Date(da).getTime() - new Date(db).getTime()
    })
  }, [localEvents, planned, rdvOverrides, rdvStatusOverrides, user?.id, mode, selectedMedecin, currentAgendaMedecinId])

  const weekDays = useMemo(() => {
    const start = getWeekStart(anchorDate)
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [anchorDate])

  const visibleDays = viewMode === 'day' ? [anchorDate] : weekDays

  const collisionSet = useMemo(() => {
    const set = new Set<string>()
    const byDate = new Map<string, LocalAgendaEvent[]>()
    events
      .filter((e) => e.type !== 'vacation')
      .forEach((e) => {
        const arr = byDate.get(e.date) ?? []
        arr.push(e)
        byDate.set(e.date, arr)
      })

    byDate.forEach((list) => {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const a = list[i]
          const b = list[j]
          const aStart = toMinutes(a.start)
          const aEnd = Math.max(aStart + 30, toMinutes(a.end))
          const bStart = toMinutes(b.start)
          const bEnd = Math.max(bStart + 30, toMinutes(b.end))
          if (aStart < bEnd && bStart < aEnd) {
            set.add(a.id)
            set.add(b.id)
          }
        }
      }
    })
    return set
  }, [events])

  const quickStats = useMemo(
    () => ({
      rdv: events.filter((e) => e.type === 'rdv').length,
      blocked: events.filter((e) => e.type === 'blocked').length,
      vacation: events.filter((e) => e.type === 'vacation').length,
    }),
    [events]
  )

  const canSubmitQuick =
    quickForm.medecinId &&
    quickForm.date &&
    (quickType === 'vacation' || (quickForm.start && quickForm.end)) &&
    (quickType !== 'rdv' || quickForm.patientId)

  const selectedEvent = useMemo(
    () => (selectedEventId ? events.find((e) => e.id === selectedEventId) ?? null : null),
    [events, selectedEventId]
  )

  const shiftRange = (direction: 'prev' | 'next') => {
    const delta = viewMode === 'week' ? 7 : 1
    setAnchorDate(addDays(anchorDate, direction === 'next' ? delta : -delta))
  }

  const getRdvStatus = (rdvId: string, fallback?: 'planifie' | 'confirme' | 'annule') =>
    rdvStatusOverrides[rdvId] ?? fallback ?? 'planifie'

  const applyMoveProposal = () => {
    if (!moveProposal) return
    const movedLocal = localEvents.find((e) => e.id === moveProposal.eventId)
    const movedEvent = events.find((e) => e.id === moveProposal.eventId)
    const movedRdv = rdv.find((r) => r.id === moveProposal.eventId)
    const proposal = moveProposal
    const isApiRdv = planned.some((p) => p.id === proposal.eventId)
    const apiId = movedEvent?._apiId ?? movedEvent?.id
    const duration = movedEvent ? Math.max(30, toMinutes(movedEvent.end) - toMinutes(movedEvent.start)) : 30
    const targetEnd = toTime(toMinutes(proposal.targetStart) + duration)
    if (movedLocal && !isApiRdv) {
      setLocalEvents((prev) =>
        prev.map((e) =>
          e.id === proposal.eventId ? { ...e, date: proposal.targetDate, start: proposal.targetStart, end: targetEnd } : e
        )
      )
    } else {
      // MAJ directe de la source rdv API pour feedback instantané
      setApiRdv((prev) =>
        prev.map((r) =>
          r.id === proposal.eventId
            ? { ...r, date: proposal.targetDate, heure: proposal.targetStart }
            : r
        )
      )
      setRdvOverrides((prev) => ({
        ...prev,
        [proposal.eventId]: {
          date: proposal.targetDate,
          start: proposal.targetStart,
          end: targetEnd,
        },
      }))
    }
    setMoveProposal(null)
    setDraggingId(null)

    // Persistance backend pour que le déplacement reste après refresh/navigation
    if (apiId && movedEvent) {
      const dateDebut = `${proposal.targetDate}T${proposal.targetStart}:00.000`
      const dateFin = `${proposal.targetDate}T${targetEnd}:00.000`
      void agendaApi.updateAgendaEvent(apiId, {
        dateDebut,
        dateFin,
      }).catch((err) => {
        // rollback léger en cas d'échec
        if (movedLocal) {
          setLocalEvents((prev) =>
            prev.map((e) =>
              e.id === proposal.eventId
                ? { ...e, date: movedEvent.date, start: movedEvent.start, end: movedEvent.end }
                : e
            )
          )
        } else {
          if (movedRdv) {
            setApiRdv((prev) =>
              prev.map((r) =>
                r.id === proposal.eventId
                  ? { ...r, date: movedRdv.date, heure: movedRdv.heure }
                  : r
              )
            )
          }
          setRdvOverrides((prev) => {
            const next = { ...prev }
            delete next[proposal.eventId]
            return next
          })
        }
        setMoveError(err instanceof Error ? err.message : "Impossible de déplacer le rendez-vous.")
      })
    }
  }

  const wouldCollide = (
    eventId: string,
    targetDate: string,
    targetStart: string,
    targetEnd: string,
    medecinId: string
  ) => {
    const startMin = toMinutes(targetStart)
    const endMin = Math.max(startMin + 30, toMinutes(targetEnd))
    return events.some((other) => {
      if (other.id === eventId) return false
      if (other.date !== targetDate) return false
      if (other.medecinId !== medecinId) return false
      if (other.type === 'vacation') return false
      const otherStart = toMinutes(other.start)
      const otherEnd = Math.max(otherStart + 30, toMinutes(other.end))
      return startMin < otherEnd && otherStart < endMin
    })
  }

  const adjustDuration = (eventId: string, deltaMinutes: number) => {
    const target = events.find((e) => e.id === eventId)
    if (!target || target.type === 'vacation') return
    const startMin = toMinutes(target.start)
    const endMinCurrent = Math.max(startMin + 30, toMinutes(target.end))
    const nextEnd = Math.min(20 * 60 + 30, Math.max(startMin + 30, endMinCurrent + deltaMinutes))
    const nextEndTime = toTime(nextEnd)
    if (wouldCollide(eventId, target.date, target.start, nextEndTime, target.medecinId)) {
      setMoveError("Impossible d'ajuster la durée: conflit avec un autre événement.")
      return
    }
    setMoveError(null)

    const localTarget = localEvents.find((e) => e.id === eventId)
    if (localTarget) {
      setLocalEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, end: nextEndTime } : e)))
      return
    }
    setRdvOverrides((prev) => {
      const current = prev[eventId]
      return {
        ...prev,
        [eventId]: {
          date: current?.date ?? target.date,
          start: current?.start ?? target.start,
          end: nextEndTime,
        },
      }
    })
  }

  const updateRdvStatus = (eventId: string, statut: 'planifie' | 'confirme' | 'annule') => {
    const target = events.find((e) => e.id === eventId && e.type === 'rdv')
    if (!target) return

    const apiId = target._apiId ?? target.id
    const localBefore = localEvents.find((e) => e.id === eventId)?.statut

    // MAJ immédiate pour les événements locaux (avant prochain refetch)
    setLocalEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, statut } : e))
    )

    // Optimistic UI
    setApiRdv((prev) =>
      prev.map((r) => (r.id === eventId ? { ...r, statut } : r))
    )
    setRdvStatusOverrides((prev) => ({ ...prev, [eventId]: statut }))

    void agendaApi.updateAgendaEvent(apiId, { statut }).catch((err) => {
      // Rollback en cas d'échec
      const current = rdv.find((r) => r.id === eventId)?.statut ?? 'planifie'
      setApiRdv((prev) =>
        prev.map((r) => (r.id === eventId ? { ...r, statut: current } : r))
      )
      setLocalEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, statut: localBefore } : e))
      )
      setRdvStatusOverrides((prev) => {
        const next = { ...prev }
        delete next[eventId]
        return next
      })
      setMoveError(err instanceof Error ? err.message : "Impossible de mettre à jour le statut du RDV.")
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Agenda médecin</h2>
        <p className="text-sm text-muted-foreground">
          Gestion globale des rendez-vous médecins et patientes.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {medecins.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedMedecin(m.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                  selectedMedecin === m.id
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button size="sm" variant={viewMode === 'week' ? 'brand' : 'outline'} onClick={() => setViewMode('week')} className="hidden sm:flex">
                Semaine
              </Button>
              <Button size="sm" variant={viewMode === 'day' ? 'brand' : 'outline'} onClick={() => setViewMode('day')}>
                Jour
              </Button>
              {viewMode === 'week' && (
                <Button size="sm" variant="outline" className="sm:hidden" onClick={() => setViewMode('week')}>
                  Semaine
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="icon" variant="outline" onClick={() => shiftRange('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
                className="h-8 w-[140px] text-xs"
              />
              <p className="text-xs font-medium text-center hidden sm:block min-w-[180px]">
                {viewMode === 'day'
                  ? formatDate(anchorDate)
                  : `${formatDate(visibleDays[0])} - ${formatDate(visibleDays[visibleDays.length - 1])}`}
              </p>
              <Button size="icon" variant="outline" onClick={() => shiftRange('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="Rechercher une patiente (nom ou email)..."
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'RDV',              value: quickStats.rdv },
              { label: 'Créneaux bloqués', value: quickStats.blocked },
              { label: 'Vacances',         value: quickStats.vacation },
            ].map(({ label, value }) => (
              <Card key={label}>
                <CardContent className="py-2 px-3">
                  <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-base sm:text-lg font-bold">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { type: 'rdv' as const,     icon: Plus,  label: 'Nouveau RDV',     labelShort: 'RDV' },
              { type: 'blocked' as const, icon: Ban,   label: 'Bloquer créneau', labelShort: 'Bloquer' },
              { type: 'vacation' as const,icon: Plane, label: 'Ajouter vacances',labelShort: 'Vacances' },
            ].map(({ type, icon: Icon, label, labelShort }) => (
              <Button
                key={type}
                size="sm"
                variant={quickType === type ? 'brand' : 'outline'}
                className="gap-1.5"
                onClick={() => {
                  setQuickType(type)
                  setQuickForm((f) => ({ ...f, medecinId: f.medecinId || medecinDefault }))
                }}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{labelShort}</span>
              </Button>
            ))}
          </div>

        </CardContent>
      </Card>

      {/* ── Mini-menu choix type d'événement ── */}
      {cellPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCellPicker(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-base font-bold">Nouvel événement</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(cellPicker.date)} · {cellPicker.start} – {cellPicker.end}
                </p>
              </div>
              <button onClick={() => setCellPicker(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3 space-y-2">
              {[
                {
                  type: 'rdv' as const,
                  icon: Calendar,
                  label: 'Rendez-vous patient',
                  desc: 'Consultation, bilan, suivi...',
                  color: 'hover:bg-brand-50 hover:border-brand-300',
                  iconColor: 'bg-brand-100 text-brand-700',
                },
                {
                  type: 'blocked' as const,
                  icon: Ban,
                  label: 'Bloquer ce créneau',
                  desc: 'Indisponibilité ponctuelle',
                  color: 'hover:bg-red-50 hover:border-red-200',
                  iconColor: 'bg-red-100 text-red-700',
                },
                {
                  type: 'vacation' as const,
                  icon: Plane,
                  label: 'Journée de vacances',
                  desc: 'Congé sur toute la journée',
                  color: 'hover:bg-slate-50 hover:border-slate-300',
                  iconColor: 'bg-slate-100 text-slate-600',
                },
              ].map(({ type, icon: Icon, label, desc, color, iconColor }) => (
                <button
                  key={type}
                  className={`w-full flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-left transition-all ${color}`}
                  onClick={() => {
                    setCellPicker(null)
                    setQuickType(type)
                    setQuickForm((f) => ({
                      ...f,
                      medecinId: f.medecinId || medecinDefault,
                      date: cellPicker.date,
                      start: cellPicker.start,
                      end: cellPicker.end,
                      motif: '',
                      notes: '',
                      confirmer: false,
                      patientId: '',
                    }))
                  }}
                >
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0" />
                </button>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-border">
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setCellPicker(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {quickType !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setQuickType('none')} />
          <div className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-lg font-bold">
                  {quickType === 'rdv' && 'Nouveau rendez-vous'}
                  {quickType === 'blocked' && 'Bloquer un créneau'}
                  {quickType === 'vacation' && 'Ajouter vacances'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {quickType === 'rdv' && 'Créer un RDV pour une patiente'}
                  {quickType === 'blocked' && 'Rendre un créneau indisponible'}
                  {quickType === 'vacation' && 'Marquer une journée complète'}
                </p>
              </div>
              <button onClick={() => setQuickType('none')} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5 max-h-[78vh] overflow-y-auto">

              {/* Médecin + Patiente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Médecin</Label>
                  <Select
                    value={quickForm.medecinId}
                    onValueChange={(value) => {
                      setQuickForm((f) => ({ ...f, medecinId: value }))
                      if (mode === 'gestionnaire') setSelectedMedecin(value)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir médecin" />
                    </SelectTrigger>
                    <SelectContent>
                      {medecins.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {quickType === 'rdv' && (
                  <div className="space-y-1.5">
                    <Label>Patiente</Label>
                    <Select
                      value={quickForm.patientId}
                      onValueChange={(value) => setQuickForm((f) => ({ ...f, patientId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choisir patiente" />
                      </SelectTrigger>
                      <SelectContent>
                        {patients.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.user.fullName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Motif du RDV */}
              {quickType === 'rdv' && (
                <div className="space-y-2">
                  <Label>Motif du rendez-vous <span className="text-destructive">*</span></Label>
                  <div className="flex flex-wrap gap-2">
                    {MOTIF_OPTIONS.map((motif) => (
                      <button
                        key={motif}
                        type="button"
                        onClick={() => setQuickForm((f) => ({ ...f, motif }))}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-all ${
                          quickForm.motif === motif
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700'
                        }`}
                      >
                        {motif}
                      </button>
                    ))}
                  </div>
                  {quickForm.motif === 'Autre' && (
                    <Input
                      placeholder="Précisez le motif..."
                      value={quickForm.notes}
                      onChange={(e) => setQuickForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  )}
                </div>
              )}

              {/* Date + Heure */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={quickForm.date}
                    onChange={(e) => setQuickForm((f) => ({ ...f, date: e.target.value }))}
                  />
                </div>
                {quickType !== 'vacation' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Début</Label>
                      <Input
                        type="time"
                        value={quickForm.start}
                        onChange={(e) => setQuickForm((f) => ({ ...f, start: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Fin</Label>
                      <Input
                        type="time"
                        value={quickForm.end}
                        onChange={(e) => setQuickForm((f) => ({ ...f, end: e.target.value }))}
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Notes libres */}
              {quickType !== 'vacation' && (
                <div className="space-y-1.5">
                  <Label>Notes (optionnel)</Label>
                  <textarea
                    rows={2}
                    placeholder="Instructions particulières, préparation, remarques..."
                    value={quickForm.notes}
                    onChange={(e) => setQuickForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  />
                </div>
              )}

              {/* Confirmation immédiate */}
              {quickType === 'rdv' && (
                <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setQuickForm((f) => ({ ...f, confirmer: !f.confirmer }))}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                      quickForm.confirmer ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                        quickForm.confirmer ? 'left-4' : 'left-0.5'
                      }`}
                    />
                  </button>
                  <div>
                    <p className="text-sm font-medium">Confirmer immédiatement</p>
                    <p className="text-xs text-muted-foreground">Le RDV sera marqué comme confirmé dès sa création</p>
                  </div>
                  {quickForm.confirmer && (
                    <span className="ml-auto text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Confirmé
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-border flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {quickForm.date && `${formatDate(quickForm.date)}${quickType !== 'vacation' ? ` · ${quickForm.start} - ${quickForm.end}` : ''}`}
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setQuickType('none')}>
                  Annuler
                </Button>
                <Button
                  variant="brand"
                  disabled={!canSubmitQuick || (quickType === 'rdv' && !quickForm.motif)}
                  onClick={() => {
                    if (!canSubmitQuick) return
                    const patient = patients.find((p) => p.id === quickForm.patientId)
                    const medecinName = medecins.find((m) => m.id === quickForm.medecinId)?.label ?? 'Médecin'
                    const title =
                      quickType === 'rdv'
                        ? patient?.user?.fullName ?? 'RDV patient'
                        : quickType === 'blocked'
                        ? `Créneau bloqué - ${medecinName}`
                        : `Vacances - ${medecinName}`
                    const localId = crypto.randomUUID()
                    const startTime = quickType === 'vacation' ? '00:00' : quickForm.start
                    const endTime   = quickType === 'vacation' ? '23:59' : quickForm.end
                    setLocalEvents((prev) => [
                      ...prev,
                      {
                        id: localId,
                        medecinId: quickForm.medecinId,
                        patientId: quickType === 'rdv' ? quickForm.patientId : undefined,
                        date: quickForm.date,
                        start: startTime,
                        end: endTime,
                        type: quickType,
                        title,
                        motif: quickType === 'rdv' ? quickForm.motif : undefined,
                        notes: quickForm.notes || undefined,
                        statut: quickType === 'rdv' ? (quickForm.confirmer ? 'confirme' : 'planifie') : undefined,
                      },
                    ])
                    // Persister aussi côté API (format ISO local sans timezone)
                    const dateDebutIso = `${quickForm.date}T${startTime}:00.000`
                    const dateFinIso   = `${quickForm.date}T${endTime}:00.000`
                    const eventBody = {
                      type: quickType === 'blocked' ? 'blocage' as const : quickType === 'vacation' ? 'vacances' as const : 'rdv' as const,
                      title,
                      motif: quickType === 'rdv' ? quickForm.motif : undefined,
                      dateDebut: dateDebutIso,
                      dateFin: dateFinIso,
                      allDay: quickType === 'vacation',
                      patientId: quickType === 'rdv' ? quickForm.patientId : undefined,
                      statut: quickType === 'rdv' ? (quickForm.confirmer ? 'confirme' as const : 'planifie' as const) : undefined,
                      notes: quickForm.notes || undefined,
                    }
                    const createPromise = mode === 'gestionnaire'
                      ? gestionnaireApi.createAgendaEvent(eventBody, {
                          medecinId: quickForm.medecinId || selectedMedecin || undefined,
                        })
                      : medecinApi.createAgendaEvent(eventBody)
                    void createPromise.then((res) => {
                      // Mettre à jour l'id local avec l'id API
                      setLocalEvents((prev) => prev.map((e) =>
                        e.id === localId ? { ...e, id: res.event.id, _apiId: res.event.id } : e
                      ))
                    }).catch(() => {})
                    setQuickType('none')
                    setQuickForm((f) => ({ ...f, motif: '', notes: '', confirmer: false, patientId: '' }))
                  }}
                >
                  {quickType === 'rdv' && quickForm.confirmer ? 'Ajouter et confirmer' : 'Ajouter'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agenda ({events.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {moveProposal && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 flex items-center justify-between gap-3">
              <p className="text-xs text-brand-700">
                Déplacer l'événement vers le <span className="font-semibold">{formatDate(moveProposal.targetDate)}</span> à{' '}
                <span className="font-semibold">{moveProposal.targetStart}</span> ?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setMoveProposal(null)}>
                  Annuler
                </Button>
                <Button size="sm" variant="brand" onClick={applyMoveProposal}>
                  Confirmer
                </Button>
              </div>
            </div>
          )}
          {moveError && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between gap-3">
              <span>{moveError}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setMoveError(null)}>
                Fermer
              </Button>
            </div>
          )}
          <div className="space-y-4">
              {/* Vacation strip — visible uniquement si des vacances existent dans la période */}
              {visibleDays.some((day) => events.some((e) => e.date === day && e.type === 'vacation')) && (
                <div className="grid gap-2" style={{ gridTemplateColumns: `90px repeat(${visibleDays.length}, minmax(0, 1fr))` }}>
                  <div className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide self-center">Journée</div>
                  {visibleDays.map((day) => {
                    const vacations = events.filter((e) => e.date === day && e.type === 'vacation')
                    return (
                      <div key={`vac-${day}`} className="rounded-md border border-slate-200 bg-slate-50 p-2 min-h-[38px]">
                        {vacations.length === 0 ? null : (
                          vacations.map((item) => (
                            <Badge key={item.id} variant="secondary" className="text-[10px] bg-slate-200 text-slate-700">
                              Vacances
                            </Badge>
                          ))
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Calendar grid */}
              <div className="rounded-lg border border-border overflow-x-auto">
                <div className="min-w-[760px]">
                  <div
                    className="grid bg-muted/40 border-b border-border"
                    style={{ gridTemplateColumns: `90px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                  >
                    <div className="px-2 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Heure</div>
                    {visibleDays.map((day) => {
                      const isDayVacation = events.some((e) => e.date === day && e.type === 'vacation')
                      const isDayToday = day === today
                      return (
                        <div key={`head-${day}`} className={`px-2 py-2 border-l border-border/60 ${isDayVacation ? 'bg-slate-100' : ''}`}>
                          <p className={`text-[11px] font-semibold uppercase tracking-wide ${isDayVacation ? 'text-slate-400' : 'text-muted-foreground'}`}>
                            {new Date(`${day}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'short' })}
                          </p>
                          <p className={`text-xs font-medium ${isDayToday ? 'text-brand-600 font-bold' : isDayVacation ? 'text-slate-400 line-through' : ''}`}>
                            {formatDate(day)}
                          </p>
                          {isDayVacation && (
                            <p className="text-[10px] text-slate-400 mt-0.5">Vacances</p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {HOURS.map((hour) => (
                    <div
                      key={`row-${hour}`}
                      className="grid border-b last:border-b-0 border-border/60"
                      style={{ gridTemplateColumns: `90px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                    >
                      <div className="px-2 py-3 text-xs text-muted-foreground font-medium">{`${hour.toString().padStart(2, '0')}:00`}</div>
                      {visibleDays.map((day) => {
                        const isVacation = events.some((e) => e.date === day && e.type === 'vacation')
                        const cellEvents = events.filter((e) => {
                          if (e.date !== day || e.type === 'vacation') return false
                          const eventHour = getHourFromTime(e.start)
                          return eventHour === hour
                        })
                        return (
                          <div
                            key={`cell-${day}-${hour}`}
                            className={`px-1.5 py-1.5 border-l border-border/60 min-h-[58px] space-y-1 relative ${
                              isVacation
                                ? 'bg-slate-100/80'
                                : draggingId ? 'bg-brand-50/30' : ''
                            }`}
                            onClick={() => {
                              if (draggingId) return
                              const start = `${hour.toString().padStart(2, '0')}:00`
                              const end = `${Math.min(hour + 1, 23).toString().padStart(2, '0')}:00`
                              setCellPicker({ date: day, start, end })
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault()
                              if (!draggingId) return
                              const targetStart = `${hour.toString().padStart(2, '0')}:00`
                              const dragged = events.find((ev) => ev.id === draggingId)
                              if (!dragged) return
                              const duration = Math.max(30, toMinutes(dragged.end) - toMinutes(dragged.start))
                              const targetEnd = toTime(toMinutes(targetStart) + duration)
                              if (wouldCollide(draggingId, day, targetStart, targetEnd, dragged.medecinId)) {
                                setMoveError("Déplacement refusé: créneau déjà occupé pour ce médecin.")
                                setDraggingId(null)
                                return
                              }
                              setMoveError(null)
                              setMoveProposal({ eventId: draggingId, targetDate: day, targetStart })
                            }}
                          >
                            {isVacation && hour === 8 && (
                              <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-slate-200/80 border border-slate-300">
                                <span className="text-[11px] font-semibold text-slate-600">Vacances — journée entière</span>
                              </div>
                            )}
                            {cellEvents.map((item) => {
                              const rdvItem = rdv.find((r) => r.id === item.id)
                              const patientLabel = item.patientId
                                ? patients.find((p) => p.id === item.patientId)?.user.fullName
                                : undefined
                              // Toujours prioriser l'override local pour affichage instantané
                              const rdvStatus: 'planifie' | 'confirme' | 'annule' =
                                rdvStatusOverrides[item.id] ??
                                item.statut ??
                                (rdvItem ? getRdvStatus(item.id, normalizeRdvStatut(rdvItem.statut)) : 'planifie')
                              const typeClass =
                                item.type === 'rdv'
                                  ? rdvStatus === 'confirme'
                                    ? 'bg-emerald-50 border-emerald-300'
                                    : rdvStatus === 'annule'
                                    ? 'bg-red-50 border-red-200 opacity-60'
                                    : 'bg-brand-50 border-brand-200'
                                  : 'bg-slate-100 border-slate-300'
                              const hasCollision = collisionSet.has(item.id)
                              return (
                                <button
                                  key={item.id}
                                  className={`w-full text-left rounded-md border px-2 py-1 ${typeClass} ${hasCollision ? 'ring-1 ring-amber-500 border-amber-400' : ''}`}
                                  title={`${item.start} - ${item.end} • ${item.title}`}
                                  draggable
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSelectedEventId(item.id)
                                  }}
                                  onDragStart={() => setDraggingId(item.id)}
                                  onDragEnd={() => setDraggingId(null)}
                                >
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[10px] font-semibold leading-tight truncate">
                                        {item.start}-{item.end} · {item.title}
                                      </p>
                                      {patientLabel && (
                                        <p className="text-[10px] text-muted-foreground truncate">{patientLabel}</p>
                                      )}
                                      {item.motif && (
                                        <p className="text-[10px] text-brand-700 truncate font-medium">{item.motif}</p>
                                      )}
                                    </div>
                                    {item.type !== 'vacation' && (
                                      <div className="flex gap-0.5 shrink-0">
                                        <span
                                          className="text-[10px] px-1 rounded bg-white/80 border border-border"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            e.preventDefault()
                                            adjustDuration(item.id, -30)
                                          }}
                                        >
                                          -
                                        </span>
                                        <span
                                          className="text-[10px] px-1 rounded bg-white/80 border border-border"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            e.preventDefault()
                                            adjustDuration(item.id, 30)
                                          }}
                                        >
                                          +
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {item.type === 'rdv' ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      {rdvStatus === 'confirme'
                                        ? 'Confirmé'
                                        : rdvStatus === 'annule'
                                        ? 'Annulé'
                                        : 'Planifié'}
                                    </p>
                                  ) : (
                                    <p className="text-[10px] text-red-700">Bloqué</p>
                                  )}
                                  {hasCollision && <p className="text-[10px] text-amber-700">Conflit horaire</p>}
                                  {item.type === 'rdv' && rdvStatus !== 'annule' && (
                                    <div className="mt-1 flex gap-1 flex-wrap">
                                      {rdvStatus !== 'confirme' && (
                                        <span
                                          className="cursor-pointer text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            e.preventDefault()
                                            updateRdvStatus(item.id, 'confirme')
                                          }}
                                        >
                                          ✓ Confirmer
                                        </span>
                                      )}
                                      <span
                                        className="cursor-pointer text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 font-medium"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          e.preventDefault()
                                          updateRdvStatus(item.id, 'annule')
                                        }}
                                      >
                                        ✕ Annuler RDV
                                      </span>
                                    </div>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
          </div>
        </CardContent>
      </Card>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/45" onClick={() => setSelectedEventId(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="text-base font-bold">Détails du rendez-vous</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(selectedEvent.date)} · {selectedEvent.start} - {selectedEvent.end}
                </p>
              </div>
              <button onClick={() => setSelectedEventId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Type</p>
                <p className="text-sm font-semibold">
                  {selectedEvent.type === 'rdv' ? 'Rendez-vous' : selectedEvent.type === 'blocked' ? 'Créneau bloqué' : 'Vacances'}
                </p>
              </div>

              {selectedEvent.type === 'rdv' && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Patiente</p>
                  <p className="text-sm font-semibold">
                    {selectedEvent.patientId
                      ? (patients.find((p) => p.id === selectedEvent.patientId)?.user.fullName ?? selectedEvent.title)
                      : selectedEvent.title}
                  </p>
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Statut</p>
                <p className="text-sm font-semibold capitalize">{selectedEvent.statut ?? 'planifie'}</p>
              </div>

              {selectedEvent.motif && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Motif</p>
                  <p className="text-sm">{selectedEvent.motif}</p>
                </div>
              )}

              {selectedEvent.notes && (
                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{selectedEvent.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
