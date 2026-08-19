import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PhoneInputField, isTunisianPhone } from '@/components/ui/phone-input-field'
import { SOURCE_CONNAISSANCE_OPTIONS, isSourceConnaissance } from '@/lib/sourceConnaissance'

export type IdentityFicheValues = {
  fullName: string
  email: string
  phone: string
  ville: string
  pays: string
  nationalite: string
  sourceContact: string
}

export function IdentityFicheEditor({
  initial,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initial: IdentityFicheValues
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (values: IdentityFicheValues) => void
}) {
  const [form, setForm] = useState(initial)

  const set = (field: keyof IdentityFicheValues, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const phoneBlocked = isTunisianPhone(form.phone)
  const canSave = form.fullName.trim().length >= 2 && form.email.trim().includes('@') && !phoneBlocked && !saving

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Nom complet *</Label>
          <Input value={form.fullName} onChange={(e) => set('fullName', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Email *</Label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Téléphone</Label>
          <PhoneInputField
            compact
            value={form.phone}
            onChange={(v) => set('phone', v ?? '')}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Ville</Label>
          <Input value={form.ville} onChange={(e) => set('ville', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Pays</Label>
          <Input value={form.pays} onChange={(e) => set('pays', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Nationalité</Label>
          <Input value={form.nationalite} onChange={(e) => set('nationalite', e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Source</Label>
          <select
            value={form.sourceContact && isSourceConnaissance(form.sourceContact) ? form.sourceContact : ''}
            onChange={(e) => set('sourceContact', e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">— Aucune —</option>
            {SOURCE_CONNAISSANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1.5" />
          Annuler
        </Button>
        <Button type="button" variant="brand" onClick={() => onSave(form)} disabled={!canSave}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
