MobWrite Tools

These tools enable 3rd party services to interface with MobWrite.

download.py
Command-line tool for downloading content from MobWrite.
The content is printed to standard output.
Usage:  python download.py <URL> <DOCNAME>
  E.g.  python download.py http://mobwrite3.appspot.com/scripts/q.py demo_editor_text
  E.g.  python download.py telnet://localhost:3017 demo_editor_text

upload.py
Command-line tool for uploading content to MobWrite.
The content is taken from standard input.
Usage:  python upload.py <URL> <DOCNAME>
  E.g.  python upload.py http://mobwrite3.appspot.com/scripts/q.py demo_editor_text
  E.g.  python upload.py telnet://localhost:3017 demo_editor_text

nullify.py
Command-line tool for nullifying content from MobWrite.
This will delete the named file from the server.  This is not the same as
uploading an empty file; nullification removes all server knowledge of the file.
Usage:  python nullify.py <URL> <DOCNAME>
  E.g.  python nullify.py http://mobwrite3.appspot.com/scripts/q.py demo_editor_text
  E.g.  python nullify.py telnet://localhost:3017 demo_editor_text

sync.jar
Command-line tool for synchronizing content with MobWrite.
This tool synchronizes a file once per execution.  On first execution a temporary file
is created which contains local versioning information for the shared document.
Full source code is available inside the JAR file.
Note that sync.jar does not currently support the telnet protocol.
Usage:  java -jar sync.jar <URL> <DOCNAME> <FILENAME>
  E.g.  java -jar sync.jar http://mobwrite3.appspot.com/scripts/q.py demo_editor_text text.txt

mobwritelib.py
Python library for connecting with MobWrite.
Provides functions for uploading, downloading and nullifying documents.

tools_test.sh
Unit tests for download.py, upload.py, nullify.py and sync.jar.

loadtest.py
Command-line tool to stress a MobWrite server.
Sends a stream of random requests to a server for load testing.
Usage:  loadtest.py <URL> <Hertz>
  E.g.  loadtest.py http://mobwrite3.appspot.com/scripts/q.py 5.0
  E.g.  loadtest.py telnet://localhost:3017 5.0
