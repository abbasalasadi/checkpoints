import java.util.ArrayDeque;
import java.util.Deque;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class HTMLValidator {
    public boolean validateHTML(String html) {
        if (html == null || html.isEmpty()) return false;
        Matcher m = Pattern.compile("<(/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>").matcher(html);
        Deque<String> stack = new ArrayDeque<>();
        boolean any = false;
        while (m.find()) {
            any = true;
            String tag = m.group(2).toLowerCase();
            if (m.group(0).endsWith("/>")) continue;
            if (m.group(1).isEmpty()) stack.push(tag);
            else if (stack.isEmpty() || !stack.pop().equals(tag)) return false;
        }
        return any && stack.isEmpty();
    }
}
