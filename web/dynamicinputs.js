import { app } from "../../scripts/app.js"

const _ID = "DynamicInputs";
const _PREFIX = "input";
const _TYPE = "*";

// CSS for slot colors (Vue uses CSS vars, not LiteGraph's color_on/color_off)
const style = document.createElement('style');
style.textContent = `
    :root {
        --color-datatype-\\*: #888;
        --color-datatype-STRING: #8f8;
    }
`;
document.head.appendChild(style);

app.registerExtension({
    name: 'comfy.dynamicInputsHotfix',
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== _ID) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = async function () {
            const me = onNodeCreated?.apply(this);
            this.addInput(_PREFIX, _TYPE);
            return me;
        }

        const onConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function (slotType, slot_idx, event, link_info, node_slot) {
            const me = onConnectionsChange?.apply(this, arguments);
            if (slotType !== 1) return me;

            const isConnect = event === true;

            if (link_info && isConnect) {
                // On connect: inherit type from source
                const fromNode = this.graph._nodes.find(n => n.id == link_info.origin_id);
                if (fromNode) {
                    const parent_link = fromNode.outputs[link_info.origin_slot];
                    if (parent_link) {
                        node_slot.type = parent_link.type;
                        node_slot.name = `${_PREFIX}_`;
                        this.inputs[slot_idx] = { ...node_slot };
                    }
                }
            } else if (!isConnect) {
                // On disconnect: remove the slot
                this.removeInput(slot_idx);
            }

            // Clean up any orphaned unlinked slots and renumber
            let idx = 0;
            let slot_tracker = {};
            for (const slot of this.inputs) {
                if (slot.link === null) {
                    try { this.removeInput(idx); } catch {}
                    continue;
                }
                idx++;
                const name = slot.name.split('_')[0];
                let count = (slot_tracker[name] || 0) + 1;
                slot_tracker[name] = count;
                slot.name = `${name}_${count}`;
            }

            // Always have one empty slot at the end
            const last = this.inputs[this.inputs.length - 1];
            if (last === undefined || last.link !== null) {
                this.addInput(_PREFIX, _TYPE);
            }

            // Trigger Vue refresh (workaround: event normally only fires for widget inputs)
            this.graph?.trigger?.('node:slot-links:changed', {
                nodeId: this.id,
                slotType: 1,
                slotIndex: slot_idx,
                connected: isConnect,
                linkId: link_info?.id ?? -1
            });
            this.graph?.setDirtyCanvas?.(true, true);

            return me;
        }
    },
});
