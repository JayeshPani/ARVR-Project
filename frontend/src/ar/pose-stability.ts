import { Matrix4, Quaternion, Vector3 } from "three";

/** Count camera samples, not render ticks. A brief GOOD pulse must not reveal a pose. */
export class TrackingWarmup {
  private since = -1;
  private samples = 0;
  private world = "";
  reset(): void { this.since = -1; this.samples = 0; }
  update(good: boolean, newFrame: boolean, now: number, world: string): boolean {
    if (world !== this.world) { this.reset(); this.world = world; }
    if (!good) { this.reset(); return false; }
    if (newFrame) {
      if (this.since < 0) this.since = now;
      this.samples++;
    }
    return this.samples >= 6 && now - this.since >= 500;
  }
}

/** Small camera-relative smoothing, with faster response during deliberate movement.
 * Never interpolate across a tracking discontinuity or invent an anchor after loss.
 * Units are the SDK's metres. The caller hides rejected poses and requires placement.
 */
export class ArPoseFilter {
  readonly matrix = new Matrix4();
  private candidate = new Matrix4();
  private position = new Vector3();
  private rotation = new Quaternion();
  private scale = new Vector3();
  private previousPosition = new Vector3();
  private previousRotation = new Quaternion();
  private smoothPosition = new Vector3();
  private smoothRotation = new Quaternion();
  private lastTime = -1;

  reset(): void { this.lastTime = -1; }
  update(pose: ArrayLike<number>, now: number): boolean {
    if (pose.length !== 16 || !Number.isFinite(now)) return false;
    for (let i = 0; i < 16; i++) if (!Number.isFinite(pose[i])) return false;
    this.candidate.fromArray(pose);
    if (Math.abs(this.candidate.determinant()) < 1e-8) return false;
    this.candidate.decompose(this.position, this.rotation, this.scale);
    if (this.lastTime >= 0) {
      // Cap the allowance after a tracking gap: a relocalized map must not teleport the model.
      const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTime) / 1000));
      const distance = this.position.distanceTo(this.previousPosition);
      const angle = this.rotation.angleTo(this.previousRotation);
      if (distance > 0.18 + 2.5 * dt || angle > Math.PI / 9 + Math.PI * dt) return false;
      const translationTau = Math.max(0.012, 0.06 / (1 + 6 * distance / dt));
      const rotationTau = Math.max(0.008, 0.035 / (1 + 3 * angle / dt));
      this.smoothPosition.lerp(this.position, 1 - Math.exp(-dt / translationTau));
      this.smoothRotation.slerp(this.rotation, 1 - Math.exp(-dt / rotationTau));
    } else {
      this.smoothPosition.copy(this.position);
      this.smoothRotation.copy(this.rotation);
    }
    this.matrix.compose(this.smoothPosition, this.smoothRotation, this.scale);
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    this.lastTime = now;
    return true;
  }
}
