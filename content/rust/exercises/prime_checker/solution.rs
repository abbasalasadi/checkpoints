#[derive(PartialEq, Eq, Debug)]
pub enum PrimeErr {
    Even,
    Divider(usize),
}

pub fn prime_checker(nb: usize) -> Option<Result<usize, PrimeErr>> {
    if nb <= 1 {
        return None;
    }

    if nb == 2 {
        return Some(Ok(nb));
    }

    if nb % 2 == 0 {
        return Some(Err(PrimeErr::Even));
    }

    let mut i = 3;

    while i * i <= nb {
        if nb % i == 0 {
            return Some(Err(PrimeErr::Divider(i)));
        }

        i += 2;
    }

    Some(Ok(nb))
}
