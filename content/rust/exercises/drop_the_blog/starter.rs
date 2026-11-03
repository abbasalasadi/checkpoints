use std::cell::{RefCell, Cell};

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Blog {
    pub drops: Cell<usize>,
    pub states: RefCell<Vec<bool>>
}

impl Blog {
    pub fn new() -> Self {
        todo!()
    }

    pub fn new_article(&self, body: String) -> (usize, Article<'_>) {
        todo!()
    }

    pub fn new_id(&self) -> usize {
        todo!()
    }

    pub fn is_dropped(&self, id: usize) -> bool {
        todo!()
    }

    pub fn add_drop(&self, id: usize) {
        todo!()
    }
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct Article<'a> {

}

impl<'a> Article<'a> {
    pub fn new(id: usize, body: String, parent: &'a Blog) -> Self {
        todo!()
    }

    pub fn discard(self) {
        todo!()
    }
}
