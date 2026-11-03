use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        return;
    }

    let code: Vec<char> = args[1].chars().collect();
    let mut memory = [0u8; 2048];
    let mut ptr = 0usize;
    let mut pc = 0usize;

    while pc < code.len() {
        match code[pc] {
            '>' => ptr += 1,
            '<' => ptr -= 1,

            '+' => memory[ptr] = memory[ptr].wrapping_add(1),
            '-' => memory[ptr] = memory[ptr].wrapping_sub(1),

            '.' => print!("{}", memory[ptr] as char),

            '[' => {
                if memory[ptr] == 0 {
                    let mut depth = 1;

                    while depth > 0 {
                        pc += 1;

                        match code[pc] {
                            '[' => depth += 1,
                            ']' => depth -= 1,
                            _ => {}
                        }
                    }
                }
            }

            ']' => {
                if memory[ptr] != 0 {
                    let mut depth = 1;

                    while depth > 0 {
                        pc -= 1;

                        match code[pc] {
                            ']' => depth += 1,
                            '[' => depth -= 1,
                            _ => {}
                        }
                    }
                }
            }

            _ => {}
        }

        pc += 1;
    }
}
