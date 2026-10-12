# Terrain planning and direct realization

Use this workflow for new outdoor terrain worlds. Local revisions reuse the existing design and scene unless the requested change needs them updated. Indoor-only worlds do not need an outdoor terrain image. Discussion, plan-only, prompt-only, and explicit no-generation tasks stop at design. For actual builds, available OhMyGame tools and configured credentials suffice; no additional written generation authorization is needed. Missing credentials must be configured in `Providers & Models`, never pasted into chat, prompts, commands, or project files.

## Intent, references, and the terrain image

1. Complete the intent pass in [world-expansion.md](world-expansion.md). Establish world scale, direction, entrances, regions, routes, landform relationships, visible information, and preliminary Meshy roles without inventing exact coordinates.
2. Choose 1–3 relevant images from [reference-library](reference-library), not all ten. Actually open them with the available image-reading capability. Record each source path, spatial principles to `borrow`, and theme, shapes, colors, buildings, or details to `avoid` in the direct-Astra record. User requirements take precedence.
3. Copy only the selected references into the current project, for example `.world/terrain-references/`, retaining each source path in the record. Agent image inputs must be project-relative PNG/JPEG/WebP files; installed skill paths outside the project cannot be submitted directly. Do not rename an incompatible file extension instead of converting its encoding.
4. Use OhMyGame's `generate_image` with `prompt`, `referenceImagePaths`, `resolution`, and `aspectRatio`. Configured mode requires both resolution and aspect ratio and must omit legacy `size`. The supported resolutions are `512`, `1K`, `2K`, `4K`; aspect ratios are `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`. Choose a ratio matching the world extent. The platform supports up to 14 references; this workflow selects only 1–3.
5. Keep the existing `generate_image → ToolRunner → provider → runtime credentials` chain. The platform saves the result to `assets/generated/` and returns the real path. Never read/select/record an API key or add an HTTP generator. If the tool does not expose reference paths, report the mismatch; text-only borrowing is a weaker fallback, not a claim that image pixels were supplied.
6. Actually view the generated image. Record its path and concrete observations in the direct-Astra record. Generation success or a filename is not inspection. Record any defect before requesting a targeted revision; at most one initial image plus two revisions. Select the most useful existing candidate at the limit. If no usable image exists, record the blocker in the validation report and do not claim this stage complete. If the image reader is unavailable, inspection remains unverified.

Example image prompt:

```text
Direct overhead terrain semantic image, north at top. Show a continuous northern ridge and varied peaks feeding a central valley and river; an eastern terrace offers buildable ground, a western mountain shoulder supports a forest belt, and a narrow crossing connects the terrace to the west. Preserve drainage, readable terrain transitions, road corridors, and a coherent boundary. Borrow ridge and valley organization from the supplied references without copying their outline, buildings, or palette. No text, building icons, fixed RGB classes, perspective concept-art view, shadow-only height cues, or undefined flat expanses.
```

The image is Astra's spatial design input, not an exact height map. Do not parse RGB classes, masks, connected components, skeletons, area coverage, topology proofs, or shadow-only elevation cues. Do not reduce the image to a few circles, rectangles, or straight lines. The complete image and its spatial relationships must remain available to Astra.

A second asset-layout image is optional for large multi-region worlds, cities, or complex settlements. If used, preserve the selected terrain image's boundary, direction, water system, road relationships, and landform structure. Do not require a third concept-image class. Single-object Meshy references remain separate from these world-planning images.

## Direct-Astra handoff

Read [terrain-direct-astra.md](terrain-direct-astra.md) before handing the inputs to Astra. The handoff must include:

- the reference images that were actually viewed and the concrete principles to borrow or avoid;
- the generated semantic image that was actually viewed and its observations;
- north, east, world bounds, coordinate convention, scale, camera or review views, and project entry point;
- the complete scene requirements, including ridges, valleys, terraces, rivers, lakes, biomes, settlements, roads, bridges, and open-surface information;
- the Three.js, TypeScript, TypedArray, resource-loading, initialization, and performance constraints;
- the exact project files Astra may create or modify.

Do not give Astra a legacy intermediate terrain API, a fixed shape vocabulary, or a height-organization template. Astra may choose irregular boundaries, splines, grid organization, distance fields, noise, river construction, road-aware grading, material bands, and asset layout. The absence of a prescribed algorithm does not waive coordinate consistency, resource paths, support surfaces, or reproducibility.

Astra must modify the real project and leave the result in the actual source and resource paths. A detached terrain explanation is not a deliverable. Record the files changed, the scene initialization entry, the random seed or explicit deterministic parameters, and any unresolved blocker for the next pi agent session.

## Integrated terrain, road, water, and asset realization

Terrain, roads, and the water system are one spatial system even when they use separate Three.js objects. Determine the road skeleton and water network together with the macro terrain. River main stems, tributaries, lakes, riverbeds, banks, and shorelines may shape valleys and local landforms just as road grades, roadbeds, cuts, embankments, bridge approaches, crossings, and tunnel openings may shape the ground. Generate or revise their supporting geometry together. Roads must not be added afterward as floating planes, and water surfaces must not be added without the riverbed, bank, or shoreline geometry that supports their intended relationship to the land.

Use TypeScript/TypedArray or a data structure suited to the current Three.js project. Generate the structural terrain-road-water geometry once during scene initialization, not on every frame; water animation may update project-native runtime properties without rebuilding that structure. Keep the rendered ground, graded terrain, riverbeds, banks, shorelines, and support queries synchronized. If road grading or watercourse construction changes terrain heights, rebuild mesh positions and normals before placing dependent objects; queries must use the same final support surfaces represented on screen.

Create visible water surfaces only after their riverbeds, banks, lakeshores, crossings, and bridge supports have been finalized, then make those surfaces meet the supporting geometry without large gaps or accidental intersections. Buildings, trees, rocks, roads, and Meshy models must contact the rendered ground or their designed support surface. Platforms, bridge decks, roofs, caves, and water must not use the bare terrain height when another support surface applies. Use multiple support samples for long footprints, slopes, and multi-post structures.

Let Astra determine the main visual asset list after the final terrain-road-water structure is understood. Continue to use Meshy for required major 3D subjects, then load, place, and correct those models in the actual project. Preserve support queries, support points, or equivalent traceable relationships in the scene code; a screenshot alone does not prove grounding.

## Performance and review boundary

Start with TypeScript/TypedArray and a resolution appropriate to the world. Measure one-time initialization and the rendered result before reducing detail. Do not regenerate terrain, roads, riverbeds, banks, or shorelines every frame. No Blender, `bpy`, `.blend`, or NumPy runtime service is allowed. An offline tool may be considered only when measurements demonstrate a real bottleneck, and it must not become a required runtime dependency.

Inspect the real scene from above, in a panorama, and at a low angle before mass asset placement. Then inspect regions, roads, crossings, shorelines, support surfaces, and close contacts in Three.js. Keep [the existing five-stage visual review](validation.md), and record image observations, scene findings, repairs, deviations, and unverified checks in `.world/validation-report.md`.
