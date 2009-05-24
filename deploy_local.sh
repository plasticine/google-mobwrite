#!/bin/bash -e

# Builds mobwrite and installs the appengine version as ./local/mobwrite
# You can then run appengine locally out of this directory.
# (For example, using App Engine Launcher for Mac OS X, select
# File->Add Existing Application and choose local/mobwrite.)

DEST=local

./build.sh
echo "Deploying app engine version"
mkdir -p "$DEST"
if [[ -d "$DEST/mobwrite.old" ]]; then
  rm -r "$DEST/mobwrite.old"
fi
if [[ -d "$DEST/mobwrite" ]]; then
  mv "$DEST/mobwrite" "$DEST/mobwrite.old"
fi
unzip -q mobwrite_appengine.zip -d "$DEST"
echo "Done. app engine version is here: $DEST/mobwrite"
