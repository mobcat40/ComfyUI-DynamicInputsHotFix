# ComfyUI Dynamic Input Rendering Bug

## Problem

When dynamically adding input slots to a node via JavaScript (`this.addInput()`), the new slots are added to the node's data model but **do not render visually** until the page is refreshed.

This affects all custom nodes that use dynamic inputs, including:
- cozy_ex_dynamic
- Any node using `addInput()` in `onConnectionsChange`

## Root Cause

Located in: `ComfyUI_frontend/src/composables/graph/useGraphNodeManager.ts`

The Vue rendering layer listens for `node:slot-links:changed` events to refresh node slot visuals:

```typescript
'node:slot-links:changed': (slotLinksEvent) => {
  if (slotLinksEvent.slotType === NodeSlotType.INPUT) {
    refreshNodeSlots(String(slotLinksEvent.nodeId))
  }
}
```

However, this event is **only fired for widget-linked inputs**. In `LGraphNode.ts`, every trigger is gated:

```typescript
if (targetInput.widget) {
  graph.trigger('node:slot-links:changed', { ... })
}
```

Regular socket inputs (without widgets) never trigger this event, so Vue never refreshes.

## Workaround

Manually trigger the event after modifying inputs:

```javascript
// In onConnectionsChange handler, after addInput/removeInput:
if (this.graph?.trigger) {
    this.graph.trigger('node:slot-links:changed', {
        nodeId: this.id,
        slotType: 1,  // INPUT
        slotIndex: slot_idx,
        connected: isConnect,
        linkId: link_info?.id ?? -1
    });
}
```

## Affected Versions

- ComfyUI frontend package 1.33.10+
- Likely introduced with Vue nodes merge (September 2025)

## Upstream Fix

The fix should be in `ComfyUI_frontend/src/lib/litegraph/src/LGraphNode.ts`:

Remove the `if (targetInput.widget)` guard around `node:slot-links:changed` triggers, or add a separate event for non-widget slot changes.

Issue should be filed at: https://github.com/Comfy-Org/ComfyUI_frontend/issues

## Related Files

- `src/lib/litegraph/src/LGraphNode.ts` - Lines 2863-2871, 3028-3036, 3073-3080
- `src/composables/graph/useGraphNodeManager.ts` - Lines 580-583

---

# Socket Color Not Updating (Secondary Issue)

## Problem

After the workaround above, the new input slot renders but the socket dot color doesn't update to show connected vs disconnected state visually.

## Root Cause

In `NodeSlots.vue`, the `InputSlot` component is rendered without a `:connected` prop:

```vue
<InputSlot
  :slot-data="input"
  :node-type="..."
  :node-id="..."
  :index="..."
  <!-- missing :connected="input.link !== null" -->
/>
```

`InputSlot.vue` expects a `connected` prop (line 48) and applies `lg-slot--connected` class based on it (line 122), but:
1. The prop is never passed from parent
2. No CSS rules exist for `lg-slot--connected` anyway
3. The slot dot color is determined by type, not connection state

## Analysis

The Vue slot rendering doesn't implement visual connected/disconnected state. The `connected` prop exists but is unused/incomplete. This might be intentional (simplified design) or an oversight.

The old canvas-based LiteGraph rendering had hollow vs filled dots for connection state, but the Vue layer doesn't replicate this.

---

# Slot Type/Color Not Updating on Connect (Third Issue)

## Problem

When connecting a wire to a dynamic input slot, the slot's `type` property is updated (e.g., from `*` to `STRING`), but the **color doesn't update** until page reload.

## Root Cause

Located in: `ComfyUI_frontend/src/composables/graph/useGraphNodeManager.ts`

The `refreshNodeSlots` function (lines 149-178) does a **shallow spread** of the inputs array:

```typescript
vueNodeData.set(nodeId, {
  ...currentData,
  inputs: nodeRef.inputs ? [...nodeRef.inputs] : undefined,
  // ...
})
```

This creates a new array, but the slot **object references** remain the same. When we mutate `node_slot.type = "STRING"`, Vue doesn't detect the change because the object reference is unchanged.

## Workaround

After changing the slot type, **replace the slot object** with a fresh copy to force Vue reactivity:

```javascript
// After changing type
node_slot.type = parent_link.type;
node_slot.name = `${_PREFIX}_`;

// Force Vue reactivity by replacing slot object reference
this.inputs[slot_idx] = { ...node_slot };
```

Then trigger the refresh event as usual. Vue will now see a new object reference and recalculate the `slotColor` computed property.

## Complete Workaround Pattern

```javascript
onConnectionsChange = function(slotType, slot_idx, event, link_info, node_slot) {
    // ... handle connection logic ...

    if (isConnect && parent_link) {
        node_slot.type = parent_link.type;
        // Replace object to trigger Vue reactivity
        this.inputs[slot_idx] = { ...node_slot };
    }

    // Trigger Vue refresh
    this.graph?.trigger('node:slot-links:changed', {
        nodeId: this.id,
        slotType: 1,
        slotIndex: slot_idx,
        connected: isConnect,
        linkId: link_info?.id ?? -1
    });
}
```

---

# Custom Slot Colors via CSS

## Problem

The Vue frontend ignores LiteGraph's `color_on`/`color_off` slot properties.

## How Slot Colors Work

Slot colors are determined by CSS variables based on type name:

```typescript
// src/constants/slotColors.ts
export function getSlotColor(type?: string | number | null): string {
  if (!type) return '#AAA'
  const typeStr = String(type).toUpperCase()
  return `var(--color-datatype-${typeStr}, #AAA)`
}
```

Palette colors are defined in `src/assets/palettes/dark.json` under `node_slot`.

## Workaround

Inject CSS to define custom type colors:

```javascript
const style = document.createElement('style');
style.textContent = `
    :root {
        --color-datatype-\\*: #888;
        --color-datatype-STRING: #8f8;
        --color-datatype-MYCUSTOMTYPE: #f80;
    }
`;
document.head.appendChild(style);
```

Note: The `*` character must be escaped as `\\*` in CSS.

---

# Slot Color Not Updating on Disconnect (Fourth Issue - UNFIXABLE)

## Problem

When disconnecting a wire from a dynamic input, the slot is removed and a new empty slot is added. The new slot has type `*`, but the **color stays the same as the previous slot** (e.g., green for STRING) until page reload.

This issue does NOT affect the connect case - only disconnect.

## Root Cause

Located in: `ComfyUI_frontend/src/renderer/extensions/vueNodes/components/NodeSlots.vue`

The InputSlot components use **index-based keys**:

```vue
<InputSlot
  v-for="(input, index) in filteredInputs"
  :key="`input-${index}`"
  :slot-data="input"
  ...
/>
```

When a slot is removed and a new one is added at the same index, Vue sees the same key (`input-0`) and **reuses the existing component instance**. The computed `slotColor` property caches the previous slot's type value and doesn't re-evaluate.

## Why Connect Works But Disconnect Doesn't

**Connect case**: We mutate an existing slot's `type` property AND replace the slot object. Vue sees the new object reference at the same index, and since it's a prop change to an existing component, the computed re-evaluates.

**Disconnect case**: We remove the old slot and add a completely new slot. Vue sees the same index key, reuses the component, and the computed `slotColor` remains cached with the old type.

## Attempted Workarounds (None Work)

1. ❌ Replacing slot objects with spread: `this.inputs[i] = { ...this.inputs[i] }`
2. ❌ Replacing entire array: `this.inputs = [...this.inputs]`
3. ❌ Triggering refresh event multiple times with delays
4. ❌ Calling `setDirtyCanvas(true, true)`
5. ❌ Adding unique IDs to slots

## Upstream Fix Required

The fix must be in `NodeSlots.vue`. The key should include slot-identifying data:

```vue
<!-- Current (broken) -->
:key="`input-${index}`"

<!-- Proposed fix -->
:key="`input-${index}-${input.type}-${input.name}`"
```

Or use a unique slot ID if one exists.

Issue should be filed at: https://github.com/Comfy-Org/ComfyUI_frontend/issues

## Workaround for Users

After disconnecting, users can refresh the page to see correct colors. The functionality is not affected - only the visual color is stale.
