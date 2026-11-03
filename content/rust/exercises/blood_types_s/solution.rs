#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum Antigen {
    A,
    AB,
    B,
    O,
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub enum RhFactor {
    Positive,
    Negative,
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy)]
pub struct BloodType {
    pub antigen: Antigen,
    pub rh_factor: RhFactor,
}

impl BloodType {
    pub fn can_receive_from(self, other: Self) -> bool {
        self.donors().contains(&other)
    }

    pub fn donors(self) -> Vec<Self> {
        all_blood_types()
            .into_iter()
            .filter(|&bt| can_donate_to(bt, self))
            .collect()
    }

    pub fn recipients(self) -> Vec<Self> {
        all_blood_types()
            .into_iter()
            .filter(|&bt| can_donate_to(self, bt))
            .collect()
    }
}

fn all_blood_types() -> Vec<BloodType> {
    use Antigen::*;
    use RhFactor::*;

    vec![
        BloodType {
            antigen: A,
            rh_factor: Positive,
        },
        BloodType {
            antigen: AB,
            rh_factor: Positive,
        },
        BloodType {
            antigen: B,
            rh_factor: Positive,
        },
        BloodType {
            antigen: O,
            rh_factor: Positive,
        },
        BloodType {
            antigen: A,
            rh_factor: Negative,
        },
        BloodType {
            antigen: AB,
            rh_factor: Negative,
        },
        BloodType {
            antigen: B,
            rh_factor: Negative,
        },
        BloodType {
            antigen: O,
            rh_factor: Negative,
        },
    ]
}

fn can_donate_to(donor: BloodType, recipient: BloodType) -> bool {
    use Antigen::*;
    use RhFactor::*;

    let antigen_ok = match donor.antigen {
        O => true,
        A => matches!(recipient.antigen, A | AB),
        B => matches!(recipient.antigen, B | AB),
        AB => recipient.antigen == AB,
    };

    let rh_ok = match donor.rh_factor {
        Negative => true,
        Positive => recipient.rh_factor == Positive,
    };

    antigen_ok && rh_ok
}
