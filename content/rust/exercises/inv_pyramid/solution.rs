pub fn inv_pyramid(v: String, i: usize) -> Vec<String> {
    let mut result = Vec::new();

    for n in 1..=i {
        result.push(format!("{}{}", " ".repeat(n), v.repeat(n)));
    }

    for n in (1..i).rev() {
        result.push(format!("{}{}", " ".repeat(n), v.repeat(n)));
    }

    result
}
