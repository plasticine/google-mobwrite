#!/usr/bin/python
"""MobWrite - Real-time Synchronization and Collaboration Service

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

"""Core functions for a MobWrite client/server in Python.
"""

__author__ = "fraser@google.com (Neil Fraser)"

import re
import diff_match_patch as dmp_module
import logging

# Global Diff/Match/Patch object.
DMP = dmp_module.diff_match_patch()

# Demo usage should limit the maximum size of any text.
# Set to 0 to disable limit.
MAX_CHARS = 20000

class TextObj:
  # An object which stores a text.

  # Object properties:
  # .name - The unique name for this text, e.g 'proposal'
  # .text - The text itself.
  # .changed - Has the text changed since the last time it was saved.

  def __init__(self, *args, **kwargs):
    # Setup this object
    self.name = kwargs.get("name")
    self.text = None
    self.changed = False

  def setText(self, newtext):
    # Scrub the text before setting it.
    # Keep the text within the length limit.
    if MAX_CHARS != 0 and len(newtext) > MAX_CHARS:
      newtext = newtext[-MAX_CHARS:]
      logging.warning("Truncated text to %d characters." % MAX_CHARS)
    # Normalize linebreaks to LF.
    newtext = re.sub(r"(\r\n|\r|\n)", "\n", newtext)
    if self.text != newtext:
      self.text = newtext
      self.changed = True

class ViewObj:
  # An object which contains one user's view of one text.

  # Object properties:
  # .username - The name for the user, e.g 'fraser'
  # .filename - The name for the file, e.g 'proposal'
  # .shadow - The last version of the text sent to client.
  # .backup_shadow - The previous version of the text sent to client.
  # .shadow_client_version - The client's version for the shadow (n).
  # .shadow_server_version - The server's version for the shadow (m).
  # .backup_shadow_server_version - the server's version for the backup
  #     shadow (m).

  def __init__(self, *args, **kwargs):
    # Setup this object
    self.username = kwargs["username"]
    self.filename = kwargs["filename"]
    self.shadow_client_version = kwargs.get("shadow_client_version", 0)
    self.shadow_server_version = kwargs.get("shadow_server_version", 0)
    self.backup_shadow_server_version = kwargs.get("backup_shadow_server_version", 0)
    self.shadow = kwargs.get("shadow", u"")
    self.backup_shadow = kwargs.get("backup_shadow", u"")
