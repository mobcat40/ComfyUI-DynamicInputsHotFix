# ComfyUI-FrontendPatches

A reference implementation for **dynamic input slots** in ComfyUI custom nodes, plus two frontend patches for building nodes with custom editors (CodeMirror, Monaco, etc.).

> **Tested with ComfyUI v0.9.2** (January 2026)

## Dynamic Input Slots

The main feature: input slots that autogrow as you connect to them.

### How It Works

```javascript
// In your node's beforeRegisterNodeDef:
const onNodeCreated = nodeType.prototype.onNodeCreated;
nodeType.prototype.onNodeCreated = async function() {
    const result = onNodeCreated?.apply(this);

    // Start with one empty slot
    this.addInput("input", "*");

    return result;
};

const onConnectionsChange = nodeType.prototype.onConnectionsChange;
nodeType.prototype.onConnectionsChange = function(slotType, slot_idx, isConnect, link_info, node_slot) {
    const result = onConnectionsChange?.apply(this, arguments);

    // Only handle input slots (slotType === 1)
    if (slotType !== 1) return result;

    if (link_info && isConnect) {
        // On connect: inherit type from source
        const fromNode = this.graph._nodes.find(n => n.id === link_info.origin_id);
        if (fromNode) {
            const parentSlot = fromNode.outputs[link_info.origin_slot];
            if (parentSlot) {
                node_slot.type = parentSlot.type;
                node_slot.name = "input_connected";
            }
        }
    } else if (!isConnect) {
        // On disconnect: remove the slot
        this.removeInput(slot_idx);
    }

    // Cleanup: remove orphaned unlinked slots, renumber, ensure one empty at end
    let idx = 0;
    let count = 0;
    while (idx < this.inputs.length) {
        const slot = this.inputs[idx];
        if (slot.link === null && idx < this.inputs.length - 1) {
            this.removeInput(idx);
            continue;
        }
        count++;
        slot.name = slot.link !== null ? `input_${count}` : "input";
        idx++;
    }

    // Always have one empty slot ready
    const last = this.inputs[this.inputs.length - 1];
    if (!last || last.link !== null) {
        this.addInput("input", "*");
    }

    return result;
};
```

### Key Points

- **No Vue hacks needed** - ComfyUI v0.9.2 fixed the reactivity issue. `addInput()`/`removeInput()` just work now.
- Use `slotType === 1` for inputs, `slotType === 2` for outputs
- The `"*"` type accepts any connection
- Clean up orphans to prevent slot buildup

---

## Frontend Patches

Two patches for building nodes with custom editors (like CodeMirror):

### Patch 1: tagName Spoof (Ctrl+Z Fix)

**Problem**: ComfyUI's ChangeTracker only recognizes `INPUT` and `TEXTAREA` for undo/redo. ContentEditable divs (used by CodeMirror, Monaco, etc.) get their Ctrl+Z hijacked - it deletes the node instead of undoing text.

**Fix**: Spoof `Element.prototype.tagName` to return `'INPUT'` for contentEditable elements.

```javascript
Object.defineProperty(Element.prototype, 'tagName', {
    get: function() {
        const realTagName = originalDescriptor.get.call(this);

        // Spoof for contentEditable
        if (realTagName === 'DIV' && this.contentEditable === 'true') {
            return 'INPUT';
        }

        // Spoof for CodeMirror
        if (realTagName === 'DIV' && this.closest?.('.cm-editor')) {
            if (this.classList?.contains('cm-content')) {
                return 'INPUT';
            }
        }

        return realTagName;
    },
    configurable: true,
    enumerable: true
});
```

### Patch 2: Node Selection Prevention

**Problem**: Clicking in a contentEditable/CodeMirror editor selects the node and highlights its links. Visual flicker and unwanted state changes.

**Fix**: Track clicks on isolated UI, hook `onNodeSelected`, and use triple-clear pattern (immediate + microtask + rAF) to catch all timing edge cases.

```javascript
// Track clicks on isolated elements
window.addEventListener('pointerdown', (e) => {
    clickedInIsolatedUI = !!e.target.closest('[contenteditable], .cm-editor');
    if (clickedInIsolatedUI) e.stopPropagation();
}, true);

// Hook onNodeSelected
const originalOnNodeSelected = app.canvas.onNodeSelected;
app.canvas.onNodeSelected = function(node) {
    if (clickedInIsolatedUI) {
        // Triple-clear pattern
        const clear = () => {
            app.canvas?.deselectAll();
            if (app.canvas) app.canvas.highlighted_links = {};
            app.canvas?.setDirty(true, true);
        };
        clear();
        Promise.resolve().then(clear);
        requestAnimationFrame(clear);

        clickedInIsolatedUI = false;
        return;
    }
    return originalOnNodeSelected?.call(this, node);
};
```

---

## Settings

Both patches can be toggled in ComfyUI Settings for debugging. Useful when ComfyUI updates - disable patches to see if issues are fixed upstream.

A restart alert appears when settings change.

---

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/yourusername/ComfyUI-FrontendPatches
```

Restart ComfyUI.

---

## File Structure

```
ComfyUI-FrontendPatches/
├── __init__.py         # Python node (DynamicInputs demo)
├── web/
│   └── main.js         # All patches + demo node JS
└── README.md
```

---

## Demo Node

The "Dynamic Inputs (Demo)" node under `FrontendPatches` category demonstrates:

1. **Dynamic input slots** - Connect any output, new slot appears
2. **Patch 1** - Type in the contentEditable box, Ctrl+Z undoes text (not the node)
3. **Patch 2** - Click in the editor, node doesn't get selected

---

## Compatibility

| ComfyUI Version | Dynamic Inputs | Patch 1 (tagName) | Patch 2 (Selection) |
|-----------------|----------------|-------------------|---------------------|
| v0.9.2+         | Native         | Required          | Required            |

Vue reactivity for `addInput()`/`removeInput()` was fixed upstream in v0.9.2. The two patches are still required for custom editors.

---

## License

MIT

## Credits

- Dynamic inputs pattern inspired by [cozy_ex_dynamic](https://github.com/cozy-comfyui/cozy_ex_dynamic)
- Patches developed for [ComfyUI-PromptChain](https://github.com/anthropics/ComfyUI-PromptChain)
