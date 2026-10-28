package com.c2.gallery;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

@CapacitorPlugin(name = "C2Fs")
public class C2FsPlugin extends Plugin {
  private static final String PREFS = "c2_fs";
  private static final String KEY_URI = "workspaceUri";
  private static final String KEY_NAME = "workspaceName";

  private SharedPreferences prefs() {
    return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  @PluginMethod
  public void pickDirectory(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
    intent.addFlags(
      Intent.FLAG_GRANT_READ_URI_PERMISSION
        | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
    );
    startActivityForResult(call, intent, "onPickDirectory");
  }

  @ActivityCallback
  private void onPickDirectory(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.resolve();
      return;
    }
    Uri uri = result.getData().getData();
    if (uri == null) {
      call.resolve();
      return;
    }
    final int takeFlags =
      result.getData().getFlags()
        & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
    try {
      getContext().getContentResolver().takePersistableUriPermission(uri, takeFlags);
    } catch (SecurityException ignored) {
      /* some providers do not support persistable grants */
    }
    DocumentFile doc = DocumentFile.fromTreeUri(getContext(), uri);
    String name = doc != null && doc.getName() != null ? doc.getName() : "Ordner";
    JSObject out = new JSObject();
    out.put("uri", uri.toString());
    out.put("name", name);
    call.resolve(out);
  }

  @PluginMethod
  public void persistDirectory(PluginCall call) {
    String uri = call.getString("uri");
    String name = call.getString("name", "Ordner");
    if (uri == null || uri.isEmpty()) {
      call.reject("uri fehlt");
      return;
    }
    prefs().edit().putString(KEY_URI, uri).putString(KEY_NAME, name).apply();
    call.resolve();
  }

  @PluginMethod
  public void loadPersistedDirectory(PluginCall call) {
    String uri = prefs().getString(KEY_URI, null);
    if (uri == null || uri.isEmpty()) {
      call.resolve();
      return;
    }
    if (!hasPersistedUriPermission(uri)) {
      prefs().edit().remove(KEY_URI).remove(KEY_NAME).apply();
      call.resolve();
      return;
    }
    DocumentFile doc = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
    if (doc == null || !doc.exists()) {
      call.resolve();
      return;
    }
    JSObject out = new JSObject();
    out.put("uri", uri);
    out.put("name", prefs().getString(KEY_NAME, doc.getName() != null ? doc.getName() : "Ordner"));
    call.resolve(out);
  }

  @PluginMethod
  public void clearPersistedDirectory(PluginCall call) {
    prefs().edit().remove(KEY_URI).remove(KEY_NAME).apply();
    call.resolve();
  }

  @PluginMethod
  public void list(PluginCall call) {
    try {
      DocumentFile folder = resolveDir(call.getString("uri"), call.getString("path", ""), false);
      JSArray entries = new JSArray();
      if (folder != null) {
        for (DocumentFile child : folder.listFiles()) {
          JSObject row = new JSObject();
          row.put("name", child.getName() != null ? child.getName() : "");
          row.put("kind", child.isDirectory() ? "directory" : "file");
          entries.put(row);
        }
      }
      JSObject out = new JSObject();
      out.put("entries", entries);
      call.resolve(out);
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "list fehlgeschlagen");
    }
  }

  @PluginMethod
  public void mkdir(PluginCall call) {
    try {
      String uri = call.getString("uri");
      String path = call.getString("path", "");
      if (uri == null || path == null || path.isEmpty()) {
        call.reject("path fehlt");
        return;
      }
      DocumentFile folder = ensureDir(uri, path);
      if (folder == null) {
        call.reject("Ordner konnte nicht erstellt werden");
        return;
      }
      call.resolve();
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "mkdir fehlgeschlagen");
    }
  }

  @PluginMethod
  public void readFile(PluginCall call) {
    try {
      String uri = call.getString("uri");
      String path = call.getString("path", "");
      DocumentFile file = resolveFile(uri, path, false);
      if (file == null || !file.exists() || !file.isFile()) {
        call.reject("Datei fehlt");
        return;
      }
      ContentResolver resolver = getContext().getContentResolver();
      try (InputStream in = resolver.openInputStream(file.getUri())) {
        if (in == null) {
          call.reject("Datei nicht lesbar");
          return;
        }
        byte[] bytes = readAll(in);
        JSObject out = new JSObject();
        out.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
        out.put("name", file.getName() != null ? file.getName() : "file");
        out.put("size", bytes.length);
        String mime = file.getType();
        out.put("mimeType", mime != null ? mime : "application/octet-stream");
        call.resolve(out);
      }
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "read fehlgeschlagen");
    }
  }

  @PluginMethod
  public void writeFile(PluginCall call) {
    try {
      String uri = call.getString("uri");
      String path = call.getString("path", "");
      String data = call.getString("data");
      if (uri == null || path == null || path.isEmpty() || data == null) {
        call.reject("ungültige Parameter");
        return;
      }
      int slash = path.lastIndexOf('/');
      String dirPath = slash >= 0 ? path.substring(0, slash) : "";
      String name = slash >= 0 ? path.substring(slash + 1) : path;
      DocumentFile folder = dirPath.isEmpty()
        ? DocumentFile.fromTreeUri(getContext(), Uri.parse(uri))
        : ensureDir(uri, dirPath);
      if (folder == null) {
        call.reject("Zielordner fehlt");
        return;
      }
      DocumentFile existing = folder.findFile(name);
      DocumentFile file = existing != null && existing.isFile()
        ? existing
        : folder.createFile(guessMime(name), name);
      if (file == null) {
        call.reject("Datei konnte nicht erstellt werden");
        return;
      }
      byte[] bytes = Base64.decode(data, Base64.DEFAULT);
      ContentResolver resolver = getContext().getContentResolver();
      try (OutputStream out = resolver.openOutputStream(file.getUri(), "wt")) {
        if (out == null) {
          call.reject("Datei nicht beschreibbar");
          return;
        }
        out.write(bytes);
        out.flush();
      }
      call.resolve();
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "write fehlgeschlagen");
    }
  }

  @PluginMethod
  public void remove(PluginCall call) {
    try {
      String uri = call.getString("uri");
      String path = call.getString("path", "");
      boolean recursive = Boolean.TRUE.equals(call.getBoolean("recursive", false));
      DocumentFile target = resolveAny(uri, path);
      if (target == null || !target.exists()) {
        call.resolve();
        return;
      }
      if (target.isDirectory()) {
        DocumentFile[] children = target.listFiles();
        boolean hasChildren = children != null && children.length > 0;
        if (hasChildren && !recursive) {
          call.reject("Ordner ist nicht leer");
          return;
        }
        if (hasChildren && !deleteRecursive(target)) {
          call.reject("Löschen fehlgeschlagen");
          return;
        }
        if (!hasChildren && !target.delete()) {
          call.reject("Löschen fehlgeschlagen");
          return;
        }
        if (hasChildren) {
          /* deleteRecursive already removed target */
          call.resolve();
          return;
        }
      } else if (!target.delete()) {
        call.reject("Löschen fehlgeschlagen");
        return;
      }
      call.resolve();
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "remove fehlgeschlagen");
    }
  }

  private boolean deleteRecursive(DocumentFile target) {
    if (target.isDirectory()) {
      DocumentFile[] children = target.listFiles();
      if (children != null) {
        for (DocumentFile child : children) {
          if (!deleteRecursive(child)) return false;
        }
      }
    }
    return target.delete();
  }

  @PluginMethod
  public void stat(PluginCall call) {
    try {
      String uri = call.getString("uri");
      String path = call.getString("path", "");
      DocumentFile target = path == null || path.isEmpty()
        ? DocumentFile.fromTreeUri(getContext(), Uri.parse(uri))
        : resolveAny(uri, path);
      JSObject out = new JSObject();
      if (target == null || !target.exists()) {
        out.put("exists", false);
        call.resolve(out);
        return;
      }
      out.put("exists", true);
      out.put("kind", target.isDirectory() ? "directory" : "file");
      out.put("name", target.getName() != null ? target.getName() : "");
      out.put("size", target.isFile() ? target.length() : 0);
      call.resolve(out);
    } catch (Exception e) {
      call.reject(e.getMessage() != null ? e.getMessage() : "stat fehlgeschlagen");
    }
  }

  private boolean hasPersistedUriPermission(String uriString) {
    List<UriPermission> perms = getContext().getContentResolver().getPersistedUriPermissions();
    Uri want = Uri.parse(uriString);
    for (UriPermission perm : perms) {
      if (perm.getUri().equals(want) && perm.isReadPermission()) return true;
    }
    return false;
  }

  private DocumentFile resolveDir(String uri, String path, boolean create) throws Exception {
    if (uri == null || uri.isEmpty()) throw new Exception("uri fehlt");
    if (path == null || path.isEmpty()) {
      DocumentFile root = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
      if (root == null) throw new Exception("Ordner ungültig");
      return root;
    }
    return create ? ensureDir(uri, path) : resolveExistingDir(uri, path);
  }

  private DocumentFile resolveExistingDir(String uri, String path) throws Exception {
    DocumentFile cur = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
    if (cur == null) throw new Exception("Ordner ungültig");
    for (String part : path.split("/")) {
      if (part.isEmpty() || ".".equals(part)) continue;
      if ("..".equals(part)) throw new Exception("Ungültiger Pfad");
      DocumentFile next = cur.findFile(part);
      if (next == null || !next.isDirectory()) throw new Exception("Ordner fehlt: " + part);
      cur = next;
    }
    return cur;
  }

  private DocumentFile ensureDir(String uri, String path) throws Exception {
    DocumentFile cur = DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
    if (cur == null) throw new Exception("Ordner ungültig");
    for (String part : path.split("/")) {
      if (part.isEmpty() || ".".equals(part)) continue;
      if ("..".equals(part)) throw new Exception("Ungültiger Pfad");
      DocumentFile next = cur.findFile(part);
      if (next == null) {
        next = cur.createDirectory(part);
      } else if (!next.isDirectory()) {
        throw new Exception("Pfad ist keine Dateiordner: " + part);
      }
      if (next == null) throw new Exception("Ordner konnte nicht erstellt werden: " + part);
      cur = next;
    }
    return cur;
  }

  private DocumentFile resolveFile(String uri, String path, boolean create) throws Exception {
    if (uri == null || path == null || path.isEmpty()) throw new Exception("Pfad fehlt");
    int slash = path.lastIndexOf('/');
    String dirPath = slash >= 0 ? path.substring(0, slash) : "";
    String name = slash >= 0 ? path.substring(slash + 1) : path;
    DocumentFile folder = dirPath.isEmpty()
      ? DocumentFile.fromTreeUri(getContext(), Uri.parse(uri))
      : (create ? ensureDir(uri, dirPath) : resolveExistingDir(uri, dirPath));
    if (folder == null) throw new Exception("Ordner fehlt");
    DocumentFile file = folder.findFile(name);
    if (file != null && file.isFile()) return file;
    if (!create) return null;
    return folder.createFile(guessMime(name), name);
  }

  private DocumentFile resolveAny(String uri, String path) throws Exception {
    if (path == null || path.isEmpty()) {
      return DocumentFile.fromTreeUri(getContext(), Uri.parse(uri));
    }
    int slash = path.lastIndexOf('/');
    String dirPath = slash >= 0 ? path.substring(0, slash) : "";
    String name = slash >= 0 ? path.substring(slash + 1) : path;
    DocumentFile folder = dirPath.isEmpty()
      ? DocumentFile.fromTreeUri(getContext(), Uri.parse(uri))
      : resolveExistingDir(uri, dirPath);
    if (folder == null) return null;
    return folder.findFile(name);
  }

  private static byte[] readAll(InputStream in) throws Exception {
    ByteArrayOutputStream buf = new ByteArrayOutputStream();
    byte[] chunk = new byte[8192];
    int n;
    while ((n = in.read(chunk)) >= 0) buf.write(chunk, 0, n);
    return buf.toByteArray();
  }

  private static String guessMime(String name) {
    String lower = name.toLowerCase();
    if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".js")) return "text/javascript";
    if (lower.endsWith(".css")) return "text/css";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
    if (lower.endsWith(".xml")) return "application/xml";
    if (lower.endsWith(".woff2")) return "font/woff2";
    return "application/octet-stream";
  }
}
