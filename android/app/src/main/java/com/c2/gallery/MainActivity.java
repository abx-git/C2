package com.c2.gallery;

import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    registerPlugin(C2FsPlugin.class);
    registerPlugin(C2SyncPlugin.class);
    super.onCreate(savedInstanceState);
    // Keep the WebView below the system status bar so the editor chrome stays tappable.
    WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
  }
}
