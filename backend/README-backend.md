# 後端 API 使用說明（前端整合）

本文件說明目前 MVP 階段前端需要對接的後端 API 契約與使用注意事項。

## 技術架構（Backend）

- Runtime：Node.js（CommonJS）
- Web Framework：Express.js
- Database：Supabase PostgreSQL（`@supabase/supabase-js`）
- Auth：
  - 帳密登入：bcrypt + JWT
  - Google 登入：Google ID Token 驗證 + JWT
- Middleware：
  - `authMiddleware`：Bearer Token 驗證
  - `projectPermissionMiddleware`：專案成員權限檢查
  - `canEditScoreMiddleware`：未來編輯權限預留（目前尚未掛載編輯 API）
- Error Handling：
  - 全域 `notFound` + `errorHandler`
  - 統一 response 格式（`sendSuccess` / `sendError`）

## 基本資訊

- 本機 API Base URL：`http://localhost:3001/api`
- 請求 Body 格式：`application/json`
- 需要登入的 API 請帶 JWT：
  - `Authorization: Bearer <token>`

## 回傳格式（統一）

成功回傳範例：

```json
{
  "success": true,
  "message": "string",
  "data": {},
  "error": null
}
```

失敗回傳範例：

```json
{
  "success": false,
  "message": "string",
  "data": null,
  "error": {}
}
```

## 前端呼叫注意事項（務必先看）

- 所有需要登入的 API，如果沒帶 `Authorization` 會回 `401`。
- `Authorization` 格式必須是 `Bearer <token>`，少空白或拼錯都會 `401`。
- 建立專案 `POST /projects` 目前 **必填** `sectionId`，未傳會 `400`。
- 目前 `scores` 回傳的是 Storage metadata，不是 `file_url`：
  - `storage_bucket`, `storage_path`, `file_type`, `original_filename`, `mime_type`, `file_size_bytes`
- 權限不足時：
  - 非專案成員查專案/樂譜通常回 `403`
  - 查詢不存在資料回 `404`

## 一、認證 API

### 1) `POST /auth/register`（一般註冊）

用途：用 email/password/name 建立帳號。

Request body：

```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "王小明"
}
```

注意：

- `email`、`password`、`name` 都必填。
- email 重複會失敗（通常 `409`）。
- 回傳 user 不會包含 `password_hash`。

### 2) `POST /auth/login`（一般登入）

用途：使用 email/password 登入並取得 JWT。

Request body：

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

成功後請把 `data.token` 存起來，後續呼叫受保護 API 都要帶。

### 3) `POST /auth/google`（Google 登入）

用途：前端拿到 Google `idToken` 後送到後端換自己的 JWT。

Request body：

```json
{
  "idToken": "google-id-token"
}
```

注意：

- 後端需設定 `GOOGLE_CLIENT_ID`。
- 資料表 `users` 需有 `google_sub` 欄位。

### 4) `GET /auth/me`（取得目前登入使用者）

用途：驗證 token 是否有效並取得目前使用者資料。

Header：

```http
Authorization: Bearer <token>
```

---

## 二、專案 API

### 1) `POST /projects`（建立專案）

用途：建立專案，並把建立者自動加入 `project_members`（角色為 `concertmaster`）。

Header：

```http
Authorization: Bearer <token>
```

Request body：

```json
{
  "name": "弦樂團期末音樂會",
  "description": "2026 春季演出",
  "sectionId": "11111111-1111-1111-1111-111111111101"
}
```

必填參數：

- `name`：專案名稱
- `sectionId`：建立者所屬聲部（`sections.id`）

注意：

- `sectionId` 不可省略，否則回 `400`。
- `sectionId` 必須是資料庫中存在的 `sections.id`（有效 UUID），若不存在會回 `400`（`Invalid sectionId: section does not exist`）。
- `created_by` 會寫入目前登入者。

### 2) `GET /projects`（專案列表）

用途：依登入者權限取得可見專案。

權限規則：

- `platform_admin`：可看全部專案
- 其他使用者：只看自己有加入 `project_members` 的專案

### 3) `GET /projects/:projectId`（單一專案）

用途：查詢特定專案詳細資料。

權限規則：

- `platform_admin`：可查看
- 其他使用者：必須為該專案成員，否則 `403`

### 4) `POST /projects/:projectId/invite-code`（建立邀請碼）

用途：為指定專案產生可分享的邀請碼（JWT token 字串）。

Header：

```http
Authorization: Bearer <token>
```

權限規則：

- `platform_admin`：可建立
- 專案內 `concertmaster`、`principal`：可建立
- 其他角色：`403`

Response `data`：

```json
{
  "inviteCode": "eyJhbGciOiJIUzI1NiIsInR5cCI..."
}
```

注意：

- 邀請碼沿用 `JWT_SECRET` 進行簽發與驗證（MVP 簡化方案）。
- 邀請碼有效時間沿用 `JWT_EXPIRES_IN`（預設 `7d`）。

### 5) `POST /projects/join-by-code`（用邀請碼加入專案）

用途：登入使用者透過邀請碼加入專案，加入後預設角色為 `member`。

Header：

```http
Authorization: Bearer <token>
```

Request body：

```json
{
  "inviteCode": "eyJhbGciOiJIUzI1NiIsInR5cCI...",
  "sectionId": "11111111-1111-1111-1111-111111111102"
}
```

必填參數：

- `inviteCode`：由建立邀請碼 API 取得
- `sectionId`：使用者加入時選擇的聲部（必須是有效 `sections.id`）

可能錯誤：

- `400`：邀請碼無效/過期，或 `sectionId` 不存在
- `409`：該使用者已經是專案成員

---

## 三、樂譜 API

### 1) `GET /projects/:projectId/scores`（查專案樂譜列表）

用途：取得該專案中目前使用者可見的樂譜。

權限規則：

- `platform_admin`：同 project 全部聲部可見
- `concertmaster`：同 project 全部聲部可見
- `principal`：只可見自己 `section_id` 的樂譜
- `member`：只可見自己 `section_id` 的樂譜
- 非專案成員：`403`

### 2) `GET /scores/:scoreId`（查單一樂譜）

用途：依 scoreId 取得樂譜 metadata。

流程：

1. 先載入 score
2. 檢查是否為該專案成員（或 admin）
3. 套用同上可視規則（section-based）

無權限回 `403`。

---

## 四、目前 scores 欄位（前端常用）

前端展示或開啟檔案時，請使用以下欄位：

- `id`
- `project_id`
- `section_id`
- `title`
- `storage_bucket`
- `storage_path`
- `file_type`（`musicxml` / `xml` / `mxl`）
- `original_filename`
- `mime_type`
- `file_size_bytes`

---

## 五、推薦前端串接順序

1. 先做登入（`/auth/login` 或 `/auth/google`）拿 `token`
2. 呼叫 `/auth/me` 確認目前使用者
3. 呼叫 `/projects` 顯示可見專案
4. 點進專案後呼叫 `/projects/:projectId/scores`
5. 點某份樂譜時呼叫 `/scores/:scoreId`

---

## 六、未來擴充（目前先不用）

已預留 `canEditScoreMiddleware`（`src/middlewares/canEditScoreMiddleware.js`）供未來編輯 API 使用，目前尚未掛上路由。

預設策略：

- `platform_admin`：可編輯
- `concertmaster`：可編輯
- `principal`：可編輯自己聲部
- `member`：不可編輯

---

## 七、建議前端邀請流程

1. 專案頁面按「產生邀請碼」呼叫 `POST /projects/:projectId/invite-code`
2. 前端拿到 `inviteCode` 後可做：
   - 顯示給使用者複製
   - 組成分享連結（例如帶在 query string）
3. 被邀請者登入後，在加入頁面選擇 `sectionId` 並呼叫 `POST /projects/join-by-code`
4. 成功後重新呼叫 `GET /projects` 更新清單
