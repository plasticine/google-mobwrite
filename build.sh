#!/bin/bash

# Creates zip files for both versions of the mobwrite server.

echo "Building mobwrite_daemon.zip"
mkdir mobwrite
cp README_daemon mobwrite/
cp mobwrite_core.js mobwrite_form.js diff_match_patch_uncompressed.js compressed_form.js mobwrite/
mkdir mobwrite/daemon
cp daemon/mobwrite_daemon.py daemon/q.py daemon/q.php daemon/q.jsp daemon/.htaccess mobwrite/daemon
mkdir mobwrite/daemon/lib
cp lib/mobwrite_core.py lib/diff_match_patch.py mobwrite/daemon/lib/
mkdir mobwrite/daemon/data
cp daemon/data/README mobwrite/daemon/data/
mkdir mobwrite/demos
cp demos/index.html demos/editor.html demos/form.html demos/spreadsheet.html  demos/java-editor.html demos/java-form.html demos/mobwrite-demo.jar mobwrite/demos/
mkdir mobwrite/remote-demos
cp remote-demos/index.html remote-demos/editor.html remote-demos/form.html remote-demos/spreadsheet.html mobwrite/remote-demos/
mkdir mobwrite/tests
cp tests/index.html tests/client.html tests/q.html tests/server.html tests/server.xml mobwrite/tests/
mkdir mobwrite/tools
cp tools/download.py tools/upload.py tools/loadtest.py tools/mobwritelib.py tools/sync.py tools/demo.cfg mobwrite/tools/
mkdir mobwrite/java-client
cp java-client/*.java mobwrite/java-client
zip -q -r mobwrite mobwrite
mv mobwrite.zip mobwrite_daemon.zip
rm -r mobwrite/

echo "Building mobwrite_appengine.zip"
mkdir mobwrite
cp README_appengine mobwrite/
cp appengine/app.yaml appengine/cron.yaml appengine/index.yaml appengine/index_redirect.py appengine/mobwrite_appengine.py mobwrite/
mkdir mobwrite/lib
cp lib/mobwrite_core.py lib/diff_match_patch.py mobwrite/lib/
mkdir mobwrite/static
cp mobwrite_core.js mobwrite_form.js diff_match_patch_uncompressed.js compressed_form.js mobwrite/static/
mkdir mobwrite/static/demos
cp demos/index.html demos/editor.html demos/form.html demos/spreadsheet.html demos/java-editor.html demos/java-form.html demos/mobwrite-demo.jar mobwrite/static/demos/
mkdir mobwrite/static/remote-demos
cp remote-demos/index.html remote-demos/editor.html remote-demos/form.html remote-demos/spreadsheet.html mobwrite/static/remote-demos/
mkdir mobwrite/static/tests
cp tests/index.html tests/client.html tests/q.html tests/server.html tests/server.xml mobwrite/static/tests/
mkdir mobwrite/tools
cp tools/download.py tools/upload.py tools/loadtest.py tools/mobwritelib.py tools/sync.py tools/demo.cfg mobwrite/tools/
mkdir mobwrite/java-client
cp java-client/*.java mobwrite/java-client
zip -q -r mobwrite mobwrite
mv mobwrite.zip mobwrite_appengine.zip
rm -r mobwrite/
