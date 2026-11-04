import java.util.Arrays;

public class AnagramChecker {
    public boolean isAnagram(String str1, String str2) {
        if (str1 == null || str2 == null || str1.length() != str2.length()) {
            return false;
        }
        char[] a = str1.toLowerCase().toCharArray();
        char[] b = str2.toLowerCase().toCharArray();
        Arrays.sort(a);
        Arrays.sort(b);
        return Arrays.equals(a, b);
    }
}
