export interface ProcessedLogo {
  dataUrl: string;
  width: number;
  height: number;
}

export interface LogoCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

const MAX_OUTPUT_SIZE = 512;
const BG_THRESHOLD = 246;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read image.'));
    };
    img.src = url;
  });
}

function isNearWhite(r: number, g: number, b: number, a: number) {
  return a === 0 || (r >= BG_THRESHOLD && g >= BG_THRESHOLD && b >= BG_THRESHOLD);
}

function contentBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (!isNearWhite(r, g, b, a)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < 0 || maxY < 0) return { x: 0, y: 0, width, height };
  const pad = Math.ceil(Math.max(width, height) * 0.03);
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    width: Math.min(width, maxX - minX + 1 + pad * 2),
    height: Math.min(height, maxY - minY + 1 + pad * 2),
  };
}

function clampCrop(crop: LogoCropArea, width: number, height: number) {
  const cropWidth = Math.max(1, Math.min(width, crop.width));
  const cropHeight = Math.max(1, Math.min(height, crop.height));
  return {
    x: Math.max(0, Math.min(width - cropWidth, crop.x)),
    y: Math.max(0, Math.min(height - cropHeight, crop.y)),
    width: cropWidth,
    height: cropHeight,
  };
}

export async function processLogoFile(file: File, crop?: LogoCropArea): Promise<ProcessedLogo> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const img = await loadImage(file);
  const source = document.createElement('canvas');
  source.width = img.naturalWidth || img.width;
  source.height = img.naturalHeight || img.height;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  if (!sourceCtx) throw new Error('Canvas is not available.');
  sourceCtx.drawImage(img, 0, 0);

  const sourceImage = sourceCtx.getImageData(0, 0, source.width, source.height);
  const bounds = crop ? clampCrop(crop, source.width, source.height) : contentBounds(sourceImage.data, source.width, source.height);

  const output = document.createElement('canvas');
  output.width = MAX_OUTPUT_SIZE;
  output.height = MAX_OUTPUT_SIZE;
  const outCtx = output.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Canvas is not available.');
  outCtx.clearRect(0, 0, output.width, output.height);

  const scale = Math.min((MAX_OUTPUT_SIZE * 0.86) / bounds.width, (MAX_OUTPUT_SIZE * 0.86) / bounds.height);
  const drawW = bounds.width * scale;
  const drawH = bounds.height * scale;
  const dx = (MAX_OUTPUT_SIZE - drawW) / 2;
  const dy = (MAX_OUTPUT_SIZE - drawH) / 2;
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = 'high';
  outCtx.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, dx, dy, drawW, drawH);

  const cleaned = outCtx.getImageData(0, 0, output.width, output.height);
  for (let i = 0; i < cleaned.data.length; i += 4) {
    const r = cleaned.data[i], g = cleaned.data[i + 1], b = cleaned.data[i + 2], a = cleaned.data[i + 3];
    if (isNearWhite(r, g, b, a)) {
      cleaned.data[i + 3] = 0;
    }
  }
  outCtx.putImageData(cleaned, 0, 0);

  return {
    dataUrl: output.toDataURL('image/png'),
    width: MAX_OUTPUT_SIZE,
    height: MAX_OUTPUT_SIZE,
  };
}
