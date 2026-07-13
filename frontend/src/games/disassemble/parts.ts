import * as THREE from 'three';

export type PartId = 'tip' | 'cartridge' | 'barrel' | 'spring' | 'button';

export interface PartDef {
  id: PartId;
  name: string;
  color: number;
  assembledX: number;
}

export const PARTS: PartDef[] = [
  { id: 'tip', name: 'Наконечник', color: 0xc0c8d0, assembledX: -2.35 },
  { id: 'cartridge', name: 'Стержень', color: 0x1a73e8, assembledX: -0.85 },
  { id: 'barrel', name: 'Корпус', color: 0xf5c542, assembledX: 0.65 },
  { id: 'spring', name: 'Пружина', color: 0xa8b4bc, assembledX: 1.95 },
  { id: 'button', name: 'Кнопка', color: 0xe53935, assembledX: 2.45 },
];

export const CONNECTIONS: Array<[PartId, PartId]> = [
  ['tip', 'cartridge'],
  ['cartridge', 'barrel'],
  ['barrel', 'spring'],
  ['spring', 'button'],
];

export function canConnect(a: PartId, b: PartId): boolean {
  return CONNECTIONS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

function mat(opts: {
  color: number;
  metalness?: number;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
  emissive?: number;
}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: opts.color,
    metalness: opts.metalness ?? 0.2,
    roughness: opts.roughness ?? 0.4,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : undefined,
    emissiveIntensity: opts.emissive ? 0.15 : 0,
  });
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  material: THREE.Material,
  segs = 32,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
  m.rotation.z = Math.PI / 2;
  return m;
}

function helixSpring(turns: number, radius: number, tube: number, length: number): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  const steps = Math.max(48, turns * 24);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3((t - 0.5) * length, Math.cos(a) * radius, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, steps, tube, 8, false);
  return new THREE.Mesh(
    geo,
    mat({ color: 0xb0bec5, metalness: 0.85, roughness: 0.25 }),
  );
}

export function createPartMesh(def: PartDef): THREE.Group {
  const group = new THREE.Group();
  group.name = def.id;

  switch (def.id) {
    case 'tip': {
      const chrome = mat({ color: 0xd7dde3, metalness: 0.92, roughness: 0.18 });
      const dark = mat({ color: 0x6b737a, metalness: 0.7, roughness: 0.35 });
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 28), chrome);
      cone.rotation.z = Math.PI / 2;
      cone.position.x = -0.18;
      const collar = cyl(0.22, 0.24, 0.22, chrome);
      collar.position.x = 0.2;
      const thread = cyl(0.2, 0.2, 0.14, dark, 24);
      thread.position.x = 0.36;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 12),
        mat({ color: 0xe8ecef, metalness: 1, roughness: 0.1 }),
      );
      ball.position.x = -0.5;
      group.add(cone, collar, thread, ball);
      break;
    }
    case 'cartridge': {
      const tube = mat({
        color: 0x90caf9,
        metalness: 0.05,
        roughness: 0.15,
        transparent: true,
        opacity: 0.45,
      });
      const ink = mat({ color: 0x1565c0, metalness: 0.1, roughness: 0.35 });
      const metal = mat({ color: 0xb0bec5, metalness: 0.85, roughness: 0.22 });
      const body = cyl(0.09, 0.09, 1.85, tube, 20);
      const inkCol = cyl(0.055, 0.055, 1.55, ink, 16);
      inkCol.position.x = 0.05;
      const tipMetal = cyl(0.04, 0.07, 0.28, metal, 16);
      tipMetal.position.x = -0.95;
      const plug = cyl(0.08, 0.08, 0.1, metal, 16);
      plug.position.x = 0.95;
      group.add(body, inkCol, tipMetal, plug);
      break;
    }
    case 'barrel': {
      const plastic = mat({
        color: 0xf6c445,
        metalness: 0.08,
        roughness: 0.35,
        transparent: true,
        opacity: 0.88,
      });
      const gripMat = mat({ color: 0xe8a317, metalness: 0.05, roughness: 0.55 });
      const chrome = mat({ color: 0xcfd8dc, metalness: 0.9, roughness: 0.2 });
      const body = cyl(0.3, 0.3, 2.05, plastic, 36);
      const nose = cyl(0.26, 0.3, 0.28, chrome, 28);
      nose.position.x = -1.05;
      const rear = cyl(0.28, 0.26, 0.22, chrome, 28);
      rear.position.x = 1.05;
      for (let i = 0; i < 5; i++) {
        const ridge = cyl(0.312, 0.312, 0.06, gripMat, 36);
        ridge.position.x = -0.55 + i * 0.14;
        group.add(ridge);
      }
      const clip = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 0.12),
        chrome,
      );
      clip.position.set(0.35, 0.34, 0);
      const clipHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.14),
        chrome,
      );
      clipHead.position.set(-0.12, 0.34, 0);
      group.add(body, nose, rear, clip, clipHead);
      break;
    }
    case 'spring': {
      group.add(helixSpring(7, 0.13, 0.028, 0.55));
      break;
    }
    case 'button': {
      const red = mat({ color: 0xe53935, metalness: 0.15, roughness: 0.4 });
      const dark = mat({ color: 0xb71c1c, metalness: 0.2, roughness: 0.45 });
      const stem = cyl(0.11, 0.11, 0.45, dark, 20);
      stem.position.x = -0.05;
      const cap = cyl(0.17, 0.2, 0.28, red, 24);
      cap.position.x = 0.22;
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), red);
      dome.scale.x = 0.55;
      dome.position.x = 0.38;
      group.add(stem, cap, dome);
      break;
    }
  }

  group.traverse((obj: THREE.Object3D) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

/** Scatter target with outward burst + slight height. */
export function explodeTarget(index: number, total: number, seed: number): {
  pos: THREE.Vector3;
  rot: THREE.Euler;
} {
  const angle = (index / total) * Math.PI * 2 + seed * 0.7;
  const radius = 2.4 + (seed % 1) * 1.4 + index * 0.15;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius * 0.55;
  const y = 0.35 + ((seed * 3 + index) % 1) * 0.9;
  return {
    pos: new THREE.Vector3(x, y, z),
    rot: new THREE.Euler(
      (seed + index) * 1.7,
      (seed * 2 + index) * 2.1,
      (seed * 0.5 + index) * 0.9,
    ),
  };
}
