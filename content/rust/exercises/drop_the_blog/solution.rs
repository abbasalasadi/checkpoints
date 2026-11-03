use std::cell::{Cell, RefCell};
use std::rc::Rc;

pub struct Blog {
    next_id: Cell<usize>,
    pub drops: Rc<Cell<usize>>,
    dropped_articles: Rc<RefCell<Vec<usize>>>,
}

#[derive(Clone)]
pub struct Article {
    id: usize,
    pub title: String,
    drops: Rc<Cell<usize>>,
    dropped_articles: Rc<RefCell<Vec<usize>>>,
}

impl Blog {
    pub fn new() -> Self {
        Self {
            next_id: Cell::new(0),
            drops: Rc::new(Cell::new(0)),
            dropped_articles: Rc::new(RefCell::new(Vec::new())),
        }
    }

    pub fn new_article(&self, title: String) -> (usize, Article) {
        let id = self.next_id.get();
        self.next_id.set(id + 1);

        (
            id,
            Article {
                id,
                title,
                drops: self.drops.clone(),
                dropped_articles: self.dropped_articles.clone(),
            },
        )
    }

    pub fn is_dropped(&self, id: usize) -> bool {
        self.dropped_articles.borrow().contains(&id)
    }
}

impl Article {
    pub fn discard(self) {}
}

impl Drop for Article {
    fn drop(&mut self) {
        let mut dropped = self.dropped_articles.borrow_mut();

        if dropped.contains(&self.id) {
            panic!("article already dropped");
        }

        dropped.push(self.id);
        self.drops.set(self.drops.get() + 1);
    }
}
