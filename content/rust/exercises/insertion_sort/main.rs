use insertion_sort::*;

fn main() {
    let mut target = [5, 3, 7, 2, 1, 6, 8, 4];

    insertion_sort(&mut target, 1);
    println!("{:?}", target);

    let mut target = [5, 3, 7, 2, 1, 6, 8, 4];

    let len = target.len() - 1;
    insertion_sort(&mut target, len);
    println!("{:?}", target);
}