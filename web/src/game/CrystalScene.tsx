import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from "react";
import * as THREE from "three";
import type { Level } from "./levels";
import type { DifficultyId, ThemeId } from "./progress";

export type CrystalSceneHandle = {
  hint: () => void;
  reset: () => void;
};

type Props = {
  interactionTargetRef?: RefObject<HTMLElement | null>;
  level: Level;
  levelName: string;
  levelIndex: number;
  difficulty: DifficultyId;
  theme: ThemeId;
  paused: boolean;
  onScore: (score: number) => void;
  onSolved: () => void;
  onInteract?: () => void;
};

type SceneApi = CrystalSceneHandle;

const DIFFICULTY_SETTINGS = {
  easy: { depth: 0.58, solveAngle: 0.25, settleMs: 260, targetOpacity: 0.12, hintStrength: 0.74 },
  normal: { depth: 0.82, solveAngle: 0.18, settleMs: 380, targetOpacity: 0.075, hintStrength: 0.62 },
  hard: { depth: 0.94, solveAngle: 0.115, settleMs: 540, targetOpacity: 0.042, hintStrength: 0.5 },
} as const;

const THEME_PALETTES = {
  orbit: { particleA: 0x3bc4eb, particleB: 0xebffff, sphere: 0x5dc9df, rim: 0x8feeff, light: 0xb8f7ff, target: "rgba(105, 226, 245, .52)", victoryA: "#f3ffff", victoryB: "#22bfdc" },
  cartoon: { particleA: 0xff71c6, particleB: 0xfff7a8, sphere: 0x8b7bff, rim: 0xff9edd, light: 0xffe6a8, target: "rgba(255, 111, 199, .58)", victoryA: "#fffbd1", victoryB: "#ff61bc" },
  cozy: { particleA: 0xd99b55, particleB: 0xfff0c9, sphere: 0x77a79a, rim: 0xe8bb7a, light: 0xffddb0, target: "rgba(222, 169, 100, .56)", victoryA: "#fff7da", victoryB: "#c98245" },
  deco: { particleA: 0xd8aa53, particleB: 0xfff2bd, sphere: 0x82659a, rim: 0xe9c46a, light: 0xffe6a6, target: "rgba(229, 190, 100, .55)", victoryA: "#fff5ca", victoryB: "#c68b37" },
} as const;

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function createGlyphCanvas(path: string, color: string, bright = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 320;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(32, 32);
  context.scale(10.66, 10.66);
  context.fillStyle = bright ? color.replace(/\.[0-9]+\)$/, ".92)") : color;
  context.shadowColor = color.replace(/\.[0-9]+\)$/, ".9)");
  context.shadowBlur = bright ? 1.6 : 1;
  context.fill(new Path2D(path));
  context.restore();
  return canvas;
}

function createVictoryCanvas(path: string, colorA: string, colorB: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const shape = new Path2D(path);
  context.save();
  context.translate(42, 42);
  context.scale(17.83, 17.83);
  const gradient = context.createLinearGradient(2, 1, 22, 24);
  gradient.addColorStop(0, colorA);
  gradient.addColorStop(0.38, colorA);
  gradient.addColorStop(1, colorB);
  context.shadowColor = colorB;
  context.shadowBlur = 1.25;
  context.fillStyle = gradient;
  context.fill(shape);
  context.shadowBlur = 0.65;
  context.lineWidth = 0.42;
  context.strokeStyle = "rgba(238, 255, 255, .98)";
  context.stroke(shape);
  context.restore();
  return canvas;
}

function createParticleGeometry(path: string, levelIndex: number, difficulty: number, depth: number, targetColor: string) {
  const canvas = createGlyphCanvas(path, targetColor, true);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const random = seededRandom(104729 + levelIndex * 7919);
  const candidates: Array<[number, number]> = [];
  const spacing = difficulty === 1 ? 7 : difficulty === 2 ? 6 : 5;

  for (let y = 24; y < 296; y += spacing) {
    for (let x = 24; x < 296; x += spacing) {
      const jitterX = Math.min(319, Math.max(0, x + Math.floor((random() - 0.5) * spacing)));
      const jitterY = Math.min(319, Math.max(0, y + Math.floor((random() - 0.5) * spacing)));
      if (pixels[(jitterY * 320 + jitterX) * 4 + 3] > 80) candidates.push([jitterX, jitterY]);
    }
  }

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const swap = Math.floor(random() * (i + 1));
    [candidates[i], candidates[swap]] = [candidates[swap], candidates[i]];
  }

  const targetCount = 175 + difficulty * 34;
  const selected = candidates.slice(0, Math.min(targetCount, candidates.length));
  const positions = new Float32Array(selected.length * 3);
  const sizes = new Float32Array(selected.length);

  selected.forEach(([pixelX, pixelY], index) => {
    const x = ((pixelX / 320) - 0.5) * 1.42;
    const y = -((pixelY / 320) - 0.5) * 1.42;
    const chord = Math.sqrt(Math.max(0.03, 0.82 * 0.82 - x * x - y * y));
    const z = (random() * 2 - 1) * chord * depth;
    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    sizes[index] = 0.7 + random() * 0.7;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function createParticleMaterial(colorA: number, colorB: number) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uPointSize: { value: 5.2 },
      uGlow: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: `
      attribute float aSize;
      uniform float uPixelRatio;
      uniform float uPointSize;
      uniform float uGlow;
      uniform float uTime;
      varying float vPulse;
      void main() {
        vec4 modelPosition = modelMatrix * vec4(position, 1.0);
        vec4 viewPosition = viewMatrix * modelPosition;
        gl_Position = projectionMatrix * viewPosition;
        float shimmer = 0.92 + sin(uTime * 1.9 + position.x * 14.0 + position.z * 8.0) * 0.08;
        gl_PointSize = (uPointSize + uGlow * 3.8) * aSize * uPixelRatio * shimmer;
        vPulse = shimmer;
      }
    `,
    fragmentShader: `
      uniform float uGlow;
      uniform float uOpacity;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying float vPulse;
      void main() {
        float distanceToCenter = distance(gl_PointCoord, vec2(0.5));
        float core = 1.0 - smoothstep(0.10, 0.46, distanceToCenter);
        float halo = 1.0 - smoothstep(0.18, 0.50, distanceToCenter);
        float alpha = core * 0.88 + halo * (0.26 + uGlow * 0.42);
        vec3 color = mix(uColorA, uColorB, core + uGlow * 0.35);
        gl_FragColor = vec4(color * (0.85 + vPulse * 0.25), alpha * uOpacity);
      }
    `,
  });
}

const CrystalScene = forwardRef<CrystalSceneHandle, Props>(function CrystalScene(
  { interactionTargetRef, level, levelName, levelIndex, difficulty, theme, paused, onScore, onSolved, onInteract },
  forwardedRef,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const pausedRef = useRef(paused);
  const callbacksRef = useRef({ onScore, onSolved, onInteract });

  pausedRef.current = paused;
  callbacksRef.current = { onScore, onSolved, onInteract };

  useImperativeHandle(forwardedRef, () => ({
    hint: () => apiRef.current?.hint(),
    reset: () => apiRef.current?.reset(),
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const difficultySettings = DIFFICULTY_SETTINGS[difficulty];
    const palette = THEME_PALETTES[theme];

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1.35, 1.35, 1.35, -1.35, 0.1, 20);
    camera.position.set(0, 0, 4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute("aria-label", `Хрустальная сфера. Силуэт: ${levelName}`);
    renderer.domElement.setAttribute("role", "img");
    mount.appendChild(renderer.domElement);
    const interactionTarget = interactionTargetRef?.current ?? renderer.domElement;

    const constellation = new THREE.Group();
    scene.add(constellation);
    const particleGeometry = createParticleGeometry(level.path, levelIndex, level.difficulty, difficultySettings.depth, palette.target);
    const particleMaterial = createParticleMaterial(palette.particleA, palette.particleB);
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.renderOrder = 2;
    constellation.add(particles);

    const targetTexture = new THREE.CanvasTexture(createGlyphCanvas(level.path, palette.target));
    targetTexture.colorSpace = THREE.SRGBColorSpace;
    const targetMaterial = new THREE.MeshBasicMaterial({
      map: targetTexture,
      transparent: true,
      opacity: difficultySettings.targetOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const target = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 1.42), targetMaterial);
    target.position.z = -1.04;
    target.renderOrder = 0;
    scene.add(target);

    const victoryTexture = new THREE.CanvasTexture(createVictoryCanvas(level.path, palette.victoryA, palette.victoryB));
    victoryTexture.colorSpace = THREE.SRGBColorSpace;
    victoryTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const victoryMaterial = new THREE.MeshBasicMaterial({
      map: victoryTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const victoryShape = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), victoryMaterial);
    victoryShape.position.z = 0.46;
    victoryShape.scale.setScalar(0.5);
    victoryShape.renderOrder = 7;
    scene.add(victoryShape);

    const victoryRingMaterial = new THREE.MeshBasicMaterial({
      color: palette.rim,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });
    const victoryRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.565, 96), victoryRingMaterial);
    victoryRing.position.z = 0.42;
    victoryRing.scale.setScalar(0.4);
    victoryRing.renderOrder = 6;
    scene.add(victoryRing);

    const sphereMaterial = new THREE.MeshPhysicalMaterial({
      color: palette.sphere,
      transparent: true,
      opacity: 0.11,
      transmission: 0.42,
      thickness: 0.35,
      roughness: 0.09,
      metalness: 0.02,
      ior: 1.24,
      iridescence: 0.35,
      iridescenceIOR: 1.3,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.94, 64, 48), sphereMaterial);
    sphere.renderOrder = 3;
    scene.add(sphere);

    const rimMaterial = new THREE.MeshBasicMaterial({ color: palette.rim, transparent: true, opacity: 0.045, wireframe: true, depthWrite: false });
    const rim = new THREE.Mesh(new THREE.SphereGeometry(0.946, 32, 18), rimMaterial);
    rim.scale.set(1, 1, 0.998);
    rim.renderOrder = 4;
    scene.add(rim);

    const light = new THREE.DirectionalLight(palette.light, 2.2);
    light.position.set(-2, 3, 4);
    scene.add(light, new THREE.AmbientLight(0x4bbad0, 1.1));

    const random = seededRandom(61813 + levelIndex * 3571);
    const scramble = () => {
      const x = (0.72 + random() * 1.2) * (random() > 0.5 ? 1 : -1);
      const y = (0.8 + random() * 1.35) * (random() > 0.5 ? 1 : -1);
      const z = (0.35 + random() * 1.1) * (random() > 0.5 ? 1 : -1);
      constellation.quaternion.setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
      solved = false;
      solvedAt = 0;
      alignStartedAt = 0;
      particleMaterial.uniforms.uGlow.value = 0;
      particleMaterial.uniforms.uOpacity.value = 1;
      targetMaterial.opacity = difficultySettings.targetOpacity;
      victoryMaterial.opacity = 0;
      victoryShape.scale.setScalar(0.5);
      victoryRingMaterial.opacity = 0;
      victoryRing.scale.setScalar(0.4);
      callbacksRef.current.onScore(0);
    };

    let dragging = false;
    let pointerId = -1;
    let lastX = 0;
    let lastY = 0;
    let solved = false;
    let solvedAt = 0;
    let alignStartedAt = 0;
    let lastReportedScore = -1;
    const identity = new THREE.Quaternion();
    const rotation = new THREE.Quaternion();
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisY = new THREE.Vector3(0, 1, 0);

    const rotateBy = (dx: number, dy: number) => {
      if (pausedRef.current || solved) return;
      rotation.setFromAxisAngle(axisY, dx * 0.009);
      constellation.quaternion.premultiply(rotation);
      rotation.setFromAxisAngle(axisX, dy * 0.009);
      constellation.quaternion.premultiply(rotation);
      constellation.quaternion.normalize();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (pausedRef.current || solved) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      pointerId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      interactionTarget.setPointerCapture(event.pointerId);
      interactionTarget.classList.add("is-dragging");
      callbacksRef.current.onInteract?.();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      rotateBy(dx, dy);
      event.preventDefault();
    };
    const stopDragging = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      dragging = false;
      pointerId = -1;
      interactionTarget.classList.remove("is-dragging");
      if (interactionTarget.hasPointerCapture(event.pointerId)) {
        interactionTarget.releasePointerCapture(event.pointerId);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (pausedRef.current || solved) return;
      const step = event.shiftKey ? 3 : 8;
      if (event.key === "ArrowLeft") rotateBy(-step, 0);
      else if (event.key === "ArrowRight") rotateBy(step, 0);
      else if (event.key === "ArrowUp") rotateBy(0, -step);
      else if (event.key === "ArrowDown") rotateBy(0, step);
      else return;
      event.preventDefault();
      callbacksRef.current.onInteract?.();
    };

    interactionTarget.addEventListener("pointerdown", onPointerDown);
    interactionTarget.addEventListener("pointermove", onPointerMove);
    interactionTarget.addEventListener("pointerup", stopDragging);
    interactionTarget.addEventListener("pointercancel", stopDragging);
    window.addEventListener("keydown", onKeyDown);

    apiRef.current = {
      hint: () => {
        if (pausedRef.current || solved) return;
        constellation.quaternion.slerp(identity, difficultySettings.hintStrength).normalize();
        particleMaterial.uniforms.uGlow.value = 0.8;
      },
      reset: scramble,
    };
    scramble();

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const vertical = 2.42;
      camera.top = vertical / 2;
      camera.bottom = -vertical / 2;
      camera.left = -(vertical * aspect) / 2;
      camera.right = (vertical * aspect) / 2;
      camera.updateProjectionMatrix();
      particleMaterial.uniforms.uPointSize.value = width < 430 ? 4.25 : 5.15;
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    let animationFrame = 0;
    const render = () => {
      animationFrame = requestAnimationFrame(render);
      const time = clock.getElapsedTime();
      if (!pausedRef.current) {
        rim.rotation.y = time * 0.035;
        rim.rotation.x = Math.sin(time * 0.2) * 0.05;
        particleMaterial.uniforms.uTime.value = time;
        particleMaterial.uniforms.uGlow.value *= solved ? 1 : 0.94;

        const angle = 2 * Math.acos(Math.min(1, Math.abs(constellation.quaternion.w)));
        const score = Math.round(100 * Math.pow(Math.max(0, 1 - angle / Math.PI), 1.35));
        if (frame % 5 === 0 && score !== lastReportedScore) {
          lastReportedScore = score;
          callbacksRef.current.onScore(score);
        }

        if (!solved && angle < difficultySettings.solveAngle) {
          if (!alignStartedAt) alignStartedAt = performance.now();
          if (performance.now() - alignStartedAt > difficultySettings.settleMs) {
            solved = true;
            solvedAt = performance.now();
            constellation.quaternion.copy(identity);
            particleMaterial.uniforms.uGlow.value = 1;
            callbacksRef.current.onScore(100);
            callbacksRef.current.onSolved();
          }
        } else if (!solved) {
          alignStartedAt = 0;
        }

        if (solved) {
          const reveal = Math.min(1, (performance.now() - solvedAt) / 1150);
          const eased = reveal * reveal * (3 - 2 * reveal);
          const back = 1 + 2.7 * Math.pow(reveal - 1, 3) + 1.7 * Math.pow(reveal - 1, 2);
          particleMaterial.uniforms.uGlow.value = 0.9 * (1 - reveal);
          particleMaterial.uniforms.uOpacity.value = Math.max(0, 1 - reveal * 3.1);
          targetMaterial.opacity = difficultySettings.targetOpacity * (1 - eased);
          victoryMaterial.opacity = Math.min(1, Math.max(0, (reveal - 0.06) * 4.2));
          victoryShape.scale.setScalar(0.53 + back * 0.47);
          victoryShape.rotation.z = Math.sin(reveal * Math.PI) * -0.025;
          victoryRingMaterial.opacity = Math.max(0, 0.72 * (1 - reveal));
          victoryRing.scale.setScalar(0.45 + eased * 1.25);
          constellation.scale.setScalar(1);
        }
      }
      renderer.render(scene, camera);
      frame += 1;
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      interactionTarget.removeEventListener("pointerdown", onPointerDown);
      interactionTarget.removeEventListener("pointermove", onPointerMove);
      interactionTarget.removeEventListener("pointerup", stopDragging);
      interactionTarget.removeEventListener("pointercancel", stopDragging);
      interactionTarget.classList.remove("is-dragging");
      window.removeEventListener("keydown", onKeyDown);
      apiRef.current = null;
      particleGeometry.dispose();
      particleMaterial.dispose();
      targetTexture.dispose();
      targetMaterial.dispose();
      target.geometry.dispose();
      victoryTexture.dispose();
      victoryMaterial.dispose();
      victoryShape.geometry.dispose();
      victoryRingMaterial.dispose();
      victoryRing.geometry.dispose();
      sphere.geometry.dispose();
      sphereMaterial.dispose();
      rim.geometry.dispose();
      rimMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [difficulty, interactionTargetRef, level, levelIndex, levelName, theme]);

  return <div className="scene-mount" ref={mountRef} />;
});

export default CrystalScene;
