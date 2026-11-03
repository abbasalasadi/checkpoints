pub fn parts_sums(arr: &[u64]) -> Vec<u64> {
    let mut result = Vec::new();
    let mut sum: u64 = arr.iter().sum();

    result.push(sum);

    for num in arr.iter().rev() {
        sum -= num;
        result.push(sum);
    }

    result
}
