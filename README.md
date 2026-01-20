# ComfyUI-DynamicInputsHotFix

<p align="center">
  <img src="images/skunk.png" alt="Skunk mascot" width="300">
</p>

<p align="center">
  <b>Research by <a href="https://github.com/mobcat40/ComfyUI-PromptChain">ComfyUI-PromptChain</a></b>
</p>

Fixes for building custom nodes with dynamic input slots and custom editors in ComfyUI.

## What This Does

1. **Dynamic Input Slots** - Reference code for nodes that spawn new input slots as you connect to them
2. **Ctrl+Z Fix** - Stops ComfyUI from hijacking undo/redo when typing in CodeMirror or contentEditable
3. **Click Fix** - Stops the node from being selected when you click inside a custom editor

## Why You Need This

If you're building a custom node with:
- Input slots that grow/shrink dynamically
- A code editor (CodeMirror, Monaco, Ace)
- Any contentEditable text box

...you'll hit these bugs. This extension fixes them and shows you how.

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/mobcat40/ComfyUI-DynamicInputsHotFix
```

Restart ComfyUI. Find the demo node under `FrontendPatches` category.

## The Patches

### Patch 1: Ctrl+Z Fix (Undo Interception)

ComfyUI's `ChangeTracker` listens for Ctrl+Z/Y globally to trigger workflow undo/redo. It only skips native `<input>` and `<textarea>` elements, not contentEditable or CodeMirror editors. When you press Ctrl+Z in a contentEditable div, it deletes your node instead of undoing your text.

The fix adds a capture-phase keydown listener that runs *before* ChangeTracker. When Ctrl+Z/Y is pressed in an editable element, it calls `stopImmediatePropagation()` to prevent ChangeTracker from seeing the event. The editor then handles undo/redo natively.

This is cleaner than the old `tagName` spoof approach:
- No global prototype patching
- Only affects Ctrl+Z/Y keydown events
- Easy to understand and debug

### Patch 2: Click Fix (Node Selection Prevention)

When you click inside a custom editor, ComfyUI selects the node and highlights all connected wires. Annoying flicker.

The fix hooks `onNodeSelected` and immediately deselects using a triple-clear pattern (immediate + microtask + rAF) to catch all timing edge cases.

## Dynamic Input Slots

The demo node shows the pattern: start with one empty slot, add more as connections are made, clean up on disconnect. See `web/main.js` for the full implementation.

Key points:
- Use `onConnectionsChange` hook
- `slotType === 1` for inputs
- `"*"` type accepts any connection
- Always keep one empty slot at the end

## Settings

Both patches can be toggled off in ComfyUI Settings. Useful for testing if ComfyUI fixed these upstream.

## Compatibility

Tested on ComfyUI v0.9.2. The dynamic inputs work natively now (Vue reactivity was fixed upstream). The two patches are still required for custom editors.

## License

MIT
