fn main() {
    let args = std::env::args().collect::<Vec<_>>();

    for arg in args.iter().skip(1) {
        if is_correct(arg) {
            println!("OK");
        } else {
            println!("Error");
        }
    }
}

fn is_correct(s: &str) -> bool {
    let mut stack = Vec::new();

    for c in s.chars() {
        match c {
            '(' | '[' | '{' => stack.push(c),

            ')' => {
                if stack.pop() != Some('(') {
                    return false;
                }
            }

            ']' => {
                if stack.pop() != Some('[') {
                    return false;
                }
            }

            '}' => {
                if stack.pop() != Some('{') {
                    return false;
                }
            }

            _ => {}
        }
    }

    stack.is_empty()
}