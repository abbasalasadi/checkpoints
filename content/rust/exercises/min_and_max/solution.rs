pub fn min_and_max(nb_1: i32, nb_2: i32, nb_3: i32) -> (i32, i32) {
    let numbers = [nb_1, nb_2, nb_3];

    let &min = numbers.iter().min().unwrap();
    let &max = numbers.iter().max().unwrap();

    (min, max)
}
