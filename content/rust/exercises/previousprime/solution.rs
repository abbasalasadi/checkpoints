pub fn prev_prime(nbr: u64) -> u64 {
    if nbr <= 2 {
        return 0;
    }

    if nbr == 3 {
        return 2;
    }

    let mut n = nbr - 1;

    if n % 2 == 0 {
        n -= 1;
    }

    while n >= 3 {
        if is_prime(n) {
            return n;
        }

        n -= 2;
    }

    2
}

fn is_prime(n: u64) -> bool {
    if n == 2 {
        return true;
    }

    if n < 2 || n % 2 == 0 {
        return false;
    }

    let mut i = 3;

    while i * i <= n {
        if n % i == 0 {
            return false;
        }

        i += 2;
    }

    true
}
