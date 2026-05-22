# Yesterday — 同步總譜管理與註記系統

Yesterday 是一套為樂團（特別是弦樂團）設計的線上總譜協作平台。樂團上傳整份總譜後，系統會解析並產生各聲部的分譜，協助首席線上完成弓法、力度、音色等註記，並在偵測到不同聲部應有一致演奏方式的段落時自動同步、衝突時自動提示，最終一鍵匯出包含所有註記的分譜與總譜。

> 課程：SAD（Systems Analysis and Design）期末專案

---

## 目錄

- [專案目的](#專案目的)
- [主要功能](#主要功能)
- [技術架構](#技術架構)
- [檔案架構](#檔案架構)
- [安裝說明](#安裝說明)
- [開發與啟動方式](#開發與啟動方式)
- [環境變數](#環境變數)
- [資料庫初始化](#資料庫初始化)
- [使用方法](#使用方法)
- [API 概覽](#api-概覽)
- [角色與權限](#角色與權限)
- [常見問題](#常見問題)

---

## 專案目的

樂團演奏需要協調各個聲部，例如小提琴和大提琴在演奏同一段落時，弓法的上下必須要相同。在目前實務上：

- 各聲部的首席會各自在自己聲部的分譜上做註記（弓法、力度、音色等）。
- 整個樂團還會有一份總譜，需要把各聲部的註記彙整在一起。
- 要對齊各聲部時，只能在團練時逐行確認，或傳送有註記的分譜 PDF 給其他首席手動核對，**耗時且容易出現疏漏**。

Yesterday 想解決的痛點：

1. **自動拆譜**：上傳一份 MusicXML 總譜，系統解析後生成各聲部分譜。
2. **跨聲部同步**：系統分析出「不同聲部需要一致演奏方式」的段落，註記後自動同步到其他聲部。
3. **衝突偵測**：偵測兩個聲部註記不一致或互相衝突的情況，主動通知指揮與首席協調。
4. **版本控制**：以類 Git 的方式記錄歷代版本、比較版本、建立分支與合併。
5. **一鍵輸出**：完成編輯後輸出各聲部分譜與含註記的總譜（MusicXML / PDF）。

詳細功能藍圖請參考 [`functional map.mmd`](./functional%20map.mmd)；後端 API 契約請參考 [`backend/README-backend.md`](./backend/README-backend.md)。

---

## 主要功能

- **專案與成員**：建立合奏專案、設定身分與樂器、產生邀請碼讓團員加入。
- **樂譜管理**：上傳 MusicXML（PDF 暫緩），依聲部自動分類、儲存於 Supabase Storage。
- **註記編輯器**：在瀏覽器內以 OpenSheetMusicDisplay 渲染樂譜，提供畫筆（上下弓符號等）、滴管、復原/重做、縮放等工具。
- **自動帶入與警示**：相同段落自動帶入註記、衝突時顯示警示。
- **歷史紀錄（類 Git）**：歷代版本、版本比較、版本切換、分支與合併（合併權限保留給群主／指揮）。
- **總譜合成與輸出**：根據各聲部的版本合成總譜，支援匯出 MusicXML 與 PDF。
- **管理員後台**：平台管理員可檢視所有專案、刪除專案、新增管理員帳號。

---

## 技術架構

### 前端

| 項目 | 內容 |
| --- | --- |
| 框架 | React 19 + TypeScript |
| 建構工具 | Vite |
| 路由 | react-router-dom v7 |
| 樣式 | Tailwind CSS v4 |
| 圖標 | lucide-react |
| 樂譜渲染 | opensheetmusicdisplay |
| 認證 | @react-oauth/google + 自建 JWT context |

### 後端

| 項目 | 內容 |
| --- | --- |
| Runtime | Node.js（**CommonJS**） |
| Web Framework | Express 5 |
| 資料庫 | Supabase PostgreSQL（`@supabase/supabase-js`） |
| 認證 | bcrypt + JWT；Google ID Token 驗證（`google-auth-library`） |
| 中介層 | `authMiddleware`、`projectPermissionMiddleware`、`loadScoreMiddleware`、`canEditScoreMiddleware`（預留） |
| 回應格式 | 統一 `sendSuccess` / `sendError`；全域 `notFound` + `errorHandler` |

### 通訊

- 前端開發伺服器（Vite）`5173`：`/api` 透過 proxy 轉發到後端。
- 後端 `3001`：對外 Base URL 為 `http://localhost:3001/api`。

---

## 檔案架構

```
Yesterday-SAD-Final-Project/
├── README.md                      # 本檔案
├── functional map.mmd             # 功能藍圖（Mermaid mindmap）
├── package.json                   # 前端 + monorepo 入口（含 dev/build 腳本）
├── vite.config.ts                 # Vite 設定（含 /api proxy）
├── tsconfig*.json                 # TypeScript 編譯設定
├── eslint.config.js               # ESLint 設定
├── index.html                     # Vite 入口 HTML
├── .env.example                   # 前端 + 後端共用環境變數樣板
│
├── public/                        # 靜態資源（Vite public）
│   ├── favicon.svg
│   ├── icons.svg
│   ├── musicxml/                  # 範例 MusicXML（Dvorak Sym. 9）
│   └── pdf/                       # 範例分譜 PDF
│
├── pdf/                           # 原始 PDF 素材（不直接給前端用）
│
├── src/                           # 前端原始碼（React + TS）
│   ├── main.tsx                   # 入口；包 GoogleOAuthProvider
│   ├── App.tsx                    # 路由設定
│   ├── index.css                  # Tailwind 全域樣式
│   ├── types.ts                   # 共用 TypeScript 型別
│   ├── vite-env.d.ts
│   ├── api/
│   │   ├── client.ts              # fetch 包裝、token 儲存、401 處理
│   │   ├── auth.ts                # /auth/* 呼叫
│   │   └── types.ts               # API 回應型別
│   ├── auth/
│   │   ├── AuthContext.tsx        # 使用者狀態 context
│   │   ├── ProtectedRoute.tsx     # 需登入路由守衛
│   │   └── GuestRoute.tsx         # 未登入專用路由（登入頁等）
│   ├── config/
│   │   └── env.ts                 # 讀取 VITE_* 環境變數
│   ├── state/
│   │   └── AppState.tsx           # 全域應用狀態
│   ├── mock/
│   │   └── mockData.ts            # 開發用假資料
│   ├── assets/                    # 前端內嵌資源
│   └── ui/
│       ├── layout/                # AppLayout / PublicLayout / HeaderBar / Sidebar / ToastStack
│       ├── pages/
│       │   ├── LandingPage.tsx
│       │   ├── LoginPage.tsx
│       │   ├── HomePage.tsx       # 登入後首頁（dashboard）
│       │   ├── ProjectsPage.tsx
│       │   ├── ProjectDetailPage.tsx
│       │   ├── ScoreEditorPage.tsx
│       │   ├── ScoreMusicXmlPage.tsx
│       │   ├── ScorePdfViewPage.tsx
│       │   ├── UserProfilePage.tsx
│       │   ├── AdminDashboardPage.tsx
│       │   ├── modals/
│       │   │   └── CreateProjectModal.tsx
│       │   └── project/           # 專案詳情頁子面板
│       │       ├── ScoresPanel.tsx
│       │       ├── MembersPanel.tsx
│       │       ├── BranchesPanel.tsx
│       │       ├── VersionsPanel.tsx
│       │       └── FullScorePanel.tsx
│       ├── primitives/            # Button / Card / Badge / Modal / Avatar
│       └── utils/
│           └── cn.ts              # className 合併工具
│
├── backend/                       # 後端服務（Express, CommonJS）
│   ├── package.json
│   ├── .env.example
│   ├── README-backend.md          # 後端 API 詳細契約
│   └── src/
│       ├── server.js              # 啟動 Express server
│       ├── app.js                 # 組裝 Express middleware 與路由
│       ├── config/
│       │   ├── env.js             # 讀取環境變數
│       │   └── supabase.js        # Supabase client
│       ├── routes/
│       │   ├── index.js           # /api 入口；掛載 /auth /projects /scores /health
│       │   ├── authRoutes.js
│       │   ├── projectRoutes.js
│       │   └── scoreRoutes.js
│       ├── controllers/           # auth / project / score / health
│       ├── services/              # 商業邏輯（auth / project / score / health）
│       ├── middlewares/
│       │   ├── authMiddleware.js              # Bearer JWT 驗證
│       │   ├── projectPermissionMiddleware.js # 專案成員權限
│       │   ├── loadScoreMiddleware.js         # 預先載入 score
│       │   ├── canEditScoreMiddleware.js      # 編輯權限（預留）
│       │   ├── notFound.js
│       │   └── errorHandler.js
│       └── utils/
│           ├── jwt.js             # JWT 簽發/驗證
│           ├── inviteToken.js     # 邀請碼簽發/驗證
│           ├── response.js        # sendSuccess / sendError
│           └── appError.js        # 自訂錯誤類別
│
└── supabase/
    ├── schema.sql                 # 建表、索引、view、trigger
    └── seed.sql                   # 範例資料（聲部、使用者、專案、樂譜）
```

---

## 安裝說明

### 先決條件

- **Node.js** ≥ 18（建議 LTS，因為 Express 5 + Vite 8 對版本敏感）
- **npm** ≥ 9
- 一個可用的 **Supabase** 專案（提供 PostgreSQL 與 Storage）
- 一組 **Google OAuth Client ID**（若要啟用 Google 登入）

### 取得程式碼

```bash
git clone <repo-url>
cd Yesterday-SAD-Final-Project
```

### 安裝依賴

根目錄已設定 `postinstall`，會自動安裝 `backend/` 內的依賴：

```bash
npm install
```

> 若只想單獨安裝後端依賴，可在 `backend/` 目錄下執行 `npm install`。

---

## 開發與啟動方式

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 同時啟動前端（Vite, `:5173`）與後端（Nodemon, `:3001`），輸出以 `frontend` / `backend` 區分顏色 |
| `npm run dev:frontend` | 只啟動 Vite 前端 |
| `npm run dev:backend` | 只啟動後端 |
| `npm run build` | 執行 `tsc -b && vite build` 建置前端 |
| `npm run preview` | 預覽前端 production build |
| `npm run lint` | 執行 ESLint |
| `npm start --prefix backend` | 以 `node` 直接啟動後端（production 用） |

啟動成功後：

- 前端：<http://localhost:5173>
- 後端 API：<http://localhost:3001/api>
- 健康檢查：<http://localhost:3001/api/health>

Vite 已設定把 `/api/*` 反向代理到 `:3001`，前端程式可直接呼叫相對路徑 `/api/...` 或使用 `VITE_API_URL`。

---

## 環境變數

複製 `.env.example` 為 `.env`（**放在專案根目錄**），根目錄 `.env` 同時涵蓋前端（`VITE_*`）與後端：

```dotenv
# Frontend (Vite)
VITE_API_URL=http://localhost:3001/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Backend (Express)
NODE_ENV=development
PORT=3001
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

如果只要單獨運行後端，也可以另外在 `backend/.env` 放後端那一段（已附 `backend/.env.example`）。

### 變數說明

- `VITE_API_URL`：前端呼叫後端的 base URL，預設 `http://localhost:3001/api`。
- `VITE_GOOGLE_CLIENT_ID`：給 `@react-oauth/google` 用。未設定時前端會跳過 Google 登入按鈕的 Provider。
- `SUPABASE_URL` / `SUPABASE_ANON_KEY`：後端連到 Supabase 用。
- `JWT_SECRET`：簽發 JWT 與邀請碼。請改成夠長的隨機字串。
- `JWT_EXPIRES_IN`：JWT 與邀請碼有效期，預設 `7d`。
- `GOOGLE_CLIENT_ID`：後端驗證 Google ID Token 用，需與前端 `VITE_GOOGLE_CLIENT_ID` 一致。

---

## 資料庫初始化

1. 在 Supabase 建立一個新專案，取得 `SUPABASE_URL` 與 `anon key`。
2. 開啟 Supabase SQL Editor，依序執行：
   - [`supabase/schema.sql`](./supabase/schema.sql)：建立 `users` / `sections` / `projects` / `project_members` / `scores` 等資料表、view、index、trigger。
   - [`supabase/seed.sql`](./supabase/seed.sql)：載入範例資料（5 個聲部、1 名 admin、5 名首席、20 名團員、1 個示範專案、10 份樂譜）。
3. 在 Supabase Storage 建立名為 `scores` 的 bucket（與 schema 中預設值一致）。

> seed 中的所有測試帳號密碼皆為 `password123`。例如：
> - `admin@orchestra.test`（平台管理員）
> - `concertmaster@orchestra.test`（總首席）
> - `principal.cello@orchestra.test`（大提琴首席）
> - …等

---

## 使用方法

以下流程對應 [`functional map.mmd`](./functional%20map.mmd) 的主幹功能。

1. **登入**：在 `/login` 以 email/password 或 Google 帳號登入。前端會把 JWT 存到 `localStorage`（key 為 `yesterday_auth_token`）。
2. **建立或加入專案**：
   - 群主：在「我的專案」按建立 → 填入名稱、描述、所屬聲部（`sectionId`）。
   - 受邀者：取得邀請碼後在「加入專案」貼上邀請碼並選擇聲部。
3. **上傳樂譜**：選擇 MusicXML 檔案上傳到對應聲部（PDF 暫緩）。
4. **編輯與註記**：進入 Score Editor，使用畫筆/滴管工具標註上下弓符號等記號。系統會在相同段落自動帶入註記，並對不一致處顯示警示。
5. **版本與分支**：可建立分支、比較版本、切換版本；分支合併權限保留給群主。
6. **總譜合成與輸出**：在 Full Score 面板選擇要套用的各聲部版本，預覽後匯出 MusicXML 或 PDF。

> 詳細的編輯器互動、衝突偵測 UI 仍在開發中，後端目前已完成認證、專案、邀請、樂譜列表/讀取等 MVP API；編輯類 API 預留 `canEditScoreMiddleware` 但尚未掛上路由。

---

## API 概覽

完整契約請見 [`backend/README-backend.md`](./backend/README-backend.md)。重點摘要：

| Method | Path | 說明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康檢查 |
| `POST` | `/api/auth/register` | 帳密註冊 |
| `POST` | `/api/auth/login` | 帳密登入，回傳 JWT |
| `POST` | `/api/auth/google` | Google ID Token 換成自家 JWT |
| `GET` | `/api/auth/me` | 取得目前登入者 |
| `POST` | `/api/projects` | 建立專案（必填 `sectionId`） |
| `GET` | `/api/projects` | 列出可見專案 |
| `GET` | `/api/projects/:projectId` | 取得單一專案 |
| `POST` | `/api/projects/:projectId/invite-code` | 產生邀請碼 |
| `POST` | `/api/projects/join-by-code` | 用邀請碼加入專案 |
| `GET` | `/api/projects/:projectId/scores` | 列出專案中可見的樂譜 |
| `GET` | `/api/scores/:scoreId` | 取得單一樂譜 metadata |

回應一律包含 `success` / `message` / `data` / `error` 四個欄位。需要登入的 API 必須帶：

```http
Authorization: Bearer <jwt>
```

---

## 角色與權限

| 角色 | 權限 |
| --- | --- |
| `platform_admin` | 看得到、管得到所有專案與樂譜 |
| `concertmaster`（總首席） | 看得到專案內所有聲部的樂譜；可建立邀請碼；可（未來）編輯 |
| `principal`（聲部首席） | 看得到自己聲部的樂譜；可建立邀請碼；可（未來）編輯自己聲部 |
| `member`（一般團員） | 看得到自己聲部的樂譜；不可編輯 |

商業規則（由資料庫 unique index 強制）：

- 每個專案僅一名 `concertmaster`。
- 每個專案的每個聲部僅一名 `principal`。

---

## 常見問題

- **`401 Unauthorized`**：八成是沒帶 `Authorization` header，或格式拼錯成 `Bearer<token>`（少空格）。前端 `apiRequest` 會在 401 時自動清除 token 並觸發登出。
- **`400 Invalid sectionId`**：建立專案或加入專案時 `sectionId` 必須是 `sections.id` 中既存的 UUID。先用 `seed.sql` 載入聲部資料。
- **`409 conflict`**：註冊時 email 重複，或加入專案時你已是該專案成員。
- **`scores` 沒有 `file_url`**：MVP 階段回傳的是 Storage metadata（`storage_bucket` / `storage_path` / `file_type` …），由前端自行向 Supabase Storage 取檔。
- **Google 登入按鈕看不到**：確認 `VITE_GOOGLE_CLIENT_ID` 已設定且重啟 Vite。後端則需要相同的 `GOOGLE_CLIENT_ID`。
- **前端打不到後端**：確認 `npm run dev` 兩條 process 都活著，或檢查 `vite.config.ts` 的 proxy 目標是不是 `:3001`。

---

歡迎開 issue 或 PR。專案仍在迭代中，部分功能（編輯器同步、衝突偵測、分支合併、PDF 匯出）為規劃中或開發中，實作進度以 `functional map.mmd` 為準。
