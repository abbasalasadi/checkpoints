pub fn negative_spell(n: i64) -> String {
    if n > 0 {
        return "error: positive number".to_string();
    }

    if n == 0 {
        return "zero".to_string();
    }

    format!("minus {}", spell((-n) as u64))
}

fn spell(n: u64) -> String {
    match n {
        0 => "zero".to_string(),

        1..=19 => [
            "",
            "one",
            "two",
            "three",
            "four",
            "five",
            "six",
            "seven",
            "eight",
            "nine",
            "ten",
            "eleven",
            "twelve",
            "thirteen",
            "fourteen",
            "fifteen",
            "sixteen",
            "seventeen",
            "eighteen",
            "nineteen",
        ][n as usize]
            .to_string(),

        20..=99 => {
            let tens = [
                "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
                "eighty", "ninety",
            ];

            let ten = n / 10;
            let rest = n % 10;

            if rest == 0 {
                tens[ten as usize].to_string()
            } else {
                format!("{}-{}", tens[ten as usize], spell(rest))
            }
        }

        100..=999 => {
            let hundreds = n / 100;
            let rest = n % 100;

            if rest == 0 {
                format!("{} hundred", spell(hundreds))
            } else {
                format!("{} hundred {}", spell(hundreds), spell(rest))
            }
        }

        1000..=999_999 => {
            let thousands = n / 1000;
            let rest = n % 1000;

            if rest == 0 {
                format!("{} thousand", spell(thousands))
            } else {
                format!("{} thousand {}", spell(thousands), spell(rest))
            }
        }

        1_000_000 => "one million".to_string(),

        _ => String::new(),
    }
}



// pub fn negative_spell(n: i64) -> String {
//     match n {
//         1.. => "error: positive number".to_string(),
//         0 => "zero".to_string(),
//         _ => format!("minus {}", spell(n.unsigned_abs())),
//     }
// }

// fn big(n: u64, size: u64, name: &str) -> String {
//     match n % size {
//         0 => format!("{} {}", spell(n / size), name),
//         r => format!("{} {} {}", spell(n / size), name, spell(r)),
//     }
// }

// fn spell(n: u64) -> String {
//     let small = [
//         "zero", "one", "two", "three", "four", "five", "six", "seven", "eight",
//         "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
//         "sixteen", "seventeen", "eighteen", "nineteen",
//     ];

//     let tens = [
//         "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy",
//         "eighty", "ninety",
//     ];

//     match n {
//         0..=19 => small[n as usize].to_string(),
//         20..=99 => match n % 10 {
//             0 => tens[(n / 10) as usize].to_string(),
//             r => format!("{}-{}", tens[(n / 10) as usize], spell(r)),
//         },
//         100..=999 => big(n, 100, "hundred"),
//         1_000..=999_999 => big(n, 1_000, "thousand"),
//         1_000_000 => "one million".to_string(),
//         _ => String::new(),
//     }
// }
