"""JSON Validator

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

# States
ERROR = -1
GROUND = 0
STRING = 1
STRINGSLASH = 2
UNICODE1 = 3
UNICODE2 = 4
UNICODE3 = 5
UNICODE4 = 6
TRUE1 = 7
TRUE2 = 8
TRUE3 = 9
FALSE1 = 10
FALSE2 = 11
FALSE3 = 12
FALSE4 = 13
NULL1 = 14
NULL2 = 15
NULL3 = 16
NEGATIVE = 17
ZERO = 18
NUMBER = 19
DECIMALBAD = 20
DECIMALOK = 21
EXPONENT1 = 22
EXPONENT2 = 23
EXPONENT3 = 24

# Tokens
OBJECTSTART = 1
OBJECTEND = 2
ARRAYSTART = 3
ARRAYEND = 4
COLON = 5
COMMA = 6
STRVALUE = 7
VALUE = 8 # true, false, null, number

# Transformations
TRANSFORMATIONS = {}
def _add_rule(startState, characters, endState, token):
  """Add a rule to the transformations map.

  Args:
    startState: This rule only applies if the parser is in this state.
    characters: This rule only applies if the current character is one of these.
    endState: When applied, this rule changes the state this.
    token: When applied, this rule adds this token to the stack.
  """
  # None is treated as a wildcard character.
  if characters == None:
    TRANSFORMATIONS[(startState, None)] = (endState, token)
  else:
    # Create a rule for every character.
    for char in characters:
      TRANSFORMATIONS[(startState, char)] = (endState, token)

_add_rule(GROUND, " \r\n", GROUND, None)
_add_rule(GROUND, "[", GROUND, ARRAYSTART)
_add_rule(GROUND, "]", GROUND, ARRAYEND)
_add_rule(GROUND, "{", GROUND, OBJECTSTART)
_add_rule(GROUND, "}", GROUND, OBJECTEND)
_add_rule(GROUND, ",", GROUND, COMMA)
_add_rule(GROUND, ":", GROUND, COLON)
_add_rule(GROUND, "\"", STRING, None)
_add_rule(STRING, "\"", GROUND, STRVALUE)
_add_rule(STRING, "\\", STRINGSLASH, None)
_add_rule(STRINGSLASH, "\"\\/bfnrt", STRING, None)
_add_rule(STRINGSLASH, "u", UNICODE1, None)
_add_rule(UNICODE1, "0123456789abcdefABCDEF", UNICODE2, None)
_add_rule(UNICODE2, "0123456789abcdefABCDEF", UNICODE3, None)
_add_rule(UNICODE3, "0123456789abcdefABCDEF", UNICODE4, None)
_add_rule(UNICODE4, "0123456789abcdefABCDEF", STRING, None)
_add_rule(STRING, "\b\f\n\r", ERROR, None)
_add_rule(STRING, None, STRING, None)
_add_rule(GROUND, "t", TRUE1, None)
_add_rule(TRUE1, "r", TRUE2, None)
_add_rule(TRUE2, "u", TRUE3, None)
_add_rule(TRUE3, "e", GROUND, VALUE)
_add_rule(GROUND, "f", FALSE1, None)
_add_rule(FALSE1, "a", FALSE2, None)
_add_rule(FALSE2, "l", FALSE3, None)
_add_rule(FALSE3, "s", FALSE4, None)
_add_rule(FALSE4, "e", GROUND, VALUE)
_add_rule(GROUND, "n", NULL1, None)
_add_rule(NULL1, "u", NULL2, None)
_add_rule(NULL2, "l", NULL3, None)
_add_rule(NULL3, "l", GROUND, VALUE)
_add_rule(GROUND, "-", NEGATIVE, None)
_add_rule(GROUND, "0", ZERO, VALUE)
_add_rule(GROUND, "123456789", NUMBER, VALUE)
_add_rule(NEGATIVE, "0", NUMBER, VALUE)
_add_rule(NEGATIVE, "123456789", NUMBER, VALUE)
_add_rule(NUMBER, "0123456789", NUMBER, None)
_add_rule(NUMBER, ".", DECIMALBAD, None)
_add_rule(ZERO, ".", DECIMALBAD, None)
_add_rule(DECIMALBAD, "0123456789", DECIMALOK, None)
_add_rule(DECIMALOK, "0123456789", DECIMALOK, None)
_add_rule(NUMBER, "eE", EXPONENT1, None)
_add_rule(ZERO, "eE", EXPONENT1, None)
_add_rule(DECIMALOK, "eE", EXPONENT1, None)
_add_rule(EXPONENT1, "+-", EXPONENT2, None)
_add_rule(EXPONENT1, "0123456789", EXPONENT3, None)
_add_rule(EXPONENT2, "0123456789", EXPONENT3, None)
_add_rule(EXPONENT3, "0123456789", EXPONENT3, None)
_add_rule(EXPONENT3, " \r\n", GROUND, None)
_add_rule(EXPONENT3, ",", GROUND, COMMA)
_add_rule(EXPONENT3, ":", GROUND, COLON)
_add_rule(EXPONENT3, "]", GROUND, ARRAYEND)
_add_rule(EXPONENT3, "}", GROUND, OBJECTEND)
_add_rule(DECIMALOK, " \r\n", GROUND, None)
_add_rule(DECIMALOK, ",", GROUND, COMMA)
_add_rule(DECIMALOK, ":", GROUND, COLON)
_add_rule(DECIMALOK, "]", GROUND, ARRAYEND)
_add_rule(DECIMALOK, "}", GROUND, OBJECTEND)
_add_rule(NUMBER, " \r\n", GROUND, None)
_add_rule(NUMBER, ",", GROUND, COMMA)
_add_rule(NUMBER, ":", GROUND, COLON)
_add_rule(NUMBER, "]", GROUND, ARRAYEND)
_add_rule(NUMBER, "}", GROUND, OBJECTEND)
_add_rule(ZERO, " \r\n", GROUND, None)
_add_rule(ZERO, ",", GROUND, COMMA)
_add_rule(ZERO, ":", GROUND, COLON)
_add_rule(ZERO, "]", GROUND, ARRAYEND)
_add_rule(ZERO, "}", GROUND, OBJECTEND)

# List of states which are acceptable to end in.
EXITSTATES = (GROUND, NUMBER, ZERO, EXPONENT3)

def is_valid(string):
  """Returns true if the string is valid syntax for a JSON array or object.

  Args:
    string: JSON string to check.

  Returns:
    True iff JSON string is valid.
  """
  state = GROUND
  tokens = []
  for char in string:
    # Transform from this state to the next state.
    next = TRANSFORMATIONS.get((state, char))
    if next == None:
      # No matching character, check for a wildcard match.
      next = TRANSFORMATIONS.get((state, None))
      if next == None:
        return False
    (state, token) = next
    if token != None:
      tokens.append(token)
  if not state in EXITSTATES:
    # A half-defined value.
    return False
  if not tokens or (tokens[0] != ARRAYSTART and tokens[0] != OBJECTSTART):
    # Root value must be array or object.
    return False
  if not _pop_value(tokens):
    # Not a value.
    return False
  if tokens:
    # Leftover tokens beyond first value.
    return False
  return True

def _pop_value(tokens):
  """Do the provided JSON tokens form a value?  Starting from the end, pop
  tokens off the list as they are used.  Unused tokens remain on the list.
  This function is recursive.

  Args:
    tokens: List of JSON tokens.

  Returns:
    True iff JSON value is found.
  """
  if not tokens:
    # Empty
    return False
  # Work backwards since t.pop() is much more efficent than del t[0].
  token = tokens.pop()

  if token == VALUE or token == STRVALUE:
    return True

  if token == ARRAYEND:
    has_value = False
    while tokens:
      if tokens[-1] == ARRAYSTART:
        tokens.pop()
        return True
      if has_value:
        if tokens[-1] != COMMA:
          # Values not comma separated.
          return False
        tokens.pop()
      if not _pop_value(tokens):
        # Array contains non-value.
        return False
      has_value = True
    # Ran out of tokens looking for "["
    return False

  if token == OBJECTEND:
    has_value = False
    while tokens:
      if tokens[-1] == OBJECTSTART:
        tokens.pop()
        return True
      if has_value:
        if tokens[-1] != COMMA:
          # Pairs not comma separated.
          return False
        tokens.pop()
      if not _pop_value(tokens):
        # Object contains non-value.
        return False
      has_value = True
      if not tokens:
        break
      if tokens[-1] != COLON:
        # Name:value not colon separated.
        return False
      tokens.pop()
      if not tokens:
        break
      if tokens[-1] != STRVALUE:
        # Object property not a string.
        return False
      tokens.pop()
    # Ran out of tokens looking for "{"
    return False

  # Must be a comma or colon.
  return False

