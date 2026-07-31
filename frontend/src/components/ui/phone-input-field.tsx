import { useMemo, useState } from 'react'
import PhoneInput, { getCountries, type Country } from 'react-phone-number-input'
import fr from 'react-phone-number-input/locale/fr.json'
import { cn } from '@/lib/utils'
import {
  isTunisianPhone,
  TUNISIA_PHONE_BLOCK_MESSAGE,
} from '@/lib/phonePolicy'
import 'react-phone-number-input/style.css'

type Props = {
  value: string
  onChange: (value: string | undefined) => void
  disabled?: boolean
  /** Affichage plus compact (ex. à côté de l’email). */
  compact?: boolean
  /** Afficher le message d’exclusion Tunisie sous le champ. */
  showPolicyHint?: boolean
}

const ALLOWED_COUNTRIES = getCountries().filter((c) => c !== 'TN') as Country[]

/** Téléphone avec choix du pays / indicatif (E.164). Tunisie masquée. */
export function PhoneInputField({
  value,
  onChange,
  disabled,
  compact = false,
  showPolicyHint = true,
}: Props) {
  const [blocked, setBlocked] = useState(() => isTunisianPhone(value))

  const handleChange = (next: string | undefined) => {
    if (next && isTunisianPhone(next)) {
      setBlocked(true)
      onChange(undefined)
      return
    }
    setBlocked(false)
    onChange(next)
  }

  const countries = useMemo(() => ALLOWED_COUNTRIES, [])

  return (
    <div className="space-y-1.5 w-full min-w-0">
      <PhoneInput
        international
        countryCallingCodeEditable={false}
        defaultCountry="FR"
        countries={countries}
        labels={fr}
        placeholder="Téléphone *"
        value={value || undefined}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          'formulaire-phone',
          compact && 'formulaire-phone--compact',
          blocked && 'formulaire-phone--blocked',
        )}
      />
      {showPolicyHint && blocked && (
        <p className="text-xs leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {TUNISIA_PHONE_BLOCK_MESSAGE}
        </p>
      )}
    </div>
  )
}

export { isValidPhoneNumber } from 'react-phone-number-input'
export { isTunisianPhone, TUNISIA_PHONE_BLOCK_MESSAGE }
