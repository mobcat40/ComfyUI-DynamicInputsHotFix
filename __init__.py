"""
ComfyUI-FrontendPatches

Fixes core ComfyUI frontend issues that affect custom node development:
- Vue reactivity blindness (slots don't re-render after addInput/removeInput)
- ChangeTracker only knows INPUT/TEXTAREA (breaks CodeMirror, Monaco, etc.)
- LiteGraph event capture (blocks custom UI interaction)

This extension applies patches automatically. Other extensions can use the
JavaScript API for additional control.

See README.md for documentation.
"""

import json


class DynamicInputs:
    """
    Demo node showing dynamic inputs working correctly.

    This node accepts unlimited connections - each connection spawns a new slot.
    Without the Vue reactivity patches, new slots wouldn't render until refresh.
    """

    CATEGORY = "FrontendPatches"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("debug",)
    FUNCTION = "execute"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {}
        }

    def execute(self, **kwargs):
        """Return debug info about connected inputs."""
        state = {
            "input_count": len(kwargs),
            "inputs": {}
        }
        for name, value in kwargs.items():
            if hasattr(value, 'shape'):
                val_repr = f"tensor{list(value.shape)}"
            else:
                val_repr = str(value)[:100]

            state["inputs"][name] = {
                "type": type(value).__name__,
                "value": val_repr
            }

        return (json.dumps(state, indent=2),)


NODE_CLASS_MAPPINGS = {
    "DynamicInputs": DynamicInputs
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicInputs": "Dynamic Inputs (Demo)"
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
