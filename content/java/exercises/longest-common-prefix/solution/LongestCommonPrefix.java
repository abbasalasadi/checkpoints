public class LongestCommonPrefix {
    public String findLongestCommonPrefix(String[] strs) {
        if (strs == null || strs.length == 0) return "";
        String prefix = strs[0] == null ? "" : strs[0];
        for (String s : strs) {
            if (s == null) return "";
            while (!s.startsWith(prefix)) prefix = prefix.substring(0, prefix.length() - 1);
        }
        return prefix;
    }
}
