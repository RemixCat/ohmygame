# Canvas image quick actions

Drag an image output handle onto empty canvas space, or right-click an image
node, to open image quick actions. Dropping onto an existing node keeps the
usual reference connection behavior. Creating a shortcut does not submit a
generation request.

- **Description / inferred prompt** creates an editable text node linked to the
  source. Run it with a language model that accepts images. The output describes
  the image; it cannot recover the original prompt.
- **Recognize objects** creates a text controller. Run recognition, edit the
  names, descriptions and prompts, then check the objects to generate. Only
  checked objects receive independent image nodes. Recognition accepts at most
  16 validated objects and never starts image generation by itself.
- **Three views** creates a text controller and three ordinary image nodes for
  top, front and right views. Edit shared subject/style text in the controller
  and each view's prompt in the panel or its image node, then run the batch.
- **Generate image** and **Generate 3D model** create ordinary nodes with their
  image reference already connected. Configure and run them using the existing
  controls.

## Model defaults

Image batches use the project's default image model when set, otherwise the
default from **Settings → Providers & Models**. The batch's **Use default** option
follows settings changes until execution; it does not freeze the model chosen
when the controller was created. The resolved model is written to each output
node before submission. Selecting a model explicitly overrides the default for
that batch; selecting **Use default** removes the override.

If no default exists, generation stays disabled with a configuration link. The
editor does not silently choose the first catalog entry. An unavailable model
or one without image-reference support also produces a clear prompt. Available
dimensions are normalized to the selected model's supported options.

Description and object recognition use the configured language model, which
must support image input. They do not use the image-generation model. Provider
authentication, cancellation and truncation errors remain visible.

## Batches, persistence and limitations

A batch holds at most two provider jobs at once, including while polling for
completion. Wait for existing board generation to finish before starting a new
batch. Double clicks do not submit duplicates. One failure does not stop other
items; retry all failed/cancelled items or an individual item while retaining
successful outputs. Cancel stops queued work and requests cancellation of
submitted jobs using the existing provider contract. Cancellation does not
guarantee a refund or immediate remote termination.

Leaving the board stops local scheduling of unsubmitted work. Submitted jobs
remain in history. Reopening restores node references, settings, object
selections, submitted-job status and saved assets; unsubmitted items become
ready to run. Group creation can be undone together, but undoing nodes does not
undo submitted provider work.

Generated images are separate files, named after their nodes, saved through the
existing Library and project asset-copy mechanism. The Agent can continue to
read, edit and run these ordinary text/image/3D nodes. `quickAction` is optional
node metadata for the source, controller, item selection and batch settings.
Older versions that reject unknown metadata should not edit these new boards.

Object outputs redraw the selected subject from the reference; they are not
pixel-preserving cutouts. Transparent backgrounds and consistent geometry
across three views depend on the provider. Hidden surfaces are inferred.
Re-running recognition creates a new checklist; existing generated nodes and
assets remain. This feature provides fixed shortcuts, not a general graph
scheduler.

See [中文使用说明](canvas-quick-actions.zh-CN.md) and the
[requirements and verification](requirements/canvas-actions.zh-CN.md).
