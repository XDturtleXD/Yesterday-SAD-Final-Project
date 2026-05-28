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

### 3) `POST /projects/:projectId/scores`（上傳樂譜）

用途：對應 `functional map.mmd` 的「上傳樂譜」。在指定專案中為某個曲目
（piece）× 某個聲部建立一份樂譜。同一個專案中同名曲目會自動共用一個
`piece` row。

權限規則：

- `platform_admin`、`concertmaster`：可為任何聲部上傳
- `principal`：**只能為自己的 `section_id` 上傳**
- `member`：不可上傳，固定 `403`
- 非專案成員：`403`

Header：

```http
Authorization: Bearer <token>
Content-Type: application/json
```

Request body：

```json
{
  "sectionId": "11111111-1111-1111-1111-111111111101",
  "title": "第一小提琴 - Beethoven 5th - Movement 1",
  "piece": { "title": "Symphony No. 5", "composer": "Beethoven" },
  "fileType": "musicxml",
  "xmlContent": "<?xml version=\"1.0\"?>...<score-partwise>...</score-partwise>",
  "originalFilename": "beethoven_5_m1_violin1.musicxml",
  "mimeType": "application/vnd.recordare.musicxml+xml",
  "fileSizeBytes": 182044
}
```

必填參數：

- `sectionId`：聲部 UUID，必須是資料庫中存在的 `sections.id`。
- `title`：這份樂譜的標題（例：第一小提琴 - Beethoven 5th）。
- **曲目擇一**：
  - `piece.title`（與選用的 `piece.composer`）：依 `(project_id, title)` 在
    `pieces` 中尋找，找不到則自動建立並指派下一個 `sort_order`。
  - `pieceId`：直接指定既有的 `pieces.id`（必須屬於同專案，否則 `404`）。
- **檔案內容擇一**：
  - `xmlContent`：MusicXML / XML 檔案內容字串（≤ 5 MB；超出回 `413`）。寫入
    `scores.xml_content`，並由後端自動合成 `storage_path`。
  - `storagePath`：若前端已先把檔案上傳到 Supabase Storage，直接傳 path。
    此時 `xmlContent` 不必填、`scores.xml_content` 將為 `null`。

可選參數：

- `fileType`：`musicxml`、`xml`、`mxl` 三選一，預設 `musicxml`。
- `storageBucket`：預設 `scores`。
- `originalFilename`、`mimeType`、`fileSizeBytes`：metadata，未提供即為 `null`。

可能錯誤：

- `400`：必填欄位缺少、`fileType` 不合法、同時提供 `pieceId` 與 `piece.title`、
  同時都沒提供、`sectionId` 不存在。
- `403`：權限不足（如 `principal` 試圖上傳到其他聲部，或 `member` 嘗試上傳）。
- `404`：`pieceId` 不屬於此 `projectId`。
- `409`：`(piece_id, section_id)` 已存在一份樂譜（schema 的
  `scores_piece_section_unique` 約束）。
- `413`：`xmlContent` 超過 5 MB 上限。

Response（`201`）`data`：

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "piece_id": "uuid",
  "section_id": "uuid",
  "title": "第一小提琴 - Beethoven 5th - Movement 1",
  "storage_bucket": "scores",
  "storage_path": "inline/<project>/<piece>/<section>.musicxml",
  "file_type": "musicxml",
  "original_filename": "beethoven_5_m1_violin1.musicxml",
  "mime_type": "application/vnd.recordare.musicxml+xml",
  "file_size_bytes": 182044,
  "xml_content": "<?xml ...",
  "created_by": "uuid",
  "created_at": "iso-timestamp",
  "updated_at": "iso-timestamp"
}
```

> 上傳採用 `application/json`（MVP 簡化方案）；前端讀取檔案後以字串放在
> `xmlContent`。日後若要支援大檔或 `mxl` 二進位檔，再改成 multipart 上傳。

---

## 三之二、歷史紀錄 API（git-like history）

對應 `functional map.mmd` 的「歷史紀錄_用git_」分支。所有路由都掛在
`/api/projects/:projectId/...` 底下，並要求：

- 必須登入（`Authorization: Bearer <token>`）。
- 必須是該專案成員，否則回 `403`；`platform_admin` 例外。

權限規則速查：

| 動作 | 允許的角色 |
| --- | --- |
| 列出 / 查詢 branches、commits、compare | 所有專案成員（含 `platform_admin`） |
| 建立 branch (`POST /branches`) | 所有專案成員 |
| 改 branch head 或改名 (`PATCH /branches/:branchId`) | `concertmaster`、`platform_admin` |
| 刪除 branch (`DELETE /branches/:branchId`) | `concertmaster`、`platform_admin`；不可刪 `is_default` |
| 建立 commit (`POST /branches/:branchId/commits`) | `concertmaster`、`principal`、`platform_admin`；`principal` 只能 commit 自己聲部的 score |
| 合併 branch (`POST /merges`) | `concertmaster`、`platform_admin`（對應「群主才可以合併」） |

可視範圍補充：`principal` / `member` 呼叫 `GET /commits/:commitId` 與
`GET /commits/compare` 時，回傳的 `score_versions` 會自動只保留**自己聲部**的
紀錄；commit metadata（message、author、時間）仍可看到。

### 1) `GET /projects/:projectId/branches`（列出分支）

用途：列出該專案所有分支。回傳會把 `is_default = true` 的分支排在最前面。

Response `data`（陣列）：

```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "name": "main",
    "head_commit_id": "uuid | null",
    "is_default": true,
    "created_by": "uuid",
    "created_at": "iso-timestamp",
    "updated_at": "iso-timestamp"
  }
]
```

### 2) `POST /projects/:projectId/branches`（建立分支）

用途：建立新分支。專案第一條分支會自動成為 `is_default = true`。

Request body：

```json
{
  "name": "feature/bowing-fix",
  "fromCommitId": "uuid"
}
```

必填參數：

- `name`：分支名稱；同一專案內不可重複，否則回 `409`。

可選參數：

- `fromCommitId`：自哪個 commit 分出來；若提供必須屬於同一專案，否則回 `404`。未提供時 `head_commit_id` 為 `null`（空分支）。

### 3) `GET /projects/:projectId/branches/:branchId`

用途：取得單一分支詳細資料。分支不存在回 `404`。

### 4) `PATCH /projects/:projectId/branches/:branchId`（版本切換 / 改名）

用途：對應「版本切換」。把 `head_commit_id` 移到任一 commit，或重新命名分支。
僅 `concertmaster`、`platform_admin` 可操作，否則回 `403`。

Request body（兩個欄位至少要有一個）：

```json
{
  "headCommitId": "uuid | null",
  "name": "new-name"
}
```

注意：

- `headCommitId` 必須是同專案的 commit，否則回 `404`。
- `headCommitId: null` 可清空（回到尚未 commit 的狀態）。
- 沒有任何可更新欄位回 `400`。

### 5) `DELETE /projects/:projectId/branches/:branchId`（刪除分支）

權限：`concertmaster`、`platform_admin`。

注意：

- 不能刪除 `is_default = true` 的分支，會回 `400`。
- 連動：相關 commits（`on delete cascade`）與其 `score_versions` 會一併移除。

### 6) `GET /projects/:projectId/branches/:branchId/commits`（歷代版本）

用途：對應「歷代版本」。列出指定分支上所有 commits（依 `created_at` 倒序）。

Response `data`（陣列）：

```json
[
  {
    "id": "uuid",
    "project_id": "uuid",
    "branch_id": "uuid",
    "parent_commit_id": "uuid | null",
    "merge_parent_commit_id": "uuid | null",
    "message": "string",
    "author_user_id": "uuid",
    "created_at": "iso-timestamp"
  }
]
```

### 7) `POST /projects/:projectId/branches/:branchId/commits`（建立 commit）

用途：在指定分支上新增一個 commit，並把指定的 score 變更打成 snapshot。

權限：`concertmaster`、`principal`、`platform_admin`。`principal` 不能對非自己
聲部的 score 建立 commit，否則回 `403`。

Request body：

```json
{
  "message": "Update violin1 bowing in m. 10-15",
  "scoreSnapshots": [
    {
      "scoreId": "uuid",
      "storageBucket": "scores",
      "storagePath": "projects/<id>/violin1/...musicxml",
      "fileType": "musicxml",
      "originalFilename": "violin1-r3.musicxml",
      "mimeType": "application/vnd.recordare.musicxml+xml",
      "fileSizeBytes": 182044
    }
  ]
}
```

必填參數：

- `message`：commit 訊息。
- `scoreSnapshots`：非空陣列。每筆必須含 `scoreId`、`storagePath`、`fileType`（`musicxml` / `xml` / `mxl`）。`storageBucket` 預設 `scores`。

可選參數（每筆 snapshot）：

- `originalFilename`、`mimeType`、`fileSizeBytes`：metadata，未提供視為 `null`。

行為：

- 新 commit 的 `parent_commit_id` = 該分支當下的 `head_commit_id`。
- score_versions 內容 = 父 commit 的 score_versions ∪ 本次 `scoreSnapshots`（同 `scoreId` 時以本次為準），確保每個 commit 都包含所有 scores 的完整快照。
- 成功後該分支的 `head_commit_id` 會更新為新 commit。

Response `data`：

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "branch_id": "uuid",
  "parent_commit_id": "uuid | null",
  "merge_parent_commit_id": null,
  "message": "string",
  "author_user_id": "uuid",
  "created_at": "iso-timestamp",
  "score_versions": [
    {
      "id": "uuid",
      "commit_id": "uuid",
      "score_id": "uuid",
      "storage_bucket": "scores",
      "storage_path": "string",
      "file_type": "musicxml",
      "original_filename": "string | null",
      "mime_type": "string | null",
      "file_size_bytes": 123,
      "created_at": "iso-timestamp"
    }
  ]
}
```

### 8) `GET /projects/:projectId/commits/:commitId`（單一 commit）

用途：取得 commit 詳細資料（含 score_versions）。`principal` / `member`
僅看得到自己聲部的 score_versions。

Response 同 `POST /commits` 的回傳格式。

### 9) `GET /projects/:projectId/commits/compare`（比較版本）

用途：對應「比較版本」。比對兩個 commits 的 score_versions 差異。

Query string：

- `from`（必填）：起點 commitId（必須屬於同專案）。
- `to`（必填）：終點 commitId（必須屬於同專案）。

Response `data`：

```json
{
  "from": { "id": "uuid", "...": "..." },
  "to": { "id": "uuid", "...": "..." },
  "added":     [{ "scoreId": "uuid", "from": null, "to": { "...": "..." } }],
  "removed":   [{ "scoreId": "uuid", "from": { "...": "..." }, "to": null }],
  "modified":  [{ "scoreId": "uuid", "from": { "...": "..." }, "to": { "...": "..." } }],
  "unchanged": [{ "scoreId": "uuid", "from": { "...": "..." }, "to": { "...": "..." } }]
}
```

分類規則：以 `(storage_bucket, storage_path)` 是否相等判斷 `modified` 與
`unchanged`。`principal` / `member` 只會看到自己聲部的 scoreId。

### 10) `POST /projects/:projectId/merges`（合併分支）

用途：對應「分支合併」。把 `fromBranchId` 合進 `intoBranchId`，在後者上產生
一個 merge commit。

權限：僅 `concertmaster`、`platform_admin`（對應 functional map 中的
「群主才可以合併」）。

Request body：

```json
{
  "fromBranchId": "uuid",
  "intoBranchId": "uuid",
  "message": "Merge feature/bowing-fix into main"
}
```

必填參數：

- `fromBranchId`、`intoBranchId`：兩個分支必須屬於同一個 `projectId` 且不可相同。
- `fromBranch` 必須已有至少一個 commit（`head_commit_id != null`），否則回 `400`。

可選參數：

- `message`：merge commit 訊息；未提供時自動產生
  `"Merge branch '<from.name>' into '<into.name>'"`。

行為：

- 新 merge commit 寫到 `intoBranchId`，`parent_commit_id` = `intoBranch.head`、
  `merge_parent_commit_id` = `fromBranch.head`。
- score_versions 合併策略：以 `intoBranch.head` 為底，被 `fromBranch.head` 的
  版本覆蓋（即同 `scoreId` 時 `fromBranch` 勝出）。MVP 階段不在 merge API 內
  做 conflict detection；如需偵測請在合併前自行呼叫 `GET /commits/compare`。
- 成功後 `intoBranch.head_commit_id` 更新為這個 merge commit。

Response 同 `POST /commits` 的回傳格式。

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
