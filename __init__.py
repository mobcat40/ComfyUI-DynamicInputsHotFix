import json

class DynamicInputs:
    """Example node demonstrating dynamic inputs with Vue hotfix."""

    CATEGORY = "DynamicInputsFix"
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("state",)
    FUNCTION = "execute"

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {}
        }

    def execute(self, **kw):
        state = {
            "input_count": len(kw),
            "inputs": {}
        }
        for name, value in kw.items():
            val_repr = str(value)[:100] if not hasattr(value, 'shape') else f"tensor{list(value.shape)}"
            state["inputs"][name] = {
                "type": type(value).__name__,
                "value": val_repr
            }
        return (json.dumps(state, indent=2),)


NODE_CLASS_MAPPINGS = {
    "DynamicInputs": DynamicInputs
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DynamicInputs": "Dynamic Inputs"
}

WEB_DIRECTORY = "./web"
__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
