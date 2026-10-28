package com.c2.gallery;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import androidx.documentfile.provider.DocumentFile;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import com.jcraft.jsch.SftpATTRS;
import com.jcraft.jsch.SftpException;
import com.jcraft.jsch.UIKeyboardInteractive;
import com.jcraft.jsch.UserInfo;

import java.io.InputStream;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Properties;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "C2Sync")
public class C2SyncPlugin extends Plugin {
  private static final String PREFS = "c2_sync_secure";
  private static final Pattern PUBLISH_RE = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]*$");
  private final ExecutorService executor = Executors.newSingleThreadExecutor();
  private final AtomicBoolean busy = new AtomicBoolean(false);
  private SharedPreferences securePrefs;
  private String lastOk;
  private String lastAt;
  private String lastError;

  @Override
  public void load() {
    try {
      MasterKey key = new MasterKey.Builder(getContext())
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build();
      securePrefs = EncryptedSharedPreferences.create(
        getContext(),
        PREFS,
        key,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
      );
    } catch (Exception e) {
      securePrefs = getContext().getSharedPreferences(PREFS + "_fallback", Context.MODE_PRIVATE);
    }
  }

  private SharedPreferences prefs() {
    if (securePrefs == null) load();
    return securePrefs;
  }

  @PluginMethod
  public void getConfig(PluginCall call) {
    SharedPreferences p = prefs();
    JSObject out = new JSObject();
    out.put("host", p.getString("host", ""));
    out.put("port", p.getInt("port", 22));
    out.put("user", p.getString("user", ""));
    out.put("hasPassword", !p.getString("password", "").isEmpty());
    out.put("remote", p.getString("remote", ""));
    out.put("deployUri", p.getString("deployUri", ""));
    out.put("deployName", p.getString("deployName", ""));
    call.resolve(out);
  }

  @PluginMethod
  public void saveConfig(PluginCall call) {
    SharedPreferences.Editor ed = prefs().edit();
    if (call.getData().has("host")) ed.putString("host", safe(call.getString("host")));
    if (call.getData().has("port")) ed.putInt("port", call.getInt("port", 22));
    if (call.getData().has("user")) ed.putString("user", safe(call.getString("user")));
    if (call.getData().has("password")) {
      String password = call.getString("password");
      if (password != null) ed.putString("password", password);
    }
    if (call.getData().has("remote")) {
      ed.putString("remote", normalizeRemoteBase(safe(call.getString("remote")), ""));
    }
    if (call.getData().has("deployUri")) ed.putString("deployUri", safe(call.getString("deployUri")));
    if (call.getData().has("deployName")) ed.putString("deployName", safe(call.getString("deployName")));
    ed.apply();
    call.resolve();
  }

  @PluginMethod
  public void setDeployDirectory(PluginCall call) {
    String uri = call.getString("uri");
    String name = call.getString("name", "");
    if (uri == null || uri.isEmpty()) {
      call.reject("uri fehlt");
      return;
    }
    prefs().edit()
      .putString("deployUri", uri)
      .putString("deployName", name != null ? name : "")
      .apply();
    call.resolve();
  }

  @PluginMethod
  public void status(PluginCall call) {
    boolean probe = Boolean.TRUE.equals(call.getBoolean("probe", false));
    String subdir = sanitizePublish(call.getString("subdir", ""));
    executor.execute(() -> {
      try {
        JSObject payload = statusPayload(probe, subdir);
        getBridge().getActivity().runOnUiThread(() -> call.resolve(payload));
      } catch (Exception e) {
        getBridge().getActivity().runOnUiThread(() ->
          call.reject(e.getMessage() != null ? e.getMessage() : "status fehlgeschlagen")
        );
      }
    });
  }

  @PluginMethod
  public void transfer(PluginCall call) {
    if (!busy.compareAndSet(false, true)) {
      call.reject("Übertragung läuft bereits.");
      return;
    }
    String subdir = sanitizePublish(call.getString("subdir", ""));
    String overlayHost = safe(call.getString("host"));
    String overlayRemote = trimSlashes(safe(call.getString("remote")));
    executor.execute(() -> {
      try {
        SharedPreferences p = prefs();
        String host = !overlayHost.isEmpty() ? overlayHost : p.getString("host", "");
        String user = p.getString("user", "");
        String password = p.getString("password", "");
        int port = p.getInt("port", 22);
        String remoteBase = normalizeRemoteBase(
          !overlayRemote.isEmpty() ? overlayRemote : p.getString("remote", ""),
          subdir
        );
        String deployUri = p.getString("deployUri", "");
        if (host.isEmpty() || user.isEmpty() || password.isEmpty() || remoteBase.isEmpty()) {
          failTransfer(call, "Sync nicht eingerichtet — Host, Benutzer, Passwort und Remote-Pfad angeben.");
          return;
        }
        if (deployUri.isEmpty()) {
          failTransfer(call, "Deploy-Ordner fehlt. Zuerst „Deploy-Ordner“ schreiben.");
          return;
        }
        DocumentFile src = resolveLocalSrc(deployUri, subdir);
        if (src == null || !src.isDirectory()) {
          failTransfer(call, subdir.isEmpty()
            ? "Deploy-Ordner fehlt. Zuerst „Deploy-Ordner“ schreiben."
            : "Noch kein öffentlicher Ordner für „" + subdir + "“. Zuerst „Deploy-Ordner“ schreiben.");
          return;
        }
        String remote = joinRemote(remoteBase, subdir);
        int fileCount = oneWaySync(host, port, user, password, src, remote);
        writeLast(true, null);
        JSObject out = new JSObject();
        out.put("ok", true);
        out.put("remote", remote);
        out.put("fileCount", fileCount);
        getBridge().getActivity().runOnUiThread(() -> {
          busy.set(false);
          call.resolve(out);
        });
      } catch (Exception e) {
        String msg = e.getMessage() != null ? e.getMessage() : "Übertragung fehlgeschlagen.";
        writeLast(false, msg);
        failTransfer(call, msg);
      }
    });
  }

  private void failTransfer(PluginCall call, String msg) {
    getBridge().getActivity().runOnUiThread(() -> {
      busy.set(false);
      JSObject out = new JSObject();
      out.put("ok", false);
      out.put("error", msg);
      call.resolve(out);
    });
  }

  private JSObject statusPayload(boolean doProbe, String publish) {
    SharedPreferences p = prefs();
    String host = p.getString("host", "");
    String user = p.getString("user", "");
    String password = p.getString("password", "");
    String remoteBase = normalizeRemoteBase(p.getString("remote", ""), publish);
    String deployUri = p.getString("deployUri", "");
    boolean configured = !host.isEmpty() && !user.isEmpty() && !password.isEmpty() && !remoteBase.isEmpty();
    DocumentFile src = !deployUri.isEmpty() ? resolveLocalSrc(deployUri, publish) : null;
    boolean deployExists = src != null && src.exists() && src.isDirectory();
    String deployName = src != null && src.getName() != null
      ? src.getName()
      : p.getString("deployName", "");

    JSObject payload = new JSObject();
    payload.put("agent", true);
    payload.put("busy", busy.get());
    payload.put("configured", configured);
    payload.put("method", "rclone");
    payload.put("deploy", deployName);
    payload.put("deployExists", deployExists);
    payload.put("host", host.isEmpty() ? null : host);
    payload.put("remote", joinRemote(remoteBase, publish));
    payload.put("rcloneRemote", null);
    if (lastAt != null) {
      JSObject last = new JSObject();
      last.put("ok", "true".equals(lastOk));
      last.put("at", lastAt);
      last.put("error", lastError);
      payload.put("last", last);
    } else {
      payload.put("last", JSObject.NULL);
    }
    if (doProbe && configured) {
      try {
        probe(host, p.getInt("port", 22), user, password);
        payload.put("reachable", true);
        payload.put("probeError", JSObject.NULL);
      } catch (Exception e) {
        payload.put("reachable", false);
        payload.put("probeError", e.getMessage() != null ? e.getMessage() : "Verbindung fehlgeschlagen.");
      }
    }
    return payload;
  }

  private void probe(String host, int port, String user, String password) throws Exception {
    Session session = null;
    ChannelSftp sftp = null;
    try {
      session = openSession(host, port, user, password);
      sftp = openSftp(session);
      sftp.pwd();
    } finally {
      closeQuiet(sftp, session);
    }
  }

  private int oneWaySync(
    String host,
    int port,
    String user,
    String password,
    DocumentFile localRoot,
    String remoteRoot
  ) throws Exception {
    Session session = null;
    ChannelSftp sftp = null;
    int uploaded = 0;
    try {
      session = openSession(host, port, user, password);
      sftp = openSftp(session);
      ensureRemoteDir(sftp, remoteRoot, new HashSet<>());
      List<LocalFileEntry> localFiles = new ArrayList<>();
      collectLocalFiles(localRoot, "", localFiles);
      if (localFiles.isEmpty()) {
        throw new Exception("Deploy-Ordner ist leer — zuerst „Deploy-Ordner“ schreiben.");
      }
      Set<String> ensuredDirs = new HashSet<>();
      for (LocalFileEntry entry : localFiles) {
        String remotePath = joinRemote(remoteRoot, entry.relPath);
        ensureRemoteDir(sftp, parentRemote(remotePath), ensuredDirs);
        try (InputStream in = getContext().getContentResolver().openInputStream(entry.uri)) {
          if (in == null) throw new Exception("Datei nicht lesbar: " + entry.relPath);
          sftp.put(in, remotePath);
          uploaded += 1;
        }
      }
      if (uploaded == 0) {
        throw new Exception("Keine Datei konnte gelesen werden — Deploy-Ordner prüfen.");
      }
    } finally {
      closeQuiet(sftp, session);
    }
    return uploaded;
  }

  private static final class LocalFileEntry {
    final String relPath;
    final Uri uri;

    LocalFileEntry(String relPath, Uri uri) {
      this.relPath = relPath;
      this.uri = uri;
    }
  }

  private Session openSession(String host, int port, String user, String password) throws Exception {
    String resolvedHost = safe(host);
    String resolvedUser = safe(user);
    String resolvedPassword = password == null ? "" : password;
    // Allow "user@host" pasted into the host field.
    int at = resolvedHost.lastIndexOf('@');
    if (at > 0 && at < resolvedHost.length() - 1 && resolvedUser.isEmpty()) {
      resolvedUser = resolvedHost.substring(0, at).trim();
      resolvedHost = resolvedHost.substring(at + 1).trim();
    }
    if (resolvedHost.isEmpty() || resolvedUser.isEmpty()) {
      throw new Exception("Host und Benutzer sind erforderlich.");
    }
    if (resolvedPassword.isEmpty()) {
      throw new Exception("Passwort fehlt.");
    }

    JSch jsch = new JSch();
    Session session = jsch.getSession(resolvedUser, resolvedHost, port);
    session.setPassword(resolvedPassword);
    session.setUserInfo(new PasswordUserInfo(resolvedPassword));
    Properties config = new Properties();
    config.put("StrictHostKeyChecking", "no");
    // Strato SFTP-only: password / keyboard-interactive, no pubkey.
    config.put("PreferredAuthentications", "password,keyboard-interactive");
    config.put("PubkeyAuthentication", "no");
    session.setConfig(config);
    try {
      session.connect(20000);
    } catch (JSchException e) {
      String msg = e.getMessage() != null ? e.getMessage() : "Auth fehlgeschlagen";
      if (msg.toLowerCase(Locale.ROOT).contains("auth")) {
        throw new Exception(
          "Anmeldung fehlgeschlagen (Host/Benutzer/Passwort prüfen). "
            + "Bei Strato den echten SFTP-Host nutzen (z. B. …ssh.w2.strato.hosting), nicht den Mac-Alias „c2-strato“."
        );
      }
      throw e;
    }
    return session;
  }

  /** Supplies the password for both password and keyboard-interactive (Strato). */
  private static final class PasswordUserInfo implements UserInfo, UIKeyboardInteractive {
    private final String password;

    PasswordUserInfo(String password) {
      this.password = password;
    }

    @Override
    public String getPassphrase() {
      return null;
    }

    @Override
    public String getPassword() {
      return password;
    }

    @Override
    public boolean promptPassword(String message) {
      return true;
    }

    @Override
    public boolean promptPassphrase(String message) {
      return false;
    }

    @Override
    public boolean promptYesNo(String message) {
      return true;
    }

    @Override
    public void showMessage(String message) {
      /* no-op */
    }

    @Override
    public String[] promptKeyboardInteractive(
      String destination,
      String name,
      String instruction,
      String[] prompt,
      boolean[] echo
    ) {
      if (prompt == null) return new String[0];
      String[] response = new String[prompt.length];
      for (int i = 0; i < prompt.length; i++) {
        response[i] = password;
      }
      return response;
    }
  }

  private ChannelSftp openSftp(Session session) throws Exception {
    ChannelSftp sftp = (ChannelSftp) session.openChannel("sftp");
    sftp.connect(15000);
    return sftp;
  }

  private void closeQuiet(ChannelSftp sftp, Session session) {
    if (sftp != null && sftp.isConnected()) sftp.disconnect();
    if (session != null && session.isConnected()) session.disconnect();
  }

  private DocumentFile resolveLocalSrc(String deployUri, String publish) {
    // Auf Android ist deployUri immer der Ordner, der hochgeladen werden soll
    // (Inhalt der Galerie). publish steuert nur den Remote-Pfad.
    DocumentFile deploy = DocumentFile.fromTreeUri(getContext(), Uri.parse(deployUri));
    if (deploy == null || !deploy.exists() || !deploy.isDirectory()) return null;
    return deploy;
  }

  private void collectLocalFiles(DocumentFile dir, String prefix, List<LocalFileEntry> out) {
    DocumentFile[] children = dir.listFiles();
    if (children == null) return;
    for (DocumentFile child : children) {
      String name = child.getName();
      if (name == null || name.isEmpty() || ".DS_Store".equals(name)) continue;
      String path = prefix.isEmpty() ? name : prefix + "/" + name;
      if (child.isDirectory()) {
        collectLocalFiles(child, path, out);
      } else {
        out.add(new LocalFileEntry(path, child.getUri()));
      }
    }
  }

  /** Strato: Basis immer likibox; Unterordner kommt aus publishPath (subdir). */
  private static String normalizeRemoteBase(String raw, String subdir) {
    String base = trimSlashes(raw == null ? "" : raw);
    String slug = trimSlashes(subdir == null ? "" : subdir);
    if (base.isEmpty() || base.equals(slug)) {
      return "likibox";
    }
    if (!base.startsWith("likibox") && !base.contains("/")) {
      return "likibox";
    }
    if (base.startsWith("likibox/")) {
      return "likibox";
    }
    return base;
  }

  private void ensureRemoteDir(ChannelSftp sftp, String path, Set<String> ensured) throws SftpException {
    if (path == null || path.isEmpty() || ".".equals(path)) return;
    String normalized = trimSlashes(path);
    if (normalized.isEmpty() || ensured.contains(normalized)) return;
    String[] parts = normalized.split("/");
    StringBuilder cur = new StringBuilder();
    for (String part : parts) {
      if (part.isEmpty()) continue;
      if (cur.length() > 0) cur.append('/');
      cur.append(part);
      String rel = cur.toString();
      if (ensured.contains(rel)) continue;
      try {
        SftpATTRS attrs = sftp.stat(rel);
        if (!attrs.isDir()) throw new SftpException(ChannelSftp.SSH_FX_FAILURE, rel + " ist kein Ordner");
      } catch (SftpException e) {
        if (e.id == ChannelSftp.SSH_FX_NO_SUCH_FILE) {
          sftp.mkdir(rel);
        } else {
          throw e;
        }
      }
      ensured.add(rel);
    }
  }

  private static String parentRemote(String path) {
    int slash = path.lastIndexOf('/');
    if (slash <= 0) return "";
    return path.substring(0, slash);
  }

  private static String joinRemote(String base, String child) {
    String b = trimSlashes(base == null ? "" : base);
    String c = child == null ? "" : child.replaceAll("^/+", "").replaceAll("/+$", "");
    if (b.isEmpty()) return c;
    if (c.isEmpty()) return b;
    return b + "/" + c;
  }

  private static String trimSlashes(String value) {
    return value == null ? "" : value.replaceAll("^/+", "").replaceAll("/+$", "");
  }

  private static String safe(String value) {
    return value == null ? "" : value.trim();
  }

  private static String sanitizePublish(String raw) {
    String value = raw == null ? "" : raw.trim().replaceAll("^/+", "").replaceAll("/+$", "");
    if (value.isEmpty()) return "";
    if (value.contains("/") || value.contains("\\") || value.contains("..") || !PUBLISH_RE.matcher(value).matches()) {
      return "";
    }
    return value;
  }

  private void writeLast(boolean ok, String error) {
    lastOk = ok ? "true" : "false";
    lastAt = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(new Date());
    lastError = error;
  }
}
