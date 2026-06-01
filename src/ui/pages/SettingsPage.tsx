import { useAppState, type LanguagePreference } from '../../state/AppState'
import { Card } from '../primitives/Card'
import { Check, Languages, Settings } from 'lucide-react'
import { cn } from '../utils/cn'

const languageOptions: Array<{
  value: LanguagePreference
  label: string
  description: string
}> = [
  {
    value: 'en',
    label: 'English',
    description: 'Use English as the app language.',
  },
  {
    value: 'zh',
    label: 'Chinese',
    description: 'Use Chinese as the app language.',
  },
]

export function SettingsPage() {
  const { language, setLanguage, addToast } = useAppState()

  function chooseLanguage(nextLanguage: LanguagePreference) {
    setLanguage(nextLanguage)
    addToast({
      title: 'Language preference saved',
      message: nextLanguage === 'en' ? 'English' : 'Chinese',
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-slate-950 text-white">
            <Settings className="size-5" />
          </div>
          <div>
            <div className="text-xl font-semibold text-slate-950">Settings</div>
            <div className="mt-1 text-sm text-slate-600">
              Manage workspace preferences for your account.
            </div>
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Languages className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950">Language preference</div>
            <div className="mt-1 text-sm text-slate-600">
              English is the default. Choose Chinese if you prefer Chinese labels later.
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {languageOptions.map((option) => {
                const selected = option.value === language

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseLanguage(option.value)}
                    className={cn(
                      'flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition',
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span
                        className={cn(
                          'mt-1 block text-xs',
                          selected ? 'text-slate-200' : 'text-slate-500',
                        )}
                      >
                        {option.description}
                      </span>
                    </span>
                    {selected && <Check className="mt-0.5 size-4 shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
