import * as THREE from 'three';

export type PartId = 'tip' | 'cartridge' | 'barrel' | 'spring' | 'button';

export interface PartDef {
  id: PartId;
  name: string;
  color: number;
  assembledX: number;
}

/** Proportions close to a retractable ballpoint (~14 cm). */
export const PARTS: PartDef[] = [
  { id: 'tip', name: 'Наконечник', color: 0xc5ccd3, assembledX: -2.55 },
  { id: 'cartridge', name: 'Стержень', color: 0x1e88e5, assembledX: -0.75 },
  { id: 'barrel', name: 'Корпус', color: 0xf0c14a, assembledX: 0.7 },
  { id: 'spring', name: 'Пружина', color: 0xb0bec5, assembledX: 2.05 },
  { id: 'button', name: 'Кнопка', color: 0xd32f2f, assembledX: 2.55 },
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

function chrome(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe8ecef,
    metalness: 1,
    roughness: 0.12,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
}

function brushedSteel(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0x9aa3ab,
    metalness: 0.92,
    roughness: 0.38,
  });
}

function rubber(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0,
    roughness: 0.92,
  });
}

function plastic(color: number, rough = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.05,
    roughness: rough,
  });
}

function clearPlastic(color: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0,
    roughness: 0.12,
    transmission: 0.62,
    thickness: 0.55,
    ior: 1.49,
    transparent: true,
    opacity: 1,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
  });
}

/** Lathe profile: [radius, yAlongAxis]. Axis is Y; rotated to +X. */
function lathe(
  profile: Array<[number, number]>,
  material: THREE.Material,
  segments = 72,
): THREE.Mesh {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r), y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, segments), material);
  mesh.rotation.z = -Math.PI / 2;
  return mesh;
}

function cyl(
  rTop: number,
  rBot: number,
  h: number,
  material: THREE.Material,
  segs = 48,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, segs), material);
  m.rotation.z = Math.PI / 2;
  return m;
}

function helixSpring(turns: number, radius: number, tube: number, length: number): THREE.Mesh {
  const pts: THREE.Vector3[] = [];
  const steps = turns * 32;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    pts.push(new THREE.Vector3((t - 0.5) * length, Math.cos(a) * radius, Math.sin(a) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, steps, tube, 10, false),
    new THREE.MeshStandardMaterial({
      color: 0xc5ced4,
      metalness: 0.95,
      roughness: 0.22,
    }),
  );
}

function makeClip(material: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  // Mount ring around barrel
  const mount = cyl(0.305, 0.305, 0.1, material, 40);
  mount.position.x = 0.15;
  // Long arm — slightly bent via thin boxes
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.035, 0.11), material);
  arm.position.set(0.55, 0.33, 0);
  arm.rotation.z = -0.04;
  // Tip hook
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.12), material);
  hook.position.set(-0.05, 0.3, 0);
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), material);
  pad.scale.set(1.2, 0.55, 1);
  pad.position.set(1.1, 0.28, 0);
  g.add(mount, arm, hook, pad);
  return g;
}

export function createPartMesh(def: PartDef): THREE.Group {
  const group = new THREE.Group();
  group.name = def.id;

  switch (def.id) {
    case 'tip': {
      // Metal writing cone — smooth lathe like a real tip
      const metal = chrome();
      const tip = lathe(
        [
          [0.012, -0.42],
          [0.028, -0.36],
          [0.055, -0.22],
          [0.12, -0.05],
          [0.175, 0.08],
          [0.205, 0.18],
          [0.215, 0.28],
          [0.215, 0.36],
          [0.19, 0.4],
          [0.17, 0.42],
        ],
        metal,
        80,
      );
      const thread = lathe(
        [
          [0.165, 0.42],
          [0.165, 0.52],
          [0.155, 0.58],
          [0.155, 0.68],
        ],
        brushedSteel(),
        48,
      );
      // Tiny tungsten carbide ball
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 24, 18),
        new THREE.MeshStandardMaterial({ color: 0xf5f7fa, metalness: 1, roughness: 0.08 }),
      );
      ball.position.x = -0.42;
      // Fine grooves on collar
      for (let i = 0; i < 4; i++) {
        const ring = cyl(0.218, 0.218, 0.012, brushedSteel(), 48);
        ring.position.x = 0.22 + i * 0.035;
        group.add(ring);
      }
      group.add(tip, thread, ball);
      break;
    }
    case 'cartridge': {
      const tubeMat = new THREE.MeshPhysicalMaterial({
        color: 0xb3e5fc,
        metalness: 0,
        roughness: 0.08,
        transmission: 0.75,
        thickness: 0.2,
        transparent: true,
        opacity: 1,
        ior: 1.4,
      });
      const inkMat = new THREE.MeshStandardMaterial({
        color: 0x0d47a1,
        metalness: 0.05,
        roughness: 0.45,
      });
      const brass = new THREE.MeshStandardMaterial({
        color: 0xc9a227,
        metalness: 0.95,
        roughness: 0.28,
      });
      const body = cyl(0.085, 0.085, 2.35, tubeMat, 36);
      const ink = cyl(0.058, 0.058, 1.85, inkMat, 28);
      ink.position.x = 0.12;
      // Air gap at back (empty tube look)
      const air = cyl(
        0.05,
        0.05,
        0.35,
        new THREE.MeshStandardMaterial({
          color: 0xe3f2fd,
          metalness: 0,
          roughness: 0.2,
          transparent: true,
          opacity: 0.35,
        }),
        20,
      );
      air.position.x = 1.05;
      const point = lathe(
        [
          [0.012, -1.28],
          [0.03, -1.2],
          [0.055, -1.08],
          [0.075, -0.98],
          [0.085, -0.92],
        ],
        brass,
        40,
      );
      const plug = lathe(
        [
          [0.08, 1.15],
          [0.09, 1.2],
          [0.09, 1.28],
          [0.05, 1.3],
        ],
        plastic(0x455a64, 0.5),
        32,
      );
      group.add(body, ink, air, point, plug);
      break;
    }
    case 'barrel': {
      const shell = clearPlastic(0xf2c94c);
      const grip = rubber(0x2b2f36);
      const trim = chrome();

      // Main translucent body — slight taper
      const body = lathe(
        [
          [0.27, -1.15],
          [0.295, -1.0],
          [0.31, -0.6],
          [0.315, 0.2],
          [0.31, 0.85],
          [0.295, 1.15],
          [0.275, 1.28],
          [0.26, 1.35],
        ],
        shell,
        80,
      );

      // Soft rubber grip zone
      const gripSleeve = lathe(
        [
          [0.318, -0.95],
          [0.335, -0.88],
          [0.34, -0.7],
          [0.34, -0.25],
          [0.335, -0.12],
          [0.318, -0.05],
        ],
        grip,
        64,
      );
      for (let i = 0; i < 8; i++) {
        const ridge = cyl(0.342, 0.342, 0.028, grip, 48);
        ridge.position.x = -0.85 + i * 0.09;
        group.add(ridge);
      }

      // Front metal nose ring
      const nose = lathe(
        [
          [0.22, -1.35],
          [0.25, -1.3],
          [0.275, -1.22],
          [0.275, -1.12],
          [0.265, -1.08],
        ],
        trim,
        64,
      );

      // Rear collar where button sits
      const rear = lathe(
        [
          [0.255, 1.3],
          [0.27, 1.38],
          [0.27, 1.48],
          [0.24, 1.52],
        ],
        trim,
        48,
      );

      // Inner sleeve (visible through clear plastic)
      const inner = cyl(
        0.2,
        0.2,
        2.2,
        new THREE.MeshStandardMaterial({
          color: 0xfff3c4,
          metalness: 0,
          roughness: 0.6,
          transparent: true,
          opacity: 0.25,
        }),
        32,
      );

      const clip = makeClip(trim);
      clip.position.x = 0.35;

      group.add(body, gripSleeve, nose, rear, inner, clip);
      break;
    }
    case 'spring': {
      const coil = helixSpring(9, 0.125, 0.022, 0.62);
      const washer = cyl(0.14, 0.14, 0.03, brushedSteel(), 32);
      washer.position.x = -0.32;
      const washer2 = washer.clone();
      washer2.position.x = 0.32;
      group.add(coil, washer, washer2);
      break;
    }
    case 'button': {
      const red = plastic(0xc62828, 0.32);
      const dark = plastic(0x8e0000, 0.4);
      // Stepped clicker like Pilot/ BIC
      const stem = lathe(
        [
          [0.09, -0.35],
          [0.1, -0.2],
          [0.1, 0.05],
          [0.12, 0.12],
        ],
        dark,
        48,
      );
      const head = lathe(
        [
          [0.12, 0.12],
          [0.18, 0.18],
          [0.2, 0.28],
          [0.2, 0.42],
          [0.175, 0.5],
          [0.12, 0.52],
          [0.001, 0.52],
        ],
        red,
        64,
      );
      // Soft top pad
      const pad = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 24, 16),
        rubber(0xb71c1c),
      );
      pad.scale.set(1, 0.45, 1);
      pad.position.x = 0.5;
      // Side notches (click feel)
      for (const z of [-1, 1]) {
        const notch = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.06, 0.04),
          dark,
        );
        notch.position.set(0.32, 0.16 * z, 0);
        group.add(notch);
      }
      group.add(stem, head, pad);
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

export function explodeTarget(index: number, total: number, seed: number): {
  pos: THREE.Vector3;
  rot: THREE.Euler;
} {
  const angle = (index / total) * Math.PI * 2 + seed * 0.7;
  const radius = 2.6 + (seed % 1) * 1.4 + index * 0.15;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius * 0.55;
  const y = 0.4 + ((seed * 3 + index) % 1) * 0.9;
  return {
    pos: new THREE.Vector3(x, y, z),
    rot: new THREE.Euler(
      (seed + index) * 1.7,
      (seed * 2 + index) * 2.1,
      (seed * 0.5 + index) * 0.9,
    ),
  };
}
