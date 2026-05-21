import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Button } from '../primitives/Button'
import { Card } from '../primitives/Card'
import {
  ArrowRight,
  GitBranch,
  Music2,
  Users,
  FolderKanban,
  Sparkles,
} from 'lucide-react'

const features = [
  {
    icon: FolderKanban,
    title: '專案與成員管理',
    description: '建立合奏專案、邀請團員，並依角色分配樂器與權限。',
  },
  {
    icon: Music2,
    title: '樂譜檢視與編輯',
    description: '在瀏覽器中開啟 MusicXML 樂譜，支援即時檢視與編輯體驗。',
  },
  {
    icon: GitBranch,
    title: '分支與版本協作',
    description: '以分支管理不同排練版本，追蹤變更並合併更新。（Beta）',
  },
  {
    icon: Sparkles,
    title: '練習進度追蹤',
    description: '標記已練習段落，掌握個人與團隊的排練進度。',
  },
]

const steps = [
  { step: '1', title: '建立專案', description: '設定合奏類型並邀請成員加入。' },
  { step: '2', title: '上傳樂譜', description: '匯入 MusicXML 或 PDF 分譜檔案。' },
  { step: '3', title: '協作編輯', description: '在分支上編輯、合併，同步最新版本。' },
]

export function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-md bg-slate-950 text-white">
              <Music2 className="size-4" />
            </div>
            <span className="text-lg font-semibold text-slate-950">Yesterday</span>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <Button onClick={() => navigate('/dashboard')}>
                進入工作區
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => navigate('/login')}>登入</Button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800">
            <Users className="size-3.5" />
            合奏樂譜協作工作區
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            讓合奏排練的樂譜管理，變得更簡單
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Yesterday 是專為合奏團設計的樂譜協作平台。集中管理分譜、追蹤版本、協調成員，讓每次排練都更有效率。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}>
              開始使用
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              了解更多
            </Button>
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-slate-200 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-950">系統功能</h2>
            <p className="mt-2 text-slate-600">從專案建立到樂譜協作，一站式完成</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="p-5">
                <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
                  <feature.icon className="size-5" />
                </div>
                <div className="text-sm font-semibold text-slate-950">{feature.title}</div>
                <p className="mt-2 text-sm text-slate-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold text-slate-950">使用流程</h2>
            <p className="mt-2 text-slate-600">三步驟開始你的合奏專案</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {steps.map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-800">
                  {item.step}
                </div>
                <div className="font-semibold text-slate-950">{item.title}</div>
                <p className="mt-1 text-sm text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-950 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="text-2xl font-semibold">準備好開始了嗎？</h2>
          <p className="mt-2 text-slate-300">建立帳號，立即體驗 Yesterday 合奏工作區</p>
          <div className="mt-6">
            {isAuthenticated ? (
              <Button variant="secondary" onClick={() => navigate('/dashboard')}>
                進入工作區
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Link to="/login">
                <Button variant="secondary">免費註冊 / 登入</Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-sm text-slate-500">
        Yesterday — Ensemble score workspace
      </footer>
    </div>
  )
}
