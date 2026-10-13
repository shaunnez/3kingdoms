/**
 * A dense voxel grid with a world-space origin. Used for the terrain (block
 * ids) and for character parts (palette indices). Pure data, no Babylon.
 */
export class VoxelGrid {
  readonly data: Uint8Array;
  constructor(
    readonly sx: number,
    readonly sy: number,
    readonly sz: number,
    /** World position of the minimum corner of voxel (0, 0, 0), in metres. */
    readonly origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 },
    /** Edge length of one voxel, in metres. */
    readonly size = 1,
  ) {
    this.data = new Uint8Array(sx * sy * sz);
  }
  /** Linear index; x fastest, then z, then y (one horizontal layer is contiguous). */
  index(ix: number, iy: number, iz: number): number {
    return ix + this.sx * (iz + this.sz * iy);
  }
  inside(ix: number, iy: number, iz: number): boolean {
    return (
      ix >= 0 &&
      iy >= 0 &&
      iz >= 0 &&
      ix < this.sx &&
      iy < this.sy &&
      iz < this.sz
    );
  }
  get(ix: number, iy: number, iz: number): number {
    return this.inside(ix, iy, iz) ? this.data[this.index(ix, iy, iz)] : 0;
  }
  set(ix: number, iy: number, iz: number, value: number): void {
    if (this.inside(ix, iy, iz)) this.data[this.index(ix, iy, iz)] = value;
  }
  /** Fill an inclusive box, clipped to the grid. */
  fill(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    value: number,
  ): void {
    const ax = Math.max(0, Math.min(x0, x1)),
      bx = Math.min(this.sx - 1, Math.max(x0, x1));
    const ay = Math.max(0, Math.min(y0, y1)),
      by = Math.min(this.sy - 1, Math.max(y0, y1));
    const az = Math.max(0, Math.min(z0, z1)),
      bz = Math.min(this.sz - 1, Math.max(z0, z1));
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++)
        for (let x = ax; x <= bx; x++) this.data[this.index(x, y, z)] = value;
  }
  /** Voxel coordinate containing a world-space position (may be outside). */
  toVoxel(x: number, y: number, z: number): [number, number, number] {
    return [
      Math.floor((x - this.origin.x) / this.size),
      Math.floor((y - this.origin.y) / this.size),
      Math.floor((z - this.origin.z) / this.size),
    ];
  }
  /** World-space centre of a voxel. */
  toWorld(ix: number, iy: number, iz: number): [number, number, number] {
    return [
      this.origin.x + (ix + 0.5) * this.size,
      this.origin.y + (iy + 0.5) * this.size,
      this.origin.z + (iz + 0.5) * this.size,
    ];
  }
}
