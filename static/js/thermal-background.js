(() => {
  'use strict';

  const GRID_SCALE = 4;
  const FPS = 30;
  const DIFFUSIVITY = 0.225;
  const DECAY = 0.985;
  const POINTER_INTENSITY = 2.4;
  const POINTER_RADIUS = 7;
  const CANVAS_OPACITY = 0.4;

  const COLOR_STOPS = [
    { t: 0.00, color: [44, 86, 210] },
    { t: 0.20, color: [54, 100, 228] },
    { t: 0.42, color: [66, 114, 244] },
    { t: 0.66, color: [85, 108, 255] },
    { t: 0.84, color: [103, 96, 255] },
    { t: 0.95, color: [124, 88, 255] },
    { t: 1.00, color: [146, 82, 255] }
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function buildColormap(stops, size) {
    const lut = new Array(size);

    for (let i = 0; i < size; i += 1) {
      const t = i / (size - 1);
      let left = stops[0];
      let right = stops[stops.length - 1];

      for (let j = 0; j < stops.length - 1; j += 1) {
        if (t >= stops[j].t && t <= stops[j + 1].t) {
          left = stops[j];
          right = stops[j + 1];
          break;
        }
      }

      const span = Math.max(1e-6, right.t - left.t);
      const localT = clamp((t - left.t) / span, 0, 1);
      lut[i] = [
        Math.round(left.color[0] + (right.color[0] - left.color[0]) * localT),
        Math.round(left.color[1] + (right.color[1] - left.color[1]) * localT),
        Math.round(left.color[2] + (right.color[2] - left.color[2]) * localT)
      ];
    }

    return lut;
  }

  const COLORMAP = buildColormap(COLOR_STOPS, 256);

  let canvas;
  let ctx;
  let imageData;
  let pixels;
  let grid;
  let nextGrid;
  let gridW = 0;
  let gridH = 0;
  let animationFrame = null;
  let lastFrameTime = 0;

  const pointer = {
    x: -1,
    y: -1,
    active: false
  };

  function resizeGrid() {
    gridW = Math.max(1, Math.floor(window.innerWidth / GRID_SCALE));
    gridH = Math.max(1, Math.floor(window.innerHeight / GRID_SCALE));

    canvas.width = gridW;
    canvas.height = gridH;

    grid = new Float32Array(gridW * gridH);
    nextGrid = new Float32Array(gridW * gridH);
    imageData = ctx.createImageData(gridW, gridH);
    pixels = imageData.data;
  }

  function updatePointer(clientX, clientY) {
    if (!gridW || !gridH) {
      return;
    }

    pointer.x = clamp(Math.floor((clientX / window.innerWidth) * gridW), 0, gridW - 1);
    pointer.y = clamp(Math.floor((clientY / window.innerHeight) * gridH), 0, gridH - 1);
    pointer.active = true;
  }

  function addHeatSource() {
    if (!pointer.active) {
      return;
    }

    for (let dy = -POINTER_RADIUS; dy <= POINTER_RADIUS; dy += 1) {
      for (let dx = -POINTER_RADIUS; dx <= POINTER_RADIUS; dx += 1) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > POINTER_RADIUS) {
          continue;
        }

        const x = pointer.x + dx;
        const y = pointer.y + dy;
        if (x < 0 || x >= gridW || y < 0 || y >= gridH) {
          continue;
        }

        const index = y * gridW + x;
        const falloff = 1 - distance / (POINTER_RADIUS + 0.001);
        grid[index] = Math.min(2.0, grid[index] + POINTER_INTENSITY * 0.18 * falloff);
      }
    }
  }

  function diffuseOnce() {
    for (let y = 1; y < gridH - 1; y += 1) {
      for (let x = 1; x < gridW - 1; x += 1) {
        const index = y * gridW + x;
        const laplacian =
          grid[index - 1] +
          grid[index + 1] +
          grid[index - gridW] +
          grid[index + gridW] -
          4 * grid[index];

        const value = (grid[index] + DIFFUSIVITY * laplacian) * DECAY;
        nextGrid[index] = Number.isFinite(value) ? Math.max(0, value) : 0;
      }
    }

    const swap = grid;
    grid = nextGrid;
    nextGrid = swap;
  }

  function render() {
    for (let i = 0; i < grid.length; i += 1) {
      const value = clamp(grid[i], 0, 1);
      const mapped = Math.pow(value, 0.82);
      const color = COLORMAP[Math.floor(mapped * 255)];
      const pixelIndex = i * 4;
      const alphaStrength = Math.pow(mapped, 1.2);

      pixels[pixelIndex] = color[0];
      pixels[pixelIndex + 1] = color[1];
      pixels[pixelIndex + 2] = color[2];
      pixels[pixelIndex + 3] = value > 0.015 ? Math.round(18 + alphaStrength * 210) : 0;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function animate(timestamp) {
    if (timestamp - lastFrameTime < 1000 / FPS) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }

    lastFrameTime = timestamp;
    addHeatSource();
    diffuseOnce();
    diffuseOnce();
    diffuseOnce();
    render();
    animationFrame = window.requestAnimationFrame(animate);
  }

  function handleMouseMove(event) {
    updatePointer(event.clientX, event.clientY);
  }

  function handleTouchMove(event) {
    if (event.touches && event.touches.length > 0) {
      updatePointer(event.touches[0].clientX, event.touches[0].clientY);
    }
  }

  function clearPointer() {
    pointer.active = false;
  }

  function init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    canvas = document.getElementById('thermal-canvas');
    if (!canvas) {
      return;
    }

    ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    resizeGrid();
    canvas.style.opacity = String(CANVAS_OPACITY);

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    document.addEventListener('mouseleave', clearPointer, { passive: true });
    document.addEventListener('touchend', clearPointer, { passive: true });
    window.addEventListener('resize', resizeGrid, { passive: true });

    animationFrame = window.requestAnimationFrame(animate);
  }

  window.addEventListener('beforeunload', () => {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
    }
  });

  document.addEventListener('DOMContentLoaded', init);
})();
