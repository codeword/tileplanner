// Config JSON modal: show, copy and apply.
import { configFromProject, projectFromConfig } from '../config.js';
import { DEFAULTS, setState, state, wallSettings } from '../state.js';
import { getSavedWalls, setSavedWalls } from './takeoff.js';

const configModal = document.getElementById('configModal');
const configJsonTextarea = document.getElementById('configJsonTextarea');
const configStatusMsg = document.getElementById('configStatusMsg');

export function openConfigModal() {
    configJsonTextarea.value = JSON.stringify(configFromProject(state, getSavedWalls()), null, 2);
    configStatusMsg.textContent = '';
    configModal.classList.remove('hidden');
}

export function closeConfigModal() {
    configModal.classList.add('hidden');
}

export function copyConfigJson() {
    configJsonTextarea.select();
    document.execCommand('copy');
    configStatusMsg.textContent = 'Config JSON copied to clipboard!';
    configStatusMsg.className = 'text-xs font-mono text-emerald-400';
    setTimeout(() => { configStatusMsg.textContent = ''; }, 2500);
}

export function applyConfigJson() {
    let parsed;
    try {
        parsed = JSON.parse(configJsonTextarea.value);
    } catch (err) {
        configStatusMsg.textContent = 'Error parsing JSON: ' + err.message;
        configStatusMsg.className = 'text-xs font-mono text-rose-400';
        return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        configStatusMsg.textContent = 'Config must be a JSON object.';
        configStatusMsg.className = 'text-xs font-mono text-rose-400';
        return;
    }

    // The config replaces the saved walls and the colors; the wall being edited starts over
    const { colors, walls, warnings } = projectFromConfig(parsed, state);
    setSavedWalls(walls);
    setState({ ...wallSettings(DEFAULTS), ...colors });

    if (warnings.length) {
        configStatusMsg.textContent = 'Applied with adjustments: ' + warnings.join('; ');
        configStatusMsg.className = 'text-xs font-mono text-amber-400';
    } else {
        closeConfigModal();
    }
}
