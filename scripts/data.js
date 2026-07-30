import { EXAM_BASE_PATH } from "./config.js";
import { normalizeAcceptedAnswers, splitAnswer, stripExtension } from "./utils.js";
export async function loadExamDocument(file) {
  const response = await fetch(`${EXAM_BASE_PATH}${encodeURIComponent(file)}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${file} HTTP ${response.status}`);
  }
  const data = await response.json();
  return { file, data, source: getSourceMeta(data, file) };
}

export function normalizeQuestions(data, file) {
  const rawQuestions = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(rawQuestions)) {
    return [];
  }

  const source = getSourceMeta(data, file);

  return rawQuestions
    .map((item, index) => {
      const options = item.options || {};
      const answer = String(item.answer || "").toUpperCase().replace(/[^A-Z]/g, "");
      const answerLetters = splitAnswer(answer);
      const acceptedAnswers = normalizeAcceptedAnswers(item.acceptedAnswers || item.accepted_answers, answer);
      const category = item.category || item.unit || getDefaultCategory(source);
      const caseGroup = normalizeCaseGroup(item.caseGroup || item.case_group);
      const images = normalizeImages(item);

      const questionNumber = Number(item.id) || index + 1;

      return {
        id: `${stripExtension(file)}#${questionNumber}-${index + 1}`,
        order: questionNumber,
        source,
        category,
        type: getDisplayType(item.type, answerLetters.length),
        answer,
        acceptedAnswers,
        question: item.question || item.question_text || "",
        options,
        images,
        caseGroup,
        explanation: item.explanation || buildExplanationFromAnswers(acceptedAnswers, options)
      };
    })
    .filter((item) => item.question && item.answer && Object.keys(item.options).length);
}

function getSourceMeta(data, file) {
  const metadata = data.metadata || {};
  const title = metadata.exam_name || metadata.title || stripExtension(file);
  const subject = metadata.subject || metadata.unit_source || "";
  const date = metadata.date || "";
  const isSpecialist = subject.includes("資訊安全規劃實務") || subject.includes("資訊安全防護實務");
  const isConcept = title.includes("資通安全概論") || file.includes("資通安全概論");

  return {
    file,
    title,
    subject,
    date,
    isSpecialist,
    isConcept
  };
}

function normalizeCaseGroup(caseGroup) {
  if (!caseGroup || typeof caseGroup !== "object" || Array.isArray(caseGroup)) {
    return null;
  }

  const description = typeof caseGroup.description === "string" ? caseGroup.description : "";
  const images = normalizeImages(caseGroup);
  if (!description && !images.length) {
    return null;
  }

  return {
    id: caseGroup.id || "題組",
    description,
    images
  };
}

export function normalizeImages(owner) {
  if (!owner || typeof owner !== "object" || Array.isArray(owner)) {
    return [];
  }

  const hasImage = Object.prototype.hasOwnProperty.call(owner, "image");
  const hasImages = Object.prototype.hasOwnProperty.call(owner, "images");
  if (hasImage && hasImages) {
    return [];
  }

  const rawImages = hasImages ? owner.images : hasImage ? [owner.image] : [];
  if (!Array.isArray(rawImages)) {
    return [];
  }

  return rawImages.map(normalizeImage).filter(Boolean);
}

function normalizeImage(image) {
  if (!image || typeof image !== "object" || Array.isArray(image)) {
    return null;
  }

  const src = normalizeImageSource(image.src);
  if (!src) {
    return null;
  }

  return {
    src,
    alt: normalizeOptionalText(image.alt),
    caption: normalizeOptionalText(image.caption),
    source_page: normalizeSourcePage(image.source_page)
  };
}

function normalizeImageSource(value) {
  if (typeof value !== "string") {
    return "";
  }

  const rawSource = value.trim();
  if (!rawSource || rawSource.startsWith("/") || rawSource.includes("\\") || /[?#]/.test(rawSource)) {
    return "";
  }

  const rawSegments = rawSource.split("/");
  if (rawSegments.length < 3 || rawSegments[0] !== "exam" || rawSegments[1] !== "images") {
    return "";
  }

  const decodedSegments = [];
  for (const rawSegment of rawSegments) {
    const decodedSegment = decodePathSegment(rawSegment);
    if (
      !decodedSegment
      || decodedSegment === "."
      || decodedSegment === ".."
      || decodedSegment.includes("/")
      || decodedSegment.includes("\\")
      || /[\u0000-\u001f\u007f]/u.test(decodedSegment)
    ) {
      return "";
    }
    decodedSegments.push(decodedSegment);
  }

  const fileName = decodedSegments[decodedSegments.length - 1];
  if (!/\.(?:png|jpe?g|webp)$/i.test(fileName)) {
    return "";
  }

  return decodedSegments.map((segment) => encodeURIComponent(segment)).join("/");
}

function decodePathSegment(value) {
  let decoded = value;
  try {
    for (let attempt = 0; attempt <= value.length; attempt += 1) {
      const nextValue = decodeURIComponent(decoded);
      if (nextValue === decoded) {
        break;
      }
      decoded = nextValue;
    }
  } catch {
    return "";
  }
  return decoded;
}

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSourcePage(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getDefaultCategory(source) {
  if (source.subject && source.date) {
    return `${source.subject}｜${source.date}`;
  }
  return source.title || "未分類";
}

function getDisplayType(type, answerCount) {
  const baseType = type || (answerCount > 1 ? "複選題" : "單選題");
  if (answerCount > 1 && !baseType.includes("複")) {
    return `${baseType}（複選）`;
  }
  return baseType;
}

function buildExplanationFromAnswers(answers, options) {
  const details = answers
    .map((answer) => answer
      .map((letter) => `${letter}. ${options[letter] || ""}`.trim())
      .join("；"))
    .filter(Boolean)
    .join(" 或 ");
  return details ? `正確答案為 ${details}。` : "";
}
