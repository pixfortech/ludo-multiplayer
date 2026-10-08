# Cost / credit approval checklist

No Higgsfield job is submitted without your explicit approval of a batch that passes this checklist. Approvals are recorded in [asset-approval-log.md](asset-approval-log.md).

## Before proposing a batch

- [ ] **Need:** each asset maps to a slot in the production plan and a phase that needs it now.
- [ ] **Procedural first:** generation is justified; the asset cannot be made better or cheaper procedurally or in Blender (geometry, symbols, UI, board layout are always procedural).
- [ ] **Spec ready:** the relevant spec doc exists and the prompt references it (palette hex values, materials, framing, avoid list).
- [ ] **Prompt versioned** in `assets/source/prompts/<id>.v<N>.md`.
- [ ] **Model verified** as currently available (`models_explore`); parameters valid for that model.
- [ ] **Outputs minimal:** the smallest number of variations that gives a real choice (default 4 for concepts, 1 for 3D).
- [ ] **Licence:** commercial-use and public-repo distribution terms checked for the model and provider.

## The batch request must state

| Field | Content |
| --- | --- |
| Assets | id, purpose, target slot |
| Model | exact model id + key parameters |
| Outputs | count per asset |
| Format | dimensions / aspect, or 3D format and polycount target |
| Credits | estimate **with its basis**: observed price, or "unknown" with a stated cap |
| Why generate | why not procedural |
| Deliverables | which files will be kept, where, and in what status |
| Cap | maximum credits for the whole batch; stop if reached |

## During the batch

- [ ] Run a **price probe** first (one output) when the price is unknown or settings differ from past observations; read the actual cost from `transactions`.
- [ ] Continue only if the projected total stays within the approved cap; otherwise stop and report.
- [ ] Never retry failed or poor outputs beyond the approved count without a new approval.
- [ ] Record each job id.

## After the batch

- [ ] Report actual credits used vs estimate, job ids, and the remaining balance.
- [ ] Commit only selected outputs (as `concept`) with full manifest provenance; record rejected job ids in the log.
- [ ] Present candidates with a defect review against the spec, and ask for asset approval separately from spending approval.
