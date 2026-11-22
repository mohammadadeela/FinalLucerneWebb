import { useEffect, useRef, useState } from "react";

/**
 * A real-time 3D dress on a dress form, drawn with plain WebGL (no 3D library).
 * Every part is a "lathe": a 2D outline spun around the vertical axis. The skirt
 * carries a weight per vertex (0 at the waist, 1 at the hem), which the shader uses
 * to pleat the fabric, flare it out when the dress spins fast, and let it trail.
 *  - drag to twirl it
 *  - it spins a little on its own, and with the page scroll
 *  - changing `color` re-dyes the fabric and gives it a twirl
 */

// ───────────── tiny matrix helpers (column-major, like WebGL expects) ─────────────
type M4 = Float32Array;
const ident = (): M4 => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
function mul(a: M4, b: M4): M4 {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
const translate = (x: number, y: number, z: number): M4 => { const m = ident(); m[12] = x; m[13] = y; m[14] = z; return m; };
const scale = (s: number): M4 => { const m = ident(); m[0] = m[5] = m[10] = s; return m; };
function rotX(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
function rotY(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
function rotZ(a: number): M4 { const m = ident(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
function perspective(fovY: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovY / 2), m = new Float32Array(16);
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = (2 * far * near) / (near - far);
  return m;
}
const chain = (...ms: M4[]) => ms.reduce(mul);


// ───────────── geometry ─────────────
interface Mesh { pos: Float32Array; nor: Float32Array; wgt: Float32Array; idx: Uint16Array }

/** Spin an outline of [radius, height, weight] points around the Y axis. */
function lathe(profile: [number, number, number?][], seg = 96): Mesh {
  const pos: number[] = [], nor: number[] = [], wgt: number[] = [], idx: number[] = [];
  // One normal per outline point, averaged from the two segments that meet there,
  // so curved parts shade smoothly instead of in bands.
  const segN = profile.slice(0, -1).map(([r0, y0], i) => {
    const [r1, y1] = profile[i + 1];
    const len = Math.hypot(r1 - r0, y1 - y0) || 1;
    return [(y1 - y0) / len, -(r1 - r0) / len];
  });
  const ptN = profile.map((_, i) => {
    const a = segN[Math.max(i - 1, 0)], b = segN[Math.min(i, segN.length - 1)];
    const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  });
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0, w0 = 0] = profile[i], [r1, y1, w1 = 0] = profile[i + 1];
    const [nr0, ny0] = ptN[i], [nr1, ny1] = ptN[i + 1];
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      pos.push(r0 * c, y0, r0 * s, r1 * c, y1, r1 * s);
      nor.push(nr0 * c, ny0, nr0 * s, nr1 * c, ny1, nr1 * s);
      wgt.push(w0, w1);
    }
    for (let j = 0; j < seg; j++) {
      const a = base + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), wgt: new Float32Array(wgt), idx: new Uint16Array(idx) };
}

/** A smooth skirt outline from the waist down to the hem, as [radius, height, weight]. */
function skirtProfile(): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = 0.27 + 0.2 * Math.sin(Math.min(t * 2.2, 1) * Math.PI / 2) + 0.62 * Math.pow(t, 1.55);
    pts.push([r, 0.5 - t * 1.95, t]);
  }
  return pts;
}

const PARTS = {
  // the stand
  foot: lathe([[0, -1.98], [0.62, -1.98], [0.64, -1.95], [0.6, -1.9], [0.12, -1.84], [0.05, -1.8]]),
  pole: lathe([[0.045, -1.82], [0.045, 0.5]], 24),
  // the dress form's torso, wearing the bodice
  bodice: lathe([[0.27, 0.48], [0.262, 0.6], [0.3, 0.82], [0.365, 1.02], [0.375, 1.14], [0.34, 1.3], [0.3, 1.4], [0.2, 1.46]]),
  neck: lathe([[0.2, 1.455], [0.13, 1.5], [0.105, 1.6], [0.11, 1.66], [0, 1.67]]),
  knob: lathe([[0, 1.67], [0.03, 1.67], [0.03, 1.72], [0.06, 1.75], [0.06, 1.8], [0, 1.83]], 32),
  belt: lathe([[0.268, 0.455], [0.284, 0.47], [0.284, 0.545], [0.268, 0.56]]),
  skirt: lathe(skirtProfile(), 160),
};

// ───────────── shaders ─────────────
const VERT = `
attribute vec3 aPos; attribute vec3 aNor; attribute float aW;
uniform mat4 uMV, uProj;
uniform float uFlare, uSway, uTime, uPleat;
varying vec3 vNor, vPos; varying float vW;
void main() {
  vec3 p = aPos; vec3 n = aNor;
  if (aW > 0.0) {
    float th = atan(p.z, p.x);
    float lag = uSway * aW * aW;                      // the hem trails behind the waist
    float ph = th * 14.0 + lag * 9.0 + sin(uTime * 0.9 + th * 2.0) * 0.5 * aW;
    float amp = uPleat * aW * (0.075 + 0.05 * aW);
    float m = 1.0 + amp * sin(ph) + uFlare * aW * (0.28 + 0.18 * aW);
    float dm = amp * 14.0 * cos(ph);
    vec3 radial = normalize(vec3(p.x, 0.0, p.z));
    vec3 tang = vec3(-radial.z, 0.0, radial.x);
    p.xz *= m;
    p.y += uFlare * aW * aW * 0.34;                   // a spinning skirt lifts
    float c = cos(lag * 0.35), s = sin(lag * 0.35);   // and twists a little
    p.xz = mat2(c, -s, s, c) * p.xz;
    n = normalize(n - tang * (dm / m) * 0.75 + vec3(0.0, uFlare * aW * 0.5, 0.0));
  }
  vec4 q = uMV * vec4(p, 1.0);
  vPos = q.xyz; vW = aW;
  vNor = mat3(uMV) * n;
  gl_Position = uProj * q;
}`;

const FRAG = `
precision highp float;
uniform vec3 uColor; uniform float uMetal, uGloss;
varying vec3 vNor, vPos; varying float vW;

// A small photo studio made of maths: a soft box above, a strip light on the
// left, a warm bounce from the right, and a dark floor.
vec3 studio(vec3 r) {
  float top = smoothstep(0.25, 0.95, r.y);
  float strip = exp(-pow((r.x + 0.55) * 3.2, 2.0)) * smoothstep(-0.5, 0.3, r.y);
  float bounce = exp(-pow((r.x - 0.75) * 2.6, 2.0)) * 0.55;
  float floorDark = smoothstep(-0.1, -0.8, r.y);
  vec3 c = vec3(0.16, 0.13, 0.15);
  c += vec3(1.0, 0.97, 0.95) * top * 0.9;
  c += vec3(1.0, 0.98, 0.96) * strip * 1.25;
  c += vec3(1.0, 0.78, 0.74) * bounce;
  return c * (1.0 - floorDark * 0.7);
}

void main() {
  vec3 V = normalize(-vPos);
  vec3 N = normalize(vNor);
  float inside = step(dot(N, V), 0.0);                // the lining of the skirt
  if (inside > 0.5) N = -N;
  vec3 L = normalize(vec3(-0.45, 0.75, 0.6));
  vec3 L2 = normalize(vec3(0.7, 0.1, 0.5));
  float diff = max(dot(N, L), 0.0) * 0.7 + max(dot(N, L2), 0.0) * 0.35 + mix(0.5, 0.28, uGloss);
  vec3 R = reflect(-V, N);
  vec3 env = studio(R);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float spec = pow(max(dot(normalize(L + V), N), 0.0), mix(14.0, 90.0, uGloss));

  // satin: a soft sheen that rides the edges of every fold
  vec3 soft = uColor * diff + env * (0.03 + fres * 0.4) * uGloss + (uColor * 0.6 + 0.4) * spec * (0.1 + 0.55 * uGloss) + uColor * fres * 0.25;
  vec3 metal = uColor * env * 1.25 + vec3(1.0, 0.95, 0.85) * spec * 0.6;
  vec3 col = mix(soft, metal, uMetal);
  col *= mix(1.0, 0.62, inside);
  col *= mix(1.0, 0.9, vW * vW * (1.0 - fres));        // the hem falls a little into shade
  col = col / (col + vec3(0.72)) * 1.55;
  gl_FragColor = vec4(pow(col, vec3(0.92)), 1.0);
}`;

const hexToRgb = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  const n = m ? parseInt(m[1], 16) : 0xe8257d;
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Math.pow(v, 1.6)) as [number, number, number];
};

export function Dress3D({ color, className, onFail }: { color: string; className?: string; onFail?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(color);
  const kick = useRef(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (colorRef.current !== color) kick.current = 9; // a twirl when the colour changes
    colorRef.current = color;
  }, [color]);

  useEffect(() => { if (failed) onFail?.(); }, [failed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) { setFailed(true); return; }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "shader");
      return sh;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch (e) {
      console.warn("[Dress3D]", e);
      setFailed(true);
      return;
    }
    gl.useProgram(prog);
    const loc = {
      pos: gl.getAttribLocation(prog, "aPos"), nor: gl.getAttribLocation(prog, "aNor"), w: gl.getAttribLocation(prog, "aW"),
      mv: gl.getUniformLocation(prog, "uMV"), proj: gl.getUniformLocation(prog, "uProj"),
      color: gl.getUniformLocation(prog, "uColor"), metal: gl.getUniformLocation(prog, "uMetal"), gloss: gl.getUniformLocation(prog, "uGloss"),
      flare: gl.getUniformLocation(prog, "uFlare"), sway: gl.getUniformLocation(prog, "uSway"), time: gl.getUniformLocation(prog, "uTime"), pleat: gl.getUniformLocation(prog, "uPleat"),
    };
    const make = (data: Float32Array | Uint16Array, target: number) => { const b = gl.createBuffer()!; gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
    const buffers = Object.fromEntries(
      Object.entries(PARTS).map(([name, mesh]) => [name, {
        pos: make(mesh.pos, gl.ARRAY_BUFFER), nor: make(mesh.nor, gl.ARRAY_BUFFER), wgt: make(mesh.wgt, gl.ARRAY_BUFFER),
        idx: make(mesh.idx, gl.ELEMENT_ARRAY_BUFFER), count: mesh.idx.length,
      }]),
    ) as Record<keyof typeof PARTS, { pos: WebGLBuffer; nor: WebGLBuffer; wgt: WebGLBuffer; idx: WebGLBuffer; count: number }>;
    gl.enable(gl.DEPTH_TEST);
    gl.enableVertexAttribArray(loc.pos);
    gl.enableVertexAttribArray(loc.nor);
    gl.enableVertexAttribArray(loc.w);

    const draw = (part: keyof typeof PARTS, mv: M4, rgb: number[], metal: number, gloss: number) => {
      const b = buffers[part];
      gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.vertexAttribPointer(loc.pos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.nor); gl.vertexAttribPointer(loc.nor, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.wgt); gl.vertexAttribPointer(loc.w, 1, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
      gl.uniformMatrix4fv(loc.mv, false, mv);
      gl.uniform3f(loc.color, rgb[0], rgb[1], rgb[2]);
      gl.uniform1f(loc.metal, metal); gl.uniform1f(loc.gloss, gloss);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const GOLD = [0.95, 0.72, 0.38], LINEN = hexToRgb("#F3E3D3");
    let shade = hexToRgb(colorRef.current);
    let yaw = 0.5, yawVel = 0, flare = 0, sway = 0, tiltX = 0, targetX = 0, lastScroll = window.scrollY;
    let dragging = false, lastX = 0, raf = 0, visible = true, start = 0, last = 0;
    let w = 0, h = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const ro = new ResizeObserver(resize); ro.observe(canvas); resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || !w || !h) return;
      if (!start) { start = now; last = now; }
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const t = (now - start) / 1000;

      const target = hexToRgb(colorRef.current);
      shade = shade.map((v, i) => v + (target[i] - v) * Math.min(dt * 6, 1)) as [number, number, number];

      // scrolling the page turns the dress too
      const sy = window.scrollY; const ds = sy - lastScroll; lastScroll = sy;
      if (!reduced) yawVel += Math.max(-3, Math.min(3, ds * 0.02));

      if (kick.current) { yawVel += kick.current; kick.current = 0; }
      const spin = (reduced ? 0 : 0.45) + yawVel;
      if (!dragging) { yaw += spin * dt; yawVel *= Math.pow(0.12, dt); }
      const speed = Math.abs(dragging ? yawVel : spin);
      flare += (Math.min(speed / 7, 1) - flare) * Math.min(dt * (speed / 7 > flare ? 5 : 1.6), 1);
      sway += ((dragging ? yawVel : spin) * -0.09 - sway) * Math.min(dt * 3, 1);
      tiltX += (targetX - tiltX) * Math.min(dt * 4, 1);

      const aspect = w / h;
      const dist = aspect < 0.75 ? 9.6 + (0.75 - aspect) * 9 : 9.6;
      gl.uniformMatrix4fv(loc.proj, false, perspective((30 * Math.PI) / 180, aspect, 1, 40));
      gl.uniform1f(loc.flare, flare); gl.uniform1f(loc.sway, sway); gl.uniform1f(loc.time, t); gl.uniform1f(loc.pleat, 1);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const intro = reduced ? 1 : 1 - Math.pow(1 - Math.min(t / 1.4, 1), 3);
      const bob = reduced ? 0 : Math.sin(t * 1.1) * 0.03;
      const view = chain(translate(0, 0.16 + bob - (1 - intro) * 0.6, -dist), rotX(0.13 + tiltX));
      const body = chain(view, rotY(yaw + (1 - intro) * 4), scale(1.12 * (0.7 + 0.3 * intro)));
      // the torso of a dress form is wider than it is deep
      const torso = mul(body, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.78, 0, 0, 0, 0, 1]));

      draw("foot", body, GOLD, 1, 1);
      draw("pole", body, GOLD, 1, 1);
      draw("bodice", torso, shade, 0, 0.5);
      draw("neck", torso, LINEN, 0, 0.15);
      draw("knob", body, GOLD, 1, 1);
      draw("belt", torso, GOLD, 1, 1);
      draw("skirt", body, shade, 0, 0.55);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; last = performance.now(); lastScroll = window.scrollY; });
    io.observe(canvas);

    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; yawVel = 0; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; };
    const move = (e: PointerEvent) => {
      if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; yaw += dx * 0.012; yawVel = yawVel * 0.6 + dx * 0.45; }
    };
    const up = () => { dragging = false; canvas.style.cursor = "grab"; };
    const hover = (e: PointerEvent) => { targetX = ((e.clientY / window.innerHeight) - 0.5) * 0.16; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("pointermove", hover, { passive: true });

    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("pointermove", hover);
    };
  }, []);

  if (failed) return null;
  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ touchAction: "pan-y", cursor: "grab" }}
      aria-label="3D dress. Drag to twirl."
      role="img"
      data-testid="canvas-dress-3d"
    />
  );
}
