import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { summarizeFrames, type PerfReport } from './perf.js';
import { estimateGpuBytes, type PerfRig } from './perf-rig.js';

const WARMUP = 30;
const DEFAULT_SAMPLE = 120;

type Collector = {
  frames: number;
  seen: number;
  deltas: number[];
  js: number[];
  render: number[];
  /** The heaviest main view of the sample: the frames that redraw the shadow map cost the most. */
  calls: number;
  triangles: number;
  resolve: (report: PerfReport) => void;
};

const MEGABYTE = 1024 * 1024;

/**
 * Renders continuously for a number of frames and reports measured frame times, CPU time per frame and what the scene
 * holds. The first report goes to `onReport`; `window.__aetherPerfRig.sample(n)` takes more after a script has changed
 * the scene (to attribute a cost by switching one piece off).
 */
export function PerfProbe({
  quality,
  frames = DEFAULT_SAMPLE,
  onReport,
}: {
  quality: string;
  frames?: number;
  onReport: (report: PerfReport) => void;
}) {
  const collector = useRef<Collector | null>(null);
  const frameStart = useRef(0);
  const renderEnd = useRef(0);
  const pending = useRef<{ js: number; render: number } | null>(null);
  // The main view's own counts: with the control-room wall, the last render of a frame is a small view.
  const main = useRef<{ calls: number; triangles: number; ms: number } | null>(null);
  const lastMain = useRef<{ calls: number; triangles: number; ms: number } | null>(null);
  const { gl, scene, camera, invalidate, size } = useThree();

  useEffect(() => {
    const render = gl.render.bind(gl);
    gl.render = (...args: Parameters<typeof render>) => {
      const began = performance.now();
      render(...args);
      renderEnd.current = performance.now();
      main.current ??= {
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        ms: renderEnd.current - began,
      };
      pending.current = {
        js: renderEnd.current - frameStart.current,
        render: main.current.ms,
      };
    };
    return () => {
      gl.render = render;
    };
  }, [gl]);

  useEffect(() => {
    const report = (c: Collector): PerfReport => {
      const context = gl.getContext();
      const debug = context.getExtension('WEBGL_debug_renderer_info');
      const pixels = gl.domElement.width * gl.domElement.height;
      const js = summarizeFrames(c.js)!;
      const render = summarizeFrames(c.render)!;
      return {
        stats: summarizeFrames(c.deltas)!,
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
        quality,
        devicePixelRatio: gl.getPixelRatio(),
        viewport: { width: size.width, height: size.height },
        measuredAt: new Date().toISOString(),
      };
    };
    const sample = (count: number) =>
      new Promise<PerfReport>((resolve) => {
        collector.current = {
          frames: count,
          seen: 0,
          deltas: [],
          js: [],
          render: [],
          calls: 0,
          triangles: 0,
          resolve,
        };
        invalidate();
      });
    const rig: PerfRig & { report: (c: Collector) => PerfReport } = {
      sample: (count) => sample(count),
      scene,
      gl,
      camera,
      report,
    };
    (window as unknown as { __aetherPerfRig?: unknown }).__aetherPerfRig = rig;
    void sample(frames).then(onReport);
    return () => {
      delete (window as unknown as { __aetherPerfRig?: unknown }).__aetherPerfRig;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one first sample per mount
  }, [gl, scene]);

  useFrame((_state, delta) => {
    frameStart.current = performance.now();
    lastMain.current = main.current ?? lastMain.current;
    main.current = null; // the next render is a new frame's main view
    const c = collector.current;
    if (!c) return;
    c.seen += 1;
    if (c.seen > WARMUP && pending.current) {
      c.deltas.push(delta * 1000);
      c.js.push(pending.current.js);
      c.render.push(pending.current.render);
      c.calls = Math.max(c.calls, lastMain.current?.calls ?? 0);
      c.triangles = Math.max(c.triangles, lastMain.current?.triangles ?? 0);
    }
    if (c.deltas.length >= c.frames) {
      collector.current = null;
      const rig = (
        window as unknown as { __aetherPerfRig: { report: (c: Collector) => PerfReport } }
      ).__aetherPerfRig;
      c.resolve(rig.report(c));
      return;
    }
    invalidate();
  }, -1000);
  return null;
}
