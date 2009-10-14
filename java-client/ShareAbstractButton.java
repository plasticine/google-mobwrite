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

import javax.swing.AbstractButton;

class ShareAbstractButton extends ShareObj {

  /**
   * The user-facing button/checkbox component to be shared.
   */
  private AbstractButton abstractButton;

  /**
   * Constructor of shared object representing a checkbox.
   * @param ab Button/checkbox component to share.
   * @param file Filename to share as.
   */
  public ShareAbstractButton(AbstractButton ab, String file) {
    super(file);
    this.abstractButton = ab;
    this.mergeChanges = false;
  }

  /**
   * Retrieve the user's check.
   * @return Plaintext content.
   */
  public String getClientText() {
    return this.abstractButton.isSelected() ? this.abstractButton.getName() : "";
  }

  /**
   * Set the user's check.
   * @param text New content.
   */
  public void setClientText(String text) {
    this.abstractButton.setSelected(text.equals(this.abstractButton.getName()));
    // Fire any events.
    String actionCommand = this.abstractButton.getActionCommand();
    ActionEvent e = new ActionEvent(this.abstractButton, ActionEvent.ACTION_PERFORMED, actionCommand, 0);
    for (ActionListener listener : this.abstractButton.getActionListeners()) {
      listener.actionPerformed(e);
    }
  }

}
