import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const examDirectory = path.resolve(scriptDirectory, "..", "exam", "json");
const errors = [];
const generatedExpansionPattern = /第(?:2[2-9]|3[0-9]|40)回/u;
const strictExpansionPattern = /第(?:3[1-9]|40)回/u;
const prohibitedTemplatePatterns = [
  /可驗證且與風險相稱的處置/u,
  /只改變風險名稱而不處理成因/u,
  /以處理.+的具體風險/u,
  /能降低.+風險並留下可稽核證據/u,
  /依風險、資產重要性與可驗證證據.+時執行受控處置/u,
  /該作法缺少必要的驗證、最小權限或治理追蹤/u,
  /建立可驗證的.+控制，保留責任、證據與定期複核/u,
  /缺乏足以降低風險的可驗證控制/u,
  /並明確界定/u,
  /整體判斷仍須回到/u,
  /並以實際技術證據驗證控制成效/u,
  /並能驗證/u,
];
const strictProhibitedTemplatePatterns = [
  /且保留相應的技術驗證與責任紀錄/u,
  /判讀時須辨別/u,
  /技術判準包括/u,
  /決策證據應支持/u,
  /能力範圍延伸至/u,
  /風險比較納入/u,
  /實作上須掌握/u,
  /在需查核「/u,
  /變更審查要重新確認/u,
  /驗收證據必須對應/u,
  /責任交接不得遺漏/u,
  /風險接受應明載/u,
  /監控門檻需反映/u,
  /第三方責任亦須涵蓋/u,
  /決策紀錄需保留/u,
  /採用前須以紀錄界定/u,
  /稽核軌跡要串接/u,
  /處置優先序應依據/u,
  /控制範圍須完整納入/u,
  /復原判準應逐項核對/u,
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

function normalizeText(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-Hant")
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

function getCharacterLength(value) {
  return Array.from(String(value)).length;
}

function getRepeatedLongClauses(
  questions,
  minimumLength = 10,
  minimumUses = 5,
) {
  const clauseLocations = new Map();
  for (const question of questions) {
    const questionClauses = new Set();
    const contentFields = [
      question.question_text,
      question.explanation,
      question.competency,
      ...Object.values(question.options),
    ];
    for (const content of contentFields) {
      for (const rawClause of String(content).split(/[，。；！？\r\n]+/u)) {
        const clause = rawClause
          .trim()
          .replace(
            /^[A-DＡ-Ｄ](?=\s|[：:、.．)）「『])(?:\s|[：:、.．)）-])*/iu,
            "",
          );
        const normalizedClause = normalizeText(clause);
        if (
          getCharacterLength(normalizedClause) < minimumLength ||
          questionClauses.has(normalizedClause)
        ) {
          continue;
        }
        questionClauses.add(normalizedClause);
        if (!clauseLocations.has(normalizedClause)) {
          clauseLocations.set(normalizedClause, {
            clause,
            questionIds: new Set(),
          });
        }
        clauseLocations.get(normalizedClause).questionIds.add(question.id);
      }
    }
  }
  return [...clauseLocations.values()].filter(
    ({ questionIds }) => questionIds.size >= minimumUses,
  );
}

function getRepeatedQuotedSegmentsAcrossFields(
  question,
  minimumLength = 10,
  minimumFields = 3,
) {
  const segmentLocations = new Map();
  const contentFields = new Map([
    ["question_text", question.question_text],
    ["explanation", question.explanation],
    ["competency", question.competency],
    ...Object.entries(question.options).map(([letter, option]) => [
      `option.${letter}`,
      option,
    ]),
  ]);

  for (const [field, content] of contentFields) {
    const fieldSegments = new Set();
    for (const match of String(content).matchAll(/「([^」]+)」/gu)) {
      const segment = match[1].trim();
      const normalizedSegment = normalizeText(segment);
      if (
        getCharacterLength(normalizedSegment) < minimumLength ||
        fieldSegments.has(normalizedSegment)
      ) {
        continue;
      }
      fieldSegments.add(normalizedSegment);
      if (!segmentLocations.has(normalizedSegment)) {
        segmentLocations.set(normalizedSegment, {
          segment,
          fields: new Set(),
        });
      }
      segmentLocations.get(normalizedSegment).fields.add(field);
    }
  }

  return [...segmentLocations.values()].filter(
    ({ fields }) => fields.size >= minimumFields,
  );
}

function getTrigrams(value) {
  const characters = Array.from(normalizeText(value));
  if (characters.length < 3) {
    return new Set([characters.join("")]);
  }
  const trigrams = new Set();
  for (let index = 0; index <= characters.length - 3; index += 1) {
    trigrams.add(characters.slice(index, index + 3).join(""));
  }
  return trigrams;
}

function getDiceSimilarity(left, right) {
  if (left.size === 0 && right.size === 0) {
    return 1;
  }
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) {
      intersection += 1;
    }
  }
  return (2 * intersection) / (left.size + right.size);
}

function getQuestionFingerprint(question) {
  const sortedOptions = Object.values(question.options)
    .map(normalizeText)
    .sort()
    .join("|");
  return `${question.question_text}|${sortedOptions}`;
}

function getNearOverlap(leftDocument, rightDocument, threshold = 0.85) {
  const candidates = [];
  leftDocument.questions.forEach((leftQuestion, leftIndex) => {
    rightDocument.questions.forEach((rightQuestion, rightIndex) => {
      const similarity = getDiceSimilarity(
        leftQuestion.trigrams,
        rightQuestion.trigrams,
      );
      if (similarity >= threshold) {
        candidates.push({ leftIndex, rightIndex, similarity });
      }
    });
  });
  candidates.sort((left, right) => right.similarity - left.similarity);

  const matchedLeft = new Set();
  const matchedRight = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (
      matchedLeft.has(candidate.leftIndex) ||
      matchedRight.has(candidate.rightIndex)
    ) {
      continue;
    }
    matchedLeft.add(candidate.leftIndex);
    matchedRight.add(candidate.rightIndex);
    matches.push(candidate);
  }
  return matches;
}

function addError(message) {
  errors.push(message);
}

const predictionFiles = fs
  .readdirSync(examDirectory)
  .filter((fileName) => fileName.includes("預測") && fileName.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right, "zh-Hant"));

const documents = predictionFiles.map((fileName) => {
  const document = readJson(path.join(examDirectory, fileName));
  return {
    fileName,
    subject: document.metadata.subject,
    questions: document.questions.map((question) => ({
      ...question,
      trigrams: getTrigrams(getQuestionFingerprint(question)),
    })),
  };
});

let totalSingleAnswers = 0;
let totalDoubleAnswers = 0;
let totalTripleAnswers = 0;
let totalQuadrupleAnswers = 0;
let totalQuestionLength = 0;
let totalOptionLength = 0;
let totalCaseDescriptionLength = 0;
let totalCaseQuestions = 0;

for (const document of documents) {
  if (generatedExpansionPattern.test(document.fileName)) {
    const usesStrictExpansionRules = strictExpansionPattern.test(
      document.fileName,
    );
    const minimumExplanationLength = usesStrictExpansionRules ? 85 : 50;
    const templateQuestionIds = new Set();
    const shortExplanationIds = [];
    const optionLocations = new Map();
    let documentExplanationLength = 0;
    let documentOptionLength = 0;
    let documentQuestionLength = 0;
    let documentCompetencyLength = 0;
    for (const question of document.questions) {
      const content = [
        question.question_text,
        question.explanation,
        question.competency,
        ...Object.values(question.options),
      ].join("\n");
      if (
        prohibitedTemplatePatterns.some((pattern) => pattern.test(content)) ||
        (usesStrictExpansionRules &&
          strictProhibitedTemplatePatterns.some((pattern) =>
            pattern.test(content),
          ))
      ) {
        templateQuestionIds.add(question.id);
      }
      if (usesStrictExpansionRules) {
        for (const { segment, fields } of getRepeatedQuotedSegmentsAcrossFields(
          question,
        )) {
          addError(
            `${document.fileName}#${question.id}: repeated long quoted segment across ` +
              `${fields.size} fields (${[...fields].join(", ")}): 「${segment}」`,
          );
        }
      }
      const explanationLength = getCharacterLength(question.explanation);
      if (explanationLength < minimumExplanationLength) {
        shortExplanationIds.push(question.id);
      }
      documentExplanationLength += explanationLength;
      documentQuestionLength += getCharacterLength(question.question_text);
      documentCompetencyLength += getCharacterLength(question.competency);
      documentOptionLength += Object.values(question.options).reduce(
        (length, option) => length + getCharacterLength(option),
        0,
      );
      for (const [letter, option] of Object.entries(question.options)) {
        const normalizedOption = normalizeText(option);
        if (!optionLocations.has(normalizedOption)) {
          optionLocations.set(normalizedOption, []);
        }
        optionLocations.get(normalizedOption).push(`${question.id}${letter}`);
      }
    }
    if (templateQuestionIds.size > 0) {
      addError(
        `${document.fileName}: prohibited template language in question(s) ` +
          `${[...templateQuestionIds].join(", ")}`,
      );
    }
    if (shortExplanationIds.length > 0) {
      addError(
        `${document.fileName}: explanation shorter than ${minimumExplanationLength} characters in question(s) ` +
          `${shortExplanationIds.join(", ")}`,
      );
    }
    if (usesStrictExpansionRules) {
      const questionCount = document.questions.length;
      const averageExplanationLength =
        documentExplanationLength / questionCount;
      const averageOptionLength =
        documentOptionLength / (questionCount * 4);
      const averageQuestionLength = documentQuestionLength / questionCount;
      const averageCompetencyLength =
        documentCompetencyLength / questionCount;
      const minimumAverages = [
        ["explanation", averageExplanationLength, 95],
        ["option", averageOptionLength, 15],
        ["question_text", averageQuestionLength, 28],
        ["competency", averageCompetencyLength, 15],
      ];
      for (const [field, actual, minimum] of minimumAverages) {
        if (actual < minimum) {
          addError(
            `${document.fileName}: average ${field} length must be at least ${minimum}; ` +
              `found ${actual.toFixed(1)}`,
          );
        }
      }
      for (const { clause, questionIds } of getRepeatedLongClauses(
        document.questions,
      )) {
        const ids = [...questionIds].sort((left, right) => left - right);
        addError(
          `${document.fileName}: repeated long clause across ${ids.length} questions ` +
            `(${ids.join(", ")}): "${clause}"`,
        );
      }
    }
    for (const locations of optionLocations.values()) {
      if (locations.length > 2) {
        addError(
          `${document.fileName}: identical option text reused ${locations.length} times ` +
            `at ${locations.join(", ")}`,
        );
      }
    }
  }

  const caseQuestions = document.questions.filter(
    ({ type }) => type === "題組" || type === "題組（複選）",
  );
  const caseGroups = new Map();
  for (const question of caseQuestions) {
    const groupId = question.case_group?.id ?? "";
    if (!caseGroups.has(groupId)) {
      caseGroups.set(groupId, []);
    }
    caseGroups.get(groupId).push(question);
  }
  if (caseGroups.size !== 5) {
    addError(`${document.fileName}: expected 5 case groups; found ${caseGroups.size}`);
  }
  for (const [groupId, questions] of caseGroups) {
    if (questions.length !== 4) {
      addError(
        `${document.fileName}: ${groupId} must contain 4 questions; found ${questions.length}`,
      );
    }
    if (
      new Set(questions.map(({ case_group: caseGroup }) => caseGroup.description))
        .size !== 1
    ) {
      addError(`${document.fileName}: ${groupId} has inconsistent descriptions`);
    }
  }

  const multiAnswerQuestions = document.questions.filter(
    ({ answer }) => answer.length > 1,
  );
  const doubleAnswers = multiAnswerQuestions.filter(
    ({ answer }) => answer.length === 2,
  ).length;
  const tripleAnswers = multiAnswerQuestions.filter(
    ({ answer }) => answer.length === 3,
  ).length;
  if (doubleAnswers !== 3 || tripleAnswers !== 7) {
    addError(
      `${document.fileName}: expected multi-answer portfolio 3 double/7 triple; found ${doubleAnswers}/${tripleAnswers}`,
    );
  }

  for (const question of document.questions) {
    const reference = `${document.fileName}#${question.id}`;
    if (!String(question.competency).startsWith("能")) {
      addError(`${reference}: competency must start with '能'`);
    }
    for (const letter of ["A", "B", "C", "D"]) {
      if (!String(question.explanation).includes(letter)) {
        addError(`${reference}: explanation does not address option ${letter}`);
      }
    }

    const answerLength = question.answer.length;
    if (answerLength === 1) totalSingleAnswers += 1;
    if (answerLength === 2) totalDoubleAnswers += 1;
    if (answerLength === 3) totalTripleAnswers += 1;
    if (answerLength === 4) totalQuadrupleAnswers += 1;
    totalQuestionLength += Array.from(question.question_text).length;
    totalOptionLength += Object.values(question.options).reduce(
      (length, option) => length + Array.from(String(option)).length,
      0,
    );
    if (question.case_group) {
      totalCaseDescriptionLength += Array.from(
        question.case_group.description,
      ).length;
      totalCaseQuestions += 1;
    }
  }
}

let minimumDifferenceRate = 1;
let maximumNearOverlap = 0;
let pairCount = 0;
for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
  for (
    let rightIndex = leftIndex + 1;
    rightIndex < documents.length;
    rightIndex += 1
  ) {
    const left = documents[leftIndex];
    const right = documents[rightIndex];
    if (left.subject !== right.subject) {
      continue;
    }
    pairCount += 1;
    const matches = getNearOverlap(left, right);
    const differenceRate = (40 - matches.length) / 40;
    minimumDifferenceRate = Math.min(minimumDifferenceRate, differenceRate);
    maximumNearOverlap = Math.max(maximumNearOverlap, matches.length);
    if (differenceRate < 0.7) {
      addError(
        `${left.fileName} vs ${right.fileName}: near-duplicate difference ${(differenceRate * 100).toFixed(1)}%`,
      );
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[ERROR] ${error}`);
  }
  console.error(`Quality validation failed: ${errors.length} error(s).`);
  process.exit(1);
}

const questionCount = documents.reduce(
  (count, document) => count + document.questions.length,
  0,
);
console.log(
  `Quality validation passed: ${documents.length} files, ${questionCount} questions, ` +
    `${pairCount} same-subject pairs, minimum near-duplicate difference ` +
    `${(minimumDifferenceRate * 100).toFixed(1)}% (maximum overlap ${maximumNearOverlap}/40).`,
);
console.log(
  `Answer portfolio: ${totalSingleAnswers} single, ${totalDoubleAnswers} double, ` +
    `${totalTripleAnswers} triple, ${totalQuadrupleAnswers} quadruple answers.`,
);
console.log(
  `Average lengths: stem ${(totalQuestionLength / questionCount).toFixed(1)}, ` +
    `options ${(totalOptionLength / questionCount).toFixed(1)}, ` +
    `case ${(totalCaseDescriptionLength / totalCaseQuestions).toFixed(1)} characters.`,
);
