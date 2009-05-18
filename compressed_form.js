/**
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Computes the difference between two texts to create a patch.
 * Applies the patch onto another text, allowing for errors.
 * @author fraser@google.com (Neil Fraser)
 */

/**
 * Class containing the diff, match and patch methods.
 * @constructor
 */
function diff_match_patch() {

  // Defaults.
  // Redefine these in your program to override the defaults.

  // Number of seconds to map a diff before giving up.  (0 for infinity)
  this.Diff_Timeout = 1.0;
  // Cost of an empty edit operation in terms of edit characters.
  this.Diff_EditCost = 4;
  // The size beyond which the double-ended diff activates.
  // Double-ending is twice as fast, but less accurate.
  this.Diff_DualThreshold = 32;
  // Tweak the relative importance (0.0 = accuracy, 1.0 = proximity)
  this.Match_Balance = 0.5;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose)
  this.Match_Threshold = 0.5;
  // The min and max cutoffs used when computing text lengths.
  this.Match_MinLength = 100;
  this.Match_MaxLength = 1000;
  // Chunk size for context length.
  this.Patch_Margin = 4;

  /**
   * Compute the number of bits in an int.
   * The normal answer for JavaScript is 32.
   * @return {number} Max bits
   */
  function getMaxBits() {
    var maxbits = 0;
    var oldi = 1;
    var newi = 2;
    while (oldi != newi) {
      maxbits++;
      oldi = newi;
      newi = newi << 1;
    }
    return maxbits;
  }
  // How many bits in a number?
  this.Match_MaxBits = getMaxBits();
}


//  DIFF FUNCTIONS


/**
 * The data structure representing a diff is an array of tuples:
 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
 */
var DIFF_DELETE = -1;
var DIFF_INSERT = 1;
var DIFF_EQUAL = 0;


/**
 * Find the differences between two texts.  Simplifies the problem by stripping
 * any common prefix or suffix off the texts before diffing.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean} opt_checklines Optional speedup flag.  If present and false,
 *     then don't run a line-level diff first to identify the changed areas.
 *     Defaults to true, which does a faster, slightly less optimal diff
 * @return {Array.<Array.<*>>} Array of diff tuples.
 */
diff_match_patch.prototype.diff_main = function(text1, text2, opt_checklines) {
  // Check for equality (speedup)
  if (text1 == text2) {
    return [[DIFF_EQUAL, text1]];
  }

  if (typeof opt_checklines == 'undefined') {
    opt_checklines = true;
  }
  var checklines = opt_checklines;

  // Trim off common prefix (speedup)
  var commonlength = this.diff_commonPrefix(text1, text2);
  var commonprefix = text1.substring(0, commonlength);
  text1 = text1.substring(commonlength);
  text2 = text2.substring(commonlength);

  // Trim off common suffix (speedup)
  commonlength = this.diff_commonSuffix(text1, text2);
  var commonsuffix = text1.substring(text1.length - commonlength);
  text1 = text1.substring(0, text1.length - commonlength);
  text2 = text2.substring(0, text2.length - commonlength);

  // Compute the diff on the middle block
  var diffs = this.diff_compute(text1, text2, checklines);

  // Restore the prefix and suffix
  if (commonprefix) {
    diffs.unshift([DIFF_EQUAL, commonprefix]);
  }
  if (commonsuffix) {
    diffs.push([DIFF_EQUAL, commonsuffix]);
  }
  this.diff_cleanupMerge(diffs);
  return diffs;
};


/**
 * Find the differences between two texts.  Assumes that the texts do not
 * have any common prefix or suffix.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @param {boolean} checklines Speedup flag.  If false, then don't run a
 *     line-level diff first to identify the changed areas.
 *     If true, then run a faster, slightly less optimal diff
 * @return {Array.<Array.<*>>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_compute = function(text1, text2, checklines) {
  var diffs;

  if (!text1) {
    // Just add some text (speedup)
    return [[DIFF_INSERT, text2]];
  }

  if (!text2) {
    // Just delete some text (speedup)
    return [[DIFF_DELETE, text1]];
  }

  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  var i = longtext.indexOf(shorttext);
  if (i != -1) {
    // Shorter text is inside the longer text (speedup)
    diffs = [[DIFF_INSERT, longtext.substring(0, i)],
             [DIFF_EQUAL, shorttext],
             [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
    // Swap insertions for deletions if diff is reversed.
    if (text1.length > text2.length) {
      diffs[0][0] = diffs[2][0] = DIFF_DELETE;
    }
    return diffs;
  }
  longtext = shorttext = null;  // Garbage collect

  // Check to see if the problem can be split in two.
  var hm = this.diff_halfMatch(text1, text2);
  if (hm) {
    // A half-match was found, sort out the return data.
    var text1_a = hm[0];
    var text1_b = hm[1];
    var text2_a = hm[2];
    var text2_b = hm[3];
    var mid_common = hm[4];
    // Send both pairs off for separate processing.
    var diffs_a = this.diff_main(text1_a, text2_a, checklines);
    var diffs_b = this.diff_main(text1_b, text2_b, checklines);
    // Merge the results.
    return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
  }

  // Perform a real diff.
  if (checklines && (text1.length < 100 || text2.length < 100)) {
    // Too trivial for the overhead.
    checklines = false;
  }
  var linearray;
  if (checklines) {
    // Scan the text on a line-by-line basis first.
    var a = this.diff_linesToChars(text1, text2);
    text1 = a[0];
    text2 = a[1];
    linearray = a[2];
  }
  diffs = this.diff_map(text1, text2);
  if (!diffs) {
    // No acceptable result.
    diffs = [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  }
  if (checklines) {
    // Convert the diff back to original text.
    this.diff_charsToLines(diffs, linearray);
    // Eliminate freak matches (e.g. blank lines)
    this.diff_cleanupSemantic(diffs);

    // Rediff any replacement blocks, this time character-by-character.
    // Add a dummy entry at the end.
    diffs.push([DIFF_EQUAL, '']);
    var pointer = 0;
    var count_delete = 0;
    var count_insert = 0;
    var text_delete = '';
    var text_insert = '';
    while (pointer < diffs.length) {
      switch (diffs[pointer][0]) {
        case DIFF_INSERT:
          count_insert++;
          text_insert += diffs[pointer][1];
          break;
        case DIFF_DELETE:
          count_delete++;
          text_delete += diffs[pointer][1];
          break;
        case DIFF_EQUAL:
          // Upon reaching an equality, check for prior redundancies.
          if (count_delete >= 1 && count_insert >= 1) {
            // Delete the offending records and add the merged ones.
            var a = this.diff_main(text_delete, text_insert, false);
            diffs.splice(pointer - count_delete - count_insert,
                         count_delete + count_insert);
            pointer = pointer - count_delete - count_insert;
            for (var j = a.length - 1; j >= 0; j--) {
              diffs.splice(pointer, 0, a[j]);
            }
            pointer = pointer + a.length;
          }
          count_insert = 0;
          count_delete = 0;
          text_delete = '';
          text_insert = '';
          break;
      }
     pointer++;
    }
    diffs.pop();  // Remove the dummy entry at the end.
  }
  return diffs;
};


/**
 * Split two texts into an array of strings.  Reduce the texts to a string of
 * hashes where each Unicode character represents one line.
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string|Array.<string>>} Three element Array, containing the
 *     encoded text1, the encoded text2 and the array of unique strings.  The
 *     zeroth element of the array of unique strings is intentionally blank.
 * @private
 */
diff_match_patch.prototype.diff_linesToChars = function(text1, text2) {
  var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'
  var lineHash = {};   // e.g. lineHash['Hello\n'] == 4

  // '\x00' is a valid character, but various debuggers don't like it.
  // So we'll insert a junk entry to avoid generating a null character.
  lineArray[0] = '';

  /**
   * Split a text into an array of strings.  Reduce the texts to a string of
   * hashes where each Unicode character represents one line.
   * Modifies linearray and linehash through being a closure.
   * @param {string} text String to encode
   * @return {string} Encoded string
   * @private
   */
  function diff_linesToCharsMunge(text) {
    var chars = '';
    // Walk the text, pulling out a substring for each line.
    // text.split('\n') would would temporarily double our memory footprint.
    // Modifying text would create many large strings to garbage collect.
    var lineStart = 0;
    var lineEnd = -1;
    // Keeping our own length variable is faster than looking it up.
    var lineArrayLength = lineArray.length;
    while (lineEnd < text.length - 1) {
      lineEnd = text.indexOf('\n', lineStart);
      if (lineEnd == -1) {
        lineEnd = text.length - 1;
      }
      var line = text.substring(lineStart, lineEnd + 1);
      lineStart = lineEnd + 1;

      if (lineHash.hasOwnProperty ? lineHash.hasOwnProperty(line) :
          (lineHash[line] !== undefined)) {
        chars += String.fromCharCode(lineHash[line]);
      } else {
        chars += String.fromCharCode(lineArrayLength);
        lineHash[line] = lineArrayLength;
        lineArray[lineArrayLength++] = line;
      }
    }
    return chars;
  }

  var chars1 = diff_linesToCharsMunge(text1);
  var chars2 = diff_linesToCharsMunge(text2);
  return [chars1, chars2, lineArray];
};


/**
 * Rehydrate the text in a diff from a string of line hashes to real lines of
 * text.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @param {Array.<string>} lineArray Array of unique strings.
 * @private
 */
diff_match_patch.prototype.diff_charsToLines = function(diffs, lineArray) {
  for (var x = 0; x < diffs.length; x++) {
    var chars = diffs[x][1];
    var text = [];
    for (var y = 0; y < chars.length; y++) {
      text[y] = lineArray[chars.charCodeAt(y)];
    }
    diffs[x][1] = text.join('');
  }
};


/**
 * Explore the intersection points between the two texts.
 * @param {string} text1 Old string to be diffed.
 * @param {string} text2 New string to be diffed.
 * @return {Array.<Array.<*>>?} Array of diff tuples or null if no diff
 *     available.
 * @private
 */
diff_match_patch.prototype.diff_map = function(text1, text2) {
  // Don't run for too long.
  var ms_end = (new Date()).getTime() + this.Diff_Timeout * 1000;
  var max_d = text1.length + text2.length - 1;
  var doubleEnd = this.Diff_DualThreshold * 2 < max_d;
  var v_map1 = [];
  var v_map2 = [];
  var v1 = {};
  var v2 = {};
  v1[1] = 0;
  v2[1] = 0;
  var x, y;
  var footstep;  // Used to track overlapping paths.
  var footsteps = {};
  var done = false;
  // Safari 1.x doesn't have hasOwnProperty
  var hasOwnProperty = !!(footsteps.hasOwnProperty);
  // If the total number of characters is odd, then the front path will collide
  // with the reverse path.
  var front = (text1.length + text2.length) % 2;
  for (var d = 0; d < max_d; d++) {
    // Bail out if timeout reached.
    if (this.Diff_Timeout > 0 && (new Date()).getTime() > ms_end) {
      return null;
    }

    // Walk the front path one step.
    v_map1[d] = {};
    for (var k = -d; k <= d; k += 2) {
      if (k == -d || k != d && v1[k - 1] < v1[k + 1]) {
        x = v1[k + 1];
      } else {
        x = v1[k - 1] + 1;
      }
      y = x - k;
      if (doubleEnd) {
        footstep = x + ',' + y;
        if (front && (hasOwnProperty ? footsteps.hasOwnProperty(footstep) :
                      (footsteps[footstep] !== undefined))) {
          done = true;
        }
        if (!front) {
          footsteps[footstep] = d;
        }
      }
      while (!done && x < text1.length && y < text2.length &&
             text1.charAt(x) == text2.charAt(y)) {
        x++;
        y++;
        if (doubleEnd) {
          footstep = x + ',' + y;
          if (front && (hasOwnProperty ? footsteps.hasOwnProperty(footstep) :
              (footsteps[footstep] !== undefined))) {
            done = true;
          }
          if (!front) {
            footsteps[footstep] = d;
          }
        }
      }
      v1[k] = x;
      v_map1[d][x + ',' + y] = true;
      if (x == text1.length && y == text2.length) {
        // Reached the end in single-path mode.
        return this.diff_path1(v_map1, text1, text2);
      } else if (done) {
        // Front path ran over reverse path.
        v_map2 = v_map2.slice(0, footsteps[footstep] + 1);
        var a = this.diff_path1(v_map1, text1.substring(0, x),
                                text2.substring(0, y));
        return a.concat(this.diff_path2(v_map2, text1.substring(x),
                                        text2.substring(y)));
      }
    }

    if (doubleEnd) {
      // Walk the reverse path one step.
      v_map2[d] = {};
      for (var k = -d; k <= d; k += 2) {
        if (k == -d || k != d && v2[k - 1] < v2[k + 1]) {
          x = v2[k + 1];
        } else {
          x = v2[k - 1] + 1;
        }
        y = x - k;
        footstep = (text1.length - x) + ',' + (text2.length - y);
        if (!front && (hasOwnProperty ? footsteps.hasOwnProperty(footstep) :
                       (footsteps[footstep] !== undefined))) {
          done = true;
        }
        if (front) {
          footsteps[footstep] = d;
        }
        while (!done && x < text1.length && y < text2.length &&
               text1.charAt(text1.length - x - 1) ==
               text2.charAt(text2.length - y - 1)) {
          x++;
          y++;
          footstep = (text1.length - x) + ',' + (text2.length - y);
          if (!front && (hasOwnProperty ? footsteps.hasOwnProperty(footstep) :
                         (footsteps[footstep] !== undefined))) {
            done = true;
          }
          if (front) {
            footsteps[footstep] = d;
          }
        }
        v2[k] = x;
        v_map2[d][x + ',' + y] = true;
        if (done) {
          // Reverse path ran over front path.
          v_map1 = v_map1.slice(0, footsteps[footstep] + 1);
          var a = this.diff_path1(v_map1, text1.substring(0, text1.length - x),
                                  text2.substring(0, text2.length - y));
          return a.concat(this.diff_path2(v_map2,
                          text1.substring(text1.length - x),
                          text2.substring(text2.length - y)));
        }
      }
    }
  }
  // Number of diffs equals number of characters, no commonality at all.
  return null;
};


/**
 * Work from the middle back to the start to determine the path.
 * @param {Array.<Object>} v_map Array of paths.
 * @param {string} text1 Old string fragment to be diffed.
 * @param {string} text2 New string fragment to be diffed.
 * @return {Array.<Array.<*>>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_path1 = function(v_map, text1, text2) {
  var path = [];
  var x = text1.length;
  var y = text2.length;
  /** @type {number?} */
  var last_op = null;
  for (var d = v_map.length - 2; d >= 0; d--) {
    while (1) {
      if (v_map[d].hasOwnProperty ? v_map[d].hasOwnProperty((x - 1) + ',' + y) :
          (v_map[d][(x - 1) + ',' + y] !== undefined)) {
        x--;
        if (last_op === DIFF_DELETE) {
          path[0][1] = text1.charAt(x) + path[0][1];
        } else {
          path.unshift([DIFF_DELETE, text1.charAt(x)]);
        }
        last_op = DIFF_DELETE;
        break;
      } else if (v_map[d].hasOwnProperty ?
                 v_map[d].hasOwnProperty(x + ',' + (y - 1)) :
                 (v_map[d][x + ',' + (y - 1)] !== undefined)) {
        y--;
        if (last_op === DIFF_INSERT) {
          path[0][1] = text2.charAt(y) + path[0][1];
        } else {
          path.unshift([DIFF_INSERT, text2.charAt(y)]);
        }
        last_op = DIFF_INSERT;
        break;
      } else {
        x--;
        y--;
        //if (text1.charAt(x) != text2.charAt(y)) {
        //  throw new Error('No diagonal.  Can\'t happen. (diff_path1)');
        //}
        if (last_op === DIFF_EQUAL) {
          path[0][1] = text1.charAt(x) + path[0][1];
        } else {
          path.unshift([DIFF_EQUAL, text1.charAt(x)]);
        }
        last_op = DIFF_EQUAL;
      }
    }
  }
  return path;
};


/**
 * Work from the middle back to the end to determine the path.
 * @param {Array.<Object>} v_map Array of paths.
 * @param {string} text1 Old string fragment to be diffed.
 * @param {string} text2 New string fragment to be diffed.
 * @return {Array.<Array.<*>>} Array of diff tuples.
 * @private
 */
diff_match_patch.prototype.diff_path2 = function(v_map, text1, text2) {
  var path = [];
  var pathLength = 0;
  var x = text1.length;
  var y = text2.length;
  /** @type {number?} */
  var last_op = null;
  for (var d = v_map.length - 2; d >= 0; d--) {
    while (1) {
      if (v_map[d].hasOwnProperty ? v_map[d].hasOwnProperty((x - 1) + ',' + y) :
          (v_map[d][(x - 1) + ',' + y] !== undefined)) {
        x--;
        if (last_op === DIFF_DELETE) {
          path[pathLength - 1][1] += text1.charAt(text1.length - x - 1);
        } else {
          path[pathLength++] =
              [DIFF_DELETE, text1.charAt(text1.length - x - 1)];
        }
        last_op = DIFF_DELETE;
        break;
      } else if (v_map[d].hasOwnProperty ?
                 v_map[d].hasOwnProperty(x + ',' + (y - 1)) :
                 (v_map[d][x + ',' + (y - 1)] !== undefined)) {
        y--;
        if (last_op === DIFF_INSERT) {
          path[pathLength - 1][1] += text2.charAt(text2.length - y - 1);
        } else {
          path[pathLength++] =
              [DIFF_INSERT, text2.charAt(text2.length - y - 1)];
        }
        last_op = DIFF_INSERT;
        break;
      } else {
        x--;
        y--;
        //if (text1.charAt(text1.length - x - 1) !=
        //    text2.charAt(text2.length - y - 1)) {
        //  throw new Error('No diagonal.  Can\'t happen. (diff_path2)');
        //}
        if (last_op === DIFF_EQUAL) {
          path[pathLength - 1][1] += text1.charAt(text1.length - x - 1);
        } else {
          path[pathLength++] =
              [DIFF_EQUAL, text1.charAt(text1.length - x - 1)];
        }
        last_op = DIFF_EQUAL;
      }
    }
  }
  return path;
};


/**
 * Determine the common prefix of two strings
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the start of each
 *     string.
 */
diff_match_patch.prototype.diff_commonPrefix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charCodeAt(0) !== text2.charCodeAt(0)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerstart = 0;
  while (pointermin < pointermid) {
    if (text1.substring(pointerstart, pointermid) ==
        text2.substring(pointerstart, pointermid)) {
      pointermin = pointermid;
      pointerstart = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Determine the common suffix of two strings
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {number} The number of characters common to the end of each string.
 */
diff_match_patch.prototype.diff_commonSuffix = function(text1, text2) {
  // Quick check for common null cases.
  if (!text1 || !text2 || text1.charCodeAt(text1.length - 1) !==
                          text2.charCodeAt(text2.length - 1)) {
    return 0;
  }
  // Binary search.
  // Performance analysis: http://neil.fraser.name/news/2007/10/09/
  var pointermin = 0;
  var pointermax = Math.min(text1.length, text2.length);
  var pointermid = pointermax;
  var pointerend = 0;
  while (pointermin < pointermid) {
    if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
        text2.substring(text2.length - pointermid, text2.length - pointerend)) {
      pointermin = pointermid;
      pointerend = pointermin;
    } else {
      pointermax = pointermid;
    }
    pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
  }
  return pointermid;
};


/**
 * Do the two texts share a substring which is at least half the length of the
 * longer text?
 * @param {string} text1 First string.
 * @param {string} text2 Second string.
 * @return {Array.<string>?} Five element Array, containing the prefix of
 *     text1, the suffix of text1, the prefix of text2, the suffix of
 *     text2 and the common middle.  Or null if there was no match.
 */
diff_match_patch.prototype.diff_halfMatch = function(text1, text2) {
  var longtext = text1.length > text2.length ? text1 : text2;
  var shorttext = text1.length > text2.length ? text2 : text1;
  if (longtext.length < 10 || shorttext.length < 1) {
    return null;  // Pointless.
  }
  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Does a substring of shorttext exist within longtext such that the substring
   * is at least half the length of longtext?
   * Closure, but does not reference any external variables.
   * @param {string} longtext Longer string.
   * @param {string} shorttext Shorter string.
   * @param {number} i Start index of quarter length substring within longtext
   * @return {Array.<string>?} Five element Array, containing the prefix of
   *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
   *     of shorttext and the common middle.  Or null if there was no match.
   * @private
   */
  function diff_halfMatchI(longtext, shorttext, i) {
    // Start with a 1/4 length substring at position i as a seed.
    var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
    var j = -1;
    var best_common = '';
    var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
    while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
      var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),
                                               shorttext.substring(j));
      var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),
                                               shorttext.substring(0, j));
      if (best_common.length < suffixLength + prefixLength) {
        best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
        best_longtext_a = longtext.substring(0, i - suffixLength);
        best_longtext_b = longtext.substring(i + prefixLength);
        best_shorttext_a = shorttext.substring(0, j - suffixLength);
        best_shorttext_b = shorttext.substring(j + prefixLength);
      }
    }
    if (best_common.length >= longtext.length / 2) {
      return [best_longtext_a, best_longtext_b,
              best_shorttext_a, best_shorttext_b, best_common];
    } else {
      return null;
    }
  }

  // First check if the second quarter is the seed for a half-match.
  var hm1 = diff_halfMatchI(longtext, shorttext,
                            Math.ceil(longtext.length / 4));
  // Check again based on the third quarter.
  var hm2 = diff_halfMatchI(longtext, shorttext,
                            Math.ceil(longtext.length / 2));
  var hm;
  if (!hm1 && !hm2) {
    return null;
  } else if (!hm2) {
    hm = hm1;
  } else if (!hm1) {
    hm = hm2;
  } else {
    // Both matched.  Select the longest.
    hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
  }

  // A half-match was found, sort out the return data.
  var text1_a, text1_b, text2_a, text2_b;
  if (text1.length > text2.length) {
    text1_a = hm[0];
    text1_b = hm[1];
    text2_a = hm[2];
    text2_b = hm[3];
  } else {
    text2_a = hm[0];
    text2_b = hm[1];
    text1_a = hm[2];
    text1_b = hm[3];
  }
  var mid_common = hm[4];
  return [text1_a, text1_b, text2_a, text2_b, mid_common];
};


/**
 * Reduce the number of edits by eliminating semantically trivial equalities.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemantic = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  var lastequality = null;  // Always equal to equalities[equalitiesLength-1][1]
  var pointer = 0;  // Index of current position.
  // Number of characters that changed prior to the equality.
  var length_changes1 = 0;
  // Number of characters that changed after the equality.
  var length_changes2 = 0;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // equality found
      equalities[equalitiesLength++] = pointer;
      length_changes1 = length_changes2;
      length_changes2 = 0;
      lastequality = diffs[pointer][1];
    } else {  // an insertion or deletion
      length_changes2 += diffs[pointer][1].length;
      if (lastequality !== null && (lastequality.length <= length_changes1) &&
          (lastequality.length <= length_changes2)) {
        // Duplicate record
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        // Throw away the equality we just deleted.
        equalitiesLength--;
        // Throw away the previous equality (it needs to be reevaluated).
        equalitiesLength--;
        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
        length_changes1 = 0;  // Reset the counters.
        length_changes2 = 0;
        lastequality = null;
        changes = true;
      }
    }
    pointer++;
  }
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
  this.diff_cleanupSemanticLossless(diffs);
};


/**
 * Look for single edits surrounded on both sides by equalities
 * which can be shifted sideways to align the edit to a word boundary.
 * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupSemanticLossless = function(diffs) {
  // Define some regex patterns for matching boundaries. 
  var punctuation = /[^a-zA-Z0-9]/;
  var whitespace = /\s/;
  var linebreak = /[\r\n]/;
  var blanklineEnd = /\n\r?\n$/;
  var blanklineStart = /^\r?\n\r?\n/;

  /**
   * Given two strings, compute a score representing whether the internal
   * boundary falls on logical boundaries.
   * Scores range from 5 (best) to 0 (worst).
   * Closure, makes reference to regex patterns defined above.
   * @param {string} one First string
   * @param {string} two Second string
   * @return {number} The score.
   */
  function diff_cleanupSemanticScore(one, two) {
    if (!one || !two) {
      // Edges are the best.
      return 5;
    }

    // Each port of this function behaves slightly differently due to
    // subtle differences in each language's definition of things like
    // 'whitespace'.  Since this function's purpose is largely cosmetic,
    // the choice has been made to use each language's native features
    // rather than force total conformity.
    var score = 0;
    // One point for non-alphanumeric.
    if (one.charAt(one.length - 1).match(punctuation) ||
        two.charAt(0).match(punctuation)) {
      score++;
      // Two points for whitespace.
      if (one.charAt(one.length - 1).match(whitespace) ||
          two.charAt(0).match(whitespace)) {
        score++;
        // Three points for line breaks.
        if (one.charAt(one.length - 1).match(linebreak) ||
            two.charAt(0).match(linebreak)) {
          score++;
          // Four points for blank lines.
          if (one.match(blanklineEnd) || two.match(blanklineStart)) {
            score++;
          }
        }
      }
    }
    return score;
  }

  var pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      var equality1 = diffs[pointer - 1][1];
      var edit = diffs[pointer][1];
      var equality2 = diffs[pointer + 1][1];

      // First, shift the edit as far left as possible.
      var commonOffset = this.diff_commonSuffix(equality1, edit);
      if (commonOffset) {
        var commonString = edit.substring(edit.length - commonOffset);
        equality1 = equality1.substring(0, equality1.length - commonOffset);
        edit = commonString + edit.substring(0, edit.length - commonOffset);
        equality2 = commonString + equality2;
      }

      // Second, step character by character right, looking for the best fit.
      var bestEquality1 = equality1;
      var bestEdit = edit;
      var bestEquality2 = equality2;
      var bestScore = diff_cleanupSemanticScore(equality1, edit) +
          diff_cleanupSemanticScore(edit, equality2);
      while (edit.charAt(0) === equality2.charAt(0)) {
        equality1 += edit.charAt(0);
        edit = edit.substring(1) + equality2.charAt(0);
        equality2 = equality2.substring(1);
        var score = diff_cleanupSemanticScore(equality1, edit) +
            diff_cleanupSemanticScore(edit, equality2);
        // The >= encourages trailing rather than leading whitespace on edits.
        if (score >= bestScore) {
          bestScore = score;
          bestEquality1 = equality1;
          bestEdit = edit;
          bestEquality2 = equality2;
        }
      }

      if (diffs[pointer - 1][1] != bestEquality1) {
        // We have an improvement, save it back to the diff.
        if (bestEquality1) {
          diffs[pointer - 1][1] = bestEquality1;
        } else {
          diffs.splice(pointer - 1, 1);
          pointer--;
        }
        diffs[pointer][1] = bestEdit;
        if (bestEquality2) {
          diffs[pointer + 1][1] = bestEquality2;
        } else {
          diffs.splice(pointer + 1, 1);
          pointer--;
        }
      }
    }
    pointer++;
  }
};


/**
 * Reduce the number of edits by eliminating operationally trivial equalities.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupEfficiency = function(diffs) {
  var changes = false;
  var equalities = [];  // Stack of indices where equalities are found.
  var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
  var lastequality = '';  // Always equal to equalities[equalitiesLength-1][1]
  var pointer = 0;  // Index of current position.
  // Is there an insertion operation before the last equality.
  var pre_ins = false;
  // Is there a deletion operation before the last equality.
  var pre_del = false;
  // Is there an insertion operation after the last equality.
  var post_ins = false;
  // Is there a deletion operation after the last equality.
  var post_del = false;
  while (pointer < diffs.length) {
    if (diffs[pointer][0] == DIFF_EQUAL) {  // equality found
      if (diffs[pointer][1].length < this.Diff_EditCost &&
          (post_ins || post_del)) {
        // Candidate found.
        equalities[equalitiesLength++] = pointer;
        pre_ins = post_ins;
        pre_del = post_del;
        lastequality = diffs[pointer][1];
      } else {
        // Not a candidate, and can never become one.
        equalitiesLength = 0;
        lastequality = '';
      }
      post_ins = post_del = false;
    } else {  // an insertion or deletion
      if (diffs[pointer][0] == DIFF_DELETE) {
        post_del = true;
      } else {
        post_ins = true;
      }
      /*
       * Five types to be split:
       * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
       * <ins>A</ins>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<ins>C</ins>
       * <ins>A</del>X<ins>C</ins><del>D</del>
       * <ins>A</ins><del>B</del>X<del>C</del>
       */
      if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||
                           ((lastequality.length < this.Diff_EditCost / 2) &&
                            (pre_ins + pre_del + post_ins + post_del) == 3))) {
        // Duplicate record
        diffs.splice(equalities[equalitiesLength - 1], 0,
                     [DIFF_DELETE, lastequality]);
        // Change second copy to insert.
        diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
        equalitiesLength--;  // Throw away the equality we just deleted;
        lastequality = '';
        if (pre_ins && pre_del) {
          // No changes made which could affect previous entry, keep going.
          post_ins = post_del = true;
          equalitiesLength = 0;
        } else {
          equalitiesLength--;  // Throw away the previous equality;
          pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
          post_ins = post_del = false;
        }
        changes = true;
      }
    }
    pointer++;
  }

  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * Reorder and merge like edit sections.  Merge equalities.
 * Any edit section can move as long as it doesn't cross an equality.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 */
diff_match_patch.prototype.diff_cleanupMerge = function(diffs) {
  diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
  var pointer = 0;
  var count_delete = 0;
  var count_insert = 0;
  var text_delete = '';
  var text_insert = '';
  var commonlength;
  while (pointer < diffs.length) {
    switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        // Upon reaching an equality, check for prior redundancies.
        if (count_delete !== 0 || count_insert !== 0) {
          if (count_delete !== 0 && count_insert !== 0) {
            // Factor out any common prefixies.
            commonlength = this.diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                    text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            // Factor out any common suffixies.
            commonlength = this.diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                  commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                  commonlength);
            }
          }
          // Delete the offending records and add the merged ones.
          if (count_delete === 0) {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                count_delete + count_insert, [DIFF_DELETE, text_delete],
                [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
                    (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          // Merge this equality with the previous one.
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
    }
  }
  if (diffs[diffs.length - 1][1] === '') {
    diffs.pop();  // Remove the dummy entry at the end.
  }

  // Second pass: look for single edits surrounded on both sides by equalities
  // which can be shifted sideways to eliminate an equality.
  // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
  var changes = false;
  pointer = 1;
  // Intentionally ignore the first and last element (don't need checking).
  while (pointer < diffs.length - 1) {
    if (diffs[pointer - 1][0] == DIFF_EQUAL &&
        diffs[pointer + 1][0] == DIFF_EQUAL) {
      // This is a single edit surrounded by equalities.
      if (diffs[pointer][1].substring(diffs[pointer][1].length -
          diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
        // Shift the edit over the previous equality.
        diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
        diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
        diffs.splice(pointer - 1, 1);
        changes = true;
      } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
          diffs[pointer + 1][1]) {
        // Shift the edit over the next equality.
        diffs[pointer - 1][1] += diffs[pointer + 1][1];
        diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
        diffs.splice(pointer + 1, 1);
        changes = true;
      }
    }
    pointer++;
  }
  // If shifts were made, the diff needs reordering and another shift sweep.
  if (changes) {
    this.diff_cleanupMerge(diffs);
  }
};


/**
 * loc is a location in text1, compute and return the equivalent location in
 * text2.
 * e.g. 'The cat' vs 'The big cat', 1->1, 5->8
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @param {number} loc Location within text1.
 * @return {number} Location within text2.
 */
diff_match_patch.prototype.diff_xIndex = function(diffs, loc) {
  var chars1 = 0;
  var chars2 = 0;
  var last_chars1 = 0;
  var last_chars2 = 0;
  var x;
  for (x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.
      chars1 += diffs[x][1].length;
    }
    if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.
      chars2 += diffs[x][1].length;
    }
    if (chars1 > loc) {  // Overshot the location.
      break;
    }
    last_chars1 = chars1;
    last_chars2 = chars2;
  }
  // Was the location was deleted?
  if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
    return last_chars2;
  }
  // Add the remaining character length.
  return last_chars2 + (loc - last_chars1);
};


/**
 * Convert a diff array into a pretty HTML report.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @return {string} HTML representation.
 */
diff_match_patch.prototype.diff_prettyHtml = function(diffs) {
  var html = [];
  var i = 0;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/\n/g, '&para;<BR>');
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<INS STYLE="background:#E6FFE6;" TITLE="i=' + i + '">' +
                text + '</INS>';
        break;
      case DIFF_DELETE:
        html[x] = '<DEL STYLE="background:#FFE6E6;" TITLE="i=' + i + '">' +
                text + '</DEL>';
        break;
      case DIFF_EQUAL:
        html[x] = '<SPAN TITLE="i=' + i + '">' + text + '</SPAN>';
        break;
    }
    if (op !== DIFF_DELETE) {
      i += data.length;
    }
  }
  return html.join('');
};


/**
 * Compute and return the source text (all equalities and deletions).
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @return {string} Source text.
 */
diff_match_patch.prototype.diff_text1 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_INSERT) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Compute and return the destination text (all equalities and insertions).
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @return {string} Destination text.
 */
diff_match_patch.prototype.diff_text2 = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    if (diffs[x][0] !== DIFF_DELETE) {
      text[x] = diffs[x][1];
    }
  }
  return text.join('');
};


/**
 * Crush the diff into an encoded string which describes the operations
 * required to transform text1 into text2.
 * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.
 * Operations are tab-separated.  Inserted text is escaped using %xx notation.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples.
 * @return {string} Delta text.
 */
diff_match_patch.prototype.diff_toDelta = function(diffs) {
  var text = [];
  for (var x = 0; x < diffs.length; x++) {
    switch (diffs[x][0]) {
      case DIFF_INSERT:
        text[x] = '+' + encodeURI(diffs[x][1]);
        break;
      case DIFF_DELETE:
        text[x] = '-' + diffs[x][1].length;
        break;
      case DIFF_EQUAL:
        text[x] = '=' + diffs[x][1].length;
        break;
    }
  }
  // Opera doesn't know how to encode char 0.
  return text.join('\t').replace(/\x00/g, '%00').replace(/%20/g, ' ');
};


/**
 * Given the original text1, and an encoded string which describes the
 * operations required to transform text1 into text2, compute the full diff.
 * @param {string} text1 Source string for the diff.
 * @param {string} delta Delta text.
 * @return {Array.<Array.<*>>} Array of diff tuples.
 * @throws {Error} If invalid input.
 */
diff_match_patch.prototype.diff_fromDelta = function(text1, delta) {
  var diffs = [];
  var diffsLength = 0;  // Keeping our own length var is faster in JS.
  var pointer = 0;  // Cursor in text1
  // Opera doesn't know how to decode char 0.
  delta = delta.replace(/%00/g, '\0');
  var tokens = delta.split(/\t/g);
  for (var x = 0; x < tokens.length; x++) {
    // Each token begins with a one character parameter which specifies the
    // operation of this token (delete, insert, equality).
    var param = tokens[x].substring(1);
    switch (tokens[x].charAt(0)) {
      case '+':
        try {
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];
        } catch (ex) {
          // Malformed URI sequence.
          throw new Error('Illegal escape in diff_fromDelta: ' + param);
        }
        break;
      case '-':
        // Fall through.
      case '=':
        var n = parseInt(param, 10);
        if (isNaN(n) || n < 0) {
          throw new Error('Invalid number in diff_fromDelta: ' + param);
        }
        var text = text1.substring(pointer, pointer += n);
        if (tokens[x].charAt(0) == '=') {
          diffs[diffsLength++] = [DIFF_EQUAL, text];
        } else {
          diffs[diffsLength++] = [DIFF_DELETE, text];
        }
        break;
      default:
        // Blank tokens are ok (from a trailing \t).
        // Anything else is an error.
        if (tokens[x]) {
          throw new Error('Invalid diff operation in diff_fromDelta: ' +
                          tokens[x]);
        }
    }
  }
  if (pointer != text1.length) {
    throw new Error('Delta length (' + pointer +
        ') does not equal source text length (' + text1.length + ').');
  }
  return diffs;
};


//  MATCH FUNCTIONS


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc'.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number?} Best match index or null.
 */
diff_match_patch.prototype.match_main = function(text, pattern, loc) {
  loc = Math.max(0, Math.min(loc, text.length - pattern.length));
  if (text == pattern) {
    // Shortcut (potentially not guaranteed by the algorithm)
    return 0;
  } else if (text.length === 0) {
    // Nothing to match.
    return null;
  } else if (text.substring(loc, loc + pattern.length) == pattern) {
    // Perfect match at the perfect spot!  (Includes case of null pattern)
    return loc;
  } else {
    // Do a fuzzy compare.
    return this.match_bitap(text, pattern, loc);
  }
};


/**
 * Locate the best instance of 'pattern' in 'text' near 'loc' using the
 * Bitap algorithm.
 * @param {string} text The text to search.
 * @param {string} pattern The pattern to search for.
 * @param {number} loc The location to search around.
 * @return {number?} Best match index or null.
 * @private
 */
diff_match_patch.prototype.match_bitap = function(text, pattern, loc) {
  if (pattern.length > this.Match_MaxBits) {
    throw new Error('Pattern too long for this browser.');
  }

  // Initialise the alphabet.
  var s = this.match_alphabet(pattern);

  var score_text_length = text.length;
  // Coerce the text length between reasonable maximums and minimums.
  score_text_length = Math.max(score_text_length, this.Match_MinLength);
  score_text_length = Math.min(score_text_length, this.Match_MaxLength);

  var dmp = this;  // 'this' becomes 'window' in a closure.

  /**
   * Compute and return the score for a match with e errors and x location.
   * Accesses loc, score_text_length and pattern through being a closure.
   * @param {number} e Number of errors in match
   * @param {number} x Location of match
   * @return {number} Overall score for match
   * @private
   */
  function match_bitapScore(e, x) {
    var d = Math.abs(loc - x);
    return (e / pattern.length / dmp.Match_Balance) +
           (d / score_text_length / (1.0 - dmp.Match_Balance));
  }

  // Highest score beyond which we give up.
  var score_threshold = this.Match_Threshold;
  // Is there a nearby exact match? (speedup)
  var best_loc = text.indexOf(pattern, loc);
  if (best_loc != -1) {
    score_threshold = Math.min(match_bitapScore(0, best_loc), score_threshold);
  }
  // What about in the other direction? (speedup)
  best_loc = text.lastIndexOf(pattern, loc + pattern.length);
  if (best_loc != -1) {
    score_threshold = Math.min(match_bitapScore(0, best_loc), score_threshold);
  }

  // Initialise the bit arrays.
  var matchmask = 1 << (pattern.length - 1);
  best_loc = null;

  var bin_min, bin_mid;
  var bin_max = Math.max(loc + loc, text.length);
  var last_rd;
  for (var d = 0; d < pattern.length; d++) {
    // Scan for the best match; each iteration allows for one more error.
    var rd = Array(text.length);

    // Run a binary search to determine how far from 'loc' we can stray at this
    // error level.
    bin_min = loc;
    bin_mid = bin_max;
    while (bin_min < bin_mid) {
      if (match_bitapScore(d, bin_mid) < score_threshold) {
        bin_min = bin_mid;
      } else {
        bin_max = bin_mid;
      }
      bin_mid = Math.floor((bin_max - bin_min) / 2 + bin_min);
    }
    // Use the result from this iteration as the maximum for the next.
    bin_max = bin_mid;
    var start = Math.max(0, loc - (bin_mid - loc) - 1);
    var finish = Math.min(text.length - 1, pattern.length + bin_mid);

    if (text.charAt(finish) == pattern.charAt(pattern.length - 1)) {
      rd[finish] = (1 << (d + 1)) - 1;
    } else {
      rd[finish] = (1 << d) - 1;
    }
    for (var j = finish - 1; j >= start; j--) {
      // The alphabet (s) is a sparse hash, so the following lines generate
      // warnings.
      if (d === 0) {  // First pass: exact match.
        rd[j] = ((rd[j + 1] << 1) | 1) & s[text.charAt(j)];
      } else {  // Subsequent passes: fuzzy match.
        rd[j] = ((rd[j + 1] << 1) | 1) & s[text.charAt(j)] |
                ((last_rd[j + 1] << 1) | 1) | ((last_rd[j] << 1) | 1) |
                last_rd[j + 1];
      }
      if (rd[j] & matchmask) {
        var score = match_bitapScore(d, j);
        // This match will almost certainly be better than any existing match.
        // But check anyway.
        if (score <= score_threshold) {
          // Told you so.
          score_threshold = score;
          best_loc = j;
          if (j > loc) {
            // When passing loc, don't exceed our current distance from loc.
            start = Math.max(0, loc - (j - loc));
          } else {
            // Already passed loc, downhill from here on in.
            break;
          }
        }
      }
    }
    // No hope for a (better) match at greater error levels.
    if (match_bitapScore(d + 1, loc) > score_threshold) {
      break;
    }
    last_rd = rd;
  }
  return best_loc;
};


/**
 * Initialise the alphabet for the Bitap algorithm.
 * @param {string} pattern The text to encode.
 * @return {Object} Hash of character locations.
 * @private
 */
diff_match_patch.prototype.match_alphabet = function(pattern) {
  var s = {};
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] = 0;
  }
  for (var i = 0; i < pattern.length; i++) {
    s[pattern.charAt(i)] |= 1 << (pattern.length - i - 1);
  }
  return s;
};


//  PATCH FUNCTIONS


/**
 * Increase the context until it is unique,
 * but don't let the pattern expand beyond Match_MaxBits.
 * @param {patch_obj} patch The patch to grow.
 * @param {string} text Source text.
 * @private
 */
diff_match_patch.prototype.patch_addContext = function(patch, text) {
  var pattern = text.substring(patch.start2, patch.start2 + patch.length1);
  var padding = 0;
  while (text.indexOf(pattern) != text.lastIndexOf(pattern) &&
         pattern.length < this.Match_MaxBits - this.Patch_Margin
         - this.Patch_Margin) {
    padding += this.Patch_Margin;
    pattern = text.substring(patch.start2 - padding,
                             patch.start2 + patch.length1 + padding);
  }
  // Add one chunk for good luck.
  padding += this.Patch_Margin;
  // Add the prefix.
  var prefix = text.substring(patch.start2 - padding, patch.start2);
  if (prefix !== '') {
    patch.diffs.unshift([DIFF_EQUAL, prefix]);
  }
  // Add the suffix.
  var suffix = text.substring(patch.start2 + patch.length1,
                              patch.start2 + patch.length1 + padding);
  if (suffix !== '') {
    patch.diffs.push([DIFF_EQUAL, suffix]);
  }

  // Roll back the start points.
  patch.start1 -= prefix.length;
  patch.start2 -= prefix.length;
  // Extend the lengths.
  patch.length1 += prefix.length + suffix.length;
  patch.length2 += prefix.length + suffix.length;
};


/**
 * Compute a list of patches to turn text1 into text2.
 * Use diffs if provided, otherwise compute it ourselves.
 * There are four ways to call this function, depending on what data is
 * available to the caller:
 * Method 1:
 * a = text1, b = text2
 * Method 2:
 * a = diffs
 * Method 3 (optimal):
 * a = text1, b = diffs
 * Method 4 (deprecated, use method 3):
 * a = text1, b = text2, c = diffs
 *
 * @param {string|Array.<Array.<*>>} a text1 (methods 1,3,4) or Array of diff
 * tuples for text1 to text2 (method 2).
 * @param {string|Array.<Array.<*>>} opt_b text2 (methods 1,4) or Array of diff
 * tuples for text1 to text2 (method 3) or undefined (method 2).
 * @param {string|Array.<Array.<*>>} opt_c Array of diff tuples for text1 to
 * text2 (method 4) or undefined (methods 1,2,3).
 * @return {Array.<Array.<*>>} Array of patch objects.
 */
diff_match_patch.prototype.patch_make = function(a, opt_b, opt_c) {
  var text1, diffs;
  if (typeof a == 'string' && typeof opt_b == 'string' &&
      typeof opt_c == 'undefined') {
    // Method 1: text1, text2
    // Compute diffs from text1 and text2.
    text1 = a;
    diffs = this.diff_main(text1, opt_b, true);
    if (diffs.length > 2) {
      this.diff_cleanupSemantic(diffs);
      this.diff_cleanupEfficiency(diffs);
    }
  } else if (typeof a == 'object' && typeof opt_b == 'undefined' &&
      typeof opt_c == 'undefined') {
    // Method 2: diffs
    // Compute text1 from diffs.
    diffs = a;
    text1 = this.diff_text1(diffs);
  } else if (typeof a == 'string' && typeof opt_b == 'object' &&
      typeof opt_c == 'undefined') {
    // Method 3: text1, diffs
    text1 = a;
    diffs = opt_b;
  } else if (typeof a == 'string' && typeof opt_b == 'string' &&
      typeof opt_c == 'object') {
    // Method 4: text1, text2, diffs
    // text2 is not used.
    text1 = a;
    diffs = opt_c;
  } else {
    throw new Error('Unknown call format to patch_make.');
  }

  if (diffs.length === 0) {
    return [];  // Get rid of the null case.
  }
  var patches = [];
  var patch = new patch_obj();
  var patchDiffLength = 0;  // Keeping our own length var is faster in JS.
  var char_count1 = 0;  // Number of characters into the text1 string.
  var char_count2 = 0;  // Number of characters into the text2 string.
  // Start with text1 (prepatch_text) and apply the diffs until we arrive at
  // text2 (postpatch_text).  We recreate the patches one by one to determine
  // context info.
  var prepatch_text = text1;
  var postpatch_text = text1;
  for (var x = 0; x < diffs.length; x++) {
    var diff_type = diffs[x][0];
    var diff_text = diffs[x][1];

    if (!patchDiffLength && diff_type !== DIFF_EQUAL) {
      // A new patch starts here.
      patch.start1 = char_count1;
      patch.start2 = char_count2;
    }

    switch (diff_type) {
      case DIFF_INSERT:
        patch.diffs[patchDiffLength++] = diffs[x];
        patch.length2 += diff_text.length;
        postpatch_text = postpatch_text.substring(0, char_count2) + diff_text +
                         postpatch_text.substring(char_count2);
        break;
      case DIFF_DELETE:
        patch.length1 += diff_text.length;
        patch.diffs[patchDiffLength++] = diffs[x];
        postpatch_text = postpatch_text.substring(0, char_count2) +
                         postpatch_text.substring(char_count2 + diff_text.length);
        break;
      case DIFF_EQUAL:
        if (diff_text.length <= 2 * this.Patch_Margin &&
            patchDiffLength && diffs.length != x + 1) {
          // Small equality inside a patch.
          patch.diffs[patchDiffLength++] = diffs[x];
          patch.length1 += diff_text.length;
          patch.length2 += diff_text.length;
        } else if (diff_text.length >= 2 * this.Patch_Margin) {
          // Time for a new patch.
          if (patchDiffLength) {
            this.patch_addContext(patch, prepatch_text);
            patches.push(patch);
            patch = new patch_obj();
            patchDiffLength = 0;
            // Unlike Unidiff, our patch lists have a rolling context.
            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff
            // Update prepatch text & pos to reflect the application of the
            // just completed patch.
            prepatch_text = postpatch_text;
            char_count1 = char_count2;
          }
        }
        break;
    }

    // Update the current character count.
    if (diff_type !== DIFF_INSERT) {
      char_count1 += diff_text.length;
    }
    if (diff_type !== DIFF_DELETE) {
      char_count2 += diff_text.length;
    }
  }
  // Pick up the leftover patch if not empty.
  if (patchDiffLength) {
    this.patch_addContext(patch, prepatch_text);
    patches.push(patch);
  }

  return patches;
};


/**
 * Given an array of patches, return another array that is identical.
 * @param {Array.<patch_obj>} patches Array of patch objects.
 * @return {Array.<patch_obj>} Array of patch objects.
 * @private
 */
diff_match_patch.prototype.patch_deepCopy = function(patches) {
  // Making deep copies is hard in JavaScript.
  var patchesCopy = [];
  for (var x = 0; x < patches.length; x++) {
    var patch = patches[x];
    var patchCopy = new patch_obj();
    patchCopy.diffs = [];
    for (var y = 0; y < patch.diffs.length; y++) {
      patchCopy.diffs[y] = patch.diffs[y].slice();
    }
    patchCopy.start1 = patch.start1;
    patchCopy.start2 = patch.start2;
    patchCopy.length1 = patch.length1;
    patchCopy.length2 = patch.length2;
    patchesCopy[x] = patchCopy;
  }
  return patchesCopy;
};


/**
 * Merge a set of patches onto the text.  Return a patched text, as well
 * as a list of true/false values indicating which patches were applied.
 * @param {Array.<patch_obj>} patches Array of patch objects.
 * @param {string} text Old text.
 * @return {Array.<string|Array.<boolean>>} Two element Array, containing the
 *      new text and an array of boolean values.
 */
diff_match_patch.prototype.patch_apply = function(patches, text) {
  if (patches.length == 0) {
    return [text, []];
  }

  // Deep copy the patches so that no changes are made to originals.
  patches = this.patch_deepCopy(patches);

  var nullPadding = this.patch_addPadding(patches);
  text = nullPadding + text + nullPadding;

  this.patch_splitMax(patches);
  // delta keeps track of the offset between the expected and actual location
  // of the previous patch.  If there are patches expected at positions 10 and
  // 20, but the first patch was found at 12, delta is 2 and the second patch
  // has an effective expected position of 22.
  var delta = 0;
  var results = [];
  for (var x = 0; x < patches.length; x++) {
    var expected_loc = patches[x].start2 + delta;
    var text1 = this.diff_text1(patches[x].diffs);
    var start_loc = this.match_main(text, text1, expected_loc);
    if (start_loc === null) {
      // No match found.  :(
      results[x] = false;
    } else {
      // Found a match.  :)
      results[x] = true;
      delta = start_loc - expected_loc;
      var text2 = text.substring(start_loc, start_loc + text1.length);
      if (text1 == text2) {
        // Perfect match, just shove the replacement text in.
        text = text.substring(0, start_loc) +
               this.diff_text2(patches[x].diffs) +
               text.substring(start_loc + text1.length);
      } else {
        // Imperfect match.  Run a diff to get a framework of equivalent
        // indicies.
        var diffs = this.diff_main(text1, text2, false);
        this.diff_cleanupSemanticLossless(diffs);
        var index1 = 0;
        var index2;
        for (var y = 0; y < patches[x].diffs.length; y++) {
          var mod = patches[x].diffs[y];
          if (mod[0] !== DIFF_EQUAL) {
            index2 = this.diff_xIndex(diffs, index1);
          }
          if (mod[0] === DIFF_INSERT) {  // Insertion
            text = text.substring(0, start_loc + index2) + mod[1] +
                   text.substring(start_loc + index2);
          } else if (mod[0] === DIFF_DELETE) {  // Deletion
            text = text.substring(0, start_loc + index2) +
                   text.substring(start_loc + this.diff_xIndex(diffs,
                       index1 + mod[1].length));
          }
          if (mod[0] !== DIFF_DELETE) {
            index1 += mod[1].length;
          }
        }
      }
    }
  }
  // Strip the padding off.
  text = text.substring(nullPadding.length, text.length - nullPadding.length);
  return [text, results];
};


/**
 * Add some padding on text start and end so that edges can match something.
 * @param {Array.<patch_obj>} patches Array of patch objects.
 * @return {string} The padding string added to each side.
 * @private
 */
diff_match_patch.prototype.patch_addPadding = function(patches) {
  var nullPadding = '';
  for (var x = 0; x < this.Patch_Margin; x++) {
    nullPadding += String.fromCharCode(x);
  }

  // Bump all the patches forward.
  for (var x = 0; x < patches.length; x++) {
    patches[x].start1 += nullPadding.length;
    patches[x].start2 += nullPadding.length;
  }

  // Add some padding on start of first diff.
  var patch = patches[0];
  var diffs = patch.diffs;
  if (diffs.length == 0 || diffs[0][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.unshift([DIFF_EQUAL, nullPadding]);
    patch.start1 -= nullPadding.length;  // Should be 0.
    patch.start2 -= nullPadding.length;  // Should be 0.
    patch.length1 += nullPadding.length;
    patch.length2 += nullPadding.length;
  } else if (nullPadding.length > diffs[0][1].length) {
    // Grow first equality.
    var extraLength = nullPadding.length - diffs[0][1].length;
    diffs[0][1] = nullPadding.substring(diffs[0][1].length) + diffs[0][1];
    patch.start1 -= extraLength;
    patch.start2 -= extraLength;
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  // Add some padding on end of last diff.
  patch = patches[patches.length - 1];
  diffs = patch.diffs;
  if (diffs.length == 0 || diffs[diffs.length - 1][0] != DIFF_EQUAL) {
    // Add nullPadding equality.
    diffs.push([DIFF_EQUAL, nullPadding]);
    patch.length1 += nullPadding.length;
    patch.length2 += nullPadding.length;
  } else if (nullPadding.length > diffs[diffs.length - 1][1].length) {
    // Grow last equality.
    var extraLength = nullPadding.length - diffs[diffs.length - 1][1].length;
    diffs[diffs.length - 1][1] += nullPadding.substring(0, extraLength);
    patch.length1 += extraLength;
    patch.length2 += extraLength;
  }

  return nullPadding;
};


/**
 * Look through the patches and break up any which are longer than the maximum
 * limit of the match algorithm.
 * @param {Array.<patch_obj>} patches Array of patch objects.
 */
diff_match_patch.prototype.patch_splitMax = function(patches) {
  for (var x = 0; x < patches.length; x++) {
    if (patches[x].length1 > this.Match_MaxBits) {
      var bigpatch = patches[x];
      // Remove the big old patch.
      patches.splice(x--, 1);
      var patch_size = this.Match_MaxBits;
      var start1 = bigpatch.start1;
      var start2 = bigpatch.start2;
      var precontext = '';
      while (bigpatch.diffs.length !== 0) {
        // Create one of several smaller patches.
        var patch = new patch_obj();
        var empty = true;
        patch.start1 = start1 - precontext.length;
        patch.start2 = start2 - precontext.length;
        if (precontext !== '') {
          patch.length1 = patch.length2 = precontext.length;
          patch.diffs.push([DIFF_EQUAL, precontext]);
        }
        while (bigpatch.diffs.length !== 0 &&
               patch.length1 < patch_size - this.Patch_Margin) {
          var diff_type = bigpatch.diffs[0][0];
          var diff_text = bigpatch.diffs[0][1];
          if (diff_type === DIFF_INSERT) {
            // Insertions are harmless.
            patch.length2 += diff_text.length;
            start2 += diff_text.length;
            patch.diffs.push(bigpatch.diffs.shift());
            empty = false;
          } else {
            // Deletion or equality.  Only take as much as we can stomach.
            diff_text = diff_text.substring(0, patch_size - patch.length1 -
                                               this.Patch_Margin);
            patch.length1 += diff_text.length;
            start1 += diff_text.length;
            if (diff_type === DIFF_EQUAL) {
              patch.length2 += diff_text.length;
              start2 += diff_text.length;
            } else {
              empty = false;
            }
            patch.diffs.push([diff_type, diff_text]);
            if (diff_text == bigpatch.diffs[0][1]) {
              bigpatch.diffs.shift();
            } else {
              bigpatch.diffs[0][1] =
                  bigpatch.diffs[0][1].substring(diff_text.length);
            }
          }
        }
        // Compute the head context for the next patch.
        precontext = this.diff_text2(patch.diffs);
        precontext =
            precontext.substring(precontext.length - this.Patch_Margin);
        // Append the end context for this patch.
        var postcontext = this.diff_text1(bigpatch.diffs)
                              .substring(0, this.Patch_Margin);
        if (postcontext !== '') {
          patch.length1 += postcontext.length;
          patch.length2 += postcontext.length;
          if (patch.diffs.length !== 0 &&
              patch.diffs[patch.diffs.length - 1][0] === DIFF_EQUAL) {
            patch.diffs[patch.diffs.length - 1][1] += postcontext;
          } else {
            patch.diffs.push([DIFF_EQUAL, postcontext]);
          }
        }
        if (!empty) {
          patches.splice(++x, 0, patch);
        }
      }
    }
  }
};


/**
 * Take a list of patches and return a textual representation.
 * @param {Array.<patch_obj>} patches Array of patch objects.
 * @return {string} Text representation of patches.
 */
diff_match_patch.prototype.patch_toText = function(patches) {
  var text = [];
  for (var x = 0; x < patches.length; x++) {
    text[x] = patches[x];
  }
  return text.join('');
};


/**
 * Parse a textual representation of patches and return a list of patch objects.
 * @param {string} textline Text representation of patches.
 * @return {Array.<patch_obj>} Array of patch objects.
 * @throws {Error} If invalid input.
 */
diff_match_patch.prototype.patch_fromText = function(textline) {
  var patches = [];
  if (!textline) {
    return patches;
  }
  // Opera doesn't know how to decode char 0.
  textline = textline.replace(/%00/g, '\0');
  var text = textline.split('\n');
  var textPointer = 0;
  while (textPointer < text.length) {
    var m = text[textPointer].match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/);
    if (!m) {
      throw new Error('Invalid patch string: ' + text[textPointer]);
    }
    var patch = new patch_obj();
    patches.push(patch);
    patch.start1 = parseInt(m[1], 10);
    if (m[2] === '') {
      patch.start1--;
      patch.length1 = 1;
    } else if (m[2] == '0') {
      patch.length1 = 0;
    } else {
      patch.start1--;
      patch.length1 = parseInt(m[2], 10);
    }

    patch.start2 = parseInt(m[3], 10);
    if (m[4] === '') {
      patch.start2--;
      patch.length2 = 1;
    } else if (m[4] == '0') {
      patch.length2 = 0;
    } else {
      patch.start2--;
      patch.length2 = parseInt(m[4], 10);
    }
    textPointer++;

    while (textPointer < text.length) {
      var sign = text[textPointer].charAt(0);
      try {
        var line = decodeURI(text[textPointer].substring(1));
      } catch (ex) {
        // Malformed URI sequence.
        throw new Error('Illegal escape in patch_fromText: ' + line);
      }
      if (sign == '-') {
        // Deletion.
        patch.diffs.push([DIFF_DELETE, line]);
      } else if (sign == '+') {
        // Insertion.
        patch.diffs.push([DIFF_INSERT, line]);
      } else if (sign == ' ') {
        // Minor equality.
        patch.diffs.push([DIFF_EQUAL, line]);
      } else if (sign == '@') {
        // Start of next patch.
        break;
      } else if (sign === '') {
        // Blank line?  Whatever.
      } else {
        // WTF?
        throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
      }
      textPointer++;
    }
  }
  return patches;
};


/**
 * Class representing one patch operation.
 * @constructor
 */
function patch_obj() {
  this.diffs = [];
  /** @type {number?} */
  this.start1 = null;
  /** @type {number?} */
  this.start2 = null;
  this.length1 = 0;
  this.length2 = 0;
}


/**
 * Emmulate GNU diff's format.
 * Header: @@ -382,8 +481,9 @@
 * Indicies are printed as 1-based, not 0-based.
 * @return {string} The GNU diff string.
 */
patch_obj.prototype.toString = function() {
  var coords1, coords2;
  if (this.length1 === 0) {
    coords1 = this.start1 + ',0';
  } else if (this.length1 == 1) {
    coords1 = this.start1 + 1;
  } else {
    coords1 = (this.start1 + 1) + ',' + this.length1;
  }
  if (this.length2 === 0) {
    coords2 = this.start2 + ',0';
  } else if (this.length2 == 1) {
    coords2 = this.start2 + 1;
  } else {
    coords2 = (this.start2 + 1) + ',' + this.length2;
  }
  var text = ['@@ -' + coords1 + ' +' + coords2 + ' @@\n'];
  var op;
  // Escape the body of the patch with %xx notation.
  for (var x = 0; x < this.diffs.length; x++) {
    switch (this.diffs[x][0]) {
      case DIFF_INSERT:
        op = '+';
        break;
      case DIFF_DELETE:
        op = '-';
        break;
      case DIFF_EQUAL:
        op = ' ';
        break;
    }
    text[x + 1] = op + encodeURI(this.diffs[x][1]) + '\n';
  }
  // Opera doesn't know how to encode char 0.
  return text.join('').replace(/\x00/g, '%00').replace(/%20/g, ' ');
};

/**
 * MobWrite - Real-time Synchronization and Collaboration Service
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-mobwrite/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview This client-side code drives the synchronisation.
 * @author fraser@google.com (Neil Fraser)
 */


/**
 * Singleton class containing all MobWrite code.
 */
var mobwrite = {};


/**
 * URL of Ajax gateway.
 * @type {string}
 */
mobwrite.syncGateway = '/scripts/q.py';


/**
 * Max size of remote JSON-P gets.
 * @type {number}
 */
mobwrite.get_maxchars = 200;


/**
 * Print diagnostic messages to the browser's console.
 * @type {boolean}
 */
mobwrite.debug = false;


// Debug mode requires a compatible console.
// Firefox with Firebug, Safari and Chrome are known to be compatible.
if (!('console' in window) || !('info' in window.console) ||
    !('warn' in window.console) || !('error' in window.console)) {
  mobwrite.debug = false;
}


/**
 * Browser sniff. Required to work around bugs in common implementations.
 * Sets mobwrite's UA_* properties.
 */
mobwrite.sniffUserAgent = function() {
  if (window.opera) {
    mobwrite.UA_opera = true;
  } else {
    var UA = navigator.userAgent.toLowerCase();
    mobwrite.UA_webkit = UA.indexOf('webkit') != -1;
    // Safari claims to be 'like Gecko'
    if (!mobwrite.UA_webkit) {
      mobwrite.UA_gecko = UA.indexOf('gecko') != -1;
      if (!mobwrite.UA_gecko) {
        // Test last, everyone wants to be like IE.
        mobwrite.UA_msie = UA.indexOf('msie') != -1;
      }
    }
  }
};

mobwrite.UA_gecko = false;
mobwrite.UA_opera = false;
mobwrite.UA_msie = false;
mobwrite.UA_webkit = false;
mobwrite.sniffUserAgent();


/**
 * PID of task which will trigger next Ajax request.
 * @type {number?}
 * @private
 */
mobwrite.syncRunPid_ = null;


/**
 * PID of task which will kill stalled Ajax request.
 * @type {number?}
 * @private
 */
mobwrite.syncKillPid_ = null;


/**
 * Time to wait for a connection before giving up and retrying.
 * @type {number}
 */
mobwrite.timeoutInterval = 30000;


/**
 * Shortest interval (in milliseconds) between connections.
 * @type {number}
 */
mobwrite.minSyncInterval = 1000;


/**
 * Longest interval (in milliseconds) between connections.
 * @type {number}
 */
mobwrite.maxSyncInterval = 10000;


/**
 * Initial interval (in milliseconds) for connections.
 * This value is modified later as traffic rates are established.
 * @type {number}
 */
mobwrite.syncInterval = 2000;


/**
 * Optional prefix to automatically add to all IDs.
 * @type {string}
 */
mobwrite.idPrefix = '';


/**
 * Flag to nullify all shared elements and terminate.
 * @type {boolean}
 */
mobwrite.nullifyAll = false;


/**
 * Track whether something changed client-side in each sync.
 * @type {boolean}
 * @private
 */
mobwrite.clientChange_ = false;


/**
 * Track whether something changed server-side in each sync.
 * @type {boolean}
 * @private
 */
mobwrite.serverChange_ = false;


/**
 * Temporary object used while each sync is airborne.
 * @type {Object?}
 * @private
 */
mobwrite.syncAjaxObj_ = null;


/**
 * Return a random id that's 8 letters long.
 * 26*(26+10+4)^7 = 4,259,840,000,000
 * @return {string} Random id.
 */
mobwrite.uniqueId = function() {
  // First character must be a letter.
  // IE is case insensitive (in violation of the W3 spec).
  var soup = 'abcdefghijklmnopqrstuvwxyz';
  var id = soup.charAt(Math.random() * soup.length);
  // Subsequent characters may include these.
  soup += '0123456789-_:.';
  for (var x = 1; x < 8; x++) {
    id += soup.charAt(Math.random() * soup.length);
  }
  // Don't allow IDs with '--' in them since it might close a comment.
  if (id.indexOf('--') != -1) {
    id = mobwrite.uniqueId();
  }
  return id;
  // Getting the maximum possible density in the ID is worth the extra code,
  // since the ID is transmitted to the server a lot.
};


/**
 * Unique ID for this session.
 * @type {string}
 */
mobwrite.syncUsername = mobwrite.uniqueId();


/**
 * Hash of all shared objects.
 * @type {Object}
 */
mobwrite.shared = {};


/**
 * Array of registered handlers for sharing types.
 * Modules add their share functions to this list.
 * @type {Array.<Function>}
 */
mobwrite.shareHandlers = [];


/**
 * Prototype of shared object.
 * @param {string} id Unique file ID
 * @constructor
 */
mobwrite.shareObj = function(id) {
  if (id) {
    this.file = id;
    this.dmp = new diff_match_patch();
    this.dmp.Diff_Timeout = 0.5;
    // List of unacknowledged edits sent to the server.
    this.editStack = [];
    if (mobwrite.debug) {
      window.console.info('Creating shareObj: "' + id + '"');
    }
  }
};


/**
 * Client's understanding of what the server's text looks like.
 * @type {string}
 */
mobwrite.shareObj.prototype.shadowText = '';


/**
 * The client's version for the shadow (n).
 * @type {number}
 */
mobwrite.shareObj.prototype.clientVersion = 0;


/**
 * The server's version for the shadow (m).
 * @type {number}
 */
mobwrite.shareObj.prototype.serverVersion = 0;


/**
 * Did the client understand the server's delta in the previous heartbeat?
 * Initialize false because the server and client are out of sync initially.
 * @type {boolean}
 */
mobwrite.shareObj.prototype.deltaOk = false;


/**
 * Synchronization mode.
 * True: Used for text, attempts to gently merge differences together.
 * False: Used for numbers, overwrites conflicts, last save wins.
 * @type {boolean}
 */
mobwrite.shareObj.prototype.mergeChanges = true;


/**
 * Fetch or compute a plaintext representation of the user's text
 * @return {string} Plaintext content.
 */
mobwrite.shareObj.prototype.getClientText = function() {
  window.alert('Defined by subclass');
  return '';
};


/**
 * Set the user's text based on the provided plaintext.
 * @param {string} text New text
 */
mobwrite.shareObj.prototype.setClientText = function(text) {
  window.alert('Defined by subclass');
};


/**
 * Modify the user's plaintext by applying a series of patches against it.
 * @param {Array.<patch_obj>} patches Array of Patch objects
 */
mobwrite.shareObj.prototype.patchClientText = function(patches) {
  var oldClientText = this.getClientText();
  var result = this.dmp.patch_apply(patches, oldClientText);
  // Set the new text only if there is a change to be made.
  if (oldClientText != result[0]) {
    // The following will probably destroy any cursor or selection.
    // Widgets with cursors should override and patch more delicately.
    this.setClientText(result[0]);
  }
};


/**
 * Notification of when a diff was sent to the server.
 * @param {Array.<Array.<*>>} diffs Array of diff tuples
 */
mobwrite.shareObj.prototype.onSentDiff = function(diffs) {
  // Potential hook for subclass.
};


/**
 * Fire a synthetic 'change' event to a target element.
 * Notifies an element that its contents have been changed.
 * @param {Object} target Element to notify
 */
mobwrite.shareObj.prototype.fireChange = function(target) {
  if ('createEvent' in document) {  // W3
    var e = document.createEvent('HTMLEvents');
    e.initEvent('change', false, false);
    target.dispatchEvent(e);
  } else if ('fireEvent' in target) { // IE
    target.fireEvent('onchange');
  }
};


/**
 * Return the command to nullify this field.  Also unshares this field.
 * @return {string} Commands to be sent to the server.
 */
mobwrite.shareObj.prototype.nullify = function() {
  mobwrite.unshare(this.file);
  return 'N:' + encodeURI(mobwrite.idPrefix + this.file) + '\n';
};


/**
 * Asks the shareObj to synchronize.  Computes client-made changes since
 * previous postback.  Return '' to skip this synchronization.
 * @return {string} Commands to be sent to the server.
 */
mobwrite.shareObj.prototype.syncText = function() {
  var clientText = this.getClientText();
  if (this.deltaOk) {
    // The last delta postback from the server to this shareObj was successful.
    // Send a compressed delta.
    var diffs = this.dmp.diff_main(this.shadowText, clientText, true);
    if (diffs.length > 2) {
      this.dmp.diff_cleanupSemantic(diffs);
      this.dmp.diff_cleanupEfficiency(diffs);
    }
    this.onSentDiff(diffs);
    this.shadowText = clientText;
    var action = (this.mergeChanges ? 'd:' : 'D:') + this.clientVersion + ':' +
                 this.dmp.diff_toDelta(diffs);
    if (diffs.length != 1 || diffs[0][0] != DIFF_EQUAL) {
      mobwrite.clientChange_ = true;
    }
    // Append the action to the edit stack.
    this.editStack.push([this.clientVersion, action]);
    this.clientVersion++;
  } else {
    // The last delta postback from the server to this shareObj didn't match.
    // Send a full text dump to get back in sync. This will result in any
    // changes since the last postback being wiped out. :(
    data = clientText;
    if (this.shadowText != clientText) {
      this.shadowText = clientText;
    }
    this.clientVersion++;
    var action = 'r:' + this.clientVersion + ':' +
                 encodeURI(data).replace(/%20/g, ' ');
    // Append the action to the edit stack.
    this.editStack.push([this.clientVersion, action]);
  }

  // Create the output starting with the file statement, followed by the edits.
  var data = 'F:' + this.serverVersion + ':' +
      encodeURI(mobwrite.idPrefix + this.file) + '\n';
  for (var x = 0; x < this.editStack.length; x++) {
    data += this.editStack[x][1] + '\n';
  }
  // Opera doesn't know how to encode char 0. (fixed in Opera 9.63)
  return data.replace(/\0/g, '%00');
};


/**
 * Collect all client-side changes and send them to the server.
 * @private
 */
mobwrite.syncRun1_ = function() {
  // Initialize clientChange_, to be checked at the end of syncRun2_.
  mobwrite.clientChange_ = false;
  var data = [];
  data[0] = 'u:' + mobwrite.syncUsername + '\n';
  var empty = true;
  // Ask every shared object for their deltas.
  for (var x in mobwrite.shared) {
    if (mobwrite.shared.hasOwnProperty(x)) {
      if (mobwrite.nullifyAll) {
        data.push(mobwrite.shared[x].nullify());
      } else {
        data.push(mobwrite.shared[x].syncText());
      }
      empty = false;
    }
  }
  if (empty) {
    // No sync objects.
    if (mobwrite.debug) {
      window.console.info('MobWrite task stopped.');
    }
    return;
  }
  if (data.length == 1) {
    // No sync data.
    if (mobwrite.debug) {
      window.console.info('All objects silent; null sync.');
    }
    return mobwrite.syncRun2_('\n\n');
  }

  var remote = (mobwrite.syncGateway.indexOf('://') != -1);
  if (mobwrite.debug) {
    window.console.info('TO server:\n' + data.join(''));
  }
  // Add terminating blank line.
  data.push('\n');
  data = data.join('');

  // Schedule a watchdog task to catch us if something horrible happens.
  mobwrite.syncKillPid_ =
      window.setTimeout(mobwrite.syncKill_, mobwrite.timeoutInterval);

  if (remote) {
    // Remove any old script tags.
    var script;
    while (script = document.getElementById('mobwrite_sync')) {
      script.parentNode.removeChild(script);
    }
    var blocks = [];
    if (data.length > mobwrite.get_maxchars) {
      // Break the data into small blocks.
      // Compute number of blocks.
      var bufferBlocks = Math.ceil(data.length / mobwrite.get_maxchars);
      // Compute length of each block.
      var blockLength = Math.ceil(data.length / bufferBlocks);
      // Obtain a random ID for this buffer.
      var bufferHeader = 'b:' + mobwrite.uniqueId() + ' ' + bufferBlocks + ' ';
      for (var x = 1; x <= bufferBlocks; x++) {
        var bufferData =
            encodeURIComponent(data.substring((x - 1) * blockLength,
                               x * blockLength));
        var block = bufferHeader + x + ' ' + bufferData + '\n\n';
        blocks.push('p=' + encodeURIComponent(block));
      }
    } else {
      // Encode to a URL.
      blocks = ['p=' + encodeURIComponent(data)];
    }
    // Add a script tag to the head.
    var head = document.getElementsByTagName('head')[0];
    for (var x = 0; x < blocks.length; x++) {
      script = document.createElement('script');
      script.type = 'text/javascript';
      script.charset = 'utf-8';
      // Add a uniqueId for cache-busting purposes.
      script.src =
          mobwrite.syncGateway + '?' + blocks[x] + '&c=' + mobwrite.uniqueId();
      script.id = 'mobwrite_sync';
      head.appendChild(script);
    }
    // Execution will resume in mobwrite.callback();
  } else {
    // Issue Ajax post of client-side changes and request server-side changes.
    data = 'q=' + encodeURIComponent(data);
    mobwrite.syncAjaxObj_ = mobwrite.syncLoadAjax_(mobwrite.syncGateway, data,
        mobwrite.syncCheckAjax_);
    // Execution will resume in either syncCheckAjax_(), or syncKill_()
  }
};


/**
 * Callback location for JSON-P requests.
 */
mobwrite.callback = function(text) {
  // Only process the response if there is a response (don't schedule a new
  // heartbeat due to one of the many null responses from a buffer push).
  if (text) {
    // Add required trailing blank line.
    mobwrite.syncRun2_(text + '\n');
  } else {
    // This null response proves we got a round-trip of a buffer from the
    // server.  Reschedule the watchdog.
    window.clearTimeout(mobwrite.syncKillPid_);
    mobwrite.syncKillPid_ =
        window.setTimeout(mobwrite.syncKill_, mobwrite.timeoutInterval);
  }
};


/**
 * Parse all server-side changes and distribute them to the shared objects.
 * @private
 */
mobwrite.syncRun2_ = function(text) {
  // Initialize serverChange_, to be checked at the end of syncRun2_.
  mobwrite.serverChange_ = false;
  if (mobwrite.debug) {
    window.console.info('FROM server:\n' + text);
  }
  // Opera doesn't know how to decode char 0. (fixed in Opera 9.63)
  text = text.replace(/%00/g, '\0');
  // There must be a linefeed followed by a blank line.
  if (text.length < 2 || text.substring(text.length - 2) != '\n\n') {
    text = '';
    if (mobwrite.error) {
      window.console.info('Truncated data.  Abort.');
    }
  }
  var lines = text.split('\n');
  var file = null;
  var clientVersion = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line) {
      // Terminate on blank line.
      break;
    }
    // Divide each line into 'N:value' pairs.
    if (line.charAt(1) != ':') {
      if (mobwrite.debug) {
        window.console.error('Unparsable line: ' + line);
      }
      continue;
    }
    var name = line.charAt(0);
    var value = line.substring(2);

    // Parse out a version number for file, delta or raw.
    var version;
    if ('FfDdRr'.indexOf(name) != -1) {
      var div = value.indexOf(':');
      if (!div) {
        if (mobwrite.debug) {
          window.console.error('No version number: ' + line);
        }
        continue;
      }
      version = parseInt(value.substring(0, div), 10);
      if (isNaN(version)) {
        if (mobwrite.debug) {
          window.console.error('NaN version number: ' + line);
        }
        continue;
      }
      value = value.substring(div + 1);
    }
    if (name == 'F' || name == 'f') {
      // FILE indicates which shared object following delta/raw applies to.
      if (value.substring(0, mobwrite.idPrefix.length) == mobwrite.idPrefix) {
        // Trim off the ID prefix.
        value = value.substring(mobwrite.idPrefix.length);
      } else {
        // This file does not have our ID prefix.
        file = null;
        if (mobwrite.debug) {
          window.console.error('File does not have "' + mobwrite.idPrefix +
              '" prefix: ' + value);
        }
        continue;
      }
      if (mobwrite.shared.hasOwnProperty(value)) {
        file = mobwrite.shared[value];
        file.deltaOk = true;
        clientVersion = version;
        // Remove any elements from the edit stack with low version numbers
        // which have been acked by the server.
        for (var x = 0; x < file.editStack.length; x++) {
          if (file.editStack[x][0] <= clientVersion) {
            file.editStack.splice(x, 1);
            x--;
          }
        }

      } else {
        // This file does not map to a currently shared object.
        file = null;
        if (mobwrite.debug) {
          window.console.error('Unknown file: ' + value);
        }
      }
    } else if (name == 'R' || name == 'r') {
      // The server reports it was unable to integrate the previous delta.
      if (file) {
        file.shadowText = decodeURI(value);
        file.clientVersion = clientVersion;
        file.serverVersion = version;
        file.editStack = [];
        if (name == 'R') {
          // Accept the server's raw text dump and wipe out any user's changes.
          file.setClientText(file.shadowText);
        }
        // Server-side activity.
        mobwrite.serverChange_ = true;
      }
    } else if (name == 'D' || name == 'd') {
      // The server offers a compressed delta of changes to be applied.
      if (file) {
        if (clientVersion != file.clientVersion) {
          // Can't apply a delta on a mismatched shadow version.
          file.deltaOk = false;
          if (mobwrite.debug) {
            window.console.error('Client version number mismatch.\n' +
                'Expected: ' + file.clientVersion + ' Got: ' + clientVersion);
          }
        } else if (version > file.serverVersion) {
          // Server has a version in the future?
          file.deltaOk = false;
          if (mobwrite.debug) {
            window.console.error('Server version in future.\n' +
                'Expected: ' + file.serverVersion + ' Got: ' + version);
          }
        } else if (version < file.serverVersion) {
          // We've already seen this diff.
          if (mobwrite.debug) {
            window.console.warn('Server version in past.\n' +
                'Expected: ' + file.serverVersion + ' Got: ' + version);
          }
        } else {
          // Expand the delta into a diff using the client shadow.
          var diffs;
          try {
            diffs = file.dmp.diff_fromDelta(file.shadowText, value);
            file.serverVersion++;
          } catch (ex) {
            // The delta the server supplied does not fit on our copy of
            // shadowText.
            diffs = null;
            // Set deltaOk to false so that on the next sync we send
            // a complete dump to get back in sync.
            file.deltaOk = false;
            // Do the next sync soon because the user will lose any changes.
            mobwrite.syncInterval = 0;
            if (mobwrite.debug) {
              window.console.error('Delta mismatch.\n' + encodeURI(file.shadowText));
            }
          }
          if (diffs && (diffs.length != 1 || diffs[0][0] != DIFF_EQUAL)) {
            // Compute and apply the patches.
            if (name == 'D') {
              // Overwrite text.
              file.shadowText = file.dmp.diff_text2(diffs);
              file.setClientText(file.shadowText);
            } else {
              // Merge text.
              var patches = file.dmp.patch_make(file.shadowText, '', diffs);
              // First shadowText.  Should be guaranteed to work.
              var serverResult = file.dmp.patch_apply(patches, file.shadowText);
              file.shadowText = serverResult[0];
              // Second the user's text.
              file.patchClientText(patches);
            }
            // Server-side activity.
            mobwrite.serverChange_ = true;
          }
        }
      }
    }
  }

  mobwrite.computeSyncInterval_();

  // Ensure that there is only one sync task.
  window.clearTimeout(mobwrite.syncRunPid_);
  // Schedule the next sync.
  mobwrite.syncRunPid_ =
      window.setTimeout(mobwrite.syncRun1_, mobwrite.syncInterval);
  // Terminate the watchdog task, everything's ok.
  window.clearTimeout(mobwrite.syncKillPid_);
  mobwrite.syncKillPid_ = null;
};


/**
 * Compute how long to wait until next synchronization.
 * @private
 */
mobwrite.computeSyncInterval_ = function() {
  if (mobwrite.clientChange_ || mobwrite.serverChange_) {
    // Activity (client-side or server-side).  Cut the ping interval.
    mobwrite.syncInterval /= 2;
  } else {
    // Let the ping interval creep up.
    mobwrite.syncInterval += 1000;
  }
  // Keep the syncs constrained between 1 and 10 seconds.
  mobwrite.syncInterval =
      Math.max(mobwrite.minSyncInterval, mobwrite.syncInterval);
  mobwrite.syncInterval =
      Math.min(mobwrite.maxSyncInterval, mobwrite.syncInterval);
};


/**
 * If the Ajax call doesn't complete after a timeout period, start over.
 * @private
 */
mobwrite.syncKill_ = function() {
  mobwrite.syncKillPid_ = null;
  if (mobwrite.syncAjaxObj_) {
    // Cleanup old Ajax connection.
    mobwrite.syncAjaxObj_.abort();
    mobwrite.syncAjaxObj_ = null;
  }
  if (mobwrite.debug) {
    window.console.warn('Connection timeout.');
  }
  window.clearTimeout(mobwrite.syncRunPid_);
  // Initiate a new sync right now.
  mobwrite.syncRunPid_ = window.setTimeout(mobwrite.syncRun1_, 1);
};


/**
 * Initiate an Ajax network connection.
 * @param {string} url Location to send request
 * @param {string} post Data to be sent
 * @param {Function} callback Function to be called when response arrives
 * @return {Object?} New Ajax object or null if failure.
 * @private
 */
mobwrite.syncLoadAjax_ = function(url, post, callback) {
  var req = null;
  // branch for native XMLHttpRequest object
  if (window.XMLHttpRequest) {
    try {
      req = new XMLHttpRequest();
    } catch(e) {
      req = null;
    }
    // branch for IE/Windows ActiveX version
    } else if (window.ActiveXObject) {
    try {
      req = new ActiveXObject('Msxml2.XMLHTTP');
    } catch(e) {
      try {
        req = new ActiveXObject('Microsoft.XMLHTTP');
      } catch(e) {
      	req = null;
      }
    }
  }
  if (req) {
    req.onreadystatechange = callback;
    req.open('POST', url, true);
    req.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
    req.send(post);
  }
  return req;
};


/**
 * Callback function for Ajax request.  Checks network response was ok,
 * then calls mobwrite.syncRun2_
 * @private
 */
mobwrite.syncCheckAjax_ = function() {
  if (typeof mobwrite == 'undefined' || !mobwrite.syncAjaxObj_) {
    // This might be a callback after the page has unloaded,
    // or this might be a callback which we deemed to have timed out.
    return;
  }
  // Only if req shows "loaded"
  if (mobwrite.syncAjaxObj_.readyState == 4) {
    // Only if "OK"
    if (mobwrite.syncAjaxObj_.status == 200) {
      var text = mobwrite.syncAjaxObj_.responseText;
      mobwrite.syncAjaxObj_ = null;
      mobwrite.syncRun2_(text);
    } else {
      if (mobwrite.debug) {
        window.console.warn('Connection error code: ' + mobwrite.syncAjaxObj_.status);
      }
      mobwrite.syncAjaxObj_ = null;
    }
  }
};


/**
 * When unloading, run a sync one last time.
 * @private
 */
mobwrite.unload_ = function() {
  if (!mobwrite.syncKillPid_) {
    // Turn off debug mode since the console disappears on page unload before
    // this code does.
    mobwrite.debug = false;
    mobwrite.syncRun1_();
  }
  // By the time the callback runs mobwrite.syncRun2_, this page will probably
  // be gone.  But that's ok, we are just sending our last changes out, we
  // don't care what the server says.
};


// Attach unload event to window.
if (window.addEventListener) {  // W3
  window.addEventListener('unload', mobwrite.unload_, false);
} else if (window.attachEvent) {  // IE
  window.attachEvent('onunload', mobwrite.unload_);
}


/**
 * Start sharing the specified object(s).
 * @param {*} var_args Object(s) or ID(s) of object(s) to share
 */
mobwrite.share = function(var_args) {
  for (var i = 0; i < arguments.length; i++) {
    var el = arguments[i];
    var result = null;
    // Ask every registered handler if it knows what to do with this object.
    for (var x = 0; x < mobwrite.shareHandlers.length && !result; x++) {
      result = mobwrite.shareHandlers[x].call(mobwrite, el);
    }
    if (result && result.file) {
      if (result.file in mobwrite.shared) {
        // Already exists.
        // Don't replace, since we don't want to lose state.
        if (mobwrite.debug) {
          window.console.warn('Ignoring duplicate share on "' + el + '".');
        }
        continue;
      }
      mobwrite.shared[result.file] = result;

      // Startup the main task if it doesn't aleady exist.
      if (mobwrite.syncRunPid_ == null) {
        mobwrite.syncRunPid_ = window.setTimeout(mobwrite.syncRun1_, 10);
        if (mobwrite.debug) {
          window.console.info('MobWrite task started.');
        }
      }
    }
  }
};


/**
 * Stop sharing the specified object(s).
 * Does not handle forms recursively.
 * @param {*} var_args Object(s) or ID(s) of object(s) to share
 */
mobwrite.unshare = function(var_args) {
  for (var i = 0; i < arguments.length; i++) {
    var el = arguments[i];
    if (typeof el == 'object' && 'id' in el) {
      el = el.id;
    }
    if (typeof el == 'string') {
      if (mobwrite.shared.hasOwnProperty(el)) {
        delete mobwrite.shared[el];
        if (mobwrite.debug) {
          window.console.info('Unshared: ' + el);
        }
      }
    }
  }
};

/**
 * MobWrite - Real-time Synchronization and Collaboration Service
 *
 * Copyright 2008 Google Inc.
 * http://code.google.com/p/google-mobwrite/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview This client-side code interfaces with form elements.
 * @author fraser@google.com (Neil Fraser)
 */

/**
 * Checks to see if the provided node is still part of the DOM.
 * @param {Node} node DOM node to verify.
 * @return {boolean} Is this node part of a DOM?
 * @private
 */
mobwrite.validNode_ = function(node) {
  while (node.parentNode) {
    node = node.parentNode;
  }
  // The topmost node should be type 9, a document.
  return node.nodeType == 9;
};


// FORM


/**
 * Handler to accept forms as elements that can be shared.
 * Share each of the form's elements.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareHandlerForm = function(form) {
  if (typeof form == 'string') {
    form = document.getElementById(form) || document.forms[form];
  }
  if (form && 'tagName' in form && form.tagName == 'FORM') {
    for (var x = 0, el; el = form.elements[x]; x++) {
      mobwrite.share(el);
    }
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareHandlerForm);


// HIDDEN


/**
 * Constructor of shared object representing a hidden input.
 * @param {Node} node A hidden element
 * @constructor
 */
mobwrite.shareHiddenObj = function(node) {
  // Call our prototype's constructor.
  mobwrite.shareObj.apply(this, [node.id]);
  this.element = node;
};


// The hidden input's shared object's parent is a shareObj.
mobwrite.shareHiddenObj.prototype = new mobwrite.shareObj('');


/**
 * Retrieve the user's content.
 * @return {string} Plaintext content.
 */
mobwrite.shareHiddenObj.prototype.getClientText = function() {
  if (!mobwrite.validNode_(this.element)) {
    mobwrite.unshare(this.file);
  }
  // Numeric data should use overwrite mode.
  this.mergeChanges = !this.element.value.match(/^\s*-?[\d.]+\s*$/);
  return this.element.value;
};


/**
 * Set the user's content.
 * @param {string} text New content
 */
mobwrite.shareHiddenObj.prototype.setClientText = function(text) {
  this.element.value = text;
};


/**
 * Handler to accept hidden fields as elements that can be shared.
 * If the element is a hidden field, create a new sharing object.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareHiddenObj.shareHandler = function(node) {
  if (typeof node == 'string') {
    node = document.getElementById(node);
  }
  if (node && 'type' in node && node.type == 'hidden') {
    return new mobwrite.shareHiddenObj(node);
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareHiddenObj.shareHandler);


// CHECKBOX


/**
 * Constructor of shared object representing a checkbox.
 * @param {Node} node A checkbox element
 * @constructor
 */
mobwrite.shareCheckboxObj = function(node) {
  // Call our prototype's constructor.
  mobwrite.shareObj.apply(this, [node.id]);
  this.element = node;
  this.mergeChanges = false;
};


// The checkbox shared object's parent is a shareObj.
mobwrite.shareCheckboxObj.prototype = new mobwrite.shareObj('');


/**
 * Retrieve the user's check.
 * @return {string} Plaintext content.
 */
mobwrite.shareCheckboxObj.prototype.getClientText = function() {
  if (!mobwrite.validNode_(this.element)) {
    mobwrite.unshare(this.file);
  }
  return this.element.checked ? this.element.value : '';
};


/**
 * Set the user's check.
 * @param {string} text New content
 */
mobwrite.shareCheckboxObj.prototype.setClientText = function(text) {
  // Safari has a blank value if not set, all other browsers have 'on'.
  var value = this.element.value || 'on';
  this.element.checked = (text == value);
  this.fireChange(this.element);
};


/**
 * Handler to accept checkboxen as elements that can be shared.
 * If the element is a checkbox, create a new sharing object.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareCheckboxObj.shareHandler = function(node) {
  if (typeof node == 'string') {
    node = document.getElementById(node);
  }
  if (node && 'type' in node && node.type == 'checkbox') {
    return new mobwrite.shareCheckboxObj(node);
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareCheckboxObj.shareHandler);


// SELECT OPTION


/**
 * Constructor of shared object representing a select box.
 * @param {Node} node A select box element
 * @constructor
 */
mobwrite.shareSelectObj = function(node) {
  // Call our prototype's constructor.
  mobwrite.shareObj.apply(this, [node.id]);
  this.element = node;
  // If the select box is select-one, use overwrite mode.
  // If it is select-multiple, use text merge mode.
  this.mergeChanges = (node.type == 'select-multiple');
};


// The select box shared object's parent is a shareObj.
mobwrite.shareSelectObj.prototype = new mobwrite.shareObj('');


/**
 * Retrieve the user's selection(s).
 * @return {string} Plaintext content.
 */
mobwrite.shareSelectObj.prototype.getClientText = function() {
  if (!mobwrite.validNode_(this.element)) {
    mobwrite.unshare(this.file);
  }
  var selected = [];
  for (var x = 0, option; option = this.element.options[x]; x++) {
    if (option.selected) {
      selected.push(option.value);
    }
  }
  return selected.join('\00');
};


/**
 * Set the user's selection(s).
 * @param {string} text New content
 */
mobwrite.shareSelectObj.prototype.setClientText = function(text) {
  text = '\00' + text + '\00';
  for (var x = 0, option; option = this.element.options[x]; x++) {
    option.selected = (text.indexOf('\00' + option.value + '\00') != -1);
  }
  this.fireChange(this.element);
};


/**
 * Handler to accept select boxen as elements that can be shared.
 * If the element is a select box, create a new sharing object.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareSelectObj.shareHandler = function(node) {
  if (typeof node == 'string') {
    node = document.getElementById(node);
  }
  if (node && 'type' in node && (node.type == 'select-one' || node.type == 'select-multiple')) {
    return new mobwrite.shareSelectObj(node);
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareSelectObj.shareHandler);


// RADIO BUTTON


/**
 * Constructor of shared object representing a radio button.
 * @param {Node} node A radio button element
 * @constructor
 */
mobwrite.shareRadioObj = function(node) {
  // Call our prototype's constructor.
  mobwrite.shareObj.apply(this, [node.id]);
  this.elements = [node];
  this.form = node.form;
  this.name = node.name;
  this.mergeChanges = false;
};


// The radio button shared object's parent is a shareObj.
mobwrite.shareRadioObj.prototype = new mobwrite.shareObj('');


/**
 * Retrieve the user's check.
 * @return {string} Plaintext content.
 */
mobwrite.shareRadioObj.prototype.getClientText = function() {
  // TODO: Handle cases where the radio buttons are added or removed.
  if (!mobwrite.validNode_(this.elements[0])) {
    mobwrite.unshare(this.file);
  }
  // Group of radio buttons
  for (var x = 0; x < this.elements.length; x++) {
    if (this.elements[x].checked) {
      return this.elements[x].value
    }
  }
  // Nothing checked.
  return '';
};


/**
 * Set the user's check.
 * @param {string} text New content
 */
mobwrite.shareRadioObj.prototype.setClientText = function(text) {
  for (var x = 0; x < this.elements.length; x++) {
    this.elements[x].checked = (text == this.elements[x].value);
    this.fireChange(this.elements[x]);
  }
};


/**
 * Handler to accept radio buttons as elements that can be shared.
 * If the element is a radio button, create a new sharing object.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareRadioObj.shareHandler = function(node) {
  if (typeof node == 'string') {
    node = document.getElementById(node);
  }
  if (node && 'type' in node && node.type == 'radio') {
    // Check to see if this is another element of an existing radio button group.
    for (var id in mobwrite.shared) {
      if (mobwrite.shared[id].form == node.form && mobwrite.shared[id].name == node.name) {
        mobwrite.shared[id].elements.push(node);
        return null;
      }
    }
    // Create new radio button object.
    return new mobwrite.shareRadioObj(node);
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareRadioObj.shareHandler);


// TEXTAREA, TEXT & PASSWORD INPUTS


/**
 * Constructor of shared object representing a text field.
 * @param {Node} node A textarea, text or password input
 * @constructor
 */
mobwrite.shareTextareaObj = function(node) {
  // Call our prototype's constructor.
  mobwrite.shareObj.apply(this, [node.id]);
  this.element = node;
  if (node.type == 'password') {
    // Use overwrite mode for password field, users can't see.
    this.mergeChanges = false;
  }
};


// The textarea shared object's parent is a shareObj.
mobwrite.shareTextareaObj.prototype = new mobwrite.shareObj('');


/**
 * Retrieve the user's text.
 * @return {string} Plaintext content.
 */
mobwrite.shareTextareaObj.prototype.getClientText = function() {
  if (!mobwrite.validNode_(this.element)) {
    mobwrite.unshare(this.file);
  }
  var text = mobwrite.shareTextareaObj.normalizeLinebreaks_(this.element.value);
  if (this.element.type == 'text') {
    // Numeric data should use overwrite mode.
    this.mergeChanges = !text.match(/^\s*-?[\d.,]+\s*$/);
  }
  return text;
};


/**
 * Set the user's text.
 * @param {string} text New text
 */
mobwrite.shareTextareaObj.prototype.setClientText = function(text) {
  this.element.value = text;
  this.fireChange(this.element);
};


/**
 * Modify the user's plaintext by applying a series of patches against it.
 * @param {Array.<patch_obj>} patches Array of Patch objects
 */
mobwrite.shareTextareaObj.prototype.patchClientText = function(patches) {
  // Set some constants which tweak the matching behaviour.
  // Tweak the relative importance (0.0 = accuracy, 1.0 = proximity)
  this.dmp.Match_Balance = 0.5;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose)
  this.dmp.Match_Threshold = 0.6;

  var oldClientText = this.getClientText();
  var result = this.dmp.patch_apply(patches, oldClientText);
  // Set the new text only if there is a change to be made.
  if (oldClientText != result[0]) {
    var cursor = this.captureCursor_();
    this.setClientText(result[0]);
    if (cursor) {
      this.restoreCursor_(cursor);
    }
  }
  if (mobwrite.debug) {
    for (var x = 0; x < result[1].length; x++) {
      if (result[1][x]) {
        window.console.info('Patch OK.');
      } else {
        window.console.warn('Patch failed: ' + patches[x]);
      }
    }
  }
};


/**
 * Record information regarding the current cursor.
 * @return {Object?} Context information of the cursor.
 * @private
 */
mobwrite.shareTextareaObj.prototype.captureCursor_ = function() {
  if ('activeElement' in this.element && !this.element.activeElement) {
    // Safari specific code.
    // Restoring a cursor in an unfocused element causes the focus to jump.
    return null;
  }
  var padLength = this.dmp.Match_MaxBits / 2;  // Normally 16.
  var text = this.element.value;
  var cursor = {};
  if ('selectionStart' in this.element) {  // W3
    try {
      var selectionStart = this.element.selectionStart;
      var selectionEnd = this.element.selectionEnd;
    } catch (e) {
      // No cursor; the element may be "display:none".
      return null;
    }
    cursor.startPrefix = text.substring(selectionStart - padLength, selectionStart);
    cursor.startSuffix = text.substring(selectionStart, selectionStart + padLength);
    cursor.startPercent = selectionStart / text.length;
    cursor.collapsed = (selectionStart == selectionEnd);
    if (!cursor.collapsed) {
      cursor.endPrefix = text.substring(selectionEnd - padLength, selectionEnd);
      cursor.endSuffix = text.substring(selectionEnd, selectionEnd + padLength);
      cursor.endPercent = selectionEnd / text.length;
    }
  } else {  // IE
    // Walk up the tree looking for this textarea's document node.
    var doc = this.element;
    while (doc.parentNode) {
      doc = doc.parentNode;
    }
    if (!doc.selection || !doc.selection.createRange) {
      // Not IE?
      return null;
    }
    var range = doc.selection.createRange();
    if (range.parentElement() != this.element) {
      // Cursor not in this textarea.
      return null;
    }
    var newRange = doc.body.createTextRange();

    cursor.collapsed = (range.text == '');
    newRange.moveToElementText(this.element);
    if (!cursor.collapsed) {
      newRange.setEndPoint('EndToEnd', range);
      cursor.endPrefix = newRange.text;
      cursor.endPercent = cursor.endPrefix.length / text.length;
      cursor.endPrefix = cursor.endPrefix.substring(cursor.endPrefix.length - padLength);
    }
    newRange.setEndPoint('EndToStart', range);
    cursor.startPrefix = newRange.text;
    cursor.startPercent = cursor.startPrefix.length / text.length;
    cursor.startPrefix = cursor.startPrefix.substring(cursor.startPrefix.length - padLength);

    newRange.moveToElementText(this.element);
    newRange.setEndPoint('StartToStart', range);
    cursor.startSuffix = newRange.text.substring(0, padLength);
    if (!cursor.collapsed) {
      newRange.setEndPoint('StartToEnd', range);
      cursor.endSuffix = newRange.text.substring(0, padLength);
    }
  }

  // Record scrollbar locations
  if ('scrollTop' in this.element) {
    cursor.scrollTop = this.element.scrollTop / this.element.scrollHeight;
    cursor.scrollLeft = this.element.scrollLeft / this.element.scrollWidth;
  }
  
  // alert(cursor.startPrefix + '|' + cursor.startSuffix + ' ' +
  //     cursor.startPercent + '\n' + cursor.endPrefix + '|' +
  //     cursor.endSuffix + ' ' + cursor.endPercent + '\n' +
  //     cursor.scrollTop + ' x ' + cursor.scrollLeft);
  return cursor;
};


/**
 * Attempt to restore the cursor's location.
 * @param {Object} cursor Context information of the cursor.
 * @private
 */
mobwrite.shareTextareaObj.prototype.restoreCursor_ = function(cursor) {
  // Set some constants which tweak the matching behaviour.
  // Tweak the relative importance (0.0 = accuracy, 1.0 = proximity)
  this.dmp.Match_Balance = 0.4;
  // At what point is no match declared (0.0 = perfection, 1.0 = very loose)
  this.dmp.Match_Threshold = 0.9;

  var padLength = this.dmp.Match_MaxBits / 2;  // Normally 16.
  var newText = this.element.value;

  // Find the start of the selection in the new text.
  var pattern1 = cursor.startPrefix + cursor.startSuffix;
  var cursorStartPoint = this.dmp.match_main(newText, pattern1,
      Math.round(Math.max(0, Math.min(newText.length,
          cursor.startPercent * newText.length - padLength))));
  if (cursorStartPoint !== null) {
    var pattern2 = newText.substring(cursorStartPoint,
                                     cursorStartPoint + pattern1.length);
    //alert(pattern1 + '\nvs\n' + pattern2);
    // Run a diff to get a framework of equivalent indicies.
    var diff = this.dmp.diff_main(pattern1, pattern2, false);
    cursorStartPoint += this.dmp.diff_xIndex(diff, cursor.startPrefix.length);
  }

  var cursorEndPoint = null;
  if (!cursor.collapsed) {
    // Find the end of the selection in the new text.
    pattern1 = cursor.endPrefix + cursor.endSuffix;
    cursorEndPoint = this.dmp.match_main(newText, pattern1,
        Math.round(Math.max(0, Math.min(newText.length,
            cursor.endPercent * newText.length - padLength))));
    if (cursorEndPoint !== null) {
      var pattern2 = newText.substring(cursorEndPoint,
                                       cursorEndPoint + pattern1.length);
      //alert(pattern1 + '\nvs\n' + pattern2);
      // Run a diff to get a framework of equivalent indicies.
      var diff = this.dmp.diff_main(pattern1, pattern2, false);
      cursorEndPoint += this.dmp.diff_xIndex(diff, cursor.endPrefix.length);
    }
  }
  
  // Deal with loose ends
  if (cursorStartPoint === null && cursorEndPoint !== null) {
    // Lost the start point of the selection, but we have the end point.
    // Collapse to end point.
    cursorStartPoint = cursorEndPoint;
  } else if (cursorStartPoint === null && cursorEndPoint === null) {
    // Lost both start and end points.
    // Jump to the aproximate percentage point of start.
    cursorStartPoint = Math.round(cursor.startPercent * newText.length);
  }
  if (cursorEndPoint == null) {
    // End not known, collapse to start.
    cursorEndPoint = cursorStartPoint;
  }
  
  // Restore selection.
  if ('selectionStart' in this.element) {  // W3
    this.element.selectionStart = cursorStartPoint;
    this.element.selectionEnd = cursorEndPoint;
  } else {  // IE
    // Walk up the tree looking for this textarea's document node.
    var doc = this.element;
    while (doc.parentNode) {
      doc = doc.parentNode;
    }
    if (!doc.selection || !doc.selection.createRange) {
      // Not IE?
      return;
    }
    // IE's TextRange.move functions treat '\r\n' as one character.
    var snippet = this.element.value.substring(0, cursorStartPoint);
    var ieStartPoint = snippet.replace(/\r\n/g, '\n').length;

    var newRange = doc.body.createTextRange();
    newRange.moveToElementText(this.element);
    newRange.collapse(true);
    newRange.moveStart('character', ieStartPoint);
    if (!cursor.collapsed) {
      snippet = this.element.value.substring(cursorStartPoint, cursorEndPoint);
      var ieMidLength = snippet.replace(/\r\n/g, '\n').length;
      newRange.moveEnd('character', ieMidLength);
    }
    newRange.select();
  }

  // Restore scrollbar locations
  if ('scrollTop' in cursor) {
    this.element.scrollTop = cursor.scrollTop * this.element.scrollHeight;
    this.element.scrollLeft = cursor.scrollLeft * this.element.scrollWidth;
  }
};


/**
 * Ensure that all linebreaks are LF
 * @param {string} text Text with unknown line breaks
 * @return {string} Text with normalized linebreaks
 * @private
 */
mobwrite.shareTextareaObj.normalizeLinebreaks_ = function(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};


/**
 * Handler to accept text fields as elements that can be shared.
 * If the element is a textarea, text or password input, create a new
 * sharing object.
 * @param {*} node Object or ID of object to share
 * @return {Object?} A sharing object or null.
 */
mobwrite.shareTextareaObj.shareHandler = function(node) {
  if (typeof node == 'string') {
    node = document.getElementById(node);
  }
  if (node && 'value' in node && 'type' in node && (node.type == 'textarea' ||
      node.type == 'text' || node.type == 'password')) {
    if (mobwrite.UA_webkit) {
      // Safari needs to track which text element has the focus.
      node.addEventListener('focus', function() {this.activeElement = true},
          false);
      node.addEventListener('blur', function() {this.activeElement = false},
          false);
      node.activeElement = false;
    }
    return new mobwrite.shareTextareaObj(node);
  }
  return null;
};


// Register this shareHandler with MobWrite.
mobwrite.shareHandlers.push(mobwrite.shareTextareaObj.shareHandler);

