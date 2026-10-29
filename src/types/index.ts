/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ModelStatus = 'NOT_LOADED' | 'LOADING' | 'READY' | 'INFERENCE_RUNNING' | 'ERROR';

export type BackendDevice = 'webgpu' | 'wasm';

export interface PromptPoint {
  id: string;
  x: number; // in original image pixel coordinates
  y: number; // in original image pixel coordinates
  label: 1 | 0; // 1 = positive (include), 0 = negative (exclude)
}

export interface CandidateMask {
  index: number;
  iouScore: number;
  data: Uint8Array; // 0 or 255 binary mask
  pixelCount: number;
  areaRatio: number;
  bbox: [number, number, number, number]; // [minX, minY, maxX, maxY]
  isTrustworthy?: boolean;
}

export interface MaskResult {
  width: number;
  height: number;
  selectedCandidateIndex: number;
  candidates: CandidateMask[];
  inferenceTimeMs: number;
  timestamp: string;
  isMaskTrustworthy?: boolean;
  isBboxTrustworthy?: boolean;
  isFallbackActive?: boolean;
  fallbackReason?: string;
}

export interface ContourPoint {
  x: number;
  y: number;
}

export interface ContourData {
  points: ContourPoint[];
  simplifiedPoints: ContourPoint[];
  svgPath: string;
  totalLength: number;
  rawPointCount: number;
  simplifiedPointCount: number;
  extractionTimeMs: number;
  internalGlintUrl?: string | null;
}

export type ViewMode =
  | 'ORIGINAL'
  | 'MASK_OVERLAY'
  | 'BINARY_MASK'
  | 'CONTOUR_ONLY'
  | 'COMPOSITE';

export type EffectBranch = 'WATER_RESONANCE' | 'CLASSIC_GOLD_CONTOUR';

/**
 * 渔见 AI — Water Resonance 湖面回响高保真动效 V1 专用配置 (Section X)
 */
export interface WaterResonanceConfig {
  version: '1.0.0';
  durationMs: number; // 2600ms
  ambientColor: string; // #729E9B
  ambientAlpha: number; // 0.08
  rippleColor: string; // #D9BE7D
  rippleAlpha: number; // 0.18
  goldColor: string; // #F0DCA5
  goldAlpha: number; // 0.12
  residueColor: string; // #C8AE76
  residueAlpha: number; // 0.06
  fishFieldLengthRatio: number; // 0.88
  fishFieldWidthRatio: number; // 0.72
  softFeatherRatio: number; // 0.14
  wavefrontWidthRatio: number; // 0.015
  waveDistortionRatio: number; // 0.006
  pulseCount: number; // 3
  pulseStartTimes: number[]; // [300, 700, 1100]
  pulseDurations: number[]; // [550, 550, 550]
  pulseStartScales: number[]; // [0.42, 0.52, 0.60]
  pulseEndScales: number[]; // [0.80, 0.88, 0.95]
  pulsePeakAlphas: number[]; // [0.18, 0.14, 0.10]
  pulseColors: string[]; // ['#D9BE7D', '#E2CFA0', '#A7C8BF']
  freezeAtMs: number; // 2100ms
  geometryMode: 'TRUSTED_MASK' | 'BBOX_ONLY' | 'NO_GEOMETRY';
}

export interface GoldContourParams {
  colorMode: 'BLUE_CYAN_CORE_GOLD_ACCENT' | 'BLUE_GOLD_GRADIENT' | 'PURE_GOLD'; // 蓝青主体+日光金高光 vs 蓝金渐变 vs 纯金
  // L0: 深青色对比底线
  underStrokeColor?: string;     // #063B46
  underStrokeWidth?: number;     // 约 4.0dp
  underStrokeOpacity?: number;   // 约 0.75

  // L1: 蓝青色核心轮廓
  coreColor?: string;            // #7DD3FC
  coreLineWidth: number;         // 约 2.6dp (1.0 - 8.0 CSS px)

  // L2: 冰青白细高光
  highlightColor?: string;       // #DDFBFF
  highlightOpacity?: number;     // 约 0.35 (0.25 - 0.40)

  // L3: 日光金流动高光
  goldAccentColor?: string;      // #FFD166
  motionWaveIntensity: number;   // 流动光波强度 (0.05 - 0.8)
  motionWaveSpeedMs: number;     // 巡航周期速度 (800 - 3000ms)

  // 柔光扩散与光晕
  softGlowColor?: string;        // #38BDF8
  softGlowRadius: number;        // 半径 18 CSS px
  goldGlowColor?: string;        // #FEF08A 暖金辅助
  haloColor?: string;            // #38BDF8
  haloRadius: number;            // 半径 40 CSS px
  glowIntensity: number;         // 柔光整体倍率

  // 几何去锯齿与平滑
  smoothingPasses: number;       // 去锯齿平滑度 1 - 5 轮卷积滤波
  simplificationTolerance?: number; // 骨架折点容差 (如 1.8)
  antiAliasingSoftEdge: boolean; // 次像素抗锯齿软边

  // 兼容老字段
  goldBrightness?: number;
  softGlowIntensity?: number;
  featherBlur?: number;
  rimGlowSpread?: number;
  bellyGlowBoost?: number;
  strokeDuration?: number;
  sweepDuration?: number;
  glowColor?: string;
  blueColor?: string;
  goldColor?: string;
  corePeakAlpha?: number;
  softGlowPeakAlpha?: number;
  haloPeakAlpha?: number;
  internalGlintAlpha?: number;
}

export interface SpeciesData {
  name: string;
  latinName: string;
  family: string;
  habitat: string;
  confidenceNote: string;
  isDemo: boolean;
}

export interface DiagnosticLog {
  modelId: string;
  device: BackendDevice;
  modelStatus: ModelStatus;
  loadDurationMs: number | null;
  inferenceDurationMs: number | null;
  imageDimensions: { width: number; height: number } | null;
  maskDimensions: { width: number; height: number } | null;
  maskPixelCount: number | null;
  maskAreaRatio: number | null;
  bbox: [number, number, number, number] | null;
  iouScore: number | null;
  contourVertices: number | null;
  simplifiedVertices: number | null;
  timelineDurationMs: number;
  verificationChecklist: { [key: string]: boolean | string };
  errorLog?: string;
  effectBranch?: EffectBranch;
  waterResonanceConfig?: WaterResonanceConfig;
}
