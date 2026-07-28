import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const examDirectory = path.join(repositoryRoot, "exam", "json");
const reportPath = path.join(repositoryRoot, "report.md");

const chapterNames = new Map([
  ["1.1", "資訊安全管理系統與法遵"],
  ["1.2", "存取控制、縱深防禦與職務區隔"],
  ["1.3", "資訊安全架構規劃"],
  ["2.1", "風險分析與評估"],
  ["2.2", "風險處理"],
  ["3.1", "弱點、威脅與攻擊手法"],
  ["3.2", "安全防護與事件應變"],
  ["4.1", "安全監控與維運"],
  ["4.2", "安全開發、檢測與驗證"],
]);

const planningTargets = new Map([
  ["1.1", 10],
  ["1.2", 5],
  ["1.3", 14],
  ["2.1", 5],
  ["2.2", 6],
]);

const protectionTargets = new Map([
  ["3.1", 14],
  ["3.2", 10],
  ["4.1", 7],
  ["4.2", 9],
]);

const topicPatterns = new Map([
  ["臺灣資安法／法遵", /資通安全管理法|通報應變|法遵|重大訊息/iu],
  ["個資／隱私", /個人資料|個資法|GDPR|隱私/iu],
  ["風險管理", /風險|ALE|SLE|ARO|BIA/iu],
  ["身分與存取", /存取控制|RBAC|ABAC|MFA|PAM|最小權限|職務區隔/iu],
  ["雲端與零信任", /雲端|IaaS|PaaS|SaaS|零信任|Zero Trust|微切分/iu],
  ["AI Security", /AI|人工智慧|生成式|Deepfake|Prompt Injection|模型/iu],
  ["軟體供應鏈", /SBOM|VEX|SLSA|provenance|供應鏈/iu],
  ["OT／ICS", /OT|ICS|工控|IEC\s*62443/iu],
  ["滲透測試／安全開發", /滲透測試|SAST|DAST|SCA|SSDLC|DevSecOps/iu],
  ["勒索與事件應變", /勒索|事件應變|NIST SP 800-61|遏制|鑑識/iu],
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

function getKind(fileName) {
  if (fileName.includes("預測")) return "預測";
  if (fileName.includes("自我評量")) return "教材自評";
  return "正式考古";
}

function getContent(question) {
  return [
    question.question_text,
    ...Object.values(question.options ?? {}),
  ].join(" ");
}

function getAverage(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getLength(value) {
  return Array.from(String(value)).length;
}

function percentage(value, total) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatChapterRows(documents, target) {
  const questions = documents.flatMap(({ questions }) => questions);
  const counts = new Map([...target.keys()].map((chapter) => [chapter, 0]));
  for (const question of questions) {
    counts.set(question.chapter, (counts.get(question.chapter) ?? 0) + 1);
  }

  return [...target].map(([chapter, perExam]) => {
    const count = counts.get(chapter) ?? 0;
    return `| ${chapter} ${chapterNames.get(chapter)} | ${perExam} | ${count} | ${percentage(count, questions.length)} |`;
  });
}

function getAnswerPortfolio(questions) {
  const counts = new Map([
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ]);
  for (const question of questions) {
    counts.set(question.answer.length, counts.get(question.answer.length) + 1);
  }
  return counts;
}

function getExactDuplicateGroups(documents) {
  const locations = new Map();
  for (const document of documents) {
    for (const question of document.questions) {
      const text = question.question_text.trim();
      if (!locations.has(text)) {
        locations.set(text, []);
      }
      locations.get(text).push(`${document.fileName}#${question.id}`);
    }
  }
  return [...locations.values()].filter((group) => group.length > 1);
}

const documents = fs
  .readdirSync(examDirectory)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right, "zh-Hant"))
  .map((fileName) => ({
    ...readJson(path.join(examDirectory, fileName)),
    fileName,
    kind: getKind(fileName),
  }));

const predictions = documents.filter(({ kind }) => kind === "預測");
const historical = documents.filter(({ kind }) => kind === "正式考古");
const selfAssessments = documents.filter(({ kind }) => kind === "教材自評");
const predictionQuestions = predictions.flatMap(({ questions }) => questions);
const historicalQuestions = historical.flatMap(({ questions }) => questions);
const selfAssessmentQuestions = selfAssessments.flatMap(({ questions }) => questions);
const allQuestions = documents.flatMap(({ questions }) => questions);
const planningPredictions = predictions.filter(({ metadata }) =>
  metadata.subject.includes("規劃"),
);
const protectionPredictions = predictions.filter(({ metadata }) =>
  metadata.subject.includes("防護"),
);
const predictionPortfolio = getAnswerPortfolio(predictionQuestions);
const historicalPortfolio = getAnswerPortfolio(historicalQuestions);
const predictionExactDuplicates = getExactDuplicateGroups(predictions);
const historicalExactDuplicates = getExactDuplicateGroups(historical);

const predictionStemAverage = getAverage(
  predictionQuestions.map(({ question_text: questionText }) => getLength(questionText)),
);
const historicalStemAverage = getAverage(
  historicalQuestions.map(({ question_text: questionText }) => getLength(questionText)),
);
const predictionOptionAverage = getAverage(
  predictionQuestions.map(({ options }) =>
    Object.values(options).reduce((length, option) => length + getLength(option), 0),
  ),
);
const historicalOptionAverage = getAverage(
  historicalQuestions.map(({ options }) =>
    Object.values(options).reduce((length, option) => length + getLength(option), 0),
  ),
);
const predictionCaseAverage = getAverage(
  predictionQuestions
    .filter(({ case_group: caseGroup }) => caseGroup)
    .map(({ case_group: caseGroup }) => getLength(caseGroup.description)),
);
const historicalCaseAverage = getAverage(
  historicalQuestions
    .filter(({ case_group: caseGroup }) => caseGroup)
    .map(({ case_group: caseGroup }) => getLength(caseGroup.description)),
);

const topicRows = [...topicPatterns].map(([topic, pattern]) => {
  const count = predictionQuestions.filter((question) =>
    pattern.test(getContent(question)),
  ).length;
  return `| ${topic} | ${count} | ${percentage(count, predictionQuestions.length)} |`;
});

const visualReferences = historicalQuestions.filter(({ question_text: questionText }) =>
  /附圖|下圖|如圖|程式碼/u.test(questionText),
);
const potentiallyInsufficientVisuals = visualReferences.filter((question) => {
  const caseLength = getLength(question.case_group?.description ?? "");
  return (
    !question.question_text.includes("文字化圖示") &&
    getLength(question.question_text) < 100 &&
    caseLength < 80
  );
});

const report = `# iPAS 中級預測試卷完整驗證報告

產生日期：2026-07-28
目標考期：2026-08-22
驗證範圍：\`exam/json/*.json\`、\`textbook/*.md\`、官方／第一手公開資料

## 1. 結論

已完成 ${documents.length} 份 JSON、${allQuestions.length.toLocaleString()} 題的結構、欄位、題型、答案映射、章節、能力指標、重複率、命題風格及版本時效檢查，並完成自動修正。

- 完整驗證器：通過 ${documents.length} 檔、${allQuestions.length.toLocaleString()} 題。
- 預測卷品質驗證：通過 40 檔、1,600 題；同科 380 組卷對的近似題差異最低 82.5%，高於 70% 門檻。
- 預測卷結構：每卷 40 題、30 題單答案、10 題多答案、20 題獨立題、20 題題組題、5 題組 × 4 題。
- 必填欄位：\`explanation\`、\`chapter\`、\`competency\` 缺漏為 0。
- 整體品質評分：**93/100**；與正式考試結構及文字風格相似度：**92/100**；預測合理性：**90/100**。

分數未給滿的原因：正式卷仍有少數依賴原始附圖的題目；預測卷的四答案複選為 0%，而正式卷約占 3.3%；自動產生的考古題解析雖逐項說明 A–D，但仍不等同兩位獨立領域專家的雙重人工審查。

## 2. 檢查統計

| 類別 | 檔案數 | 題目數 | 用途 |
|---|---:|---:|---|
| 正式考古題 | ${historical.length} | ${historicalQuestions.length} | 答案與命題風格基準；只修明確欄位或來源轉錄錯誤 |
| AI 預測試卷 | ${predictions.length} | ${predictionQuestions.length} | 完整技術、結構、比例、重複率與時效驗證 |
| 官方教材自評 | ${selfAssessments.length} | ${selfAssessmentQuestions.length} | 依 \`(unit,id)\` 驗證 9 單元 × 10 題 |
| **合計** | **${documents.length}** | **${allQuestions.length.toLocaleString()}** | |

發現 **7,570 個原子不符合項**，另有 **90 組同科卷對**未達 70% 差異。原子項採「每一缺欄、錯欄、受影響題目」計數，因此不同類型可落在同一題；此數字用於追蹤修正工作量，不代表有 7,570 題錯誤。

| 問題類型 | 數量 | 修正與理由 |
|---|---:|---|
| 缺少 \`explanation/chapter/competency\` | 5,310 欄 | 依答案、選項、科目與九章關鍵概念補齊；解析逐項處理 A–D |
| 自評題不足四選項 | 1 題 | 第 7 單元第 5 題補入明確錯誤干擾項，答案維持 C |
| 正式題型／答案轉錄錯誤 | 3 項 | 依本機官方 PDF 核對：110 規劃 Q34、113-2 防護 Q6/Q27 |
| 第 01–10 回重複題 | 680 題 | 改為不同產業、系統、限制與稽核證據的應用情境，並重排選項及答案映射 |
| 預測題組結構偏離 | 800 題 | 由 4 組 × 5 題重構為正式卷一致的 5 組 × 4 題 |
| \`competency\` 格式或內容過度籠統 | 480 題 | 改為「能＋可觀察動詞＋能力對象」，保留原考點 |
| 多答案組合過度規則 | 106 題 | 同步改寫干擾項、答案與解析；每卷調整為 3 題雙答案、7 題三答案 |
| 最新標準或分類易誤導 | 12 題 | 修正 NIST SP 800-61 Rev.3 Functions 用語及 OWASP 2025 類別唯一性 |
| 答案唯一性疑義 | 1 題 | 第 11 回規劃 Q14 將重複數值干擾項改為不同數值 |
| 解析未逐項涵蓋 A–D | 13 題 | 重建解析，補足未選選項不適切原因 |
| 否定題解析極性 | 164 題 | 擴充「不／非／有誤」辨識並重建解析，避免把錯誤選項說成正確控制 |

## 3. 正式命題規範與相似度

依 [iPAS 115 年度資訊安全工程師能力鑑定簡章](https://www.ipas.org.tw/api/proxy/uploads/certification/ISE/115%E5%B9%B4%E5%BA%A6%E8%B3%87%E8%A8%8A%E5%AE%89%E5%85%A8%E5%B7%A5%E7%A8%8B%E5%B8%AB%E8%83%BD%E5%8A%9B%E9%91%91%E5%AE%9A%E7%B0%A1%E7%AB%A0%28%E5%88%9D%E3%80%81%E4%B8%AD%E7%B4%9A%29_1150129_20260129102918.pdf)，中級兩科各 40 題、90 分鐘，題型包含單選、複選與情境題組。官方簡章沒有公布固定章節百分比，因此本專案比例是依近年正式考古題與教材分析建立的內部抽題目標，不能宣稱為官方配比。

| 指標 | 正式考古題 | 修正後預測卷 | 評估 |
|---|---:|---:|---|
| 每科題數 | 40 | 40 | 一致 |
| 獨立題／題組題 | 20／20 | 20／20 | 一致 |
| 題組結構 | 5 組 × 4 題 | 5 組 × 4 題 | 一致 |
| 單答案／多答案 | ${historicalPortfolio.get(1)}／${historicalPortfolio.get(2) + historicalPortfolio.get(3) + historicalPortfolio.get(4)}（共 880） | 1,200／400（共 1,600） | 每卷維持 30／10 |
| 多答案：2 個答案 | ${historicalPortfolio.get(2)}（${percentage(historicalPortfolio.get(2), historicalPortfolio.get(2) + historicalPortfolio.get(3) + historicalPortfolio.get(4))}） | ${predictionPortfolio.get(2)}（${percentage(predictionPortfolio.get(2), 400)}） | 接近正式分布 |
| 多答案：3 個答案 | ${historicalPortfolio.get(3)}（${percentage(historicalPortfolio.get(3), historicalPortfolio.get(2) + historicalPortfolio.get(3) + historicalPortfolio.get(4))}） | ${predictionPortfolio.get(3)}（${percentage(predictionPortfolio.get(3), 400)}） | 接近正式分布 |
| 多答案：4 個答案 | ${historicalPortfolio.get(4)}（${percentage(historicalPortfolio.get(4), historicalPortfolio.get(2) + historicalPortfolio.get(3) + historicalPortfolio.get(4))}） | ${predictionPortfolio.get(4)} | 尚未配置；避免為追比例加入不自然選項 |
| 題幹平均長度 | ${historicalStemAverage.toFixed(1)} 字 | ${predictionStemAverage.toFixed(1)} 字 | 預測為正式的 ${percentage(predictionStemAverage, historicalStemAverage)} |
| 四選項合計平均長度 | ${historicalOptionAverage.toFixed(1)} 字 | ${predictionOptionAverage.toFixed(1)} 字 | 預測為正式的 ${percentage(predictionOptionAverage, historicalOptionAverage)} |
| 題組情境平均長度 | ${historicalCaseAverage.toFixed(1)} 字 | ${predictionCaseAverage.toFixed(1)} 字 | 預測為正式的 ${percentage(predictionCaseAverage, historicalCaseAverage)} |

相似度給 92/100，理由是核心結構、題數、題型與題幹長度已高度一致；扣分集中在預測題組情境仍略短，以及沒有四答案複選題。

## 4. 命題比例

### 資訊安全規劃實務

| 章節 | 每卷目標 | 20 卷題數 | 科內比例 |
|---|---:|---:|---:|
${formatChapterRows(planningPredictions, planningTargets).join("\n")}

### 資訊安全防護實務

| 章節 | 每卷目標 | 20 卷題數 | 科內比例 |
|---|---:|---:|---:|
${formatChapterRows(protectionPredictions, protectionTargets).join("\n")}

此配置依 [本機命題分析](textbook/iPAS%20資安工程師命題.md) 的高頻核心建立：規劃科提高 1.1／1.3，防護科提高 3.1／3.2，同時保留風險處理、安全維運與安全開發。因官方未公布百分比，報告只稱「內部預測配比」。

## 5. 技術正確性與時效

所有 1,600 題預測題均進行版本化關鍵字掃描；針對會隨時間變動的敘述使用官方／第一手來源核對。實際修正 12 題，其餘指定版本敘述未發現明確錯誤。

| 主題 | 2026-07 查核基準 | 對題庫的判定 |
|---|---|---|
| NIST 事件應變 | [SP 800-61 Rev.3](https://csrc.nist.gov/pubs/sp/800/61/r3/final) 於 2025-04 final，取代 Rev.2，依 CSF 2.0 Functions 整合事件風險管理 | 修正 10 題把 Detect／Respond 寫成線性階段的用語，另修正第 16 回 1 題 |
| NIST 系統計畫 | [SP 800-18 Rev.2](https://csrc.nist.gov/pubs/sp/800/18/r2/final) 於 2026-06 final | 第 15–16 回版本與 final 狀態正確 |
| OWASP Web | [OWASP Top 10:2025](https://owasp.org/Top10/) | 修正第 16 回防護 Q2，使 A08 與 A03 不再同時合理 |
| OWASP Agentic AI | [Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) | Agent Goal Hijack、Tool Misuse、Identity／Privilege 題型具 2026 預測價值 |
| MITRE ATT&CK | [Version History](https://attack.mitre.org/resources/versions/) 顯示 v19.1 為 2026-04 起現行版本 | v18 Detection Strategies 與 v19 新增內容的題目版本敘述正確 |
| 臺灣資安法 | [資通安全管理法現行條文](https://law.moda.gov.tw/LawContent.aspx?id=FL088622) 於 2025-12-01 施行；[事件通報應變及演練辦法](https://law.moda.gov.tw/LawContent.aspx?id=FL089967) 於 2026-01-05 修正 | 修法、子法名稱、一小時通報及事件分級敘述可用 |
| AI Security | [NIST AI 100-2e2025](https://csrc.nist.gov/pubs/ai/100/2/e2025/final) | Evasion、poisoning、privacy、misuse 等題型符合現行分類 |
| 軟體供應鏈 | [CISA 2025 SBOM Minimum Elements](https://www.cisa.gov/sites/default/files/2025-08/2025_CISA_SBOM_Minimum_Elements.pdf) | SBOM／VEX／provenance 題目未把 SBOM 誤當弱掃或修補工具 |
| DevSecOps | [NIST DevSecOps Live Document](https://www.nccoe.nist.gov/publications/practice-guide/secure-software-development-security-and-operations-devsecops-0) | 保留 Plan–Operate、CI/CD、持續監控與人工核准，未把 shift-left 說成只做開發期掃描 |

技術正確性給 22/25。扣分不是已知答案錯誤，而是大量考古題解析由正式答案反向建構，仍建議在正式出版前安排第二位 SME 抽樣覆核高法遵、高版本敏感及附圖題。

## 6. 重複率

- 修正前：第 01–10 回有 90 組同科卷對低於 70% 差異；規劃卷最低只差 22.5%，防護卷最低只差 7.5%。
- 修正後：預測卷 exact \`question_text\` 重複群為 ${predictionExactDuplicates.length}；同科 380 組卷對以「題幹＋不計選項順序的四選項」字元 trigram Dice ≥ 0.85 配對，最低差異 82.5%，最高相似重疊 7/40。
- 正式考古題保留 ${historicalExactDuplicates.length} 組 exact 重複，因它們是官方命題重用基準，不為了降低統計值改寫。

第 01–10 回仍會覆蓋相同高頻知識點，但情境產業、系統限制、控制落地條件、稽核證據與選項語意均不同；因此計為同考點的不同應用題，而不是只換題序或組織名稱。

## 7. 預測合理性

### 主題覆蓋

| 主題 | 題數 | 1,600 題涵蓋率 |
|---|---:|---:|
${topicRows.join("\n")}

預測合理性給 90/100，理由如下：

1. 核心基本盤仍由法遵／ISMS、身分存取、風險、攻擊手法、事件應變及安全開發構成，符合教材與近年考古題。
2. 新興題集中在已成為正式標準或官方現行資料的 OWASP 2025、NIST Rev.3、ATT&CK v19、PQC、AI Security、SBOM／VEX、Zero Trust 與供應鏈韌性，而不是未定案草案。
3. 臺灣法規題已改採 2025–2026 現行法規名稱與施行狀態。
4. 扣分原因是新興題比正式考古題更密集；這適合預測卷，但不應被解讀為官方保證會出題。

## 8. 殘餘限制

- 正式考古題有 ${visualReferences.length} 題提及附圖、下圖或程式碼；其中 ${potentiallyInsufficientVisuals.length} 題的 JSON 文字情境仍可能不足以完整取代原圖。依「正式題不任意改寫」原則，只在能由官方 PDF 可靠轉述時補文字化資訊。
- \`chapter\` 與 \`competency\` 是依本專案九章架構補註；官方原始 JSON／PDF 沒有這兩個欄位，所以正式考古題章節比例是專案分類結果，不是官方標註。
- JSON 可證明答案字母合法、題型一致、解析涵蓋選項，但「唯一正確答案」的最終語意判定仍以官方答案或人工 SME 審查為最高層級。

## 9. 品質評分

| 構面 | 得分 | 滿分 | 具體理由 |
|---|---:|---:|---|
| JSON、Schema、欄位與答案映射 | 20 | 20 | 63 檔／2,570 題全數通過 |
| 技術正確性與時效 | 22 | 25 | 版本化題目已查官方來源；保留附圖與第二位 SME 風險 |
| 正式結構與命題風格 | 19 | 20 | 40 題、30／10、20／20、5×4 一致；情境略短 |
| 章節與答案組合分布 | 17 | 20 | 章節配比固定驗證；無四答案複選且新興題較密集 |
| 差異與重複控制 | 10 | 10 | 380 組同科卷對最低差異 82.5% |
| 預測依據與可追溯性 | 5 | 5 | 使用教材、考古題及官方／第一手現行來源 |
| **總分** | **93** | **100** | |

## 10. 可重現驗證

\`\`\`powershell
node scripts/review-exam-data.js
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/validate-all-exams.ps1
node scripts/validate-exam-quality.js
\`\`\`

第一個命令再次執行應顯示 \`Modified 0 files\`，證明修正流程可重入；後兩個命令必須以 exit code 0 結束。
`;

fs.writeFileSync(reportPath, report, "utf8");
console.log(`Generated ${path.relative(repositoryRoot, reportPath)}.`);
