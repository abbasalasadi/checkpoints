pub fn count_factorial_steps(factorial: u64) -> u64 {
    if factorial <= 1 {
        return 0;
    }

    let mut result = 1;
    let mut steps = 1;

    while result < factorial {
        steps += 1;
        result *= steps;

        if result == factorial {
            return steps;
        }
    }

    0
}
