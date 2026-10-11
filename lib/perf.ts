// Automatic low-power mode for the WebGL layers. A weak laptop or phone should get a calmer page, not a
// stuttering one. Quality only ever steps down while the page is open, so it never flickers back and forth.
//   2 = full, 1 = reduced (lower resolution, no bloom), 0 = minimal (lowest resolution, every third frame)
export type Quality = 0 | 1 | 2;

// Devices that report very little hardware start in reduced mode without waiting to be measured.
export function startingQuality(): Quality {
  if (typeof navigator === "undefined") return 2;
  const nav = navigator as Navigator & { deviceMemory?: number };
  return (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2 ? 1 : 2;
}

// Feed it the milliseconds between frames. When a window of frames averages slower than `slowFrameMs`
// (about 24 fps by default) it steps the quality down one level and calls `onChange`.
export function createQualityMonitor(onChange: (quality: Quality) => void, slowFrameMs = 42) {
  let quality = startingQuality();
  // Frames to ignore after the start or after a change: shader compiling and resizing cause one-off hiccups.
  let skip = 20;
  let count = 0;
  let total = 0;

  return {
    get quality() {
      return quality;
    },
    frame(ms: number) {
      // A very long gap means the tab was in the background, which says nothing about speed.
      if (ms > 1000) return;
      if (skip > 0) {
        skip -= 1;
        return;
      }
      total += ms;
      count += 1;
      if (count < 45) return;
      const average = total / count;
      total = 0;
      count = 0;
      if (average > slowFrameMs && quality > 0) {
        quality = (quality - 1) as Quality;
        skip = 20;
        onChange(quality);
      }
    },
  };
}
