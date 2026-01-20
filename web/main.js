/**
 * ComfyUI-FrontendPatches
 *
 * Two patches for custom node development:
 * 1. ChangeTracker - Intercept Ctrl+Z/Y in editable elements before ChangeTracker sees them
 * 2. Node Selection - Prevent node selection when clicking in custom UI
 *
 * Settings stored in localStorage to toggle patches for debugging.
 * MUST run before ComfyUI code executes.
 */

// ============================================================================
// Settings
// ============================================================================

const SETTINGS_KEY = 'FrontendPatches';

function getSetting(key, defaultValue = true) {
    try {
        const stored = localStorage.getItem(`${SETTINGS_KEY}.${key}`);
        if (stored === null) return defaultValue;
        return stored === 'true';
    } catch {
        return defaultValue;
    }
}

function setSetting(key, value) {
    try {
        localStorage.setItem(`${SETTINGS_KEY}.${key}`, String(value));
    } catch {}
}

// ============================================================================
// Patch 1: ChangeTracker Undo/Redo Interception
// ============================================================================
//
// Problem: ComfyUI's ChangeTracker listens for Ctrl+Z/Y globally and triggers
// workflow undo/redo. It only skips native INPUT and TEXTAREA elements,
// not contentEditable or CodeMirror editors.
//
// Solution: Add a capture-phase keydown listener that runs BEFORE ChangeTracker's
// listener. When we detect Ctrl+Z/Y in an editable element, we call
// stopImmediatePropagation() to prevent ChangeTracker from seeing the event.
//
// This is cleaner than the old tagName spoof approach because:
// - No global prototype patching
// - Only affects Ctrl+Z/Y keydown events
// - Easy to understand and debug
//

;(function patchChangeTracker() {
    if (!getSetting('undoInterception', true)) {
        console.log('[FrontendPatches] Patch 1: Undo interception DISABLED');
        return;
    }

    // Selectors for editable elements
    const EDITABLE_SELECTORS = [
        '[contenteditable="true"]',
        '.cm-editor',
        '.cm-content',
    ].join(',');

    // Capture-phase listener runs BEFORE ChangeTracker's listener
    window.addEventListener('keydown', (e) => {
        // Only care about Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (redo)
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
        const key = e.key.toUpperCase();
        if (key !== 'Z' && key !== 'Y') return;

        // Check if we're in an editable element
        const el = document.activeElement;
        if (
            el?.tagName === 'INPUT' ||
            el?.tagName === 'TEXTAREA' ||
            el?.isContentEditable ||
            el?.closest?.(EDITABLE_SELECTORS)
        ) {
            // Stop ChangeTracker from seeing this event
            // The editor will handle undo/redo natively
            e.stopImmediatePropagation();
        }
    }, true);  // <-- capture phase, runs first

    console.log('[FrontendPatches] Patch 1: Undo interception applied');
})();

// ============================================================================
// Patch 2: Node Selection Prevention
// ============================================================================

import { app } from "../../scripts/app.js";

// Selectors for UI elements that should not trigger node selection
const ISOLATED_SELECTORS = [
    '[contenteditable="true"]',
    '[contenteditable]',
    '.cm-editor',
    '.cm-content',
    '.cm-scroller',
    '.fp-isolated',  // Generic class for any isolated element
].join(',');

// Flag: did we just click in isolated UI?
let clickedInIsolatedUI = false;

/**
 * Clear all node selection and link highlighting.
 * Uses triple-clear pattern to catch highlighting that happens after onNodeSelected hook returns.
 */
function clearSelectionAndHighlights() {
    const clear = () => {
        app.canvas?.deselectAll();
        if (app.canvas) app.canvas.highlighted_links = {};
        app.canvas?.setDirty(true, true);
    };

    // Clear immediately
    clear();

    // Clear via microtask (catches highlighting set after hook returns)
    Promise.resolve().then(clear);

    // Clear via rAF as backup
    requestAnimationFrame(clear);
}

/**
 * Set up click tracking and onNodeSelected hook
 */
function setupNodeSelectionPrevention() {
    if (!getSetting('nodeSelectionPrevention', true)) {
        console.log('[FrontendPatches] Patch 2: Node selection prevention DISABLED');
        return;
    }

    if (!app.canvas) {
        requestAnimationFrame(setupNodeSelectionPrevention);
        return;
    }

    // Track pointerdown on isolated UI elements (capture phase)
    window.addEventListener('pointerdown', (e) => {
        clickedInIsolatedUI = !!e.target.closest(ISOLATED_SELECTORS);

        if (clickedInIsolatedUI) {
            // Stop propagation to prevent Vue drag handlers
            e.stopPropagation();
        }
    }, true);

    // Reset on pointerup
    document.addEventListener('pointerup', () => {
        requestAnimationFrame(() => {
            clickedInIsolatedUI = false;
        });
    }, true);

    // Hook onNodeSelected to intercept selection from our UI clicks
    const originalOnNodeSelected = app.canvas.onNodeSelected;
    app.canvas.onNodeSelected = function(node) {
        // If we clicked in isolated UI, deselect and bail
        if (clickedInIsolatedUI) {
            clearSelectionAndHighlights();
            clickedInIsolatedUI = false;
            return;
        }
        return originalOnNodeSelected?.call(this, node);
    };

    console.log('[FrontendPatches] Patch 2: Node selection prevention applied');
}

// ============================================================================
// Extension Registration
// ============================================================================

const DEMO_ID = "DynamicInputs";
const DEMO_PREFIX = "input";
const DEMO_TYPE = "*";

// CSS for wildcard slot color
const style = document.createElement('style');
style.textContent = `
    :root {
        --color-datatype-\\*: #888;
    }
`;
document.head.appendChild(style);

app.registerExtension({
    name: 'comfy.frontendPatches',

    async setup() {
        // Track initial values to detect changes
        const initialValues = {
            undoInterception: getSetting('undoInterception', true),
            nodeSelectionPrevention: getSetting('nodeSelectionPrevention', true),
        };
        let currentValues = { ...initialValues };
        let restartAlert = null;

        function checkForChanges() {
            const changed =
                currentValues.undoInterception !== initialValues.undoInterception ||
                currentValues.nodeSelectionPrevention !== initialValues.nodeSelectionPrevention;

            if (changed && !restartAlert) {
                // Find our settings and inject alert after them
                setTimeout(() => {
                    const settingsRows = document.querySelectorAll('[id^="FrontendPatches"]');
                    if (settingsRows.length > 0) {
                        const lastRow = settingsRows[settingsRows.length - 1]?.closest('tr, .settings-row, [class*="setting"]');
                        if (lastRow?.parentElement) {
                            restartAlert = document.createElement('div');
                            restartAlert.className = 'fp-restart-alert';
                            restartAlert.innerHTML = '⚠️ Settings changed - Requires ComfyUI Restart';
                            restartAlert.style.cssText = `
                                background: #6b1c1c;
                                color: #ff9999;
                                padding: 10px 16px;
                                margin: 8px 0;
                                border-radius: 4px;
                                font-weight: 500;
                                border: 1px solid #8b2c2c;
                            `;
                            lastRow.parentElement.insertBefore(restartAlert, lastRow.nextSibling);
                        }
                    }
                }, 50);
            } else if (!changed && restartAlert) {
                restartAlert.remove();
                restartAlert = null;
            }
        }

        // Register settings in ComfyUI settings panel
        app.ui?.settings?.addSetting?.({
            id: `${SETTINGS_KEY}.undoInterception`,
            name: 'Patch 1: Undo Interception (Ctrl+Z fix)',
            tooltip: 'Intercepts Ctrl+Z/Y in contentEditable and CodeMirror editors before ChangeTracker sees them. Without this, Ctrl+Z deletes the node instead of undoing text.',
            type: 'boolean',
            defaultValue: true,
            onChange: (value) => {
                setSetting('undoInterception', value);
                currentValues.undoInterception = value;
                checkForChanges();
            },
        });

        app.ui?.settings?.addSetting?.({
            id: `${SETTINGS_KEY}.nodeSelectionPrevention`,
            name: 'Patch 2: Node Selection Prevention',
            tooltip: 'Prevents node from being selected when clicking in contentEditable or CodeMirror editors.',
            type: 'boolean',
            defaultValue: true,
            onChange: (value) => {
                setSetting('nodeSelectionPrevention', value);
                currentValues.nodeSelectionPrevention = value;
                checkForChanges();
            },
        });

        setupNodeSelectionPrevention();
        console.log('[FrontendPatches] Extension loaded');
    },

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== DEMO_ID) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = async function() {
            const result = onNodeCreated?.apply(this);

            // Add initial empty input slot
            this.addInput(DEMO_PREFIX, DEMO_TYPE);

            // Add contentEditable test widget (demonstrates both patches)
            const container = document.createElement('div');
            container.style.cssText = `
                padding: 10px;
                background: #1a1a1a;
                border-radius: 4px;
                min-width: 280px;
            `;

            const contentEditable = document.createElement('div');
            contentEditable.contentEditable = 'true';
            contentEditable.textContent = 'Click here, edit text, ctrl + z.';
            contentEditable.style.cssText = `
                width: 100%;
                min-height: 60px;
                padding: 8px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 4px;
                color: #fff;
                box-sizing: border-box;
                outline: none;
            `;
            container.appendChild(contentEditable);

            const hint = document.createElement('div');
            hint.style.cssText = 'color: #555; font-size: 10px; margin-top: 6px;';
            hint.textContent = 'Patch 1: Ctrl+Z undos text. Patch 2: Click doesn\'t select node.';
            container.appendChild(hint);

            this.addDOMWidget('editor', 'custom', container, {
                serialize: false,
                hideOnZoom: false,
            });

            this.setSize([320, 200]);

            return result;
        };

        // Handle dynamic input slots
        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, isConnect, link_info, node_slot) {
            const result = onConnectionsChange?.apply(this, arguments);

            // Only handle input slots
            if (slotType !== 1) return result;

            if (link_info && isConnect) {
                // On connect: inherit type from source
                const fromNode = this.graph._nodes.find(n => n.id === link_info.origin_id);
                if (fromNode) {
                    const parentSlot = fromNode.outputs[link_info.origin_slot];
                    if (parentSlot) {
                        node_slot.type = parentSlot.type;
                        node_slot.name = `${DEMO_PREFIX}_connected`;
                    }
                }
            } else if (!isConnect) {
                // On disconnect: remove the slot
                this.removeInput(slot_idx);
            }

            // Clean up orphaned slots and renumber
            let idx = 0;
            let count = 0;
            while (idx < this.inputs.length) {
                const slot = this.inputs[idx];
                if (slot.link === null && idx < this.inputs.length - 1) {
                    this.removeInput(idx);
                    continue;
                }
                count++;
                slot.name = slot.link !== null ? `${DEMO_PREFIX}_${count}` : DEMO_PREFIX;
                idx++;
            }

            // Always have one empty slot at the end
            const last = this.inputs[this.inputs.length - 1];
            if (!last || last.link !== null) {
                this.addInput(DEMO_PREFIX, DEMO_TYPE);
            }

            return result;
        };
    }
});
