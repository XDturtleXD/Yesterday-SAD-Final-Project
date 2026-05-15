# 後端 API 使用說明（前端整合）

本文件說明目前 MVP 階段前端需要對接的後端 API 契約與使用注意事項。

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
