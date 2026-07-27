export function stripExtension(file) {
  return file.replace(/\.json$/i, "");
}

export function formatScore(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function splitAnswer(answer) {
  return String(answer || "").toUpperCase().replace(/[^A-Z]/g, "").split("").sort();
}

export function normalizeAcceptedAnswers(answers, fallbackAnswer) {
  const rawAnswers = Array.isArray(answers) ? answers : [fallbackAnswer];
  const normalized = rawAnswers
    .map((answer) => splitAnswer(answer))
    .filter((answer) => answer.length);

  if (!normalized.length) {
    return [splitAnswer(fallbackAnswer)];
  }

  return normalized;
}

export function sameLetters(a, b) {
  return a.length === b.length && a.every((letter, index) => letter === b[index]);
}
