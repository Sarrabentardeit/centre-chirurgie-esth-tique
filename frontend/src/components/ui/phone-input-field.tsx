import PhoneInput from 'react-phone-number-input'
import fr from 'react-phone-number-input/locale/fr.json'
import { cn } from '@/lib/utils'
import 'react-phone-number-input/style.css'

type Props = {
  value: string
  onChange: (value: string | undefined) => void
  disabled?: boolean
  /** Affichage plus compact (ex. à côté de l’email). */
  compact?: boolean
}

/** Téléphone avec choix du pays / indicatif (E.164 en sortie). */
export function PhoneInputField({ value, onChange, disabled, compact = false }: Props) {
  return (
    <PhoneInput
      international
      countryCallingCodeEditable={false}
      defaultCountry="TN"
      labels={fr}
      placeholder="Téléphone *"
      value={value || undefined}
      onChange={onChange}
      disabled={disabled}
      className={cn('formulaire-phone', compact && 'formulaire-phone--compact')}
    />
  )
}

export { isValidPhoneNumber } from 'react-phone-number-input'
