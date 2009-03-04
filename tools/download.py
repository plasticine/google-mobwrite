#!/usr/bin/python
"""MobWrite Downloader

Copyright 2009 Google Inc.
http://code.google.com/p/google-mobwrite/

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

"""This command-line program downloads a file from a MobWrite server.

The MobWrite URL and the filename are provided on the command line.
The file content is printed to standard output.
Version numbers are not tracked.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import mobwritelib
import sys

if __name__ == "__main__":
  # Obtain the server URL and the filename from the command line argument.
  if len(sys.argv) != 3:
    print >> sys.stderr, "Usage:  %s <URL> <FILENAME>" % sys.argv[0]
    print >> sys.stderr, "  E.g.  %s http://mobwrite3.appspot.com/scripts/q.py demo_editor_text" % sys.argv[0]
    print >> sys.stderr, "  E.g.  %s telnet://localhost:3017 demo_editor_text" % sys.argv[0]
    sys.exit(2)
  url = sys.argv[1]
  filename = sys.argv[2]
  results = mobwritelib.download(url, [filename])
  if filename in results:
    if results.get(filename):
      print results.get(filename),
  else:
    sys.exit("Error: MobWrite server failed to provide data.")
