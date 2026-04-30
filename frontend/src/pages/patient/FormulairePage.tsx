import { useEffect, useRef, useState, useCallback, useMemo } from 'react'

import { useForm } from 'react-hook-form'

import { zodResolver } from '@hookform/resolvers/zod'

import { z } from 'zod'

import { CheckCircle2, ChevronLeft, ChevronRight, Upload, X, AlertCircle, Check, Eye, EyeOff } from 'lucide-react'

import { Input } from '@/components/ui/input'

import { PhoneInputField, isValidPhoneNumber } from '@/components/ui/phone-input-field'

import { Label } from '@/components/ui/label'

import { Textarea } from '@/components/ui/textarea'

import { Checkbox } from '@/components/ui/checkbox'

import { cn } from '@/lib/utils'
import {
  SOURCE_CONNAISSANCE_OPTIONS,
  formatSourceConnaissanceLabel,
  isSourceConnaissance,
} from '@/lib/sourceConnaissance'

import { getDashboardPath, useAuthStore } from '@/store/authStore'

import { authApi, formulaireApi, uploadFile, uploadFilePublic } from '@/lib/api'

import { useNavigate } from 'react-router-dom'

import type { User } from '@/types'

const STEPS = [

  { id: 1, label: 'Données personnelles', short: 'Données personnelles' },

  { id: 2, label: 'Données médicales', short: 'Données médicales' },

  { id: 3, label: 'Votre demande', short: 'Demande' },

  { id: 4, label: 'Documents & Photos', short: 'Documents' },

  { id: 5, label: 'Confirmation', short: 'Confirmation' },

]

const INTERVENTION_CATEGORIES = [
  {
    key: 'visage',
    title: 'Chirurgie du Visage',
    items: [
      'Blépharoplastie des Paupières Supérieures',
      'Blépharoplastie des paupières inférieures',
      'Lifting CervicoFacial (Deep Plane Face Lift)',
      'NANOFAT Lipofilling du Visage (Comblement avec graisse)',
      'Liposuccion du Menton',
      'Traitement de la boule de bichât',
      'Lifting du Sourcil (Fox Eyes)',
      'Lifting de la Lèvre Supérieure (Lip Lift)',
      'Traitement des oreilles décollées',
      'Rhinoplastie (Chirurgie du Nez)',
      'Autres (visage à préciser)',
    ],
  },
  {
    key: 'seins',
    title: 'Chirurgie Mammaire',
    items: [
      'Augmentation Mammaire par Prothèses',
      'Augmentation Mammaire Hybride (Prothèses + Lipofilling)',
      'Lifting Mammaire sans prothèses',
      'Lifting Mammaire avec Pose de Prothèses',
      'Réduction Mammaire',
      'Changement de Prothèses Mammaires',
      'Retrait de Prothèses Mammaires',
      'Autres (mammaire à préciser)',
    ],
  },
  {
    key: 'silhouette',
    title: 'Chirurgie de la Silhouette',
    items: [
      'Lipoaspiration Haute Définition VASER - Cou',
      'Lipoaspiration Haute Définition VASER - Bras',
      'Lipoaspiration Haute Définition VASER - Dos',
      'Lipoaspiration Haute Définition VASER - Flancs',
      'Lipoaspiration Haute Définition VASER - Ventre',
      'Lipoaspiration Haute Définition VASER - 360° (ventre, flancs et dos)',
      'Lipoaspiration Haute Définition VASER - Cuisses Antérieures',
      'Lipoaspiration Haute Définition VASER - Cuisses Intérieures',
      'Lipoaspiration Haute Définition VASER - Cuisses Postérieures',
      'Lipoaspiration Haute Définition VASER - Culotte de Cheval',
      'Lipoaspiration Haute Définition VASER - Genoux',
      'Lipoaspiration Haute Définition VASER - Mollets',
      'Lipoaspiration Haute Définition VASER - Chevilles',
      'Traitement du Lipœdème',
      'Lifting des Bras',
      "Abdominoplastie (Lifting de l'abdomen)",
      'Body Lift (Abdominoplastie Circulaire : ventre et dos)',
      'Lifting des Cuisses',
      'Lipofilling du Postérieur (Brazilian Butt Lift)',
      'Traitement du relâchement cutané (faible à modéré) par JPlasma',
      'Autres (silhouette à préciser)',
    ],
  },
] as const

const MOIS_PERIODE = [
  { value: '01', label: 'Janvier' },
  { value: '02', label: 'Février' },
  { value: '03', label: 'Mars' },
  { value: '04', label: 'Avril' },
  { value: '05', label: 'Mai' },
  { value: '06', label: 'Juin' },
  { value: '07', label: 'Juillet' },
  { value: '08', label: 'Août' },
  { value: '09', label: 'Septembre' },
  { value: '10', label: 'Octobre' },
  { value: '11', label: 'Novembre' },
  { value: '12', label: 'Décembre' },
] as const

function buildPeriodeSouhaitee(mois: string, annee: string): string {
  const row = MOIS_PERIODE.find((x) => x.value === mois)
  if (!row || !annee.trim()) return ''
  return `${row.label} ${annee.trim()}`
}

function parsePeriodeSouhaitee(s: string | undefined): { mois: string; annee: string } {
  if (!s?.trim()) return { mois: '', annee: '' }
  const t = s.trim()
  const iso = t.match(/^(\d{4})-(\d{2})$/)
  if (iso) {
    const y = iso[1]
    const m = iso[2]
    return { annee: y, mois: m }
  }
  for (const { value, label } of MOIS_PERIODE) {
    const re = new RegExp(`^${label}\\s+(\\d{4})$`, 'i')
    const m = t.match(re)
    if (m) return { mois: value, annee: m[1] }
  }
  return { mois: '', annee: '' }
}

const ANTECEDENTS = [

  'Diabète', 'Tension artérielle', 'Maladie cardiaque', 'Problèmes de coagulation',

  'Troubles thyroïdiens', 'Asthme', 'Épilepsie', 'Dépression / Anxiété',

]

const step1Schema = z.object({

  poids: z.string().min(1, 'Requis').regex(/^\d+$/, 'Nombre entier requis'),

  taille: z.string().min(1, 'Requis').regex(/^\d+$/, 'Nombre entier requis'),

  dateNaissance: z.string().min(1, 'Requis'),

  sourceContact: z
    .string()
    .min(1, 'Indiquez comment vous avez connu le Dr Chennoufi.')
    .refine((s) => isSourceConnaissance(s), { message: 'Option non valide.' }),

})

type Step1Data = {
  poids: string
  taille: string
  dateNaissance: string
  sourceContact: string
}

const step3Schema = z.object({

  descriptionDemande: z.string().min(1, 'Champ requis'),

  periodeSouhaiteeMois: z.string().min(1, 'Sélectionnez un mois'),

  periodeSouhaiteeAnnee: z.string().min(1, 'Sélectionnez une année'),

  /** Présence d’un accompagnant pour le séjour / le parcours */
  accompagnant: z.boolean(),

})

type Step3Data = z.infer<typeof step3Schema>

type UploadedFile = { url: string; name: string }

function extractFileName(input: string): string {
  if (!input) return ''
  if (input.startsWith('blob:')) return 'Fichier local'
  try {
    const url = new URL(input)
    const last = url.pathname.split('/').pop() ?? input
    return decodeURIComponent(last)
  } catch {
    const last = input.split('/').pop() ?? input
    return decodeURIComponent(last)
  }
}

function guessMimeFromName(fileName: string, blobType: string): string {
  if (blobType) return blobType
  const ext = fileName.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'application/pdf'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return 'application/octet-stream'
}

/** Remplace les prévisualisations `blob:` par un upload réel (compte créé / session disponible). */
async function materializeUploadedFiles(items: UploadedFile[]): Promise<UploadedFile[]> {
  return Promise.all(
    items.map(async (item) => {
      const u = item.url || ''
      if (!u.startsWith('blob:')) return item
      const res = await fetch(u)
      if (!res.ok) throw new Error('Lecture du fichier local impossible.')
      const blob = await res.blob()
      const mime = guessMimeFromName(item.name, blob.type)
      const file = new File([blob], item.name, { type: mime })
      const uploaded = await uploadFile(file)
      URL.revokeObjectURL(u)
      return { url: uploaded.url, name: uploaded.name }
    }),
  )
}

export default function FormulairePage() {

  const navigate = useNavigate()

  const [currentStep, setCurrentStep] = useState(1)

  const [completed, setCompleted] = useState(false)

  const { user, login, logout } = useAuthStore()

  const [autoAccountError, setAutoAccountError] = useState('')

  const [privacyAccepted, setPrivacyAccepted] = useState(false)

  const [privacyError, setPrivacyError] = useState('')

  const [showIntroMessage, setShowIntroMessage] = useState(true)

  const [showPassword, setShowPassword] = useState(false)

  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [publicIdentity, setPublicIdentity] = useState({

    prenom: '',
    nom: '',
    email: '',
    phone: '',
    ville: '',
    pays: '',
    password: '',
    confirmPassword: '',

  })

  const step1Form = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      poids: '',
      taille: '',
      dateNaissance: '',
      sourceContact: '',
    },
  })
  const step3Form = useForm<Step3Data>({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      descriptionDemande: '',
      periodeSouhaiteeMois: '',
      periodeSouhaiteeAnnee: '',
      accompagnant: false,
    },
  })

  useEffect(() => {

    if (user && user.role !== 'patient') {
      navigate(getDashboardPath(user.role), { replace: true })
    }

  }, [user, navigate])

  useEffect(() => {

    if (!user || user.role !== 'patient') return
    const [prenom = '', ...rest] = user.name.split(' ')
    const nom = rest.join(' ')
    setPublicIdentity({
      prenom: prenom || '',
      nom: nom || '',
      email: user.email || '',
      phone: user.phone || '',
      ville: '',
      pays: '',
      password: '',
      confirmPassword: '',
    })

  }, [user])

  useEffect(() => {
    if (!user || user.role !== 'patient') return
    let cancelled = false

    const prefillFromLatest = async () => {
      try {
        const latest = await formulaireApi.getLatest()
        const formulaire = latest.formulaire as {
          payload?: {
            dateNaissance?: string
            poids?: number | string
            taille?: number | string
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
            autresInterventionsDetails?: string
            descriptionDemande?: string
            attentes?: string
            dateSouhaitee?: string
            groupeSanguin?: string
            photos?: string[]
            documentsPDF?: string[]
            sourceContact?: string
            accompagnant?: boolean
          }
        } | null
        const payload = formulaire?.payload
        if (!payload || cancelled) return

        const parseChirurgiesRows = (details?: string) => {
          if (!details?.trim()) return [{ intervention: '', date: '' }]
          const rows = details
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => {
              const withoutIndex = line.replace(/^\d+\.\s*/, '')
              const m = withoutIndex.match(/^(.*?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/)
              return {
                intervention: (m?.[1] ?? withoutIndex).trim(),
                date: (m?.[2] ?? '').trim(),
              }
            })
            .filter((r) => r.intervention || r.date)
          return rows.length > 0 ? rows : [{ intervention: '', date: '' }]
        }

        const src =
          payload.sourceContact && isSourceConnaissance(String(payload.sourceContact))
            ? String(payload.sourceContact)
            : ''
        step1Form.reset({
          poids: payload.poids != null ? String(payload.poids) : '',
          taille: payload.taille != null ? String(payload.taille) : '',
          dateNaissance: payload.dateNaissance ?? '',
          sourceContact: src,
        })

        const { mois: psMois, annee: psAnnee } = parsePeriodeSouhaitee(payload.periodeSouhaitee)
        step3Form.reset({
          descriptionDemande: payload.descriptionDemande ?? payload.attentes ?? '',
          periodeSouhaiteeMois: psMois,
          periodeSouhaiteeAnnee: psAnnee,
          accompagnant: typeof payload.accompagnant === 'boolean' ? payload.accompagnant : false,
        })

        setAntecedents(payload.antecedentsMedicaux ?? [])
        setTraitementEnCours(Boolean(payload.traitementEnCours))
        setTraitementDetails(payload.traitementDetails ?? '')
        setFumeur(Boolean(payload.fumeur))
        setDetailsTabac(payload.detailsTabac ?? '')
        setAlcool(Boolean(payload.alcool))
        setDetailsAlcool(payload.detailsAlcool ?? '')
        setDrogue(Boolean(payload.drogue))
        setDetailsDrogue(payload.detailsDrogue ?? '')
        setAutresMaladiesChroniques(payload.autresMaladiesChroniques ?? '')
        setChirurgiesAnterieures(Boolean(payload.chirurgiesAnterieures))
        setChirurgiesRows(parseChirurgiesRows(payload.chirurgiesDetails))
        setAllergies((payload.allergies ?? []).join(', '))
        setGroupeSanguin(payload.groupeSanguin ?? '')
        setSelectedInterventions(payload.typeIntervention ?? [])
        setAutresInterventionsDetails(payload.autresInterventionsDetails ?? '')
        setUploadedPhotos(
          (payload.photos ?? []).map((u) => ({ url: u, name: extractFileName(u) }))
        )
        setUploadedDocs(
          (payload.documentsPDF ?? []).map((u) => ({ url: u, name: extractFileName(u) }))
        )
      } catch {
        // Ne pas bloquer la page formulaire si aucun brouillon/formulaire n'existe.
      }
    }

    void prefillFromLatest()
    return () => {
      cancelled = true
    }
  }, [user, step1Form, step3Form])

  // Step 2 state

  const [antecedents, setAntecedents] = useState<string[]>([])

  const [traitementEnCours, setTraitementEnCours] = useState(false)

  const [traitementDetails, setTraitementDetails] = useState('')

  const [fumeur, setFumeur] = useState(false)

  const [detailsTabac, setDetailsTabac] = useState('')

  const [alcool, setAlcool] = useState(false)

  const [detailsAlcool, setDetailsAlcool] = useState('')

  const [drogue, setDrogue] = useState(false)

  const [detailsDrogue, setDetailsDrogue] = useState('')

  const [autresMaladiesChroniques, setAutresMaladiesChroniques] = useState('')

  const [chirurgiesAnterieures, setChirurgiesAnterieures] = useState(false)

  const [chirurgiesRows, setChirurgiesRows] = useState<Array<{ intervention: string; date: string }>>([

    { intervention: '', date: '' },

  ])

  const [allergies, setAllergies] = useState('')

  const [groupeSanguin, setGroupeSanguin] = useState('')

  // Step 3 state

  const [selectedInterventions, setSelectedInterventions] = useState<string[]>([])
  const [activeInterventionCategory, setActiveInterventionCategory] = useState<(typeof INTERVENTION_CATEGORIES)[number]['key']>('visage')
  const [autresInterventionsDetails, setAutresInterventionsDetails] = useState('')

  const [step3Error, setStep3Error] = useState('')

  const [step4Error, setStep4Error] = useState('')
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [uploadingDocs, setUploadingDocs] = useState(false)

  // Step 4 state

  const [uploadedPhotos, setUploadedPhotos] = useState<UploadedFile[]>([])

  const [uploadedDocs, setUploadedDocs] = useState<UploadedFile[]>([])

  const photosInputRef = useRef<HTMLInputElement | null>(null)

  const docsInputRef = useRef<HTMLInputElement | null>(null)

  const handleFilesSelected = useCallback(async (
    files: File[],
    setter: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    setUploading: (v: boolean) => void,
  ) => {
    if (!files.length) return
    // Preview local immédiat
    const previews = files.map((f) => ({ url: URL.createObjectURL(f), name: f.name }))
    setter((prev) => [...prev, ...previews])
    // Patient connecté → /patient/upload ; formulaire public → /public/upload (avant inscription)
    const uploadFn = user ? uploadFile : uploadFilePublic
    setUploading(true)
    try {
      const results = await Promise.allSettled(files.map((f) => uploadFn(f)))
      setter((prev) => {
        const updated = [...prev]
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') {
            const idx = updated.findIndex((u) => u.name === previews[i].name && u.url === previews[i].url)
            if (idx !== -1) updated[idx] = { url: r.value.url, name: r.value.name }
          }
        })
        return updated
      })
    } finally {
      setUploading(false)
    }
  }, [user])

  const handleNext = async () => {

    if (currentStep === 1) {
      if (!user) {
        const { prenom, nom, email, phone, ville, pays, password, confirmPassword } = publicIdentity
        if (!prenom.trim() || !nom.trim() || !email.trim() || !phone.trim() || !ville.trim() || !pays.trim()) {
          setAutoAccountError('Veuillez compléter vos coordonnées (prénom, nom, email, téléphone, ville, pays).')
          return
        }
        if (!isValidPhoneNumber(phone)) {
          setAutoAccountError('Veuillez saisir un numéro de téléphone valide (avec indicatif pays).')
          return
        }
        if (!email.includes('@')) {
          setAutoAccountError('Adresse email invalide.')
          return
        }
        if (password.length < 8) {
          setAutoAccountError('Le mot de passe doit contenir au moins 8 caractères.')
          return
        }
        if (password !== confirmPassword) {
          setAutoAccountError('Les mots de passe ne correspondent pas.')
          return
        }
      }
      if (autoAccountError) setAutoAccountError('')
      const valid = await step1Form.trigger()
      if (!valid) return
    }
    if (currentStep === 3) {
      if (selectedInterventions.length === 0) {
        setStep3Error("Sélectionnez au moins un type d'intervention.")
        return
      }
      const valid = await step3Form.trigger()
      if (!valid) return
      setStep3Error('')
    }
    if (currentStep === 2 && traitementEnCours && !traitementDetails.trim()) {
      return
    }
    if (currentStep === 4) {
      if (uploadedPhotos.length === 0) {
        setStep4Error('Veuillez ajouter au moins une photo.')
        return
      }
      setStep4Error('')
    }
    setCurrentStep((s) => Math.min(s + 1, 5))

  }

  const handleBack = () => setCurrentStep((s) => Math.max(s - 1, 1))

  const handleSubmit = async () => {

    let targetUser = user
    setAutoAccountError('')
    if (!privacyAccepted) {
      setPrivacyError(
        user
          ? 'Veuillez accepter le traitement de vos données médicales pour soumettre le formulaire.'
          : 'Veuillez accepter la politique de confidentialité pour créer votre compte et soumettre le formulaire.',
      )
      return
    }
    if (!targetUser) {
      const prenom = publicIdentity.prenom.trim()
      const nom = publicIdentity.nom.trim()
      const email = publicIdentity.email.trim().toLowerCase()
      const phone = publicIdentity.phone.trim()
      const ville = publicIdentity.ville.trim()
      const pays = publicIdentity.pays.trim()
      if (!prenom || !nom || !email || !phone || !ville || !pays) {
        setAutoAccountError('Veuillez compléter vos coordonnées pour finaliser la soumission.')
        return
      }
      if (!isValidPhoneNumber(phone)) {
        setAutoAccountError('Veuillez saisir un numéro de téléphone valide (avec indicatif pays).')
        return
      }
      try {
        const step1 = step1Form.getValues()
        const result = await authApi.register({
          email,
          password: publicIdentity.password,
          fullName: `${prenom} ${nom}`,
          phone,
          ville,
          pays,
          dateNaissance: step1.dateNaissance,
          sourceContact: step1.sourceContact,
        })
        const newUser: User = {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: 'patient',
          phone,
        }
        login(newUser, result.accessToken, result.refreshToken)
        targetUser = newUser
      } catch (err) {
        setAutoAccountError(err instanceof Error ? err.message : 'Impossible de créer le compte.')
        return
      }
    }
    const step1 = step1Form.getValues()
    const step3 = step3Form.getValues()

    let photosForPayload = uploadedPhotos
    let docsForPayload = uploadedDocs
    const hasBlobPhotos = uploadedPhotos.some((p) => (p.url || '').startsWith('blob:'))
    const hasBlobDocs = uploadedDocs.some((p) => (p.url || '').startsWith('blob:'))
    if (hasBlobPhotos || hasBlobDocs) {
      try {
        setUploadingPhotos(hasBlobPhotos)
        setUploadingDocs(hasBlobDocs)
        const [nextPhotos, nextDocs] = await Promise.all([
          materializeUploadedFiles(uploadedPhotos),
          materializeUploadedFiles(uploadedDocs),
        ])
        photosForPayload = nextPhotos
        docsForPayload = nextDocs
        setUploadedPhotos(nextPhotos)
        setUploadedDocs(nextDocs)
      } catch (err) {
        setStep4Error(
          err instanceof Error
            ? err.message
            : "L'envoi des fichiers a échoué. Vérifiez votre connexion et réessayez.",
        )
        setCurrentStep(4)
        return
      } finally {
        setUploadingPhotos(false)
        setUploadingDocs(false)
      }
    }

    const uploadedPhotoUrls = photosForPayload
      .map((f) => f.url || '')
      .filter((u) => Boolean(u) && !u.startsWith('blob:'))
    const uploadedDocUrls = docsForPayload
      .map((f) => f.url || '')
      .filter((u) => Boolean(u) && !u.startsWith('blob:'))
    if (uploadedPhotoUrls.length === 0) {
      setStep4Error("L'upload des photos a échoué. Réessayez d'ajouter au moins une photo puis resoumettez.")
      setCurrentStep(4)
      return
    }
    const chirurgiesDetails = chirurgiesRows
      .filter((row) => row.intervention.trim() || row.date.trim())
      .map((row, idx) => `${idx + 1}. ${row.intervention.trim() || 'Intervention non précisée'}${row.date ? ` (${row.date})` : ''}`)
      .join('\n')
    const payload = {
      dateNaissance: step1.dateNaissance,
      poids: parseInt(step1.poids, 10),
      taille: parseInt(step1.taille, 10),
      sourceContact: step1.sourceContact,
      groupeSanguin,
      antecedentsMedicaux: antecedents,
      traitementEnCours,
      traitementDetails: traitementEnCours ? traitementDetails : undefined,
      allergies: allergies.split(',').map((x) => x.trim()).filter(Boolean),
      fumeur,
      detailsTabac: fumeur ? detailsTabac : undefined,
      alcool,
      detailsAlcool: alcool ? detailsAlcool : undefined,
      drogue,
      detailsDrogue: drogue ? detailsDrogue : undefined,
      diabete: antecedents.includes('Diabète'),
      maladieCardiaque: antecedents.includes('Maladie cardiaque'),
      autresMaladiesChroniques: autresMaladiesChroniques || undefined,
      chirurgiesAnterieures: chirurgiesAnterieures || Boolean(chirurgiesDetails),
      chirurgiesDetails: chirurgiesDetails || undefined,
      typeIntervention: selectedInterventions,
      zonesConcernees: selectedInterventions,
      autresInterventionsDetails: autresInterventionsDetails.trim() || undefined,
      descriptionDemande: step3.descriptionDemande,
      attentes: step3.descriptionDemande,
      periodeSouhaitee: buildPeriodeSouhaitee(step3.periodeSouhaiteeMois, step3.periodeSouhaiteeAnnee),
      accompagnant: step3.accompagnant,
      photos: uploadedPhotoUrls,
      documentsPDF: uploadedDocUrls.length > 0 ? uploadedDocUrls : undefined,
    }
    try {
      await formulaireApi.submit({ status: 'submitted', payload })
      setCompleted(true)
    } catch (err) {
      console.error('[FormulairePage] Erreur soumission:', err)
      setAutoAccountError(err instanceof Error ? err.message : 'Erreur lors de l\'envoi du formulaire.')
    }

  }

  const toggleIntervention = (item: string) => {

    setSelectedInterventions((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    )

  }

  const toggleAntecedent = (item: string) => {

    setAntecedents((prev) =>
      prev.includes(item) ? prev.filter((i) => i !== item) : [...prev, item]
    )

  }

  const activeCategory = useMemo(
    () => INTERVENTION_CATEGORIES.find((c) => c.key === activeInterventionCategory) ?? INTERVENTION_CATEGORIES[0],
    [activeInterventionCategory]
  )

  const showAutresInterventionField = selectedInterventions.some((x) =>
    x.trim().toLowerCase().startsWith('autres')
  )

  const addChirurgieRow = () => {

    setChirurgiesRows((prev) => [...prev, { intervention: '', date: '' }])

  }

  const updateChirurgieRow = (index: number, key: 'intervention' | 'date', value: string) => {

    setChirurgiesRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)))

  }

  const removeChirurgieRow = (index: number) => {

    setChirurgiesRows((prev) => (prev.length === 1 ? [{ intervention: '', date: '' }] : prev.filter((_, i) => i !== index)))

  }

  // â”€â”€â”€ Completion screen â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  if (completed) {

    return (
      <div
        className="min-h-screen px-4 py-10 sm:py-14"
        style={{
          background: 'linear-gradient(135deg, #062a30 0%, #0d3d45 40%, #1a4a3a 100%)',
        }}
      >
        <div className="w-full max-w-3xl mx-auto animate-fade-in">
          <img
            src="/brand-logo-teal.png"
            alt="Dr. Mehdi Chennoufi"
            className="h-24 sm:h-28 w-auto object-contain mx-auto mb-8 opacity-95"
          />
          <div
            className="rounded-2xl p-6 sm:p-8 text-left"
            style={{
              background: 'linear-gradient(145deg, rgba(253,234,218,0.12), rgba(253,234,218,0.06))',
              border: '1px solid rgba(228,200,189,0.28)',
              boxShadow: '0 20px 40px rgba(2,20,24,0.25)',
              color: '#fdeada',
            }}
          >
            <div className="flex items-center gap-3 mb-5">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'rgba(129,87,45,0.2)', border: '1px solid rgba(129,87,45,0.45)' }}
              >
                <CheckCircle2 className="h-6 w-6" style={{ color: '#e4c8bd' }} />
              </div>
              <div>
                <p className="text-xs tracking-[0.16em] uppercase" style={{ color: 'rgba(228,200,189,0.72)' }}>
                  Confirmation
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold leading-tight" style={{ color: '#fdeada' }}>
                  Formulaire envoyé avec succès
                </h2>
              </div>
            </div>
            <div
              className="rounded-xl p-4 sm:p-5 text-sm sm:text-base leading-relaxed mb-5"
              style={{ background: 'rgba(6,42,48,0.36)', border: '1px solid rgba(228,200,189,0.24)' }}
            >
              <p className="mb-2.5">
              Madame {publicIdentity.nom?.trim() || user?.name || 'Patiente'},
              </p>
              <p className="mb-2.5">
                Nous accusons réception de votre demande et vous remercions encore de l'intérêt manifesté au Dr CHENNOUFI.
              </p>
              <p className="mb-2.5">
                Votre devis est en cours de traitement et vous sera remis dans un délai ne dépassant pas les 72h (sauf exception).
              </p>
              <p className="mb-2.5">Au plaisir de vous servir.</p>
              <p className="font-medium">Cabinet du Dr Mehdi Chennoufi</p>
              <p>Chirurgie Esthétique, Plastique et Réparatrice</p>
              <p>SCULPTURE, SMOOTH & SMILE</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div
                className="rounded-xl p-4 text-sm"
                style={{ background: 'rgba(253,234,218,0.07)', border: '1px solid rgba(228,200,189,0.22)' }}
              >
                <p className="text-xs tracking-[0.15em] uppercase font-semibold mb-3" style={{ color: '#e4c8bd' }}>
                  Votre compte patiente
                </p>
                <div className="space-y-1.5" style={{ color: '#fdeada' }}>
                  <p><span style={{ color: 'rgba(253,234,218,0.55)' }}>Email :</span> {publicIdentity.email || user?.email}</p>
                  <p className="text-xs mt-2" style={{ color: 'rgba(253,234,218,0.55)' }}>
                    Connectez-vous avec le mot de passe choisi lors de la création de votre dossier.
                  </p>
                </div>
              </div>
              <div
                className="rounded-xl p-4 text-sm flex flex-col justify-between"
                style={{ background: 'rgba(253,234,218,0.06)', border: '1px solid rgba(228,200,189,0.22)' }}
              >
                <div>
                  <p className="font-medium mb-2" style={{ color: '#e4c8bd' }}>Accéder à votre espace patient</p>
                  <p className="text-xs mb-3" style={{ color: 'rgba(253,234,218,0.65)' }}>
                    Suivez votre dossier et consultez votre devis dès réception.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/acces-patient')}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium transition-all"
                  style={{ background: '#062a30', color: '#fdeada', border: '1px solid rgba(228,200,189,0.35)' }}
                >
                  Se connecter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )

  }

  // â”€â”€â”€ Main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (

    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage: "linear-gradient(rgba(253,234,218,0.25), rgba(228,200,189,0.15)), url('/brand-marble.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'scroll',
      }}
    >
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header style={{ background: '#062a30' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="h-12 sm:h-14 w-[170px] sm:w-[205px] overflow-hidden flex items-center">
              <img
                src="/acces-patient-logo1-crop.png"
                alt="Dr. Mehdi Chennoufi"
                className="h-full w-full object-contain"
              />
            </div>
            <div className="border-l border-white/10 pl-3 sm:pl-4">
              <p
                className="text-xs tracking-[0.22em] uppercase"
                style={{ color: 'rgba(228,200,189,0.6)' }}
              >
                Formulaire de
              </p>
              <p
                className="text-sm font-semibold tracking-[0.18em] uppercase"
                style={{ color: '#fdeada' }}
              >
                Pré-consultation
              </p>
            </div>
          </div>
          {!user ? (
            <button
              type="button"
              onClick={() => navigate('/acces-patient')}
              className="w-full sm:w-auto text-xs tracking-wide transition-all rounded-full px-4 py-1.5 whitespace-nowrap"
              style={{
                color: 'rgba(253,234,218,0.75)',
                border: '1px solid rgba(228,200,189,0.2)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#fdeada'
                e.currentTarget.style.borderColor = 'rgba(228,200,189,0.5)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'rgba(253,234,218,0.75)'
                e.currentTarget.style.borderColor = 'rgba(228,200,189,0.2)'
              }}
            >
              Patiente existante →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/formulaire')
              }}
              className="w-full sm:w-auto text-xs tracking-wide transition-all rounded-full px-4 py-1.5 whitespace-nowrap"
              style={{
                color: 'rgba(253,234,218,0.9)',
                border: '1px solid rgba(228,200,189,0.4)',
              }}
            >
              Se déconnecter / Créer un autre compte
            </button>
          )}
        </div>
        {/* Gold divider */}
        <div className="h-px mx-3 sm:mx-5" style={{ background: 'linear-gradient(to right, transparent, #81572d, transparent)' }} />
      </header>
      {/* â”€â”€ Body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <main className="flex-1 py-6 sm:py-8 px-3 sm:px-4">
        <div className="max-w-3xl mx-auto space-y-6">
          {showIntroMessage && currentStep === 1 && (
            <div
              className="rounded-2xl px-4 sm:px-6 py-5 sm:py-6 space-y-3 relative"
              style={{
                background: 'linear-gradient(135deg, rgba(6,42,48,0.94) 0%, rgba(18,67,75,0.92) 60%, rgba(129,87,45,0.9) 100%)',
                border: '1px solid rgba(228,200,189,0.35)',
                boxShadow: '0 12px 30px rgba(6,42,48,0.16)',
              }}
            >
              <button
                type="button"
                aria-label="Fermer le message d'accueil"
                onClick={() => setShowIntroMessage(false)}
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors"
                style={{ color: 'rgba(253,234,218,0.9)', background: 'rgba(253,234,218,0.08)' }}
              >
                <X className="h-4 w-4" />
              </button>
              <h2 className="text-base sm:text-lg font-semibold tracking-wide pr-10" style={{ color: '#fdeada' }}>
                Bonjour et bienvenue
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(253,234,218,0.92)' }}>
                Nous vous remercions de l’intérêt manifesté au cabinet du Dr CHENNOUFI. Nous nous chargeons de vous accompagner
                dans l’organisation de votre séjour médical et serons ravis d’étudier votre dossier.
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(253,234,218,0.86)' }}>
                Afin de répondre au mieux à votre demande, merci de compléter les informations nécessaires au traitement de votre
                dossier. Veuillez remplir tous les champs obligatoires et signaler toute maladie chronique, traitement médical,
                intervention chirurgicale antérieure, allergie ou problème de santé pouvant influencer votre prise en charge.
              </p>
              <p className="text-sm font-medium" style={{ color: '#fdeada' }}>
                Votre devis sera traité dans un délai ne dépassant pas 72h (sauf exception) après l’envoi des informations demandées.
              </p>
            </div>
          )}
          {/* â”€â”€ Coordonnées â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(228,200,189,0.45)', background: 'rgba(255,255,255,0.92)' }}
          >
            <div
              className="px-4 sm:px-6 py-3 flex items-center gap-3"
              style={{ background: 'rgba(6,42,48,0.04)', borderBottom: '1px solid rgba(228,200,189,0.3)' }}
            >
              <div className="h-5 w-1 rounded-full" style={{ background: '#062a30' }} />
              <p className="text-xs tracking-[0.18em] uppercase font-semibold" style={{ color: '#062a30' }}>
                Vos coordonnées
              </p>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              <p className="text-xs" style={{ color: '#929292' }}>
                {user
                  ? 'Vous êtes connectée : ces informations sont affichées en lecture seule.'
                  : "Complétez directement le formulaire. Votre compte patiente sera créé automatiquement à l'envoi."}
              </p>
              <div className="space-y-3">
                {/* Une grille 2×2 : colonnes strictement égales (comme pays / ville) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { placeholder: 'Prénom', key: 'prenom' as const },
                    { placeholder: 'Nom', key: 'nom' as const },
                  ].map(({ placeholder, key }) => (
                    <div key={key} className="relative min-w-0">
                      <Input
                        placeholder={placeholder}
                        value={publicIdentity[key]}
                        disabled={Boolean(user)}
                        onChange={(e) => {
                          const value = e.target.value
                          setPublicIdentity((p) => ({ ...p, [key]: value }))
                          if (autoAccountError) setAutoAccountError('')
                        }}
                        className="border-brand-200 focus-visible:ring-brand-950/20 bg-white disabled:opacity-80"
                      />
                    </div>
                  ))}
                  <div className="relative min-w-0">
                    <Input
                      type="email"
                      placeholder="Email *"
                      value={publicIdentity.email}
                      disabled={Boolean(user)}
                      onChange={(e) => {
                        setPublicIdentity((p) => ({ ...p, email: e.target.value }))
                        if (autoAccountError) setAutoAccountError('')
                      }}
                      className="border-brand-200 focus-visible:ring-brand-950/20 bg-white disabled:opacity-80"
                    />
                  </div>
                  <div className="relative min-w-0 w-full">
                    <PhoneInputField
                      compact
                      value={publicIdentity.phone}
                      onChange={(v) => {
                        setPublicIdentity((p) => ({ ...p, phone: v ?? '' }))
                        if (autoAccountError) setAutoAccountError('')
                      }}
                      disabled={Boolean(user)}
                    />
                  </div>
                </div>
                {/* Pays | Ville */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { placeholder: 'Pays *', key: 'pays' as const, required: true },
                    { placeholder: 'Ville *', key: 'ville' as const, required: true },
                  ].map(({ placeholder, key, required }) => (
                    <div key={key} className="relative">
                      <Input
                        placeholder={placeholder}
                        value={publicIdentity[key]}
                        disabled={Boolean(user)}
                        onChange={(e) => {
                          const value = e.target.value
                          setPublicIdentity((p) => ({ ...p, [key]: value }))
                          if (autoAccountError) setAutoAccountError('')
                        }}
                        required={required}
                        className="border-brand-200 focus-visible:ring-brand-950/20 bg-white disabled:opacity-80"
                      />
                    </div>
                  ))}
                </div>
              {/* Champs mot de passe — uniquement si non connecté */}
              {!user && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-xs font-medium" style={{ color: '#062a30' }}>
                      Mot de passe <span style={{ color: '#c0392b' }}>*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Minimum 8 caractères"
                        value={publicIdentity.password}
                        onChange={(e) => {
                          setPublicIdentity((p) => ({ ...p, password: e.target.value }))
                          if (autoAccountError) setAutoAccountError('')
                        }}
                        className="pr-10 border-brand-200 focus-visible:ring-brand-950/20 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {publicIdentity.password.length > 0 && publicIdentity.password.length < 8 && (
                      <p className="text-xs" style={{ color: '#c0392b' }}>Au moins 8 caractères requis</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium" style={{ color: '#062a30' }}>
                      Confirmer le mot de passe <span style={{ color: '#c0392b' }}>*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Répéter le mot de passe"
                        value={publicIdentity.confirmPassword}
                        onChange={(e) => {
                          setPublicIdentity((p) => ({ ...p, confirmPassword: e.target.value }))
                          if (autoAccountError) setAutoAccountError('')
                        }}
                        className="pr-10 border-brand-200 focus-visible:ring-brand-950/20 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {publicIdentity.confirmPassword.length > 0 && publicIdentity.password !== publicIdentity.confirmPassword && (
                      <p className="text-xs" style={{ color: '#c0392b' }}>Les mots de passe ne correspondent pas</p>
                    )}
                    {publicIdentity.confirmPassword.length > 0 && publicIdentity.password === publicIdentity.confirmPassword && publicIdentity.password.length >= 8 && (
                      <p className="text-xs flex items-center gap-1" style={{ color: '#27ae60' }}>
                        <Check className="h-3 w-3" /> Mots de passe identiques
                      </p>
                    )}
                  </div>
                </div>
              )}
              </div>
              {autoAccountError && (
                <p className="text-xs flex items-center gap-1.5" style={{ color: '#c0392b' }}>
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {autoAccountError}
                </p>
              )}
            </div>
          </div>
          {/* â”€â”€ Step progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            className="rounded-2xl px-4 sm:px-6 py-5"
            style={{ background: 'rgba(255,255,255,0.88)', border: '1px solid rgba(228,200,189,0.4)' }}
          >
            {/* Numbered stepper */}
            <div className="overflow-x-auto pb-1 -mx-1 px-1 sm:mx-0 sm:px-0">
            <div className="relative flex min-w-[520px] sm:min-w-0 items-start justify-between">
              {/* Connecting line behind the circles */}
              <div
                className="absolute top-4 left-0 right-0 h-px"
                style={{ background: 'rgba(228,200,189,0.6)', zIndex: 0 }}
              />
              {/* Active progress line */}
              <div
                className="absolute top-4 left-0 h-px transition-all duration-500"
                style={{
                  background: 'linear-gradient(to right, #062a30, #81572d)',
                  width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
                  zIndex: 1,
                }}
              />
              {STEPS.map((step) => (
                <div key={step.id} className="flex flex-col items-center gap-2 relative" style={{ zIndex: 2 }}>
                  <div
                    className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300',
                    )}
                    style={{
                      background:
                        step.id < currentStep
                          ? '#81572d'
                          : step.id === currentStep
                          ? '#062a30'
                          : '#fff',
                      border:
                        step.id === currentStep
                          ? '2px solid #062a30'
                          : step.id < currentStep
                          ? '2px solid #81572d'
                          : '2px solid rgba(228,200,189,0.8)',
                      color:
                        step.id <= currentStep ? '#fff' : '#929292',
                      boxShadow: step.id === currentStep ? '0 0 0 3px rgba(6,42,48,0.12)' : 'none',
                    }}
                  >
                    {step.id < currentStep ? <Check className="h-3.5 w-3.5" /> : step.id}
                  </div>
                  <p
                    className="text-xs text-center hidden sm:block leading-tight max-w-[60px] transition-all"
                    style={{
                      fontWeight: step.id === currentStep ? 600 : 400,
                      color: step.id === currentStep ? '#062a30' : step.id < currentStep ? '#81572d' : '#929292',
                    }}
                  >
                    {step.short}
                  </p>
                </div>
              ))}
            </div>
            </div>
            {/* Mobile current step label */}
            <p className="mt-3 text-xs text-center sm:hidden" style={{ color: '#062a30', fontWeight: 600 }}>
              Étape {currentStep} — {STEPS[currentStep - 1].label}
            </p>
          </div>
          {/* â”€â”€ Form card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <div
            className="rounded-2xl overflow-hidden animate-fade-in"
            style={{ border: '1px solid rgba(228,200,189,0.45)', background: 'rgba(255,255,255,0.95)' }}
          >
            {/* Card header bar */}
            <div
              className="px-4 sm:px-6 py-3.5 flex items-center gap-3"
              style={{ background: '#062a30' }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: '#81572d' }}
              />
              <p
                className="text-sm font-medium tracking-[0.1em]"
                style={{ color: '#fdeada' }}
              >
                {STEPS[currentStep - 1].label}
              </p>
              <span
                className="ml-auto text-xs"
                style={{ color: 'rgba(253,234,218,0.4)' }}
              >
                {currentStep} / {STEPS.length}
              </span>
            </div>
            <div className="p-4 sm:p-6 space-y-5">
              {/* â”€â”€ STEP 1 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {currentStep === 1 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="poids" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Poids (kg) <span className="text-destructive">*</span>
                    </Label>
                    <Input id="poids" placeholder="65" {...step1Form.register('poids')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    {step1Form.formState.errors.poids && (
                      <p className="text-xs text-destructive">{step1Form.formState.errors.poids.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="taille" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Taille (cm) <span className="text-destructive">*</span>
                    </Label>
                    <Input id="taille" placeholder="165" {...step1Form.register('taille')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    {step1Form.formState.errors.taille && (
                      <p className="text-xs text-destructive">{step1Form.formState.errors.taille.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="dateNaissance" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Date de naissance <span className="text-destructive">*</span>
                    </Label>
                    <Input id="dateNaissance" type="date" {...step1Form.register('dateNaissance')} className="border-brand-200 focus-visible:ring-brand-950/20" />
                    {step1Form.formState.errors.dateNaissance && (
                      <p className="text-xs text-destructive">{step1Form.formState.errors.dateNaissance.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="sourceContact" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Comment avez-vous connu le Dr Chennoufi ? <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="sourceContact"
                      className="flex h-10 w-full rounded-lg border border-brand-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-950/20"
                      {...step1Form.register('sourceContact')}
                    >
                      <option value="">Sélectionnez…</option>
                      {SOURCE_CONNAISSANCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {step1Form.formState.errors.sourceContact && (
                      <p className="text-xs text-destructive">{step1Form.formState.errors.sourceContact.message}</p>
                    )}
                  </div>
                </div>
              )}
              {/* â”€â”€ STEP 2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {currentStep === 2 && (
                <div className="space-y-5">
                  <div>
                    <Label className="mb-3 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      1- Antécédents médicaux
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {ANTECEDENTS.map((item) => (
                        <label
                          key={item}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border p-3 cursor-pointer transition-all text-sm',
                            antecedents.includes(item)
                              ? 'border-brand-950/30 bg-brand-950/5 text-brand-950'
                              : 'border-brand-200/60 hover:bg-brand-100/30'
                          )}
                        >
                          <Checkbox
                            checked={antecedents.includes(item)}
                            onCheckedChange={() => toggleAntecedent(item)}
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                    <div className="space-y-2 mt-3">
                      <Label htmlFor="autresChroniques" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        Autre maladie chronique
                      </Label>
                      <Textarea
                        id="autresChroniques"
                        placeholder="Précisez toute maladie chronique importante..."
                        value={autresMaladiesChroniques}
                        onChange={(e) => setAutresMaladiesChroniques(e.target.value)}
                        className="border-brand-200"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <Checkbox
                        checked={traitementEnCours}
                        onCheckedChange={(v) => setTraitementEnCours(!!v)}
                      />
                      <span className="text-sm">Médicaments en cours de traitement</span>
                    </label>
                    {traitementEnCours && (
                      <div className="space-y-1.5">
                        <Textarea
                          placeholder="Décrivez le traitement..."
                          value={traitementDetails}
                          onChange={(e) => setTraitementDetails(e.target.value)}
                          className="border-brand-200"
                        />
                        {!traitementDetails.trim() && (
                          <p className="text-xs text-destructive">La description du traitement est obligatoire.</p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      2- Antécédents chirurgicaux
                    </Label>
                    <div className="space-y-3">
                      {chirurgiesRows.map((row, index) => (
                        <div key={`chirurgie-${index}`} className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-2">
                          <Input
                            placeholder="Intervention"
                            value={row.intervention}
                            onChange={(e) => updateChirurgieRow(index, 'intervention', e.target.value)}
                            className="border-brand-200"
                          />
                          <Input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateChirurgieRow(index, 'date', e.target.value)}
                            className="border-brand-200"
                          />
                          <button
                            type="button"
                            onClick={() => removeChirurgieRow(index)}
                            className="rounded-lg border px-3 py-2 text-xs transition-colors border-brand-200 hover:bg-brand-50"
                          >
                            Supprimer
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addChirurgieRow}
                      className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors border-brand-200 hover:bg-brand-50"
                    >
                      + Ajouter une ligne
                    </button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      3- Allergie
                    </Label>
                    <Input
                      id="allergies"
                      placeholder="Ex: Pénicilline, latex..."
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="border-brand-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="groupeSanguin" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Groupe sanguin
                    </Label>
                    <select
                      id="groupeSanguin"
                      value={groupeSanguin}
                      onChange={(e) => setGroupeSanguin(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-brand-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-950/20"
                    >
                      <option value="">Sélectionner...</option>
                      {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="mb-3 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      4- Autre
                    </Label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Fumeuse', checked: fumeur, set: setFumeur },
                        { label: 'Alcool', checked: alcool, set: setAlcool },
                        { label: 'Drogue', checked: drogue, set: setDrogue },
                      ].map(({ label, checked, set }) => (
                        <label
                          key={label}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer transition-all text-xs',
                            checked
                              ? 'border-brand-950/30 bg-brand-950/5 text-brand-950'
                              : 'border-brand-200/60 hover:bg-brand-100/30'
                          )}
                        >
                          <Checkbox checked={checked} onCheckedChange={(v) => set(!!v)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  {fumeur && (
                    <Textarea placeholder="Précisez depuis quand vous fumez, le type de cigarette/vape et la quantité par jour..." value={detailsTabac} onChange={(e) => setDetailsTabac(e.target.value)} className="border-brand-200" />
                  )}
                  {alcool && (
                    <Textarea placeholder="Précisez fréquence/type d'alcool..." value={detailsAlcool} onChange={(e) => setDetailsAlcool(e.target.value)} className="border-brand-200" />
                  )}
                  {drogue && (
                    <Textarea placeholder="Précisez fréquence/type de consommation..." value={detailsDrogue} onChange={(e) => setDetailsDrogue(e.target.value)} className="border-brand-200" />
                  )}
                </div>
              )}
              {/* â”€â”€ STEP 3 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {currentStep === 3 && (
                <div className="space-y-5">
                  <div>
                    <Label className="mb-3 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Type(s) d'interventions souhaité(s) <span className="text-destructive">*</span>
                    </Label>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {INTERVENTION_CATEGORIES.map((category) => (
                          <button
                            key={category.key}
                            type="button"
                            onClick={() => setActiveInterventionCategory(category.key)}
                            className={cn(
                              'rounded-xl border px-3 py-2.5 text-sm font-medium text-left transition-all',
                              activeInterventionCategory === category.key
                                ? 'border-brand-950/30 bg-brand-950/5 text-brand-950'
                                : 'border-brand-200/60 bg-white text-slate-700 hover:bg-brand-100/30'
                            )}
                          >
                            {category.title}
                          </button>
                        ))}
                      </div>

                      <div className="rounded-xl border border-brand-200/60 bg-brand-50/20 p-3 sm:p-4 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#062a30' }}>
                            {activeCategory.title}
                          </p>
                          <span className="text-[11px] text-muted-foreground">
                            {selectedInterventions.length} sélectionnée(s)
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                          {activeCategory.items.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleIntervention(item)}
                              className={cn(
                                'rounded-xl border px-3 py-2.5 text-sm text-left transition-all',
                                selectedInterventions.includes(item)
                                  ? 'border-brand-950/30 bg-brand-950/5 text-brand-950 font-medium'
                                  : 'border-brand-200/60 hover:bg-brand-100/30 text-foreground bg-white'
                              )}
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>

                      {selectedInterventions.length > 0 && (
                        <div className="rounded-xl border border-brand-200/50 bg-white p-3">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Sélection actuelle</p>
                          <div className="flex flex-wrap gap-2">
                            {selectedInterventions.map((item) => (
                              <button
                                key={item}
                                type="button"
                                onClick={() => toggleIntervention(item)}
                                className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-900 hover:bg-brand-100"
                              >
                                <span className="truncate max-w-[240px]">{item}</span>
                                <X className="h-3 w-3" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      * Toutes nos lipoaspirations sont réalisées avec la technologie MICROAIRE.
                    </p>
                    {showAutresInterventionField && (
                      <div className="space-y-1.5 mt-3">
                        <Label htmlFor="autresInterventionsDetails" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                          Autres interventions (à préciser)
                        </Label>
                        <Textarea
                          id="autresInterventionsDetails"
                          rows={2}
                          placeholder="Précisez les autres interventions souhaitées..."
                          value={autresInterventionsDetails}
                          onChange={(e) => setAutresInterventionsDetails(e.target.value)}
                          className="border-brand-200 focus-visible:ring-brand-950/20"
                        />
                      </div>
                    )}
                    {step3Error && (
                      <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {step3Error}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Période souhaitée <span className="text-destructive">*</span>
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <select
                          id="periode-mois"
                          aria-label="Mois de la période souhaitée"
                          className="flex h-10 w-full rounded-lg border border-brand-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-950/20"
                          {...step3Form.register('periodeSouhaiteeMois')}
                        >
                          <option value="">Mois…</option>
                          {MOIS_PERIODE.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        {step3Form.formState.errors.periodeSouhaiteeMois && (
                          <p className="text-xs text-destructive">{step3Form.formState.errors.periodeSouhaiteeMois.message}</p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <select
                          id="periode-annee"
                          aria-label="Année de la période souhaitée"
                          className="flex h-10 w-full rounded-lg border border-brand-200 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-950/20"
                          {...step3Form.register('periodeSouhaiteeAnnee')}
                        >
                          <option value="">Année…</option>
                          {Array.from({ length: 10 }, (_, i) => {
                            const y = new Date().getFullYear() + i
                            return (
                              <option key={y} value={String(y)}>{y}</option>
                            )
                          })}
                        </select>
                        {step3Form.formState.errors.periodeSouhaiteeAnnee && (
                          <p className="text-xs text-destructive">{step3Form.formState.errors.periodeSouhaiteeAnnee.message}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-xl border border-brand-200/60 bg-brand-950/[0.03] px-4 py-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <Checkbox
                        checked={step3Form.watch('accompagnant')}
                        onCheckedChange={(v) => step3Form.setValue('accompagnant', !!v, { shouldDirty: true, shouldValidate: true })}
                        className="mt-0.5"
                      />
                      <span className="text-sm leading-snug" style={{ color: '#282727' }}>
                        Je serai accompagné(e) pour mon séjour / mon parcours (proche, conjoint, etc.)
                      </span>
                    </label>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desc" className="text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                      Description de votre demande et vos attentes <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="desc"
                      rows={4}
                      placeholder="Décrivez en détail votre demande et vos attentes..."
                      {...step3Form.register('descriptionDemande')}
                      className="border-brand-200 focus-visible:ring-brand-950/20"
                    />
                    {step3Form.formState.errors.descriptionDemande && (
                      <p className="text-xs text-destructive">{step3Form.formState.errors.descriptionDemande.message}</p>
                    )}
                  </div>
                </div>
              )}
              {/* â”€â”€ STEP 4 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {currentStep === 4 && (
                <div className="space-y-6">
                  <input ref={photosInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      void handleFilesSelected(files, setUploadedPhotos, setUploadingPhotos)
                      e.currentTarget.value = ''
                    }}
                  />
                  <input ref={docsInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? [])
                      void handleFilesSelected(files, setUploadedDocs, setUploadingDocs)
                      e.currentTarget.value = ''
                    }}
                  />
                  {[
                    {
                      label: 'Photos (face, dos, profils)',
                      hint: 'JPG, PNG — Nombre illimité',
                      files: uploadedPhotos,
                      setFiles: setUploadedPhotos,
                      ref: photosInputRef,
                      uploading: uploadingPhotos,
                    },
                    {
                      label: 'Documents médicaux (résultats, analyses, ordonnances) — optionnel',
                      hint: 'PDF ou images — Nombre illimité',
                      files: uploadedDocs,
                      setFiles: setUploadedDocs,
                      ref: docsInputRef,
                      uploading: uploadingDocs,
                    },
                  ].map(({ label, hint, files, setFiles, ref, uploading }) => (
                    <div key={label}>
                      <Label className="mb-2 block text-xs tracking-wide uppercase" style={{ color: '#282727' }}>
                        {label}
                      </Label>
                      <div
                        className="rounded-xl p-5 sm:p-8 text-center cursor-pointer transition-all"
                        style={{
                          border: '2px dashed rgba(228,200,189,0.7)',
                          background: 'rgba(253,234,218,0.08)',
                        }}
                        onClick={() => ref.current?.click()}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = '#062a30'
                          e.currentTarget.style.background = 'rgba(6,42,48,0.04)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'rgba(228,200,189,0.7)'
                          e.currentTarget.style.background = 'rgba(253,234,218,0.08)'
                        }}
                      >
                        <Upload className="h-7 w-7 mx-auto mb-3" style={{ color: '#81572d' }} />
                        <p className="text-sm font-medium text-foreground">Cliquez pour ajouter</p>
                        <p className="text-xs mt-1" style={{ color: '#929292' }}>{hint}</p>
                      </div>
                      {uploading && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground px-1">
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                          Upload en cours…
                        </div>
                      )}
                      {files.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {files.map((f, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm"
                              style={{ background: 'rgba(253,234,218,0.3)', border: '1px solid rgba(228,200,189,0.4)' }}
                            >
                              <span className="truncate text-foreground">{f.name}</span>
                              <button
                                onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                                className="text-muted-foreground hover:text-destructive ml-2 flex-shrink-0"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {step4Error && (
                    <div
                      className="rounded-xl p-3 text-xs flex items-center gap-2"
                      style={{ background: 'rgba(192,57,43,0.07)', border: '1px solid rgba(192,57,43,0.2)', color: '#c0392b' }}
                    >
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                      {step4Error}
                    </div>
                  )}
                  <div
                    className="rounded-xl p-3 text-xs"
                    style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.08)', color: '#062a30' }}
                  >
                    Vos documents sont chiffrés et accessibles uniquement par l'équipe médicale.
                  </div>
                </div>
              )}
              {/* â”€â”€ STEP 5 — Confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div
                    className="rounded-xl p-5"
                    style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.1)' }}
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <CheckCircle2 className="h-4 w-4" style={{ color: '#81572d' }} />
                      <p className="text-sm font-semibold tracking-wide" style={{ color: '#062a30' }}>
                        Récapitulatif de votre dossier
                      </p>
                    </div>
                    <div className="space-y-3 text-sm">
                      {[
                        {
                          label: 'Interventions souhaitées',
                          value: selectedInterventions.length > 0 ? selectedInterventions.join(', ') : 'Non renseigné',
                        },
                        {
                          label: 'Autres interventions (précisions)',
                          value: autresInterventionsDetails.trim() || '—',
                        },
                        {
                          label: 'Connaissance Dr Chennoufi',
                          value: formatSourceConnaissanceLabel(step1Form.getValues('sourceContact')) || '—',
                        },
                        {
                          label: 'Période souhaitée',
                          value: buildPeriodeSouhaitee(
                            step3Form.getValues('periodeSouhaiteeMois'),
                            step3Form.getValues('periodeSouhaiteeAnnee'),
                          ) || '—',
                        },
                        {
                          label: 'Accompagnant (séjour)',
                          value: step3Form.getValues('accompagnant') ? 'Oui' : 'Non',
                        },
                        {
                          label: 'Antécédents',
                          value: antecedents.length > 0 ? `${antecedents.length} renseigné(s)` : 'Aucun',
                        },
                        { label: 'Photos uploadées', value: uploadedPhotos.length },
                        { label: 'Documents (optionnel)', value: uploadedDocs.length },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="flex justify-between items-center py-2"
                          style={{ borderBottom: '1px solid rgba(228,200,189,0.4)' }}
                        >
                          <span style={{ color: '#929292' }}>{label}</span>
                          <span className="font-medium text-right" style={{ color: '#282727' }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    className="rounded-xl p-3 text-xs"
                    style={{ background: 'rgba(129,87,45,0.06)', border: '1px solid rgba(129,87,45,0.15)', color: '#81572d' }}
                  >
                    En soumettant ce formulaire, vous confirmez que les informations fournies sont exactes et complètes.
                  </div>
                  <div
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(6,42,48,0.04)', border: '1px solid rgba(6,42,48,0.1)' }}
                  >
                    <label className="flex items-start gap-3 text-sm leading-relaxed" style={{ color: '#282727' }}>
                      <Checkbox
                        checked={privacyAccepted}
                        onCheckedChange={(v) => {
                          const accepted = !!v
                          setPrivacyAccepted(accepted)
                          if (accepted) setPrivacyError('')
                        }}
                        className="mt-0.5"
                      />
                      <span>
                        J’atteste de l’authenticité des informations fournies et j’accepte que mes données médicales soient traitées par l’équipe du Dr Mehdi Chennoufi dans le cadre de ma prise en charge, conformément à la politique de confidentialité.{' '}
                        <a
                          href="#"
                          onClick={(e) => e.preventDefault()}
                          className="underline"
                          style={{ color: '#81572d' }}
                        >
                          Politique de confidentialité
                        </a>
                      </span>
                    </label>
                    {privacyError && (
                      <p className="mt-2 text-xs text-destructive">{privacyError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-[0.12em] uppercase transition-all"
                    style={{
                      background: '#062a30',
                      color: '#fdeada',
                      border: 'none',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#0d3d45'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#062a30'
                    }}
                  >
                    Soumettre mon dossier médical
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* â”€â”€ Navigation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {currentStep < 5 && (
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 justify-between pb-2">
              <button
                type="button"
                onClick={handleBack}
                disabled={currentStep === 1}
                className="w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm transition-all disabled:opacity-40"
                style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid rgba(228,200,189,0.6)',
                  color: '#282727',
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="w-full sm:w-auto justify-center flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold tracking-wide transition-all"
                style={{
                  background: '#062a30',
                  color: '#fdeada',
                  border: 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0d3d45' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#062a30' }}
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </main>
      {/* â”€â”€ Footer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <footer
        className="py-3 text-center text-xs tracking-widest uppercase"
        style={{ background: '#062a30', color: 'rgba(253,234,218,0.35)' }}
      >
        Â© 2026 Dr. Mehdi Chennoufi — Chirurgien Esthétique
      </footer>
    </div>

  )

}

