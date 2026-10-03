import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { summarizeFrames, type PerfReport } from './perf.js';

const WARMUP = 30;
const SAMPLE = 120;

/** Renders continuously for a fixed number of frames, then reports measured frame times once. */
export function PerfProbe({
  quality,
  onReport,
}: {
  quality: string;
  onReport: (report: PerfReport) => void;
}) {
  const deltas = useRef<number[]>([]);
  const seen = useRef(0);
  const done = useRef(false);
  const { gl, invalidate, size } = useThree();
  useFrame((_state, delta) => {
    if (done.current) return;
    seen.current += 1;
    if (seen.current > WARMUP) deltas.current.push(delta * 1000);
    if (deltas.current.length < SAMPLE) {
      invalidate();
      return;
    }
    done.current = true;
    const context = gl.getContext();
    const debug = context.getExtension('WEBGL_debug_renderer_info');
    const stats = summarizeFrames(deltas.current)!;
    onReport({
      stats,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      renderer: String(
        debug
          ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : context.getParameter(context.RENDERER),
      ),
      quality,
      devicePixelRatio: gl.getPixelRatio(),
      viewport: { width: size.width, height: size.height },
      measuredAt: new Date().toISOString(),
    });
  });
  return null;
}
