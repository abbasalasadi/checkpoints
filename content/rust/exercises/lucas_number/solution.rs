pub fn lucas_number(n: u32) -> u32 {
    if n == 0 { return 2 };
    if n == 1 { return 1 };

    let mut a: u32 = 1;
    let mut b: u32 = 3;
    for i in 2 .. n {
        (a,b) = (b, a+b);
    }
    return b;
}
