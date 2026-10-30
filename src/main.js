// Entry point: wires state changes to the UI, binds inputs, exposes window.planner.
import { lastGrid, lastInventory, lastView, nav, renderTiling, scheduleRender, watchPixelRatio } from './app.js';
import { onStateChange, setState, state } from './state.js';
import { bindInputs, syncControls } from './ui/controls.js';

// --- Debugging handle ---
window.planner = {
    get state() { return state; },
    get lastGrid() { return lastGrid; },
    get lastInventory() { return lastInventory; },
    get lastView() { return lastView; },
    nav,
    setState,
    render: renderTiling
};

// --- Initialization ---
window.addEventListener('resize', scheduleRender);

watchPixelRatio();
window.addEventListener('DOMContentLoaded', () => {
    onStateChange(syncControls);
    onStateChange(scheduleRender);
    bindInputs();
    syncControls();
    scheduleRender();
});
