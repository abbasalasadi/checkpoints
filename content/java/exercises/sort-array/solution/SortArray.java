public class SortArray {
    public static Integer[] sort(Integer[] args) {
        Integer[] res = args.clone();
        for (int i = 1; i < res.length; i++) {
            Integer key = res[i];
            int j = i - 1;
            while (j >= 0 && res[j] > key) {
                res[j + 1] = res[j];
                j--;
            }
            res[j + 1] = key;
        }
        return res;
    }
}
