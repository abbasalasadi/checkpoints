public class Digitlen {
    public static int digitlen(long number) {
        int n = 1;
        while (number / 10 != 0) {
            number /= 10;
            n++;
        }
        return n;
    }
}
