#!/bin/bash
set -e

# Configuration
APP_NAME="FluxDL"
VERSION=$(grep '"version":' package.json | cut -d '"' -f 4)
PKG_DIR="pkg_staging"
ARTIFACTS_DIR="artifacts"
BUILD_ROOT="build"

echo "📦 Starting Linux packaging for $APP_NAME v$VERSION..."

# 1. Locate the build directory
# We look for something like build/*-linux-x64/FluxDL-*
FIND_BUILD=$(find $BUILD_ROOT -maxdepth 2 -type d -name "$APP_NAME-*" | head -n 1)

if [ -z "$FIND_BUILD" ]; then
    echo "❌ Error: Could not find Electrobun build output in $BUILD_ROOT"
    exit 1
fi

echo "📂 Found build at: $FIND_BUILD"

# 2. Setup Staging for FPM (DEB/RPM)
rm -rf $PKG_DIR
mkdir -p $PKG_DIR/opt/fluxdl
mkdir -p $PKG_DIR/usr/bin
mkdir -p $PKG_DIR/usr/share/applications
mkdir -p $PKG_DIR/usr/share/pixmaps

cp -r $FIND_BUILD/* $PKG_DIR/opt/fluxdl/
cp $FIND_BUILD/FluxDL.desktop $PKG_DIR/usr/share/applications/fluxdl.desktop
cp src/mainview/assets/icon-512.png $PKG_DIR/usr/share/pixmaps/fluxdl.png

# Create a symlink in /usr/bin to the launcher
ln -sf /opt/fluxdl/bin/FluxDL $PKG_DIR/usr/bin/fluxdl

# Use absolute paths for FPM
mkdir -p $ARTIFACTS_DIR

# 3. Generate .deb
echo "🛠️ Generating .deb package..."

# Create a temporary after-install script
cat > deb-after-install.sh <<EOF
#!/bin/bash
chmod +x /opt/fluxdl/bin/FluxDL
EOF

fpm -s dir -t deb \
    -n fluxdl \
    -v $VERSION \
    -C $PKG_DIR \
    -p $ARTIFACTS_DIR/fluxdl_${VERSION}_amd64.deb \
    --description "FluxDL Multi-Segment Download Manager" \
    --maintainer "FluxDL Team" \
    --category utility \
    --vendor "FluxDL" \
    --after-install deb-after-install.sh

rm deb-after-install.sh

# 4. Generate .rpm
echo "🛠️ Generating .rpm package..."
fpm -s dir -t rpm \
    -n fluxdl \
    -v $VERSION \
    -C $PKG_DIR \
    -p $ARTIFACTS_DIR/fluxdl-${VERSION}.x86_64.rpm \
    --description "FluxDL Multi-Segment Download Manager" \
    --maintainer "FluxDL Team" \
    --category utility \
    --vendor "FluxDL"

# 5. Generate .AppImage
echo "🛠️ Generating .AppImage..."
# Using appimagetool if present
if command -v appimagetool >/dev/null 2>&1 || [ -f "./appimagetool" ]; then
    APP_TOOL=${APPIMAGE_TOOL:-appimagetool}
    if [ -f "./appimagetool" ]; then APP_TOOL="./appimagetool"; fi
    
    # AppImage needs a specific root
    AI_ROOT="AppDir"
    rm -rf $AI_ROOT
    mkdir -p $AI_ROOT
    cp -r $FIND_BUILD/* $AI_ROOT/
    
    # AppImage specific requirements at root
    cp src/mainview/assets/icon-512.png $AI_ROOT/fluxdl.png
    
    # Patch the desktop file for AppImage compliance:
    # 1. Icon name should not have an extension
    # 2. Remove deprecated 'Application' category
    # 3. Ensure Exec points to fluxdl (which AppRun will handle or just point to absolute in AppDir)
    cat > $AI_ROOT/fluxdl.desktop <<EOF
[Desktop Entry]
Type=Application
Name=FluxDL
Exec=FluxDL
Icon=fluxdl
Terminal=false
Categories=Utility;
EOF
    
    # AppRun is required
    cat > $AI_ROOT/AppRun <<EOF
#!/bin/sh
HERE="\$(dirname "\$(readlink -f "\${0}")")"
export PATH="\${HERE}/bin:\${PATH}"
exec "\${HERE}/bin/FluxDL" "\$@"
EOF
    chmod +x $AI_ROOT/AppRun
    
    ARCH=x86_64 $APP_TOOL $AI_ROOT $ARTIFACTS_DIR/FluxDL-${VERSION}-x86_64.AppImage
else
    echo "⚠️ appimagetool not found, skipping AppImage generation."
fi

# 6. Cleanup Staging
rm -rf $PKG_DIR AppDir

echo "✅ Packaging complete. Artifacts in $ARTIFACTS_DIR/"
ls -lh $ARTIFACTS_DIR/
