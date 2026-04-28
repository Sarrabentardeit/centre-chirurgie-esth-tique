import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  Search, CheckCircle2, Clock, X, AlertTriangle, Heart, Scissors,
  Save, RefreshCw, AlertCircle, DollarSign, StickyNote, ExternalLink,
  ClipboardPlus, Sparkles, FileText, ChevronDown, ChevronUp,
  Phone, Mail, MapPin, Activity, TrendingUp, Calendar,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from 'react-router-dom'
import { formatDate, formatRelative, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { medecinApi } from '@/lib/api'
import type { PatientListItem } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Rapport {
  id: string
  diagnostic: string | null
  examensDemandes?: string[]
  interventionsRecommandees: string[]
  valeurMedicale: string | null
  forfaitPropose: number | null
  nuitsClinique?: number | null
  anesthesieGenerale?: boolean | null
  notes: string | null
  createdAt: string
}

interface PatientWithRapport extends PatientListItem {
  rapport: Rapport | null
}

const EXAMEN_OPTIONS = [
  'Echographie mammaire ou mammographie',
  'Bilan sanguin complet (groupe sanguin, NFS, plaquettes, TP, TCA, HIV, Hépatite B/C, urée, créatinine, glycémie, iono, ASAT, ALAT)',
  'Echographie abdominale',
] as const

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
}

function completionScore(
  diagnostic: string,
  examensDemandes: string[],
  interventions: string,
  forfait: string,
  valeur: string,
  notes: string,
  nuitsClinique: string,
  anesthesieGenerale: boolean | null,
): number {
  const textFields = [diagnostic, interventions, forfait, valeur, notes, nuitsClinique, examensDemandes.length > 0 ? 'ok' : '']
  const filledText = textFields.filter((f) => f.trim().length > 0).length
  const filledAnesthesie = anesthesieGenerale !== null ? 1 : 0
  const totalFields = textFields.length + 1
  return Math.round(((filledText + filledAnesthesie) / totalFields) * 100)
}

function CompletionRing({ pct }: { pct: number }) {
  const r = 14
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = pct === 100 ? '#10b981' : pct >= 60 ? '#6366f1' : pct >= 20 ? '#f59e0b' : '#e2e8f0'
  return (
    <svg width="36" height="36" className="-rotate-90">
      <circle cx="18" cy="18" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="18" cy="18" r={r} fill="none"
        stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.4s ease' }}
      />
      <text
        x="18" y="18"
        textAnchor="middle" dominantBaseline="middle"
        className="rotate-90"
        style={{ rotate: '90deg', transformOrigin: '18px 18px', fontSize: 8, fontWeight: 700, fill: color }}
      >
        {pct}%
      </text>
    </svg>
  )
}

// ─── Section collapsible ──────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, color, open, onToggle, children }: {
  icon: React.ElementType; title: string; subtitle?: string
  color: string; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${open ? 'bg-muted/30' : 'hover:bg-muted/20'}`}
      >
        <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-3 border-t border-border/60 space-y-2">{children}</div>}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RapportsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [patients, setPatients] = useState<PatientWithRapport[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Rapport editor state
  const [diagnostic, setDiagnostic]       = useState('')
  const [examensDemandes, setExamensDemandes] = useState<string[]>([])
  const [interventions, setInterventions] = useState('')
  const [valeur, setValeur]               = useState('')
  const [forfait, setForfait]             = useState('')
  const [nuitsClinique, setNuitsClinique] = useState('')
  const [anesthesieGenerale, setAnesthesieGenerale] = useState<boolean | null>(null)
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [saved, setSaved]                 = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)

  // Sections ouvertes
  const [openSections, setOpenSections] = useState({
    diagnostic: true,
    examens: true,
    interventions: true,
    forfait: true,
    clinique: true,
    notes: false,
  })
  const toggleSection = (k: keyof typeof openSections) => setOpenSections((s) => ({ ...s, [k]: !s[k] }))

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await medecinApi.getPatients()
      const eligible = res.patients.filter((p) =>
        ['formulaire_complete', 'en_analyse', 'rapport_genere', 'devis_preparation',
          'devis_envoye', 'devis_accepte', 'date_reservee', 'intervention', 'post_op', 'suivi_termine'].includes(p.status)
      )
      const sorted: PatientWithRapport[] = eligible
        .map((p) => ({ ...p, rapport: null }))
        .sort((a, b) => {
          if (a.status === 'formulaire_complete' && b.status !== 'formulaire_complete') return -1
          if (b.status === 'formulaire_complete' && a.status !== 'formulaire_complete') return 1
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        })
      setPatients(sorted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleSelect = async (patientId: string) => {
    setSelectedId(patientId)
    setDiagnostic(''); setExamensDemandes([]); setInterventions(''); setValeur(''); setForfait('')
    setNuitsClinique(''); setAnesthesieGenerale(null); setNotes('')
    setSaved(false); setSaveError(null)
    setDrawerOpen(true)
    try {
      const res = await medecinApi.getPatient(patientId)
      const r = res.patient.rapports?.[0]
      if (r) {
        setDiagnostic(r.diagnostic ?? '')
        setExamensDemandes(r.examensDemandes ?? [])
        setInterventions((r.interventionsRecommandees ?? []).join('\n'))
        setValeur(r.valeurMedicale ?? '')
        setForfait(r.forfaitPropose?.toString() ?? '')
        setNuitsClinique(r.nuitsClinique != null ? String(r.nuitsClinique) : '')
        setAnesthesieGenerale(r.anesthesieGenerale ?? null)
        setNotes(r.notes ?? '')
        setPatients((prev) => prev.map((p) => p.id === patientId ? { ...p, rapport: r } : p))
      }
    } catch { /* silent */ }
  }

  const handleSave = async () => {
    if (!selectedId || !diagnostic.trim()) return
    setSaving(true); setSaveError(null)
    try {
      await medecinApi.upsertRapport(selectedId, {
        diagnostic,
        examensDemandes,
        interventionsRecommandees: interventions.split('\n').map((s) => s.trim()).filter(Boolean),
        valeurMedicale: valeur || undefined,
        forfaitPropose: forfait ? Number(forfait) : undefined,
        nuitsClinique: nuitsClinique === '' ? undefined : Number(nuitsClinique),
        anesthesieGenerale: anesthesieGenerale === null ? undefined : anesthesieGenerale,
        notes: notes || undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setPatients((prev) => prev.map((p) => p.id === selectedId
        ? {
            ...p,
            rapport: {
              id: '',
              diagnostic,
              examensDemandes,
              interventionsRecommandees: interventions.split('\n').filter(Boolean),
              valeurMedicale: valeur,
              forfaitPropose: forfait ? Number(forfait) : null,
              nuitsClinique: nuitsClinique === '' ? null : Number(nuitsClinique),
              anesthesieGenerale,
              notes,
              createdAt: new Date().toISOString(),
            },
          }
        : p))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return patients
    const q = search.toLowerCase()
    return patients.filter((p) =>
      p.user.fullName.toLowerCase().includes(q) ||
      p.dossierNumber.toLowerCase().includes(q) ||
      p.rapport?.diagnostic?.toLowerCase().includes(q)
    )
  }, [patients, search])

  const selected = patients.find((p) => p.id === selectedId) ?? null
  const pct = completionScore(diagnostic, examensDemandes, interventions, forfait, valeur, notes, nuitsClinique, anesthesieGenerale)

  const stats = {
    aAnalyser:   patients.filter((p) => p.status === 'formulaire_complete').length,
    total:       patients.filter((p) => p.rapport).length,
    avecForfait: patients.filter((p) => p.rapport?.forfaitPropose).length,
  }

  // ── Tableau ──────────────────────────────────────────────────────────────────

  function TableRow({ p }: { p: PatientWithRapport }) {
    const isSelected    = p.id === selectedId
    const hasRapport    = !!p.rapport
    const needsAnalysis = p.status === 'formulaire_complete'
    const rowPct = hasRapport
      ? completionScore(
          p.rapport!.diagnostic ?? '',
          p.rapport!.examensDemandes ?? [],
          (p.rapport!.interventionsRecommandees ?? []).join('\n'),
          p.rapport!.forfaitPropose?.toString() ?? '',
          p.rapport!.valeurMedicale ?? '',
          p.rapport!.notes ?? '',
          p.rapport!.nuitsClinique?.toString() ?? '',
          p.rapport!.anesthesieGenerale ?? null,
        )
      : 0

    return (
      <tr
        onClick={() => void handleSelect(p.id)}
        className={`cursor-pointer transition-colors border-b border-border/50 last:border-0
          ${isSelected ? 'bg-brand-50' : 'hover:bg-muted/40'}`}
      >
        {/* Patient */}
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className={`text-xs font-bold ${
                  needsAnalysis ? 'bg-amber-100 text-amber-700' :
                  hasRapport    ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-brand-100 text-brand-700'
                }`}>
                  {getInitials(p.user.fullName)}
                </AvatarFallback>
              </Avatar>
              {needsAnalysis && !hasRapport && (
                <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-500 border-2 border-white animate-pulse" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{p.user.fullName}</p>
              <p className="text-[11px] font-mono text-brand-600">{p.dossierNumber}</p>
            </div>
          </div>
        </td>

        {/* Statut */}
        <td className="px-3 py-3 hidden sm:table-cell">
          <Badge className={`text-[10px] whitespace-nowrap ${STATUS_COLORS[p.status as keyof typeof STATUS_COLORS] ?? ''}`}>
            {STATUS_LABELS[p.status as keyof typeof STATUS_LABELS] ?? p.status}
          </Badge>
        </td>

        {/* Completion */}
        <td className="px-3 py-3 hidden md:table-cell">
          {hasRapport ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-[80px]">
                <div
                  className={`h-full rounded-full transition-all ${
                    rowPct === 100 ? 'bg-emerald-500' : rowPct >= 60 ? 'bg-indigo-500' : 'bg-amber-400'
                  }`}
                  style={{ width: `${rowPct}%` }}
                />
              </div>
              <span className="text-[11px] text-muted-foreground font-medium">{rowPct}%</span>
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">—</span>
          )}
        </td>

        {/* Forfait */}
        <td className="px-3 py-3 hidden lg:table-cell">
          {p.rapport?.forfaitPropose ? (
            <span className="text-sm font-semibold text-brand-700">
              {p.rapport.forfaitPropose.toLocaleString('fr-TN')} TND
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>

        {/* Dernière modif */}
        <td className="px-3 py-3 hidden lg:table-cell">
          <span className="text-[11px] text-muted-foreground">{formatRelative(p.updatedAt)}</span>
        </td>

        {/* Action */}
        <td className="px-3 py-3 text-right">
          <Button
            size="sm"
            variant={isSelected ? 'brand' : hasRapport ? 'outline' : 'ghost'}
            className={`h-7 text-xs gap-1 ${!hasRapport && !isSelected ? 'text-amber-600 border border-amber-200 bg-amber-50 hover:bg-amber-100' : ''}`}
            onClick={(e) => { e.stopPropagation(); void handleSelect(p.id) }}
          >
            {hasRapport ? 'Modifier' : 'Rédiger'}
          </Button>
        </td>
      </tr>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 p-4 sm:p-6">

      {/* ── Header ── */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Rapports Médicaux</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {loading ? '—' : `${patients.length} patient(s) · ${stats.total} rapport(s) · ${stats.avecForfait} avec forfait`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Actualiser</span>
        </Button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          {
            label: 'Dossiers à analyser', value: stats.aAnalyser,
            icon: AlertTriangle, sub: 'Nécessitent un rapport',
            iconCls: stats.aAnalyser > 0 ? 'text-amber-600 bg-amber-100' : 'text-slate-400 bg-slate-100',
            cardCls: stats.aAnalyser > 0 ? 'border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/30' : 'border-slate-200 bg-slate-50',
            valCls: stats.aAnalyser > 0 ? 'text-amber-700' : 'text-slate-500',
            pulse: stats.aAnalyser > 0,
          },
          {
            label: 'Rapports rédigés', value: stats.total,
            icon: FileText, sub: 'Rapports enregistrés',
            iconCls: 'text-indigo-600 bg-indigo-100',
            cardCls: 'border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-purple-50/20',
            valCls: 'text-indigo-700', pulse: false,
          },
          {
            label: 'Avec forfait', value: stats.avecForfait,
            icon: TrendingUp, sub: 'Prêts pour devis',
            iconCls: 'text-emerald-600 bg-emerald-100',
            cardCls: 'border-emerald-100 bg-gradient-to-br from-emerald-50/60 to-teal-50/20',
            valCls: 'text-emerald-700', pulse: false,
          },
        ].map(({ label, value, icon: Icon, sub, iconCls, cardCls, valCls, pulse }) => (
          <div key={label} className={`relative rounded-2xl border px-5 py-4 flex items-center gap-4 ${cardCls}`}>
            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className={`text-2xl font-bold leading-none ${valCls}`}>{loading ? '—' : value}</p>
              <p className="text-xs font-semibold text-foreground mt-1">{label}</p>
              <p className="text-[11px] text-muted-foreground">{sub}</p>
            </div>
            {pulse && <span className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => void load()}>Réessayer</Button>
        </div>
      )}

      {/* ── Layout : tableau + drawer ── */}
      <div className={`flex gap-5 transition-all duration-300 ${drawerOpen ? 'items-start' : ''}`}>

        {/* ── TABLEAU ── */}
        <div className={`flex-1 min-w-0 rounded-2xl border border-border bg-card shadow-sm overflow-hidden transition-all duration-300 ${drawerOpen ? 'hidden lg:block' : ''}`}>

          {/* Barre recherche */}
          <div className="px-4 py-3 border-b border-border bg-muted/20 flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Rechercher un patient..."
                className="pl-8 h-8 text-sm bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setSearch('')}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
            <span className="text-xs text-muted-foreground hidden sm:block">
              {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Patient</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Statut</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Complétion</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Forfait</th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Activité</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-9 w-9 rounded-full shrink-0" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-2.5 w-20" />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden sm:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></td>
                      <td className="px-3 py-3 hidden md:table-cell"><Skeleton className="h-2 w-20 rounded-full" /></td>
                      <td className="px-3 py-3 hidden lg:table-cell"><Skeleton className="h-3.5 w-16" /></td>
                      <td className="px-3 py-3 hidden lg:table-cell"><Skeleton className="h-3 w-24" /></td>
                      <td className="px-3 py-3 text-right"><Skeleton className="h-7 w-16 rounded-md ml-auto" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <ClipboardPlus className="h-10 w-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">Aucun patient trouvé</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => <TableRow key={p.id} p={p} />)
                )}
              </tbody>
            </table>
          </div>

          {/* Footer tableau */}
          {!loading && patients.length > 0 && (
            <div className="px-4 py-2.5 border-t border-border/60 bg-muted/10 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{patients.length} patient(s) éligibles</p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> À rédiger</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" /> Complété</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" /> En cours</span>
              </div>
            </div>
          )}
        </div>

        {/* ── DRAWER / ÉDITEUR ── */}
        {drawerOpen && selected && (
          <div className="w-full lg:w-[480px] xl:w-[520px] shrink-0 rounded-2xl border border-border bg-card shadow-lg overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 140px)', position: 'sticky', top: 80 }}>

            {/* En-tête patient */}
            <div className="border-b border-border shrink-0" style={{ background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 60%, #1a4a3a 100%)' }}>
              <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-12 w-12 shrink-0 ring-2 ring-white/20">
                    <AvatarFallback className="bg-white/15 text-white font-bold text-sm">
                      {getInitials(selected.user.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-bold text-white text-base leading-tight truncate">{selected.user.fullName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] font-mono bg-white/10 text-white/80 px-2 py-0.5 rounded border border-white/20">
                        {selected.dossierNumber}
                      </span>
                      <Badge className={`text-[10px] ${STATUS_COLORS[selected.status as keyof typeof STATUS_COLORS] ?? ''}`}>
                        {STATUS_LABELS[selected.status as keyof typeof STATUS_LABELS] ?? selected.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="text-white/50 hover:text-white mt-0.5 shrink-0 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Infos compactes */}
              <div className="px-5 pb-3 flex items-center gap-4 flex-wrap">
                {selected.user.email && (
                  <span className="flex items-center gap-1 text-[11px] text-white/60">
                    <Mail className="h-3 w-3" />{selected.user.email}
                  </span>
                )}
                {selected.phone && (
                  <span className="flex items-center gap-1 text-[11px] text-white/60">
                    <Phone className="h-3 w-3" />{selected.phone}
                  </span>
                )}
                {(selected.ville || selected.pays) && (
                  <span className="flex items-center gap-1 text-[11px] text-white/60">
                    <MapPin className="h-3 w-3" />{[selected.ville, selected.pays].filter(Boolean).join(', ')}
                  </span>
                )}
              </div>

              {/* Barre de complétion */}
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-white/60 flex items-center gap-1">
                    <Activity className="h-3 w-3" /> Complétion du rapport
                  </span>
                  <span className={`text-[11px] font-bold ${pct === 100 ? 'text-emerald-400' : pct >= 60 ? 'text-indigo-300' : 'text-amber-300'}`}>
                    {pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct === 100 ? 'bg-emerald-400' : pct >= 60 ? 'bg-indigo-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Formulaire scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {saveError && (
                <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
                </div>
              )}

              {/* Diagnostic */}
              <Section
                icon={Heart} title="Diagnostic" color="bg-rose-100 text-rose-600"
                subtitle={diagnostic ? diagnostic.slice(0, 60) + (diagnostic.length > 60 ? '…' : '') : undefined}
                open={openSections.diagnostic} onToggle={() => toggleSection('diagnostic')}
              >
                <Textarea
                  rows={5}
                  placeholder="Évaluation clinique, diagnostic principal, observations morphologiques..."
                  value={diagnostic}
                  onChange={(e) => setDiagnostic(e.target.value)}
                  className="resize-none text-sm leading-relaxed"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-destructive">*</span> Champ obligatoire pour sauvegarder
                </p>
              </Section>

              {/* Examens demandés */}
              <Section
                icon={ClipboardPlus}
                title="Examens médicaux demandés"
                color="bg-sky-100 text-sky-700"
                subtitle={examensDemandes.length > 0 ? `${examensDemandes.length} examen(s) sélectionné(s)` : undefined}
                open={openSections.examens}
                onToggle={() => toggleSection('examens')}
              >
                <div className="space-y-2.5">
                  {EXAMEN_OPTIONS.map((opt) => {
                    const checked = examensDemandes.includes(opt)
                    return (
                      <label
                        key={opt}
                        className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors ${
                          checked ? 'border-sky-300 bg-sky-50/50' : 'border-border hover:bg-muted/30'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600"
                          checked={checked}
                          onChange={(e) => {
                            setExamensDemandes((prev) =>
                              e.target.checked ? [...prev, opt] : prev.filter((x) => x !== opt)
                            )
                          }}
                        />
                        <span className="text-sm text-foreground leading-relaxed">{opt}</span>
                      </label>
                    )
                  })}
                </div>
              </Section>

              {/* Interventions */}
              <Section
                icon={Scissors} title="Interventions recommandées" color="bg-purple-100 text-purple-600"
                subtitle={interventions ? interventions.split('\n').filter(Boolean).join(' · ').slice(0, 60) : undefined}
                open={openSections.interventions} onToggle={() => toggleSection('interventions')}
              >
                <Textarea
                  rows={5}
                  placeholder="Rhinoplastie&#10;Blépharoplastie&#10;Lifting cervico-facial&#10;Liposuccion abdominale..."
                  value={interventions}
                  onChange={(e) => setInterventions(e.target.value)}
                  className="resize-none text-sm leading-relaxed font-mono"
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Sparkles className="h-3 w-3" /> Une intervention par ligne
                </p>
              </Section>

              {/* Forfait */}
              <Section
                icon={DollarSign} title="Forfait & Valorisation" color="bg-brand-100 text-brand-600"
                subtitle={forfait ? `${Number(forfait).toLocaleString('fr-TN')} TND` : undefined}
                open={openSections.forfait} onToggle={() => toggleSection('forfait')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Forfait proposé (TND)</label>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="relative">
                        <Input
                          type="number" min={0} placeholder="0"
                          value={forfait} onChange={(e) => setForfait(e.target.value)}
                          className="w-[140px] text-lg font-bold h-11 pr-14"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">TND</span>
                      </div>
                      {forfait && Number(forfait) > 0 && (
                        <span className="text-base font-bold text-brand-700 bg-brand-50 border border-brand-200 px-3 py-1.5 rounded-lg">
                          {Number(forfait).toLocaleString('fr-TN')} TND
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">Sera pré-rempli dans le devis du gestionnaire.</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Valorisation médicale</label>
                    <Textarea
                      rows={3}
                      placeholder="Description technique des actes pour justification médicale..."
                      value={valeur}
                      onChange={(e) => setValeur(e.target.value)}
                      className="resize-none text-sm mt-1.5"
                    />
                  </div>
                </div>
              </Section>

              {/* Séjour clinique */}
              <Section
                icon={Calendar}
                title="Séjour clinique & anesthésie"
                color="bg-cyan-100 text-cyan-600"
                subtitle={
                  nuitsClinique || anesthesieGenerale !== null
                    ? `${nuitsClinique ? `${nuitsClinique} nuit(s)` : 'Nuits non précisées'} · ${
                        anesthesieGenerale === null ? 'Anesthésie non précisée' : anesthesieGenerale ? 'Anesthésie générale: oui' : 'Anesthésie générale: non'
                      }`
                    : undefined
                }
                open={openSections.clinique}
                onToggle={() => toggleSection('clinique')}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      Nombre de nuits en clinique
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        placeholder="Ex: 2"
                        value={nuitsClinique}
                        onChange={(e) => setNuitsClinique(e.target.value)}
                        className="w-[120px] h-10"
                      />
                      <span className="text-xs text-muted-foreground">nuit(s)</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">
                      Anesthésie générale
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAnesthesieGenerale(true)}
                        className={`h-9 px-4 rounded-lg border text-sm font-medium transition-colors ${
                          anesthesieGenerale === true
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Oui
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnesthesieGenerale(false)}
                        className={`h-9 px-4 rounded-lg border text-sm font-medium transition-colors ${
                          anesthesieGenerale === false
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Non
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnesthesieGenerale(null)}
                        className={`h-9 px-4 rounded-lg border text-sm font-medium transition-colors ${
                          anesthesieGenerale === null
                            ? 'border-slate-400 bg-slate-100 text-slate-700'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        Non précisé
                      </button>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Notes */}
              <Section
                icon={StickyNote} title="Notes complémentaires" color="bg-slate-100 text-slate-600"
                subtitle={notes ? notes.slice(0, 60) : 'Observations, contre-indications...'}
                open={openSections.notes} onToggle={() => toggleSection('notes')}
              >
                <Textarea
                  rows={4}
                  placeholder="Observations cliniques, contre-indications, recommandations pré/post-opératoires, remarques..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none text-sm leading-relaxed"
                />
              </Section>
            </div>

            {/* Footer actions */}
            <div className="px-4 py-3.5 border-t border-border bg-muted/10 shrink-0">
              {saveError && null}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {saved ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Rapport sauvegardé
                    </span>
                  ) : selected.rapport ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      {formatDate(selected.rapport.createdAt)} · Dr. {user?.name}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Non sauvegardé
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost" size="sm"
                    className="h-8 text-xs gap-1.5 text-muted-foreground"
                    onClick={() => navigate(`/medecin/patients/${selected.id}`)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Dossier</span>
                  </Button>
                  <Button
                    variant="brand" size="sm" className="h-8 gap-2"
                    onClick={() => void handleSave()}
                    disabled={!diagnostic.trim() || saving}
                  >
                    {saved
                      ? <><CheckCircle2 className="h-4 w-4" /> OK</>
                      : <><Save className="h-4 w-4" /> {saving ? 'Enreg...' : selected.rapport ? 'Mettre à jour' : 'Créer'}</>
                    }
                  </Button>
                </div>
              </div>

              {/* Complétion mini */}
              <div className="mt-2.5 flex items-center gap-2">
                <CompletionRing pct={pct} />
                <div className="flex-1">
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-indigo-500' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {pct === 100 ? 'Rapport complet ✓' : `${Math.max(0, 7 - Math.round((pct / 100) * 7))} champ(s) restant(s)`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
