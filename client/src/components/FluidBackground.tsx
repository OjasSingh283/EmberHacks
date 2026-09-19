import { RefObject, useEffect, useRef } from "react";

type Props = {
  theme: "dark" | "light";
};

const VERTEX_SRC = `
attribute vec2 a_pos;

void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SRC = `
precision highp float;

uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_dark;

// Cheap gradient noise.
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = m * p;
    a *= 0.5;
  }

  return v;
}

// Ridged noise yields thin, smoky filaments instead of round clouds.
float fbmRidged(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  float w = 0.0;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

  for (int i = 0; i < 6; i++) {
    float n = 1.0 - abs(noise(p));
    v += a * n * n;
    w += a;
    p = m * p;
    a *= 0.5;
  }

  return v / w;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  vec2 mouse = (u_mouse - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.08;

  vec2 dir = uv - mouse;
  float d = length(dir);

  // Advect the field around the cursor so the smoke trails behind it.
  vec2 p = uv * 1.9 + normalize(dir + 1e-5) * 0.7 / (1.0 + d * 4.0);

  // Gentle swirl so the tendrils curl around the pointer.
  float ang = 0.55 / (1.0 + d * 5.0);
  float sa = sin(ang);
  float ca = cos(ang);
  vec2 rel = p - mouse * 1.9;
  p = mat2(ca, -sa, sa, ca) * rel + mouse * 1.9;

  // Domain warp for the flowing, folding motion.
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(3.7, -t)));
  float density = fbmRidged(p + 1.7 * q + vec2(t * 0.5, t * 0.25));

  // Filaments fade out with distance from the cursor (short trail).
  float falloff = 1.0 - smoothstep(0.10, 0.62, d);
  float smoke = smoothstep(0.48, 0.95, density) * (0.30 + 0.70 * falloff);

  // Luminous head right under the pointer.
  float core = pow(max(0.0, 1.0 - d * 2.2), 2.5);
  float glow = clamp(smoke * 1.05 + core * 0.75, 0.0, 1.25);

  // Single blue palette: deep navy -> blue -> icy highlight.
  vec3 deep = vec3(0.02, 0.09, 0.30);
  vec3 blue = vec3(0.12, 0.40, 0.92);
  vec3 ice = vec3(0.60, 0.86, 1.0);

  vec3 col = mix(deep, blue, smoothstep(0.15, 0.85, density + core * 0.5));
  col = mix(col, ice, clamp(core * 1.1, 0.0, 1.0));

  vec3 bg = mix(vec3(0.933, 0.953, 0.988), vec3(0.020, 0.031, 0.059), u_dark);

  vec3 outc;

  if (u_dark > 0.5) {
    // Additive glow on a dark canvas.
    outc = bg + col * glow * 0.5;
  } else {
    // Ink-in-water look on a light canvas.
    outc = bg * (1.0 - clamp(glow * 0.4, 0.0, 0.8)) + col * glow * 0.3;
  }

  gl_FragColor = vec4(outc, 1.0);
}
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function startShader(
  canvas: HTMLCanvasElement,
  gl: WebGLRenderingContext,
  themeRef: RefObject<"dark" | "light">
): (() => void) | void {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
  if (!vertex || !fragment) return;

  const program = gl.createProgram();
  if (!program) return;

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    return;
  }

  gl.useProgram(program);

  // One oversized triangle covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const posLoc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const resLoc = gl.getUniformLocation(program, "u_res");
  const mouseLoc = gl.getUniformLocation(program, "u_mouse");
  const timeLoc = gl.getUniformLocation(program, "u_time");
  const darkLoc = gl.getUniformLocation(program, "u_dark");

  const reduced = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  let raf = 0;
  let scaleX = 1;
  let scaleY = 1;
  let start = performance.now();
  let active = false;

  const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 };
  const mouse = { ...target };

  function resize() {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = 0.62 * dpr;

    canvas.width = Math.max(1, Math.floor(cssW * scale));
    canvas.height = Math.max(1, Math.floor(cssH * scale));
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    scaleX = canvas.width / cssW;
    scaleY = canvas.height / cssH;

    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function render(now: number) {
    const time = (now - start) / 1000;

    // Ease the light toward the pointer so the fluid trails behind it.
    const ease = active ? 0.1 : 0.03;
    mouse.x += (target.x - mouse.x) * ease;
    mouse.y += (target.y - mouse.y) * ease;

    gl.uniform2f(resLoc, canvas.width, canvas.height);
    // gl_FragCoord uses a bottom-left origin, so flip the pointer's Y.
    gl.uniform2f(
      mouseLoc,
      mouse.x * scaleX,
      canvas.height - mouse.y * scaleY
    );
    gl.uniform1f(timeLoc, reduced ? 4.0 : time);
    gl.uniform1f(darkLoc, themeRef.current === "light" ? 0.0 : 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (!reduced) {
      raf = requestAnimationFrame(render);
    }
  }

  function handleMove(event: PointerEvent) {
    target.x = event.clientX;
    target.y = event.clientY;
    active = true;
  }

  function handleLeave() {
    active = false;
  }

  resize();
  start = performance.now();
  raf = requestAnimationFrame(render);

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerleave", handleLeave);
  window.addEventListener("blur", handleLeave);
  window.addEventListener("resize", resize);

  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerleave", handleLeave);
    window.removeEventListener("blur", handleLeave);
    window.removeEventListener("resize", resize);

    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
  };
}

export default function FluidBackground({ theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "high-performance"
    });

    if (!gl) return;

    return startShader(canvas, gl, themeRef);
  }, []);

  return (
    <div className="fluid" aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}
