import * as THREE from 'three';
import {
  PARTS,
  PartId,
  canConnect,
  createPartMesh,
  explodeTarget,
} from './parts';

export type GameMode = 'assembled' | 'exploded' | 'won';

interface Cluster {
  root: THREE.Group;
  memberIds: Set<PartId>;
}

const SNAP_DIST = 1.15;
const DRAG_PLANE_Y = 0.4;

export class AssemblyGame {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly world = new THREE.Group();
  private readonly partMeshes = new Map<PartId, THREE.Group>();
  private clusters: Cluster[] = [];
  private mode: GameMode = 'assembled';
  private selected: PartId | null = null;
  private dragging = false;
  private dragCluster: Cluster | null = null;
  private dragOffset = new THREE.Vector3();
  private orbiting = false;
  private prevX = 0;
  private prevY = 0;
  private rotY = 0.45;
  private rotX = -0.28;
  private animating = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_PLANE_Y);
  private hitPoint = new THREE.Vector3();
  private explodeSeed = Math.random();

  onModeChange: ((mode: GameMode, selected: PartId | null) => void) | null = null;
  onSelect: ((id: PartId | null) => void) | null = null;
  onJoined: ((a: PartId, b: PartId) => void) | null = null;
  onWrongPair: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x151c26);
    this.scene.fog = new THREE.Fog(0x151c26, 12, 22);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 1.6, 8.2);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    const hemi = new THREE.HemisphereLight(0xe8eef7, 0x2a3544, 0.85);
    const key = new THREE.DirectionalLight(0xfff6e8, 1.45);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 20;
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    const fill = new THREE.DirectionalLight(0x8ec5ff, 0.35);
    fill.position.set(-4, 2, -2);
    const rim = new THREE.PointLight(0xffcc88, 0.55, 16);
    rim.position.set(-2, 2.5, 3);
    this.scene.add(hemi, key, fill, rim, this.world);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(7, 64),
      new THREE.MeshStandardMaterial({
        color: 0x1e2836,
        roughness: 0.85,
        metalness: 0.15,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    floor.receiveShadow = true;
    this.scene.add(floor);

    for (const def of PARTS) {
      this.partMeshes.set(def.id, createPartMesh(def));
    }

    this.resetAssembled();
    this.bindPointer(canvas);
    this.resize();
  }

  getMode(): GameMode {
    return this.mode;
  }

  getSelected(): PartId | null {
    return this.selected;
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  start(): void {
    const tick = () => {
      requestAnimationFrame(tick);
      this.world.rotation.y = this.rotY;
      this.world.rotation.x = this.rotX;
      this.renderer.render(this.scene, this.camera);
    };
    tick();
  }

  resetAssembled(): void {
    this.clearWorld();
    this.mode = 'assembled';
    this.selected = null;
    this.animating = false;
    this.dragCluster = null;

    const root = new THREE.Group();
    root.name = 'assembled';
    const ids = new Set<PartId>();
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      mesh.position.set(def.assembledX, 0, 0);
      mesh.rotation.set(0, 0, 0);
      mesh.scale.setScalar(1);
      this.setHighlight(mesh, false);
      root.add(mesh);
      ids.add(def.id);
    }
    this.world.add(root);
    this.clusters = [{ root, memberIds: ids }];
    this.notify();
  }

  async disassemble(): Promise<void> {
    if (this.animating || this.mode === 'exploded') return;
    this.animating = true;
    this.selected = null;
    this.explodeSeed = Math.random();

    const starts = new Map<PartId, { pos: THREE.Vector3; rot: THREE.Euler }>();
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      this.world.attach(mesh);
      starts.set(def.id, {
        pos: mesh.position.clone(),
        rot: mesh.rotation.clone(),
      });
    }
    for (const child of [...this.world.children]) {
      if (!this.partMeshes.has(child.name as PartId)) {
        this.world.remove(child);
      }
    }
    this.clusters = [];

    const targets = PARTS.map((def, i) => ({
      id: def.id,
      ...explodeTarget(i, PARTS.length, this.explodeSeed + i * 0.17),
    }));

    await this.animateBurst(starts, targets, 780);

    this.clusters = PARTS.map(def => {
      const mesh = this.partMeshes.get(def.id)!;
      const root = new THREE.Group();
      root.position.copy(mesh.position);
      root.rotation.copy(mesh.rotation);
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
      root.add(mesh);
      this.world.add(root);
      return { root, memberIds: new Set<PartId>([def.id]) };
    });

    this.mode = 'exploded';
    this.animating = false;
    this.notify();
  }

  clearSelection(): void {
    if (this.selected) {
      this.setHighlight(this.partMeshes.get(this.selected)!, false);
    }
    this.selected = null;
    this.onSelect?.(null);
    this.notify();
  }

  selectPart(id: PartId): void {
    if (this.mode !== 'exploded' || this.animating) return;
    if (this.selected === id) {
      this.clearSelection();
      return;
    }
    if (this.selected) {
      this.setHighlight(this.partMeshes.get(this.selected)!, false);
    }
    this.selected = id;
    this.setHighlight(this.partMeshes.get(id)!, true);
    this.onSelect?.(id);
    this.notify();
  }

  private tryJoinClusters(ca: Cluster, cb: Cluster): 'joined' | 'wrong' | 'none' {
    if (ca === cb) return 'none';

    let link: [PartId, PartId] | null = null;
    for (const x of ca.memberIds) {
      for (const y of cb.memberIds) {
        if (canConnect(x, y)) {
          link = [x, y];
          break;
        }
      }
      if (link) break;
    }
    if (!link) return 'wrong';

    const [left, right] = link;
    const keep = ca;
    const absorb = cb;
    const defL = PARTS.find(p => p.id === left)!;
    const defR = PARTS.find(p => p.id === right)!;
    const meshL = this.partMeshes.get(left)!;
    const meshR = this.partMeshes.get(right)!;

    const absorbParts = [...absorb.memberIds];
    for (const id of absorbParts) {
      const mesh = this.partMeshes.get(id)!;
      keep.root.attach(mesh);
      keep.memberIds.add(id);
    }
    this.world.remove(absorb.root);
    this.clusters = this.clusters.filter(c => c !== absorb);

    keep.root.rotation.set(0, 0, 0);
    for (const id of keep.memberIds) {
      this.partMeshes.get(id)!.rotation.set(0, 0, 0);
    }

    const desiredDelta = defR.assembledX - defL.assembledX;
    const shift = desiredDelta - (meshR.position.x - meshL.position.x);
    for (const id of absorbParts) {
      this.partMeshes.get(id)!.position.x += shift;
      this.partMeshes.get(id)!.position.y = 0;
      this.partMeshes.get(id)!.position.z = 0;
    }
    for (const id of keep.memberIds) {
      if (!absorbParts.includes(id)) {
        const m = this.partMeshes.get(id)!;
        m.position.y = 0;
        m.position.z = 0;
      }
    }

    this.onJoined?.(left, right);

    if (keep.memberIds.size === PARTS.length) {
      void this.finishAssemble(keep);
    }
    return 'joined';
  }

  private async finishAssemble(cluster: Cluster): Promise<void> {
    this.animating = true;
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      mesh.position.set(def.assembledX, 0, 0);
      mesh.rotation.set(0, 0, 0);
      this.setHighlight(mesh, false);
    }
    cluster.root.position.set(0, 0, 0);
    cluster.root.rotation.set(0, 0, 0);
    this.selected = null;
    this.mode = 'won';
    this.animating = false;
    this.notify();
  }

  private nearestOtherCluster(cluster: Cluster): Cluster | null {
    let best: Cluster | null = null;
    let bestDist = SNAP_DIST;
    const a = cluster.root.position;
    for (const other of this.clusters) {
      if (other === cluster) continue;
      const d = a.distanceTo(other.root.position);
      if (d < bestDist) {
        bestDist = d;
        best = other;
      }
    }
    return best;
  }

  private findCluster(id: PartId): Cluster | undefined {
    return this.clusters.find(c => c.memberIds.has(id));
  }

  private clearWorld(): void {
    while (this.world.children.length) {
      this.world.remove(this.world.children[0]!);
    }
  }

  private setHighlight(mesh: THREE.Group, on: boolean): void {
    mesh.traverse((obj: THREE.Object3D) => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.emissive = new THREE.Color(on ? 0xff9800 : 0x000000);
        obj.material.emissiveIntensity = on ? 0.4 : 0;
      }
    });
  }

  private animateBurst(
    from: Map<PartId, { pos: THREE.Vector3; rot: THREE.Euler }>,
    targets: Array<{ id: PartId; pos: THREE.Vector3; rot: THREE.Euler }>,
    ms: number,
  ): Promise<void> {
    return new Promise(resolve => {
      const t0 = performance.now();
      const midBoost = new Map<PartId, THREE.Vector3>();
      for (const { id, pos } of targets) {
        const start = from.get(id)!.pos;
        const mid = start.clone().lerp(pos, 0.45);
        mid.y += 1.6 + Math.random() * 0.8;
        midBoost.set(id, mid);
      }

      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        for (const { id, pos, rot } of targets) {
          const mesh = this.partMeshes.get(id)!;
          const start = from.get(id)!;
          const mid = midBoost.get(id)!;
          if (t < 0.55) {
            const u = t / 0.55;
            mesh.position.lerpVectors(start.pos, mid, 1 - Math.pow(1 - u, 2));
          } else {
            const u = (t - 0.55) / 0.45;
            mesh.position.lerpVectors(mid, pos, u * u * (3 - 2 * u));
          }
          mesh.rotation.x = start.rot.x + (rot.x - start.rot.x) * e;
          mesh.rotation.y = start.rot.y + (rot.y - start.rot.y) * e;
          mesh.rotation.z = start.rot.z + (rot.z - start.rot.z) * e;
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private setPointerFromEvent(e: PointerEvent): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private projectOnDragPlane(e: PointerEvent): THREE.Vector3 | null {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Plane is in world space; account for world rotation by inverse-transforming ray.
    const inv = this.world.matrixWorld.clone().invert();
    const origin = this.raycaster.ray.origin.clone().applyMatrix4(inv);
    const dir = this.raycaster.ray.direction.clone().transformDirection(inv).normalize();
    const localRay = new THREE.Ray(origin, dir);
    if (!localRay.intersectPlane(this.dragPlane, this.hitPoint)) return null;
    return this.hitPoint.clone();
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0 || this.animating) return;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
      canvas.setPointerCapture(e.pointerId);

      if (this.mode === 'exploded') {
        const id = this.pickPart(e);
        if (id) {
          const cluster = this.findCluster(id);
          if (cluster) {
            this.dragging = true;
            this.dragCluster = cluster;
            this.selectPart(id);
            const hit = this.projectOnDragPlane(e);
            if (hit) {
              this.dragOffset.copy(cluster.root.position).sub(hit);
            } else {
              this.dragOffset.set(0, 0, 0);
            }
            return;
          }
        }
      }

      this.orbiting = true;
      this.dragging = true;
    });

    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;

      if (this.dragCluster && this.mode === 'exploded') {
        const hit = this.projectOnDragPlane(e);
        if (hit) {
          this.dragCluster.root.position.copy(hit).add(this.dragOffset);
          this.dragCluster.root.position.y = Math.max(0.15, this.dragCluster.root.position.y);
        }
        return;
      }

      if (this.orbiting) {
        const dx = e.clientX - this.prevX;
        const dy = e.clientY - this.prevY;
        this.prevX = e.clientX;
        this.prevY = e.clientY;
        this.rotY += dx * 0.008;
        this.rotX += dy * 0.006;
        this.rotX = Math.max(-0.9, Math.min(0.9, this.rotX));
      }
    });

    const end = (e: PointerEvent) => {
      if (this.dragCluster && this.mode === 'exploded' && !this.animating) {
        const other = this.nearestOtherCluster(this.dragCluster);
        if (other) {
          const result = this.tryJoinClusters(this.dragCluster, other);
          if (result === 'wrong') {
            this.onWrongPair?.();
          } else if (result === 'joined') {
            this.clearSelection();
          }
          this.notify();
        }
      }

      this.dragging = false;
      this.orbiting = false;
      this.dragCluster = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private pickPart(e: PointerEvent): PartId | null {
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshes: THREE.Object3D[] = [];
    for (const mesh of this.partMeshes.values()) {
      mesh.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh) meshes.push(o);
      });
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0]!.object;
    while (obj) {
      if (obj.name && PARTS.some(p => p.id === obj!.name)) {
        return obj.name as PartId;
      }
      obj = obj.parent;
    }
    return null;
  }

  private notify(): void {
    this.onModeChange?.(this.mode, this.selected);
  }
}
