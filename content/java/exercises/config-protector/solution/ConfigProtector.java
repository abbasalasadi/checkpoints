import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ConfigProtector {
    public String hideSensitiveData(String configFile, List<String> sensitiveKeys) {
        String result = configFile;
        for (String key : sensitiveKeys) {
            Matcher m = Pattern.compile("(?m)^(" + Pattern.quote(key) + ")=(.*)$").matcher(result);
            StringBuilder sb = new StringBuilder();
            while (m.find()) {
                m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1) + "=" + "*".repeat(m.group(2).length())));
            }
            m.appendTail(sb);
            result = sb.toString();
        }
        return result;
    }
}
