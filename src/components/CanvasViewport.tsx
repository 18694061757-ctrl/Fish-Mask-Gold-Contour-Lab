/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  Fish,
  Eye,
  EyeOff,
  Waves,
} from 'lucide-react';
import {
  ContourData,
  EffectBranch,
  GoldContourParams,
  MaskResult,
  SpeciesData,
  ViewMode,
  WaterResonanceConfig,
} from '../types';
import { FishDetection } from '../services/detectorService';
import { VirtualFishRipple } from './VirtualFishRipple';
import { WaterResonanceRenderer, DEFAULT_WATER_RESONANCE_CONFIG } from './WaterResonanceRenderer';
import { FishContourGlowRenderer } from './FishContourGlowRenderer';
import {
  createFishCatchOverlay,
  FROZEN_EFFECT_02_CONFIG,
  FROZEN_EFFECT_01_CONFIG,
  FishCatchVersion,
} from './FishCatchWaterOverlay';

export type VisualModeSelection = 'AUTO' | 'FORCE_REAL' | 'FORCE_VIRTUAL';

interface CanvasViewportProps {
  imageSrc: string | null;
  imageDims: { width: number; height: number } | null;
  maskResult: MaskResult | null;
  contourData: ContourData | null;
  fishDetection: FishDetection | null;
  viewMode: ViewMode;
  contourParams: GoldContourParams;
  speciesData: SpeciesData;
  currentTime: number; // 0 to 2600 ms+
  isAnalyzing: boolean;
  effectBranch?: EffectBranch;
  waterResonanceConfig?: WaterResonanceConfig;
  onSelectEffectBranch?: (branch: EffectBranch) => void;
  isFallbackActive?: boolean;
  isMaskTrustworthy?: boolean;
  isBboxTrustworthy?: boolean;
  fallbackReason?: string;
  isPureVisualMode?: boolean;
  onTogglePureVisualMode?: () => void;
  visualModeOverride?: VisualModeSelection;
  onImageUploaded: (file: File) => void;
  onLoadReferencePhoto?: () => void;
  onLoadPresetPhoto?: (path?: string) => void;
  onTapToRefocus?: (x: number, y: number) => void;
  borderLightEnabled?: boolean;
  borderLightVersion?: FishCatchVersion;
  onSelectBorderLightVersion?: (ver: FishCatchVersion) => void;
  onToggleBorderLight?: () => void;
  onReplayBorderLight?: () => void;
  borderLightReplayKey?: number;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  imageSrc,
  imageDims,
  maskResult,
  contourData,
  fishDetection,
  viewMode,
  contourParams,
  speciesData,
  currentTime,
  isAnalyzing,
  effectBranch = 'CLASSIC_GOLD_CONTOUR',
  waterResonanceConfig = DEFAULT_WATER_RESONANCE_CONFIG,
  onSelectEffectBranch,
  isFallbackActive = false,
  isMaskTrustworthy = true,
  isBboxTrustworthy = true,
  fallbackReason,
  isPureVisualMode = false,
  onTogglePureVisualMode,
  visualModeOverride = 'AUTO',
  onImageUploaded,
  onLoadPresetPhoto,
  onTapToRefocus,
  borderLightEnabled = true,
  borderLightVersion = 'EFFECT_02',
  onSelectBorderLightVersion,
  onToggleBorderLight,
  onReplayBorderLight,
  borderLightReplayKey = 0,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const photoContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<ReturnType<typeof createFishCatchOverlay> | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [showBox, setShowBox] = useState<boolean>(true);
  const [displayedImgWidth, setDisplayedImgWidth] = useState<number>(380);
  const [isShaking, setIsShaking] = useState(false);
  const shakeTimeoutRef = useRef<number | null>(null);

  const triggerShake = useCallback(() => {
    setIsShaking(false);
    requestAnimationFrame(() => {
      setIsShaking(true);
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
      shakeTimeoutRef.current = window.setTimeout(() => {
        setIsShaking(false);
      }, 880);
    });
  }, []);

  // Mount & manage WebGL border water light overlay on #photo-container
  useEffect(() => {
    if (!photoContainerRef.current || !imageSrc || !borderLightEnabled) {
      if (overlayRef.current) {
        overlayRef.current.destroy();
        overlayRef.current = null;
      }
      return;
    }

    const config = borderLightVersion === 'EFFECT_01' ? FROZEN_EFFECT_01_CONFIG : FROZEN_EFFECT_02_CONFIG;

    if (!overlayRef.current) {
      overlayRef.current = createFishCatchOverlay(photoContainerRef.current, config);
    } else {
      overlayRef.current.updateConfig(config);
      overlayRef.current.replay();
    }
  }, [imageSrc, borderLightVersion, borderLightEnabled]);

  // Replay 1200ms spread when replay key changes
  useEffect(() => {
    if (borderLightReplayKey > 0 && overlayRef.current) {
      overlayRef.current.replay();
      triggerShake();
    }
  }, [borderLightReplayKey, triggerShake]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        overlayRef.current.destroy();
        overlayRef.current = null;
      }
    };
  }, []);

  // Measure actual displayed CSS width of the image to scale SVG line width to exact CSS px
  useEffect(() => {
    if (!imgRef.current) return;
    const updateWidth = () => {
      if (imgRef.current && imgRef.current.clientWidth > 0) {
        setDisplayedImgWidth(imgRef.current.clientWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, [imageSrc]);

  // Render mask onto overlay canvas whenever mask or viewMode changes
  useEffect(() => {
    if (!maskCanvasRef.current || !imageDims) return;
    const canvas = maskCanvasRef.current;
    canvas.width = imageDims.width;
    canvas.height = imageDims.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!maskResult) return;
    const candidate = maskResult.candidates[maskResult.selectedCandidateIndex];
    if (!candidate) return;

    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const data = imgData.data;
    const maskData = candidate.data;
    const total = canvas.width * canvas.height;

    if (viewMode === 'BINARY_MASK') {
      // Pure black & white
      for (let i = 0; i < total; i++) {
        const val = maskData[i] > 127 ? 255 : 0;
        const idx = i * 4;
        data[idx] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
        data[idx + 3] = 255;
      }
    } else if (viewMode === 'MASK_OVERLAY') {
      // Only show overlay if user explicitly selects MASK_OVERLAY mode
      for (let i = 0; i < total; i++) {
        if (maskData[i] > 127) {
          const idx = i * 4;
          data[idx] = 217; // #D9BE7D
          data[idx + 1] = 190;
          data[idx + 2] = 125;
          data[idx + 3] = 90;
        }
      }
    }
    // In COMPOSITE mode (default), maskCanvasRef is completely transparent!
    ctx.putImageData(imgData, 0, 0);
  }, [maskResult, viewMode, imageDims]);

  // Determine active visual branch based on override or quality gate:
  const effectiveMode: 'REAL' | 'VIRTUAL' | 'NONE' = (() => {
    if (visualModeOverride === 'FORCE_REAL') return 'REAL';
    if (visualModeOverride === 'FORCE_VIRTUAL') return 'VIRTUAL';
    if (isMaskTrustworthy && contourData) return 'REAL';
    if (isBboxTrustworthy && fishDetection) return 'VIRTUAL';
    return 'NONE';
  })();

  const showRealContour = effectiveMode === 'REAL' && contourData && (
    viewMode === 'CONTOUR_ONLY' ||
    viewMode === 'COMPOSITE' ||
    viewMode === 'ORIGINAL' ||
    viewMode === 'MASK_OVERLAY'
  );

  const showVirtualRipple = effectiveMode === 'VIRTUAL' && fishDetection;

  // Handle click on canvas image to re-center or tap-to-focus
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imgRef.current || !imageDims || !onTapToRefocus) return;
    const rect = imgRef.current.getBoundingClientRect();

    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return;
    }

    const scaleX = imageDims.width / rect.width;
    const scaleY = imageDims.height / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    onTapToRefocus(clickX, clickY);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onImageUploaded(file);
      }
    }
  };

  const shouldRenderSvg = imageDims && (
    (effectBranch === 'WATER_RESONANCE') ||
    showRealContour ||
    showVirtualRipple ||
    (showBox && fishDetection && !isPureVisualMode)
  );

  return (
    <div
      ref={containerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-full h-[620px] lg:h-[720px] bg-[#07090d] rounded-2xl overflow-hidden border transition-all flex items-center justify-center select-none shadow-2xl ${
        isDragOver
          ? 'border-amber-400 bg-amber-950/20 ring-2 ring-amber-400/40'
          : 'border-neutral-800'
      }`}
    >
      {/* Ambient Radial Vignette */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,rgba(217,190,125,0.04)_0%,rgba(10,14,22,0.6)_60%,rgba(6,8,12,0.95)_100%)]" />

      {/* When no image is uploaded: Clean upload prompt */}
      {!imageSrc ? (
        <div className="max-w-md p-8 text-center z-10 flex flex-col items-center">
          <div className="w-20 h-20 rounded-3xl bg-neutral-900/90 border border-neutral-800 flex items-center justify-center mb-5 text-[#D9BE7D] shadow-2xl">
            <Upload className="w-10 h-10 animate-bounce" />
          </div>
          <h3 className="text-lg font-bold text-neutral-100 mb-1.5 tracking-tight">
            上传真实鱼获照片
          </h3>
          <p className="text-xs text-neutral-400 mb-6 leading-relaxed">
            请上传您拍摄的真实鱼获照片。系统将自动进行高精度鱼体定位，呈现 <strong>Fish Contour Glow V1.1</strong> 真实路径生长与外围双层柔光。
          </p>

          <div className="w-full space-y-3">
            <label className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-[#D9BE7D] to-[#F0DCA5] hover:from-[#cbb06e] hover:to-[#e4d098] text-neutral-950 font-bold text-sm cursor-pointer flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-950/20 active:scale-[0.98]">
              <Upload className="w-4 h-4 stroke-[2.5]" />
              <span>选择手机/电脑中的鱼获照片上传</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    onImageUploaded(e.target.files[0]);
                  }
                }}
              />
            </label>

            {/* 快速体验真实鱼获照片 1~4 */}
            {onLoadPresetPhoto && (
              <div className="space-y-1.5 w-full">
                <div className="text-[11px] font-semibold text-neutral-400 flex items-center justify-between px-1">
                  <span>真实预置鱼获照片 (一键载入推理)</span>
                  <span className="text-[10px] text-amber-400">4 种真实场景</span>
                </div>
                <div className="grid grid-cols-2 gap-2 w-full">
                  <button
                    type="button"
                    onClick={() => onLoadPresetPhoto('/preset_fish.jpg')}
                    disabled={isAnalyzing}
                    className="py-2.5 px-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-850 border border-[#E8C882]/40 hover:border-[#E8C882] text-[#F5DFB0] hover:text-white font-medium text-xs cursor-pointer flex items-center justify-start gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#E8C882] group-hover:rotate-12 transition-transform flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-200 group-hover:text-amber-300 text-[11px]">预置 1 · 翘嘴鲌</div>
                      <div className="text-[10px] text-neutral-400">银白流线体态</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadPresetPhoto('/reference_fish.jpg')}
                    disabled={isAnalyzing}
                    className="py-2.5 px-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-850 border border-[#C9A66B]/40 hover:border-[#C9A66B] text-[#F5DFB0] hover:text-white font-medium text-xs cursor-pointer flex items-center justify-start gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#C9A66B] group-hover:rotate-12 transition-transform flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-200 group-hover:text-amber-300 text-[11px]">预置 2 · 钓获草鱼</div>
                      <div className="text-[10px] text-neutral-400">草地持鱼实拍</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadPresetPhoto('/preset_catfish.jpg')}
                    disabled={isAnalyzing}
                    className="py-2.5 px-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-850 border border-amber-400/50 hover:border-amber-400 text-amber-200 hover:text-white font-medium text-xs cursor-pointer flex items-center justify-start gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-200 group-hover:text-amber-300 text-[11px]">预置 3 · 黄金昂刺</div>
                      <div className="text-[10px] text-amber-300/80">夜钓高光变异体</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onLoadPresetPhoto('/preset_snakehead.jpg')}
                    disabled={isAnalyzing}
                    className="py-2.5 px-2.5 rounded-xl bg-neutral-900/90 hover:bg-neutral-850 border border-sky-400/50 hover:border-sky-400 text-sky-200 hover:text-white font-medium text-xs cursor-pointer flex items-center justify-start gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-50 group"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400 group-hover:rotate-12 transition-transform flex-shrink-0" />
                    <div className="text-left">
                      <div className="font-semibold text-neutral-200 group-hover:text-sky-300 text-[11px]">预置 4 · 巨型黑鱼</div>
                      <div className="text-[10px] text-sky-300/80">艇钓米级乌鳢</div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Image & Optics Stage */
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          {/* Outer wide-spread atmospheric water reflection aura (matching reference design) */}
          <div
            className="absolute w-[min(90vw,640px)] h-[min(90vh,880px)] pointer-events-none rounded-3xl opacity-45 blur-3xl transition-all duration-1000"
            style={{
              background:
                borderLightVersion === 'EFFECT_01'
                  ? 'radial-gradient(ellipse at 50% 70%, rgba(56, 189, 248, 0.35) 0%, rgba(254, 240, 138, 0.22) 40%, rgba(45, 212, 191, 0.15) 65%, transparent 80%)'
                  : 'radial-gradient(ellipse at 50% 70%, rgba(216, 153, 19, 0.35) 0%, rgba(77, 155, 145, 0.25) 40%, rgba(113, 159, 188, 0.18) 65%, transparent 80%)',
            }}
          />

          {/* Real photo container with tactile spring shockwave shake & four-sided water aura */}
          <div
            id="photo-container"
            ref={photoContainerRef}
            onClick={(e) => {
              handleCanvasClick(e);
              if (overlayRef.current) overlayRef.current.replay();
              triggerShake();
            }}
            className={`relative max-h-[580px] lg:max-h-[680px] h-full max-w-full rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-neutral-900 group cursor-pointer flex items-center justify-center transition-shadow ${
              isShaking
                ? 'animate-photo-shake shadow-[0_0_50px_rgba(56,189,248,0.35)]'
                : 'shadow-[0_20px_50px_rgba(0,0,0,0.8)]'
            }`}
            style={{
              aspectRatio: imageDims ? `${imageDims.width} / ${imageDims.height}` : undefined,
            }}
          >
            {/* L0: Base Fish Image - Completely stable, zero displacement, zero scaling jitter */}
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Fish Catch"
              className={`w-full h-full object-cover block select-none pointer-events-none transition-opacity duration-300 ${
                viewMode === 'BINARY_MASK' ? 'opacity-0' : 'opacity-100'
              }`}
              draggable={false}
            />

            {/* Mask Canvas Layer (Only visible in explicit mask inspection modes) */}
            <canvas
              ref={maskCanvasRef}
              className={`absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300 ${
                viewMode === 'ORIGINAL' || viewMode === 'CONTOUR_ONLY' || viewMode === 'COMPOSITE'
                  ? 'opacity-0'
                  : 'opacity-100'
              }`}
            />

            {/* SVG Optical Layer */}
            {shouldRenderSvg && (
              <svg
                className="absolute inset-0 w-full h-full object-contain pointer-events-none z-20"
                viewBox={`0 0 ${imageDims.width} ${imageDims.height}`}
              >
              {/* BRANCH 1: Water Resonance (湖面回响 V1) */}
              {effectBranch === 'WATER_RESONANCE' ? (
                <WaterResonanceRenderer
                  currentTime={currentTime}
                  imageWidth={imageDims.width}
                  imageHeight={imageDims.height}
                  fishDetection={fishDetection}
                  contourData={contourData}
                  isMaskTrustworthy={isMaskTrustworthy}
                  isBboxTrustworthy={isBboxTrustworthy}
                  isPureVisualMode={isPureVisualMode}
                  config={waterResonanceConfig}
                />
              ) : (
                /* BRANCH 2: Fish Contour Glow V1.1 (原版金色轮廓 V1.1 核心生长与双层柔光) */
                <>
                  {/* Mode B: BBOX Virtual Ripple (Fallback when Mask untrustworthy) */}
                  {showVirtualRipple && (
                    <VirtualFishRipple
                      box={fishDetection.box}
                      currentTime={currentTime}
                      imageWidth={imageDims.width}
                      imageHeight={imageDims.height}
                      isPureVisualMode={isPureVisualMode}
                    />
                  )}

                  {/* Mode A: Fish Contour Glow V1.2 (Blue-Gold Gradient, Antialiased Smooth Core & Wide Soft Glow) */}
                  {showRealContour && contourData && (
                    <FishContourGlowRenderer
                      contourData={contourData}
                      currentTime={currentTime}
                      isPlaying={true}
                      imageWidth={imageDims.width}
                      imageHeight={imageDims.height}
                      displayedWidth={displayedImgWidth}
                      isPureVisualMode={isPureVisualMode}
                      contourParams={contourParams}
                    />
                  )}
                </>
              )}

              {/* AI Fish Target Tracking BBOX (Hidden in Pure Visual Mode) */}
              {!isPureVisualMode && showBox && fishDetection && (
                <g className="transition-all duration-300">
                  <rect
                    x={fishDetection.box[0]}
                    y={fishDetection.box[1]}
                    width={fishDetection.width}
                    height={fishDetection.height}
                    fill="rgba(217, 190, 125, 0.04)"
                    stroke="rgba(217, 190, 125, 0.55)"
                    strokeWidth="1.5"
                    strokeDasharray="5 4"
                    rx="4"
                    style={{ filter: 'drop-shadow(0 0 6px rgba(217, 190, 125, 0.3))' }}
                  />
                  {(() => {
                    const [bx1, by1, bx2, by2] = fishDetection.box;
                    const bLen = Math.max(14, Math.min(32, Math.min(fishDetection.width, fishDetection.height) * 0.20));
                    return (
                      <g stroke="#F0DCA5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                        <path d={`M ${bx1} ${by1 + bLen} L ${bx1} ${by1} L ${bx1 + bLen} ${by1}`} />
                        <path d={`M ${bx2 - bLen} ${by1} L ${bx2} ${by1} L ${bx2} ${by1 + bLen}`} />
                        <path d={`M ${bx1} ${by2 - bLen} L ${bx1} ${by2} L ${bx1 + bLen} ${by2}`} />
                        <path d={`M ${bx2 - bLen} ${by2} L ${bx2} ${by2} L ${bx2 - bLen} ${by2}`} />
                      </g>
                    );
                  })()}
                  <g transform={`translate(${fishDetection.box[0]}, ${Math.max(26, fishDetection.box[1] - 8)})`}>
                    <rect
                      x="0"
                      y="-20"
                      width={Math.min(240, Math.max(160, fishDetection.width))}
                      height="20"
                      rx="4"
                      fill="rgba(10, 14, 22, 0.90)"
                      stroke="#D9BE7D"
                      strokeWidth="1"
                    />
                    <text
                      x="7"
                      y="-5"
                      fill="#F0DCA5"
                      fontSize="11"
                      fontWeight="600"
                      fontFamily="sans-serif"
                    >
                      🎯 鱼体锁定 {(fishDetection.confidence * 100).toFixed(0)}% [{fishDetection.width}×{fishDetection.height}]
                    </text>
                  </g>
                </g>
              )}
            </svg>
          )}
        </div>

          {/* Quick HUD Controls (Top Right) */}
          <div className="absolute top-4 right-4 z-30 pointer-events-auto flex items-center gap-2 flex-wrap justify-end">
            {/* 四周水光动效双版本切换 (✨ 效果02 默认推荐 vs ❄️ 效果01 经典版) */}
            <div className="flex items-center rounded-full bg-neutral-900/90 backdrop-blur-md p-0.5 border border-amber-500/40 shadow-xl">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBorderLightVersion?.('EFFECT_02');
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${
                  borderLightVersion === 'EFFECT_02' && borderLightEnabled
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-neutral-950 shadow font-bold'
                    : 'text-neutral-300 hover:text-amber-200'
                }`}
                title="效果02 (默认推荐): 琥珀金高亮 · 深湖青调 · 辉度1.80 · 铺展1200ms"
              >
                <span>✨ 效果02 (推荐)</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectBorderLightVersion?.('EFFECT_01');
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${
                  borderLightVersion === 'EFFECT_01' && borderLightEnabled
                    ? 'bg-gradient-to-r from-sky-400 to-teal-400 text-neutral-950 shadow font-bold'
                    : 'text-neutral-300 hover:text-sky-200'
                }`}
                title="效果01 (经典版): 天青蓝高亮 · 日光金调 · 辉度1.50 · 铺展1200ms"
              >
                <span>❄️ 效果01 (经典)</span>
              </button>
              {onReplayBorderLight && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplayBorderLight();
                  }}
                  className="px-2 py-1 rounded-full text-[11px] text-amber-300/90 hover:text-amber-200 hover:bg-neutral-800 transition-colors"
                  title="重新舒展 1200ms 水光动效"
                >
                  <span>🔄 舒展</span>
                </button>
              )}
            </div>

            {/* Effect Branch Quick Switcher */}
            {onSelectEffectBranch && (
              <div className="flex rounded-full bg-neutral-900/85 backdrop-blur-md p-0.5 border border-neutral-700 shadow-lg">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEffectBranch('CLASSIC_GOLD_CONTOUR');
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${
                    effectBranch === 'CLASSIC_GOLD_CONTOUR'
                      ? 'bg-[#D9BE7D] text-neutral-950 shadow'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="切换为 Fish Contour Glow V1.1 真实金色轮廓"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>金色轮廓 V1.1</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEffectBranch('WATER_RESONANCE');
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition-all ${
                    effectBranch === 'WATER_RESONANCE'
                      ? 'bg-[#729E9B] text-neutral-950 shadow'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="切换为 Water Resonance 湖面回响 V1 动效分支"
                >
                  <Waves className="w-3 h-3" />
                  <span>湖面回响</span>
                </button>
              </div>
            )}

            {/* Pure Visual Mode Toggle Button */}
            {onTogglePureVisualMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePureVisualMode();
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 backdrop-blur-md border transition-all shadow-lg ${
                  isPureVisualMode
                    ? 'bg-[#D9BE7D] text-neutral-950 border-[#F0DCA5] font-semibold'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-300 hover:text-neutral-100'
                }`}
                title="切换纯视觉预览：隐藏所有方框、标签和测试文字，只保留纯净原图与动效"
              >
                {isPureVisualMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-[#D9BE7D]" />}
                <span>{isPureVisualMode ? '纯视觉 (开启)' : '纯视觉'}</span>
              </button>
            )}

            {/* Quick Preset Photo Switch (Photos 1, 2, 3, 4) */}
            {!isPureVisualMode && onLoadPresetPhoto && (
              <div className="flex items-center gap-1 rounded-full bg-neutral-900/80 p-0.5 border border-neutral-750 backdrop-blur-md shadow">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadPresetPhoto('/preset_fish.jpg');
                  }}
                  disabled={isAnalyzing}
                  className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${
                    imageSrc === '/preset_fish.jpg'
                      ? 'bg-[#E8C882]/25 text-[#F5DFB0] border border-[#E8C882]/50'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="载入预置照片1: 翘嘴鲌"
                >
                  <Sparkles className="w-3 h-3 text-[#E8C882]" />
                  <span>1.翘嘴</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadPresetPhoto('/reference_fish.jpg');
                  }}
                  disabled={isAnalyzing}
                  className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${
                    imageSrc === '/reference_fish.jpg'
                      ? 'bg-[#C9A66B]/25 text-[#F5DFB0] border border-[#C9A66B]/50'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="载入预置照片2: 钓获草鱼"
                >
                  <Sparkles className="w-3 h-3 text-[#C9A66B]" />
                  <span>2.草鱼</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadPresetPhoto('/preset_catfish.jpg');
                  }}
                  disabled={isAnalyzing}
                  className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${
                    imageSrc === '/preset_catfish.jpg'
                      ? 'bg-amber-400/25 text-amber-200 border border-amber-400/50'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="载入预置照片3: 黄金昂刺 (夜钓实拍)"
                >
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>3.黄金昂刺</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadPresetPhoto('/preset_snakehead.jpg');
                  }}
                  disabled={isAnalyzing}
                  className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all ${
                    imageSrc === '/preset_snakehead.jpg'
                      ? 'bg-sky-400/25 text-sky-200 border border-sky-400/50'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                  title="载入预置照片4: 巨型黑鱼 (艇钓实拍)"
                >
                  <Sparkles className="w-3 h-3 text-sky-400" />
                  <span>4.巨型黑鱼</span>
                </button>
              </div>
            )}

            {/* BBOX Toggle (Hidden when in pure visual mode) */}
            {!isPureVisualMode && fishDetection && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBox((prev) => !prev);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 backdrop-blur-md border transition-all shadow-lg ${
                  showBox
                    ? 'bg-[#182020] border-[#D9BE7D]/60 text-[#F0DCA5]'
                    : 'bg-neutral-900/80 border-neutral-700 text-neutral-400 hover:text-neutral-200'
                }`}
                title="切换显示/隐藏检测定位框"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#D9BE7D]" />
                <span>{showBox ? '定位框' : '显示框'}</span>
              </button>
            )}
          </div>

          {/* Quick Tap-To-Focus Hint (Hidden in pure visual mode) */}
          {!isPureVisualMode && (
            <div className="absolute top-4 left-4 z-20 pointer-events-none">
              <div className="px-3 py-1 rounded-full bg-neutral-900/70 border border-neutral-800 backdrop-blur-md text-[11px] text-neutral-400 flex items-center gap-1.5 shadow">
                <Sparkles className="w-3 h-3 text-[#D9BE7D]" />
                <span>点击鱼身可快速重定位</span>
              </div>
            </div>
          )}

          {/* Bottom Frosted Capsule (Hidden in pure visual mode) */}
          {!isPureVisualMode && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
              <div className="px-5 py-3 rounded-full bg-neutral-900/90 border border-[#D9BE7D]/40 shadow-2xl backdrop-blur-xl flex items-center gap-3.5 min-w-[280px] transition-all">
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <div className="w-7 h-7 rounded-full border-[2px] animate-spin border-[#D9BE7D]/20 border-t-[#D9BE7D]" />
                  <div className="absolute w-1.5 h-1.5 rounded-full bg-[#F0DCA5] shadow-[0_0_6px_#D9BE7D]" />
                </div>

                <div className="flex-1">
                  {isAnalyzing ? (
                    <>
                      <div className="text-xs font-semibold text-neutral-100">正在认识这条鱼</div>
                      <div className="text-[11px] text-neutral-400">分析鱼体特征与形态...</div>
                    </>
                  ) : effectBranch === 'WATER_RESONANCE' ? (
                    <>
                      <div className="text-xs font-semibold text-[#729E9B] flex items-center gap-1">
                        <Waves className="w-3.5 h-3.5 text-[#729E9B]" />
                        <span>Water Resonance · 湖面回响 V1</span>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {currentTime < 300
                          ? '静默感知 · 水光初现'
                          : currentTime < 1650
                          ? '三次回响扩散 · 柔和折射波纹'
                          : currentTime < 2100
                          ? '光影凝结中 · 残光收敛'
                          : '完全静态 · 暖金残光稳定'}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-sky-200 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#FFD166]" />
                        <span>
                          {contourParams.colorMode === 'BLUE_CYAN_CORE_GOLD_ACCENT'
                            ? '渔见 AI · 蓝青主体 + 日光金流动高光'
                            : 'Fish Contour Glow · 金色鱼体主体显影'}
                        </span>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {currentTime < 1000
                          ? `0–1000ms: 深青底线与蓝青核心生长 (${Math.round((currentTime / 1000) * 100)}%)`
                          : currentTime < 1150
                          ? '1000–1150ms: 核心轮廓保持 · 准备扩散'
                          : currentTime < 1400
                          ? '1150–1400ms: 蓝青柔光与 Halo 渐隐式空间漫射'
                          : currentTime < 1850
                          ? '1600–1850ms: 识别确认高光达峰 · 冰青白细高光'
                          : '1850ms+: 日光金辅助高光沿全封闭轮廓流畅巡航'}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
