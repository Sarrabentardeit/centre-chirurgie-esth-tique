import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, UserPlus, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { medecinApi } from '@/lib/api'

export default function NouveauPatientPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    ville: '',
    pays: 'Tunisie',
    nationalite: '',
    sourceContact: 'medecin',
    noteMedicale: '',
  })

  const setField = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreate = async () => {
    if (!form.fullName.trim()) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await medecinApi.createPreDossier({
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        ville: form.ville.trim() || undefined,
        pays: form.pays.trim() || undefined,
        nationalite: form.nationalite.trim() || undefined,
        sourceContact: form.sourceContact.trim() || undefined,
        noteMedicale: form.noteMedicale.trim() || undefined,
      })
      setSuccess(`Pré-dossier créé: ${res.patient.dossierNumber}`)
      setTimeout(() => navigate(`/medecin/patients/${res.patient.id}`), 600)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de création.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Nouveau pré-dossier patient</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Création rapide par le médecin, sans compte patient actif.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/medecin/patients')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brand-600" />
            Informations initiales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Nom complet *</Label>
              <Input value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optionnel)</Label>
              <Input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Téléphone</Label>
              <Input value={form.phone} onChange={(e) => setField('phone', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Ville</Label>
              <Input value={form.ville} onChange={(e) => setField('ville', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Pays</Label>
              <Input value={form.pays} onChange={(e) => setField('pays', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nationalité</Label>
              <Input value={form.nationalite} onChange={(e) => setField('nationalite', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Source de contact</Label>
              <Input value={form.sourceContact} onChange={(e) => setField('sourceContact', e.target.value)} />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Note médicale initiale (optionnel)</Label>
              <Textarea
                rows={4}
                value={form.noteMedicale}
                onChange={(e) => setField('noteMedicale', e.target.value)}
                placeholder="Contexte clinique rapide..."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="brand"
              disabled={saving || !form.fullName.trim()}
              onClick={() => void handleCreate()}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Création...' : 'Créer le pré-dossier'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
