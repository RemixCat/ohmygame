# Three.js world contract

Deliver an editable web project that realizes the expanded design. High-detail, multi-scale visual finish and a themed presentation layer are minimum requirements. The world must support an establishing view, exploration, and close inspection with a coherent visual identity. Begin scene implementation only after the completeness check in [the expansion guide](world-expansion.md) passes.

## Runtime and organization

- Provide an HTML entry, scene source, and the required assets and dependencies. Pin library versions. In a new project, prefer TypeScript with Vite and a `build` script that writes static output to `dist`; a static `index.html` with native modules also works.
- Include a renderer, scene, camera, responsive canvas, lights, and a time-based animation loop. Handle resize and device pixel ratio deliberately.
- Choose controls suited to the requested experience and explain them on the page. A walking request needs reachable paths and grounded movement; an orbit-only view is not walking.
- Give walking and turning keyboard bindings, such as WASD or arrow keys, alongside any pointer controls. Keyboard access keeps the world usable without a mouse and lets `game_use` exercise routes with real input.
- Organize named world, region, and landmark groups so a later request can target one place without rewriting unrelated regions. Keep region placement legible in the code. Do not build a generic editor or plugin framework just to make the source editable.
- Keep initial loading understandable and surface fatal load failures. Record the source and license of external assets. Never disguise a missing asset as a finished feature.
- Dispose replaced geometry, materials, textures, controls, and event listeners.

## Visual completion

Follow [the expansion guide](world-expansion.md) and [provider selection](#3d-asset-provider-selection) to select the required subjects. For an actual new-world build, if Meshy, Hyper3D, or currently available free Hyper3D access is usable, complete at least 15 independent major generated subjects across at least three significant object categories, covering every major region and core visual focus, and complete the entire required set even when it is larger. Count qualifying Meshy and Hyper3D subjects together. Prioritize buildings and major structures in settlements. A generated provider must supply each counted subject's main visible form; evaluating it and choosing procedural modeling for all subjects does not meet this requirement. Three.js still owns scene organization, layout, rendering, and interaction. Prepare shipped GLB or glTF assets with `web-3d-asset-pipeline` when the world uses them.

- **World scale:** make boundaries, region relationships, entrances, routes, and overall composition readable. Organize foreground, midground, and background with spatial depth and fully designed open surfaces.
- **Middle scale:** give buildings, landmarks, environmental structures, and hero subjects recognizable silhouettes, proportions, construction or anatomy, and connected parts.
- **Close range:** show material differences, surface variation, seams, wear appropriate to the setting, local components, and traces of activity. These must hold up in the intended close-up views, not only as distant silhouettes.
- **Detail distribution:** connect props and surface changes to their activity or environment. Give core areas, connections, distant regions, and open surfaces appropriate visual information; uniform scattering and neatly cloned detail do not establish richness. Buildings should vary their orientation in response to roads, rivers, terrain boundaries, parcel shape, public spaces, and neighboring structures rather than forming an all-orthogonal grid; keep entrances and routes readable.
- **Visual unity:** coordinate lighting, materials, shadows, fog, color, and motion to express the theme, reveal volume, and direct attention. Preserve plausible grounding and spatial relationships.

Implement by region or core subject. Before treating one as complete, return to `.world/expanded-prompt.md` and its key visible features table to check the silhouette, important parts, material variation, and near-view details. Record the relevant code locations for those features in the existing [validation report](validation.md). Code presence is implementation evidence; runtime views must still show the promised result. If the feature cannot be seen, fix it or record the shortcoming rather than marking it visually complete.

A generic box, cylinder, or smooth tube carrying a subject's name does not realize its appearance. Blockouts can support construction, but refine or replace the parts that define the subject before claiming completion. Shared geometry and generators are useful only when they preserve each object's key differences. Express thatch, fabric, or masonry repairs through visible construction and surface cues appropriate to the style, using geometry, textures, decals, or assets as needed; a color change alone does not realize those material descriptions. Remaining placeholders, default materials, and debug panels do not count as visual finish.

When implementation requires a design change, retain the original requirement and record the replacement, reason, and impact in the design, with the remaining deviation in the validation report. A different technical method is acceptable if it preserves the intended visible result and any explicitly required provider contribution. Disclosing a missing or substituted feature does not make that requirement pass; do not erase a promise to claim agreement between design and implementation.

### Open surfaces and information density

Allow low object density, never unresolved low information density across major visible areas. Every region must communicate its surface type, use, ecology, and spatial scale. Consider foreground contact details, midrange groups and activity, and distant silhouettes or material transitions. Even lake surfaces, fields, grassland, wetlands, mountain tops, distant valleys, plaza centers, and road passages need appropriate environmental elements and boundary or surface information; keeping passage clear is not a reason to deliver a blank plane.

### Semantic environmental fill

After terrain, roads, visible water, major assets, and key buildings are complete, perform one explicit fill pass before final validation:

1. Inspect panorama, overhead, midrange, route, and low-angle views. Mark each major visible region's surface type, use, current information density, and missing environmental cues.
2. Choose elements that explain the region's purpose, ecology, and scale. Use Three.js geometry/materials/instancing, existing project assets, or assets from an available provider. Build visible variation within each asset family through distinct prototypes or controlled changes to scale, rotation, pose, material, color, maturity, wear, grouping, and density. Instancing may share geometry and materials for performance, but the final scene must not read as copy-paste repetition. The examples below are options, not a mandatory object checklist.
3. Place elements along meaningful groups, edges, paths, and ecological transitions; preserve entrances, road passages, bridge relationships, water views, and main sightlines. Do not use uniform random scatter or noise to conceal missing design.
4. Use stable seeds or explicit deterministic parameters, instance repeated trees/grass/rocks/props from low-cost prototypes, and set quantity budgets. Record quantities, instance regions, distributions, resource paths, and loading locations. Do not rebuild large batches of procedural geometry every frame. Measure initialization and rendering before reducing density.
5. Recheck panorama, routes, midrange, low-angle views, and local contacts after filling. Record deficient regions, additions, providers, parameters, performance, before/after findings, and unresolved items in the existing handoff and validation report. If inspection finds no missing information, record the evidence rather than inventing unrelated props.

| Surface or region | Suitable environmental elements | Distribution and constraints |
| --- | --- | --- |
| River or lake surface | Boats, ducks, buoys, docks, reeds, water ripples | Follow plausible channels, banks, and docks; preserve open water views and bridge clearance. |
| Riverbank or wetland | Reeds, shallow-water stones, boardwalks, shrubs, birds, aquatic details | Form a gradual land-to-water transition with connected banks and shallows. |
| Farmland or grassland | Crop rows, field ridges, irrigation channels, fences, hay, tools | Follow field direction and boundaries rather than even scatter; choose elements appropriate to actual land use. |
| Plaza or station forecourt | Benches, lamps, planters, tree pits, signs, paving variation, public amenities | Organize around paths, edges, and resting places; preserve the circulation center. |
| Hillside or valley | Tree groups, shrubs, rocks, grass layers, erosion traces, trails | Form natural communities and height layers rather than regular grids over a slope. |
| Road or shoulder | Signs, guardrails, lamps, drains, vehicles, roadside props | Follow roads and junctions without blocking entrances, turns, or bridge sightlines. |
| Forest or forest edge | Instanced tree prototypes, shrubs, stones, fallen wood, ground cover | Transition density and materials naturally between forest interior, edge, and neighboring regions. |
| Distance or open area | Low-cost tree groups, ground-material variation, silhouettes, occasional landmarks | Preserve readable scale and layers without monochrome planes or meaningless noise. |

### Water dynamics and environmental response

Water should not be an unexplained static blue plane. Select effects according to the water type, surrounding environment, weather, viewing distance, and requested interaction; each water body does not need every effect:

- wind can create moving surface ripples;
- water can show soft, blurred reflections of nearby terrain, vegetation, buildings, or sky;
- shallow water can pick up shoreline colors while deeper water transitions toward a darker blue or other designed deep-water color;
- rain can produce droplets and localized surface response when rainy weather is part of the design;
- fish can swim below the surface and ducks can move on suitable water;
- small boats can drift with the water where the setting supports them;
- a mouse click on the water can create an expanding ripple when interaction is requested.

Keep water animation and interaction within the project's measured performance budget. Update runtime properties or lightweight effects rather than rebuilding the structural terrain, riverbed, bank, or shoreline geometry every frame. Record which effects are implemented, intentionally omitted, or not applicable.

### Road continuity and building clearance

Buildings must not be placed on roads or occupy the road's passage space. Building footprints, foundations, steps, platforms, decorative objects, and environmental fill assets must not cut across or block a road. Roads must remain continuous and connect building entrances, building groups, bridges, plazas, and other major regions. A painted road surface or visible line is insufficient: the requested main routes must be physically traversable, with enough clear space for the intended movement and turning. Record and repair any building or asset that intrudes into a road or interrupts a required connection.

### Count completed generated subjects

- Count independent major source subjects, not scene nodes, GLB files, downloads, or API calls. Repeated placements, rotations, scale or color variants, LODs of the same model, and regenerated candidates do not add subjects. A subject split into several generated parts for production or interaction still counts as one. Significant core trees can qualify; background instances do not add subjects.
- The selected generation provider must realize the subject's main visible form. A generated ornament attached to a procedural building does not make that building a generated subject. Do not generate door handles, ordinary signs, connectors, or other accessory details as standalone generation tasks. Those details may occur naturally within a complete generated subject.
- Generation or copying a file into the project is insufficient. Count a subject as complete only after integration into the final scene, confirmed model and texture loading from the final static output, and the relevant visual and spatial checks. Temporary blockouts and unverified subjects do not count as completed.
- Suitable existing generated models from the selected provider may be reused with their actual provenance recorded. Do not label an ordinary GLB of unknown or other origin as a generated-provider result.
- Check the minimum count, region and focal-point coverage, completion of every required subject, and visual quality separately; one cannot compensate for another. Important procedural buildings outside the required set must also meet the design and cannot remain rough placeholders.

## 3D asset provider selection

Use Three.js procedural geometry and existing project resources alongside Meshy, Hyper3D, or an equivalent provider actually exposed by OhMyGame. Choose from current tool availability, platform-reported configured environment credentials, remaining quota, asset type, quality needs, and runtime limits. Do not assume any provider exists or search for a tool by a fixed role or provider name.

- A user or project's explicit provider requirement takes precedence; record an unavailable required provider as a blocker rather than silently substituting it.
- If only Meshy is usable, use Meshy for generated assets; if only Hyper3D is usable, use Hyper3D. If both are usable, select according to the scene and task constraints and record the choice.
- Check whether the current platform exposes a Hyper3D partnership entry or free generation quota. Prefer it for suitable environmental assets only when that entry is actually available and the platform confirms usable quota. Unknown or unavailable quota is not free capacity; never treat it as a permanent dependency.
- If no Meshy, Hyper3D, or free Hyper3D access is currently usable and the user has not explicitly declined to provide either API, direct the user to `Providers & Models` and wait; do not silently substitute a procedural scene. Only when the user explicitly declines to provide both APIs and Meshy, Hyper3D, and free Hyper3D access are all unavailable may existing resources or procedural assets implement the entire scene. Record that explicit fallback decision and its reason. Do not read, copy, print, request, or write API keys; credentials are managed by the platform. Use only currently exposed platform generation tools, never a direct HTTP workaround.
- Record the actual provider, generated assets, resource paths, scene loading/placement locations, and integration/visual checks in the handoff and validation report. Report availability and quota uncertainty without credential values.

The minimum and counting rules above apply to all usable generated providers for a new-world build. Meshy and Hyper3D subjects count together; provider choice does not reduce the minimum, category requirement, regional coverage, required-set completion, or visual checks. Environment-fill props do not count as major subjects. Only the explicit-user-refusal plus no-provider/no-free-Hyper3D fallback permits an all-procedural scene and removes the generated-subject count requirement; record that exception rather than treating it as an ordinary provider result.

## Meshy reference images and generation

For Meshy, use OhMyGame's exposed image and 3D generation workflow (currently `generate_image` and `generate_3d_asset`), or reuse suitable existing references/models under the counting rules. For Hyper3D or another provider, follow its actual exposed tool contract instead of assuming Meshy inputs or tool names. An actual build request suffices when tools and platform credentials are available, without another written authorization. Discussion, prompt-only, plan-only, and explicit no-generation tasks do not authorize generation. Missing credentials are configured by the user in `Providers & Models`; never read, store, pass, or request a plaintext API key, add a credential `.env`, or implement direct provider HTTP calls. Three.js remains the scene implementation; do not introduce Blender, `bpy`, or `.blend` files.

Prepare and inspect a reference image before submitting it:

- Prefer a plain white background, the complete subject in frame, and clear edges with no cropped key parts. White describes the background; the subject keeps its designed colors and materials.
- Show one asset per image. A building's roof, windows, porch, and base belong to it; surrounding roads, trees, and other buildings do not.
- Specify proportions, materials, palette, style, and indispensable features from the current design. Choose an informative view, such as a front three-quarter view showing the facade, side, and roof, without strong perspective or excessive occlusion.
- Avoid text, watermarks, complex backgrounds, collages, and multi-view sheets. Respect the platform tool's single-image input rather than packing several views into one image.
- Check completeness and key features before generation. An attractive reference does not establish correct unseen sides, interiors, or usable entrances in the resulting model.

Confirm tool availability, credentials, and that the project-local image exists in a supported actual format. `generate_image` may return WebP, while `generate_3d_asset` accepts PNG/JPEG. If conversion is needed, use available local image processing to change the actual encoding; renaming the extension is insufficient. Pass the compatible project-local path as `imagePath` to `generate_3d_asset` and reuse the platform's request, waiting, download, and save behavior.

In the current Meshy workflow, the agent tool exposes only `imagePath`; leave model version, face count, topology, textures, and PBR to the platform defaults. Do not duplicate or override that configuration in the skill, assume a canvas node's custom settings are inherited, or add a Meshy client, credential store, or background task system. Do not impose fixed generation rounds, automatic batch retries, or a separate per-object approval workflow.

Readable API configuration does not prove that generation will succeed. If tools, credentials, format conversion, generation, download, or integration fail, record the affected subject, specific blocker, and incomplete state in `.world/validation-report.md`. Do not count a temporary substitute or lower the requirements to mark a failure as passed. Distinguish reference-image defects, generated-model defects, and integration defects when choosing a repair; changing model versions, increasing face counts, or relaxing design requirements is not evidence of success. Meshy quality, including back sides, thin parts, and required interiors, must be checked in the scene.

## Integrate or replace generated models

For new scenes, load selected models directly. Use temporary blockouts only when needed to check layout, dimensions, or passage space; they are not the final visual delivery. For an existing scene, first read the affected design and code to establish the subject's named region, location, target size, orientation, and interaction relationships. Load and check the replacement before removing the original visible geometry.

- Reuse the project's GLB/glTF loading approach and existing asset preparation guidance; do not introduce a general asset framework.
- Set scale, orientation, origin, and intended contact points. Inspect wall feet, entrances, and any designed foundations, steps, and porches against the actual terrain or bearing surface using the grounding requirements below; bounding boxes alone do not establish contact.
- Check building entrances against connecting roads, surrounding passage space, and adjacent structures. Provide usable interiors, doors, and interaction parts when the design requires entering, passing through, or opening them. An exterior shell or a painted doorway does not prove a required interior is usable.
- Coordinate materials, textures, lighting, and shadows with the scene. Inspect floating or intersecting parts, distorted proportions, and conflicting baked shadows at the intended viewing distance.
- Reuse simple collision shapes where the existing experience needs them. Do not automatically use the detailed visible mesh as collision geometry or add a physics system.
- Copy GLB files and required dependencies from `assets/generated/` into the project's buildable asset paths: `src/` for imports or `public/` for fixed URLs in the standard project layout. Reference those copies from scene code and verify that the final static output can load them; a preview-only URL into `assets/generated/` is insufficient.
- Preserve unrelated regions and existing functionality. Remove only geometry and resources made unused by this replacement, disposing them without breaking shared users. If replacement fails, keep the original recoverable and report the incomplete state.

Record the existing subject name, reference image and model paths, final scene reference location, and asset provenance in `.world/validation-report.md`, using the design's key visible features table as the required subject list. For reused models, record the available source and any unavailable reference-image history honestly. Do not add a database or separate manifest protocol. Generation success alone does not establish visual completion; follow the [validation guide](validation.md).

## Terrain, roads, water, and asset placement

For a new outdoor terrain world, execute [terrain-workflow.md](terrain-workflow.md) and the [agent handoff](terrain-agent-handoff.md): actually view the selected references and generated top-down semantic image, pass the complete image and spatial brief directly to the agent, and let the agent modify the real Three.js project. The image is a macro design input, not a pixel mask or fixed shape vocabulary. Inspect macro landforms and the integrated road and water system from above, in panorama, and at a low angle before mass asset placement. Local revisions do not require a fresh image pipeline or 15 new subjects.

Terrain, roads, and the water system are one spatial system even when represented by separate meshes. Determine road alignments, grading, bridge approaches, crossings, and tunnel openings as well as river main stems, tributaries, lakes, riverbeds, banks, and shorelines together with the terrain, and finalize their supporting geometry during scene initialization. Roads and watercourses may participate in local terrain shaping; roads must not be added later as floating planes, and visible water must not be added without finalized beds, banks, and shores.

Use the same final terrain-road-water supporting geometry for rendering and support queries. Keep mesh positions, normals, triangle data, grading edits, riverbeds, banks, and shorelines synchronized. Buildings, roads, trees, animals, and interactions use the rendered ground or their designed bearing surface. Bridge decks, roofs, water, platforms, and caves require their actual support surfaces separately; a visible water surface is not a substitute for a ground-bearing surface. Keep all support queries in the same coordinate frame or transform explicitly. Do not impose pixel matching, fixed RGB masks, or strict height, slope, material-weight, or regional-variation acceptance thresholds.

## Ground contact and connected support

Buildings default to direct contact with the finalized terrain, road, plaza, or other designed real bearing surface. A support-surface query locates that contact; it does not require adding another layer of geometry. Keep the project's own support queries or equivalent logic without imposing a fixed terrain API or schema.

Add foundations, stepped bases, retaining walls, platforms, or raised supports only when the building design and local terrain justify them. Explain their relationship to slope, structure, local materials, entrances, roads, drainage, and neighbors. Do not generalize a special hillside solution to every building.

Do not automatically add a uniform concrete slab, footprint-shaped rectangular pad, square base, shared generic platform, thick plane, or decorative foundation merely to hide grounding defects. A slab or rectangular foundation is allowed when the particular design, material, structure, and terrain justify it. First inspect model origin, transforms, placement, local terrain, entrance steps, retaining relationships, and real structural support. Repeated unexplained or automatically identical bases are a defect to repair, not a completed grounding solution.

Verify building perimeter, entrance, and wall-foot contacts against the actual visible bearing surface, with a treatment appropriate to each building. Foundation presence alone does not pass. Distinguish an existing foundation that misses its bearing surface from genuinely missing designed support; they need different corrections.

| Placement case | Required treatment |
| --- | --- |
| Long wall, broad base, or building on uneven terrain | Check footprint boundaries, endpoints, and intermediate positions as needed for its size and terrain variation, not only the center. First correct placement and local ground contact. Add a foundation, stepped base, retaining wall, or raised support only when the particular design and terrain require it. |
| Multiple posts or legs on a slope | Determine the bearing height at each foot and connect each support to the common upper structure; do not reuse a single center height for all feet. |
| Object on a tabletop, deck, or platform | Locate its bottom against that actual bearing surface, accounting for local coordinates, scale, and rotation rather than using bare terrain height. |
| Raised top, roof, platform, or suspended part | Build the required legs, cabinet, beams, brackets, or suspension and check that both ends connect. Scene-graph parenting alone does not establish geometric contact. |
| Imported GLB or other external model | Inspect the transformed bottom and intended contact points before placement. A bounding box can help locate the model but cannot prove that all feet of a complex model meet their supports. |

Use the actual visible terrain or bearing surface. A continuous height function can differ from the rendered terrain mesh, graded ground, or platform; use targeted ray or geometry checks at risk positions when needed. This does not require engineering load calculations, a rigid-body engine, or a generic collision framework.

Match repairs to the construction. Lowering a whole object can bury entrances or steps; moving a flat base to the highest ground point can enlarge downhill gaps. Neither is a universal fix. Preserve nearby routes and interactions, and recheck them after placement changes.

Intentional flight, magical suspension, water flotation, and supported overhangs are valid when their mechanism and spatial relationships fit the design. Do not demand ground contact from every underside. Do not hide unintended gaps with extra shadows, decorative occluders, or inaccessible review angles.

### Example: a hillside cabin on a supported platform

This example applies only when the design calls for a vertically oriented cabin on a level platform carried by separate posts. It is a concrete placement pattern, not a universal placement algorithm for every GLB.

- **Resolve the structure first.** Record the cabin's intended scale, orientation, entrance direction, platform footprint, platform thickness, post locations, and the model's actual bottom/contact points. Do not treat the lowest point of an arbitrary bounding box as the contact point for every part.
- **Transform before querying.** Finish the model's scale and rotation, update its world transform, and transform each platform corner, any required intermediate footprint point, and each post foot into the same coordinate frame used by the project's support-surface query. Do not mix model-local coordinates with terrain-world coordinates.
- **Sample multiple points.** Query the platform boundary and each post foot. Choose the platform elevation and construction response from those samples and the design: adjust the site, use a stepped or graded base, or keep the platform level and vary post lengths. If the terrain would cut through the platform, change the site, elevation, or local grading; do not simply push the whole cabin downward.
- **Size each post independently.** Once the platform underside is fixed, calculate each post from its own terrain sample:

  ```text
  support      = querySupportSurface(postX, postZ, intendedBearingSurface)
  postBottomY  = support?.height
  postTopY     = platformBottomY
  postLength   = postTopY - postBottomY
  postCenterY  = (postTopY + postBottomY) / 2
  ```

  `querySupportSurface` is descriptive pseudocode, not a required import or fixed API. The project may use triangle sampling, raycasting, a spatial index, or another implementation that queries the same finalized visible support geometry. A missing or invalid query result, or a non-positive length, must trigger an explicit placement decision such as moving the site, changing the platform elevation, or recording a blocker. Do not silently substitute zero. Place the cabin against the platform top, not directly against the raw terrain.
- **Connect and inspect the route.** Connect the entrance to the road with designed steps or a ramp. Use side and low-angle views to inspect the platform underside, both post ends, and the post feet; walk the route to the entrance and check for gaps, intersections, and blocked passage.

Stone foundations, bridges, rocks, animals, and other structures require their own support treatment. Reuse the same principles of explicit contact points and relevant bearing surfaces without copying this platform-and-post calculation.

## Presentation and review views

Implement [the presentation guide](presentation.md) using the design's identity, hierarchy, copy, and responsive layout.

Provide a world overview, main-route views, hero close-ups, and views of meaningful environmental details. Reuse or adjust named close-up views to expose important surface and support details at a readable distance. Each navigation item must reach its advertised camera view or route, and the entry action must activate its designed behavior. Keep the selected view and current-location text accurate. A camera jump does not prove a route is reachable; check the actual route with appropriate grounding, scale, and occlusion.

## Interaction and performance

Define navigable bounds and handle obstructions on the requested routes. Do not trap the camera or start it inside geometry. Orbit, walking, and scenic viewpoints can coexist when they support exploration.

Observe and measure the rendered project before optimizing or reducing detail. Use that evidence to choose geometry and material reuse, instancing, batching, culling, simpler distant detail, or fewer per-frame allocations while preserving the design and features within the expected close-inspection range. Do not remove promised features or set a low-detail target on the assumption that they might affect performance. Keep post-processing optional and measurable.

## Handoff

Keep the design files in `.world/` and the runnable world in the workspace. In the final reply, provide the world entry, necessary controls, and useful source locations. Keep asset credits, detailed validation evidence, generation and repair history, and remaining deviations or unverified items in `.world/validation-report.md`; do not repeat a technical checklist in the reply. This concise handoff does not turn unmet requirements into completion. If the world cannot build or open, state that no usable result is available. A screenshot supplements the runnable world; it does not replace it. Final visual approval belongs to the user.
