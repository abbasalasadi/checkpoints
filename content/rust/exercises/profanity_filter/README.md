## profanity_filter

### Instructions

Create a **function** named `check_ms` that receives a `&str` and returns a
`Result<&str, &str>`.

The message is rejected when either of the following is true:

- the message is **empty**
- the message **contains** the word `"stupid"`

A rejected message returns `Err("ERROR: illegal")`. Any other message is returned
unchanged inside `Ok`.

```rust
pub fn check_ms(message: &str) -> Result<&str, &str> {
}
```

### Usage

Here is a program to test your function

```rust
use profanity_filter::*;

fn main() {
    ["hello there", "", "you are stupid", "stupid"]
        .into_iter()
        .for_each(|m| println!("{:?}", check_ms(m)));
}
```

And its output

```console
$ cargo run
Ok("hello there")
Err("ERROR: illegal")
Err("ERROR: illegal")
Err("ERROR: illegal")
$
```

### Notions

- [Recoverable Errors with Result](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html)

- [str::contains](https://doc.rust-lang.org/std/primitive.str.html#method.contains)

- [str::is_empty](https://doc.rust-lang.org/std/primitive.str.html#method.is_empty)
