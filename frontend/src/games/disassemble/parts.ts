import * as THREE from 'three';

export type PartId = 'tip' | 'cartridge' | 'barrel' | 'spring' | 'button';

export interface PartDef {
  id: PartId;
  name: string;
  color: number;
  /** Local position in fully assembled pen (along X). */
  assembledX: number;
}

export const PARTS: PartDef[] = [
  { id: 'tip', name: 'Наконечник', color: 0xb0bec5, assembledX: -2.15 },
  { id: 'cartridge', name: 'Стержень', color: 0x1e88e5, assembledX: -0.95 },
  { id: 'barrel', name: 'Корпус', color: 0xffc107, assembledX: 0.55 },
  { id: 'spring', name: 'Пружина', color: 0x90a4ae, assembledX: 1.75 },
  { id: 'button', name: 'Кнопка', color: 0xef5350, assembledX: 2.35 },
];

/** Undirected compatible pairs — each part fits only its neighbors. */
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

export function createPartMesh(def: PartDef): THREE.Group {
  const group = new THREE.Group();
  group.name = def.id;
  const mat = new THREE.MeshStandardMaterial({
    color: def.color,
    metalness: 0.25,
    roughness: 0.45,
  });

  switch (def.id) {
    case 'tip': {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 20), mat);
      cone.rotation.z = Math.PI / 2;
      cone.position.x = -0.12;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.18, 20), mat);
      ring.rotation.z = Math.PI / 2;
      ring.position.x = 0.18;
      group.add(cone, ring);
      break;
    }
    case 'cartridge': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 16), mat);
      body.rotation.z = Math.PI / 2;
      const ink = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 1.1, 12),
        new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.3 }),
      );
      ink.rotation.z = Math.PI / 2;
      group.add(body, ink);
      break;
    }
    case 'barrel': {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.8, 28), mat);
      body.rotation.z = Math.PI / 2;
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.5, 28),
        new THREE.MeshStandardMaterial({ color: 0xff8f00, roughness: 0.55 }),
      );
      grip.rotation.z = Math.PI / 2;
      grip.position.x = -0.4;
      group.add(body, grip);
      break;
    }
    case 'spring': {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.035, 10, 24),
        mat,
      );
      coil.rotation.y = Math.PI / 2;
      const coil2 = coil.clone();
      coil2.position.x = 0.12;
      const coil3 = coil.clone();
      coil3.position.x = -0.12;
      group.add(coil, coil2, coil3);
      break;
    }
    case 'button': {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.35, 20), mat);
      top.rotation.z = Math.PI / 2;
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0xe53935 }),
      );
      tip.position.x = 0.22;
      group.add(top, tip);
      break;
    }
  }

  group.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });
  return group;
}

export function explodePosition(index: number, total: number): THREE.Vector3 {
  const t = total <= 1 ? 0 : index / (total - 1);
  const x = (t - 0.5) * 5.2;
  const y = Math.sin(t * Math.PI) * 0.35;
  return new THREE.Vector3(x, y, 0);
}
