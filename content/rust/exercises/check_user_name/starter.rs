pub enum AccessLevel {}

pub struct User {}

impl User {
    pub fn new(name: String, level: AccessLevel) -> Self {
        todo!()
    }

    pub fn send_name(&self) -> Option<&str> {
        todo!()
    }
}

pub fn check_user_name(user: &User) -> (bool, &str) {
    todo!()
}
