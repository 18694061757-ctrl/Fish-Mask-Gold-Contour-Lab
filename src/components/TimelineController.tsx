/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  Sparkles,
  Sun,
  ShieldCheck,
  Eye,
  CheckCircle,
  Activity,
} from 'lucide-react';

interface TimelineControllerProps {
  currentTime: number; // 0 to 2600 ms+
  totalDuration?: number; // default 2600 ms
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (timeMs: number) => void;
  onReplay: () => void;
  onReset: () => void;
  disabled?: boolean;
}

export const TimelineController: React.FC<TimelineControllerProps> = ({
  currentTime,
  totalDuration = 2600,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onReplay,
  onReset,
  disabled = false,
}) => {
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      // Section 6: "2600ms 主时间轴结束后，核心描边保持完整，柔光继续循环，直到用户暂停或重播。"
      // Advance time continuously during playback so the moving glow loop keeps cycling!
      const nextTime = currentTime + delta;
      onSeek(nextTime);

      animationFrameRef.current = requestAnimationFrame(tick);
    };

    animationFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, currentTime, onSeek]);

  // Phase information strictly matching Fish Contour Glow V1.1 specifications:
  const getPhaseInfo = (t: number) => {
    if (t < 1000) {
      return {
        id: 1,
        title: '核心描边生长',
        desc: '真实弧长smoothstep生长 · 0ms无描边 · 500ms半程 · 1000ms闭合',
        color: 'text-[#F5DFB0]',
        badge: '0–1000ms',
      };
    } else if (t < 1150) {
      return {
        id: 2,
        title: '描边静止保持',
        desc: '核心线保持闭合 (Alpha 0.75) · 柔光与反光完全关闭',
        color: 'text-[#F5DFB0] font-semibold',
        badge: '1000–1150ms',
      };
    } else if (t < 1400) {
      return {
        id: 3,
        title: '双层柔光淡入',
        desc: 'Soft Glow (0%→0.24) · Halo (0%→0.08) · 内部反光淡入 (0%→0.10)',
        color: 'text-[#E8C882]',
        badge: '1150–1400ms',
      };
    } else if (t >= 1600 && t <= 1850) {
      return {
        id: 4,
        title: '识别确认高光 ⚡',
        desc: '1680ms达峰值 · Core 1.15x (0.86) · Soft 1.25x (0.30) · Halo 1.10x (0.088) · Glint (0.12)',
        color: 'text-[#F0DCA5] font-bold',
        badge: '1600–1850ms',
      };
    } else if (t <= 2600) {
      return {
        id: 5,
        title: '稳定柔光巡航',
        desc: '柔光平稳循环 (幅度严格≤±3%) · 内部微光稳定 (0.10)',
        color: 'text-[#E8C882] font-medium',
        badge: '1850–2600ms',
      };
    } else {
      return {
        id: 6,
        title: '主线完成 · 柔光温和循环',
        desc: '核心描边稳定保持 · 柔光继续连续循环直到暂停或重播',
        color: 'text-[#E8C882] font-medium',
        badge: `2600ms+ (${Math.round(t)}ms)`,
      };
    }
  };

  const activePhase = getPhaseInfo(currentTime);
  const sliderValue = Math.min(totalDuration, currentTime);
  const progressPercent = Math.min(100, Math.max(0, (sliderValue / totalDuration) * 100));

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 shadow-xl">
      {/* Top Controls & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        {/* Playback Controls */}
        <div className="flex items-center gap-1.5">
          {isPlaying ? (
            <button
              onClick={onPause}
              disabled={disabled}
              className="px-3.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-100 font-medium text-xs flex items-center gap-1.5 border border-neutral-700 transition-colors disabled:opacity-50"
              title="暂停 (冻结当前进度与相位)"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
              <span>暂停</span>
            </button>
          ) : (
            <button
              onClick={onPlay}
              disabled={disabled}
              className="px-3.5 py-1.5 rounded-lg bg-[#E8C882] hover:bg-[#d4b46e] text-neutral-950 font-bold text-xs flex items-center gap-1.5 transition-colors shadow-md disabled:opacity-50"
              title="播放动效 (从当前位置继续播放)"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>播放动效</span>
            </button>
          )}

          <button
            onClick={onReplay}
            disabled={disabled}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors disabled:opacity-50"
            title="从0ms从头重播 (重置描边与柔光相位)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onReset}
            disabled={disabled}
            className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition-colors disabled:opacity-50"
            title="重置到0ms并暂停"
          >
            <SkipBack className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Current Active Phase Readout */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 font-mono">
            {Math.round(currentTime)}ms / {totalDuration}ms
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-neutral-800/90 border border-neutral-700">
            <span className={`w-2 h-2 rounded-full bg-[#E8C882] ${isPlaying ? 'animate-pulse' : ''}`} />
            <span className={activePhase.color}>{activePhase.title}</span>
            <span className="text-neutral-400 font-mono text-[11px]">
              ({activePhase.badge})
            </span>
          </span>
        </div>
      </div>

      {/* Scrub Slider Bar with Strict Exclusive Phase Regions */}
      <div className="relative mb-3">
        <div className="relative h-2.5 w-full rounded-full bg-neutral-800 overflow-hidden flex">
          {/* Phase 1: 0–1000ms: 核心描边生长 (柔光OFF) */}
          <div
            style={{ width: `${(1000 / totalDuration) * 100}%` }}
            className="h-full bg-[#F5DFB0]/20 border-r border-neutral-700/80"
            title="0–1000ms: 仅绘制核心描边，柔光彻底关闭"
          />
          {/* Phase 2: 1000–1150ms: 描边静止保持 (柔光OFF) */}
          <div
            style={{ width: `${(150 / totalDuration) * 100}%` }}
            className="h-full bg-[#F5DFB0]/35 border-r border-neutral-700/80"
            title="1000–1150ms: 核心描边保持完整，柔光关闭"
          />
          {/* Phase 3: 1150–1400ms: 基础柔光平滑淡入 */}
          <div
            style={{ width: `${(250 / totalDuration) * 100}%` }}
            className="h-full bg-[#E8C882]/20 border-r border-neutral-700/80"
            title="1150–1400ms: 双层柔光淡入，运动层暂不启动"
          />
          {/* Phase 3.5: 1600–1850ms 确认高光区间标记 */}
          <div
            style={{
              position: 'absolute',
              left: `${(1600 / totalDuration) * 100}%`,
              width: `${(250 / totalDuration) * 100}%`,
              top: 0,
              bottom: 0,
            }}
            className="bg-amber-400/25 border-x border-amber-300/40 pointer-events-none"
            title="1600–1850ms: 识别确认高光区间 (1680ms达峰值)"
          />
          {/* Phase 4: 1400–2600ms: 柔光稳定循环 */}
          <div
            style={{ width: `${(1200 / totalDuration) * 100}%` }}
            className="h-full bg-[#E8C882]/30"
            title="1400–2600ms+: 柔光循环稳定度±3%以内"
          />

          {/* Filled Progress Bar */}
          <div
            style={{ width: `${progressPercent}%` }}
            className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-[#F5DFB0] via-[#E8C882] to-[#F5DFB0] opacity-90 pointer-events-none"
          />
        </div>

        {/* Range Input for continuous scrubbing */}
        <input
          type="range"
          min={0}
          max={totalDuration}
          step={10}
          value={sliderValue}
          disabled={disabled}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize disabled:cursor-not-allowed"
          title="拖拽时间轴进度"
        />
      </div>

      {/* 8 Quick Keyframe Jump Buttons:
          0ms, 500ms, 1000ms, 1150ms, 1400ms, 1680ms, 2200ms, 2600ms */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-xs">
        {/* Keyframe 0ms */}
        <button
          onClick={() => onSeek(0)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime < 250
              ? 'bg-[#F5DFB0]/25 border-[#F5DFB0] text-[#F5DFB0]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="0ms: 无描边，柔光关闭"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <Eye className="w-3 h-3 text-[#F5DFB0]" />
            <span>0ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">无描边</div>
        </button>

        {/* Keyframe 500ms */}
        <button
          onClick={() => onSeek(500)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 250 && currentTime < 750
              ? 'bg-[#F5DFB0]/25 border-[#F5DFB0] text-[#F5DFB0]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="500ms: 路径约绘制至一半 (smoothstep e(0.5)=0.5)"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <Activity className="w-3 h-3 text-[#F5DFB0]" />
            <span>500ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">半程生长</div>
        </button>

        {/* Keyframe 1000ms */}
        <button
          onClick={() => onSeek(1000)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 750 && currentTime < 1080
              ? 'bg-[#F5DFB0]/25 border-[#F5DFB0] text-[#F5DFB0]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="1000ms: 路径绘制完成闭合，柔光仍关闭"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <CheckCircle className="w-3 h-3 text-[#F5DFB0]" />
            <span>1000ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">描边闭合</div>
        </button>

        {/* Keyframe 1150ms */}
        <button
          onClick={() => onSeek(1150)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 1080 && currentTime < 1280
              ? 'bg-[#F5DFB0]/25 border-[#F5DFB0] text-[#F5DFB0]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="1150ms: 完整描边静止保持，柔光即将启动"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <ShieldCheck className="w-3 h-3 text-[#F5DFB0]" />
            <span>1150ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">描边保持</div>
        </button>

        {/* Keyframe 1400ms */}
        <button
          onClick={() => onSeek(1400)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 1280 && currentTime < 1550
              ? 'bg-[#E8C882]/25 border-[#E8C882] text-[#E8C882]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="1400ms: 双层柔光淡入完成，进入稳定态"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <Sun className="w-3 h-3 text-[#E8C882]" />
            <span>1400ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">柔光就绪</div>
        </button>

        {/* Keyframe 1680ms (确认高光峰值) */}
        <button
          onClick={() => onSeek(1680)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 1550 && currentTime < 1950
              ? 'bg-amber-400/30 border-amber-300 text-amber-300 font-bold shadow-md shadow-amber-950/40'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="1680ms: 识别确认高光峰值 (Core 1.15x, Soft 1.25x, Halo 1.10x, Glint 0.12)"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <Sparkles className="w-3 h-3 text-amber-300 animate-pulse" />
            <span>1680ms</span>
          </div>
          <div className="text-[10px] text-amber-300/80 truncate">高光峰值</div>
        </button>

        {/* Keyframe 2200ms (稳定柔光) */}
        <button
          onClick={() => onSeek(2200)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 1950 && currentTime < 2400
              ? 'bg-[#E8C882]/25 border-[#E8C882] text-[#E8C882]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="2200ms: 稳定柔光态 (循环幅度严格在±3%以内)"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <Sun className="w-3 h-3 text-[#E8C882]" />
            <span>2200ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">稳定柔光</div>
        </button>

        {/* Keyframe 2600ms */}
        <button
          onClick={() => onSeek(2600)}
          className={`p-1.5 rounded-lg border text-left transition-all ${
            currentTime >= 2400
              ? 'bg-[#E8C882]/25 border-[#E8C882] text-[#E8C882]'
              : 'bg-neutral-800/40 border-neutral-800 text-neutral-400 hover:text-neutral-200'
          }`}
          title="2600ms: 核心描边保持完整，柔光继续温和循环"
        >
          <div className="flex items-center gap-1 font-semibold text-[11px]">
            <ShieldCheck className="w-3 h-3 text-[#E8C882]" />
            <span>2600ms</span>
          </div>
          <div className="text-[10px] text-neutral-400 truncate">终态循环</div>
        </button>
      </div>
    </div>
  );
};
