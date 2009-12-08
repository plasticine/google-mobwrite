#!/usr/bin/python2.4

"""Test harness for json_validator.py

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

__author__ = 'fraser@google.com (Neil Fraser)'

import unittest
import json_validator
# Force a module reload to make debugging easier (at least in PythonWin).
reload(json_validator)

class JsonValidatorTest(unittest.TestCase):

  def assertValid(self, json):
    self.assertTrue(json_validator.is_valid(json))

  def assertInvalid(self, json):
    self.assertFalse(json_validator.is_valid(json))

  def testJsonValid(self):
    # Valid expressions.
    self.assertValid('["\\u1abc"]')
    self.assertValid('[""]')
    self.assertValid('["\\""]')
    self.assertValid('[123]')
    self.assertValid('[]')
    self.assertValid('[0]')
    self.assertValid('[0e0]')
    self.assertValid('[0, -1, 1.2, -3.4, 5e+6, 7.8E-90]')
    self.assertValid('[true, false, null]')
    self.assertValid('{}')
    self.assertValid('{"foo":"bar"}')
    self.assertValid('{"1":"one", "2":["deux", "zwei"], "3":null}')

  def testJsonInvalid(self):
    # Invalid expressions.
    self.assertInvalid('')
    self.assertInvalid('    ')
    self.assertInvalid('1')
    self.assertInvalid('1.2')
    self.assertInvalid('"Hi"')
    self.assertInvalid('true')
    self.assertInvalid('[,,,]')
    self.assertInvalid('{[]}')
    self.assertInvalid('{"1", "2"}')
    self.assertInvalid('{"zero"}')
    self.assertInvalid('{1:"one"}')
    self.assertInvalid('{null:[]}')
    self.assertInvalid('{true:"true"}')
    self.assertInvalid('{[false]:"false"}')
    self.assertInvalid('{{}:"object"}')
    self.assertInvalid('["]')
    self.assertInvalid('["\\x"]')
    self.assertInvalid('["\\u1ab"]')
    self.assertInvalid('[{]}')
    self.assertInvalid('[1:2]')
    self.assertInvalid('[1, 2')
    self.assertInvalid('1, 2')
    self.assertInvalid('[007]')
    self.assertInvalid('[.1]')
    self.assertInvalid('[document.cookies]')
    self.assertInvalid('[alert()]')
    self.assertInvalid('[1+1]')
    self.assertInvalid('[1;2]')

  def testJsonMultiLine(self):
    # The JSON example in Wikipedia.
    self.assertValid("""
{
     "firstName": "John",
     "lastName": "Smith",
     "address": {
         "streetAddress": "21 2nd Street",
         "city": "New York",
         "state": "NY",
         "postalCode": 10021
     },
     "phoneNumbers": [
         { "type": "home", "number": "212 555-1234" },
         { "type": "fax", "number": "646 555-4567" }
     ],
     "newSubscription": false,
     "companyName": null
 }
""")

if __name__ == "__main__":
  unittest.main()

