import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Scene, WebGLRenderer } from 'three';
import { summarizeFrames, type FrameStats, type PerfReport } from '../perf/perf.js';
import { estimateGpuBytes, type PerfRig } from '../perf/perf-rig.js';

const WARMUP = 30;
const DEFAULT_SAMPLE = 120;

type Collector = {
  frames: number;
  seen: number;
  deltas: number[];
  js: number[];
  render: number[];
  calls: number;
  triangles: number;
  resolve: (report: PerfReport) => void;
};

const MEGABYTE = 1024 * 1024;
/** A sample is only reported once it holds frames, so an empty one is never summarised: zeroes keep the types honest. */
const statsOf = (values: readonly number[]): FrameStats =>
  summarizeFrames(values) ?? { frames: 0, medianMs: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, medianFps: 0 };

type Rig = PerfRig & { report: (c: Collector) => PerfReport };
type PerfWindow = Window & { __aetherPerfRig?: Rig };
type MainView = { calls: number; triangles: number; ms: number };
type Timing = {
  frameStart: number;
  pending: { js: number; render: number } | null;
  main: MainView | null;
  lastMain: MainView | null;
};
type Settings = {
  quality: string;
  size: { width: number; height: number };
};

const newCollector = (frames: number, resolve: (report: PerfReport) => void): Collector => ({
  frames,
  seen: 0,
  deltas: [],
  js: [],
  render: [],
  calls: 0,
  triangles: 0,
  resolve,
});

function reportOf(gl: WebGLRenderer, scene: Scene, c: Collector, settings: Settings): PerfReport {
  const context = gl.getContext();
  const debug = context.getExtension('WEBGL_debug_renderer_info');
  const pixels = gl.domElement.width * gl.domElement.height;
  const js = statsOf(c.js);
  const render = statsOf(c.render);
  return {
    stats: statsOf(c.deltas),
    drawCalls: c.calls,
    triangles: c.triangles,
    geometries: gl.info.memory.geometries,
    textures: gl.info.memory.textures,
    programs: gl.info.programs?.length ?? 0,
    gpuMegabytes: Math.round((estimateGpuBytes(scene, pixels) / MEGABYTE) * 10) / 10,
    jsMs: { median: js.medianMs, p95: js.p95Ms },
    renderMs: { median: render.medianMs, p95: render.p95Ms },
    renderer: String(
      debug
        ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER),
    ),
    quality: settings.quality,
    devicePixelRatio: gl.getPixelRatio(),
    viewport: { width: settings.size.width, height: settings.size.height },
    measuredAt: new Date().toISOString(),
  };
}

function useRenderTiming(gl: WebGLRenderer, timing: { current: Timing }) {
  useEffect(() => {
    const render = gl.render.bind(gl);
    gl.render = (...args: Parameters<typeof render>) => {
      const began = performance.now();
      render(...args);
      const ended = performance.now();
      timing.current.main ??= {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        ms: ended - began,
      };
      timing.current.pending = {
        js: ended - timing.current.frameStart,
        render: timing.current.main.ms,
      };
    };
    return () => {
      gl.render = render;
    };
  }, [gl, timing]);
}

function record(c: Collector, timing: Timing, delta: number): boolean {
  c.seen += 1;
  if (c.seen > WARMUP && timing.pending) {
    c.deltas.push(delta * 1000);
    c.js.push(timing.pending.js);
    c.render.push(timing.pending.render);
    c.calls = Math.max(c.calls, timing.lastMain?.calls ?? 0);
    c.triangles = Math.max(c.triangles, timing.lastMain?.triangles ?? 0);
  }
  return c.deltas.length >= c.frames;
}

type PerfProbeProps = {
  quality: string;
  frames?: number;
  onReport: (report: PerfReport) => void;
};

export function PerfProbe({ quality, frames = DEFAULT_SAMPLE, onReport }: PerfProbeProps) {
  const collector = useRef<Collector | null>(null);
  const timing = useRef<Timing>({ frameStart: 0, pending: null, main: null, lastMain: null });
  const { gl, scene, camera, invalidate, size } = useThree();
  const rigRef = useRef<Rig | null>(null);
  // What the one-time sample below reads: the current values, never a reason to re-run it.
  const latest = useRef({ quality, frames, onReport, camera, invalidate, size });
  latest.current = { quality, frames, onReport, camera, invalidate, size };
  useRenderTiming(gl, timing);

  useEffect(() => {
    const sample = (count: number) =>
      new Promise<PerfReport>((resolve) => {
        collector.current = newCollector(count, resolve);
        latest.current.invalidate();
      });
    const rig: Rig = {
      sample,
      scene,
      gl,
      camera: latest.current.camera,
      report: (c) => reportOf(gl, scene, c, latest.current),
    };
    rigRef.current = rig;
    (window as PerfWindow).__aetherPerfRig = rig;
    void sample(latest.current.frames).then(latest.current.onReport);
    return () => {
      delete (window as PerfWindow).__aetherPerfRig;
    };
  }, [gl, scene]);

  useFrame((_state, delta) => {
    const t = timing.current;
    t.frameStart = performance.now();
    t.lastMain = t.main ?? t.lastMain;
    t.main = null;
    const c = collector.current;
    if (!c) return;
    if (record(c, t, delta)) {
      collector.current = null;
      if (rigRef.current) c.resolve(rigRef.current.report(c));
      return;
    }
    invalidate();
  }, -1000);
  return null;
}
