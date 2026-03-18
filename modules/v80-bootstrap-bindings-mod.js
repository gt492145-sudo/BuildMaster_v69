// Bootstrap event bindings module (v8.0).
(function attachV80BootstrapBindingsModule(global) {
  function initV80BootstrapBindings() {
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer || !canvas) return;

    canvasContainer.addEventListener('mousedown', begin3DDrag);
    canvasContainer.addEventListener('touchstart', begin3DDrag, { passive: true });
    window.addEventListener('mousemove', on3DDragMove);
    window.addEventListener('touchmove', on3DDragMove, { passive: false });
    window.addEventListener('mouseup', end3DDrag);
    window.addEventListener('touchend', end3DDrag);
    window.addEventListener('touchcancel', end3DDrag);

    canvasContainer.addEventListener('mousedown', beginBlueprintPanMouse);
    window.addEventListener('mousemove', moveBlueprintPanMouse);
    window.addEventListener('mouseup', endBlueprintPanMouse);
    canvasContainer.addEventListener('touchstart', onBlueprintTouchStart, { passive: false });
    canvasContainer.addEventListener('touchmove', onBlueprintTouchMove, { passive: false });
    canvasContainer.addEventListener('touchend', onBlueprintTouchEnd, { passive: true });
    canvasContainer.addEventListener('touchcancel', onBlueprintTouchEnd, { passive: true });
    canvasContainer.addEventListener('wheel', onBlueprintWheelZoom, { passive: false });
    canvasContainer.addEventListener('dblclick', onBlueprintDoubleClick);
    canvasContainer.addEventListener('touchend', onBlueprintTapForFit, { passive: true });

    canvas.addEventListener('click', onCanvasClickForPointInput);
    canvas.addEventListener('touchend', onCanvasTouchEndForPointInput, { passive: true });

    initMobileFuncDrawer();
    document.addEventListener('visibilitychange', onDocumentVisibilityChangeForOwnerLock);
  }

  function onCanvasClickForPointInput(e) {
    if (suppressNextCanvasClick) {
      suppressNextCanvasClick = false;
      return;
    }
    if (Date.now() - canvasLastTouchAt < CANVAS_TOUCH_CLICK_GUARD_MS) return;
    handleCanvasPointInput(e.clientX, e.clientY);
  }

  function onCanvasTouchEndForPointInput(e) {
    if (suppressNextCanvasTouch) {
      suppressNextCanvasTouch = false;
      return;
    }
    if (!e.changedTouches || !e.changedTouches.length) return;
    canvasLastTouchAt = Date.now();
    const t = e.changedTouches[0];
    handleCanvasPointInput(t.clientX, t.clientY);
  }

  function onDocumentVisibilityChangeForOwnerLock() {
    if (document.visibilityState !== 'visible') {
      sessionStorage.removeItem(OWNER_UNLOCK_SESSION_KEY);
      updateOwnerLockButton();
    }
  }

  global.initV80BootstrapBindings = initV80BootstrapBindings;
})(window);
