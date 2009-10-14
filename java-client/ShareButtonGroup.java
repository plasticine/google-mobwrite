/**
 * MobWrite - Real-time Synchronization and Collaboration Service
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

import java.awt.event.ActionEvent;
import java.awt.event.ActionListener;
import java.util.Enumeration;

import javax.swing.AbstractButton;
import javax.swing.ButtonGroup;

class ShareButtonGroup extends ShareObj {

  /**
   * The user-facing radio button group to be shared.
   */
  private ButtonGroup buttonGroup;

  /**
   * Constructor of shared object representing a radio button.
   * @param bg Radio button group to share.
   * @param file Filename to share as.
   */
public ShareButtonGroup(ButtonGroup bg, String file) {
    super(file);
    this.buttonGroup = bg;
    this.mergeChanges = false;
  }

  /**
   * Retrieve the user's check.
   * @return Plaintext content.
   */
  public String getClientText() {
    Enumeration<AbstractButton> elements = this.buttonGroup.getElements();
    while (elements.hasMoreElements()) {
      AbstractButton ab = elements.nextElement();
      if (ab.isSelected()) {
        return ab.getName();
      }
    }
    return "";
  }

  /**
   * Set the user's check.
   * @param text New content.
   */
  public void setClientText(String text) {
    Enumeration<AbstractButton> elements = this.buttonGroup.getElements();
    while (elements.hasMoreElements()) {
      AbstractButton ab = elements.nextElement();
      if (text.equals(ab.getName())) {
        ab.setSelected(true);
        // Fire any events.
        String actionCommand = ab.getActionCommand();
        ActionEvent e = new ActionEvent(ab, ActionEvent.ACTION_PERFORMED, actionCommand, 0);
        for (ActionListener listener : ab.getActionListeners()) {
          listener.actionPerformed(e);
        }
      }
    }
  }

}
