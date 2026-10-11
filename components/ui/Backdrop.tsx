"use client";

import { useEffect, useRef } from "react";
import { CASE_EVENT, type CaseStatus, type Tone } from "@/lib/caseStatus";
import { gsap } from "@/lib/gsap";
import { createQualityMonitor, type Quality } from "@/lib/perf";

const VERTEX = "attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }";

// Domain-warped noise drawn as slow ribbons with fine contour lines.
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec2 uMouse;
uniform vec3 uA;
uniform vec3 uB;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.05;

  vec2 q = vec2(fbm(p * 1.3 + t + m * 0.25), fbm(p * 1.3 - t + 4.0 + uScroll));
  vec2 r = vec2(fbm(p * 1.7 + 3.0 * q + vec2(1.7, 9.2) + t * 1.4),
                fbm(p * 1.7 + 3.0 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.5 + 3.2 * r);

  float ribbons = smoothstep(0.38, 0.95, f + 0.25 * length(q));
  vec3 col = vec3(0.022, 0.03, 0.026);
  col = mix(col, uA * 0.5, ribbons * smoothstep(0.2, 0.9, r.x));
  col = mix(col, uB * 0.5, smoothstep(0.5, 1.0, r.y) * 0.75 * f);

  float contour = abs(fract(f * 16.0) - 0.5);
  col += uA * 0.12 * smoothstep(0.05, 0.0, contour) * ribbons;

  float d = length(p - m);
  col += uA * 0.1 * exp(-d * d * 7.0);

  col *= 1.0 - 1.15 * dot(uv - 0.5, uv - 0.5);
  col += (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.03;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;

const palette: Record<Tone, [number[], number[]]> = {
  fault: [
    [1.0, 0.42, 0.24],
    [0.62, 0.12, 0.05],
  ],
  work: [
    [0.1, 0.79, 0.65],
    [0.05, 0.36, 0.56],
  ],
  ok: [
    [0.78, 0.96, 0.24],
    [0.1, 0.79, 0.65],
  ],
};

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
}

// Fixed WebGL backdrop. Its colours follow the case tone, and it bends toward the pointer.
export function Backdrop() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const gl = el?.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!el || !gl) return;

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uniform = (name: string) => gl.getUniformLocation(program, name);
    const uRes = uniform("uRes");
    const uTime = uniform("uTime");
    const uScroll = uniform("uScroll");
    const uMouse = uniform("uMouse");
    const uA = uniform("uA");
    const uB = uniform("uB");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const initial = (document.documentElement.dataset.tone as Tone) ?? "fault";
    const a = [...palette[initial][0]];
    const b = [...palette[initial][1]];
    const mouse = { x: 0.5, y: 0.5 };
    let flow = 0;
    let boost = 0;
    let lastScroll = window.scrollY;
    let lastFrame = performance.now();

    const draw = () => {
      gl.uniform2f(uRes, el.width, el.height);
      gl.uniform1f(uTime, reduced ? 20 : flow);
      gl.uniform1f(uScroll, window.scrollY * 0.0004);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform3f(uA, a[0], a[1], a[2]);
      gl.uniform3f(uB, b[0], b[1], b[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    // Low-power mode: a slow device gets a lower resolution, then fewer frames.
    let quality: Quality = 2;
    let frameCount = 0;
    const resolution = { factor: 1 };

    const resize = () => {
      // Render below native resolution: the image is soft by design and this keeps it cheap.
      const scale = Math.min(window.devicePixelRatio, 1.5) * 0.6 * resolution.factor;
      el.width = Math.floor(window.innerWidth * scale);
      el.height = Math.floor(window.innerHeight * scale);
      gl.viewport(0, 0, el.width, el.height);
      draw();
    };

    const applyQuality = (next: Quality) => {
      quality = next;
      resolution.factor = next === 2 ? 1 : next === 1 ? 0.55 : 0.35;
      resize();
    };
    const monitor = createQualityMonitor(applyQuality);

    const tick = () => {
      if (document.hidden) return;
      const now = performance.now();
      monitor.frame(now - lastFrame);
      const delta = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      // Minimal mode draws one frame in three.
      frameCount += 1;
      if (quality === 0 && frameCount % 3 !== 0) return;
      const moved = Math.abs(window.scrollY - lastScroll);
      lastScroll = window.scrollY;
      boost += (Math.min(moved * 0.08, 7) - boost) * 0.08;
      flow += delta * (1 + boost);
      draw();
    };

    const onTone = (event: Event) => {
      const [nextA, nextB] = palette[(event as CustomEvent<CaseStatus>).detail.tone];
      const onUpdate = reduced ? draw : undefined;
      gsap.to(a, { endArray: nextA, duration: 1.4, ease: "power2.out", overwrite: true, onUpdate });
      gsap.to(b, { endArray: nextB, duration: 1.4, ease: "power2.out", overwrite: true });
    };

    const moveX = gsap.quickTo(mouse, "x", { duration: 1.4, ease: "power3" });
    const moveY = gsap.quickTo(mouse, "y", { duration: 1.4, ease: "power3" });
    const onPointer = (event: PointerEvent) => {
      moveX(event.clientX / window.innerWidth);
      moveY(1 - event.clientY / window.innerHeight);
    };

    if (monitor.quality !== 2) {
      quality = monitor.quality;
      resolution.factor = 0.55;
    }
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener(CASE_EVENT, onTone);
    if (!reduced) {
      gsap.ticker.add(tick);
      window.addEventListener("pointermove", onPointer);
    }

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", resize);
      window.removeEventListener(CASE_EVENT, onTone);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-void">
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      <div className="absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.03)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.03)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" />
    </div>
  );
}
