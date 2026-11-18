// CHRONOWEAVE input: keyboard + mouse, canvas-space coordinates, click-rect buttons.
// The renderer registers the visible buttons each frame; consumeClick() only fires
// when the click actually landed inside that button's rect (DOCKMASTER lesson:
// a click handler must never fire on a wrong rect, and every rect must match the art).
export function createInput(canvas) {
  const input = {
    keys: {},
    mouseX: 640, mouseY: 360, mouseDown: false,
    clickX: 0, clickY: 0, clickPending: false,
    clickRects: [],
    startPressed: false, restartPressed: false, pausePressed: false, titlePressed: false,
    mutePressed: false, choicePressed: -1, difficultyPressed: -1, rewindPressed: false,
    dashPressed: false, stasisPressed: false,
  };
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys[e.code] = true;
    if (e.code === 'Enter') input.startPressed = true;
    if (e.code === 'KeyR') { input.restartPressed = true; input.rewindPressed = true; }
    if (e.code === 'KeyT') input.titlePressed = true;
    if (e.code === 'KeyQ') input.rewindPressed = true;
    if (e.code === 'KeyP' || e.code === 'Escape') input.pausePressed = true;
    if (e.code === 'KeyM') input.mutePressed = true;
    if (e.code === 'Digit1') input.choicePressed = 0;
    if (e.code === 'Digit2') input.choicePressed = 1;
    if (e.code === 'Digit3') input.choicePressed = 2;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'Space') input.dashPressed = true;
    if (e.code === 'KeyE') input.stasisPressed = true;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  canvas.addEventListener('mousemove', (e) => {
    const p = toCanvas(e); input.mouseX = p.x; input.mouseY = p.y;
  });
  canvas.addEventListener('mousedown', (e) => {
    const p = toCanvas(e);
    input.mouseX = p.x; input.mouseY = p.y; input.mouseDown = true;
    input.clickX = p.x; input.clickY = p.y; input.clickPending = true;
  });
  window.addEventListener('mouseup', () => { input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // True only when the pending click landed inside rect; consumes the click.
  input.consumeClick = function (rect) {
    if (!input.clickPending) return false;
    if (input.clickX >= rect.x && input.clickX <= rect.x + rect.w &&
        input.clickY >= rect.y && input.clickY <= rect.y + rect.h) {
      input.clickPending = false;
      return true;
    }
    return false;
  };
  input.clearEdges = function () {
    input.startPressed = false; input.restartPressed = false; input.pausePressed = false; input.titlePressed = false;
    input.mutePressed = false; input.choicePressed = -1; input.difficultyPressed = -1;
    input.dashPressed = false; input.stasisPressed = false; input.rewindPressed = false; input.clickPending = false;
  };
  // Movement vector from WASD / arrows, normalised.
  input.moveVector = function () {
    let mx = 0, my = 0;
    if (input.keys.KeyW || input.keys.ArrowUp) my -= 1;
    if (input.keys.KeyS || input.keys.ArrowDown) my += 1;
    if (input.keys.KeyA || input.keys.ArrowLeft) mx -= 1;
    if (input.keys.KeyD || input.keys.ArrowRight) mx += 1;
    if (mx !== 0 && my !== 0) { const inv = 1 / Math.sqrt(2); mx *= inv; my *= inv; }
    return { mx, my };
  };
  return input;
}
