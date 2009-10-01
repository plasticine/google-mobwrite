#!/usr/bin/python
"""MobWrite Tootls Test Suite

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

"""This test script runs each of the tools and verifies correct operation.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import os
import sys
import unittest


class ToolsTest(unittest.TestCase):

  def setUp(self):
    self.server = "http://mobwrite3.appspot.com/scripts/q.py"

  def testUploadDownload(self):
    # Run text through an upload/download round trip.
    text = "The quick brown fox jumps over a lazy dog.\n"
    f = open("unittest1.tmp", "w")
    f.write(text)
    f.close()
    os.system("python upload.py %s unittest < unittest1.tmp" % self.server)
    os.remove("unittest1.tmp")

    os.system("python download.py %s unittest > unittest2.tmp" % self.server)
    f = open("unittest2.tmp", "r")
    newtext = f.read()
    f.close()
    os.remove("unittest2.tmp")
    self.assertEquals(text, newtext)

  def testUploadNullifyDownload(self):
    # Upload, Nullify, Download.
    text = "The quick brown fox jumps over a lazy dog.\n"
    f = open("unittest1.tmp", "w")
    f.write(text)
    f.close()
    os.system("python upload.py %s unittest < unittest1.tmp" % self.server)
    os.remove("unittest1.tmp")

    os.system("python nullify.py %s unittest" % self.server)

    os.system("python download.py %s unittest > unittest2.tmp" % self.server)
    f = open("unittest2.tmp", "r")
    newtext = f.read()
    f.close()
    os.remove("unittest2.tmp")
    self.assertEquals("", newtext)

  def testSyncNull(self):
    # Upload, Nullify, Sync, Download.
    # Upload some bad text.
    f = open("unittest0.tmp", "w")
    f.write("Bad text\n")
    f.close()
    os.system("python upload.py %s unittest < unittest0.tmp" % self.server)
    os.remove("unittest0.tmp")

    # Nullify this text.
    os.system("python nullify.py %s unittest" % self.server)

    # Sync some new text which should be accepted.
    text = "The quick brown fox jumps over a lazy dog.\n"
    f = open("unittest1.tmp", "w")
    f.write(text)
    f.close()
    os.system("java -jar sync.jar %s unittest unittest1.tmp" % self.server)

    # Verify the client text was unchanged.
    f = open("unittest1.tmp", "r")
    newtext = f.read()
    f.close()
    os.remove("unittest1.tmp")
    os.remove("unittest1.tmp.unittest.mobwrite")
    self.assertEquals(text, newtext)

    # Verify the server text was the new text.
    os.system("python download.py %s unittest > unittest2.tmp" % self.server)
    f = open("unittest2.tmp", "r")
    newtext = f.read()
    f.close()
    os.remove("unittest2.tmp")
    self.assertEquals(text, newtext)

  def testSync(self):
    # Nullify, Sync, Upload, Sync, Download.
    # First, nullify the document to prevent earlier runs from conflicting.
    os.system("python nullify.py %s unittest" % self.server)

    # Sync up our base text.
    f = open("unittest1.tmp", "w")
    f.write("The quick brown fox jumps over a lazy dog.\n")
    f.close()
    os.system("java -jar sync.jar %s unittest unittest1.tmp" % self.server)

    # Upload a change to the server.
    f = open("unittest0.tmp", "w")
    f.write("The UGLY brown fox jumps over a lazy dog.\n")
    f.close()
    os.system("python upload.py %s unittest < unittest0.tmp" % self.server)
    os.remove("unittest0.tmp")

    # Sync a change from the client.
    f = open("unittest1.tmp", "w")
    f.write("The quick brown fox jumps over a HAPPY dog.\n")
    f.close()
    os.system("java -jar sync.jar %s unittest unittest1.tmp" % self.server)
    os.remove("unittest1.tmp")
    os.remove("unittest1.tmp.unittest.mobwrite")

    # Verify both changes were merged in the local document.
    os.system("python download.py %s unittest > unittest2.tmp" % self.server)
    f = open("unittest2.tmp", "r")
    newtext = f.read()
    f.close()
    os.remove("unittest2.tmp")
    self.assertEquals("The UGLY brown fox jumps over a HAPPY dog.\n", newtext)

if __name__ == "__main__":
  unittest.main()
