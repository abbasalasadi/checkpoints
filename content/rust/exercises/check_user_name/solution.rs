pub enum AccessLevel {
    Guest,
    Normal,
    Admin,
}

pub struct User {
    pub name: String,
    pub access_level: AccessLevel,
}

impl User {
    pub fn new(name: String, level: AccessLevel) -> Self {
        User {
            name,
            access_level: level,
        }
    }

    pub fn send_name(&self) -> Option<&str> {
        match self.access_level {
            AccessLevel::Guest => None,
            AccessLevel::Normal | AccessLevel::Admin => Some(&self.name),
        }
    }
}

pub fn check_user_name(user: &User) -> (bool, &str) {
    match user.send_name() {
        Some(name) => (true, name),
        None => (false, "ERROR: User is guest"),
    }
}
