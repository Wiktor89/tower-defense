import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
  private rotY = 0.55;
  private rotX = -0.32;
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
    this.scene.background = new THREE.Color(0x121820);
    this.scene.fog = new THREE.Fog(0x121820, 14, 26);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 1.35, 7.4);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xf0f4ff, 0x1a222c, 0.55);
    const key = new THREE.DirectionalLight(0xfff4e5, 1.65);
    key.position.set(3.5, 6.5, 4.5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 22;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.bias = -0.0002;
    const fill = new THREE.DirectionalLight(0xa8c8ff, 0.4);
    fill.position.set(-5, 2.5, -2);
    const rim = new THREE.PointLight(0xffd8a8, 0.7, 18);
    rim.position.set(-2.5, 2.2, 3.5);
    this.scene.add(hemi, key, fill, rim, this.world);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(8, 72),
      new THREE.MeshStandardMaterial({
        color: 0x18202a,
        roughness: 0.78,
        metalness: 0.2,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.5;
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
    const tick = (now: number) => {
      requestAnimationFrame(tick);
      this.world.rotation.y = this.rotY;
      this.world.rotation.x = this.rotX;
      const pulse = 0.9 + Math.sin(now * 0.007) * 0.12;
      for (const mesh of this.partMeshes.values()) {
        for (const child of mesh.children) {
          if (child.name === '__joinMarker' && child.visible) {
            child.scale.setScalar(pulse);
          }
        }
      }
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(tick);
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
    this.updateJoinMarkers();
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
    this.updateJoinMarkers();
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
    this.updateJoinMarkers();

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
    this.updateJoinMarkers();
    this.notify();
  }

  private updateJoinMarkers(): void {
    const show = this.mode === 'exploded';
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      const cluster = this.findCluster(def.id);
      for (const child of mesh.children) {
        if (child.name !== '__joinMarker') continue;
        const mate = child.userData.socketMate as PartId | undefined;
        if (!mate) {
          child.visible = false;
          continue;
        }
        const mateCluster = this.findCluster(mate);
        child.visible = Boolean(show && cluster && mateCluster && cluster !== mateCluster);
      }
    }
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

  private rotateCluster(cluster: Cluster, deltaY: number, deltaX: number): void {
    const ky = Math.abs(deltaY) > 0 ? deltaY : 0;
    const kx = Math.abs(deltaX) > 0 ? deltaX : 0;
    // Spin around pen axis (X) and tumble around Y — clearly visible while held.
    cluster.root.rotation.x += ky * 0.014;
    cluster.root.rotation.y += (ky * 0.004) + (kx * 0.01);
  }

  private readonly onWindowWheel = (e: WheelEvent): void => {
    if (!this.dragCluster || this.mode !== 'exploded' || this.animating) return;
    e.preventDefault();
    e.stopPropagation();
    this.rotateCluster(this.dragCluster, e.deltaY, e.deltaX);
  };

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener(
      'wheel',
      e => {
        if (this.dragCluster) return;
        e.preventDefault();
        if (this.animating) return;
        this.rotY += e.deltaY * 0.0025;
        this.rotX += e.deltaX * 0.002;
        this.rotX = Math.max(-0.9, Math.min(0.9, this.rotX));
      },
      { passive: false },
    );

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
            window.addEventListener('wheel', this.onWindowWheel, { passive: false, capture: true });
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
      window.removeEventListener('wheel', this.onWindowWheel, true);

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
    return this.pickPartAt(e.clientX, e.clientY);
  }

  private pickPartAt(clientX: number, clientY: number): PartId | null {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshes: THREE.Object3D[] = [];
    for (const mesh of this.partMeshes.values()) {
      mesh.traverse((o: THREE.Object3D) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) meshes.push(o);
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
