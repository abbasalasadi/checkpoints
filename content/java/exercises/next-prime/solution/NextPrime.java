public class NextPrime {
    public static Integer nextPrime(Integer n) {
        int c = Math.max(n + 1, 2);
        while (true) {
            boolean prime = c >= 2;
            for (int d = 2; prime && (long) d * d <= c; d++) {
                if (c % d == 0) {
                    prime = false;
                }
            }
            if (prime) {
                return c;
            }
            c++;
        }
    }
}
