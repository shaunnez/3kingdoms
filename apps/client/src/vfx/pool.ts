/**
 * Mesh pools for combat effects. Every pooled mesh shares its template
 * geometry, so acquiring one is a matter of re-enabling it. Released meshes
 * are disabled and kept until dispose(); nothing is created per frame.
 */
import {
  Geometry,
  Mesh,
  type Material,
  type Scene,
  type VertexData,
} from "@babylonjs/core";

export class MeshPool {
  private free: Mesh[] = [];
  private all: Mesh[] = [];
  private geometry: Geometry;
  /** Meshes currently handed out. */
  active = 0;

  constructor(
    private scene: Scene,
    readonly name: string,
    data: VertexData,
    private options: {
      vertexAlpha?: boolean;
      /** Called once per new mesh (e.g. glow-layer registration). */
      setup?: (mesh: Mesh) => void;
      /** Maps materials handed to acquire() (e.g. to a glowing variant). */
      material?: (material: Material) => Material;
    } = {},
  ) {
    this.geometry = new Geometry(`combat-geo-${name}`, scene, data, false);
  }

  /** The material this pool will actually use for `material`. */
  prepare(material: Material): Material {
    return this.options.material ? this.options.material(material) : material;
  }

  acquire(material: Material): Mesh {
    let mesh = this.free.pop();
    if (!mesh) {
      mesh = new Mesh(`combat-${this.name}-${this.all.length}`, this.scene);
      this.geometry.applyToMesh(mesh);
      mesh.isPickable = false;
      mesh.doNotSyncBoundingInfo = false;
      mesh.hasVertexAlpha = !!this.options.vertexAlpha;
      mesh.receiveShadows = false;
      this.all.push(mesh);
      this.options.setup?.(mesh);
    }
    mesh.parent = null;
    mesh.position.setAll(0);
    mesh.rotationQuaternion = null;
    mesh.rotation.setAll(0);
    mesh.scaling.setAll(1);
    mesh.visibility = 1;
    mesh.billboardMode = Mesh.BILLBOARDMODE_NONE;
    mesh.alphaIndex = Number.MAX_VALUE;
    mesh.material = this.prepare(material);
    mesh.isVisible = true;
    mesh.renderingGroupId = 0;
    mesh.setEnabled(true);
    this.active++;
    return mesh;
  }

  release(mesh: Mesh): void {
    mesh.setEnabled(false);
    mesh.parent = null;
    this.free.push(mesh);
    this.active--;
  }

  /** Total meshes ever created by this pool (active + free). */
  get size(): number {
    return this.all.length;
  }

  dispose(): void {
    for (const mesh of this.all) mesh.dispose(false, false);
    this.all.length = 0;
    this.free.length = 0;
    this.active = 0;
    this.geometry.dispose();
  }
}
