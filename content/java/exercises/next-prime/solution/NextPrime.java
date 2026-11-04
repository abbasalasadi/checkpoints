public class NextPrime {
    public static Integer nextPrime(Integer n) {
        int c = Math.max(n + 1, 2);
        while (!isPrime(c)) {
            c++;
        }
        return c;
    }

    private static boolean isPrime(int x) {
        if (x < 2) {
            return false;
        }
        for (int d = 2; (long) d * d <= x; d++) {
            if (x % d == 0) {
                return false;
            }
        }
        return true;
    }
}
