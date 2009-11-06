#!/bin/bash
# Builds packages for release.

copy_html ()
{
  mkdir $1/
  cp html/mobwrite_core.js html/mobwrite_form.js html/diff_match_patch_uncompressed.js html/compressed_form.js $1/
  mkdir $1/demos
  cp html/demos/index.html html/demos/editor.html html/demos/form.html html/demos/spreadsheet.html $1/demos/
  mkdir $1/tests
  cp html/tests/index.html html/tests/client.html html/tests/client.js html/tests/q.html html/tests/server.html html/tests/server.xml $1/tests/
}

copy_lib ()
{
  mkdir $1
  cp lib/mobwrite_core.py lib/diff_match_patch.py lib/default_editor.html lib/mobwrite_config.txt $1/
}

blaze_package ()
{
  rm -f $2
  blaze build $1
  if [ -f $2 ]
  then
    cp -f $2 $3
    chmod 444 $3
    echo Compile of $1 succeeded.
  else
    echo ERROR: Compile of $1 failed.
    exit 1
  fi
}

# Package the demo applet jar.
blaze_package java:MobWriteClientDemo_deploy.jar \
  ../../blaze-bin/third_party/mobwrite/java/MobWriteClientDemo_deploy.jar \
  html/java-demos/mobwrite-demo.jar

# Package the command-line syncronization jar.
blaze_package java:MobWriteFileSync_deploy.jar \
  ../../blaze-bin/third_party/mobwrite/java/MobWriteFileSync_deploy.jar \
  tools/sync.jar

# Package the JavaScript files.
blaze_package html:compressed_form \
  ../../blaze-bin/third_party/mobwrite/html/compressed_form.js \
  html/compressed_form.js

# Copy diff_match_patch from SrcFS.
mkdir -p java/name/fraser/neil/plaintext/
cp -f ../../../READONLY/google3/third_party/diff_match_patch/java/name/fraser/neil/plaintext/diff_match_patch.java java/name/fraser/neil/plaintext/
chmod 444 java/name/fraser/neil/plaintext/diff_match_patch.java
cp -f ../../../READONLY/google3/third_party/diff_match_patch/python/diff_match_patch.py lib/
chmod 444 lib/diff_match_patch.py
cp -f ../../../READONLY/google3/third_party/diff_match_patch/javascript/diff_match_patch_uncompressed.js html/
chmod 444 html/diff_match_patch_uncompressed.js

echo

BUNDLE=mobwrite_appengine
echo "Building $BUNDLE.zip"
rm -rf $BUNDLE/
mkdir $BUNDLE
cp appengine/README_appengine $BUNDLE/
cp appengine/app.yaml appengine/cron.yaml appengine/index.yaml appengine/index_redirect.py appengine/mobwrite_appengine.py $BUNDLE/
copy_lib $BUNDLE/lib
copy_html $BUNDLE/static
zip -q -r $BUNDLE.zip $BUNDLE
rm -rf $BUNDLE/

BUNDLE=mobwrite_daemon
echo "Building $BUNDLE.zip"
rm -rf $BUNDLE/
mkdir $BUNDLE
cp daemon/README_daemon $BUNDLE/
mkdir $BUNDLE/daemon
cp daemon/mobwrite_daemon.py daemon/q.py daemon/q.php daemon/q.jsp daemon/.htaccess $BUNDLE/daemon
mkdir $BUNDLE/daemon/data
cp daemon/data/README $BUNDLE/daemon/data/
copy_lib $BUNDLE/lib
copy_html $BUNDLE/html
cp lib/default_editor.html $BUNDLE/
zip -q -r $BUNDLE.zip $BUNDLE
rm -rf $BUNDLE/

BUNDLE=mobwrite_java_client
echo "Building $BUNDLE.zip"
rm -rf $BUNDLE/
JAVAPATH=java/com/google/mobwrite
mkdir -p $BUNDLE/$JAVAPATH
cp $JAVAPATH/DemoEditorApplet.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/DemoFormApplet.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/MobWriteClient.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/ShareAbstractButton.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/ShareButtonGroup.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/ShareJList.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/ShareJTextComponent.java $BUNDLE/$JAVAPATH
cp $JAVAPATH/ShareObj.java $BUNDLE/$JAVAPATH
JAVAPATH=java/name/fraser/neil/plaintext
mkdir -p $BUNDLE/$JAVAPATH
cp $JAVAPATH/diff_match_patch.java $BUNDLE/$JAVAPATH
mkdir -p $BUNDLE/html/java-demos
cp html/java-demos/*.html $BUNDLE/html/java-demos
cp html/java-demos/mobwrite-demo.jar $BUNDLE/html/java-demos
zip -q -r $BUNDLE.zip $BUNDLE
rm -rf $BUNDLE/

BUNDLE=mobwrite_tools
echo "Building $BUNDLE.zip"
rm -rf $BUNDLE/
mkdir $BUNDLE
cp tools/README.txt tools/download.py tools/upload.py tools/nullify.py tools/loadtest.py tools/mobwritelib.py tools/sync.jar $BUNDLE/
zip -q -r $BUNDLE.zip $BUNDLE
rm -rf $BUNDLE/

