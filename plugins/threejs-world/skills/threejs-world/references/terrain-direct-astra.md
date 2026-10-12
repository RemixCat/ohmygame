# Direct-Astra terrain handoff

Use this document when a new outdoor world needs Astra to create or substantially revise the Three.js terrain scene from a complete semantic image. It replaces an intermediate terrain-description workflow. The image, the spatial brief, and the real project are the source material; Astra chooses the implementation.

## Prepare the handoff

Before calling Astra, assemble one record in `.world/terrain-direct-astra.md` containing:

- the project-relative paths of the reference images that were actually opened, plus the spatial principles borrowed and the subjects or visual details deliberately avoided;
- the project-relative path of the generated top-down terrain semantic image, the fact that it was viewed, and concrete observations about its landforms, water system, regions, roads, and boundaries;
- the world coordinate contract: north, east, up axis, world bounds, scale, camera or review views, and the scene entry point;
- the complete scene brief from `.world/expanded-prompt.md`, including regions, routes, landforms, rivers, lakes, ecological areas, settlements, roads, bridges, supports, open surfaces, and intended visual hierarchy;
- Three.js and TypeScript constraints, available resource paths, loading conventions, initialization ordering, performance limits, and the exact files Astra may change;
- a deterministic seed or explicit random parameters when the implementation uses randomness.

The semantic image is a macro spatial reference, not a pixel mask or height map. Pass the complete image to Astra. Do not summarize it as a handful of circles, rectangles, straight lines, or fixed material classes. Do not provide a legacy terrain API, a parameter table, or a height-organization template for Astra to fill in.

## Prompt composition

The prompt should state the requested outcome in this order:

1. **Project and output:** modify the current project directly; keep the result in real source and resource paths; name the scene initialization entry and files to inspect afterward.
2. **Image evidence:** identify the viewed reference images and the viewed semantic image, with the concrete spatial relationships to preserve and the visual details not to copy.
3. **World frame:** state north, east, up, bounds, scale, intended camera views, and the coordinate frame shared by terrain, roads, water, and assets.
4. **Scene relationships:** describe the intended ridges, peaks, valleys, terraces, cliffs, rivers, tributaries, lakes, banks, forests, grasslands, wetlands, sand, settlements, roads, bridges, crossings, and routes. Ask Astra to preserve their relationships rather than imitate individual pixels.
5. **Implementation freedom:** allow Astra to choose irregular boundaries, grid organization, splines, distance fields, noise, river geometry, road-aware grading, material bands, and asset layout as appropriate to the project.
6. **Runtime contract:** require TypeScript/TypedArray or an equivalent project-native structure, one-time initialization, synchronized rendered geometry and ground queries, stable randomness, actual resource loading, and no Blender, `bpy`, `.blend`, or NumPy runtime service.
7. **Handoff:** require a concise list of changed files, the initialization entry, seeds or parameters, asset paths, known blockers, and checks performed.

A useful prompt skeleton is:

```text
Modify the current Three.js project directly. Use the attached reference images and the attached top-down terrain semantic image as spatial design inputs. Preserve the image's macro relationships, world boundary, north/east orientation, drainage, regional transitions, settlement areas, and road connections without pixel tracing or reducing the design to primitive shapes.

Create the terrain, road, and water system together. River main stems, tributaries, lakes, riverbeds, banks, and shorelines may shape valleys and local terrain. Roads may shape local terrain through grading, roadbeds, cuts, embankments, bridge approaches, crossings, and tunnel openings. Finalize the supporting riverbed, bank, and shoreline geometry before placing visible water surfaces. Keep terrain, roads, water, and assets in one world coordinate frame. Choose the mesh, sampling, curves, materials, water geometry, and deterministic implementation that best fits this project.

Write the result into the actual source and resource files. Generate the structural terrain-road-water geometry once during initialization, keep visible geometry and support queries synchronized, place dependent assets only after their final support surfaces exist, and preserve stable seeds or explicit parameters. Water animation may update runtime properties without rebuilding that structure. Load Meshy subjects from the project's real asset paths and correct their contacts against terrain, roads, platforms, decks, or other designed supports.

After editing, report the changed files, initialization entry, deterministic parameters, asset paths, checks performed, and unresolved blockers.
```

Adapt the skeleton to the actual scene. Do not attach a detached implementation document in place of modifying the project.

## Required project behavior

Astra's implementation must make the following observable in the running scene:

- the current Three.js entry opens the generated terrain, roads, water, materials, and environmental assets;
- terrain, roads, water, Meshy models, and other assets share a coordinate system and world scale;
- terrain, roads, riverbeds, banks, and shorelines are generated or corrected together during initialization, and their structural geometry is not recomputed every frame;
- river main stems, tributaries, and lakes follow the intended drainage and participate in shaping valleys, beds, banks, and shorelines rather than being overlaid after terrain completion;
- road grades, banks, bridge approaches, crossings, and tunnels use the final terrain relationship rather than floating above or cutting through it unintentionally;
- the rendered ground and the code's ground-query function use the same final geometry and triangle data;
- visible water surfaces are created against the finalized riverbeds, banks, lakeshores, crossings, and bridge supports without large floating or exposed gaps;
- buildings, roads, trees, rocks, and imported models meet the rendered ground or their actual platform, deck, roof, cave, or other support surface;
- long footprints, sloped structures, and multi-post objects use enough support samples to avoid center-point placement errors;
- the implementation remains editable in the real source files and does not depend on an unrecorded external service or intermediate scene format.

## Meshy and asset handoff

Determine the main visual asset list after the terrain-road-water structure is understood. Continue to use Meshy for required major subjects and use its single-object reference workflow. Astra must load the resulting models into the current project, place them against the final terrain or support surfaces, and correct scale, orientation, origin, and contact points. Do not judge grounding from a screenshot alone; preserve queries, support points, or equivalent traceable logic in the scene code.

If Astra writes terrain, roads, water, and asset code in one pass, the runtime order must still be explicit: initialize the structural terrain-road-water system, rebuild or finalize geometry and queries, add visible water surfaces to their finalized beds and shores, then place dependent buildings, vegetation, props, and Meshy subjects. Bridge decks, roofs, water, platforms, and caves require their own support surfaces rather than the bare terrain height.

## Record for the next pi agent session

At the end of the handoff, update `.world/terrain-direct-astra.md` with:

- reference and semantic-image paths plus actual viewing observations;
- the final spatial prompt or a stable prompt reference;
- north/east/up, bounds, scale, camera views, road-terrain decisions, and watercourse/terrain decisions;
- the deterministic seed and any other parameters needed to reproduce the result;
- all modified source, resource, asset, and initialization files;
- Meshy model paths and the code locations that load and place them;
- build or runtime checks, visual-review views, deviations, and unverified items;
- blockers that the next pi agent session must resolve.

This record supports reproducibility and continuation. It does not introduce a new terrain API, a separate experiment-round system, or a second world specification.
