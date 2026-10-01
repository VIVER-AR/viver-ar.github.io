// Presentation only: the tracker, fit defaults and camera pipeline are shared.
export function createTesterView() {
  if (document.body.dataset.presentation !== 'tester') return null;
  const byId = id => document.getElementById(id);
  const entry = byId('tester-entry'), hint = byId('tester-hint');
  const message = byId('tester-message'), error = byId('tester-error');
  const start = byId('start'), calibrate = byId('calibrate');
  let mode = 'idle';
  // Fullscreen requires a user gesture. The full viewport layout is the fallback.
  start.addEventListener('click', () => {
    if (mode !== 'idle' || document.fullscreenElement) return;
    try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })?.catch(() => {}); } catch {}
  });
  return {
    setMode(next) {
      mode = next;
      document.body.dataset.cameraState = next;
      entry.hidden = next === 'live';
      calibrate.hidden = next !== 'live';
      hint.hidden = next !== 'live';
      error.hidden = true;
      if (next === 'live') hint.textContent = '손등과 손가락을 펴고 약 2초 동안 멈춰 주세요.';
      if (next === 'loading') message.textContent = '카메라와 시계 착용을 준비하고 있어요.\n카메라 사용을 허용해 주세요.';
      if (next === 'idle') message.textContent = '손등과 손가락을 화면에 담고\n약 2초 동안 가만히 보여 주세요.';
    },
    notice(text, isError) {
      if (isError) {
        error.textContent = text.replace(/ vendor 폴더.*$/, '');
        error.hidden = false;
        entry.hidden = false;
      } else error.hidden = true;
    },
    tracking(calibrated) {
      if (mode === 'live') hint.hidden = !!calibrated;
    },
  };
}
