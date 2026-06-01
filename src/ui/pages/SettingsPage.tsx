import {
  useAppState,
  type ColorModePreference,
  type LanguagePreference,
} from '../../state/AppState'
import { useTranslation } from '../../i18n'
import { Card } from '../primitives/Card'
import { Check, Languages, Moon, Settings, Sun } from 'lucide-react'
import { cn } from '../utils/cn'

const languageOptions: LanguagePreference[] = ['en', 'zh']

const colorModeOptions: Array<{
  value: ColorModePreference
  icon: React.ReactNode
}> = [
  { value: 'light', icon: <Sun className="size-4" /> },
  { value: 'dark', icon: <Moon className="size-4" /> },
]

export function SettingsPage() {
  const { colorMode, language, setColorMode, setLanguage, addToast } = useAppState()
  const { t } = useTranslation()

  function chooseLanguage(nextLanguage: LanguagePreference) {
    if (nextLanguage === language) return
    setLanguage(nextLanguage)
    addToast({
      title: t('settings.languageSaved'),
      message: nextLanguage === 'en'
        ? t('settings.language.en.label')
        : t('settings.language.zh.label'),
    })
  }

  function chooseColorMode(nextColorMode: ColorModePreference) {
    if (nextColorMode === colorMode) return
    setColorMode(nextColorMode)
    addToast({
      title: t('settings.appearanceSaved'),
      message: nextColorMode === 'light' ? t('settings.lightMode') : t('settings.darkMode'),
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
            <div className="text-xl font-semibold text-slate-950">{t('settings.title')}</div>
            <div className="mt-1 text-sm text-slate-600">{t('settings.description')}</div>
          </div>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Languages className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950">
              {t('settings.language.title')}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {t('settings.language.description')}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {languageOptions.map((option) => {
                const selected = option === language
                const label =
                  option === 'en' ? t('settings.language.en.label') : t('settings.language.zh.label')
                const description =
                  option === 'en'
                    ? t('settings.language.en.description')
                    : t('settings.language.zh.description')

                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseLanguage(option)}
                    className={cn(
                      'flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5',
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span>
                      <span className="block text-sm font-semibold">{label}</span>
                      <span
                        className={cn(
                          'mt-1 block text-xs',
                          selected ? 'text-slate-200' : 'text-slate-500',
                        )}
                      >
                        {description}
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

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
            <Sun className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950">
              {t('settings.appearance.title')}
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {t('settings.appearance.description')}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {colorModeOptions.map((option) => {
                const selected = option.value === colorMode
                const label =
                  option.value === 'light'
                    ? t('settings.appearance.light.label')
                    : t('settings.appearance.dark.label')
                const description =
                  option.value === 'light'
                    ? t('settings.appearance.light.description')
                    : t('settings.appearance.dark.description')

                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseColorMode(option.value)}
                    className={cn(
                      'group flex items-start justify-between gap-3 rounded-lg border p-4 text-left transition-all duration-200 ease-out hover:-translate-y-0.5',
                      selected
                        ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <span className="flex min-w-0 gap-3">
                      <span
                        className={cn(
                          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md transition',
                          selected ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {option.icon}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span
                          className={cn(
                            'mt-1 block text-xs',
                            selected ? 'text-slate-200' : 'text-slate-500',
                          )}
                        >
                          {description}
                        </span>
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
