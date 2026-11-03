use std::collections::HashMap;

pub fn smallest(h: HashMap<&str, i32>) -> i32 {
    let mut smallest = i32::MAX;

    for value in h.values() {
        if *value < smallest {
            smallest = *value;
        }
    }

    smallest
}
