# Terrain planning and direct realization

Use this workflow for new outdoor terrain worlds. Local revisions reuse the existing design and scene unless the requested change needs them updated. Indoor-only worlds do not need an outdoor terrain image. Discussion, plan-only, prompt-only, and explicit no-generation tasks stop at design. For actual builds, available OhMyGame tools and configured credentials suffice; no additional written generation authorization is needed. Use the [provider selection rules](world-contract.md#3d-asset-provider-selection). If no Meshy, Hyper3D, or free Hyper3D access is currently usable and the user has not explicitly declined to provide either API, direct the user to `Providers & Models` and wait. Only an explicit refusal to provide both APIs plus no free Hyper3D access permits the all-procedural scene fallback. Required image-generation blockers remain explicit. Credentials stay in the platform and must never be pasted into chat, prompts, commands, or project files.

## Intent, references, and the terrain image

1. Complete the intent pass in [world-expansion.md](world-expansion.md). Establish world scale, direction, entrances, regions, routes, landform relationships, visible information, and preliminary generated-asset roles and provider choices without inventing exact coordinates.
2. Choose 1–3 relevant images from [reference-library](reference-library), not all ten. Actually open them with the available image-reading capability. Record each source path, spatial principles to `borrow`, and theme, shapes, colors, buildings, or details to `avoid` in the agent record. User requirements take precedence.
3. Copy only the selected references into the current project, for example `.world/terrain-references/`, retaining each source path in the record. Agent image inputs must be project-relative PNG/JPEG/WebP files; installed skill paths outside the project cannot be submitted directly. Do not rename an incompatible file extension instead of converting its encoding.
4. Use the image-generation capability actually exposed by OhMyGame. When the current tool is `generate_image`, use `prompt`, `referenceImagePaths`, `resolution`, and `aspectRatio`. Configured mode requires both resolution and aspect ratio and must omit legacy `size`. The supported resolutions are `512`, `1K`, `2K`, `4K`; aspect ratios are `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. Choose a ratio matching the world extent. The platform supports up to 14 references; this workflow selects only 1–3.
5. Keep the existing `generate_image → ToolRunner → provider → runtime credentials` chain. The platform saves the result to `assets/generated/` and returns the real path. Never read/select/record an API key or add an HTTP generator. If the tool does not expose reference paths, report the mismatch; text-only borrowing is a weaker fallback, not a claim that image pixels were supplied.
6. Actually view the generated image. Record its path and concrete observations in the agent record. Generation success or a filename is not inspection. Record any defect before requesting a targeted revision; at most one initial image plus two revisions. Select the most useful existing candidate at the limit. If no usable image exists, record the blocker in the validation report and do not claim this stage complete. If the image reader is unavailable, inspection remains unverified.

Example image prompt:

```text
Direct overhead terrain semantic image, north at top. Show a continuous northern ridge and varied peaks feeding a central valley and river; an eastern terrace offers buildable ground, a western mountain shoulder supports a forest belt, and a narrow crossing connects the terrace to the west. Preserve drainage, readable terrain transitions, road corridors, and a coherent boundary. Borrow ridge and valley organization from the supplied references without copying their outline, buildings, or palette. No text, building icons, fixed RGB classes, perspective concept-art view, shadow-only height cues, or undefined flat expanses.
```

The image is the agent's spatial design input, not an exact height map. Do not parse RGB classes, masks, connected components, skeletons, area coverage, topology proofs, or shadow-only elevation cues. Do not reduce the image to a few circles, rectangles, or straight lines. The complete image and its spatial relationships must remain available to the agent.

A second asset-layout image is optional for large multi-region worlds, cities, or complex settlements. If used, preserve the selected terrain image's boundary, direction, water system, road relationships, and landform structure. Do not require a third concept-image class. Single-object asset references remain separate from these world-planning images.

## Agent handoff

Read [terrain-agent-handoff.md](terrain-agent-handoff.md) before handing the inputs to the agent. The handoff must include:

- the reference images that were actually viewed and the concrete principles to borrow or avoid;
- the generated semantic image that was actually viewed and its observations;
- north, east, world bounds, coordinate convention, scale, camera or review views, and project entry point;
- the complete scene requirements, including ridges, valleys, terraces, rivers, lakes, biomes, settlements, roads, bridges, and open-surface information;
- the Three.js, TypeScript, TypedArray, resource-loading, initialization, and performance constraints;
- the exact project files the agent may create or modify.

Do not give the agent a legacy intermediate terrain API, a fixed shape vocabulary, or a height-organization template. The agent may choose irregular boundaries, splines, grid organization, distance fields, noise, river construction, road-aware grading, material bands, and asset layout. The absence of a prescribed algorithm does not waive coordinate consistency, resource paths, support surfaces, or reproducibility.

The agent must modify the real project and leave the result in the actual source and resource paths. A detached terrain explanation is not a deliverable. Record the files changed, the scene initialization entry, the random seed or explicit deterministic parameters, and any unresolved blocker for the next agent session.

## Integrated terrain, road, water, and asset realization

Terrain, roads, and the water system are one spatial system even when they use separate Three.js objects. Determine the road skeleton and water network together with the macro terrain. River main stems, tributaries, lakes, riverbeds, banks, and shorelines may shape valleys and local landforms just as road grades, roadbeds, cuts, embankments, bridge approaches, crossings, and tunnel openings may shape the ground. Generate or revise their supporting geometry together. Roads must not be added afterward as floating planes, and water surfaces must not be added without the riverbed, bank, or shoreline geometry that supports their intended relationship to the land.

Use TypeScript/TypedArray or a data structure suited to the current Three.js project. Generate the structural terrain-road-water geometry once during scene initialization, not on every frame; water animation may update project-native runtime properties without rebuilding that structure. Keep the rendered ground, graded terrain, riverbeds, banks, shorelines, and support queries synchronized. If road grading or watercourse construction changes terrain heights, rebuild mesh positions and normals before placing dependent objects; queries must use the same final support surfaces represented on screen.

Create visible water surfaces only after their riverbeds, banks, lakeshores, crossings, and bridge supports have been finalized, then make those surfaces meet the supporting geometry without large gaps or accidental intersections. Buildings, trees, rocks, roads, and imported models must contact the rendered ground or their designed support surface. Platforms, bridge decks, roofs, caves, and water must not use the bare terrain height when another support surface applies. Use multiple support samples for long footprints, slopes, and multi-post structures.

Let the agent determine the main visual asset list after the final terrain-road-water structure is understood. Select the available Meshy and/or Hyper3D provider(s) under the [provider rules](world-contract.md#3d-asset-provider-selection), then load, place, and correct at least 15 qualifying major generated subjects across at least three categories, counting both providers together. If both providers and free access are unavailable only after the user explicitly declines both APIs, record the all-procedural fallback and its reason. Buildings default to direct contact with the finalized terrain, road, plaza, or other designed bearing surface. Support queries do not require creating extra support geometry; foundations, retaining walls, steps, platforms, or raised supports need a specific design and terrain reason. Do not cover contact errors with an automatically repeated or unjustified slab or rectangular base; a designed foundation is allowed when its local rationale is recorded. Preserve support queries, support points, or equivalent traceable relationships in the scene code; a screenshot alone does not prove grounding.

## Water presentation and road continuity

After the terrain-road-water system has been jointly designed and revised, choose water effects that fit each body of water and its setting: wind ripples, soft reflections, shoreline and depth color changes, rain response, fish, ducks, drifting boats, and click ripples. These are scene-dependent effects; record which ones apply and keep their animation within the measured runtime budget.

When placing buildings and environmental assets, keep the road space clear. Check that buildings, foundations, steps, platforms, and fill assets do not enter or interrupt roads, that entrances connect to roads, and that roads remain continuous through bridges, plazas, and required routes. If an obstruction appears, revise the joint terrain-road-water layout or the affected placement and recheck the route.

## Semantic environmental fill

After the integrated terrain-road-water system, visible water, major generated subjects, and key buildings are complete, run the scene and inspect panorama, overhead, and route views. Perform the [semantic environmental fill pass](world-contract.md#semantic-environmental-fill) before final validation: mark surface type, use, and current information density for every major visible region; fill missing environmental information with suitable procedural geometry, existing resources, or available generated assets. Keep roads, entrances, bridges, water views, and focal sightlines readable. Record stable seeds, quantities, instance regions, distribution parameters, providers, resource/loading paths, and measured initialization/rendering performance. Recheck panorama, routes, midrange, low-angle views, and local contacts, and save findings in the handoff and validation report.

## Performance and review boundary

Start with TypeScript/TypedArray and a resolution appropriate to the world. Measure one-time initialization and the rendered result before reducing detail. Do not regenerate terrain, roads, riverbeds, banks, or shorelines every frame. No Blender, `bpy`, `.blend`, or NumPy runtime service is allowed. An offline tool may be considered only when measurements demonstrate a real bottleneck, and it must not become a required runtime dependency.

Inspect the real scene from above, in a panorama, and at a low angle before mass asset placement. Then inspect regions, roads, crossings, shorelines, support surfaces, and close contacts in Three.js. Keep [the existing five-stage visual review](validation.md), and record image observations, scene findings, repairs, deviations, and unverified checks in `.world/validation-report.md`.
