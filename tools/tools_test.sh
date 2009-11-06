#!/bin/sh
# MobWrite Tools Test Suite
#
# Copyright 2009 Google Inc.
# http://code.google.com/p/google-mobwrite/
# Author: fraser@google.com (Neil Fraser)
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

# This test script runs each of the tools and verifies correct operation.

assert_equals ()
{
  if cmp $1 $2
  then
    echo "Test OK."
  else
    echo "Test FAIL!"
    echo "Expected:"
    cat $1
    echo "Actual:"
    cat $2
    exit 1
  fi
}

SERVER=http://mobwrite3.appspot.com/scripts/q.py

# Set a temp directory if none has been specified.
if test -z "${TEST_TMPDIR}"
then
  TEST_TMPDIR="."
fi
echo "Temp dir: ${TEST_TMPDIR}/"

if test -z "${PYTHON}"
then
  PYTHON="python"
fi
echo "Using Python: ${PYTHON}/"

if test -z "${JAVA}"
then
  JAVA="java"
fi
echo "Using Java: ${JAVA}/"

echo $PYTHONPATH

# Run text through an upload/download round trip.
echo "The quick brown fox jumps over a lazy dog." > ${TEST_TMPDIR}/unittest1.tmp
$PYTHON upload.py $SERVER unittest < ${TEST_TMPDIR}/unittest1.tmp
$PYTHON download.py $SERVER unittest > ${TEST_TMPDIR}/unittest2.tmp
assert_equals ${TEST_TMPDIR}/unittest1.tmp ${TEST_TMPDIR}/unittest2.tmp
rm ${TEST_TMPDIR}/unittest*.tmp*


# Upload, Nullify, Download.
echo "The quick brown fox jumps over a lazy dog." > ${TEST_TMPDIR}/unittest0.tmp
$PYTHON upload.py $SERVER unittest < ${TEST_TMPDIR}/unittest0.tmp
$PYTHON nullify.py $SERVER unittest
touch ${TEST_TMPDIR}/unittest1.tmp
$PYTHON download.py $SERVER unittest > ${TEST_TMPDIR}/unittest2.tmp
assert_equals ${TEST_TMPDIR}/unittest1.tmp ${TEST_TMPDIR}/unittest2.tmp
rm ${TEST_TMPDIR}/unittest*.tmp*


# Upload, Nullify, Sync, Download.
# Upload some bad text.
echo "Bad text" > ${TEST_TMPDIR}/unittest0.tmp
$PYTHON upload.py $SERVER unittest < ${TEST_TMPDIR}/unittest0.tmp
# Nullify this text.
$PYTHON nullify.py $SERVER unittest
# Sync some new text which should be accepted.
echo "The quick brown fox jumps over a lazy dog." > ${TEST_TMPDIR}/unittest1.tmp
cp ${TEST_TMPDIR}/unittest1.tmp ${TEST_TMPDIR}/unittest2.tmp
$JAVA -jar sync.jar $SERVER unittest ${TEST_TMPDIR}/unittest1.tmp
# Verify the client text was unchanged.
assert_equals ${TEST_TMPDIR}/unittest1.tmp ${TEST_TMPDIR}/unittest2.tmp
# Verify the server text was the new text.
$PYTHON download.py $SERVER unittest > ${TEST_TMPDIR}/unittest3.tmp
assert_equals ${TEST_TMPDIR}/unittest1.tmp ${TEST_TMPDIR}/unittest3.tmp
rm ${TEST_TMPDIR}/unittest*.tmp*


# Nullify, Sync, Upload, Sync, Download.
# First, nullify the document to prevent earlier runs from conflicting.
$PYTHON nullify.py $SERVER unittest
# Sync up our base text.
echo "The quick brown fox jumps over a lazy dog." > ${TEST_TMPDIR}/unittest1.tmp
$JAVA -jar sync.jar $SERVER unittest ${TEST_TMPDIR}/unittest1.tmp
# Upload a change to the server.
echo "The UGLY brown fox jumps over a lazy dog." > ${TEST_TMPDIR}/unittest0.tmp
$PYTHON upload.py $SERVER unittest < ${TEST_TMPDIR}/unittest0.tmp
# Sync a change from the client.
echo "The quick brown fox jumps over a HAPPY dog." > ${TEST_TMPDIR}/unittest1.tmp
$JAVA -jar sync.jar $SERVER unittest ${TEST_TMPDIR}/unittest1.tmp
# Verify both changes were merged in the local document.
echo "The UGLY brown fox jumps over a HAPPY dog." > ${TEST_TMPDIR}/unittest2.tmp
assert_equals ${TEST_TMPDIR}/unittest2.tmp ${TEST_TMPDIR}/unittest1.tmp
# Verify both changes were merged in the remote document.
$PYTHON download.py $SERVER unittest > ${TEST_TMPDIR}/unittest3.tmp
assert_equals ${TEST_TMPDIR}/unittest2.tmp ${TEST_TMPDIR}/unittest3.tmp
rm ${TEST_TMPDIR}/unittest*.tmp*


echo
echo "ALL TESTS PASSED"
exit 0
