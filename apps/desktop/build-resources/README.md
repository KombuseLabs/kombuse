# Build Resources

This directory contains assets used by electron-builder when packaging the app.

## Required Files

### Icon (macOS)

Add one of these for the app icon:

- `icon.icns` - Native macOS icon format (recommended)
- `icon.png` - PNG at 512x512 or 1024x1024 (electron-builder will convert)

### Generate .icns from PNG

If you have a 1024x1024 PNG:

```bash
# Create iconset directory
mkdir icon.iconset

# Generate all required sizes
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# Convert to icns
iconutil -c icns icon.iconset

# Clean up
rm -rf icon.iconset
```

## Note

If no icon is provided, electron-builder will use the default Electron icon.
