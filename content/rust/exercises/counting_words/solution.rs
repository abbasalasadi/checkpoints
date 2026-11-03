use std::collections::HashMap;

pub fn counting_words(words: &str) -> HashMap<String, u32> {
    let mut result = HashMap::new();

    for word in words.split_ascii_whitespace() {
        let word = word
            .trim_matches(|c: char| !c.is_ascii_alphanumeric())
            .to_ascii_lowercase();

        if !word.is_empty() {
            *result.entry(word).or_insert(0) += 1;
        }
    }

    result
}
