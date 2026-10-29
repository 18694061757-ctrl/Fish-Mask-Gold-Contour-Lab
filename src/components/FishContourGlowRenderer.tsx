/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { ContourData, GoldContourParams } from '../types';

interface FishContourGlowRendererProps {
  contourData: ContourData | null;
  currentTime: number; // 0 to 2600ms+
  isPlaying: boolean;
  imageWidth: number;
  imageHeight: number;
  displayedWidth?: number; // actual displayed CSS width of the image
  isPureVisualMode?: boolean;
  contourParams?: GoldContourParams;
}

export const DEFAULT_CONTOUR_PARAMS: GoldContourParams = {
  colorMode: 'BLUE_GOLD_GRADIENT',
  underStrokeColor: '#063B46',
  underStrokeWidth: 3.8,
  underStrokeOpacity: 0.8,
  coreColor: '#7DD3FC',
  coreLineWidth: 2.2, // 核心描边主线宽 默认值 2.2dp
  highlightColor: '#DDFBFF',
  highlightOpacity: 0.6,
  goldAccentColor: '#FFD166',
  softGlowColor: '#38BDF8',
  softGlowRadius: 32,
  goldGlowColor: '#FEF08A',
  haloColor: '#38BDF8',
  haloRadius: 64,
  glowIntensity: 1.5,
  motionWaveIntensity: 0.8,
  motionWaveSpeedMs: 2200,
  smoothingPasses: 3,
  simplificationTolerance: 2.2,
  antiAliasingSoftEdge: true,
  goldBrightness: 0.90,
  softGlowIntensity: 0.50,
  featherBlur: 32.0,
  rimGlowSpread: 64.0,
  bellyGlowBoost: 0.20,
  strokeDuration: 1000,
  sweepDuration: 1200,
  glowColor: '#38BDF8',
  blueColor: '#7DD3FC',
  goldColor: '#FFD166',
};

/**
 * 渔见 AI — Fish Contour Glow V1.3
 * 蓝青核心 + 冰青白提亮 + 日光金流动高光 + 深青对比底线
 */
export const FishContourGlowRenderer: React.FC<FishContourGlowRendererProps> = ({
  contourData,
  currentTime,
  imageWidth,
  imageHeight,
  displayedWidth,
  contourParams = DEFAULT_CONTOUR_PARAMS,
}) => {
  if (!contourData || !contourData.svgPath) {
    return null;
  }

  const params = { ...DEFAULT_CONTOUR_PARAMS, ...contourParams };
  const totalLength = contourData.totalLength || 1000;
  const t = Math.max(0, currentTime);

  // CSS px to SVG viewBox units scaling:
  // e.g. If image natural width is 1152 and displayed CSS width is 384, scale = 3.0.
  const svgScale = displayedWidth && displayedWidth > 0
    ? imageWidth / displayedWidth
    : (imageWidth > 1000 ? 2.6 : 1.0);

  // === 1. 物理尺寸映射 (受设计基线与面板驱动) ===
  const coreLineWidth = Math.max(0.5, params.coreLineWidth) * svgScale;
  const underStrokeWidth = Math.max(1.0, (params.underStrokeWidth ?? 4.0)) * svgScale;
  const highlightLineWidth = Math.max(0.6, (params.coreLineWidth * 0.46)) * svgScale; // 窄幅叠加约 1.2dp
  const softGlowRadius = Math.max(1, (params.softGlowRadius ?? 18)) * svgScale;
  const haloRadius = Math.max(2, (params.haloRadius ?? 40)) * svgScale;
  const goldGlowRadius = Math.max(1, (params.softGlowRadius ? params.softGlowRadius * 0.65 : 12)) * svgScale;
  const softEdgeBlurRadius = 0.9 * svgScale;

  // === 2. 核心描边路径生长进度 (0–1000ms smoothstep) ===
  const growthProgress = useMemo(() => {
    if (t <= 0) return 0;
    if (t >= 1000) return 1.0;
    const p = t / 1000;
    return 3 * p * p - 2 * p * p * p;
  }, [t]);

  const coreDashoffset = totalLength * (1 - growthProgress);

  // === 3. 基础柔光与 Halo 平滑淡入 (1150–1400ms) ===
  const fadeFactor = useMemo(() => {
    if (t < 1150) return 0;
    if (t >= 1400) return 1.0;
    const u = (t - 1150) / 250;
    return 3 * u * u - 2 * u * u * u;
  }, [t]);

  // === 4. 柔光呼吸微调制 (1400ms 起，维持柔美流动，振幅≤±3%) ===
  const loopModulation = useMemo(() => {
    if (t < 1400) return 0;
    const cycle = params.motionWaveSpeedMs || 2200;
    return Math.sin(((t - 1400) / cycle) * 2 * Math.PI) * 0.03;
  }, [t, params.motionWaveSpeedMs]);

  // === 5. 识别确认高光 (Confirmation Highlight: 1600ms–1850ms, 1680ms 达峰值) ===
  const confirmationFactor = useMemo(() => {
    if (t < 1600 || t > 1850) return 0;
    if (t <= 1680) {
      const k = (t - 1600) / 80;
      return 3 * k * k - 2 * k * k * k; // 0 -> 1.0
    } else if (t <= 1760) {
      const k = (t - 1680) / 80;
      const s = 3 * k * k - 2 * k * k * k;
      return 1.0 - 0.5 * s; // 1.0 -> 0.5
    } else {
      const k = (t - 1760) / 90;
      const s = 3 * k * k - 2 * k * k * k;
      return 0.5 * (1.0 - s); // 0.5 -> 0.0
    }
  }, [t]);

  // === 6. 计算各光学层最终 Alpha ===
  const glowMultiplier = Math.max(0.1, params.glowIntensity ?? 0.95);

  // Core 描边透明度
  const coreAlpha = useMemo(() => {
    if (t <= 0) return 0;
    const base = params.goldBrightness ?? 0.90;
    const boost = 1.0 + 0.12 * confirmationFactor;
    return Math.min(1.0, base * boost);
  }, [t, confirmationFactor, params.goldBrightness]);

  // Soft Glow 基础透明度
  const softGlowAlpha = useMemo(() => {
    if (fadeFactor <= 0) return 0;
    const base = (params.softGlowIntensity ?? 0.50) * (1.0 + loopModulation) * glowMultiplier;
    const boost = 1.0 + 0.20 * confirmationFactor;
    return Math.min(0.95, base * boost * fadeFactor);
  }, [fadeFactor, loopModulation, confirmationFactor, glowMultiplier, params.softGlowIntensity]);

  // Halo 大漫射光晕 (低可见度渐隐式空间扩散)
  const haloAlpha = useMemo(() => {
    if (fadeFactor <= 0) return 0;
    const base = 0.20 * (1.0 + loopModulation) * glowMultiplier;
    const boost = 1.0 + 0.15 * confirmationFactor;
    return Math.min(0.60, base * boost * fadeFactor);
  }, [fadeFactor, loopModulation, confirmationFactor, glowMultiplier]);

  // 内部局部反光 (Internal Glint)
  const glintAlpha = useMemo(() => {
    if (fadeFactor <= 0) return 0;
    const base = 0.12 * glowMultiplier;
    const boost = 1.0 + 0.25 * confirmationFactor;
    return Math.min(0.22, base * boost * fadeFactor);
  }, [fadeFactor, confirmationFactor, glowMultiplier]);

  // L3 日光金流动高光 (Traveling Sunlit Gold Glint, 全轮廓巡航，不锁定任何部位)
  const waveParams = useMemo(() => {
    if (t < 1400 || (params.motionWaveIntensity ?? 0) <= 0) return null;
    const elapsed = t - 1400;
    const cycle = Math.max(500, params.motionWaveSpeedMs || 2200);
    const phase = (elapsed % cycle) / cycle;
    return {
      center: phase * totalLength,
      length: 0.20 * totalLength, // 覆盖约 20% 轮廓弧长
      opacity: Math.min(0.95, (params.motionWaveIntensity ?? 0.32) * (1.0 + 0.35 * confirmationFactor) * fadeFactor),
    };
  }, [t, totalLength, params.motionWaveSpeedMs, params.motionWaveIntensity, fadeFactor, confirmationFactor]);

  // 配色方案判定
  const isBlueCyanAccent = params.colorMode === 'BLUE_CYAN_CORE_GOLD_ACCENT';
  const isBlueGoldGrad = params.colorMode === 'BLUE_GOLD_GRADIENT';

  // 颜色定义
  const underColor = params.underStrokeColor || '#063B46';
  const coreStrokeColor = isBlueCyanAccent
    ? (params.coreColor || '#7DD3FC')
    : (isBlueGoldGrad ? 'url(#fcg-blue-gold-grad)' : (params.coreColor || '#F5DFB0'));

  const highlightStrokeColor = params.highlightColor || '#DDFBFF';
  const goldAccentColor = params.goldAccentColor || '#FFD166';
  const softGlowColor = params.softGlowColor || '#38BDF8';
  const goldGlowColor = params.goldGlowColor || '#FEF08A';
  const haloFieldColor = params.haloColor || '#38BDF8';

  return (
    <g className="fish-contour-glow-v1-3 select-none pointer-events-none">
      <defs>
        {/* 蓝金蓝金 2 级交替双循环渐变 (BLUE-GOLD-BLUE-GOLD 2-CYCLE GRADIENT) */}
        <linearGradient id="fcg-blue-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          {/* Cycle 1: 蓝 -> 金 */}
          <stop offset="0%" stopColor="#0284C7" stopOpacity="1" />
          <stop offset="14%" stopColor="#38BDF8" stopOpacity="1" />
          <stop offset="28%" stopColor="#FDE68A" stopOpacity="1" />
          <stop offset="44%" stopColor="#F59E0B" stopOpacity="1" />
          {/* Cycle 2: 蓝 -> 金 */}
          <stop offset="52%" stopColor="#0284C7" stopOpacity="1" />
          <stop offset="66%" stopColor="#38BDF8" stopOpacity="1" />
          <stop offset="80%" stopColor="#FDE68A" stopOpacity="1" />
          <stop offset="94%" stopColor="#F59E0B" stopOpacity="1" />
          <stop offset="100%" stopColor="#0284C7" stopOpacity="1" />
        </linearGradient>

        {/* 日光金流动高光渐变 (中间亮金，两端羽化) */}
        <linearGradient id="fcg-sunlit-gold-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD166" stopOpacity="0.1" />
          <stop offset="30%" stopColor="#FFE494" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#FFF4D0" stopOpacity="1" />
          <stop offset="70%" stopColor="#FFD166" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#E5A62D" stopOpacity="0.1" />
        </linearGradient>

        {/* 严格鱼体边界裁切 (Mask 物理约束，确保内部高光绝不溢出至背景或手部) */}
        <clipPath id="fcg-fish-clip">
          <path d={contourData.svgPath} />
        </clipPath>

        {/* 次像素抗锯齿微羽化滤镜 (Soft-Edge AA) */}
        <filter id="fcg-soft-edge-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={softEdgeBlurRadius} result="blur" />
        </filter>

        {/* Soft Glow 蓝青羽化滤镜 (半径 18dp) */}
        <filter id="fcg-softglow-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={softGlowRadius} result="blur" />
        </filter>

        {/* Gold Glow 暖金辅助羽化滤镜 */}
        <filter id="fcg-goldglow-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={goldGlowRadius} result="blur" />
        </filter>

        {/* Halo 宽范围蓝青光场滤镜 (半径 40dp) */}
        <filter id="fcg-halo-blur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={haloRadius} result="blur" />
        </filter>

        {/* 日光金流光高光羽化滤镜 */}
        <filter id="fcg-sunlit-wave-blur" x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation={Math.max(1.5, coreLineWidth * 0.8)} result="blur" />
        </filter>
      </defs>

      {/* ========================================================
          L0 · 深青色对比底线 (#063B46)
          - 底线约 3.8-4.0dp，透明度约 80%。
          - 先绘制在最底层，有效分离鱼体与复杂草地/泥沙/夜钓强光/浅色手部背景
          ======================================================== */}
      {growthProgress > 0 && (
        <path
          d={contourData.svgPath}
          fill="none"
          stroke={underColor}
          strokeWidth={underStrokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={coreDashoffset}
          opacity={(params.underStrokeOpacity ?? 0.8) * (growthProgress > 0 ? 1 : 0)}
          shapeRendering="geometricPrecision"
        />
      )}

      {/* ========================================================
          次像素抗锯齿微羽化过渡衬垫 (Anti-Aliasing Soft-Edge)
          ======================================================== */}
      {params.antiAliasingSoftEdge && growthProgress > 0 && (
        <path
          d={contourData.svgPath}
          fill="none"
          stroke={coreStrokeColor}
          strokeWidth={coreLineWidth * 1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={coreDashoffset}
          opacity={coreAlpha * 0.40}
          filter="url(#fcg-soft-edge-blur)"
        />
      )}

      {/* ========================================================
          L1 · 蓝青/蓝金核心轮廓 (1.8dp)
          - 主描边约 1.8dp。作为整条鱼体连续、稳定的基础颜色
          ======================================================== */}
      {growthProgress > 0 && (
        <path
          d={contourData.svgPath}
          fill="none"
          stroke={coreStrokeColor}
          strokeWidth={coreLineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={coreDashoffset}
          opacity={coreAlpha}
          shapeRendering="geometricPrecision"
        />
      )}

      {/* ========================================================
          L2 · 冰青白细高光 (#DDFBFF)
          - 窄幅叠加约 0.8-1.2dp，约 60% 不透明度
          - 增强边缘清晰度，不形成第二条粗轮廓
          ======================================================== */}
      {growthProgress > 0 && (params.highlightOpacity ?? 0) > 0 && (
        <path
          d={contourData.svgPath}
          fill="none"
          stroke={highlightStrokeColor}
          strokeWidth={highlightLineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={totalLength}
          strokeDashoffset={coreDashoffset}
          opacity={(params.highlightOpacity ?? 0.6) * coreAlpha}
          shapeRendering="geometricPrecision"
        />
      )}

      {/* ========================================================
          L3 · 日光金流动高光 (#FFD166)
          - 作为辅助高光，沿完整封闭轮廓流动
          - 无论横向、竖向、斜向鱼体统一使用，不依赖任何解剖学部位识别
          ======================================================== */}
      {waveParams && (
        <path
          d={contourData.svgPath}
          fill="none"
          stroke={isBlueCyanAccent || isBlueGoldGrad ? 'url(#fcg-sunlit-gold-grad)' : goldAccentColor}
          strokeWidth={Math.max(1.4, coreLineWidth * 0.95)}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${waveParams.length} ${totalLength - waveParams.length} ${waveParams.length} ${totalLength - waveParams.length}`}
          strokeDashoffset={-(waveParams.center - waveParams.length / 2)}
          opacity={waveParams.opacity}
          filter="url(#fcg-sunlit-wave-blur)"
        />
      )}
    </g>
  );
};
