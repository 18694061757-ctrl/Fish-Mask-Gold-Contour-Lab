/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContourData, ContourPoint } from '../types';

export interface ConnectedComponentResult {
  cleanMask: Uint8Array;
  pixelCount: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  startX: number;
  startY: number;
}

/**
 * Extracts the Largest Connected Component (LCC) from a binary mask using fast BFS flood fill.
 * Removes floating noise, gripper artifacts, and stray hand pixels so the true fish body is cleanly isolated.
 */
export function getLargestConnectedComponent(
  mask: Uint8Array,
  width: number,
  height: number
): ConnectedComponentResult {
  const total = width * height;
  const visited = new Uint8Array(total);

  let maxCount = 0;
  let bestCompPixels: number[] = [];
  let bestMinX = width, bestMinY = height, bestMaxX = 0, bestMaxY = 0;
  let bestStartX = -1, bestStartY = -1;

  // Queue allocated once for BFS traversal
  const queue = new Int32Array(total);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const idx = rowOffset + x;
      if (mask[idx] <= 127 || visited[idx]) {
        continue;
      }

      // Start new BFS component
      let head = 0;
      let tail = 0;
      queue[tail++] = idx;
      visited[idx] = 1;

      const compIndices: number[] = [];
      let minX = x, maxX = x, minY = y, maxY = y;
      let compStartX = x, compStartY = y;

      while (head < tail) {
        const curr = queue[head++];
        compIndices.push(curr);

        const cx = curr % width;
        const cy = (curr / width) | 0;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 4-connected neighbors
        // West
        if (cx > 0) {
          const n = curr - 1;
          if (mask[n] > 127 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        // East
        if (cx < width - 1) {
          const n = curr + 1;
          if (mask[n] > 127 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        // North
        if (cy > 0) {
          const n = curr - width;
          if (mask[n] > 127 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
        // South
        if (cy < height - 1) {
          const n = curr + width;
          if (mask[n] > 127 && !visited[n]) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      if (compIndices.length > maxCount) {
        maxCount = compIndices.length;
        bestCompPixels = compIndices;
        bestMinX = minX;
        bestMinY = minY;
        bestMaxX = maxX;
        bestMaxY = maxY;
        bestStartX = compStartX;
        bestStartY = compStartY;
      }
    }
  }

  // Create clean isolated binary mask containing ONLY the primary connected component
  const cleanMask = new Uint8Array(total);
  if (maxCount > 0) {
    for (let i = 0; i < bestCompPixels.length; i++) {
      cleanMask[bestCompPixels[i]] = 255;
    }
  }

  return {
    cleanMask,
    pixelCount: maxCount,
    bbox: maxCount > 0 ? [bestMinX, bestMinY, bestMaxX, bestMaxY] : [0, 0, 0, 0],
    startX: bestStartX,
    startY: bestStartY,
  };
}

/**
 * Moore-Neighbor Tracing Algorithm to extract the exterior perimeter of the primary fish mask component.
 */
export function extractBoundaryPoints(
  mask: Uint8Array,
  width: number,
  height: number,
  startHintX: number = -1,
  startHintY: number = -1
): ContourPoint[] {
  // 1. Find start pixel belonging to the mask
  let startX = startHintX;
  let startY = startHintY;

  if (
    startX < 0 ||
    startY < 0 ||
    startX >= width ||
    startY >= height ||
    mask[startY * width + startX] <= 127
  ) {
    startX = -1;
    startY = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (mask[y * width + x] > 127) {
          startX = x;
          startY = y;
          break;
        }
      }
      if (startX !== -1) break;
    }
  }

  if (startX === -1) {
    return [];
  }

  // 8-neighborhood offsets in clockwise order:
  // 0: N (-1, 0), 1: NE (-1, 1), 2: E (0, 1), 3: SE (1, 1),
  // 4: S (1, 0), 5: SW (1, -1), 6: W (0, -1), 7: NW (-1, -1)
  const dx = [0, 1, 1, 1, 0, -1, -1, -1];
  const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

  const boundary: ContourPoint[] = [];
  let currX = startX;
  let currY = startY;

  // We came into start pixel from the West (dx=-1, dy=0 which is direction 6).
  // Backtrack direction starts from 6.
  let backtrackDir = 6;

  boundary.push({ x: currX, y: currY });

  const maxSteps = width * height;
  let steps = 0;

  while (steps < maxSteps) {
    steps++;

    // Find the next boundary pixel by scanning clockwise starting from backtrack direction + 1
    let nextX = -1;
    let nextY = -1;
    let nextDir = -1;

    for (let i = 0; i < 8; i++) {
      const dir = (backtrackDir + 1 + i) % 8;
      const nx = currX + dx[dir];
      const ny = currY + dy[dir];

      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        if (mask[ny * width + nx] > 127) {
          nextX = nx;
          nextY = ny;
          nextDir = dir;
          break;
        }
      }
    }

    if (nextX === -1) {
      // Isolated single pixel
      break;
    }

    // Check if we looped back to the start pixel
    if (nextX === startX && nextY === startY && boundary.length > 2) {
      break;
    }

    boundary.push({ x: nextX, y: nextY });
    currX = nextX;
    currY = nextY;

    // The backtrack direction is opposite of entry: (nextDir + 4) % 8
    backtrackDir = (nextDir + 4) % 8;
  }

  return boundary;
}

/**
 * Perpendicular distance from point p to line segment (a, b)
 */
function perpendicularDistance(
  p: ContourPoint,
  a: ContourPoint,
  b: ContourPoint
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const mag = Math.hypot(dx, dy);

  if (mag === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }

  const u = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (mag * mag);
  // clamped or raw perpendicular
  const ix = a.x + u * dx;
  const iy = a.y + u * dy;
  return Math.hypot(p.x - ix, p.y - iy);
}

/**
 * Ramer-Douglas-Peucker (RDP) algorithm for line simplification
 */
export function simplifyContourRDP(
  points: ContourPoint[],
  epsilon: number = 1.5
): ContourPoint[] {
  if (points.length <= 3) return points;

  let maxDist = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyContourRDP(points.slice(0, index + 1), epsilon);
    const right = simplifyContourRDP(points.slice(index), epsilon);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Closed cyclic weighted smoothing filter (Laplacian / moving average)
 * Smooths discrete jagged stair-step pixel edges into silky sub-pixel floating coordinates.
 * P'_i = 0.20 * P_{i-1} + 0.60 * P_i + 0.20 * P_{i+1}
 */
export function smoothClosedContour(
  points: ContourPoint[],
  passes: number = 3
): ContourPoint[] {
  if (points.length < 4 || passes <= 0) return points;
  let curr = points;
  for (let p = 0; p < passes; p++) {
    const next: ContourPoint[] = [];
    const n = curr.length;
    for (let i = 0; i < n; i++) {
      const prev = curr[(i - 1 + n) % n];
      const self = curr[i];
      const nxt = curr[(i + 1) % n];
      next.push({
        x: 0.20 * prev.x + 0.60 * self.x + 0.20 * nxt.x,
        y: 0.20 * prev.y + 0.60 * self.y + 0.20 * nxt.y,
      });
    }
    curr = next;
  }
  return curr;
}

/**
 * Converts simplified polygon points into a smooth, closed SVG path with natural organic curvature.
 */
export function pointsToSvgPath(points: ContourPoint[]): {
  svgPath: string;
  totalLength: number;
} {
  if (points.length === 0) {
    return { svgPath: '', totalLength: 0 };
  }

  if (points.length < 3) {
    let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
    }
    return { svgPath: path, totalLength: 100 };
  }

  // Smooth closed curve using Catmull-Rom to Cubic Bezier conversion
  const n = points.length;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  let approxLength = 0;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    // Catmull-Rom to Bezier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;

    // Approximate chord distance
    approxLength += Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }

  path += ' Z';

  return {
    svgPath: path,
    totalLength: Math.max(1, approxLength),
  };
}

/**
 * Extracts natural specular highlight glints inside the fish mask.
 * Samples the original image within the binary mask, finds the top 5%–10% brightest pixels
 * (natural fish scale specular reflection / wet mucus gloss), and generates a feather-blurred
 * offscreen canvas data URL colored #F0DCA5.
 */
export function extractInternalGlintMask(
  imageSource: CanvasImageSource,
  cleanMask: Uint8Array,
  width: number,
  height: number,
  targetCoverage: number = 0.08
): string | null {
  if (typeof document === 'undefined') return null;

  try {
    // Downscale slightly for smooth sampling & instant performance (< 10ms)
    const maxDim = 800;
    const scale = Math.min(1.0, maxDim / Math.max(width, height));
    const sw = Math.max(1, Math.round(width * scale));
    const sh = Math.max(1, Math.round(height * scale));

    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sctx) return null;

    sctx.drawImage(imageSource, 0, 0, sw, sh);
    const imgData = sctx.getImageData(0, 0, sw, sh);
    const rgb = imgData.data;

    // Resample mask into sw x sh and collect luminance histogram
    const maskSample = new Uint8Array(sw * sh);
    let maskCount = 0;
    const lumHistogram = new Int32Array(256);

    for (let sy = 0; sy < sh; sy++) {
      const origY = Math.min(height - 1, Math.floor(sy / scale));
      const rowOffset = sy * sw;
      for (let sx = 0; sx < sw; sx++) {
        const origX = Math.min(width - 1, Math.floor(sx / scale));
        const origIdx = origY * width + origX;
        if (cleanMask[origIdx] > 127) {
          const sIdx = rowOffset + sx;
          maskSample[sIdx] = 255;
          maskCount++;

          const pIdx = sIdx * 4;
          const r = rgb[pIdx];
          const g = rgb[pIdx + 1];
          const b = rgb[pIdx + 2];
          // Rec. 601 luminance
          const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          lumHistogram[lum]++;
        }
      }
    }

    if (maskCount < 50) return null;

    // Select threshold for top 7%–8% brightest fish pixels (strictly between 5% and 10%)
    const targetCount = Math.round(maskCount * Math.max(0.05, Math.min(0.10, targetCoverage)));
    let accumulated = 0;
    let threshold = 210;
    for (let l = 255; l >= 0; l--) {
      accumulated += lumHistogram[l];
      if (accumulated >= targetCount) {
        threshold = l;
        break;
      }
    }
    threshold = Math.max(110, threshold);

    // Create glint layer
    const glintCanvas = document.createElement('canvas');
    glintCanvas.width = sw;
    glintCanvas.height = sh;
    const gctx = glintCanvas.getContext('2d');
    if (!gctx) return null;

    const glintImgData = gctx.createImageData(sw, sh);
    const gData = glintImgData.data;

    // Color: #F0DCA5 (R: 240, G: 220, B: 165)
    for (let i = 0; i < sw * sh; i++) {
      if (maskSample[i] > 127) {
        const pIdx = i * 4;
        const lum = Math.round(
          0.299 * rgb[pIdx] + 0.587 * rgb[pIdx + 1] + 0.114 * rgb[pIdx + 2]
        );
        if (lum >= threshold) {
          const range = Math.max(1, 255 - threshold);
          const strength = (lum - threshold) / range;
          const alphaByte = Math.round(Math.min(255, Math.max(0, strength * 255)));

          gData[pIdx] = 240;     // #F0DCA5
          gData[pIdx + 1] = 220;
          gData[pIdx + 2] = 165;
          gData[pIdx + 3] = alphaByte;
        }
      }
    }

    gctx.putImageData(glintImgData, 0, 0);

    // Feather blur 2.5 CSS px
    const featherCanvas = document.createElement('canvas');
    featherCanvas.width = width;
    featherCanvas.height = height;
    const fctx = featherCanvas.getContext('2d');
    if (!fctx) return null;

    fctx.filter = 'blur(3px)';
    fctx.drawImage(glintCanvas, 0, 0, width, height);

    return featherCanvas.toDataURL('image/png');
  } catch (err) {
    console.warn('Glint extraction failed:', err);
    return null;
  }
}

/**
 * Main entrance to extract real gold contour data from a binary SAM mask
 */
export function extractContourFromMask(
  mask: Uint8Array,
  width: number,
  height: number,
  simplificationTolerance: number = 1.5,
  imageSource?: CanvasImageSource | null,
  smoothingPasses: number = 3
): ContourData | null {
  const startTime = performance.now();

  // Clean mask by retaining ONLY the largest connected component (removes gripper & hand noise)
  const lcc = getLargestConnectedComponent(mask, width, height);
  if (lcc.pixelCount < 60) {
    return null;
  }

  const rawPoints = extractBoundaryPoints(
    lcc.cleanMask,
    width,
    height,
    lcc.startX,
    lcc.startY
  );

  if (rawPoints.length < 3) {
    return null;
  }

  // 1. First pass: Apply cyclic weighted filter on raw staircase pixels to remove 90-degree aliasing
  const smoothedRaw = smoothClosedContour(
    rawPoints,
    Math.min(5, Math.max(1, smoothingPasses))
  );

  // 2. RDP simplification on smoothed floating-point boundary
  const simplified = simplifyContourRDP(smoothedRaw, simplificationTolerance);

  // 3. Second pass: Refine curvature on polygon vertices
  const finalSmoothed = smoothClosedContour(
    simplified,
    Math.max(1, Math.min(3, Math.ceil(smoothingPasses / 2)))
  );

  const { svgPath, totalLength } = pointsToSvgPath(finalSmoothed);

  // Extract internal natural glint highlight from valid fish image source
  let internalGlintUrl: string | null = null;
  if (imageSource) {
    internalGlintUrl = extractInternalGlintMask(
      imageSource,
      lcc.cleanMask,
      width,
      height,
      0.08
    );
  }

  const endTime = performance.now();

  return {
    points: rawPoints,
    simplifiedPoints: finalSmoothed,
    svgPath,
    totalLength,
    rawPointCount: rawPoints.length,
    simplifiedPointCount: finalSmoothed.length,
    extractionTimeMs: Math.round(endTime - startTime),
    internalGlintUrl,
  };
}
