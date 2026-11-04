import java.util.*;

public class TopFrequents {
    public List<Integer> findTopKFrequent(int[] nums, int k) {
        Map<Integer, Integer> count = new HashMap<>();
        Map<Integer, Integer> first = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            count.merge(nums[i], 1, Integer::sum);
            first.putIfAbsent(nums[i], i);
        }
        PriorityQueue<Integer> heap = new PriorityQueue<>((a, b) -> {
            int c = Integer.compare(count.get(b), count.get(a));
            return c != 0 ? c : Integer.compare(first.get(a), first.get(b));
        });
        heap.addAll(count.keySet());
        List<Integer> out = new ArrayList<>();
        while (!heap.isEmpty() && out.size() < k) out.add(heap.poll());
        return out;
    }
}
