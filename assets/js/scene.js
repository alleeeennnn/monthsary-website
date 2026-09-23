/* ============================================================
   Ambient 3D scenes — built per the threejs-3d skill rules:
   - instanced hearts / soft sprite particles (never square points)
   - pixel ratio capped at 2, delta-time movement
   - pointer parallax with prefers-reduced-motion support
   - mobile instance reductions, graceful WebGL failure
   ============================================================ */
(function () {
'use strict';
/* THREE is provided globally by the UMD script tag (three@0.152.2) —
   classic scripts work from file:// where ES module imports do not. */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const MOBILE = window.matchMedia('(max-width: 768px)').matches;

/* Soft circular sprite texture (generated once, offscreen canvas) */
function makeCircleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* Extruded heart geometry, centered and flipped point-down */
function makeHeartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.25, 0.25);
  s.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0);
  s.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35);
  s.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95);
  s.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35);
  s.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0);
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.25, bevelEnabled: true, bevelThickness: 0.05,
    bevelSize: 0.05, bevelSegments: 3, curveSegments: 12
  });
  geo.center();
  geo.rotateZ(Math.PI); /* shape path draws point-up → flip */
  return geo;
}

const HEART_PALETTE = [0xff4d6d, 0xff6b86, 0xffb3c1];
const PARTICLE_PALETTE = [0xffb3c1, 0xff8fa3, 0xffe3ea, 0xffffff];

/**
 * Creates an ambient scene on a canvas.
 * opts: { hearts, particles, dim }
 *   hearts    — number of instanced 3D hearts (0 = none)
 *   particles — number of glowing sprite particles
 *   dim       — true = sparse, quiet lock-screen mood
 */
function createAmbientScene(canvas, opts = {}) {
  const { hearts = 0, particles = 220, dim = false } = opts;

  let renderer;
  try {
    if (typeof THREE === 'undefined') return null; /* CDN unavailable → CSS fallback */
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return null; /* CSS gradient fallback stays visible */
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 0, 9);

  /* Gentle romantic lighting */
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const key = new THREE.DirectionalLight(0xffe3ea, 1.1);
  key.position.set(3, 5, 6);
  scene.add(key);
  const rose = new THREE.PointLight(0xff4d6d, dim ? 6 : 18, 30);
  rose.position.set(-4, 2, 4);
  scene.add(rose);
  /* --- Instanced floating hearts --- */
  const heartCount = hearts ? (MOBILE ? Math.min(hearts, 60) : hearts) : 0;
  let heartMesh = null;
  const heartData = [];
  if (heartCount > 0) {
    const geo = makeHeartGeometry();
    const mat = new THREE.MeshStandardMaterial({
      color: HEART_PALETTE[0],
      emissive: 0xff4d6d,
      emissiveIntensity: 0.35,
      roughness: 0.35,
      metalness: 0.1,
      transparent: true,
      opacity: dim ? 0.5 : 0.9
    });
    heartMesh = new THREE.InstancedMesh(geo, mat, heartCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < heartCount; i++) {
      const d = {
        x: (Math.random() - 0.5) * 18,
        y: (Math.random() - 0.5) * 12,
        z: -2 - Math.random() * 8,
        s: 0.12 + Math.random() * 0.3,
        rise: 0.25 + Math.random() * 0.5,
        spin: (Math.random() - 0.5) * 0.6,
        sway: Math.random() * Math.PI * 2
      };
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, 0, Math.random() * Math.PI * 2);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      heartMesh.setMatrixAt(i, dummy.matrix);
      heartData.push(d);
    }
    heartMesh.instanceMatrix.needsUpdate = true;
    scene.add(heartMesh);
  }
  /* --- Sprite particles (additive glow, soft circles) --- */
  const particleCount = particles ? (MOBILE ? Math.min(particles, 400) : particles) : 0;
  let points = null;
  let pVel = null;
  if (particleCount > 0) {
    const pos = new Float32Array(particleCount * 3);
    const col = new Float32Array(particleCount * 3);
    pVel = new Float32Array(particleCount * 3);
    const c = new THREE.Color();
    for (let i = 0; i < particleCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 2] = -1 - Math.random() * 10;
      pVel[i * 3] = (Math.random() - 0.5) * 0.12;
      pVel[i * 3 + 1] = 0.1 + Math.random() * 0.25;
      pVel[i * 3 + 2] = 0;
      c.setHex(PARTICLE_PALETTE[Math.floor(Math.random() * PARTICLE_PALETTE.length)]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: dim ? 0.09 : 0.12,
      map: makeCircleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: dim ? 0.4 : 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    points = new THREE.Points(geo, mat);
    scene.add(points);
  }
  /* --- Pointer parallax (eased, skipped with reduced motion) --- */
  const pointer = { x: 0, y: 0 };
  if (!REDUCED) {
    window.addEventListener('pointermove', (e) => {
      pointer.x = (e.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  /* --- Render loop (delta-time → framerate-independent speed) --- */
  const clock = new THREE.Clock();
  const dummy = new THREE.Object3D();
  const timeScale = REDUCED ? 0 : 1;
  let raf = 0;
  let running = true;

  function tick() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05) * timeScale;
    const t = clock.elapsedTime * timeScale;

    if (heartMesh) {
      for (let i = 0; i < heartCount; i++) {
        const d = heartData[i];
        d.y += d.rise * dt;
        if (d.y > 7) d.y = -7;
        dummy.position.set(d.x + Math.sin(t * 0.6 + d.sway) * 0.4, d.y, d.z);
        dummy.rotation.set(0, d.spin * t, d.spin * t * 0.7);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        heartMesh.setMatrixAt(i, dummy.matrix);
      }
      heartMesh.instanceMatrix.needsUpdate = true;
    }

    if (points) {
      const arr = points.geometry.attributes.position.array;
      for (let i = 0; i < particleCount; i++) {
        arr[i * 3] += pVel[i * 3] * dt;
        arr[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        if (arr[i * 3 + 1] > 6.5) arr[i * 3 + 1] = -6.5;
        if (arr[i * 3] > 10.5) arr[i * 3] = -10.5;
        if (arr[i * 3] < -10.5) arr[i * 3] = 10.5;
      }
      points.geometry.attributes.position.needsUpdate = true;
    }

    /* ease camera toward pointer */
    camera.position.x += (pointer.x * 0.6 - camera.position.x) * 0.05;
    camera.position.y += (-pointer.y * 0.4 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }
  tick();

  return {
    dispose() {
      running = false;
      cancelAnimationFrame(raf);
      renderer.dispose();
    }
  };
}

/* Expose for the pages (classic-script pattern) */
window.createAmbientScene = createAmbientScene;
})();



