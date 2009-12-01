/*
 * Test harness for MobWriteClient
 *
 * Copyright 2009 Google Inc.
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

package com.google.mobwrite;

import junit.framework.TestCase;

public class MobWriteClientTest extends TestCase {
  public void testUniqueId() {
    // Test length.
    assertEquals("uniqueId: Length", 8, MobWriteClient.uniqueId(8).length());
    
    // Two IDs should not be the same.
    // There's a 1 in 4 trillion chance that this test could fail normally.
    assertFalse("uniqueId: Identical",
        MobWriteClient.uniqueId(8).equals(MobWriteClient.uniqueId(8)));
  }

  public void testComputeSyncInterval() {
    MobWriteClient mobwrite = new MobWriteClient("http://www.example.com/");
    // Check 10% growth when no change.
    mobwrite.serverChange_ = false;
    mobwrite.clientChange_ = false;
    mobwrite.syncInterval = 185;
    mobwrite.minSyncInterval = 100;
    mobwrite.maxSyncInterval = 200;
    mobwrite.computeSyncInterval_();
    assertEquals(195, mobwrite.syncInterval);

    // Check max cap.
    mobwrite.computeSyncInterval_();
    assertEquals(200, mobwrite.syncInterval);

    // Check 20% drop when server changes.
    mobwrite.serverChange_ = true;
    mobwrite.clientChange_ = false;
    mobwrite.syncInterval = 175;
    mobwrite.computeSyncInterval_();
    assertEquals(155, mobwrite.syncInterval);

    // Check 40% drop when client changes.
    mobwrite.serverChange_ = false;
    mobwrite.clientChange_ = true;
    mobwrite.syncInterval = 175;
    mobwrite.computeSyncInterval_();
    assertEquals(135, mobwrite.syncInterval);

    // Check 60% drop when both server and client changes.
    mobwrite.serverChange_ = true;
    mobwrite.clientChange_ = true;
    mobwrite.syncInterval = 175;
    mobwrite.computeSyncInterval_();
    assertEquals(115, mobwrite.syncInterval);

    // Check min cap.
    mobwrite.computeSyncInterval_();
    assertEquals(100, mobwrite.syncInterval);
  }

}
