import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, Line, PerformanceMonitor, Preload, RoundedBox, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

// Real car: "CarConcept" by Eric Chadwick (Darmstadt Graphics Group), CC BY 4.0 — see /models/CREDITS.md.
const CAR_URL = '/models/car.glb';
const PAINT = null; // default Carmine; or a KHR_materials_variants name: 'Pearl' | 'Graphite'

// Camera shots, one per landing section (index matches data-shot in LandingPage).
// Targets sit left of the subject so the car lands on the right, clear of the text column.
export const SHOTS = [
  { pos: [6.6, 1.1, 7.5], target: [-2.6, 0.6, 0.3] },  // 0 hero: low 3/4 front, press-shot angle
  { pos: [2.6, 2.3, 9.4], target: [-2.5, 0.35, 0] },  // 1 about: side view, body turns to X-ray
  { pos: [0, 15, 7], target: [0, 0, -6] },             // 2 services: overhead over the route map
  { pos: [-0.9, 1.6, 5.0], target: [-4.2, 0.95, 1.3] },// 3 how it works: close on charger + cable
  { pos: [-9, 5.5, 8], target: [0, 0.6, -2] },         // 4 partners: sweeping pull-back
  { pos: [0, 2.2, 10.5], target: [0, 0.8, 0] },        // 5 call to action: straight-on finale
];

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (t) => t * t * (3 - 2 * t);

function CameraRig({ progressRef, reducedMotion }) {
  const { camera } = useThree();
  const lookAt = useRef(new THREE.Vector3(...SHOTS[0].target));
  const goalPos = useRef(new THREE.Vector3());
  const goalTarget = useRef(new THREE.Vector3());

  useFrame((state, delta) => {
    const p = Math.min(Math.max(progressRef.current, 0), SHOTS.length - 1);
    const i = Math.min(Math.floor(p), SHOTS.length - 2);
    const t = smooth(p - i);
    let pos = lerp3(SHOTS[i].pos, SHOTS[i + 1].pos, t);
    let tgt = lerp3(SHOTS[i].target, SHOTS[i + 1].target, t);

    // Portrait screens: centre the subject, widen the lens and slide the image up so the car
    // sits in the top third, clear of the hero text.
    const { width: w, height: h } = state.size;
    const portrait = w / h < 0.9;
    const fov = portrait ? 58 : 40;
    const offsetY = portrait ? Math.round(h * 0.24) : 0;
    if (camera.fov !== fov || (camera.view?.offsetY ?? 0) !== offsetY) {
      camera.fov = fov;
      if (offsetY) camera.setViewOffset(w, h, 0, offsetY, w, h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
    }
    if (portrait) {
      tgt = [tgt[0] * 0.15, tgt[1], tgt[2]];
      pos = [pos[0] * 1.15, pos[1], pos[2] * 1.15];
    }

    const drift = reducedMotion ? 0 : 0.12;
    const time = state.clock.elapsedTime;
    goalPos.current.set(pos[0] + Math.sin(time * 0.25) * drift, pos[1] + Math.sin(time * 0.33) * drift * 0.5, pos[2]);
    goalTarget.current.set(...tgt);

    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 3.2);
    camera.position.lerp(goalPos.current, k);
    lookAt.current.lerp(goalTarget.current, k);
    camera.lookAt(lookAt.current);
  });
  return null;
}

// Applies a KHR_materials_variants paint option by name.
async function selectVariant(gltf, name) {
  const variants = gltf.parser.json.extensions?.KHR_materials_variants?.variants || [];
  const index = variants.findIndex((v) => v.name.toLowerCase().includes(name.toLowerCase()));
  if (index < 0) return;
  const jobs = [];
  gltf.scene.traverse((obj) => {
    const mappings = obj.isMesh && obj.userData.gltfExtensions?.KHR_materials_variants?.mappings;
    const mapping = mappings?.find((m) => m.variants.includes(index));
    if (mapping) jobs.push(gltf.parser.getDependency('material', mapping.material).then((mat) => { obj.material = mat; }));
  });
  await Promise.all(jobs);
}

// Restyles the stock materials toward a glossy red sports-EV look (deep red, black glass roof, dark wheels).
function styleForLook(mat) {
  switch (mat.name) {
    case 'PaletteMaterial007': // main body paint
      // Real automotive red is a dielectric base coat under clearcoat; full metalness mirrored the dark scene.
      mat.color.set('#d4111b');
      mat.metalness = 0.18;
      mat.roughness = 0.38;
      mat.clearcoat = 1;
      mat.clearcoatRoughness = 0.03;
      if (mat.normalScale) mat.normalScale.set(0.25, 0.25);
      mat.envMapIntensity = 1.4;
      break;
    case 'PaletteMaterial006': // roof shell -> black glass roof
      mat.color.set('#101216');
      mat.roughness = 0.12;
      mat.clearcoat = 1;
      mat.clearcoatRoughness = 0.01;
      break;
    case 'Rim2': // chrome spokes -> dark gunmetal
      mat.color.set('#2a2d33');
      mat.roughness = 0.28;
      break;
    default:
  }
}

// The real car model. Its paint fades to an X-ray look on the battery shot (shot 1),
// revealing the glowing pack inside.
function RealCar({ progressRef, onReady }) {
  const gltf = useGLTF(CAR_URL, false, true);
  const paints = useRef([]);
  const interior = useRef([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (PAINT ? selectVariant(gltf, PAINT) : Promise.resolve()).then(() => {
      if (cancelled) return;
      const list = [];
      const inside = [];
      gltf.scene.traverse((obj) => {
        if (!obj.isMesh) return;
        const mat = obj.material;
        // Transmission re-renders the whole scene every frame; translucent glass looks the same here at a fraction of the cost.
        if (mat.transmission > 0) {
          mat.transmission = 0;
          mat.transparent = true;
          mat.color.set('#07090d'); // dark tinted glass, as on the reference car
          mat.opacity = 0.88;
          mat.roughness = 0.03;
          mat.metalness = 0.6;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
        styleForLook(mat);
        // Body shell parts fade for the X-ray shot (lights and glass stay as they are).
        if (mat.iridescence) { mat.iridescence = 0; mat.needsUpdate = true; } // costly per pixel, invisible at this size
        if (/^Body/.test(obj.name) && !/light|signal|windshield|gasket|wiper/i.test(obj.name)) {
          obj.material = mat.clone(); // own copy so shared materials (wheels, trim) never fade
          obj.material.transparent = true; // set once here: toggling it mid-scroll forced material rebuilds
          list.push(obj.material);
        } else if (/^Interior/.test(obj.name)) {
          // Seats and dash fade almost fully so the battery pack reads clearly in the X-ray.
          obj.material = mat.clone();
          obj.material.transparent = true;
          inside.push(obj.material);
        }
      });
      paints.current = list;
      interior.current = inside;
      setReady(true);
      onReady?.();
    });
    return () => { cancelled = true; };
  }, [gltf]);

  useFrame(() => {
    const xray = Math.max(0, 1 - Math.abs(progressRef.current - 1) * 1.6);
    // Only opacity and depthWrite change per frame; neither needs a material rebuild.
    const fade = (mats, amount) => mats.forEach((mat) => {
      mat.depthWrite = xray < 0.02;
      mat.opacity = 1 - amount * xray;
    });
    fade(paints.current, 0.82);
    fade(interior.current, 0.94);
  });

  // Model is ~4.4 m long along +Z with the front at +Z; turn it so the nose points to +X.
  return (
    <group rotation={[0, Math.PI / 2, 0]} position={[-0.24, 0, 0]} visible={ready}>
      <primitive object={gltf.scene} />
    </group>
  );
}
useGLTF.preload(CAR_URL, false, true);

// Fades every material in a group by an opacity function of scroll progress; hides it at zero.
function useFade(ref, progressRef, alphaAt) {
  const mats = useRef([]);
  // Prepare materials at mount, before <Preload> compiles shaders, so nothing rebuilds mid-scroll.
  useLayoutEffect(() => {
    const list = [];
    ref.current?.traverse((o) => o.material && list.push({ m: o.material, base: o.material.opacity ?? 1 }));
    list.forEach(({ m }) => { m.transparent = true; });
    mats.current = list;
  }, [ref]);
  useFrame(() => {
    const group = ref.current;
    if (!group) return;
    const a = Math.min(1, Math.max(0, alphaAt(progressRef.current)));
    group.visible = a > 0.01;
    mats.current.forEach(({ m, base }) => { m.opacity = base * a; });
  });
}

// Under-floor pack: 6 x 3 modules between the axles, inside a thin housing, shown in the X-ray shot.
function BatteryPack({ progressRef }) {
  const group = useRef();
  const ref = useRef();
  const cells = useMemo(() => {
    const out = [];
    for (let x = 0; x < 6; x++) for (let z = 0; z < 3; z++) out.push([-0.8 + x * 0.32, 0, -0.38 + z * 0.38]);
    return out;
  }, []);
  const color = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    cells.forEach((c, i) => {
      dummy.position.set(c[0], c[1], c[2]);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [cells]);

  useFade(group, progressRef, (p) => 1 - Math.abs(p - 1) * 1.8);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh || !group.current?.visible) return;
    const t = clock.elapsedTime;
    cells.forEach((c, i) => {
      const wave = 0.5 + 0.5 * Math.sin(t * 2.2 - c[0] * 3); // a charge wave travels along the pack
      color.setRGB(0.0, 0.5 + 0.5 * wave, 0.45 + 0.3 * wave);
      mesh.setColorAt(i, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={group} position={[-0.1, 0.17, 0]}>
      <instancedMesh ref={ref} args={[null, null, cells.length]}>
        <boxGeometry args={[0.29, 0.05, 0.34]} />
        <meshStandardMaterial emissive="#1fdcc5" emissiveIntensity={0.8} toneMapped={false} />
      </instancedMesh>
      <mesh>
        <boxGeometry args={[2.0, 0.08, 1.2]} />
        <meshStandardMaterial color="#38bdf8" wireframe opacity={0.5} />
      </mesh>
    </group>
  );
}

// Cable from the charger to the car's rear charge port, with energy pulses flowing along it.
function ChargingCable({ reducedMotion, progressRef }) {
  const group = useRef();
  useFade(group, progressRef, (p) => Math.abs(p - 1) * 2 - 0.2);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-2.85, 1.2, 1.9),
        new THREE.Vector3(-2.65, 0.2, 2.15),
        new THREE.Vector3(-2.15, 0.08, 1.75),
        new THREE.Vector3(-1.85, 0.45, 1.2),
        new THREE.Vector3(-1.78, 0.74, 1.02),
      ]),
    []
  );
  const pulses = useRef([]);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    const t = clock.elapsedTime;
    pulses.current.forEach((m, i) => m && m.position.copy(curve.getPointAt((t * 0.35 + i / 6) % 1)));
  });
  return (
    <group ref={group}>
      <mesh>
        <tubeGeometry args={[curve, 64, 0.03, 8, false]} />
        <meshStandardMaterial color="#0b0f17" roughness={0.45} metalness={0.2} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => (
        <mesh key={i} ref={(el) => (pulses.current[i] = el)} position={curve.getPointAt(i / 6)}>
          <sphereGeometry args={[0.045, 10, 10]} />
          <meshStandardMaterial emissive="#1fdcc5" emissiveIntensity={5} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Charger({ progressRef }) {
  const group = useRef();
  useFade(group, progressRef, (p) => Math.abs(p - 1) * 2 - 0.2);
  return (
    <group ref={group} position={[-2.95, 0, 1.75]} rotation={[0, 0.6, 0]}>
      <RoundedBox args={[0.5, 1.75, 0.36]} radius={0.06} position={[0, 0.875, 0]}>
        <meshPhysicalMaterial color="#e2e8f0" metalness={0.3} roughness={0.25} clearcoat={1} />
      </RoundedBox>
      <mesh position={[0, 1.3, 0.185]}>
        <planeGeometry args={[0.34, 0.4]} />
        <meshStandardMaterial color="#021c1a" emissive="#1fdcc5" emissiveIntensity={1.4} toneMapped={false} />
      </mesh>
      <mesh position={[0, 1.77, 0]}>
        <boxGeometry args={[0.52, 0.03, 0.38]} />
        <meshStandardMaterial emissive="#38bdf8" emissiveIntensity={3} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.3, 0.6]} color="#1fdcc5" intensity={3} distance={4} />
    </group>
  );
}

function City() {
  const ref = useRef();
  const buildings = useMemo(() => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 70 }, () => {
      const angle = r() * Math.PI * 2;
      const dist = 20 + r() * 20;
      return { x: Math.cos(angle) * dist, z: Math.sin(angle) * dist - 4, h: 1.5 + r() * 9, w: 0.8 + r() * 1.8 };
    });
  }, []);
  useEffect(() => {
    const dummy = new THREE.Object3D();
    buildings.forEach((b, i) => {
      dummy.position.set(b.x, b.h / 2, b.z);
      dummy.scale.set(b.w, b.h, b.w);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [buildings]);
  return (
    <instancedMesh ref={ref} args={[null, null, buildings.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#0b1222" emissive="#0e2a47" emissiveIntensity={0.3} roughness={0.85} />
    </instancedMesh>
  );
}

// Glowing route with station pins, seen from the overhead "services" shot.
function RouteMap({ progressRef }) {
  const group = useRef();
  useFade(group, progressRef, (p) => 1.4 - Math.abs(p - 2) * 1.6);
  const points = useMemo(() => [[-7, 0.03, -2], [-4, 0.03, -5], [-1, 0.03, -4], [2, 0.03, -8], [5, 0.03, -7], [8, 0.03, -11]], []);
  return (
    <group ref={group}>
      <Line points={points} color="#1fdcc5" lineWidth={3} />
      {points.map((p, i) => (
        <group key={i} position={[p[0], 0, p[2]]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
            <ringGeometry args={[0.35, 0.5, 32]} />
            <meshStandardMaterial emissive="#38bdf8" emissiveIntensity={2} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <octahedronGeometry args={[0.18]} />
            <meshStandardMaterial emissive="#1fdcc5" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#070c17" roughness={0.6} metalness={0.2} />
      </mesh>
      <gridHelper args={[80, 80, '#10283f', '#0a1729']} position={[0, 0.004, 0]} />
      {/* Asphalt road the car sits on, with dashed lane markings and a solid edge line. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[60, 7.5]} />
        <meshStandardMaterial color="#14171d" roughness={0.88} metalness={0.05} />
      </mesh>
      {Array.from({ length: 20 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-28 + i * 3, 0.007, -2.4]}>
          <planeGeometry args={[1.6, 0.12]} />
          <meshStandardMaterial color="#d6d3c4" roughness={0.7} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.007, 3.6]}>
        <planeGeometry args={[60, 0.1]} />
        <meshStandardMaterial color="#d6d3c4" roughness={0.7} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
        <ringGeometry args={[2.75, 2.82, 96]} />
        <meshStandardMaterial emissive="#1fdcc5" emissiveIntensity={1} toneMapped={false} />
      </mesh>
      {/* Baked once (frames=1): a soft, realistic contact shadow without per-frame shadow maps. */}
      <ContactShadows position={[0, 0.01, 0]} scale={9} blur={2.4} far={2} opacity={0.75} resolution={512} frames={1} />
    </group>
  );
}

function EvScene({ progressRef, reducedMotion = false, onReady }) {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas
      dpr={dpr}
      camera={{ position: SHOTS[0].pos, fov: 40, near: 0.1, far: 200 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      aria-hidden="true"
    >
      {/* One-way: drop to 1x if the GPU struggles, never bounce back (each switch resizes the canvas). */}
      <PerformanceMonitor flipflops={1} onDecline={() => setDpr(1)} />
      <color attach="background" args={['#050913']} />
      <fog attach="fog" args={['#050913', 14, 44]} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[5, 8, 5]} intensity={1.1} />
      <spotLight position={[-3, 6, 4]} angle={0.6} penumbra={1} intensity={40} color="#a5f3fc" />
      <Suspense fallback={null}>
        {/* Rendered once: a sky-like softbox and long strip lights give press-photo reflections on the paint. */}
        <Environment resolution={256} frames={1} environmentIntensity={1.3}>
          <Lightformer form="rect" intensity={2.2} color="#dbeafe" scale={[18, 6, 1]} position={[0, 7, 0]} rotation={[Math.PI / 2, 0, 0]} />
          <Lightformer form="rect" intensity={3} color="#ffffff" scale={[12, 0.6, 1]} position={[0, 2.5, 6]} />
          <Lightformer form="rect" intensity={2} color="#ffffff" scale={[12, 0.6, 1]} position={[0, 1.6, -6]} rotation={[0, Math.PI, 0]} />
          <Lightformer form="rect" intensity={1.2} color="#fde7c7" scale={[3, 8, 1]} position={[8, 3, 2]} rotation={[0, -Math.PI / 2, 0]} />
          <Lightformer form="ring" intensity={1.5} color="#5eead4" scale={3} position={[-8, 3, -2]} rotation={[0, Math.PI / 2, 0]} />
        </Environment>
        <RealCar progressRef={progressRef} onReady={onReady} />
        {/* Inside Suspense so it runs once the car is loaded: compiles every shader, including hidden objects. */}
        <Preload all />
      </Suspense>
      <BatteryPack progressRef={progressRef} />
      <Charger progressRef={progressRef} />
      <ChargingCable reducedMotion={reducedMotion} progressRef={progressRef} />
      <Ground />
      <RouteMap progressRef={progressRef} />
      <City />
      <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
    </Canvas>
  );
}

export default React.memo(EvScene);
