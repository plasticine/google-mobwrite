<?php
# MobWrite - Real-time Synchronization and Collaboration Service
#
# Copyright 2006 Google Inc.
# http://code.google.com/p/google-mobwrite/
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# This server-side script connects the Ajax client to the Python daemon.
# This is a minimal man-in-the-middle script.  No input checking from either side.

# NOTE: This PHP script does not have the 'p' argument suppot that the Python
# version has.  This means the PHP script can't be used for remote hosting where
# the MobWrite gateway is one one server and the forms are on another.
# Adding this code is easy, but requires a PHP dev environment to debug.

header("Content-type: text/plain");

$out = $_POST['q'];

$in = "";
ini_set("display_errors", 0);
$fp = fsockopen("localhost", 3017, $errno, $errstr, 5);
ini_set("display_errors", 1);
if (!$fp) {
  # PHP can't connect to Python daemon.
  $in = "\n";
} else {
  if (get_magic_quotes_gpc()) {
    # Some servers have magic quotes enabled, some disabled.
    $out = stripslashes($out);
  }
  fwrite($fp, $out);
  while (!feof($fp)) {
    $in .= fread($fp, 1024);
  }
  fclose($fp);
}

#echo "-Sent-\n";
#echo $out;
#echo "-Received-\n";
echo $in;

?>
