import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const examDirectory = path.join(repositoryRoot, "exam", "json");

const planningChapterQuotas = new Map([
  ["1.1", 10],
  ["1.2", 5],
  ["1.3", 14],
  ["2.1", 5],
  ["2.2", 6],
]);

const protectionChapterQuotas = new Map([
  ["3.1", 14],
  ["3.2", 10],
  ["4.1", 7],
  ["4.2", 9],
]);

const chapterPatterns = new Map([
  [
    "1.1",
    [
      /ISO(?:\/IEC)?\s*2700[12]|ISMS|適用性聲明|SoA/giu,
      /資通安全管理法|個人資料保護法|個資法|GDPR|法規|法遵|通報|重大訊息/giu,
      /治理|政策|稽核|資安長|專責人員|教育訓練|認知訓練/giu,
      /委外|受託|供應商|第三方|契約|合約|查核/giu,
    ],
  ],
  [
    "1.2",
    [
      /存取控制|權限|授權|身分|帳號|認證|密碼|MFA|FIDO|OTP/giu,
      /RBAC|ABAC|DAC|MAC|PAM|IAM|SSO|ACL/giu,
      /最小權限|職務區隔|SoD|特權|零常設權限|JIT|JEA/giu,
    ],
  ],
  [
    "1.3",
    [
      /安全架構|零信任|Zero Trust|縱深防禦|微切分|網路區隔|DMZ/giu,
      /雲端|IaaS|PaaS|SaaS|容器|Kubernetes|多雲|CSPM|CASB/giu,
      /密碼學|加密|金鑰|憑證|PKI|TLS|量子|PQC|ML-KEM|ML-DSA/giu,
      /AI|人工智慧|生成式|Deepfake|Prompt Injection|模型/giu,
      /供應鏈|SBOM|VEX|SLSA|provenance|OT|ICS|IEC\s*62443/giu,
      /營運持續|BCP|DRP|備援|高可用|RTO|RPO/giu,
    ],
  ],
  [
    "2.1",
    [
      /風險評鑑|風險分析|風險識別|風險準則|風險值|風險矩陣/giu,
      /資產|威脅|弱點|脆弱性|可能性|衝擊|曝險/giu,
      /ALE|SLE|ARO|BIA|年度損失|單次損失|定量|定性/giu,
    ],
  ],
  [
    "2.2",
    [
      /風險處理|風險接受|風險降低|風險移轉|風險避免|風險分擔/giu,
      /殘餘風險|可接受風險|風險擁有者|處理計畫|補償控制/giu,
      /接受|避免|移轉|降低|緩解|監視.*風險|監控.*風險/giu,
    ],
  ],
  [
    "3.1",
    [
      /攻擊|惡意|入侵|漏洞|CVE|CVSS|Exploit|Payload|Shellcode/giu,
      /MITRE ATT&CK|Kill Chain|TTP|戰術|技術|橫向移動|提權/giu,
      /Injection|XSS|CSRF|SSRF|RCE|SQL|Command|Path Traversal/giu,
      /勒索|釣魚|社交工程|DDoS|Botnet|Rootkit|木馬|蠕蟲|病毒/giu,
      /Password Spray|Kerberoast|Pass-the-Hash|暴力破解|憑證攻擊/giu,
    ],
  ],
  [
    "3.2",
    [
      /事件應變|事件處理|遏制|根除|復原|鑑識|證據|Chain of Custody/giu,
      /防火牆|IDS|IPS|EDR|NDR|防毒|沙箱|隔離|修補|強化/giu,
      /備份|還原|災難復原|RTO|RPO|映像|記憶體|雜湊/giu,
      /NIST SP 800-61|Containment|Eradication|Recovery/giu,
    ],
  ],
  [
    "4.1",
    [
      /SOC|SIEM|SOAR|XDR|MDR|UEBA|SecOps/giu,
      /日誌|Log|告警|監控|偵測|關聯分析|時間同步|NTP/giu,
      /威脅情資|TLP|IOC|IOA|情資分享|Detection Strateg/giu,
      /MTTA|MTTD|MTTR|Playbook|Use Case|偵測規則/giu,
    ],
  ],
  [
    "4.2",
    [
      /SSDLC|SDLC|DevSecOps|SAST|DAST|SCA|IAST|RASP/giu,
      /滲透測試|弱點掃描|源碼|程式碼|Code Review|Fuzz/giu,
      /威脅建模|Threat Model|STRIDE|安全設計|安全需求/giu,
      /API|JWT|CI\/CD|Pipeline|IaC|Terraform|Repository/giu,
      /OWASP|Web 應用|應用程式安全|業務邏輯/giu,
    ],
  ],
]);

const competencyRules = [
  [/資通安全管理法|通報|事件等級/iu, "能判讀資通安全法規與事件通報要求"],
  [/個人資料|個資法|GDPR|隱私/iu, "能判讀個人資料保護與隱私要求"],
  [/ISO(?:\/IEC)?\s*2700[12]|ISMS|適用性聲明|SoA/iu, "能規劃與維護資訊安全管理系統"],
  [/委外|受託|供應商|第三方|契約|合約/iu, "能規劃委外與供應鏈安全管理"],
  [/治理|政策|資安長|教育訓練|認知訓練/iu, "能建立資訊安全治理與管理制度"],
  [/RBAC|ABAC|DAC|MAC|存取控制模型/iu, "能選用適切的存取控制模型"],
  [/PAM|特權|最小權限|職務區隔|SoD|JIT/iu, "能規劃特權與最小權限控制"],
  [/MFA|FIDO|密碼|身分|帳號|認證|授權/iu, "能規劃身分驗證與帳號生命週期"],
  [/零信任|Zero Trust|微切分|縱深防禦/iu, "能運用零信任與縱深防禦設計架構"],
  [/雲端|IaaS|PaaS|SaaS|CSPM|CASB|Kubernetes|容器/iu, "能規劃雲端與容器安全架構"],
  [/PQC|後量子|ML-KEM|ML-DSA|加密敏捷/iu, "能規劃後量子密碼遷移與加密敏捷性"],
  [/加密|金鑰|憑證|PKI|TLS|數位簽章/iu, "能選用密碼技術與金鑰管理控制"],
  [/AI|人工智慧|生成式|Deepfake|Prompt Injection|模型/iu, "能辨識並治理人工智慧安全風險"],
  [/SBOM|VEX|SLSA|provenance|軟體供應鏈/iu, "能管理軟體供應鏈風險與可追溯性"],
  [/OT|ICS|IEC\s*62443|工控/iu, "能規劃工業控制系統安全防護"],
  [/BCP|DRP|營運持續|備援|RTO|RPO/iu, "能規劃營運持續與災難復原"],
  [/ALE|SLE|ARO|定量風險|年度損失/iu, "能執行定量風險分析"],
  [/風險處理|風險接受|風險移轉|風險避免|殘餘風險|補償控制/iu, "能選擇並監督適切的風險處理措施"],
  [/風險|資產|威脅|弱點|可能性|衝擊|BIA/iu, "能識別並評估資訊安全風險"],
  [/MITRE ATT&CK|Kill Chain|TTP|戰術|橫向移動/iu, "能分析攻擊鏈與攻擊者行為"],
  [/Injection|XSS|CSRF|SSRF|RCE|SQL|Command|Path Traversal/iu, "能辨識並防護常見應用程式攻擊"],
  [/勒索|惡意程式|木馬|蠕蟲|Rootkit|無檔案/iu, "能辨識惡意程式與勒索軟體行為"],
  [/釣魚|社交工程|Deepfake|Password Spray|Kerberoast|暴力破解/iu, "能辨識身分與社交工程攻擊"],
  [/事件應變|NIST SP 800-61|遏制|根除|復原/iu, "能執行資通安全事件應變程序"],
  [/鑑識|證據|Chain of Custody|映像|記憶體/iu, "能保全並分析數位鑑識證據"],
  [/防火牆|IDS|IPS|EDR|NDR|防毒|沙箱|隔離/iu, "能選用並部署縱深防護控制"],
  [/SOC|SIEM|SOAR|XDR|MDR|UEBA|Playbook/iu, "能規劃安全維運與自動化應變"],
  [/日誌|告警|監控|偵測|威脅情資|TLP|IOC|NTP/iu, "能建立日誌監控、偵測與威脅情資流程"],
  [/SAST|DAST|SCA|IAST|弱點掃描|滲透測試/iu, "能選擇並執行適切的安全測試"],
  [/SSDLC|DevSecOps|CI\/CD|IaC|Threat Model|STRIDE/iu, "能將安全控制整合至軟體開發生命週期"],
  [/API|JWT|OWASP|Web 應用|業務邏輯/iu, "能設計並驗證安全的應用程式"],
];

const defaultCompetencies = new Map([
  ["1.1", "能執行資訊安全治理、法遵與管理制度"],
  ["1.2", "能規劃身分、權限與存取控制"],
  ["1.3", "能規劃資訊安全架構與韌性控制"],
  ["2.1", "能識別、分析並評估資訊安全風險"],
  ["2.2", "能選擇、執行並監督風險處理"],
  ["3.1", "能辨識弱點、威脅與攻擊手法"],
  ["3.2", "能部署安全防護並執行事件應變"],
  ["4.1", "能執行安全監控與維運管理"],
  ["4.2", "能執行安全開發、檢測與驗證"],
]);

const scenarioProfiles = new Map([
  [1, ["北區醫療聯盟", "跨院病歷交換平台", "不得中斷急診與住院服務"]],
  [2, ["海港物流公司", "貨櫃調度與報關平台", "須維持全天候物流追蹤"]],
  [3, ["區域金融控股", "行動銀行與清算平台", "交易需可追溯且符合金融監理"]],
  [4, ["智慧製造集團", "IT／OT 整合生產平台", "停機會直接影響產線安全"]],
  [5, ["公用能源事業", "電網監控與維運平台", "須兼顧關鍵基礎設施韌性"]],
  [6, ["大型電子商務業者", "會員與訂單處理平台", "促銷期間不得犧牲交易完整性"]],
  [7, ["市政府資訊中心", "跨局處雲端服務平台", "須符合公務機關法定責任"]],
  [8, ["半導體研發公司", "研發資料與供應鏈平台", "營業秘密須長期維持機密性"]],
  [9, ["大學研究聯盟", "生成式 AI 研究平台", "須隔離研究資料與外部模型服務"]],
  [10, ["全國電信業者", "5G 核心網路維運平台", "須維持高可用與大量身分治理"]],
  [11, ["跨國零售集團", "多雲會員服務平台", "須兼顧跨境資料與服務持續性"]],
  [12, ["國際旅運業者", "訂位與旅客資料平台", "尖峰期間仍須維持存取可用性"]],
  [13, ["數位支付公司", "即時支付與清算平台", "交易異常須即時偵測並保全證據"]],
  [14, ["區域醫療中心", "臨床與遠距醫療平台", "病患照護不得因安全處置而中斷"]],
  [15, ["國防供應鏈廠商", "研發與軟體交付平台", "須證明元件來源及建置完整性"]],
  [16, ["雲端原生軟體商", "AI 輔助開發平台", "自動化不得取代人工風險核准"]],
  [17, ["智慧城市營運中心", "物聯網與市政服務平台", "跨域設備須維持可視性與最小權限"]],
  [18, ["精密製造企業", "工控與供應鏈協作平台", "安全措施須符合產線可用性限制"]],
  [19, ["金融科技聯盟", "數位身分與開放 API 平台", "須兼顧監理、隱私及第三方風險"]],
  [20, ["大型雲端服務商", "代理式 AI 與維運平台", "工具調用須受授權、稽核及人工覆核"]],
]);

function getQuestionContent(question) {
  const optionText = Object.values(question.options ?? {}).join(" ");
  const caseDescription = question.case_group?.description ?? "";
  return `${question.unit ?? ""} ${caseDescription} ${question.question_text ?? ""} ${optionText}`;
}

function countPatternMatches(content, patterns) {
  return patterns.reduce((score, pattern) => {
    pattern.lastIndex = 0;
    return score + (content.match(pattern)?.length ?? 0);
  }, 0);
}

function getChapterScores(question, allowedChapters) {
  const content = getQuestionContent(question);
  return new Map(
    allowedChapters.map((chapter) => [
      chapter,
      countPatternMatches(content, chapterPatterns.get(chapter)),
    ]),
  );
}

function getSelfAssessmentChapter(question) {
  const unitMatch = String(question.unit ?? "").match(/第\s*(\d+)\s*單元/u);
  const unit = Number(unitMatch?.[1] ?? 0);
  if (unit === 3) {
    return /處理|接受|避免|移轉|降低|殘餘/iu.test(getQuestionContent(question))
      ? "2.2"
      : "2.1";
  }

  return new Map([
    [1, "1.3"],
    [2, "1.1"],
    [4, "1.1"],
    [5, "3.2"],
    [6, "4.1"],
    [7, "4.2"],
    [8, "1.1"],
    [9, "3.2"],
  ]).get(unit) ?? "1.3";
}

function assignChaptersWithQuotas(questions, quotas) {
  const chapters = [...quotas.keys()];
  const remaining = new Map(quotas);
  const assignments = new Array(questions.length).fill(null);
  const candidates = [];

  questions.forEach((question, questionIndex) => {
    const scores = getChapterScores(question, chapters);
    chapters.forEach((chapter, chapterIndex) => {
      candidates.push({
        chapter,
        chapterIndex,
        questionIndex,
        score: scores.get(chapter),
      });
    });
  });

  candidates.sort(
    (left, right) =>
      right.score - left.score ||
      left.questionIndex - right.questionIndex ||
      left.chapterIndex - right.chapterIndex,
  );

  for (const candidate of candidates) {
    if (
      assignments[candidate.questionIndex] === null &&
      remaining.get(candidate.chapter) > 0
    ) {
      assignments[candidate.questionIndex] = candidate.chapter;
      remaining.set(candidate.chapter, remaining.get(candidate.chapter) - 1);
    }
  }

  return assignments;
}

function getBestChapter(question, subject) {
  if (!subject) {
    return getSelfAssessmentChapter(question);
  }

  const chapters = subject.includes("規劃")
    ? [...planningChapterQuotas.keys()]
    : [...protectionChapterQuotas.keys()];
  const scores = getChapterScores(question, chapters);
  return chapters.reduce((bestChapter, chapter) =>
    scores.get(chapter) > scores.get(bestChapter) ? chapter : bestChapter,
  );
}

function getCompetency(question, chapter) {
  const content = getQuestionContent(question);
  const matchedRule = competencyRules.find(([pattern]) => pattern.test(content));
  return matchedRule?.[1] ?? defaultCompetencies.get(chapter);
}

function shortenOption(optionText) {
  const normalized = String(optionText).replace(/\s+/gu, " ").trim();
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}…`;
}

function getDistractorReason(optionText) {
  if (/只|僅|完全|一律|所有|永遠|不需|無須|免除|唯一/iu.test(optionText)) {
    return "採取絕對化假設，忽略情境限制、例外與縱深控制";
  }
  if (/刪除|關閉|停用|取消|忽略|跳過|不記錄|不保留/iu.test(optionText)) {
    return "會移除必要控制或稽核證據，擴大偵測、追蹤或復原缺口";
  }
  if (/允許所有|全部開放|公開|共用|預設信任|明文|不加密/iu.test(optionText)) {
    return "違反最小權限、機密性或預設拒絕等基本安全原則";
  }
  if (/發生後|事後|上線後|年底|隔年|下月|等待|延後/iu.test(optionText)) {
    return "處置時機過晚，無法在風險形成前預防或於事件期間及時遏制";
  }
  if (/外包|供應商.*負責|廠商.*負責|免責/iu.test(optionText)) {
    return "將組織不可移轉的治理與監督責任錯置給第三方";
  }
  if (/密碼|MFA|權限|帳號|認證|授權/iu.test(optionText)) {
    return "混淆身分驗證、授權、帳號治理或最小權限的控制目的";
  }
  if (/雜湊|加密|簽章|金鑰|憑證|PKI/iu.test(optionText)) {
    return "混淆機密性、完整性、鑑別或不可否認性等密碼控制功能";
  }
  if (/備份|RTO|RPO|復原|還原/iu.test(optionText)) {
    return "未正確處理復原時間、資料復原點或備份隔離需求";
  }
  if (/防火牆|EDR|SIEM|SOAR|WAF|掃描|SAST|DAST|SCA/iu.test(optionText)) {
    return "把不同偵測、防護、自動化或測試技術的能力邊界混為一談";
  }
  if (/ISO|NIST|OWASP|MITRE|CVSS|ATT&CK/iu.test(optionText)) {
    return "與題幹指定框架的定義、構成、版本或適用範圍不符";
  }
  return "未直接處理題幹的核心風險，或與所需控制目標及處置順序不一致";
}

function isNegativeQuestion(questionText) {
  return /(?:[「『"]?不[」』"]?(?:正確|適切|適合|適當|合適|可行|可能|應該|符合|屬於|包括|包含)|最[「『"]?不|有誤|錯誤|無關|無效|[「『"]?非[」』"]?(?:優先|必要|正確|適切)|何者不)/u.test(
    questionText,
  );
}

function buildExplanation(question, competency) {
  const answerLetters = new Set(String(question.answer).split(""));
  const negativeQuestion = isNegativeQuestion(question.question_text);
  const competencyGoal = competency.replace(/^能/u, "");
  const explanations = [];

  for (const [letter, optionText] of Object.entries(question.options)) {
    const quotedOption = `${letter}「${shortenOption(optionText)}」`;
    const selected = answerLetters.has(letter);
    if (negativeQuestion) {
      explanations.push(
        selected
          ? `${quotedOption}${getDistractorReason(optionText)}，因此是題目要求辨識的不適切或錯誤選項`
          : `${quotedOption}有助於${competencyGoal}，在題示條件下屬合理作法，故不是本題答案`,
      );
    } else {
      explanations.push(
        selected
          ? `${quotedOption}能直接${competencyGoal}，符合題幹的主要控制目標，因此應選`
          : `${quotedOption}${getDistractorReason(optionText)}，因此不應選`,
      );
    }
  }

  const answer = [...answerLetters].join("、");
  return `答案為 ${answer}。${explanations.join("；")}。`;
}

function getRoundNumber(fileName) {
  return Number(fileName.match(/第(\d{2})回/u)?.[1] ?? 0);
}

function updateCurrentIncidentResponseQuestion(question) {
  if (
    !question.question_text?.includes("依 NIST SP 800-61 事件處理流程") ||
    !String(question.answer).includes("B")
  ) {
    return;
  }

  question.question_text =
    "依 NIST SP 800-61 Rev.3 與 CSF 2.0，事件在 Detect 階段確認且仍持續擴散；進入 Respond 後的首要操作目標為何？";
  question.options.B = "採取事件緩解與遏制措施，限制影響範圍";
}

function rephraseQuestion(questionText, round) {
  const replacements = [
    [/下列何者最適切/gu, "何項決策最符合風險導向原則"],
    [/下列哪一項最適切/gu, "應優先選擇哪一項作法"],
    [/下列何者/gu, round % 2 === 0 ? "四個選項中何者" : "應判定何者"],
    [/下列哪一項/gu, round % 2 === 0 ? "應選擇哪一項" : "哪一個選項"],
    [/下列哪些/gu, round % 2 === 0 ? "綜合判斷應選取哪些" : "哪些作法同時符合要求"],
    [/為何？$/gu, "應如何判定？"],
  ];

  return replacements.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    questionText,
  );
}

function rotateOptions(question, rotation) {
  if (rotation === 0) {
    return;
  }

  const letters = ["A", "B", "C", "D"];
  const originalOptions = { ...question.options };
  const letterMapping = new Map();
  const rotatedOptions = {};

  letters.forEach((newLetter, newIndex) => {
    const oldLetter = letters[(newIndex + rotation) % letters.length];
    rotatedOptions[newLetter] = originalOptions[oldLetter];
    letterMapping.set(oldLetter, newLetter);
  });

  question.options = rotatedOptions;
  question.answer = String(question.answer)
    .split("")
    .map((letter) => letterMapping.get(letter))
    .sort()
    .join("");
}

function diversifyDuplicateQuestions(documents) {
  const earlyPredictionDocuments = documents.filter(
    ({ fileName }) => getRoundNumber(fileName) >= 1 && getRoundNumber(fileName) <= 10,
  );
  const occurrences = new Map();

  for (const { document } of earlyPredictionDocuments) {
    for (const question of document.questions) {
      updateCurrentIncidentResponseQuestion(question);
      const questionText = question.question_text;
      occurrences.set(questionText, (occurrences.get(questionText) ?? 0) + 1);
    }
  }

  let diversifiedQuestions = 0;
  for (const { document, fileName } of earlyPredictionDocuments) {
    const round = getRoundNumber(fileName);
    const [organization, system, constraint] = scenarioProfiles.get(round);
    for (const question of document.questions) {
      if ((occurrences.get(question.question_text) ?? 0) < 2) {
        continue;
      }

      const chapter =
        question.chapter ??
        getBestChapter(question, document.metadata?.subject ?? "");
      const activity = new Map([
        ["1.1", "年度治理與法遵審查"],
        ["1.2", "身分與權限重整"],
        ["1.3", "安全架構改版"],
        ["2.1", "風險評鑑"],
        ["2.2", "風險處理決策"],
        ["3.1", "攻擊面與威脅分析"],
        ["3.2", "防護及事件應變演練"],
        ["4.1", "安全監控與維運改善"],
        ["4.2", "安全開發與檢測審查"],
      ]).get(chapter);
      const scenario = `${organization}正為${system}執行${activity}，且${constraint}`;
      question.question_text = `【第 ${String(round).padStart(2, "0")} 回應用情境】${scenario}。${rephraseQuestion(question.question_text, round)}`;
      rotateOptions(question, (round + Number(question.id)) % 4);
      diversifiedQuestions += 1;
    }
  }

  return diversifiedQuestions;
}

function correctKnownHistoricalDefects(document, fileName) {
  let corrections = 0;
  if (fileName === "110年資訊安全工程師-資訊安全規劃實務.json") {
    const question = document.questions.find(({ id }) => id === 34);
    if (question?.type === "題組" && question.answer === "BD") {
      question.type = "題組（複選）";
      corrections += 1;
    }
  }

  if (fileName === "113-2年資訊安全工程師-資訊安全防護實務.json") {
    const question6 = document.questions.find(({ id }) => id === 6);
    if (question6?.type === "題組" && question6.answer === "AD") {
      question6.type = "題組（複選）";
      corrections += 1;
    }

    const question27 = document.questions.find(({ id }) => id === 27);
    if (question27?.type === "題組（複選）" && question27.answer === "B") {
      question27.answer = "BD";
      corrections += 1;
    }
  }

  return corrections;
}

function correctCurrentPredictionDefects(document, fileName) {
  if (!fileName.includes("預測")) {
    return 0;
  }

  let corrections = 0;
  for (const question of document.questions) {
    const currentIncidentResponseText =
      "依 NIST SP 800-61 Rev.3 與 CSF 2.0，事件在 Detect 階段確認且仍持續擴散；進入 Respond 後";
    if (question.question_text.includes(currentIncidentResponseText)) {
      question.question_text = question.question_text.replace(
        currentIncidentResponseText,
        "依 NIST SP 800-61 Rev.3，事件由 Detect 功能確認且仍持續擴散；在 Respond 期間",
      );
      corrections += 1;
    }
  }

  if (fileName === "115-2預測-第16回資訊安全工程師-資訊安全防護實務.json") {
    const question2 = document.questions.find(({ id }) => id === 2);
    const expectedQuestion2 =
      "系統更新機制未驗證程式映像的數位簽章或雜湊，因而將遭竄改的映像視為可信並部署。依 OWASP Top 10:2025 最直接屬於何者？";
    if (question2 && question2.question_text !== expectedQuestion2) {
      question2.question_text = expectedQuestion2;
      corrections += 1;
    }

    const question15 = document.questions.find(({ id }) => id === 15);
    const expectedQuestion15 =
      "依 NIST SP 800-61 Rev.3，哪項活動最能體現 Govern 與 Identify 功能對事件應變準備的支援？";
    if (question15 && question15.question_text !== expectedQuestion15) {
      question15.question_text = expectedQuestion15;
      corrections += 1;
    }
  }

  return corrections;
}

function regroupPredictionCaseQuestions(document, fileName) {
  if (!fileName.includes("預測")) {
    return 0;
  }

  const round = getRoundNumber(fileName);
  const scenarioProfile = scenarioProfiles.get(round);
  if (!scenarioProfile) {
    return 0;
  }

  const [organization, system, constraint] = scenarioProfile;
  const caseQuestions = document.questions.filter(({ id }) => id >= 21 && id <= 40);
  let regroupedQuestions = 0;

  for (let offset = 0; offset < caseQuestions.length; offset += 4) {
    const groupQuestions = caseQuestions.slice(offset, offset + 4);
    const groupNumber = offset / 4 + 1;
    const competencyTopics = [
      ...new Set(
        groupQuestions.map(({ competency }) =>
          String(competency).replace(/^能/u, "").replace(/[。；]$/u, ""),
        ),
      ),
    ];
    const description =
      `${organization}針對${system}展開跨部門資安演練，範圍包括` +
      `${competencyTopics.join("、")}；團隊須在${constraint}下提出可驗證且可追溯的決策。` +
      "情境由治理、維運、開發與事件應變角色共同作業；所有例外均須指定風險擁有者、期限、驗證方式與稽核證據。";

    for (const question of groupQuestions) {
      const expectedGroupId = `題組 ${groupNumber}`;
      const expectedQuestionText = String(question.question_text).replace(
        /【題組[^】]*】/u,
        `【${expectedGroupId}】`,
      );
      if (
        question.case_group?.id !== expectedGroupId ||
        question.case_group?.description !== description ||
        question.question_text !== expectedQuestionText
      ) {
        regroupedQuestions += 1;
      }
      question.question_text = expectedQuestionText;
      question.case_group = {
        id: expectedGroupId,
        description,
      };
    }
  }

  return regroupedQuestions;
}

function cleanPredictionQuestionText(document, fileName) {
  if (!fileName.includes("預測")) {
    return 0;
  }

  let cleanedQuestions = 0;
  for (const question of document.questions) {
    const cleanedText = String(question.question_text)
      .replace(/哪些作法同時符合要求/gu, "依此情境，哪些")
      .replace(/綜合判斷應選取哪些/gu, "依此情境，哪些")
      .replace(/哪些資訊同時符合要求/gu, "依此情境，哪些資訊")
      .replace(/哪些項目同時符合要求/gu, "依此情境，哪些項目");
    if (cleanedText !== question.question_text) {
      question.question_text = cleanedText;
      cleanedQuestions += 1;
    }
  }
  return cleanedQuestions;
}

function getPortfolioDistractor(chapter) {
  return new Map([
    ["1.1", "取得一次稽核通過後，即可永久停止法遵與控制有效性複核"],
    ["1.2", "為提升便利性，應讓所有人員共用永久管理者帳號"],
    ["1.3", "採購單一安全產品後，即可省略信任驗證、分層設計與持續監控"],
    ["2.1", "刪除高風險項目即可視為完成評鑑，無須保留分析假設與依據"],
    ["2.2", "風險處理一經核准即永久有效，無須追蹤殘餘風險與環境變化"],
    ["3.1", "只依攻擊工具名稱判定威脅，無須分析行為、弱點與證據"],
    ["3.2", "事件發生後先刪除告警與日誌，再決定是否遏制或蒐證"],
    ["4.1", "為降低誤報，停用日誌與高風險告警且不保留例外紀錄"],
    ["4.2", "上線前通過一次掃描後，所有後續變更均可免除安全測試"],
  ]).get(chapter);
}

function normalizePredictionAnswerPortfolio(document, fileName) {
  if (!fileName.includes("預測")) {
    return 0;
  }

  const multiAnswerQuestions = document.questions.filter(
    ({ answer }) => String(answer).length > 1,
  );
  let doubleAnswerCount = multiAnswerQuestions.filter(
    ({ answer }) => String(answer).length === 2,
  ).length;
  let modifiedQuestions = 0;
  const candidateOrder = [1, 4, 7, 0, 3, 6, 9, 2, 5, 8];

  for (const candidateIndex of candidateOrder) {
    if (doubleAnswerCount >= 3) {
      break;
    }
    const question = multiAnswerQuestions[candidateIndex];
    if (!question || String(question.answer).length !== 3) {
      continue;
    }
    if (isNegativeQuestion(question.question_text)) {
      continue;
    }

    const answerLetters = String(question.answer).split("");
    const replacedLetter = answerLetters.pop();
    question.answer = answerLetters.join("");
    question.options[replacedLetter] = getPortfolioDistractor(question.chapter);
    question.explanation = buildExplanation(question, question.competency);
    doubleAnswerCount += 1;
    modifiedQuestions += 1;
  }

  return modifiedQuestions;
}

const evidenceByRound = new Map([
  [1, "急診不中斷的回復證據"],
  [2, "全天候追蹤的監測紀錄"],
  [3, "交易核准與稽核軌跡"],
  [4, "產線安全的變更驗證"],
  [5, "關鍵服務韌性測試紀錄"],
  [6, "交易完整性驗證結果"],
  [7, "法定責任與核准紀錄"],
  [8, "研發資料存取稽核軌跡"],
  [9, "模型與研究資料隔離證據"],
  [10, "高可用與身分複核紀錄"],
]);

function contextualizeEarlyPredictionOptions(document, fileName) {
  const round = getRoundNumber(fileName);
  if (round < 1 || round > 10) {
    return 0;
  }

  const evidence = evidenceByRound.get(round);
  let modifiedQuestions = 0;
  for (const question of document.questions) {
    if (
      Object.values(question.options).some((option) => String(option).includes(evidence))
    ) {
      continue;
    }

    const answerLetters = new Set(String(question.answer).split(""));
    const negativeQuestion = isNegativeQuestion(question.question_text);
    for (const [letter, optionText] of Object.entries(question.options)) {
      const optionIsCorrect = negativeQuestion
        ? !answerLetters.has(letter)
        : answerLetters.has(letter);
      question.options[letter] =
        `${optionText}；` +
        (optionIsCorrect ? `並留存${evidence}` : `且可省略${evidence}`);
    }
    modifiedQuestions += 1;
  }
  return modifiedQuestions;
}

function shouldRegenerateExplanation(fileName) {
  const round = getRoundNumber(fileName);
  return !fileName.includes("預測") || (round >= 1 && round <= 10);
}

function regenerateDerivedExplanations(document, fileName) {
  if (!shouldRegenerateExplanation(fileName)) {
    return 0;
  }

  let regeneratedExplanations = 0;
  for (const question of document.questions) {
    const explanation = buildExplanation(question, question.competency);
    if (question.explanation !== explanation) {
      question.explanation = explanation;
      regeneratedExplanations += 1;
    }
  }
  return regeneratedExplanations;
}

function completePredictionExplanations(document, fileName) {
  if (!fileName.includes("預測")) {
    return 0;
  }

  let completedExplanations = 0;
  for (const question of document.questions) {
    const explanation = String(question.explanation);
    if (["A", "B", "C", "D"].every((letter) => explanation.includes(letter))) {
      continue;
    }
    question.explanation = buildExplanation(question, question.competency);
    completedExplanations += 1;
  }
  return completedExplanations;
}

function normalizeQuestionOrder(question) {
  const knownFields = new Set([
    "id",
    "unit",
    "type",
    "answer",
    "question_text",
    "options",
    "explanation",
    "chapter",
    "competency",
    "case_group",
  ]);
  const normalized = {
    id: question.id,
  };
  if (Object.hasOwn(question, "unit")) {
    normalized.unit = question.unit;
  }
  normalized.type = question.type;
  normalized.answer = question.answer;
  normalized.question_text = question.question_text;
  normalized.options = question.options;
  normalized.explanation = question.explanation;
  normalized.chapter = question.chapter;
  normalized.competency = question.competency;
  for (const [field, value] of Object.entries(question)) {
    if (!knownFields.has(field)) {
      normalized[field] = value;
    }
  }
  if (Object.hasOwn(question, "case_group")) {
    normalized.case_group = question.case_group;
  }
  return normalized;
}

function fillMissingFields(document, fileName) {
  const subject = document.metadata?.subject ?? "";
  const questions = document.questions;
  const isPrediction = fileName.includes("預測");
  const missingChapterQuestions = questions.filter(
    (question) => !String(question.chapter ?? "").trim(),
  );
  let quotaAssignments = null;

  if (isPrediction && missingChapterQuestions.length > 0) {
    const quotas = subject.includes("規劃")
      ? planningChapterQuotas
      : protectionChapterQuotas;
    quotaAssignments = assignChaptersWithQuotas(questions, quotas);
  }

  let addedFields = 0;
  questions.forEach((question, index) => {
    if (!String(question.chapter ?? "").trim()) {
      question.chapter =
        quotaAssignments?.[index] ?? getBestChapter(question, subject);
      addedFields += 1;
    }
    if (!String(question.competency ?? "").trim()) {
      question.competency = getCompetency(question, question.chapter);
      addedFields += 1;
    }
    if (!String(question.explanation ?? "").trim()) {
      question.explanation = buildExplanation(question, question.competency);
      addedFields += 1;
    }
  });

  document.questions = questions.map(normalizeQuestionOrder);
  return addedFields;
}

function addMissingSelfAssessmentOption(document, fileName) {
  if (!fileName.includes("自我評量")) {
    return 0;
  }

  let addedOptions = 0;
  for (const question of document.questions) {
    const optionKeys = Object.keys(question.options ?? {});
    if (
      question.unit?.startsWith("第 7 單元") &&
      question.id === 5 &&
      question.question_text === "資通安全健診的目的為何？" &&
      optionKeys.length === 3 &&
      optionKeys.join("") === "ABC"
    ) {
      question.options.D = "資通安全健診僅用於事後追究責任，無須提出改善建議。";
      addedOptions += 1;
    }
  }
  return addedOptions;
}

const fileNames = fs
  .readdirSync(examDirectory)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right, "zh-Hant"));
const documents = fileNames.map((fileName) => {
  const source = fs
    .readFileSync(path.join(examDirectory, fileName), "utf8")
    .replace(/^\uFEFF/u, "");
  const document = JSON.parse(source);
  return {
    document,
    fileName,
    originalJson: JSON.stringify(document),
  };
});

const diversifiedQuestions = diversifyDuplicateQuestions(documents);
let addedFields = 0;
let addedOptions = 0;
let correctedHistoricalDefects = 0;
let correctedPredictionDefects = 0;
let regroupedQuestions = 0;
let cleanedQuestions = 0;
let normalizedMultiAnswers = 0;
let contextualizedQuestions = 0;
let regeneratedExplanations = 0;
let completedExplanations = 0;
let modifiedFiles = 0;

for (const item of documents) {
  correctedHistoricalDefects += correctKnownHistoricalDefects(
    item.document,
    item.fileName,
  );
  correctedPredictionDefects += correctCurrentPredictionDefects(
    item.document,
    item.fileName,
  );
  addedOptions += addMissingSelfAssessmentOption(item.document, item.fileName);
  addedFields += fillMissingFields(item.document, item.fileName);
  regroupedQuestions += regroupPredictionCaseQuestions(
    item.document,
    item.fileName,
  );
  cleanedQuestions += cleanPredictionQuestionText(item.document, item.fileName);
  normalizedMultiAnswers += normalizePredictionAnswerPortfolio(
    item.document,
    item.fileName,
  );
  contextualizedQuestions += contextualizeEarlyPredictionOptions(
    item.document,
    item.fileName,
  );
  regeneratedExplanations += regenerateDerivedExplanations(
    item.document,
    item.fileName,
  );
  completedExplanations += completePredictionExplanations(
    item.document,
    item.fileName,
  );
  const reviewed = JSON.stringify(item.document);
  if (reviewed === item.originalJson) {
    continue;
  }

  fs.writeFileSync(
    path.join(examDirectory, item.fileName),
    `${JSON.stringify(item.document, null, 2)}\n`,
    "utf8",
  );
  modifiedFiles += 1;
}

console.log(
  [
    `Reviewed ${documents.length} files.`,
    `Modified ${modifiedFiles} files.`,
    `Added ${addedFields} required fields.`,
    `Added ${addedOptions} missing option.`,
    `Corrected ${correctedHistoricalDefects} historical field defects.`,
    `Corrected ${correctedPredictionDefects} current prediction defects.`,
    `Diversified ${diversifiedQuestions} repeated questions.`,
    `Regrouped ${regroupedQuestions} prediction case questions.`,
    `Cleaned ${cleanedQuestions} prediction question texts.`,
    `Normalized ${normalizedMultiAnswers} multi-answer portfolios.`,
    `Contextualized ${contextualizedQuestions} prediction questions.`,
    `Regenerated ${regeneratedExplanations} derived explanations.`,
    `Completed ${completedExplanations} prediction explanations.`,
  ].join(" "),
);
