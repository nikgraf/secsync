
package org.libsodium.jni;

public class Sodium extends  SodiumJNI {

  public final static void loadLibrary() {
    System.loadLibrary("sodium-jni");
    sodium_init();
  }

}
