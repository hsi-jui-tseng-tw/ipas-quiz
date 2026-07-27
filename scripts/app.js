import { ALL_SCOPE, PASS_SCORE, SPECIALIST_SCOPE, TOTAL_SCORE } from "./config.js";
import { EXAM_FILES } from "./exam-files.js";
import { loadExamDocument, normalizeQuestions } from "./data.js";
import { buildQuestionUnits, flattenQuestionUnits, pickBalancedExam, pickQuestionSet } from "./quiz-engine.js";
import { formatScore, normalizeAcceptedAnswers, sameLetters, splitAnswer, stripExtension } from "./utils.js";
const state = {
  documents: [],
  allQuestions: [],
  activeQuestions: [],
  currentIndex: 0,
  correctCount: 0,
  pointsPerQuestion: 0,
  answered: false,
  selected: new Set(),
  results: []
};

const els = {
  bankStatus: document.getElementById("bankStatus"),
  sessionStatus: document.getElementById("sessionStatus"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsSummaryText: document.getElementById("settingsSummaryText"),
  examSelect: document.getElementById("examSelect"),
  categorySelect: document.getElementById("categorySelect"),
  limitSelect: document.getElementById("limitSelect"),
  shuffleInput: document.getElementById("shuffleInput"),
  ruleText: document.getElementById("ruleText"),
  startButton: document.getElementById("startButton"),
  loadingView: document.getElementById("loadingView"),
  errorView: document.getElementById("errorView"),
  emptyView: document.getElementById("emptyView"),
  quizView: document.getElementById("quizView"),
  resultView: document.getElementById("resultView"),
  sourceTag: document.getElementById("sourceTag"),
  typeTag: document.getElementById("typeTag"),
  progressText: document.getElementById("progressText"),
  progressFill: document.getElementById("progressFill"),
  caseBox: document.getElementById("caseBox"),
  caseTitle: document.getElementById("caseTitle"),
  caseDescription: document.getElementById("caseDescription"),
  questionText: document.getElementById("questionText"),
  optionsList: document.getElementById("optionsList"),
  checkButton: document.getElementById("checkButton"),
  nextButton: document.getElementById("nextButton"),
  feedbackBox: document.getElementById("feedbackBox"),
  feedbackTitle: document.getElementById("feedbackTitle"),
  feedbackText: document.getElementById("feedbackText"),
  resultSummary: document.getElementById("resultSummary"),
  scoreValue: document.getElementById("scoreValue"),
  rateValue: document.getElementById("rateValue"),
  wrongValue: document.getElementById("wrongValue"),
  restartButton: document.getElementById("restartButton"),
  changeButton: document.getElementById("changeButton"),
  reviewList: document.getElementById("reviewList")
};

init();

async function init() {
  bindEvents();

  try {
    const documents = await Promise.all(EXAM_FILES.map(loadExamDocument));
    const questions = documents.flatMap((document) => normalizeQuestions(document.data, document.file));

    if (!questions.length) {
      throw new Error("exam/json 沒有可用題目");
    }

    state.documents = documents;
    state.allQuestions = questions;
    populateExamSelect(documents);
    populateCategories();
    enableSetup();
    els.bankStatus.textContent = `題庫 ${questions.length} 題 / ${documents.length} 檔`;
    startQuiz();
  } catch (error) {
    els.errorView.textContent = `無法讀取 exam/json 題庫：${error.message}`;
    els.bankStatus.textContent = "題庫載入失敗";
    showView("error");
  }
}

function bindEvents() {
  els.examSelect.addEventListener("change", () => {
    populateCategories();
    updateRulePreview();
  });
  els.categorySelect.addEventListener("change", updateRulePreview);
  els.limitSelect.addEventListener("change", updateRulePreview);
  els.shuffleInput.addEventListener("change", updateRulePreview);
  els.startButton.addEventListener("click", startQuiz);
  els.checkButton.addEventListener("click", () => evaluateAnswer());
  els.nextButton.addEventListener("click", nextQuestion);
  els.restartButton.addEventListener("click", startQuiz);
  els.changeButton.addEventListener("click", () => {
    els.settingsPanel.open = true;
    els.startButton.focus();
  });
}

function populateExamSelect(documents) {
  els.examSelect.innerHTML = "";
  els.examSelect.append(new Option("全部中級題庫（歷屆＋預測）", SPECIALIST_SCOPE));
  els.examSelect.append(new Option("全部題庫（含概論）", ALL_SCOPE));

  for (const document of documents) {
    const source = document.source;
    const labelParts = [stripExtension(document.file)];
    if (source.subject) {
      labelParts.push(source.subject);
    }
    els.examSelect.append(new Option(labelParts.join("｜"), document.file));
  }

  els.examSelect.value = SPECIALIST_SCOPE;
}

function populateCategories() {
  const questions = getBaseQuestionsForScope();
  const counts = new Map();
  for (const question of questions) {
    counts.set(question.category, (counts.get(question.category) || 0) + 1);
  }

  const categories = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh-Hant"));
  els.categorySelect.innerHTML = "";
  els.categorySelect.append(new Option(`全部（${questions.length} 題）`, "__all__"));

  for (const [category, count] of categories) {
    els.categorySelect.append(new Option(`${category}（${count} 題）`, category));
  }

  updateRulePreview();
}

function enableSetup() {
  els.examSelect.disabled = false;
  els.categorySelect.disabled = false;
  els.limitSelect.disabled = false;
  els.shuffleInput.disabled = false;
  els.startButton.disabled = false;
}

function startQuiz() {
  const selectedQuestions = buildQuestionSet();
  state.activeQuestions = selectedQuestions;
  state.currentIndex = 0;
  state.correctCount = 0;
  state.pointsPerQuestion = selectedQuestions.length ? TOTAL_SCORE / selectedQuestions.length : 0;
  state.results = [];

  if (!state.activeQuestions.length) {
    els.errorView.textContent = "這個單元沒有可用題目。";
    showView("error");
    return;
  }

  els.settingsPanel.open = false;
  updateRulePreview();
  showView("quiz");
  renderQuestion();
}

function buildQuestionSet() {
  let pool = applyCategoryFilter(getBaseQuestionsForScope());

  const limit = els.limitSelect.value;
  if (limit === "all") {
    return flattenQuestionUnits(buildQuestionUnits(pool), els.shuffleInput.checked);
  }

  if (limit !== "rule") {
    return pickQuestionSet(pool, Number(limit), els.shuffleInput.checked);
  }

  if (els.examSelect.value === SPECIALIST_SCOPE) {
    return pickBalancedExam(pool, 30, 10, els.shuffleInput.checked);
  }

  if (els.examSelect.value === ALL_SCOPE) {
    return pickBalancedExam(pool, 30, 10, els.shuffleInput.checked);
  }

  if (isConceptScope()) {
    return pickQuestionSet(pool, Math.min(50, pool.length), els.shuffleInput.checked);
  }

  return flattenQuestionUnits(buildQuestionUnits(pool), els.shuffleInput.checked);
}

function getBaseQuestionsForScope() {
  const scope = els.examSelect.value;
  if (scope === SPECIALIST_SCOPE) {
    return state.allQuestions.filter((question) => question.source.isSpecialist);
  }
  if (scope === ALL_SCOPE) {
    return state.allQuestions;
  }
  return state.allQuestions.filter((question) => question.source.file === scope);
}

function applyCategoryFilter(questions) {
  const selectedCategory = els.categorySelect.value;
  if (!selectedCategory || selectedCategory === "__all__") {
    return [...questions];
  }
  return questions.filter((question) => question.category === selectedCategory);
}

function renderQuestion() {
  const question = getCurrentQuestion();
  state.answered = false;
  state.selected = new Set();

  els.sourceTag.textContent = getSourceLabel(question);
  els.typeTag.textContent = question.type || (question.answer.length > 1 ? "複選題" : "單選題");
  els.progressText.textContent = `第 ${state.currentIndex + 1} / ${state.activeQuestions.length} 題`;
  els.progressFill.style.width = `${(state.currentIndex / state.activeQuestions.length) * 100}%`;
  els.questionText.textContent = question.question;

  renderCaseGroup(question.caseGroup);
  renderOptions(question);
  resetFeedback();
  els.checkButton.classList.toggle("hidden", question.answer.length <= 1);
  els.checkButton.disabled = true;
  els.nextButton.classList.add("hidden");
  els.nextButton.textContent = isLastQuestion() ? "查看結果" : "下一題";
  els.sessionStatus.textContent = `得分 ${formatScore(getCurrentScore())} / ${TOTAL_SCORE}`;
}

function renderCaseGroup(caseGroup) {
  if (!caseGroup || !caseGroup.description) {
    els.caseBox.classList.add("hidden");
    return;
  }

  els.caseTitle.textContent = caseGroup.id || "題組";
  els.caseDescription.textContent = caseGroup.description;
  els.caseBox.classList.remove("hidden");
}

function renderOptions(question) {
  els.optionsList.innerHTML = "";

  for (const letter of Object.keys(question.options).sort()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.dataset.letter = letter;
    button.setAttribute("aria-pressed", "false");

    const letterSpan = document.createElement("span");
    letterSpan.className = "option-letter";
    letterSpan.textContent = letter;

    const textSpan = document.createElement("span");
    textSpan.className = "option-text";
    textSpan.textContent = question.options[letter];

    button.append(letterSpan, textSpan);
    button.addEventListener("click", () => handleOptionClick(letter));
    els.optionsList.append(button);
  }
}

function handleOptionClick(letter) {
  const question = getCurrentQuestion();
  if (state.answered) {
    return;
  }

  if (splitAnswer(question.answer).length > 1) {
    toggleMultiSelection(letter);
    return;
  }

  state.selected = new Set([letter]);
  evaluateAnswer();
}

function toggleMultiSelection(letter) {
  if (state.selected.has(letter)) {
    state.selected.delete(letter);
  } else {
    state.selected.add(letter);
  }

  for (const option of els.optionsList.querySelectorAll(".option")) {
    const isSelected = state.selected.has(option.dataset.letter);
    option.classList.toggle("selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  }

  els.checkButton.disabled = state.selected.size === 0;
}

function evaluateAnswer() {
  const question = getCurrentQuestion();
  if (state.answered || state.selected.size === 0) {
    return;
  }

  state.answered = true;
  const acceptedAnswers = getAcceptedAnswers(question);
  const selectedLetters = [...state.selected].sort();
  const matchedAnswer = acceptedAnswers.find((accepted) => sameLetters(selectedLetters, accepted));
  const isCorrect = Boolean(matchedAnswer);
  const correctLetters = matchedAnswer || splitAnswer(question.answer);

  if (isCorrect) {
    state.correctCount += 1;
  }

  state.results.push({
    question,
    selected: selectedLetters,
    correct: correctLetters,
    acceptedAnswers,
    isCorrect
  });

  markOptions(correctLetters, selectedLetters);
  showFeedback(question, isCorrect);

  els.checkButton.classList.add("hidden");
  els.nextButton.classList.remove("hidden");
  els.progressFill.style.width = `${((state.currentIndex + 1) / state.activeQuestions.length) * 100}%`;
  els.sessionStatus.textContent = `得分 ${formatScore(getCurrentScore())} / ${TOTAL_SCORE}`;
}

function markOptions(correctLetters, selectedLetters) {
  for (const option of els.optionsList.querySelectorAll(".option")) {
    const letter = option.dataset.letter;
    option.disabled = true;
    option.classList.remove("selected");

    if (correctLetters.includes(letter)) {
      option.classList.add("correct");
    } else if (selectedLetters.includes(letter)) {
      option.classList.add("incorrect");
    }
  }
}

function showFeedback(question, isCorrect) {
  els.feedbackBox.className = `feedback ${isCorrect ? "good" : "bad"}`;
  els.feedbackTitle.textContent = isCorrect ? "正確！" : `正確答案為：${formatAcceptedAnswers(question)}`;
  els.feedbackText.textContent = question.explanation || `正確答案為 ${formatAcceptedAnswerDetails(question)}`;
  els.feedbackBox.classList.remove("hidden");
}

function resetFeedback() {
  els.feedbackBox.className = "feedback hidden";
  els.feedbackTitle.textContent = "";
  els.feedbackText.textContent = "";
}

function nextQuestion() {
  if (!state.answered) {
    return;
  }

  if (isLastQuestion()) {
    showResult();
    return;
  }

  state.currentIndex += 1;
  renderQuestion();
}

function showResult() {
  const total = state.activeQuestions.length;
  const wrong = total - state.correctCount;
  const score = getCurrentScore();
  const rate = total ? Math.round((state.correctCount / total) * 100) : 0;
  const isPassed = score >= PASS_SCORE;

  els.resultSummary.textContent = `${isPassed ? "通過" : "未通過"}：及格標準 ${PASS_SCORE} 分，複選題需全對才得分。`;
  els.scoreValue.textContent = `${formatScore(score)} / ${TOTAL_SCORE}`;
  els.rateValue.textContent = `${rate}%`;
  els.wrongValue.textContent = String(wrong);
  els.sessionStatus.textContent = `${isPassed ? "通過" : "未通過"} ${formatScore(score)} 分`;
  renderReviewList();
  showView("result");
}

function renderReviewList() {
  els.reviewList.innerHTML = "";
  const wrongResults = state.results.filter((result) => !result.isCorrect);

  if (!wrongResults.length) {
    const item = document.createElement("div");
    item.className = "review-item";
    item.innerHTML = '<div class="review-item-title">沒有錯題</div><p>本次測驗全部答對。</p>';
    els.reviewList.append(item);
    return;
  }

  for (const result of wrongResults) {
    const item = document.createElement("div");
    item.className = "review-item wrong";

    const title = document.createElement("div");
    title.className = "review-item-title";
    title.textContent = result.question.question;

    const selected = document.createElement("p");
    selected.textContent = `你的答案：${result.selected.join("、") || "未作答"}`;

    const correct = document.createElement("p");
    correct.textContent = `正確答案：${formatAcceptedAnswers(result.question)}`;

    const explanation = document.createElement("p");
    explanation.textContent = result.question.explanation;

    item.append(title, selected, correct, explanation);
    els.reviewList.append(item);
  }
}

function showView(viewName) {
  els.loadingView.classList.toggle("hidden", viewName !== "loading");
  els.errorView.classList.toggle("hidden", viewName !== "error");
  els.emptyView.classList.toggle("hidden", viewName !== "empty");
  els.quizView.classList.toggle("hidden", viewName !== "quiz");
  els.resultView.classList.toggle("hidden", viewName !== "result");
}

function getCurrentQuestion() {
  return state.activeQuestions[state.currentIndex];
}

function getCurrentScore() {
  return state.correctCount * state.pointsPerQuestion;
}

function getSourceLabel(question) {
  const source = question.source || {};
  if (source.subject && source.date) {
    return `${source.subject}｜${source.date}`;
  }
  return source.title || question.category;
}

function getAcceptedAnswers(question) {
  return question.acceptedAnswers?.length ? question.acceptedAnswers : [splitAnswer(question.answer)];
}

function formatAcceptedAnswers(question) {
  return getAcceptedAnswers(question)
    .map((answer) => answer.join("、"))
    .join(" 或 ");
}

function formatAcceptedAnswerDetails(question) {
  return getAcceptedAnswers(question)
    .map((answer) => answer
      .map((letter) => `${letter}. ${question.options[letter] || ""}`.trim())
      .join("；"))
    .join(" 或 ");
}

function isLastQuestion() {
  return state.currentIndex === state.activeQuestions.length - 1;
}

function updateRulePreview() {
  const pool = applyCategoryFilter(getBaseQuestionsForScope());
  const preview = buildRulePreview(pool);
  const examLabel = els.examSelect.options[els.examSelect.selectedIndex]?.text || "尚未選擇";
  els.ruleText.textContent = preview;
  els.settingsSummaryText.textContent = `${examLabel}｜${preview}`;
}

function buildRulePreview(pool) {
  const limit = els.limitSelect.value;
  if (limit === "all") {
    return `${pool.length} 題，總分 ${TOTAL_SCORE}，${PASS_SCORE} 分及格；複選題全對才給分。`;
  }
  if (limit !== "rule") {
    return `${Math.min(Number(limit), pool.length)} 題練習，換算 ${TOTAL_SCORE} 分制，${PASS_SCORE} 分及格；複選題全對才給分。`;
  }
  if (els.examSelect.value === SPECIALIST_SCOPE || els.examSelect.value === ALL_SCOPE) {
    const singles = pool.filter((question) => splitAnswer(question.answer).length === 1).length;
    const multis = pool.filter((question) => splitAnswer(question.answer).length > 1).length;
    const picked = Math.min(40, pool.length);
    return `${picked} 題中級模擬，目標 30 單選 + 10 複選；目前可用單選 ${singles}、複選 ${multis}。總分 ${TOTAL_SCORE}，${PASS_SCORE} 分及格。`;
  }
  if (isConceptScope()) {
    return `${Math.min(50, pool.length)} 題概論練習，總分 ${TOTAL_SCORE}，每題 2 分換算，${PASS_SCORE} 分及格。`;
  }
  return `${pool.length} 題歷屆考卷，總分 ${TOTAL_SCORE}，每題 ${formatScore(TOTAL_SCORE / Math.max(pool.length, 1))} 分，${PASS_SCORE} 分及格。`;
}

function isConceptScope() {
  if (els.examSelect.value === ALL_SCOPE) {
    return false;
  }
  const document = state.documents.find((item) => item.file === els.examSelect.value);
  return Boolean(document?.source.isConcept);
}
