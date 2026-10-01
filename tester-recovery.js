import { landmarkPoint } from './pose.js?v=714';

// Count the wrist and knuckle centre, not fingertips: a curl or a hidden thumb
// must not discard a good calibration. Test in the displayed camera viewport.
export function hasVisiblePalm(landmarks, view, mirror = false) {
  const ids = [0, 5, 9, 13, 17];
  if (landmarks?.length !== 21 || ids.some(i => !Number.isFinite(landmarks[i]?.x) || !Number.isFinite(landmarks[i]?.y))) return false;
  const points = ids.map(i => landmarkPoint({ ...landmarks[i], z: 0 }, view, mirror));
  const centre = points.slice(1).reduce((sum, p) => sum.add(p), points[0].clone().set(0, 0, 0)).multiplyScalar(.25);
  const inside = p => Math.abs(p.x) <= view.width / 2 && Math.abs(p.y) <= view.height / 2;
  return inside(points[0]) && inside(centre);
}

// Tester-only fallback. Give normal reacquisition first chance, then start a
// fresh calibration after a sustained departure. Never recycle the old pose
// onto a new hand or reset repeatedly while the new calibration is running.
export class TesterReturnRecovery {
  constructor() { this.reset(); }
  reset() {
    this.absentSince = null; this.absentFrames = 0;
    this.armed = false; this.returnedAt = null; this.lastTime = -Infinity;
  }
  update({ time, calibrated, visibleHands, accepted }) {
    if (!Number.isFinite(time) || time <= this.lastTime) return false;
    const gap = time - this.lastTime; this.lastTime = time;
    if (!calibrated) { this.reset(); this.lastTime = time; return false; }
    if (visibleHands === 0) {
      this.returnedAt = null;
      if (this.absentSince === null || gap > 400) { this.absentSince = time; this.absentFrames = 0; }
      this.absentFrames++;
      if (time - this.absentSince >= 800 && this.absentFrames >= 3) this.armed = true;
      return false;
    }
    this.absentSince = null; this.absentFrames = 0;
    if (accepted) { this.armed = false; this.returnedAt = null; return false; }
    if (!this.armed || visibleHands !== 1) { this.returnedAt = null; return false; }
    if (this.returnedAt === null || gap > 400) this.returnedAt = time;
    if (time - this.returnedAt < 600) return false;
    this.reset(); this.lastTime = time;
    return true;
  }
}
