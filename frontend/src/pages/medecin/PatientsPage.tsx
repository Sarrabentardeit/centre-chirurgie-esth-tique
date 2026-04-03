import { useMemo, useState } from 'react'
import { Search, ChevronRight, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { useNavigate } from 'react-router-dom'
import { STATUS_LABELS, STATUS_COLORS, formatDate, formatRelative } from '@/lib/utils'
import type { DossierStatus } from '@/types'
import { useDemoStore } from '@/store/demoStore'
import { useAuthStore } from '@/store/authStore'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const STATUS_FILTERS: Array<{ key: DossierStatus | 'all'; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'formulaire_complete', label: 'À analyser' },
  { key: 'rapport_genere', label: 'Rapport généré' },
  { key: 'devis_envoye', label: 'Devis envoyé' },
  { key: 'date_reservee', label: 'RDV fixé' },
  { key: 'post_op', label: 'Post-Op' },
]

const SOURCE_ICONS: Record<string, string> = {
  instagram: '📷',
  whatsapp: '💬',
  google: '🔍',
  direct: '🏥',
}

export default function PatientsPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<DossierStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const createLocalPatient = useDemoStore((s) => s.createLocalPatient)
  const [form, setForm] = useState({
    prenom: '',
    nom: '',
    email: '',
    phone: '',
    ville: '',
    pays: 'Algérie',
    sourceContact: 'direct' as 'whatsapp' | 'instagram' | 'google' | 'direct',
  })
  const [formError, setFormError] = useState<string | null>(null)

  const patients = useDemoStore((s) => s.patients)

  const filtered = patients.filter((p) => {
    const matchSearch =
      search === '' ||
      `${p.prenom} ${p.nom}`.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  const canSubmitCreate = useMemo(() => {
    return (
      form.prenom.trim().length > 1 &&
      form.nom.trim().length > 1 &&
      form.phone.trim().length > 5 &&
      form.ville.trim().length > 1 &&
      form.pays.trim().length > 1
    )
  }, [form.nom, form.pays, form.phone, form.prenom, form.ville])

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold">Patients</h2>
            <p className="text-sm text-muted-foreground">{patients.length} dossiers au total</p>
        </div>
        <Button variant="brand" size="sm" onClick={() => setShowCreate((v) => !v)}>
          + Nouveau dossier
        </Button>
      </div>

      {showCreate && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Créer un dossier local (consultation)</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Sans demande en ligne. Les champs marqués * sont obligatoires.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prénom *</Label>
                <Input
                  value={form.prenom}
                  onChange={(e) => setForm((f) => ({ ...f, prenom: e.target.value }))}
                  placeholder="Amira"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nom *</Label>
                <Input
                  value={form.nom}
                  onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                  placeholder="Benali"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Téléphone *</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+213 555 123 456"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email (optionnel)</Label>
                <Input
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="patiente@email.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ville *</Label>
                <Input
                  value={form.ville}
                  onChange={(e) => setForm((f) => ({ ...f, ville: e.target.value }))}
                  placeholder="Alger"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Pays *</Label>
                <Input
                  value={form.pays}
                  onChange={(e) => setForm((f) => ({ ...f, pays: e.target.value }))}
                  placeholder="Algérie"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Source de contact</Label>
                <Select
                  value={form.sourceContact}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, sourceContact: v as 'whatsapp' | 'instagram' | 'google' | 'direct' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="direct">Direct (consultation)</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formError && (
              <div className="text-xs rounded-md border border-destructive/20 bg-destructive/10 text-destructive px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Annuler
              </Button>
              <Button
                variant="brand"
                disabled={!canSubmitCreate}
                onClick={() => {
                  setFormError(null)
                  if (!canSubmitCreate) {
                    setFormError('Veuillez remplir tous les champs obligatoires.')
                    return
                  }

                  const created = createLocalPatient({
                    prenom: form.prenom,
                    nom: form.nom,
                    email: form.email || undefined,
                    phone: form.phone,
                    ville: form.ville,
                    pays: form.pays,
                    sourceContact: form.sourceContact,
                  })

                  setShowCreate(false)
                  setForm({
                    prenom: '',
                    nom: '',
                    email: '',
                    phone: '',
                    ville: '',
                    pays: 'Algérie',
                    sourceContact: 'direct',
                  })

                  if (user?.role === 'medecin') {
                    navigate(`/medecin/patients/${created.id}`)
                  } else {
                    navigate(`/gestionnaire/devis/${created.id}`)
                  }
                }}
              >
                Créer le dossier local
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par nom, email..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                statusFilter === f.key
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'border-border text-muted-foreground hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              {f.label}
              {f.key !== 'all' && (
                <span className="ml-1.5 opacity-70">
                  {patients.filter((p) => p.status === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Patient List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Aucun patient trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
              {filtered.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-brand-200 group"
              onClick={() => {
                if (user?.role === 'medecin') {
                  navigate(`/medecin/patients/${patient.id}`)
                } else {
                  navigate(`/gestionnaire/devis/${patient.id}`)
                }
              }}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-brand-100 text-brand-700 font-semibold">
                      {patient.prenom[0]}{patient.nom[0]}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">
                        {patient.prenom} {patient.nom}
                      </p>
                      <span className="text-sm">{SOURCE_ICONS[patient.sourceContact]}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{patient.email}</span>
                      <span>•</span>
                      <span>{patient.ville}, {patient.pays}</span>
                      <span>•</span>
                      <span>Créé le {formatDate(patient.dateCreation)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right hidden sm:block">
                      <p className="text-xs text-muted-foreground">Dernière activité</p>
                      <p className="text-xs font-medium">{formatRelative(patient.derniereActivite)}</p>
                    </div>
                    <Badge className={`text-xs ${STATUS_COLORS[patient.status]}`}>
                      {STATUS_LABELS[patient.status]}
                    </Badge>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
