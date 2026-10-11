"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { CASE_EVENT, caseLive, type CaseStatus, type Tone } from "@/lib/caseStatus";
import { gsap, ScrollTrigger } from "@/lib/gsap";
import { createQualityMonitor, type Quality } from "@/lib/perf";

const toneColor: Record<Tone, string> = { fault: "#ff6a3d", work: "#19c9a6", ok: "#c8f53c" };

// The core's path through the page, in reading order. nx and ny are in viewport units from
// -1 to 1. Between two stops the core glides from one to the next as the reader scrolls.
const stops = [
  { target: "#top", nx: 0.56, ny: 0.1, scale: 1.15, opacity: 1 },
  { target: "#problem", nx: 0.62, ny: -0.05, scale: 1.7, opacity: 0.26 },
  { target: "#interlude-assemble", nx: 0, ny: 0.3, scale: 1.05, opacity: 1 },
  { target: "#system", nx: 0, ny: 0.3, scale: 1.3, opacity: 0.34 },
  // The pin spacer only exists while the case scene is pinned; otherwise the plain section is used.
  { target: "#case .pin-spacer", fallback: "#case", nx: 0, ny: -0.04, scale: 0.7, opacity: 1 },
  { target: "#interlude-prove", nx: 0, ny: 0.3, scale: 1.05, opacity: 1 },
  { target: "#stack", nx: -0.95, ny: 0.1, scale: 1.6, opacity: 0.3 },
  { target: "#outcome", nx: 0.95, ny: -0.1, scale: 1.6, opacity: 0.3 },
  { target: "#closing", nx: 0.5, ny: -0.5, scale: 0.85, opacity: 1 },
];
const fallbackPlacement = { nx: 0.7, ny: 0.05, scale: 1.3, opacity: 0.3 };

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const pseudoRandom = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// Each triangle is a shard: pushed out along its centroid and tumbled as uExplode rises.
const SHARD_VERTEX = `
attribute vec3 aCentroid;
attribute vec3 aBary;
attribute float aRand;
uniform float uExplode;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vRand;

mat3 rotation(vec3 axis, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  float oc = 1.0 - c;
  return mat3(
    oc * axis.x * axis.x + c, oc * axis.x * axis.y - axis.z * s, oc * axis.z * axis.x + axis.y * s,
    oc * axis.x * axis.y + axis.z * s, oc * axis.y * axis.y + c, oc * axis.y * axis.z - axis.x * s,
    oc * axis.z * axis.x - axis.y * s, oc * axis.y * axis.z + axis.x * s, oc * axis.z * axis.z + c
  );
}

void main() {
  vec3 dir = normalize(aCentroid);
  float e = uExplode;
  vec3 axis = normalize(vec3(aRand - 0.5, fract(aRand * 7.3) - 0.5, fract(aRand * 13.7) - 0.5) + 0.001);
  float angle = e * (aRand * 6.0 - 3.0) + e * sin(uTime * 0.8 + aRand * 40.0) * 0.3;
  mat3 spin = rotation(axis, angle);
  vec3 local = spin * (position - aCentroid) * (1.0 - 0.2 * e);
  // A whole crystal still breathes a little; a broken one drifts.
  float breathe = sin(uTime * 0.9 + aRand * 6.0) * 0.012 * (1.0 - e);
  vec3 p = aCentroid + dir * (e * (0.3 + aRand * 1.45) + breathe) + local;
  p += dir * sin(uTime * 1.3 + aRand * 30.0) * 0.05 * e;
  vNormal = normalMatrix * (spin * normal);
  vBary = aBary;
  vRand = aRand;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

// Dark glass facets: lit rims, two speculars, glowing edges and the odd glint.
const SHARD_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
uniform float uExplode;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vBary;
varying float vRand;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  if (!gl_FrontFacing) n = -n;
  vec3 keyLight = normalize(vec3(0.5, 0.8, 0.6));
  vec3 fillLight = normalize(vec3(-0.7, -0.2, 0.5));
  float fresnel = pow(1.0 - abs(dot(n, v)), 3.0);
  float diffuse = max(dot(n, keyLight), 0.0);
  float specular = pow(max(dot(n, normalize(keyLight + v)), 0.0), 48.0);
  float sheen = pow(max(dot(n, normalize(fillLight + v)), 0.0), 18.0);
  float glint = pow(max(sin(uTime * 1.4 + vRand * 60.0), 0.0), 28.0);
  float edge = 1.0 - smoothstep(0.0, 0.03, min(vBary.x, min(vBary.y, vBary.z)));
  // Loose shards glow along their edges; a whole crystal keeps only faint facet lines.
  float edgeGlow = mix(0.22, 0.8, clamp(uExplode, 0.0, 1.0));

  vec3 col = uColor * (0.004 + 0.06 * (0.4 + 0.6 * vRand) * diffuse);
  col += uColor * fresnel * 0.55;
  col += vec3(1.0) * specular * 0.55;
  col += mix(uColor, vec3(1.0), 0.4) * sheen * 0.16;
  col += uColor * glint * 0.45;
  col += uColor * edge * edgeGlow;
  // Overall exposure. Kept low so the core is easy on the eyes behind text.
  gl_FragColor = vec4(col * 0.6, 1.0);
}
`;

const HEART_VERTEX = `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  vNormal = normalMatrix * normal;
  vLocal = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const HEART_FRAGMENT = `
uniform vec3 uColor;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocal;
void main() {
  float plasma = sin(vLocal.x * 14.0 + uTime * 2.1) * sin(vLocal.y * 16.0 - uTime * 1.7) * sin(vLocal.z * 12.0 + uTime * 1.3);
  float facing = max(dot(normalize(vNormal), normalize(vView)), 0.0);
  vec3 col = uColor * (0.5 + 0.25 * plasma) + vec3(1.0) * pow(facing, 3.0) * 0.15;
  gl_FragColor = vec4(col, 1.0);
}
`;

const DUST_VERTEX = `
attribute float aRand;
uniform float uTime;
uniform float uExplode;
uniform float uPixelRatio;
varying float vTwinkle;
void main() {
  float angle = uTime * (0.04 + aRand * 0.1);
  float c = cos(angle);
  float s = sin(angle);
  vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
  p *= 1.0 + uExplode * 0.25 * sin(uTime * 0.6 + aRand * 20.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTwinkle = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (1.0 + aRand * 2.0) + aRand * 50.0), 3.0);
  gl_PointSize = (4.0 + aRand * 10.0) * uPixelRatio / -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAGMENT = `
uniform vec3 uColor;
varying float vTwinkle;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float alpha = smoothstep(0.5, 0.0, d) * vTwinkle;
  gl_FragColor = vec4(uColor * alpha * 0.55, alpha);
}
`;

// The resolver core. Shattered and racing while the case is failed; a whole crystal with a
// steady gyroscope once it is verified. Drawn with bloom and blended over the page as light.
export function Core3D() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: el, antialias: false, powerPreference: "high-performance" });
    } catch {
      return;
    }
    const pixelRatio = Math.min(window.devicePixelRatio, 1.5);
    renderer.setPixelRatio(pixelRatio);
    renderer.setClearColor(0x000000, 1);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.z = 10;
    const visibleHeight = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.4);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const root = document.documentElement;
    const state = { repair: Number(root.dataset.repair ?? 0) };
    const color = new THREE.Color(toneColor[(root.dataset.tone as Tone) ?? "fault"]);
    const shared = {
      uExplode: { value: 1 },
      uTime: { value: 0 },
      uColor: { value: color },
      uPixelRatio: { value: pixelRatio * 3.5 },
    };

    // Crystal: an icosphere with every vertex nudged in or out, so the facets are irregular
    // like a cut stone. Each face becomes its own shard.
    const source = new THREE.IcosahedronGeometry(1.25, 2).toNonIndexed();
    const positions = source.getAttribute("position").array as Float32Array;
    const jitter = (x: number, y: number, z: number) =>
      1 + 0.2 * (pseudoRandom(Math.round(x * 100) * 3.1 + Math.round(y * 100) * 7.7 + Math.round(z * 100) * 13.3) - 0.5);
    const data = {
      position: [] as number[],
      normal: [] as number[],
      centroid: [] as number[],
      bary: [] as number[],
      rand: [] as number[],
    };
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const centroid = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const side = new THREE.Vector3();
    const barycentric = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    for (let face = 0; face < positions.length / 9; face++) {
      corners.forEach((corner, i) => {
        corner.fromArray(positions, face * 9 + i * 3);
        corner.multiplyScalar(jitter(corner.x, corner.y, corner.z));
        corner.y *= 1.14;
      });
      const [a, b, c] = corners;
      centroid.copy(a).add(b).add(c).divideScalar(3);
      normal.copy(b).sub(a).cross(side.copy(c).sub(a)).normalize();
      const rand = pseudoRandom(face + 1);
      corners.forEach((corner, i) => {
        data.position.push(corner.x, corner.y, corner.z);
        data.normal.push(normal.x, normal.y, normal.z);
        data.centroid.push(centroid.x, centroid.y, centroid.z);
        data.bary.push(...barycentric[i]);
        data.rand.push(rand);
      });
    }
    source.dispose();

    const shardGeometry = new THREE.BufferGeometry();
    shardGeometry.setAttribute("position", new THREE.Float32BufferAttribute(data.position, 3));
    shardGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(data.normal, 3));
    shardGeometry.setAttribute("aCentroid", new THREE.Float32BufferAttribute(data.centroid, 3));
    shardGeometry.setAttribute("aBary", new THREE.Float32BufferAttribute(data.bary, 3));
    shardGeometry.setAttribute("aRand", new THREE.Float32BufferAttribute(data.rand, 1));
    const shardMaterial = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: SHARD_VERTEX,
      fragmentShader: SHARD_FRAGMENT,
      side: THREE.DoubleSide,
    });
    const shards = new THREE.Mesh(shardGeometry, shardMaterial);
    shards.frustumCulled = false;

    // Heart: a small plasma sphere at the centre.
    const heartMaterial = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: HEART_VERTEX,
      fragmentShader: HEART_FRAGMENT,
    });
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 32), heartMaterial);

    // Lattice: a wire cage between heart and shell that tightens as the case is repaired.
    const lineMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const latticeSource = new THREE.IcosahedronGeometry(0.78, 1);
    const lattice = new THREE.LineSegments(new THREE.EdgesGeometry(latticeSource), lineMaterial);
    latticeSource.dispose();

    // Gyroscope: three rings that thrash while broken and settle into a slow precession.
    const ringMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 });
    const rings = [0, 1, 2].map((i) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.85 + i * 0.22, 0.007, 8, 160), ringMaterial);
      const pivot = new THREE.Group();
      pivot.rotation.set(i * 1.1, i * 0.7, i * 0.4);
      pivot.add(ring);
      return { ring, pivot, speed: 0.25 + i * 0.12 };
    });

    // Worker satellites: a glowing crystal on an orbit, linked to the core, with a travelling packet.
    const satelliteMaterial = new THREE.MeshBasicMaterial({ color });
    const linkMaterial = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
    const satelliteGeometry = new THREE.OctahedronGeometry(0.12);
    const packetGeometry = new THREE.SphereGeometry(0.04, 8, 8);
    const orbitPoints = Array.from({ length: 129 }, (_, i) => {
      const angle = (i / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    });
    const orbitGeometry = new THREE.BufferGeometry().setFromPoints(orbitPoints);
    const workers = [0, 1, 2].map((i) => {
      const orbit = new THREE.Group();
      orbit.rotation.set(0.5 + i * 0.75, i * 1.1, 0.35 * (i - 1));
      const radius = 2.7 + i * 0.3;
      const path = new THREE.LineLoop(orbitGeometry, linkMaterial);
      path.scale.setScalar(radius);
      const body = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
      const packet = new THREE.Mesh(packetGeometry, satelliteMaterial);
      const linkGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
      const link = new THREE.Line(linkGeometry, linkMaterial);
      orbit.add(path, body, packet, link);
      return { orbit, body, packet, link, radius, speed: 0.35 + i * 0.12, phase: i * 2.1 };
    });

    // Dust: twinkling points on slow orbits.
    const dustPositions: number[] = [];
    const dustRand: number[] = [];
    for (let i = 0; i < 700; i++) {
      const radius = 1.9 + pseudoRandom(i + 100) * 3.2;
      const theta = pseudoRandom(i + 300) * Math.PI * 2;
      const phi = Math.acos(2 * pseudoRandom(i + 500) - 1);
      dustPositions.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi) * 0.7,
        radius * Math.sin(phi) * Math.sin(theta),
      );
      dustRand.push(pseudoRandom(i + 700));
    }
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
    dustGeometry.setAttribute("aRand", new THREE.Float32BufferAttribute(dustRand, 1));
    const dustMaterial = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: DUST_VERTEX,
      fragmentShader: DUST_FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.frustumCulled = false;

    // Shockwave: a ring that bursts outward the moment the crystal becomes whole.
    const waveMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide });
    const wave = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128), waveMaterial);

    const group = new THREE.Group();
    group.add(shards, heart, lattice, dust, wave, ...rings.map((r) => r.pivot), ...workers.map((w) => w.orbit));
    scene.add(group);
    const tinted = [lineMaterial, ringMaterial, satelliteMaterial, linkMaterial, waveMaterial];

    // Measure where each stop sits in the document. Re-measured whenever ScrollTrigger refreshes,
    // which covers resizes, font loading and pin spacing.
    type Zone = { start: number; end: number; nx: number; ny: number; scale: number; opacity: number };
    let zones: Zone[] = [];
    const measure = () => {
      zones = [];
      stops.forEach((stop) => {
        const primary = document.querySelector(stop.target);
        const found = primary ?? (stop.fallback ? document.querySelector(stop.fallback) : null);
        if (!found) return;
        const rect = found.getBoundingClientRect();
        const values = primary ? stop : fallbackPlacement;
        zones.push({
          start: rect.top + window.scrollY,
          end: rect.bottom + window.scrollY,
          nx: values.nx,
          ny: values.ny,
          scale: values.scale,
          opacity: values.opacity,
        });
      });
    };
    measure();
    ScrollTrigger.addEventListener("refresh", measure);

    // Blend between neighbouring stops around the point where one hands over to the next.
    const goal = { nx: stops[0].nx, ny: stops[0].ny, scale: stops[0].scale, opacity: stops[0].opacity };
    const place = { nx: stops[0].nx, ny: stops[0].ny, scale: stops[0].scale, opacity: 0 };
    const solve = () => {
      if (!zones.length) return;
      const centre = window.scrollY + window.innerHeight / 2;
      const spread = window.innerHeight * 0.45;
      let { nx, ny, scale, opacity } = zones[0];
      for (let i = 0; i < zones.length - 1; i++) {
        const boundary = (zones[i].end + zones[i + 1].start) / 2;
        const weight = smoothstep(boundary - spread, boundary + spread, centre);
        if (weight === 0) break;
        const next = zones[i + 1];
        nx += (next.nx - nx) * weight;
        ny += (next.ny - ny) * weight;
        scale += (next.scale - scale) * weight;
        opacity += (next.opacity - opacity) * weight;
      }
      goal.nx = nx;
      goal.ny = ny;
      goal.scale = scale;
      goal.opacity = opacity;
    };

    const onCase = (event: Event) => {
      const { tone, repair } = (event as CustomEvent<CaseStatus>).detail;
      const next = new THREE.Color(toneColor[tone]);
      gsap.to(color, { r: next.r, g: next.g, b: next.b, duration: reduced ? 0 : 1.2, overwrite: true });
      gsap.to(state, { repair, duration: reduced ? 0 : 1.5, ease: "power3.inOut", overwrite: true });
    };

    const pointer = { x: 0, y: 0 };
    const pointerX = gsap.quickTo(pointer, "x", { duration: 1.2, ease: "power3" });
    const pointerY = gsap.quickTo(pointer, "y", { duration: 1.2, ease: "power3" });
    const onPointer = (event: PointerEvent) => {
      pointerX(event.clientX / window.innerWidth - 0.5);
      pointerY(event.clientY / window.innerHeight - 0.5);
    };

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      composer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };

    // Low-power mode: a slow device gets a lower resolution and no bloom, then fewer frames.
    let quality: Quality = 2;
    let frameCount = 0;
    const applyQuality = (next: Quality) => {
      quality = next;
      const ratio = next === 2 ? pixelRatio : next === 1 ? Math.min(pixelRatio, 0.75) : 0.5;
      renderer.setPixelRatio(ratio);
      composer.setPixelRatio(ratio);
      shared.uPixelRatio.value = ratio * 3.5;
      bloom.enabled = next === 2;
    };
    const monitor = createQualityMonitor(applyQuality);
    if (monitor.quality !== 2) applyQuality(monitor.quality);

    const burst = () => {
      if (reduced) return;
      gsap.fromTo(wave.scale, { x: 1.2, y: 1.2 }, { x: 5.5, y: 5.5, duration: 1.3, ease: "power2.out", overwrite: true });
      gsap.fromTo(waveMaterial, { opacity: 0.5 }, { opacity: 0, duration: 1.3, ease: "power2.out", overwrite: true });
      gsap.fromTo(bloom, { strength: 0.55 }, { strength: 0.22, duration: 1.4, ease: "power2.out", overwrite: true });
    };

    let spin = 0;
    let shownRepair = state.repair;
    let jolt = 0;
    let lastScroll = window.scrollY;
    const tick = (time: number, deltaMs: number) => {
      if (document.hidden) return;
      monitor.frame(deltaMs);
      // Minimal mode draws one frame in three.
      frameCount += 1;
      if (quality === 0 && frameCount % 3 !== 0) return;
      const t = reduced ? 10 : time;
      const delta = reduced ? 0 : Math.min(deltaMs / 1000, 0.1);
      const ease = reduced ? 1 : 0.07;

      // Position and repair both chase their scroll-driven targets, so motion never cuts.
      solve();
      place.nx += (goal.nx - place.nx) * ease;
      place.ny += (goal.ny - place.ny) * ease;
      place.scale += (goal.scale - place.scale) * ease;
      place.opacity += (goal.opacity - place.opacity) * ease;
      const before = shownRepair;
      shownRepair += ((caseLive.repair ?? state.repair) - shownRepair) * (reduced ? 1 : 0.09);
      if (before < 0.96 && shownRepair >= 0.96) burst();
      const broken = 1 - shownRepair;

      // Fast scrolling shakes the shards loose for a moment.
      const scrolled = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      jolt += ((reduced ? 0 : Math.min(Math.abs(scrolled) * 0.004, 0.16)) - jolt) * 0.1;

      shared.uTime.value = t;
      shared.uExplode.value = broken + jolt;
      // These materials copy their colour on creation, so keep them on the live tone colour.
      tinted.forEach((material) => material.color.copy(color));

      const narrow = camera.aspect < 1;
      el.style.opacity = String(Math.min(place.opacity, narrow ? 0.4 : 0.85));
      const visibleWidth = visibleHeight * camera.aspect;
      group.position.set(place.nx * (narrow ? 0.5 : 1) * (visibleWidth / 2), place.ny * (visibleHeight / 2), 0);
      group.scale.setScalar(place.scale * (narrow ? 0.62 : 1));

      // Scrolling turns the core, so the reader is always the one moving it.
      spin += delta * (0.12 + 0.3 * broken) + (reduced ? 0 : scrolled * 0.0012);
      shards.rotation.set(0.25 + pointer.y * 0.4, spin + pointer.x * 0.6, 0);
      lattice.rotation.set(-spin * 0.7, spin * 0.5, 0);
      lattice.scale.setScalar(0.55 + 0.45 * shownRepair);
      lineMaterial.opacity = 0.1 + 0.16 * shownRepair;
      const pulse = 1 + Math.sin(t * (1.5 + 5 * broken)) * (0.05 + 0.14 * broken);
      heart.scale.setScalar(pulse);

      ringMaterial.opacity = 0.08 + 0.2 * shownRepair;
      rings.forEach(({ ring, pivot, speed }, i) => {
        pivot.rotation.z += delta * speed * (0.4 + 2.6 * broken);
        pivot.rotation.x += delta * speed * 2.2 * broken;
        ring.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + i * 2) * 0.5 * broken;
      });

      const joined = Math.min(1, shownRepair * 4);
      linkMaterial.opacity = 0.2 * joined;
      workers.forEach((worker) => {
        const angle = t * worker.speed + worker.phase;
        worker.body.position.set(Math.cos(angle) * worker.radius, 0, Math.sin(angle) * worker.radius);
        worker.body.scale.setScalar(joined);
        worker.body.rotation.y = t;
        worker.link.scale.set(worker.radius, 1, 1);
        worker.link.rotation.y = -angle;
        const travel = (t * 0.45 + worker.phase) % 1;
        worker.packet.position.copy(worker.body.position).multiplyScalar(travel);
        worker.packet.scale.setScalar(joined);
      });

      composer.render();
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener(CASE_EVENT, onCase);
    if (!reduced) window.addEventListener("pointermove", onPointer);
    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", resize);
      window.removeEventListener(CASE_EVENT, onCase);
      window.removeEventListener("pointermove", onPointer);
      ScrollTrigger.removeEventListener("refresh", measure);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
          object.geometry.dispose();
        }
      });
      [shardMaterial, heartMaterial, dustMaterial, ...tinted].forEach((material) => material.dispose());
      target.dispose();
      composer.dispose();
      renderer.dispose();
    };
  }, []);

  // Rendered on black and screen-blended, so only its light reaches the page.
  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-[5] size-full opacity-0 mix-blend-screen"
    />
  );
}
