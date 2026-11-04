import static org.assertj.core.api.AssertionsForClassTypes.assertThat;

import java.util.Arrays;
import java.util.OptionalDouble;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

@ExtendWith(StopAfterFailureExtension.class)
class FlexisortTest {
        OptionalDouble median(LongStream stream) {
                long[] values = stream.sorted().toArray();
                int n = values.length;
                if (n == 0) {
                        return OptionalDouble.empty();
                }
                if (n % 2 == 1) {
                        return OptionalDouble.of(values[n / 2]);
                } else {
                        return OptionalDouble.of((values[n / 2 - 1] + values[n / 2]) / 2.0);
                }
        }

        @Test
        void getterAndSetter_shouldReturnCorrectValues() {
                Sorter sorter = new BubbleSort();
                int[] array = { 64, 34, 25, 12, 22, 11, 90 };
                sorter.setArray(array);

                assertThat(sorter.getArray())
                                .withFailMessage(
                                                "Getter should return correct array, but returned " + sorter.getArray())
                                .isEqualTo(array);
        }

        @Test
        void bubbleSort_shouldSortArrayCorrectly() {
                Sorter bubbleSorter = new BubbleSort();
                int[] array = { 64, 34, 25, 12, 22, 11, 90 };
                bubbleSorter.setArray(array);
                bubbleSorter.sort();

                assertThat(bubbleSorter.getArray())
                                .withFailMessage("Bubble sort should sort array correctly, but returned "
                                                + bubbleSorter.getArray())
                                .isEqualTo(new int[] { 11, 12, 22, 25, 34, 64, 90 });
        }

        @Test
        void insertionSort_shouldSortArrayCorrectly() {
                Sorter insertionSorter = new InsertionSort();
                int[] array = { 64, 34, 25, 12, 22, 11, 90 };
                insertionSorter.setArray(array);
                insertionSorter.sort();

                assertThat(insertionSorter.getArray())
                                .withFailMessage("Insertion sort should sort array correctly, but returned "
                                                + insertionSorter.getArray())
                                .isEqualTo(new int[] { 11, 12, 22, 25, 34, 64, 90 });
        }

    @Test
    void performanceTest_shouldCompareAlgorithmsInDifferentConditions() {
        int[] randomArray = new int[1000];
        for (int i = 0; i < randomArray.length; i++) {
            randomArray[i] = (int) (Math.random() * 1000);
        }

        int[] sortedArray = randomArray.clone();
        java.util.Arrays.sort(sortedArray);

        int[] reverseSortedArray = randomArray.clone();
        java.util.Arrays.sort(reverseSortedArray);
        for (int i = 0; i < reverseSortedArray.length / 2; i++) {
            int temp = reverseSortedArray[i];
            reverseSortedArray[i] = reverseSortedArray[reverseSortedArray.length - 1 - i];
            reverseSortedArray[reverseSortedArray.length - 1 - i] = temp;
        }

        Sorter bubbleSorter = new BubbleSort();
        Sorter insertionSorter = new InsertionSort();
        
        // Test BubbleSort on random array
        double bubbleSortRandomTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                bubbleSorter.setArray(randomArray.clone());
                long startTime = System.nanoTime();
                bubbleSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);

        // Test InsertionSort on random array
        double insertionSortRandomTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                insertionSorter.setArray(randomArray.clone());
                long startTime = System.nanoTime();
                insertionSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);

        // Test BubbleSort on sorted array
        double bubbleSortSortedTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                bubbleSorter.setArray(sortedArray.clone());
                long startTime = System.nanoTime();
                bubbleSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);

        // Test InsertionSort on sorted array
        double insertionSortSortedTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                insertionSorter.setArray(sortedArray.clone());
                long startTime = System.nanoTime();
                insertionSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);        

        // Test BubbleSort on reverse sorted array
        double bubbleSortReverseSortedTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                bubbleSorter.setArray(reverseSortedArray.clone());
                long startTime = System.nanoTime();
                bubbleSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);

        // Test InsertionSort on reverse sorted array
        double insertionSortReverseSortedTime = median(LongStream.rangeClosed(0, 200).map((i)->{
                insertionSorter.setArray(reverseSortedArray.clone());
                long startTime = System.nanoTime();
                insertionSorter.sort();
                long endTime = System.nanoTime();
                return endTime - startTime;
        })).orElse(0);

        System.out.println("BubbleSort time on random array (ns): " + bubbleSortRandomTime);
        System.out.println("InsertionSort time on random array (ns): " + insertionSortRandomTime);
        System.out.println("BubbleSort time on sorted array (ns): " + bubbleSortSortedTime);
        System.out.println("InsertionSort time on sorted array (ns): " + insertionSortSortedTime);
        System.out.println("BubbleSort time on reverse sorted array (ns): " + bubbleSortReverseSortedTime);
        System.out.println("InsertionSort time on reverse sorted array (ns): " + insertionSortReverseSortedTime);

        assertThat(bubbleSorter.getArray())
                .withFailMessage("Bubble sort should sort array correctly, but returned " + java.util.Arrays.toString(bubbleSorter.getArray()))
                .isSorted();

        assertThat(insertionSorter.getArray())
                .withFailMessage("Insertion sort should sort array correctly, but returned " + java.util.Arrays.toString(insertionSorter.getArray()))
                .isSorted();

        assertThat(insertionSortRandomTime)
                .withFailMessage("Insertion sort should generally be faster on small/random data sets than bubble sort")
                .isLessThan(bubbleSortRandomTime);

        assertThat(bubbleSortSortedTime)
                .withFailMessage("Bubble sort should generally be faster on sorted data sets than Insertion sort")
                .isLessThan(insertionSortSortedTime);

        assertThat(insertionSortReverseSortedTime)
                .withFailMessage("insertion sort perform better on reverse sorted data")
                .isLessThan(bubbleSortReverseSortedTime);
    }
}
