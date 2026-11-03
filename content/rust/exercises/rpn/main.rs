use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() != 2 {
        println!("Error");
        return;
    }

    let expression = args[1].trim();

    if expression.is_empty() {
        println!("Error");
        return;
    }

    match eval_rpn(expression) {
        Some(result) => println!("{}", result),
        None => println!("Error"),
    }
}

fn eval_rpn(expression: &str) -> Option<i64> {
    let mut stack: Vec<i64> = Vec::new();

    for token in expression.split_whitespace() {
        match token {
            "+" | "-" | "*" | "/" | "%" => {
                if stack.len() < 2 {
                    return None;
                }

                let b = stack.pop().unwrap();
                let a = stack.pop().unwrap();

                let result = match token {
                    "+" => a + b,
                    "-" => a - b,
                    "*" => a * b,
                    "/" => {
                        if b == 0 {
                            return None;
                        }
                        a / b
                    }
                    "%" => {
                        if b == 0 {
                            return None;
                        }
                        a % b
                    }
                    _ => return None,
                };

                stack.push(result);
            }
            _ => {
                match token.parse::<i64>() {
                    Ok(number) => stack.push(number),
                    Err(_) => return None,
                }
            }
        }
    }

    if stack.len() == 1 {
        Some(stack[0])
    } else {
        None
    }
}