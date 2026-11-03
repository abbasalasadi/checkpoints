#[derive(Debug, Clone)]
pub struct Queue {
    pub node: Link,
}

pub type Link =

#[derive(Debug, Clone)]
pub struct Person {
    pub name: String,
    pub discount: i32,
    pub next_person: Link,
}

impl Queue {
    pub fn new() -> Queue {
        todo!()
    }

    pub fn add(&mut self, name: String, discount: i32) {
        todo!()
    }

    pub fn invert_queue(&mut self) {
        todo!()
    }

    pub fn rm(&mut self) -> Option<(String, i32)> {
        todo!()
    }

    pub fn search(&self, name: &str) -> Option<(&String, &i32)> {
        todo!()
    }
}
