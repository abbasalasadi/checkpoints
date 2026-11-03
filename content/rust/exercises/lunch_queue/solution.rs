#[derive(Debug, Clone)]
pub struct Queue {
    pub node: Link,
}

pub type Link = Option<Box<Person>>;

#[derive(Debug, Clone)]
pub struct Person {
    pub name: String,
    pub discount: i32,
    pub next_person: Link,
}

impl Queue {
    pub fn new() -> Queue {
        Queue { node: None }
    }

    pub fn add(&mut self, name: String, discount: i32) {
        let new_person = Box::new(Person {
            name,
            discount,
            next_person: self.node.take(),
        });

        self.node = Some(new_person);
    }

    pub fn invert_queue(&mut self) {
        let mut prev: Link = None;
        let mut current = self.node.take();

        while let Some(mut person) = current {
            let next = person.next_person.take();
            person.next_person = prev;
            prev = Some(person);
            current = next;
        }

        self.node = prev;
    }

    pub fn rm(&mut self) -> Option<(String, i32)> {
        let mut current = &mut self.node;

        loop {
            match current {
                None => return None,

                Some(person) if person.next_person.is_none() => {
                    let person = current.take().unwrap();
                    return Some((person.name, person.discount));
                }

                Some(person) => {
                    current = &mut person.next_person;
                }
            }
        }
    }

    pub fn search(&self, name: &str) -> Option<(&String, &i32)> {
        let mut current = &self.node;

        while let Some(person) = current {
            if person.name == name {
                return Some((&person.name, &person.discount));
            }

            current = &person.next_person;
        }

        None
    }
}
