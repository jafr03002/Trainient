import { useEffect, useRef, useState } from "react";

/**
 * The light behind the top of the dashboard (the date arc and greeting).
 *
 * The static `.sessions-wash` gradient is always drawn first, as the fallback
 * for no WebGL, a lost context or the first frames. On top of it a small
 * fragment shader renders the same grey-to-teal light as something alive:
 * slow shafts falling from above the screen, a caustic teal pool that drifts
 * like light through water, and a film grain that also removes gradient
 * banding.
 *
 * The light gathers over today's column of the week arc, so it points at the
 * day that matters. A finger (or mouse) pulls the light towards it, and a tap
 * sends a soft ripple out. The canvas never takes pointer events, so the date
 * circles and "Full month" still get every tap; the listeners are passive and
 * sit on the window.
 *
 * Rendering stops while the wash is scrolled off screen or the tab is hidden.
 * With reduced motion it draws a single still frame and ignores the pointer.
 */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCyan;
uniform vec3 uMist;
uniform float uSunX;
uniform vec3 uPointer;  // xy (0..1, y down), z = strength
uniform vec4 uRipple;   // xy, age in seconds, strength

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

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
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = r * p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = vec2(frag.x / uRes.x, 1.0 - frag.y / uRes.y);
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float t = uTime;

  // A tap's ripple: a thin ring that pushes the light outwards as it grows.
  vec2 rp = vec2((uRipple.x - 0.5) * aspect, uRipple.y);
  vec2 rv = p - rp;
  float rd = length(rv);
  float ringR = uRipple.z * 0.75;
  float ring = exp(-pow((rd - ringR) * 16.0, 2.0)) * uRipple.w * exp(-uRipple.z * 1.8);
  p += (rv / max(rd, 1e-3)) * ring * 0.035;

  // The old CSS wash, kept as the ground: grey at the top, into black.
  vec3 col = mix(vec3(0.184, 0.208, 0.220), vec3(0.106, 0.133, 0.141), smoothstep(0.0, 0.38, uv.y));
  col = mix(col, vec3(0.0), smoothstep(0.38, 1.0, uv.y));

  // Shafts from a source above the screen, over today's column.
  vec2 sp = vec2((uSunX - 0.5) * aspect, -0.32);
  vec2 d = p - sp;
  float ang = atan(d.x, d.y);
  float dist = length(d);
  float shafts = 0.6 * fbm(vec2(ang * 7.0, t * 0.07)) + 0.4 * noise(vec2(ang * 19.0 - t * 0.05, t * 0.09));
  shafts = smoothstep(0.4, 0.82, shafts);
  float cone = exp(-ang * ang * 2.6);
  float fall = exp(-dist * 1.5);
  vec3 shaftCol = mix(uMist, uCyan, smoothstep(0.35, 0.95, dist));
  col += shaftCol * shafts * cone * fall * 0.36;

  // The teal pool behind the arc, domain-warped so it moves like water light.
  vec2 q = p * 1.7;
  vec2 w = vec2(fbm(q + vec2(0.0, t * 0.05)), fbm(q + vec2(5.2, -t * 0.04)));
  float f = fbm(q + 1.9 * w + vec2(t * 0.03, 0.0));
  vec2 bc = vec2((uSunX - 0.5) * aspect * 0.85, 0.33);
  vec2 bd = (p - bc) * vec2(0.85, 1.35);
  float pool = exp(-dot(bd, bd) * 3.4);
  col += uCyan * pool * (0.1 + 0.4 * f * f);

  // Caustics: thin bright ridges of warped noise, only inside the pool, where
  // light through water would draw them.
  float c = fbm(q * 2.2 + 2.4 * w + vec2(-t * 0.06, t * 0.04));
  float caustic = pow(1.0 - abs(c * 2.0 - 1.0), 9.0);
  col += mix(uCyan, uMist, 0.5) * caustic * pool * 0.16;
  // A brighter core right behind today's circle.
  col += mix(uMist, uCyan, 0.4) * exp(-dot(bd, bd) * 22.0) * 0.1;

  // The finger's light: a soft lens that also lifts the caustics under it.
  vec2 pp = vec2((uPointer.x - 0.5) * aspect, uPointer.y);
  vec2 pd = p - pp;
  float lens = exp(-dot(pd, pd) * 10.0) * uPointer.z;
  col += mix(uCyan, uMist, 0.3) * lens * (0.14 + 0.46 * f);
  col += mix(uCyan, uMist, 0.5) * caustic * lens * 0.15;
  col += uCyan * ring * 0.35;

  // Fade the added light out well before the cards start.
  col *= 1.0 - smoothstep(0.55, 1.0, uv.y) * 0.85;
  col = 1.0 - exp(-col * 1.12);

  // Film grain, also the dither that keeps the long gradients from banding.
  col += (hash(frag + fract(t * 7.0) * 91.0) - 0.5) * (2.2 / 255.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

// "187 83% 66%" -> [r, g, b] in 0..1
function hslTokenToRgb(token: string): [number, number, number] | null {
  const m = token.trim().match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (!m) return null;
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Today's column on the Monday-first week arc, as a 0..1 x position.
function todayColumnX(): number {
  const mondayFirst = (new Date().getDay() + 6) % 7;
  return (mondayFirst + 0.5) / 7;
}

export function DashboardWash({ className = "" }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram();
    if (!vs || !fs || !program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uRes = u("uRes");
    const uTime = u("uTime");
    const uCyan = u("uCyan");
    const uMist = u("uMist");
    const uSunX = u("uSunX");
    const uPointer = u("uPointer");
    const uRipple = u("uRipple");

    // The accent comes from the token, so the light follows the palette.
    const cyan = hslTokenToRgb(getComputedStyle(wrap).getPropertyValue("--sessions-cyan")) ?? [0.378, 0.876, 0.942];
    gl.uniform3f(uCyan, cyan[0], cyan[1], cyan[2]);
    gl.uniform3f(uMist, 214 / 255, 222 / 255, 222 / 255);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // The light is all soft gradients, so it renders below device resolution.
    const SCALE = Math.min(window.devicePixelRatio || 1, 2) * 0.6;
    const resize = () => {
      const w = Math.max(1, Math.round(wrap.clientWidth * SCALE));
      const h = Math.max(1, Math.round(wrap.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };
    resize();

    const baseSunX = todayColumnX();
    const pointer = { x: baseSunX, y: 0.33, s: 0, tx: baseSunX, ty: 0.33, ts: 0, down: false };
    const ripple = { x: 0.5, y: 0.3, start: -100, s: 0 };
    let tilt = 0;
    let sunX = baseSunX;

    const start = performance.now();
    let last = start;
    let raf = 0;
    let visible = true;
    let drawnOnce = false;

    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = reduceMotion ? 12 : (now - start) / 1000 + 40;

      const ease = 1 - Math.exp(-dt * 7);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      pointer.s += (pointer.ts - pointer.s) * (1 - Math.exp(-dt * (pointer.ts > pointer.s ? 6 : 1.6)));
      const sunTarget = baseSunX + tilt * 0.12 + (pointer.x - baseSunX) * 0.4 * pointer.s;
      sunX += (sunTarget - sunX) * (1 - Math.exp(-dt * 2.5));

      gl.uniform1f(uTime, t);
      gl.uniform1f(uSunX, sunX);
      gl.uniform3f(uPointer, pointer.x, pointer.y, pointer.s);
      gl.uniform4f(uRipple, ripple.x, ripple.y, (now - ripple.start) / 1000, ripple.s);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (!drawnOnce) {
        drawnOnce = true;
        setLive(true);
      }
      raf = 0;
      if (!reduceMotion && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const kick = () => {
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(draw);
      }
    };
    kick();

    const ro = new ResizeObserver(() => {
      resize();
      if (reduceMotion) kick();
    });
    ro.observe(wrap);

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    });
    io.observe(wrap);
    const onVisibility = () => {
      if (!document.hidden && visible) kick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    const local = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      return { x, y, inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
    };
    const onDown = (e: PointerEvent) => {
      const { x, y, inside } = local(e);
      if (!inside) return;
      pointer.down = true;
      pointer.tx = x;
      pointer.ty = y;
      pointer.ts = 1;
      ripple.x = x;
      ripple.y = y;
      ripple.start = performance.now();
      ripple.s = 1;
    };
    const onMove = (e: PointerEvent) => {
      const { x, y, inside } = local(e);
      if (pointer.down) {
        pointer.tx = x;
        pointer.ty = Math.max(-0.1, Math.min(1.1, y));
      } else if (e.pointerType === "mouse") {
        pointer.tx = x;
        pointer.ty = y;
        pointer.ts = inside ? 0.6 : 0;
      }
    };
    const onUp = () => {
      pointer.down = false;
      pointer.ts = 0;
    };
    // Android reports tilt without asking; iOS needs a permission prompt,
    // which a background effect has no business raising, so it's skipped there.
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma != null) tilt = Math.max(-1, Math.min(1, e.gamma / 30));
    };
    const needsPermission =
      typeof DeviceOrientationEvent !== "undefined" &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === "function";

    if (!reduceMotion) {
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerup", onUp, { passive: true });
      window.addEventListener("pointercancel", onUp, { passive: true });
      if (!needsPermission) window.addEventListener("deviceorientation", onTilt, { passive: true });
    }

    // If the GPU drops the context the CSS wash underneath simply shows again.
    const onLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(raf);
      raf = 0;
      setLive(false);
    };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("deviceorientation", onTilt);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div ref={wrapRef} className={`sessions-wash ${className}`} aria-hidden>
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ease-out ${live ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
