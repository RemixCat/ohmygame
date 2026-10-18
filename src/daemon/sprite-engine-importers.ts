/** Generated packages use a top-left coordinate manifest independent of an engine. */
export const SPRITE_UNITY_IMPORTER = `// Community Studio: import manifest.json alongside the selected source.png.
using System;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEditor;
using UnityEditor.U2D.Sprites;
public static class StudioSpriteImporter {
  [Serializable] public class Frame { public string name,family,state; public int x,y,width,height; public Borders borders; }
  [Serializable] public class Borders { public int left,top,right,bottom; }
  [Serializable] public class Manifest { public int width,height; public Vector2 pivot; public Borders borders; public Frame[] frames; }
  [MenuItem("Assets/Studio/Import sprite recipe")]
  public static void Import() {
    string source = AssetDatabase.GetAssetPath(Selection.activeObject);
    var importer = AssetImporter.GetAtPath(source) as TextureImporter;
    if (importer == null) throw new InvalidOperationException("Select source.png first");
    var m = JsonUtility.FromJson<Manifest>(File.ReadAllText(Path.Combine(Path.GetDirectoryName(source), "manifest.json")));
    importer.textureType = TextureImporterType.Sprite;
    importer.spriteImportMode = SpriteImportMode.Multiple;
    importer.mipmapEnabled = false;
    importer.textureCompression = TextureImporterCompression.Uncompressed;
    importer.npotScale = TextureImporterNPOTScale.None;
    var textureSettings = new TextureImporterSettings();
    importer.ReadTextureSettings(textureSettings);
    textureSettings.spriteMeshType = SpriteMeshType.FullRect;
    importer.SetTextureSettings(textureSettings);
    importer.maxTextureSize = Mathf.Clamp(Mathf.NextPowerOfTwo(Mathf.Max(m.width,m.height)),32,8192);
    importer.SaveAndReimport();
    var factories = new SpriteDataProviderFactories();
    factories.Init();
    var provider = factories.GetSpriteEditorDataProviderFromObject(importer);
    if (provider == null) throw new InvalidOperationException("Install the Unity 2D Sprite package first");
    provider.InitSpriteEditorDataProvider();
    var previous = provider.GetSpriteRects();
    var sprites = new SpriteRect[m.frames.Length];
    for (int i=0; i<m.frames.Length; i++) {
      var f=m.frames[i];
      var b=f.borders ?? m.borders;
      var existing = previous.FirstOrDefault(r => r.name == f.name);
      sprites[i] = new SpriteRect { name=f.name, spriteID=existing != null ? existing.spriteID : GUID.Generate(), rect=new Rect(f.x,m.height-f.y-f.height,f.width,f.height), alignment=SpriteAlignment.Custom,
        pivot=new Vector2(m.pivot.x,1-m.pivot.y), border=new Vector4(b.left,b.bottom,b.right,b.top) };
    }
    provider.SetSpriteRects(sprites);
    var names = provider.GetDataProvider<ISpriteNameFileIdDataProvider>();
    if (names != null) names.SetNameFileIdPairs(sprites.Select(r => new SpriteNameFileIdPair(r.name,r.spriteID)));
    provider.Apply();
    importer.SaveAndReimport();
  }
}
`;
export const SPRITE_GODOT_IMPORTER = `# Godot 4 EditorScript. Open this file and choose File > Run.
@tool
extends EditorScript
func _run():
    var root = get_script().resource_path.get_base_dir()
    var data = JSON.parse_string(FileAccess.get_file_as_string(root.path_join("manifest.json")))
    if not data is Dictionary:
        push_error("Invalid sprite manifest")
        return
    var source = load(root.path_join("source.png")) as Texture2D
    var animation = SpriteFrames.new()
    animation.set_animation_speed("default", data.fps)
    animation.set_animation_loop("default", data.loop)
    var themes = {}
    for frame in data.frames:
        var texture = AtlasTexture.new()
        texture.atlas = source
        texture.region = Rect2(frame.x, frame.y, frame.width, frame.height)
        animation.add_frame("default", texture)
        var panel = StyleBoxTexture.new()
        panel.texture = texture
        var borders = frame.get("borders", data.borders)
        panel.texture_margin_left = borders.left
        panel.texture_margin_top = borders.top
        panel.texture_margin_right = borders.right
        panel.texture_margin_bottom = borders.bottom
        ResourceSaver.save(panel, root.path_join(frame.name + "_panel.tres"))
        var family = frame.get("family", frame.name)
        var state = frame.get("state", "normal")
        if state in ["normal", "hover", "pressed", "disabled"]:
            if not themes.has(family):
                themes[family] = Theme.new()
            themes[family].set_stylebox(state, "Button", panel)
    for family in themes:
        ResourceSaver.save(themes[family], root.path_join(family + "_theme.tres"))
    ResourceSaver.save(animation, root.path_join("animation.tres"))
    get_editor_interface().get_resource_filesystem().scan()
`;
