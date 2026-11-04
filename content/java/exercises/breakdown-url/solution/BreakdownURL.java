import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class BreakdownURL {
    private static final Pattern URL =
        Pattern.compile("^([a-zA-Z][a-zA-Z0-9+.-]*)://([^/:?#]+)(?::(\\d+))?(/[^?#]*)?(?:\\?([^#]*))?.*$");

    public Map<String, String> parseURL(String url) {
        Map<String, String> out = new LinkedHashMap<>();
        if (url == null) return out;
        Matcher m = URL.matcher(url);
        if (!m.matches()) return out;
        out.put("protocol", m.group(1));
        out.put("domain", m.group(2));
        if (m.group(3) != null) out.put("port", m.group(3));
        out.put("path", m.group(4) == null || m.group(4).isEmpty() ? "/" : m.group(4));
        if (m.group(5) != null && !m.group(5).isEmpty()) out.put("query", m.group(5));
        return out;
    }
}
