import * as THREE from 'three';
import {
  PARTS,
  PartId,
  canConnect,
  createPartMesh,
  explodePosition,
} from './parts';

export type GameMode = 'assembled' | 'exploded' | 'won';

interface Cluster {
  /** Root group in the scene for this connected set. */
  root: THREE.Group;
  memberIds: Set<PartId>;
}

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
  private prevX = 0;
  private prevY = 0;
  private rotY = 0.4;
  private rotX = -0.25;
  private animating = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  onModeChange: ((mode: GameMode, selected: PartId | null) => void) | null = null;
  onSelect: ((id: PartId | null) => void) | null = null;
  onJoined: ((a: PartId, b: PartId) => void) | null = null;
  onWrongPair: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2430);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.camera.position.set(0, 1.2, 7.5);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334155, 1.1);
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    this.scene.add(hemi, key, this.world);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(6, 48),
      new THREE.MeshStandardMaterial({ color: 0x243041, roughness: 0.9, metalness: 0.1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.35;
    floor.receiveShadow = true;
    this.scene.add(floor);

    for (const def of PARTS) {
      const mesh = createPartMesh(def);
      this.partMeshes.set(def.id, mesh);
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

    // Flatten all parts under world at current world positions.
    const starts = new Map<PartId, THREE.Vector3>();
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      this.world.attach(mesh);
      starts.set(def.id, mesh.position.clone());
      mesh.rotation.set(0, 0, 0);
    }
    for (const child of [...this.world.children]) {
      if (!this.partMeshes.has(child.name as PartId)) {
        this.world.remove(child);
      }
    }
    this.clusters = [];

    const targets = PARTS.map((def, i) => ({
      id: def.id,
      to: explodePosition(i, PARTS.length),
    }));

    await this.animatePositions(starts, targets, 650);

    this.clusters = PARTS.map(def => {
      const mesh = this.partMeshes.get(def.id)!;
      const root = new THREE.Group();
      root.position.copy(mesh.position);
      mesh.position.set(0, 0, 0);
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

    if (!this.selected) {
      this.selected = id;
      this.setHighlight(this.partMeshes.get(id)!, true);
      this.onSelect?.(id);
      this.notify();
      return;
    }

    const first = this.selected;
    this.setHighlight(this.partMeshes.get(first)!, false);
    this.selected = null;
    this.onSelect?.(null);

    if (!this.tryJoin(first, id)) {
      this.onWrongPair?.();
      this.notify();
      return;
    }
    this.notify();
  }

  private tryJoin(a: PartId, b: PartId): boolean {
    const ca = this.findCluster(a);
    const cb = this.findCluster(b);
    if (!ca || !cb || ca === cb) return false;

    // Need a direct compatible edge between some member of ca and cb.
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
    if (!link) return false;

    // Merge cb into ca: place parts using assembled offsets relative to ca's anchor.
    const [left, right] = link;
    const keep = ca;
    const absorb = cb;

    // Compute offset so that linked parts sit at assembled relative distance.
    const defL = PARTS.find(p => p.id === left)!;
    const defR = PARTS.find(p => p.id === right)!;
    const meshL = this.partMeshes.get(left)!;
    const meshR = this.partMeshes.get(right)!;

    // Desired: meshR.world relative to keep.root == assembled delta
    const desiredDelta = defR.assembledX - defL.assembledX;
    // Current local positions in their roots
    // After absorb, everything goes into keep.root
    const absorbParts = [...absorb.memberIds];
    for (const id of absorbParts) {
      const mesh = this.partMeshes.get(id)!;
      keep.root.attach(mesh);
      keep.memberIds.add(id);
    }
    this.world.remove(absorb.root);
    this.clusters = this.clusters.filter(c => c !== absorb);

    // Shift absorbed parts so link aligns
    const localL = meshL.position.x;
    const localR = meshR.position.x;
    const shift = desiredDelta - (localR - localL);
    for (const id of absorbParts) {
      this.partMeshes.get(id)!.position.x += shift;
    }

    this.onJoined?.(a, b);

    if (keep.memberIds.size === PARTS.length) {
      void this.finishAssemble(keep);
    }
    return true;
  }

  private async finishAssemble(cluster: Cluster): Promise<void> {
    this.animating = true;
    // Snap exactly to assembled layout inside cluster
    for (const def of PARTS) {
      const mesh = this.partMeshes.get(def.id)!;
      mesh.position.set(def.assembledX, 0, 0);
      mesh.rotation.set(0, 0, 0);
      this.setHighlight(mesh, false);
    }
    // Center cluster at origin
    cluster.root.position.set(0, 0, 0);
    this.mode = 'won';
    this.animating = false;
    this.notify();
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
    mesh.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
        obj.material.emissive = new THREE.Color(on ? 0xff9800 : 0x000000);
        obj.material.emissiveIntensity = on ? 0.35 : 0;
      }
    });
  }

  private animatePositions(
    from: Map<PartId, THREE.Vector3>,
    targets: Array<{ id: PartId; to: THREE.Vector3 }>,
    ms: number,
  ): Promise<void> {
    return new Promise(resolve => {
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - t, 3);
        for (const { id, to } of targets) {
          const mesh = this.partMeshes.get(id)!;
          const start = from.get(id)!;
          mesh.position.lerpVectors(start, to, e);
        }
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  private bindPointer(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('pointerdown', e => {
      this.dragging = true;
      this.prevX = e.clientX;
      this.prevY = e.clientY;
      canvas.setPointerCapture(e.pointerId);

      if (this.mode === 'exploded' && !this.animating) {
        const id = this.pickPart(e);
        if (id) this.selectPart(id);
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const dx = e.clientX - this.prevX;
      const dy = e.clientY - this.prevY;
      this.prevX = e.clientX;
      this.prevY = e.clientY;

      if (this.mode === 'exploded' && this.selected) {
        const mesh = this.partMeshes.get(this.selected);
        if (mesh) {
          mesh.rotation.y += dx * 0.02;
          mesh.rotation.x += dy * 0.015;
        }
        return;
      }

      this.rotY += dx * 0.008;
      this.rotX += dy * 0.006;
      this.rotX = Math.max(-0.9, Math.min(0.9, this.rotX));
    });
    const end = (e: PointerEvent) => {
      this.dragging = false;
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
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const meshes: THREE.Object3D[] = [];
    for (const mesh of this.partMeshes.values()) {
      mesh.traverse(o => {
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
