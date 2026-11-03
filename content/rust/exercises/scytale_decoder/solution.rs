pub fn scytale_decoder(s: String, letters_per_turn: usize) -> Option<String> {
    if s.is_empty() || letters_per_turn == 0 {
        return None;
    }

    let chars: Vec<char> = s.chars().collect();
    let mut decoded = String::new();

    for row in 0..letters_per_turn {
        let mut i = row;

        while i < chars.len() {
            decoded.push(chars[i]);
            i += letters_per_turn;
        }
    }

    Some(decoded)
}
