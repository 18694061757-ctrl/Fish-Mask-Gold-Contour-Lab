/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fish Catch Recognition (渔见识别) - High-Fidelity Water-Light Aura & Caustics Shader Engine
 * Directly ported from https://github.com/pan277942135/demo--Image-light-effect
 */

export interface FishCatchCausticsConfig {
  sceneId: "fish-catch-recognition";
  displayName: string;
  spreadDurationMs: number; // 1200ms spread
  intensity: number; // 0.85 - 1.80 (glow intensity)
  speed: number; // 1.00 (fluid ripple speed)
  marginRatio: number; // ~0.015 (distance from photo edge)
  glowSize: number; // ~45px - 48px (bloom width)
  goldColor: string; // "#4d9b91" or "#FEF08A"
  cyanColor: string; // "#d89913" or "#38BDF8"
  greenColor: string; // "#719fbc" or "#2DD4BF"
  bottomMaskStrength: number; // 1.0 (bottom-to-top linear gradient mask)
  blendRatio: number; // 0.80 (intertwine blue, green, and golden light)
  causticsDensity: number; // 0.85
  blendMode: string; // "overlay"
}

/**
 * 【渔见实拍照 (默认推荐)】四周光效冻结版效果02 (深湖青与琥珀金调)
 */
export const FROZEN_EFFECT_02_CONFIG: FishCatchCausticsConfig = {
  sceneId: "fish-catch-recognition",
  displayName: "效果02 (默认推荐)",
  spreadDurationMs: 1200,
  intensity: 1.80,
  speed: 1.00,
  marginRatio: 0.015,
  glowSize: 45,
  goldColor: "#4d9b91",
  cyanColor: "#d89913",
  greenColor: "#719fbc",
  bottomMaskStrength: 1.00,
  blendRatio: 0.80,
  causticsDensity: 0.85,
  blendMode: "overlay",
};

/**
 * 【渔见实拍照】四周光效冻结版效果01 (湖天碧蓝与晨曦日光金调)
 */
export const FROZEN_EFFECT_01_CONFIG: FishCatchCausticsConfig = {
  sceneId: "fish-catch-recognition",
  displayName: "效果01 (经典版)",
  spreadDurationMs: 1200,
  intensity: 1.50,
  speed: 1.00,
  marginRatio: 0.015,
  glowSize: 48,
  goldColor: "#FEF08A",
  cyanColor: "#38BDF8",
  greenColor: "#2DD4BF",
  bottomMaskStrength: 1.00,
  blendRatio: 0.75,
  causticsDensity: 0.85,
  blendMode: "overlay",
};

export const DEFAULT_FISH_CATCH_CONFIG: FishCatchCausticsConfig = {
  ...FROZEN_EFFECT_02_CONFIG,
};

export type FishCatchVersion = "EFFECT_02" | "EFFECT_01";
export type DiffusionStatus = "SPREADING" | "STABLE_PLAYING";

export interface FishCatchEngineHandle {
  canvas: HTMLCanvasElement;
  readonly rendererKind: "webgl" | "canvas2d";
  readonly status: DiffusionStatus;
  readonly progress: number;
  readonly isPaused: boolean;
  replay: () => void;
  pause: () => void;
  resume: () => void;
  updateConfig: (next: Partial<FishCatchCausticsConfig>) => void;
  resize: () => void;
  destroy: () => void;
}

export const VERT_SRC = `
attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FISH_CATCH_FRAG_SRC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float u_time;
uniform vec2 u_resolution;
uniform float u_intensity;
uniform float u_spread_progress;
uniform float u_speed;
uniform float u_margin_ratio;
uniform float u_glow_size;
uniform vec3 u_gold_color;
uniform vec3 u_cyan_color;
uniform vec3 u_green_color;
uniform float u_bottom_mask_strength;
uniform float u_blend_ratio;

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
  r.xy = (p.x > 0.0) ? r.xy : r.zw;
  r.x  = (p.y > 0.0) ? r.x  : r.y;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Multi-octave organic water caustics for morning water ripples
float causticOctave(vec2 uv, float t, float fi) {
  vec2 p = rotate(uv, 0.45 + fi * 2.39996);
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    vec2 w = vec2(
      sin(p.y * (1.18 + fi * 0.17 + fk * 0.12) + p.x * (0.24 + fi * 0.08) + t * (0.42 + fi * 0.06) + fi * 1.57 + fk),
      cos(p.x * (0.92 + fi * 0.15 + fk * 0.10) - p.y * (0.31 + fi * 0.08) - t * (0.38 + fi * 0.05) + fi * 1.18)
    );
    p += w * (0.45 / (1.0 + fi * 0.18 + fk * 0.12));
  }
  vec2 d1 = vec2(1.02 + fi * 0.19, 0.35 + fi * 0.11);
  vec2 d2 = vec2(-0.48 - fi * 0.09, 1.12 + fi * 0.07);
  float ridge = sin(dot(p, d1) + t * 0.14) * sin(dot(p, d2) - t * 0.11);
  return 0.17 / (abs(ridge) * 5.4 + 0.22);
}

float causticField(vec2 uv, float t) {
  vec2 p = uv + vec2(
    sin(uv.y * 0.42 + t * 0.24) * 0.38,
    cos(uv.x * 0.36 - t * 0.18) * 0.38
  );
  float a = causticOctave(p, t, 0.0);
  vec2 p2 = rotate(p * 1.618 + vec2(1.72, -1.18), 1.15);
  float b = causticOctave(p2, t * 0.82, 1.0);
  vec2 p3 = rotate(p * 2.54 + vec2(2.31, -0.65), 1.52);
  float c = causticOctave(p3, t * 0.65, 2.0);
  float acc = max(a * 1.15, b * 0.82) + c * 0.38;
  return pow(clamp(acc, 0.0, 2.0), 1.35);
}

// Organic sunlit light spots (晨光水波光斑)
float lightSpotsField(vec2 uv, float t) {
  vec2 p = uv * 3.6;
  vec2 ip = floor(p);
  vec2 fp = fract(p) - 0.5;
  
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cellId = ip + neighbor;
      float h = hash(cellId);
      vec2 offset = vec2(
        sin(t * 1.25 + h * 6.28) * 0.32,
        cos(t * 1.55 + h * 6.28) * 0.32
      );
      vec2 diff = neighbor + offset - fp;
      float dist = length(diff);
      minDist = min(minDist, dist);
    }
  }
  float spot = smoothstep(0.65, 0.08, minDist);
  return pow(spot, 1.8);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 res = u_resolution;
  
  // Normalized UV centered
  vec2 uv = (frag * 2.0 - res) / max(res.y, 1.0);
  
  // Vertical coordinate: 0.0 at bottom, 1.0 at top
  float normY = frag.y / res.y;
  
  // Continuous fluid time (一直流转，不停止)
  float t = u_time * 0.42;

  // Upward revealed mask: As scan moves up, it progressively unlocks and ignites the water light
  // Once u_spread_progress >= 1.0, revealedMask is fully 1.0 everywhere and stays fixed!
  float revealedMask = (u_spread_progress >= 1.0) 
    ? 1.0 
    : smoothstep(normY - 0.14, normY + 0.02, u_spread_progress * 1.08 - 0.04);
  revealedMask = clamp(revealedMask, 0.0, 1.0);

  // 1. 宽幅四周光环 (Four-sided perimeter aura)
  vec2 halfRes = res * 0.5;
  vec2 centeredPos = frag - halfRes;
  float margin = min(res.x, res.y) * u_margin_ratio;
  vec2 boxHalf = halfRes - vec2(margin);
  float cornerR = min(res.x, res.y) * 0.12;
  
  float perimAngle = atan(centeredPos.y, centeredPos.x);
  
  // Organic breathing fluid waves along the four perimeter paths
  float perimWave = sin(perimAngle * 5.0 + t * 2.2) * 4.5 + cos(perimAngle * 9.0 - t * 1.5) * 2.6;
  float dBox = abs(sdRoundedBox(centeredPos, boxHalf, vec4(cornerR)) + perimWave);
  
  // Multi-tier bloom around perimeter
  float effectiveGlow = max(8.0, u_glow_size);
  float wideHalo = exp(-dBox * (0.07 / (effectiveGlow * 0.12))); // Broad exterior ambient halo
  float mediumBloom = exp(-dBox * (0.16 / (effectiveGlow * 0.10))); // Mid-layer radiant bloom
  float sharpCore = smoothstep(2.8, 0.3, dBox); // Brilliant crest filament
  
  float perimeterAura = (wideHalo * 0.35 + mediumBloom * 0.65 + sharpCore * 0.95) * revealedMask;
  
  // Perimeter chromatic gradient: intertwining pale-gold, sky cyan, and gentle green
  float filamentAngleT = (perimAngle + 3.14159) / 6.28318;
  float filamentGoldBias = smoothstep(0.18, 0.82, sin(filamentAngleT * 3.14159 + 0.7));
  vec3 perimeterColor = mix(u_cyan_color, u_gold_color, filamentGoldBias);
  perimeterColor = mix(perimeterColor, u_green_color, sin(filamentAngleT * 6.28 + t * 0.5) * 0.2 + 0.2);

  // 2. 底部向上的自然水面微风焦散与晨光光斑 (Bottom Caustics & Sunlit Bokeh - 完整保留)
  float bottomGrad = pow(clamp(1.0 - normY * 0.85, 0.0, 1.0), 1.5);
  float causticsMask = mix(0.04, 1.0, bottomGrad * u_bottom_mask_strength) * revealedMask;
  
  float cVal = causticField(uv * 1.85, t);
  float veins = smoothstep(0.16, 1.10, cVal);
  float haze = smoothstep(0.03, 0.78, cVal) * 0.35;
  float causticGlow = veins * 0.92 + haze;
  
  // Shimmering morning sunlight bokeh spots
  float spots = lightSpotsField(uv * 1.25, t * 0.85);
  float waterLight = causticGlow * 0.88 + spots * 0.95;
  
  // Bottom caustics color: delicate intertwining of blue, green, and sunlight gold
  float colorFlow = sin(uv.x * 2.2 + uv.y * 1.5 + t * 0.75) * 0.5 + 0.5;
  vec3 waterSpectrum = mix(u_cyan_color, u_green_color, clamp(colorFlow * 0.85 + 0.1, 0.0, 1.0));
  float sunCatch = smoothstep(0.28, 0.88, waterLight * 0.55 + colorFlow * 0.45);
  vec3 bottomCausticColor = mix(waterSpectrum, u_gold_color, clamp(sunCatch * u_blend_ratio, 0.0, 1.0));

  // 3. 组合与混合 (注意：完全去掉了中间那条白横光 scanBeam，其他所有焦散与混合完全恢复原始参数！)
  float bottomContrib = waterLight * causticsMask * 0.68;
  float perimContrib = perimeterAura * 0.86;
  
  float totalLight = (bottomContrib + perimContrib) * u_intensity;
  float finalAlpha = clamp(totalLight, 0.0, 0.96);
  
  // Chromatic composition
  float totalWeight = max(0.001, bottomContrib + perimContrib);
  vec3 finalRgb = (bottomCausticColor * bottomContrib + perimeterColor * perimContrib) / totalWeight;
  
  // Natural sunlit specular sparkle core (轻柔高光)
  float coreSpark = smoothstep(0.85, 1.75, totalLight);
  finalRgb = mix(finalRgb, vec3(0.99, 0.99, 0.96), coreSpark * 0.48);
  finalRgb *= (1.0 + coreSpark * 0.3);
  
  gl_FragColor = vec4(finalRgb, finalAlpha);
}
`;

interface Point {
  x: number;
  y: number;
  nx: number;
  ny: number;
  tParam: number;
}

let parseCanvas: HTMLCanvasElement | null = null;
function parseCssColor(color: string): [number, number, number] {
  if (!parseCanvas) {
    parseCanvas = document.createElement("canvas");
    parseCanvas.width = 1;
    parseCanvas.height = 1;
  }
  const ctx = parseCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return [1, 1, 1];
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255];
}

function toRgba(hexOrCss: string, alpha: number): string {
  if (hexOrCss.startsWith("#")) {
    let hex = hexOrCss.slice(1);
    if (hex.length === 3) {
      hex = hex.split("").map((c) => c + c).join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
  }
  return hexOrCss;
}

function generatePerimeterPath(
  width: number,
  height: number,
  margin: number,
  cornerR: number,
  subdivisions: number = 260
): Point[] {
  const left = margin;
  const right = width - margin;
  const top = margin;
  const bottom = height - margin;
  const r = Math.min(cornerR, (right - left) / 2, (bottom - top) / 2);

  const straightW = right - left - 2 * r;
  const straightH = bottom - top - 2 * r;
  const cornerArc = (Math.PI / 2) * r;
  const totalPerimeter = 2 * straightW + 2 * straightH + 4 * cornerArc;

  const points: Point[] = [];

  for (let i = 0; i < subdivisions; i++) {
    const s = (i / subdivisions) * totalPerimeter;
    let x = 0;
    let y = 0;
    let nx = 0;
    let ny = 0;

    const len1 = straightW / 2;
    const len2 = len1 + cornerArc;
    const len3 = len2 + straightH;
    const len4 = len3 + cornerArc;
    const len5 = len4 + straightW;
    const len6 = len5 + cornerArc;
    const len7 = len6 + straightH;
    const len8 = len7 + cornerArc;

    if (s < len1) {
      x = left + r + straightW / 2 + s;
      y = bottom;
      nx = 0;
      ny = 1;
    } else if (s < len2) {
      const arcDist = s - len1;
      const angle = (arcDist / cornerArc) * (Math.PI / 2);
      const cx = right - r;
      const cy = bottom - r;
      x = cx + Math.sin(angle) * r;
      y = cy + Math.cos(angle) * r;
      nx = Math.sin(angle);
      ny = Math.cos(angle);
    } else if (s < len3) {
      const dist = s - len2;
      x = right;
      y = bottom - r - dist;
      nx = 1;
      ny = 0;
    } else if (s < len4) {
      const arcDist = s - len3;
      const angle = (arcDist / cornerArc) * (Math.PI / 2);
      const cx = right - r;
      const cy = top + r;
      x = cx + Math.cos(angle) * r;
      y = cy - Math.sin(angle) * r;
      nx = Math.cos(angle);
      ny = -Math.sin(angle);
    } else if (s < len5) {
      const dist = s - len4;
      x = right - r - dist;
      y = top;
      nx = 0;
      ny = -1;
    } else if (s < len6) {
      const arcDist = s - len5;
      const angle = (arcDist / cornerArc) * (Math.PI / 2);
      const cx = left + r;
      const cy = top + r;
      x = cx - Math.sin(angle) * r;
      y = cy - Math.cos(angle) * r;
      nx = -Math.sin(angle);
      ny = -Math.cos(angle);
    } else if (s < len7) {
      const dist = s - len6;
      x = left;
      y = top + r + dist;
      nx = -1;
      ny = 0;
    } else if (s < len8) {
      const arcDist = s - len7;
      const angle = (arcDist / cornerArc) * (Math.PI / 2);
      const cx = left + r;
      const cy = bottom - r;
      x = cx - Math.sin(angle) * r;
      y = cy + Math.cos(angle) * r;
      nx = -Math.sin(angle);
      ny = Math.sin(angle);
    } else {
      const dist = s - len8;
      x = left + r + dist;
      y = bottom;
      nx = 0;
      ny = 1;
    }

    points.push({
      x,
      y,
      nx,
      ny,
      tParam: i / subdivisions,
    });
  }

  return points;
}

export function createFishCatchOverlay(
  container: HTMLElement,
  initialConfig: Partial<FishCatchCausticsConfig> = {},
  onStatusChange?: (status: DiffusionStatus, progress: number) => void
): FishCatchEngineHandle {
  let config: FishCatchCausticsConfig = {
    ...DEFAULT_FISH_CATCH_CONFIG,
    ...initialConfig,
  };

  // Primary Shader Canvas
  const shaderCanvas = document.createElement("canvas");
  shaderCanvas.setAttribute("aria-hidden", "true");
  shaderCanvas.dataset.waterCaustics = "webgl";
  shaderCanvas.dataset.waterCausticsScene = "fish-catch-recognition";
  Object.assign(shaderCanvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
    mixBlendMode: config.blendMode || "overlay",
    zIndex: "14",
  });

  // Secondary Accents 2D Canvas (Sparkle nodes and bottom flourishes matching user reference photo)
  const accentCanvas = document.createElement("canvas");
  accentCanvas.setAttribute("aria-hidden", "true");
  Object.assign(accentCanvas.style, {
    position: "absolute",
    inset: "0",
    width: "100%",
    height: "100%",
    display: "block",
    pointerEvents: "none",
    mixBlendMode: config.blendMode || "overlay",
    zIndex: "15",
  });

  container.appendChild(shaderCanvas);
  container.appendChild(accentCanvas);

  const accentCtx = accentCanvas.getContext("2d", { alpha: true });

  let status: DiffusionStatus = "SPREADING";
  let progress = 0;
  let startTime = performance.now();
  let pausedAtTime = 0;
  let isPaused = false;
  let rafId = 0;
  let isDestroyed = false;
  let lastW = 0;
  let lastH = 0;
  let cachedPerimeter: Point[] = [];

  // Sparkle Nodes along perimeter
  const SPARKLE_COUNT = 16;
  const sparkles = Array.from({ length: SPARKLE_COUNT }, (_, idx) => ({
    id: idx,
    baseParam: idx / SPARKLE_COUNT,
    speed: 0.012 + (idx % 3) * 0.007,
    size: 2.2 + (idx % 4) * 0.7,
    phase: Math.random() * Math.PI * 2,
  }));

  // Setup WebGL Shader
  const gl = (shaderCanvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
  }) || shaderCanvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;

  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let rendererKind: "webgl" | "canvas2d" = "webgl";

  if (gl) {
    try {
      const vert = gl.createShader(gl.VERTEX_SHADER)!;
      gl.shaderSource(vert, VERT_SRC);
      gl.compileShader(vert);

      const frag = gl.createShader(gl.FRAGMENT_SHADER)!;
      gl.shaderSource(frag, FISH_CATCH_FRAG_SRC);
      gl.compileShader(frag);

      program = gl.createProgram()!;
      gl.attachShader(program, vert);
      gl.attachShader(program, frag);
      gl.linkProgram(program);

      buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 3, -1, -1, 3]),
        gl.STATIC_DRAW
      );

      const loc = gl.getAttribLocation(program, "a_pos");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
    } catch (err) {
      console.warn("WebGL initialization for FishCatch failed, falling back to 2D:", err);
      rendererKind = "canvas2d";
    }
  } else {
    rendererKind = "canvas2d";
  }

  // Uniform locations cache
  let uTime: WebGLUniformLocation | null = null;
  let uResolution: WebGLUniformLocation | null = null;
  let uIntensity: WebGLUniformLocation | null = null;
  let uSpreadProgress: WebGLUniformLocation | null = null;
  let uSpeed: WebGLUniformLocation | null = null;
  let uMarginRatio: WebGLUniformLocation | null = null;
  let uGlowSize: WebGLUniformLocation | null = null;
  let uGoldColor: WebGLUniformLocation | null = null;
  let uCyanColor: WebGLUniformLocation | null = null;
  let uGreenColor: WebGLUniformLocation | null = null;
  let uBottomMaskStrength: WebGLUniformLocation | null = null;
  let uBlendRatio: WebGLUniformLocation | null = null;

  if (gl && program) {
    uTime = gl.getUniformLocation(program, "u_time");
    uResolution = gl.getUniformLocation(program, "u_resolution");
    uIntensity = gl.getUniformLocation(program, "u_intensity");
    uSpreadProgress = gl.getUniformLocation(program, "u_spread_progress");
    uSpeed = gl.getUniformLocation(program, "u_speed");
    uMarginRatio = gl.getUniformLocation(program, "u_margin_ratio");
    uGlowSize = gl.getUniformLocation(program, "u_glow_size");
    uGoldColor = gl.getUniformLocation(program, "u_gold_color");
    uCyanColor = gl.getUniformLocation(program, "u_cyan_color");
    uGreenColor = gl.getUniformLocation(program, "u_green_color");
    uBottomMaskStrength = gl.getUniformLocation(program, "u_bottom_mask_strength");
    uBlendRatio = gl.getUniformLocation(program, "u_blend_ratio");
  }

  const resize = () => {
    if (isDestroyed) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width));
    const cssH = Math.max(1, Math.round(rect.height));

    const pixelW = cssW * dpr;
    const pixelH = cssH * dpr;

    if (shaderCanvas.width !== pixelW || shaderCanvas.height !== pixelH) {
      shaderCanvas.width = pixelW;
      shaderCanvas.height = pixelH;
    }
    if (accentCanvas.width !== pixelW || accentCanvas.height !== pixelH) {
      accentCanvas.width = pixelW;
      accentCanvas.height = pixelH;
    }
    if (gl) {
      gl.viewport(0, 0, pixelW, pixelH);
    }

    if (cssW !== lastW || cssH !== lastH) {
      lastW = cssW;
      lastH = cssH;
      const margin = Math.min(cssW, cssH) * config.marginRatio;
      const cornerR = Math.min(cssW, cssH) * 0.12;
      cachedPerimeter = generatePerimeterPath(cssW, cssH, margin, cornerR, 280);
    }
  };

  const renderAccents = (timeSec: number, activeCoverage: number) => {
    if (!accentCtx || isDestroyed || cachedPerimeter.length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = lastW;
    const h = lastH;

    accentCtx.save();
    accentCtx.scale(dpr, dpr);
    accentCtx.clearRect(0, 0, w, h);

    if (activeCoverage <= 0.05) {
      accentCtx.restore();
      return;
    }

    const rightBranchEnd = 0.5 * activeCoverage;
    const leftBranchStart = 1.0 - 0.5 * activeCoverage;

    // 1. Shimmering water sparkle dew nodes along perimeter
    accentCtx.globalCompositeOperation = "screen";
    for (let i = 0; i < sparkles.length; i++) {
      const sp = sparkles[i];
      const pPos = (sp.baseParam + timeSec * sp.speed) % 1.0;
      const isRightActive = pPos <= rightBranchEnd;
      const isLeftActive = pPos >= leftBranchStart;
      if (!isRightActive && !isLeftActive) continue;

      const idx = Math.min(
        cachedPerimeter.length - 1,
        Math.max(0, Math.round(pPos * cachedPerimeter.length))
      );
      const pt = cachedPerimeter[idx];
      const pulse = 0.65 + 0.35 * Math.sin(timeSec * 3.4 + sp.phase);
      const isGold = pPos > 0.45;
      const pColor = isGold ? "#fef08a" : "#e0f2fe";
      const pGlow = isGold ? config.goldColor : config.cyanColor;

      // Soft halo
      accentCtx.beginPath();
      accentCtx.arc(pt.x, pt.y, sp.size * 3.2 * pulse, 0, Math.PI * 2);
      accentCtx.fillStyle = toRgba(pGlow, 0.42 * pulse * config.intensity);
      accentCtx.fill();

      // Sharp core
      accentCtx.beginPath();
      accentCtx.arc(pt.x, pt.y, sp.size * 1.15 * pulse, 0, Math.PI * 2);
      accentCtx.fillStyle = pColor;
      accentCtx.globalAlpha = 0.92 * pulse * config.intensity;
      accentCtx.fill();
    }

    // 2. Delicate bottom center flourishing motif (matching user reference design)
    const bottomMid = cachedPerimeter[0];
    if (bottomMid && activeCoverage > 0.15) {
      const bPulse = 0.75 + 0.25 * Math.sin(timeSec * 2.4);

      // Core center glowing point
      accentCtx.beginPath();
      accentCtx.arc(bottomMid.x, bottomMid.y, 3.0 * bPulse, 0, Math.PI * 2);
      accentCtx.fillStyle = "#ffffff";
      accentCtx.shadowColor = config.goldColor;
      accentCtx.shadowBlur = 8;
      accentCtx.globalAlpha = 0.95 * config.intensity;
      accentCtx.fill();

      // Water line wings (~ · ~)
      accentCtx.beginPath();
      accentCtx.moveTo(bottomMid.x - 38, bottomMid.y);
      accentCtx.quadraticCurveTo(bottomMid.x - 19, bottomMid.y - 2.2, bottomMid.x - 6, bottomMid.y);
      accentCtx.moveTo(bottomMid.x + 6, bottomMid.y);
      accentCtx.quadraticCurveTo(bottomMid.x + 19, bottomMid.y + 2.2, bottomMid.x + 38, bottomMid.y);
      accentCtx.strokeStyle = toRgba(config.goldColor, 0.65 * config.intensity);
      accentCtx.lineWidth = 1.3;
      accentCtx.stroke();

      // Wing tip pearls
      accentCtx.beginPath();
      accentCtx.arc(bottomMid.x - 38, bottomMid.y, 1.4, 0, Math.PI * 2);
      accentCtx.arc(bottomMid.x + 38, bottomMid.y, 1.4, 0, Math.PI * 2);
      accentCtx.fillStyle = "#ffffff";
      accentCtx.shadowColor = config.goldColor;
      accentCtx.shadowBlur = 4;
      accentCtx.fill();
    }

    accentCtx.restore();
  };

  const render = (timeSec: number, spreadProgress: number) => {
    if (isDestroyed) return;

    const goldRgb = parseCssColor(config.goldColor);
    const cyanRgb = parseCssColor(config.cyanColor);
    const greenRgb = parseCssColor(config.greenColor);

    // 1. Render WebGL Shader
    if (gl && program) {
      gl.useProgram(program);
      gl.uniform1f(uTime, timeSec);
      gl.uniform2f(uResolution, shaderCanvas.width, shaderCanvas.height);
      gl.uniform1f(uIntensity, config.intensity);
      gl.uniform1f(uSpreadProgress, spreadProgress);
      gl.uniform1f(uSpeed, config.speed);
      gl.uniform1f(uMarginRatio, config.marginRatio);
      gl.uniform1f(uGlowSize, config.glowSize);
      gl.uniform3f(uGoldColor, goldRgb[0], goldRgb[1], goldRgb[2]);
      gl.uniform3f(uCyanColor, cyanRgb[0], cyanRgb[1], cyanRgb[2]);
      gl.uniform3f(uGreenColor, greenRgb[0], greenRgb[1], greenRgb[2]);
      gl.uniform1f(uBottomMaskStrength, config.bottomMaskStrength);
      gl.uniform1f(uBlendRatio, config.blendRatio);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // 2. Render Secondary Accents & Sparkles
    renderAccents(timeSec, spreadProgress);
  };

  const loop = (now: number) => {
    if (isDestroyed || isPaused) return;

    const elapsed = now - startTime;
    const timeSec = elapsed * 0.001 * config.speed;

    if (elapsed < config.spreadDurationMs) {
      status = "SPREADING";
      progress = elapsed / config.spreadDurationMs;
      onStatusChange?.(status, progress);
      render(timeSec, progress);
    } else {
      status = "STABLE_PLAYING";
      progress = 1.0;
      onStatusChange?.(status, 1.0);
      render(timeSec, 1.0);
    }

    rafId = requestAnimationFrame(loop);
  };

  const replay = () => {
    if (isDestroyed) return;
    cancelAnimationFrame(rafId);
    startTime = performance.now();
    status = "SPREADING";
    progress = 0;
    isPaused = false;
    onStatusChange?.(status, 0);
    resize();
    rafId = requestAnimationFrame(loop);
  };

  const pause = () => {
    if (isPaused || isDestroyed) return;
    isPaused = true;
    pausedAtTime = performance.now();
    cancelAnimationFrame(rafId);
  };

  const resume = () => {
    if (!isPaused || isDestroyed) return;
    isPaused = false;
    startTime += performance.now() - pausedAtTime;
    rafId = requestAnimationFrame(loop);
  };

  // Mount
  resize();
  startTime = performance.now();
  rafId = requestAnimationFrame(loop);

  const observer = new ResizeObserver(() => {
    if (isDestroyed) return;
    resize();
  });
  observer.observe(container);

  return {
    canvas: shaderCanvas,
    get rendererKind() {
      return rendererKind;
    },
    get status() {
      return status;
    },
    get progress() {
      return progress;
    },
    get isPaused() {
      return isPaused;
    },
    replay,
    pause,
    resume,
    updateConfig(next: Partial<FishCatchCausticsConfig>) {
      if (isDestroyed) return;
      config = { ...config, ...next };
      if (next.blendMode) {
        shaderCanvas.style.mixBlendMode = config.blendMode;
        accentCanvas.style.mixBlendMode = config.blendMode;
      }
    },
    resize,
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      cancelAnimationFrame(rafId);
      observer.disconnect();
      if (gl) {
        if (buffer) gl.deleteBuffer(buffer);
        if (program) gl.deleteProgram(program);
      }
      shaderCanvas.remove();
      accentCanvas.remove();
    },
  };
}
