pub fn reverse_it(v: i32) -> String {
    let number = v.abs().to_string();

    let reversed: String = number.chars().rev().collect();

    if v < 0 {
        format!("-{}{}", reversed, number)
    } else {
        format!("{}{}", reversed, number)
    }
}
