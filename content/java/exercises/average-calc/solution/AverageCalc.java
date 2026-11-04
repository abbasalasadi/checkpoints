public class AverageCalc {
    public static int average(int start, int end, int step) {
        if (step == 0) {
            return 0;
        }
        if (start == end) {
            return start;
        }
        if ((end - start > 0) != (step > 0)) {
            return 0;
        }
        long sum = 0;
        int count = 0;
        for (int i = start; step > 0 ? i <= end : i >= end; i += step) {
            sum += i;
            count++;
        }
        return count == 0 ? 0 : (int) (sum / count);
    }
}
