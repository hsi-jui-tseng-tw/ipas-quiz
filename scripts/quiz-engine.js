import { shuffle, splitAnswer } from "./utils.js";
export function pickBalancedExam(pool, singleCount, multiCount, shouldShuffle) {
  const targetCount = singleCount + multiCount;
  const units = buildQuestionUnits(pool);
  const orderedUnits = shouldShuffle ? shuffle(units) : units;
  const selectedUnits = [];
  const selectedKeys = new Set();
  const counts = { single: 0, multi: 0 };

  for (const unit of orderedUnits) {
    if (selectedKeys.has(unit.key)) {
      continue;
    }

    const unitCounts = countQuestionTypes(unit.questions);
    const needsSingle = counts.single < singleCount && unitCounts.single > 0;
    const needsMulti = counts.multi < multiCount && unitCounts.multi > 0;
    const currentTotal = counts.single + counts.multi;

    if ((needsSingle || needsMulti) && currentTotal + unit.questions.length <= targetCount) {
      selectedUnits.push(unit);
      selectedKeys.add(unit.key);
      counts.single += unitCounts.single;
      counts.multi += unitCounts.multi;
    }

    if (counts.single >= singleCount && counts.multi >= multiCount) {
      break;
    }
  }

  if (counts.single + counts.multi < targetCount) {
    for (const unit of orderedUnits) {
      if (!selectedKeys.has(unit.key)) {
        selectedUnits.push(unit);
        selectedKeys.add(unit.key);
        const unitCounts = countQuestionTypes(unit.questions);
        counts.single += unitCounts.single;
        counts.multi += unitCounts.multi;
      }
      if (counts.single + counts.multi >= targetCount) {
        break;
      }
    }
  }

  return selectedUnits.flatMap((unit) => unit.questions);
}

export function pickQuestionSet(pool, targetCount, shouldShuffle) {
  const units = buildQuestionUnits(pool);
  const orderedUnits = shouldShuffle ? shuffle(units) : units;
  const selected = [];
  let total = 0;

  for (const unit of orderedUnits) {
    selected.push(unit);
    total += unit.questions.length;
    if (total >= targetCount) {
      break;
    }
  }

  return selected.flatMap((unit) => unit.questions);
}

export function buildQuestionUnits(questions) {
  const units = [];
  const groupUnits = new Map();

  for (const question of questions) {
    const caseKey = getCaseGroupKey(question);
    if (!caseKey) {
      units.push({
        key: question.id,
        questions: [question]
      });
      continue;
    }

    if (!groupUnits.has(caseKey)) {
      const unit = {
        key: caseKey,
        questions: []
      };
      groupUnits.set(caseKey, unit);
      units.push(unit);
    }

    groupUnits.get(caseKey).questions.push(question);
  }

  for (const unit of units) {
    unit.questions.sort(compareQuestionOrder);
  }

  return units;
}

export function flattenQuestionUnits(units, shouldShuffle) {
  const orderedUnits = shouldShuffle ? shuffle(units) : units;
  return orderedUnits.flatMap((unit) => unit.questions);
}

function getCaseGroupKey(question) {
  if (!question.caseGroup?.id) {
    return "";
  }
  return `${question.source.file}::${question.caseGroup.id}`;
}

function compareQuestionOrder(a, b) {
  return getQuestionNumber(a) - getQuestionNumber(b);
}

function getQuestionNumber(question) {
  if (Number.isFinite(question.order)) {
    return question.order;
  }
  const match = String(question.id).match(/#(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function countQuestionTypes(questions) {
  return questions.reduce((counts, question) => {
    if (splitAnswer(question.answer).length > 1) {
      counts.multi += 1;
    } else {
      counts.single += 1;
    }
    return counts;
  }, { single: 0, multi: 0 });
}
