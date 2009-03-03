echo "Building mobwrite_daemon.zip"
mkdir mobwrite
cp README_daemon mobwrite/
cp mobwrite_core.js mobwrite_form.js diff_match_patch_uncompressed.js compressed_form.js mobwrite/
mkdir mobwrite/daemon
cp daemon/mobwrite_daemon.py daemon/diff_match_patch.py daemon/q.py daemon/q.php daemon/q.jsp daemon/.htaccess mobwrite/daemon
mkdir mobwrite/daemon/data
cp daemon/data/README mobwrite/daemon/data/
mkdir mobwrite/demos
cp demos/index.html demos/editor.html demos/form.html demos/spreadsheet.html mobwrite/demos/
mkdir mobwrite/remote-demos
cp remote-demos/index.html remote-demos/editor.html remote-demos/form.html remote-demos/spreadsheet.html mobwrite/remote-demos/
mkdir mobwrite/tests
cp tests/index.html tests/client.html tests/q.html tests/server.html tests/server.xml mobwrite/tests/
zip -r mobwrite mobwrite
mv mobwrite.zip mobwrite_daemon.zip
rm -r mobwrite/

echo "Building mobwrite_appengine.zip"
mkdir mobwrite
cp README_appengine mobwrite/
cp appengine/app.yaml appengine/index.yaml appengine/diff_match_patch.py appengine/index_redirect.py appengine/mobwrite_appengine.py mobwrite/
mkdir mobwrite/static
cp mobwrite_core.js mobwrite_form.js diff_match_patch_uncompressed.js compressed_form.js mobwrite/static/
mkdir mobwrite/static/demos
cp demos/index.html demos/editor.html demos/form.html demos/spreadsheet.html mobwrite/static/demos/
mkdir mobwrite/static/remote-demos
cp remote-demos/index.html remote-demos/editor.html remote-demos/form.html remote-demos/spreadsheet.html mobwrite/static/remote-demos/
mkdir mobwrite/static/tests
cp tests/index.html tests/client.html tests/q.html tests/server.html tests/server.xml mobwrite/static/tests/
zip -r mobwrite mobwrite
mv mobwrite.zip mobwrite_appengine.zip
rm -r mobwrite/
