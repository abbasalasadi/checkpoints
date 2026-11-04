// The Cloud Run wrapper for Java: HTTP in front of the existing entrypoint.
//
// Same contract as the Go and JS wrappers (server/src/services/runner/cloudrun.ts):
// POST /run {exercise, mode, files, editorFiles, args} -> NDJSON frames
//   {"type":"output","text":...}  {"type":"done","exitCode":n,"oomKilled":bool}
// It does not grade: it writes the files, runs /app/run.sh (which hands over to
// the official entrypoint) and reports the exit code: 0 passed, non-zero failed.
// One request per instance (--concurrency=1); /tmp and the request directory
// are wiped before and after every run so a warm instance never carries one
// student's code into the next request.

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

public class Wrapper {
  static final Path WORK_ROOT = Paths.get("/work");
  static final int BODY_LIMIT = 4 << 20;
  static final Pattern NAME = Pattern.compile("^[A-Za-z_$][A-Za-z0-9_$]*\\.java$");
  static final Pattern CLASS = Pattern.compile("^[A-Za-z_$][A-Za-z0-9_$]*$");
  static final AtomicBoolean busy = new AtomicBoolean();

  public static void main(String[] a) throws IOException {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 16);
    server.createContext("/", Wrapper::handle);
    server.start();
    System.out.println("runner wrapper listening on :" + port);
  }

  static void plain(HttpExchange ex, int code, String text) throws IOException {
    byte[] b = text.getBytes(StandardCharsets.UTF_8);
    ex.getResponseHeaders().set("Content-Type", "text/plain");
    ex.sendResponseHeaders(code, b.length);
    ex.getResponseBody().write(b);
    ex.close();
  }

  static void handle(HttpExchange ex) throws IOException {
    String path = ex.getRequestURI().getPath();
    if (path.equals("/health")) { plain(ex, 200, "ok\n"); return; }
    if (!path.equals("/run")) { plain(ex, 404, "not found\n"); return; }
    if (!ex.getRequestMethod().equals("POST")) { plain(ex, 405, "POST only\n"); return; }
    if (!busy.compareAndSet(false, true)) { plain(ex, 503, "instance busy\n"); return; }
    Path dir = null;
    try {
      byte[] raw = ex.getRequestBody().readNBytes(BODY_LIMIT + 1);
      if (raw.length > BODY_LIMIT) { plain(ex, 400, "bad request: body too large\n"); return; }
      Map<String, Object> body;
      try {
        body = Json.object(new String(raw, StandardCharsets.UTF_8));
      } catch (RuntimeException e) {
        plain(ex, 400, "bad request: " + e.getMessage() + "\n"); return;
      }
      String exercise = String.valueOf(body.getOrDefault("exercise", ""));
      if (!CLASS.matcher(exercise).matches()) { plain(ex, 400, "bad exercise\n"); return; }
      Object files = body.get("files");
      if (!(files instanceof Map<?, ?> fm) || fm.isEmpty()) { plain(ex, 400, "files: no files\n"); return; }

      wipe(Paths.get("/tmp"), false);
      Files.createDirectories(WORK_ROOT);
      dir = Files.createTempDirectory(WORK_ROOT, "run-");
      Path student = Files.createDirectories(dir.resolve("in"));
      List<String> names = new ArrayList<>();
      for (Map.Entry<?, ?> e : fm.entrySet()) {
        String name = String.valueOf(e.getKey());
        // Flat .java names only: nothing can escape the request's directory.
        if (!NAME.matcher(name).matches()) { plain(ex, 400, "files: illegal path: " + name + "\n"); return; }
        Files.writeString(student.resolve(name), String.valueOf(e.getValue()), StandardCharsets.UTF_8);
        names.add(name);
      }
      List<String> editorFiles = new ArrayList<>();
      if (body.get("editorFiles") instanceof List<?> l) for (Object o : l) editorFiles.add(String.valueOf(o));
      if (editorFiles.isEmpty()) editorFiles = names;

      ProcessBuilder pb = new ProcessBuilder("/app/run.sh").redirectErrorStream(true);
      Map<String, String> env = pb.environment();
      env.put("STUDENT_DIR", student.toString());
      env.put("WORK_DIR", dir.resolve("w").toString());
      env.put("EXERCISE", exercise);
      env.put("EDITOR_FILES", String.join(",", editorFiles));
      env.put("CODE_EDITOR_RUN_ONLY", "run".equals(body.get("mode")) ? "true" : "false");
      env.put("TMPDIR", Files.createDirectories(dir.resolve("tmp")).toString());
      env.put("HOME", dir.toString());

      ex.getResponseHeaders().set("Content-Type", "application/x-ndjson");
      ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
      ex.getResponseHeaders().set("Cache-Control", "no-store");
      ex.sendResponseHeaders(200, 0);
      OutputStream out = ex.getResponseBody();

      long oomBefore = oomKills();
      long started = System.currentTimeMillis();
      Process p = pb.start();
      p.getOutputStream().close();
      boolean clientGone = false;
      try (InputStream in = p.getInputStream()) {
        byte[] buf = new byte[8192];
        for (int n; (n = in.read(buf)) > 0; ) {
          if (clientGone) continue; // keep draining so the child is not blocked
          try {
            out.write(frame("output", new String(buf, 0, n, StandardCharsets.UTF_8)));
            out.flush();
          } catch (IOException gone) {
            // The client went away: kill the whole tree, as docker kill would.
            clientGone = true;
            p.descendants().forEach(ProcessHandle::destroyForcibly);
            p.destroyForcibly();
          }
        }
      }
      int code;
      try { code = p.waitFor(); } catch (InterruptedException e) { code = -1; }
      p.descendants().forEach(ProcessHandle::destroyForcibly);
      if (!clientGone) {
        String done = "{\"type\":\"done\",\"exitCode\":" + code + ",\"durationMs\":" + (System.currentTimeMillis() - started)
            + ",\"oomKilled\":" + (oomKills() > oomBefore) + "}\n";
        try { out.write(done.getBytes(StandardCharsets.UTF_8)); } catch (IOException ignored) { }
      }
      ex.close();
    } catch (Exception e) {
      try { plain(ex, 500, "wrapper: " + e.getMessage() + "\n"); } catch (IOException ignored) { ex.close(); }
    } finally {
      if (dir != null) wipe(dir, true);
      wipe(Paths.get("/tmp"), false);
      busy.set(false);
    }
  }

  static byte[] frame(String type, String text) {
    return ("{\"type\":\"" + type + "\",\"text\":" + Json.quote(text) + "}\n").getBytes(StandardCharsets.UTF_8);
  }

  /** Cumulative OOM kills of this instance (cgroup v1 on Cloud Run gen2, v2 elsewhere), or -1. */
  static long oomKills() {
    for (String f : new String[] {"/sys/fs/cgroup/memory/memory.oom_control", "/sys/fs/cgroup/memory.events"}) {
      try {
        for (String line : Files.readAllLines(Paths.get(f))) {
          if (line.startsWith("oom_kill ")) return Long.parseLong(line.substring(9).trim());
        }
      } catch (Exception ignored) { }
    }
    return -1;
  }

  static void wipe(Path root, boolean self) {
    try (var walk = Files.walk(root)) {
      walk.sorted(Comparator.reverseOrder()).filter(p -> self || !p.equals(root)).forEach(p -> {
        try { Files.deleteIfExists(p); } catch (IOException ignored) { }
      });
    } catch (IOException ignored) { }
  }

  /** Just enough JSON for the request body: objects, arrays, strings, numbers, booleans, null. */
  static final class Json {
    private final String s;
    private int i;
    private Json(String s) { this.s = s; }

    @SuppressWarnings("unchecked")
    static Map<String, Object> object(String s) {
      Json j = new Json(s);
      Object v = j.value();
      j.ws();
      if (j.i != s.length() || !(v instanceof Map)) throw new RuntimeException("expected a JSON object");
      return (Map<String, Object>) v;
    }

    static String quote(String t) {
      StringBuilder b = new StringBuilder("\"");
      for (char c : t.toCharArray()) {
        switch (c) {
          case '"' -> b.append("\\\"");
          case '\\' -> b.append("\\\\");
          case '\n' -> b.append("\\n");
          case '\r' -> b.append("\\r");
          case '\t' -> b.append("\\t");
          default -> { if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c); }
        }
      }
      return b.append('"').toString();
    }

    private void ws() { while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++; }
    private RuntimeException err() { return new RuntimeException("invalid JSON at " + i); }

    private Object value() {
      ws();
      if (i >= s.length()) throw err();
      char c = s.charAt(i);
      if (c == '{') {
        i++;
        Map<String, Object> m = new LinkedHashMap<>();
        ws();
        if (s.charAt(i) == '}') { i++; return m; }
        for (;;) {
          ws();
          if (s.charAt(i) != '"') throw err();
          String k = string();
          ws();
          if (s.charAt(i++) != ':') throw err();
          m.put(k, value());
          ws();
          char d = s.charAt(i++);
          if (d == '}') return m;
          if (d != ',') throw err();
        }
      }
      if (c == '[') {
        i++;
        List<Object> l = new ArrayList<>();
        ws();
        if (s.charAt(i) == ']') { i++; return l; }
        for (;;) {
          l.add(value());
          ws();
          char d = s.charAt(i++);
          if (d == ']') return l;
          if (d != ',') throw err();
        }
      }
      if (c == '"') return string();
      if (s.startsWith("true", i)) { i += 4; return true; }
      if (s.startsWith("false", i)) { i += 5; return false; }
      if (s.startsWith("null", i)) { i += 4; return null; }
      int st = i;
      while (i < s.length() && "+-0123456789.eE".indexOf(s.charAt(i)) >= 0) i++;
      if (st == i) throw err();
      return Double.parseDouble(s.substring(st, i));
    }

    private String string() {
      i++;
      StringBuilder b = new StringBuilder();
      for (;;) {
        if (i >= s.length()) throw err();
        char c = s.charAt(i++);
        if (c == '"') return b.toString();
        if (c != '\\') { b.append(c); continue; }
        char e = s.charAt(i++);
        switch (e) {
          case 'n' -> b.append('\n');
          case 't' -> b.append('\t');
          case 'r' -> b.append('\r');
          case 'b' -> b.append('\b');
          case 'f' -> b.append('\f');
          case 'u' -> { b.append((char) Integer.parseInt(s.substring(i, i + 4), 16)); i += 4; }
          default -> b.append(e);
        }
      }
    }
  }
}
