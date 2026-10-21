import {
  DataTexture,
  FloatType,
  LinearFilter,
  RGBAFormat,
  Vector2,
} from "three";

export class FlowField {
  readonly texture: DataTexture;
  private velocityX: Float32Array;
  private velocityY: Float32Array;
  private nextX: Float32Array;
  private nextY: Float32Array;
  private disposed = false;

  constructor(readonly size = 64) {
    const cells = size * size;
    this.velocityX = new Float32Array(cells);
    this.velocityY = new Float32Array(cells);
    this.nextX = new Float32Array(cells);
    this.nextY = new Float32Array(cells);
    this.texture = new DataTexture(
      new Float32Array(cells * 4),
      size,
      size,
      RGBAFormat,
      FloatType,
    );
    this.texture.magFilter = LinearFilter;
    this.texture.minFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.needsUpdate = true;
  }

  splat(uv: Vector2, velocity: Vector2): void {
    if (this.disposed) return;
    const x = Math.max(0, Math.min(1, uv.x)) * (this.size - 1);
    const y = Math.max(0, Math.min(1, uv.y)) * (this.size - 1);
    const radius = Math.max(1, this.size * 0.075);
    const radius2 = radius * radius;
    const minX = Math.max(0, Math.floor(x - radius * 3));
    const maxX = Math.min(this.size - 1, Math.ceil(x + radius * 3));
    const minY = Math.max(0, Math.floor(y - radius * 3));
    const maxY = Math.min(this.size - 1, Math.ceil(y + radius * 3));
    const vx = Math.max(-2, Math.min(2, velocity.x));
    const vy = Math.max(-2, Math.min(2, velocity.y));
    for (let row = minY; row <= maxY; row++) {
      for (let column = minX; column <= maxX; column++) {
        const dx = column - x;
        const dy = row - y;
        const falloff = Math.exp(-(dx * dx + dy * dy) / (2 * radius2));
        const index = row * this.size + column;
        this.velocityX[index] = Math.max(
          -2,
          Math.min(2, this.velocityX[index]! + vx * falloff),
        );
        this.velocityY[index] = Math.max(
          -2,
          Math.min(2, this.velocityY[index]! + vy * falloff),
        );
      }
    }
    this.writeTexture();
  }

  step(dt: number): void {
    if (this.disposed) return;
    const safeDt = Math.max(0, Math.min(dt, 0.05));
    const decay = Math.pow(0.978, safeDt * 60);
    const mix = 0.16;
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const index = y * this.size + x;
        const left = y * this.size + Math.max(0, x - 1);
        const right = y * this.size + Math.min(this.size - 1, x + 1);
        const up = Math.max(0, y - 1) * this.size + x;
        const down = Math.min(this.size - 1, y + 1) * this.size + x;
        const avgX =
          (this.velocityX[left]! +
            this.velocityX[right]! +
            this.velocityX[up]! +
            this.velocityX[down]!) *
          0.25;
        const avgY =
          (this.velocityY[left]! +
            this.velocityY[right]! +
            this.velocityY[up]! +
            this.velocityY[down]!) *
          0.25;
        this.nextX[index] = Math.max(
          -2,
          Math.min(2, (this.velocityX[index]! * (1 - mix) + avgX * mix) * decay),
        );
        this.nextY[index] = Math.max(
          -2,
          Math.min(2, (this.velocityY[index]! * (1 - mix) + avgY * mix) * decay),
        );
      }
    }
    [this.velocityX, this.nextX] = [this.nextX, this.velocityX];
    [this.velocityY, this.nextY] = [this.nextY, this.velocityY];
    this.writeTexture();
  }

  sample(uv: Vector2, out: Vector2): Vector2 {
    if (this.disposed) return out.set(0, 0);
    const x = Math.max(0, Math.min(1, uv.x)) * (this.size - 1);
    const y = Math.max(0, Math.min(1, uv.y)) * (this.size - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(this.size - 1, x0 + 1);
    const y1 = Math.min(this.size - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const interpolate = (values: Float32Array) => {
      const a =
        values[y0 * this.size + x0]! * (1 - tx) +
        values[y0 * this.size + x1]! * tx;
      const b =
        values[y1 * this.size + x0]! * (1 - tx) +
        values[y1 * this.size + x1]! * tx;
      return a * (1 - ty) + b * ty;
    };
    return out.set(interpolate(this.velocityX), interpolate(this.velocityY));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.dispose();
  }

  private writeTexture() {
    const data = this.texture.image.data as Float32Array;
    for (let index = 0; index < this.velocityX.length; index++) {
      const offset = index * 4;
      const x = this.velocityX[index]!;
      const y = this.velocityY[index]!;
      data[offset] = x;
      data[offset + 1] = y;
      data[offset + 2] = Math.min(1, Math.hypot(x, y) / 2);
      data[offset + 3] = 1;
    }
    this.texture.needsUpdate = true;
  }
}
