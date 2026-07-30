import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const examDirectory = path.join(repositoryRoot, "exam", "json");
const imageDirectory = path.join(repositoryRoot, "exam", "images");
const allowedExtensions = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const maximumImageBytes = 8 * 1024 * 1024;
const referencedImages = new Map();
const errors = [];
let imageReferenceCount = 0;

function addError(message) {
  errors.push(message);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
}

function isInsideDirectory(parentDirectory, childPath) {
  const relativePath = path.relative(parentDirectory, childPath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    relativePath !== ".." &&
    !path.isAbsolute(relativePath)
  );
}

function getImageSignature(filePath) {
  const buffer = Buffer.alloc(24);
  const descriptor = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
}

function hasValidSignature(filePath, extension) {
  const signature = getImageSignature(filePath);
  if (extension === ".png") {
    return signature.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return signature.length >= 3 &&
      signature[0] === 0xff &&
      signature[1] === 0xd8 &&
      signature[2] === 0xff;
  }
  if (extension === ".webp") {
    return signature.subarray(0, 4).toString("ascii") === "RIFF" &&
      signature.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function validateImage(image, reference) {
  if (!image || Array.isArray(image) || typeof image !== "object") {
    addError(`${reference}: image must be an object`);
    return;
  }

  const allowedFields = new Set(["src", "alt", "caption", "source_page"]);
  for (const field of Object.keys(image)) {
    if (!allowedFields.has(field)) {
      addError(`${reference}: unsupported image field '${field}'`);
    }
  }

  const src = typeof image.src === "string" ? image.src.trim() : "";
  const alt = typeof image.alt === "string" ? image.alt.trim() : "";
  if (!src) {
    addError(`${reference}: image.src is required`);
    return;
  }
  if (!alt) {
    addError(`${reference}: image.alt is required`);
  }
  if (
    image.caption !== undefined &&
    (typeof image.caption !== "string" || !image.caption.trim())
  ) {
    addError(`${reference}: image.caption must be a non-empty string`);
  }
  if (
    image.source_page !== undefined &&
    (!Number.isInteger(image.source_page) || image.source_page < 1)
  ) {
    addError(`${reference}: image.source_page must be a positive integer`);
  }

  const sourceSegments = src.split("/");
  if (
    src.includes("\\") ||
    src.includes("%") ||
    src.includes("?") ||
    src.includes("#") ||
    /[\u0000-\u001f\u007f]/u.test(src) ||
    sourceSegments.length < 3 ||
    sourceSegments[0] !== "exam" ||
    sourceSegments[1] !== "images" ||
    sourceSegments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    addError(`${reference}: image.src must be a canonical exam/images/ relative path`);
    return;
  }

  const extension = path.extname(src).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    addError(`${reference}: unsupported image extension '${extension}'`);
    return;
  }

  const absolutePath = path.resolve(repositoryRoot, ...sourceSegments);
  if (!isInsideDirectory(imageDirectory, absolutePath)) {
    addError(`${reference}: image.src escapes exam/images`);
    return;
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    addError(`${reference}: image file does not exist: ${src}`);
    return;
  }
  const fileSize = fs.statSync(absolutePath).size;
  if (fileSize === 0 || fileSize > maximumImageBytes) {
    addError(`${reference}: image must be between 1 byte and 8 MiB: ${src}`);
    return;
  }
  const realPath = fs.realpathSync(absolutePath);
  if (!isInsideDirectory(fs.realpathSync(imageDirectory), realPath)) {
    addError(`${reference}: image file resolves outside exam/images`);
    return;
  }
  if (!hasValidSignature(absolutePath, extension)) {
    addError(`${reference}: image signature does not match '${extension}'`);
    return;
  }
  if (extension === ".png") {
    const signature = getImageSignature(absolutePath);
    const width = signature.readUInt32BE(16);
    const height = signature.readUInt32BE(20);
    if (width < 32 || height < 32 || width > 4096 || height > 4096) {
      addError(
        `${reference}: PNG dimensions must be within 32..4096 pixels; ` +
          `found ${width}x${height}`,
      );
      return;
    }
  }

  const normalizedMetadata = JSON.stringify({
    alt,
    caption: image.caption?.trim() ?? "",
    sourcePage: image.source_page ?? null,
  });
  const previousMetadata = referencedImages.get(src);
  if (previousMetadata && previousMetadata !== normalizedMetadata) {
    addError(`${reference}: shared image metadata conflicts with another reference: ${src}`);
  } else {
    referencedImages.set(src, normalizedMetadata);
  }
  imageReferenceCount += 1;
}

function validateMediaOwner(owner, reference) {
  if (!owner || typeof owner !== "object") {
    return;
  }
  const hasImage = Object.hasOwn(owner, "image");
  const hasImages = Object.hasOwn(owner, "images");
  if (hasImage && hasImages) {
    addError(`${reference}: define either image or images, not both`);
    return;
  }
  if (hasImage) {
    validateImage(owner.image, `${reference}.image`);
  }
  if (hasImages) {
    if (!Array.isArray(owner.images) || owner.images.length === 0) {
      addError(`${reference}.images: must be a non-empty array`);
      return;
    }
    owner.images.forEach((image, index) => {
      validateImage(image, `${reference}.images[${index}]`);
    });
  }
}

function listAssetFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return listAssetFiles(entryPath);
    }
    return [entryPath];
  });
}

for (const fileName of fs.readdirSync(examDirectory).filter((name) => name.endsWith(".json"))) {
  const document = readJson(path.join(examDirectory, fileName));
  const caseGroupMedia = new Map();
  for (const question of document.questions ?? []) {
    const reference = `${fileName}#${question.id}`;
    validateMediaOwner(question, reference);
    validateMediaOwner(question.case_group, `${reference}.case_group`);

    if (question.case_group && typeof question.case_group === "object") {
      const groupId = String(question.case_group.id ?? "");
      const mediaFingerprint = JSON.stringify({
        image: question.case_group.image ?? null,
        images: question.case_group.images ?? null,
      });
      const previousFingerprint = caseGroupMedia.get(groupId);
      if (previousFingerprint !== undefined && previousFingerprint !== mediaFingerprint) {
        addError(`${reference}.case_group: image metadata is inconsistent within '${groupId}'`);
      } else {
        caseGroupMedia.set(groupId, mediaFingerprint);
      }
    }
  }
}

for (const imagePath of listAssetFiles(imageDirectory)) {
  const src = path.relative(repositoryRoot, imagePath).split(path.sep).join("/");
  const extension = path.extname(imagePath).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    addError(`unsupported file in exam/images: ${src}`);
    continue;
  }
  if (!referencedImages.has(src)) {
    addError(`orphan image file is not referenced by any question: ${src}`);
  }
}

if (errors.length > 0) {
  errors.forEach((error) => console.error(`[ERROR] ${error}`));
  console.error(`Image validation failed: ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Image validation passed: ${imageReferenceCount} references, ` +
    `${referencedImages.size} unique assets.`,
);
