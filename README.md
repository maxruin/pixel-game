# 像素街機問答遊戲 (Pixel Quiz Quest)

這是一個以 Retro 街機與像素霓虹風 (Pixel Art) 為主題的 React 問答遊戲。前端採用 React Vite 開發，利用純 Web Audio API 合成復古的 8-bit 音效，並整合 Google Sheets 作為後端資料庫，透過 Google Apps Script (GAS) 進行題目隨機分發與玩家分數的記錄。

---

## 🎮 遊戲特色
- **8-bit 霓虹風格**：經典的 CRT 螢幕光柵濾鏡、3D 像素立體按鈕與 Press Start 2P 街機字型。
- **100 張關主預載**：首頁載入時預快取 100 張 DiceBear 像素關主頭像，答題時關卡無縫切換不閃爍。
- **純 Web Audio 合成音效**：無需載入額外 MP3/WAV，100% 透過瀏覽器音頻上下文生成，極速載入且質感十足。
- **安全性設計**：前端不下載「答案」欄位，完全由 Google Apps Script 進行成績計算與資料庫寫入。

---

## 🛠️ 本機安裝與啟動

### 1. 安裝相依性套件
在專案根目錄下，執行以下指令安裝套件：
```bash
npm install
```

### 2. 啟動開發伺服器
```bash
npm run dev
```
啟動後在瀏覽器開啟 `http://127.0.0.1:5173/` 即可遊玩。

### 3. 編譯生產版本
```bash
npm run build
```

---

## 📊 Google Sheets 欄位配置

您需要在 Google 雲端硬碟建立一份 Google 試算表，並包含以下兩個工作表：

### 工作表 1：`題目`
此工作表存放問答遊戲的題庫。請務必依循以下欄位順序（第一列為標題列）：

| 題號 | 題目 | A | B | C | D | 解答 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 題目敘述... | 選項A內容 | 選項B內容 | 選項C內容 | 選項D內容 | A |

> 💡 **注意**：`解答` 欄位請務必填寫大寫的 `A`、`B`、`C` 或 `D`。

### 工作表 2：`回答`
此工作表用於存放使用者的挑戰紀錄。請建立以下標題列即可（後續由 GAS 自動寫入）：

| ID | 闖關次數 | 總分 | 最高分 | 第一次通關分數 | 花了幾次通關 | 最近遊玩時間 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |

---

## ⚙️ Google Apps Script (GAS) 部署說明

1. 在您的 Google 試算表頁面中，點選上方選單的 **「擴充功能」 > 「Apps Script」**。
2. 清空原本的 `程式碼.gs`，並複製貼上以下腳本程式碼：

```javascript
function doGet(e) {
  var action = e.parameter.action;
  if (action === 'getQuestions') {
    return getQuestions(e.parameter.count);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: "Invalid action" }))
                       .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;
    if (action === 'submitAnswers') {
      return submitAnswers(postData.id, postData.answers);
    }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ error: "Invalid action" }))
                       .setMimeType(ContentService.MimeType.JSON);
}

// 獲取隨機 N 題（不包含解答欄位）
function getQuestions(countStr) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("題目");
  var data = sheet.getDataRange().getValues();
  var rows = data.slice(1);
  
  var count = parseInt(countStr) || 5;
  
  // 隨機打亂並選取 N 題
  var shuffled = rows.sort(function() { return 0.5 - Math.random(); });
  var selected = shuffled.slice(0, count);
  
  var questions = selected.map(function(row) {
    return {
      id: row[0],
      question: row[1],
      options: {
        A: row[2],
        B: row[3],
        C: row[4],
        D: row[5]
      }
    };
  });
  
  return ContentService.createTextOutput(JSON.stringify({ questions: questions }))
                       .setMimeType(ContentService.MimeType.JSON);
}

// 提交答案，計算成績並寫入「回答」工作表
function submitAnswers(userId, userAnswers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var qSheet = ss.getSheetByName("題目");
  var rSheet = ss.getSheetByName("回答");
  
  var qData = qSheet.getDataRange().getValues();
  var answerMap = {};
  for (var i = 1; i < qData.length; i++) {
    var qId = qData[i][0];
    var correctAns = qData[i][6];
    answerMap[qId] = String(correctAns).trim().toUpperCase();
  }
  
  var score = 0;
  userAnswers.forEach(function(ua) {
    var correct = answerMap[ua.questionId];
    if (correct && ua.selected.trim().toUpperCase() === correct) {
      score++;
    }
  });
  
  var rData = rSheet.getDataRange().getValues();
  var userRowIndex = -1;
  // 從 j = 1 開始，跳過第一列標題列
  for (var j = 1; j < rData.length; j++) {
    if (String(rData[j][0]) === String(userId)) {
      userRowIndex = j + 1;
      break;
    }
  }
  
  var now = new Date();
  var totalQuestions = userAnswers.length;
  var isPassThisTime = score >= (totalQuestions * 0.6);
  
  var playCount = 0;
  var totalScore = 0;
  var maxScore = 0;
  var firstPassScore = "";
  var attemptsToPass = "";
  
  if (userRowIndex !== -1) {
    // 直接從已讀取的資料拿取舊紀錄，避免重複呼叫 API
    var currentRow = rData[userRowIndex - 1];
    playCount = parseInt(currentRow[1]) || 0;
    totalScore = parseFloat(currentRow[2]) || 0;
    maxScore = parseFloat(currentRow[3]) || 0;
    firstPassScore = currentRow.length > 4 ? currentRow[4] : "";
    attemptsToPass = currentRow.length > 5 ? currentRow[5] : "";
    
    playCount += 1;
    totalScore += score;
    maxScore = Math.max(maxScore, score);
    
    var previouslyPassed = firstPassScore !== "" && firstPassScore !== null && firstPassScore !== undefined;
    if (!previouslyPassed && isPassThisTime) {
      firstPassScore = score;
      attemptsToPass = playCount;
    }
    
    // 確保欄位數足夠（防呆，避免寫入時超出最大欄位限制）
    var maxCols = rSheet.getMaxColumns();
    if (maxCols < 7) {
      rSheet.insertColumnsAfter(maxCols, 7 - maxCols);
    }
    
    rSheet.getRange(userRowIndex, 1, 1, 7).setValues([[
      userId,
      playCount,
      totalScore,
      maxScore,
      firstPassScore,
      attemptsToPass,
      now
    ]]);
  } else {
    playCount = 1;
    totalScore = score;
    maxScore = score;
    if (isPassThisTime) {
      firstPassScore = score;
      attemptsToPass = 1;
    }
    
    rSheet.appendRow([
      userId,
      playCount,
      totalScore,
      maxScore,
      firstPassScore,
      attemptsToPass,
      now
    ]);
  }
  
  // 強制寫入試算表以在此處捕獲任何潛在的寫入異常 (避免非同步寫入導致的錯誤無法被 try-catch 擷取)
  SpreadsheetApp.flush();
  
  var responseData = {
    userId: userId,
    score: score,
    totalQuestions: totalQuestions,
    playCount: playCount,
    maxScore: maxScore,
    firstPassScore: firstPassScore,
    attemptsToPass: attemptsToPass
  };
  
  return ContentService.createTextOutput(JSON.stringify(responseData))
                       .setMimeType(ContentService.MimeType.JSON);
}
```

3. 點選右上角 **「部署」 > 「新增部署」**。
4. 設定類型為 **「網頁應用程式」** (Web App)。
5. 設定如下：
   - 專案說明：`Pixel Game API`
   - 執行身分：**「我」** (Me)
   - 誰有權生存取：**「任何人」** (Anyone)
6. 點選部署並授權權限，然後**複製產生的「網頁應用程式 URL」**。
7. 在專案根目錄下建立或修改 `.env` 檔案，填入您的 API 網址：
   ```env
   VITE_GOOGLE_APP_SCRIPT_URL=您的網頁應用程式URL
   VITE_PASS_THRESHOLD=3
   VITE_QUESTION_COUNT=5
   ```

---

## 🚀 自動部署到 GitHub Pages

專案內已設定 GitHub Actions 部署工作流。當您將程式碼推送至 GitHub 遠端儲存庫的 `main` 分支時，系統將自動編譯並發佈至 GitHub Pages。

### 1. 配置 GitHub Repository Secrets (環境變數)

為了讓 GitHub Actions 在雲端進行專案編譯 (Build) 時，能夠正確讀取並注入 `.env` 中的設定，您需要將這些環境變數設定為 GitHub 的 Repository Secrets。請依照下列步驟進行設定：

1. 進入您在 GitHub 的專案儲存庫 (Repository) 頁面。
2. 點選上方導覽列最右側的 **「Settings」** (設定) 按鈕。
3. 在左側選單中找到 **Security** 區塊，點選 **「Secrets and variables」 > 「Actions」**。
4. 確保選取在 **Secrets** 頁籤下，點選右上角的 **「New repository secret」** 按鈕。
5. 依序新增以下三個密鑰 (Name 與 Value)：
   * **密鑰 1**：
     * **Name**: `VITE_GOOGLE_APP_SCRIPT_URL`
     * **Value**: 您的 Google Apps Script 網頁應用程式 URL (例如 `https://script.google.com/macros/s/.../exec`)
   * **密鑰 2**：
     * **Name**: `VITE_PASS_THRESHOLD`
     * **Value**: 通過門檻題數 (例如 `3`)
   * **密鑰 3**：
     * **Name**: `VITE_QUESTION_COUNT`
     * **Value**: 每次遊玩的題目數量 (例如 `5`)
6. 每次輸入完 Name 與 Value 後，點選 **「Add secret」** 完成儲存。

> ⚠️ **重要提示**：由於本專案採用 Vite 開發，所有以 `VITE_` 開頭的環境變數，皆會在建置階段 (Build time) 被靜態替換並嵌入到前端的靜態資源中。因此，請務必在推送程式碼部署前於 GitHub 設定好這些 Secrets，否則部署上線後的網頁會讀取不到這些設定。

### 2. 推送程式碼觸發部署
將本地程式碼提交並推送至 `main` 分支：
```bash
git add .
git commit -m "Configure GitHub Actions deployment"
git push origin main
```
系統會自動在 **Actions** 頁面啟動一個 `Deploy to GitHub Pages` 的工作流。

### 3. 設定 GitHub Pages 來源
1. 待 Actions 工作流第一次順利執行完畢後，專案中會自動生成 `gh-pages` 分支。
2. 返回專案的 **「Settings」 > 「Pages」**。
3. 在 **「Build and deployment」 > 「Branch」** 底下：
   - 選擇 **`gh-pages`** 分支，目錄選擇 **`/ (root)`**。
   - 點選 **「Save」** 保存設定。
4. 保存後，GitHub 會提供專屬的遊戲連結，您的網址格式為：`https://<YOUR-GITHUB-USERNAME>.github.io/<YOUR-REPO-NAME>/`。

---

## 📝 測試題庫：生成式AI基礎知識 (可複製貼上)

請將以下表格內容複製並直接貼上到您 Google Sheets 的「**題目**」工作表中：

| 題號 | 題目 | A | B | C | D | 解答 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | 請問 GPT 中的 "P" 代表什麼意思？ | Pre-trained (預訓練) | Processing (處理) | Programmed (程式化) | Predictive (預測性) | A |
| 2 | 下列哪一種模型架構是 ChatGPT 等大型語言模型的基礎？ | CNN (卷積神經網路) | RNN (循環神經網路) | Transformer (變形器) | SVM (支持向量機) | C |
| 3 | 在生成式 AI 中，提供給模型的指令或提示詞稱為什麼？ | Prompt (提示詞) | Query (查詢) | Token (標記) | Vector (向量) | A |
| 4 | 當生成式 AI 產生看似合理但實際上錯誤或虛構的資訊時，這種現象稱為什麼？ | Overfitting (過擬合) | Hallucination (幻覺) | Bias (偏見) | Underfitting (欠擬合) | B |
| 5 | 哪一種技術可以用來對已訓練的大模型進行微調，使其符合特定任務或語氣？ | Pre-training (預訓練) | Tokenization (斷詞) | Fine-tuning (微調) | Compression (壓縮) | C |
| 6 | 什麼是 RAG (Retrieval-Augmented Generation) 技術的主要目的？ | 減少模型參數數量 | 加速模型生成圖像的速度 | 結合外部知識庫以提供最新且準確的回答 | 將文本轉換為語音 | C |
| 7 | 生成式 AI 模型在處理文本時，會將文字切分成較小的單位，這些單位稱為什麼？ | Pixels (像素) | Tokens (標記/詞元) | Neurons (神經元) | Weights (權重) | B |
| 8 | 下列哪一個 AI 模型主要用於「文字生成圖片」？ | Midjourney | Whisper | Claude | DeepL | A |
| 9 | 在機器學習中，LLM 代表什麼縮寫？ | Large Logic Model | Large Language Model | Line Linear Model | Local Language Machine | B |
| 10 | 生成式對抗網路 (GAN) 由哪兩個主要部分組成？ | 編碼器與解碼器 | 生成器與判別器 | 輸入層與輸出層 | 卷積層與池化層 | B |
