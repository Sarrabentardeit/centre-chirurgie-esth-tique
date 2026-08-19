import { useMemo, useState, type ReactNode } from 'react'
import { Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { SOURCE_CONNAISSANCE_OPTIONS, isSourceConnaissance } from '@/lib/sourceConnaissance'
import {
  ANTECEDENTS_MEDICAUX,
  GROUPES_SANGUINS,
  INTERVENTION_CATEGORIES,
  MOIS_PERIODE,
  buildPeriodeSouhaitee,
  parsePeriodeSouhaitee,
} from '@/lib/formulaireFields'

function asString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean)
}

function asBool(value: unknown): boolean {
  return value === true || value === 'Oui' || value === 'oui'
}

function parseNumString(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  if (Number.isFinite(n)) return String(Math.floor(n))
  return asString(value)
}

function currentYear(): number {
  return new Date().getFullYear()
}

type InterventionKey = (typeof INTERVENTION_CATEGORIES)[number]['key']

export function FormulairePayloadEditor({
  initialPayload,
  saving,
  error,
  onCancel,
  onSave,
}: {
  initialPayload: Record<string, unknown>
  saving: boolean
  error: string | null
  onCancel: () => void
  onSave: (payload: Record<string, unknown>) => void
}) {
  const p = initialPayload
  const periodeInit = parsePeriodeSouhaitee(
    asString(p.periodeSouhaitee) || asString(p.dateSouhaitee) || undefined,
  )

  const [dateNaissance, setDateNaissance] = useState(asString(p.dateNaissance))
  const [poids, setPoids] = useState(parseNumString(p.poids))
  const [taille, setTaille] = useState(parseNumString(p.taille))
  const [groupeSanguin, setGroupeSanguin] = useState(asString(p.groupeSanguin))
  const [sourceContact, setSourceContact] = useState(
    asString(p.sourceContact) && isSourceConnaissance(asString(p.sourceContact))
      ? asString(p.sourceContact)
      : '',
  )
  const [accompagnant, setAccompagnant] = useState(asBool(p.accompagnant))
  const [nbAdultes, setNbAdultes] = useState(parseNumString(p.nbAdultesAccompagnement))
  const [nbEnfants, setNbEnfants] = useState(parseNumString(p.nbEnfantsAccompagnement))

  const [antecedents, setAntecedents] = useState<string[]>(asStringArray(p.antecedentsMedicaux))
  const [traitementEnCours, setTraitementEnCours] = useState(asBool(p.traitementEnCours))
  const [traitementDetails, setTraitementDetails] = useState(asString(p.traitementDetails))
  const [allergies, setAllergies] = useState(asStringArray(p.allergies).join(', '))
  const [fumeur, setFumeur] = useState(asBool(p.fumeur))
  const [detailsTabac, setDetailsTabac] = useState(asString(p.detailsTabac))
  const [alcool, setAlcool] = useState(asBool(p.alcool))
  const [detailsAlcool, setDetailsAlcool] = useState(asString(p.detailsAlcool))
  const [drogue, setDrogue] = useState(asBool(p.drogue))
  const [detailsDrogue, setDetailsDrogue] = useState(asString(p.detailsDrogue))
  const [autresMaladiesChroniques, setAutresMaladiesChroniques] = useState(asString(p.autresMaladiesChroniques))
  const [chirurgiesAnterieures, setChirurgiesAnterieures] = useState(asBool(p.chirurgiesAnterieures))
  const [chirurgiesDetails, setChirurgiesDetails] = useState(asString(p.chirurgiesDetails))

  const [selectedInterventions, setSelectedInterventions] = useState<string[]>(
    asStringArray(p.typeIntervention).length
      ? asStringArray(p.typeIntervention)
      : asStringArray(p.interventionsSouhaitees),
  )
  const [activeCategory, setActiveCategory] = useState<InterventionKey>('visage')
  const [autresInterventionsDetails, setAutresInterventionsDetails] = useState(
    asString(p.autresInterventionsDetails),
  )
  const [descriptionDemande, setDescriptionDemande] = useState(
    asString(p.descriptionDemande) || asString(p.attentes),
  )
  const [periodeMois, setPeriodeMois] = useState(periodeInit.mois)
  const [periodeAnnee, setPeriodeAnnee] = useState(periodeInit.annee)

  const years = useMemo(() => {
    const y = currentYear()
    return [y, y + 1, y + 2, y + 3]
  }, [])

  const category = INTERVENTION_CATEGORIES.find((c) => c.key === activeCategory) ?? INTERVENTION_CATEGORIES[0]

  const toggleAntecedent = (item: string) => {
    setAntecedents((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]))
  }

  const toggleIntervention = (item: string) => {
    setSelectedInterventions((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    )
  }

  const handleSave = () => {
    const periode = buildPeriodeSouhaitee(periodeMois, periodeAnnee)
    const allergiesArr = allergies.split(',').map((x) => x.trim()).filter(Boolean)
    const payload: Record<string, unknown> = {
      ...initialPayload,
      dateNaissance: dateNaissance || undefined,
      poids: poids.trim() ? Number.parseInt(poids, 10) : undefined,
      taille: taille.trim() ? Number.parseInt(taille, 10) : undefined,
      groupeSanguin: groupeSanguin || undefined,
      sourceContact: sourceContact || undefined,
      accompagnant,
      antecedentsMedicaux: antecedents,
      diabete: antecedents.includes('Diabète'),
      maladieCardiaque: antecedents.includes('Maladie cardiaque'),
      traitementEnCours,
      traitementDetails: traitementEnCours ? traitementDetails || undefined : undefined,
      allergies: allergiesArr,
      fumeur,
      detailsTabac: fumeur ? detailsTabac || undefined : undefined,
      alcool,
      detailsAlcool: alcool ? detailsAlcool || undefined : undefined,
      drogue,
      detailsDrogue: drogue ? detailsDrogue || undefined : undefined,
      autresMaladiesChroniques: autresMaladiesChroniques || undefined,
      chirurgiesAnterieures,
      chirurgiesDetails: chirurgiesAnterieures ? chirurgiesDetails || undefined : undefined,
      typeIntervention: selectedInterventions,
      zonesConcernees: selectedInterventions,
      autresInterventionsDetails: autresInterventionsDetails.trim() || undefined,
      descriptionDemande: descriptionDemande || undefined,
      attentes: descriptionDemande || undefined,
      periodeSouhaitee: periode || undefined,
      dateSouhaitee: periode || asString(initialPayload.dateSouhaitee) || undefined,
    }
    if (accompagnant) {
      payload.nbAdultesAccompagnement = nbAdultes.trim() ? Number.parseInt(nbAdultes, 10) : 0
      payload.nbEnfantsAccompagnement = nbEnfants.trim() ? Number.parseInt(nbEnfants, 10) : 0
    } else {
      payload.nbAdultesAccompagnement = undefined
      payload.nbEnfantsAccompagnement = undefined
    }
    onSave(payload)
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
      )}
      <p className="text-xs text-slate-500">
        Corrigez les informations manquantes ou inexactes. Les photos et documents déjà envoyés sont conservés.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Données personnelles</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Field label="Date de naissance">
              <Input type="date" value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} className="h-9 text-sm" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Poids (kg)">
                <Input inputMode="numeric" value={poids} onChange={(e) => setPoids(e.target.value.replace(/\D/g, ''))} className="h-9 text-sm" />
              </Field>
              <Field label="Taille (cm)">
                <Input inputMode="numeric" value={taille} onChange={(e) => setTaille(e.target.value.replace(/\D/g, ''))} className="h-9 text-sm" />
              </Field>
            </div>
            <Field label="Groupe sanguin">
              <select
                value={groupeSanguin}
                onChange={(e) => setGroupeSanguin(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {GROUPES_SANGUINS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Connaissance des prestations">
              <select
                value={sourceContact}
                onChange={(e) => setSourceContact(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {SOURCE_CONNAISSANCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={accompagnant} onCheckedChange={(v) => setAccompagnant(!!v)} />
              Accompagnant pour le séjour
            </label>
            {accompagnant && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Adultes accompagnants">
                  <Input inputMode="numeric" value={nbAdultes} onChange={(e) => setNbAdultes(e.target.value.replace(/\D/g, ''))} className="h-9 text-sm" />
                </Field>
                <Field label="Enfants accompagnants">
                  <Input inputMode="numeric" value={nbEnfants} onChange={(e) => setNbEnfants(e.target.value.replace(/\D/g, ''))} className="h-9 text-sm" />
                </Field>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Données médicales</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2">Antécédents médicaux</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {ANTECEDENTS_MEDICAUX.map((item) => (
                  <label key={item} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-2.5 py-2">
                    <Checkbox checked={antecedents.includes(item)} onCheckedChange={() => toggleAntecedent(item)} />
                    {item}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Autres maladies chroniques">
              <Textarea value={autresMaladiesChroniques} onChange={(e) => setAutresMaladiesChroniques(e.target.value)} rows={2} />
            </Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={traitementEnCours} onCheckedChange={(v) => setTraitementEnCours(!!v)} />
              Traitement en cours
            </label>
            {traitementEnCours && (
              <Textarea value={traitementDetails} onChange={(e) => setTraitementDetails(e.target.value)} placeholder="Détails traitement" rows={2} />
            )}
            <Field label="Allergies (séparées par une virgule)">
              <Input value={allergies} onChange={(e) => setAllergies(e.target.value)} className="h-9 text-sm" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Fumeuse', checked: fumeur, set: setFumeur },
                { label: 'Alcool', checked: alcool, set: setAlcool },
                { label: 'Drogue', checked: drogue, set: setDrogue },
              ].map((row) => (
                <label key={row.label} className="flex items-center gap-2 text-sm cursor-pointer rounded-lg border px-2.5 py-2">
                  <Checkbox checked={row.checked} onCheckedChange={(v) => row.set(!!v)} />
                  {row.label}
                </label>
              ))}
            </div>
            {fumeur && <Textarea value={detailsTabac} onChange={(e) => setDetailsTabac(e.target.value)} placeholder="Détails tabac" rows={2} />}
            {alcool && <Textarea value={detailsAlcool} onChange={(e) => setDetailsAlcool(e.target.value)} placeholder="Détails alcool" rows={2} />}
            {drogue && <Textarea value={detailsDrogue} onChange={(e) => setDetailsDrogue(e.target.value)} placeholder="Détails drogue" rows={2} />}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={chirurgiesAnterieures} onCheckedChange={(v) => setChirurgiesAnterieures(!!v)} />
              Chirurgies antérieures
            </label>
            {chirurgiesAnterieures && (
              <Textarea value={chirurgiesDetails} onChange={(e) => setChirurgiesDetails(e.target.value)} placeholder="Détails chirurgies" rows={3} />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm">Demande du patient</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {INTERVENTION_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveCategory(c.key)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-sm font-medium text-left',
                    activeCategory === c.key
                      ? 'border-brand-200 bg-brand-50 text-brand-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {c.title}
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                {category.title} · {selectedInterventions.length} sélectionnée(s)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {category.items.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleIntervention(item)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-sm text-left',
                      selectedInterventions.includes(item)
                        ? 'border-brand-200 bg-brand-50 text-brand-900 font-medium'
                        : 'border-slate-200 bg-white hover:bg-slate-50',
                    )}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            {selectedInterventions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedInterventions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleIntervention(item)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-900"
                  >
                    <span className="truncate max-w-[240px]">{item}</span>
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
            <Field label="Précisions « autres » interventions">
              <Textarea value={autresInterventionsDetails} onChange={(e) => setAutresInterventionsDetails(e.target.value)} rows={2} />
            </Field>
            <Field label="Description et attentes">
              <Textarea value={descriptionDemande} onChange={(e) => setDescriptionDemande(e.target.value)} rows={4} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mois souhaité">
                <select
                  value={periodeMois}
                  onChange={(e) => setPeriodeMois(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {MOIS_PERIODE.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Année souhaitée">
                <select
                  value={periodeAnnee}
                  onChange={(e) => setPeriodeAnnee(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {years.map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                </select>
              </Field>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          <X className="h-4 w-4 mr-1.5" />
          Annuler
        </Button>
        <Button type="button" variant="brand" onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? 'Enregistrement…' : 'Enregistrer le formulaire'}
        </Button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}
